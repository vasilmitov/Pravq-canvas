// extension/lib/gdrive.js — Google Drive AppData Sync API client

const FILE_NAME = 'pravqgo_state.json';

// Get OAuth token via chrome.identity
export async function getAuthToken(interactive = true) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(token);
      }
    });
  });
}

// Fetch connected user's email
export async function getUserEmail(token) {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    const err = new Error(`Failed to fetch user email: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  return data.email;
}

// Remove cached token (for logging out / disconnecting)
export async function removeCachedToken(token) {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, resolve);
  });
}

// Search for the state file inside appDataFolder
async function findFileId(token) {
  const q = encodeURIComponent(`name = '${FILE_NAME}' and 'appDataFolder' in parents and trashed = false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    const err = new Error(`Drive search failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  return data.files && data.files.length > 0 ? data.files[0].id : null;
}

// Download state from Google Drive
export async function downloadState(token) {
  const fileId = await findFileId(token);
  if (!fileId) return null;

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    const err = new Error(`Drive download failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Upload state to Google Drive
export async function uploadState(token, state) {
  let fileId = await findFileId(token);
  const bodyContent = JSON.stringify(state);

  if (!fileId) {
    // 1. Create file metadata in appDataFolder
    const metadata = {
      name: FILE_NAME,
      parents: ['appDataFolder']
    };
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(metadata)
    });
    if (!createRes.ok) {
      const err = new Error(`Drive file metadata creation failed: ${createRes.status}`);
      err.status = createRes.status;
      throw err;
    }
    const fileData = await createRes.json();
    fileId = fileData.id;
  }

  // 2. Upload file content
  const uploadRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: bodyContent
  });
  if (!uploadRes.ok) {
    const err = new Error(`Drive content upload failed: ${uploadRes.status}`);
    err.status = uploadRes.status;
    throw err;
  }
  return true;
}

