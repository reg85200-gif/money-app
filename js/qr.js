// F17 QR 코드로 기기 간 옮기기
// 보내기: 전체 상태(백업 형식) → JSON → 압축(deflate) → base64 → 여러 조각 → QR
// 받기: 카메라 또는 사진에서 조각을 순서 상관없이 모음 → 체크섬 확인 → 압축 풀기 → 백업 형식 검사
// 인터넷·서버를 거치지 않는다 (라이브러리는 처음 한 번 받은 뒤 서비스 워커가 보관)

// 라이브러리 (정확한 버전 고정)
export const QR_GEN_URL = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
export const JSQR_URL = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';

// 조각 형식: MA1:<전송id>:<순번>/<총장수>:<압축 z|r>:<전체 CRC32>:<조각 CRC32>:<base64 조각>
const PREFIX = 'MA1';
// 조각 하나에 담는 base64 글자 수. 휴대폰 카메라로 화면을 찍기 쉬운 크기(QR 버전 15 안팎)
export const CHUNK_CHARS = 480;
// 장 수가 이보다 많으면 보내기 화면에 "백업 파일이 더 빨라요" 안내를 띄운다 (버그 6)
export const MANY_PARTS = 30;

const loading = {};
export function loadScript(url) {
  if (!loading[url]) {
    loading[url] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url;
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.onload = () => resolve();
      s.onerror = () => { delete loading[url]; reject(new Error('QR 도구를 불러오지 못했어요. 인터넷에 한 번 연결한 뒤 다시 열어 주세요.')); };
      document.head.appendChild(s);
    });
  }
  return loading[url];
}

// ───── CRC32 ─────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();
export function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return ((c ^ 0xFFFFFFFF) >>> 0).toString(16).padStart(8, '0');
}
const enc = new TextEncoder();
const dec = new TextDecoder();

// ───── 압축 ─────
async function streamBytes(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}
export const canCompress = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromB64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// 백업 객체 → 조각 문자열 목록
export async function encodeTransfer(backup) {
  const raw = enc.encode(JSON.stringify(backup));
  const z = canCompress ? 'z' : 'r';
  const body = canCompress ? await streamBytes(raw, new CompressionStream('deflate')) : raw;
  const crcAll = crc32(body);
  const b64 = toB64(body);
  const total = Math.max(1, Math.ceil(b64.length / CHUNK_CHARS));
  const id = Math.random().toString(36).slice(2, 8);
  const parts = [];
  for (let i = 0; i < total; i++) {
    const piece = b64.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS);
    parts.push(`${PREFIX}:${id}:${i + 1}/${total}:${z}:${crcAll}:${crc32(enc.encode(piece))}:${piece}`);
  }
  return { id, parts, 원본바이트: raw.length, 압축바이트: body.length, 압축: z === 'z' };
}

// 조각 문자열 하나 해석. 이 앱의 조각이 아니거나 조각 체크섬이 틀리면 null
export function parsePart(text) {
  const m = /^MA1:([a-z0-9]+):(\d+)\/(\d+):([zr]):([0-9a-f]{8}):([0-9a-f]{8}):([A-Za-z0-9+/=]*)$/.exec(String(text || '').trim());
  if (!m) return null;
  const [, id, i, n, z, crcAll, crcPart, data] = m;
  if (crc32(enc.encode(data)) !== crcPart) return null;
  const idx = Number(i);
  const total = Number(n);
  if (!(idx >= 1 && idx <= total)) return null;
  return { id, idx, total, z, crcAll, data };
}

