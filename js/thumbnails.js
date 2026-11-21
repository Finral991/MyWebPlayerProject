import { state } from './config.js';

export function applyCardBackground(entry, dataUrl) {
  if (!entry || !entry.el || !entry.bgEl) return;
  if (dataUrl) {
    entry.el.classList.add('has-thumb');
    entry.bgEl.style.backgroundImage = `url("${dataUrl}")`;
  } else {
    entry.el.classList.remove('has-thumb');
    entry.bgEl.style.backgroundImage = '';
  }
}

function captureVideoFrameDataUrl(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const probeVideo = document.createElement('video');
    probeVideo.preload = 'metadata';
    probeVideo.muted = true;
    probeVideo.playsInline = true;

    let settled = false;
    const finish = (result = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      probeVideo.removeAttribute('src');
      probeVideo.load();
      URL.revokeObjectURL(url);
      resolve(result);
    };

    const timeoutId = setTimeout(() => finish(null), 4500);

    probeVideo.addEventListener('error', () => finish(null), { once: true });

    probeVideo.addEventListener(
      'loadedmetadata',
      () => {
        const dur = probeVideo.duration;
        const target = Number.isFinite(dur) && dur > 2 ? Math.min(dur * 0.15, 90) : 0.5;
        probeVideo.currentTime = Math.max(0.1, target);
      },
      { once: true }
    );

    probeVideo.addEventListener(
      'seeked',
      () => {
        try {
          const vw = probeVideo.videoWidth;
          const vh = probeVideo.videoHeight;
          if (!vw || !vh) {
            finish(null);
            return;
          }
          const targetW = 360;
          const targetH = Math.max(1, Math.round((targetW * vh) / vw));
          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(probeVideo, 0, 0, targetW, targetH);
          finish(canvas.toDataURL('image/jpeg', 0.68));
        } catch {
          finish(null);
        }
      },
      { once: true }
    );

    probeVideo.src = url;
  });
}

export async function generateThumbnailsInBackground(genId) {
  if (state.thumbQueueRunning) return;
  state.thumbQueueRunning = true;

  try {
    for (const videoItem of state.videos) {
      if (genId !== state.thumbGenerationId) break;
      if (state.thumbnailCache.has(videoItem.path)) continue;

      try {
        const file = await videoItem.handle.getFile();
        if (genId !== state.thumbGenerationId) break;
        const dataUrl = await captureVideoFrameDataUrl(file);
        if (genId !== state.thumbGenerationId) break;

        if (dataUrl) {
          state.thumbnailCache.set(videoItem.path, dataUrl);
          for (const entry of state.visibleListItems) {
            if (entry.item.path === videoItem.path) {
              applyCardBackground(entry, dataUrl);
            }
          }
        }
      } catch {
        // Пропускаємо окреме відео без зупинки черги
      }
    }
  } finally {
    state.thumbQueueRunning = false;
  }
}