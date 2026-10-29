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

function knownArtist(value) {
  const artist = clean(value);
  return /^(?:unknown artist|unknown|неизвестн(?:ый|ая|ые)?(?: исполнитель)?|исполнитель не указан)$/i.test(artist) ? '' : artist;
}

function isLikelySameTrack(track, candidate) {
  const titleScore = matchScore(track?.title, candidate?.trackName || candidate?.track_name || candidate?.song || candidate?.title || candidate?.track);
  if (titleScore < 0.62) return false;

  // Local files often have a title tag but no artist tag. In that case, allow
  // title-based discovery rather than stopping before the fallback catalogs.
  const requestedArtist = knownArtist(track?.artist);
  if (!requestedArtist) return true;
  const actualArtist = knownArtist(candidate?.artistName || candidate?.artist_name || candidate?.artist);
  if (!actualArtist) return false;
  return matchScore(requestedArtist, actualArtist) >= 0.32;
}

async function requestJson(url, signal, timeoutMs = 8000) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  // A slow lyrics provider must not block the rest of the fallback chain.
  // Keep the caller's cancellation separate from this per-request timeout.
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return await response.json();
  } catch (error) {
    if (timedOut) {
      const timeoutError = new Error(`Lyrics provider timed out after ${timeoutMs} ms`);
      timeoutError.name = 'TimeoutError';
      throw timeoutError;
    }
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortFromCaller);
  }
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
  const syncType = String(payload.syncType || payload.sync_type || '').toLowerCase();
  if (format === 'plain' || syncType === 'plain') return null;

  const raw = String(payload.lyrics || payload.syncedLyrics || payload.synced_lyrics || '').trim();
  if (!raw) return null;
  const isTtml = format === 'ttml' || /<tt(?:\s|>)/i.test(raw);
  const lines = isTtml ? parseTtml(raw) : parseLrc(raw);
  if (!lines.length) return null;

  return {
    status: 'ok',
    trackName: payload.song || payload.trackName || payload.track_name || payload.title || '',
    artistName: payload.artist || payload.artistName || payload.artist_name || '',
    albumName: payload.album || payload.albumName || payload.album_name || '',
    plainLyrics: '',
    syncedLyrics: raw,
    lines,
    sourceName: 'Unison · Better Lyrics',
    sourceUrl: 'https://docs.betterlyrics.org/unison',
    syncType: syncType || (isTtml ? 'richsync' : 'linesync'),
    confidence: payload.confidence || '',
    format: isTtml ? 'ttml' : 'lrc',
  };
}

