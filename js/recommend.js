// 내 맞춤 진단·추천 (F8): 계획서 3장 "추천 규칙" 1~7번
import * as C from './calc.js';
import { won, pct } from './ui.js';

export function recommendations(state, R) {
  const p = state.프로필 || {};
  const out = [];
  const accounts = state.계좌 || [];

  // 1. 고금리 빚
  const line = C.highRateLine(R);
  const debts = (p.부채 || []).filter(d => C.n(d.잔액) > 0);
  const high = line ? debts.filter(d => C.n(d.금리) > line.기준) : [];
  if (high.length) {
    const d = high.sort((a, b) => C.n(b.금리) - C.n(a.금리))[0];
    out.push({
      규칙: 1, 제목: '대출 먼저 갚기',
      내용: `"${d.이름 || '대출'}" 금리가 ${pct(d.금리)}예요. 투자보다 이 대출을 먼저 갚는 게 유리할 수 있어요.`,
      근거: `비교 기준 ${pct(line.기준)} (${line.근거})`, 링크: '#/내정보',
    });
  }

  // 2. 비상금 부족
  const em = C.emergency(state, R);
  if (em.월고정지출 > 0 && em.현재 < em.최소목표) {
    out.push({
      규칙: 2, 제목: '비상금 통장 분리',
      내용: em.월적립제안 > 0
        ? `비상금 통장을 따로 만들고 매달 ${won(em.월적립제안)}씩 모으세요. 목표 ${won(em.권장목표)}`
        : `비상금 통장을 따로 만들고 매달 일정액을 모으세요. 목표 ${won(em.권장목표)}`,
      근거: `월 고정지출 ${won(em.월고정지출)} × 최소 ${em.최소개월}개월 = ${won(em.최소목표)} (현재 ${won(em.현재)}).${em.월적립제안 > 0 ? ` 월 적립액은 "${em.예시이름}"의 비상금 비율 ${pct(em.제안비율)} 기준` : ''}`,
      링크: '#/비상금',
    });
  }

  // 3. 비정기 지출 있는데 예비비 없음
  const ir = C.irregularMonthly(state);
  const hasReserve = accounts.some(a => a.종류 === '예비비' && (C.n(a.월납입) > 0 || C.n(a.잔액) > 0));
  if (ir.연간합계 > 0 && !hasReserve) {
    const top = ir.목록.slice().sort((a, b) => C.n(b.연간금액) - C.n(a.연간금액))[0];
    out.push({
      규칙: 3, 제목: '예비비 적립',
      내용: `${top.항목}로 연 ${won(top.연간금액)} 쓰셨어요. 매달 ${won(ir.월합계)}을 예비비로 떼어두면 월급 계획이 흔들리지 않아요.`,
      근거: `비정기 지출 연간 합계 ${won(ir.연간합계)} ÷ 12개월`, 링크: '#/비정기',
    });
  }

  // 4. 명절 상여 배분 규칙 없음
  const bonus = (p.상여 || []).filter(b => C.n(b.금액) > 0);
  if (bonus.length && !state.상여배분) {
    const s = C.bonusSuggestion(state, R);
    const head = `명절 상여 ${won(bonus[0].금액)}이 들어오면`;
    const 내용 = s.예시
      ? `${head} ${C.bonusPhrase(s.예시, pct)}처럼 미리 정해두세요.`
      : s.비상금먼저
        ? `${head} 어디로 보낼지 미리 정해두세요. 비상금이 아직 부족하니 비상금 몫을 먼저 정하세요.`
        : `${head} 어디로 보낼지 비율을 미리 정해두세요.`;
    out.push({
      규칙: 4, 제목: '명절 상여 배분 규칙 정하기', 내용,
      근거: s.예시 ? `예시 비율은 "${s.이름}" 기준 (${C.bonusReason(s)})${s.주의.length ? ` · 출처 주의: ${s.주의.join(', ')}` : ''}` : '',
      표시: s.예시 && s.개인출처 ? '개인 의견 출처 · 참고용' : '',
      링크: '#/비정기',
    });
  }

  // 5. 청약 납입액 < 인정 한도, 무주택 세대주(또는 모름)
  const hs = accounts.find(a => a.종류 === '청약');
  if (hs) {
    const h = C.housing(hs, state, R);
    if (h.인정한도 > 0 && h.월납입 < h.인정한도 && (h.무주택 === '예' || h.무주택 === '모름')) {
      out.push({
        규칙: 5, 제목: '청약 납입액 검토',
        내용: `지금 월 ${won(h.월납입)}을 넣고 있어요. 청약 납입을 늘리면 소득공제·청약 인정금액에 유리할 수 있어요 (조건 확인 필요).`,
        근거: `월 납입 인정 한도 ${won(h.인정한도)}${h.무주택 === '모름' ? ' · 무주택 세대주 여부를 먼저 확인하세요' : ''}`,
        링크: '#/저축',
      });
    }
  }

  // 6. 자동이체 후 주계좌에 남는 돈
  const left = C.mainLeftover(state, R);
  if (C.monthlyNet(state, R) > 0 && left > 0) {
    const reserve = ir.월합계;
    out.push({
      규칙: 6, 제목: '남는 돈 자동이체',
      내용: `자동이체 후 주계좌에 매달 ${won(left)}이 남아요. 남는 ${won(left)}을 월급날 다음 날 자동이체로 저축·투자 통장에 보내세요.`,
      근거: `월 실수령액 ${won(C.monthlyNet(state, R))} − 자동이체·상환 합계${reserve ? ` (예비비 ${won(reserve)}도 이 안에서 떼어두세요)` : ''}`,
      링크: '#/배분',
    });
  }

  // 7. 비상금 충분 + 투자 경험 없음
  if (em.최소목표 > 0 && em.현재 >= em.최소목표 && (p.투자경험 === '없음' || !p.투자경험)) {
    out.push({
      규칙: 7, 제목: '절세 계좌 알아보기',
      내용: '절세 계좌(ISA·연금저축)가 무엇인지 먼저 알아보세요 → 가이드 보기',
      근거: '비상금이 최소 목표를 넘었어요', 링크: '#/가이드',
    });
  }
  return out;
}
