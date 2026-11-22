// 금융 규칙 읽기
// 1) 데이터/금융규칙.json (조사 세션이 채움)을 먼저 읽고
// 2) 없거나 읽지 못하면 데이터/금융규칙_임시.json 을 쓴다
// 3) 금융규칙.json에 일부 값이 비어 있거나 "확인 필요" 같은 글자이면 그 항목만 임시값으로 채우고 목록에 남긴다

const REAL = '데이터/금융규칙.json';
const TEMP = '데이터/금융규칙_임시.json';

async function fetchJson(path) {
  const res = await fetch(encodeURI(path), { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  const text = await res.text();
  return JSON.parse(text);
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// 조사값(r)이 쓸 수 있는 값인지: 숫자 자리에는 숫자, 참/거짓 자리에는 참/거짓
function usable(t, r) {
  if (r === undefined || r === null) return false;
  if (typeof t === 'number') return typeof r === 'number' && Number.isFinite(r);
  if (typeof t === 'boolean') return typeof r === 'boolean';
  if (Array.isArray(t)) return Array.isArray(r) && r.length > 0;
  if (typeof t === 'string') return typeof r === 'string' && r.trim() !== '';
  return true;
}

// 조사 파일에서 null이 "확인 안 됨"이라는 뜻인 필드 (계획서 4장 ① 변경 이력).
// 이 필드가 null이면 임시값으로 채우지 않고 null 그대로 둔다
const NULLABLE = ['상품.청년미래적금.기본금리'];

// 임시값(t)을 바탕으로 조사값(r)을 덮어쓴다. 임시값으로 남은 경로는 tempPaths에 기록
function merge(t, r, path, tempPaths) {
  if (r === null && NULLABLE.includes(path)) return null;
  if (isPlainObject(t)) {
    if (!isPlainObject(r)) { tempPaths.push(path || '전체'); return t; }
    const out = {};
    for (const k of Object.keys(t)) {
      if (k === '출처') { out[k] = r[k] !== undefined ? r[k] : t[k]; continue; }
      const p = path ? `${path}.${k}` : k;
      // 필드가 아예 없으면 임시값, 있고 null이면(허용 필드) null 유지
      out[k] = (k in r) ? merge(t[k], r[k], p, tempPaths) : merge(t[k], undefined, p, tempPaths);
    }
    for (const k of Object.keys(r)) if (!(k in out)) out[k] = r[k];
    return out;
  }
  if (!usable(t, r)) { tempPaths.push(path); return t; }
  return r;
}

export async function loadRules() {
  let temp = null;
  let real = null;
  let realError = '';
  try { temp = await fetchJson(TEMP); } catch (e) { temp = null; }
  try { real = await fetchJson(REAL); } catch (e) { realError = e.message; }

  if (!real && !temp) throw new Error('금융 규칙 파일을 하나도 읽지 못했어요.');
  if (!real) {
    return {
      rules: temp,
      info: { 사용파일: TEMP, 임시값사용: true, 임시항목: ['전체'], 기준일: temp.기준일, 오류: realError },
    };
  }
  if (!temp) {
    return { rules: real, info: { 사용파일: REAL, 임시값사용: false, 임시항목: [], 기준일: real.기준일, 오류: '' } };
  }
  const tempPaths = [];
  const merged = merge(temp, real, '', tempPaths);
  return {
    rules: merged,
    info: {
      사용파일: REAL,
      임시값사용: tempPaths.length > 0,
      임시항목: tempPaths,
      기준일: usable('x', real.기준일) ? real.기준일 : temp.기준일,
      오류: '',
    },
  };
}

// 용어 찾기: 띄어쓰기·괄호를 무시하고 비교
function norm(s) {
  return String(s || '').replace(/\(.*?\)/g, '').replace(/\s+/g, '').toLowerCase();
}
export function findTerm(rules, word) {
  const list = Array.isArray(rules && rules.용어) ? rules.용어 : [];
  const w = norm(word);
  return list.find(x => norm(x.단어) === w)
    || list.find(x => norm(x.단어).includes(w) || w.includes(norm(x.단어)))
    || null;
}
