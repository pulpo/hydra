const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const WS_PORT = process.env.WS_PORT || 8082;

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
                ws.qualityMode = 'high'; // Default quality
                console.log('Broadcaster connected');
                ws.send(JSON.stringify({ type: 'broadcaster-ready' }));
            } else if (data.type === 'viewer') {
                streamingClients.add(ws);
                ws.preferredQuality = 'auto';
                ws.performanceScore = 100; // Start with good performance
                console.log('Viewer connected. Total viewers:', streamingClients.size);
                ws.send(JSON.stringify({ type: 'viewer-ready' }));
            } else if (data.type === 'performance-feedback') {
                // Adjust quality based on client performance
                if (data.averageFrameTime > 100) {
                    ws.performanceScore = Math.max(20, ws.performanceScore - 10);
                } else if (data.averageFrameTime < 30) {
                    ws.performanceScore = Math.min(100, ws.performanceScore + 5);
                }
                console.log(`Client performance: ${data.fps}fps, score: ${ws.performanceScore}`);
            } else if (data.type === 'quality-request') {
                ws.preferredQuality = data.requestedQuality;
                console.log('Client requested quality:', data.requestedQuality);
            } else if (data.type === 'frame' && ws === broadcaster) {
                // Optimize frame data before broadcasting
                const now = Date.now();
                const timeSinceLastFrame = now - (ws.lastFrameTime || 0);
                
                // Adaptive quality based on viewer count and network conditions
                let optimizedData = data;
                if (streamingClients.size > 3) {
                    // Reduce quality for multiple viewers
                    optimizedData.quality = Math.max(30, (data.quality || 80) - (streamingClients.size * 5));
                }
                
                // Skip frames if sending too fast (maintain ~30fps max)
                if (timeSinceLastFrame < 33) {
                    return;
                }
                ws.lastFrameTime = now;
                
                const frameMessage = JSON.stringify(optimizedData);
                const deadClients = [];
                
                streamingClients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        try {
                            // Use bufferedAmount to check if client is keeping up
                            if (client.bufferedAmount < 1024 * 1024) { // 1MB buffer limit
                                client.send(frameMessage);
                            } else {
                                console.log('Client buffer full, skipping frame');
                            }
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

server.listen(PORT, '0.0.0.0', () => {
    console.log(`HTTP Server running at http://0.0.0.0:${PORT}/`);
    console.log(`WebSocket Server running at ws://0.0.0.0:${WS_PORT}/`);
    console.log('');
    
    if (process.env.NODE_ENV === 'production') {
        console.log('🎵 Hydra VJ Mixer - Production Mode');
        console.log('==================================');
        console.log('Main interface: http://localhost:' + PORT);
        console.log('Viewer page: http://localhost:' + PORT + '/viewer.html');
    } else {
        console.log('To access from other devices on your network:');
        console.log('1. Find your local IP address (usually 192.168.x.x or 10.x.x.x)');
        console.log('2. Open http://YOUR_IP:' + PORT + '/ on other devices');
        console.log('3. Use the viewer page at http://YOUR_IP:' + PORT + '/viewer.html');
    }
});

console.log('Hydra Network Streaming Server');
console.log('==============================');