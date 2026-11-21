import { FS_IDLE_DELAY_MS, SEEK_COMMIT_DELAY_MS, WATCHED_THRESHOLD, state, showErrorModal } from './config.js';
import { extractSeasonEpisodeLabel, formatTime, getDisplayFolderName } from './sorting.js';
import { applyListFocusVisual, saveProgress, syncActivePlaylistItemDOM } from './playlist.js';

const folderTitleEl = document.getElementById('folderTitle');
const episodeHighlightEl = document.getElementById('episodeHighlight');
const pauseInfoCard = document.getElementById('pauseInfoCard');
const pauseFolderNameEl = document.getElementById('pauseFolderName');
const pauseEpisodeBadgeEl = document.getElementById('pauseEpisodeBadge');
const prevEpisodeBtn = document.getElementById('prevEpisodeBtn');
const nextEpisodeBtn = document.getElementById('nextEpisodeBtn');

const seekEdgeLeft = document.getElementById('seekEdgeLeft');
const seekEdgeLeftVal = document.getElementById('seekEdgeLeftVal');
const seekEdgeRight = document.getElementById('seekEdgeRight');
const seekEdgeRightVal = document.getElementById('seekEdgeRightVal');

const playerStage = document.getElementById('playerStage');
export const videoPlayer = document.getElementById('videoPlayer');

const playPauseBtn = document.getElementById('playPauseBtn');
const playSvg = playPauseBtn.querySelector('.play-svg');
const pauseSvg = playPauseBtn.querySelector('.pause-svg');

const jumpLeftBtn = document.getElementById('jumpLeftBtn');
const jumpRightBtn = document.getElementById('jumpRightBtn');
const stepMenuBtn = document.getElementById('stepMenuBtn');
const stepMenu = document.getElementById('stepMenu');
const stepOptions = Array.from(document.querySelectorAll('.step-option[data-step]'));

const timeReadout = document.getElementById('timeReadout');
export const volumeControl = document.getElementById('volumeControl');
const muteBtn = document.getElementById('muteBtn');
const volHighSvg = muteBtn.querySelector('.vol-high-svg');
const volMutedSvg = muteBtn.querySelector('.vol-muted-svg');
const fullscreenBtn = document.getElementById('fullscreenBtn');

const seekSlider = document.getElementById('seekSlider');
const seekFill = document.getElementById('seekFill');
const seekTargetMarker = document.getElementById('seekTargetMarker');
const seekThumb = document.getElementById('seekThumb');
const seekTooltip = document.getElementById('seekTooltip');

const volumeSlider = document.getElementById('volumeSlider');
const volumeFill = document.getElementById('volumeFill');
const volumeThumb = document.getElementById('volumeThumb');

function syncPlayPauseIcon() {
  const paused = videoPlayer.paused;
  playSvg.classList.toggle('is-hidden', !paused);
  pauseSvg.classList.toggle('is-hidden', paused);
}

export function syncEpisodeNavButtons() {
  const hasPrev = state.currentIndex > 0;
  const hasNext = state.currentIndex >= 0 && state.currentIndex + 1 < state.videos.length;
  prevEpisodeBtn.disabled = !hasPrev;
  nextEpisodeBtn.disabled = !hasNext;
}

function syncPauseOverlayVisibility() {
  const isFullscreen = document.fullscreenElement === playerStage;
  const isPaused = videoPlayer.paused || !videoPlayer.src;
  pauseInfoCard.classList.toggle('is-visible', isFullscreen && isPaused);
}

export function updateHeaderForVideo(item) {
  if (!item) {
    const folderLabel = state.rootFolderName || 'Тека не обрана';
    const epLabel = 'Обери серію зі списку';
    folderTitleEl.textContent = folderLabel;
    episodeHighlightEl.textContent = epLabel;
    pauseFolderNameEl.textContent = folderLabel;
    pauseEpisodeBadgeEl.textContent = epLabel;
    syncEpisodeNavButtons();
    return;
  }

  const folderLabel = getDisplayFolderName(item.path);
  const epLabel = extractSeasonEpisodeLabel(item.path);
  folderTitleEl.textContent = folderLabel;
  episodeHighlightEl.textContent = epLabel;
  pauseFolderNameEl.textContent = folderLabel;
  pauseEpisodeBadgeEl.textContent = epLabel;
  syncEpisodeNavButtons();
}

