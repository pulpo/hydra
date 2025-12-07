const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;

// Create HTTP server for serving files
const server = http.createServer((req, res) => {
    // For WebSocket paths, only respond to non-upgrade HTTP requests
    const url = req.url.split('?')[0]; // Remove query params
    if (url === '/ws' || url === '/control') {
        // Check if this is an upgrade request - if so, ws library will handle it
        if (req.headers.upgrade && req.headers.upgrade.toLowerCase() === 'websocket') {
            // Don't respond - let the ws library handle this via the 'upgrade' event
            return;
        }
        // Regular HTTP GET to WebSocket endpoint
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('WebSocket endpoint. Connect using ws:// or wss:// protocol.\n');
        return;
    }
    
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

// Create WebSocket server for streaming - attached to HTTP server on /ws path
const wss = new WebSocket.Server({ 
    server: server,    // Attach to existing HTTP server
    path: '/ws'        // Listen on /ws path
});

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

// ============================================================================
// Remote Control WebSocket Server (for mobile display + control panel)
// ============================================================================

const controlWss = new WebSocket.Server({ 
    server: server,
    path: '/control'
});

// Control server state management
const controlClients = new Map();
let displayClients = new Set(); // Mobile displays
let controlPanelClients = new Set(); // Control panels

const MessageTypes = {
    CROSSFADER: 'crossfader',
    EMERGENCY: 'emergency',
    BEAT_SYNC: 'beat_sync',
    PRESET: 'preset',
    VIDEO: 'video',
    EFFECT: 'effect',
    SCENE: 'scene',
    CONFIG: 'config',
    FILE_UPLOAD: 'file_upload',
    REGISTER: 'register',
    HEARTBEAT: 'heartbeat',
    STATUS: 'status'
};

controlWss.on('connection', (ws, req) => {
    const clientId = Math.random().toString(36).substr(2, 9);
    const clientInfo = {
        id: clientId,
        ws: ws,
        type: null,
        lastHeartbeat: Date.now(),
        ip: req.socket.remoteAddress
    };
    
    controlClients.set(clientId, clientInfo);
    console.log(`📱 Control client connected: ${clientId} from ${clientInfo.ip}`);
    console.log(`📊 Control counts - Total: ${controlClients.size}, Displays: ${displayClients.size}, Controls: ${controlPanelClients.size}`);
    
    // Send welcome message
    ws.send(JSON.stringify({
        type: MessageTypes.STATUS,
        status: 'connected',
        clientId: clientId,
        timestamp: Date.now(),
        serverInfo: {
            connectedClients: controlClients.size,
            displayClients: displayClients.size,
            controlClients: controlPanelClients.size
        }
    }));
    
    // Message handler
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            handleControlMessage(clientId, message);
        } catch (error) {
            console.error(`❌ Invalid control message from ${clientId}:`, error);
        }
    });
    
    // Close handler
    ws.on('close', () => {
        const client = controlClients.get(clientId);
        if (client) {
            if (client.type === 'display') {
                displayClients.delete(clientId);
            } else if (client.type === 'control') {
                controlPanelClients.delete(clientId);
            }
            controlClients.delete(clientId);
            console.log(`📱 Control client disconnected: ${clientId} (${client.type || 'unknown'})`);
            
            // Notify other clients
            broadcastToControlPanels({
                type: MessageTypes.STATUS,
                action: 'client_disconnected',
                clientId: clientId,
                connectedClients: controlClients.size,
                displayClients: displayClients.size,
                controlClients: controlPanelClients.size
            });
        }
    });
    
    ws.on('error', (error) => {
        console.error(`❌ Control WebSocket error for ${clientId}:`, error);
    });
});

