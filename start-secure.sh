#!/bin/bash

echo "🎵 Hydra Secure VJ System"
echo "========================="
echo ""

# Check if certificates exist
if [ ! -f "server.key" ] || [ ! -f "server.cert" ]; then
    echo "⚠️  SSL certificates not found. Generating..."
    openssl req -nodes -new -x509 \
        -keyout server.key \
        -out server.cert \
        -days 365 \
        -subj "/C=US/ST=State/L=City/O=Hydra/CN=192.168.68.137"
    echo "✅ Certificates generated"
    echo ""
fi

# Kill any existing node processes on these ports
echo "🧹 Cleaning up existing processes..."
lsof -ti:8443 | xargs kill -9 2>/dev/null || true
lsof -ti:3030 | xargs kill -9 2>/dev/null || true
lsof -ti:3031 | xargs kill -9 2>/dev/null || true
sleep 1

# Start servers in background
echo "🚀 Starting servers..."
echo ""

# Start WebSocket server
node server-wss.js &
WS_PID=$!
echo "✅ WebSocket server started (PID: $WS_PID)"

# Wait a bit for WebSocket to initialize
sleep 2

# Start HTTPS server
node server-https.js &
HTTPS_PID=$!
echo "✅ HTTPS server started (PID: $HTTPS_PID)"

echo ""
echo "🎉 All servers running!"
echo ""
echo "📱 Access from your network:"
echo "   Mobile:  https://192.168.68.137:8443/mobile.html"
echo "   Control: https://192.168.68.137:8443/control.html"
echo ""
echo "💻 Access from localhost:"
echo "   Mobile:  http://localhost:8000/mobile.html"
echo "   Control: http://localhost:8000/control.html"
echo ""
echo "⚠️  IMPORTANT: Accept the security warning in your browser"
echo "   (the self-signed certificate is safe for local network use)"
echo ""
echo "Press Ctrl+C to stop all servers"

# Wait for Ctrl+C
trap "echo ''; echo '🛑 Stopping servers...'; kill $WS_PID $HTTPS_PID 2>/dev/null; echo '✅ Servers stopped'; exit 0" INT

# Keep script running
wait
