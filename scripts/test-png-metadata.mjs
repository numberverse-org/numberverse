#!/usr/bin/env node
/**
 * Self-contained test for #93 — the share-PNG metadata stripper
 * (`stripPngMetadata` in @numberverse/core, used by canvasToBlob).
 *
 * Run:  pnpm --filter @numberverse/core build && node scripts/test-png-metadata.mjs
 *
 * Builds a valid 1×1 PNG, injects tEXt chunks loaded with identifying data
 * (Software, Comment with a kid name + a filesystem path), then proves the
 * stripper removes them and the PNG still decodes (signature + IHDR + IDAT +
 * IEND intact). The cleaned output must be byte-identical to the original
 * clean PNG.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { stripPngMetadata } = require("../packages/core/dist/index.js");

let fails = 0;
const check = (name, cond, detail = "") => {
  console.log(`  ${cond ? "✓" : "✖"} ${name}${!cond && detail ? ` — ${detail}` : ""}`);
  if (!cond) fails++;
};

// ── helpers ────────────────────────────────────────────────────────────────
function crc32(bytes) {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of bytes) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const body = Buffer.concat([t, Buffer.from(data)]);
  const c = crc32(body);
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  return Buffer.concat([head, body, Buffer.from([c >>> 24, c >>> 16, c >>> 8, c])]);
}
function chunksOf(buf) {
  const out = [];
  let off = 8;
  while (off + 12 <= buf.length) {
    const len = buf.readUInt32BE(off);
    out.push({ type: buf.toString("ascii", off + 4, off + 8), off, len });
    off += 8 + len + 4;
  }
  return out;
}
function insertAfter(buf, anchorType, newChunk) {
  const parts = [];
  let off = 8, done = false;
  while (off + 12 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    parts.push(buf.subarray(off, off + 8 + len + 4));
    if (type === anchorType && !done) { parts.push(newChunk); done = true; }
    off += 8 + len + 4;
  }
  return Buffer.concat([buf.subarray(0, 8), ...parts]);
}

// ── fixture: a valid 1×1 transparent PNG ──────────────────────────────────
const CLEAN_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const clean = Buffer.from(CLEAN_B64, "base64");

console.log("① fixture sanity — clean 1×1 PNG is valid");
const cchunks = chunksOf(clean);
check("signature ok", clean[0] === 0x89 && clean[1] === 0x50);
check("IHDR + IDAT + IEND present", cchunks.some((c) => c.type === "IHDR") && cchunks.some((c) => c.type === "IDAT") && cchunks.some((c) => c.type === "IEND"));
check("clean PNG has no metadata chunks", !cchunks.some((c) => ["tEXt", "zTXt", "iTXt", "eXIf"].includes(c.type)));

console.log("② inject identifying metadata (kid name, photo path, software)");
const tEXt = Buffer.concat([
  chunk("tEXt", Buffer.from("Software\x00NumberverseGen/0.1")),
  chunk("tEXt", Buffer.from("Comment\x00kid name Akash · photo /home/munna/photo.jpg · 01712345678")),
]);
const dirty = insertAfter(clean, "IHDR", tEXt);
const dchunks = chunksOf(dirty);
check("dirty PNG now has 2 tEXt chunks", dchunks.filter((c) => c.type === "tEXt").length === 2);
check("dirty PNG still decodes (IHDR/IDAT/IEND)", dchunks.some((c) => c.type === "IDAT") && dchunks.some((c) => c.type === "IEND"));

console.log("③ stripPngMetadata removes all metadata");
const outBuf = stripPngMetadata(dirty);
const out = Buffer.from(outBuf);
const ochunks = chunksOf(out);
check("output starts with PNG signature", out[0] === 0x89 && out[1] === 0x50);
check("output has ZERO tEXt/zTXt/iTXt/eXIf chunks", !ochunks.some((c) => ["tEXt", "zTXt", "iTXt", "eXIf"].includes(c.type)));
check("output still has IHDR/PLTE?/IDAT/IEND", ochunks.some((c) => c.type === "IHDR") && ochunks.some((c) => c.type === "IDAT") && ochunks.some((c) => c.type === "IEND"));
const joined = out.toString("latin1");
check("no kid name in bytes", !joined.includes("Akash"));
check("no filesystem path in bytes", !joined.includes("photo.jpg") && !joined.includes("/home/"));
check("no phone in bytes", !joined.includes("01712345678"));
check("no generator software tag", !joined.includes("NumberverseGen"));
check("output equals the original clean PNG (byte-for-byte)", out.equals(clean));

console.log("④ non-PNG input is returned unchanged (never corrupts)");
const notPng = Buffer.from("not a png at all");
check("non-PNG passes through", Buffer.from(stripPngMetadata(notPng)).equals(notPng));

console.log();
if (fails) { console.error(`✖ ${fails} check(s) failed`); process.exit(1); }
console.log("✓ all PNG-metadata checks passed — share cards are metadata-free");
