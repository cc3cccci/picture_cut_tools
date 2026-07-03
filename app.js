// Main application state
let currentImage = null;
let imageWidth = 0;
let imageHeight = 0;
let scale = 1;
let sourceFileName = 'split_images';
let cachedImgData = null; // Cache pixel data for instant real-time scanning
let gridSpacing = 0; // Spacing/gutter between grid cells in image pixels

// Crop boundaries (in image pixels)
let cropX1 = 0;
let cropY1 = 0;
let cropX2 = 0;
let cropY2 = 0;

// Grid ratios (values between 0 and 1, relative to the crop box width/height)
let rows = 3;
let cols = 3;
let hRatios = [];
let vRatios = [];

// Drag and drop / UI state
let hoveredElement = null;
let draggedElement = null;
let dragStartX = 0;
let dragStartY = 0;

// Constants for limits (in image pixels)
const MIN_GAP = 20; // Minimum gap between adjacent grid lines
const CORNER_RADIUS = 8; // Screen pixels for drawing corners
const HANDLE_HIT_RADIUS = 10; // Screen pixels for hit testing corners/edges
const LINE_HIT_THRESHOLD = 8; // Screen pixels for hit testing grid lines

// DOM elements
const fileInput = document.getElementById('file-input');
const uploadZone = document.getElementById('upload-zone');
const editorContainer = document.getElementById('editor-container');
const canvas = document.getElementById('editor-canvas');
const ctx = canvas.getContext('2d');
const previewsContainer = document.getElementById('previews-container');
const previewCountText = document.getElementById('preview-count');
const selectFormat = document.getElementById('select-format');
const rangeQuality = document.getElementById('range-quality');
const qualitySetting = document.getElementById('quality-setting');
const qualityValText = document.getElementById('quality-val');
const btnReset = document.getElementById('btn-reset');
const btnAutocrop = document.getElementById('btn-autocrop');
const autocropTolerance = document.getElementById('autocrop-tolerance');
const autocropTolVal = document.getElementById('autocrop-tol-val');
const autocropShrink = document.getElementById('autocrop-shrink');
const autocropShrinkVal = document.getElementById('autocrop-shrink-val');
const gridGutter = document.getElementById('grid-gutter');
const gridGutterVal = document.getElementById('grid-gutter-val');
const btnExportZip = document.getElementById('btn-export-zip');
const btnSaveLocal = document.getElementById('btn-save-local');
const btnReupload = document.getElementById('btn-reupload');
const previewModal = document.getElementById('preview-modal');
const modalImg = document.getElementById('modal-img');
const modalTitle = document.getElementById('modal-title');
const modalDim = document.getElementById('modal-dim');
const modalDownloadBtn = document.getElementById('modal-download-btn');
const customGridForm = document.getElementById('custom-grid-form');
const inputRows = document.getElementById('input-rows');
const inputCols = document.getElementById('input-cols');
const btnApplyCustom = document.getElementById('btn-apply-custom');
const btnCustomPreset = document.getElementById('btn-custom-preset');

// --- Initialization & Event Listeners ---

// Initialize default parameters
function init() {
    setupUploadHandlers();
    setupConfigHandlers();
    setupCanvasHandlers();
    setupExportHandlers();
    setupResizeHandler();
}

// Drag & drop upload handlers
function setupUploadHandlers() {
    // Drop zone styling triggers
    ['dragenter', 'dragover'].forEach(eventName => {
        uploadZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            uploadZone.classList.add('dragover');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        uploadZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            uploadZone.classList.remove('dragover');
        }, false);
    });

    uploadZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            handleImageFile(files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleImageFile(e.target.files[0]);
        }
    });

    btnReupload.addEventListener('click', () => {
        // Clear state
        currentImage = null;
        imageWidth = 0;
        imageHeight = 0;
        previewsContainer.innerHTML = '';
        previewCountText.innerText = '0';
        fileInput.value = '';
        
        // Toggle view
        editorContainer.classList.add('hidden');
        uploadZone.classList.remove('hidden');
        showToast('已重置，请重新上传图片。', 'info');
    });
}

