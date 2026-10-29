import * as mm from 'music-metadata-browser';

const UNKNOWN_ARTIST = 'Неизвестный исполнитель';
const UNKNOWN_ALBUM = 'Без альбома';

function cleanText(value) {
  if (typeof value === 'string') return value.replace(/\u0000/g, ' ').replace(/\s+/g, ' ').trim();
  if (Array.isArray(value)) {
    const values = value.map(cleanText).filter(Boolean);
    return values.length ? values.join(', ') : '';
  }
  if (value && typeof value === 'object') {
    if (typeof value.text === 'string') return cleanText(value.text);
    if (typeof value.value === 'string') return cleanText(value.value);
  }
  return '';
}

function decodeTextFrame(bytes) {
  if (!bytes?.length) return '';
  const encoding = bytes[0];
  const data = bytes.subarray(1);
  try {
    if (encoding === 1) {
      // ID3 UTF-16: honour a BOM when present; otherwise the common LE form.
      if (data.length >= 2 && ((data[0] === 0xff && data[1] === 0xfe) || (data[0] === 0xfe && data[1] === 0xff))) {
        return cleanText(new TextDecoder('utf-16').decode(data));
      }
      return cleanText(new TextDecoder('utf-16le').decode(data));
    }
    if (encoding === 2) return cleanText(new TextDecoder('utf-16be').decode(data));
    if (encoding === 3) return cleanText(new TextDecoder('utf-8').decode(data));
    return cleanText(new TextDecoder('windows-1252').decode(data));
  } catch {
    return cleanText(new TextDecoder().decode(data));
  }
}

function readSynchsafeInt(bytes, offset = 0) {
  return ((bytes[offset] & 0x7f) << 21) |
    ((bytes[offset + 1] & 0x7f) << 14) |
    ((bytes[offset + 2] & 0x7f) << 7) |
    (bytes[offset + 3] & 0x7f);
}

function readBigEndianInt(bytes, offset, length) {
  let value = 0;
  for (let i = 0; i < length; i++) value = value * 256 + bytes[offset + i];
  return value;
}

function parseId3v2(bytes) {
  const tags = {};
  if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return tags;

  const version = bytes[3];
  if (version < 2 || version > 4) return tags;
  const tagSize = readSynchsafeInt(bytes, 6);
  const tagEnd = Math.min(bytes.length, 10 + tagSize);
  const hasExtendedHeader = (bytes[5] & 0x40) !== 0;
  let offset = 10;

  if (hasExtendedHeader && offset + 4 <= tagEnd) {
    const extendedSize = version === 4
      ? readSynchsafeInt(bytes, offset)
      : readBigEndianInt(bytes, offset, 4);
    // v2.3 size excludes the 4-byte size field; v2.4 includes it.
    offset += version === 4 ? extendedSize : 4 + extendedSize;
  }

  const frameHeaderSize = version === 2 ? 6 : 10;
  while (offset + frameHeaderSize <= tagEnd) {
    const idLength = version === 2 ? 3 : 4;
    let frameId = '';
    for (let i = 0; i < idLength; i++) frameId += String.fromCharCode(bytes[offset + i]);
    if (!/^[A-Z0-9]{3,4}$/.test(frameId)) break;

    const frameSize = version === 2
      ? readBigEndianInt(bytes, offset + 3, 3)
      : (version === 4 ? readSynchsafeInt(bytes, offset + 4) : readBigEndianInt(bytes, offset + 4, 4));
    if (!frameSize || offset + frameHeaderSize + frameSize > tagEnd) break;

    const frameFlagsOffset = version === 2 ? offset + 5 : offset + 8;
    const frameFlags = version === 2 ? 0 : (bytes[frameFlagsOffset] << 8) | bytes[frameFlagsOffset + 1];
    // Skip encrypted/compressed frames rather than trying to decode their payload.
    const encrypted = version === 3 ? (frameFlags & 0x0040) !== 0 : (frameFlags & 0x0004) !== 0;
    const compressed = version === 3 ? (frameFlags & 0x0080) !== 0 : (frameFlags & 0x0008) !== 0;
    const payloadStart = offset + frameHeaderSize;
    const payload = bytes.subarray(payloadStart, payloadStart + frameSize);

    const fieldMap = {
      TIT2: 'title', TT2: 'title',
      TPE1: 'artist', TP1: 'artist',
      TPE2: 'albumArtist', TP2: 'albumArtist',
      TALB: 'album', TAL: 'album'
    };
    const field = fieldMap[frameId];
    if (field && !encrypted && !compressed && !tags[field]) {
      tags[field] = decodeTextFrame(payload);
    }
    offset = payloadStart + frameSize;
  }
  return tags;
}