function setSliderVisual(fillEl, thumbEl, sliderEl, ratio) {
  const clamped = Math.min(1, Math.max(0, ratio || 0));
  const pct = clamped * 100;
  fillEl.style.width = `${pct}%`;
  thumbEl.style.left = `${pct}%`;
  sliderEl.setAttribute('aria-valuenow', String(Math.round(pct)));
}

export function updateSeekUI(previewTime = null) {
  const dur = videoPlayer.duration || 0;
  const cur = previewTime !== null ? previewTime : videoPlayer.currentTime || 0;
  const ratio = dur > 0 ? cur / dur : 0;
  setSliderVisual(seekFill, seekThumb, seekSlider, ratio);
  timeReadout.textContent = `${formatTime(videoPlayer.currentTime)} / ${formatTime(dur)}`;
}

export function updateVolumeUI() {
  const isMuted = videoPlayer.muted || videoPlayer.volume === 0;
  const vol = isMuted ? 0 : videoPlayer.volume;
  setSliderVisual(volumeFill, volumeThumb, volumeSlider, vol);
  volHighSvg.classList.toggle('is-hidden', isMuted);
  volMutedSvg.classList.toggle('is-hidden', !isMuted);
}

function hideSeekPreviewVisuals() {
  seekSlider.classList.remove('is-seeking-preview');
  seekEdgeLeft.classList.remove('is-active');
  seekEdgeRight.classList.remove('is-active');
  seekTargetMarker.style.opacity = '0';
}

export function resetPendingSeek() {
  clearTimeout(state.seekCommitTimer);
  state.seekCommitTimer = null;
  state.pendingSeekOffset = 0;
  hideSeekPreviewVisuals();
}

function syncSeekPreviewVisuals() {
  const dur = videoPlayer.duration || 0;
  const cur = videoPlayer.currentTime || 0;

  if (state.pendingSeekOffset === 0 || !dur) {
    hideSeekPreviewVisuals();
    return;
  }

  seekSlider.classList.add('is-seeking-preview');

  const targetTime = Math.min(dur, Math.max(0, cur + state.pendingSeekOffset));
  const targetRatio = dur > 0 ? targetTime / dur : 0;
  seekTargetMarker.style.left = `${targetRatio * 100}%`;
  seekTargetMarker.style.opacity = '1';

  const absSec = Math.abs(Math.round(state.pendingSeekOffset));
  if (state.pendingSeekOffset < 0) {
    seekEdgeLeftVal.textContent = `-${absSec}с`;
    seekEdgeLeft.classList.add('is-active');
    seekEdgeRight.classList.remove('is-active');
  } else {
    seekEdgeRightVal.textContent = `+${absSec}с`;
    seekEdgeRight.classList.add('is-active');
    seekEdgeLeft.classList.remove('is-active');
  }
}

function commitPendingSeek() {
  const dur = videoPlayer.duration || 0;
  const offset = state.pendingSeekOffset;
  state.pendingSeekOffset = 0;
  state.seekCommitTimer = null;
  hideSeekPreviewVisuals();

  if (!dur || offset === 0) return;

  const next = Math.min(dur, Math.max(0, videoPlayer.currentTime + offset));
  videoPlayer.currentTime = next;
  updateSeekUI(next);

  if (state.currentIndex !== -1 && state.videos[state.currentIndex]) {
    saveProgress(state.videos[state.currentIndex].path, videoPlayer.currentTime, videoPlayer.duration, {
      persistNow: true,
    });
  }
}

export function queueJumpBySeconds(deltaSeconds) {
  if (!videoPlayer.duration) return;
  wakeFullscreenControls();
  state.pendingSeekOffset += deltaSeconds;
  syncSeekPreviewVisuals();

  clearTimeout(state.seekCommitTimer);
  state.seekCommitTimer = setTimeout(commitPendingSeek, SEEK_COMMIT_DELAY_MS);
}

export function togglePlay() {
  if (!videoPlayer.src) return;
  if (videoPlayer.paused) {
    videoPlayer.play().catch(() => {});
  } else {
    videoPlayer.pause();
  }
}

export function closeStepMenu() {
  stepMenu.classList.add('is-hidden');
  stepMenuBtn.setAttribute('aria-expanded', 'false');
}

export function isStepMenuOpen() {
  return !stepMenu.classList.contains('is-hidden');
}