// Process the uploaded image file
function handleImageFile(file) {
    if (!file.type.startsWith('image/')) {
        showToast('只支持上传图片文件！', 'error');
        return;
    }

    // Extract file name without extension
    if (file && file.name) {
        const lastDot = file.name.lastIndexOf('.');
        if (lastDot !== -1) {
            sourceFileName = file.name.substring(0, lastDot);
        } else {
            sourceFileName = file.name;
        }
    } else {
        sourceFileName = 'split_images';
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            currentImage = img;
            imageWidth = img.naturalWidth;
            imageHeight = img.naturalHeight;
            
            // Set initial crop box to full image dimensions
            cropX1 = 0;
            cropY1 = 0;
            cropX2 = imageWidth;
            cropY2 = imageHeight;

            // Cache pixel data for instant real-time scanning
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = imageWidth;
            tempCanvas.height = imageHeight;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(img, 0, 0);
            cachedImgData = tempCtx.getImageData(0, 0, imageWidth, imageHeight).data;
            
            // Preset values
            resetGridRatios();
            
            // Toggle view
            uploadZone.classList.add('hidden');
            editorContainer.classList.remove('hidden');
            
            // Recalculate layout and draw
            resizeCanvas();
            updatePreviews();
            showToast('图片加载成功！拖拽绿线或黄点可调整分图边界。', 'success');
        };
        img.onerror = () => {
            showToast('无法解析此图片。', 'error');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// Setup format settings & grid adjustments
function setupConfigHandlers() {
    // Preset buttons click
    document.querySelectorAll('.btn-preset').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const clickedBtn = e.currentTarget;
            document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
            clickedBtn.classList.add('active');

            if (clickedBtn.id === 'btn-custom-preset') {
                customGridForm.classList.remove('hidden');
            } else {
                customGridForm.classList.add('hidden');
                rows = parseInt(clickedBtn.getAttribute('data-rows'));
                cols = parseInt(clickedBtn.getAttribute('data-cols'));
                resetGridRatios();
                draw();
                updatePreviews();
                showToast(`已切换至 ${rows}×${cols} 网格`, 'info');
            }
        });
    });

    // Apply custom grid button
    btnApplyCustom.addEventListener('click', () => {
        const r = parseInt(inputRows.value);
        const c = parseInt(inputCols.value);
        if (isNaN(r) || r < 1 || r > 15 || isNaN(c) || c < 1 || c > 15) {
            showToast('请输入有效的行列数 (1 - 15)！', 'error');
            return;
        }
        rows = r;
        cols = c;
        resetGridRatios();
        draw();
        updatePreviews();
        showToast(`已应用自定义网格: ${rows} 行 × ${cols} 列`, 'success');
    });

    // Reset grid alignment
    btnReset.addEventListener('click', () => {
        cropX1 = 0;
        cropY1 = 0;
        cropX2 = imageWidth;
        cropY2 = imageHeight;
        resetGridRatios();
        draw();
        updatePreviews();
        showToast('已恢复默认均匀平分边界。', 'success');
    });

    // Auto crop borders (e.g. white or black background borders)
    btnAutocrop.addEventListener('click', () => {
        runAutoCrop(true); // Manually clicking button displays success toast feedback
    });

    // Autocrop sliders update DOM value & trigger real-time crop
    autocropTolerance.addEventListener('input', (e) => {
        autocropTolVal.innerText = e.target.value;
        runAutoCrop(false); // Real-time sliding recalculates silently to prevent spamming
    });

    autocropShrink.addEventListener('input', (e) => {
        autocropShrinkVal.innerText = e.target.value + ' px';
        runAutoCrop(false);
    });

    // Gutter spacing slider
    gridGutter.addEventListener('input', (e) => {
        gridSpacing = parseInt(e.target.value);
        gridGutterVal.innerText = gridSpacing + ' px';
        draw();
        updatePreviews();
    });

    // Image export format selector
    selectFormat.addEventListener('change', (e) => {
        const format = e.target.value;
        if (format === 'image/jpeg' || format === 'image/webp') {
            qualitySetting.style.display = 'block';
        } else {
            qualitySetting.style.display = 'none';
        }
        updatePreviews();
    });

    // Quality slider change
    rangeQuality.addEventListener('input', (e) => {
        qualityValText.innerText = e.target.value + '%';
    });
    rangeQuality.addEventListener('change', () => {
        updatePreviews();
    });
}

// Reset ratios to equal proportions
function resetGridRatios() {
    hRatios = [];
    vRatios = [];
    for (let i = 1; i < rows; i++) {
        hRatios.push(i / rows);
    }
    for (let i = 1; i < cols; i++) {
        vRatios.push(i / cols);
    }
}

// Setup Canvas size dynamically
function resizeCanvas() {
    if (!currentImage) return;
    
    const wrapper = canvas.parentElement;
    const maxWidth = wrapper.clientWidth - 16;
    const maxHeight = wrapper.clientHeight - 40; // reserve space for bottom tip
    
    // Scale factor to fit inside wrapper
    let scaleX = maxWidth / imageWidth;
    let scaleY = maxHeight / imageHeight;
    scale = Math.min(scaleX, scaleY);
    
    // Don't scale up smaller images past 1.5x to preserve crispness in editor
    if (scale > 1.5) scale = 1.5;
    
    canvas.width = imageWidth * scale;
    canvas.height = imageHeight * scale;
    
    draw();
}

function setupResizeHandler() {
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (currentImage) {
                resizeCanvas();
            }
        }, 100);
    });
}

// Minimum size calculations dynamically based on grid size
function getMinCropWidth() {
    return cols * MIN_GAP + 20;
}

function getMinCropHeight() {
    return rows * MIN_GAP + 20;
}

// --- Canvas Interactive Engine ---

