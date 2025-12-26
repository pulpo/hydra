/**
 * MappingController - Projection Mapping for Hydra Mobile
 * 
 * Provides multi-quad grid warping with WebGL for projecting
 * visualizations onto arbitrary surfaces.
 */

class MappingController {
    constructor(sourceCanvas, options = {}) {
        this.sourceCanvas = sourceCanvas;
        this.enabled = false;
        this.calibrating = false;
        
        // Grid configuration
        this.gridSize = options.gridSize || { rows: 3, cols: 3 };
        this.controlPoints = [];
        
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
            z-index: 5;
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
            z-index: 100;
            pointer-events: none;
        `;
        
        // Insert canvases after source canvas
        const parent = this.sourceCanvas.parentElement;
        
        // Ensure parent has position for absolute children
        const parentStyle = window.getComputedStyle(parent);
        if (parentStyle.position === 'static') {
            parent.style.position = 'relative';
        }
        
        parent.appendChild(this.canvas);
        parent.appendChild(this.overlayCanvas);
        
        this.overlayCtx = this.overlayCanvas.getContext('2d');
        
        console.log('Mapping: Canvases appended to', parent.id || parent.tagName);
        
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
                // Convert from pixel coordinates to clip space (-1 to 1)
                vec2 clipSpace = (a_position / vec2(1.0, 1.0)) * 2.0 - 1.0;
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
        
        console.log('Mapping WebGL initialized successfully');
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
        
        console.log(`Grid reset to ${cols}x${rows}`);
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
        
        // Show mapping canvas first so getBoundingClientRect works
        this.canvas.style.display = 'block';
        this.sourceCanvas.style.display = 'none';
        
        // Resize after making visible
        requestAnimationFrame(() => {
            this.resizeCanvases();
            console.log('Mapping enabled, canvas size:', this.canvas.width, 'x', this.canvas.height);
        });
    }
    
    /**
     * Disable mapping mode
     */
    disable() {
        if (!this.enabled) return;
        
        this.enabled = false;
        this.calibrating = false;
        
        this.canvas.style.display = 'none';
        this.overlayCanvas.style.display = 'none';
        this.sourceCanvas.style.display = 'block';
        
        this.removeEventListeners();
        
        console.log('Mapping disabled');
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
            console.log('Calibration started, overlay size:', this.overlayCanvas.width, 'x', this.overlayCanvas.height);
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
        
        console.log('Calibration stopped');
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
        
        console.log('Mapping resizeCanvases:', rect.width, 'x', rect.height, 'DPR:', dpr);
        
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
    }
    
    /**
     * Convert normalized coordinates (0-1) to canvas pixels
     */
    normalizedToPixels(point) {
        const rect = this.overlayCanvas.getBoundingClientRect();
        return {
            x: point.x * rect.width,
            y: point.y * rect.height
        };
    }
    
    /**
     * Convert canvas pixels to normalized coordinates (0-1)
     */
    pixelsToNormalized(x, y) {
        const rect = this.overlayCanvas.getBoundingClientRect();
        return {
            x: Math.max(0, Math.min(1, x / rect.width)),
            y: Math.max(0, Math.min(1, y / rect.height))
        };
    }
    
    /**
     * Find the control point nearest to the given position
     */
    hitTest(x, y) {
        const hitRadius = this.pointRadius * 1.5; // Slightly larger hit area
        let nearest = null;
        let nearestDist = Infinity;
        
        for (let row = 0; row <= this.gridSize.rows; row++) {
            for (let col = 0; col <= this.gridSize.cols; col++) {
                const point = this.controlPoints[row][col];
                const pixelPoint = this.normalizedToPixels(point);
                
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
    
    onPointerDown(e) {
        e.preventDefault();
        
        const rect = this.overlayCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const hit = this.hitTest(x, y);
        
        if (hit) {
            this.selectedPoint = hit;
            this.isDragging = true;
            
            const point = this.controlPoints[hit.row][hit.col];
            const pixelPoint = this.normalizedToPixels(point);
            this.dragOffset = {
                x: pixelPoint.x - x,
                y: pixelPoint.y - y
            };
            
            this.overlayCanvas.setPointerCapture(e.pointerId);
            this.drawOverlay();
        }
    }
    
    onPointerMove(e) {
        if (!this.isDragging || !this.selectedPoint) return;
        
        e.preventDefault();
        
        const rect = this.overlayCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left + this.dragOffset.x;
        const y = e.clientY - rect.top + this.dragOffset.y;
        
        const normalized = this.pixelsToNormalized(x, y);
        
        this.controlPoints[this.selectedPoint.row][this.selectedPoint.col] = normalized;
        
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
     * Draw the calibration overlay (grid lines and control points)
     */
    drawOverlay() {
        if (!this.calibrating) return;
        
        const ctx = this.overlayCtx;
        const rect = this.overlayCanvas.getBoundingClientRect();
        
        // Validate we have valid dimensions
        if (rect.width === 0 || rect.height === 0) {
            console.warn('Mapping drawOverlay: Canvas has zero dimensions');
            return;
        }
        
        console.log('Drawing overlay, rect:', rect.width, 'x', rect.height, 'grid:', this.gridSize.rows, 'x', this.gridSize.cols);
        
        ctx.clearRect(0, 0, rect.width, rect.height);
        
        // Debug: Draw a test rectangle to confirm canvas is working
        ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
        ctx.fillRect(10, 10, 50, 50);
        
        // Draw grid lines
        ctx.strokeStyle = this.gridLineColor;
        ctx.lineWidth = 2; // Make lines thicker for visibility
        
        // Horizontal lines
        for (let row = 0; row <= this.gridSize.rows; row++) {
            ctx.beginPath();
            for (let col = 0; col <= this.gridSize.cols; col++) {
                const point = this.normalizedToPixels(this.controlPoints[row][col]);
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
                const point = this.normalizedToPixels(this.controlPoints[row][col]);
                if (row === 0) {
                    ctx.moveTo(point.x, point.y);
                } else {
                    ctx.lineTo(point.x, point.y);
                }
            }
            ctx.stroke();
        }
        
        // Draw control points
        for (let row = 0; row <= this.gridSize.rows; row++) {
            if (!this.controlPoints[row]) {
                console.warn('Mapping: Missing row', row);
                continue;
            }
            for (let col = 0; col <= this.gridSize.cols; col++) {
                if (!this.controlPoints[row][col]) {
                    console.warn('Mapping: Missing point at', row, col);
                    continue;
                }
                
                const point = this.normalizedToPixels(this.controlPoints[row][col]);
                const isSelected = this.selectedPoint && 
                    this.selectedPoint.row === row && 
                    this.selectedPoint.col === col;
                
                console.log('Drawing point at', point.x.toFixed(0), point.y.toFixed(0), 'row:', row, 'col:', col);
                
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
     * Build mesh geometry from control points
     * Returns arrays for positions and texture coordinates
     */
    buildMesh() {
        const positions = [];
        const texCoords = [];
        
        const { rows, cols } = this.gridSize;
        
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
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
        
        // Resize if needed
        const rect = this.sourceCanvas.getBoundingClientRect();
        if (this.canvas.width !== rect.width * (window.devicePixelRatio || 1) ||
            this.canvas.height !== rect.height * (window.devicePixelRatio || 1)) {
            this.resizeCanvases();
        }
        
        // Update texture from source canvas
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.sourceCanvas);
        
        // Build mesh
        const { positions, texCoords } = this.buildMesh();
        
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
        
        // Draw
        const triangleCount = this.gridSize.rows * this.gridSize.cols * 2;
        gl.drawArrays(gl.TRIANGLES, 0, triangleCount * 3);
        
        // Redraw overlay if calibrating
        if (this.calibrating) {
            this.drawOverlay();
        }
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
            created: Date.now()
        };
        
        localStorage.setItem('hydra-mapping-presets', JSON.stringify(presets));
        console.log(`Mapping preset saved: ${name}`);
        
        return true;
    }
    
    /**
     * Load a mapping preset by name
     */
    loadPreset(name) {
        const presets = this.getPresets();
        const preset = presets[name];
        
        if (!preset) {
            console.warn(`Mapping preset not found: ${name}`);
            return false;
        }
        
        this.gridSize = { ...preset.gridSize };
        this.controlPoints = JSON.parse(JSON.stringify(preset.controlPoints));
        
        console.log(`Mapping preset loaded: ${name}`);
        
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
            console.log(`Mapping preset deleted: ${name}`);
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
                
                if (this.calibrating) {
                    this.drawOverlay();
                }
                
                console.log('Mapping imported successfully');
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
        
        console.log('MappingController destroyed');
    }
}

// Export for use in mobile-hydra.js
window.MappingController = MappingController;
