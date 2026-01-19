/**
 * MappingController - Projection Mapping for Hydra Mobile
 * 
 * Provides multi-quad grid warping with WebGL for projecting
 * visualizations onto arbitrary surfaces.
 */

// Z-index constants for consistent layering
const MAPPING_Z_INDEX = {
    CANVAS: 5,      // WebGL canvas for warped output
    OVERLAY: 100    // Calibration overlay UI
};

class MappingController {
    constructor(sourceCanvas, options = {}) {
        this.sourceCanvas = sourceCanvas;
        this.enabled = false;
        this.calibrating = false;
        
        // Grid configuration
        this.gridSize = options.gridSize || { rows: 3, cols: 3 };
        this.controlPoints = [];
        this.blockedCells = []; // 2D array tracking which cells are blacked out
        
        // Interaction state
        this.selectedPoint = null;
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
        
        // Merge mode state
        this.mergeMode = false;           // Is merge mode active
        this.mergeSelection = [];         // Array of {row, col} cells selected for merge
        this.mergedRegions = [];          // Array of merged region definitions
        
        // Canvas and WebGL
        this.canvas = null;
        this.gl = null;
        this.program = null;
        this.texture = null;
        
        // Overlay for calibration UI
        this.overlayCanvas = null;
        this.overlayCtx = null;
        
        // Control point visual settings
        this.pointRadius = options.pointRadius || 16;
        this.pointColor = options.pointColor || 'rgba(0, 200, 255, 1)';
        this.pointColorSelected = options.pointColorSelected || 'rgba(255, 100, 0, 1)';
        this.gridLineColor = options.gridLineColor || 'rgba(255, 255, 255, 0.6)';
        
        // Store original source canvas styles for restoration
        this.originalSourceStyles = null;
        
        // Dirty flag for mesh rebuilding optimization
        this.isMeshDirty = true;
        this.cachedMesh = null;
        
        // Bind methods
        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);
        this.render = this.render.bind(this);
        
