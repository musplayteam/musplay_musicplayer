import localforage from 'localforage';

const LRCLIB_API = 'https://lrclib.net/api';
const LRCMUX_API = 'https://api.lrcmux.dev';
const UNISON_API = 'https://unison.boidu.dev';
const AUTO_LYRICS_CACHE_PREFIX = 'autoLyrics:v3:'; // v3 excludes malformed/unmatched lyrics cached by earlier builds.
// Successful lyrics are kept until the user clears MusPlay's local data.
// This is deliberate: once downloaded, lyrics must remain available offline.
const AUTO_LYRICS_CACHE_TTL_MS = 0;
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

function cleanLookupField(value) {
  let result = clean(value);
  // Some MP3 tags include the download site's domain as a catalogue suffix.
  result = result.replace(/\s*[\[(]\s*(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^)\]]*)?\s*[\])]?\s*$/iu, '').trim();
  // A bare domain is not a meaningful title, performer, or album name.
  if (/^(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/.*)?$/iu.test(result)) return '';
  return result;
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
    if (host === 'api.liriqo-alfarrizi.my.id') return 'liriqo';
    if (host === 'api.betterlyrics.org') return 'betterlyrics';
    if (host === 'lyrics-api.binimum.org' || host === 'lyrics-storage.binimum.org') return 'binilyrics';
    if (host.endsWith('lyricsplus.prjktla.my.id') || host.endsWith('lyricsplus.atomix.one') || host.endsWith('lyrics-plus-backend.vercel.app') || host.endsWith('lyricsplus-seven.vercel.app') || host.endsWith('lyricsplus.binimum.org') || host.endsWith('lyricsplus.prjktla.workers.dev')) return 'youlyplus';
    if (host === 'api.lyrics.ovh') return 'lyrics-ovh';
    if (host === 'solr.sscdn.co' || host === 'www.letras.mus.br') return 'letrasmus';
  } catch { /* Ignore invalid or relative URLs. */ }
  return '';
}

function recordProviderHealth(provider, available, status = 0) {
  if (!provider) return;
  providerHealth.set(provider, {
    available,
    status: Number(status) || 0,
    checkedAt: Date.now(),
  });
}

function automaticLyricsCacheKey(track, prefix = AUTO_LYRICS_CACHE_PREFIX) {
  const title = normalizeText(track?.title);
  const artist = normalizeText(knownArtist(track?.artist));
  const album = normalizeText(track?.album);
  return title ? `${prefix}${title}::${artist}::${album}` : '';
}

