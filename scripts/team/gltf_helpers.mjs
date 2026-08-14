/**
 * 🦉 Shared utilities for the Numberverse glTF pipeline (3D Nova epic, #685/#686).
 *
 * three's GLTFExporter expects a browser environment (FileReader, canvas,
 * ImageData). These helpers make it deterministic under Node so the whole owl
 * rig — skeleton, morph targets, PBR textures, animation clips — is generated
 * from code with zero external tooling:
 *
 *   • polyfillBrowserGlobals()  — FileReader + ImageData + a dependency-free
 *     <canvas> whose toDataURL() writes a real PNG (node:zlib deflate).
 *   • encodePNG()               — minimal PNG encoder (RGBA8, filter 0 rows).
 *   • makeTexture()             — build a THREE.DataTexture from a pixel fn.
 *   • fbm() / valueNoise()      — deterministic procedural noise for textures.
 */
import * as THREE from "../../apps/kid/node_modules/three/build/three.module.js";
import { deflateSync } from "node:zlib";

// ───────────────────────── PNG (RFC 2083, minimal RGBA8) ─────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** Encode RGBA (Uint8Array, w*h*4) → PNG Buffer. Deterministic. */
export function encodePNG(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // compression 0, filter 0, interlace 0 (already zeroed)
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: None
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ───────────────────────── browser shims for GLTFExporter ─────────────────────────

let _polyfilled = false;

/** Install the minimal browser globals GLTFExporter needs under Node. Idempotent. */
export function polyfillBrowserGlobals() {
  if (_polyfilled) return;
  _polyfilled = true;

  if (!globalThis.FileReader) {
    globalThis.FileReader = class FileReader {
      onload = null;
      onloadend = null;
      result = null;
      readAsDataURL(blob) {
        blob.arrayBuffer().then((ab) => {
          this.result = `data:application/octet-stream;base64,${Buffer.from(ab).toString("base64")}`;
          if (this.onload) this.onload();
          if (this.onloadend) this.onloadend();
        });
      }
      readAsArrayBuffer(blob) {
        blob.arrayBuffer().then((ab) => {
          this.result = ab;
          if (this.onloadend) this.onloadend();
        });
      }
    };
  }

  if (!globalThis.ImageData) {
    globalThis.ImageData = class ImageData {
      constructor(data, width, height) {
        this.data = data;
        this.width = width;
        this.height = height;
      }
    };
  }

  // GLTFExporter draws DataTexture pixels into a <canvas> then reads a PNG back
  // out. Implement exactly the two methods it calls: putImageData + toDataURL.
  if (!globalThis.document) {
    class FakeCanvas {
      constructor() {
        this.width = 0;
        this.height = 0;
        this._flipY = false;
        this._data = null;
        this._w = 0;
        this._h = 0;
      }
      getContext() {
        const self = this;
        return {
          translate: (_x, y) => {
            // translate(0, h) then scale(1,-1) → the exporter flips rows
            if (y !== 0 && !self._flipY) self._flipY = true;
          },
          scale: (_x, y) => {
            if (y < 0) self._flipY = true;
          },
          putImageData: (img, _x, _y) => {
            const { data, width, height } = img;
            self._w = width;
            self._h = height;
            self._data = new Uint8Array(width * height * 4);
            if (self._flipY) {
              for (let r = 0; r < height; r++) {
                const src = r * width * 4;
                const dst = (height - 1 - r) * width * 4;
                self._data.set(data.subarray(src, src + width * 4), dst);
              }
            } else {
              self._data.set(data);
            }
          },
          // GLTFExporter bakes the no-tangent normal-map green flip via
          // drawImage → getImageData → mutate → putImageData.
          drawImage: (img, _dx, _dy, dw, dh) => {
            if (img instanceof FakeCanvas && img._data) {
              self._w = img._w;
              self._h = img._h;
              self._data = new Uint8Array(img._data);
            } else if (img && img.data) {
              // THREE.DataTexture.image = { data, width, height }
              self._w = dw || img.width;
              self._h = dh || img.height;
              self._data = new Uint8Array(img.data.buffer, img.data.byteOffset, self._w * self._h * 4);
              self._data = new Uint8Array(self._data);
            }
          },
          getImageData: (_x, _y, w, h) => {
            const out = new Uint8Array(w * h * 4);
            if (self._data) out.set(self._data.subarray(0, w * h * 4));
            return { data: out, width: w, height: h };
          },
        };
      }
      toDataURL(_mimeType = "image/png") {
        if (!this._data || this._w === 0) return "data:image/png;base64,";
        return `data:image/png;base64,${encodePNG(this._w, this._h, this._data).toString("base64")}`;
      }
      toBlob(cb, mimeType = "image/png") {
        const b64 = this.toDataURL(mimeType).split(",")[1];
        cb(new Blob([Uint8Array.from(Buffer.from(b64, "base64"))], { type: mimeType }));
      }
    }
    // GLTFExporter does `image instanceof HTMLCanvasElement` after cloning a
    // normal map into a canvas source — make FakeCanvas match that check.
    globalThis.HTMLCanvasElement = FakeCanvas;
    globalThis.HTMLImageElement = class HTMLImageElement {};
    globalThis.document = { createElement: (tag) => (tag === "canvas" ? new FakeCanvas() : {}) };
  }
}

// ───────────────────────── deterministic procedural noise ─────────────────────────

function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (((h ^ (h >>> 16)) >>> 0) / 4294967296) >>> 0;
}

