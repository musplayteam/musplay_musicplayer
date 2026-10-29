const LRCMUX_API = 'https://api.lrcmux.dev';
const UNISON_API = 'https://unison.boidu.dev';

function clean(value) {
  return String(value || '').trim();
}

function normalizeText(value) {
  return clean(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function tokens(value) {
  return new Set(normalizeText(value).split(/\s+/).filter(Boolean));
}

function matchScore(expected, actual) {
  const a = normalizeText(expected);
  const b = normalizeText(actual);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.88;

  const aTokens = tokens(a);
  const bTokens = tokens(b);
  if (!aTokens.size || !bTokens.size) return 0;
  let common = 0;
  for (const token of aTokens) if (bTokens.has(token)) common++;
  const coverage = common / Math.min(aTokens.size, bTokens.size);
  const jaccard = common / new Set([...aTokens, ...bTokens]).size;
  return Math.max(coverage * 0.78, jaccard);
}

function isLikelySameTrack(track, candidate) {
  const titleScore = matchScore(track?.title, candidate?.trackName || candidate?.song || candidate?.title);
  const artistScore = matchScore(track?.artist, candidate?.artistName || candidate?.artist);
  return titleScore >= 0.68 && artistScore >= 0.45;
}

async function requestJson(url, signal) {
  const response = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function parseLrc(rawLyrics) {
  const raw = String(rawLyrics || '').trim();
  if (!raw) return [];

  return raw.split(/\r?\n/).flatMap((rawLine, index) => {
    // Supports the common [mm:ss.xx] LRC format, including 1-3 fractional digits.
    const matches = [...rawLine.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
    if (!matches.length) return [];
    const wordMatches = [...rawLine.matchAll(/<(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?>/g)];
    const words = wordMatches.map((wordMatch, wordIndex) => {
      const nextWord = wordMatches[wordIndex + 1];
      const from = wordMatch.index + wordMatch[0].length;
      const to = nextWord ? nextWord.index : rawLine.length;
      const fractionText = wordMatch[3] || '';
      const fraction = fractionText ? Number(`0.${fractionText}`) : 0;
      return {
        time: Number(wordMatch[1]) * 60 + Number(wordMatch[2]) + fraction,
        text: rawLine.slice(from, to).replace(/\s+/g, ' ').trim(),
      };
    }).filter(word => word.text);
    const text = rawLine
      .replace(/\[(?:\d{1,3}:\d{2})(?:[.:]\d{1,3})?\]/g, '')
      .replace(/<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return matches.map((match, itemIndex) => {
      const fractionText = match[3] || '';
      const fraction = fractionText ? Number(`0.${fractionText}`) : 0;
      return {
        time: Number(match[1]) * 60 + Number(match[2]) + fraction,
        text,
        ...(words.length ? { words } : {}),
        index: index * 10 + itemIndex,
      };
    });
  }).filter(line => Number.isFinite(line.time)).sort((a, b) => a.time - b.time);
}

function parseTimestamp(value) {
  const input = clean(value);
  if (!input) return null;
  // TTML can use offset timestamps such as 12.4s or 240ms.
  const offset = input.match(/^(\d+(?:\.\d+)?)(ms|s)$/i);
  if (offset) return Number(offset[1]) / (offset[2].toLowerCase() === 'ms' ? 1000 : 1);

  // Clock values: mm:ss.mmm or hh:mm:ss.mmm.
  const clock = input.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d+))?$/);
  if (!clock) return null;
  const hours = Number(clock[1] || 0);
  const minutes = Number(clock[2] || 0);
  const seconds = Number(clock[3] || 0);
  const fraction = clock[4] ? Number(`0.${clock[4]}`) : 0;
  return hours * 3600 + minutes * 60 + seconds + fraction;
}

function parseTtml(rawLyrics) {
  // TTML is XML supplied by a lyrics provider; it is parsed as inert XML only.
  if (typeof DOMParser === 'undefined') return [];
  const xml = new DOMParser().parseFromString(String(rawLyrics || ''), 'application/xml');
  if (xml.querySelector('parsererror')) return [];

  const paragraphs = [...xml.getElementsByTagNameNS('*', 'p')];
  const lines = [];
  paragraphs.forEach((paragraph, index) => {
    let time = parseTimestamp(paragraph.getAttribute('begin'));
    if (time === null) {
      const timedChild = [...paragraph.getElementsByTagNameNS('*', 'span')]
        .map(span => parseTimestamp(span.getAttribute('begin')))
        .filter(value => value !== null)
        .sort((a, b) => a - b)[0];
      time = timedChild ?? null;
    }
    const text = String(paragraph.textContent || '').replace(/\s+/g, ' ').trim();
    if (time !== null && text) lines.push({ time, text, index });
  });

  // Some TTML variants omit <p> elements and time individual spans instead.
  if (!lines.length) {
    [...xml.getElementsByTagNameNS('*', 'span')].forEach((span, index) => {
      const time = parseTimestamp(span.getAttribute('begin'));
      const text = String(span.textContent || '').replace(/\s+/g, ' ').trim();
      if (time !== null && text) lines.push({ time, text, index });
    });
  }

  return lines.sort((a, b) => a.time - b.time);
}

function normalizeUnison(data) {
  if (!data || data.success === false) return null;
  const payload = data.data || data;
  const format = String(payload.format || '').toLowerCase();
  const syncType = String(payload.syncType || '').toLowerCase();
  if (format === 'plain' || syncType === 'plain') return null;

  const raw = String(payload.lyrics || payload.syncedLyrics || '').trim();
  if (!raw) return null;
  const lines = format === 'ttml' || raw.includes('<tt')
    ? parseTtml(raw)
    : parseLrc(raw);
  if (!lines.length) return null;

  return {
    status: 'ok',
    trackName: payload.song || payload.trackName || '',
    artistName: payload.artist || payload.artistName || '',
    albumName: payload.album || payload.albumName || '',
    plainLyrics: '',
    syncedLyrics: raw,
    lines,
    sourceName: 'Unison · Better Lyrics',
    sourceUrl: 'https://docs.betterlyrics.org/unison',
    syncType: syncType || 'linesync',
    confidence: payload.confidence || '',
  };
}

async function findMusixmatchLyrics(track, signal) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const bridge = typeof window !== 'undefined' ? window.electronAPI : null;
  if (typeof bridge?.getMusixmatchLyrics !== 'function') return null;
  const response = await bridge.getMusixmatchLyrics({
    title: clean(track.title),
    artist: clean(track.artist),
    album: clean(track.album),
    duration: Number(track.duration) || 0,
  });
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (!response?.lrc) return null;
  const lines = parseLrc(response.lrc);
  if (!lines.length) return null;
  const normalized = {
    status: 'ok',
    trackName: response.trackName || '',
    artistName: response.artistName || '',
    albumName: '',
    plainLyrics: '',
    syncedLyrics: response.lrc,
    lines,
    sourceName: response.kind === 'word' ? 'Musixmatch · пословная синхронизация' : 'Musixmatch',
    sourceUrl: /^https:\/\//i.test(response.sourceUrl || '') ? response.sourceUrl : 'https://www.musixmatch.com/',
    syncType: response.kind === 'word' ? 'richsync' : 'linesync',
  };
  // Validate again in the renderer so an unrelated match is never displayed.
  return isLikelySameTrack(track, normalized) ? normalized : null;
}

function normalizeLrcmux(data) {
  if (!data || data.success === false) return null;
  const payload = data.data || data;
  const raw = String(payload.syncedLyrics || payload.synced_lyrics || payload.lyricsfile || payload.lyrics || '').trim();
  if (!raw) return null;

  const isTtml = String(payload.format || '').toLowerCase() === 'ttml' || /<tt(?:\s|>)/i.test(raw);
  const lines = isTtml ? parseTtml(raw) : parseLrc(raw);
  if (!lines.length) return null;

  const upstreamName = typeof payload.source === 'string'
    ? payload.source
    : payload.source?.name || payload.source?.provider || payload.provider || '';
  const sourceName = upstreamName ? `LRC Mux · ${upstreamName}` : 'LRC Mux';
  const candidateUrl = payload.source?.url || payload.sourceUrl || payload.url;
  const sourceUrl = typeof candidateUrl === 'string' && candidateUrl.startsWith('https://')
    ? candidateUrl
    : 'https://lrcmux.dev/';

  return {
    status: 'ok',
    trackName: payload.trackName || payload.track_name || payload.title || '',
    artistName: payload.artistName || payload.artist_name || payload.artist || '',
    albumName: payload.albumName || payload.album_name || payload.album || '',
    plainLyrics: '',
    syncedLyrics: raw,
    lines,
    sourceName,
    sourceUrl,
    syncType: 'linesync',
  };
}

async function findLrcmuxLyrics(track, signal) {
  const params = new URLSearchParams({
    track_name: clean(track.title),
    artist_name: clean(track.artist),
  });
  if (track.album && !/без альбома|unknown album/i.test(track.album)) params.set('album_name', track.album);
  if (Number(track.duration) > 0) params.set('duration', String(Math.round(track.duration)));

  try {
    const exact = await requestJson(`${LRCMUX_API}/api/get?${params.toString()}`, signal);
    const normalized = normalizeLrcmux(exact);
    if (normalized && isLikelySameTrack(track, normalized)) return normalized;
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    // A missing exact match is expected. Network and rate-limit errors still
    // fall through to the next source in the chain.
    if (!error?.status || ![404, 400].includes(error.status)) throw error;
  }

  const searchParams = new URLSearchParams({
    track_name: clean(track.title),
    artist_name: clean(track.artist),
  });
  try {
    const result = await requestJson(`${LRCMUX_API}/api/search?${searchParams.toString()}`, signal);
    const candidates = Array.isArray(result) ? result : Array.isArray(result?.data) ? result.data : [];
    const matching = candidates
      .filter(item => (item?.syncedLyrics || item?.synced_lyrics || item?.lyricsfile || item?.lyrics) && isLikelySameTrack(track, {
        trackName: item.trackName || item.track_name || item.title,
        artistName: item.artistName || item.artist_name || item.artist,
      }))
      .sort((a, b) => (
        matchScore(track.title, b.trackName || b.track_name || b.title) + matchScore(track.artist, b.artistName || b.artist_name || b.artist)
      ) - (
        matchScore(track.title, a.trackName || a.track_name || a.title) + matchScore(track.artist, a.artistName || a.artist_name || a.artist)
      ));

    for (const item of matching) {
      const normalized = normalizeLrcmux(item);
      if (normalized && isLikelySameTrack(track, normalized)) return normalized;
    }
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    if (!error?.status || ![404, 400].includes(error.status)) throw error;
  }
  return null;
}

async function findUnisonLyrics(track, signal) {
  const params = new URLSearchParams({
    song: clean(track.title),
    artist: clean(track.artist),
  });
  if (track.album && !/без альбома|unknown album/i.test(track.album)) params.set('album', track.album);
  if (Number(track.duration) > 0) params.set('duration', String(Number(track.duration).toFixed(2)));

  try {
    const exact = await requestJson(`${UNISON_API}/lyrics?${params.toString()}`, signal);
    const normalized = normalizeUnison(exact);
    if (normalized && isLikelySameTrack(track, normalized)) return normalized;
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    // Try the search endpoint below if there is no exact match or the service is unavailable.
  }

  const searchParams = new URLSearchParams({ q: `${clean(track.title)} ${clean(track.artist)}`, limit: '10' });
  const searchResult = await requestJson(`${UNISON_API}/lyrics/search?${searchParams.toString()}`, signal);
  const candidates = searchResult?.success && Array.isArray(searchResult.data) ? searchResult.data : [];
  const matching = candidates
    .filter(item => item?.videoId && isLikelySameTrack(track, item))
    .map(item => ({ item, score: matchScore(track.title, item.song) + matchScore(track.artist, item.artist) + Number(item.matchScore || 0) }))
    .sort((a, b) => b.score - a.score);

  for (const { item } of matching) {
    try {
      const record = await requestJson(`${UNISON_API}/lyrics?v=${encodeURIComponent(item.videoId)}`, signal);
      const normalized = normalizeUnison(record);
      if (normalized && isLikelySameTrack(track, normalized)) return normalized;
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
    }
  }
  return null;
}



export async function searchLyricsOnline(query, artist = '', signal) {
  const titleQuery = clean(query);
  const artistQuery = clean(artist);
  if (!titleQuery) return [];

  const results = [];
  const seen = new Set();
  const add = (sourceName, sourceUrl, raw, title, artistName, albumName = '', copyright = '') => {
    const syncedLyrics = String(raw || '').trim();
    const lines = parseLrc(syncedLyrics);
    if (!lines.length || !title || !artistName) return;
    const candidate = { title, artistName, trackName: title };
    const requested = { title: titleQuery, artist: artistQuery };
    if (artistQuery ? !isLikelySameTrack(requested, candidate) : matchScore(titleQuery, title) < 0.68) return;
    const key = `${normalizeText(title)}::${normalizeText(artistName)}::${normalizeText(syncedLyrics.slice(0, 100))}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({
      status: 'ok', trackName: title, title, artistName, albumName, plainLyrics: '', syncedLyrics,
      lines, sourceName, sourceUrl, syncType: syncedLyrics.includes('<') ? 'richsync' : 'linesync', copyright,
    });
  };

  // Musixmatch is queried first, through the existing Electron bridge. This
  // uses the same provider integration as automatic lyrics for the playing song.
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const bridge = typeof window !== 'undefined' ? window.electronAPI : null;
  if (typeof bridge?.getMusixmatchLyrics === 'function' && artistQuery) {
    try {
      const response = await bridge.getMusixmatchLyrics({ title: titleQuery, artist: artistQuery, album: '', duration: 0 });
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (response?.lrc) {
        add(
          response.kind === 'word' ? 'Musixmatch · пословная синхронизация' : 'Musixmatch',
          /^https:\/\//i.test(response.sourceUrl || '') ? response.sourceUrl : 'https://www.musixmatch.com/',
          response.lrc,
          response.trackName || titleQuery,
          response.artistName || artistQuery,
        );
      }
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      // Continue with the secondary synced-lyrics catalogue if Musixmatch is unavailable.
    }
  }

  if (!signal?.aborted) {
    try {
      const params = new URLSearchParams({ track_name: titleQuery, artist_name: artistQuery });
      const response = await requestJson(`${LRCMUX_API}/api/search?${params}`, signal);
      const candidates = Array.isArray(response) ? response : Array.isArray(response?.data) ? response.data : [];
      candidates.forEach(item => {
        const raw = item.syncedLyrics || item.synced_lyrics || item.lyricsfile || item.lyrics;
        const title = item.trackName || item.track_name || item.title || item.song;
        const artistName = item.artistName || item.artist_name || item.artist;
        const provider = typeof item.source === 'string' ? item.source : item.source?.name || item.provider || 'LRC Mux';
        const candidateUrl = item.source?.url || item.sourceUrl || item.url || 'https://lrcmux.dev/';
        add(`LRC Mux${provider && provider !== 'LRC Mux' ? ` · ${provider}` : ''}`, /^https:\/\//i.test(candidateUrl) ? candidateUrl : 'https://lrcmux.dev/', raw, title, artistName, item.albumName || item.album_name || item.album || '', item.copyright || '');
      });
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
    }
  }

  return results.sort((a, b) => (
    matchScore(titleQuery, b.trackName) + (artistQuery ? matchScore(artistQuery, b.artistName) : 0)
  ) - (
    matchScore(titleQuery, a.trackName) + (artistQuery ? matchScore(artistQuery, a.artistName) : 0)
  ));
}

function normalizeSavedLyrics(saved) {
  if (!saved?.raw) return null;
  const raw = saved.raw.split(/\r?\n/).filter(line => !/^#\s*(?:source|provider|copyright):/i.test(line)).join('\n').trim();
  const lines = parseLrc(raw);
  if (!lines.length) return null;
  return {
    status: 'ok', trackName: saved.title || '', artistName: saved.artist || '', albumName: saved.albumName || '',
    plainLyrics: '', syncedLyrics: raw, lines, sourceName: `Локально сохранённый текст · ${saved.path || saved.fileName}`,
    sourceUrl: saved.sourceUrl || '', copyright: saved.copyright || '', syncType: raw.includes('<') ? 'richsync' : 'linesync',
    localPath: saved.path || '', savedAt: saved.savedAt || '',
  };
}

export async function findLyrics(track, signal) {
  const title = clean(track?.title);
  const artist = clean(track?.artist);
  const checkedSources = [];
  const errors = [];

  // Prefer the user's own saved .lrc file; it works offline and survives restarts.
  try {
    const bridge = typeof window !== 'undefined' ? window.electronAPI : null;
    if (typeof bridge?.getSavedLyrics === 'function') {
      const saved = await bridge.getSavedLyrics({ title, artist, album: track?.album || '' });
      const local = normalizeSavedLyrics(saved);
      if (local) return { ...local, checkedSources: ['MusPlay · локальная папка'] };
    }
  } catch { /* fall back to online sources if local index cannot be read */ }

  if (!title || !artist || /неизвестн|unknown artist/i.test(artist)) {
    return {
      status: 'missing',
      message: 'Для поиска синхронизированного текста нужны название трека и исполнитель в свойствах аудиофайла.',
      checkedSources,
    };
  }

  // Prefer Musixmatch, then check the other synced-lyrics catalogues.
  try {
    checkedSources.push('Musixmatch');
    const lyrics = await findMusixmatchLyrics(track, signal);
    if (lyrics?.lines?.length) return { ...lyrics, checkedSources: [...checkedSources] };
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    errors.push('Musixmatch');
  }

  try {
    checkedSources.push('LRC Mux');
    const lyrics = await findLrcmuxLyrics(track, signal);
    if (lyrics?.lines?.length) return { ...lyrics, checkedSources: [...checkedSources] };
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    errors.push('LRC Mux');
  }

  try {
    checkedSources.push('Unison · Better Lyrics');
    const lyrics = await findUnisonLyrics(track, signal);
    if (lyrics?.lines?.length) return { ...lyrics, checkedSources: [...checkedSources] };
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    errors.push('Unison · Better Lyrics');
  }

  if (checkedSources.length > 0 && errors.length === checkedSources.length) {
    return {
      status: 'error',
      message: 'Все автоматические источники синхронизированного текста сейчас недоступны. Проверь интернет и попробуй ещё раз.',
      checkedSources,
    };
  }

  return {
    status: 'missing',
    message: 'Синхронизированный текст не найден в автоматических источниках (Musixmatch, LRC Mux и Unison).',
    checkedSources,
  };
}
