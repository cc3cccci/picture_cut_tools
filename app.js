// Main application state
let imageQueue = []; // array of { id, file, name, img, width, height, cropX1, cropY1, cropX2, cropY2, rows, cols, hRatios, vRatios, gridSpacing, autocropTolerance, autocropShrink, cachedImgData }
let activeQueueIndex = -1; // currently active image in the queue
let excludedSlices = new Set(); // Set of "imageId_rowIndex_colIndex" keys for excluded sub-images
let queueSortAsc = true; // true for A-Z, false for Z-A

let currentImage = null;
let imageWidth = 0;
let imageHeight = 0;
let scale = 1;
let sourceFileName = 'split_images';
let cachedImgData = null; // Cache pixel data for instant real-time scanning
let gridSpacing = 0; // Spacing/gutter between grid cells in image pixels
let generatedSlices = []; // List of all generated sub-image slices for current active image
let activeLightboxIndex = 1; // Currently active slice index in lightbox modal

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
const modalPrevBtn = document.getElementById('modal-prev-btn');
const modalNextBtn = document.getElementById('modal-next-btn');
const customGridForm = document.getElementById('custom-grid-form');
const inputRows = document.getElementById('input-rows');
const inputCols = document.getElementById('input-cols');
const btnApplyCustom = document.getElementById('btn-apply-custom');
const btnCustomPreset = document.getElementById('btn-custom-preset');

// New DOM elements for Queue
const queueCountText = document.getElementById('queue-count');
const queueList = document.getElementById('queue-list');
const btnQueueSync = document.getElementById('btn-queue-sync');
const btnQueueSort = document.getElementById('btn-queue-sort');
const btnQueueClear = document.getElementById('btn-queue-clear');
const queueAddCard = document.getElementById('queue-add-card');
const queueAddInput = document.getElementById('queue-add-input');

// --- Initialization & Event Listeners ---

// Initialize default parameters
function init() {
    setupUploadHandlers();
    setupConfigHandlers();
    setupCanvasHandlers();
    setupExportHandlers();
    setupResizeHandler();
    setupQueueHandlers();
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
            handleImageFiles(Array.from(files));
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleImageFiles(Array.from(e.target.files));
        }
    });

    btnReupload.addEventListener('click', () => {
        // Clear state
        currentImage = null;
        imageWidth = 0;
        imageHeight = 0;
        imageQueue = [];
        activeQueueIndex = -1;
        queueSortAsc = true;
        btnQueueSort.innerText = '按名称排序';
        btnQueueSort.title = '按文件名对队列进行排序 (支持 A-Z / Z-A 切换)';
        excludedSlices.clear();
        previewsContainer.innerHTML = '';
        previewCountText.innerText = '0';
        fileInput.value = '';
        
        // Toggle view
        editorContainer.classList.add('hidden');
        uploadZone.classList.remove('hidden');
        showToast('已重置并清空队列，请重新上传图片。', 'info');
    });
}

// Initialize handlers for the new Image Queue
function setupQueueHandlers() {
    btnQueueClear.addEventListener('click', () => {
        btnReupload.click();
    });

    btnQueueSync.addEventListener('click', () => {
        syncSettingsToAll();
    });

    btnQueueSort.addEventListener('click', () => {
        sortQueueByName();
    });

    queueAddCard.addEventListener('click', () => {
        queueAddInput.click();
    });

    queueAddInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleImageFiles(Array.from(e.target.files));
            queueAddInput.value = ''; // Reset input value to allow duplicate upload attempts
        }
    });
}

// Save active configurations to current queue item
function saveActiveStateToQueueItem() {
    if (activeQueueIndex < 0 || activeQueueIndex >= imageQueue.length) return;
    const item = imageQueue[activeQueueIndex];
    item.cropX1 = cropX1;
    item.cropY1 = cropY1;
    item.cropX2 = cropX2;
    item.cropY2 = cropY2;
    item.rows = rows;
    item.cols = cols;
    item.hRatios = [...hRatios];
    item.vRatios = [...vRatios];
    item.gridSpacing = gridSpacing;
    item.autocropTolerance = parseInt(autocropTolerance.value);
    item.autocropShrink = parseInt(autocropShrink.value);
}