const smooth = (t) => t * t * (3 - 2 * t);

/** Bilinear value noise (continuous, deterministic, in [0,1]). */
export function valueNoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  const u = smooth(xf);
  const v = smooth(yf);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

/** Fractal Brownian motion — several octaves of value noise, roughly [0,1]. */
export function fbm(x, y, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq);
    total += amp;
    amp *= 0.5;
    freq *= 2.02;
  }
  return sum / total;
}

// ───────────────────────── THREE.DataTexture helper ─────────────────────────

/**
 * Build a THREE.DataTexture (RGBA8) from a pixel function.
 * @param {number} w
 * @param {number} h
 * @param {(u:number, v:number)=>[number,number,number,number]} pixelFn u,v ∈ [0,1]
 * @param {"srgb"|"linear"} colorSpace
 */
export function makeTexture(w, h, pixelFn, colorSpace = "srgb") {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a = 255] = pixelFn((x + 0.5) / w, (y + 0.5) / h);
      const o = (y * w + x) * 4;
      px[o] = Math.max(0, Math.min(255, Math.round(r)));
      px[o + 1] = Math.max(0, Math.min(255, Math.round(g)));
      px[o + 2] = Math.max(0, Math.min(255, Math.round(b)));
      px[o + 3] = Math.max(0, Math.min(255, Math.round(a)));
    }
  }
  const tex = new THREE.DataTexture(px, w, h, THREE.RGBAFormat);
  tex.colorSpace = colorSpace === "srgb" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Build a normal map from a height function via central differences.
 * Returns a DataTexture whose RGB = (nx,ny,nz) in [0,1], with the +Z bump axis.
 * @param {(u:number, v:number)=>number} heightFn
 * @param {number} strength  bump height multiplier (0..~5)
 */
export function makeNormalMap(w, h, heightFn, strength = 3) {
  const px = new Uint8Array(w * h * 4);
  const eps = 1 / Math.max(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const v = (y + 0.5) / h;
      const hR = heightFn(Math.min(1, u + eps), v);
      const hL = heightFn(Math.max(0, u - eps), v);
      const hU = heightFn(u, Math.max(0, v - eps));
      const hD = heightFn(u, Math.min(1, v + eps));
      const nx = (hL - hR) * strength;
      const ny = (hU - hD) * strength;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const o = (y * w + x) * 4;
      px[o] = Math.round((nx * 0.5 + 0.5) * 255);
      px[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      px[o + 2] = Math.round(nz * 255);
      px[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(px, w, h, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

/** ORM texture: R=occlusion, G=roughness, B=metalness. `aofn`, `roughfn` ∈ [0,1]. */
export function makeORM(w, h, aoFn, roughFn, metal = 0) {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const v = (y + 0.5) / h;
      const o = (y * w + x) * 4;
      px[o] = Math.round(aoFn(u, v) * 255);
      px[o + 1] = Math.round(roughFn(u, v) * 255);
      px[o + 2] = Math.round(metal * 255);
      px[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(px, w, h, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}