        this.init();
    }
    
    init() {
        // Create WebGL canvas for warped output
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'mapping-canvas';
        this.canvas.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            display: none;
            z-index: ${MAPPING_Z_INDEX.CANVAS};
        `;
        
        // Create overlay canvas for calibration UI
        this.overlayCanvas = document.createElement('canvas');
        this.overlayCanvas.id = 'mapping-overlay';
        this.overlayCanvas.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            display: none;
            z-index: ${MAPPING_Z_INDEX.OVERLAY};
            pointer-events: none;
        `;
        
        // Insert canvases after source canvas
        const parent = this.sourceCanvas.parentElement;
        
        // Warn if parent doesn't have positioning for absolute children
        const parentStyle = window.getComputedStyle(parent);
        if (parentStyle.position === 'static') {
            console.warn('MappingController: The parent element has "position: static". For correct layering, it should be set to "relative", "absolute", or "fixed".');
        }
        
        parent.appendChild(this.canvas);
        parent.appendChild(this.overlayCanvas);
        
        this.overlayCtx = this.overlayCanvas.getContext('2d');
        
        // Initialize WebGL
        this.initWebGL();
        
        // Initialize grid with default positions
        this.resetGrid();
        
        // Load last used preset if available
        this.loadLastPreset();
    }
    
    initWebGL() {
        this.gl = this.canvas.getContext('webgl', {
            alpha: false,
            antialias: true,
            premultipliedAlpha: false,
            preserveDrawingBuffer: true
        });
        
        if (!this.gl) {
            console.error('WebGL not supported for mapping');
            return;
        }
        
        const gl = this.gl;
        
        // Vertex shader - handles position transformation
        const vertexShaderSource = `
            attribute vec2 a_position;
            attribute vec2 a_texCoord;
            varying vec2 v_texCoord;
            
            void main() {
                // Convert from normalized coordinates (0-1) to clip space (-1 to 1)
                vec2 clipSpace = a_position * 2.0 - 1.0;
                gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
                v_texCoord = a_texCoord;
            }
        `;
        
        // Fragment shader - samples the source texture
        const fragmentShaderSource = `
            precision mediump float;
            uniform sampler2D u_texture;
            varying vec2 v_texCoord;
            
            void main() {
                gl_FragColor = texture2D(u_texture, v_texCoord);
            }
        `;
        
        // Compile shaders
        const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
        
        if (!vertexShader || !fragmentShader) return;
        
        // Create program
        this.program = gl.createProgram();
        gl.attachShader(this.program, vertexShader);
        gl.attachShader(this.program, fragmentShader);
        gl.linkProgram(this.program);
        
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            console.error('Shader program failed to link:', gl.getProgramInfoLog(this.program));
            return;
        }
        
        // Get attribute/uniform locations
        this.positionLocation = gl.getAttribLocation(this.program, 'a_position');
        this.texCoordLocation = gl.getAttribLocation(this.program, 'a_texCoord');
        this.textureLocation = gl.getUniformLocation(this.program, 'u_texture');
        
        // Create buffers
        this.positionBuffer = gl.createBuffer();
        this.texCoordBuffer = gl.createBuffer();
        
        // Create texture
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        

    }
    
    compileShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader compile error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        
        return shader;
    }
    
    /**
     * Reset grid to default rectangular positions
     */
    resetGrid() {
        const { rows, cols } = this.gridSize;
        this.controlPoints = [];
        
        for (let row = 0; row <= rows; row++) {
            this.controlPoints[row] = [];
            for (let col = 0; col <= cols; col++) {
                // Normalized coordinates (0-1)
                this.controlPoints[row][col] = {
                    x: col / cols,
                    y: row / rows
                };
            }
        }
        
        // Mark mesh as dirty
        this.isMeshDirty = true;
        
        // Initialize blocked cells (all visible by default)
        this.initBlockedCells();
        
        // Initialize merged regions (none by default)
        this.initMergedRegions();
    }
    
    /**
     * Initialize blocked cells array with all cells visible (not blocked)
     * Grid has (rows) x (cols) cells, where rows/cols refer to number of quads
     */
    initBlockedCells() {
        const { rows, cols } = this.gridSize;
        this.blockedCells = [];
        
        for (let row = 0; row < rows; row++) {
            this.blockedCells[row] = [];
            for (let col = 0; col < cols; col++) {
                this.blockedCells[row][col] = false;
            }
        }
        

    }
    
    /**
     * Toggle the blocked state of a cell
     */
    toggleCellBlocked(row, col) {
        if (row >= 0 && row < this.gridSize.rows && 
            col >= 0 && col < this.gridSize.cols) {
            this.blockedCells[row][col] = !this.blockedCells[row][col];
            
            // Mark mesh as dirty since blocked cells changed
            this.isMeshDirty = true;
            
            if (this.calibrating) {
                this.drawOverlay();
            }
            
            return this.blockedCells[row][col];
        }
        return null;
    }
    
    /**
     * Check if a cell is blocked
     */
    isCellBlocked(row, col) {
        if (this.blockedCells[row] && this.blockedCells[row][col] !== undefined) {
            return this.blockedCells[row][col];
        }
        return false;
    }
    
    // =========================================================================
    // Merge Mode Methods
    // =========================================================================
    
    /**
     * Toggle merge mode on/off
     * @returns {boolean} New merge mode state
     */
    toggleMergeMode() {
        this.mergeMode = !this.mergeMode;
        
        if (!this.mergeMode) {
            // Exiting merge mode - clear selection
            this.clearMergeSelection();
        }
        
        if (this.calibrating) {
            this.drawOverlay();
        }
        
        return this.mergeMode;
    }
    
    /**
     * Enable merge mode
     */
    enableMergeMode() {
        if (!this.mergeMode) {
            this.mergeMode = true;
            if (this.calibrating) {
                this.drawOverlay();
            }
        }
    }
    
    /**
     * Disable merge mode and clear selection
     */
    disableMergeMode() {
        if (this.mergeMode) {
            this.mergeMode = false;
            this.clearMergeSelection();
            if (this.calibrating) {
                this.drawOverlay();
            }
        }
    }
    
    /**
     * Check if a cell is in the current merge selection
     */
    isCellInMergeSelection(row, col) {
        return this.mergeSelection.some(c => c.row === row && c.col === col);
    }
    
    /**
     * Toggle a cell in the merge selection
     * @returns {boolean} Whether the cell is now selected
     */
    toggleCellInMergeSelection(row, col) {
        const index = this.mergeSelection.findIndex(c => c.row === row && c.col === col);
        
        if (index >= 0) {
            // Remove from selection
            this.mergeSelection.splice(index, 1);
            return false;
        } else {
            // Add to selection
            this.mergeSelection.push({ row, col });
            return true;
        }
    }
    
    /**
     * Clear the current merge selection
     */
    clearMergeSelection() {
        this.mergeSelection = [];
        if (this.calibrating) {
            this.drawOverlay();
        }
    }
    
    /**
     * Get the bounding box of the current merge selection
     * @returns {Object|null} {minRow, maxRow, minCol, maxCol} or null if empty
     */
    getMergeSelectionBounds() {
        if (this.mergeSelection.length === 0) return null;
        
        let minRow = Infinity, maxRow = -Infinity;
        let minCol = Infinity, maxCol = -Infinity;
        
        for (const cell of this.mergeSelection) {
            minRow = Math.min(minRow, cell.row);
            maxRow = Math.max(maxRow, cell.row);
            minCol = Math.min(minCol, cell.col);
            maxCol = Math.max(maxCol, cell.col);
        }
        
        return { minRow, maxRow, minCol, maxCol };
    }
    
    /**
     * Check if the current merge selection forms a valid rectangle
     * @returns {boolean} True if selection is a complete rectangle
     */
    isValidRectangularSelection() {
        if (this.mergeSelection.length < 2) return false;
        
        const bounds = this.getMergeSelectionBounds();
        if (!bounds) return false;
        
        // Calculate expected cell count for a complete rectangle
        const expectedCount = (bounds.maxRow - bounds.minRow + 1) * (bounds.maxCol - bounds.minCol + 1);
        
        // Check if we have exactly the right number of cells
        if (this.mergeSelection.length !== expectedCount) return false;
        
        // Verify all cells in the rectangle are selected
        for (let row = bounds.minRow; row <= bounds.maxRow; row++) {
            for (let col = bounds.minCol; col <= bounds.maxCol; col++) {
                if (!this.isCellInMergeSelection(row, col)) {
                    return false;
                }
            }
        }
        
        return true;
    }
    
    /**
     * Find the merged region that contains a specific cell
     * @returns {Object|null} The merged region or null
     */
    getCellMergedRegion(row, col) {
        for (const region of this.mergedRegions) {
            if (region.cells.some(c => c.row === row && c.col === col)) {
                return region;
            }
        }
        return null;
    }
    
    /**
     * Check if two cells are in the same merged region
     */
    areCellsInSameMergedRegion(row1, col1, row2, col2) {
        const region1 = this.getCellMergedRegion(row1, col1);
        const region2 = this.getCellMergedRegion(row2, col2);
        
        if (!region1 || !region2) return false;
        return region1.id === region2.id;
    }
    
    /**
     * Confirm and create a merged region from the current selection
     * @returns {Object|null} The created region or null if invalid
     */
    confirmMerge() {
        if (!this.isValidRectangularSelection()) {
            return null;
        }
        
        const bounds = this.getMergeSelectionBounds();
        
        // Check if any selected cells are already in a merged region
        for (const cell of this.mergeSelection) {
            if (this.getCellMergedRegion(cell.row, cell.col)) {
                // Cell already merged - need to unmerge first
                return null;
            }
        }
        
        // Create the merged region
        const region = {
            id: 'merge_' + Date.now(),
            cells: [...this.mergeSelection],
            bounds: { ...bounds }
        };
        
        this.mergedRegions.push(region);
        
        // Clear selection and exit merge mode
        this.clearMergeSelection();
        this.mergeMode = false;
        
        // Mark mesh as dirty
        this.isMeshDirty = true;
        
        if (this.calibrating) {
            this.drawOverlay();
        }
        
        return region;
    }
    
    /**
     * Unmerge a region, returning cells to individual state
     * @param {string} regionId - The ID of the region to unmerge
     * @returns {boolean} True if region was found and unmerged
     */
    unmergeRegion(regionId) {
        const index = this.mergedRegions.findIndex(r => r.id === regionId);
        
        if (index >= 0) {
            this.mergedRegions.splice(index, 1);
            
            // Mark mesh as dirty
            this.isMeshDirty = true;
            
            if (this.calibrating) {
                this.drawOverlay();
            }
            
            return true;
        }
        
        return false;
    }
    
    /**
     * Unmerge the region containing a specific cell
     * @returns {boolean} True if a region was unmerged
     */
    unmergeCellRegion(row, col) {
        const region = this.getCellMergedRegion(row, col);
        if (region) {
            return this.unmergeRegion(region.id);
        }
        return false;
    }
    
    /**
     * Initialize merged regions array (called on reset)
     */
    initMergedRegions() {
        this.mergedRegions = [];
    }
    
    /**
     * Set grid size and reinitialize control points
     */
    setGridSize(rows, cols) {
        this.gridSize = { rows, cols };
        this.resetGrid();
    }
    
    /**
     * Enable mapping mode
     */
    enable() {
        if (this.enabled) return;
        
        this.enabled = true;
        
        // Show mapping canvas
        this.canvas.style.display = 'block';
        
        // Save original source canvas styles before modifying
        this.originalSourceStyles = {
            visibility: this.sourceCanvas.style.visibility,
            position: this.sourceCanvas.style.position
        };
        
        // Hide source canvas visually but keep it rendering
        // Using visibility:hidden keeps it in the render tree so we can read from it
        this.sourceCanvas.style.visibility = 'hidden';
        this.sourceCanvas.style.position = 'absolute';
        
        // Resize after making visible
        requestAnimationFrame(() => {
            this.resizeCanvases();
        });
    }
    
    /**
     * Disable mapping mode
     */
    disable() {
        if (!this.enabled) return;
        
        this.enabled = false;
        this.calibrating = false;
        
        // Hide mapping canvases
        this.canvas.style.display = 'none';
        this.overlayCanvas.style.display = 'none';
        
        // Restore source canvas visibility using saved original styles
        if (this.originalSourceStyles) {
            this.sourceCanvas.style.visibility = this.originalSourceStyles.visibility;
            this.sourceCanvas.style.position = this.originalSourceStyles.position;
        } else {
            this.sourceCanvas.style.visibility = 'visible';
            this.sourceCanvas.style.position = '';
        }
        
        this.removeEventListeners();
    }
    
    /**
     * Toggle mapping on/off
     */
    toggle() {
        if (this.enabled) {
            this.disable();
        } else {
            this.enable();
        }
        return this.enabled;
    }
    
    /**
     * Enter calibration mode (show grid and control points)
     */
    startCalibration() {
        if (!this.enabled) this.enable();
        
        this.calibrating = true;
        this.overlayCanvas.style.display = 'block';
        this.overlayCanvas.style.pointerEvents = 'auto';
        
        this.addEventListeners();
        
        // Use requestAnimationFrame to ensure DOM is updated before drawing
        requestAnimationFrame(() => {
            this.resizeCanvases();
            this.drawOverlay();

        });
    }
    
    /**
     * Exit calibration mode (hide grid overlay)
     */
    stopCalibration() {
        this.calibrating = false;
        this.selectedPoint = null;
        this.overlayCanvas.style.display = 'none';
        this.overlayCanvas.style.pointerEvents = 'none';
        
        this.removeEventListeners();
        
        // Auto-save when exiting calibration
        this.saveLastPreset();
        

    }
    
    /**
     * Toggle calibration mode
     */
    toggleCalibration() {
        if (this.calibrating) {
            this.stopCalibration();
        } else {
            this.startCalibration();
        }
        return this.calibrating;
    }
    
    addEventListeners() {
        this.overlayCanvas.addEventListener('pointerdown', this.onPointerDown);
        this.overlayCanvas.addEventListener('pointermove', this.onPointerMove);
        this.overlayCanvas.addEventListener('pointerup', this.onPointerUp);
        this.overlayCanvas.addEventListener('pointercancel', this.onPointerUp);
        this.overlayCanvas.addEventListener('pointerleave', this.onPointerUp);
    }
    
    removeEventListeners() {
        this.overlayCanvas.removeEventListener('pointerdown', this.onPointerDown);
        this.overlayCanvas.removeEventListener('pointermove', this.onPointerMove);
        this.overlayCanvas.removeEventListener('pointerup', this.onPointerUp);
        this.overlayCanvas.removeEventListener('pointercancel', this.onPointerUp);
        this.overlayCanvas.removeEventListener('pointerleave', this.onPointerUp);
    }
    
    resizeCanvases() {
        // Get dimensions from parent container since source canvas might be hidden
        const parent = this.sourceCanvas.parentElement;
        const rect = parent.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        
        // Validate dimensions
        if (rect.width === 0 || rect.height === 0) {
            console.warn('Mapping: Parent has zero dimensions, retrying...');
            requestAnimationFrame(() => this.resizeCanvases());
            return;
        }
        

        
        // Resize WebGL canvas
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        
        // Resize overlay canvas
        this.overlayCanvas.width = rect.width * dpr;
        this.overlayCanvas.height = rect.height * dpr;
        this.overlayCanvas.style.width = rect.width + 'px';
        this.overlayCanvas.style.height = rect.height + 'px';
        
        // Scale overlay context for DPR
        this.overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        
        if (this.gl) {
            this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        }
        
        // Redraw overlay after resize if calibrating (resize clears the canvas)
        if (this.calibrating) {
            this.drawOverlay();
        }
    }
    
    /**
     * Convert normalized coordinates (0-1) to canvas pixels
     * @param {Object} point - Point with x, y normalized coordinates
     * @param {DOMRect} [rect] - Optional cached rect to avoid reflow
     */
    normalizedToPixels(point, rect) {
        const r = rect || this.overlayCanvas.getBoundingClientRect();
        return {
            x: point.x * r.width,
            y: point.y * r.height
        };
    }
    
    /**
     * Convert canvas pixels to normalized coordinates (0-1)
     * @param {number} x - X coordinate in pixels
     * @param {number} y - Y coordinate in pixels
     * @param {DOMRect} [rect] - Optional cached rect to avoid reflow
     */
    pixelsToNormalized(x, y, rect) {
        const r = rect || this.overlayCanvas.getBoundingClientRect();
        return {
            x: Math.max(0, Math.min(1, x / r.width)),
            y: Math.max(0, Math.min(1, y / r.height))
        };
    }
    
    /**
     * Find the control point nearest to the given position
     * @param {number} x - X coordinate in pixels
     * @param {number} y - Y coordinate in pixels
     * @param {DOMRect} [rect] - Optional cached rect to avoid reflow
     */
    hitTest(x, y, rect) {
        const hitRadius = this.pointRadius * 1.5; // Slightly larger hit area
        let nearest = null;
        let nearestDist = Infinity;
        const r = rect || this.overlayCanvas.getBoundingClientRect();
        
        for (let row = 0; row <= this.gridSize.rows; row++) {
            for (let col = 0; col <= this.gridSize.cols; col++) {
                const point = this.controlPoints[row][col];
                const pixelPoint = this.normalizedToPixels(point, r);
                
                const dx = pixelPoint.x - x;
                const dy = pixelPoint.y - y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist < hitRadius && dist < nearestDist) {
                    nearest = { row, col };
                    nearestDist = dist;
                }
            }
        }
        
        return nearest;
    }
    
    /**
     * Find which cell (quad) contains the given point
     * Uses cross-product method for point-in-quad detection
     * Returns { row, col } or null if point is outside all cells
     * @param {number} x - X coordinate in pixels
     * @param {number} y - Y coordinate in pixels
     * @param {DOMRect} [rect] - Optional cached rect to avoid reflow
     */
    hitTestCell(x, y, rect) {
        const { rows, cols } = this.gridSize;
        const r = rect || this.overlayCanvas.getBoundingClientRect();
        
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                // Get the four corners of this quad in pixel coordinates
                const tl = this.normalizedToPixels(this.controlPoints[row][col], r);
                const tr = this.normalizedToPixels(this.controlPoints[row][col + 1], r);
                const br = this.normalizedToPixels(this.controlPoints[row + 1][col + 1], r);
                const bl = this.normalizedToPixels(this.controlPoints[row + 1][col], r);
                
                // Check if point is inside this quad using cross-product method
                if (this.isPointInQuad(x, y, tl, tr, br, bl)) {
                    return { row, col };
                }
            }
        }
        
        return null;
    }
    
    /**
     * Check if a point is inside a quadrilateral using cross-product method
     * Points should be in clockwise or counter-clockwise order: tl, tr, br, bl
     */
    isPointInQuad(px, py, p1, p2, p3, p4) {
        // Check the sign of cross products for each edge
        // If all have the same sign, point is inside
        const d1 = this.crossProductSign(px, py, p1.x, p1.y, p2.x, p2.y);
        const d2 = this.crossProductSign(px, py, p2.x, p2.y, p3.x, p3.y);
        const d3 = this.crossProductSign(px, py, p3.x, p3.y, p4.x, p4.y);
        const d4 = this.crossProductSign(px, py, p4.x, p4.y, p1.x, p1.y);
        
        const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0) || (d4 < 0);
        const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0) || (d4 > 0);
        
        // Point is inside if all cross products have the same sign
        return !(hasNeg && hasPos);
    }
    
    /**
     * Calculate the sign of cross product (p1 - p) x (p2 - p)
     */
    crossProductSign(px, py, x1, y1, x2, y2) {
        return (x1 - px) * (y2 - py) - (x2 - px) * (y1 - py);
    }
    
    onPointerDown(e) {
        e.preventDefault();
        
        const rect = this.overlayCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // In merge mode, cell clicks have different behavior
        if (this.mergeMode) {
            const cellHit = this.hitTestCell(x, y, rect);
            
            if (cellHit) {
                // Check if cell is already in a merged region
                const existingRegion = this.getCellMergedRegion(cellHit.row, cellHit.col);
                
                if (existingRegion) {
                    // Clicking a merged region in merge mode - offer to unmerge
                    // For now, just unmerge it directly
                    this.unmergeRegion(existingRegion.id);
                } else {
                    // Toggle cell in merge selection
                    this.toggleCellInMergeSelection(cellHit.row, cellHit.col);
                    this.drawOverlay();
                }
            }
            return;
        }
        
        // Normal mode: First, check if a control point was clicked (pass cached rect)
        const hit = this.hitTest(x, y, rect);
        
        if (hit) {
            // Clicked on a control point - start dragging
            this.selectedPoint = hit;
            this.isDragging = true;
            
            const point = this.controlPoints[hit.row][hit.col];
            const pixelPoint = this.normalizedToPixels(point, rect);
            this.dragOffset = {
                x: pixelPoint.x - x,
                y: pixelPoint.y - y
            };
            
            this.overlayCanvas.setPointerCapture(e.pointerId);
            this.drawOverlay();
        } else {
            // No control point hit - check if a cell was clicked to toggle blackout (pass cached rect)
            const cellHit = this.hitTestCell(x, y, rect);
            
            if (cellHit) {
                this.toggleCellBlocked(cellHit.row, cellHit.col);
            }
        }
    }
    
    onPointerMove(e) {
        if (!this.isDragging || !this.selectedPoint) return;
        
        e.preventDefault();
        
        const rect = this.overlayCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left + this.dragOffset.x;
        const y = e.clientY - rect.top + this.dragOffset.y;
        
        const normalized = this.pixelsToNormalized(x, y, rect);
        
        this.controlPoints[this.selectedPoint.row][this.selectedPoint.col] = normalized;
        
        // Mark mesh as dirty since control points changed
        this.isMeshDirty = true;
        
        this.drawOverlay();
    }
    
    onPointerUp(e) {
        if (this.isDragging) {
            this.isDragging = false;
            this.overlayCanvas.releasePointerCapture(e.pointerId);
            this.drawOverlay();
        }
    }
    
    /**
     * Check if a horizontal line segment between two adjacent columns should be drawn
     * (not internal to a merged region)
     */
    shouldDrawHorizontalLine(row, col) {
        // This is a horizontal line at row 'row', between columns col and col+1
        // It's internal if the cells above and below are in the same merged region
        
        // Top edge of grid - always draw
        if (row === 0) return true;
        // Bottom edge of grid - always draw
        if (row === this.gridSize.rows) return true;
        
        // Check if cells (row-1, col) and (row, col) are in the same merged region
        const cellAbove = { row: row - 1, col: col };
        const cellBelow = { row: row, col: col };
        
        return !this.areCellsInSameMergedRegion(cellAbove.row, cellAbove.col, cellBelow.row, cellBelow.col);
    }
    
    /**
     * Check if a vertical line segment between two adjacent rows should be drawn
     * (not internal to a merged region)
     */
    shouldDrawVerticalLine(row, col) {
        // This is a vertical line at col 'col', between rows row and row+1
        // It's internal if the cells left and right are in the same merged region
        
        // Left edge of grid - always draw
        if (col === 0) return true;
        // Right edge of grid - always draw
        if (col === this.gridSize.cols) return true;
        
        // Check if cells (row, col-1) and (row, col) are in the same merged region
        const cellLeft = { row: row, col: col - 1 };
        const cellRight = { row: row, col: col };
        
        return !this.areCellsInSameMergedRegion(cellLeft.row, cellLeft.col, cellRight.row, cellRight.col);
    }
    
    /**
     * Draw the calibration overlay (grid lines and control points)
     */
    drawOverlay() {
        if (!this.calibrating) return;
        
        const ctx = this.overlayCtx;
        // Cache rect once at the start to avoid multiple reflows
        const rect = this.overlayCanvas.getBoundingClientRect();
        
        // Validate we have valid dimensions
        if (rect.width === 0 || rect.height === 0) {
            return;
        }
        
        ctx.clearRect(0, 0, rect.width, rect.height);
        
        // Draw merged region fills (subtle background to indicate merged areas)
        for (const region of this.mergedRegions) {
            const { minRow, maxRow, minCol, maxCol } = region.bounds;
            
            // Get the four outer corners
            const tl = this.normalizedToPixels(this.controlPoints[minRow][minCol], rect);
            const tr = this.normalizedToPixels(this.controlPoints[minRow][maxCol + 1], rect);
            const br = this.normalizedToPixels(this.controlPoints[maxRow + 1][maxCol + 1], rect);
            const bl = this.normalizedToPixels(this.controlPoints[maxRow + 1][minCol], rect);
            
            // Draw subtle fill for merged region
            ctx.beginPath();
            ctx.moveTo(tl.x, tl.y);
            ctx.lineTo(tr.x, tr.y);
            ctx.lineTo(br.x, br.y);
            ctx.lineTo(bl.x, bl.y);
            ctx.closePath();
            ctx.fillStyle = 'rgba(0, 200, 255, 0.1)';
            ctx.fill();
        }
        
        // Draw grid lines (skipping internal lines of merged regions)
        ctx.strokeStyle = this.gridLineColor;
        ctx.lineWidth = 2;
        
        // Horizontal line segments
        for (let row = 0; row <= this.gridSize.rows; row++) {
            for (let col = 0; col < this.gridSize.cols; col++) {
                if (this.shouldDrawHorizontalLine(row, col)) {
                    const p1 = this.normalizedToPixels(this.controlPoints[row][col], rect);
                    const p2 = this.normalizedToPixels(this.controlPoints[row][col + 1], rect);
                    
                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.stroke();
                }
            }
        }
        
        // Vertical line segments
        for (let col = 0; col <= this.gridSize.cols; col++) {
            for (let row = 0; row < this.gridSize.rows; row++) {
                if (this.shouldDrawVerticalLine(row, col)) {
                    const p1 = this.normalizedToPixels(this.controlPoints[row][col], rect);
                    const p2 = this.normalizedToPixels(this.controlPoints[row + 1][col], rect);
                    
                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    ctx.stroke();
                }
            }
        }
        
        // Draw merge selection highlight (when in merge mode)
        if (this.mergeMode && this.mergeSelection.length > 0) {
            for (const cell of this.mergeSelection) {
                const tl = this.normalizedToPixels(this.controlPoints[cell.row][cell.col], rect);
                const tr = this.normalizedToPixels(this.controlPoints[cell.row][cell.col + 1], rect);
                const br = this.normalizedToPixels(this.controlPoints[cell.row + 1][cell.col + 1], rect);
                const bl = this.normalizedToPixels(this.controlPoints[cell.row + 1][cell.col], rect);
                
                // Fill with selection color
                ctx.beginPath();
                ctx.moveTo(tl.x, tl.y);
                ctx.lineTo(tr.x, tr.y);
                ctx.lineTo(br.x, br.y);
                ctx.lineTo(bl.x, bl.y);
                ctx.closePath();
                ctx.fillStyle = 'rgba(0, 255, 200, 0.3)';
                ctx.fill();
                
                // Draw border
                ctx.strokeStyle = 'rgba(0, 255, 200, 0.9)';
                ctx.lineWidth = 3;
                ctx.stroke();
            }
            
            // Show validity indicator
            const isValid = this.isValidRectangularSelection();
            if (this.mergeSelection.length >= 2) {
                const bounds = this.getMergeSelectionBounds();
                const centerX = (this.normalizedToPixels(this.controlPoints[bounds.minRow][bounds.minCol], rect).x +
                                this.normalizedToPixels(this.controlPoints[bounds.maxRow + 1][bounds.maxCol + 1], rect).x) / 2;
                const centerY = (this.normalizedToPixels(this.controlPoints[bounds.minRow][bounds.minCol], rect).y +
                                this.normalizedToPixels(this.controlPoints[bounds.maxRow + 1][bounds.maxCol + 1], rect).y) / 2;
                
                ctx.font = 'bold 24px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = isValid ? 'rgba(0, 255, 100, 0.9)' : 'rgba(255, 100, 100, 0.9)';
                ctx.fillText(isValid ? '✓' : '✗', centerX, centerY);
            }
        }
        
        // Draw blocked cells with semi-transparent overlay and X pattern
        // For merged regions, check if entire region is blocked
        const drawnMergedRegions = new Set();
        
        for (let row = 0; row < this.gridSize.rows; row++) {
            for (let col = 0; col < this.gridSize.cols; col++) {
                const region = this.getCellMergedRegion(row, col);
                
                if (region) {
                    // Cell is part of a merged region
                    if (drawnMergedRegions.has(region.id)) continue;
                    drawnMergedRegions.add(region.id);
                    
                    // Check if the merged region is blocked (check first cell)
                    const firstCell = region.cells[0];
                    if (this.isCellBlocked(firstCell.row, firstCell.col)) {
                        const { minRow, maxRow, minCol, maxCol } = region.bounds;
                        const tl = this.normalizedToPixels(this.controlPoints[minRow][minCol], rect);
                        const tr = this.normalizedToPixels(this.controlPoints[minRow][maxCol + 1], rect);
                        const br = this.normalizedToPixels(this.controlPoints[maxRow + 1][maxCol + 1], rect);
                        const bl = this.normalizedToPixels(this.controlPoints[maxRow + 1][minCol], rect);
                        
                        // Draw semi-transparent black fill
                        ctx.beginPath();
                        ctx.moveTo(tl.x, tl.y);
                        ctx.lineTo(tr.x, tr.y);
                        ctx.lineTo(br.x, br.y);
                        ctx.lineTo(bl.x, bl.y);
                        ctx.closePath();
                        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                        ctx.fill();
                        
                        // Draw X pattern
                        ctx.strokeStyle = 'rgba(255, 50, 50, 0.8)';
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        ctx.moveTo(tl.x, tl.y);
                        ctx.lineTo(br.x, br.y);
                        ctx.stroke();
                        ctx.beginPath();
                        ctx.moveTo(tr.x, tr.y);
                        ctx.lineTo(bl.x, bl.y);
                        ctx.stroke();
                    }
                } else {
                    // Individual cell
                    if (this.isCellBlocked(row, col)) {
                        const tl = this.normalizedToPixels(this.controlPoints[row][col], rect);
                        const tr = this.normalizedToPixels(this.controlPoints[row][col + 1], rect);
                        const br = this.normalizedToPixels(this.controlPoints[row + 1][col + 1], rect);
                        const bl = this.normalizedToPixels(this.controlPoints[row + 1][col], rect);
                        
                        // Draw semi-transparent black fill
                        ctx.beginPath();
                        ctx.moveTo(tl.x, tl.y);
                        ctx.lineTo(tr.x, tr.y);
                        ctx.lineTo(br.x, br.y);
                        ctx.lineTo(bl.x, bl.y);
                        ctx.closePath();
                        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                        ctx.fill();
                        
                        // Draw X pattern
                        ctx.strokeStyle = 'rgba(255, 50, 50, 0.8)';
                        ctx.lineWidth = 2;
                        ctx.beginPath();
                        ctx.moveTo(tl.x, tl.y);
                        ctx.lineTo(br.x, br.y);
                        ctx.stroke();
                        ctx.beginPath();
                        ctx.moveTo(tr.x, tr.y);
                        ctx.lineTo(bl.x, bl.y);
                        ctx.stroke();
                    }
                }
            }
        }
        
        // Draw control points
        for (let row = 0; row <= this.gridSize.rows; row++) {
            if (!this.controlPoints[row]) {
                continue;
            }
            for (let col = 0; col <= this.gridSize.cols; col++) {
                if (!this.controlPoints[row][col]) {
                    continue;
                }
                
                const point = this.normalizedToPixels(this.controlPoints[row][col], rect);
                const isSelected = this.selectedPoint && 
                    this.selectedPoint.row === row && 
                    this.selectedPoint.col === col;
                
                // Outer ring
                ctx.beginPath();
                ctx.arc(point.x, point.y, this.pointRadius, 0, Math.PI * 2);
                ctx.fillStyle = isSelected ? this.pointColorSelected : this.pointColor;
                ctx.fill();
                
                // Border for better visibility
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 2;
                ctx.stroke();
                
                // Inner dot
                ctx.beginPath();
                ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
                ctx.fillStyle = 'white';
                ctx.fill();
                
                // Corner labels
                const isCorner = (row === 0 || row === this.gridSize.rows) && 
                                 (col === 0 || col === this.gridSize.cols);
                if (isCorner) {
                    ctx.fillStyle = 'white';
                    ctx.font = 'bold 12px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    
                    let label = '';
                    if (row === 0 && col === 0) label = 'TL';
                    else if (row === 0 && col === this.gridSize.cols) label = 'TR';
                    else if (row === this.gridSize.rows && col === 0) label = 'BL';
                    else if (row === this.gridSize.rows && col === this.gridSize.cols) label = 'BR';
                    
                    ctx.fillText(label, point.x, point.y - this.pointRadius - 10);
                }
            }
        }
    }
    
    /**
     * Check if a merged region is blocked (all cells blocked)
     */
    isMergedRegionBlocked(region) {
        // A merged region is blocked if its first cell is blocked
        // (blocking applies to entire region)
        const firstCell = region.cells[0];
        return this.isCellBlocked(firstCell.row, firstCell.col);
    }
    
    /**
     * Build mesh geometry from control points
     * Returns arrays for positions and texture coordinates
     * Handles merged regions as single unified quads
     */
    buildMesh() {
        const positions = [];
        const texCoords = [];
        
        const { rows, cols } = this.gridSize;
        
        // Track which cells have been processed (as part of merged regions)
        const processedCells = new Set();
        
        // First, render merged regions
        for (const region of this.mergedRegions) {
            // Skip blocked merged regions
            if (this.isMergedRegionBlocked(region)) {
                // Mark cells as processed so they're skipped later
                for (const cell of region.cells) {
                    processedCells.add(`${cell.row},${cell.col}`);
                }
                continue;
            }
            
            const { minRow, maxRow, minCol, maxCol } = region.bounds;
            
            // Get the four outer corners of the merged region
            const tl = this.controlPoints[minRow][minCol];
            const tr = this.controlPoints[minRow][maxCol + 1];
            const bl = this.controlPoints[maxRow + 1][minCol];
            const br = this.controlPoints[maxRow + 1][maxCol + 1];
            
            // UV coordinates span the entire merged area
            const uvTL = { x: minCol / cols, y: minRow / rows };
            const uvTR = { x: (maxCol + 1) / cols, y: minRow / rows };
            const uvBL = { x: minCol / cols, y: (maxRow + 1) / rows };
            const uvBR = { x: (maxCol + 1) / cols, y: (maxRow + 1) / rows };
            
            // Triangle 1: TL, TR, BL
            positions.push(tl.x, tl.y, tr.x, tr.y, bl.x, bl.y);
            texCoords.push(uvTL.x, uvTL.y, uvTR.x, uvTR.y, uvBL.x, uvBL.y);
            
            // Triangle 2: TR, BR, BL
            positions.push(tr.x, tr.y, br.x, br.y, bl.x, bl.y);
            texCoords.push(uvTR.x, uvTR.y, uvBR.x, uvBR.y, uvBL.x, uvBL.y);
            
            // Mark all cells in this region as processed
            for (const cell of region.cells) {
                processedCells.add(`${cell.row},${cell.col}`);
            }
        }
        
        // Then, render individual cells (not part of merged regions)
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                // Skip cells that are part of merged regions
                if (processedCells.has(`${row},${col}`)) {
                    continue;
                }
                
                // Skip blocked cells
                if (this.isCellBlocked(row, col)) {
                    continue;
                }
                
                // Get the four corners of this quad
                const tl = this.controlPoints[row][col];
                const tr = this.controlPoints[row][col + 1];
                const bl = this.controlPoints[row + 1][col];
                const br = this.controlPoints[row + 1][col + 1];
                
                // UV coordinates (normalized source texture coordinates)
                const uvTL = { x: col / cols, y: row / rows };
                const uvTR = { x: (col + 1) / cols, y: row / rows };
                const uvBL = { x: col / cols, y: (row + 1) / rows };
                const uvBR = { x: (col + 1) / cols, y: (row + 1) / rows };
                
                // Triangle 1: TL, TR, BL
                positions.push(tl.x, tl.y, tr.x, tr.y, bl.x, bl.y);
                texCoords.push(uvTL.x, uvTL.y, uvTR.x, uvTR.y, uvBL.x, uvBL.y);
                
                // Triangle 2: TR, BR, BL
                positions.push(tr.x, tr.y, br.x, br.y, bl.x, bl.y);
                texCoords.push(uvTR.x, uvTR.y, uvBR.x, uvBR.y, uvBL.x, uvBL.y);
            }
        }
        
        return { positions, texCoords };
    }
    
    /**
     * Render the warped output
     * Called every frame when mapping is enabled
     */
    render() {
        if (!this.enabled || !this.gl) return;
        
        const gl = this.gl;
        
        // Resize if needed - use parent dimensions (consistent with resizeCanvases)
        const parent = this.sourceCanvas.parentElement;
        const rect = parent.getBoundingClientRect();
        if (this.canvas.width !== rect.width * (window.devicePixelRatio || 1) ||
            this.canvas.height !== rect.height * (window.devicePixelRatio || 1)) {
            this.resizeCanvases();
        }
        
        // Update texture from source canvas
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.sourceCanvas);
        
        // Build mesh only when dirty (control points/blocked cells changed)
        if (this.isMeshDirty || !this.cachedMesh) {
            this.cachedMesh = this.buildMesh();
            this.isMeshDirty = false;
        }
        
        const { positions, texCoords } = this.cachedMesh;
        
        // Clear
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        
        // Use program
        gl.useProgram(this.program);
        
        // Upload position data
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(this.positionLocation);
        gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);
        
        // Upload texture coordinate data
        gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texCoords), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(this.texCoordLocation);
        gl.vertexAttribPointer(this.texCoordLocation, 2, gl.FLOAT, false, 0, 0);
        
        // Set texture
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.uniform1i(this.textureLocation, 0);
        
        // Draw - vertex count is positions.length / 2 (each vertex has x,y)
        const vertexCount = positions.length / 2;
        gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
        
        // Note: drawOverlay is NOT called here every frame
        // It's only called when interacting (onPointerMove, onPointerDown, etc.)
    }
    
    // =========================================================================
    // Preset Management
    // =========================================================================
    
    /**
     * Save current mapping configuration as a preset
     */
    savePreset(name) {
        const presets = this.getPresets();
        
        presets[name] = {
            gridSize: { ...this.gridSize },
            controlPoints: JSON.parse(JSON.stringify(this.controlPoints)),
            blockedCells: JSON.parse(JSON.stringify(this.blockedCells)),
            mergedRegions: JSON.parse(JSON.stringify(this.mergedRegions)),
            created: Date.now()
        };
        
        localStorage.setItem('hydra-mapping-presets', JSON.stringify(presets));

        
        return true;
    }
    
    /**
     * Load a mapping preset by name
     */
    loadPreset(name) {
        const presets = this.getPresets();
        const preset = presets[name];
        
        if (!preset) {
            return false;
        }
        
        this.gridSize = { ...preset.gridSize };
        this.controlPoints = JSON.parse(JSON.stringify(preset.controlPoints));
        
        // Load blocked cells, or initialize if not present (for old presets)
        if (preset.blockedCells) {
            this.blockedCells = JSON.parse(JSON.stringify(preset.blockedCells));
        } else {
            this.initBlockedCells();
        }
        
        // Load merged regions, or initialize if not present (for old presets)
        if (preset.mergedRegions) {
            this.mergedRegions = JSON.parse(JSON.stringify(preset.mergedRegions));
        } else {
            this.initMergedRegions();
        }
        
        // Mark mesh as dirty since preset was loaded
        this.isMeshDirty = true;
        
        if (this.calibrating) {
            this.drawOverlay();
        }
        
        return true;
    }
    
    /**
     * Delete a mapping preset
     */
    deletePreset(name) {
        const presets = this.getPresets();
        
        if (presets[name]) {
            delete presets[name];
            localStorage.setItem('hydra-mapping-presets', JSON.stringify(presets));

            return true;
        }
        
        return false;
    }
    
    /**
     * Get all saved presets
     */
    getPresets() {
        try {
            const saved = localStorage.getItem('hydra-mapping-presets');
            return saved ? JSON.parse(saved) : {};
        } catch (error) {
            console.warn('Error loading mapping presets:', error);
            return {};
        }
    }
    
    /**
     * Get list of preset names
     */
    getPresetNames() {
        return Object.keys(this.getPresets());
    }
    
    /**
     * Save current state as "last used" (auto-loaded on start)
     */
    saveLastPreset() {
        this.savePreset('__last__');
    }
    
    /**
     * Load the last used preset if available
     */
    loadLastPreset() {
        const presets = this.getPresets();
        if (presets['__last__']) {
            this.loadPreset('__last__');
        }
    }
    
    /**
     * Export current mapping as JSON string
     */
    exportMapping() {
        return JSON.stringify({
            gridSize: this.gridSize,
            controlPoints: this.controlPoints,
            blockedCells: this.blockedCells,
            mergedRegions: this.mergedRegions,
            exported: Date.now()
        }, null, 2);
    }
    
    /**
     * Import mapping from JSON string
     */
    importMapping(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            
            if (data.gridSize && data.controlPoints) {
                this.gridSize = data.gridSize;
                this.controlPoints = data.controlPoints;
                
                // Import blocked cells, or initialize if not present
                if (data.blockedCells) {
                    this.blockedCells = data.blockedCells;
                } else {
                    this.initBlockedCells();
                }
                
                // Import merged regions, or initialize if not present
                if (data.mergedRegions) {
                    this.mergedRegions = data.mergedRegions;
                } else {
                    this.initMergedRegions();
                }
                
                // Mark mesh as dirty since mapping was imported
                this.isMeshDirty = true;
                
                if (this.calibrating) {
                    this.drawOverlay();
                }
                
                return true;
            }
        } catch (error) {
            console.error('Failed to import mapping:', error);
        }
        
        return false;
    }
    
    /**
     * Destroy the mapping controller and clean up
     */
    destroy() {
        this.disable();
        
        if (this.canvas && this.canvas.parentElement) {
            this.canvas.parentElement.removeChild(this.canvas);
        }
        
        if (this.overlayCanvas && this.overlayCanvas.parentElement) {
            this.overlayCanvas.parentElement.removeChild(this.overlayCanvas);
        }
        
        if (this.gl) {
            this.gl.deleteTexture(this.texture);
            this.gl.deleteBuffer(this.positionBuffer);
            this.gl.deleteBuffer(this.texCoordBuffer);
            this.gl.deleteProgram(this.program);
        }
        

    }
}

// Export for use in mobile-hydra.js
window.MappingController = MappingController;
