// 계산 모음. 금융 수치(요율·한도·금리·개월수)는 모두 규칙 JSON(R)에서 받는다
import { SAVING_TYPES } from './store.js';

const MONTHS_PER_YEAR = 12; // 달력 상수

export function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
function sum(list, f) { return (list || []).reduce((a, x) => a + n(f(x)), 0); }

export function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ───── 월 실수령액 ─────
// 끝자리 처리: 4대보험·세금은 10원 미만 절사 (계획서 4장 ①, 검토 보고서 ④)
// 부동소수점 오차(예: 104,969.9999…)로 10원이 덜 잘리지 않게 아주 작은 값을 더한 뒤 자른다
const CUT_UNIT = 10;
export function cut10(x) { return Math.floor((Number(x) || 0) / CUT_UNIT + 1e-9) * CUT_UNIT; }
// 4대보험(근로자 부담분). 장기요양율은 '장기요양기준' 필드가 있으면 따르고,
// 없으면 건강보험율보다 크면 건강보험료에 곱하는 비율, 작으면 월급에 곱하는 비율로 본다
export function insurance(monthGross, R) {
  const c = R.실수령계산 || {};
  const 국민연금 = cut10(monthGross * n(c.국민연금율));
  const 건강보험 = cut10(monthGross * n(c.건강보험율));
  const 기준 = c.장기요양기준 || (n(c.장기요양율) > n(c.건강보험율) ? '건강보험료' : '월급');
  // 장기요양은 (절사한) 건강보험료에 곱한다
  const 장기요양 = cut10(기준 === '건강보험료' ? 건강보험 * n(c.장기요양율) : monthGross * n(c.장기요양율));
  const 고용보험 = cut10(monthGross * n(c.고용보험율));
  const out = { 국민연금, 건강보험, 장기요양, 고용보험 };
  out.합계 = out.국민연금 + out.건강보험 + out.장기요양 + out.고용보험;
  return out;
}

// 소득세(지방소득세 포함) 비율: 규칙의 검산값(연봉 → 월실수령)에서 역산
export function taxRatio(R) {
  const v = (R.실수령계산 || {}).검산 || {};
  const g = n(v.연봉) / MONTHS_PER_YEAR;
  if (!g || !n(v.월실수령)) return 0;
  const afterIns = g - insurance(g, R).합계;
  return afterIns > 0 ? Math.max(0, (afterIns - n(v.월실수령)) / afterIns) : 0;
}

export function netPay(annual, R) {
  const 세전 = n(annual) / MONTHS_PER_YEAR;
  const 보험 = insurance(세전, R);
  const 세금 = cut10((세전 - 보험.합계) * taxRatio(R));
  return { 세전: Math.round(세전), 보험, 세금, 실수령: Math.max(0, Math.round(세전 - 보험.합계 - 세금)) };
}

export function monthlyNet(state, R) {
  const p = state.프로필 || {};
  if (n(p.월실수령직접) > 0) return n(p.월실수령직접);
  if (n(p.연봉) > 0) return netPay(p.연봉, R).실수령;
  return 0;
}

// ───── 자산 ─────
export function totalAssets(state) { return sum(state.계좌, a => a.잔액); }
export function totalDebt(state) { return sum((state.프로필 || {}).부채, d => d.잔액); }
export function netWorth(state) { return totalAssets(state) - totalDebt(state); }

function accountByName(state, name) {
  const w = String(name || '').replace(/\s+/g, '');
  if (!w) return null;
  return (state.계좌 || []).find(a => String(a.별명).replace(/\s+/g, '') === w) || null;
}

// 자동이체 분류: 내 저축성 계좌로 → 저축, 생활비 계좌로 → 생활비, 그 밖 → 고정비
export function classifyTransfer(state, t) {
  const acc = accountByName(state, t.받는계좌);
  const living = ((state.프로필 || {}).생활비 || {}).계좌;
  if (acc && SAVING_TYPES.includes(acc.종류)) return '저축';
  if (living && accountByName(state, living) && acc && acc === accountByName(state, living)) return '생활비';
  if (!acc && living && String(t.받는계좌 || '').replace(/\s+/g, '') === String(living).replace(/\s+/g, '')) return '생활비';
  return '고정비';
}