function setupCanvasHandlers() {
    // Mouse hover detection
    canvas.addEventListener('mousemove', (e) => {
        if (!currentImage) return;
        
        // If dragging, process drag update
        if (draggedElement) {
            handleDrag(e);
            return;
        }

        // Get coordinates on canvas
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        // Hit-test interactive elements (priority: Corners -> Outer Borders -> Inner Lines)
        const hit = testHitTest(mx, my);
        hoveredElement = hit;

        // Change cursor style based on hovered target
        if (hit) {
            if (hit.type === 'corner') {
                if (hit.index === 0 || hit.index === 3) {
                    canvas.style.cursor = 'nwse-resize'; // TL, BR
                } else {
                    canvas.style.cursor = 'nesw-resize'; // TR, BL
                }
            } else if (hit.type === 'border') {
                canvas.style.cursor = (hit.name === 'top' || hit.name === 'bottom') ? 'ns-resize' : 'ew-resize';
            } else if (hit.type === 'h-inner') {
                canvas.style.cursor = 'ns-resize';
            } else if (hit.type === 'v-inner') {
                canvas.style.cursor = 'ew-resize';
            }
        } else {
            canvas.style.cursor = 'default';
        }
        
        // Highlight during hover
        draw();
    });

    // Start dragging
    canvas.addEventListener('mousedown', (e) => {
        if (!currentImage || e.button !== 0) return; // Only left click

        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        const hit = testHitTest(mx, my);
        if (hit) {
            draggedElement = hit;
            const imgMX = mx / scale;
            const imgMY = my / scale;
            dragStartX = imgMX;
            dragStartY = imgMY;
            
            // Record original values for delta calculations if needed
            draggedElement.startX = imgMX;
            draggedElement.startY = imgMY;
            
            if (hit.type === 'corner') {
                draggedElement.originalX1 = cropX1;
                draggedElement.originalY1 = cropY1;
                draggedElement.originalX2 = cropX2;
                draggedElement.originalY2 = cropY2;
            } else if (hit.type === 'border') {
                draggedElement.originalVal = 
                    hit.name === 'left' ? cropX1 :
                    hit.name === 'right' ? cropX2 :
                    hit.name === 'top' ? cropY1 : cropY2;
            } else if (hit.type === 'h-inner') {
                draggedElement.originalRatio = hRatios[hit.index - 1];
            } else if (hit.type === 'v-inner') {
                draggedElement.originalRatio = vRatios[hit.index - 1];
            }
        }
    });

    // Drag release
    const endDrag = () => {
        if (draggedElement) {
            draggedElement = null;
            updatePreviews();
            draw();
        }
    };
    canvas.addEventListener('mouseup', endDrag);
    canvas.addEventListener('mouseleave', endDrag);
}

// Convert coordinates to test interactive line & handles hits
function testHitTest(mx, my) {
    const cx1 = cropX1 * scale;
    const cy1 = cropY1 * scale;
    const cx2 = cropX2 * scale;
    const cy2 = cropY2 * scale;

    const canvasH = hRatios.map(r => (cropY1 + r * (cropY2 - cropY1)) * scale);
    const canvasV = vRatios.map(r => (cropX1 + r * (cropX2 - cropX1)) * scale);

    // 1. Check Corner Handles
    const corners = [
        { x: cx1, y: cy1 }, // Index 0: TL
        { x: cx2, y: cy1 }, // Index 1: TR
        { x: cx1, y: cy2 }, // Index 2: BL
        { x: cx2, y: cy2 }  // Index 3: BR
    ];

    for (let i = 0; i < corners.length; i++) {
        const dx = mx - corners[i].x;
        const dy = my - corners[i].y;
        if (Math.sqrt(dx * dx + dy * dy) <= HANDLE_HIT_RADIUS) {
            return { type: 'corner', index: i };
        }
    }

    // Helper: is mouse coordinate along a range
    const isBetween = (val, min, max, tolerance = 10) => val >= min - tolerance && val <= max + tolerance;

    // 2. Check Outer Borders
    // Top border
    if (Math.abs(my - cy1) <= HANDLE_HIT_RADIUS && isBetween(mx, cx1, cx2)) {
        return { type: 'border', name: 'top' };
    }
    // Bottom border
    if (Math.abs(my - cy2) <= HANDLE_HIT_RADIUS && isBetween(mx, cx1, cx2)) {
        return { type: 'border', name: 'bottom' };
    }
    // Left border
    if (Math.abs(mx - cx1) <= HANDLE_HIT_RADIUS && isBetween(my, cy1, cy2)) {
        return { type: 'border', name: 'left' };
    }
    // Right border
    if (Math.abs(mx - cx2) <= HANDLE_HIT_RADIUS && isBetween(my, cy1, cy2)) {
        return { type: 'border', name: 'right' };
    }

    // 3. Check Inner Splits
    // Horizontal splits
    for (let i = 0; i < canvasH.length; i++) {
        const cy = canvasH[i];
        if (Math.abs(my - cy) <= LINE_HIT_THRESHOLD && isBetween(mx, cx1, cx2)) {
            return { type: 'h-inner', index: i + 1 };
        }
    }
    // Vertical splits
    for (let i = 0; i < canvasV.length; i++) {
        const cx = canvasV[i];
        if (Math.abs(mx - cx) <= LINE_HIT_THRESHOLD && isBetween(my, cy1, cy2)) {
            return { type: 'v-inner', index: i + 1 };
        }
    }

    return null;
}

