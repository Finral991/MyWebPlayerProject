import { WATCHED_THRESHOLD, state } from './config.js';
import { flushProgressToStorage, isVideoWatched } from './storage.js';
import { applyCardBackground } from './thumbnails.js';

const playlistEl = document.getElementById('playlist');
const searchInput = document.getElementById('searchInput');
const scrollListUpBtn = document.getElementById('scrollListUpBtn');
const scrollListDownBtn = document.getElementById('scrollListDownBtn');
const filterChips = Array.from(document.querySelectorAll('.chip[data-filter]'));
const countAllEl = document.getElementById('countAll');
const countUnwatchedEl = document.getElementById('countUnwatched');
const countWatchedEl = document.getElementById('countWatched');

let onSelectEpisodeCallback = null;
let onSyncNavButtonsCallback = null;

export function bindPlaylistCallbacks({ onSelectEpisode, onSyncNavButtons }) {
  onSelectEpisodeCallback = onSelectEpisode;
  onSyncNavButtonsCallback = onSyncNavButtons;
}

export function applyListFocusVisual({ scrollIntoView = true } = {}) {
  state.visibleListItems.forEach((entry, idx) => {
    entry.el.classList.toggle('is-focused', idx === state.focusedListIndex);
  });

  if (scrollIntoView && state.focusedListIndex >= 0 && state.focusedListIndex < state.visibleListItems.length) {
    state.visibleListItems[state.focusedListIndex].el.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    });
  }
}

export function moveListFocus(delta) {
  if (state.visibleListItems.length === 0) return;

  if (state.focusedListIndex < 0) {
    const activePos = state.visibleListItems.findIndex((entry) => entry.item.index === state.currentIndex);
    state.focusedListIndex = activePos >= 0 ? activePos : 0;
  } else {
    state.focusedListIndex = Math.min(
      state.visibleListItems.length - 1,
      Math.max(0, state.focusedListIndex + delta)
    );
  }

  applyListFocusVisual({ scrollIntoView: true });
}

export function selectFocusedEpisode() {
  if (state.focusedListIndex >= 0 && state.focusedListIndex < state.visibleListItems.length) {
    const target = state.visibleListItems[state.focusedListIndex];
    onSelectEpisodeCallback?.(target.item.index, { autoplay: false });
  }
}

export function syncActivePlaylistItemDOM() {
  state.visibleListItems.forEach((entry) => {
    entry.el.classList.toggle('active', entry.item.index === state.currentIndex);
  });
}

export function syncIndicesByPath(activePath, focusedPath = null) {
  if (activePath) {
    state.currentIndex = state.videos.findIndex((v) => v.path === activePath);
  } else {
    state.currentIndex = -1;
  }

  if (focusedPath) {
    state.focusedListIndex = state.visibleListItems.findIndex((entry) => entry.item.path === focusedPath);
  } else if (state.currentIndex >= 0) {
    const idxInVisible = state.visibleListItems.findIndex((entry) => entry.item.index === state.currentIndex);
    state.focusedListIndex = idxInVisible >= 0 ? idxInVisible : (state.visibleListItems.length > 0 ? 0 : -1);
  } else {
    state.focusedListIndex = state.visibleListItems.length > 0 ? 0 : -1;
  }

  onSyncNavButtonsCallback?.();
  syncActivePlaylistItemDOM();
  applyListFocusVisual({ scrollIntoView: false });
}

function updateItemProgressDOM(videoPath, percent) {
  const watched = percent >= WATCHED_THRESHOLD;
  for (const entry of state.visibleListItems) {
    if (entry.item.path !== videoPath) continue;
    entry.el.classList.toggle('watched', watched);
    entry.fillEl.style.width = `${percent}%`;
    entry.metaEl.textContent = percent > 0 ? `Прогрес: ${percent}%` : 'Не розпочато';

    if (watched && !entry.badgeEl) {
      const badge = document.createElement('span');
      badge.className = 'badge-done';
      badge.textContent = 'Переглянуто';
      entry.titleRowEl.appendChild(badge);
      entry.badgeEl = badge;
    }
  }
}

