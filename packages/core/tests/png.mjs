#!/usr/bin/env node
/**
 * 🧠 PNG metadata stripper — regression for the #6 truncated-PNG path.
 * Self-contained: runs against the BUILT core (packages/core/dist) with zero
 * deps. Covers:
 *   - a hand-built minimal PNG (sig + IHDR + IDAT + IEND) is stripped and the
 *     pixel-critical chunk types are all KEPT;
 *   - a tEXt chunk ("Software\0Stripper") inserted after IHDR is DROPPED;
 *   - a TRUNCATED PNG whose buffer ends inside IDAT's payload is returned
 *     UNCHANGED byte-for-byte (stripping is only safe on an intact stream);
 *   - non-PNG input is an identity.
 *
 * Run:  node packages/core/tests/png.mjs
 */
import { stripPngMetadata } from "../dist/index.js";

let fails = 0;
const check = (name, got, want) => {
  const ok = Object.is(got, want) || JSON.stringify(got) === JSON.stringify(want);
  if (ok) console.log(`  ✓ ${name}`);
  else { fails++; console.log(`  ✖ ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); }
};

const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const ascii = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));

/* ── helpers ── */
function chunk(type, data) {
  const len = data.length;
  const bytes = new Uint8Array(12 + len);
  bytes[0] = (len >>> 24) & 0xff; // 4-byte big-endian length
  bytes[1] = (len >>> 16) & 0xff;
  bytes[2] = (len >>> 8) & 0xff;
  bytes[3] = len & 0xff;
  for (let i = 0; i < 4; i++) bytes[4 + i] = type.charCodeAt(i);
  bytes.set(data, 8);
  // CRC bytes stay 0 — stripPngMetadata never validates CRCs.
  return bytes;
}

function buildPng(extraChunks = []) {
  const bytes = [];
  // 1x1 RGBA IHDR (13-byte data: width, height, bit-depth, color-type, ...)
  const ihdrData = new Uint8Array(13);
  ihdrData[3] = 1;  // width  = 1
  ihdrData[7] = 1;  // height = 1
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // color type = RGBA
  bytes.push(...SIG, ...chunk("IHDR", ihdrData));
  for (const c of extraChunks) bytes.push(...c); // insert metadata after IHDR
  const idatData = new Uint8Array([0x78, 0x9c, 0x01, 0x00, 0x00, 0xff]);
  bytes.push(...chunk("IDAT", idatData), ...chunk("IEND", new Uint8Array(0)));
  return new Uint8Array(bytes);
}

const bytesEqual = (a, b) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

const hasBytes = (hay, needle) => {
  for (let i = 0; i + needle.length <= hay.length; i++) {
    let found = true;
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) { found = false; break; }
    if (found) return true;
  }
  return false;
};

/* ── 1. valid PNG: strip keeps IHDR/IDAT/IEND ── */
const valid = buildPng();
const strippedValid = new Uint8Array(stripPngMetadata(valid));
check("valid PNG strip returns pixel-critical chunks byte-for-byte", bytesEqual(strippedValid, valid), true);
check("strip keeps IHDR chunk", hasBytes(strippedValid, ascii("IHDR")), true);
check("strip keeps IDAT chunk", hasBytes(strippedValid, ascii("IDAT")), true);
check("strip keeps IEND chunk", hasBytes(strippedValid, ascii("IEND")), true);

/* ── 2. tEXt chunk is dropped ── */
const textChunk = chunk("tEXt", ascii("Software\x00Stripper"));
const withText = buildPng([textChunk]);
check("tEXt PNG input actually contains Software (sanity)", hasBytes(withText, ascii("Software")), true);
const strippedText = new Uint8Array(stripPngMetadata(withText));
check("strip drops tEXt — output has no Software bytes", hasBytes(strippedText, ascii("Software")), false);
check("tEXt-stripped output equals the clean valid PNG", bytesEqual(strippedText, valid), true);

/* ── 3. TRUNCATED PNG (buffer ends inside IDAT payload) → input unchanged ── */
// Cut off IEND (12 bytes) + IDAT's CRC (4 bytes) + 1 of IDAT's payload bytes.
// That still leaves IDAT's 12-byte header (length+type) + 5 payload bytes, so
// the strip loop reads the chunk, sees its declared length extend past the
// buffer end, and returns the ORIGINAL input unchanged.
const truncated = valid.subarray(0, valid.length - (12 + 4 + 1));
const strippedTrunc = new Uint8Array(stripPngMetadata(truncated));
check("truncated PNG (ends inside IDAT) returned unchanged", bytesEqual(strippedTrunc, truncated), true);

/* ── 4. non-PNG input → identity ── */
const nonPng = ascii("not a png");
const strippedNon = new Uint8Array(stripPngMetadata(nonPng));
check("non-PNG input returned unchanged (identity)", bytesEqual(strippedNon, nonPng), true);

console.log("─".repeat(30));
if (fails) { console.log(`✖ ${fails} failed`); process.exit(1); }
console.log("✓ all png metadata tests passed");