// Drag update computations
function handleDrag(e) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const imgMX = Math.max(0, Math.min(imageWidth, mx / scale));
    const imgMY = Math.max(0, Math.min(imageHeight, my / scale));

    const minW = getMinCropWidth();
    const minH = getMinCropHeight();

    if (draggedElement.type === 'corner') {
        const idx = draggedElement.index;
        
        if (idx === 0) { // TL
            cropX1 = Math.min(draggedElement.originalX2 - minW, imgMX);
            cropY1 = Math.min(draggedElement.originalY2 - minH, imgMY);
        } else if (idx === 1) { // TR
            cropX2 = Math.max(draggedElement.originalX1 + minW, imgMX);
            cropY1 = Math.min(draggedElement.originalY2 - minH, imgMY);
        } else if (idx === 2) { // BL
            cropX1 = Math.min(draggedElement.originalX2 - minW, imgMX);
            cropY2 = Math.max(draggedElement.originalY1 + minH, imgMY);
        } else if (idx === 3) { // BR
            cropX2 = Math.max(draggedElement.originalX1 + minW, imgMX);
            cropY2 = Math.max(draggedElement.originalY1 + minH, imgMY);
        }
    } 
    else if (draggedElement.type === 'border') {
        const name = draggedElement.name;
        if (name === 'left') {
            cropX1 = Math.min(cropX2 - minW, imgMX);
        } else if (name === 'right') {
            cropX2 = Math.max(cropX1 + minW, imgMX);
        } else if (name === 'top') {
            cropY1 = Math.min(cropY2 - minH, imgMY);
        } else if (name === 'bottom') {
            cropY2 = Math.max(cropY1 + minH, imgMY);
        }
    } 
    else if (draggedElement.type === 'h-inner') {
        const idx = draggedElement.index; // 1-indexed
        // Math coordinates: y = cropY1 + ratio * (cropY2 - cropY1)
        const totalH = cropY2 - cropY1;
        const requestedRatio = (imgMY - cropY1) / totalH;
        
        const minRatioGap = MIN_GAP / totalH;
        const prevRatio = idx > 1 ? hRatios[idx - 2] : 0;
        const nextRatio = idx < rows - 1 ? hRatios[idx] : 1;
        
        hRatios[idx - 1] = Math.max(prevRatio + minRatioGap, Math.min(nextRatio - minRatioGap, requestedRatio));
    } 
    else if (draggedElement.type === 'v-inner') {
        const idx = draggedElement.index; // 1-indexed
        const totalW = cropX2 - cropX1;
        const requestedRatio = (imgMX - cropX1) / totalW;
        
        const minRatioGap = MIN_GAP / totalW;
        const prevRatio = idx > 1 ? vRatios[idx - 2] : 0;
        const nextRatio = idx < cols - 1 ? vRatios[idx] : 1;
        
        vRatios[idx - 1] = Math.max(prevRatio + minRatioGap, Math.min(nextRatio - minRatioGap, requestedRatio));
    }

    draw();
}

