const ARCHIVE_SEARCH_URL = 'https://archive.org/advancedsearch.php';
const ARCHIVE_METADATA_URL = 'https://archive.org/metadata/';
const ARCHIVE_DETAILS_URL = 'https://archive.org/details/';

const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.ogg', '.opus', '.wav', '.flac', '.aac'];

function firstValue(value) {
  if (Array.isArray(value)) return value.find(item => item != null && String(item).trim()) ?? '';
  return value == null ? '' : value;
}

function safeText(value, fallback = '') {
  const first = firstValue(value);
  if (typeof first !== 'string' && typeof first !== 'number') return fallback;
  return String(first).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || fallback;
}

function licenseDetails(value) {
  const raw = safeText(value);
  const normalized = raw.toLowerCase().replace(/^http:\/\//, 'https://');
  if (!normalized) return null;

  if (normalized.includes('creativecommons.org/publicdomain/zero/')) {
    return { label: 'CC0 — отказ от известных авторских прав', url: raw };
  }
  if (normalized.includes('creativecommons.org/publicdomain/mark/')) {
    return { label: 'Public Domain Mark — общественное достояние по заявлению загрузчика', url: raw };
  }

  const cc = normalized.match(/creativecommons\.org\/licenses\/(by(?:-nc)?(?:-nd)?(?:-sa)?|by-sa|by-nc-sa|by-nd|by-nc-nd)\/(\d+(?:\.\d+)?)/i);
  if (!cc) return null;
  const code = cc[1].toLowerCase();
  const version = cc[2];
  const names = {
    'by': 'CC BY — указание авторства',
    'by-sa': 'CC BY-SA — указание авторства, распространение на тех же условиях',
    'by-nc': 'CC BY-NC — указание авторства, некоммерческое использование',
    'by-nc-sa': 'CC BY-NC-SA — указание авторства, некоммерческое использование, те же условия',
    'by-nd': 'CC BY-ND — указание авторства, без производных произведений',
    'by-nc-nd': 'CC BY-NC-ND — указание авторства, некоммерческое использование, без производных произведений',
  };
  const label = names[code];
  return label ? { label: `${label} (${version})`, url: raw } : null;
}

function escapeLucenePhrase(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function pickAudioFile(files, query, itemTitle) {
  const audioFiles = (Array.isArray(files) ? files : [])
    .filter(file => {
      const name = String(file?.name || '').toLowerCase();
      if (!AUDIO_EXTENSIONS.some(extension => name.endsWith(extension))) return false;
      if (file.private === 'true' || file.private === true) return false;
      return true;
    });
  if (!audioFiles.length) return null;

  const queryTerms = String(query || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(word => word.length > 2);
  const titleTerms = String(itemTitle || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(word => word.length > 2);
  const rank = file => {
    const name = String(file.name || '').toLowerCase();
    const extRank = AUDIO_EXTENSIONS.indexOf(AUDIO_EXTENSIONS.find(extension => name.endsWith(extension)));
    const searchable = name.replace(/[_-]+/g, ' ');
    const queryScore = queryTerms.reduce((sum, term) => sum + (searchable.includes(term) ? 3 : 0), 0);
    const titleScore = titleTerms.reduce((sum, term) => sum + (searchable.includes(term) ? 1 : 0), 0);
    const size = Number(file.size || 0);
    return queryScore * 100 + titleScore * 10 - Math.max(extRank, 0) + Math.min(size / 1e9, 1);
  };
  return audioFiles.sort((a, b) => rank(b) - rank(a))[0];
}

function getDuration(metadata, file) {
  const values = [metadata.runtime, metadata.duration];
  for (const value of values) {
    if (value == null || value === '') continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0 && parsed < 24 * 60 * 60) return Math.round(parsed);
    const match = String(value).match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
    if (match) {
      if (match[3] != null) return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
      return Number(match[1]) * 60 + Number(match[2]);
    }
  }
  return 0;
}

function normalizeRecord(record, item, query) {
  const metadata = item?.metadata || {};
  const files = Array.isArray(item?.files) ? item.files : [];
  const license = licenseDetails(metadata.licenseurl || record.licenseurl);
  if (!license) return null;

  const title = safeText(metadata.title || record.title, record.identifier || 'Без названия');
  const creator = safeText(metadata.creator || metadata.artist || record.creator, 'Автор / исполнитель не указан в метаданных');
  const file = pickAudioFile(files, query, title);
  if (!file?.name) return null;

  const identifier = String(record.identifier || '');
  if (!identifier) return null;
  const encodedName = String(file.name).split('/').map(part => encodeURIComponent(part)).join('/');
  const url = `https://archive.org/download/${encodeURIComponent(identifier)}/${encodedName}`;
  const sourceUrl = `${ARCHIVE_DETAILS_URL}${encodeURIComponent(identifier)}`;
  const rightsStatement = safeText(metadata.rights || metadata.copyright || '', 'Отдельное заявление о правообладателе в метаданных не указано.');
  const attribution = `${title} — ${creator}. Источник: Internet Archive (${sourceUrl}). Лицензия, указанная в метаданных: ${license.label} — ${license.url}. Права: ${rightsStatement}`;

  return {
    id: `ia-${identifier}-${file.name}`,
    title,
    artist: creator,
    album: safeText(metadata.album || metadata.collection || '', ''),
    duration: getDuration(metadata, file),
    url,
    cover: `https://archive.org/services/img/${encodeURIComponent(identifier)}`,
    isLocal: false,
    isOnline: true,
    isFullTrack: true,
    source: 'Internet Archive',
    sourceUrl,
    licenseUrl: license.url,
    licenseLabel: license.label,
    rightsStatement,
    attribution,
    archiveIdentifier: identifier,
    fileName: file.name,
    year: safeText(metadata.year || metadata.date || record.year || '', ''),
  };
}

async function fetchJson(url, signal) {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Источник вернул HTTP ${response.status}`);
  return response.json();
}

export async function searchFreeFullTracks(query, signal) {
  const term = String(query || '').trim().replace(/[^\p{L}\p{N}\s'’.-]/gu, ' ').replace(/\s+/g, ' ').slice(0, 100).trim();
  if (!term) return [];

  const escaped = escapeLucenePhrase(term);
  const queryOptions = [
    `mediatype:audio AND (licenseurl:http*by* OR licenseurl:http*publicdomain*) AND (title:"${escaped}" OR creator:"${escaped}" OR subject:"${escaped}")`,
  ];
  const records = [];
  const seenIds = new Set();

  for (const q of queryOptions) {
    const params = new URLSearchParams({ q, rows: '40', output: 'json', 'sort[]': 'downloads desc' });
    for (const field of ['identifier', 'title', 'creator', 'year', 'licenseurl']) params.append('fl[]', field);
    const data = await fetchJson(`${ARCHIVE_SEARCH_URL}?${params.toString()}`, signal);
    const docs = Array.isArray(data?.response?.docs) ? data.response.docs : [];
    for (const record of docs) {
      if (!record?.identifier || seenIds.has(record.identifier) || !licenseDetails(record.licenseurl)) continue;
      seenIds.add(record.identifier);
      records.push(record);
    }
    if (records.length >= 25) break;
  }

  // The public API may return a mixed bag of media despite a text query. Check each
  // item's own metadata and only keep an audio file when an explicit CC/PD license exists.
  const resultLimit = 25;
  const concurrency = 6;
  const mapped = [];
  for (let start = 0; start < Math.min(records.length, 48); start += concurrency) {
    const batch = records.slice(start, start + concurrency);
    const batchResults = await Promise.all(batch.map(async record => {
      try {
        const item = await fetchJson(`${ARCHIVE_METADATA_URL}${encodeURIComponent(record.identifier)}`, signal);
        return normalizeRecord(record, item, term);
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        console.warn(`MusPlay: не удалось прочитать метаданные архива ${record.identifier}`, error);
        return null;
      }
    }));
    mapped.push(...batchResults.filter(Boolean));
    if (mapped.length >= resultLimit) break;
  }
  return mapped.slice(0, resultLimit);
}
