import localforage from 'localforage';

const LRCLIB_API = 'https://lrclib.net/api';
const LRCMUX_API = 'https://api.lrcmux.dev';
const UNISON_API = 'https://unison.boidu.dev';
const AUTO_LYRICS_CACHE_PREFIX = 'autoLyrics:v2:';
const AUTO_LYRICS_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PROVIDER_OK_TTL_MS = 90 * 1000;
const PROVIDER_FAILURE_COOLDOWN_MS = 25 * 1000;
const PROVIDER_RATE_LIMIT_COOLDOWN_MS = 60 * 1000;
const providerHealth = new Map();

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

function buildTitleVariants(value) {
  const original = clean(value).normalize('NFKC').replace(/[‘’]/g, "'").replace(/[‐‑‒–—]/g, '-').replace(/\s+/g, ' ');
  if (!original) return [];

  // Remove only catalogue/editorial suffixes. Keep meaningful versions such as
  // Live, Remix and Acoustic so that they are not silently matched to a studio cut.
  const withoutEditorialSuffix = original
    .replace(/\s*[([]\s*(?:official\s+)?(?:audio|video|lyrics?|lyric\s+video|music\s+video|visualizer)\s*[)\]]\s*$/i, '')
    .replace(/\s*[-–—]\s*remaster(?:ed)?(?:\s+\d{4})?\s*$/i, '')
    .replace(/\s*[([]\s*remaster(?:ed)?(?:\s+\d{4})?\s*[)\]]\s*$/i, '')
    .trim();
  const normalized = normalizeText(original);
  const candidates = [original, withoutEditorialSuffix, normalized];
  const result = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const title = clean(candidate);
    const key = title.toLocaleLowerCase();
    if (title && !seen.has(key)) {
      seen.add(key);
      result.push(title);
    }
  }
  return result.slice(0, 3);
}

function providerForUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === 'lrclib.net' || host.endsWith('.lrclib.net')) return 'lrclib';
    if (host === 'api.lrcmux.dev' || host.endsWith('.lrcmux.dev')) return 'lrcmux';
    if (host === 'unison.boidu.dev') return 'unison';
  } catch { /* Ignore invalid or relative URLs. */ }
  return '';
}

function recordProviderHealth(provider, available, status = 0) {
  if (!provider) return;
  const now = Date.now();
  const cooldown = available
    ? PROVIDER_OK_TTL_MS
    : Number(status) === 429 ? PROVIDER_RATE_LIMIT_COOLDOWN_MS : PROVIDER_FAILURE_COOLDOWN_MS;
  providerHealth.set(provider, { available, status: Number(status) || 0, checkedAt: now, expiresAt: now + cooldown });
}

function providerRecentlyUnavailable(provider) {
  const state = providerHealth.get(provider);
  if (!state || Date.now() >= state.expiresAt) {
    if (state) providerHealth.delete(provider);
    return false;
  }
  return state.available === false;
}

function automaticLyricsCacheKey(track) {
  const title = normalizeText(track?.title);
  const artist = normalizeText(knownArtist(track?.artist));
  const album = normalizeText(track?.album);
  return title ? `${AUTO_LYRICS_CACHE_PREFIX}${title}::${artist}::${album}` : '';
}

async function readAutomaticLyricsCache(track) {
  const key = automaticLyricsCacheKey(track);
  if (!key) return null;
  try {
    const entry = await localforage.getItem(key);
    if (!entry?.savedAt || !entry?.result?.lines?.length) return null;
    if (Date.now() - Number(entry.savedAt) > AUTO_LYRICS_CACHE_TTL_MS) {
      await localforage.removeItem(key);
      return null;
    }
    if (!isLikelySameTrack(track, entry.result)) return null;
    const requestedDuration = Number(track?.duration) || 0;
    const cachedDuration = Number(entry.duration) || 0;
    if (requestedDuration && cachedDuration && Math.abs(requestedDuration - cachedDuration) > 18) return null;
    return {
      ...entry.result,
      cacheHit: true,
      checkedSources: ['MusPlay · локальный кэш'],
    };
  } catch {
    // If IndexedDB is unavailable, continue with online sources.
    return null;
  }
}