// Sync active queue item configuration to the editor global state & UI
function syncActiveImageStateToUI() {
    if (activeQueueIndex < 0 || activeQueueIndex >= imageQueue.length) return;
    const item = imageQueue[activeQueueIndex];
    currentImage = item.img;
    imageWidth = item.width;
    imageHeight = item.height;
    cropX1 = item.cropX1;
    cropY1 = item.cropY1;
    cropX2 = item.cropX2;
    cropY2 = item.cropY2;
    rows = item.rows;
    cols = item.cols;
    hRatios = item.hRatios;
    vRatios = item.vRatios;
    gridSpacing = item.gridSpacing;
    sourceFileName = item.name;
    cachedImgData = item.cachedImgData;

    // Update preset buttons state
    let presetFound = false;
    document.querySelectorAll('.btn-preset').forEach(btn => {
        btn.classList.remove('active');
        const r = parseInt(btn.getAttribute('data-rows'));
        const c = parseInt(btn.getAttribute('data-cols'));
        if (r === rows && c === cols && btn.id !== 'btn-custom-preset') {
            btn.classList.add('active');
            customGridForm.classList.add('hidden');
            presetFound = true;
        }
    });

    if (!presetFound) {
        btnCustomPreset.classList.add('active');
        customGridForm.classList.remove('hidden');
        inputRows.value = rows;
        inputCols.value = cols;
    }

    gridGutter.value = gridSpacing;
    gridGutterVal.innerText = gridSpacing + ' px';
    autocropTolerance.value = item.autocropTolerance;
    autocropTolVal.innerText = item.autocropTolerance;
    autocropShrink.value = item.autocropShrink;
    autocropShrinkVal.innerText = item.autocropShrink + ' px';
}

// Process the uploaded image files (adds them to the queue)
async function handleImageFiles(files) {
    if (files.length === 0) return;

    if (files.length > 1) {
        showToast('正在加载 ' + files.length + ' 张图片，请稍候...', 'info');
    }

    let loadedCount = 0;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith('image/')) {
            showToast('文件 "' + file.name + '" 不是图片格式已跳过。', 'error');
            continue;
        }

        try {
            const item = await loadImageFileToQueueItem(file);
            imageQueue.push(item);
            loadedCount++;
        } catch (err) {
            showToast('加载 "' + file.name + '" 失败: ' + err.message, 'error');
        }
    }

    if (loadedCount > 0) {
        // Toggle view
        uploadZone.classList.add('hidden');
        editorContainer.classList.remove('hidden');

        // Set default active if none selected
        if (activeQueueIndex === -1) {
            activeQueueIndex = 0;
        }

        syncActiveImageStateToUI();
        resizeCanvas();
        renderQueueUI();
        updatePreviews();

        showToast('成功导入 ' + loadedCount + ' 张图片！', 'success');
    }
}

