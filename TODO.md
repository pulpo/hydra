# Hydra Mobile - TODO

## Features Implementadas

### Mask Mode (Grid Shape Masking) - Enero 2026
- [x] Slider de resolución de grid expandido (2x2 hasta 10x10)
- [x] Toggle entre Warp Mode y Mask Mode (botón en toolbar)
- [x] En Mask Mode: mover puntos cambia el área visible sin distorsionar la textura
- [x] Persistencia del modo en presets y export/import
- [x] UI integrada con el toolbar de mapping existente

---

## Features Deseadas (Backlog)

### Viewport Lock Mode
**Descripción**: Cuando mueves los puntos de la máscara, la imagen se mantiene completamente fija en su posición - solo cambias la "ventana" por donde se ve. Como mover un marco sobre una foto estática.

**Caso de uso**: 
- Ajustar qué parte de la visualización se ve sin mover el contenido
- Útil para recortar bordes o enfocar en una zona específica del visual

**Diferencia con Mask Mode**:
- **Mask Mode**: La textura se mueve con la forma pero sin distorsionarse (traslación)
- **Viewport Lock**: La textura queda fija, solo cambia qué porción es visible (crop/window)

**Estado**: Pendiente - Requiere diseño de UX para definir cómo interactúa con el grid

---

### Formas Libres (Free-form Shapes)
**Descripción**: Poder dibujar formas arbitrarias (arcos, círculos, polígonos irregulares) independientes del grid rectangular.

**Caso de uso**:
- Crear máscaras de luz complejas
- Proyectar en superficies no rectangulares

**Estado**: Pendiente - Considerar como extensión del sistema de máscaras

---

## Notas de Desarrollo

- El sistema de mapping usa WebGL para renderizar la textura warpeada
- Los control points definen vértices del mesh
- Las coordenadas UV determinan qué parte de la textura se muestra en cada vértice
