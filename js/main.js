import { VIDEO_EXT_RE, isErrorModalOpen, hideErrorModal, showErrorModal, state } from './config.js';
import { flushProgressToStorage, initHistoryUI, loadProgressFromStorage, saveFolderToHistory } from './storage.js';
import { compareVideos } from './sorting.js';
import { generateThumbnailsInBackground } from './thumbnails.js';
import {
  bindPlaylistCallbacks,
  initPlaylistEvents,
  moveListFocus,
  renderPlaylist,
  selectFocusedEpisode,
} from './playlist.js';
import {
  closeSettingsModal,
  closeStepMenu,
  exitFullscreenIfActive,
  initPlayerEvents,
  isSettingsModalOpen,
  isStepMenuOpen,
  queueJumpBySeconds,
  resetPendingSeek,
  selectVideo,
  syncEpisodeNavButtons,
  toggleFullscreen,
  toggleMute,
  togglePlay,
  updateHeaderForVideo,
  videoPlayer,
  volumeControl,
} from './player.js';

const pickerOverlay = document.getElementById('pickerOverlay');
const appShell = document.getElementById('appShell');
const dropZone = document.getElementById('dropZone');
const pickDirBtn = document.getElementById('pickDirBtn');
const backToPlayerBtn = document.getElementById('backToPlayerBtn');
const changeDirBtn = document.getElementById('changeDirBtn');
const pickerHint = document.getElementById('pickerHint');
const playlistEl = document.getElementById('playlist');
const folderInfoEl = document.getElementById('folderInfo');
const searchInput = document.getElementById('searchInput');

let dragCounter = 0;

if (!('showDirectoryPicker' in window)) {
  pickerHint.textContent =
    'Увага: цей браузер не підтримує File System Access API. Відкрий у Chrome, Edge або Brave.';
}

function syncBackButtonVisibility() {
  backToPlayerBtn.classList.toggle('is-hidden', !state.hasLoadedDirectory);
}

async function showPicker() {
  flushProgressToStorage();
  resetPendingSeek();
  closeSettingsModal();
  videoPlayer.pause();
  closeStepMenu();
  volumeControl.classList.remove('is-open');
  syncBackButtonVisibility();
  await renderFolderHistory();
  appShell.classList.add('is-hidden');
  pickerOverlay.classList.remove('is-hidden');
}

function showPlayer() {
  pickerOverlay.classList.add('is-hidden');
  appShell.classList.remove('is-hidden');
}

async function collectVideos(dirHandle, path = '') {
  const list = [];
  for await (const entry of dirHandle.values()) {
    const entryPath = path ? `${path}/${entry.name}` : entry.name;
    if (entry.kind === 'file' && VIDEO_EXT_RE.test(entry.name)) {
      list.push({ name: entry.name, path: entryPath, handle: entry });
    } else if (entry.kind === 'directory') {
      const nested = await collectVideos(entry, entryPath);
      list.push(...nested);
    }
  }
  return list;
}

async function loadDirectoryHandle(dirHandle) {
  if (!dirHandle || dirHandle.kind !== 'directory') {
    showErrorModal({
      title: 'Обрано не теку',
      message: 'Будь ласка, обери або перетягни саме теку з відео, а не окремий файл.',
    });
    return;
  }

  try {
    showPlayer();
    state.rootFolderName = dirHandle.name;
    folderInfoEl.textContent = 'Сканування теки...';
    playlistEl.innerHTML = '<div class="empty-state">Завантаження списку відео...</div>';
    updateHeaderForVideo(null);

    await saveFolderToHistory(dirHandle);

    const rawList = await collectVideos(dirHandle);
    state.videos = rawList.sort(compareVideos);

    state.hasLoadedDirectory = true;
    syncBackButtonVisibility();
    state.currentIndex = -1;
    state.focusedListIndex = -1;
    syncEpisodeNavButtons();

    folderInfoEl.textContent = `Серій: ${state.videos.length}`;
    renderPlaylist();

    const genId = ++state.thumbGenerationId;
    generateThumbnailsInBackground(genId);

    if (state.videos.length > 0) {
      await selectVideo(0, { autoplay: false });
    }
  } catch (err) {
    showErrorModal({
      title: 'Не вдалося відкрити теку',
      message: 'Під час читання теки або списку файлів виникла помилка.',
      details: err?.message || String(err),
    });
  }
}

async function openHistoryFolder(entry) {
  try {
    const handle = entry.handle;
    if (!handle) {
      showErrorModal({
        title: 'Немає доступу до теки',
        message: 'Збережене посилання на цю теку пошкоджене. Обери теку заново.',
      });
      return;
    }

    if (typeof handle.queryPermission === 'function') {
      const perm = await handle.queryPermission({ mode: 'read' });
      if (perm !== 'granted' && typeof handle.requestPermission === 'function') {
        const reqPerm = await handle.requestPermission({ mode: 'read' });
        if (reqPerm !== 'granted') {
          showErrorModal({
            title: 'Доступ заборонено',
            message: 'Браузер не надав дозвіл на читання обраної теки.',
          });
          return;
        }
      }
    }

    await loadDirectoryHandle(handle);
  } catch (err) {
    showErrorModal({
      title: 'Не вдалося відкрити теку',
      message: 'Теку з історії не вдалося відкрити (можливо, її перемістили, перейменували або видалили).',
      details: err?.message || String(err),
    });
  }
}