// Draw image, darken inactive areas, draw grid splits and handles
function draw() {
    if (!currentImage) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw main image fitted
    ctx.drawImage(currentImage, 0, 0, canvas.width, canvas.height);

    // Canvas coordinates for the boundaries
    const cx1 = cropX1 * scale;
    const cy1 = cropY1 * scale;
    const cx2 = cropX2 * scale;
    const cy2 = cropY2 * scale;

    // 1. Darken cropped-out areas
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    // Top overlay
    ctx.fillRect(0, 0, canvas.width, cy1);
    // Bottom overlay
    ctx.fillRect(0, cy2, canvas.width, canvas.height - cy2);
    // Left overlay
    ctx.fillRect(0, cy1, cx1, cy2 - cy1);
    // Right overlay
    ctx.fillRect(cx2, cy1, canvas.width - cx2, cy2 - cy1);

    // 2. Draw Crop bounding box (Outer borders)
    ctx.strokeStyle = '#f43f5e'; // default border color
    ctx.lineWidth = 1.5;
    
    // Highlight border if hovered
    const isBorderHovered = (name) => hoveredElement && hoveredElement.type === 'border' && hoveredElement.name === name;
    
    // Top border
    ctx.beginPath();
    ctx.strokeStyle = isBorderHovered('top') ? '#fb7185' : '#f43f5e';
    ctx.lineWidth = isBorderHovered('top') ? 2.5 : 1.5;
    ctx.moveTo(cx1, cy1); ctx.lineTo(cx2, cy1);
    ctx.stroke();

    // Bottom border
    ctx.beginPath();
    ctx.strokeStyle = isBorderHovered('bottom') ? '#fb7185' : '#f43f5e';
    ctx.lineWidth = isBorderHovered('bottom') ? 2.5 : 1.5;
    ctx.moveTo(cx1, cy2); ctx.lineTo(cx2, cy2);
    ctx.stroke();

    // Left border
    ctx.beginPath();
    ctx.strokeStyle = isBorderHovered('left') ? '#fb7185' : '#f43f5e';
    ctx.lineWidth = isBorderHovered('left') ? 2.5 : 1.5;
    ctx.moveTo(cx1, cy1); ctx.lineTo(cx1, cy2);
    ctx.stroke();

    // Right border
    ctx.beginPath();
    ctx.strokeStyle = isBorderHovered('right') ? '#fb7185' : '#f43f5e';
    ctx.lineWidth = isBorderHovered('right') ? 2.5 : 1.5;
    ctx.moveTo(cx2, cy1); ctx.lineTo(cx2, cy2);
    ctx.stroke();

    // 3. Draw Grid Lines (Inner splits)
    const canvasH = hRatios.map(r => cy1 + r * (cy2 - cy1));
    const canvasV = vRatios.map(r => cx1 + r * (cx2 - cx1));

    // Draw internal gutters (spacing)
    if (gridSpacing > 0) {
        ctx.fillStyle = 'rgba(244, 63, 94, 0.15)'; // Translucent pinkish-red spacing band
        const halfGutter = (gridSpacing / 2) * scale;
        
        // Horizontal gutters
        for (let i = 0; i < canvasH.length; i++) {
            const y = canvasH[i];
            ctx.fillRect(cx1, y - halfGutter, cx2 - cx1, halfGutter * 2);
        }
        
        // Vertical gutters
        for (let i = 0; i < canvasV.length; i++) {
            const x = canvasV[i];
            ctx.fillRect(x - halfGutter, cy1, halfGutter * 2, cy2 - cy1);
        }
    }

    ctx.setLineDash([5, 4]);

    // Draw inner horizontal lines
    for (let i = 0; i < canvasH.length; i++) {
        const y = canvasH[i];
        const isHovered = hoveredElement && hoveredElement.type === 'h-inner' && hoveredElement.index === i + 1;
        ctx.strokeStyle = isHovered ? '#34d399' : '#10b981'; // Green split lines
        ctx.lineWidth = isHovered ? 2.5 : 1.5;
        
        ctx.beginPath();
        ctx.moveTo(cx1, y);
        ctx.lineTo(cx2, y);
        ctx.stroke();
    }

    // Draw inner vertical lines
    for (let i = 0; i < canvasV.length; i++) {
        const x = canvasV[i];
        const isHovered = hoveredElement && hoveredElement.type === 'v-inner' && hoveredElement.index === i + 1;
        ctx.strokeStyle = isHovered ? '#34d399' : '#10b981';
        ctx.lineWidth = isHovered ? 2.5 : 1.5;
        
        ctx.beginPath();
        ctx.moveTo(x, cy1);
        ctx.lineTo(x, cy2);
        ctx.stroke();
    }
    
    ctx.setLineDash([]); // Reset line dash

    // 4. Draw Corner Handles (circles with handles)
    const corners = [
        { x: cx1, y: cy1 },
        { x: cx2, y: cy1 },
        { x: cx1, y: cy2 },
        { x: cx2, y: cy2 }
    ];

    corners.forEach((corner, idx) => {
        const isHovered = hoveredElement && hoveredElement.type === 'corner' && hoveredElement.index === idx;
        
        ctx.fillStyle = '#fbbf24'; // Yellow handle dots
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        
        ctx.beginPath();
        ctx.arc(corner.x, corner.y, isHovered ? CORNER_RADIUS + 2 : CORNER_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    });
}

// --- Live Thumbnail Previews & Crop Generation ---

function updatePreviews() {
    if (!currentImage) return;

    previewsContainer.innerHTML = '';
    const format = selectFormat.value;
    const quality = parseFloat(rangeQuality.value) / 100;
    
    // Absolute bounds on image pixels (rounded to integers)
    const boundsH = [
        Math.round(cropY1),
        ...hRatios.map(r => Math.round(cropY1 + r * (cropY2 - cropY1))),
        Math.round(cropY2)
    ];
    const boundsV = [
        Math.round(cropX1),
        ...vRatios.map(r => Math.round(cropX1 + r * (cropX2 - cropX1))),
        Math.round(cropX2)
    ];

    let index = 1;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const x = boundsV[c];
            const y = boundsH[r];
            
            // Adjust inner boundaries for cell gutter spacing
            let startX = x;
            let endX = boundsV[c + 1];
            if (c > 0) startX += gridSpacing / 2;
            if (c < cols - 1) endX -= gridSpacing / 2;
            
            let startY = y;
            let endY = boundsH[r + 1];
            if (r > 0) startY += gridSpacing / 2;
            if (r < rows - 1) endY -= gridSpacing / 2;

            // Round coordinates to exact integers to avoid sub-pixel blurring
            const roundedStartX = Math.round(startX);
            const roundedEndX = Math.round(endX);
            const roundedStartY = Math.round(startY);
            const roundedEndY = Math.round(endY);
            
            const w = roundedEndX - roundedStartX;
            const h = roundedEndY - roundedStartY;

            if (w <= 0 || h <= 0) continue;

            // Render crop to preview offscreen
            const offCanvas = document.createElement('canvas');
            offCanvas.width = w;
            offCanvas.height = h;
            const offCtx = offCanvas.getContext('2d');
            offCtx.drawImage(currentImage, roundedStartX, roundedStartY, w, h, 0, 0, w, h);

            const dataURL = offCanvas.toDataURL(format, format === 'image/png' ? undefined : quality);

            // Generate card element
            const card = document.createElement('div');
            card.className = 'preview-card';
            
            const badge = document.createElement('div');
            badge.className = 'preview-badge';
            badge.innerText = index;

            const imgEl = document.createElement('img');
            imgEl.className = 'preview-img';
            imgEl.src = dataURL;
            imgEl.draggable = false;

            const btnSingleDownload = document.createElement('button');
            btnSingleDownload.className = 'preview-download-btn';
            btnSingleDownload.title = '下载此图';
            btnSingleDownload.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;
            
            const currentIdx = index;
            const currentW = w;
            const currentH = h;
            btnSingleDownload.addEventListener('click', (e) => {
                e.stopPropagation();
                triggerSingleDownload(dataURL, currentIdx, format);
            });

            // Click card thumbnail to zoom in
            card.addEventListener('click', (e) => {
                if (e.target.closest('.preview-download-btn')) return;
                openLightbox(dataURL, currentIdx, currentW, currentH, format);
            });

            card.appendChild(badge);
            card.appendChild(imgEl);
            card.appendChild(btnSingleDownload);
            previewsContainer.appendChild(card);

            index++;
        }
    }
    
    previewCountText.innerText = rows * cols;
}

