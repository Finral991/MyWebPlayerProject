import { state } from './config.js';

const naturalCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function formatTime(sec) {
  if (!sec || Number.isNaN(sec) || !Number.isFinite(sec)) return '00:00';
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function parseEpisodeInfo(filePath) {
  const baseName = filePath.split('/').pop().replace(/\.[^.]+$/, '');
  const cleanTitle = baseName.replace(/[_.\-]+/g, ' ').trim();

  const seMatch = cleanTitle.match(/\bs\s*0*(\d+)\s*e\s*0*(\d+)\b/i);
  if (seMatch) {
    return {
      hasEpisode: true,
      episode: Number(seMatch[2]),
      season: Number(seMatch[1]),
      cleanTitle,
    };
  }

  const trimmedTail = cleanTitle
    .replace(
      /\b(перероблена|ремастер|remaster|v\d+|1080p|720p|480p|2160p|4k|web-?dl|webrip|bdrip|hevc|x264|x265|av1)\b.*$/i,
      ''
    )
    .trim();

  const allNums = [...trimmedTail.matchAll(/(?:^|\s)0*(\d{1,4})(?=\s|$)/g)];
  if (allNums.length > 0) {
    const lastNum = Number(allNums[allNums.length - 1][1]);
    return {
      hasEpisode: true,
      episode: lastNum,
      season: 0,
      cleanTitle,
    };
  }

  return {
    hasEpisode: false,
    episode: Number.MAX_SAFE_INTEGER,
    season: 0,
    cleanTitle,
  };
}

export function compareVideos(a, b) {
  const dirA = a.path.includes('/') ? a.path.slice(0, a.path.lastIndexOf('/')) : '';
  const dirB = b.path.includes('/') ? b.path.slice(0, b.path.lastIndexOf('/')) : '';
  const dirCmp = naturalCollator.compare(dirA, dirB);
  if (dirCmp !== 0) return dirCmp;

  const infoA = parseEpisodeInfo(a.path);
  const infoB = parseEpisodeInfo(b.path);

  if (infoA.episode !== infoB.episode) {
    return infoA.episode - infoB.episode;
  }

  if (infoA.season !== infoB.season) {
    return infoA.season - infoB.season;
  }

  return naturalCollator.compare(infoA.cleanTitle, infoB.cleanTitle);
}

export function extractSeasonEpisodeLabel(filePath) {
  const baseName = filePath.split('/').pop().replace(/\.[^.]+$/, '');
  const cleanTitle = baseName.replace(/[_.\-]+/g, ' ').trim();

  const seMatch = cleanTitle.match(/\bs\s*0*(\d+)\s*e\s*0*(\d+)\b/i);
  if (seMatch) {
    return `Сезон ${Number(seMatch[1])} • Серія ${Number(seMatch[2])}`;
  }

  const trimmedTail = cleanTitle
    .replace(
      /\b(перероблена|ремастер|remaster|v\d+|1080p|720p|480p|2160p|4k|web-?dl|webrip|bdrip|hevc|x264|x265|av1)\b.*$/i,
      ''
    )
    .trim();

  const allNums = [...trimmedTail.matchAll(/(?:^|\s)0*(\d{1,4})(?=\s|$)/g)];
  if (allNums.length > 0) {
    const epNum = Number(allNums[allNums.length - 1][1]);
    return `Серія ${epNum}`;
  }

  return cleanTitle;
}

export function getDisplayFolderName(filePath) {
  if (filePath && filePath.includes('/')) {
    const parts = filePath.split('/');
    parts.pop();
    return parts.join(' / ');
  }
  return state.rootFolderName || 'Обрана тека';
}