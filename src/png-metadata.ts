/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PNGMetadata } from './types';

// Precomputed CRC32 table for PNG chunk checksums
const crcTable: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    table[n] = c;
  }
  return table;
})();

function calculateCRC(buf: Uint8Array, offset: number, length: number): number {
  let c = 0xffffffff;
  for (let i = 0; i < length; i++) {
    c = crcTable[(c ^ buf[offset + i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export function slugify(text: string): string {
  return (
    text
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'flowchart'
  );
}

/**
 * Creates an uncompressed iTXt (International text) chunk containing UTF-8 data
 */
function createITXtChunk(keyword: string, text: string): Uint8Array {
  const encoder = new TextEncoder();
  const keywordBytes = encoder.encode(keyword);
  const textBytes = encoder.encode(text);

  // iTXt structure:
  // Keyword (null-terminated) + CompFlag (0) + CompMethod (0) + LangTag (null) + TransKeyword (null) + Text
  const dataLen = keywordBytes.length + 1 + 1 + 1 + 1 + 1 + textBytes.length;
  const chunkLen = 4 + 4 + dataLen + 4; // length + type + data + crc
  const chunk = new Uint8Array(chunkLen);
  const view = new DataView(chunk.buffer);

  // 1. Data length
  view.setUint32(0, dataLen, false);

  // 2. Chunk type 'iTXt'
  chunk[4] = 0x69; // 'i'
  chunk[5] = 0x54; // 'T'
  chunk[6] = 0x58; // 'X'
  chunk[7] = 0x74; // 't'

  let pos = 8;
  // Keyword
  chunk.set(keywordBytes, pos);
  pos += keywordBytes.length;
  chunk[pos++] = 0; // null separator

  chunk[pos++] = 0; // compression flag: 0 (uncompressed)
  chunk[pos++] = 0; // compression method: 0
  chunk[pos++] = 0; // empty language tag (null)
  chunk[pos++] = 0; // empty translated keyword (null)

  // UTF-8 Text
  chunk.set(textBytes, pos);
  pos += textBytes.length;

  // CRC calculated on type and data (dataLen + 4 bytes)
  const crc = calculateCRC(chunk, 4, dataLen + 4);
  view.setUint32(pos, crc, false);

  return chunk;
}

/**
 * Injects metadata chunks into a PNG ArrayBuffer right after the IHDR chunk
 */
export function injectMetadataIntoPNG(
  pngBuffer: ArrayBuffer,
  metadata: PNGMetadata
): Blob {
  const src = new Uint8Array(pngBuffer);

  // Check PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (
    src.length < 8 ||
    src[0] !== 0x89 ||
    src[1] !== 0x50 ||
    src[2] !== 0x4e ||
    src[3] !== 0x47
  ) {
    // If not PNG, return as is
    return new Blob([pngBuffer], { type: 'image/png' });
  }

  // Find position immediately after IHDR chunk
  // Signature = 8 bytes
  // IHDR length = 4 bytes, type = 4 bytes ('IHDR'), data = 13 bytes, crc = 4 bytes -> total 25 bytes
  const insertPos = 8 + 4 + 4 + 13 + 4; // 33

  // Create metadata chunks:
  // 1. Title
  const titleChunk = createITXtChunk('Title', metadata.title);
  // 2. History
  const historyChunk = createITXtChunk(
    'History',
    JSON.stringify(metadata.history)
  );
  // 3. Labels
  const labelsChunk = createITXtChunk('Labels', JSON.stringify(metadata.labels));
  // 4. HistoryIndex
  const indexChunk = createITXtChunk(
    'HistoryIndex',
    metadata.historyIndex.toString()
  );

  const chunksToAdd = [titleChunk, historyChunk, labelsChunk, indexChunk];
  const addedSize = chunksToAdd.reduce((acc, c) => acc + c.byteLength, 0);

  const result = new Uint8Array(src.length + addedSize);
  // Copy before insertion point (signature + IHDR)
  result.set(src.subarray(0, insertPos), 0);

  let currentOffset = insertPos;
  for (const chunk of chunksToAdd) {
    result.set(chunk, currentOffset);
    currentOffset += chunk.byteLength;
  }

  // Copy rest of PNG
  result.set(src.subarray(insertPos), currentOffset);

  return new Blob([result], { type: 'image/png' });
}

/**
 * Extracts embedded metadata from a PNG ArrayBuffer if present
 */
export function extractMetadataFromPNG(
  pngBuffer: ArrayBuffer
): PNGMetadata | null {
  const bytes = new Uint8Array(pngBuffer);
  const view = new DataView(pngBuffer);

  if (
    bytes.length < 8 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47
  ) {
    return null;
  }

  const decoder = new TextDecoder('utf-8');
  let offset = 8;
  const entries: Record<string, string> = {};

  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset, false);
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7]
    );

    if (type === 'iTXt') {
      const dataOffset = offset + 8;
      // Find keyword null separator
      let nullIndex = dataOffset;
      while (nullIndex < dataOffset + length && bytes[nullIndex] !== 0) {
        nullIndex++;
      }
      const keyword = decoder.decode(bytes.subarray(dataOffset, nullIndex));

      // After keyword: null(1) + flag(1) + method(1)
      let textStart = nullIndex + 3;
      // Skip language tag
      while (textStart < dataOffset + length && bytes[textStart] !== 0) {
        textStart++;
      }
      textStart++; // skip null
      // Skip translated keyword
      while (textStart < dataOffset + length && bytes[textStart] !== 0) {
        textStart++;
      }
      textStart++; // skip null

      if (textStart <= dataOffset + length) {
        const textVal = decoder.decode(
          bytes.subarray(textStart, dataOffset + length)
        );
        entries[keyword] = textVal;
      }
    } else if (type === 'tEXt') {
      const dataOffset = offset + 8;
      let nullIndex = dataOffset;
      while (nullIndex < dataOffset + length && bytes[nullIndex] !== 0) {
        nullIndex++;
      }
      const keyword = decoder.decode(bytes.subarray(dataOffset, nullIndex));
      const textVal = decoder.decode(
        bytes.subarray(nullIndex + 1, dataOffset + length)
      );
      entries[keyword] = textVal;
    }

    if (type === 'IEND') break;
    offset += 8 + length + 4; // length + type + data + crc
  }

  if (entries.Title || entries.History) {
    try {
      const history = entries.History ? JSON.parse(entries.History) : [];
      const labels = entries.Labels ? JSON.parse(entries.Labels) : {};
      const historyIndex = entries.HistoryIndex
        ? parseInt(entries.HistoryIndex, 10)
        : history.length - 1;
      return {
        title: entries.Title || 'New flow',
        history,
        labels,
        historyIndex: isNaN(historyIndex) ? 0 : historyIndex,
      };
    } catch {
      return null;
    }
  }

  return null;
}