// 월 고정지출 = 고정비 자동이체 + 생활비 (생활비 이체가 없으면 생활비 예산) + 대출 월 상환
export function monthlyFixed(state) {
  const p = state.프로필 || {};
  const list = p.자동이체 || [];
  const fixed = sum(list.filter(t => classifyTransfer(state, t) === '고정비'), t => t.금액);
  let living = sum(list.filter(t => classifyTransfer(state, t) === '생활비'), t => t.금액);
  if (!living) living = n((state.생활비 || {}).월예산);
  const debt = sum(p.부채, d => d.월상환);
  return { 고정비: fixed, 생활비: living, 대출상환: debt, 합계: fixed + living + debt };
}

// 월급 자동이체 후 주계좌에 남는 돈
export function mainLeftover(state, R) {
  const p = state.프로필 || {};
  const out = sum(p.자동이체, t => t.금액) + sum(p.부채, d => d.월상환);
  return monthlyNet(state, R) - out;
}

// 이번 달 저축률: 저축성 계좌의 월 납입액 합 ÷ 월 실수령액
export function savingRate(state, R) {
  const net = monthlyNet(state, R);
  const saving = sum((state.계좌 || []).filter(a => SAVING_TYPES.includes(a.종류)), a => a.월납입);
  return { 저축액: saving, 비율: net > 0 ? saving / net : 0 };
}

// ───── 비상금 ─────
export function emergency(state, R) {
  const m = ((R.비상금 || {}).권장개월수) || {};
  const fixed = monthlyFixed(state).합계;
  const 현재 = sum((state.계좌 || []).filter(a => a.종류 === '비상금'), a => a.잔액);
  const 최소목표 = fixed * n(m.최소);
  const 권장목표 = fixed * n(m.권장);
  // 비상금 비율이 0보다 큰 첫 배분예시를 쓴다 (첫 예시가 비상금 0이면 다음 예시)
  const 첫배분 = (Array.isArray(R.배분예시) && R.배분예시.find(x => n((x.비율 || {}).비상금) > 0)) || null;
  const 비율 = 첫배분 ? n((첫배분.비율 || {}).비상금) : 0;
  const 월적립제안 = Math.round(monthlyNet(state, R) * 비율);
  const 남은금액 = Math.max(0, 권장목표 - 현재);
  return {
    현재, 최소목표, 권장목표, 월고정지출: fixed, 최소개월: n(m.최소), 권장개월: n(m.권장),
    진행률: 권장목표 > 0 ? Math.min(1, 현재 / 권장목표) : 0,
    월적립제안, 제안비율: 비율, 예시이름: 첫배분 ? 첫배분.이름 : '',
    남은개월: 월적립제안 > 0 ? Math.ceil(남은금액 / 월적립제안) : null,
  };
}

// ───── 날짜 ─────
export function parseDate(s) {
  if (!s) return null;
  const d = new Date(s + (s.length === 7 ? '-01' : ''));
  return Number.isNaN(d.getTime()) ? null : d;
}
export function monthsBetween(a, b) {
  return (b.getFullYear() - a.getFullYear()) * MONTHS_PER_YEAR + (b.getMonth() - a.getMonth());
}
function addMonths(d, m) { const x = new Date(d); x.setMonth(x.getMonth() + m); return x; }
export function ymd(d) {
  return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '';
}