// Load a single File and return a structured queue item object
function loadImageFileToQueueItem(file) {
    return new Promise((resolve, reject) => {
        let name = 'split_images';
        if (file && file.name) {
            const lastDot = file.name.lastIndexOf('.');
            if (lastDot !== -1) {
                name = file.name.substring(0, lastDot);
            } else {
                name = file.name;
            }
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const w = img.naturalWidth;
                const h = img.naturalHeight;

                // Cache pixel data for instant auto-crop scanning
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = w;
                tempCanvas.height = h;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.drawImage(img, 0, 0);
                const cachedData = tempCtx.getImageData(0, 0, w, h).data;

                // Default 3x3 layout ratios
                const initialRows = 3;
                const initialCols = 3;
                const hRats = [];
                const vRats = [];
                for (let r = 1; r < initialRows; r++) hRats.push(r / initialRows);
                for (let c = 1; c < initialCols; c++) vRats.push(c / initialCols);

                const item = {
                    id: 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                    file: file,
                    name: name,
                    img: img,
                    width: w,
                    height: h,
                    cropX1: 0,
                    cropY1: 0,
                    cropX2: w,
                    cropY2: h,
                    rows: initialRows,
                    cols: initialCols,
                    hRatios: hRats,
                    vRatios: vRats,
                    gridSpacing: 0,
                    autocropTolerance: 45,
                    autocropShrink: 2,
                    cachedImgData: cachedData
                };
                resolve(item);
            };
            img.onerror = () => reject(new Error('无法解析图片数据'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('文件读取出错'));
        reader.readAsDataURL(file);
    });
}

// Render the horizontal filmstrip image queue UI
let draggedIndex = -1;

function renderQueueUI() {
    queueCountText.innerText = imageQueue.length + ' 张';
    queueList.innerHTML = '';

    imageQueue.forEach((item, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'queue-item-wrapper' + (index === activeQueueIndex ? ' active' : '');
        wrapper.draggable = true;
        wrapper.dataset.index = index;

        const queueItem = document.createElement('div');
        queueItem.className = 'queue-item' + (index === activeQueueIndex ? ' active' : '');
        queueItem.title = item.name;

        const img = document.createElement('img');
        img.src = item.img.src;
        img.draggable = false;

        const badge = document.createElement('div');
        badge.className = 'queue-item-badge';
        badge.innerText = index + 1;

        // Delete button in the corner (replaces dense overlays)
        const btnDel = document.createElement('button');
        btnDel.className = 'queue-ctrl-btn queue-item-delete';
        btnDel.innerHTML = '×';
        btnDel.title = '删除此图';
        btnDel.addEventListener('click', (e) => {
            e.stopPropagation();
            removeQueueItem(index);
        });

        queueItem.appendChild(img);
        queueItem.appendChild(badge);
        queueItem.appendChild(btnDel);

        // Filename label below thumbnail
        const nameLabel = document.createElement('span');
        nameLabel.className = 'queue-item-name';
        nameLabel.innerText = item.name;

        wrapper.appendChild(queueItem);
        wrapper.appendChild(nameLabel);

        // Drag and drop event listeners
        wrapper.addEventListener('dragstart', (e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', index);
            draggedIndex = index;
            wrapper.classList.add('dragging');
        });

        wrapper.addEventListener('dragend', () => {
            wrapper.classList.remove('dragging');
            document.querySelectorAll('.queue-item-wrapper').forEach(w => {
                w.classList.remove('drag-over');
            });
        });

        wrapper.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });

        wrapper.addEventListener('dragenter', (e) => {
            e.preventDefault();
            if (parseInt(wrapper.dataset.index) !== draggedIndex) {
                wrapper.classList.add('drag-over');
            }
        });

        wrapper.addEventListener('dragleave', () => {
            wrapper.classList.remove('drag-over');
        });

        wrapper.addEventListener('drop', (e) => {
            e.preventDefault();
            const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
            const toIndex = parseInt(wrapper.dataset.index);
            if (fromIndex !== toIndex && !isNaN(fromIndex) && !isNaN(toIndex)) {
                moveQueueItem(fromIndex, toIndex);
            }
        });

        // Click to select image (avoid select on delete click)
        wrapper.addEventListener('click', (e) => {
            if (e.target.closest('.queue-item-delete')) return;
            if (activeQueueIndex === index) return;
            saveActiveStateToQueueItem();
            activeQueueIndex = index;
            syncActiveImageStateToUI();
            resizeCanvas();
            renderQueueUI();
            updatePreviews();
        });

        queueList.appendChild(wrapper);
    });
}

// Move item inside queue (insertion shift)
function moveQueueItem(from, to) {
    if (from < 0 || from >= imageQueue.length || to < 0 || to >= imageQueue.length) return;

    saveActiveStateToQueueItem();

    const [movedItem] = imageQueue.splice(from, 1);
    imageQueue.splice(to, 0, movedItem);

    // Track active index changes cleanly
    if (activeQueueIndex === from) {
        activeQueueIndex = to;
    } else {
        if (from < activeQueueIndex && to >= activeQueueIndex) {
            activeQueueIndex--;
        } else if (from > activeQueueIndex && to <= activeQueueIndex) {
            activeQueueIndex++;
        }
    }

    syncActiveImageStateToUI();
    renderQueueUI();
    updatePreviews();
}

// Sort queue by image filename
function sortQueueByName() {
    if (imageQueue.length <= 1) {
        showToast('图片队列中图片不足，无需排序。', 'info');
        return;
    }

    saveActiveStateToQueueItem();

    // Track active item unique ID to restore selection index post-sort
    let activeItemId = null;
    if (activeQueueIndex >= 0 && activeQueueIndex < imageQueue.length) {
        activeItemId = imageQueue[activeQueueIndex].id;
    }

    // Sort queue array by filename
    imageQueue.sort((a, b) => {
        const comp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        return queueSortAsc ? comp : -comp;
    });

    // Restore active index
    if (activeItemId) {
        activeQueueIndex = imageQueue.findIndex(item => item.id === activeItemId);
    }

    const currentDirection = queueSortAsc ? '升序' : '降序';
    const nextDirection = queueSortAsc ? '降序' : '升序';
    const arrow = queueSortAsc ? '↑' : '↓';

    // Toggle sorting direction state
    queueSortAsc = !queueSortAsc;

    // Update button text to display sort direction arrow
    btnQueueSort.innerText = '按名称排序 ' + arrow;
    btnQueueSort.title = '按文件名对队列进行排序 (当前已按' + currentDirection + '排序，点击切换为' + nextDirection + ')';

    syncActiveImageStateToUI();
    renderQueueUI();
    updatePreviews();

    showToast('已按文件名进行' + currentDirection + '排序！', 'success');
}

