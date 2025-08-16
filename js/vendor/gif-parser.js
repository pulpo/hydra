/**
 * Lightweight GIF Parser for extracting frames and timing information
 * Based on the GIF89a specification
 */
class GIFParser {
    constructor() {
        this.frames = [];
        this.globalColorTable = null;
        this.width = 0;
        this.height = 0;
        this.backgroundColorIndex = 0;
        this.pixelAspectRatio = 0;
    }

    async parseFromURL(url) {
        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            return this.parse(uint8Array);
        } catch (error) {
            console.error('Failed to fetch GIF:', error);
            throw error;
        }
    }

    parse(data) {
        this.data = data;
        this.pos = 0;
        this.frames = [];

        // Check GIF signature
        const signature = this.readString(6);
        if (signature !== 'GIF87a' && signature !== 'GIF89a') {
            throw new Error('Invalid GIF signature');
        }

        // Read logical screen descriptor
        this.width = this.readUint16();
        this.height = this.readUint16();
        
        const packed = this.readUint8();
        const globalColorTableFlag = (packed & 0x80) !== 0;
        const colorResolution = (packed & 0x70) >> 4;
        const sortFlag = (packed & 0x08) !== 0;
        const globalColorTableSize = 2 << (packed & 0x07);

        this.backgroundColorIndex = this.readUint8();
        this.pixelAspectRatio = this.readUint8();

        // Read global color table if present
        if (globalColorTableFlag) {
            this.globalColorTable = this.readColorTable(globalColorTableSize);
        }

        // Parse data stream
        while (this.pos < this.data.length) {
            const separator = this.readUint8();
            
            if (separator === 0x21) { // Extension
                this.parseExtension();
            } else if (separator === 0x2C) { // Image descriptor
                this.parseImage();
            } else if (separator === 0x3B) { // Trailer
                break;
            } else {
                // Skip unknown data
                this.pos++;
            }
        }

        return {
            width: this.width,
            height: this.height,
            frames: this.frames
        };
    }

    parseExtension() {
        const label = this.readUint8();
        
        if (label === 0xF9) { // Graphic Control Extension
            this.parseGraphicControlExtension();
        } else {
            // Skip other extensions
            this.skipDataSubBlocks();
        }
    }

    parseGraphicControlExtension() {
        const blockSize = this.readUint8();
        const packed = this.readUint8();
        
        const disposalMethod = (packed & 0x1C) >> 2;
        const userInputFlag = (packed & 0x02) !== 0;
        const transparentColorFlag = (packed & 0x01) !== 0;
        
        const delayTime = this.readUint16() * 10; // Convert to milliseconds
        const transparentColorIndex = this.readUint8();
        
        this.readUint8(); // Block terminator

        // Store for next frame
        this.nextFrameDelay = delayTime || 100; // Default 100ms if 0
        this.nextFrameDisposal = disposalMethod;
        this.nextFrameTransparent = transparentColorFlag ? transparentColorIndex : null;
    }

    parseImage() {
        const left = this.readUint16();
        const top = this.readUint16();
        const width = this.readUint16();
        const height = this.readUint16();
        
        const packed = this.readUint8();
        const localColorTableFlag = (packed & 0x80) !== 0;
        const interlaceFlag = (packed & 0x40) !== 0;
        const sortFlag = (packed & 0x20) !== 0;
        const localColorTableSize = localColorTableFlag ? 2 << (packed & 0x07) : 0;

        let colorTable = this.globalColorTable;
        if (localColorTableFlag) {
            colorTable = this.readColorTable(localColorTableSize);
        }

        // Read LZW minimum code size
        const lzwMinimumCodeSize = this.readUint8();
        
        // Read image data
        const imageData = this.readDataSubBlocks();
        
        // Decompress LZW data
        const pixels = this.decompressLZW(imageData, lzwMinimumCodeSize, width * height);
        
        // Create canvas for this frame
        const canvas = document.createElement('canvas');
        canvas.width = this.width;
        canvas.height = this.height;
        const ctx = canvas.getContext('2d');
        
        // Create image data
        const imgData = ctx.createImageData(width, height);
        const data = imgData.data;
        
        for (let i = 0; i < pixels.length; i++) {
            const colorIndex = pixels[i];
            const pixelIndex = i * 4;
            
            if (this.nextFrameTransparent !== null && colorIndex === this.nextFrameTransparent) {
                // Transparent pixel
                data[pixelIndex] = 0;     // R
                data[pixelIndex + 1] = 0; // G
                data[pixelIndex + 2] = 0; // B
                data[pixelIndex + 3] = 0; // A
            } else if (colorTable && colorIndex < colorTable.length) {
                const color = colorTable[colorIndex];
                data[pixelIndex] = color.r;     // R
                data[pixelIndex + 1] = color.g; // G
                data[pixelIndex + 2] = color.b; // B
                data[pixelIndex + 3] = 255;     // A
            }
        }
        
        // Draw to canvas
        ctx.putImageData(imgData, left, top);
        
        // Store frame
        this.frames.push({
            canvas: canvas,
            delay: this.nextFrameDelay || 100,
            disposal: this.nextFrameDisposal || 0,
            left: left,
            top: top,
            width: width,
            height: height
        });

        // Reset frame properties
        this.nextFrameDelay = 100;
        this.nextFrameDisposal = 0;
        this.nextFrameTransparent = null;
    }

    readColorTable(size) {
        const colors = [];
        for (let i = 0; i < size; i++) {
            colors.push({
                r: this.readUint8(),
                g: this.readUint8(),
                b: this.readUint8()
            });
        }
        return colors;
    }

    readDataSubBlocks() {
        const data = [];
        while (true) {
            const blockSize = this.readUint8();
            if (blockSize === 0) break;
            
            for (let i = 0; i < blockSize; i++) {
                data.push(this.readUint8());
            }
        }
        return new Uint8Array(data);
    }

    skipDataSubBlocks() {
        while (true) {
            const blockSize = this.readUint8();
            if (blockSize === 0) break;
            this.pos += blockSize;
        }
    }

    decompressLZW(data, minCodeSize, pixelCount) {
        const clearCode = 1 << minCodeSize;
        const endCode = clearCode + 1;
        let codeSize = minCodeSize + 1;
        let codeMask = (1 << codeSize) - 1;
        let nextCode = endCode + 1;
        
        const codeTable = [];
        const pixels = [];
        
        // Initialize code table
        for (let i = 0; i < clearCode; i++) {
            codeTable[i] = [i];
        }
        
        let bitBuffer = 0;
        let bitCount = 0;
        let dataIndex = 0;
        let prevCode = null;
        
        while (pixels.length < pixelCount && dataIndex < data.length) {
            // Read next code
            while (bitCount < codeSize && dataIndex < data.length) {
                bitBuffer |= data[dataIndex++] << bitCount;
                bitCount += 8;
            }
            
            if (bitCount < codeSize) break;
            
            const code = bitBuffer & codeMask;
            bitBuffer >>= codeSize;
            bitCount -= codeSize;
            
            if (code === clearCode) {
                // Reset
                codeSize = minCodeSize + 1;
                codeMask = (1 << codeSize) - 1;
                nextCode = endCode + 1;
                codeTable.length = clearCode + 2;
                prevCode = null;
                continue;
            }
            
            if (code === endCode) {
                break;
            }
            
            let sequence;
            if (code < codeTable.length) {
                sequence = codeTable[code];
            } else if (code === nextCode && prevCode !== null) {
                sequence = [...codeTable[prevCode], codeTable[prevCode][0]];
            } else {
                break; // Invalid code
            }
            
            pixels.push(...sequence);
            
            if (prevCode !== null && nextCode < 4096) {
                codeTable[nextCode++] = [...codeTable[prevCode], sequence[0]];
                
                if (nextCode === (1 << codeSize) && codeSize < 12) {
                    codeSize++;
                    codeMask = (1 << codeSize) - 1;
                }
            }
            
            prevCode = code;
        }
        
        return pixels.slice(0, pixelCount);
    }

    readUint8() {
        return this.data[this.pos++];
    }

    readUint16() {
        const value = this.data[this.pos] | (this.data[this.pos + 1] << 8);
        this.pos += 2;
        return value;
    }

    readString(length) {
        let str = '';
        for (let i = 0; i < length; i++) {
            str += String.fromCharCode(this.readUint8());
        }
        return str;
    }
}