export function saveProgress(key, currentTime, duration, { persistNow = false, forceReorganize = false } = {}) {
  if (!key || !duration || Number.isNaN(duration)) return;

  const prevWatched = isVideoWatched(key);
  const percent = Math.min(100, Math.max(0, Math.round((currentTime / duration) * 100)));
  state.progressCache[key] = { currentTime, duration, percent };
  const nowWatched = percent >= WATCHED_THRESHOLD;

  if (persistNow) {
    flushProgressToStorage();
  }

  if (forceReorganize || prevWatched !== nowWatched) {
    const activePath = state.currentIndex >= 0 && state.videos[state.currentIndex]
      ? state.videos[state.currentIndex].path
      : key;
    const focusedPath =
      state.focusedListIndex >= 0 && state.visibleListItems[state.focusedListIndex]
        ? state.visibleListItems[state.focusedListIndex].item.path
        : activePath;

    renderPlaylist();
    syncIndicesByPath(activePath, focusedPath);
    return;
  }

  updateItemProgressDOM(key, percent);
}

function createVideoItemElement(item, listPos) {
  const prog = state.progressCache[item.path] || { percent: 0, currentTime: 0 };
  const watched = prog.percent >= WATCHED_THRESHOLD;

  const row = document.createElement('div');
  row.className = `item ${item.index === state.currentIndex ? 'active' : ''} ${watched ? 'watched' : ''} ${listPos === state.focusedListIndex ? 'is-focused' : ''}`;

  const bgEl = document.createElement('div');
  bgEl.className = 'item-bg';
  bgEl.setAttribute('aria-hidden', 'true');
  row.appendChild(bgEl);

  const titleRow = document.createElement('div');
  titleRow.className = 'item-title';

  const titleSpan = document.createElement('span');
  titleSpan.textContent = item.path;
  titleRow.appendChild(titleSpan);

  let badgeEl = null;
  if (watched) {
    badgeEl = document.createElement('span');
    badgeEl.className = 'badge-done';
    badgeEl.textContent = 'Переглянуто';
    titleRow.appendChild(badgeEl);
  }

  const metaRow = document.createElement('div');
  metaRow.className = 'item-meta';
  metaRow.textContent = prog.percent > 0 ? `Прогрес: ${prog.percent}%` : 'Не розпочато';

  const bar = document.createElement('div');
  bar.className = 'progress-bar';

  const fill = document.createElement('div');
  fill.className = 'progress-fill';
  fill.style.width = `${prog.percent}%`;
  bar.appendChild(fill);

  row.append(titleRow, metaRow, bar);

  const entryObj = {
    item,
    el: row,
    bgEl,
    fillEl: fill,
    metaEl: metaRow,
    titleRowEl: titleRow,
    badgeEl,
  };

  const cachedThumb = state.thumbnailCache.get(item.path);
  if (cachedThumb) {
    applyCardBackground(entryObj, cachedThumb);
  }

  row.addEventListener('click', () => {
    state.focusedListIndex = listPos;
    onSelectEpisodeCallback?.(item.index, { autoplay: false });
  });

  state.visibleListItems.push(entryObj);
  return row;
}

function appendItemsToContainer(items, container) {
  items.forEach((item) => {
    const listPos = state.visibleListItems.length;
    container.appendChild(createVideoItemElement(item, listPos));
  });
}