export function toggleFullscreen() {
  if (!document.fullscreenElement) {
    playerStage.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
}

export function exitFullscreenIfActive() {
  if (document.fullscreenElement) {
    document.exitFullscreen?.().catch(() => {});
    return true;
  }
  return false;
}

export function wakeFullscreenControls() {
  playerStage.classList.remove('fs-idle');
  clearTimeout(state.fsIdleTimer);
  if (document.fullscreenElement === playerStage && !videoPlayer.paused) {
    state.fsIdleTimer = setTimeout(() => {
      playerStage.classList.add('fs-idle');
    }, FS_IDLE_DELAY_MS);
  }
}

function attachSliderInteraction(sliderEl, onChangeRatio, onPreviewRatio = null) {
  let dragging = false;

  const ratioFromClientX = (clientX) => {
    const rect = sliderEl.getBoundingClientRect();
    if (!rect.width) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };

  sliderEl.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    resetPendingSeek();
    dragging = true;
    sliderEl.classList.add('dragging');
    sliderEl.setPointerCapture(e.pointerId);
    onChangeRatio(ratioFromClientX(e.clientX));
  });

  sliderEl.addEventListener('pointermove', (e) => {
    const ratio = ratioFromClientX(e.clientX);
    if (onPreviewRatio) onPreviewRatio(ratio, e.clientX);
    if (dragging) {
      onChangeRatio(ratio);
    }
  });

  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    sliderEl.classList.remove('dragging');
    if (e && sliderEl.hasPointerCapture(e.pointerId)) {
      sliderEl.releasePointerCapture(e.pointerId);
    }
    if (sliderEl === seekSlider && state.currentIndex !== -1 && state.videos[state.currentIndex]) {
      saveProgress(state.videos[state.currentIndex].path, videoPlayer.currentTime, videoPlayer.duration, {
        persistNow: true,
      });
    }
  };

  sliderEl.addEventListener('pointerup', endDrag);
  sliderEl.addEventListener('pointercancel', endDrag);
}

export async function selectVideo(index, { autoplay = false } = {}) {
  if (index < 0 || index >= state.videos.length) return;
  const reqId = ++state.selectRequestId;
  resetPendingSeek();

  if (state.pendingMetadataHandler) {
    videoPlayer.removeEventListener('loadedmetadata', state.pendingMetadataHandler);
    state.pendingMetadataHandler = null;
  }

  state.currentIndex = index;
  const item = state.videos[index];

  const posInVisible = state.visibleListItems.findIndex((entry) => entry.item.index === index);
  if (posInVisible >= 0) {
    state.focusedListIndex = posInVisible;
    applyListFocusVisual({ scrollIntoView: false });
  }
  syncActivePlaylistItemDOM();

  try {
    videoPlayer.pause();
    syncPlayPauseIcon();
    syncPauseOverlayVisibility();

    const file = await item.handle.getFile();
    if (reqId !== state.selectRequestId) return;

    if (state.currentObjectUrl) {
      URL.revokeObjectURL(state.currentObjectUrl);
      state.currentObjectUrl = null;
    }

    const nextUrl = URL.createObjectURL(file);
    if (reqId !== state.selectRequestId) {
      URL.revokeObjectURL(nextUrl);
      return;
    }

    state.currentObjectUrl = nextUrl;
    videoPlayer.src = state.currentObjectUrl;
    updateHeaderForVideo(item);
    updateSeekUI(0);

    const saved = state.progressCache[item.path];
    if (saved && saved.currentTime && saved.percent < WATCHED_THRESHOLD) {
      state.pendingMetadataHandler = () => {
        state.pendingMetadataHandler = null;
        if (reqId !== state.selectRequestId) return;
        videoPlayer.currentTime = Math.min(saved.currentTime, videoPlayer.duration || saved.currentTime);
        updateSeekUI();
      };
      videoPlayer.addEventListener('loadedmetadata', state.pendingMetadataHandler, { once: true });
    }

    if (autoplay) {
      try {
        await videoPlayer.play();
      } catch {
        // Автоплей може бути заблокований браузером
      }
    }
  } catch (err) {
    if (reqId !== state.selectRequestId) return;
    showErrorModal({
      title: 'Помилка відкриття відео',
      message: `Не вдалося завантажити файл «${item.name}».`,
      details: err?.message || String(err),
    });
  }
}