async function readAutomaticLyricsCache(track) {
  const key = automaticLyricsCacheKey(track);
  if (!key) return null;
  try {
    let entry = await localforage.getItem(key);
    let legacyKey = '';
    let migratedFromLegacy = false;
    if (!entry?.savedAt || !entry?.result?.lines?.length) {
      // Keep valid offline lyrics from 1.2.1: migrate them only after the new
      // language/quality/version checks pass. Bad legacy cache entries are ignored.
      legacyKey = automaticLyricsCacheKey(track, 'autoLyrics:v2:');
      if (legacyKey && legacyKey !== key) {
        const legacyEntry = await localforage.getItem(legacyKey);
        if (legacyEntry?.savedAt && legacyEntry?.result?.lines?.length) {
          entry = legacyEntry;
          migratedFromLegacy = true;
        }
      }
    }
    if (!entry?.savedAt || !entry?.result?.lines?.length) return null;
    if (AUTO_LYRICS_CACHE_TTL_MS > 0 && Date.now() - Number(entry.savedAt) > AUTO_LYRICS_CACHE_TTL_MS) {
      await localforage.removeItem(migratedFromLegacy ? legacyKey : key);
      return null;
    }
    if (!isUsableLyricsCandidate(track, entry.result)) return null;
    const requestedDuration = Number(track?.duration) || 0;
    const cachedDuration = Number(entry.duration) || 0;
    if (requestedDuration && cachedDuration && Math.abs(requestedDuration - cachedDuration) > 18) return null;
    if (migratedFromLegacy) {
      try { await localforage.setItem(key, entry); } catch { /* Keep using the legacy read for this session. */ }
    }
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
  if (!key || !isUsableLyricsCandidate(track, result)) return;
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

function scriptProfile(value) {
  const letters = String(value || '').match(/\p{L}/gu) || [];
  if (!letters.length) return { letters: 0, cyrillic: 0, latin: 0, cyrillicRatio: 0, latinRatio: 0 };
  const cyrillic = letters.filter(char => /\p{Script=Cyrillic}/u.test(char)).length;
  const latin = letters.filter(char => /\p{Script=Latin}/u.test(char)).length;
  return {
    letters: letters.length,
    cyrillic,
    latin,
    cyrillicRatio: cyrillic / letters.length,
    latinRatio: latin / letters.length,
  };
}

function normalizeLanguageCode(value) {
  const language = clean(value).toLowerCase().replace('_', '-');
  if (!language) return '';
  if (/^(ru|rus|russian)(-|$)/.test(language)) return 'ru';
  if (/^(en|eng|english)(-|$)/.test(language)) return 'en';
  if (/^(uk|ukr|ukrainian)(-|$)/.test(language)) return 'uk';
  if (/^(be|bel|belarusian)(-|$)/.test(language)) return 'be';
  if (/^(pt|por|portuguese)(-|$)/.test(language)) return 'pt';
  if (/^(es|spa|spanish)(-|$)/.test(language)) return 'es';
  if (/^(de|ger|german)(-|$)/.test(language)) return 'de';
  if (/^(fr|fre|french)(-|$)/.test(language)) return 'fr';
  return language.split('-')[0];
}

function inferExpectedLyricsLanguage(track) {
  const explicit = normalizeLanguageCode(
    track?.lyricsLanguage || track?.language || track?.lang || track?.metadata?.language || track?.tags?.language,
  );
  if (explicit) return { code: explicit, confidence: 1, source: 'metadata' };

  // A Cyrillic song title is a strong signal that the recording's original
  // lyrics should also be Cyrillic. Artist-only hints are deliberately weaker:
  // Russian artists can release English-language songs too.
  const titleProfile = scriptProfile(track?.title);
  if (titleProfile.letters >= 3 && titleProfile.cyrillicRatio >= 0.28) {
    return { code: 'ru', confidence: 0.96, source: 'title-script' };
  }
  const artistProfile = scriptProfile(knownArtist(track?.artist));
  if (artistProfile.letters >= 4 && artistProfile.cyrillicRatio >= 0.55) {
    return { code: 'ru', confidence: 0.62, source: 'artist-script' };
  }
  return { code: '', confidence: 0, source: '' };
}

function lyricsBodyText(lyric) {
  return (Array.isArray(lyric?.lines) ? lyric.lines : [])
    .map(line => {
      const text = clean(line?.text);
      if (text) return text;
      return Array.isArray(line?.words) ? line.words.map(word => clean(word?.text)).join(' ') : '';
    })
    .filter(Boolean)
    .join('\n');
}

function lyricsQuality(lyric) {
  const lines = Array.isArray(lyric?.lines) ? lyric.lines : [];
  const body = lyricsBodyText(lyric);
  const letters = body.match(/\p{L}/gu) || [];
  if (!lines.length || letters.length < 18) return { valid: false, score: 0 };

  const meaningfulLines = lines.map(line => clean(line?.text) || (line?.words || []).map(word => clean(word?.text)).join(' ')).filter(Boolean);
  const uniqueLines = new Set(meaningfulLines.map(normalizeText).filter(Boolean)).size;
  const duplicateRatio = meaningfulLines.length ? 1 - uniqueLines / meaningfulLines.length : 1;
  const profile = scriptProfile(body);
  const longLines = meaningfulLines.filter(line => (line.match(/\p{L}/gu) || []).length >= 26);
  const unspacedLongLines = longLines.filter(line => !/\s/.test(line));
  const fusedLineRatio = longLines.length ? unspacedLongLines.length / longLines.length : 0;
  const looksLikeMarkup = /<\/?(?:html|body|script|div|span|p)\b/i.test(body);
  const hasBrokenReplacementChars = (body.match(/[�\uFFFD]/g) || []).length > Math.max(2, letters.length * 0.02);

  // For alphabetic/Cyrillic writing systems, several long unspaced lines are
  // almost always a broken syllable/word join. Do not cache such a result.
  const usesWordSpaces = profile.cyrillicRatio > 0.25 || profile.latinRatio > 0.65;
  const fusedText = usesWordSpaces && longLines.length >= 2 && fusedLineRatio >= 0.4;
  if (looksLikeMarkup || hasBrokenReplacementChars || fusedText) {
    return { valid: false, score: 0.05, profile, fusedLineRatio, duplicateRatio };
  }

  const score = Math.max(0, Math.min(1,
    0.45 + Math.min(0.25, meaningfulLines.length / 100) + Math.min(0.2, letters.length / 1800)
    - duplicateRatio * 0.25 - fusedLineRatio * 0.35,
  ));
  return { valid: true, score, profile, fusedLineRatio, duplicateRatio };
}

const VERSION_MARKERS = [
  ['live', ['live', 'concert', 'концерт', 'концертная', 'концертный', 'концертное', 'лайв']],
  ['remix', ['remix', 'ремикс']],
  ['acoustic', ['acoustic', 'акустическая', 'акустический', 'акустическое']],
  ['karaoke', ['karaoke', 'караоке']],
  ['cover', ['cover', 'кавер']],
  ['instrumental', ['instrumental', 'минусовка', 'инструментал']],
  ['sped', ['sped up', 'speed up', 'ускоренная', 'ускоренный', 'ускоренное']],
  ['slowed', ['slowed', 'slowed reverb', 'замедленная', 'замедленный', 'замедленное']],
  ['nightcore', ['nightcore']],
  ['demo', ['demo', 'демо']],
];

function titleHasVersionMarker(title, aliases) {
  const normalized = ` ${normalizeText(title)} `;
  return aliases.some(alias => normalized.includes(` ${normalizeText(alias)} `));
}

function hasConflictingRecordingVersion(requestedTitle, candidateTitle) {
  const requested = normalizeText(requestedTitle);
  const candidate = normalizeText(candidateTitle);
  if (!requested || !candidate) return false;
  for (const [, aliases] of VERSION_MARKERS) {
    if (titleHasVersionMarker(requestedTitle, aliases) !== titleHasVersionMarker(candidateTitle, aliases)) return true;
  }
  return false;
}

function languageCompatibility(track, lyric, quality = lyricsQuality(lyric)) {
  const expected = inferExpectedLyricsLanguage(track);
  if (!expected.code) return { compatible: true, score: 0, expected };
  const declared = normalizeLanguageCode(lyric?.language || lyric?.lang || lyric?.lyricsLanguage);
  const detected = quality.profile || scriptProfile(lyricsBodyText(lyric));

  if (expected.code === 'ru') {
    const hasCyrillic = detected.cyrillicRatio >= 0.22;
    const isMostlyLatin = detected.latinRatio >= 0.66 && detected.cyrillicRatio < 0.12;
    if (declared && declared !== 'ru' && declared !== 'uk' && declared !== 'be' && isMostlyLatin) {
      return { compatible: false, score: -1, expected, declared };
    }
    if (expected.confidence >= 0.85 && isMostlyLatin) {
      return { compatible: false, score: -1, expected, detected, declared };
    }
    if (hasCyrillic) return { compatible: true, score: 0.16, expected, detected, declared };
    if (expected.confidence >= 0.8 && detected.letters >= 40) {
      return { compatible: false, score: -1, expected, detected, declared };
    }
    return { compatible: true, score: -0.2, expected, detected, declared };
  }

  if (declared && declared !== expected.code && detected.letters >= 40) {
    return { compatible: false, score: -1, expected, detected, declared };
  }
  return { compatible: true, score: 0, expected, detected, declared };
}

function candidateDurationSeconds(lyric) {
  const raw = Number(
    lyric?.durationSeconds ?? lyric?.duration ?? lyric?.durationMs ?? lyric?.duration_ms ??
    lyric?.trackDurationMs ?? lyric?.metadata?.duration ?? lyric?.metadata?.durationMs,
  );
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw > 1000 ? raw / 1000 : raw;
}

function isUsableLyricsCandidate(track, lyric) {
  if (!lyric?.lines?.length) return false;
  const requestedDuration = Number(track?.duration) || 0;
  const matchedDuration = candidateDurationSeconds(lyric);
  if (requestedDuration > 0 && matchedDuration > 0) {
    const tolerance = Math.max(12, requestedDuration * 0.08);
    if (Math.abs(requestedDuration - matchedDuration) > tolerance) return false;
  }
  const candidateTitle = lyric.trackName || lyric.title || track?.title;
  if (hasConflictingRecordingVersion(track?.title, candidateTitle)) return false;
  if (!isLikelySameTrack(track, lyric)) return false;
  const quality = lyricsQuality(lyric);
  if (!quality.valid) return false;
  return languageCompatibility(track, lyric, quality).compatible;
}

// Converts timed syllable fragments into properly spaced words using the
// provider's complete line text as the source of truth. If alignment is
// ambiguous, callers should render line.text instead of concatenating syllables.
export function restoreLyricWordSpacing(line) {
  const parts = Array.isArray(line?.words) ? line.words : [];
  const lineText = clean(line?.text);
  if (!parts.length || !lineText) return null;
  const targetWords = lineText.split(/\s+/).filter(Boolean);
  if (!targetWords.length) return null;
  let targetIndex = 0;
  let accumulated = '';
  const restored = [];

  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    const partText = String(part?.text || '');
    const fragment = normalizeText(partText);
    if (!fragment) {
      restored.push({ ...part, separator: part?.separator || '' });
      continue;
    }
    if (targetIndex >= targetWords.length) return null;
    accumulated += fragment;
    const target = normalizeText(targetWords[targetIndex]);
    if (target === accumulated) {
      restored.push({ ...part, separator: targetIndex < targetWords.length - 1 ? ' ' : '' });
      targetIndex++;
      accumulated = '';
      continue;
    }
    if (target.startsWith(accumulated)) {
      restored.push({ ...part, separator: '' });
      continue;
    }
    return null;
  }

  return targetIndex === targetWords.length && !accumulated ? restored : null;
}

function lyricMatchScore(track, lyric) {
  const title = matchScore(track?.title, lyric?.trackName || lyric?.title);
  const artist = knownArtist(track?.artist)
    ? matchScore(track.artist, lyric?.artistName)
    : 0.5;
  const richSync = lyric?.syncType === 'richsync' || lyric?.format === 'ttml' ? 0.12 : 0;
  const quality = lyricsQuality(lyric);
  const language = languageCompatibility(track, lyric, quality);
  const source = String(lyric?.sourceName || '').toLowerCase();
  const sourceBonus = source.includes('musixmatch') ? 0.012
    : source.includes('lrclib') ? 0.01
      : source.includes('unison') ? 0.008 : 0.005;
  const declaredConfidence = Math.max(0, Math.min(1, Number(lyric?.matchConfidence || lyric?.confidence || 0)));
  return title * 1.5 + artist * 1.1 + richSync + quality.score * 0.35 + language.score + declaredConfidence * 0.08 + sourceBonus;
}

async function runProviderWithTimeout(source, callerSignal, timeoutMs = 30000) {
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
  const candidateTitle = candidate?.trackName || candidate?.track_name || candidate?.song || candidate?.title || candidate?.track;
  const titleScore = matchScore(track?.title, candidateTitle);
  if (titleScore < 0.68) return false;
  if (hasConflictingRecordingVersion(track?.title, candidateTitle)) return false;

  // Local files often have a title tag but no artist tag. In that case, allow
  // title-based discovery. When an artist is known, use a stronger threshold
  // than the earlier permissive 0.32 to avoid translated covers/near-name hits.
  const requestedArtist = knownArtist(track?.artist);
  if (!requestedArtist) return true;
  const actualArtist = knownArtist(candidate?.artistName || candidate?.artist_name || candidate?.artist);
  if (!actualArtist) return false;
  return matchScore(requestedArtist, actualArtist) >= 0.48;
}

function abortError() {
  return new DOMException('Aborted', 'AbortError');
}

function waitWithSignal(milliseconds, signal) {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(finish, milliseconds);
    function cleanup() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
    function finish() {
      cleanup();
      resolve();
    }
    function onAbort() {
      cleanup();
      reject(abortError());
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function shouldRetryHttpStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

let lyricRequestSequence = 0;
async function fetchLyricsResponse(url, signal, timeoutMs, accept) {
  if (signal?.aborted) throw abortError();
  const bridge = typeof window !== 'undefined' ? window.electronAPI : null;
  if (typeof bridge?.requestLyrics !== 'function') {
    return fetch(url, { signal, headers: { Accept: accept } });
  }

  const requestId = `lyrics_${Date.now().toString(36)}_${(++lyricRequestSequence).toString(36)}`;
  const abortRequest = () => bridge.abortLyricsRequest?.(requestId);
  signal?.addEventListener('abort', abortRequest, { once: true });
  if (signal?.aborted) abortRequest();
  try {
    const result = await bridge.requestLyrics({ requestId, url, timeoutMs, accept });
    if (result?.error) {
      const error = new Error(String(result.error));
      error.code = String(result.code || 'NETWORK_FAILURE');
      throw error;
    }
    return {
      ok: Boolean(result?.ok),
      status: Number(result?.status) || 0,
      headers: { get: (name) => name?.toLowerCase() === 'retry-after' ? (result?.headers?.['retry-after'] || null) : null },
      json: async () => JSON.parse(String(result?.body || 'null')),
      text: async () => String(result?.body || ''),
    };
  } finally {
    signal?.removeEventListener('abort', abortRequest);
  }
}

function isNonRetryableNetworkError(error) {
  return ['TLS_FAILURE', 'MUSPLAY_PROVIDER_COOLDOWN'].includes(String(error?.code || '')) ||
    /ERR_CERT_|ERR_SSL_|CERT_COMMON_NAME_INVALID|MUSPLAY_PROVIDER_COOLDOWN/i.test(String(error?.message || ''));
}

function retryDelay(error, attempt) {
  const retryAfter = Number(error?.retryAfter) || 0;
  if (retryAfter > 0) return Math.min(retryAfter * 1000, 15000);
  return attempt === 1 ? 450 : 900;
}

async function requestJson(url, signal, timeoutMs = 7000) {
  if (signal?.aborted) throw abortError();

  const provider = providerForUrl(url);
  const maxAttempts = 2;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) throw abortError();
    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort();
    signal?.addEventListener('abort', abortFromCaller, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      // Keep provider requests minimal; the Electron main-process bridge
      // applies the same Accept header without exposing arbitrary network access.
      const headers = { Accept: 'application/json' };

      const response = await fetchLyricsResponse(url, controller.signal, timeoutMs, headers.Accept);

      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        const retryAfterHeader = response.headers?.get?.('Retry-After');
        error.retryAfter = retryAfterHeader && /^\d+(?:\.\d+)?$/.test(retryAfterHeader)
          ? Number(retryAfterHeader)
          : 0;
        // A normal 4xx response (for example, LRCLIB 404) means the API is
        // reachable; it is a lookup miss, not a provider outage.
        const reachable = response.status >= 400 && response.status < 500 && response.status !== 429;
        if (!shouldRetryHttpStatus(response.status) || attempt === maxAttempts) {
          recordProviderHealth(provider, reachable, response.status);
          throw error;
        }
        lastError = error;
      } else {
        const data = await response.json();
        recordProviderHealth(provider, true, response.status);
        return data;
      }
    } catch (error) {
      if (signal?.aborted) throw abortError();

      if (timedOut) {
        const timeoutError = new Error(`Lyrics provider timed out after ${timeoutMs} ms`);
        timeoutError.name = 'TimeoutError';
        lastError = timeoutError;
      } else {
        lastError = error;
      }

      const status = Number(lastError?.status) || 0;
      const retryable = !isNonRetryableNetworkError(lastError) && (!status || shouldRetryHttpStatus(status));
      if (!retryable || attempt === maxAttempts) {
        const reachable = status >= 400 && status < 500 && status !== 429;
        recordProviderHealth(provider, reachable, status);
        throw lastError;
      }
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abortFromCaller);
    }

    if (attempt < maxAttempts) {
      await waitWithSignal(retryDelay(lastError, attempt), signal);
    }
  }

  throw lastError || new Error('Lyrics request failed');
}

