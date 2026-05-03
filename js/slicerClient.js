const DEFAULT_BASE_URL = "http://127.0.0.1:8787";
const MAX_RETRIES = 2;
const FETCH_TIMEOUT_MS = 30000;

function getBaseUrl(slicerServiceUrl) {
  return slicerServiceUrl || (typeof window !== "undefined" && window.SLICER_SERVICE_URL) || DEFAULT_BASE_URL;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(id);
  }
}

async function safeFetch(url, options = {}, retries = MAX_RETRIES) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options);
      return response;
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

function parseErrorBody(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { detail: text || "Unknown error" };
  }
}

export async function analyzeDicomWithSlicer({ dicomDir, slicerServiceUrl }) {
  const baseUrl = getBaseUrl(slicerServiceUrl);
  let response;
  try {
    response = await safeFetch(`${baseUrl}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dicom_dir: dicomDir })
    });
  } catch (netErr) {
    const isAbort = netErr && netErr.name === "AbortError";
    throw new Error(
      isAbort
        ? `Slicer request timed out after ${FETCH_TIMEOUT_MS / 1000}s. Ensure the local Slicer service is running at ${baseUrl}`
        : `Network error connecting to Slicer service at ${baseUrl}. Is the service running? (${netErr.message})`
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const err = parseErrorBody(text);
    const detail = err.detail || err.error || err.message || `HTTP ${response.status}`;
    throw new Error(`Slicer analysis failed: ${detail}`);
  }

  return response.json();
}

export async function checkSlicerHealth({ slicerServiceUrl } = {}) {
  const baseUrl = getBaseUrl(slicerServiceUrl);
  let response;
  try {
    response = await safeFetch(`${baseUrl}/health`, {}, 0);
  } catch (netErr) {
    const isAbort = netErr && netErr.name === "AbortError";
    throw new Error(
      isAbort
        ? `Health check timed out. Slicer service may be unresponsive at ${baseUrl}.`
        : `Cannot reach Slicer service at ${baseUrl}. Please start it with: python service/server.py`
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Slicer health check returned HTTP ${response.status}: ${text}`);
  }
  return response.json();
}

export async function uploadZipToSlicer({ zipBlob, slicerServiceUrl }) {
  const baseUrl = getBaseUrl(slicerServiceUrl);
  let response;
  try {
    response = await safeFetch(`${baseUrl}/upload-and-analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/zip" },
      body: zipBlob
    });
  } catch (netErr) {
    const isAbort = netErr && netErr.name === "AbortError";
    throw new Error(
      isAbort
        ? `Upload timed out after ${FETCH_TIMEOUT_MS / 1000}s. Try a smaller archive or ensure the Slicer service is running.`
        : `Upload failed: cannot connect to Slicer service at ${baseUrl}. (${netErr.message})`
    );
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const err = parseErrorBody(text);
    const detail = err.detail || err.error || err.message || `HTTP ${response.status}`;
    throw new Error(`Slicer upload failed: ${detail}`);
  }

  return response.json();
}

window.analyzeDicomWithSlicer = analyzeDicomWithSlicer;
window.checkSlicerHealth = checkSlicerHealth;
window.uploadZipToSlicer = uploadZipToSlicer;