// 조각 모으기 (순서 상관없음).
// 모으는 중에 다른 전송의 조각이 오면 하던 것을 버리지 않고 { other: true }로 알린다 (버그 2).
// 사용자가 고르면 switchTo(text)로 새 전송부터 다시 모은다
export class Collector {
  constructor() { this.reset(); }
  reset() { this.id = null; this.total = 0; this.z = 'z'; this.crcAll = ''; this.parts = new Map(); }
  add(text) {
    const p = parsePart(text);
    if (!p) return { ok: false, reason: '이 앱의 QR이 아니거나 잘못 읽혔어요.' };
    if (this.id && (p.id !== this.id || p.crcAll !== this.crcAll)) {
      return { ok: false, other: true, otherId: p.id, otherTotal: p.total, reason: '다른 전송의 QR이에요.' };
    }
    if (!this.id) { this.id = p.id; this.total = p.total; this.z = p.z; this.crcAll = p.crcAll; }
    const isNew = !this.parts.has(p.idx);
    this.parts.set(p.idx, p.data);
    return { ok: true, isNew, idx: p.idx };
  }
  // 하던 전송을 버리고 이 조각의 전송부터 새로 모은다
  switchTo(text) { this.reset(); return this.add(text); }
  get count() { return this.parts.size; }
  get done() { return this.total > 0 && this.parts.size === this.total; }
  missing() { const m = []; for (let i = 1; i <= this.total; i++) if (!this.parts.has(i)) m.push(i); return m; }
  // 다 모이면 합치고 체크섬 확인 → 압축 풀기 → JSON
  async finish() {
    if (!this.done) throw new Error('아직 모든 조각을 받지 못했어요.');
    let b64 = '';
    for (let i = 1; i <= this.total; i++) b64 += this.parts.get(i);
    // 브라우저가 내는 영어 오류(atob·압축 풀기·JSON) 대신 한국어 문구를 보여 준다 (버그 5)
    const broken = '받은 데이터를 읽지 못했어요. 처음부터 다시 받아 주세요.';
    let body;
    try { body = fromB64(b64); } catch (e) { throw new Error(broken); }
    if (crc32(body) !== this.crcAll) throw new Error('합친 데이터의 체크섬이 맞지 않아요. 처음부터 다시 받아 주세요.');
    let raw = body;
    if (this.z === 'z') {
      if (!canCompress) throw new Error('이 브라우저는 압축 풀기를 지원하지 않아요. 백업 파일로 옮겨 주세요.');
      try { raw = await streamBytes(body, new DecompressionStream('deflate')); } catch (e) { throw new Error(broken); }
    }
    try { return JSON.parse(dec.decode(raw)); } catch (e) { throw new Error(broken); }
  }
}

// QR 이미지 만들기 (qrcode-generator)
export function qrDataUrl(text) {
  const qr = window.qrcode(0, 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const count = qr.getModuleCount();
  const cell = Math.max(2, Math.floor(480 / (count + 8)));
  return { url: qr.createDataURL(cell, cell * 4), modules: count };
}

// ───── 읽기 ─────
let detector = null;
async function getDetector() {
  if (detector !== null) return detector;
  detector = false;
  try {
    if ('BarcodeDetector' in window) {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      if (formats.includes('qr_code')) detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    }
  } catch (e) { detector = false; }
  return detector;
}
export async function readerName() { return (await getDetector()) ? 'BarcodeDetector' : 'jsQR'; }

// 이미지·영상 한 장에서 QR 글자 읽기. 없으면 null
const work = document.createElement('canvas');
export async function decodeFrom(source, w, h) {
  const det = await getDetector();
  if (det) {
    try {
      const found = await det.detect(source);
      if (found && found.length) return found[0].rawValue;
      return null;
    } catch (e) { /* jsQR로 다시 시도 */ }
  }
  await loadScript(JSQR_URL);
  // 큰 사진은 줄여서 읽는다 (속도)
  const scale = Math.min(1, 1000 / Math.max(w, h));
  work.width = Math.round(w * scale);
  work.height = Math.round(h * scale);
  const g = work.getContext('2d', { willReadFrequently: true });
  g.drawImage(source, 0, 0, work.width, work.height);
  const img = g.getImageData(0, 0, work.width, work.height);
  const r = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
  return r ? r.data : null;
}

export async function decodeFile(file) {
  const bmp = await createImageBitmap(file);
  try { return await decodeFrom(bmp, bmp.width, bmp.height); } finally { if (bmp.close) bmp.close(); }
}
