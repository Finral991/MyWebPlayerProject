import { IDB_NAME, IDB_STORE, MAX_HISTORY_ITEMS, STORAGE_KEY, WATCHED_THRESHOLD, state, showErrorModal } from './config.js';

const historyBlock = document.getElementById('historyBlock');
const historyListEl = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

export function loadProgressFromStorage() {
  try {
    state.progressCache = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    state.progressCache = {};
  }
}

export function flushProgressToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progressCache));
  } catch {
    // Ігноруємо помилку квоти сховища
  }
}

export function isVideoWatched(videoPath) {
  const prog = state.progressCache[videoPath];
  return Boolean(prog && prog.percent >= WATCHED_THRESHOLD);
}

function openHistoryDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB не підтримується'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getFolderHistory() {
  try {
    const db = await openHistoryDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const items = (req.result || []).sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0));
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function saveFolderToHistory(dirHandle) {
  try {
    const db = await openHistoryDB();
    const existing = await getFolderHistory();

    let matchedId = null;
    for (const entry of existing) {
      if (entry.handle && typeof entry.handle.isSameEntry === 'function') {
        try {
          if (await entry.handle.isSameEntry(dirHandle)) {
            matchedId = entry.id;
            break;
          }
        } catch {
          // Ігноруємо невалідний handle
        }
      }
    }

    const record = {
      id: matchedId || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: dirHandle.name,
      handle: dirHandle,
      lastOpened: Date.now(),
    };

    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    store.put(record);

    if (existing.length >= MAX_HISTORY_ITEMS) {
      const filteredExisting = matchedId ? existing.filter((x) => x.id !== matchedId) : existing;
      if (filteredExisting.length >= MAX_HISTORY_ITEMS) {
        filteredExisting.slice(MAX_HISTORY_ITEMS - 1).forEach((oldItem) => {
          store.delete(oldItem.id);
        });
      }
    }

    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    await renderFolderHistory();
  } catch (err) {
    console.warn('Не вдалося зберегти теку в історію:', err);
  }
}

async function removeFolderFromHistory(id) {
  try {
    const db = await openHistoryDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const req = tx.objectStore(IDB_STORE).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    await renderFolderHistory();
  } catch (err) {
    showErrorModal({
      title: 'Помилка видалення',
      message: 'Не вдалося прибрати теку з історії.',
      details: err?.message || String(err),
    });
  }
}

async function clearFolderHistory() {
  try {
    const db = await openHistoryDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const req = tx.objectStore(IDB_STORE).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    await renderFolderHistory();
  } catch (err) {
    showErrorModal({
      title: 'Помилка очищення',
      message: 'Не вдалося очистити історію тек.',
      details: err?.message || String(err),
    });
  }
}

function formatHistoryDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function initHistoryUI(onOpenEntry) {
  clearHistoryBtn.addEventListener('click', clearFolderHistory);

  return async function renderFolderHistory() {
    const items = await getFolderHistory();
    historyListEl.innerHTML = '';

    if (items.length === 0) {
      historyBlock.classList.add('is-hidden');
      return;
    }

    historyBlock.classList.remove('is-hidden');

    items.forEach((entry) => {
      const row = document.createElement('div');
      row.className = 'history-item';

      const openBtn = document.createElement('button');
      openBtn.type = 'button';
      openBtn.className = 'history-open-btn';
      openBtn.title = `Відкрити «${entry.name}»`;

      const nameEl = document.createElement('span');
      nameEl.className = 'history-name';
      nameEl.textContent = entry.name;

      const dateEl = document.createElement('span');
      dateEl.className = 'history-date';
      dateEl.textContent = `Відкрито: ${formatHistoryDate(entry.lastOpened)}`;

      openBtn.append(nameEl, dateEl);
      openBtn.addEventListener('click', () => onOpenEntry(entry));

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'history-remove-btn';
      removeBtn.title = 'Прибрати з історії';
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeFolderFromHistory(entry.id);
      });

      row.append(openBtn, removeBtn);
      historyListEl.appendChild(row);
    });
  };
}

window.addEventListener('beforeunload', flushProgressToStorage);