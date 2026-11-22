import {
  DEFAULT_UI_SETTINGS,
  FS_IDLE_DELAY_MS,
  SEEK_COMMIT_DELAY_MS,
  SETTINGS_STORAGE_KEY,
  WATCHED_THRESHOLD,
  state,
  showErrorModal,
} from './config.js';
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
const customControlsEl = document.getElementById('customControls');
export const videoPlayer = document.getElementById('videoPlayer');

const centerPlayBtn = document.getElementById('centerPlayBtn');
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
const seekTargetMarker = document.getElementById('seekTargetMarker');
const seekTooltip = document.getElementById('seekTooltip');

const volumeSlider = document.getElementById('volumeSlider');

// Налаштування повноекранного режиму
const openSettingsBtn = document.getElementById('openSettingsBtn');
const settingsOverlay = document.getElementById('settingsOverlay');
const settingsCloseBtn = document.getElementById('settingsCloseBtn');
const settingsDoneBtn = document.getElementById('settingsDoneBtn');
const resetSettingsBtn = document.getElementById('resetSettingsBtn');
const dockChips = Array.from(document.querySelectorAll('.option-pills[data-setting="dock"] .chip'));
const pausePosChips = Array.from(document.querySelectorAll('.option-pills[data-setting="pausePos"] .chip'));
const toggleHideSeekBar = document.getElementById('toggleHideSeekBar');
const toggleHideJumpControls = document.getElementById('toggleHideJumpControls');
const toggleHideVolume = document.getElementById('toggleHideVolume');

function isVerticalSeekMode() {
  return (
    document.fullscreenElement === playerStage &&
    (state.uiSettings.dock === 'left' || state.uiSettings.dock === 'right')
  );
}

export function loadUISettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
    state.uiSettings = { ...DEFAULT_UI_SETTINGS, ...saved };
  } catch {
    state.uiSettings = { ...DEFAULT_UI_SETTINGS };
  }
  applyUISettings();
}

function saveUISettings() {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(state.uiSettings));
  } catch {
    // Ігноруємо помилку сховища
  }
}

export function applyUISettings() {
  const { dock, pausePos, hideSeekBar, hideJumpControls, hideVolume } = state.uiSettings;

  playerStage.classList.remove('dock-bottom', 'dock-top', 'dock-left', 'dock-right');
  playerStage.classList.add(`dock-${dock}`);

  pauseInfoCard.classList.remove(
    'pause-pos-top-left',
    'pause-pos-top-right',
    'pause-pos-bottom-left',
    'pause-pos-bottom-right'
  );
  pauseInfoCard.classList.add(`pause-pos-${pausePos}`);

  customControlsEl.classList.toggle('hide-seek-bar', Boolean(hideSeekBar));
  customControlsEl.classList.toggle('hide-jump-controls', Boolean(hideJumpControls));
  customControlsEl.classList.toggle('hide-volume', Boolean(hideVolume));

  dockChips.forEach((chip) => chip.classList.toggle('is-active', chip.dataset.value === dock));
  pausePosChips.forEach((chip) => chip.classList.toggle('is-active', chip.dataset.value === pausePos));
  toggleHideSeekBar.checked = Boolean(hideSeekBar);
  toggleHideJumpControls.checked = Boolean(hideJumpControls);
  toggleHideVolume.checked = Boolean(hideVolume);
}

export function openSettingsModal() {
  if (document.fullscreenElement) return;
  videoPlayer.pause();
  applyUISettings();
  settingsOverlay.classList.remove('is-hidden');
}

export function closeSettingsModal() {
  settingsOverlay.classList.add('is-hidden');
}

export function isSettingsModalOpen() {
  return !settingsOverlay.classList.contains('is-hidden');
}