const renderFolderHistory = initHistoryUI(openHistoryFolder);

bindPlaylistCallbacks({
  onSelectEpisode: selectVideo,
  onSyncNavButtons: syncEpisodeNavButtons,
});

initPlayerEvents();
initPlaylistEvents();

pickDirBtn.addEventListener('click', async () => {
  try {
    const dirHandle = await window.showDirectoryPicker();
    await loadDirectoryHandle(dirHandle);
  } catch (err) {
    if (err?.name !== 'AbortError') {
      showErrorModal({
        title: 'Помилка вибору теки',
        message: 'Не вдалося відкрити діалог вибору теки.',
        details: err?.message || String(err),
      });
    }
  }
});

changeDirBtn.addEventListener('click', showPicker);
backToPlayerBtn.addEventListener('click', () => {
  if (state.hasLoadedDirectory) {
    showPlayer();
  }
});

['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
});

dropZone.addEventListener('dragenter', () => {
  dragCounter += 1;
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dragCounter = Math.max(0, dragCounter - 1);
  if (dragCounter === 0) {
    dropZone.classList.remove('drag-over');
  }
});

dropZone.addEventListener('drop', async (e) => {
  dragCounter = 0;
  dropZone.classList.remove('drag-over');

  const items = Array.from(e.dataTransfer?.items || []);
  for (const item of items) {
    if (typeof item.getAsFileSystemHandle === 'function') {
      try {
        const handle = await item.getAsFileSystemHandle();
        if (handle && handle.kind === 'directory') {
          await loadDirectoryHandle(handle);
          return;
        }
      } catch (err) {
        showErrorModal({
          title: 'Помилка перетягування',
          message: 'Не вдалося отримати доступ до перетягнутої теки.',
          details: err?.message || String(err),
        });
        return;
      }
    }
  }

  showErrorModal({
    title: 'Drag-and-drop не підтримується або обрано файл',
    message: 'Перетягни саме теку у сучасному Chromium-браузері або скористайся кнопкою «Обрати теку».',
  });
});

document.addEventListener('click', (e) => {
  if (isStepMenuOpen() && !e.target.closest('.step-menu-wrap')) {
    closeStepMenu();
  }
  if (volumeControl.classList.contains('is-open') && !e.target.closest('#volumeControl')) {
    volumeControl.classList.remove('is-open');
  }
});

document.addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName?.toLowerCase();
  const isTyping = tag === 'input' || tag === 'textarea';

  if (e.key === 'Escape') {
    if (isErrorModalOpen()) {
      e.preventDefault();
      hideErrorModal();
      return;
    }

    if (isSettingsModalOpen()) {
      e.preventDefault();
      closeSettingsModal();
      return;
    }

    if (isStepMenuOpen()) {
      e.preventDefault();
      closeStepMenu();
      return;
    }

    if (state.pendingSeekOffset !== 0) {
      e.preventDefault();
      resetPendingSeek();
      return;
    }

    if (exitFullscreenIfActive()) {
      e.preventDefault();
      return;
    }

    const isPickerOpen = !pickerOverlay.classList.contains('is-hidden');
    if (isPickerOpen && state.hasLoadedDirectory) {
      e.preventDefault();
      showPlayer();
    }
    return;
  }

  if (!pickerOverlay.classList.contains('is-hidden') || isSettingsModalOpen()) return;

  if (isTyping) {
    if (e.key === 'Enter' && document.activeElement === searchInput && state.visibleListItems.length > 0) {
      e.preventDefault();
      if (state.focusedListIndex < 0) state.focusedListIndex = 0;
      selectFocusedEpisode();
      searchInput.blur();
    }
    return;
  }

  const lowerKey = e.key.toLowerCase();

  if (e.code === 'Space') {
    e.preventDefault();
    togglePlay();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    moveListFocus(-1);
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    moveListFocus(1);
  } else if (e.key === 'Enter') {
    if (state.focusedListIndex >= 0 && state.focusedListIndex < state.visibleListItems.length) {
      e.preventDefault();
      selectFocusedEpisode();
    }
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    queueJumpBySeconds(state.jumpStepSec);
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    queueJumpBySeconds(-state.jumpStepSec);
  } else if (e.code === 'KeyM' || lowerKey === 'm' || lowerKey === 'ь') {
    e.preventDefault();
    toggleMute();
  } else if (e.code === 'KeyF' || lowerKey === 'f' || lowerKey === 'а') {
    e.preventDefault();
    toggleFullscreen();
  }
});

loadProgressFromStorage();
renderFolderHistory();