// Remove an image item from the queue
function removeQueueItem(index) {
    if (index < 0 || index >= imageQueue.length) return;

    const deletedId = imageQueue[index].id;
    // Wipe associated excluded slices key map
    for (const key of excludedSlices) {
        if (key.startsWith(deletedId + '_')) {
            excludedSlices.delete(key);
        }
    }

    imageQueue.splice(index, 1);

    if (imageQueue.length === 0) {
        // Reset everything if queue empty
        currentImage = null;
        imageWidth = 0;
        imageHeight = 0;
        activeQueueIndex = -1;
        previewsContainer.innerHTML = '';
        previewCountText.innerText = '0';
        fileInput.value = '';
        editorContainer.classList.add('hidden');
        uploadZone.classList.remove('hidden');
        showToast('队列清空完毕，请重新上传。', 'info');
    } else {
        if (activeQueueIndex >= imageQueue.length) {
            activeQueueIndex = imageQueue.length - 1;
        }
        syncActiveImageStateToUI();
        resizeCanvas();
        renderQueueUI();
        updatePreviews();
        showToast('已从图片队列移除。', 'info');
    }
}

// Sync the current image settings to all other images in the queue
function syncSettingsToAll() {
    if (activeQueueIndex === -1 || imageQueue.length <= 1) {
        showToast('图片队列中没有其他图片可同步参数。', 'warning');
        return;
    }

    saveActiveStateToQueueItem();
    const source = imageQueue[activeQueueIndex];

    // Compute percent bounds relative to source size
    const rx1 = source.cropX1 / source.width;
    const ry1 = source.cropY1 / source.height;
    const rx2 = source.cropX2 / source.width;
    const ry2 = source.cropY2 / source.height;

    imageQueue.forEach((item, index) => {
        if (index === activeQueueIndex) return;

        item.rows = source.rows;
        item.cols = source.cols;
        item.gridSpacing = source.gridSpacing;
        item.autocropTolerance = source.autocropTolerance;
        item.autocropShrink = source.autocropShrink;

        item.hRatios = [...source.hRatios];
        item.vRatios = [...source.vRatios];

        // Apply matching aspect ratio bounds
        item.cropX1 = Math.round(rx1 * item.width);
        item.cropY1 = Math.round(ry1 * item.height);
        item.cropX2 = Math.round(rx2 * item.width);
        item.cropY2 = Math.round(ry2 * item.height);
    });

    syncActiveImageStateToUI();
    draw();
    updatePreviews();
    showToast('已成功将当前网格及去边参数同步到全部图片！', 'success');
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
                saveActiveStateToQueueItem();
                draw();
                updatePreviews();
                showToast('已切换至 ' + rows + '×' + cols + ' 网格', 'info');
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
        saveActiveStateToQueueItem();
        draw();
        updatePreviews();
        showToast('已应用自定义网格: ' + rows + ' 行 × ' + cols + ' 列', 'success');
    });

    // Reset grid alignment
    btnReset.addEventListener('click', () => {
        cropX1 = 0;
        cropY1 = 0;
        cropX2 = imageWidth;
        cropY2 = imageHeight;
        resetGridRatios();
        saveActiveStateToQueueItem();
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
        const val = parseInt(e.target.value);
        autocropShrinkVal.innerText = val + ' px';
        if (activeQueueIndex !== -1) {
            imageQueue[activeQueueIndex].autocropShrink = val;
        }
        draw();
        updatePreviews();
    });

    // Gutter spacing slider
    gridGutter.addEventListener('input', (e) => {
        gridSpacing = parseInt(e.target.value);
        gridGutterVal.innerText = gridSpacing + ' px';
        saveActiveStateToQueueItem();
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

// Minimum size calculations dynamically based on grid size
function getMinCropHeight() {
    return rows * MIN_GAP + 20;
}

// --- Canvas Interactive Engine ---

function setupCanvasHandlers() {
    // Helper to get coordinates on canvas supporting both mouse and touch
    const getCoordinates = (e) => {
        const rect = canvas.getBoundingClientRect();
        let clientX, clientY;
        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    };

    // Mouse hover and touch dragging move detection
    const onMove = (e) => {
        if (!currentImage) return;
        
        const coords = getCoordinates(e);
        const mx = coords.x;
        const my = coords.y;

        // If dragging, process drag update
        if (draggedElement) {
            if (e.cancelable) e.preventDefault(); // Stop mobile touch viewport panning
            handleDrag(coords);
            return;
        }

        // Only do hover visual updates on desktop mousemove (touches don't hover)
        if (e.type === 'mousemove') {
            const hit = testHitTest(mx, my);
            hoveredElement = hit;

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
            draw();
        }
    };

    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('touchmove', onMove, { passive: false });

    // Start dragging (mouse click or touch start)
    const onStart = (e) => {
        if (!currentImage) return;
        if (e.type === 'mousedown' && e.button !== 0) return; // Only left click for mouse

        const coords = getCoordinates(e);
        const mx = coords.x;
        const my = coords.y;

        const hit = testHitTest(mx, my);
        if (hit) {
            if (e.cancelable) e.preventDefault(); // prevent touch scroll conflicts
            draggedElement = hit;
            const imgMX = mx / scale;
            const imgMY = my / scale;
            dragStartX = imgMX;
            dragStartY = imgMY;
            
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
    };

    canvas.addEventListener('mousedown', onStart);
    canvas.addEventListener('touchstart', onStart, { passive: false });

    // Drag release
    const endDrag = () => {
        if (draggedElement) {
            draggedElement = null;
            saveActiveStateToQueueItem();
            updatePreviews();
            draw();
        }
    };
    canvas.addEventListener('mouseup', endDrag);
    canvas.addEventListener('mouseleave', endDrag);
    canvas.addEventListener('touchend', endDrag);
    canvas.addEventListener('touchcancel', endDrag);
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
function handleDrag(coords) {
    const mx = coords.x;
    const my = coords.y;

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

    // Save values right away
    saveActiveStateToQueueItem();
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

    // 5. Draw actual sub-image crop borders if spacing or shrink is active
    if (gridSpacing > 0 || (activeQueueIndex !== -1 && imageQueue[activeQueueIndex].autocropShrink > 0)) {
        const shrinkVal = activeQueueIndex !== -1 ? imageQueue[activeQueueIndex].autocropShrink : 0;
        
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)'; // Beautiful sky-blue dashed border
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const x = canvasV[c] || cx1;
                const nextX = canvasV[c + 1] || cx2;
                const y = canvasH[r] || cy1;
                const nextY = canvasH[r + 1] || cy2;

                let startX = x + shrinkVal * scale;
                let endX = nextX - shrinkVal * scale;
                if (c > 0) startX += (gridSpacing / 2) * scale;
                if (c < cols - 1) endX -= (gridSpacing / 2) * scale;

                let startY = y + shrinkVal * scale;
                let endY = nextY - shrinkVal * scale;
                if (r > 0) startY += (gridSpacing / 2) * scale;
                if (r < rows - 1) endY -= (gridSpacing / 2) * scale;

                if (endX > startX && endY > startY) {
                    ctx.strokeRect(startX, startY, endX - startX, endY - startY);
                }
            }
        }
        ctx.setLineDash([]); // Reset dash state
    }

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
    if (!currentImage || activeQueueIndex === -1) return;

    previewsContainer.innerHTML = '';
    generatedSlices = [];
    const format = selectFormat.value;
    const quality = parseFloat(rangeQuality.value) / 100;
    
    saveActiveStateToQueueItem();
    const activeItem = imageQueue[activeQueueIndex];
    
    // 1. Calculate the starting continuous index for this active image
    let globalIndex = 1;
    for (let i = 0; i < activeQueueIndex; i++) {
        const item = imageQueue[i];
        for (let r = 0; r < item.rows; r++) {
            for (let c = 0; c < item.cols; c++) {
                const key = item.id + '_' + r + '_' + c;
                if (!excludedSlices.has(key)) {
                    globalIndex++;
                }
            }
        }
    }
    
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

    let currentSlicesCount = 0;
    const shrinkVal = activeItem.autocropShrink || 0;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const x = boundsV[c];
            const y = boundsH[r];
            
            // Adjust inner boundaries for cell gutter spacing AND slice inward shrink
            let startX = x + shrinkVal;
            let endX = boundsV[c + 1] - shrinkVal;
            if (c > 0) startX += gridSpacing / 2;
            if (c < cols - 1) endX -= gridSpacing / 2;
            
            let startY = y + shrinkVal;
            let endY = boundsH[r + 1] - shrinkVal;
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

            const sliceKey = activeItem.id + '_' + r + '_' + c;
            const isExcluded = excludedSlices.has(sliceKey);

            // Render crop to preview offscreen
            const offCanvas = document.createElement('canvas');
            offCanvas.width = w;
            offCanvas.height = h;
            const offCtx = offCanvas.getContext('2d');
            offCtx.drawImage(currentImage, roundedStartX, roundedStartY, w, h, 0, 0, w, h);

            const dataURL = offCanvas.toDataURL(format, format === 'image/png' ? undefined : quality);

            // If excluded, it doesn't take up an active sequence index
            let badgeIndex = 0;
            if (!isExcluded) {
                badgeIndex = globalIndex;
                globalIndex++;
            }

            generatedSlices.push({
                index: badgeIndex, // 0 means excluded
                originalIndex: currentSlicesCount + 1, // local index starting from 1
                key: sliceKey,
                dataURL: dataURL,
                w: w,
                h: h,
                format: format,
                isExcluded: isExcluded
            });

            // Generate card element
            const card = document.createElement('div');
            card.className = 'preview-card' + (isExcluded ? ' excluded' : '');
            
            const badge = document.createElement('div');
            badge.className = 'preview-badge';
            badge.innerText = isExcluded ? '✕' : badgeIndex;

            const imgEl = document.createElement('img');
            imgEl.className = 'preview-img';
            imgEl.src = dataURL;
            imgEl.draggable = false;

            // Create Delete/Exclude Button (No backticks inside this innerHTML statement!)
            const btnExclude = document.createElement('button');
            btnExclude.className = 'preview-exclude-btn';
            btnExclude.title = isExcluded ? '恢复此子图' : '排除此子图';
            btnExclude.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="10" height="10"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
            btnExclude.addEventListener('click', (e) => {
                e.stopPropagation();
                if (isExcluded) {
                    excludedSlices.delete(sliceKey);
                } else {
                    excludedSlices.add(sliceKey);
                }
                updatePreviews();
            });

            const btnSingleDownload = document.createElement('button');
            btnSingleDownload.className = 'preview-download-btn';
            btnSingleDownload.title = '下载此图';
            btnSingleDownload.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>';
            
            const localSliceIndex = generatedSlices.length;
            btnSingleDownload.addEventListener('click', (e) => {
                e.stopPropagation();
                if (isExcluded) return;
                triggerSingleDownload(dataURL, badgeIndex, format);
            });

            // Click card thumbnail to zoom in
            card.addEventListener('click', (e) => {
                if (e.target.closest('.preview-download-btn') || e.target.closest('.preview-exclude-btn')) return;
                if (isExcluded) return;
                openLightbox(localSliceIndex);
            });

            card.appendChild(badge);
            card.appendChild(imgEl);
            card.appendChild(btnExclude);
            card.appendChild(btnSingleDownload);
            previewsContainer.appendChild(card);

            currentSlicesCount++;
        }
    }
    
    // 2. Count total active slices across the entire queue
    let totalActiveCount = globalIndex - 1;
    for (let i = activeQueueIndex + 1; i < imageQueue.length; i++) {
        const item = imageQueue[i];
        for (let r = 0; r < item.rows; r++) {
            for (let c = 0; c < item.cols; c++) {
                const key = item.id + '_' + r + '_' + c;
                if (!excludedSlices.has(key)) {
                    totalActiveCount++;
                }
            }
        }
    }
    
    previewCountText.innerText = totalActiveCount;
}