// ───── 적금 만기 예상 ─────
// 원금 + 정부 기여금(청년미래적금) + 이자(단리 적금 방식, 계좌에 적은 금리 사용)
export function savingsMaturity(acc, R) {
  const isYouth = acc.상품 === '청년미래적금' || /청년미래/.test(acc.별명 || '');
  const rule = isYouth ? ((R.상품 || {}).청년미래적금 || {}) : {};
  const start = parseDate(acc.가입일);
  let total = 0;
  let end = parseDate(acc.만기일);
  if (start && end) total = monthsBetween(start, end);
  else if (start && isYouth && n(rule.기간개월)) { total = n(rule.기간개월); end = addMonths(start, total); }
  const monthly = n(acc.월납입);
  const today = new Date();
  const paid = start ? Math.min(total || Infinity, Math.max(0, monthsBetween(start, today) + 1)) : 0;
  const 원금 = monthly * total;
  let 기여금 = 0;
  let 기여율 = 0;
  if (isYouth) {
    기여율 = n(((rule.정부기여율) || {})[acc.기여유형 === '우대' ? '우대' : '일반']);
    const base = n(rule.월납입한도) > 0 ? Math.min(monthly, n(rule.월납입한도)) : monthly;
    기여금 = Math.round(base * 기여율 * total);
  }
  // 금리: 계좌에 사용자가 넣은 값 → 없으면 규칙의 기본금리(청년미래적금) → 그것도 null이면 이자 제외
  const own = acc.금리 === null || acc.금리 === undefined || acc.금리 === '' ? null : n(acc.금리);
  const base = isYouth && typeof rule.기본금리 === 'number' && Number.isFinite(rule.기본금리) ? rule.기본금리 : null;
  const rate = own !== null ? own : base;
  const 금리출처 = own !== null ? '계좌에 입력한 금리' : base !== null ? '규칙의 기본금리' : '';
  const 이자 = rate === null ? null : Math.round(monthly * rate * (total * (total + 1) / 2) / MONTHS_PER_YEAR);
  return {
    청년미래적금: isYouth, 총개월: total, 납입개월: Number.isFinite(paid) ? paid : 0,
    남은개월: end ? Math.max(0, monthsBetween(today, end)) : null, 만기일: end ? ymd(end) : '',
    원금, 기여금, 기여율, 이자, 금리: rate, 금리출처, 비과세: isYouth ? rule.비과세 === true : null,
    예상합계: 원금 + 기여금 + (이자 || 0),
    한도초과: isYouth && n(rule.월납입한도) > 0 && monthly > n(rule.월납입한도),
  };
}

// ───── 주택청약 ─────
export function housing(acc, state, R) {
  const rule = (R.상품 || {}).주택청약 || {};
  const 한도 = n(rule.월납입인정한도);
  const monthly = n(acc.월납입);
  const start = parseDate(acc.가입일);
  const 회차 = start ? Math.max(0, monthsBetween(start, new Date()) + 1) : 0;
  const 인정월액 = 한도 > 0 ? Math.min(monthly, 한도) : monthly;
  const 공제 = rule.소득공제 || {};
  const 연납입 = monthly * MONTHS_PER_YEAR;
  const p = state.프로필 || {};
  const 급여조건 = n(공제.총급여조건) > 0 ? n(p.연봉) <= n(공제.총급여조건) : true;
  const 공제대상 = p.무주택세대주 === '예' && 급여조건;
  const 공제가능액 = Math.round(Math.min(연납입, n(공제.연한도)) * n(공제.공제율));
  const 한도기준공제액 = Math.round(Math.min(한도 * MONTHS_PER_YEAR, n(공제.연한도)) * n(공제.공제율));
  return {
    월납입: monthly, 인정한도: 한도, 인정월액, 회차, 추정인정총액: 인정월액 * 회차,
    기본금리: n(rule.기본금리), 연이자예상: Math.round(n(acc.잔액) * n(rule.기본금리)),
    연납입, 공제율: n(공제.공제율), 연공제한도: n(공제.연한도), 총급여조건: n(공제.총급여조건),
    급여조건, 무주택: p.무주택세대주 || '모름', 공제대상, 공제가능액, 한도기준공제액,
  };
}

// ───── 비정기 ─────
export function irregularMonthly(state) {
  const list = (state.프로필 || {}).비정기지출 || [];
  return { 목록: list.map(x => ({ ...x, 월적립: Math.round(n(x.연간금액) / MONTHS_PER_YEAR) })), 연간합계: sum(list, x => x.연간금액), 월합계: Math.round(sum(list, x => x.연간금액) / MONTHS_PER_YEAR) };
}

// 예비비가 필요한가: 비정기 지출이 있는데, 예비비 계좌의 월 납입액 합이 월 필요액보다 적음
export function reserveNeeded(state) {
  const need = irregularMonthly(state).월합계;
  const saving = sum((state.계좌 || []).filter(a => a.종류 === '예비비'), a => a.월납입);
  return { 필요: need > 0 && saving < need, 월필요액: need, 월적립: saving };
}

