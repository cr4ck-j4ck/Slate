document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('holoboard');
    const previewCanvas = document.getElementById('preview-canvas');
    const ctx = canvas.getContext('2d');
    const previewCtx = previewCanvas.getContext('2d');
    const canvasContainer = document.querySelector('.canvas-container');
    const brushSizeSlider = document.getElementById('brush-size');
    const colorPicker = document.getElementById('color-picker');
    
    // State management
    const state = {
        isDrawing: false,
        isErasing: false,
        currentTool: 'brush',
        currentBrushType: 'normal',
        currentColor: colorPicker.value,
        brushSize: brushSizeSlider.value,
        lastX: 0,
        lastY: 0,
        undoStack: [],
        redoStack: [],
        shapeStart: null,
        maxStackSize: 50 // Limit stack size to prevent memory issues
    };

    // Add at the start of the file, after initial constants
    const CURSOR_PREVIEW_SIZE = 16; // Reduced from 24 to 16 for subtler cursor
    let lastFrameTime = 0;
    const FRAME_RATE = 1000 / 60; // 60fps for smooth animations

    // Add after state management
    let drawQueue = [];
    let animationFrameId = null;
    
    function processDrawQueue() {
        if (drawQueue.length === 0) {
            animationFrameId = null;
            return;
        }
        
        const currentTime = Date.now();
        if (currentTime - lastFrameTime >= FRAME_RATE) {
            const batchSize = Math.min(10, drawQueue.length);
            const points = drawQueue.splice(0, batchSize);
            
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }
            
            if (state.isErasing) {
                ctx.globalCompositeOperation = 'destination-out';
                ctx.strokeStyle = 'rgba(0,0,0,1)';
            } else {
                ctx.globalCompositeOperation = 'source-over';
                applyBrushEffect();
            }
            
            ctx.stroke();
            lastFrameTime = currentTime;
        }
        
        animationFrameId = requestAnimationFrame(processDrawQueue);
    }

    // Setup canvas
    function resizeCanvas() {
        const rect = canvasContainer.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        
        // Set display size
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
        
        // Set actual size in memory
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        
        // Setup preview canvas
        previewCanvas.width = previewCanvas.offsetWidth * dpr;
        previewCanvas.height = previewCanvas.offsetHeight * dpr;
        
        // Reset scale and restore canvas state
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        previewCtx.setTransform(1, 0, 0, 1, 0, 0);
        
        ctx.scale(dpr, dpr);
        previewCtx.scale(dpr, dpr);
        
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = state.currentColor;
        ctx.lineWidth = state.brushSize;
        
        updatePreview();
    }

    // Save canvas state for undo
    function saveState() {
        // Remove oldest state if stack is too large
        if (state.undoStack.length >= state.maxStackSize) {
            state.undoStack.shift();
        }
        state.undoStack.push(canvas.toDataURL());
        state.redoStack = []; // Clear redo stack when new action is performed
    }

    // Drawing functions
    function startDrawing(e) {
        e.preventDefault(); // Prevent scrolling on touch devices
        if (e.touches && e.touches.length > 1) return; // Ignore multi-touch

        const pos = getPointerPosition(e);
        if (state.currentTool === 'shapes') {
            state.shapeStart = pos;
            saveState();
        } else {
            state.isDrawing = true;
            [state.lastX, state.lastY] = [pos.x, pos.y];
            saveState();
        }
    }

    function getPointerPosition(e) {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
        const clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
        // Offset below matches the SVG pencil tip (3, 61) for perfect alignment
        return {
            x: (clientX - rect.left) * (canvas.width / rect.width) -56,
            y: (clientY - rect.top) * (canvas.height / rect.height) -20
        };
    }

    function draw(e) {
        e.preventDefault();
        if (e.touches && e.touches.length > 1) return;
        const pos = getPointerPosition(e);
        if (state.currentTool === 'shapes' && state.shapeStart) {
            if (!animationFrameId) {
                animationFrameId = requestAnimationFrame(() => {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    loadCanvasState(state.undoStack[state.undoStack.length - 1], false);
                    drawShape(state.shapeStart, pos);
                    animationFrameId = null;
                });
            }
        } else if (state.isDrawing) {
            // Always push both last and current position for smooth lines
            drawQueue.push({x: state.lastX, y: state.lastY});
            drawQueue.push(pos);
            [state.lastX, state.lastY] = [pos.x, pos.y];
            if (!animationFrameId) {
                animationFrameId = requestAnimationFrame(processDrawQueue);
            }
        }
        updatePreview();
    }

    function drawShape(start, end) {
        ctx.beginPath();
        const shapeType = document.querySelector('.shape-btn.active')?.dataset.shape || 'rectangle';
        
        switch(shapeType) {
            case 'rectangle':
                ctx.rect(start.x, start.y, end.x - start.x, end.y - start.y);
                break;
            case 'circle':
                const radius = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
                ctx.arc(start.x, start.y, radius, 0, Math.PI * 2);
                break;
            case 'line':
                ctx.moveTo(start.x, start.y);
                ctx.lineTo(end.x, end.y);
                break;
            case 'triangle':
                ctx.moveTo(start.x, start.y);
                ctx.lineTo(end.x, end.y);
                ctx.lineTo(start.x - (end.x - start.x), end.y);
                ctx.closePath();
                break;
        }
        
        ctx.stroke();
    }

    function stopDrawing(e) {
        if (state.currentTool === 'shapes' && state.shapeStart) {
            const pos = getPointerPosition(e);
            drawShape(state.shapeStart, pos);
            state.shapeStart = null;
        }
        state.isDrawing = false;
        ctx.globalCompositeOperation = 'source-over'; // Reset composite operation
        updatePreview();
    }

    function applyBrushEffect() {
        switch(state.currentBrushType) {
            case 'normal':
                ctx.strokeStyle = state.currentColor;
                ctx.shadowBlur = 0;
                break;
            case 'neon':
                ctx.strokeStyle = state.currentColor;
                ctx.shadowColor = state.currentColor;
                ctx.shadowBlur = 20;
                break;
            case 'rainbow':
                const hue = (Date.now() / 10) % 360;
                ctx.strokeStyle = `hsl(${hue}, 100%, 50%)`;
                ctx.shadowBlur = 0;
                break;
            case 'sparkle':
                ctx.strokeStyle = state.currentColor;
                if (Math.random() > 0.5) {
                    drawSparkle(state.lastX, state.lastY);
                }
                break;
        }
    }

    function drawSparkle(x, y) {
        const size = state.brushSize / 2;
        ctx.save();
        ctx.fillStyle = state.currentColor;
        ctx.shadowColor = state.currentColor;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function updatePreview() {
        try {
            const scale = previewCanvas.width / canvas.width;
            previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
            previewCtx.drawImage(canvas, 0, 0, previewCanvas.width, previewCanvas.height);
        } catch (error) {
            console.error('Preview update failed:', error);
        }
    }

    // Update event listeners
    const addEventListeners = () => {
        // Use pointer events for unified handling
        canvas.addEventListener('pointerdown', startDrawing);
        canvas.addEventListener('pointermove', draw);
        canvas.addEventListener('pointerup', stopDrawing);
        canvas.addEventListener('pointerout', stopDrawing);
        
        // Optimize tool button clicks
        const toolButtons = document.querySelectorAll('.tool-btn');
        const toolClickHandler = (e) => {
            document.querySelector('.tool-btn.active')?.classList.remove('active');
            e.currentTarget.classList.add('active');
            state.currentTool = e.currentTarget.dataset.tool;
            state.isErasing = state.currentTool === 'eraser';
            
            // Show/hide shape panel
            const shapePanel = document.querySelector('.shape-panel');
            shapePanel.hidden = state.currentTool !== 'shapes';
            
            requestAnimationFrame(() => updateCursor());
        };
        
        toolButtons.forEach(btn => {
            btn.addEventListener('click', toolClickHandler);
        });
        
        // Optimize brush size updates
        let brushSizeTimeout;
        brushSizeSlider.addEventListener('input', (e) => {
            state.brushSize = e.target.value;
            ctx.lineWidth = state.brushSize;
            
            // Debounce preview updates
            clearTimeout(brushSizeTimeout);
            brushSizeTimeout = setTimeout(() => {
                const preview = document.querySelector('.size-preview');
                preview.style.width = `${state.brushSize}px`;
                preview.style.height = `${state.brushSize}px`;
                updateCursor();
            }, 16); // ~60fps
        });
        
        // Optimize color picker updates
        let colorTimeout;
        colorPicker.addEventListener('input', (e) => {
            state.currentColor = e.target.value;
            
            // Debounce cursor updates
            clearTimeout(colorTimeout);
            colorTimeout = setTimeout(() => {
                if (!state.isErasing) {
                    updateCursor();
                }
            }, 16);
        });
        
        // Shape buttons
        document.querySelectorAll('.shape-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelector('.shape-btn.active')?.classList.remove('active');
                btn.classList.add('active');
            });
        });
        
        // Brush types
        document.querySelectorAll('.brush-option').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelector('.brush-option.active')?.classList.remove('active');
                btn.classList.add('active');
                state.currentBrushType = btn.dataset.brush;
            });
        });
        
        document.querySelectorAll('.color-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                const color = getComputedStyle(btn).getPropertyValue('--color').trim();
                state.currentColor = color;
                colorPicker.value = color;
                if (!state.isErasing) {
                    updateCursor();
                }
            });
        });
        
        // Action buttons
        document.getElementById('clear').addEventListener('click', () => {
            saveState();
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            updatePreview();
        });
        
        document.getElementById('undo').addEventListener('click', () => {
            if (state.undoStack.length > 0) {
                state.redoStack.push(canvas.toDataURL());
                const imgData = state.undoStack.pop();
                loadCanvasState(imgData);
            }
        });
        
        document.getElementById('redo').addEventListener('click', () => {
            if (state.redoStack.length > 0) {
                state.undoStack.push(canvas.toDataURL());
                const imgData = state.redoStack.pop();
                loadCanvasState(imgData);
            }
        });
        
        document.getElementById('save').addEventListener('click', () => {
            try {
                const link = document.createElement('a');
                link.download = 'holoboard-artwork.png';
                link.href = canvas.toDataURL();
                link.click();
            } catch (error) {
                console.error('Save failed:', error);
                alert('Failed to save the artwork. Please try again.');
            }
        });
        
        document.getElementById('export').addEventListener('click', exportData);
        document.getElementById('import').addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = importData;
            input.click();
        });
    };

    function loadCanvasState(imgData, updatePreviewAfter = true) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                try {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0);
                    if (updatePreviewAfter) {
                        updatePreview();
                    }
                    resolve();
                } catch (error) {
                    console.error('Failed to load canvas state:', error);
                    reject(error);
                }
            };
            img.onerror = reject;
            img.src = imgData;
        });
    }

    function exportData() {
        try {
            const data = {
                image: canvas.toDataURL(),
                timestamp: Date.now()
            };
            const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.download = 'holoboard-data.json';
            link.href = url;
            link.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Export failed:', error);
            alert('Failed to export the artwork. Please try again.');
        }
    }

    function importData(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    loadCanvasState(data.image);
                } catch (error) {
                    console.error('Error importing data:', error);
                    alert('Error importing file. Please make sure it\'s a valid HoloBoard file.');
                }
            };
            reader.onerror = (error) => {
                console.error('Error reading file:', error);
                alert('Error reading the file. Please try again.');
            };
            reader.readAsText(file);
        }
    }

    // Cursor SVG definition
    const PENCIL_CURSOR = `data:image/svg+xml;base64,${btoa(`<?xml version="1.0" encoding="utf-8"?>