async function writeAutomaticLyricsCache(track, result) {
  const key = automaticLyricsCacheKey(track);
  if (!key || !result?.lines?.length) return;
  try {
    const savedResult = { ...result };
    delete savedResult.checkedSources;
    delete savedResult.cacheHit;
    await localforage.setItem(key, {
      savedAt: Date.now(),
      duration: Number(track?.duration) || 0,
      result: savedResult,
    });
  } catch {
    // The feature remains usable if persistent browser storage is unavailable.
  }
}

function lyricMatchScore(track, lyric) {
  const title = matchScore(track?.title, lyric?.trackName || lyric?.title);
  const artist = knownArtist(track?.artist)
    ? matchScore(track.artist, lyric?.artistName)
    : 0.5;
  const richSync = lyric?.syncType === 'richsync' || lyric?.format === 'ttml' ? 0.12 : 0;
  const source = String(lyric?.sourceName || '').toLowerCase();
  const sourceBonus = source.includes('musixmatch') ? 0.025
    : source.includes('lrclib') ? 0.02
      : source.includes('unison') ? 0.015 : 0.01;
  return title * 1.4 + artist + richSync + sourceBonus;
}

async function runProviderWithTimeout(source, callerSignal, timeoutMs = 9000) {
  if (callerSignal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const lyrics = await source.run(controller.signal);
    if (callerSignal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (timedOut) {
      const error = new Error(`${source.name} exceeded the ${timeoutMs} ms lookup limit`);
      error.name = 'TimeoutError';
      recordProviderHealth(source.id, false, 0);
      throw error;
    }
    return lyrics;
  } catch (error) {
    if (callerSignal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (timedOut) {
      recordProviderHealth(source.id, false, 0);
      const timeoutError = new Error(`${source.name} exceeded the ${timeoutMs} ms lookup limit`);
      timeoutError.name = 'TimeoutError';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', abortFromCaller);
  }
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

async function requestJson(url, signal, timeoutMs = 6500) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const provider = providerForUrl(url);
  // Use the real lookup request as the health check, so the app does not send
  // extra probe requests that produce no useful search results.
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const headers = { Accept: 'application/json' };
    // LRCLIB asks third-party clients to identify themselves. Don't add this
    // non-simple header to the other APIs, where it could trigger needless CORS preflights.
    if (provider === 'lrclib') headers['X-User-Agent'] = 'MusPlay/1.0.1 (https://github.com/musplayteam/musplay_musicplayer)';
    const response = await fetch(url, {
      signal: controller.signal,
      headers,
    });
    if (!response.ok) {
      const reachable = response.status >= 400 && response.status < 500 && response.status !== 429;
      recordProviderHealth(provider, reachable, response.status);
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    recordProviderHealth(provider, true, response.status);
    return await response.json();
  } catch (error) {
    if (timedOut) {
      recordProviderHealth(provider, false, 0);
      const timeoutError = new Error(`Lyrics provider timed out after ${timeoutMs} ms`);
      timeoutError.name = 'TimeoutError';
      throw timeoutError;
    }
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    // HTTP errors have already been classified above. Treat parse and network
    // errors as source failures only if no HTTP status was received.
    if (!error?.status) recordProviderHealth(provider, false, 0);
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
  if (typeof bridge?.getMusixmatchLyrics !== 'function') {
    recordProviderHealth('musixmatch', false, 0);
    return null;
  }

  const artist = knownArtist(track.artist);
  if (!artist) return null;

  // Ask Electron whether Musixmatch can issue/refresh its anonymous token before
  // spending time on track lookups. The token is cached by the main process.
  if (typeof bridge.checkMusixmatchAvailability === 'function') {
    let available = false;
    try {
      available = Boolean(await withTimeout(bridge.checkMusixmatchAvailability(), 4500, 'Musixmatch availability check'));
    } catch {
      recordProviderHealth('musixmatch', false, 0);
      return null;
    }
    recordProviderHealth('musixmatch', available, available ? 200 : 0);
    if (!available) return null;
  }

  const titles = buildTitleVariants(track.title).slice(0, 2);
  for (const title of titles) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    let response;
    try {
      response = await withTimeout(bridge.getMusixmatchLyrics({
        title,
        artist,
        album: clean(track.album),
        duration: Number(track.duration) || 0,
      }), 6000, 'Musixmatch');
      recordProviderHealth('musixmatch', true, 200);
    } catch (error) {
      recordProviderHealth('musixmatch', false, 0);
      throw error;
    }
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (!response?.lrc) continue;
    const lines = parseLrc(response.lrc);
    if (!lines.length) continue;
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
    // Never show a result for a different song with a similar title.
    if (isLikelySameTrack(track, normalized)) return normalized;
  }
  return null;
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

function normalizeLrclib(data) {
  if (!data || data.error || data.success === false) return null;
  const raw = String(data.syncedLyrics || data.synced_lyrics || '').trim();
  const lines = parseLrc(raw);
  if (!lines.length) return null;
  return {
    status: 'ok',
    trackName: data.trackName || data.track_name || '',
    artistName: data.artistName || data.artist_name || '',
    albumName: data.albumName || data.album_name || '',
    plainLyrics: String(data.plainLyrics || data.plain_lyrics || '').trim(),
    syncedLyrics: raw,
    lines,
    sourceName: 'LRCLIB',
    sourceUrl: 'https://lrclib.net/',
    syncType: 'linesync',
    format: 'lrc',
  };
}

async function findLrclibLyrics(track, signal) {
  const title = clean(track.title);
  const artist = knownArtist(track.artist);
  if (!title) return null;

  if (artist) {
    const params = new URLSearchParams({ track_name: title, artist_name: artist });
    if (track.album && !/без альбома|unknown album/i.test(track.album)) params.set('album_name', track.album);
    if (Number(track.duration) > 0) params.set('duration', String(Math.round(track.duration)));
    try {
      const exact = await requestJson(`${LRCLIB_API}/get?${params.toString()}`, signal, 5000);
      const normalized = normalizeLrclib(exact);
      if (normalized && isLikelySameTrack(track, normalized)) return normalized;
    } catch (error) {
      if (error?.name === 'AbortError' && signal?.aborted) throw error;
      // A miss is normal, but don't keep hitting a source after a network failure.
      if (!error?.status || ![400, 404].includes(error.status)) throw error;
    }
  }

  const titles = buildTitleVariants(title);
  const attempts = [];
  const seen = new Set();
  const addAttempt = (params) => {
    const key = params.toString();
    if (key && !seen.has(key) && attempts.length < 3) {
      seen.add(key);
      attempts.push(params);
    }
  };

  const structured = new URLSearchParams({ track_name: titles[0] || title });
  if (artist) structured.set('artist_name', artist);
  addAttempt(structured);

  // Try the reversed combined query, then a normalized/cleaned title (or title-only).
  if (artist) addAttempt(new URLSearchParams({ q: `${artist} ${title}` }));
  if (titles[1] && titles[1] !== title) {
    const cleaned = new URLSearchParams({ track_name: titles[1] });
    if (artist) cleaned.set('artist_name', artist);
    addAttempt(cleaned);
  } else {
    addAttempt(new URLSearchParams({ q: title }));
  }

  for (const searchParams of attempts) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    let results;
    try {
      results = await requestJson(`${LRCLIB_API}/search?${searchParams.toString()}`, signal, 5000);
    } catch (error) {
      if (error?.name === 'AbortError' && signal?.aborted) throw error;
      if (!error?.status || ![400, 404].includes(error.status)) throw error;
      continue;
    }
    const candidates = (Array.isArray(results) ? results : [])
      .map(item => normalizeLrclib(item))
      .filter(item => item && isLikelySameTrack(track, item))
      .sort((a, b) => lyricMatchScore(track, b) - lyricMatchScore(track, a));
    if (candidates.length) return candidates[0];
  }
  return null;
}

async function findLrcmuxLyrics(track, signal) {
  const requestedArtist = knownArtist(track.artist);
  const title = clean(track.title);
  const titles = buildTitleVariants(title);
  if (!title) return null;

  if (requestedArtist) {
    const params = new URLSearchParams({ track_name: title, artist_name: requestedArtist });
    if (track.album && !/без альбома|unknown album/i.test(track.album)) params.set('album_name', track.album);
    if (Number(track.duration) > 0) params.set('duration', String(Math.round(track.duration)));
    try {
      const exact = await requestJson(`${LRCMUX_API}/api/get?${params.toString()}`, signal, 5000);
      const normalized = normalizeLrcmux(exact);
      if (normalized && isLikelySameTrack(track, normalized)) return normalized;
    } catch (error) {
      if (error?.name === 'AbortError' && signal?.aborted) throw error;
      if (!error?.status || ![400, 404].includes(error.status)) throw error;
    }
  }

  const attempts = [];
  const seen = new Set();
  const addAttempt = (queryTitle, includeArtist) => {
    const params = new URLSearchParams({ track_name: queryTitle });
    if (includeArtist && requestedArtist) params.set('artist_name', requestedArtist);
    const key = params.toString();
    if (!seen.has(key) && attempts.length < 3) {
      seen.add(key);
      attempts.push(params);
    }
  };
  addAttempt(titles[0] || title, true);
  if (titles[1]) addAttempt(titles[1], true);
  // A title-only fallback can recover when local file artist tags differ from the catalogue.
  addAttempt(titles[0] || title, false);

  for (const searchParams of attempts) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    let result;
    try {
      result = await requestJson(`${LRCMUX_API}/api/search?${searchParams.toString()}`, signal, 5000);
    } catch (error) {
      if (error?.name === 'AbortError' && signal?.aborted) throw error;
      if (!error?.status || ![400, 404].includes(error.status)) throw error;
      continue;
    }
    const candidates = Array.isArray(result) ? result : Array.isArray(result?.data) ? result.data : Array.isArray(result?.results) ? result.results : [];
    const matching = candidates
      .filter(item => (item?.syncedLyrics || item?.synced_lyrics || item?.lyricsfile || item?.lyrics) && isLikelySameTrack(track, {
        trackName: item.trackName || item.track_name || item.title,
        artistName: item.artistName || item.artist_name || item.artist,
      }))
      .map(item => ({ item, score: lyricMatchScore(track, {
        trackName: item.trackName || item.track_name || item.title,
        artistName: item.artistName || item.artist_name || item.artist,
        syncType: item.syncType || item.sync_type,
        format: item.format,
        sourceName: 'LRC Mux',
      }) }))
      .sort((a, b) => b.score - a.score);

    for (const { item } of matching) {
      const normalized = normalizeLrcmux(item);
      if (normalized && isLikelySameTrack(track, normalized)) return normalized;
    }
  }
  return null;
}

async function findUnisonLyrics(track, signal) {
  const requestedArtist = knownArtist(track.artist);
  const title = clean(track.title);
  if (!title) return null;

  if (requestedArtist) {
    const params = new URLSearchParams({ song: title, artist: requestedArtist });
    if (track.album && !/без альбома|unknown album/i.test(track.album)) params.set('album', track.album);
    if (Number(track.duration) > 0) params.set('duration', String(Number(track.duration).toFixed(2)));
    try {
      const exact = await requestJson(`${UNISON_API}/lyrics?${params.toString()}`, signal, 5000);
      const normalized = normalizeUnison(exact);
      if (normalized && isLikelySameTrack(track, normalized)) return normalized;
    } catch (error) {
      if (error?.name === 'AbortError' && signal?.aborted) throw error;
      if (!error?.status || ![400, 404].includes(error.status)) throw error;
    }
  }

  const titles = buildTitleVariants(title);
  const queries = [
    [title, requestedArtist].filter(Boolean).join(' '),
    requestedArtist ? `${requestedArtist} ${title}` : '',
    titles[1] || '',
    title,
  ].filter(Boolean);
  const seen = new Set();
  const uniqueQueries = queries.filter(query => {
    const key = normalizeText(query);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 3);

  for (const query of uniqueQueries) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    let searchResult;
    try {
      const params = new URLSearchParams({ q: query, limit: '10' });
      searchResult = await requestJson(`${UNISON_API}/lyrics/search?${params.toString()}`, signal, 5000);
    } catch (error) {
      if (error?.name === 'AbortError' && signal?.aborted) throw error;
      if (!error?.status || ![400, 404].includes(error.status)) throw error;
      continue;
    }

    const candidates = searchResult?.success && Array.isArray(searchResult.data) ? searchResult.data : [];
    const matching = candidates
      .filter(item => item?.videoId && isLikelySameTrack(track, item))
      .map(item => ({ item, score: lyricMatchScore(track, {
        trackName: item.song,
        artistName: item.artist,
        syncType: item.syncType,
        format: item.format,
        sourceName: 'Unison · Better Lyrics',
      }) + Number(item.matchScore || 0) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);

    for (const { item } of matching) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      try {
        const record = await requestJson(`${UNISON_API}/lyrics?v=${encodeURIComponent(item.videoId)}`, signal, 5000);
        const normalized = normalizeUnison(record);
        if (normalized && isLikelySameTrack(track, normalized)) return normalized;
      } catch (error) {
        if (error?.name === 'AbortError' && signal?.aborted) throw error;
        if (!error?.status || ![400, 404].includes(error.status)) throw error;
      }
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

  // LRCLIB was the original working synced-lyrics provider; keep it in manual search too.
  tasks.push((async () => {
    try {
      const params = new URLSearchParams({ track_name: titleQuery });
      if (artistQuery) params.set('artist_name', artistQuery);
      const response = await requestJson(`${LRCLIB_API}/search?${params.toString()}`, signal, 6500);
      (Array.isArray(response) ? response : []).forEach(item => {
        if (item?.syncedLyrics) add('LRCLIB', 'https://lrclib.net/', item.syncedLyrics, item.trackName || titleQuery, item.artistName || artistQuery, item.albumName || '', item.copyright || '', 'lrc', 'linesync');
      });
    } catch (error) {
      if (error?.name === 'AbortError' && signal?.aborted) throw error;
    }
  })());

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

export async function findLyrics(track, signal, options = {}) {
  const title = clean(track?.title);
  const artist = clean(track?.artist);
  const cacheBypass = Boolean(options?.forceRefresh);
  const bridge = typeof window !== 'undefined' ? window.electronAPI : null;

  // User-curated .lrc files have highest priority and work without internet.
  try {
    if (typeof bridge?.getSavedLyrics === 'function') {
      const saved = await bridge.getSavedLyrics({ title, artist, album: track?.album || '' });
      const local = normalizeSavedLyrics(saved);
      if (local) return { ...local, checkedSources: ['MusPlay · локальная папка'] };
    }
  } catch { /* Continue with automatic cache and online providers. */ }

  if (!title) {
    return {
      status: 'missing',
      message: 'Для автоматического поиска синхронизированного текста нужно название трека. Исполнитель помогает повысить точность, но не обязателен.',
      checkedSources: [],
    };
  }
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  // Persist successful synced results for 30 days. The cache key includes the
  // album and artist so same-title recordings are not casually mixed together.
  if (!cacheBypass) {
    const cached = await readAutomaticLyricsCache(track);
    if (cached) return cached;
  }

  const sourceDefinitions = [
    { id: 'lrclib', name: 'LRCLIB', run: sourceSignal => findLrclibLyrics(track, sourceSignal) },
    ...(knownArtist(artist) ? [{ id: 'musixmatch', name: 'Musixmatch', run: sourceSignal => findMusixmatchLyrics(track, sourceSignal) }] : []),
    { id: 'lrcmux', name: 'LRC Mux', run: sourceSignal => findLrcmuxLyrics(track, sourceSignal) },
    { id: 'unison', name: 'Unison · Better Lyrics', run: sourceSignal => findUnisonLyrics(track, sourceSignal) },
  ];

  // Avoid repeatedly waiting on a provider that has just timed out or returned
  // a network/rate-limit error. A successful real lookup keeps it eligible for
  // a short period; no extra empty health-check request is sent.
  const skippedSources = sourceDefinitions.filter(source => providerRecentlyUnavailable(source.id));
  const sources = sourceDefinitions.filter(source => !providerRecentlyUnavailable(source.id));
  const checkedSources = sources.map(source => source.name);
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  if (!sources.length) {
    return {
      status: 'error',
      message: 'Все автоматические источники синхронизированного текста сейчас недоступны. Проверь интернет и попробуй ещё раз.',
      checkedSources: skippedSources.map(source => source.name),
    };
  }

  const startedAt = Date.now();
  const settled = await Promise.allSettled(sources.map(async source => ({
    source,
    lyrics: await runProviderWithTimeout(source, signal, 9000),
  })));
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const failures = [];
  const found = [];
  let successfulContact = 0;
  settled.forEach((entry, index) => {
    const source = sources[index];
    if (entry.status === 'rejected') {
      if (entry.reason?.name !== 'AbortError') failures.push(source.name);
      return;
    }
    const health = providerHealth.get(source.id);
    if (health?.available && health.checkedAt >= startedAt) successfulContact++;
    if (entry.value?.lyrics?.lines?.length) found.push({ source, lyrics: entry.value.lyrics });
  });

  if (found.length) {
    found.sort((a, b) => lyricMatchScore(track, b.lyrics) - lyricMatchScore(track, a.lyrics));
    const best = { ...found[0].lyrics, checkedSources };
    await writeAutomaticLyricsCache(track, best);
    return best;
  }

  const everyAttemptFailed = failures.length === sources.length;
  const everyAttemptUnavailable = successfulContact === 0 && failures.length > 0;
  if (everyAttemptFailed || everyAttemptUnavailable) {
    return {
      status: 'error',
      message: 'Все автоматические источники синхронизированного текста сейчас недоступны. Проверь интернет и попробуй ещё раз.',
      checkedSources: [...checkedSources, ...skippedSources.map(source => `${source.name} · временно пропущен`)],
    };
  }

  if (failures.length > 0 && successfulContact > 0) {
    return {
      status: 'error',
      message: 'Некоторые источники временно недоступны или вернули ошибку. В ответивших источниках синхронизированный текст не найден — попробуй повторить поиск позже.',
      checkedSources: [...checkedSources, ...skippedSources.map(source => `${source.name} · временно пропущен`)],
    };
  }

  return {
    status: 'missing',
    message: skippedSources.length
      ? 'В источниках, которые ответили, синхронизированный текст не найден. Некоторые источники временно недоступны — попробуй повторить поиск позже.'
      : 'Синхронизированный текст не найден в автоматических источниках (LRCLIB, Musixmatch, LRC Mux и Unison).',
    checkedSources: [...checkedSources, ...skippedSources.map(source => `${source.name} · временно пропущен`)],
  };
}