async function requestText(url, signal, timeoutMs = 9000) {
  if (signal?.aborted) throw abortError();
  const provider = providerForUrl(url);
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort();
    signal?.addEventListener('abort', abortFromCaller, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const response = await fetchLyricsResponse(url, controller.signal, timeoutMs, 'application/xml,text/xml,text/plain,*/*');
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        if (shouldRetryHttpStatus(response.status) && attempt < 2) lastError = error;
        else throw error;
      } else {
        recordProviderHealth(provider, true, response.status);
        return await response.text();
      }
    } catch (error) {
      if (signal?.aborted) throw abortError();
      lastError = timedOut ? Object.assign(new Error(`Request timed out after ${timeoutMs} ms`), { name: 'TimeoutError' }) : error;
      const status = Number(lastError?.status) || 0;
      if (status) recordProviderHealth(provider, status >= 400 && status < 500 && status !== 429, status);
      if (isNonRetryableNetworkError(lastError) || (status && !shouldRetryHttpStatus(status)) || attempt === 2) throw lastError;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abortFromCaller);
    }
    await waitWithSignal(attempt === 1 ? 450 : 900, signal);
  }
  throw lastError || new Error('Text request failed');
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
    const spans = [...paragraph.getElementsByTagNameNS('*', 'span')];
    let time = parseTimestamp(paragraph.getAttribute('begin'));
    if (time === null) {
      const timedChild = spans.map(span => parseTimestamp(span.getAttribute('begin')))
        .filter(value => value !== null).sort((a, b) => a - b)[0];
      time = timedChild ?? null;
    }
    const text = String(paragraph.textContent || '').replace(/\s+/g, ' ').trim();
    // Only leaf spans are used: parent spans often wrap other timed spans.
    const timedSpans = spans.filter(span => ![...span.children].some(child => child.localName?.toLowerCase() === 'span'));
    const words = timedSpans.map(span => {
      const rawText = String(span.textContent || '');
      const spanTime = parseTimestamp(span.getAttribute('begin'));
      const value = rawText.replace(/\s+/g, ' ').trim();
      if (spanTime === null || !value) return null;
      return { time: spanTime, text: value, separator: /\s$/.test(rawText) ? ' ' : '' };
    }).filter(Boolean);
    if (time !== null && text) lines.push({ time, text, ...(words.length ? { words } : {}), index });
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
    language: payload.language || payload.lang || payload.lyricsLanguage || '',
    matchConfidence: payload.confidence || payload.score || '',
    duration: payload.duration || payload.durationMs || payload.duration_ms || '',
  };
}

