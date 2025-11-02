window.hydra.renderers['video'] = {
    init: function(deck) {
        const defaults = {
            hasPlayed: false,
            invertState: false,
            flipState: false,
            flipInvertState: false
        };
        const ui = {
            fieldsets: [
                {
                    heading: 'Playback',
                    class: 'flex-grid',
                    attributes: 'data-columns="1"',
                    items: [
                        {
                            type: 'range',
                            label: 'Rate',
                            variable: 'playbackRate',
                            min: 0.25,
                            max: 10,
                            value: 1,
                            step: 0.25,
                            randomiseable: true
                        }
                    ]
                },
                {
                    heading: 'Effects',
                    class: 'flex-grid',
                    attributes: 'data-columns="4"',
                    items: [
                        {
                            type: 'button',
                            variable: 'reverse',
                            text: 'Reverse',
                            class: '',
                            options: ['Reverse'],
                        },
                        {
                            type: 'button',
                            variable: 'holdReverse',
                            text: 'Hold Reverse',
                            class: '',
                            options: ['Hold Reverse'],
                        },
                        {
                            type: 'button',
                            variable: 'invert',
                            text: 'Invert',
                            class: '',
                            options: ['Invert'],
                        },
                        {
                            type: 'button',
                            variable: 'holdInvert',
                            text: 'Hold Invert',
                            class: '',
                            options: ['Hold Invert'],
                        },
                    ]
                },
                {
                    class: 'flex-grid',
                    attributes: 'data-columns="4"',
                    items: [
                        {
                            type: 'button',
                            variable: 'flip',
                            text: 'Flip',
                            class: '',
                            options: ['Flip'],
                        },
                        {
                            type: 'button',
                            variable: 'holdFlip',
                            text: 'Hold Flip',
                            class: '',
                            options: ['Hold Flip'],
                        },
                        {
                            type: 'button',
                            variable: 'flipInvert',
                            text: 'Flip Invert',
                            class: '',
                            options: ['Flip Invert'],
                        },
                        {
                            type: 'button',
                            variable: 'holdFlipInvert',
                            text: 'Hold Flip Invert',
                            class: '',
                            options: ['Hold Flip Invert'],
                        }
                    ]
                },
                ...[1,2,3,4,5,6,7,8,9,10].map(n => ({
                    heading: `Video ${n}`,
                    class: 'flex-grid',
                    attributes: 'data-columns="2"',
                    items: [
                        {
                            type: 'file',
                            label: 'File',
                            variable: `file${n}`
                        },
                        {
                            type: 'textarea',
                            label: 'Direct URL',
                            variable: `directUrl${n}`,
                            containerClass: 'direct-url-input',
                            placeholder: 'https://example.com/video.mp4 or .gif'
                        },

                        {
                            type: 'button',
                            label: 'Play',
                            variable: `play${n}`,
                            options: ['Play'],
                            text: 'Play',
                            class: 'red',
                            disabled: true
                        }
                    ]
                }))
            ]
        };

        deck.video = window.hydra.renderer.init(deck, 'video', {defaults, ui});

        // Create thumbnail containers for each video slot after DOM is ready
        setTimeout(() => {
            for (let i = 1; i <= 10; i++) {
                const playButton = document.querySelector(`[data-deck="${deck.id}"][data-variable="play${i}"]`);
                if (playButton) {
                    const thumbnailContainer = document.createElement('div');
                    thumbnailContainer.className = 'video-thumbnail-container';
                    thumbnailContainer.innerHTML = `
                        <canvas class="video-thumbnail" width="120" height="68" data-deck="${deck.id}" data-video-slot="${i}"></canvas>
                        <div class="thumbnail-overlay">No preview</div>
                    `;
                    
                    // Insert thumbnail container after the play button's parent
                    const playButtonParent = playButton.parentElement;
                    if (playButtonParent) {
                        playButtonParent.appendChild(thumbnailContainer);
                    }
                }
            }
        }, 500); // Increased timeout to ensure DOM is ready

        // Thumbnail generation functions
        function generateVideoThumbnail(videoElement, thumbnailCanvas, callback) {
            const ctx = thumbnailCanvas.getContext('2d');
            const container = thumbnailCanvas.closest('.video-thumbnail-container');
            const overlay = container.querySelector('.thumbnail-overlay');
            
            // Set loading state
            container.classList.add('loading');
            container.classList.remove('has-preview', 'error');
            overlay.textContent = 'Loading...';
            
            // Wait for video metadata to load
            const onLoadedMetadata = () => {
                try {
                    const aspectRatio = videoElement.videoWidth / videoElement.videoHeight;
                    
                    // Calculate dimensions maintaining aspect ratio
                    let drawWidth = 120;
                    let drawHeight = 120 / aspectRatio;
                    
                    if (drawHeight > 68) {
                        drawHeight = 68;
                        drawWidth = 68 * aspectRatio;
                    }
                    
                    const x = (120 - drawWidth) / 2;
                    const y = (68 - drawHeight) / 2;
                    
                    // Clear canvas and draw thumbnail
                    ctx.clearRect(0, 0, 120, 68);
                    ctx.fillStyle = '#000';
                    ctx.fillRect(0, 0, 120, 68);
                    ctx.drawImage(videoElement, x, y, drawWidth, drawHeight);
                    
                    // Update container state
                    container.classList.remove('loading');
                    container.classList.add('has-preview');
                    
                    if (callback) callback();
                } catch (error) {
                    console.error('Error generating video thumbnail:', error);
                    container.classList.remove('loading');
                    container.classList.add('error');
                    overlay.textContent = 'Error loading';
                }
                
                videoElement.removeEventListener('loadedmetadata', onLoadedMetadata);
            };
            
            videoElement.addEventListener('loadedmetadata', onLoadedMetadata);
            
            // If metadata is already loaded
            if (videoElement.readyState >= 1) {
                onLoadedMetadata();
            }
        }
        
        function generateGifThumbnail(gifPlayer, thumbnailCanvas) {
            const ctx = thumbnailCanvas.getContext('2d');
            const container = thumbnailCanvas.closest('.video-thumbnail-container');
            const overlay = container.querySelector('.thumbnail-overlay');
            
            try {
                const firstFrameCanvas = gifPlayer.getCurrentCanvas();
                const aspectRatio = firstFrameCanvas.width / firstFrameCanvas.height;
                
                // Calculate dimensions maintaining aspect ratio
                let drawWidth = 120;
                let drawHeight = 120 / aspectRatio;
                
                if (drawHeight > 68) {
                    drawHeight = 68;
                    drawWidth = 68 * aspectRatio;
                }
                
                const x = (120 - drawWidth) / 2;
                const y = (68 - drawHeight) / 2;
                
                // Clear canvas and draw thumbnail
                ctx.clearRect(0, 0, 120, 68);
                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, 120, 68);
                ctx.drawImage(firstFrameCanvas, x, y, drawWidth, drawHeight);
                
                // Update container state
                container.classList.remove('loading', 'error');
                container.classList.add('has-preview');
                
            } catch (error) {
                console.error('Error generating GIF thumbnail:', error);
                container.classList.remove('loading');
                container.classList.add('error');
                overlay.textContent = 'Error loading';
            }
        }
        
        function generateThumbnailFromUrl(url, thumbnailCanvas, isGif = false) {
            if (!thumbnailCanvas) return;
            
            const container = thumbnailCanvas.closest('.video-thumbnail-container');
            if (!container) return;
            
            const overlay = container.querySelector('.thumbnail-overlay');
            const ctx = thumbnailCanvas.getContext('2d');
            
            // Set loading state
            container.classList.add('loading');
            container.classList.remove('has-preview', 'error');
            if (overlay) overlay.textContent = 'Loading...';
            
            // SIMPLIFIED APPROACH: Just try to load as image directly
            const img = new Image();
            
            // Try without crossOrigin first (works for most cases)
            img.onload = function() {
                try {
                    // Calculate dimensions
                    const aspectRatio = img.width / img.height;
                    let drawWidth = 120;
                    let drawHeight = 120 / aspectRatio;
                    
                    if (drawHeight > 68) {
                        drawHeight = 68;
                        drawWidth = 68 * aspectRatio;
                    }
                    
                    const x = (120 - drawWidth) / 2;
                    const y = (68 - drawHeight) / 2;
                    
                    // Clear and draw
                    ctx.clearRect(0, 0, 120, 68);
                    ctx.fillStyle = '#000';
                    ctx.fillRect(0, 0, 120, 68);
                    ctx.drawImage(img, x, y, drawWidth, drawHeight);
                    
                    // Success!
                    container.classList.remove('loading');
                    container.classList.add('has-preview');
                    
                } catch (error) {
                    console.warn('Canvas drawing failed:', error);
                    createPlaceholder();
                }
            };
            
            img.onerror = function() {
                console.warn('Image load failed, creating placeholder');
                createPlaceholder();
            };
            
            function createPlaceholder() {
                // Create a simple but informative placeholder
                ctx.clearRect(0, 0, 120, 68);
                
                if (isGif) {
                    // GIF placeholder
                    ctx.fillStyle = '#4a7c59';
                    ctx.fillRect(0, 0, 120, 68);
                    ctx.fillStyle = '#fff';
                    ctx.font = '10px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText('GIF', 60, 20);
                    ctx.fillText('READY', 60, 35);
                    ctx.fillText('Press Play', 60, 55);
                } else {
                    // Video placeholder
                    ctx.fillStyle = '#2d4a7c';
                    ctx.fillRect(0, 0, 120, 68);
                    
                    // Draw play button
                    ctx.fillStyle = '#fff';
                    ctx.beginPath();
                    ctx.moveTo(50, 24);
                    ctx.lineTo(70, 34);
                    ctx.lineTo(50, 44);
                    ctx.closePath();
                    ctx.fill();
                    
                    ctx.font = '8px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText('VIDEO READY', 60, 57);
                }
                
                container.classList.remove('loading');
                container.classList.add('has-preview');
            }
            
            // Start loading
            img.src = url;
            
            // Timeout fallback
            setTimeout(() => {
                if (container.classList.contains('loading')) {
                    createPlaceholder();
                }
            }, 5000);
        }
        
        function clearThumbnail(thumbnailCanvas) {
            const ctx = thumbnailCanvas.getContext('2d');
            const container = thumbnailCanvas.closest('.video-thumbnail-container');
            const overlay = container.querySelector('.thumbnail-overlay');
            
            ctx.clearRect(0, 0, 120, 68);
            container.classList.remove('loading', 'has-preview', 'error');
            overlay.textContent = 'No preview';
        }

        const fileInputs = [
            deck.video.file1Input,
            deck.video.file2Input,
            deck.video.file3Input,
            deck.video.file4Input,
            deck.video.file5Input,
            deck.video.file6Input,
            deck.video.file7Input,
            deck.video.file8Input,
            deck.video.file9Input,
            deck.video.file10Input,
        ];

        const directUrlInputs = [
            deck.video.directUrl1Input,
            deck.video.directUrl2Input,
            deck.video.directUrl3Input,
            deck.video.directUrl4Input,
            deck.video.directUrl5Input,
            deck.video.directUrl6Input,
            deck.video.directUrl7Input,
            deck.video.directUrl8Input,
            deck.video.directUrl9Input,
            deck.video.directUrl10Input,
        ];





        fileInputs.forEach((fileInput, index) => {
            fileInput.onchange = (e) => {
                if (fileInput.files && fileInput.files[0]) {
                    const file = fileInput.files[0];
                    const url = URL.createObjectURL(file);
                    const reader = new FileReader();

                    reader.onload = function() {
                        const playBtn = fileInput.closest('group').querySelector('button');
                        playBtn.className = 'orange';
                        playBtn.disabled = false;
                        playBtn.videoSource = { type: 'file', url: url };
                        
                        // Clear URL input when file is selected
                        const directUrlInput = directUrlInputs[index];
                        if (directUrlInput) {
                            directUrlInput.value = '';
                        }
                        
                        // Generate thumbnail for the uploaded file
                        const thumbnailCanvas = document.querySelector(`[data-deck="${deck.id}"][data-video-slot="${index + 1}"]`);
                        if (thumbnailCanvas) {
                            generateThumbnailFromUrl(url, thumbnailCanvas, false);
                        }
                    }
                    reader.readAsDataURL(file);
                }
            }
        });

        directUrlInputs.forEach((directUrlInput, index) => {
            if (directUrlInput) {
                directUrlInput.addEventListener('input', function(e) {
                    const url = e.target.value.trim();
                    if (url) {
                        // Basic URL validation
                        try {
                            new URL(url);
                            const isGif = url.toLowerCase().includes('.gif') || url.toLowerCase().includes('giphy.com');
                            const playBtn = directUrlInput.closest('group').querySelector('button');
                            playBtn.className = 'orange';
                            playBtn.disabled = false;
                            playBtn.videoSource = { type: 'direct', url: url, isGif: isGif };
                            
                            // Clear file input when direct URL is entered
                            const fileInput = fileInputs[index];
                            if (fileInput) {
                                fileInput.value = '';
                            }
                            
                        // Generate thumbnail for the URL with delay to ensure DOM is ready
                        setTimeout(() => {
                            const thumbnailCanvas = document.querySelector(`[data-deck="${deck.id}"][data-video-slot="${index + 1}"]`);
                            if (thumbnailCanvas) {
                                generateThumbnailFromUrl(url, thumbnailCanvas, isGif);
                            }
                        }, 600);
                        } catch {
                            const playBtn = directUrlInput.closest('group').querySelector('button');
                            playBtn.className = 'red';
                            playBtn.disabled = true;
                            playBtn.videoSource = null;
                            
                            // Clear thumbnail on invalid URL
                            const thumbnailCanvas = document.querySelector(`[data-deck="${deck.id}"][data-video-slot="${index + 1}"]`);
                            if (thumbnailCanvas) {
                                clearThumbnail(thumbnailCanvas);
                            }
                        }
                    } else {
                        const playBtn = directUrlInput.closest('group').querySelector('button');
                        playBtn.className = 'red';
                        playBtn.disabled = true;
                        playBtn.videoSource = null;
                        
                        // Clear thumbnail when URL is empty
                        const thumbnailCanvas = document.querySelector(`[data-deck="${deck.id}"][data-video-slot="${index + 1}"]`);
                        if (thumbnailCanvas) {
                            clearThumbnail(thumbnailCanvas);
                        }
                    }
                });
            }
        });



        // Add click handlers for play buttons
        const playButtons = document.querySelectorAll(`[data-deck="${deck.id}"][data-tab-panel="renderer"] button[data-variable^="play"]`);
        playButtons.forEach((playBtn, buttonIndex) => {
            playBtn.addEventListener('click', function(e) {
                const slotNumber = buttonIndex + 1;
                if (playBtn.videoSource) {
                    // Clear previous video sources
                    deck.videoEl.pause();
                    deck.videoEl.src = '';
                    if (deck.gifPlayer) {
                        deck.gifPlayer.stop();
                        deck.gifPlayer = null;
                    }
                    deck.currentVideoSource = null;
                    deck.gifImageLoaded = false;
                    
                    // Reset all play buttons
                    playButtons.forEach(btn => {
                        if (btn !== playBtn) {
                            btn.className = btn.videoSource ? 'orange' : 'red';
                        }
                    });
                    
                    playBtn.className = 'green';
                    
                    if (playBtn.videoSource.type === 'file') {
                        // Handle local file (including GIFs)
                        deck.videoEl.src = playBtn.videoSource.url;
                        deck.videoEl.play();
                        deck.videoEl.playbackRate = deck.video.playbackRate;
                        deck.currentVideoSource = 'file';
                    } else if (playBtn.videoSource.type === 'direct') {
                        if (playBtn.videoSource.isGif) {
                            // Handle GIF URL with custom GIF parser
                            deck.gifImageLoaded = false;
                            
                            // Stop any existing GIF player
                            if (deck.gifPlayer) {
                                deck.gifPlayer.stop();
                                deck.gifPlayer = null;
                            }
                            
                            // Parse and play GIF
                            const parser = new GIFParser();
                            parser.parseFromURL(playBtn.videoSource.url)
                                .then(gifData => {
                                    if (gifData.frames.length > 0) {
                                        deck.gifPlayer = new GIFPlayer(gifData);
                                        deck.gifPlayer.play();
                                        deck.gifImageLoaded = true;
                                        console.log(`Loaded GIF with ${gifData.frames.length} frames`);
                                        
                                        // Generate GIF thumbnail
                                        const thumbnailCanvas = document.querySelector(`[data-deck="${deck.id}"][data-video-slot="${slotNumber}"]`);
                                        if (thumbnailCanvas) {
                                            generateGifThumbnail(deck.gifPlayer, thumbnailCanvas);
                                        }
                                    } else {
                                        console.error('No frames found in GIF');
                                        deck.gifImageLoaded = false;
                                    }
                                })
                                .catch(error => {
                                    console.error('Failed to parse GIF:', error);
                                    deck.gifImageLoaded = false;
                                });
                            
                            deck.currentVideoSource = 'gif';
                        } else {
                            // Handle direct video URL
                            deck.videoEl.src = playBtn.videoSource.url;
                            deck.videoEl.play();
                            deck.videoEl.playbackRate = deck.video.playbackRate;
                            deck.currentVideoSource = 'file';
                        }
                    }
                    
                    stopReversePlayback();
                    deck.video.hasPlayed = true;
                }
            });
        });

        deck.video.playbackRateInput.addEventListener('input', function(e) {
            deck.videoEl.playbackRate = this.value;
        });

        deck.video.playbackRateInput.closest('.inline-input').insertAdjacentHTML('afterend', `<div class="inline-input">
            <span class="input-label">Elapsed Time</span><span class="value" data-deck="${deck.id}" data-visual="video" data-time-current>-</span>
        </div>
        <div class="inline-input">
            <span class="input-label">Duration</span><span class="value" data-deck="${deck.id}" data-visual="video" data-time-duration>-</span>
        </div>`);

        const timeDisplayCurrent = document.querySelector(`[data-deck="${deck.id}"][data-visual="video"][data-time-current]`);
        const timeDisplayDuration = document.querySelector(`[data-deck="${deck.id}"][data-visual="video"][data-time-duration]`);

        deck.videoEl.addEventListener('timeupdate', () => {
            timeDisplayCurrent.textContent = deck.videoEl.currentTime.toFixed(2);
            timeDisplayDuration.textContent = deck.videoEl.duration.toFixed(2);
        }, true);

        // --- Reverse playback ---
        let reverseInterval = null;
        function startReversePlayback() {
            stopReversePlayback();
            deck.videoEl.pause();
            reverseInterval = setInterval(() => {
                if (deck.videoEl.currentTime > 0.033) {
                    deck.videoEl.currentTime -= 0.033;
                } else {
                    deck.videoEl.currentTime = deck.videoEl.duration;
                }
            }, 33);
            deck.video.reverseInput.className = 'green';
        }

        function stopReversePlayback() {
            if (reverseInterval) {
                clearInterval(reverseInterval);
                reverseInterval = null;
                deck.video.reverseInput.className = '';
            }
        }

        deck.video.reverseInput.addEventListener('click', () => {
            if (!deck.video.hasPlayed) return;

            if (reverseInterval) {
                stopReversePlayback();
                deck.videoEl.play();
                deck.videoEl.playbackRate = deck.video.playbackRate;
            } else {
                startReversePlayback();
            }
        });

        // --- Hold Reverse ---
        const holdBtn = deck.video.holdReverseInput;
        let holdReverseActive = false;
        let wasReversing = false;

        function startHoldReverse() {
            holdBtn.className = 'green';
            holdReverseActive = true;

            if (!deck.video.hasPlayed) return;

            if (reverseInterval) {
                wasReversing = true;
                stopReversePlayback();
                deck.videoEl.play();
                deck.videoEl.playbackRate = deck.video.playbackRate;
            } else {
                wasReversing = false;
                deck.videoEl.pause();
                startReversePlayback();
            }
        }

        function stopHoldReverse() {
            holdBtn.className = '';
            holdReverseActive = false;

            if (!deck.video.hasPlayed) return;

            if (wasReversing) {
                deck.videoEl.pause();
                startReversePlayback();
            } else {
                stopReversePlayback();
                deck.videoEl.play();
                deck.videoEl.playbackRate = deck.video.playbackRate;
            }
        }

        holdBtn.addEventListener('mousedown', startHoldReverse);
        holdBtn.addEventListener('touchstart', startHoldReverse);
        holdBtn.addEventListener('mouseup', stopHoldReverse);
        holdBtn.addEventListener('touchend', stopHoldReverse);

        // --- Invert ---
        const invertBtn = deck.video.invertInput;
        invertBtn.addEventListener('click', () => {
            deck.video.invertState = !deck.video.invertState;
            invertBtn.className = deck.video.invertState ? 'green' : '';
        });

        const holdInvertBtn = deck.video.holdInvertInput;
        let holdingInvert = false;
        let wasInverted = false;

        function startHoldInvert() {
            holdInvertBtn.className = 'green';
            holdingInvert = true;
            if (deck.video.invertState) {
                wasInverted = true;
                invertBtn.className = '';
            } else {
                wasInverted = false;
                invertBtn.className = 'green';
            }
        }

        function stopHoldInvert() {
            holdInvertBtn.className = '';
            holdingInvert = false;
            invertBtn.className = wasInverted ? 'green' : '';
        }

        holdInvertBtn.addEventListener('mousedown', startHoldInvert);
        holdInvertBtn.addEventListener('touchstart', startHoldInvert);
        holdInvertBtn.addEventListener('mouseup', stopHoldInvert);
        holdInvertBtn.addEventListener('touchend', stopHoldInvert);

        // --- Flip Horizontal ---
        const flipBtn = deck.video.flipInput;
        flipBtn.addEventListener('click', () => {
            deck.video.flipState = !deck.video.flipState;
            flipBtn.className = deck.video.flipState ? 'green' : '';
        });

        const holdFlipBtn = deck.video.holdFlipInput;
        let holdingFlip = false;
        let wasFlipped = false;

        function startHoldFlip() {
            holdFlipBtn.className = 'green';
            holdingFlip = true;
            if (deck.video.flipState) {
                wasFlipped = true;
                flipBtn.className = '';
            } else {
                wasFlipped = false;
                flipBtn.className = 'green';
            }
        }

        function stopHoldFlip() {
            holdFlipBtn.className = '';
            holdingFlip = false;
            deck.video.flipInput.className = wasFlipped ? 'green' : '';
        }

        holdFlipBtn.addEventListener('mousedown', startHoldFlip);
        holdFlipBtn.addEventListener('touchstart', startHoldFlip);
        holdFlipBtn.addEventListener('mouseup', stopHoldFlip);
        holdFlipBtn.addEventListener('touchend', stopHoldFlip);


        // --- Flip Invert Horizontal ---
        const flipInvertBtn = deck.video.flipInvertInput;
        flipInvertBtn.addEventListener('click', () => {
            deck.video.flipInvertState = !deck.video.flipInvertState;
            flipInvertBtn.className = deck.video.flipInvertState ? 'green' : '';
        });

        const holdFlipInvertBtn = deck.video.holdFlipInvertInput;
        let holdingFlipInvert = false;
        let wasFlippedInvert = false;

        function startHoldFlipInvert() {
            holdFlipInvertBtn.className = 'green';
            holdingFlipInvert = true;
            if (deck.video.flipInvertState) {
                wasFlippedInvert = true;
                flipInvertBtn.className = '';
            } else {
                wasFlippedInvert = false;
                flipInvertBtn.className = 'green';
            }
        }

        function stopHoldFlipInvert() {
            holdFlipInvertBtn.className = '';
            holdingFlipInvert = false;
            flipInvertBtn.className = wasFlippedInvert ? 'green' : '';
        }

        holdFlipInvertBtn.addEventListener('mousedown', startHoldFlipInvert);
        holdFlipInvertBtn.addEventListener('touchstart', startHoldFlipInvert);
        holdFlipInvertBtn.addEventListener('mouseup', stopHoldFlipInvert);
        holdFlipInvertBtn.addEventListener('touchend', stopHoldFlipInvert);

        // --- Main render ---
        deck.video.render = () => {
            if (deck.currentVideoSource === 'gif' && deck.gifImageLoaded && deck.gifPlayer) {
                const gifCanvas = deck.gifPlayer.getCurrentCanvas();
                const aspectRatio = gifCanvas.width / gifCanvas.height;
                const canvasAspectRatio = deck.canvas.width / deck.canvas.height;
                
                let drawWidth, drawHeight, drawX, drawY;
                
                if (aspectRatio > canvasAspectRatio) {
                    drawWidth = deck.canvas.width;
                    drawHeight = deck.canvas.width / aspectRatio;
                    drawX = 0;
                    drawY = (deck.canvas.height - drawHeight) / 2;
                } else {
                    drawWidth = deck.canvas.height * aspectRatio;
                    drawHeight = deck.canvas.height;
                    drawX = (deck.canvas.width - drawWidth) / 2;
                    drawY = 0;
                }
                
                let effectiveFlip = (deck.video.flipState ^ holdingFlip) ^ (deck.video.flipInvertState ^ holdingFlipInvert);
                let effectiveInvert = (deck.video.flipInvertState ^ holdingFlipInvert) ^ (deck.video.invertState ^ holdingInvert);
                
                deck.ctx.save();
                
                if (effectiveFlip) {
                    deck.ctx.scale(-1, 1);
                    deck.ctx.drawImage(gifCanvas, -drawX - drawWidth, drawY, drawWidth, drawHeight);
                } else {
                    deck.ctx.drawImage(gifCanvas, drawX, drawY, drawWidth, drawHeight);
                }
                
                if (effectiveInvert) {
                    deck.ctx.globalCompositeOperation = 'difference';
                    deck.ctx.fillStyle = 'white';
                    deck.ctx.fillRect(0, 0, deck.canvas.width, deck.canvas.height);
                    deck.ctx.globalCompositeOperation = 'source-over';
                }
                
                deck.ctx.restore();
                
            } else if (deck.videoEl.src && deck.videoEl.videoWidth > 0) {
                const ratio = deck.canvas.width / deck.videoEl.videoWidth;

                let effectiveFlip = (deck.video.flipState ^ holdingFlip) ^ (deck.video.flipInvertState ^ holdingFlipInvert);
                let effectiveInvert = (deck.video.flipInvertState ^ holdingFlipInvert) ^ (deck.video.invertState ^ holdingInvert);

                deck.ctx.save();

                if (effectiveFlip) {
                    deck.ctx.scale(-1, 1);
                    deck.ctx.drawImage(deck.videoEl, -deck.canvas.width, 0, deck.videoEl.videoWidth * ratio, deck.videoEl.videoHeight * ratio);
                } else {
                    deck.ctx.drawImage(deck.videoEl, 0, 0, deck.videoEl.videoWidth * ratio, deck.videoEl.videoHeight * ratio);
                }

                deck.ctx.restore();

                if (effectiveInvert) {
                    deck.ctx.globalCompositeOperation = 'difference';
                    deck.ctx.fillStyle = 'white';
                    deck.ctx.fillRect(0, 0, deck.canvas.width, deck.canvas.height);
                    deck.ctx.globalCompositeOperation = 'source-over';
                }
            }
        };

        return deck;
    }
};