function withTimeout(promise, timeoutMs, label = 'Lyrics source') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`${label} timed out after ${timeoutMs} ms`);
      error.name = 'TimeoutError';
      reject(error);
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function findMusixmatchLyrics(track, signal) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const bridge = typeof window !== 'undefined' ? window.electronAPI : null;
  if (typeof bridge?.getMusixmatchLyrics !== 'function') return null;
  const response = await withTimeout(bridge.getMusixmatchLyrics({
    title: clean(track.title),
    artist: knownArtist(track.artist),
    album: clean(track.album),
    duration: Number(track.duration) || 0,
  }), 6500, 'Musixmatch');
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
  const requestedArtist = knownArtist(track.artist);
  const params = new URLSearchParams({ track_name: clean(track.title) });
  if (requestedArtist) params.set('artist_name', requestedArtist);
  if (track.album && !/без альбома|unknown album/i.test(track.album)) params.set('album_name', track.album);
  if (Number(track.duration) > 0) params.set('duration', String(Math.round(track.duration)));

  // Exact lookup requires an artist for reliable matching. Without one, go
  // directly to broad title search rather than sending an empty artist value.
  if (requestedArtist) {
    try {
      const exact = await requestJson(`${LRCMUX_API}/api/get?${params.toString()}`, signal);
      const normalized = normalizeLrcmux(exact);
      if (normalized && isLikelySameTrack(track, normalized)) return normalized;
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      // Search when the exact endpoint reports a normal miss; network failures
      // and timeouts should move to the next provider instead of repeating them.
      if (!error?.status || ![400, 404].includes(error.status)) throw error;
    }
  }

  const searchParams = new URLSearchParams({ track_name: clean(track.title) });
  if (requestedArtist) searchParams.set('artist_name', requestedArtist);
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
  const requestedArtist = knownArtist(track.artist);
  if (requestedArtist) {
    const params = new URLSearchParams({ song: clean(track.title), artist: requestedArtist });
    if (track.album && !/без альбома|unknown album/i.test(track.album)) params.set('album', track.album);
    if (Number(track.duration) > 0) params.set('duration', String(Number(track.duration).toFixed(2)));

    try {
      const exact = await requestJson(`${UNISON_API}/lyrics?${params.toString()}`, signal);
      const normalized = normalizeUnison(exact);
      if (normalized && isLikelySameTrack(track, normalized)) return normalized;
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      // A 400/404 is a normal exact-match miss. An unavailable provider should
      // be recorded by the caller rather than queried again during the timeout.
      if (!error?.status || ![400, 404].includes(error.status)) throw error;
    }
  }

  const searchParams = new URLSearchParams({ q: [clean(track.title), requestedArtist].filter(Boolean).join(' '), limit: '10' });
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
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const results = [];
  const seen = new Set();

  const add = (sourceName, sourceUrl, raw, title, artistName, albumName = '', copyright = '', format = 'lrc', syncType = '') => {
    const syncedLyrics = String(raw || '').trim();
    const normalizedFormat = String(format || '').toLowerCase();
    const isTtml = normalizedFormat === 'ttml' || /<tt(?:\s|>)/i.test(syncedLyrics);
    // Unison commonly serves TTML, while other providers often return LRC.
    // The old search path parsed everything as LRC, silently discarding TTML.
    const lines = isTtml ? parseTtml(syncedLyrics) : parseLrc(syncedLyrics);
    if (!lines.length || !title) return;

    const resolvedArtist = clean(artistName) || artistQuery;
    const candidate = { title, artistName: resolvedArtist, trackName: title };
    const requested = { title: titleQuery, artist: artistQuery };
    if (artistQuery) {
      if (!isLikelySameTrack(requested, candidate)) return;
    } else if (matchScore(titleQuery, title) < 0.68) {
      return;
    }

    const key = `${normalizeText(title)}::${normalizeText(resolvedArtist)}::${normalizeText(syncedLyrics.slice(0, 100))}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({
      status: 'ok', trackName: title, title, artistName: resolvedArtist, albumName,
      plainLyrics: '', syncedLyrics, lines, sourceName, sourceUrl, syncType: syncType || (isTtml ? 'richsync' : 'linesync'), copyright,
      format: isTtml ? 'ttml' : 'lrc',
    });
  };

  const addUnisonRecord = (record) => {
    const normalized = normalizeUnison(record);
    if (!normalized) return false;
    const previousCount = results.length;
    add(
      normalized.sourceName, normalized.sourceUrl, normalized.syncedLyrics,
      normalized.trackName || titleQuery, normalized.artistName || artistQuery,
      normalized.albumName || '', normalized.copyright || '', normalized.format || '', normalized.syncType || '',
    );
    return results.length > previousCount;
  };

  const bridge = typeof window !== 'undefined' ? window.electronAPI : null;
  const tasks = [];

  // Source 1: Musixmatch, through the Electron bridge already used by auto-lyrics.
  if (typeof bridge?.getMusixmatchLyrics === 'function' && artistQuery) {
    tasks.push((async () => {
      try {
        const response = await withTimeout(bridge.getMusixmatchLyrics({ title: titleQuery, artist: artistQuery, album: '', duration: 0 }), 6500, 'Musixmatch');
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        if (!response?.lrc) return;
        add(
          response.kind === 'word' ? 'Musixmatch · пословная синхронизация' : 'Musixmatch',
          /^https:\/\//i.test(response.sourceUrl || '') ? response.sourceUrl : 'https://www.musixmatch.com/',
          response.lrc, response.trackName || titleQuery, response.artistName || artistQuery,
          '', '', 'lrc', response.kind === 'word' ? 'richsync' : 'linesync',
        );
      } catch (error) {
        if (error?.name === 'AbortError' && signal?.aborted) throw error;
        // A failed provider should not prevent other catalogues from returning results.
      }
    })());
  }

  // Source 2: LRC Mux, an aggregator of public synced-lyrics providers.
  tasks.push((async () => {
    try {
      const params = new URLSearchParams({ track_name: titleQuery });
      if (artistQuery) params.set('artist_name', artistQuery);
      const response = await requestJson(`${LRCMUX_API}/api/search?${params.toString()}`, signal);
      const candidates = Array.isArray(response) ? response : Array.isArray(response?.data) ? response.data : Array.isArray(response?.results) ? response.results : [];
      candidates.forEach(item => {
        const raw = item.syncedLyrics || item.synced_lyrics || item.lyricsfile || item.lyrics || item.lrc || '';
        const title = item.trackName || item.track_name || item.title || item.song || item.track || '';
        const artistName = item.artistName || item.artist_name || item.artist || '';
        const provider = typeof item.source === 'string' ? item.source : item.source?.name || item.provider || 'LRC Mux';
        const candidateUrl = item.source?.url || item.sourceUrl || item.url || 'https://lrcmux.dev/';
        add(
          `LRC Mux${provider && provider !== 'LRC Mux' ? ` · ${provider}` : ''}`,
          /^https:\/\//i.test(candidateUrl) ? candidateUrl : 'https://lrcmux.dev/',
          raw, title, artistName, item.albumName || item.album_name || item.album || '', item.copyright || '', item.format || 'lrc', item.syncType || item.sync_type || '',
        );
      });
    } catch (error) {
      if (error?.name === 'AbortError' && signal?.aborted) throw error;
    }
  })());

  // Source 3: Unison/Better Lyrics. Exact song+artist lookups return the lyric
  // body directly; the discovery endpoint returns video IDs, which must then be
  // fetched individually. Both paths support TTML as well as LRC.
  tasks.push((async () => {
    try {
      if (artistQuery) {
        const params = new URLSearchParams({ song: titleQuery, artist: artistQuery });
        const exact = await requestJson(`${UNISON_API}/lyrics?${params.toString()}`, signal);
        if (addUnisonRecord(exact)) return;
      }
    } catch (error) {
      if (error?.name === 'AbortError' && signal?.aborted) throw error;
      // A no-match on the exact endpoint is normal; continue with discovery.
    }

    try {
      const params = new URLSearchParams({ q: artistQuery ? `${titleQuery} ${artistQuery}` : titleQuery, limit: '10' });
      const searchResult = await requestJson(`${UNISON_API}/lyrics/search?${params.toString()}`, signal);
      const candidates = Array.isArray(searchResult?.data) ? searchResult.data : Array.isArray(searchResult?.results) ? searchResult.results : [];
      const matching = candidates
        .filter(item => item?.videoId || item?.video_id || item?.lyrics || item?.syncedLyrics)
        .filter(item => artistQuery ? isLikelySameTrack({ title: titleQuery, artist: artistQuery }, item) : matchScore(titleQuery, item.song || item.trackName || item.title) >= 0.68)
        .sort((a, b) => (matchScore(titleQuery, b.song || b.trackName || b.title) + (artistQuery ? matchScore(artistQuery, b.artist || b.artistName) : 0) + Number(b.matchScore || 0)) - (matchScore(titleQuery, a.song || a.trackName || a.title) + (artistQuery ? matchScore(artistQuery, a.artist || a.artistName) : 0) + Number(a.matchScore || 0)))
        .slice(0, 5);

      for (const item of matching) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        if (addUnisonRecord({ success: true, data: item })) continue;
        const videoId = item.videoId || item.video_id;
        if (!videoId) continue;
        try {
          const record = await requestJson(`${UNISON_API}/lyrics?v=${encodeURIComponent(videoId)}`, signal);
          addUnisonRecord(record);
        } catch (error) {
          if (error?.name === 'AbortError' && signal?.aborted) throw error;
        }
        if (results.length >= 10) break;
      }
    } catch (error) {
      if (error?.name === 'AbortError' && signal?.aborted) throw error;
    }
  })());

  await Promise.allSettled(tasks);
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
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

  if (!title) {
    return {
      status: 'missing',
      message: 'Для автоматического поиска синхронизированного текста нужно название трека. Исполнитель помогает повысить точность, но не обязателен.',
      checkedSources,
    };
  }

  // Prefer Musixmatch when artist metadata is available. Other catalogues can
  // still search by title if the file contains no usable artist tag.
  if (knownArtist(artist)) {
    try {
      checkedSources.push('Musixmatch');
      const lyrics = await findMusixmatchLyrics(track, signal);
      if (lyrics?.lines?.length) return { ...lyrics, checkedSources: [...checkedSources] };
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      errors.push('Musixmatch');
    }
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