// Download a single sub-image
function triggerSingleDownload(dataURL, idx, format) {
    const ext = format.split('/')[1];
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = 'split_' + idx + '.' + ext;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('子图 #' + idx + ' 已下载。', 'success');
}

// --- Bulk Export System (ZIP Generator) ---

function setupExportHandlers() {
    btnExportZip.addEventListener('click', () => {
        if (imageQueue.length === 0) {
            showToast('请先上传图片！', 'error');
            return;
        }

        saveActiveStateToQueueItem();

        const format = selectFormat.value;
        const quality = parseFloat(rangeQuality.value) / 100;
        const ext = format.split('/')[1];

        // Visual feedback loader loading animation trigger
        btnExportZip.disabled = true;
        btnExportZip.innerHTML = '<svg class="animate-spin" style="animation: spin 1s linear infinite;" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.2)"></circle><path d="M4 12a8 8 0 0 1 8-8v8H4z" fill="currentColor"></path></svg> 打包中...';

        // Wait brief tick so browser can paint loader
        setTimeout(async () => {
            try {
                const zip = new JSZip();
                let globalIndex = 1;
                
                for (let i = 0; i < imageQueue.length; i++) {
                    const item = imageQueue[i];
                    
                    const boundsH = [
                        Math.round(item.cropY1),
                        ...item.hRatios.map(r => Math.round(item.cropY1 + r * (item.cropY2 - item.cropY1))),
                        Math.round(item.cropY2)
                    ];
                    const boundsV = [
                        Math.round(item.cropX1),
                        ...item.vRatios.map(r => Math.round(item.cropX1 + r * (item.cropX2 - item.cropX1))),
                        Math.round(item.cropX2)
                    ];

                    for (let r = 0; r < item.rows; r++) {
                        for (let c = 0; c < item.cols; c++) {
                            const sliceKey = item.id + '_' + r + '_' + c;
                            if (excludedSlices.has(sliceKey)) {
                                continue; // Skip excluded slices
                            }

                            const x = boundsV[c];
                            const y = boundsH[r];
                            
                            // Adjust inner boundaries for cell gutter spacing
                            let startX = x;
                            let endX = boundsV[c + 1];
                            if (c > 0) startX += item.gridSpacing / 2;
                            if (c < item.cols - 1) endX -= item.gridSpacing / 2;
                            
                            let startY = y;
                            let endY = boundsH[r + 1];
                            if (r > 0) startY += item.gridSpacing / 2;
                            if (r < item.rows - 1) endY -= item.gridSpacing / 2;

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
                            offCtx.drawImage(item.img, roundedStartX, roundedStartY, w, h, 0, 0, w, h);

                            // Use native toBlob to prevent any base64 string corruption
                            const blob = await new Promise(resolve => {
                                offCanvas.toBlob(resolve, format, format === 'image/png' ? undefined : quality);
                            });
                            
                            zip.file('split_' + globalIndex + '.' + ext, blob);
                            globalIndex++;
                        }
                    }
                }

                if (globalIndex === 1) {
                    showToast('没有可导出的有效子图！', 'warning');
                    resetExportButton();
                    return;
                }

                const content = await zip.generateAsync({ type: 'blob' });
                const a = document.createElement('a');
                const url = URL.createObjectURL(content);
                a.href = url;
                
                const zipName = imageQueue.length > 1 ? imageQueue[0].name + '_batch' : imageQueue[0].name;
                a.download = zipName + '.zip';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                
                // Delay revoking ObjectURL to ensure download finishes starting
                setTimeout(() => {
                    URL.revokeObjectURL(url);
                }, 15000);

                showToast('ZIP 导出完成！已成功打包 ' + (globalIndex - 1) + ' 张子图。', 'success');
                resetExportButton();
            } catch (error) {
                showToast('打包失败: ' + error.message, 'error');
                resetExportButton();
            }
        }, 100);
    });

    // Save directly to local project folder (using single quotes for DOM string)
    btnSaveLocal.addEventListener('click', () => {
        if (imageQueue.length === 0) {
            showToast('请先上传图片！', 'error');
            return;
        }

        saveActiveStateToQueueItem();

        const format = selectFormat.value;
        const quality = parseFloat(rangeQuality.value) / 100;
        const ext = format.split('/')[1];

        btnSaveLocal.disabled = true;
        const originalHTML = btnSaveLocal.innerHTML;
        btnSaveLocal.innerHTML = '<svg class="animate-spin" style="animation: spin 1s linear infinite;" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.2)"></circle><path d="M4 12a8 8 0 0 1 8-8v8H4z" fill="currentColor"></path></svg> 保存中...';

        setTimeout(async () => {
            try {
                const folderName = imageQueue.length > 1 ? imageQueue[0].name + '_batch_split' : imageQueue[0].name + '_split';
                const payload = {
                    folderName: folderName,
                    files: []
                };

                let globalIndex = 1;

                for (let i = 0; i < imageQueue.length; i++) {
                    const item = imageQueue[i];
                    
                    const boundsH = [
                        Math.round(item.cropY1),
                        ...item.hRatios.map(r => Math.round(item.cropY1 + r * (item.cropY2 - item.cropY1))),
                        Math.round(item.cropY2)
                    ];
                    const boundsV = [
                        Math.round(item.cropX1),
                        ...item.vRatios.map(r => Math.round(item.cropX1 + r * (item.cropX2 - item.cropX1))),
                        Math.round(item.cropX2)
                    ];

                    for (let r = 0; r < item.rows; r++) {
                        for (let c = 0; c < item.cols; c++) {
                            const sliceKey = item.id + '_' + r + '_' + c;
                            if (excludedSlices.has(sliceKey)) {
                                continue;
                            }

                            const x = boundsV[c];
                            const y = boundsH[r];
                            
                            // Adjust inner boundaries for cell gutter spacing
                            let startX = x;
                            let endX = boundsV[c + 1];
                            if (c > 0) startX += item.gridSpacing / 2;
                            if (c < item.cols - 1) endX -= item.gridSpacing / 2;
                            
                            let startY = y;
                            let endY = boundsH[r + 1];
                            if (r > 0) startY += item.gridSpacing / 2;
                            if (r < item.rows - 1) endY -= item.gridSpacing / 2;

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
                            offCtx.drawImage(item.img, roundedStartX, roundedStartY, w, h, 0, 0, w, h);

                            const dataURL = offCanvas.toDataURL(format, format === 'image/png' ? undefined : quality);
                            payload.files.push({
                                name: 'split_' + globalIndex + '.' + ext,
                                data: dataURL
                            });
                            globalIndex++;
                        }
                    }
                }

                if (payload.files.length === 0) {
                    showToast('没有可导出的有效子图！', 'warning');
                    btnSaveLocal.disabled = false;
                    btnSaveLocal.innerHTML = originalHTML;
                    return;
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
                    showToast('已成功保存至项目目录: ' + folderName + '/ (共 ' + payload.files.length + ' 张子图)', 'success');
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
    btnExportZip.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 15 16 20 11 15"></polyline><line x1="16" y1="10" x2="16" y2="20"></line><path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6"></path></svg> 打包 ZIP 导出';
}

// --- Toast System ---

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    
    let icon = '';
    if (type === 'success') {
        icon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
    } else if (type === 'error') {
        icon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
    } else {
        icon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    }
    
    toast.innerHTML = icon + '<span>' + message + '</span>';
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

function openLightbox(index) {
    if (index < 1 || index > generatedSlices.length) return;
    
    activeLightboxIndex = index;
    const slice = generatedSlices[index - 1];
    if (slice.isExcluded) return;
    
    modalImg.src = slice.dataURL;
    modalTitle.innerText = '子图 #' + slice.index;
    const ext = slice.format.split('/')[1].toUpperCase();
    modalDim.innerText = slice.w + ' × ' + slice.h + ' 像素 (' + ext + ')';
    activeLightboxData = { src: slice.dataURL, idx: slice.index, format: slice.format };
    
    previewModal.classList.remove('hidden');
}

function navigateLightbox(dir) {
    if (generatedSlices.length === 0) return;
    let nextIndex = activeLightboxIndex;
    let loopCount = 0;
    while (loopCount < generatedSlices.length) {
        nextIndex += dir;
        if (nextIndex < 1) {
            nextIndex = generatedSlices.length;
        } else if (nextIndex > generatedSlices.length) {
            nextIndex = 1;
        }
        
        if (!generatedSlices[nextIndex - 1].isExcluded) {
            openLightbox(nextIndex);
            return;
        }
        loopCount++;
    }
}

const closeModal = () => {
    previewModal.classList.add('hidden');
    modalImg.src = ''; // Clear image src to free memory
    activeLightboxData = null;
};

// Set up close and nav events
document.querySelector('.modal-close').addEventListener('click', closeModal);
previewModal.addEventListener('click', (e) => {
    if (e.target === previewModal) {
        closeModal();
    }
});

modalPrevBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    navigateLightbox(-1);
});

modalNextBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    navigateLightbox(1);
});

// Touch swipe gesture handlers on modal image for mobile
let touchStartX = 0;
let touchStartY = 0;

modalImg.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
}, { passive: true });

