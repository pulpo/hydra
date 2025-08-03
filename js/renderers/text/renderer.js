window.hydra.renderers['text'] = {
    init: function(deck) {
        const defaults = {};
        const ui = {
            fieldsets: [
                {
                    heading: 'Text',
                    class: 'flex-grid',
                    attributes: 'data-columns="1"',
                    items: [
                        {
                            type: 'textarea',
                            variable: 'text'
                        }
                    ]
                },
                {
                    class: 'flex-grid',
                    attributes: 'data-columns="3"',
                    items: [
                        {
                            type: 'button',
                            label: 'Load',
                            variable: 'load',
                            options: ['Load'],
                            text: 'Load'
                        },
                        {
                            type: 'select',
                            label: 'Font',
                            variable: 'font',
                            options: [
                                { value: 'Arial', text: 'Arial', selected: true },
                                { value: 'Helvetica', text: 'Helvetica' },
                                { value: 'Times New Roman', text: 'Times New Roman' },
                                { value: 'Courier New', text: 'Courier New' },
                                { value: 'Georgia', text: 'Georgia' },
                                { value: 'Verdana', text: 'Verdana' },
                                { value: 'Impact', text: 'Impact' },
                                { value: 'Comic Sans MS', text: 'Comic Sans MS' },
                                { value: 'Trebuchet MS', text: 'Trebuchet MS' },
                                { value: 'Lucida Console', text: 'Lucida Console' },
                                { value: 'monospace', text: 'Monospace' },
                                { value: 'serif', text: 'Serif' },
                                { value: 'sans-serif', text: 'Sans-serif' },
                                { value: 'cursive', text: 'Cursive' },
                                { value: 'fantasy', text: 'Fantasy' }
                            ],
                            randomiseable: true
                        },
                        {
                            type: 'range',
                            label: 'Size',
                            variable: 'size',
                            min: 0,
                            max: 1200,
                            value: 30,
                            step: 1,
                            randomiseable: true
                        }
                    ]
                },
                {
                    class: 'flex-grid',
                    attributes: 'data-columns="2"',
                    items: [
                        {
                            type: 'color',
                            label: 'Color',
                            variable: 'color',
                            value: '#ff0000',
                            randomiseable: true
                        },
                        {
                            type: 'checkbox',
                            label: 'Stroke',
                            variable: 'stroke',
                            checked: false,
                            randomiseable: true
                        }
                    ]
                },
                {
                    class: 'flex-grid',
                    attributes: 'data-columns="2"',
                    items: [
                        {
                            type: 'range',
                            label: 'Offset X',
                            variable: 'offsetX',
                            min: 0,
                            max: 100,
                            value: 0,
                            step: 0.001,
                            randomiseable: true
                        },
                        {
                            type: 'range',
                            label: 'Offset Y',
                            variable: 'offsetY',
                            min: 0,
                            max: 100,
                            value: 0,
                            step: 0.001,
                            randomiseable: true
                        }
                    ]
                }
            ]
        };
        deck.text = window.hydra.renderer.init(deck, 'text', {defaults, ui});

        // Set default values
        deck.text.font = 'Arial';
        deck.text.text = 'HYDRA VJ';
        
        // Set default text in textarea if it exists
        if (deck.text.textInput) {
            deck.text.textInput.value = deck.text.text;
        }

        // Add font change listener for preview
        if (deck.text.fontInput) {
            deck.text.fontInput.addEventListener('change', function(e) {
                deck.text.font = e.target.value;
                // Update font preview in the dropdown if possible
                updateFontPreview();
            });
        }

        function updateFontPreview() {
            // Add font preview styling to the select element
            if (deck.text.fontInput && deck.text.font) {
                deck.text.fontInput.style.fontFamily = `"${deck.text.font}", Arial, sans-serif`;
            }
        }

        // Initial font preview
        updateFontPreview();

        deck.text.loadInput.addEventListener('click', function(e) {
            // Change button text to show loading
            const originalText = deck.text.loadInput.textContent;
            deck.text.loadInput.textContent = 'Loading...';
            deck.text.loadInput.disabled = true;
            
            loadLocalFonts().finally(() => {
                // Restore button
                deck.text.loadInput.textContent = originalText;
                deck.text.loadInput.disabled = false;
            });
        });

        async function loadLocalFonts() {
            try {
                // Check if Local Font Access API is available
                if (!('queryLocalFonts' in window)) {
                    alert('Local Font Access API is not supported in this browser.\nUsing web-safe fonts only.');
                    return;
                }

                // Request permission and load fonts
                const permission = await navigator.permissions.query({name: 'local-fonts'});
                
                if (permission.state === 'denied') {
                    alert('Font access permission denied.\nUsing web-safe fonts only.');
                    return;
                }

                // Clear existing options except web-safe fonts
                const webSafeFonts = [
                    'Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Georgia', 
                    'Verdana', 'Impact', 'Comic Sans MS', 'Trebuchet MS', 'Lucida Console',
                    'monospace', 'serif', 'sans-serif', 'cursive', 'fantasy'
                ];
                
                // Remove all options
                deck.text.fontInput.innerHTML = '';
                
                // Re-add web-safe fonts
                webSafeFonts.forEach(fontName => {
                    deck.text.fontInput.add(new Option(fontName, fontName));
                });

                // Load local fonts
                deck.text.fonts = await queryLocalFonts();
                
                if (deck.text.fonts && deck.text.fonts.length > 0) {
                    // Add separator
                    const separator = new Option('--- Local Fonts ---', '', false, false);
                    separator.disabled = true;
                    deck.text.fontInput.add(separator);

                    // Add local fonts (remove duplicates)
                    const addedFonts = new Set(webSafeFonts);
                    
                    deck.text.fonts.forEach(font => {
                        if (!addedFonts.has(font.fullName)) {
                            deck.text.fontInput.add(new Option(font.fullName, font.fullName));
                            addedFonts.add(font.fullName);
                        }
                    });
                    
                    alert(`Loaded ${deck.text.fonts.length} local fonts!`);
                } else {
                    alert('No local fonts found or access denied.');
                }
                
            } catch (error) {
                console.error('Error loading local fonts:', error);
                alert('Error loading local fonts: ' + error.message + '\nUsing web-safe fonts only.');
            }
        }

        deck.text.render = () => {
            if (deck.text.text) {
                try {
                    // Set font with fallbacks
                    const fontFamily = deck.text.font || 'Arial';
                    deck.ctx.font = `${deck.text.size}px "${fontFamily}", Arial, sans-serif`;

                    const x = (deck.canvas.width / 100) * deck.text.offsetX;
                    let y = ((deck.canvas.height / 100) * deck.text.offsetY) + deck.text.size;

                    // Calculate line height based on font size
                    const lineHeight = deck.text.size * 1.2;
                    const lines = deck.text.text.split("\n");

                    // Set text baseline for consistent positioning
                    deck.ctx.textBaseline = 'top';

                    if (deck.text.stroke) {
                        deck.ctx.strokeStyle = `rgb(${deck.text.color.r}, ${deck.text.color.g}, ${deck.text.color.b})`;
                        deck.ctx.lineWidth = Math.max(1, deck.text.size / 20); // Proportional stroke width

                        for (let i = 0; i < lines.length; i++) {
                            deck.ctx.strokeText(lines[i], x, y);
                            y += lineHeight;
                        }
                    } else {
                        deck.ctx.fillStyle = `rgb(${deck.text.color.r}, ${deck.text.color.g}, ${deck.text.color.b})`;

                        for (let i = 0; i < lines.length; i++) {
                            deck.ctx.fillText(lines[i], x, y);
                            y += lineHeight;
                        }
                    }
                } catch (error) {
                    console.error('Error rendering text:', error);
                    // Fallback rendering with basic font
                    deck.ctx.font = `${deck.text.size}px Arial`;
                    deck.ctx.fillStyle = `rgb(${deck.text.color.r}, ${deck.text.color.g}, ${deck.text.color.b})`;
                    deck.ctx.fillText(deck.text.text || 'Text Error', 10, 50);
                }
            }
        }

        return deck;
    }
};