function withTimeout(promise, timeoutMs, label = 'Lyrics source', signal) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      callback(value);
    };
    const timer = setTimeout(() => {
      const error = new Error(`${label} timed out after ${timeoutMs} ms`);
      error.name = 'TimeoutError';
      finish(reject, error);
    }, timeoutMs);
    const onAbort = () => finish(reject, abortError());

    if (signal?.aborted) {
      finish(reject, abortError());
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(promise).then(
      value => finish(resolve, value),
      error => finish(reject, error),
    );
  });
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
      available = Boolean(await withTimeout(bridge.checkMusixmatchAvailability(), 12000, 'Musixmatch availability check', signal));
    } catch (error) {
      if (signal?.aborted || error?.name === 'AbortError') throw abortError();
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
      }), 22000, 'Musixmatch', signal);
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
      language: response.language || response.lang || '',
      matchConfidence: response.score || response.confidence || '',
      duration: response.duration || response.durationMs || response.duration_ms || '',
    };
    // Never show a result for a different song with a similar title.
    if (isUsableLyricsCandidate(track, normalized)) return normalized;
  }
  return null;
}

function formatLrcTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const centiseconds = Math.round(safe * 100);
  const minutes = Math.floor(centiseconds / 6000);
  const wholeSeconds = Math.floor((centiseconds % 6000) / 100);
  const fraction = centiseconds % 100;
  return `${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}.${String(fraction).padStart(2, '0')}`;
}

function lrcFromStructuredLines(lines) {
  if (!Array.isArray(lines)) return '';
  return lines.map(line => {
    const words = Array.isArray(line?.words) ? line.words : [];
    const firstWordStart = words.find(word => Number.isFinite(Number(word?.start)))?.start;
    const startMs = Number(line?.start ?? firstWordStart);
    const text = String(line?.text || '').trim();
    if (!Number.isFinite(startMs) || !text) return '';
    const wordText = words.map(word => {
      const wordStartMs = Number(word?.start);
      const wordValue = String(word?.text || '').trim();
      if (!Number.isFinite(wordStartMs) || !wordValue) return '';
      return `<${formatLrcTime(wordStartMs / 1000)}>${wordValue}`;
    }).filter(Boolean).join(' ');

    return `[${formatLrcTime(startMs / 1000)}]${wordText || text}`;
  }).filter(Boolean).join('\n');
}

function normalizeLrcmux(data) {
  if (!data || data.success === false) return null;
  const payload = data.data || data;
  const track = payload.track || payload;
  const meta = payload.meta || data.meta || {};
  const level = String(meta.level || payload.syncType || payload.sync_type || '').toLowerCase();
  if (level === 'none' || level === 'plain') return null;

  // Current LRCMux v1 API returns structured JSON lines with timestamps in
  // milliseconds. Older compatibility responses may still return an LRC/TTML body.
  const structuredRaw = lrcFromStructuredLines(payload.lines);
  const raw = structuredRaw || String(payload.syncedLyrics || payload.synced_lyrics || payload.lyricsfile || payload.lyrics || '').trim();
  if (!raw) return null;

  const isTtml = String(payload.format || '').toLowerCase() === 'ttml' || /<tt(?:\s|>)/i.test(raw);
  const lines = isTtml ? parseTtml(raw) : parseLrc(raw);
  if (!lines.length) return null;

  const upstreamName = typeof meta.source === 'string'
    ? meta.source
    : meta.source?.name || meta.source?.provider || payload.source?.name || payload.source?.provider || payload.provider || '';
  const sourceName = upstreamName ? `LRC Mux · ${upstreamName}` : 'LRC Mux';
  const candidateUrl = meta.source?.url || payload.source?.url || payload.sourceUrl || payload.url;
  const sourceUrl = typeof candidateUrl === 'string' && candidateUrl.startsWith('https://')
    ? candidateUrl
    : 'https://lrcmux.dev/';

  return {
    status: 'ok',
    trackName: track.title || payload.trackName || payload.track_name || payload.title || '',
    artistName: track.artist || payload.artistName || payload.artist_name || payload.artist || '',
    albumName: track.album || payload.albumName || payload.album_name || payload.album || '',
    plainLyrics: '',
    syncedLyrics: raw,
    lines,
    sourceName,
    sourceUrl,
    syncType: level === 'word' || level === 'richsync' ? 'richsync' : (payload.syncType || payload.sync_type || 'linesync'),
    format: isTtml ? 'ttml' : 'lrc',
    language: meta.language || payload.language || payload.lang || '',
    matchConfidence: payload.score || meta.score || '',
    duration: track.duration || payload.duration || payload.durationMs || '',
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
    language: data.language || data.lang || '',
    matchConfidence: data.score || data.matchScore || '',
    duration: data.duration || data.durationMs || data.duration_ms || '',
  };
}

// QQ Music QRC and KuGou KRC use millisecond-based timed word segments.
// Parse the timed payload instead of flattening it into unsynchronised text.
function parseKaraokeTimedText(rawLyrics) {
  const raw = String(rawLyrics || '').trim();
  if (!raw) return [];
  let source = raw;
  if (typeof DOMParser !== 'undefined' && /<[^>]+>/.test(raw)) {
    try {
      const xml = new DOMParser().parseFromString(raw, 'application/xml');
      if (!xml.querySelector('parsererror')) source = xml.documentElement.textContent || raw;
    } catch { /* Continue with the raw provider payload. */ }
  }
  const result = [];
  const linePattern = /\[(\d+),(\d+)\]([^\r\n]*)/g;
  let lineMatch;
  let index = 0;
  while ((lineMatch = linePattern.exec(source))) {
    const lineStart = Number(lineMatch[1]) / 1000;
    const body = lineMatch[3] || '';
    const wordPattern = /\((\d+),(\d+)\)([^()]*)/g;
    const words = [];
    let wordMatch;
    while ((wordMatch = wordPattern.exec(body))) {
      const text = String(wordMatch[3] || '').replace(/<[^>]*>/g, '').trim();
      if (!text) continue;
      words.push({ time: Number(wordMatch[1]) / 1000, text });
    }
    const text = (words.length ? words.map(word => word.text).join(' ') : body)
      .replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (text) result.push({ time: Number.isFinite(lineStart) ? lineStart : (words[0]?.time || 0), text, ...(words.length ? { words } : {}), index: index++ });
  }
  return result.sort((a, b) => a.time - b.time);
}