function syncPlayPauseIcon() {
  const paused = videoPlayer.paused;
  playSvg.classList.toggle('is-hidden', !paused);
  pauseSvg.classList.toggle('is-hidden', paused);
  centerPlayBtn.classList.toggle('is-visible', paused || !videoPlayer.src);
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

function setSliderVisual(sliderEl, ratio) {
  const clamped = Math.min(1, Math.max(0, ratio || 0));
  const pct = clamped * 100;
  sliderEl.style.setProperty('--slider-pct', `${pct}%`);
  sliderEl.setAttribute('aria-valuenow', String(Math.round(pct)));
}

export function updateSeekUI(previewTime = null) {
  const dur = videoPlayer.duration || 0;
  const cur = previewTime !== null ? previewTime : videoPlayer.currentTime || 0;
  const ratio = dur > 0 ? cur / dur : 0;
  setSliderVisual(seekSlider, ratio);
  timeReadout.textContent = `${formatTime(videoPlayer.currentTime)} / ${formatTime(dur)}`;
}

export function updateVolumeUI() {
  const isMuted = videoPlayer.muted || videoPlayer.volume === 0;
  const vol = isMuted ? 0 : videoPlayer.volume;
  setSliderVisual(volumeSlider, vol);
  volHighSvg.classList.toggle('is-hidden', isMuted);
  volMutedSvg.classList.toggle('is-hidden', !isMuted);
}

export function toggleMute() {
  if (videoPlayer.muted || videoPlayer.volume === 0) {
    videoPlayer.muted = false;
    if (videoPlayer.volume === 0) {
      videoPlayer.volume = 0.6;
    }
  } else {
    videoPlayer.muted = true;
  }
  updateVolumeUI();
  wakeFullscreenControls();
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
  seekSlider.style.setProperty('--target-pct', `${targetRatio * 100}%`);
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
    closeSettingsModal();
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

// У повноекранному режимі ховає всі елементи після бездіяльності мишки (навіть на паузі — для чистих скріншотів)
export function wakeFullscreenControls() {
  playerStage.classList.remove('fs-idle');
  clearTimeout(state.fsIdleTimer);
  if (document.fullscreenElement === playerStage) {
    state.fsIdleTimer = setTimeout(() => {
      if (customControlsEl.matches(':hover') || pauseInfoCard.matches(':hover')) return;
      playerStage.classList.add('fs-idle');
    }, FS_IDLE_DELAY_MS);
  }
}

function attachSliderInteraction(sliderEl, onChangeRatio, onPreviewRatio = null, checkVertical = null) {
  let dragging = false;

  const ratioFromPointer = (e) => {
    const rect = sliderEl.getBoundingClientRect();
    const vertical = Boolean(checkVertical && checkVertical());
    if (vertical) {
      if (!rect.height) return 0;
      return Math.min(1, Math.max(0, 1 - (e.clientY - rect.top) / rect.height));
    }
    if (!rect.width) return 0;
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  };

  sliderEl.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    resetPendingSeek();
    dragging = true;
    sliderEl.classList.add('dragging');
    sliderEl.setPointerCapture(e.pointerId);
    onChangeRatio(ratioFromPointer(e));
  });

  sliderEl.addEventListener('pointermove', (e) => {
    const ratio = ratioFromPointer(e);
    if (onPreviewRatio) onPreviewRatio(ratio, e, Boolean(checkVertical && checkVertical()));
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
  loadUISettings();

  openSettingsBtn.addEventListener('click', openSettingsModal);
  settingsCloseBtn.addEventListener('click', closeSettingsModal);
  settingsDoneBtn.addEventListener('click', closeSettingsModal);
  settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) closeSettingsModal();
  });

  dockChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      state.uiSettings.dock = chip.dataset.value;
      applyUISettings();
      saveUISettings();
    });
  });

  pausePosChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      state.uiSettings.pausePos = chip.dataset.value;
      applyUISettings();
      saveUISettings();
    });
  });

  toggleHideSeekBar.addEventListener('change', () => {
    state.uiSettings.hideSeekBar = toggleHideSeekBar.checked;
    applyUISettings();
    saveUISettings();
  });

  toggleHideJumpControls.addEventListener('change', () => {
    state.uiSettings.hideJumpControls = toggleHideJumpControls.checked;
    applyUISettings();
    saveUISettings();
  });

  toggleHideVolume.addEventListener('change', () => {
    state.uiSettings.hideVolume = toggleHideVolume.checked;
    applyUISettings();
    saveUISettings();
  });

  resetSettingsBtn.addEventListener('click', () => {
    state.uiSettings = { ...DEFAULT_UI_SETTINGS };
    applyUISettings();
    saveUISettings();
  });

  attachSliderInteraction(
    seekSlider,
    (ratio) => {
      if (!videoPlayer.duration) return;
      const targetTime = ratio * videoPlayer.duration;
      videoPlayer.currentTime = targetTime;
      updateSeekUI(targetTime);
    },
    (ratio, e, vertical) => {
      if (!videoPlayer.duration) return;
      const rect = seekSlider.getBoundingClientRect();
      if (vertical) {
        const localY = Math.min(rect.height, Math.max(0, e.clientY - rect.top));
        seekTooltip.style.top = `${localY}px`;
        seekTooltip.style.left = '';
      } else {
        const localX = Math.min(rect.width, Math.max(0, e.clientX - rect.left));
        seekTooltip.style.left = `${localX}px`;
        seekTooltip.style.top = '';
      }
      seekTooltip.textContent = formatTime(ratio * videoPlayer.duration);
    },
    isVerticalSeekMode
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
    seekTooltip.style.top = '';
    seekTooltip.style.left = '';
    if (document.fullscreenElement === playerStage) {
      closeSettingsModal();
      wakeFullscreenControls();
    } else {
      clearTimeout(state.fsIdleTimer);
      playerStage.classList.remove('fs-idle');
    }
    syncPauseOverlayVisibility();
  });

  playerStage.addEventListener('mousemove', wakeFullscreenControls);
  playerStage.addEventListener('pointerdown', wakeFullscreenControls);

  centerPlayBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePlay();
  });
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
    toggleMute();
  });

  fullscreenBtn.addEventListener('click', toggleFullscreen);

  videoPlayer.addEventListener('play', () => {
    syncPlayPauseIcon();
    closeStepMenu();
    volumeControl.classList.remove('is-open');
    syncPauseOverlayVisibility();
    wakeFullscreenControls();
  });

  // На паузі у повноекранному режимі всі елементи одразу ховаються до руху мишки (зручно для скріншотів)
  videoPlayer.addEventListener('pause', () => {
    syncPlayPauseIcon();
    syncPauseOverlayVisibility();
    if (document.fullscreenElement === playerStage) {
      clearTimeout(state.fsIdleTimer);
      playerStage.classList.add('fs-idle');
    } else {
      playerStage.classList.remove('fs-idle');
    }
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