function handleControlMessage(clientId, message) {
    const client = controlClients.get(clientId);
    if (!client) return;
    
    if (!message.timestamp) {
        message.timestamp = Date.now();
    }
    
    console.log(`📨 Control ${clientId} (${client.type || 'unknown'}): ${message.type}`);
    
    switch (message.type) {
        case MessageTypes.REGISTER:
            client.type = message.clientType;
            client.name = message.clientName || `Client ${clientId}`;
            
            if (message.clientType === 'display') {
                displayClients.add(clientId);
                console.log(`📺 Display registered: ${client.name}`);
                // Send initial state to new display
                client.ws.send(JSON.stringify({
                    type: MessageTypes.CONFIG,
                    action: 'initial_state',
                    timestamp: Date.now()
                }));
            } else if (message.clientType === 'control') {
                controlPanelClients.add(clientId);
                console.log(`🎛️ Control panel registered: ${client.name}`);
            }
            
            // Broadcast registration update to all control panels
            broadcastToControlPanels({
                type: MessageTypes.STATUS,
                action: 'client_registered',
                clientId: clientId,
                clientType: client.type,
                clientName: client.name,
                connectedClients: controlClients.size,
                displayClients: displayClients.size,
                controlClients: controlPanelClients.size
            });
            break;
            
        case MessageTypes.HEARTBEAT:
            client.lastHeartbeat = Date.now();
            client.ws.send(JSON.stringify({
                type: MessageTypes.HEARTBEAT,
                timestamp: Date.now()
            }));
            break;
            
        case MessageTypes.CROSSFADER:
        case MessageTypes.PRESET:
        case MessageTypes.VIDEO:
        case MessageTypes.EFFECT:
        case MessageTypes.EMERGENCY:
        case MessageTypes.SCENE:
        case 'mic_sensitivity':
            // Forward control messages to displays
            broadcastToDisplays(message);
            break;
            
        case MessageTypes.STATUS:
        case 'preset_list':
            // Forward status updates to control panels
            broadcastToControlPanels(message);
            break;
            
        default:
            console.warn(`⚠️ Unknown control message type: ${message.type}`);
    }
}

function broadcastToDisplays(message) {
    const data = JSON.stringify(message);
    displayClients.forEach(clientId => {
        const client = controlClients.get(clientId);
        if (client && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(data);
        }
    });
}

function broadcastToControlPanels(message) {
    const data = JSON.stringify(message);
    controlPanelClients.forEach(clientId => {
        const client = controlClients.get(clientId);
        if (client && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(data);
        }
    });
}

// Heartbeat for control clients
setInterval(() => {
    const now = Date.now();
    const timeoutThreshold = 60000; // 60 seconds
    
    controlClients.forEach((client, clientId) => {
        if (now - client.lastHeartbeat > timeoutThreshold) {
            console.log(`💔 Control client ${clientId} timed out`);
            client.ws.terminate();
            controlClients.delete(clientId);
            displayClients.delete(clientId);
            controlPanelClients.delete(clientId);
        } else if (client.ws.readyState === WebSocket.OPEN) {
            try {
                client.ws.send(JSON.stringify({
                    type: MessageTypes.HEARTBEAT,
                    timestamp: now
                }));
            } catch (error) {
                console.error(`❌ Failed to send heartbeat to ${clientId}:`, error);
            }
        }
    });
}, 30000); // Every 30 seconds

server.listen(PORT, '0.0.0.0', () => {
    console.log(`HTTP Server running at http://0.0.0.0:${PORT}/`);
    console.log(`WebSocket Streaming at ws://0.0.0.0:${PORT}/ws`);
    console.log(`WebSocket Control at ws://0.0.0.0:${PORT}/control`);
    console.log('');
    
    if (process.env.NODE_ENV === 'production') {
        console.log('🎵 Hydra VJ Mixer - Production Mode');
        console.log('==================================');
        console.log('Main interface: http://localhost:' + PORT);
        console.log('Mobile display: http://localhost:' + PORT + '/mobile.html');
        console.log('Control panel: http://localhost:' + PORT + '/control.html');
        console.log('Viewer page: http://localhost:' + PORT + '/viewer.html');
        console.log('WebSocket streaming: ws://localhost:' + PORT + '/ws');
        console.log('WebSocket control: ws://localhost:' + PORT + '/control');
    } else {
        console.log('To access from other devices on your network:');
        console.log('1. Find your local IP address (usually 192.168.x.x or 10.x.x.x)');
        console.log('2. Open http://YOUR_IP:' + PORT + '/ on other devices');
        console.log('3. Mobile display: http://YOUR_IP:' + PORT + '/mobile.html');
        console.log('4. Control panel: http://YOUR_IP:' + PORT + '/control.html');
        console.log('5. Viewer page: http://YOUR_IP:' + PORT + '/viewer.html');
        console.log('6. WebSocket streaming: ws://YOUR_IP:' + PORT + '/ws');
        console.log('7. WebSocket control: ws://YOUR_IP:' + PORT + '/control');
    }
});

console.log('Hydra Network Streaming Server');
console.log('==============================');