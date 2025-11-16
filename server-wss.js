#!/usr/bin/env node

/**
 * Hydra Live Control WebSocket Server with SSL
 * Real-time communication for VJ performance
 */

const WebSocket = require('ws');
const https = require('https');
const fs = require('fs');

// Configuration
const config = {
    port: 3030,
    httpsPort: 3031,
    maxConnections: 10,
    heartbeatInterval: 30000
};

console.log('🎵 Starting Hydra Live Control Server with SSL...');

// Try to load SSL certificates
let httpsServer = null;
let wss = null;
let wssSecure = null;

try {
    const options = {
        key: fs.readFileSync('./server.key'),
        cert: fs.readFileSync('./server.cert')
    };
    
    // Create HTTPS server for WSS
    httpsServer = https.createServer(options, (req, res) => {
        // Serve a simple page to help accept the certificate
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
<!DOCTYPE html>
<html>
<head>
    <title>Hydra WSS Certificate</title>
    <style>
        body { font-family: monospace; max-width: 600px; margin: 50px auto; padding: 20px; }
        h1 { color: #4a9eff; }
        .success { color: #4caf50; font-size: 1.2em; margin: 20px 0; }
    </style>
</head>
<body>
    <h1>✅ Hydra WebSocket Server</h1>
    <p class="success">Certificate accepted successfully!</p>
    <p>The secure WebSocket server is running on port ${config.httpsPort}.</p>
    <p>You can now close this window and reload your control/mobile page.</p>
    <p><strong>Next step:</strong> Go back to your control page and refresh it.</p>
</body>
</html>
        `);
    });
    
    // WebSocket Server (non-secure) for localhost
    wss = new WebSocket.Server({ 
        port: config.port,
        perMessageDeflate: false
    });
    
    // WebSocket Server (secure) for network
    wssSecure = new WebSocket.Server({ 
        server: httpsServer,
        perMessageDeflate: false
    });
    
    httpsServer.listen(config.httpsPort, '0.0.0.0', () => {
        console.log(`🔒 WSS server running on wss://0.0.0.0:${config.httpsPort}`);
    });
    
    console.log(`🌐 WS server running on ws://localhost:${config.port}`);
    
} catch (error) {
    console.error('❌ Failed to start secure WebSocket server:', error.message);
    console.log('⚠️  Falling back to non-secure WebSocket only');
    
    wss = new WebSocket.Server({ 
        port: config.port,
        perMessageDeflate: false
    });
}

// Connected clients management
const clients = new Map();
let displayClients = new Set();
let controlClients = new Set();

// Message types
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

// Setup handlers for both servers
function setupWebSocketServer(server, serverName) {
    server.on('connection', (ws, req) => {
        const clientId = generateClientId();
        const clientInfo = {
            id: clientId,
            ws: ws,
            type: null,
            lastHeartbeat: Date.now(),
            ip: req.socket.remoteAddress,
            secure: serverName === 'WSS'
        };
        
        clients.set(clientId, clientInfo);
        console.log(`📱 Client connected via ${serverName}: ${clientId} from ${clientInfo.ip}`);
        console.log(`📊 Total: ${clients.size}, Displays: ${displayClients.size}, Controls: ${controlClients.size}`);
        
        // Send welcome message
        const welcomeMessage = {
            type: MessageTypes.STATUS,
            status: 'connected',
            clientId: clientId,
            timestamp: Date.now(),
            serverInfo: {
                connectedClients: clients.size,
                displayClients: displayClients.size,
                controlClients: controlClients.size
            }
        };
        ws.send(JSON.stringify(welcomeMessage));

        // Message handler
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data);
                handleMessage(clientId, message);
            } catch (error) {
                console.error(`❌ Invalid message from ${clientId}:`, error);
            }
        });

        // Connection close handler
        ws.on('close', () => {
            const client = clients.get(clientId);
            if (client) {
                if (client.type === 'display') {
                    displayClients.delete(clientId);
                } else if (client.type === 'control') {
                    controlClients.delete(clientId);
                }
                clients.delete(clientId);
                console.log(`📱 Client disconnected: ${clientId} (${client.type || 'unknown'})`);
                
                broadcastToControls({
                    type: MessageTypes.STATUS,
                    action: 'client_disconnected',
                    clientId: clientId,
                    connectedClients: clients.size,
                    displayClients: displayClients.size,
                    controlClients: controlClients.size
                });
            }
        });

        ws.on('error', (error) => {
            console.error(`❌ WebSocket error for ${clientId}:`, error);
        });
    });
}