export function initPlayerEvents() {
  attachSliderInteraction(
    seekSlider,
    (ratio) => {
      if (!videoPlayer.duration) return;
      const targetTime = ratio * videoPlayer.duration;
      videoPlayer.currentTime = targetTime;
      updateSeekUI(targetTime);
    },
    (ratio, clientX) => {
      if (!videoPlayer.duration) return;
      const rect = seekSlider.getBoundingClientRect();
      const localX = Math.min(rect.width, Math.max(0, clientX - rect.left));
      seekTooltip.style.left = `${localX}px`;
      seekTooltip.textContent = formatTime(ratio * videoPlayer.duration);
    }
  );

  attachSliderInteraction(volumeSlider, (ratio) => {
    videoPlayer.muted = ratio === 0;
    videoPlayer.volume = ratio;
    updateVolumeUI();
  });

  stepMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = stepMenu.classList.contains('is-hidden');
    stepMenu.classList.toggle('is-hidden', !willOpen);
    stepMenuBtn.setAttribute('aria-expanded', String(willOpen));
  });

  stepOptions.forEach((opt) => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      const stepVal = Number(opt.dataset.step);
      if (!Number.isNaN(stepVal)) {
        state.jumpStepSec = stepVal;
        stepMenuBtn.textContent = `${state.jumpStepSec}с ▾`;
        stepOptions.forEach((item) => item.classList.toggle('is-selected', item === opt));
      }
      closeStepMenu();
    });
  });

  prevEpisodeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.currentIndex > 0) {
      selectVideo(state.currentIndex - 1, { autoplay: true });
    }
  });

  nextEpisodeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (state.currentIndex + 1 < state.videos.length) {
      selectVideo(state.currentIndex + 1, { autoplay: true });
    }
  });

  document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement === playerStage) {
      wakeFullscreenControls();
    } else {
      clearTimeout(state.fsIdleTimer);
      playerStage.classList.remove('fs-idle');
    }
    syncPauseOverlayVisibility();
  });

  playerStage.addEventListener('mousemove', wakeFullscreenControls);
  playerStage.addEventListener('pointerdown', wakeFullscreenControls);

  playPauseBtn.addEventListener('click', togglePlay);
  videoPlayer.addEventListener('click', togglePlay);
  videoPlayer.addEventListener('dblclick', (e) => {
    e.preventDefault();
    toggleFullscreen();
  });

  jumpLeftBtn.addEventListener('click', () => queueJumpBySeconds(-state.jumpStepSec));
  jumpRightBtn.addEventListener('click', () => queueJumpBySeconds(state.jumpStepSec));

  muteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!volumeControl.classList.contains('is-open')) {
      volumeControl.classList.add('is-open');
      return;
    }
    videoPlayer.muted = !videoPlayer.muted;
    updateVolumeUI();
  });

  fullscreenBtn.addEventListener('click', toggleFullscreen);

  videoPlayer.addEventListener('play', () => {
    syncPlayPauseIcon();
    closeStepMenu();
    volumeControl.classList.remove('is-open');
    syncPauseOverlayVisibility();
    wakeFullscreenControls();
  });

  videoPlayer.addEventListener('pause', () => {
    syncPlayPauseIcon();
    syncPauseOverlayVisibility();
    clearTimeout(state.fsIdleTimer);
    playerStage.classList.remove('fs-idle');
    if (state.currentIndex !== -1 && state.videos[state.currentIndex]) {
      saveProgress(state.videos[state.currentIndex].path, videoPlayer.currentTime, videoPlayer.duration, {
        persistNow: true,
      });
    }
  });

  videoPlayer.addEventListener('loadedmetadata', () => {
    updateSeekUI();
  });

  videoPlayer.addEventListener('volumechange', updateVolumeUI);

  videoPlayer.addEventListener('timeupdate', () => {
    updateSeekUI();
    if (state.currentIndex === -1 || !state.videos[state.currentIndex]) return;
    const now = Date.now();
    if (now - state.lastSaveTime > 2000) {
      state.lastSaveTime = now;
      saveProgress(state.videos[state.currentIndex].path, videoPlayer.currentTime, videoPlayer.duration, {
        persistNow: true,
      });
    }
  });

  videoPlayer.addEventListener('ended', () => {
    resetPendingSeek();
    if (state.currentIndex !== -1 && state.videos[state.currentIndex]) {
      const finishedIndex = state.currentIndex;
      const finishedPath = state.videos[finishedIndex].path;
      saveProgress(finishedPath, videoPlayer.duration, videoPlayer.duration, {
        persistNow: true,
        forceReorganize: true,
      });
      if (finishedIndex + 1 < state.videos.length) {
        selectVideo(finishedIndex + 1, { autoplay: true });
      }
    }
  });

  updateVolumeUI();
  syncPlayPauseIcon();
  syncPauseOverlayVisibility();
}