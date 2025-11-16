#!/usr/bin/env node

/**
 * Hydra HTTPS Server
 * Enables microphone access from network devices
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const HTTP_PORT = 8000;
const HTTPS_PORT = 8443;

// MIME types
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

// Request handler
const requestHandler = (req, res) => {
    let filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './index.html';
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('404 Not Found', 'utf-8');
            } else {
                res.writeHead(500);
                res.end('Server error: ' + error.code, 'utf-8');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
};

// Create HTTP server (for redirect)
const httpServer = http.createServer((req, res) => {
    // Redirect HTTP to HTTPS
    const host = req.headers.host.split(':')[0];
    res.writeHead(301, { 'Location': `https://${host}:${HTTPS_PORT}${req.url}` });
    res.end();
});

// Create HTTPS server
let httpsServer;
try {
    const options = {
        key: fs.readFileSync('./server.key'),
        cert: fs.readFileSync('./server.cert')
    };
    
    httpsServer = https.createServer(options, requestHandler);
    
    httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
        console.log('🔒 Hydra HTTPS Server');
        console.log('=====================');
        console.log(`HTTPS Server: https://0.0.0.0:${HTTPS_PORT}/`);
        console.log(`HTTP Redirect: http://0.0.0.0:${HTTP_PORT}/ -> HTTPS`);
        console.log('');
        console.log('📱 Access from network:');
        console.log(`   Mobile: https://192.168.68.137:${HTTPS_PORT}/mobile.html`);
        console.log(`   Control: https://192.168.68.137:${HTTPS_PORT}/control.html`);
        console.log('');
        console.log('⚠️  WARNING: Your browser will show a security warning because');
        console.log('   this is a self-signed certificate. Click "Advanced" and');
        console.log('   "Proceed to site" to continue.');
        console.log('');
        console.log('🎤 Microphone access will now work on network devices!');
    });
    
    httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
        console.log(`HTTP redirect server running on port ${HTTP_PORT}`);
    });
    
} catch (error) {
    console.error('❌ Failed to start HTTPS server:', error.message);
    console.log('');
    console.log('⚠️  SSL certificates not found. Please run:');
    console.log('   openssl req -nodes -new -x509 -keyout server.key -out server.cert -days 365');
    process.exit(1);
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down servers...');
    httpsServer.close();
    httpServer.close();
    process.exit(0);
});