// Download a single sub-image
function triggerSingleDownload(dataURL, idx, format) {
    const ext = format.split('/')[1];
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = `split_${idx}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast(`子图 #${idx} 已下载。`, 'success');
}

// --- Bulk Export System (ZIP Generator) ---

function setupExportHandlers() {
    btnExportZip.addEventListener('click', () => {
        if (!currentImage) {
            showToast('请先上传图片！', 'error');
            return;
        }

        const format = selectFormat.value;
        const quality = parseFloat(rangeQuality.value) / 100;
        const ext = format.split('/')[1];

        // Visual feedback loader loading animation trigger
        btnExportZip.disabled = true;
        btnExportZip.innerHTML = `<svg class="animate-spin" style="animation: spin 1s linear infinite;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.2)"></circle><path d="M4 12a8 8 0 0 1 8-8v8H4z" fill="currentColor"></path></svg> 打包中...`;

        // Wait brief tick so browser can paint loader
        setTimeout(async () => {
            try {
                const zip = new JSZip();
                
                // Rounded boundaries to integers
                const boundsH = [
                    Math.round(cropY1),
                    ...hRatios.map(r => Math.round(cropY1 + r * (cropY2 - cropY1))),
                    Math.round(cropY2)
                ];
                const boundsV = [
                    Math.round(cropX1),
                    ...vRatios.map(r => Math.round(cropX1 + r * (cropX2 - cropX1))),
                    Math.round(cropX2)
                ];

                let index = 1;
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        const x = boundsV[c];
                        const y = boundsH[r];
                        
                        // Adjust inner boundaries for cell gutter spacing
                        let startX = x;
                        let endX = boundsV[c + 1];
                        if (c > 0) startX += gridSpacing / 2;
                        if (c < cols - 1) endX -= gridSpacing / 2;
                        
                        let startY = y;
                        let endY = boundsH[r + 1];
                        if (r > 0) startY += gridSpacing / 2;
                        if (r < rows - 1) endY -= gridSpacing / 2;

                        const roundedStartX = Math.round(startX);
                        const roundedEndX = Math.round(endX);
                        const roundedStartY = Math.round(startY);
                        const roundedEndY = Math.round(endY);
                        
                        const w = roundedEndX - roundedStartX;
                        const h = roundedEndY - roundedStartY;

                        if (w <= 0 || h <= 0) continue;

                        const offCanvas = document.createElement('canvas');
                        offCanvas.width = w;
                        offCanvas.height = h;
                        const offCtx = offCanvas.getContext('2d');
                        offCtx.drawImage(currentImage, roundedStartX, roundedStartY, w, h, 0, 0, w, h);

                        // Use native toBlob to prevent any base64 string corruption
                        const blob = await new Promise(resolve => {
                            offCanvas.toBlob(resolve, format, format === 'image/png' ? undefined : quality);
                        });
                        
                        zip.file(`split_${index}.${ext}`, blob);
                        index++;
                    }
                }

                const content = await zip.generateAsync({ type: 'blob' });
                const a = document.createElement('a');
                const url = URL.createObjectURL(content);
                a.href = url;
                a.download = `${sourceFileName}.zip`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                
                // Delay revoking ObjectURL to ensure download finishes starting
                setTimeout(() => {
                    URL.revokeObjectURL(url);
                }, 15000);

                showToast('ZIP 导出完成！已开始自动下载。', 'success');
                resetExportButton();
            } catch (error) {
                showToast('打包失败: ' + error.message, 'error');
                resetExportButton();
            }
        }, 100);
    });

    // Save directly to local project folder
    btnSaveLocal.addEventListener('click', () => {
        if (!currentImage) {
            showToast('请先上传图片！', 'error');
            return;
        }

        const format = selectFormat.value;
        const quality = parseFloat(rangeQuality.value) / 100;
        const ext = format.split('/')[1];

        btnSaveLocal.disabled = true;
        const originalHTML = btnSaveLocal.innerHTML;
        btnSaveLocal.innerHTML = `
            <svg class="animate-spin" style="animation: spin 1s linear infinite;" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5">
                <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.2)"></circle>
                <path d="M4 12a8 8 0 0 1 8-8v8H4z" fill="currentColor"></path>
            </svg>
            保存中...
        `;

        setTimeout(async () => {
            try {
                const payload = {
                    folderName: `${sourceFileName}_split`,
                    files: []
                };

                const boundsH = [
                    Math.round(cropY1),
                    ...hRatios.map(r => Math.round(cropY1 + r * (cropY2 - cropY1))),
                    Math.round(cropY2)
                ];
                const boundsV = [
                    Math.round(cropX1),
                    ...vRatios.map(r => Math.round(cropX1 + r * (cropX2 - cropX1))),
                    Math.round(cropX2)
                ];

                let index = 1;
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        const x = boundsV[c];
                        const y = boundsH[r];
                        
                        // Adjust inner boundaries for cell gutter spacing
                        let startX = x;
                        let endX = boundsV[c + 1];
                        if (c > 0) startX += gridSpacing / 2;
                        if (c < cols - 1) endX -= gridSpacing / 2;
                        
                        let startY = y;
                        let endY = boundsH[r + 1];
                        if (r > 0) startY += gridSpacing / 2;
                        if (r < rows - 1) endY -= gridSpacing / 2;

                        const roundedStartX = Math.round(startX);
                        const roundedEndX = Math.round(endX);
                        const roundedStartY = Math.round(startY);
                        const roundedEndY = Math.round(endY);
                        
                        const w = roundedEndX - roundedStartX;
                        const h = roundedEndY - roundedStartY;

                        if (w <= 0 || h <= 0) continue;

                        const offCanvas = document.createElement('canvas');
                        offCanvas.width = w;
                        offCanvas.height = h;
                        const offCtx = offCanvas.getContext('2d');
                        offCtx.drawImage(currentImage, roundedStartX, roundedStartY, w, h, 0, 0, w, h);

                        const dataURL = offCanvas.toDataURL(format, format === 'image/png' ? undefined : quality);
                        payload.files.push({
                            name: `split_${index}.${ext}`,
                            data: dataURL
                        });
                        index++;
                    }
                }

                const response = await fetch('/api/save', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });
                const result = await response.json();

                if (result.success) {
                    showToast(`已成功保存至项目目录: ${sourceFileName}_split/`, 'success');
                } else {
                    showToast('保存失败: ' + result.error, 'error');
                }
            } catch (error) {
                showToast('保存失败: ' + error.message, 'error');
            } finally {
                btnSaveLocal.disabled = false;
                btnSaveLocal.innerHTML = originalHTML;
            }
        }, 100);
    });
}