function normalizeLiriqoTrack(item, metadata = {}) {
  if (!item || typeof item !== 'object') return null;
  const trackName = item.title || item.song || item.trackName || metadata.title || '';
  const artistName = item.artist || item.artistName || metadata.artist || '';
  const albumName = item.album || item.albumName || metadata.album || '';
  const format = String(item.format || (item.ttml ? 'ttml' : item.lrc ? 'lrc' : '')).toLowerCase();
  const raw = String(item.ttml || item.lrc || item.syncedLyrics || item.synced_lyrics || item.lyrics || '').trim();
  let lines = [];
  if (raw && (format === 'ttml' || /<tt(?:\s|>)/i.test(raw))) lines = parseTtml(raw);
  else if (raw) lines = parseLrc(raw);

  // LiriQo also returns normalized timed lines for QQ/Kugou/NetEase results.
  if (!lines.length && Array.isArray(item.timed)) {
    const numericStarts = item.timed.map(line => Number(line?.start ?? line?.startTimeMs)).filter(Number.isFinite);
    const maxStart = Math.max(0, ...numericStarts);
    const duration = Number(metadata.duration || item.duration) || 0;
    const divisor = maxStart > Math.max(1000, duration * 5) ? 1000 : 1;
    lines = item.timed.map((line, index) => {
      const startValue = Number(line?.start ?? line?.startTimeMs);
      const text = String(line?.text || line?.plain || '').trim();
      if (!Number.isFinite(startValue) || !text) return null;
      const wordsRaw = Array.isArray(line.words) ? line.words : [];
      const wordStarts = wordsRaw.map(word => Number(word?.start ?? word?.startTimeMs)).filter(Number.isFinite);
      const wordMax = Math.max(0, ...wordStarts);
      const wordDivisor = wordMax > Math.max(1000, duration * 5) ? 1000 : divisor;
      const words = wordsRaw.map(word => {
        const time = Number(word?.start ?? word?.startTimeMs);
        const value = String(word?.text || '').trim();
        return Number.isFinite(time) && value ? { time: time / wordDivisor, text: value } : null;
      }).filter(Boolean);
      return { time: startValue / divisor, text, ...(words.length ? { words } : {}), index };
    }).filter(Boolean).sort((a, b) => a.time - b.time);
  }

  if (!lines.length && (item.qrc || item.krc)) lines = parseKaraokeTimedText(item.qrc || item.krc);
  if (!lines.length) return null;
  const provider = String(item.upstreamProvider || item.provider || item.source || 'LiriQo').replace(/[_-]+/g, ' ');
  const syncLevel = String(item.syncLevel || item.syncType || '').toLowerCase();
  const syncType = ['syllable', 'word', 'richsync'].includes(syncLevel) || lines.some(line => line.words?.length)
    ? 'richsync' : 'linesync';
  return {
    status: 'ok', trackName, artistName, albumName, plainLyrics: item.plain || '',
    syncedLyrics: raw, lines, sourceName: `LiriQo · ${provider}`,
    sourceUrl: 'https://github.com/AlFarrizi-Studio/Liriqo', syncType,
    format: format === 'ttml' || /<tt(?:\s|>)/i.test(raw) ? 'ttml' : 'lrc',
    language: item.language || item.lang || item.lyricsLanguage || metadata.language || '',
    matchConfidence: item.matchScore || item.score || item.confidence || '',
    duration: item.duration || item.durationMs || metadata.duration || '',
  };
}

async function findLiriqoLyrics(track, signal) {
  const title = clean(track.title);
  if (!title) return null;
  const params = new URLSearchParams({ title });
  const artist = knownArtist(track.artist);
  if (artist) params.set('artist', artist);
  if (track.album) params.set('album', track.album);
  if (Number(track.duration) > 0) params.set('duration', String(Math.round(Number(track.duration))));
  const response = await requestJson(`https://api.liriqo-alfarrizi.my.id/v1/lyrics?${params.toString()}`, signal, 18000);
  const payload = response?.data || response;
  const metadata = payload?.metadata || { title, artist, album: track.album, duration: track.duration };
  const candidates = [payload?.primary, ...(Array.isArray(payload?.tracks) ? payload.tracks : [])]
    .filter(Boolean)
    .map(item => normalizeLiriqoTrack(item, metadata))
    .filter(item => item && isUsableLyricsCandidate(track, item))
    .sort((a, b) => lyricMatchScore(track, b) - lyricMatchScore(track, a));
  return candidates[0] || null;
}

async function findBetterLyrics(track, provider, signal) {
  const title = clean(track.title);
  const artist = knownArtist(track.artist);
  if (!title || !artist) return null;
  const path = provider === 'kugou' ? '/kugou/getLyrics' : provider === 'qq' ? '/qq/getLyrics' : '/getLyrics';
  const params = new URLSearchParams({ s: title, a: artist, al: clean(track.album), d: String(Math.round(Number(track.duration) || 0)) });
  const response = await requestJson(`https://api.betterlyrics.org${path}?${params.toString()}`, signal, 12000);
  const raw = String(response?.ttml || response?.lyrics || response?.data?.ttml || response?.data?.lyrics || '').trim();
  if (!raw) return null;
  let lines = /<tt(?:\s|>)/i.test(raw) ? parseTtml(raw) : parseLrc(raw);
  if (!lines.length && provider !== 'ttml') lines = parseKaraokeTimedText(raw);
  if (!lines.length) return null;
  const result = {
    status: 'ok', trackName: response?.title || title, artistName: response?.artist || artist,
    albumName: response?.album || clean(track.album), plainLyrics: '', syncedLyrics: raw, lines,
    sourceName: `Better Lyrics · ${provider.toUpperCase()}`,
    sourceUrl: 'https://betterlyrics.org/',
    syncType: provider === 'ttml' || provider === 'qq' || lines.some(line => line.words?.length) ? 'richsync' : 'linesync',
    format: /<tt(?:\s|>)/i.test(raw) ? 'ttml' : 'lrc',
    language: response?.language || response?.lang || '',
    matchConfidence: response?.score || response?.confidence || '',
    duration: response?.duration || response?.durationMs || response?.trackDurationMs || '',
  };
  return isLikelySameTrack(track, result) ? result : null;
}

async function findBiniLyrics(track, signal) {
  const title = clean(track.title);
  if (!title) return null;
  const artist = knownArtist(track.artist);
  const query = [title, artist].filter(Boolean).join(' ');
  const search = await requestJson(`https://lyrics-api.binimum.org/getLyrics?q=${encodeURIComponent(query)}`, signal, 10000);
  const candidates = Array.isArray(search?.results) ? search.results : [];
  const matching = candidates
    .filter(item => item?.lyricsUrl && matchScore(title, item.track_name || '') >= 0.68)
    .filter(item => !artist || matchScore(artist, item.artist_name || '') >= 0.48)
    .sort((a, b) => (matchScore(title, b.track_name) + (artist ? matchScore(artist, b.artist_name) : 0)) - (matchScore(title, a.track_name) + (artist ? matchScore(artist, a.artist_name) : 0)));
  for (const item of matching.slice(0, 2)) {
    if (signal?.aborted) throw abortError();
    const lyricsUrl = String(item.lyricsUrl);
    const url = /^https?:\/\//i.test(lyricsUrl) ? lyricsUrl : `https://lyrics-storage.binimum.org/${lyricsUrl.replace(/^\//, '')}`;
    let raw = '';
    try { raw = await requestText(url, signal, 9000); }
    catch (error) { if (error?.name === 'AbortError' && signal?.aborted) throw error; continue; }
    if (!/<tt(?:\s|>)/i.test(raw)) continue;
    const lines = parseTtml(raw);
    if (!lines.length) continue;
    return {
      status: 'ok', trackName: item.track_name || title, artistName: item.artist_name || artist,
      albumName: item.album_name || clean(track.album), plainLyrics: '', syncedLyrics: raw, lines,
      sourceName: 'BiniLyrics', sourceUrl: 'https://binimum.org/',
      syncType: item.timing_type === 'word' ? 'richsync' : 'linesync', format: 'ttml',
      language: item.language || item.lang || '',
      matchConfidence: item.matchScore || item.score || '',
      duration: item.duration || item.durationMs || '',
    };
  }
  return null;
}

