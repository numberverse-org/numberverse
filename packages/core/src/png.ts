/**
 * Kid-safe share PNGs (#93) — a byte-level metadata stripper.
 *
 * Canvas `toBlob()` PNGs carry no camera EXIF, but the PNG format can hold
 * tEXt/zTXt/iTXt/eXIf chunks (Software, Comment, Source, real EXIF) that a
 * future renderer or library could fill with identifying data. This function
 * rebuilds the PNG keeping ONLY the pixel-critical chunks (IHDR/PLTE/tRNS/
 * IDAT/IEND), so a share card can never leak metadata into WhatsApp.
 *
 * Pure, deterministic, dependency-free — runs in the browser and in Node, so
 * scripts/test-png-metadata.mjs can prove zero identifying metadata.
 */

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const KEEP = new Set(["IHDR", "PLTE", "tRNS", "IDAT", "IEND"]);

/** Rebuild a PNG containing only its pixel-critical chunks. Returns an
 *  identical copy of the input if it isn't a valid PNG signature. */
export function stripPngMetadata(buf: ArrayBuffer | Uint8Array): ArrayBuffer {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (bytes.length < 8 || !PNG_SIG.every((b, i) => bytes[i] === b)) {
    return new Uint8Array(bytes).buffer;
  }
  const out: number[] = [...PNG_SIG];
  let off = 8;
  while (off + 12 <= bytes.length) {
    const len =
      ((bytes[off] << 24) | (bytes[off + 1] << 16) | (bytes[off + 2] << 8) | bytes[off + 3]) >>> 0;
    const type = String.fromCharCode(bytes[off + 4], bytes[off + 5], bytes[off + 6], bytes[off + 7]);
    const chunkEnd = off + 8 + len + 4;
    if (chunkEnd > bytes.length) {
      // Truncated file — a cut-off chunk means we can't safely rebuild. Return
      // the ORIGINAL input unchanged (better a PNG with metadata than a broken
      // image with none): stripping is only safe on an intact chunk stream.
      return new Uint8Array(bytes).buffer;
    }
    if (KEEP.has(type)) {
      for (let i = off; i < chunkEnd; i++) out.push(bytes[i]);
    }
    off = chunkEnd;
  }
  return new Uint8Array(out).buffer;
}