<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 11.2071V12.5C3 12.7761 3.22386 13 3.5 13H4.79289C4.9255 13 5.05268 12.9473 5.14645 12.8536L11.6464 6.35355C12.0369 5.96303 12.0369 5.33696 11.6464 4.94644L10.5536 3.85355C10.163 3.46303 9.53696 3.46303 9.14645 3.85355L2.64645 10.3536C2.55268 10.4473 2.5 10.5745 2.5 10.7071Z" stroke="#00ff94" stroke-width="1"/>
</svg>`)}`;

    function updateCursor() {
        if (state.currentTool === 'shapes') {
            canvas.style.cursor = 'crosshair';
            return;
        }
        if (state.currentTool === 'brush' || state.currentTool === 'eraser') {
            // Set the cursor to the actual SVG file, with the tip as the hotspot (adjust as needed)
            canvas.style.cursor = 'url("pencil-svgrepo-com.svg") 2 28, crosshair';
        }
    }

    // Add toolbar toggle functionality
    function setupToolbarToggle() {
        const toolbar = document.querySelector('.toolbar');
        const canvasContainer = document.querySelector('.canvas-container');
        
        // Create toggle button
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'toolbar-toggle';
        toggleBtn.setAttribute('aria-label', 'Toggle Toolbar');
        document.body.appendChild(toggleBtn);
        
        toggleBtn.addEventListener('click', () => {
            toolbar.classList.toggle('collapsed');
            toggleBtn.classList.toggle('collapsed');
            canvasContainer.classList.toggle('full-width');
            
            // Trigger resize to ensure canvas adjusts properly
            window.dispatchEvent(new Event('resize'));
        });
        
        // Add keyboard shortcut (Alt + \)
        document.addEventListener('keydown', (e) => {
            if (e.altKey && e.key === '\\') {
                toggleBtn.click();
            }
        });
    }

    // Splash loader animation
    const splash = document.getElementById('splash-loader');
    const splashPath = document.getElementById('splash-curve');
    const splashPencil = document.getElementById('splash-pencil');
    if (splash && splashPath && splashPencil) {
        document.body.classList.add('splash-active');
        // Animate path drawing
        const pathLength = splashPath.getTotalLength();
        splashPath.style.strokeDasharray = pathLength;
        splashPath.style.strokeDashoffset = pathLength;
        splashPencil.style.visibility = 'hidden';

        let start = null;
        const pencilAnimationDuration = 3500; // 3.5 seconds for pencil to trace path
        const totalSplashDuration = 5500; // Total splash screen time remains 5.5 seconds

        function animateSplash(ts) {
            if (!start) start = ts;
            const elapsed = ts - start;

            const pencilProgress = Math.min(elapsed / pencilAnimationDuration, 1);
            splashPath.style.strokeDashoffset = pathLength * (1 - pencilProgress);
            
            const point = splashPath.getPointAtLength(pathLength * pencilProgress);
            // Aligning splash pencil tip with board pencil tip using offset (-56, -20)
            splashPencil.style.left = (splashPath.getBoundingClientRect().left + point.x - 56) + 'px';
            splashPencil.style.top = (splashPath.getBoundingClientRect().top + point.y - 20) + 'px';
            splashPencil.style.visibility = 'visible';

            if (pencilProgress < 1) {
                requestAnimationFrame(animateSplash);
            } else if (!splash.classList.contains('splash-hide')) {
                // Pencil animation finished, start shutter immediately
                splash.classList.add('splash-hide');
                document.body.classList.remove('splash-active');
                setTimeout(() => {
                    splash.style.display = 'none';
                }, 1000); // Shutter animation time (CSS transition)
            }
            // Keep requesting frames if totalSplashDuration is not met for other effects, remove if not needed.
            if(elapsed < totalSplashDuration && pencilProgress === 1){
                 requestAnimationFrame(animateSplash); // keep alive if splash needs to wait for other things
            }
        }
        requestAnimationFrame(animateSplash);
    }

    // Initialize
    try {
        resizeCanvas();
        addEventListeners();
        setupToolbarToggle();
        window.addEventListener('resize', resizeCanvas);
        updateCursor();
    } catch (error) {
        console.error('Initialization failed:', error);
        alert('Failed to initialize the application. Please refresh the page.');
    }
}); 