#!/bin/bash

echo "Hydra Network Streaming Server"
echo "=============================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed."
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "Error: npm is not installed."
    echo "Please install npm (usually comes with Node.js)"
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
    echo ""
fi

# Get local IP address
echo "Detecting network configuration..."
if command -v ip &> /dev/null; then
    LOCAL_IP=$(ip route get 1.1.1.1 | grep -oP 'src \K\S+' 2>/dev/null)
elif command -v ifconfig &> /dev/null; then
    LOCAL_IP=$(ifconfig | grep -Eo 'inet (addr:)?([0-9]*\.){3}[0-9]*' | grep -Eo '([0-9]*\.){3}[0-9]*' | grep -v '127.0.0.1' | head -1)
else
    LOCAL_IP="localhost"
fi

echo ""
echo "Starting Hydra with network streaming..."
echo ""
echo "Access URLs:"
echo "  Local:    http://localhost:8080/"
if [ "$LOCAL_IP" != "localhost" ]; then
    echo "  Network:  http://$LOCAL_IP:8080/"
    echo ""
    echo "For viewers on other devices:"
    echo "  Viewer:   http://$LOCAL_IP:8080/viewer.html"
fi
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start the server
node server.js