// Setup both servers
setupWebSocketServer(wss, 'WS');
if (wssSecure) {
    setupWebSocketServer(wssSecure, 'WSS');
}

// Message handling
function handleMessage(clientId, message) {
    const client = clients.get(clientId);
    if (!client) return;

    if (!message.timestamp) {
        message.timestamp = Date.now();
    }

    // Don't log heartbeat messages to reduce console noise
    if (message.type !== MessageTypes.HEARTBEAT) {
        console.log(`📨 ${clientId} (${client.type || 'unknown'}): ${message.type}`);
    }

    switch (message.type) {
        case MessageTypes.REGISTER:
            handleClientRegistration(clientId, message);
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
        case 'blend_mode':
            broadcastToDisplays(message);
            break;

        case MessageTypes.STATUS:
            broadcastToControls(message);
            break;

        case 'preset_list':
            broadcastToControls(message);
            break;
        
        case 'video_slot_update':
            broadcastToControls(message);
            break;

        default:
            console.warn(`⚠️  Unknown message type: ${message.type}`);
    }
}

// Client registration
function handleClientRegistration(clientId, message) {
    const client = clients.get(clientId);
    if (!client) return;

    client.type = message.clientType;
    client.name = message.clientName || `Client ${clientId}`;

    if (message.clientType === 'display') {
        displayClients.add(clientId);
        console.log(`📺 Display registered: ${client.name}`);
    } else if (message.clientType === 'control') {
        controlClients.add(clientId);
        console.log(`🎛️  Control panel registered: ${client.name}`);
        
        // Request preset list from all displays when a new control connects
        broadcastToDisplays({
            type: MessageTypes.CONFIG,
            action: 'request_preset_list',
            timestamp: Date.now()
        });
    }

    const updateMessage = {
        type: MessageTypes.STATUS,
        action: 'client_registered',
        clientId: clientId,
        clientType: client.type,
        clientName: client.name,
        connectedClients: clients.size,
        displayClients: displayClients.size,
        controlClients: controlClients.size
    };
    broadcastToControls(updateMessage);

    if (message.clientType === 'display') {
        client.ws.send(JSON.stringify({
            type: MessageTypes.CONFIG,
            action: 'initial_state',
            timestamp: Date.now()
        }));
    }
}

// Broadcast functions
function broadcastToDisplays(message) {
    const data = JSON.stringify(message);
    displayClients.forEach(clientId => {
        const client = clients.get(clientId);
        if (client && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(data);
        }
    });
}

function broadcastToControls(message) {
    const data = JSON.stringify(message);
    controlClients.forEach(clientId => {
        const client = clients.get(clientId);
        if (client && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(data);
        }
    });
}

// Utility functions
function generateClientId() {
    return Math.random().toString(36).substr(2, 9);
}

// Heartbeat system
setInterval(() => {
    const now = Date.now();
    const timeoutThreshold = config.heartbeatInterval * 2;
    
    clients.forEach((client, clientId) => {
        if (now - client.lastHeartbeat > timeoutThreshold) {
            console.log(`💔 Client ${clientId} timed out`);
            client.ws.terminate();
            clients.delete(clientId);
            displayClients.delete(clientId);
            controlClients.delete(clientId);
            
            broadcastToControls({
                type: MessageTypes.STATUS,
                action: 'client_disconnected',
                clientId: clientId,
                connectedClients: clients.size,
                displayClients: displayClients.size,
                controlClients: controlClients.size
            });
        } else {
            if (client.ws.readyState === WebSocket.OPEN) {
                try {
                    client.ws.send(JSON.stringify({
                        type: MessageTypes.HEARTBEAT,
                        timestamp: now
                    }));
                } catch (error) {
                    console.error(`❌ Failed to send heartbeat to ${clientId}:`, error);
                }
            }
        }
    });
}, config.heartbeatInterval);

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down servers...');
    
    clients.forEach(client => {
        client.ws.close(1000, 'Server shutting down');
    });
    
    wss.close(() => {
        console.log('✅ WS server closed');
        if (wssSecure) {
            wssSecure.close(() => {
                console.log('✅ WSS server closed');
                process.exit(0);
            });
        } else {
            process.exit(0);
        }
    });
});

console.log(`\n📱 Access points:`);
console.log(`   Control (network): https://192.168.68.137:8443/control.html`);
console.log(`   Mobile (network): https://192.168.68.137:8443/mobile.html`);
console.log(`   Local: http://localhost:8000/mobile.html`);
console.log(`\n💡 Use Ctrl+C to stop the server\n`);

process.stdin.resume();