function parseId3v1(bytes) {
  const tags = {};
  if (bytes.length < 128) return tags;
  const start = bytes.length - 128;
  if (bytes[start] !== 0x54 || bytes[start + 1] !== 0x41 || bytes[start + 2] !== 0x47) return tags;

  const decode = (from, length) => {
    const field = bytes.subarray(start + from, start + from + length);
    // ID3v1 has no encoding marker. Windows-1251 preserves older Russian tags;
    // for plain Latin text it produces the same readable ASCII characters.
    return cleanText(new TextDecoder('windows-1251').decode(field));
  };
  tags.title = decode(3, 30);
  tags.artist = decode(33, 30);
  tags.album = decode(63, 30);
  return tags;
}

async function readMp3Id3(file) {
  const result = {};
  if (!file || !Number.isFinite(file.size)) return result;

  try {
    // ID3v2 tags normally begin at byte zero. Limit read size to avoid loading a
    // whole large song just to inspect its metadata.
    const head = new Uint8Array(await file.slice(0, Math.min(file.size, 16 * 1024 * 1024)).arrayBuffer());
    Object.assign(result, parseId3v2(head));
  } catch (error) {
    console.debug('MusPlay: ID3v2 не прочитан', error);
  }

  try {
    if (file.size >= 128) {
      const tail = new Uint8Array(await file.slice(file.size - 128).arrayBuffer());
      const v1 = parseId3v1(tail);
      for (const key of ['title', 'artist', 'album']) if (!result[key] && v1[key]) result[key] = v1[key];
    }
  } catch (error) {
    console.debug('MusPlay: ID3v1 не прочитан', error);
  }
  return result;
}

function getNativeText(metadata, ids) {
  const native = metadata?.native || {};
  for (const group of Object.values(native)) {
    if (!Array.isArray(group)) continue;
    for (const tag of group) {
      const id = String(tag?.id || tag?.key || '').toUpperCase();
      if (ids.includes(id)) {
        const value = cleanText(tag.value);
        if (value) return value;
      }
    }
  }
  return '';
}

function metadataText(metadata) {
  const common = metadata?.common || {};
  return {
    title: cleanText(common.title) || cleanText(common.trackName) || getNativeText(metadata, ['TIT2', 'TT2', '©NAM', 'TITLE']),
    artist: cleanText(common.artist) || cleanText(common.artists) || cleanText(common.performer) ||
      getNativeText(metadata, ['TPE1', 'TP1', '©ART', 'ARTIST', 'ARTISTS']),
    albumArtist: cleanText(common.albumartist) || cleanText(common.albumArtist) ||
      getNativeText(metadata, ['TPE2', 'TP2', 'AART', 'ALBUMARTIST']),
    album: cleanText(common.album) || cleanText(common.albumTitle) || getNativeText(metadata, ['TALB', 'TAL', '©ALB', 'ALBUM']),
    duration: Number.isFinite(metadata?.format?.duration) ? metadata.format.duration : 0,
    picture: Array.isArray(common.picture) ? common.picture[0] : null
  };
}

export async function readAudioMetadata(file, fileName = file?.name || '') {
  let parsed = null;
  const errors = [];

  // music-metadata-browser's supported browser API is parseBlob(File/Blob).
  // Prefer it rather than calling parseBuffer, which is not part of every build
  // of the deprecated browser wrapper.
  try {
    if (typeof mm.parseBlob === 'function') {
      parsed = await mm.parseBlob(file, { duration: true });
    } else {
      errors.push('parseBlob отсутствует в загруженной версии music-metadata-browser');
    }
  } catch (error) {
    errors.push(`parseBlob: ${error?.message || error}`);
  }

  const fromLibrary = metadataText(parsed);
  let fromId3 = {};
  const extensionMatch = String(fileName || '').match(/\.([^.\\/]+)$/);
  const extension = extensionMatch ? extensionMatch[1].toLowerCase() : '';
  if (extension === 'mp3' || String(file?.type || '').toLowerCase() === 'audio/mpeg') {
    fromId3 = await readMp3Id3(file);
  }

  const result = {
    title: fromLibrary.title || fromId3.title || '',
    artist: fromLibrary.artist || fromLibrary.albumArtist || fromId3.artist || fromId3.albumArtist || '',
    album: fromLibrary.album || fromId3.album || '',
    duration: fromLibrary.duration || 0,
    cover: null
  };

  const picture = fromLibrary.picture;
  if (picture?.data?.length) {
    try {
      const bytes = new Uint8Array(picture.data);
      let binary = '';
      const chunkSize = 0x8000;
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
      }
      result.cover = `data:${picture.format || 'image/jpeg'};base64,${btoa(binary)}`;
    } catch (error) {
      console.debug('MusPlay: не удалось преобразовать встроенную обложку', error);
    }
  }

  if (!result.title && !result.artist && errors.length) {
    console.warn(`MusPlay: не удалось прочитать метаданные «${fileName || 'аудиофайл'}»`, errors);
  }
  return result;
}

export function fallbackTitleFromFileName(fileName = '') {
  return String(fileName).split(/[\\/]/).pop().replace(/\.[^/.]+$/, '').trim();
}

export const DEFAULT_ARTIST = UNKNOWN_ARTIST;
export const DEFAULT_ALBUM = UNKNOWN_ALBUM;
