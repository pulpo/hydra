#!/bin/bash

# Hydra Mobile Development Server
# Quick start script for testing the mobile interface

echo "🎵 Starting Hydra Mobile Development Server..."
echo ""
echo "📱 Mobile Interface: http://localhost:8000/mobile.html"
echo "🖥️  Desktop Interface: http://localhost:8000/index.html"
echo ""
echo "📱 Para móvil, abre http://localhost:8000/mobile.html en tu navegador"
echo "🎵 Permite acceso al micrófono para efectos de audio reactivos"
echo ""
echo "⚙️  Controles:"
echo "   • ⚙️ = Mostrar/ocultar controles"
echo "   • Swipe vertical = Control de crossfader"
echo "   • Doble tap = Mostrar info de efectos"
echo ""
echo "🐛 Debug:"
echo "   • Consola: debugHydra() para info completa"
echo "   • Setup modal: botón 'Show Debug Info'"
echo ""
echo "🛑 Presiona Ctrl+C para detener el servidor"
echo ""

# Start the HTTP server
python3 -m http.server 8000