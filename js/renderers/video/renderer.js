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
                    attributes: 'data-columns="4"',
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
                            type: 'textarea',
                            label: 'YouTube URL',
                            variable: `youtubeUrl${n}`,
                            containerClass: 'youtube-url-input',
                            placeholder: 'https://www.youtube.com/watch?v=...'
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

        const youtubeUrlInputs = [
            deck.video.youtubeUrl1Input,
            deck.video.youtubeUrl2Input,
            deck.video.youtubeUrl3Input,
            deck.video.youtubeUrl4Input,
            deck.video.youtubeUrl5Input,
            deck.video.youtubeUrl6Input,
            deck.video.youtubeUrl7Input,
            deck.video.youtubeUrl8Input,
            deck.video.youtubeUrl9Input,
            deck.video.youtubeUrl10Input,
        ];

        function extractYouTubeVideoId(url) {
            const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
            const match = url.match(regExp);
            return (match && match[2].length === 11) ? match[2] : null;
        }

        function createYouTubeEmbedUrl(videoId) {
            return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${videoId}&enablejsapi=1&origin=${window.location.origin}`;
        }

        function getYouTubeThumbnail(videoId) {
            return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        }

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
                        
                        // Clear URL inputs when file is selected
                        const youtubeInput = youtubeUrlInputs[index];
                        const directUrlInput = directUrlInputs[index];
                        if (youtubeInput) {
                            youtubeInput.value = '';
                        }
                        if (directUrlInput) {
                            directUrlInput.value = '';
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
                            
                            // Clear other inputs when direct URL is entered
                            const fileInput = fileInputs[index];
                            const youtubeInput = youtubeUrlInputs[index];
                            if (fileInput) {
                                fileInput.value = '';
                            }
                            if (youtubeInput) {
                                youtubeInput.value = '';
                            }
                        } catch {
                            const playBtn = directUrlInput.closest('group').querySelector('button');
                            playBtn.className = 'red';
                            playBtn.disabled = true;
                            playBtn.videoSource = null;
                        }
                    } else {
                        const playBtn = directUrlInput.closest('group').querySelector('button');
                        playBtn.className = 'red';
                        playBtn.disabled = true;
                        playBtn.videoSource = null;
                    }
                });
            }
        });

        youtubeUrlInputs.forEach((youtubeInput, index) => {
            if (youtubeInput) {
                youtubeInput.addEventListener('input', function(e) {
                    const url = e.target.value.trim();
                    if (url) {
                        const videoId = extractYouTubeVideoId(url);
                        if (videoId) {
                            const playBtn = youtubeInput.closest('group').querySelector('button');
                            playBtn.className = 'orange';
                            playBtn.disabled = false;
                            playBtn.videoSource = { type: 'youtube', videoId: videoId, originalUrl: url };
                            
                            // Clear other inputs when YouTube URL is entered
                            const fileInput = fileInputs[index];
                            const directUrlInput = directUrlInputs[index];
                            if (fileInput) {
                                fileInput.value = '';
                            }
                            if (directUrlInput) {
                                directUrlInput.value = '';
                            }
                        } else {
                            const playBtn = youtubeInput.closest('group').querySelector('button');
                            playBtn.className = 'red';
                            playBtn.disabled = true;
                            playBtn.videoSource = null;
                        }
                    } else {
                        const playBtn = youtubeInput.closest('group').querySelector('button');
                        playBtn.className = 'red';
                        playBtn.disabled = true;
                        playBtn.videoSource = null;
                    }
                });
            }
        });

        // Add click handlers for play buttons
        const playButtons = document.querySelectorAll(`[data-deck="${deck.id}"][data-tab-panel="renderer"] button[data-variable^="play"]`);
        playButtons.forEach(playBtn => {
            playBtn.addEventListener('click', function(e) {
                if (playBtn.videoSource) {
                    // Clear previous video sources
                    deck.videoEl.pause();
                    deck.videoEl.src = '';
                    if (deck.gifPlayer) {
                        deck.gifPlayer.stop();
                        deck.gifPlayer = null;
                    }
                    deck.currentVideoSource = null;
                    deck.currentYouTubeVideoId = null;
                    deck.youtubeThumbnailLoaded = false;
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
                    } else if (playBtn.videoSource.type === 'youtube') {
                        // Handle YouTube video
                        const embedUrl = createYouTubeEmbedUrl(playBtn.videoSource.videoId);
                        const thumbnailUrl = getYouTubeThumbnail(playBtn.videoSource.videoId);
                        
                        // Create iframe for YouTube video (hidden, for potential future use)
                        if (!deck.youtubeIframe) {
                            deck.youtubeIframe = document.createElement('iframe');
                            deck.youtubeIframe.style.display = 'none';
                            deck.youtubeIframe.allow = 'autoplay';
                            document.body.appendChild(deck.youtubeIframe);
                        }
                        
                        // Load thumbnail image for display
                        if (!deck.youtubeThumbnail) {
                            deck.youtubeThumbnail = new Image();
                            deck.youtubeThumbnail.crossOrigin = 'anonymous';
                        }
                        
                        deck.youtubeThumbnail.onload = () => {
                            deck.youtubeThumbnailLoaded = true;
                        };
                        
                        deck.youtubeThumbnail.onerror = () => {
                            deck.youtubeThumbnailLoaded = false;
                        };
                        
                        deck.youtubeThumbnail.src = thumbnailUrl;
                        deck.youtubeIframe.src = embedUrl;
                        deck.currentVideoSource = 'youtube';
                        deck.currentYouTubeVideoId = playBtn.videoSource.videoId;
                        deck.currentYouTubeUrl = playBtn.videoSource.originalUrl;
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
                
            } else if (deck.currentVideoSource === 'youtube' && deck.youtubeIframe) {
                deck.ctx.save();
                
                // Clear canvas
                deck.ctx.fillStyle = '#000';
                deck.ctx.fillRect(0, 0, deck.canvas.width, deck.canvas.height);
                
                // Draw YouTube thumbnail if loaded
                if (deck.youtubeThumbnailLoaded && deck.youtubeThumbnail) {
                    const aspectRatio = deck.youtubeThumbnail.width / deck.youtubeThumbnail.height;
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
                    
                    if (effectiveFlip) {
                        deck.ctx.scale(-1, 1);
                        deck.ctx.drawImage(deck.youtubeThumbnail, -drawX - drawWidth, drawY, drawWidth, drawHeight);
                    } else {
                        deck.ctx.drawImage(deck.youtubeThumbnail, drawX, drawY, drawWidth, drawHeight);
                    }
                    
                    if (effectiveInvert) {
                        deck.ctx.globalCompositeOperation = 'difference';
                        deck.ctx.fillStyle = 'white';
                        deck.ctx.fillRect(0, 0, deck.canvas.width, deck.canvas.height);
                        deck.ctx.globalCompositeOperation = 'source-over';
                    }
                    
                    // Draw YouTube logo overlay
                    deck.ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
                    deck.ctx.fillRect(deck.canvas.width - 80, 10, 70, 30);
                    deck.ctx.fillStyle = '#fff';
                    deck.ctx.font = '14px Arial';
                    deck.ctx.textAlign = 'center';
                    deck.ctx.fillText('YouTube', deck.canvas.width - 45, 30);
                    
                } else {
                    // Fallback placeholder
                    deck.ctx.fillStyle = '#ff0000';
                    deck.ctx.fillRect(deck.canvas.width/2 - 50, deck.canvas.height/2 - 25, 100, 50);
                    
                    // Draw play button triangle
                    deck.ctx.fillStyle = '#fff';
                    deck.ctx.beginPath();
                    deck.ctx.moveTo(deck.canvas.width/2 - 10, deck.canvas.height/2 - 10);
                    deck.ctx.lineTo(deck.canvas.width/2 + 10, deck.canvas.height/2);
                    deck.ctx.lineTo(deck.canvas.width/2 - 10, deck.canvas.height/2 + 10);
                    deck.ctx.closePath();
                    deck.ctx.fill();
                    
                    // Add text
                    deck.ctx.fillStyle = '#fff';
                    deck.ctx.font = '16px Arial';
                    deck.ctx.textAlign = 'center';
                    deck.ctx.fillText('YouTube Video', deck.canvas.width/2, deck.canvas.height/2 + 40);
                    deck.ctx.fillText(`ID: ${deck.currentYouTubeVideoId}`, deck.canvas.width/2, deck.canvas.height/2 + 60);
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