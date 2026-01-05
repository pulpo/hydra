# TODO: Mapping Figures Mode

## Overview

Add a geometric figures drawing mode to `MappingController` that allows drawing 2D shapes (circles, rectangles) which automatically generate control points based on grid granularity. Shapes can coexist with the grid, segments can be enabled/disabled, and users can choose between mask or warp rendering modes.

---

## Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Mode system and data structures | **Done** |
| 2 | Interactive drawing (circle, rectangle) | **Done** |
| 3 | Automatic point generation | **Done** |
| 4 | Segment toggle (enable/disable) | **Done** |
| 5 | Mask rendering mode | Future |
| 6 | Warp rendering mode | Future |
| 7 | Preset integration | **Done** (basic) |
| 8 | UI controls in control.html | Future |

---

## Architecture

### New Properties in MappingController

```javascript
// Mode system
this.mode = 'grid';                     // 'grid' | 'shape'

// Shape management
this.shapes = [];                       // Array of shape objects
this.activeShapeIndex = -1;             // Currently selected shape (-1 = none)

// Drawing state
this.isDrawingShape = false;            // Currently drawing a new shape
this.drawingShapeType = null;           // 'circle' | 'rectangle' | null
this.drawingStart = null;               // {x, y} normalized start point
this.drawingCurrent = null;             // {x, y} normalized current point (for preview)
```

### Shape Object Structure

```javascript
{
  id: 'shape_1234567890',               // Unique identifier
  type: 'circle' | 'rectangle',
  
  // For circle:
  center: { x: 0.5, y: 0.5 },           // Normalized coordinates (0-1)
  radius: 0.2,                          // Normalized radius
  
  // For rectangle:
  topLeft: { x: 0.2, y: 0.2 },          // Normalized coordinates
  width: 0.4,                           // Normalized width
  height: 0.3,                          // Normalized height
  
  // Common properties:
  points: [                             // Auto-generated control points
    { x: 0.5, y: 0.3 },
    { x: 0.7, y: 0.5 },
    // ...
  ],
  segments: [true, true, false, ...],   // Enabled/disabled per segment
  renderMode: 'mask'                    // 'mask' | 'warp'
}
```

---

## Phase 1: Mode System and Data Structures

### New Methods

```javascript
/**
 * Set the current mode
 * @param {string} mode - 'grid' or 'shape'
 */
setMode(mode) {
    if (mode !== 'grid' && mode !== 'shape') return;
    this.mode = mode;
    this.drawingShapeType = null;
    this.isDrawingShape = false;
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
 * Add a shape to the shapes array
 * @param {Object} shape
 */
addShape(shape) {
    shape.id = shape.id || `shape_${Date.now()}`;
    this.shapes.push(shape);
    this.activeShapeIndex = this.shapes.length - 1;
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
 * Clear all shapes
 */
clearShapes() {
    this.shapes = [];
    this.activeShapeIndex = -1;
    if (this.calibrating) {
        this.drawOverlay();
    }
}
```

### Constructor Changes

Add to constructor after existing property initialization:

```javascript
// Shape mode properties
this.mode = 'grid';
this.shapes = [];
this.activeShapeIndex = -1;
this.isDrawingShape = false;
this.drawingShapeType = null;
this.drawingStart = null;
this.drawingCurrent = null;
```

---

## Phase 2: Interactive Drawing

### Drawing Flow

1. User selects shape type (circle/rectangle) via `setDrawingShapeType()`
2. `pointerdown` → Save start point, set `isDrawingShape = true`
3. `pointermove` → Update `drawingCurrent`, show preview
4. `pointerup` → Create shape from start + current, generate points, add to shapes

### Circle Drawing

- **Start point**: Center of circle
- **Current point**: Edge of circle (determines radius)
- **Preview**: Draw circle outline from center to cursor distance

### Rectangle Drawing

- **Start point**: One corner
- **Current point**: Opposite corner
- **Preview**: Draw rectangle outline

### Modified Event Handlers

