// 저장소: 모든 금융 데이터는 이 기기의 IndexedDB에만 저장한다 (서버 전송 없음)
const DB_NAME = '자산관리앱';
const STORE = '상태';
const KEY = '앱상태';

export const BACKUP_FORMAT = '자산관리앱 백업';
export const BACKUP_VERSION = 1;

// 계좌 종류 코드 (계획서 4장 ③)
export const ACCOUNT_TYPES = ['입출금', '적금', '청약', '비상금', '예비비', '투자'];
// 저축성으로 보는 계좌 종류 (저축률 계산에 사용)
export const SAVING_TYPES = ['적금', '청약', '비상금', '예비비', '투자'];

// 비어 있는 새 상태 (첫 실행 때)
export function emptyState() {
  return {
    프로필: { 온보딩완료: false },
    계좌: [],
    배분: null,
    이체체크: {},
    생활비: { 월예산: 0, 지출: [] },
    상여배분: null,
    기록: [],
    // F16 월별 실제 입금액: [{ 월: 'YYYY-MM', 실수령, 내역: [{ 항목, 금액 }], 메모 }]
    월급기록: [],
    // F16 덜 들어온 달에 줄일 항목 선택: { 'YYYY-MM': ['투자', '저축'] }
    월급조정: {},
    설정: { 테마: '자동' },
  };
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(mode, fn) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(req && req.result); };
    t.onerror = () => { db.close(); reject(t.error); };
  }));
}

// 저장된 상태를 읽는다. 없으면 빈 상태
export async function loadState() {
  const saved = await tx('readonly', s => s.get(KEY));
  return normalize(saved || emptyState());
}

export function saveState(state) {
  return tx('readwrite', s => s.put(JSON.parse(JSON.stringify(state)), KEY));
}

export function clearState() {
  return tx('readwrite', s => s.clear());
}

// 빠진 항목을 채워 형식을 맞춘다 (예전 백업·예시 데이터 대비)
export function normalize(state) {
  const base = emptyState();
  const out = { ...base, ...state };
  out.프로필 = { ...base.프로필, ...(state.프로필 || {}) };
  out.생활비 = { ...base.생활비, ...(state.생활비 || {}) };
  out.설정 = { ...base.설정, ...(state.설정 || {}) };
  out.계좌 = Array.isArray(state.계좌) ? state.계좌 : [];
  out.기록 = Array.isArray(state.기록) ? state.기록 : [];
  out.이체체크 = state.이체체크 || {};
  // 예전 백업(월급기록 없음)도 읽히도록 빈 값으로 채운다
  out.월급기록 = Array.isArray(state.월급기록) ? state.월급기록.filter(r => r && /^\d{4}-\d{2}$/.test(r.월)) : [];
  out.월급조정 = state.월급조정 && typeof state.월급조정 === 'object' ? state.월급조정 : {};
  return out;
}

// 백업 파일 내용 만들기
export function makeBackup(state) {
  return {
    형식: BACKUP_FORMAT,
    버전: BACKUP_VERSION,
    내보낸시각: new Date().toISOString(),
    상태: state,
  };
}

// 백업 파일 내용 검사 후 상태로 바꾸기. 형식이 다르면 오류
export function parseBackup(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('JSON 내용이 비어 있어요.');
  if (obj.형식 !== BACKUP_FORMAT || !obj.상태) throw new Error('이 앱에서 내보낸 백업 파일이 아니에요.');
  if (typeof obj.상태 !== 'object' || !Array.isArray(obj.상태.계좌 || [])) throw new Error('백업 파일의 계좌 정보가 올바르지 않아요.');
  return normalize(obj.상태);
}

export function newId() {
  return 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