function resetExportButton() {
    btnExportZip.disabled = false;
    btnExportZip.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="21 15 16 20 11 15"></polyline>
            <line x1="16" y1="10" x2="16" y2="20"></line>
            <path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6"></path>
        </svg>
        一键打包 ZIP 导出
    `;
}

// --- Toast System ---

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = '';
    if (type === 'success') {
        icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
    } else if (type === 'error') {
        icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    } else {
        icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }
    
    toast.innerHTML = `${icon}<span>${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('toast-fade-out');
        toast.addEventListener('animationend', () => {
            toast.remove();
        });
    }, 3500);
}

// --- Lightbox Modal Zoom ---

let activeLightboxData = null;

function openLightbox(src, idx, w, h, format) {
    modalImg.src = src;
    modalTitle.innerText = `子图 #${idx}`;
    const ext = format.split('/')[1].toUpperCase();
    modalDim.innerText = `${w} × ${h} 像素 (${ext})`;
    activeLightboxData = { src, idx, format };
    previewModal.classList.remove('hidden');
}

const closeModal = () => {
    previewModal.classList.add('hidden');
    modalImg.src = ''; // Clear image src to free memory
    activeLightboxData = null;
};

// Set up close events
document.querySelector('.modal-close').addEventListener('click', closeModal);
previewModal.addEventListener('click', (e) => {
    if (e.target === previewModal) {
        closeModal();
    }
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !previewModal.classList.contains('hidden')) {
        closeModal();
    }
});