```javascript
onPointerDown(e) {
    e.preventDefault();
    const rect = this.overlayCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Shape mode: start drawing if shape type is selected
    if (this.mode === 'shape' && this.drawingShapeType) {
        this.isDrawingShape = true;
        this.drawingStart = this.pixelsToNormalized(x, y, rect);
        this.drawingCurrent = this.drawingStart;
        this.overlayCanvas.setPointerCapture(e.pointerId);
        this.drawOverlay();
        return;
    }
    
    // Shape mode: check for segment toggle or shape selection
    if (this.mode === 'shape') {
        const segmentHit = this.hitTestShapeSegment(x, y, rect);
        if (segmentHit) {
            this.toggleShapeSegment(segmentHit.shapeIndex, segmentHit.segmentIndex);
            return;
        }
        // Could also handle shape selection here
    }
    
    // Grid mode: existing behavior...
    // [existing grid code]
}

onPointerMove(e) {
    // Shape drawing preview
    if (this.isDrawingShape && this.drawingShapeType) {
        e.preventDefault();
        const rect = this.overlayCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        this.drawingCurrent = this.pixelsToNormalized(x, y, rect);
        this.drawOverlay();
        return;
    }
    
    // Grid mode: existing behavior...
    // [existing grid code]
}

onPointerUp(e) {
    // Finalize shape drawing
    if (this.isDrawingShape && this.drawingShapeType) {
        this.finalizeShapeDrawing();
        this.overlayCanvas.releasePointerCapture(e.pointerId);
        return;
    }
    
    // Grid mode: existing behavior...
    // [existing grid code]
}

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
    // Keep drawingShapeType so user can draw another shape
}

createShapeFromDrawing() {
    const start = this.drawingStart;
    const current = this.drawingCurrent;
    
    if (this.drawingShapeType === 'circle') {
        const dx = current.x - start.x;
        const dy = current.y - start.y;
        const radius = Math.sqrt(dx * dx + dy * dy);
        
        if (radius < 0.01) return null; // Too small
        
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
        
        if (width < 0.01 || height < 0.01) return null; // Too small
        
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
```

---

## Phase 3: Automatic Point Generation

### Point Generation Based on Grid Granularity

The number of points generated is based on `gridSize`:
- **Circle**: `(gridSize.rows + gridSize.cols) * 2` points distributed evenly
- **Rectangle**: `gridSize.cols` points per horizontal side, `gridSize.rows` points per vertical side

```javascript
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
        const angle = (i / numPoints) * Math.PI * 2;
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
    const hPoints = this.gridSize.cols + 1; // Points on horizontal sides
    const vPoints = this.gridSize.rows + 1; // Points on vertical sides
    
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
```

---

## Phase 4: Segment Toggle

### Segment Toggle

Each segment is the line/arc between consecutive points. Clicking on a segment toggles its enabled/disabled state.

```javascript
/**
 * Toggle a segment's enabled state
 * @param {number} shapeIndex
 * @param {number} segmentIndex
 */
toggleShapeSegment(shapeIndex, segmentIndex) {
    if (shapeIndex < 0 || shapeIndex >= this.shapes.length) return;
    
    const shape = this.shapes[shapeIndex];
    if (segmentIndex < 0 || segmentIndex >= shape.segments.length) return;
    
    shape.segments[segmentIndex] = !shape.segments[segmentIndex];
    
    if (this.calibrating) {
        this.drawOverlay();
    }
}

/**
 * Hit test for shape segments
 * @param {number} x - Pixel x
 * @param {number} y - Pixel y
 * @param {DOMRect} rect
 * @returns {Object|null} { shapeIndex, segmentIndex } or null
 */
hitTestShapeSegment(x, y, rect) {
    const hitDistance = 15; // Pixels
    
    for (let si = 0; si < this.shapes.length; si++) {
        const shape = this.shapes[si];
        const points = shape.points;
        
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
 * Calculate distance from point to line segment
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
```

### Modified drawOverlay

Add shape drawing after grid drawing:

```javascript
drawOverlay() {
    // ... existing grid drawing code ...
    
    // Draw shapes
    this.drawShapes(ctx, rect);
    
    // Draw shape being drawn (preview)
    if (this.isDrawingShape && this.drawingStart && this.drawingCurrent) {
        this.drawShapePreview(ctx, rect);
    }
}

drawShapes(ctx, rect) {
    this.shapes.forEach((shape, shapeIndex) => {
        const isActive = shapeIndex === this.activeShapeIndex;
        this.drawShape(ctx, rect, shape, isActive);
    });
}

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
        } else {
            ctx.strokeStyle = 'rgba(255, 50, 50, 0.5)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
        }
        
        ctx.stroke();
        ctx.setLineDash([]);
    }
    
    // Draw control points
    points.forEach((point, i) => {
        const p = this.normalizedToPixels(point, rect);
        
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = isActive ? 'rgba(0, 255, 100, 1)' : 'rgba(0, 200, 255, 1)';
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();
    });
}

drawShapePreview(ctx, rect) {
    const start = this.normalizedToPixels(this.drawingStart, rect);
    const current = this.normalizedToPixels(this.drawingCurrent, rect);
    
    ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
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
        ctx.beginPath();
        ctx.arc(start.x, start.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 0, 1)';
        ctx.fill();
    } else if (this.drawingShapeType === 'rectangle') {
        const x = Math.min(start.x, current.x);
        const y = Math.min(start.y, current.y);
        const w = Math.abs(current.x - start.x);
        const h = Math.abs(current.y - start.y);
        
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.stroke();
    }
    
    ctx.setLineDash([]);
}
```