async function findYouLyPlus(track, signal) {
  const title = clean(track.title);
  if (!title) return null;
  const artist = knownArtist(track.artist);
  const servers = [
    'https://lyricsplus.prjktla.my.id',
    'https://lyricsplus.atomix.one',
    'https://lyrics-plus-backend.vercel.app',
    'https://lyricsplus-seven.vercel.app',
    'https://lyricsplus.binimum.org',
    'https://lyricsplus.prjktla.workers.dev',
  ];
  const params = new URLSearchParams({ title });
  if (artist) params.set('artist', artist);
  const attempts = await Promise.allSettled(servers.map(async server => ({
    server,
    data: await requestJson(`${server}/v2/lyrics/get?${params.toString()}`, signal, 6500),
  })));
  const candidates = [];
  for (const attempt of attempts) {
    if (attempt.status !== 'fulfilled') continue;
    const { server, data } = attempt.value;
    if (data?.error) continue;
    const payload = data?.data || data;
    const linesPayload = Array.isArray(payload?.lyrics) ? payload.lyrics : [];
    if (linesPayload.length) {
      const numericTimes = linesPayload.map(line => Number(line?.time)).filter(Number.isFinite);
      const maxTime = Math.max(0, ...numericTimes);
      const duration = Number(track.duration) || 0;
      const divisor = maxTime > Math.max(1000, duration * 5) ? 1000 : 1;
      const lines = linesPayload.map((line, index) => {
        const time = Number(line?.time);
        const text = String(line?.text || '').trim();
        if (!Number.isFinite(time) || !text) return null;
        const syllables = Array.isArray(line.syllabus) ? line.syllabus : [];
        const words = syllables.map(part => {
          const partTime = Number(part?.time);
          const value = String(part?.text || '').trim();
          return Number.isFinite(partTime) && value ? { time: partTime / divisor, text: value, separator: '' } : null;
        }).filter(Boolean);
        const normalizedLine = { time: time / divisor, text, ...(words.length ? { words } : {}), index };
        if (normalizedLine.words?.length) {
          const spacedWords = restoreLyricWordSpacing(normalizedLine);
          if (spacedWords) normalizedLine.words = spacedWords;
          else delete normalizedLine.words; // Prefer an intact line over broken syllable concatenation.
        }
        return normalizedLine;
      }).filter(Boolean).sort((a, b) => a.time - b.time);
      if (lines.length) candidates.push({
        status: 'ok', trackName: payload?.metadata?.title || payload?.trackName || title,
        artistName: payload?.artistName || artist, albumName: payload?.albumName || clean(track.album),
        plainLyrics: payload?.plainLyrics || '', syncedLyrics: String(payload?.syncedLyrics || ''), lines,
        sourceName: `YouLyPlus · ${new URL(server).hostname}`, sourceUrl: server,
        syncType: lines.some(line => line.words?.length) || /word|syllable/i.test(payload?.type || '') ? 'richsync' : 'linesync',
        format: 'lrc', language: payload?.metadata?.language || payload?.language || data?.language || '',
        matchConfidence: payload?.matchScore || payload?.score || data?.score || '',
        duration: payload?.metadata?.duration || payload?.duration || '',
      });
      continue;
    }
    const raw = String(payload?.syncedLyrics || payload?.synced_lyrics || '').trim();
    const parsed = parseLrc(raw);
    if (parsed.length) candidates.push({
      status: 'ok', trackName: payload?.trackName || title, artistName: payload?.artistName || artist,
      albumName: payload?.albumName || clean(track.album), plainLyrics: '', syncedLyrics: raw, lines: parsed,
      sourceName: `YouLyPlus · ${new URL(server).hostname}`, sourceUrl: server,
      syncType: 'linesync', format: 'lrc',
      language: payload?.metadata?.language || payload?.language || data?.language || '',
      matchConfidence: payload?.matchScore || payload?.score || data?.score || '',
      duration: payload?.metadata?.duration || payload?.duration || '',
    });
  }
  return candidates.filter(item => isUsableLyricsCandidate(track, item))
    .sort((a, b) => lyricMatchScore(track, b) - lyricMatchScore(track, a))[0] || null;
}