export function renderPlaylist() {
  const query = searchInput.value.toLowerCase().trim();
  playlistEl.innerHTML = '';
  state.visibleListItems = [];

  const searched = state.videos
    .map((video, index) => ({ ...video, index }))
    .filter((video) => video.path.toLowerCase().includes(query));

  const unwatchedList = searched.filter((v) => !isVideoWatched(v.path));
  const watchedList = searched.filter((v) => isVideoWatched(v.path));

  countAllEl.textContent = String(searched.length);
  countUnwatchedEl.textContent = String(unwatchedList.length);
  countWatchedEl.textContent = String(watchedList.length);

  if (searched.length === 0) {
    state.focusedListIndex = -1;
    playlistEl.innerHTML = '<div class="empty-state">Нічого не знайдено</div>';
    return;
  }

  if (state.activeFilter === 'unwatched') {
    if (unwatchedList.length === 0) {
      state.focusedListIndex = -1;
      playlistEl.innerHTML = '<div class="empty-state">Усі знайдені серії вже переглянуто</div>';
      return;
    }
    const block = document.createElement('div');
    block.className = 'section-block';
    appendItemsToContainer(unwatchedList, block);
    playlistEl.appendChild(block);
  } else if (state.activeFilter === 'watched') {
    if (watchedList.length === 0) {
      state.focusedListIndex = -1;
      playlistEl.innerHTML = '<div class="empty-state">Переглянутих серій поки немає</div>';
      return;
    }
    const block = document.createElement('div');
    block.className = 'section-block';
    appendItemsToContainer(watchedList, block);
    playlistEl.appendChild(block);
  } else {
    if (unwatchedList.length > 0) {
      const unwatchedSection = document.createElement('div');
      unwatchedSection.className = 'section-block';

      const header = document.createElement('div');
      header.className = 'section-header';
      header.textContent = `Нові / У процесі (${unwatchedList.length})`;
      unwatchedSection.appendChild(header);

      appendItemsToContainer(unwatchedList, unwatchedSection);
      playlistEl.appendChild(unwatchedSection);
    }

    if (watchedList.length > 0) {
      const watchedSection = document.createElement('div');
      watchedSection.className = 'section-block';

      const header = document.createElement('div');
      header.className = 'section-header';

      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'section-toggle';
      toggleBtn.textContent = `${state.watchedSectionCollapsed ? '▸' : '▾'} Переглянуті (${watchedList.length})`;
      toggleBtn.addEventListener('click', () => {
        const activePath = state.currentIndex >= 0 && state.videos[state.currentIndex]
          ? state.videos[state.currentIndex].path
          : null;
        const focusedPath =
          state.focusedListIndex >= 0 && state.visibleListItems[state.focusedListIndex]
            ? state.visibleListItems[state.focusedListIndex].item.path
            : activePath;

        state.watchedSectionCollapsed = !state.watchedSectionCollapsed;
        renderPlaylist();
        syncIndicesByPath(activePath, focusedPath);
      });

      header.appendChild(toggleBtn);
      watchedSection.appendChild(header);

      if (!state.watchedSectionCollapsed) {
        appendItemsToContainer(watchedList, watchedSection);
      }

      playlistEl.appendChild(watchedSection);
    }
  }

  if (state.focusedListIndex >= state.visibleListItems.length) {
    state.focusedListIndex = state.visibleListItems.length > 0 ? 0 : -1;
  }
}

export function initPlaylistEvents() {
  scrollListUpBtn?.addEventListener('click', () => {
    playlistEl.scrollBy({ top: -260, behavior: 'smooth' });
  });

  scrollListDownBtn?.addEventListener('click', () => {
    playlistEl.scrollBy({ top: 260, behavior: 'smooth' });
  });

  filterChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const activePath = state.currentIndex >= 0 && state.videos[state.currentIndex]
        ? state.videos[state.currentIndex].path
        : null;
      const focusedPath =
        state.focusedListIndex >= 0 && state.visibleListItems[state.focusedListIndex]
          ? state.visibleListItems[state.focusedListIndex].item.path
          : activePath;

      state.activeFilter = chip.dataset.filter;
      filterChips.forEach((c) => c.classList.toggle('is-active', c === chip));
      renderPlaylist();
      syncIndicesByPath(activePath, focusedPath);
    });
  });

  searchInput.addEventListener('input', () => {
    const activePath = state.currentIndex >= 0 && state.videos[state.currentIndex]
      ? state.videos[state.currentIndex].path
      : null;
    renderPlaylist();
    syncIndicesByPath(activePath, null);
  });
}