---

## Phase 5: Mask Rendering (Future)

Use WebGL stencil buffer or canvas clip path to mask content to shape area.

---

## Phase 6: Warp Rendering (Future)

Triangulate shape interior and map texture coordinates for warping.

---

## Phase 7: Preset Integration (Future)

Extend `savePreset()`, `loadPreset()`, `exportMapping()`, `importMapping()` to include shape data.

---

## Phase 8: UI Controls (Future)

Add controls to `control.html` for managing shapes from desktop interface.

---

## UI Elements (mobile.html)

### Mapping Toolbar Additions

```html
<!-- Add after grid-size selector -->
<div class="separator"></div>
<select id="mapping-mode" title="Mapping Mode">
    <option value="grid">Grid</option>
    <option value="shape">Shapes</option>
</select>
<select id="mapping-shape-type" class="hide" title="Shape Type">
    <option value="">Draw...</option>
    <option value="circle">Circle</option>
    <option value="rectangle">Rectangle</option>
</select>
<button id="mapping-clear-shapes" class="hide" title="Clear All Shapes">Clear</button>
```

### CSS Additions (mobile.css)

```css
#mapping-shape-type,
#mapping-clear-shapes {
    display: none;
}

.mapping-toolbar.shape-mode #mapping-shape-type,
.mapping-toolbar.shape-mode #mapping-clear-shapes {
    display: inline-block;
}

.mapping-toolbar.shape-mode #mapping-grid-size {
    display: none;
}
```

---

## Testing Checklist

### Phase 1
- [ ] `setMode('shape')` switches to shape mode
- [ ] `setMode('grid')` switches back to grid mode
- [ ] `getMode()` returns current mode
- [ ] `addShape()` adds shape to array
- [ ] `removeShape()` removes shape from array
- [ ] `selectShape()` updates activeShapeIndex

### Phase 2
- [ ] Setting `drawingShapeType` to 'circle' enables circle drawing
- [ ] Setting `drawingShapeType` to 'rectangle' enables rectangle drawing
- [ ] Click-drag creates circle from center outward
- [ ] Click-drag creates rectangle from corner to corner
- [ ] Preview shown while drawing
- [ ] Shape finalized on pointer up
- [ ] Touch events work on mobile devices

### Phase 3
- [ ] Circle points generated evenly around perimeter
- [ ] Rectangle points generated around edges
- [ ] Number of points scales with gridSize
- [ ] All segments initialized as enabled

### Phase 4
- [ ] Clicking segment toggles enabled/disabled
- [ ] Disabled segments shown with dashed line and red color
- [ ] Hit detection works for segments at various angles
- [ ] Multiple shapes can be toggled independently

---

## Files Modified

| File | Changes |
|------|---------|
| `js/mapping.js` | Add shape mode system, drawing, point generation, segment toggle |
| `mobile.html` | Add mode selector, shape type selector, clear button |
| `css/mobile.css` | Add styles for new UI elements |
| `js/mobile-hydra.js` | Wire up new UI controls to MappingController |

---

## Implementation Notes (2026-01-04)

### Completed Features

1. **Mode System**
   - `setMode('grid' | 'shape')` - Switch between modes
   - `getMode()` - Get current mode
   - Grid shown as faint reference in shape mode

2. **Shape Drawing**
   - Circle: Click center, drag to set radius
   - Rectangle: Click corner, drag to opposite corner
   - Visual preview while drawing (yellow dashed line)
   - Touch-friendly (tested on mobile)

3. **Point Generation**
   - Circle: `(gridSize.rows + gridSize.cols) * 2` points evenly distributed
   - Rectangle: Points along edges based on `gridSize.cols` (horizontal) and `gridSize.rows` (vertical)

4. **Segment Toggle**
   - Click/tap on segment to toggle enabled/disabled
   - Enabled: solid green/cyan line
   - Disabled: dashed red line

5. **UI Controls** (mobile.html)
   - Mode selector dropdown (Grid/Shapes)
   - Shape type selector (Circle/Rectangle)
   - Clear button (removes all shapes)
   - Conditional visibility based on mode

6. **Preset Integration**
   - Shapes saved/loaded with presets
   - Export/import includes shape data
   - Backward compatible with old presets

### How to Use

1. Open `mobile.html` in browser
2. Click 🎯 button to enable mapping
3. In toolbar, change "Grid" to "Shapes"
4. Select shape type (Circle or Rectangle)
5. Click and drag on canvas to draw shape
6. Click on segments to toggle them
7. Use Save to persist configuration

### Known Limitations

- No mask/warp rendering yet (shapes are visual only)
- Shape points can be dragged but don't update the original shape definition
- No undo functionality
