# 🎵 Hydra Mobile - VJ Interface

Una interfaz móvil simplificada para Hydra que permite mezclar **Butterchurn** (visualizaciones musicales) y **Video** de manera intuitiva en dispositivos móviles.

## 🚀 Cómo usar

### Acceso
Visita: `http://localhost:3001/mobile.html` (o el puerto que estés usando)

### Configuración inicial
1. **Micrófono**: Permite audio para que Butterchurn reaccione a la música
2. **Video**: Sube un archivo de video/GIF o usa una URL directa
3. **¡Empieza a mezclar!**

## 🎛️ Controles principales

### Butterchurn (Lado izquierdo)
- **🎵 Butterchurn**: Efectos visuales reactivos al audio
- **◀ ▶**: Navegar entre presets favoritos
- **🤍/❤️**: Añadir/quitar preset de favoritos
- **❤️/📋**: Alternar entre favoritos y todos los presets
- **🎲**: Preset aleatorio  
- **⏯️**: Modo automático (cambia preset cada 15s)
- **⚙️**: Gestor de presets favoritos

### Crossfader (Centro)
- **Slider vertical**: Mezcla entre Butterchurn y Video
- **Gesto**: Desliza verticalmente en la pantalla para controlar

### Video (Lado derecho)
- **🎬 Video**: Reproductor de video/GIF
- **Slots 1-3**: Hasta 3 videos cargados
- **📁**: Subir archivo
- **✨**: Panel de efectos
- **Speed**: Control de velocidad

## 📱 Gestos táctiles

- **Toque doble**: Mostrar/ocultar información en pantalla
- **Deslizar vertical**: Controlar crossfader
- **Botón ⚙️**: Mostrar/ocultar controles

## 🎬 Efectos de video

- **Invert**: Invertir colores
- **Flip**: Voltear horizontalmente  
- **Reverse**: Reproducir al revés
- **2x Speed**: Doble velocidad

## 🎵 Características de Butterchurn

- **Sistema de favoritos**: Crea tu lista personalizada de presets
- **Presets musicales**: 200+ visualizaciones incluidas
- **Gestión inteligente**: Solo muestra tus favoritos por defecto
- **Audio reactivo**: Responde a micrófono en vivo
- **WebGL optimizado**: Renderizado suave en móviles
- **Modo automático**: Cambios automáticos de preset
- **Persistencia**: Favoritos guardados en localStorage

## ❤️ Sistema de Favoritos

### Gestión de presets
- **Por defecto**: 10 presets populares preseleccionados
- **Personalización**: Añade/quita favoritos desde cualquier preset
- **Vista rápida**: Solo navega por tus favoritos durante performances
- **Backup**: Resetea a favoritos por defecto cuando necesites

### Cómo usar
1. **🤍 → ❤️**: Toca el corazón para añadir preset actual a favoritos
2. **❤️ → 📋**: Cambia entre vista de favoritos y todos los presets  
3. **⚙️ Gestor**: Abre el gestor completo para organizar
4. **🔄 Reset**: Vuelve a favoritos por defecto

### Ventajas
- **Performance fluido**: Solo presets que realmente usas
- **Menos navegación**: Encuentra rápido el preset perfecto
- **Personalización**: Adapta la interfaz a tu estilo
- **Respaldo automático**: Se guardan en el navegador

## 📂 Formatos soportados

### Video
- MP4, WebM, MOV
- URLs directas (YouTube, Vimeo, etc.)
- Streaming de video

### Audio
- Micrófono en vivo
- Audio del sistema (si es compatible)

### GIF
- Archivos GIF animados
- URLs de Giphy y similares

## 🔧 Configuración técnica

### Rendimiento
- Resolución adaptativa según dispositivo
- FPS limitado para ahorrar batería
- WebGL optimizado para móviles

### Compatibilidad
- Chrome/Safari móvil (recomendado)
- Firefox móvil (limitado)
- WebView en apps

### Permisos necesarios
- **Micrófono**: Para reactividad de Butterchurn
- **Archivos**: Para subir videos/GIFs

## 📋 Estructura de archivos

```
hydra/
├── mobile.html              # Interfaz móvil principal
├── css/mobile.css           # Estilos optimizados para móvil
├── js/mobile-hydra.js       # Lógica de la aplicación móvil
└── js/vendor/               # Librerías requeridas
    ├── butterchurn.js
    ├── butterchurnPresets.min.js
    ├── butterchurnPresetsExtra.min.js
    └── gif-parser.js
```

## 🎯 Casos de uso

### DJ/VJ en vivo
- Conecta micrófono al teléfono
- Carga videos de respaldo  
- Mezcla en tiempo real con gestos

### Streaming
- Visualizaciones musicales automáticas
- Overlay de videos personalizados
- Control simple durante stream

### Experimentos visuales
- Mezcla creativa de efectos
- Test rápido de combinaciones
- Prototyping de ideas
- Cura tu propia colección de presets

## 🐛 Solución de problemas

### Audio no funciona
- Verifica permisos de micrófono
- Prueba en HTTPS (requerido para audio)
- Reinicia el navegador

### Video no carga  
- Verifica formato soportado
- Prueba URL directa al archivo
- Revisa conexión de internet

### Rendimiento lento
- Cierra otras apps
- Reduce resolución del video
- Usa presets más simples

### Controles no responden
- Actualiza la página
- Verifica JavaScript habilitado
- Prueba en navegador diferente

## 🔄 Actualizaciones futuras

- [x] ❤️ Sistema de favoritos para presets
- [x] ⚙️ Gestor completo de presets  
- [ ] ☁️ Sincronización de favoritos en la nube
- [ ] 🎵 Importar/exportar listas de presets
- [ ] 🎬 Soporte para más formatos de video
- [ ] 🎛️ Efectos de audio en tiempo real  
- [ ] 📹 Grabación de sesiones
- [ ] 🔗 Sincronización multi-dispositivo
- [ ] 📱 Modo offline/PWA
- [ ] 🎹 MIDI controller support

## 📞 Soporte

Si encuentras problemas:
1. Revisa la consola del navegador (F12)
2. Verifica compatibilidad del dispositivo
3. Prueba en modo incógnito
4. Reporta el issue en GitHub

---

**🎵 ¡Disfruta mezclando con Hydra Mobile!** 

*Optimizado para experiencias VJ móviles fluidas*