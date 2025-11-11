#!/usr/bin/env node

/**
 * Hydra Live Control WebSocket Server
 * Real-time communication for VJ performance
 */

const WebSocket = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');
const url = require('url');

// Configuration
const config = {
    port: 3030,
    staticPort: 8000,
    maxConnections: 10,
    heartbeatInterval: 30000
};

console.log('🎵 Starting Hydra Live Control Server...');

// WebSocket Server for real-time control
const wss = new WebSocket.Server({ 
    port: config.port,
    perMessageDeflate: false // Disable compression for lower latency
});

// Connected clients management
const clients = new Map();
let displayClients = new Set(); // Mobile displays
let controlClients = new Set(); // Control panels

// Message types for performance
const MessageTypes = {
    // Critical (< 10ms latency)
    CROSSFADER: 'crossfader',
    EMERGENCY: 'emergency',
    BEAT_SYNC: 'beat_sync',
    
    // Normal (< 100ms latency)
    PRESET: 'preset',
    VIDEO: 'video',
    EFFECT: 'effect',
    
    // Background (< 1s latency)
    SCENE: 'scene',
    CONFIG: 'config',
    FILE_UPLOAD: 'file_upload',
    
    // System
    REGISTER: 'register',
    HEARTBEAT: 'heartbeat',
    STATUS: 'status'
};

// Connection handler
wss.on('connection', (ws, req) => {
    const clientId = generateClientId();
    const clientInfo = {
        id: clientId,
        ws: ws,
        type: null, // 'display' or 'control'
        lastHeartbeat: Date.now(),
        ip: req.socket.remoteAddress
    };
    
    clients.set(clientId, clientInfo);
    console.log(`📱 Client connected: ${clientId} from ${clientInfo.ip}`);
    
    // Send welcome message
    ws.send(JSON.stringify({
        type: MessageTypes.STATUS,
        status: 'connected',
        clientId: clientId,
        timestamp: Date.now(),
        serverInfo: {
            connectedClients: clients.size,
            displayClients: displayClients.size,
            controlClients: controlClients.size
        }
    }));

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
            
            // Notify other clients
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

    // Error handler
    ws.on('error', (error) => {
        console.error(`❌ WebSocket error for ${clientId}:`, error);
    });
});

// Message handling
function handleMessage(clientId, message) {
    const client = clients.get(clientId);
    if (!client) return;

    // Add timestamp if not present
    if (!message.timestamp) {
        message.timestamp = Date.now();
    }

    console.log(`📨 ${clientId} (${client.type || 'unknown'}): ${message.type}`);

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
        case 'mic_sensitivity': // New case for mic_sensitivity
            // Forward control messages to displays
            broadcastToDisplays(message);
            break;

        case MessageTypes.STATUS:
            // Forward status updates to controls
            broadcastToControls(message);
            break;

        case 'preset_list': // New case for preset_list
            // Forward preset list to controls
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

    client.type = message.clientType; // 'display' or 'control'
    client.name = message.clientName || `Client ${clientId}`;

    if (message.clientType === 'display') {
        displayClients.add(clientId);
        console.log(`📺 Display registered: ${client.name}`);
    } else if (message.clientType === 'control') {
        controlClients.add(clientId);
        console.log(`🎛️  Control panel registered: ${client.name}`);
    }

    // Send updated client list to control panels
    broadcastToControls({
        type: MessageTypes.STATUS,
        action: 'client_registered',
        clientId: clientId,
        clientType: client.type,
        clientName: client.name,
        connectedClients: clients.size,
        displayClients: displayClients.size,
        controlClients: controlClients.size
    });

    // Send current state to new display clients
    if (message.clientType === 'display') {
        client.ws.send(JSON.stringify({
            type: MessageTypes.CONFIG,
            action: 'initial_state',
            // Add any initial state data here
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

function broadcastToAll(message) {
    const data = JSON.stringify(message);
    clients.forEach(client => {
        if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(data);
        }
    });
}

// Utility functions
function generateClientId() {
    return Math.random().toString(36).substr(2, 9);
}

// Heartbeat system to detect disconnected clients
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
        }
    });
}, config.heartbeatInterval);

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down Hydra Live Control Server...');
    
    // Close all connections
    clients.forEach(client => {
        client.ws.close(1000, 'Server shutting down');
    });
    
    wss.close(() => {
        console.log('✅ WebSocket server closed');
        process.exit(0);
    });
});

// Error handling
wss.on('error', (error) => {
    console.error('❌ WebSocket server error:', error);
});

console.log(`🎛️  WebSocket server running on ws://localhost:${config.port}`);
console.log(`📱 Connect your devices to start live control`);
console.log(`🔗 Control panel: http://localhost:${config.staticPort}/control.html`);
console.log(`📺 Mobile display: http://localhost:${config.staticPort}/mobile.html`);
console.log(`\n💡 Use Ctrl+C to stop the server\n`);

// Keep the process alive
process.stdin.resume();