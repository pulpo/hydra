const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const WS_PORT = 8081;

// Create HTTP server for serving files
const server = http.createServer((req, res) => {
    let filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './index.html';
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.wav': 'audio/wav',
        '.mp4': 'video/mp4',
        '.woff': 'application/font-woff',
        '.ttf': 'application/font-ttf',
        '.eot': 'application/vnd.ms-fontobject',
        '.otf': 'application/font-otf',
        '.wasm': 'application/wasm'
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('404 Not Found', 'utf-8');
            } else {
                res.writeHead(500);
                res.end('Sorry, check with the site admin for error: ' + error.code + ' ..\n');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

// Create WebSocket server for streaming
const wss = new WebSocket.Server({ port: WS_PORT });

let streamingClients = new Set();
let broadcaster = null;

wss.on('connection', (ws, req) => {
    console.log('New WebSocket connection from:', req.socket.remoteAddress);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            if (data.type === 'broadcaster') {
                broadcaster = ws;
                console.log('Broadcaster connected');
                ws.send(JSON.stringify({ type: 'broadcaster-ready' }));
            } else if (data.type === 'viewer') {
                streamingClients.add(ws);
                console.log('Viewer connected. Total viewers:', streamingClients.size);
                ws.send(JSON.stringify({ type: 'viewer-ready' }));
            } else if (data.type === 'frame' && ws === broadcaster) {
                // Broadcast frame to all viewers (more efficiently)
                const frameMessage = JSON.stringify(data);
                const deadClients = [];
                
                streamingClients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        try {
                            client.send(frameMessage);
                        } catch (error) {
                            console.error('Error sending to client:', error);
                            deadClients.push(client);
                        }
                    } else {
                        deadClients.push(client);
                    }
                });
                
                // Clean up dead connections
                deadClients.forEach(client => {
                    streamingClients.delete(client);
                });
                
                if (deadClients.length > 0) {
                    console.log('Cleaned up', deadClients.length, 'dead connections. Active viewers:', streamingClients.size);
                }
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });

    ws.on('close', () => {
        if (ws === broadcaster) {
            broadcaster = null;
            console.log('Broadcaster disconnected');
            // Notify all viewers that stream ended
            streamingClients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'stream-ended' }));
                }
            });
        } else {
            streamingClients.delete(ws);
            console.log('Viewer disconnected. Total viewers:', streamingClients.size);
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

server.listen(PORT, () => {
    console.log(`HTTP Server running at http://localhost:${PORT}/`);
    console.log(`WebSocket Server running at ws://localhost:${WS_PORT}/`);
    console.log('');
    console.log('To access from other devices on your network:');
    console.log('1. Find your local IP address (usually 192.168.x.x or 10.x.x.x)');
    console.log('2. Open http://YOUR_IP:8080/ on other devices');
    console.log('3. Use the viewer page at http://YOUR_IP:8080/viewer.html');
});

console.log('Hydra Network Streaming Server');
console.log('==============================');