(() => {
  // ===== STATE =====
  const state = {
    dicomFiles: [],      // { file, arrayBuffer, dataSet, pixelData, width, height }
    generalFiles: [],    // { file, objectURL, type }
    activeIndex: 0,      // active dicom slice
    activeGeneralIndex: -1,
    ww: 400,
    wl: 40,
    scale: 1,
    panX: 0,
    panY: 0,
    tool: 'pan',
    isDragging: false,
    dragStart: { x: 0, y: 0 },
    annotationsBySlice: {},  // { [sliceIndex]: annotation[] }
    annotationsByGeneralFile: {}, // { [objectURL]: annotation[] }
    annotations: [],         // current slice's annotations (reference into annotationsBySlice)
    tempAnnotation: null,
    imgMin: 0,
    imgMax: 0,
    imgMean: 0,
    slicerResult: null,
    evansMeasurement: null,
    deshMeasurement: null,
    generalImageCache: {},   // { [objectURL]: HTMLImageElement }
    lastUploadedZip: null,   // original File for auto Slicer upload
  };

  const appSkills = Array.isArray(window.AppSkills) ? window.AppSkills : [];

  // ===== DOM =====
  const canvas = document.getElementById('imageCanvas');
  const ctx = canvas.getContext('2d');
  const emptyState = document.getElementById('emptyState');
  const viewport = document.getElementById('viewport');
  const overlay = document.getElementById('viewportOverlay');
  const viewerNav = document.getElementById('viewerNav');

  // ===== HELPERS =====
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B','KB','MB','GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getPixelData = (dataSet) => {
    const pixelDataElement = dataSet.elements.x7fe00010;
    if (!pixelDataElement) return null;
    const bitsAllocated = dataSet.uint16('x00280100') || 16;
    const pixelRepresentation = dataSet.uint16('x00280103') || 0;
    const byteArray = new Uint8Array(dataSet.byteArray.buffer, pixelDataElement.dataOffset, pixelDataElement.length);
    if (bitsAllocated === 16) {
      return pixelRepresentation === 0 ? new Uint16Array(byteArray.buffer, byteArray.byteOffset, byteArray.byteLength / 2)
                                       : new Int16Array(byteArray.buffer, byteArray.byteOffset, byteArray.byteLength / 2);
    }
    return new Uint8Array(byteArray.buffer, byteArray.byteOffset, byteArray.byteLength);
  };

  const readFileAsync = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });

  const isZipArchive = (name) => /\.(zip|sip)$/i.test(name);
  const isGeneralPreviewFile = (name) => /\.(jpg|jpeg|png|bmp|gif|pdf)$/i.test(name);

  const setDicomMessage = (message, isError = false) => {
    const list = document.getElementById('dicomList');
    if (state.dicomFiles.length === 0) {
      list.innerHTML = '';
      const placeholder = document.createElement('p');
      placeholder.className = `placeholder ${isError ? 'error' : ''}`;
      placeholder.textContent = message;
      list.appendChild(placeholder);
    }
  };

  // ===== DICOM LIST UI =====
  const renderDicomList = () => {
    const list = document.getElementById('dicomList');
    if (state.dicomFiles.length === 0) {
      list.innerHTML = '<p class="placeholder">No DICOM files attached</p>';
      return;
    }
    const ul = document.createElement('ul');
    state.dicomFiles.forEach((item, idx) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'fname';
      name.textContent = item.file.name;
      const size = document.createElement('span');
      size.className = 'fsize';
      size.textContent = formatBytes(item.file.size);
      li.append(name, size);
      li.style.cursor = 'pointer';
      li.style.color = idx === state.activeIndex && state.activeGeneralIndex === -1 ? '#60a5fa' : '#e5e7eb';
      li.addEventListener('click', () => {
        state.activeIndex = idx;
        state.activeGeneralIndex = -1;
        renderDicomList();
        renderGeneralList();
        loadSlice();
      });
      ul.appendChild(li);
    });
    list.innerHTML = '';
    list.appendChild(ul);
  };

  const renderGeneralList = () => {
    const list = document.getElementById('generalList');
    if (state.generalFiles.length === 0) {
      list.innerHTML = '<p class="placeholder">No files attached</p>';
      return;
    }
    const ul = document.createElement('ul');
    state.generalFiles.forEach((item, idx) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'fname';
      name.textContent = item.file.name;
      const size = document.createElement('span');
      size.className = 'fsize';
      size.textContent = formatBytes(item.file.size);
      li.append(name, size);
      li.style.cursor = 'pointer';
      li.style.color = idx === state.activeGeneralIndex ? '#60a5fa' : '#e5e7eb';
      li.addEventListener('click', () => {
        state.activeGeneralIndex = idx;
        renderGeneralList();
        renderDicomList();
        loadGeneralFile();
      });
      ul.appendChild(li);
    });
    list.innerHTML = '';
    list.appendChild(ul);
  };

  const updateAttachedTab = () => {
    const dicomUl = document.getElementById('attachedDicomList');
    const generalUl = document.getElementById('attachedGeneralList');
    dicomUl.innerHTML = '';
    generalUl.innerHTML = '';

    state.dicomFiles.forEach((item, idx) => {
      const li = document.createElement('li');
      li.className = idx === state.activeIndex && state.activeGeneralIndex === -1 ? 'active' : '';
      li.textContent = item.file.name;
      li.addEventListener('click', () => {
        state.activeIndex = idx; state.activeGeneralIndex = -1;
        renderDicomList(); renderGeneralList(); loadSlice();
      });
      dicomUl.appendChild(li);
    });

    state.generalFiles.forEach((item, idx) => {
      const li = document.createElement('li');
      li.className = idx === state.activeGeneralIndex ? 'active' : '';
      li.textContent = item.file.name;
      li.addEventListener('click', () => {
        state.activeGeneralIndex = idx;
        renderGeneralList(); renderDicomList(); loadGeneralFile();
      });
      generalUl.appendChild(li);
    });
  };

  // ===== PARSING =====
  const parseDicom = async (file) => {
    if (typeof dicomParser === 'undefined') {
      setDicomMessage('DICOM parser did not load. Check your internet connection, then refresh this local page.', true);
      return null;
    }

    const arrayBuffer = await readFileAsync(file);
    try {
      const byteArray = new Uint8Array(arrayBuffer);
      const dataSet = dicomParser.parseDicom(byteArray);
      const width = dataSet.uint16('x00280011') || dataSet.uint16('x00280010') || 512;
      const height = dataSet.uint16('x00280010') || dataSet.uint16('x00280011') || 512;
      const pixelData = getPixelData(dataSet);
      return { file, arrayBuffer, dataSet, pixelData, width, height };
    } catch (e) {
      console.warn('Failed to parse DICOM', file.name, e);
      setDicomMessage(`Could not read ${file.name || 'selected file'} as DICOM.`, true);
      return null;
    }
  };

  // ===== ZIP HANDLING =====
  const processZip = async (file) => {
    if (typeof JSZip === 'undefined') {
      setDicomMessage('ZIP support did not load. Check your internet connection, then refresh this local page.', true);
      return;
    }

    let zip;
    try {
      const zipData = await readFileAsync(file);
      zip = await JSZip.loadAsync(zipData);
    } catch (e) {
      console.warn('Failed to read ZIP archive', file.name, e);
      setDicomMessage(`Could not read ${file.name} as a ZIP archive.`, true);
      return;
    }

    const entries = [];
    zip.forEach((relativePath, zipEntry) => {
      if (!zipEntry.dir) entries.push(zipEntry);
    });

    for (const entry of entries) {
      const name = entry.name.toLowerCase();
      const blob = await entry.async('blob');
      const extractedFile = new File([blob], entry.name, { type: blob.type || 'application/octet-stream' });
      if (isGeneralPreviewFile(name)) {
        const objectURL = URL.createObjectURL(extractedFile);
        state.generalFiles.push({ file: extractedFile, objectURL, type: extractedFile.type });
      } else {
        const parsed = await parseDicom(extractedFile);
        if (parsed) state.dicomFiles.push(parsed);
      }
    }

    state.lastUploadedZip = file;
    if (state.dicomFiles.length === 0 && state.generalFiles.length === 0) {
      setDicomMessage(`No readable DICOM, image, or PDF files were found inside ${file.name}.`, true);
    }
  };

  // ===== FILE UPLOADS =====
  const handleDicomSelection = async (files) => {
    if (files.length === 0) return;
    setDicomMessage(`Reading ${files.length} selected file${files.length === 1 ? '' : 's'}...`);

    for (const file of files) {
      const name = file.name.toLowerCase();
      if (isZipArchive(name)) {
        await processZip(file);
      } else if (!isGeneralPreviewFile(name)) {
        const parsed = await parseDicom(file);
        if (parsed) state.dicomFiles.push(parsed);
      }
    }
    if (state.dicomFiles.length > 0 && state.activeGeneralIndex === -1) {
      state.activeIndex = 0;
      loadSlice();
      if (typeof appendChat === 'function') {
        appendChat(`Loaded scan context:\n${buildLoadedScanSummary()}\n\nI can answer questions about this loaded scan's metadata, slice count, dimensions, and displayed pixel statistics. I cannot provide a validated diagnosis from the image.`, 'ai');
      }
    }
    renderDicomList();
    updateAttachedTab();
  };

  const dicomInput = document.getElementById('dicomInput');
  const dicomFolderInput = document.getElementById('dicomFolderInput');
  document.getElementById('attachDicomBtn').addEventListener('click', () => dicomInput.click());
  document.getElementById('attachDicomFolderBtn').addEventListener('click', () => dicomFolderInput.click());

  dicomInput.addEventListener('change', async (e) => {
    await handleDicomSelection(Array.from(e.target.files));
    e.target.value = '';
  });

  dicomFolderInput.addEventListener('change', async (e) => {
    await handleDicomSelection(Array.from(e.target.files));
    e.target.value = '';
  });

  document.getElementById('generalInput').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    const firstNewIdx = state.generalFiles.length;
    for (const file of files) {
      const objectURL = URL.createObjectURL(file);
      state.generalFiles.push({ file, objectURL, type: file.type });
    }
    if (files.length > 0 && state.activeGeneralIndex === -1) {
      state.activeGeneralIndex = firstNewIdx;
      loadGeneralFile();
    }
    renderGeneralList();
    updateAttachedTab();
    e.target.value = '';
  });

  // ===== RENDERING =====
  const computeWindowedImageData = (pixelData, width, height, ww, wl) => {
    const out = ctx.createImageData(width, height);
    const data = out.data;
    const min = wl - ww / 2;
    const max = wl + ww / 2;
    let sum = 0, imgMin = Infinity, imgMax = -Infinity;
    for (let i = 0; i < pixelData.length; i++) {
      const val = pixelData[i];
      if (val < imgMin) imgMin = val;
      if (val > imgMax) imgMax = val;
      sum += val;
      let norm = ((val - min) / (max - min)) * 255;
      norm = Math.max(0, Math.min(255, norm));
      const idx = i * 4;
      data[idx] = norm;
      data[idx + 1] = norm;
      data[idx + 2] = norm;
      data[idx + 3] = 255;
    }
    state.imgMin = imgMin;
    state.imgMax = imgMax;
    state.imgMean = sum / pixelData.length;
    return out;
  };

  const getEffectiveScale = () => {
    const item = state.dicomFiles[state.activeIndex];
    const imgW = item ? item.width : (state.generalFiles[state.activeGeneralIndex] ? 512 : 512);
    const imgH = item ? item.height : (state.generalFiles[state.activeGeneralIndex] ? 512 : 512);
    const fitScale = getFitScale(imgW, imgH);
    return state.scale * fitScale;
  };

  const drawAnnotations = () => {
    const item = state.dicomFiles[state.activeIndex];
    const imgW = item ? item.width : canvas.width;
    const imgH = item ? item.height : canvas.height;
    const fitScale = getFitScale(imgW, imgH);
    const effectiveScale = state.scale * fitScale;
    const cx = imgW / 2;
    const cy = imgH / 2;
    ctx.save();
    ctx.translate(canvas.clientWidth / 2, canvas.clientHeight / 2);
    ctx.scale(effectiveScale, effectiveScale);
    ctx.translate(-cx + state.panX, -cy + state.panY);

    for (const ann of state.annotations) {
      ctx.strokeStyle = ann.color || '#f59e0b';
      ctx.fillStyle = ann.color || '#f59e0b';
      ctx.lineWidth = 2 / effectiveScale;
      if (ann.type === 'measure') {
        ctx.beginPath();
        ctx.moveTo(ann.points[0].x, ann.points[0].y);
        ctx.lineTo(ann.points[1].x, ann.points[1].y);
        ctx.stroke();
        const mx = (ann.points[0].x + ann.points[1].x) / 2;
        const my = (ann.points[0].y + ann.points[1].y) / 2;
        const dist = Math.hypot(ann.points[1].x - ann.points[0].x, ann.points[1].y - ann.points[0].y);
        const pxSpacing = getPixelSpacing();
        const mm = dist * pxSpacing;
        ctx.fillStyle = '#111';
        ctx.fillRect(mx - 20, my - 10, 70, 16);
        ctx.fillStyle = '#f59e0b';
        ctx.font = `${12 / effectiveScale}px sans-serif`;
        ctx.fillText(`${mm.toFixed(1)} mm`, mx - 18, my + 2);
      } else if (ann.type === 'rect') {
        const w = ann.points[1].x - ann.points[0].x;
        const h = ann.points[1].y - ann.points[0].y;
        ctx.strokeRect(ann.points[0].x, ann.points[0].y, w, h);
        if (ann.text) {
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(ann.points[0].x, ann.points[0].y - 14 / effectiveScale, ctx.measureText(ann.text).width + 6, 14 / effectiveScale);
          ctx.fillStyle = ann.color;
          ctx.font = `${12 / effectiveScale}px sans-serif`;
          ctx.fillText(ann.text, ann.points[0].x + 2, ann.points[0].y - 2);
        }
      } else if (ann.type === 'ellipse') {
        const cxE = (ann.points[0].x + ann.points[1].x) / 2;
        const cyE = (ann.points[0].y + ann.points[1].y) / 2;
        const rx = Math.abs(ann.points[1].x - ann.points[0].x) / 2;
        const ry = Math.abs(ann.points[1].y - ann.points[0].y) / 2;
        ctx.beginPath();
        ctx.ellipse(cxE, cyE, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (ann.type === 'annotate') {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(ann.points[0].x, ann.points[0].y, ctx.measureText(ann.text).width + 6, 16 / effectiveScale);
        ctx.fillStyle = ann.color;
        ctx.font = `${12 / effectiveScale}px sans-serif`;
        ctx.fillText(ann.text, ann.points[0].x + 2, ann.points[0].y + 12 / effectiveScale);
      }
    }

    if (state.tempAnnotation) {
      const ann = state.tempAnnotation;
      ctx.strokeStyle = '#f59e0b';
      ctx.setLineDash([4, 4]);
      if (ann.type === 'measure') {
        ctx.beginPath();
        ctx.moveTo(ann.points[0].x, ann.points[0].y);
        ctx.lineTo(ann.points[1].x, ann.points[1].y);
        ctx.stroke();
      } else if (ann.type === 'rect') {
        const w = ann.points[1].x - ann.points[0].x;
        const h = ann.points[1].y - ann.points[0].y;
        ctx.strokeRect(ann.points[0].x, ann.points[0].y, w, h);
      } else if (ann.type === 'ellipse') {
        const cxE = (ann.points[0].x + ann.points[1].x) / 2;
        const cyE = (ann.points[0].y + ann.points[1].y) / 2;
        const rx = Math.abs(ann.points[1].x - ann.points[0].x) / 2;
        const ry = Math.abs(ann.points[1].y - ann.points[0].y) / 2;
        ctx.beginPath();
        ctx.ellipse(cxE, cyE, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    ctx.restore();
  };

  const getPixelSpacing = () => {
    // Try to read from DICOM; default 1 mm/pixel
    const item = state.dicomFiles[state.activeIndex];
    if (!item || !item.dataSet) return 1;
    const el = item.dataSet.elements.x00280030;
    if (el && el.length > 0) {
      const str = item.dataSet.string('x00280030');
      const parts = str.split('\\');
      if (parts.length >= 1) return parseFloat(parts[0]) || 1;
    }
    return 1;
  };

  const fitCanvasToViewport = () => {
    const viewportRect = viewport.getBoundingClientRect();
    const vpW = viewportRect.width;
    const vpH = viewportRect.height;
    canvas.style.width = vpW + 'px';
    canvas.style.height = vpH + 'px';
  };

  const getFitScale = (imgW, imgH) => {
    const vpW = canvas.clientWidth || canvas.width;
    const vpH = canvas.clientHeight || canvas.height;
    return Math.min(vpW / imgW, vpH / imgH);
  };

  const renderSlice = () => {
    const item = state.dicomFiles[state.activeIndex];
    if (!item || !item.pixelData) return;
    const { width, height, pixelData } = item;
    // Set canvas internal resolution to image dimensions
    canvas.width = width;
    canvas.height = height;
    // Size canvas element to fill viewport
    fitCanvasToViewport();
    const imgData = computeWindowedImageData(pixelData, width, height, state.ww, state.wl);
    // putImageData ignores canvas transforms, so use an offscreen canvas + drawImage
    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    offscreen.getContext('2d').putImageData(imgData, 0, 0);
    const cx = width / 2;
    const cy = height / 2;
    // Base fit-to-viewport scale
    const fitScale = getFitScale(width, height);
    ctx.save();
    // 1. Translate to center of canvas element
    ctx.translate(canvas.clientWidth / 2, canvas.clientHeight / 2);
    // 2. Apply user zoom on top of fit scale
    ctx.scale(state.scale * fitScale, state.scale * fitScale);
    // 3. Apply user pan (in image-space coordinates)
    ctx.translate(-cx + state.panX, -cy + state.panY);
    ctx.drawImage(offscreen, 0, 0);
    ctx.restore();
    drawAnnotations();
    updateInfo();
  };

  const loadSlice = () => {
    if (state.dicomFiles.length === 0) return;
    emptyState.style.display = 'none';
    canvas.style.display = 'block';
    if (state.dicomFiles.length > 1) viewerNav.style.display = 'flex';
    document.getElementById('sliceInfo').textContent = `${state.activeIndex + 1} / ${state.dicomFiles.length}`;
    state.scale = 1; state.panX = 0; state.panY = 0;
    if (!state.annotationsBySlice[state.activeIndex]) state.annotationsBySlice[state.activeIndex] = [];
    state.annotations = state.annotationsBySlice[state.activeIndex];
    renderSlice();
    updateAttachedTab();
  };

  const drawGeneralImage = (img) => {
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    canvas.width = width;
    canvas.height = height;
    fitCanvasToViewport();
    const cx = width / 2;
    const cy = height / 2;
    const fitScale = getFitScale(width, height);
    ctx.save();
    ctx.translate(canvas.clientWidth / 2, canvas.clientHeight / 2);
    ctx.scale(state.scale * fitScale, state.scale * fitScale);
    ctx.translate(-cx + state.panX, -cy + state.panY);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
    drawAnnotations();
    state.imgMin = 0; state.imgMax = 255; state.imgMean = 128;
    updateInfo();
  };

  const loadGeneralFile = () => {
    const item = state.generalFiles[state.activeGeneralIndex];
    if (!item) return;
    emptyState.style.display = 'none';
    canvas.style.display = 'block';
    viewerNav.style.display = 'none';
    if (!state.annotationsByGeneralFile[item.objectURL]) {
      state.annotationsByGeneralFile[item.objectURL] = [];
    }
    state.annotations = state.annotationsByGeneralFile[item.objectURL];
    if (item.type.startsWith('image/')) {
      const cached = state.generalImageCache[item.objectURL];
      if (cached) {
        drawGeneralImage(cached);
      } else {
        const img = new Image();
        img.onload = () => {
          state.generalImageCache[item.objectURL] = img;
          drawGeneralImage(img);
        };
        img.src = item.objectURL;
      }
    } else {
      canvas.width = 512; canvas.height = 512;
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, 512, 512);
      ctx.fillStyle = '#e5e7eb';
      ctx.font = '16px sans-serif';
      ctx.fillText(`Preview not available for ${item.file.name}`, 40, 256);
      state.imgMin = 0; state.imgMax = 0; state.imgMean = 0;
      updateInfo();
    }
    updateAttachedTab();
  };

  const updateInfo = () => {
    document.getElementById('propDims').textContent = `${canvas.width} x ${canvas.height}`;
    document.getElementById('propMin').textContent = state.imgMin.toFixed(1);
    document.getElementById('propMax').textContent = state.imgMax.toFixed(1);
    document.getElementById('propMean').textContent = state.imgMean.toFixed(1);
  };

  const getDicomText = (dataSet, tag) => {
    if (!dataSet) return '';
    try {
      return dataSet.string(tag) || '';
    } catch (e) {
      return '';
    }
  };

  const formatDicomDate = (dateText) => {
    if (!/^\d{8}$/.test(dateText)) return dateText || 'not available';
    return `${dateText.slice(0, 4)}-${dateText.slice(4, 6)}-${dateText.slice(6, 8)}`;
  };

  const buildLoadedScanSummary = () => {
    if (state.dicomFiles.length === 0) {
      return 'No DICOM scan is currently loaded.';
    }

    const item = state.dicomFiles[state.activeIndex] || state.dicomFiles[0];
    const ds = item.dataSet;
    const modality = getDicomText(ds, 'x00080060') || 'not available';
    const studyDate = formatDicomDate(getDicomText(ds, 'x00080020'));
    const seriesDescription = getDicomText(ds, 'x0008103e') || 'not available';
    const bodyPart = getDicomText(ds, 'x00180015') || 'not available';
    const manufacturer = getDicomText(ds, 'x00080070') || 'not available';
    const rows = ds ? ds.uint16('x00280010') : item.height;
    const columns = ds ? ds.uint16('x00280011') : item.width;
    const spacing = getDicomText(ds, 'x00280030') || 'not available';

    return [
      `Loaded DICOM files/slices: ${state.dicomFiles.length}`,
      `Active slice: ${state.activeIndex + 1} / ${state.dicomFiles.length}`,
      `Active file: ${item.file.name}`,
      `Modality: ${modality}`,
      `Study date: ${studyDate}`,
      `Series: ${seriesDescription}`,
      `Body part: ${bodyPart}`,
      `Manufacturer: ${manufacturer}`,
      `Image matrix: ${columns || item.width} x ${rows || item.height}`,
      `Pixel spacing: ${spacing}`,
      `Displayed pixel stats: min ${state.imgMin.toFixed(1)}, max ${state.imgMax.toFixed(1)}, mean ${state.imgMean.toFixed(1)}`
    ].join('\n');
  };

  const summarizeSlicerMetrics = () => {
    const metrics = state.slicerResult?.metrics;
    const evansSummary = summarizeEvansMeasurement();
    if (!metrics) return `Local Slicer analysis: not run.\n${evansSummary}`;
    const hydro = metrics.hydrocephalus_metrics || {};
    const callosal = metrics.callosal_angle_workflow || {};
    const interpretation = metrics.interpretation || {};
    const lines = [
      evansSummary,
      `Local Slicer analysis status: ${state.slicerResult.status || metrics.status || 'unknown'}`,
      `Output: ${state.slicerResult.output_dir || metrics.output_dir || 'not available'}`,
      `Inferred modality: ${hydro.modality_inferred || 'unknown'}`,
      `Automated Evans index candidate: ${hydro.evans_index ?? 'not available'}`,
      `Evans >= 0.30: ${hydro.evans_index_supports_ventriculomegaly ?? 'not available'}`,
      `Frontal horn width (auto): ${hydro.frontal_horn_width_mm ?? 'n/a'} mm`,
      `Inner skull width (auto): ${hydro.inner_skull_width_mm ?? 'n/a'} mm`,
      `Ventricular asymmetry ratio: ${hydro.ventricular_asymmetry_ratio ?? 'not available'}`,
      `Estimated ventricular volume: ${hydro.ventricular_volume_estimate_ml ?? 'not available'} mL`,
      `Hydrocephalus metric confidence: ${hydro.confidence || hydro.status || 'not available'}`,
      `Callosal angle workflow: ${callosal.status || 'not available'}`,
      `Coronal package: ${callosal.coronal_reconstruction_package || 'not available'}`,
    ];
    if (interpretation.evans_index_comment) lines.push(`Interpretation: ${interpretation.evans_index_comment}`);
    if (interpretation.asymmetry_comment) lines.push(`Asymmetry note: ${interpretation.asymmetry_comment}`);
    if (Array.isArray(hydro.diagnostic_log) && hydro.diagnostic_log.length > 0) {
      lines.push(`Diagnostic log entries: ${hydro.diagnostic_log.length} (see metrics.json for details)`);
    }
    return lines.join('\n');
  };

  const getEvansCategory = (value) => {
    if (value === null || Number.isNaN(value)) return 'not_available';
    if (value < 0.30) return 'below_ventriculomegaly_threshold';
    if (value < 0.33) return 'borderline_or_mild_ventriculomegaly';
    return 'supports_ventriculomegaly';
  };

  const summarizeEvansMeasurement = () => {
    if (!state.evansMeasurement) return 'Manual/radiology Evans index: not entered.';
    const m = state.evansMeasurement;
    const parts = [
      `Manual/radiology Evans index: ${m.value.toFixed(3)}`,
      `Measurement source: ${m.source}`,
      `Evans interpretation band: ${m.category}`
    ];
    if (m.frontalHornWidthMm && m.innerSkullWidthMm) {
      parts.push(`Manual widths: frontal horns ${m.frontalHornWidthMm.toFixed(1)} mm / inner skull ${m.innerSkullWidthMm.toFixed(1)} mm`);
    }
    return parts.join('\n');
  };

  const setEvansStatus = (message, kind = '') => {
    const status = document.getElementById('evansStatus');
    if (!status) return;
    status.className = `engine-status ${kind}`;
    status.textContent = message;
  };

  const setDeshStatus = (message, kind = '') => {
    const status = document.getElementById('deshStatus');
    if (!status) return;
    status.className = `engine-status ${kind}`;
    status.textContent = message;
  };

  const saveEvansMeasurementFromInputs = () => {
    const directInput = document.getElementById('radiologyEvansIndex');
    const hornInput = document.getElementById('frontalHornWidth');
    const skullInput = document.getElementById('innerSkullWidth');
    const direct = parseFloat(directInput?.value || '');
    const horn = parseFloat(hornInput?.value || '');
    const skull = parseFloat(skullInput?.value || '');

    let value = null;
    let source = '';
    if (!Number.isNaN(direct) && direct > 0 && direct < 1) {
      value = direct;
      source = 'radiology_or_manual_entry';
    } else if (!Number.isNaN(horn) && !Number.isNaN(skull) && horn > 0 && skull > 0) {
      value = horn / skull;
      source = 'manual_width_calculation';
    }

    if (value === null) {
      setEvansStatus('Enter either a radiology/manual Evans index, or both width measurements.', 'error');
      return;
    }

    state.evansMeasurement = {
      value,
      source,
      category: getEvansCategory(value),
      frontalHornWidthMm: !Number.isNaN(horn) && horn > 0 ? horn : null,
      innerSkullWidthMm: !Number.isNaN(skull) && skull > 0 ? skull : null
    };

    setEvansStatus(summarizeEvansMeasurement().replace(/\n/g, ' | '), 'ok');
  };

  const saveDeshMeasurementFromInputs = () => {
    const deshSelect = document.getElementById('deshPatternToggle');
    const evansNumeric = document.getElementById('evansIndexNumeric');
    const deshValue = deshSelect?.value || '';
    const evansValue = parseFloat(evansNumeric?.value || '');

    if (deshValue === '' && Number.isNaN(evansValue)) {
      setDeshStatus('Select DESH yes/no or enter an Evans index.', 'error');
      return;
    }

    state.deshMeasurement = {
      deshPattern: deshValue === 'yes' ? true : (deshValue === 'no' ? false : null),
      evansIndex: !Number.isNaN(evansValue) && evansValue > 0 && evansValue < 1 ? evansValue : null,
      source: 'manual_frontend_entry'
    };

    const parts = [];
    if (state.deshMeasurement.deshPattern !== null) {
      parts.push(`DESH pattern: ${state.deshMeasurement.deshPattern ? 'Yes' : 'No'}`);
    }
    if (state.deshMeasurement.evansIndex !== null) {
      parts.push(`Evans index: ${state.deshMeasurement.evansIndex.toFixed(3)}`);
    }
    setDeshStatus(parts.join(' | ') || 'No data saved.', 'ok');
  };

  const renderSlicerResult = (payload) => {
    const status = document.getElementById('slicerStatus');
    const output = document.getElementById('slicerMetrics');
    if (!status || !output) return;

    const metrics = payload?.metrics || payload;
    const hydro = metrics?.hydrocephalus_metrics || {};
    const callosal = metrics?.callosal_angle_workflow || {};
    const interpretation = metrics?.interpretation || {};
    const statusText = payload?.status || metrics?.status || 'unknown';

    status.className = `engine-status ${statusText === 'completed' || statusText === 'loaded_successfully' ? 'ok' : ''}`;
    status.textContent = `Slicer result: ${statusText}. Experimental measurements require manual clinician/radiology confirmation.`;
    output.textContent = JSON.stringify({
      job_id: payload?.job_id,
      output_dir: payload?.output_dir || metrics?.output_dir,
      inferred_modality: hydro.modality_inferred,
      evans_index: hydro.evans_index,
      evans_index_supports_ventriculomegaly: hydro.evans_index_supports_ventriculomegaly,
      frontal_horn_width_mm: hydro.frontal_horn_width_mm,
      inner_skull_width_mm: hydro.inner_skull_width_mm,
      ventricular_asymmetry_ratio: hydro.ventricular_asymmetry_ratio,
      ventricular_volume_estimate_ml: hydro.ventricular_volume_estimate_ml,
      hydrocephalus_metric_confidence: hydro.confidence || hydro.status,
      callosal_angle_workflow: callosal.status,
      coronal_reconstruction_package: callosal.coronal_reconstruction_package,
      interpretation_comment: interpretation.evans_index_comment,
      asymmetry_comment: interpretation.asymmetry_comment,
      limitations: hydro.limitations || [],
      diagnostic_log: hydro.diagnostic_log || []
    }, null, 2);
  };

  const setSlicerStatus = (message, kind = '') => {
    const status = document.getElementById('slicerStatus');
    if (!status) return;
    status.className = `engine-status ${kind}`;
    status.textContent = message;
  };

  const getSlicerBaseUrl = () => (
    document.getElementById('slicerServiceUrl')?.value.trim() ||
    window.SLICER_SERVICE_URL ||
    'http://127.0.0.1:8787'
  );

  const checkLocalSlicerHealth = async (slicerServiceUrl) => {
    if (typeof window.checkSlicerHealth !== 'function') {
      throw new Error('Slicer client not loaded. Please refresh the page.');
    }
    return window.checkSlicerHealth({ slicerServiceUrl });
  };

  const analyzeLocalDicomWithSlicer = async ({ dicomDir, slicerServiceUrl }) => {
    if (typeof window.analyzeDicomWithSlicer !== 'function') {
      throw new Error('Slicer client not loaded. Please refresh the page.');
    }
    return window.analyzeDicomWithSlicer({ dicomDir, slicerServiceUrl });
  };

  const generateScanAwareResponse = (userMessage) => {
    const msg = userMessage.toLowerCase();
    const asksAboutLoadedScan = /(scan|dicom|image|slice|series|study|file|loaded|attached|result|finding|impression|report|metadata|dimension|pixel)/.test(msg);
    if (!asksAboutLoadedScan) return null;

    const summary = buildLoadedScanSummary();
    if (state.dicomFiles.length === 0) {
      return `${summary}\n\nAttach a DICOM file, DICOM folder, or ZIP archive first, then ask me about the loaded scan.`;
    }

    const clinicalLimit = `\n\nImportant: I can summarize technical metadata, displayed pixel statistics, and any returned local Slicer decision-support metrics. These are not validated radiology interpretation, diagnosis, or treatment instructions. Use the viewer, Slicer output, and report fields for clinician-reviewed observations.`;

    if (/(result|finding|impression|diagnos|hydrocephalus|nph|ex vacuo|hemorrhage|bleed|stroke)/.test(msg)) {
      return `Here is what I know from the loaded scan right now:\n\n${summary}\n\n${summarizeSlicerMetrics()}${clinicalLimit}\n\nFor clinical interpretation, document visible findings in the Report tab and review any 3D Slicer output with a radiologist/physician.`;
    }

    return `Here is the loaded scan context I can access:\n\n${summary}\n\n${summarizeSlicerMetrics()}${clinicalLimit}`;
  };

  const generateAppSkillResponse = (userMessage) => {
    const msg = userMessage.toLowerCase();
    const asksForSkills = /(skill|module|capabilit|what can you do|inherit|integrated|know about the app|tools)/.test(msg);
    const matchedSkills = appSkills.filter(skill =>
      skill.keywords.some(keyword => msg.includes(keyword)) || msg.includes(skill.name.toLowerCase())
    );

    if (!asksForSkills && matchedSkills.length === 0) return null;

    if (matchedSkills.length > 0) {
      return matchedSkills.map(skill => (
        `**${skill.name}**\n${skill.summary}\n\n**Use with current scan:** ${state.dicomFiles.length > 0 ? 'A DICOM scan is loaded, so I can combine this skill with available scan metadata and the active slice context.' : 'No DICOM scan is loaded yet; attach a scan first for scan-specific context.'}\n\n**Output:** ${skill.output}\n\n**Limit:** ${skill.limits}`
      )).join('\n\n');
    }

    return `Yes. I know the app's built-in clinical modules and can route questions to them:\n\n${appSkills.map(skill => `- **${skill.name}**: ${skill.summary}`).join('\n')}\n\n${state.dicomFiles.length > 0 ? `Current scan context is also available:\n${buildLoadedScanSummary()}` : 'No DICOM scan is loaded yet.'}\n\nImportant: these are decision-support skills and report scaffolds. They help organize evidence and doctor-facing questions, but they do not create a validated diagnosis.`;
  };

  const getReportFields = () => ({
    patientId: document.getElementById('patientId').value || '',
    studyDate: document.getElementById('studyDate').value || '',
    bodyPart: document.getElementById('bodyPart').value || '',
    clinicalHistory: document.getElementById('clinicalHistory').value || '',
    findings: document.getElementById('findings').value || '',
    impression: document.getElementById('impression').value || '',
    recommendations: document.getElementById('recommendations').value || '',
    evansMeasurement: state.evansMeasurement,
    deshMeasurement: state.deshMeasurement
  });

  // Optional: import sendClinicalChat from js/chatClient.js if using module bundler.
  // For script-tag usage, window.sendClinicalChat can be set by a module script.
  const tryServerAssistant = async (message) => {
    if (!['http:', 'https:'].includes(window.location.protocol)) return null;

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        message,
        scanContext: `${buildLoadedScanSummary()}\n\n${summarizeSlicerMetrics()}`,
        reportFields: getReportFields(),
        counterCheck: true
      })
    });

    if (!response.ok) return null;
    const payload = await response.json();
    return payload || null;
  };

  const AGENT_META = {
    radiology: { icon: '[R]', label: 'Radiology Agent' },
    neurology: { icon: '[N]', label: 'Neurology Agent' },
    medication: { icon: '[M]', label: 'Medication Agent' },
    rehab: { icon: '[Rehab]', label: 'Rehab Agent' },
    research: { icon: '[Research]', label: 'Research Agent' },
    nph_ex_vacuo: { icon: '[NPH]', label: 'NPH vs Ex Vacuo Agent' },
    mri_brain: { icon: '[MRI]', label: 'MRI Brain Specialist' }
  };

  const appendAiResponse = (data) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-bubble ai';

    // Human review warning
    if (data.requiresHumanReview === true) {
      const warning = document.createElement('div');
      warning.className = 'human-review-warning';
      warning.textContent = 'Warning: This response has low confidence and requires human clinician review before any action is taken.';
      wrapper.appendChild(warning);
    }

    // Answer text
    const body = document.createElement('div');
    body.innerHTML = formatChatText(data.answer || '');
    wrapper.appendChild(body);

    // Meta row: agent + confidence
    const meta = document.createElement('div');
    meta.className = 'chat-meta';

    if (data.agentUsed && AGENT_META[data.agentUsed]) {
      const agent = AGENT_META[data.agentUsed];
      const badge = document.createElement('span');
      badge.className = `agent-badge agent-${data.agentUsed}`;
      badge.textContent = `${agent.icon} ${agent.label}`;
      meta.appendChild(badge);
    }

    if (data.confidence) {
      const confBadge = document.createElement('span');
      confBadge.className = `confidence-${data.confidence}`;
      const confLabels = {
        high: 'High confidence',
        moderate: 'Moderate confidence - review recommended',
        low: 'Low confidence - human review required'
      };
      confBadge.textContent = confLabels[data.confidence] || data.confidence;
      meta.appendChild(confBadge);
    }

    if (meta.children.length > 0) {
      wrapper.appendChild(meta);
    }

    // Web sources with abstracts
    const webSources = Array.isArray(data.web_sources) ? data.web_sources : [];
    if (webSources.length > 0) {
      const sourcesBox = document.createElement('div');
      sourcesBox.className = 'sources-section';

      const sourcesHeader = document.createElement('div');
      sourcesHeader.className = 'sources-header';
      sourcesHeader.textContent = `Sources (${webSources.length})`;
      sourcesBox.appendChild(sourcesHeader);

      webSources.forEach((source) => {
        const item = document.createElement('div');
        item.className = 'source-item';

        const titleRow = document.createElement('div');
        titleRow.className = 'source-title-row';
        const link = document.createElement('a');
        link.className = 'source-title';
        link.href = source.url || '#';
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = source.title || 'Untitled source';
        titleRow.appendChild(link);
        item.appendChild(titleRow);

        const metaRow = document.createElement('div');
        metaRow.className = 'source-meta';
        const metaParts = [
          source.journal || source.sourceName,
          source.published || source.pubDate
        ].filter(Boolean);
        if (metaParts.length > 0) {
          metaRow.textContent = metaParts.join(' · ');
          item.appendChild(metaRow);
        }

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'abstract-toggle';
        toggle.textContent = 'Abstract';
        item.appendChild(toggle);

        const abstractBox = document.createElement('div');
        abstractBox.className = 'abstract-content';
        abstractBox.style.display = 'none';
        if (source.abstract) {
          abstractBox.textContent = source.abstract;
        } else {
          abstractBox.innerHTML = '<span class="abstract-unavailable">Abstract unavailable</span>';
        }
        item.appendChild(abstractBox);

        toggle.addEventListener('click', () => {
          const isCollapsed = abstractBox.style.display === 'none';
          abstractBox.style.display = isCollapsed ? 'block' : 'none';
          toggle.classList.toggle('expanded', isCollapsed);
        });

        sourcesBox.appendChild(item);
      });

      wrapper.appendChild(sourcesBox);
    }

    chatMessages.appendChild(wrapper);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  };

  // ===== WINDOW / LEVEL =====
  const wwSlider = document.getElementById('wwSlider');
  const wlSlider = document.getElementById('wlSlider');
  const wwValue = document.getElementById('wwValue');
  const wlValue = document.getElementById('wlValue');

  const updateWindowLevel = () => {
    state.ww = parseInt(wwSlider.value, 10);
    state.wl = parseInt(wlSlider.value, 10);
    wwValue.textContent = state.ww;
    wlValue.textContent = state.wl;
    if (state.activeGeneralIndex === -1) renderSlice();
  };
  wwSlider.addEventListener('input', updateWindowLevel);
  wlSlider.addEventListener('input', updateWindowLevel);

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      wwSlider.value = btn.dataset.ww;
      wlSlider.value = btn.dataset.wl;
      updateWindowLevel();
    });
  });

  // ===== TOOLS =====
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.tool = btn.dataset.tool;
    });
  });

  document.getElementById('clearAnnotations').addEventListener('click', () => {
    state.annotations.length = 0;
    if (state.activeGeneralIndex === -1) renderSlice(); else loadGeneralFile();
  });

  document.getElementById('resetView').addEventListener('click', () => {
    state.scale = 1; state.panX = 0; state.panY = 0;
    if (state.activeGeneralIndex === -1) renderSlice(); else loadGeneralFile();
  });

  // ===== MOUSE INTERACTIONS =====
  const toCanvasCoords = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    const item = state.dicomFiles[state.activeIndex];
    const imgW = item ? item.width : canvas.width;
    const imgH = item ? item.height : canvas.height;
    const fitScale = getFitScale(imgW, imgH);
    const effectiveScale = state.scale * fitScale;
    const cx = imgW / 2;
    const cy = imgH / 2;
    // Inverse of the render transform:
    // screenX = (imgX - cx + panX) * effectiveScale + canvas.clientWidth/2
    // So: imgX = (screenX - canvas.clientWidth/2) / effectiveScale + cx - panX
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    const x = (screenX - canvas.clientWidth / 2) / effectiveScale + cx - state.panX;
    const y = (screenY - canvas.clientHeight / 2) / effectiveScale + cy - state.panY;
    return { x, y };
  };

  canvas.addEventListener('mousedown', (e) => {
    state.isDragging = true;
    state.dragStart = { x: e.clientX, y: e.clientY };
    const pt = toCanvasCoords(e.clientX, e.clientY);
    if (state.tool === 'measure' || state.tool === 'rect' || state.tool === 'ellipse') {
      state.tempAnnotation = { type: state.tool, points: [pt, pt] };
    } else if (state.tool === 'annotate') {
      const text = prompt('Enter annotation text:');
      if (text) {
        state.annotations.push({ type: 'annotate', points: [pt], text, color: '#f59e0b' });
        if (state.activeGeneralIndex === -1) renderSlice(); else loadGeneralFile();
      }
      state.isDragging = false;
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!state.isDragging) return;
    const dx = e.clientX - state.dragStart.x;
    const dy = e.clientY - state.dragStart.y;
    if (state.tool === 'pan') {
      state.panX += dx;
      state.panY += dy;
      state.dragStart = { x: e.clientX, y: e.clientY };
      if (state.activeGeneralIndex === -1) renderSlice(); else loadGeneralFile();
    } else if (state.tool === 'window') {
      state.ww = Math.max(1, Math.min(4000, state.ww + dx * 2));
      state.wl = Math.max(-1000, Math.min(1000, state.wl + dy * 2));
      wwSlider.value = state.ww;
      wlSlider.value = state.wl;
      wwValue.textContent = Math.round(state.ww);
      wlValue.textContent = Math.round(state.wl);
      state.dragStart = { x: e.clientX, y: e.clientY };
      if (state.activeGeneralIndex === -1) renderSlice(); else loadGeneralFile();
    } else if (state.tool === 'zoom') {
      const delta = dy * -0.005;
      state.scale = Math.max(0.1, Math.min(10, state.scale + delta));
      state.dragStart = { x: e.clientX, y: e.clientY };
      if (state.activeGeneralIndex === -1) renderSlice(); else loadGeneralFile();
    } else if (state.tempAnnotation) {
      state.tempAnnotation.points[1] = toCanvasCoords(e.clientX, e.clientY);
      if (state.activeGeneralIndex === -1) renderSlice(); else loadGeneralFile();
    }
  });

  canvas.addEventListener('mouseup', (e) => {
    if (!state.isDragging) return;
    state.isDragging = false;
    if (state.tempAnnotation) {
      state.tempAnnotation.points[1] = toCanvasCoords(e.clientX, e.clientY);
      const ann = state.tempAnnotation;
      state.tempAnnotation = null;
      if (ann.type === 'measure') {
        const dist = Math.hypot(ann.points[1].x - ann.points[0].x, ann.points[1].y - ann.points[0].y);
        const pxSpacing = getPixelSpacing();
        const mm = dist * pxSpacing;
        state.annotations.push({ type: 'measure', points: ann.points, color: '#f59e0b' });
        addMeasurement(mm);
      } else if (ann.type === 'rect') {
        const text = prompt('ROI label (optional):') || '';
        state.annotations.push({ type: 'rect', points: ann.points, text, color: '#34d399' });
        computeRoiStats(ann.points, 'rect');
      } else if (ann.type === 'ellipse') {
        state.annotations.push({ type: 'ellipse', points: ann.points, color: '#60a5fa' });
        computeRoiStats(ann.points, 'ellipse');
      }
      if (state.activeGeneralIndex === -1) renderSlice(); else loadGeneralFile();
    }
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY * -0.001;
    state.scale = Math.max(0.1, Math.min(10, state.scale + delta));
    if (state.activeGeneralIndex === -1) renderSlice(); else loadGeneralFile();
  }, { passive: false });

  // ===== MEASUREMENTS =====
  const measurementList = document.getElementById('measurementList');
  const addMeasurement = (mm) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>Length</span><span>${mm.toFixed(1)} mm</span>`;
    measurementList.appendChild(li);
  };

  // ===== ROI STATS =====
  const computeRoiStats = (points, shape) => {
    const item = state.dicomFiles[state.activeIndex];
    if (!item || !item.pixelData) {
      document.getElementById('roiStats').textContent = 'ROI stats only available for DICOM data.';
      return;
    }
    const { width, pixelData } = item;
    const x1 = Math.min(points[0].x, points[1].x);
    const x2 = Math.max(points[0].x, points[1].x);
    const y1 = Math.min(points[0].y, points[1].y);
    const y2 = Math.max(points[0].y, points[1].y);
    let count = 0, sum = 0, min = Infinity, max = -Infinity;
    for (let y = Math.floor(y1); y <= Math.ceil(y2); y++) {
      for (let x = Math.floor(x1); x <= Math.ceil(x2); x++) {
        if (x < 0 || y < 0 || x >= item.width || y >= item.height) continue;
        let inside = true;
        if (shape === 'ellipse') {
          const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
          const rx = (x2 - x1) / 2, ry = (y2 - y1) / 2;
          inside = ((Math.pow(x - cx, 2) / Math.pow(rx, 2)) + (Math.pow(y - cy, 2) / Math.pow(ry, 2))) <= 1;
        }
        if (inside) {
          const idx = y * width + x;
          const v = pixelData[idx];
          sum += v; min = Math.min(min, v); max = Math.max(max, v); count++;
        }
      }
    }
    const mean = count ? (sum / count) : 0;
    document.getElementById('roiStats').innerHTML = `
      <div class="prop-row"><span>Pixels:</span> <span>${count}</span></div>
      <div class="prop-row"><span>Min:</span> <span>${min === Infinity ? '-' : min.toFixed(1)}</span></div>
      <div class="prop-row"><span>Max:</span> <span>${max === -Infinity ? '-' : max.toFixed(1)}</span></div>
      <div class="prop-row"><span>Mean:</span> <span>${mean.toFixed(1)}</span></div>
    `;
  };

  // ===== SLICE NAVIGATION =====
  document.getElementById('prevSlice').addEventListener('click', () => {
    if (state.activeIndex > 0) { state.activeIndex--; loadSlice(); }
  });
  document.getElementById('nextSlice').addEventListener('click', () => {
    if (state.activeIndex < state.dicomFiles.length - 1) { state.activeIndex++; loadSlice(); }
  });

  // ===== TABS =====
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab + 'Tab').classList.add('active');
    });
  });

  // ===== EXPORT IMAGE =====
  document.getElementById('exportImage').addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = `ctscan_slice_${state.activeIndex + 1}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  });

  // ===== REPORT =====
  document.getElementById('generateReport').addEventListener('click', () => {
    const patientId = document.getElementById('patientId').value || 'N/A';
    const studyDate = document.getElementById('studyDate').value || new Date().toISOString().split('T')[0];
    const bodyPart = document.getElementById('bodyPart').value;
    const history = document.getElementById('clinicalHistory').value;
    const findings = document.getElementById('findings').value;
    const impression = document.getElementById('impression').value;
    const recommendations = document.getElementById('recommendations').value;
    const evansReport = state.evansMeasurement
      ? `${state.evansMeasurement.value.toFixed(3)} (${state.evansMeasurement.source}; ${state.evansMeasurement.category})`
      : 'Not entered';

    const deshReport = state.deshMeasurement
      ? `DESH: ${state.deshMeasurement.deshPattern !== null ? (state.deshMeasurement.deshPattern ? 'Yes' : 'No') : 'N/A'}; Evans: ${state.deshMeasurement.evansIndex !== null ? state.deshMeasurement.evansIndex.toFixed(3) : 'N/A'}`
      : 'Not entered';

    const html = `
      <div style="font-family:Arial,sans-serif; line-height:1.5; color:#111;">
        <h2 style="text-align:center; margin-bottom:4px;">Radiology Report</h2>
        <hr>
        <table style="width:100%; font-size:14px; margin-bottom:12px;">
          <tr><td><strong>Patient ID:</strong></td><td>${escapeHtml(patientId)}</td></tr>
          <tr><td><strong>Study Date:</strong></td><td>${escapeHtml(studyDate)}</td></tr>
          <tr><td><strong>Body Part:</strong></td><td>${escapeHtml(bodyPart)}</td></tr>
        </table>
        <h3>Clinical History / Indication</h3>
        <p>${escapeHtml(history) || 'N/A'}</p>
        <h3>Findings</h3>
        <p>${escapeHtml(findings) || 'N/A'}</p>
        <h3>Decision-Support Measurements</h3>
        <p><strong>Evans index:</strong> ${escapeHtml(evansReport)}</p>
        <p><strong>DESH pattern:</strong> ${escapeHtml(deshReport)}</p>
        <h3>Impression</h3>
        <p>${escapeHtml(impression) || 'N/A'}</p>
        <h3>Recommendations</h3>
        <p>${escapeHtml(recommendations) || 'N/A'}</p>
        <hr>
        <p style="font-size:12px; color:#555;">
          <strong>Disclaimer:</strong> This report was generated using a demonstration/educational tool and does not constitute a medical diagnosis. Final interpretation should be performed by a board-certified radiologist.
        </p>
      </div>
    `;
    document.getElementById('reportOutput').innerHTML = html;
    document.getElementById('reportModal').classList.add('active');
  });

  document.getElementById('closeReport').addEventListener('click', () => {
    document.getElementById('reportModal').classList.remove('active');
  });

  const escapeHtml = (str) => {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const formatChatText = (text) => (
    escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>')
  );

  // ===== DROP ZONE =====
  viewport.addEventListener('dragover', (e) => { e.preventDefault(); viewport.style.border = '2px dashed #2563eb'; });
  viewport.addEventListener('dragleave', () => { viewport.style.border = 'none'; });
  viewport.addEventListener('drop', async (e) => {
    e.preventDefault();
    viewport.style.border = 'none';
    const files = Array.from(e.dataTransfer.files);
    for (const file of files) {
      const name = file.name.toLowerCase();
      if (isZipArchive(name)) {
        await processZip(file);
      } else if (!isGeneralPreviewFile(name)) {
        const parsed = await parseDicom(file);
        if (parsed) state.dicomFiles.push(parsed);
      } else if (isGeneralPreviewFile(name)) {
        const objectURL = URL.createObjectURL(file);
        state.generalFiles.push({ file, objectURL, type: file.type });
      }
    }
    if (state.dicomFiles.length > 0 && state.activeGeneralIndex === -1) {
      state.activeIndex = 0; loadSlice();
    } else if (state.generalFiles.length > 0 && state.activeGeneralIndex === -1) {
      state.activeGeneralIndex = 0; loadGeneralFile();
    }
    renderDicomList(); renderGeneralList(); updateAttachedTab();
  });

  // ===== AI CHAT =====
  const chatMessages = document.getElementById('chatMessages');
  const chatInput = document.getElementById('chatInput');
  const chatSend = document.getElementById('chatSend');

  const appendChat = (text, sender) => {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${sender}`;
    bubble.innerHTML = formatChatText(text);
    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  };

  const showTyping = () => {
    const typing = document.createElement('div');
    typing.className = 'typing';
    typing.id = 'typingIndicator';
    typing.innerHTML = '<span></span><span></span><span></span>';
    chatMessages.appendChild(typing);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  };

  const hideTyping = () => {
    const el = document.getElementById('typingIndicator');
    if (el) el.remove();
  };

  const sendChat = async () => {
    const text = chatInput.value.trim();
    if (!text) return;
    appendChat(text, 'user');
    chatInput.value = '';
    showTyping();
    // Simulate realistic latency
    await new Promise(r => setTimeout(r, 600 + Math.random() * 800));
    hideTyping();
    let payload = null;
    try {
      payload = await tryServerAssistant(text);
    } catch (e) {
      console.warn('Server assistant unavailable, using local fallback.', e);
    }
    if (payload && payload.answer) {
      appendAiResponse(payload);
      return;
    }
    const scanReply = generateScanAwareResponse(text);
    const skillReply = scanReply ? null : generateAppSkillResponse(text);
    const reply = scanReply || skillReply || (typeof generateResponse === 'function' ? generateResponse(text) : 'I am not available right now.');
    appendChat(reply, 'ai');
  };

  chatSend.addEventListener('click', sendChat);
  chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

  const saveEvansMeasurementButton = document.getElementById('saveEvansMeasurement');
  saveEvansMeasurementButton?.addEventListener('click', () => {
    saveEvansMeasurementFromInputs();
    if (state.evansMeasurement) {
      appendChat(`Saved Evans index measurement:\n${summarizeEvansMeasurement()}`, 'ai');
    }
  });

  const saveDeshAndEvansButton = document.getElementById('saveDeshAndEvans');
  saveDeshAndEvansButton?.addEventListener('click', () => {
    saveDeshMeasurementFromInputs();
    if (state.deshMeasurement) {
      const lines = [];
      if (state.deshMeasurement.deshPattern !== null) {
        lines.push(`DESH: ${state.deshMeasurement.deshPattern ? 'Yes' : 'No'}`);
      }
      if (state.deshMeasurement.evansIndex !== null) {
        lines.push(`Evans: ${state.deshMeasurement.evansIndex.toFixed(3)}`);
      }
      if (lines.length) {
        appendChat(`Saved DESH / Evans data:\n${lines.join('\n')}`, 'ai');
      }
    }
  });

  const slicerServiceUrlInput = document.getElementById('slicerServiceUrl');
  const slicerDicomDirInput = document.getElementById('slicerDicomDir');
  const checkSlicerHealthButton = document.getElementById('checkSlicerHealth');
  const runSlicerAnalysisButton = document.getElementById('runSlicerAnalysis');

  checkSlicerHealthButton?.addEventListener('click', async () => {
    const slicerServiceUrl = getSlicerBaseUrl();
    setSlicerStatus('Checking local Slicer service...');
    try {
      const health = await checkLocalSlicerHealth(slicerServiceUrl);
      const ready = health.slicer_exe_exists && health.slicer_script_exists;
      setSlicerStatus(
        ready
          ? `Service ready. Slicer: ${health.slicer_exe}`
          : `Service reachable, but configuration is incomplete. Slicer exe exists: ${health.slicer_exe_exists}; script exists: ${health.slicer_script_exists}.`,
        ready ? 'ok' : 'error'
      );
    } catch (err) {
      setSlicerStatus(`Service unavailable: ${err.message}. Start it with python service/server.py.`, 'error');
    }
  });

  runSlicerAnalysisButton?.addEventListener('click', async () => {
    const slicerServiceUrl = getSlicerBaseUrl();
    const dicomDir = slicerDicomDirInput?.value.trim();

    setSlicerStatus('Running local 3D Slicer analysis. This can take several minutes...');
    runSlicerAnalysisButton.disabled = true;
    try {
      let payload;
      if (dicomDir) {
        payload = await analyzeLocalDicomWithSlicer({ dicomDir, slicerServiceUrl });
      } else if (state.lastUploadedZip) {
        if (typeof window.uploadZipToSlicer !== 'function') {
          throw new Error('uploadZipToSlicer is not available. Make sure js/slicerClient.js is loaded.');
        }
        payload = await window.uploadZipToSlicer({ zipBlob: state.lastUploadedZip, slicerServiceUrl });
      } else {
        setSlicerStatus('Enter a real local folder path first, or load a ZIP archive. Browser-attached files are viewable here, but Slicer needs a filesystem folder or uploaded ZIP.', 'error');
        runSlicerAnalysisButton.disabled = false;
        return;
      }
      state.slicerResult = payload;
      renderSlicerResult(payload);
      appendChat(`Local Slicer analysis returned:\n${summarizeSlicerMetrics()}`, 'ai');
    } catch (err) {
      setSlicerStatus(`Slicer analysis failed: ${err.message}`, 'error');
    } finally {
      runSlicerAnalysisButton.disabled = false;
    }
  });

  document.querySelectorAll('.chat-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      chatInput.value = chip.textContent;
      sendChat();
    });
  });

  // ===== WINDOW RESIZE =====
  const handleResize = () => {
    if (state.activeGeneralIndex === -1 && state.dicomFiles.length > 0) {
      renderSlice();
    } else if (state.activeGeneralIndex >= 0 && state.generalFiles.length > 0) {
      const item = state.generalFiles[state.activeGeneralIndex];
      if (item && item.type.startsWith('image/')) {
        const cached = state.generalImageCache[item.objectURL];
        if (cached) drawGeneralImage(cached);
      }
    }
  };
  window.addEventListener('resize', handleResize);

  // Initial greeting
  appendChat(`Hello. I am your neurology and neurosurgery assistant. I can help with:
- Hydrocephalus types, imaging, and management
- Distinguishing hydrocephalus ex vacuo from true hydrocephalus
- Basal ganglia hemorrhage (putaminal, caudate, thalamic)
- General neurocritical care (ICP, GCS, stroke, herniation)

How can I assist you today?`, 'ai');
})();
