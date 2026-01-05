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
        
        // Shape mode properties (Phase 1)
        this.mode = 'grid';                     // 'grid' | 'shape'
        this.shapes = [];                       // Array of shape objects
        this.activeShapeIndex = -1;             // Currently selected shape (-1 = none)
        
        // Drawing state (Phase 2)
        this.isDrawingShape = false;            // Currently drawing a new shape
        this.drawingShapeType = null;           // 'circle' | 'rectangle' | null
        this.drawingStart = null;               // {x, y} normalized start point
        this.drawingCurrent = null;             // {x, y} normalized current point (for preview)
        this.selectedShapePoint = null;         // { shapeIndex, pointIndex } for dragging
        
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
        
        // Shape mode handling
        if (this.mode === 'shape') {
            // If drawing shape type is selected, start drawing
            if (this.drawingShapeType) {
                this.isDrawingShape = true;
                this.drawingStart = this.pixelsToNormalized(x, y, rect);
                this.drawingCurrent = { ...this.drawingStart };
                this.overlayCanvas.setPointerCapture(e.pointerId);
                this.drawOverlay();
                return;
            }
            
            // Check for shape point hit (for dragging)
            const shapePointHit = this.hitTestShapePoint(x, y, rect);
            if (shapePointHit) {
                this.activeShapeIndex = shapePointHit.shapeIndex;
                this.selectedShapePoint = shapePointHit;
                this.isDragging = true;
                
                const point = this.shapes[shapePointHit.shapeIndex].points[shapePointHit.pointIndex];
                const pixelPoint = this.normalizedToPixels(point, rect);
                this.dragOffset = {
                    x: pixelPoint.x - x,
                    y: pixelPoint.y - y
                };
                
                this.overlayCanvas.setPointerCapture(e.pointerId);
                this.drawOverlay();
                return;
            }
            
            // Check for segment toggle
            const segmentHit = this.hitTestShapeSegment(x, y, rect);
            if (segmentHit) {
                this.toggleShapeSegment(segmentHit.shapeIndex, segmentHit.segmentIndex);
                return;
            }
            
            return;
        }
        
        // Grid mode: existing behavior
        // First, check if a control point was clicked (pass cached rect)
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
        // Shape drawing preview
        if (this.mode === 'shape' && this.isDrawingShape && this.drawingShapeType) {
            e.preventDefault();
            const rect = this.overlayCanvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            this.drawingCurrent = this.pixelsToNormalized(x, y, rect);
            this.drawOverlay();
            return;
        }
        
        // Shape point dragging
        if (this.mode === 'shape' && this.isDragging && this.selectedShapePoint) {
            e.preventDefault();
            const rect = this.overlayCanvas.getBoundingClientRect();
            const x = e.clientX - rect.left + this.dragOffset.x;
            const y = e.clientY - rect.top + this.dragOffset.y;
            
            const normalized = this.pixelsToNormalized(x, y, rect);
            const shape = this.shapes[this.selectedShapePoint.shapeIndex];
            shape.points[this.selectedShapePoint.pointIndex] = normalized;
            
            this.isMeshDirty = true;
            this.drawOverlay();
            return;
        }
        
        // Grid mode: existing behavior
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
        // Finalize shape drawing
        if (this.mode === 'shape' && this.isDrawingShape && this.drawingShapeType) {
            this.finalizeShapeDrawing();
            this.overlayCanvas.releasePointerCapture(e.pointerId);
            this.drawOverlay();
            return;
        }
        
        // End shape point dragging
        if (this.mode === 'shape' && this.isDragging && this.selectedShapePoint) {
            this.isDragging = false;
            this.selectedShapePoint = null;
            this.overlayCanvas.releasePointerCapture(e.pointerId);
            this.drawOverlay();
            return;
        }
        
        // Grid mode: existing behavior
        if (this.isDragging) {
            this.isDragging = false;
            this.overlayCanvas.releasePointerCapture(e.pointerId);
            this.drawOverlay();
        }
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
        
        // Draw based on mode
        if (this.mode === 'grid') {
            this.drawGridOverlay(ctx, rect);
        } else if (this.mode === 'shape') {
            // In shape mode, draw grid as faint background reference
            this.drawGridOverlay(ctx, rect, true);
            // Draw shapes
            this.drawShapes(ctx, rect);
            // Draw shape being drawn (preview)
            if (this.isDrawingShape && this.drawingStart && this.drawingCurrent) {
                this.drawShapePreview(ctx, rect);
            }
        }
        
        // Draw mode indicator
        this.drawModeIndicator(ctx, rect);
    }
    
    /**
     * Draw the grid overlay
     * @param {CanvasRenderingContext2D} ctx
     * @param {DOMRect} rect
     * @param {boolean} faint - Draw as faint background
     */
    drawGridOverlay(ctx, rect, faint = false) {
        const alpha = faint ? 0.2 : 1;
        
        // Draw grid lines
        ctx.strokeStyle = faint ? 'rgba(255, 255, 255, 0.15)' : this.gridLineColor;
        ctx.lineWidth = faint ? 1 : 2;
        
        // Horizontal lines
        for (let row = 0; row <= this.gridSize.rows; row++) {
            ctx.beginPath();
            for (let col = 0; col <= this.gridSize.cols; col++) {
                const point = this.normalizedToPixels(this.controlPoints[row][col], rect);
                if (col === 0) {
                    ctx.moveTo(point.x, point.y);
                } else {
                    ctx.lineTo(point.x, point.y);
                }
            }
            ctx.stroke();
        }
        
        // Vertical lines
        for (let col = 0; col <= this.gridSize.cols; col++) {
            ctx.beginPath();
            for (let row = 0; row <= this.gridSize.rows; row++) {
                const point = this.normalizedToPixels(this.controlPoints[row][col], rect);
                if (row === 0) {
                    ctx.moveTo(point.x, point.y);
                } else {
                    ctx.lineTo(point.x, point.y);
                }
            }
            ctx.stroke();
        }
        
        // Skip blocked cells and control points if faint mode
        if (faint) return;
        
        // Draw blocked cells with semi-transparent overlay and X pattern
        for (let row = 0; row < this.gridSize.rows; row++) {
            for (let col = 0; col < this.gridSize.cols; col++) {
                if (this.isCellBlocked(row, col)) {
                    // Get the four corners of this cell
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
                    
                    // Draw X pattern for visibility
                    ctx.strokeStyle = 'rgba(255, 50, 50, 0.8)';
                    ctx.lineWidth = 2;
                    
                    // Diagonal line 1: TL to BR
                    ctx.beginPath();
                    ctx.moveTo(tl.x, tl.y);
                    ctx.lineTo(br.x, br.y);
                    ctx.stroke();
                    
                    // Diagonal line 2: TR to BL
                    ctx.beginPath();
                    ctx.moveTo(tr.x, tr.y);
                    ctx.lineTo(bl.x, bl.y);
                    ctx.stroke();
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
     * Draw mode indicator in corner
     * @param {CanvasRenderingContext2D} ctx
     * @param {DOMRect} rect
     */
    drawModeIndicator(ctx, rect) {
        const padding = 10;
        const text = this.mode === 'grid' ? 'GRID MODE' : 'SHAPE MODE';
        const subtext = this.mode === 'shape' && this.drawingShapeType 
            ? `Drawing: ${this.drawingShapeType}` 
            : (this.mode === 'shape' ? 'Tap segment to toggle' : 'Tap cell to toggle');
        
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        
        // Background
        const textWidth = Math.max(ctx.measureText(text).width, ctx.measureText(subtext).width);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(padding - 4, padding - 4, textWidth + 12, 38);
        
        // Mode text
        ctx.fillStyle = this.mode === 'grid' ? 'rgba(0, 200, 255, 1)' : 'rgba(0, 255, 100, 1)';
        ctx.fillText(text, padding, padding);
        
        // Subtext
        ctx.font = '10px sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.fillText(subtext, padding, padding + 16);
    }
    
    /**
     * Build mesh geometry from control points
     * Returns arrays for positions and texture coordinates
     */
    buildMesh() {
        const positions = [];
        const texCoords = [];
        
        const { rows, cols } = this.gridSize;
        
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                // Skip blocked cells - they won't render any content
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
            // Shape mode data
            mode: this.mode,
            shapes: JSON.parse(JSON.stringify(this.shapes)),
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
        
        // Load shape mode data, or initialize if not present (for old presets)
        if (preset.mode) {
            this.mode = preset.mode;
        } else {
            this.mode = 'grid';
        }
        
        if (preset.shapes) {
            this.shapes = JSON.parse(JSON.stringify(preset.shapes));
            this.activeShapeIndex = this.shapes.length > 0 ? 0 : -1;
        } else {
            this.shapes = [];
            this.activeShapeIndex = -1;
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
            mode: this.mode,
            shapes: this.shapes,
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
                
                // Import shape mode data
                if (data.mode) {
                    this.mode = data.mode;
                } else {
                    this.mode = 'grid';
                }
                
                if (data.shapes) {
                    this.shapes = data.shapes;
                    this.activeShapeIndex = this.shapes.length > 0 ? 0 : -1;
                } else {
                    this.shapes = [];
                    this.activeShapeIndex = -1;
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
    
    // =========================================================================
    // Shape Mode - Phase 1: Mode System and Data Structures
    // =========================================================================
    
    /**
     * Set the current mode
     * @param {string} mode - 'grid' or 'shape'
     */
    setMode(mode) {
        if (mode !== 'grid' && mode !== 'shape') return;
        this.mode = mode;
        this.drawingShapeType = null;
        this.isDrawingShape = false;
        this.drawingStart = null;
        this.drawingCurrent = null;
        if (this.calibrating) {
            this.drawOverlay();
        }
    }
    
    /**
     * Get current mode
     * @returns {string}
     */
    getMode() {
        return this.mode;
    }
    
    /**
     * Set the shape type to draw
     * @param {string|null} type - 'circle', 'rectangle', or null to stop drawing
     */
    setDrawingShapeType(type) {
        if (type !== null && type !== 'circle' && type !== 'rectangle') return;
        this.drawingShapeType = type;
        this.isDrawingShape = false;
        this.drawingStart = null;
        this.drawingCurrent = null;
    }
    
    /**
     * Get current drawing shape type
     * @returns {string|null}
     */
    getDrawingShapeType() {
        return this.drawingShapeType;
    }
    
    /**
     * Add a shape to the shapes array
     * @param {Object} shape
     */
    addShape(shape) {
        shape.id = shape.id || `shape_${Date.now()}`;
        this.shapes.push(shape);
        this.activeShapeIndex = this.shapes.length - 1;
        this.isMeshDirty = true;
        if (this.calibrating) {
            this.drawOverlay();
        }
    }
    
    /**
     * Remove a shape by index
     * @param {number} index
     */
    removeShape(index) {
        if (index >= 0 && index < this.shapes.length) {
            this.shapes.splice(index, 1);
            if (this.activeShapeIndex >= this.shapes.length) {
                this.activeShapeIndex = this.shapes.length - 1;
            }
            this.isMeshDirty = true;
            if (this.calibrating) {
                this.drawOverlay();
            }
        }
    }
    
    /**
     * Select a shape for editing
     * @param {number} index
     */
    selectShape(index) {
        if (index >= -1 && index < this.shapes.length) {
            this.activeShapeIndex = index;
            if (this.calibrating) {
                this.drawOverlay();
            }
        }
    }
    
    /**
     * Get all shapes
     * @returns {Array}
     */
    getShapes() {
        return this.shapes;
    }
    
    /**
     * Get active shape
     * @returns {Object|null}
     */
    getActiveShape() {
        if (this.activeShapeIndex >= 0 && this.activeShapeIndex < this.shapes.length) {
            return this.shapes[this.activeShapeIndex];
        }
        return null;
    }
    
    /**
     * Clear all shapes
     */
    clearShapes() {
        this.shapes = [];
        this.activeShapeIndex = -1;
        this.isMeshDirty = true;
        if (this.calibrating) {
            this.drawOverlay();
        }
    }
    
    // =========================================================================
    // Shape Mode - Phase 2: Interactive Drawing
    // =========================================================================
    
    /**
     * Finalize shape drawing and create the shape
     */
    finalizeShapeDrawing() {
        if (!this.drawingStart || !this.drawingCurrent) {
            this.isDrawingShape = false;
            return;
        }
        
        const shape = this.createShapeFromDrawing();
        if (shape) {
            this.generateShapePoints(shape);
            this.addShape(shape);
        }
        
        this.isDrawingShape = false;
        this.drawingStart = null;
        this.drawingCurrent = null;
        // Keep drawingShapeType so user can draw another shape of same type
    }
    
    /**
     * Create a shape object from drawing start/current points
     * @returns {Object|null}
     */
    createShapeFromDrawing() {
        const start = this.drawingStart;
        const current = this.drawingCurrent;
        
        if (this.drawingShapeType === 'circle') {
            const dx = current.x - start.x;
            const dy = current.y - start.y;
            const radius = Math.sqrt(dx * dx + dy * dy);
            
            if (radius < 0.02) return null; // Too small
            
            return {
                type: 'circle',
                center: { x: start.x, y: start.y },
                radius: radius,
                points: [],
                segments: [],
                renderMode: 'mask'
            };
        }
        
        if (this.drawingShapeType === 'rectangle') {
            const minX = Math.min(start.x, current.x);
            const minY = Math.min(start.y, current.y);
            const width = Math.abs(current.x - start.x);
            const height = Math.abs(current.y - start.y);
            
            if (width < 0.02 || height < 0.02) return null; // Too small
            
            return {
                type: 'rectangle',
                topLeft: { x: minX, y: minY },
                width: width,
                height: height,
                points: [],
                segments: [],
                renderMode: 'mask'
            };
        }
        
        return null;
    }
    
    // =========================================================================
    // Shape Mode - Phase 3: Automatic Point Generation
    // =========================================================================
    
    /**
     * Generate control points for a shape based on gridSize
     * @param {Object} shape
     */
    generateShapePoints(shape) {
        if (shape.type === 'circle') {
            shape.points = this.generateCirclePoints(shape);
        } else if (shape.type === 'rectangle') {
            shape.points = this.generateRectanglePoints(shape);
        }
        
        // Initialize all segments as enabled
        shape.segments = new Array(shape.points.length).fill(true);
    }
    
    /**
     * Generate points around a circle
     * @param {Object} shape - Circle shape with center and radius
     * @returns {Array} Array of {x, y} points
     */
    generateCirclePoints(shape) {
        const numPoints = (this.gridSize.rows + this.gridSize.cols) * 2;
        const points = [];
        
        for (let i = 0; i < numPoints; i++) {
            // Start from top (-PI/2) and go clockwise
            const angle = -Math.PI / 2 + (i / numPoints) * Math.PI * 2;
            points.push({
                x: shape.center.x + shape.radius * Math.cos(angle),
                y: shape.center.y + shape.radius * Math.sin(angle)
            });
        }
        
        return points;
    }
    
    /**
     * Generate points around a rectangle
     * @param {Object} shape - Rectangle shape with topLeft, width, height
     * @returns {Array} Array of {x, y} points
     */
    generateRectanglePoints(shape) {
        const points = [];
        const { topLeft, width, height } = shape;
        const hPoints = Math.max(2, this.gridSize.cols + 1); // Points on horizontal sides
        const vPoints = Math.max(2, this.gridSize.rows + 1); // Points on vertical sides
        
        // Top edge (left to right)
        for (let i = 0; i < hPoints; i++) {
            points.push({
                x: topLeft.x + (width * i / (hPoints - 1)),
                y: topLeft.y
            });
        }
        
        // Right edge (top to bottom, skip first point - already added)
        for (let i = 1; i < vPoints; i++) {
            points.push({
                x: topLeft.x + width,
                y: topLeft.y + (height * i / (vPoints - 1))
            });
        }
        
        // Bottom edge (right to left, skip first point)
        for (let i = hPoints - 2; i >= 0; i--) {
            points.push({
                x: topLeft.x + (width * i / (hPoints - 1)),
                y: topLeft.y + height
            });
        }
        
        // Left edge (bottom to top, skip first and last points)
        for (let i = vPoints - 2; i > 0; i--) {
            points.push({
                x: topLeft.x,
                y: topLeft.y + (height * i / (vPoints - 1))
            });
        }
        
        return points;
    }
    
    // =========================================================================
    // Shape Mode - Phase 4: Segment Toggle
    // =========================================================================
    
    /**
     * Toggle a segment's enabled state
     * @param {number} shapeIndex
     * @param {number} segmentIndex
     * @returns {boolean|null} New state or null if invalid
     */
    toggleShapeSegment(shapeIndex, segmentIndex) {
        if (shapeIndex < 0 || shapeIndex >= this.shapes.length) return null;
        
        const shape = this.shapes[shapeIndex];
        if (segmentIndex < 0 || segmentIndex >= shape.segments.length) return null;
        
        shape.segments[segmentIndex] = !shape.segments[segmentIndex];
        this.isMeshDirty = true;
        
        if (this.calibrating) {
            this.drawOverlay();
        }
        
        return shape.segments[segmentIndex];
    }
    
    /**
     * Hit test for shape segments
     * @param {number} x - Pixel x
     * @param {number} y - Pixel y
     * @param {DOMRect} rect
     * @returns {Object|null} { shapeIndex, segmentIndex } or null
     */
    hitTestShapeSegment(x, y, rect) {
        const hitDistance = 20; // Pixels - larger for touch
        
        for (let si = 0; si < this.shapes.length; si++) {
            const shape = this.shapes[si];
            const points = shape.points;
            
            if (points.length < 2) continue;
            
            for (let i = 0; i < points.length; i++) {
                const p1 = this.normalizedToPixels(points[i], rect);
                const p2 = this.normalizedToPixels(points[(i + 1) % points.length], rect);
                
                const dist = this.pointToLineDistance(x, y, p1.x, p1.y, p2.x, p2.y);
                
                if (dist < hitDistance) {
                    return { shapeIndex: si, segmentIndex: i };
                }
            }
        }
        
        return null;
    }
    
    /**
     * Hit test for shape control points
     * @param {number} x - Pixel x
     * @param {number} y - Pixel y
     * @param {DOMRect} rect
     * @returns {Object|null} { shapeIndex, pointIndex } or null
     */
    hitTestShapePoint(x, y, rect) {
        const hitRadius = this.pointRadius * 1.5;
        
        for (let si = 0; si < this.shapes.length; si++) {
            const shape = this.shapes[si];
            const points = shape.points;
            
            for (let pi = 0; pi < points.length; pi++) {
                const p = this.normalizedToPixels(points[pi], rect);
                const dx = p.x - x;
                const dy = p.y - y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist < hitRadius) {
                    return { shapeIndex: si, pointIndex: pi };
                }
            }
        }
        
        return null;
    }
    
    /**
     * Calculate distance from point to line segment
     * @param {number} px - Point x
     * @param {number} py - Point y
     * @param {number} x1 - Line start x
     * @param {number} y1 - Line start y
     * @param {number} x2 - Line end x
     * @param {number} y2 - Line end y
     * @returns {number} Distance in pixels
     */
    pointToLineDistance(px, py, x1, y1, x2, y2) {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;
        
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;
        
        if (lenSq !== 0) {
            param = dot / lenSq;
        }
        
        let xx, yy;
        
        if (param < 0) {
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }
        
        const dx = px - xx;
        const dy = py - yy;
        
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    // =========================================================================
    // Shape Mode - Drawing Helpers
    // =========================================================================
    
    /**
     * Draw all shapes on the overlay
     * @param {CanvasRenderingContext2D} ctx
     * @param {DOMRect} rect
     */
    drawShapes(ctx, rect) {
        this.shapes.forEach((shape, shapeIndex) => {
            const isActive = shapeIndex === this.activeShapeIndex;
            this.drawShape(ctx, rect, shape, isActive);
        });
    }
    
    /**
     * Draw a single shape on the overlay
     * @param {CanvasRenderingContext2D} ctx
     * @param {DOMRect} rect
     * @param {Object} shape
     * @param {boolean} isActive
     */
    drawShape(ctx, rect, shape, isActive) {
        const points = shape.points;
        if (points.length === 0) return;
        
        // Draw segments
        for (let i = 0; i < points.length; i++) {
            const p1 = this.normalizedToPixels(points[i], rect);
            const p2 = this.normalizedToPixels(points[(i + 1) % points.length], rect);
            const enabled = shape.segments[i];
            
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            
            if (enabled) {
                ctx.strokeStyle = isActive ? 'rgba(0, 255, 100, 0.9)' : 'rgba(0, 200, 255, 0.8)';
                ctx.lineWidth = 3;
                ctx.setLineDash([]);
            } else {
                ctx.strokeStyle = 'rgba(255, 50, 50, 0.6)';
                ctx.lineWidth = 2;
                ctx.setLineDash([8, 4]);
            }
            
            ctx.stroke();
            ctx.setLineDash([]);
        }
        
        // Draw control points
        points.forEach((point, i) => {
            const p = this.normalizedToPixels(point, rect);
            
            ctx.beginPath();
            ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
            ctx.fillStyle = isActive ? 'rgba(0, 255, 100, 1)' : 'rgba(0, 200, 255, 1)';
            ctx.fill();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.stroke();
        });
        
        // Draw shape type indicator at center
        let centerX, centerY;
        if (shape.type === 'circle') {
            centerX = shape.center.x;
            centerY = shape.center.y;
        } else if (shape.type === 'rectangle') {
            centerX = shape.topLeft.x + shape.width / 2;
            centerY = shape.topLeft.y + shape.height / 2;
        }
        
        if (centerX !== undefined) {
            const center = this.normalizedToPixels({ x: centerX, y: centerY }, rect);
            ctx.fillStyle = isActive ? 'rgba(0, 255, 100, 0.3)' : 'rgba(0, 200, 255, 0.2)';
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(shape.type === 'circle' ? '○' : '□', center.x, center.y);
        }
    }
    
    /**
     * Draw shape preview while drawing
     * @param {CanvasRenderingContext2D} ctx
     * @param {DOMRect} rect
     */
    drawShapePreview(ctx, rect) {
        if (!this.drawingStart || !this.drawingCurrent) return;
        
        const start = this.normalizedToPixels(this.drawingStart, rect);
        const current = this.normalizedToPixels(this.drawingCurrent, rect);
        
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.9)';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 5]);
        
        if (this.drawingShapeType === 'circle') {
            const dx = current.x - start.x;
            const dy = current.y - start.y;
            const radius = Math.sqrt(dx * dx + dy * dy);
            
            ctx.beginPath();
            ctx.arc(start.x, start.y, radius, 0, Math.PI * 2);
            ctx.stroke();
            
            // Draw center point
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(start.x, start.y, 6, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 0, 1)';
            ctx.fill();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Draw radius line
            ctx.setLineDash([5, 3]);
            ctx.strokeStyle = 'rgba(255, 255, 0, 0.6)';
            ctx.beginPath();
            ctx.moveTo(start.x, start.y);
            ctx.lineTo(current.x, current.y);
            ctx.stroke();
            
        } else if (this.drawingShapeType === 'rectangle') {
            const x = Math.min(start.x, current.x);
            const y = Math.min(start.y, current.y);
            const w = Math.abs(current.x - start.x);
            const h = Math.abs(current.y - start.y);
            
            ctx.beginPath();
            ctx.rect(x, y, w, h);
            ctx.stroke();
            
            // Draw corner points
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(255, 255, 0, 1)';
            [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].forEach(([px, py]) => {
                ctx.beginPath();
                ctx.arc(px, py, 5, 0, Math.PI * 2);
                ctx.fill();
            });
        }
        
        ctx.setLineDash([]);
    }
}

// Export for use in mobile-hydra.js
window.MappingController = MappingController;
