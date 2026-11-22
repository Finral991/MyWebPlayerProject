export const STORAGE_KEY = 'local_video_progress_v2';
export const SETTINGS_STORAGE_KEY = 'local_player_ui_settings_v1';
export const IDB_NAME = 'local_cinema_history_db';
export const IDB_STORE = 'folders';
export const MAX_HISTORY_ITEMS = 6;
export const VIDEO_EXT_RE = /\.(mp4|webm|m4v)$/i;
export const WATCHED_THRESHOLD = 90;
export const SEEK_COMMIT_DELAY_MS = 550;
export const FS_IDLE_DELAY_MS = 2200;

export const DEFAULT_UI_SETTINGS = {
  dock: 'bottom', // 'bottom' | 'top' | 'left' | 'right'
  pausePos: 'top-left', // 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  hideSeekBar: false,
  hideJumpControls: false,
  hideVolume: false,
};

export const state = {
  jumpStepSec: 10,
  pendingSeekOffset: 0,
  seekCommitTimer: null,

  hasLoadedDirectory: false,
  rootFolderName: '',
  videos: [],
  currentIndex: -1,
  focusedListIndex: -1,
  visibleListItems: [],
  currentObjectUrl: null,
  selectRequestId: 0,
  pendingMetadataHandler: null,
  lastSaveTime: 0,
  activeFilter: 'all',
  watchedSectionCollapsed: false,
  fsIdleTimer: null,

  thumbnailCache: new Map(),
  thumbQueueRunning: false,
  thumbGenerationId: 0,
  progressCache: {},
  uiSettings: { ...DEFAULT_UI_SETTINGS },
};

const errorOverlay = document.getElementById('errorOverlay');
const errorTitleEl = document.getElementById('errorTitle');
const errorMessageEl = document.getElementById('errorMessage');
const errorDetailsEl = document.getElementById('errorDetails');
const errorCloseBtn = document.getElementById('errorCloseBtn');

export function showErrorModal({ title = 'Помилка', message = 'Щось пішло не так.', details = '' } = {}) {
  errorTitleEl.textContent = title;
  errorMessageEl.textContent = message;

  if (details) {
    errorDetailsEl.textContent = details;
    errorDetailsEl.classList.remove('is-hidden');
  } else {
    errorDetailsEl.textContent = '';
    errorDetailsEl.classList.add('is-hidden');
  }

  errorOverlay.classList.remove('is-hidden');
}

export function hideErrorModal() {
  errorOverlay.classList.add('is-hidden');
}

export function isErrorModalOpen() {
  return !errorOverlay.classList.contains('is-hidden');
}

errorCloseBtn.addEventListener('click', hideErrorModal);
errorOverlay.addEventListener('click', (e) => {
  if (e.target === errorOverlay) {
    hideErrorModal();
  }
});