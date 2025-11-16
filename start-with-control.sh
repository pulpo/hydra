#!/bin/bash

echo "🎵 Hydra VJ System"
echo "=================="
echo ""

# Kill existing processes
echo "🧹 Cleaning up..."
pkill -f "node server-ws.js" 2>/dev/null || true
pkill -f "python -m http.server" 2>/dev/null || true
sleep 1

# Start WebSocket server
echo "🚀 Starting WebSocket server..."
node server-ws.js &
WS_PID=$!
sleep 2

# Start HTTP server
echo "🚀 Starting HTTP server on all interfaces..."
python3 -m http.server 8000 --bind 0.0.0.0 &
HTTP_PID=$!

echo ""
echo "✅ Servers started!"
echo ""
echo "📱 Access points:"
echo "   Mobile (local):   http://localhost:8000/mobile.html"
echo "   Control (local):  http://localhost:8000/control.html"
echo "   Mobile (network): http://192.168.68.137:8000/mobile.html"
echo "   Control (network): http://192.168.68.137:8000/control.html"
echo ""
echo "⚠️  For microphone access from network devices:"
echo "   1. Use Chrome/Chromium browser"
echo "   2. Visit chrome://flags/#unsafely-treat-insecure-origin-as-secure"
echo "   3. Add: http://192.168.68.137:8000"
echo "   4. Restart browser"
echo ""
echo "Press Ctrl+C to stop"

trap "echo ''; echo '🛑 Stopping...'; kill $WS_PID $HTTP_PID 2>/dev/null; exit 0" INT
wait