// 출처 문장 중 주의 문장 (예: "공식 기준 아님") 뽑기
export function cautionOf(src) {
  const text = [].concat(src || []).join(' ');
  const parts = text.split(/[.。]\s*|\)\s*|\(|\s—\s/).map(x => x.trim()).filter(Boolean);
  return [...new Set(parts.filter(x => /아님|주의|참고|개인|확인 필요/.test(x)))];
}

// 명절 상여 배분 예시 (규칙 JSON `상여배분예시`, 계획서 4장 ① 검토 ⑥·⑦ 반영)
// 고르는 순서:
//   비상금 미달 + 예비비 필요 → 적용조건 "예비비필요"
//   비상금만 미달            → 적용조건 "비상금부족"
//   둘 다 아님               → 적용조건 "기본"
//   그 조건의 예시가 없거나 `적용조건`이 없는 예전 형식이면 →
//     비상금 미달이면 비상금 비율이 0보다 큰 첫 예시, 아니면 첫 예시.
//     그것도 없으면 숫자 없이 "비상금 몫을 먼저 정하세요" (예시: null, 비상금먼저: true)
export function bonusSuggestion(state, R) {
  const list = (Array.isArray(R.상여배분예시) ? R.상여배분예시 : []).filter(x => x && x.비율);
  const em = emergency(state, R);
  const short = em.최소목표 > 0 && em.현재 < em.최소목표;
  const reserve = reserveNeeded(state);
  const want = short && reserve.필요 ? '예비비필요' : short ? '비상금부족' : '기본';
  const hasCond = list.some(x => typeof x.적용조건 === 'string' && x.적용조건);
  let pick = hasCond ? list.find(x => x.적용조건 === want) : null;
  let 방식 = pick ? '적용조건' : '예전방식';
  if (!pick) pick = short ? list.find(x => n(x.비율.비상금) > 0) : list[0];
  if (!pick) return { 예시: null, 비상금먼저: short, 원하는조건: want, 예비비필요: reserve.필요 };
  const b = pick.비율;
  return {
    예시: { 비상금: n(b.비상금), 예비비: n(b.예비비), 저축: n(b.저축), 투자: n(b.투자), 즐거움: n(b.즐거움) },
    이름: pick.이름, 출처: pick.출처, 근거수준: pick.근거수준 || '', 적용조건: pick.적용조건 || '',
    개인출처: pick.근거수준 === '개인', 주의: cautionOf(pick.출처),
    비상금먼저: short, 예비비필요: reserve.필요, 원하는조건: want, 방식,
  };
}

// 이 예시를 고른 이유 (화면 설명용)
export function bonusReason(s) {
  if (s.방식 === '적용조건') {
    if (s.적용조건 === '예비비필요') return '비상금이 최소 목표보다 적고 예비비도 모자라서 예비비 몫이 있는 예시를 골랐어요';
    if (s.적용조건 === '비상금부족') return '비상금이 최소 목표보다 적어서 비상금을 먼저 채우는 예시를 골랐어요';
    return '비상금이 최소 목표 이상이라 기본 예시를 골랐어요';
  }
  return s.비상금먼저 ? '비상금이 최소 목표보다 적어 비상금 몫이 있는 예시를 골랐어요' : '첫 번째 예시예요';
}

// 상여 예시 문구: "비상금 30%, 예비비 10%, 즐거움 20%"
export function bonusPhrase(e, pct) {
  // 예비비가 0%여도 보여준다 (예비비 몫이 없다는 것도 알 수 있게)
  return [['비상금', e.비상금], ['예비비', e.예비비], ['즐거움', e.즐거움]]
    .map(([k, v]) => `${k} ${pct(v)}`).join(', ');
}

// 고금리 기준: 규칙에 '부채.고금리기준'이 있으면 그것, 없으면 상품예시 중 가장 높은 금리
export function highRateLine(R) {
  const v = (R.부채 || {}).고금리기준;
  if (Number.isFinite(Number(v)) && v !== null && v !== '') return { 기준: Number(v), 근거: '규칙 JSON의 고금리 기준' };
  const rates = (R.상품예시 || []).map(x => x.금리).filter(v => typeof v === 'number' && Number.isFinite(v));
  if (!rates.length) return null;
  return { 기준: Math.max(...rates), 근거: '원금이 보장되는 상품예시 중 가장 높은 금리' };
}
