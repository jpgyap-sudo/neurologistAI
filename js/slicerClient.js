export async function analyzeDicomWithSlicer({ dicomDir, slicerServiceUrl }) {
  const baseUrl = slicerServiceUrl || window.SLICER_SERVICE_URL || "http://127.0.0.1:8787";
  const response = await fetch(`${baseUrl}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dicom_dir: dicomDir })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.details || err.error || `Slicer HTTP ${response.status}`);
  }

  return response.json();
}

export async function checkSlicerHealth({ slicerServiceUrl } = {}) {
  const baseUrl = slicerServiceUrl || window.SLICER_SERVICE_URL || "http://127.0.0.1:8787";
  const response = await fetch(`${baseUrl}/health`);
  if (!response.ok) {
    throw new Error(`Slicer health HTTP ${response.status}`);
  }
  return response.json();
}

export async function uploadZipToSlicer({ zipBlob, slicerServiceUrl }) {
  const baseUrl = slicerServiceUrl || window.SLICER_SERVICE_URL || "http://127.0.0.1:8787";
  const response = await fetch(`${baseUrl}/upload-and-analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/zip" },
    body: zipBlob
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.details || err.error || `Slicer upload HTTP ${response.status}`);
  }

  return response.json();
}

window.analyzeDicomWithSlicer = analyzeDicomWithSlicer;
window.checkSlicerHealth = checkSlicerHealth;
window.uploadZipToSlicer = uploadZipToSlicer;