// Bind download inside modal
modalDownloadBtn.addEventListener('click', () => {
    if (activeLightboxData) {
        const { src, idx, format } = activeLightboxData;
        triggerSingleDownload(src, idx, format);
    }
});

// Dynamic autocrop logic utilizing cached pixel data (runs under 0.1ms)
function runAutoCrop(showToastFeedback = false) {
    if (!currentImage || !cachedImgData) return;

    const tolerance = parseFloat(autocropTolerance.value);
    const shrinkPixels = parseInt(autocropShrink.value);

    try {
        const data = cachedImgData;

        // Helper to get pixel color at (x, y)
        const getPixel = (x, y) => {
            const idx = (y * imageWidth + x) * 4;
            return {
                r: data[idx],
                g: data[idx + 1],
                b: data[idx + 2],
                a: data[idx + 3]
            };
        };

        // Sample a 5x5 grid in top-left corner and average to filter JPEG noise
        let sumR = 0, sumG = 0, sumB = 0, count = 0;
        const sampleSize = Math.min(5, Math.min(imageWidth, imageHeight));
        for (let y = 0; y < sampleSize; y++) {
            for (let x = 0; x < sampleSize; x++) {
                const p = getPixel(x, y);
                sumR += p.r;
                sumG += p.g;
                sumB += p.b;
                count++;
            }
        }
        const bg = {
            r: Math.round(sumR / count),
            g: Math.round(sumG / count),
            b: Math.round(sumB / count)
        };

        // Determine if a pixel matches the background (within tolerance)
        const isBackground = (x, y) => {
            const p = getPixel(x, y);
            // If the pixel is highly transparent, consider it background
            if (p.a < 15) return true;
            
            // Euclidean distance in RGB color space
            const diff = Math.sqrt(
                Math.pow(p.r - bg.r, 2) +
                Math.pow(p.g - bg.g, 2) +
                Math.pow(p.b - bg.b, 2)
            );
            return diff < tolerance;
        };

        // 1. Scan from Top down
        let newY1 = 0;
        for (let y = 0; y < imageHeight; y++) {
            let hasContent = false;
            for (let x = 0; x < imageWidth; x++) {
                if (!isBackground(x, y)) {
                    hasContent = true;
                    break;
                }
            }
            if (hasContent) {
                newY1 = y;
                break;
            }
        }

        // 2. Scan from Bottom up
        let newY2 = imageHeight;
        for (let y = imageHeight - 1; y >= 0; y--) {
            let hasContent = false;
            for (let x = 0; x < imageWidth; x++) {
                if (!isBackground(x, y)) {
                    hasContent = true;
                    break;
                }
            }
            if (hasContent) {
                newY2 = y + 1;
                break;
            }
        }

        // 3. Scan from Left rightwards
        let newX1 = 0;
        for (let x = 0; x < imageWidth; x++) {
            let hasContent = false;
            for (let y = newY1; y < newY2; y++) {
                if (!isBackground(x, y)) {
                    hasContent = true;
                    break;
                }
            }
            if (hasContent) {
                newX1 = x;
                break;
            }
        }

        // 4. Scan from Right leftwards
        let newX2 = imageWidth;
        for (let x = imageWidth - 1; x >= 0; x--) {
            let hasContent = false;
            for (let y = newY1; y < newY2; y++) {
                if (!isBackground(x, y)) {
                    hasContent = true;
                    break;
                }
            }
            if (hasContent) {
                newX2 = x + 1;
                break;
            }
        }

        // Apply inward shrink to shave off anti-aliased border lines
        if (shrinkPixels > 0) {
            newX1 = Math.min(newX2, newX1 + shrinkPixels);
            newY1 = Math.min(newY2, newY1 + shrinkPixels);
            newX2 = Math.max(newX1, newX2 - shrinkPixels);
            newY2 = Math.max(newY1, newY2 - shrinkPixels);
        }

        // Constraints validation
        const cropW = newX2 - newX1;
        const cropH = newY2 - newY1;
        const minW = getMinCropWidth();
        const minH = getMinCropHeight();

        if (cropW < minW || cropH < minH) {
            if (showToastFeedback) {
                showToast('智能去边失败：裁剪区域过小！建议降低容差或收缩像素。', 'error');
            }
            return;
        }

        // Apply new crop boundaries
        cropX1 = newX1;
        cropY1 = newY1;
        cropX2 = newX2;
        cropY2 = newY2;

        // Trigger redraw and previews update
        draw();
        updatePreviews();
        
        if (showToastFeedback) {
            showToast(`智能去边成功！已裁剪边缘白/黑边 (收缩了 ${shrinkPixels}px 边缘)。`, 'success');
        }

    } catch (err) {
        if (showToastFeedback) {
            showToast('智能裁切出错: ' + err.message, 'error');
        }
    }
}

// Start everything
init();
