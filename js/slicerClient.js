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