async function findLetrasMusLyrics(track, signal) {
  const title = clean(track.title);
  if (!title) return null;
  const artist = knownArtist(track.artist);
  const query = [title, artist].filter(Boolean).join(' ').replace(/[+\-!(){}\[\]^"~*?:\\/]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!query) return null;
  const searchUrl = `https://solr.sscdn.co/letras/m1/?q=${encodeURIComponent(query)}&wt=json&callback=LetrasSug`;
  const searchRaw = await requestText(searchUrl, signal, 9000);
  const jsonText = searchRaw.trim().replace(/^[^(]*?\(/, '').replace(/\);?\s*$/, '');
  let search;
  try { search = JSON.parse(jsonText); } catch { return null; }
  const docs = Array.isArray(search?.response?.docs) ? search.response.docs : [];
  const matches = docs.filter(doc => doc?.t === '2' && doc?.dns && doc?.url)
    .filter(doc => matchScore(title, doc.txt || '') >= 0.65)
    .filter(doc => !artist || matchScore(artist, doc.art || '') >= 0.25)
    .sort((a, b) => (matchScore(title, b.txt || '') + (artist ? matchScore(artist, b.art || '') : 0)) - (matchScore(title, a.txt || '') + (artist ? matchScore(artist, a.art || '') : 0)));
  for (const doc of matches.slice(0, 3)) {
    if (signal?.aborted) throw abortError();
    const pageUrl = `https://www.letras.mus.br/${doc.dns}/${doc.url}/`;
    let html = '';
    try { html = await requestText(pageUrl, signal, 9000); }
    catch (error) { if (error?.name === 'AbortError' && signal?.aborted) throw error; continue; }
    const omqMatch = html.match(/_omq\.push\(\['ui\/lyric',\s*({[\s\S]*?})\s*,/i);
    if (!omqMatch?.[1]) continue;
    let omq;
    try { omq = JSON.parse(omqMatch[1]); } catch { continue; }
    if (!omq?.ID || !omq?.YoutubeID) continue;
    let subtitle;
    try {
      subtitle = await requestJson(`https://www.letras.mus.br/api/v2/subtitle/${encodeURIComponent(omq.ID)}/${encodeURIComponent(omq.YoutubeID)}/`, signal, 9000);
    } catch (error) { if (error?.name === 'AbortError' && signal?.aborted) throw error; continue; }
    const rawSubtitle = subtitle?.Original?.Subtitle;
    if (!rawSubtitle) continue;
    let entries;
    try { const parsed = JSON.parse(rawSubtitle); entries = Array.isArray(parsed) ? parsed : parsed?.subtitle; }
    catch { continue; }
    if (!Array.isArray(entries)) continue;
    const lines = entries.filter(entry => Array.isArray(entry) && entry.length >= 3)
      .map((entry, index) => ({ time: Number(entry[1]), text: String(entry[0] || '').trim(), index }))
      .filter(line => Number.isFinite(line.time) && line.text).sort((a, b) => a.time - b.time);
    if (!lines.length) continue;
    const normalized = {
      status: 'ok', trackName: doc.txt || title, artistName: doc.art || artist,
      albumName: clean(track.album), plainLyrics: '', syncedLyrics: '', lines,
      sourceName: 'LetrasMus', sourceUrl: pageUrl, syncType: 'linesync', format: 'timed-json', language: 'pt-BR',
    };
    if (isUsableLyricsCandidate(track, normalized)) return normalized;
  }
  return null;
}

async function findLyricsOvhPlain(track, signal) {
  const artist = knownArtist(track.artist);
  const title = clean(track.title);
  if (!artist || !title) return null;
  const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
  const response = await requestJson(url, signal, 9000);
  const plain = String(response?.lyrics || '').trim();
  if (!plain) return null;
  const lines = plain.split(/\r?\n/).map(text => text.trim()).filter(Boolean)
    .map((text, index) => ({ time: Number.MAX_SAFE_INTEGER, text, index }));
  if (!lines.length) return null;
  return {
    status: 'ok', trackName: title, artistName: artist, albumName: clean(track.album),
    plainLyrics: plain, syncedLyrics: '', lines, sourceName: 'Lyrics.ovh · обычный текст',
    sourceUrl: 'https://lyrics.ovh/', syncType: 'plain', format: 'plain',
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
      if (normalized && isUsableLyricsCandidate(track, normalized)) return normalized;
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
      .filter(item => item && isUsableLyricsCandidate(track, item))
      .sort((a, b) => lyricMatchScore(track, b) - lyricMatchScore(track, a));
    if (candidates.length) return candidates[0];
  }
  return null;
}

async function findLrcmuxLyrics(track, signal) {
  const requestedArtist = knownArtist(track.artist);
  const title = clean(track.title);
  if (!title) return null;

  // LRCMux v1 uses GET /get with title/artist parameters. The old /api/get
  // and /api/search paths were not part of its current public API and returned
  // misses even though the service itself was online.
  const titles = buildTitleVariants(title).slice(0, 2);
  for (const queryTitle of titles) {
    if (signal?.aborted) throw abortError();
    const params = new URLSearchParams({ title: queryTitle, level: 'word', format: 'json' });
    if (requestedArtist) params.set('artist', requestedArtist);
    if (track.album && !/без альбома|unknown album/i.test(track.album)) params.set('album', track.album);
    if (Number(track.duration) > 0) params.set('duration', String(Math.round(track.duration)));

    let response;
    try {
      response = await requestJson(`${LRCMUX_API}/get?${params.toString()}`, signal, 10000);
    } catch (error) {
      if (error?.name === 'AbortError' && signal?.aborted) throw error;
      // LRCMux returns 404 when no matching synced lyrics exist.
      if (Number(error?.status) === 404 || Number(error?.status) === 400) continue;
      throw error;
    }

    const normalized = normalizeLrcmux(response);
    if (normalized && isUsableLyricsCandidate(track, normalized)) return normalized;
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
      if (normalized && isUsableLyricsCandidate(track, normalized)) return normalized;
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
        if (normalized && isUsableLyricsCandidate(track, normalized)) return normalized;
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
    const manualCandidate = {
      status: 'ok', trackName: title, title, artistName: resolvedArtist, albumName,
      plainLyrics: '', syncedLyrics, lines, sourceName, sourceUrl, syncType: syncType || (isTtml ? 'richsync' : 'linesync'), copyright,
      format: isTtml ? 'ttml' : 'lrc',
    };
    if (!isUsableLyricsCandidate({ title: titleQuery, artist: artistQuery }, manualCandidate)) return;
    results.push(manualCandidate);
  };

  const addNormalizedResult = (normalized) => {
    if (!normalized?.lines?.length || !isUsableLyricsCandidate({ title: titleQuery, artist: artistQuery }, normalized)) return false;
    const title = normalized.trackName || normalized.title || titleQuery;
    const resolvedArtist = normalized.artistName || artistQuery;
    if (artistQuery && !isLikelySameTrack({ title: titleQuery, artist: artistQuery }, { trackName: title, artistName: resolvedArtist })) return false;
    const signature = normalized.syncedLyrics || normalized.lines.map(line => `${line.time}:${line.text}`).join('\n');
    const key = `${normalizeText(title)}::${normalizeText(resolvedArtist)}::${normalizeText(signature.slice(0, 100))}`;
    if (seen.has(key)) return false;
    seen.add(key);
    results.push(normalized);
    return true;
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
        const response = await withTimeout(bridge.getMusixmatchLyrics({ title: titleQuery, artist: artistQuery, album: '', duration: 0 }), 22000, 'Musixmatch', signal);
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

  // Source 2: LRC Mux v1. It returns structured JSON with timestamps in ms.
  tasks.push((async () => {
    try {
      const params = new URLSearchParams({ title: titleQuery, level: 'word', format: 'json' });
      if (artistQuery) params.set('artist', artistQuery);
      const response = await requestJson(`${LRCMUX_API}/get?${params.toString()}`, signal, 10000);
      const normalized = normalizeLrcmux(response);
      if (normalized) {
        add(
          normalized.sourceName,
          normalized.sourceUrl,
          normalized.syncedLyrics,
          normalized.trackName || titleQuery,
          normalized.artistName || artistQuery,
          normalized.albumName || '',
          normalized.copyright || '',
          normalized.format || 'lrc',
          normalized.syncType || 'linesync',
        );
      }
    } catch (error) {
      if (error?.name === 'AbortError' && signal?.aborted) throw error;
      // A failure here must not prevent the other catalogues from returning results.
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

  // The same expanded catalogues are available in manual search as in automatic lookup.
  const queryTrack = { title: titleQuery, artist: artistQuery, album: '', duration: 0 };
  tasks.push((async () => {
    try { addNormalizedResult(await findLiriqoLyrics(queryTrack, signal)); }
    catch (error) { if (error?.name === 'AbortError' && signal?.aborted) throw error; }
  })());
  for (const provider of ['ttml', 'qq', 'kugou']) {
    tasks.push((async () => {
      try { addNormalizedResult(await findBetterLyrics(queryTrack, provider, signal)); }
      catch (error) { if (error?.name === 'AbortError' && signal?.aborted) throw error; }
    })());
  }
  for (const [name, run] of [
    ['BiniLyrics', findBiniLyrics], ['YouLyPlus', findYouLyPlus], ['LetrasMus', findLetrasMusLyrics],
  ]) {
    tasks.push((async () => {
      try { addNormalizedResult(await run(queryTrack, signal)); }
      catch (error) { if (error?.name === 'AbortError' && signal?.aborted) throw error; }
    })());
  }

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
  const lookupTrack = {
    ...(track || {}),
    title: cleanLookupField(track?.title),
    artist: cleanLookupField(track?.artist),
    album: cleanLookupField(track?.album),
  };
  const title = clean(lookupTrack.title);
  const artist = clean(lookupTrack.artist);
  const cacheBypass = Boolean(options?.forceRefresh);
  const bridge = typeof window !== 'undefined' ? window.electronAPI : null;

  // User-curated .lrc files have highest priority and work without internet.
  try {
    if (typeof bridge?.getSavedLyrics === 'function') {
      const saved = await bridge.getSavedLyrics({ title, artist, album: lookupTrack.album || '' });
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

  // Persist successful lyrics locally without expiry. The cache key includes
  // the album and artist so same-title recordings are not casually mixed together.
  if (!cacheBypass) {
    const cached = await readAutomaticLyricsCache(lookupTrack);
    if (cached) return cached;
  }

  const sourceDefinitions = [
    // Multi-provider resolver: Apple Music, QQ, KuGou, NetEase, YouTube Music,
    // Unison and LRCLIB are queried behind one normalized endpoint.
    { id: 'liriqo', name: 'LiriQo · Apple Music / QQ / KuGou / NetEase / YouTube Music', timeoutMs: 22000, run: sourceSignal => findLiriqoLyrics(lookupTrack, sourceSignal) },
    { id: 'lrclib', name: 'LRCLIB', timeoutMs: 26000, run: sourceSignal => findLrclibLyrics(lookupTrack, sourceSignal) },
    ...(knownArtist(artist) ? [{ id: 'musixmatch', name: 'Musixmatch', timeoutMs: 30000, run: sourceSignal => findMusixmatchLyrics(lookupTrack, sourceSignal) }] : []),
    { id: 'lrcmux', name: 'LRC Mux', timeoutMs: 18000, run: sourceSignal => findLrcmuxLyrics(lookupTrack, sourceSignal) },
    { id: 'unison', name: 'Unison · Better Lyrics', timeoutMs: 24000, run: sourceSignal => findUnisonLyrics(lookupTrack, sourceSignal) },
    { id: 'betterlyrics', name: 'Better Lyrics · TTML', timeoutMs: 16000, run: sourceSignal => findBetterLyrics(lookupTrack, 'ttml', sourceSignal) },
    { id: 'betterlyrics', name: 'Better Lyrics · QQ Music', timeoutMs: 16000, run: sourceSignal => findBetterLyrics(lookupTrack, 'qq', sourceSignal) },
    { id: 'betterlyrics', name: 'Better Lyrics · KuGou', timeoutMs: 16000, run: sourceSignal => findBetterLyrics(lookupTrack, 'kugou', sourceSignal) },
    { id: 'binilyrics', name: 'BiniLyrics', timeoutMs: 16000, run: sourceSignal => findBiniLyrics(lookupTrack, sourceSignal) },
    { id: 'youlyplus', name: 'YouLyPlus · 6 резервных серверов', timeoutMs: 14000, run: sourceSignal => findYouLyPlus(lookupTrack, sourceSignal) },
    { id: 'letrasmus', name: 'LetrasMus · каталог PT-BR', timeoutMs: 24000, run: sourceSignal => findLetrasMusLyrics(lookupTrack, sourceSignal) },
  ];

  // Do not exclude a provider globally after one failure. A timeout may be a
  // temporary network hiccup, and the next track/retry must be allowed to try it.
  const sources = sourceDefinitions;
  const checkedSources = sources.map(source => source.name);
  if (signal?.aborted) throw abortError();

  const startedAt = Date.now();
  const failures = [];
  const found = [];
  let successfulContact = 0;
  let pending = sources.length;
  let resolveDecision;
  const decision = new Promise(resolve => { resolveDecision = resolve; });
  const aggregateController = new AbortController();
  let qualityWindowTimer = null;
  const hardDeadlineTimer = setTimeout(() => resolveDecision('deadline'), 20000);
  const finishAfterCandidateWindow = () => {
    if (qualityWindowTimer) return;
    // Give fast providers a brief chance to return a better word/syllable sync.
    qualityWindowTimer = setTimeout(() => resolveDecision('candidate-window'), 1400);
  };
  const abortAggregate = () => {
    aggregateController.abort();
    resolveDecision('aborted');
  };
  signal?.addEventListener('abort', abortAggregate, { once: true });
  if (signal?.aborted) abortAggregate();

  sources.forEach(async source => {
    try {
      const lyrics = await runProviderWithTimeout(source, aggregateController.signal, source.timeoutMs);
      if (lyrics?.lines?.length && isUsableLyricsCandidate(lookupTrack, lyrics)) {
        found.push({ source, lyrics });
        finishAfterCandidateWindow();
      }
    } catch (error) {
      if (error?.name !== 'AbortError' && !aggregateController.signal.aborted) failures.push(source.name);
    } finally {
      const health = providerHealth.get(source.id);
      if (health?.available && health.checkedAt >= startedAt) successfulContact++;
      pending--;
      if (pending <= 0) resolveDecision('complete');
    }
  });

  await decision;
  clearTimeout(hardDeadlineTimer);
  if (qualityWindowTimer) clearTimeout(qualityWindowTimer);
  if (signal?.aborted) {
    aggregateController.abort();
    signal?.removeEventListener('abort', abortAggregate);
    throw abortError();
  }
  // Stop slow/failed mirrors as soon as we have enough information to respond.
  if (pending > 0) aggregateController.abort();
  signal?.removeEventListener('abort', abortAggregate);

  if (found.length) {
    found.sort((a, b) => lyricMatchScore(lookupTrack, b.lyrics) - lyricMatchScore(lookupTrack, a.lyrics));
    const best = { ...found[0].lyrics, checkedSources };
    await writeAutomaticLyricsCache(lookupTrack, best);
    return best;
  }

  // Last resort: Lyrics.ovh only provides plain lyrics, not timing. Do not
  // fabricate timestamps; show the text statically and cache it for offline use.
  try {
    const plain = await runProviderWithTimeout(
      { id: 'lyrics-ovh', name: 'Lyrics.ovh', run: sourceSignal => findLyricsOvhPlain(lookupTrack, sourceSignal) },
      signal,
      10000,
    );
    if (plain?.lines?.length && isUsableLyricsCandidate(lookupTrack, plain)) {
      const result = { ...plain, checkedSources: [...checkedSources, 'Lyrics.ovh · обычный текст'] };
      await writeAutomaticLyricsCache(lookupTrack, result);
      return result;
    }
  } catch (error) {
    if (error?.name === 'AbortError' && signal?.aborted) throw error;
  }

  const everyAttemptFailed = failures.length === sources.length;
  const everyAttemptUnavailable = successfulContact === 0 && failures.length > 0;
  if (everyAttemptFailed || everyAttemptUnavailable) {
    return {
      status: 'error',
      message: 'Все автоматические источники синхронизированного текста сейчас недоступны. Проверь интернет и попробуй ещё раз.',
      checkedSources,
    };
  }

  if (failures.length > 0 && successfulContact > 0) {
    return {
      status: 'error',
      message: 'Некоторые источники временно недоступны или вернули ошибку. В ответивших источниках синхронизированный текст не найден — попробуй повторить поиск позже.',
      checkedSources,
    };
  }

  return {
    status: 'missing',
    message: 'Подходящий синхронизированный текст не найден. Результаты с другой языковой версией, неподходящей записью или повреждённой разметкой были исключены.',
    checkedSources,
  };
}