// GIF Animation Player
class GIFPlayer {
    constructor(gifData) {
        this.frames = gifData.frames;
        this.width = gifData.width;
        this.height = gifData.height;
        this.currentFrame = 0;
        this.isPlaying = false;
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.ctx = this.canvas.getContext('2d');
        this.animationId = null;
        this.lastFrameTime = 0;
    }

    play() {
        if (this.isPlaying) return;
        this.isPlaying = true;
        this.lastFrameTime = performance.now();
        this.animate();
    }

    stop() {
        this.isPlaying = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    animate() {
        if (!this.isPlaying) return;

        const now = performance.now();
        const frame = this.frames[this.currentFrame];
        
        if (now - this.lastFrameTime >= frame.delay) {
            // Clear canvas based on disposal method
            if (frame.disposal === 2) {
                // Restore to background
                this.ctx.clearRect(0, 0, this.width, this.height);
            } else if (frame.disposal === 3) {
                // Restore to previous (not implemented - would need frame history)
                this.ctx.clearRect(0, 0, this.width, this.height);
            }
            
            // Draw current frame
            this.ctx.drawImage(frame.canvas, 0, 0);
            
            this.currentFrame = (this.currentFrame + 1) % this.frames.length;
            this.lastFrameTime = now;
        }

        this.animationId = requestAnimationFrame(() => this.animate());
    }

    getCurrentCanvas() {
        return this.canvas;
    }
}

// Export for use
window.GIFParser = GIFParser;
window.GIFPlayer = GIFPlayer;