modalImg.addEventListener('touchend', (e) => {
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    
    const diffX = touchEndX - touchStartX;
    const diffY = touchEndY - touchStartY;
    
    // Swipe horizontal threshold: 50px, vertical constraint: < 80px to distinguish from vertical scroll
    if (Math.abs(diffX) > 50 && Math.abs(diffY) < 80) {
        if (diffX > 0) {
            navigateLightbox(-1); // Swipe Right -> view previous
        } else {
            navigateLightbox(1);  // Swipe Left -> view next
        }
    }
}, { passive: true });

// Keyboard navigation (Esc to close, Arrow keys to navigate)
document.addEventListener('keydown', (e) => {
    if (previewModal.classList.contains('hidden')) return;
    
    if (e.key === 'Escape') {
        closeModal();
    } else if (e.key === 'ArrowLeft') {
        navigateLightbox(-1);
    } else if (e.key === 'ArrowRight') {
        navigateLightbox(1);
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

        saveActiveStateToQueueItem();

        // Trigger redraw and previews update
        draw();
        updatePreviews();
        
        if (showToastFeedback) {
            showToast('智能去边成功！已裁剪边缘白/黑边 (收缩了 ' + shrinkPixels + 'px 边缘)。', 'success');
        }

    } catch (err) {
        if (showToastFeedback) {
            showToast('智能裁切出错: ' + err.message, 'error');
        }
    }
}

// Start everything
init();
