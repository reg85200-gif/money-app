// 각 화면 (F1~F11, F16, F17)
import * as C from './calc.js';
import { recommendations } from './recommend.js';
import { won, pct, esc, term, moneyInput, bindMoneyInputs, parseMoney, parsePercent, percentInput, modal, toast, bar, manwon } from './ui.js';
import { ACCOUNT_TYPES, SAVING_TYPES, newId, makeBackup, parseBackup, clearState, emptyState } from './store.js';
import { renderOnboarding, balanceTip } from './onboarding.js';
import { renderTransfer, openTransfer, leaveTransfer } from './transfer.js';

// 월급 배분 비율 항목 (계획서 4장 ① 배분예시.비율, 2026-11-22 예비비 추가)
const ALLOC_KEYS = ['고정비', '생활비', '저축', '비상금', '예비비', '투자'];
const BONUS_KEYS = ['비상금', '예비비', '저축', '투자', '즐거움'];
const DEFAULT_CATEGORIES = ['식비', '교통', '차량관리비', '통신', '생활용품', '의료', '경조사', '여가', '기타'];

let charts = [];
function destroyCharts() { charts.forEach(c => c.destroy()); charts = []; }
function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
const PALETTE = ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6', '--c7', '--c8'];

// 근거수준이 "개인"인 상여 예시에 붙이는 표시 (검토 ⑥)
const PERSONAL_LABEL = '개인 의견 출처 · 참고용';
function refBadge(text) {
  return text ? `<em class="badge ref">${esc(text)}</em>` : '';
}
const LEVEL_TEXT = { 공식: '공식 자료', 언론: '언론 기사', 개인: PERSONAL_LABEL };
const COND_TEXT = { 예비비필요: '비상금 부족 + 예비비 필요', 비상금부족: '비상금 부족', 기본: '기본(비상금 충분)' };

function empty(msg, link, label) {
  return `<div class="empty"><p>${msg}</p>${link ? `<a class="btn primary" href="${link}">${label}</a>` : ''}</div>`;
}

// ───────── F1 대시보드 ─────────
function dashboard(root, ctx) {
  const { state, R } = ctx;
  const net = C.monthlyNet(state, R);
  const sr = C.savingRate(state, R);
  const recs = recommendations(state, R);
  const accs = state.계좌.filter(a => C.n(a.잔액) > 0);
  const pd = C.payDiff(state, R);
  const trend = C.payTrend(state, R);
  root.innerHTML = `
    <h1>대시보드</h1>
    <div class="stats">
      <div class="stat"><span>${term('순자산')}</span><strong>${won(C.netWorth(state))}</strong><small>총자산 ${won(C.totalAssets(state))} · 빚 ${won(C.totalDebt(state))}</small></div>
      <div class="stat"><span>이번 달 ${term('저축률')}</span><strong>${pct(sr.비율)}</strong><small>월 ${won(sr.저축액)} 저축·투자 ÷ ${pd.기록있음 ? '실제 입금액' : '기준 월급'}</small></div>
      <div class="stat"><span>이번 달 입금액</span><strong>${won(pd.실제)}</strong>
        <small>${pd.기록있음 ? `기준 ${won(pd.기준)} 대비 <b class="${pd.차이 > 0 ? 'ok' : pd.차이 < 0 ? 'neg' : ''}">${signed(pd.차이)}</b>` : `기록 없음 · 기준 ${term('월 실수령액', '월급')}(${C.n(state.프로필.월실수령직접) > 0 ? '직접 입력값' : '자동 계산'}) 사용`}</small>
        <a class="btn small primary pay-btn" href="#/월급" data-pay-now>이번 달 월급 입력/수정</a></div>
    </div>
    <section class="card">
      <div class="card-head"><h2>지금 할 일</h2><a href="#/추천">전체 보기 (${recs.length})</a></div>
      ${recs.length ? `<ol class="todo">${recs.slice(0, 3).map(r => `<li><a href="${r.링크}"><strong>${esc(r.제목)}</strong><span>${esc(r.내용)}</span>${refBadge(r.표시)}</a></li>`).join('')}</ol>` : '<p class="hint">지금은 해당하는 할 일이 없어요.</p>'}
    </section>
    <div class="two">
      <section class="card"><h2>계좌별 비중</h2>${accs.length ? '<div class="chart-box"><canvas id="pie" aria-label="계좌별 비중 원형 차트"></canvas></div>' : empty('잔액이 있는 계좌가 없어요.', '#/계좌', '계좌 추가')}</section>
      <section class="card"><h2>월별 순자산 추이</h2>${state.기록.length ? '<div class="chart-box"><canvas id="line" aria-label="월별 순자산 추이 선 차트"></canvas></div>' : empty('아직 기록이 없어요. 계좌 잔액을 고치면 그 달 순자산이 기록돼요.')}</section>
    </div>
    <section class="card">
      <div class="card-head"><h2>최근 12개월 월급</h2><a href="#/월급">기록 보기</a></div>
      <p class="hint">평균 ${trend.평균 === null ? '— (기록 없음)' : `<strong>${won(trend.평균)}</strong> (기록한 ${trend.기록개월}개월)`} · 기준 월급 ${won(trend.기준)}</p>
      ${trend.기록개월 ? '<div class="chart-box"><canvas id="pay" aria-label="최근 12개월 월급 막대 차트"></canvas></div>' : empty('아직 월급 기록이 없어요.', '#/월급', '이번 달 월급 입력')}
    </section>`;
  root.querySelectorAll('[data-pay-now]').forEach(a => { a.onclick = () => { openPayMonth(C.monthKey()); }; });
  if (!window.Chart) {
    root.querySelectorAll('.chart-box').forEach(b => { b.innerHTML = '<p class="hint">차트 도구를 불러오지 못했어요. 인터넷에 연결한 뒤 한 번 열면 다음부터는 오프라인에서도 보여요.</p>'; });
    return;
  }
  const text = cssVar('--text');
  const grid = cssVar('--line');
  const fmt = v => won(v);
  if (accs.length) {
    charts.push(new window.Chart(root.querySelector('#pie'), {
      type: 'doughnut',
      data: { labels: accs.map(a => a.별명), datasets: [{ data: accs.map(a => C.n(a.잔액)), backgroundColor: accs.map((_, i) => cssVar(PALETTE[i % PALETTE.length])), borderColor: cssVar('--card'), borderWidth: 2 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: text } }, tooltip: { callbacks: { label: c => `${c.label}: ${fmt(c.parsed)}` } } } },
    }));
  }
  if (state.기록.length) {
    const rec = state.기록.slice().sort((a, b) => a.월.localeCompare(b.월));
    charts.push(new window.Chart(root.querySelector('#line'), {
      type: 'line',
      data: { labels: rec.map(r => r.월.replace('-', '.')), datasets: [{ label: '순자산', data: rec.map(r => r.순자산), borderColor: cssVar('--c1'), backgroundColor: cssVar('--c1'), tension: 0.25, pointRadius: 3 }] },
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => fmt(c.parsed.y) } } },
        scales: { x: { ticks: { color: text }, grid: { color: grid } }, y: { ticks: { color: text, callback: v => manwon(v) }, grid: { color: grid } } },
      },
    }));
  }
  if (trend.기록개월) {
    // 기준보다 많은 달·적은 달을 색으로 구분, 기준 월급은 점선
    const up = cssVar('--c2'); const down = cssVar('--c5'); const same = cssVar('--c1');
    charts.push(new window.Chart(root.querySelector('#pay'), {
      type: 'bar',
      data: {
        // 휴대폰 폭에서도 겹치지 않게 "7월"처럼 달만 표시 (연도는 툴팁 제목에)
        labels: trend.목록.map(x => `${Number(x.월.slice(5))}월`),
        datasets: [
          { type: 'bar', label: '실제 입금액', data: trend.목록.map(x => x.실수령), backgroundColor: trend.목록.map(x => x.실수령 === null ? same : x.실수령 > trend.기준 ? up : x.실수령 < trend.기준 ? down : same), borderRadius: 4 },
          { type: 'line', label: '기준 월급', data: trend.목록.map(() => trend.기준), borderColor: cssVar('--muted'), borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5 },
        ],
      },
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: text } }, tooltip: { callbacks: { title: items => items.length ? monthLabel(trend.목록[items[0].dataIndex].월) : '', label: c => c.parsed.y === null ? '기록 없음' : `${c.dataset.label}: ${fmt(c.parsed.y)}${c.datasetIndex === 0 ? ` (${signed(c.parsed.y - trend.기준)})` : ''}` } } },
        scales: { x: { ticks: { color: text, autoSkip: false, maxRotation: 0, font: { size: 10 } }, grid: { display: false } }, y: { ticks: { color: text, callback: v => manwon(v) }, grid: { color: grid } } },
      },
    }));
  }
}

// ───────── F2 계좌 관리 ─────────
function accountForm(a) {
  a = a || { 별명: '', 은행: '', 종류: '입출금', 잔액: 0, 월납입: 0, 가입일: '', 만기일: '', 금리: null, 상품: '', 기여유형: '일반', 메모: '' };
  return `<form class="acc-form grid-fields" data-id="${esc(a.id || '')}">
    <label><span>별명 (계좌번호 말고)</span><input name="별명" required value="${esc(a.별명)}" placeholder="예: 비상금 통장"></label>
    <label><span>은행</span><input name="은행" value="${esc(a.은행)}" placeholder="예: ○○은행"></label>
    <label><span>종류</span><select name="종류">${ACCOUNT_TYPES.map(t => `<option ${a.종류 === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label><span>잔액</span>${moneyInput('잔액', a.잔액)}</label>
    <label><span>월 납입액(매달 넣는 돈)</span>${moneyInput('월납입', a.월납입)}</label>
    <label><span>연 금리(%, 모르면 비움)</span><input name="금리" inputmode="decimal" value="${esc(percentInput(a.금리))}" placeholder="예: 3.5"></label>
    <label><span>가입일</span><input type="date" name="가입일" value="${esc(a.가입일)}"></label>
    <label><span>만기일</span><input type="date" name="만기일" value="${esc(a.만기일)}"></label>
    <label><span>상품 계산 방식</span><select name="상품">${[['', '일반'], ['청년미래적금', '청년미래적금'], ['주택청약', '주택청약']].map(([v, l]) => `<option value="${v}" ${a.상품 === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label><span>${term('정부 기여금')} 유형(청년미래적금)</span><select name="기여유형">${['일반', '우대'].map(t => `<option ${a.기여유형 === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="wide"><span>메모</span><input name="메모" value="${esc(a.메모)}"></label>
    <div class="actions wide"><button class="btn primary" type="submit">저장</button><button class="btn ghost" type="button" data-cancel>취소</button></div>
  </form>`;
}

function accounts(root, ctx) {
  const { state } = ctx;
  const groups = ACCOUNT_TYPES.map(t => ({ t, list: state.계좌.filter(a => a.종류 === t) })).filter(g => g.list.length);
  root.innerHTML = `
    <div class="page-head"><h1>계좌 관리</h1><button class="btn primary" data-add>+ 계좌 추가</button></div>
    <p class="hint">계좌번호·비밀번호는 적지 않아요. 별명과 잔액만 기록해요.</p>
    ${balanceTip(state.프로필.금융앱) ? `<p class="notice">잔액 확인: ${esc(balanceTip(state.프로필.금융앱))}</p>` : ''}
    <div id="form-slot"></div>
    ${groups.length ? groups.map(g => `<section class="card"><h2>${g.t}</h2>
      <ul class="acc-list">${g.list.map(a => `<li>
        <div><strong>${esc(a.별명)}</strong><small>${esc(a.은행 || '은행 미입력')}${C.n(a.월납입) ? ` · 월 ${won(a.월납입)}` : ''}${a.만기일 ? ` · 만기 ${esc(a.만기일)}` : ''}${a.메모 ? ` · ${esc(a.메모)}` : ''}</small></div>
        <div class="right"><strong>${won(a.잔액)}</strong><span><button class="btn small ghost" data-edit="${a.id}">수정</button><button class="btn small ghost danger" data-del="${a.id}">삭제</button></span></div>
      </li>`).join('')}</ul></section>`).join('') : empty('아직 계좌가 없어요.')}
    <p class="total">총자산 <strong>${won(C.totalAssets(state))}</strong></p>`;
  const slot = root.querySelector('#form-slot');
  const open = a => {
    slot.innerHTML = `<section class="card"><h2>${a ? '계좌 수정' : '새 계좌'}</h2>${accountForm(a)}</section>`;
    const f = slot.querySelector('form');
    bindMoneyInputs(f);
    f.별명.focus();
    f.querySelector('[data-cancel]').onclick = () => { slot.innerHTML = ''; };
    f.onsubmit = async e => {
      e.preventDefault();
      const v = {
        별명: f.별명.value.trim(), 은행: f.은행.value.trim(), 종류: f.종류.value, 잔액: parseMoney(f.잔액.value), 월납입: parseMoney(f.월납입.value),
        금리: parsePercent(f.금리.value), 가입일: f.가입일.value, 만기일: f.만기일.value, 상품: f.상품.value, 기여유형: f.기여유형.value, 메모: f.메모.value.trim(),
      };
      if (!v.별명) { toast('별명을 적어 주세요.'); return; }
      if (f.dataset.id) Object.assign(state.계좌.find(x => x.id === f.dataset.id), v);
      else state.계좌.push({ id: newId(), ...v });
      ctx.snapshot();
      await ctx.save();
      toast('저장했어요.');
      ctx.rerender();
    };
  };
  root.querySelector('[data-add]').onclick = () => open(null);
  root.querySelectorAll('[data-edit]').forEach(b => { b.onclick = () => open(state.계좌.find(x => x.id === b.dataset.edit)); });
  root.querySelectorAll('[data-del]').forEach(b => {
    b.onclick = async () => {
      const a = state.계좌.find(x => x.id === b.dataset.del);
      if (!confirm(`"${a.별명}" 계좌를 삭제할까요?`)) return;
      state.계좌 = state.계좌.filter(x => x.id !== a.id);
      ctx.snapshot();
      await ctx.save();
      ctx.rerender();
    };
  });
}

// ───────── F3 월급 배분 ─────────
function allocation(root, ctx) {
  const { state, R } = ctx;
  const net = C.monthlyNet(state, R);
  const presets = Array.isArray(R.배분예시) ? R.배분예시 : [];
  const cur = state.배분 || { 프리셋: presets[0] ? presets[0].이름 : '직접', 비율: presets[0] ? { ...presets[0].비율 } : {}, 계좌연결: {} };
  const month = C.monthKey();
  const checks = state.이체체크[month] || {};
  const total = ALLOC_KEYS.reduce((s, k) => s + C.n(cur.비율[k]), 0);
  // F16: 이번 달 실제 입금액 기준 (더 들어온 달은 추가분을 따로, 덜 들어온 달은 고른 항목을 줄임)
  const ma = C.monthAllocation(state, R, cur.비율, month);
  const amounts = ma.최종;
  const extraRows = ma.추가 && ma.추가.분배 ? BONUS_KEYS.filter(k => ma.추가.분배[k] > 0).map(k => ({ key: `추가:${k}`, label: `추가 수입 → ${k}`, amount: ma.추가.분배[k] })) : [];
  const fixed = C.monthlyFixed(state);
  const preset = presets.find(p => p.이름 === cur.프리셋);
  root.innerHTML = `
    <h1>${term('월급 배분')} <small class="sub">(통장 쪼개기)</small></h1>
    ${net ? '' : `<div class="notice">월 실수령액이 없어요. <a href="#/내정보">내 정보</a>에서 연봉을 입력하세요.</div>`}
    <section class="card">
      <div class="card-head"><h2>이번 달 입금액</h2><a class="btn small" href="#/월급" data-pay-now>이번 달 월급 입력/수정</a></div>
      <p>${ma.기록있음 ? `실제 입금액 <strong>${won(ma.실제)}</strong> <small class="sub">(기준 ${won(ma.기준)} 대비 ${signed(ma.차이)})</small>` : `기록이 없어 기준 월급 <strong>${won(ma.기준)}</strong>으로 계산해요.`}</p>
      ${ma.기록있음 && ma.차이 !== 0 ? monthAdjustHtml(ctx, month) : ''}
    </section>
    <section class="card">
      <h2>비율 정하기</h2>
      <p>기준 월급 <strong>${won(net)}</strong>을 아래 비율로 나눠요.${ma.기록있음 && ma.차이 !== 0 ? ' 이번 달 금액은 위 안내대로 조정돼요.' : ''}</p>
      <form id="alloc" class="grid-fields">
        <label class="wide"><span>예시 비율 고르기</span><select name="프리셋">
          ${presets.map(p => `<option ${cur.프리셋 === p.이름 ? 'selected' : ''}>${esc(p.이름)}</option>`).join('')}
          <option value="직접" ${cur.프리셋 === '직접' ? 'selected' : ''}>직접 설정</option></select>
          ${preset ? `<small class="hint">출처: ${esc([].concat(preset.출처 || []).join(', '))}</small>` : ''}</label>
        ${ALLOC_KEYS.map(k => `<label><span>${k} (%)</span><input name="${k}" inputmode="decimal" value="${esc(percentInput(cur.비율[k] || 0))}"></label>`).join('')}
        <p class="wide ${Math.abs(total - 1) > 1e-9 ? 'warn' : 'ok'}">합계 ${pct(total)} ${Math.abs(total - 1) > 1e-9 ? '— 100%가 되도록 맞춰 주세요' : '✓'}</p>
        <div class="actions wide"><button class="btn primary" type="submit">비율 저장</button></div>
      </form>
    </section>
    <section class="card">
      <h2>이번 달(${month.replace('-', '년 ')}월) 이체 체크리스트</h2>
      <table class="tbl"><thead><tr><th>완료</th><th>항목</th><th class="num">금액</th><th>보낼 계좌</th></tr></thead><tbody>
      ${ALLOC_KEYS.map(k => `<tr>
        <td><input type="checkbox" data-check="${k}" ${checks[k] ? 'checked' : ''} aria-label="${k} 이체 완료"></td>
        <td>${k}</td><td class="num">${won(amounts[k])}${ma.부족 && ma.부족.줄임[k] ? `<br><small class="neg">−${won(ma.부족.줄임[k])}</small>` : ''}</td>
        <td><select data-link="${k}"><option value="">선택</option>${state.계좌.map(a => `<option value="${a.id}" ${(cur.계좌연결 || {})[k] === a.id ? 'selected' : ''}>${esc(a.별명)}</option>`).join('')}</select></td>
      </tr>`).join('')}
      ${extraRows.map(x => `<tr class="mine">
        <td><input type="checkbox" data-check="${x.key}" ${checks[x.key] ? 'checked' : ''} aria-label="${esc(x.label)} 이체 완료"></td>
        <td>${esc(x.label)}</td><td class="num">${won(x.amount)}</td><td><small class="sub">추가 수입</small></td></tr>`).join('')}
      </tbody></table>
      <p class="hint">합계 ${won(ALLOC_KEYS.reduce((s, k) => s + amounts[k], 0) + extraRows.reduce((s, x) => s + x.amount, 0))} · 이번 달 ${ma.기록있음 ? '실제 입금액' : '기준 월급'} ${won(ma.실제)}</p>
      <p class="hint">완료 표시는 이 기기에만 저장되고, 매달 새로 시작해요.</p>
    </section>
    <section class="card">
      <h2>지금 실제로 빠져나가는 돈과 비교</h2>
      <table class="tbl"><tbody>
        <tr><td>고정비 자동이체</td><td class="num">${won(fixed.고정비)}</td><td class="num">계획 ${won(amounts.고정비)}</td></tr>
        <tr><td>생활비</td><td class="num">${won(fixed.생활비)}</td><td class="num">계획 ${won(amounts.생활비)}</td></tr>
        <tr><td>저축성 계좌 월 납입</td><td class="num">${won(C.savingRate(state, R).저축액)}</td><td class="num">계획 ${won(amounts.저축 + amounts.비상금 + amounts.예비비 + amounts.투자)}</td></tr>
        <tr><td>${term('예비비')} 계획 / 비정기 지출 월 적립 필요액</td><td class="num">${won(amounts.예비비)}</td><td class="num">필요 ${won(C.irregularMonthly(state).월합계)}</td></tr>
        <tr><td>자동이체 후 주계좌에 남는 돈</td><td class="num"><strong>${won(C.mainLeftover(state, R))}</strong></td><td></td></tr>
      </tbody></table>
    </section>`;
  bindMonthAdjust(root, ctx);
  root.querySelector('[data-pay-now]').onclick = () => { openPayMonth(C.monthKey()); };
  const f = root.querySelector('#alloc');
  f.프리셋.onchange = () => {
    const p = presets.find(x => x.이름 === f.프리셋.value);
    if (p) ALLOC_KEYS.forEach(k => { f[k].value = percentInput(C.n(p.비율[k])); });
  };
  f.onsubmit = async e => {
    e.preventDefault();
    const 비율 = Object.fromEntries(ALLOC_KEYS.map(k => [k, parsePercent(f[k].value) || 0]));
    const sumv = ALLOC_KEYS.reduce((s, k) => s + 비율[k], 0);
    if (Math.abs(sumv - 1) > 1e-6) { toast(`합계가 ${pct(sumv)}예요. 100%로 맞춰 주세요.`); return; }
    const p = presets.find(x => x.이름 === f.프리셋.value);
    const same = p && ALLOC_KEYS.every(k => Math.abs(C.n(p.비율[k]) - 비율[k]) < 1e-9);
    state.배분 = { 프리셋: same ? p.이름 : '직접', 비율, 계좌연결: (state.배분 || cur).계좌연결 || {} };
    await ctx.save();
    toast('저장했어요.');
    ctx.rerender();
  };
  root.querySelectorAll('[data-check]').forEach(c => {
    c.onchange = async () => {
      state.이체체크[month] = { ...(state.이체체크[month] || {}), [c.dataset.check]: c.checked };
      await ctx.save();
    };
  });
  root.querySelectorAll('[data-link]').forEach(s => {
    s.onchange = async () => {
      if (!state.배분) state.배분 = cur;
      state.배분.계좌연결 = { ...(state.배분.계좌연결 || {}), [s.dataset.link]: s.value };
      await ctx.save();
    };
  });
}

// ───────── F16 이번 달 월급 기록 ─────────
// 월급 기록 화면에서 보고 있는 달 (없으면 이번 달). 화면 안에서 다시 그릴 때만 유지하고,
// 다른 화면에서 들어오면 renderPage가 이번 달로 되돌린다 (버그 3)
let payMonth = null;
let payMonthNext = null; // 다른 화면에서 특정 달로 열 때 (openPayMonth)
export function openPayMonth(m) { payMonthNext = m; }

function monthLabel(m) { return m.replace('-', '년 ').replace(/^(\d+년 )0?/, '$1') + '월'; }
function signed(v) { return (v > 0 ? '+' : v < 0 ? '−' : '') + won(Math.abs(v)); }

// 기본 배분 비율 (저장한 비율, 없으면 첫 배분예시)
function currentRatio(state, R) {
  const presets = Array.isArray(R.배분예시) ? R.배분예시 : [];
  return (state.배분 && state.배분.비율) || (presets[0] ? presets[0].비율 : {});
}

// 더 들어온 달·덜 들어온 달 안내 (월급 기록 화면과 월급 배분 화면에서 같이 씀)
function monthAdjustHtml(ctx, month) {
  const { state, R } = ctx;
  const a = C.monthAllocation(state, R, currentRatio(state, R), month);
  if (!a.기록있음) return `<p class="hint">${monthLabel(month)} 입금액 기록이 없어 기준 월급 ${won(a.기준)}으로 계산해요.</p>`;
  if (a.추가) {
    const t = a.추가;
    const head = `<p>${monthLabel(month)}에는 기준보다 <strong class="ok">${won(t.금액)}</strong> 더 들어왔어요. 기본 배분은 기준 월급(${won(a.기준)})대로 두고, <strong>추가 수입만 따로</strong> 나누세요. 생활비를 늘리지 않는 게 목적이에요.</p>`;
    if (!t.분배) return head + `<p class="warn">${t.예시 && t.예시.비상금먼저 ? '비상금이 아직 부족하니 추가 수입 중 비상금 몫을 먼저 정하세요.' : '추가 수입을 어디로 보낼지 비율을 정하세요.'} <a href="#/비정기">상여 배분 규칙 정하기</a></p>`;
    const why = t.내규칙 ? '내가 정한 명절 상여 배분 규칙을 그대로 써요.' : `"${esc(t.예시.이름)}" 예시 비율이에요. ${esc(C.bonusReason(t.예시))}.`;
    return head + `<div class="scroll-auto"><table class="tbl"><thead><tr>${BONUS_KEYS.map(k => `<th class="num">${k}</th>`).join('')}</tr></thead><tbody><tr>${BONUS_KEYS.map(k => `<td class="num">${won(t.분배[k])}</td>`).join('')}</tr></tbody></table></div>
      <p class="hint">${why} ${!t.내규칙 && t.예시.개인출처 ? refBadge(PERSONAL_LABEL) : ''} <a href="#/비정기">비율 바꾸기</a></p>`;
  }
  const s = a.부족;
  const opt = k => `<label><input type="checkbox" data-cut="${k}" ${s.고른항목.includes(k) ? 'checked' : ''}> ${k}${s.줄임[k] ? ` <small class="sub">−${won(s.줄임[k])}</small>` : ''}</label>`;
  return `<p>${monthLabel(month)}에는 기준보다 <strong class="neg">${won(s.금액)}</strong> 덜 들어왔어요. 이번 달에 줄일 곳을 고르세요. 위에서부터 차례로 줄여요.</p>
    <div class="checks" data-month="${month}">${C.SHORTFALL_ORDER.filter(k => !C.SHORTFALL_LAST.includes(k)).map(opt).join('')}</div>
    <p class="hint">비상금·고정비는 마지막에 줄이세요. 고정비(보험료 등)는 줄이기 어렵고, 비상금은 이런 달을 위한 돈이에요.</p>
    <div class="checks" data-month="${month}">${C.SHORTFALL_LAST.map(opt).join('')}</div>
    ${s.남은부족 > 0 ? `<p class="warn">고른 항목만으로는 ${won(s.남은부족)}이 모자라요. 줄일 항목을 더 고르세요.</p>` : '<p class="ok">부족분을 모두 메웠어요 ✓</p>'}`;
}
function bindMonthAdjust(root, ctx) {
  root.querySelectorAll('[data-cut]').forEach(c => {
    c.onchange = async () => {
      const month = c.closest('[data-month]').dataset.month;
      const chosen = [...root.querySelectorAll(`[data-month="${month}"] [data-cut]:checked`)].map(x => x.dataset.cut);
      ctx.state.월급조정 = { ...(ctx.state.월급조정 || {}), [month]: chosen };
      await ctx.save();
      ctx.rerender();
    };
  });
}

function payRows(rows) {
  const list = rows && rows.length ? rows : [{}];
  return list.map((r, i) => `<div class="grid-fields pay-row" data-i="${i}">
    <label><span>항목</span><input name="내역항목__${i}" value="${esc(r.항목 || '')}" placeholder="${i === 0 ? '예: 기본급' : '예: 연장근무수당'}" list="pay-items"></label>
    <label><span>금액</span>${moneyInput('내역금액__' + i, r.금액)}</label>
  </div>`).join('');
}

function payPage(root, ctx) {
  const { state, R } = ctx;
  const month = payMonth || C.monthKey();
  const rec = C.payRecord(state, month);
  const base = C.monthlyNet(state, R);
  const trend = C.payTrend(state, R);
  const list = state.월급기록.slice().sort((a, b) => b.월.localeCompare(a.월));
  root.innerHTML = `
    <h1>이번 달 월급 기록</h1>
    <p class="hint">연장근무 등으로 달마다 실제 입금액이 다르면 여기에 적으세요. 그 달 월급 배분·이체 체크리스트·저축률이 이 금액으로 계산돼요. 기록이 없는 달은 기준 월급 <strong>${won(base)}</strong>을 써요.</p>
    <section class="card">
      <form id="pay" class="grid-fields" autocomplete="off">
        <label><span>달</span><input type="month" name="월" value="${month}" required></label>
        <label><span>실제 입금액 (통장에 들어온 금액)</span>${moneyInput('실수령', rec ? rec.실수령 : '', 'placeholder="예: 2,700,000"')}</label>
        <details class="wide" ${rec && rec.내역 && rec.내역.length ? 'open' : ''}><summary>내역 적기 (선택: 기본급·연장근무수당 등)</summary>
          <div id="pay-rows">${payRows(rec && rec.내역)}</div>
          <button type="button" class="btn small" data-add-row>+ 항목 추가</button>
          <p class="hint" id="pay-sum"></p>
        </details>
        <datalist id="pay-items">${['기본급', '연장근무수당', '야간근무수당', '휴일근무수당', '식대', '교통비', '기타 수당', '공제 조정'].map(x => `<option value="${x}">`).join('')}</datalist>
        <label class="wide"><span>메모 (선택)</span><input name="메모" value="${esc(rec ? rec.메모 || '' : '')}" placeholder="예: 연장근무 많았던 달"></label>
        <div class="actions wide"><button class="btn primary" type="submit">${rec ? '수정 저장' : '저장'}</button>${rec ? '<button class="btn ghost danger" type="button" data-del-rec>이 달 기록 지우기</button>' : ''}</div>
      </form>
    </section>
    <section class="card"><h2>${monthLabel(month)} 배분 안내</h2>${monthAdjustHtml(ctx, month)}<p><a href="#/배분">월급 배분 화면에서 이체 체크하기 →</a></p></section>
    <section class="card"><h2>기록한 달</h2>
      <p class="hint">최근 12개월 평균 ${trend.평균 === null ? '— (기록 없음)' : `<strong>${won(trend.평균)}</strong> (${trend.기록개월}개월)`} · 기준 월급 ${won(base)}</p>
      ${list.length ? `<ul class="acc-list">${list.map(r => `<li><div><strong>${monthLabel(r.월)}</strong><small>${r.메모 ? esc(r.메모) + ' · ' : ''}기준 대비 ${signed(C.n(r.실수령) - base)}</small></div>
        <div class="right"><strong>${won(r.실수령)}</strong><button class="btn small ghost" data-edit-month="${r.월}">수정</button></div></li>`).join('')}</ul>` : '<p class="hint">아직 기록이 없어요.</p>'}
    </section>`;
  const f = root.querySelector('#pay');
  bindMoneyInputs(f);
  bindMonthAdjust(root, ctx);
  const readRows = () => [...f.querySelectorAll('.pay-row')].map(r => ({
    항목: r.querySelector('[name^="내역항목"]').value.trim(), 금액: parseMoney(r.querySelector('[name^="내역금액"]').value),
  }));
  const sumHint = () => {
    const rows = readRows().filter(r => r.금액);
    const s = rows.reduce((a, r) => a + r.금액, 0);
    const total = parseMoney(f.실수령.value);
    f.querySelector('#pay-sum').textContent = rows.length ? `내역 합계 ${won(s)}${total && total !== s ? ` · 입금액과 ${won(Math.abs(total - s))} 차이 (입금액을 비워 두면 내역 합계로 저장해요)` : ''}` : '';
  };
  f.addEventListener('input', sumHint);
  sumHint();
  f.querySelector('[data-add-row]').onclick = () => {
    const rows = [...readRows(), {}];
    f.querySelector('#pay-rows').innerHTML = payRows(rows);
    bindMoneyInputs(f);
  };
  // 다른 달을 고르면 그 달 기록을 불러온다
  f.월.onchange = () => { if (f.월.value) { payMonth = f.월.value; ctx.rerender(); } };
  f.onsubmit = async e => {
    e.preventDefault();
    const m = f.월.value;
    if (!/^\d{4}-\d{2}$/.test(m)) { toast('달을 골라 주세요.'); return; }
    const 내역 = readRows().filter(r => r.항목 || r.금액);
    let 실수령 = parseMoney(f.실수령.value);
    if (!실수령 && 내역.length) 실수령 = 내역.reduce((a, r) => a + r.금액, 0);
    if (!(실수령 > 0)) { toast('실제 입금액을 적어 주세요.'); return; }
    // 입금액과 내역 합계가 다르면 내역 칸을 펼쳐 차이를 보여 주고 한 번 묻는다 (버그 4)
    const 내역합 = 내역.reduce((a, r) => a + r.금액, 0);
    if (내역합 > 0 && 내역합 !== 실수령) {
      f.querySelector('details').open = true;
      sumHint();
      if (!confirm(`입금액 ${won(실수령)}과 내역 합계 ${won(내역합)}이 ${won(Math.abs(실수령 - 내역합))} 차이 나요.
이대로 저장할까요? (계산에는 입금액만 써요)

취소를 누르면 내역을 고칠 수 있어요.`)) return;
    }
    const entry = { 월: m, 실수령, 내역, 메모: f.메모.value.trim() };
    state.월급기록 = [...state.월급기록.filter(r => r.월 !== m), entry].sort((a, b) => a.월.localeCompare(b.월));
    payMonth = m;
    await ctx.save();
    toast(`${monthLabel(m)} 월급을 저장했어요.`);
    ctx.rerender();
  };
  const del = root.querySelector('[data-del-rec]');
  if (del) del.onclick = async () => {
    if (!confirm(`${monthLabel(month)} 월급 기록을 지울까요? 기준 월급으로 계산돼요.`)) return;
    state.월급기록 = state.월급기록.filter(r => r.월 !== month);
    await ctx.save();
    ctx.rerender();
  };
  root.querySelectorAll('[data-edit-month]').forEach(b => { b.onclick = () => { payMonth = b.dataset.editMonth; ctx.rerender(); }; });
}

// ───────── F4 생활비 관리 ─────────
function living(root, ctx) {
  const { state } = ctx;
  const month = C.monthKey();
  const cats = [...new Set([...(((state.프로필 || {}).생활비 || {}).포함항목 || []), ...DEFAULT_CATEGORIES])];
  const list = state.생활비.지출.filter(x => (x.날짜 || '').startsWith(month)).sort((a, b) => b.날짜.localeCompare(a.날짜));
  const spent = list.reduce((s, x) => s + C.n(x.금액), 0);
  const budget = C.n(state.생활비.월예산);
  const byCat = {};
  list.forEach(x => { byCat[x.카테고리] = (byCat[x.카테고리] || 0) + C.n(x.금액); });
  const today = C.ymd(new Date());
  root.innerHTML = `
    <h1>생활비 관리</h1>
    <section class="card">
      <h2>${month.replace('-', '년 ')}월 예산</h2>
      <form id="budget" class="inline"><label><span>월 예산</span>${moneyInput('예산', budget)}</label><button class="btn" type="submit">예산 저장</button></form>
      <div class="stats small">
        <div class="stat"><span>쓴 돈</span><strong>${won(spent)}</strong></div>
        <div class="stat"><span>남은 예산</span><strong class="${budget - spent < 0 ? 'neg' : ''}">${won(budget - spent)}</strong></div>
      </div>
      ${budget ? bar(spent / budget) : ''}
    </section>
    <section class="card">
      <h2>지출 기록</h2>
      <form id="exp" class="grid-fields">
        <label><span>날짜</span><input type="date" name="날짜" value="${today}" required></label>
        <label><span>분류</span><select name="카테고리">${cats.map(c => `<option>${esc(c)}</option>`).join('')}</select></label>
        <label><span>금액</span>${moneyInput('금액', 0)}</label>
        <label><span>메모</span><input name="메모" placeholder="예: 점심"></label>
        <div class="actions wide"><button class="btn primary" type="submit">기록</button></div>
      </form>
    </section>
    <div class="two">
      <section class="card"><h2>분류별 합계</h2>${Object.keys(byCat).length ? `<table class="tbl"><tbody>${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${won(v)}</td></tr>`).join('')}</tbody></table>` : '<p class="hint">이번 달 기록이 없어요.</p>'}</section>
      <section class="card"><h2>이번 달 내역</h2>${list.length ? `<ul class="acc-list">${list.map(x => `<li><div><strong>${esc(x.카테고리)}</strong><small>${esc(x.날짜)} ${esc(x.메모 || '')}</small></div><div class="right"><strong>${won(x.금액)}</strong><button class="btn small ghost danger" data-del="${x.id}">삭제</button></div></li>`).join('')}</ul>` : '<p class="hint">아직 없어요.</p>'}</section>
    </div>`;
  bindMoneyInputs(root);
  root.querySelector('#budget').onsubmit = async e => { e.preventDefault(); state.생활비.월예산 = parseMoney(e.target.예산.value); await ctx.save(); ctx.rerender(); };
  root.querySelector('#exp').onsubmit = async e => {
    e.preventDefault();
    const f = e.target;
    const amt = parseMoney(f.금액.value);
    if (!amt) { toast('금액을 적어 주세요.'); return; }
    state.생활비.지출.push({ id: newId(), 날짜: f.날짜.value, 카테고리: f.카테고리.value, 금액: amt, 메모: f.메모.value.trim() });
    await ctx.save();
    toast('기록했어요.');
    ctx.rerender();
  };
  root.querySelectorAll('[data-del]').forEach(b => {
    b.onclick = async () => { state.생활비.지출 = state.생활비.지출.filter(x => x.id !== b.dataset.del); await ctx.save(); ctx.rerender(); };
  });
}

// ───────── F5 저축 상품 계산기 ─────────
function savings(root, ctx) {
  const { state, R } = ctx;
  const hs = state.계좌.filter(a => a.종류 === '청약');
  const sv = state.계좌.filter(a => a.종류 === '적금');
  const rule = (R.상품 || {}).청년미래적금 || {};
  root.innerHTML = `
    <h1>저축 상품 계산기</h1>
    <p class="hint">금리·한도·${term('정부 기여금')} 비율은 규칙 기준일(${esc(ctx.info.기준일)}) 값이에요. 가입 전 은행에서 최신 조건을 확인하세요.</p>
    ${hs.map(a => {
      const h = C.housing(a, state, R);
      return `<section class="card"><h2>${esc(a.별명)} <small class="sub">주택청약 · ${esc(a.은행)}</small></h2>
        <table class="tbl"><tbody>
          <tr><td>월 납입액</td><td class="num">${won(h.월납입)}</td></tr>
          <tr><td>월 ${term('납입 인정 한도')}</td><td class="num">${won(h.인정한도)}</td></tr>
          <tr><td>납입 회차(가입일 기준 추정)</td><td class="num">${h.회차}회</td></tr>
          <tr><td>인정 납입금액(추정)</td><td class="num">${won(h.추정인정총액)}</td></tr>
          <tr><td>기본 금리 / 현재 잔액 기준 1년 이자(추정)</td><td class="num">${pct(h.기본금리, 2)} / ${won(h.연이자예상)}</td></tr>
          <tr><td>${term('소득공제')} 대상</td><td class="num">${h.공제대상 ? '해당' : '해당 안 됨 또는 확인 필요'}</td></tr>
          <tr><td>지금 납입액 기준 공제 가능액(연)</td><td class="num">${won(h.공제가능액)}</td></tr>
          <tr><td>인정 한도로 넣을 때 공제 가능액(연)</td><td class="num">${won(h.한도기준공제액)}</td></tr>
        </tbody></table>
        <p class="hint">소득공제는 ${term('무주택 세대주')}(현재 답: ${esc(h.무주택)})이고 총급여 ${won(h.총급여조건)} 이하일 때 연 납입액 중 최대 ${won(h.연공제한도)}의 ${pct(h.공제율)}를 소득에서 빼주는 제도예요. 세금이 그만큼 줄어드는 것은 아니에요.</p>
      </section>`;
    }).join('')}
    ${sv.map(a => {
      const m = C.savingsMaturity(a, R);
      return `<section class="card"><h2>${esc(a.별명)} <small class="sub">${m.청년미래적금 ? '청년미래적금' : '적금'} · ${esc(a.은행)}</small></h2>
        ${m.총개월 ? `<table class="tbl"><tbody>
          <tr><td>월 납입 / 기간</td><td class="num">${won(a.월납입)} / ${m.총개월}개월</td></tr>
          <tr><td>납입 개월(추정) · 만기까지</td><td class="num">${m.납입개월}개월 · ${m.남은개월 ?? '-'}개월 남음 (${esc(m.만기일)})</td></tr>
          <tr><td>원금 합계</td><td class="num">${won(m.원금)}</td></tr>
          ${m.청년미래적금 ? `<tr><td>${term('정부 기여금')} (${a.기여유형 || '일반'} ${pct(m.기여율)})</td><td class="num">${won(m.기여금)}</td></tr>` : ''}
          <tr><td>이자(${term('단리')}, ${m.금리 === null ? '금리 확인 필요' : `${pct(m.금리, 2)} · ${m.금리출처}`})${m.비과세 ? ` · ${term('비과세')}` : ' · 세전'}</td><td class="num">${m.이자 === null ? '금리를 몰라 빼고 계산했어요' : won(m.이자)}</td></tr>
          <tr class="sum"><td>만기 예상 금액${m.이자 === null ? ' <strong class="warn">이자 제외 금액(금리 확인 필요)</strong>' : ''}</td><td class="num">${won(m.예상합계)}</td></tr>
        </tbody></table>
        ${m.한도초과 ? `<p class="warn">월 납입 한도(${won(rule.월납입한도)})를 넘었어요. 정부 기여금은 한도까지만 계산했어요.</p>` : ''}`
        : '<p class="hint">가입일과 만기일(또는 청년미래적금 기간)을 계좌 화면에서 넣으면 계산돼요.</p>'}
        <p class="hint">${term('중도해지')}하면 정부 기여금·이자를 다 못 받을 수 있어요.</p>
      </section>`;
    }).join('')}
    ${!hs.length && !sv.length ? empty('청약·적금 계좌가 없어요.', '#/계좌', '계좌 추가') : ''}`;
}

// ───────── F6 비상금 목표 ─────────
function emergencyPage(root, ctx) {
  const { state, R } = ctx;
  const e = C.emergency(state, R);
  const fixed = C.monthlyFixed(state);
  root.innerHTML = `
    <h1>${term('비상금')} 목표</h1>
    <section class="card">
      <p>월 고정지출 <strong>${won(e.월고정지출)}</strong> <small class="sub">(고정비 ${won(fixed.고정비)} + 생활비 ${won(fixed.생활비)} + 대출 상환 ${won(fixed.대출상환)})</small></p>
      <div class="stats small">
        <div class="stat"><span>현재 비상금</span><strong>${won(e.현재)}</strong></div>
        <div class="stat"><span>최소 목표 (${e.최소개월}개월)</span><strong>${won(e.최소목표)}</strong></div>
        <div class="stat"><span>권장 목표 (${e.권장개월}개월)</span><strong>${won(e.권장목표)}</strong></div>
      </div>
      ${bar(e.진행률)}
      <p>권장 목표의 <strong>${pct(e.진행률)}</strong>를 모았어요.</p>
      ${e.월적립제안 ? `<p>매달 <strong>${won(e.월적립제안)}</strong>씩 모으면 약 <strong>${e.남은개월}개월</strong> 뒤 권장 목표에 닿아요. <small class="sub">("${esc(e.예시이름)}"의 비상금 비율 ${pct(e.제안비율)} 기준)</small></p>` : ''}
      <p class="hint">비상금은 종류가 "비상금"인 계좌 잔액만 더해요. ${state.계좌.some(a => a.종류 === '비상금') ? '' : '<a href="#/계좌">비상금 계좌 만들기</a> · '}보관 장소는 <a href="#/가이드">통장 추천 가이드</a>를 보세요.</p>
    </section>`;
}

// ───────── F8 추천 ─────────
function recommendPage(root, ctx) {
  const recs = recommendations(ctx.state, ctx.R);
  root.innerHTML = `
    <h1>내 맞춤 진단·추천</h1>
    <p class="hint">입력한 정보를 규칙에 넣어 해당하는 것만 우선순위대로 보여줘요. 기준 수치는 금융 규칙(기준일 ${esc(ctx.info.기준일)})에서 읽어요.</p>
    ${recs.length ? `<ol class="todo big">${recs.map(r => `<li><a href="${r.링크}"><strong>${esc(r.제목)} <small class="sub">규칙 ${r.규칙}</small></strong><span>${esc(r.내용)}</span>${refBadge(r.표시)}${r.근거 ? `<small class="hint">${esc(r.근거)}</small>` : ''}</a></li>`).join('')}</ol>` : empty('지금은 해당하는 할 일이 없어요.')}
    <p class="disclaimer">이 앱은 일반적인 금융 지식과 계산 도구를 제공할 뿐, 특정 주식·펀드·ETF를 사라거나 팔라고 추천하지 않아요. 상품 가입 전에는 금융기관에서 최신 조건을 확인하세요.</p>`;
}

// ───────── F9 통장 추천 가이드 ─────────
const GUIDE = [
  { 종류: '입출금', 이름: '주계좌', 역할: '월급이 들어오고 고정비 자동이체가 나가요.', 유형: '이미 쓰는 급여 통장', 기준: ['수수료 면제 조건', '급여이체 우대'] },
  { 종류: '입출금', 이름: '생활비 계좌', 역할: '매달 정해진 생활비만 받아서 써요.', 유형: '체크카드 연결 입출금 통장', 기준: ['체크카드 혜택', '잔액 알림'] },
  { 종류: '비상금', 이름: '비상금 통장', 역할: '급할 때 바로 꺼내는 돈', 유형: '파킹통장 또는 CMA (언제든 출금 + 이자)', 기준: ['금리', '금리 적용 한도', '우대조건', '출금 제한', '예금자보호 여부'] },
  { 종류: '예비비', 이름: '예비비 통장', 역할: '차량 수리 등 가끔 크게 나가는 돈을 매달 모아요.', 유형: '파킹통장 (비상금과 따로)', 기준: ['금리', '금리 적용 한도', '출금 제한'] },
  { 종류: '저축', 이름: '저축', 역할: '청약 · 적금으로 목돈 만들기', 유형: '주택청약종합저축, 적금·예금', 기준: ['금리', '정부 기여금', '비과세', '중도해지 조건'] },
  { 종류: '투자', 이름: '투자', 역할: '비상금을 채운 뒤 오래 둘 돈', 유형: '절세 계좌(ISA·연금저축) 안에서 적립식', 기준: ['세금 혜택', '인출 제약', '원금 손실 가능성'] },
];
function guide(root, ctx) {
  const { state, R } = ctx;
  const has = t => t === '저축' ? state.계좌.some(a => a.종류 === '적금' || a.종류 === '청약') : state.계좌.some(a => a.종류 === t);
  // 비교표 강조: 이미 쓰는 은행 + 쓰는 금융 앱의 은행(토스 → 토스뱅크). 정렬 순서는 바꾸지 않는다(특정 상품을 밀지 않음)
  const appBank = state.프로필.금융앱 === '토스' ? '토스뱅크' : '';
  const banks = [...new Set([...state.계좌.map(a => a.은행).filter(b => b && b !== '확인 필요'), ...(appBank ? [appBank] : [])])];
  const isNum = v => typeof v === 'number' && Number.isFinite(v);
  const ex = (R.상품예시 || []).slice().sort((a, b) => (isNum(b.금리) ? b.금리 : -1) - (isNum(a.금리) ? a.금리 : -1));
  root.innerHTML = `
    <h1>통장 추천 가이드</h1>
    <section class="card">
      <h2>추천 통장 구조</h2>
      <div class="flow">
        <div class="flow-src">월급 → <strong>${esc((state.프로필.주계좌 || {}).별명 || '주계좌')}</strong>${(state.프로필.주계좌 || {}).은행 ? ` · ${esc(state.프로필.주계좌.은행)}` : ''}</div>
        <ul>${GUIDE.slice(1).map(g => `<li class="${has(g.종류) ? 'have' : 'new'}"><strong>${g.이름}</strong> <span>${g.역할}</span> ${has(g.종류) ? '<em class="badge ok">있음</em>' : '<em class="badge new">신규 권장</em>'}</li>`).join('')}
        <li class="have"><strong>고정비 자동이체</strong> <span>보험료 등</span></li></ul>
      </div>
      <p class="hint">투자는 <a href="#/비상금">비상금</a>을 채운 뒤에 시작하는 순서를 권장해요.</p>
    </section>
    <section class="card">
      <h2>통장별 맞는 유형과 고르는 기준</h2>
      <table class="tbl"><thead><tr><th>통장</th><th>맞는 유형</th><th>고르는 기준</th></tr></thead><tbody>
      ${GUIDE.map(g => `<tr><td>${g.이름}</td><td>${g.이름 === '비상금 통장' ? `${term('파킹통장')} 또는 ${term('CMA')}` : g.이름 === '투자' ? `절세 계좌(${term('ISA')}·${term('연금저축')}) 안에서 ${term('적립식')}` : esc(g.유형)}</td><td>${g.기준.map(k => ['금리 적용 한도', '예금자보호', '우대조건', '정부 기여금', '비과세', '중도해지'].some(w => k.startsWith(w)) ? term(k.replace(' 조건', '').replace(' 여부', '').replace('우대조건', '우대금리'), k) : esc(k)).join(', ')}</td></tr>`).join('')}
      </tbody></table>
    </section>
    <section class="card">
      <h2>원금이 보장되는 상품 예시 비교 <small class="sub">기준일 ${esc(ctx.info.기준일)}</small></h2>
      ${banks.length > (appBank ? 1 : 0) ? `<p class="hint">이미 쓰는 은행(${esc(banks.filter(b => b !== appBank || state.계좌.some(a => a.은행 === b)).join('·'))})은 <mark>표시</mark>했어요.</p>` : ''}
      ${appBank ? `<p class="hint">${esc(state.프로필.금융앱)} 앱을 쓰고 계셔서 ${esc(appBank)} 상품도 <mark>표시</mark>했어요. 다른 상품과 같은 비교 후보 중 하나예요. 금리·한도·출금 조건을 보고 나에게 맞는 곳을 고르세요.</p>` : ''}
      <div class="scroll-x"><table class="tbl"><thead><tr><th>유형</th><th>기관</th><th>상품명</th><th class="num">금리</th><th class="num">${term('금리 적용 한도')}</th><th>우대조건</th><th>${term('예금자보호')}</th><th>확인일·출처</th></tr></thead><tbody>
      ${ex.map(p => `<tr class="${banks.some(b => String(p.기관 || '').includes(b)) ? 'mine' : ''}"><td>${esc(p.유형)}</td><td>${esc(p.기관)}</td><td>${esc(p.상품명)}</td><td class="num">${isNum(p.금리) ? pct(p.금리, 2) : '확인 필요'}</td><td class="num">${isNum(p.금리적용한도) && p.금리적용한도 > 0 ? won(p.금리적용한도) : '우대조건 참고'}</td><td>${esc(p.우대조건)}</td><td>${p.예금자보호 === true ? '보호' : p.예금자보호 === false ? '보호 안 됨' : '확인 필요'}</td><td><small>${esc(p.확인일)}<br>${esc(p.출처)}</small></td></tr>`).join('')}
      </tbody></table></div>
      <p class="disclaimer">가입 전 은행에서 최신 조건을 확인하세요. 금리와 조건은 자주 바뀌어요. ${ctx.info.임시값사용 ? '<strong>지금 표는 임시값이 들어 있어 실제 상품이 아닐 수 있어요.</strong>' : ''}</p>
    </section>
    <section class="card">
      <h2>투자 상품은 이렇게만 안내해요</h2>
      <p>이 앱은 특정 주식·펀드·${term('ETF')} 종목을 추천하거나 수익률을 예측하지 않아요. ${term('분산투자')}, ${term('적립식')} 같은 종류별 특징·위험·고르는 기준만 알려드려요. 투자 상품은 원금이 줄어들 수 있어요.</p>
    </section>`;
}

// ───────── F10 비정기 수입·지출 ─────────
function irregular(root, ctx) {
  const { state, R } = ctx;
  const p = state.프로필;
  const bonus = (p.상여 || []).filter(b => C.n(b.금액) > 0);
  const rule = state.상여배분 || null;
  const sug = C.bonusSuggestion(state, R);
  const shown = rule || sug.예시 || {};
  const examples = (Array.isArray(R.상여배분예시) ? R.상여배분예시 : []).filter(x => x && x.비율);
  const ir = C.irregularMonthly(state);
  const hasReserve = state.계좌.some(a => a.종류 === '예비비');
  root.innerHTML = `
    <h1>비정기 수입·지출</h1>
    <section class="card">
      <h2>${term('명절 상여')} 배분 규칙</h2>
      ${bonus.length ? `<ul class="acc-list">${bonus.map(b => `<li><div><strong>${esc(b.이름 || '상여')}</strong><small>${b.월 ? `${b.월}월` : '받는 달 미입력'}</small></div><div class="right"><strong>${won(b.금액)}</strong></div></li>`).join('')}</ul>` : '<p class="hint">등록된 상여가 없어요. <a href="#/내정보">내 정보</a>에서 추가하세요.</p>'}
      <p>${rule ? '정해둔 비율이에요.'
        : sug.예시 ? `아직 규칙이 없어요. 아래는 "${esc(sug.이름)}" 예시 비율이에요. ${refBadge(sug.개인출처 ? PERSONAL_LABEL : '')}`
        : sug.비상금먼저 ? '아직 규칙이 없어요. 비상금이 최소 목표보다 적으니 <strong>비상금 몫을 먼저 정하세요.</strong>'
        : '아직 규칙이 없어요. 비율을 직접 정해 주세요.'}</p>
      ${!rule && sug.예시 ? `<p class="hint">${esc(C.bonusReason(sug))}. (비상금 최소 목표 ${won(C.emergency(state, R).최소목표)}${sug.예비비필요 ? ` · 예비비 월 필요액 ${won(C.reserveNeeded(state).월필요액)}, 지금 월 적립 ${won(C.reserveNeeded(state).월적립)}` : ''})</p>
        ${sug.주의.length ? `<p class="disclaimer">출처 주의: ${esc(sug.주의.join(' · '))}</p>` : ''}
        ${sug.출처 ? `<details><summary>출처 전체 보기</summary><p class="hint">${esc([].concat(sug.출처).join(', '))}</p></details>` : ''}` : ''}
      <form id="bonus" class="grid-fields">
        ${BONUS_KEYS.map(k => `<label><span>${k} (%)</span><input name="${k}" inputmode="decimal" value="${esc(percentInput(C.n(shown[k])))}"></label>`).join('')}
        <div class="actions wide"><button class="btn primary" type="submit">이 규칙으로 정하기</button>${rule ? '<button class="btn ghost" type="button" data-clear>규칙 지우기</button>' : ''}</div>
      </form>
      ${bonus.length ? `<div class="scroll-auto"><table class="tbl"><thead><tr><th>상여</th>${BONUS_KEYS.map(k => `<th class="num">${k}</th>`).join('')}</tr></thead><tbody>
        ${bonus.map(b => `<tr><td>${esc(b.이름 || '상여')}</td>${BONUS_KEYS.map(k => `<td class="num">${won(C.n(b.금액) * C.n(shown[k]))}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div>` : ''}
      ${examples.length ? `<h3>상여 배분 예시 비교</h3>
      <table class="tbl stack"><thead><tr><th>예시</th><th>쓰는 경우</th>${BONUS_KEYS.map(k => `<th class="num">${k}</th>`).join('')}<th>근거</th></tr></thead><tbody>
        ${examples.map(x => `<tr class="${sug.예시 && x.이름 === sug.이름 ? 'mine' : ''}"><td class="title">${esc(x.이름)}${sug.예시 && x.이름 === sug.이름 ? ' <small class="sub">(지금 추천)</small>' : ''}</td>
          <td data-label="쓰는 경우">${esc(COND_TEXT[x.적용조건] || x.적용조건 || '-')}</td>
          ${BONUS_KEYS.map(k => `<td class="num" data-label="${k}">${pct(C.n((x.비율 || {})[k]))}</td>`).join('')}
          <td data-label="근거">${x.근거수준 === '개인' ? refBadge(PERSONAL_LABEL) : esc(LEVEL_TEXT[x.근거수준] || x.근거수준 || '-')}${C.cautionOf(x.출처).length ? `<br><small class="hint">${esc(C.cautionOf(x.출처).join(' · '))}</small>` : ''}</td></tr>`).join('')}
      </tbody></table>
      <p class="hint">예시는 참고용이에요. 비율은 내 상황에 맞게 직접 고칠 수 있어요.</p>` : ''}
    </section>
    <section class="card">
      <h2>비정기 지출 → 월 ${term('예비비')} 적립액</h2>
      <form id="irr">
        <div class="irr-rows">${(ir.목록.length ? ir.목록 : [{}]).map((x, i) => `<div class="grid-fields irr-row" data-i="${i}">
          <label><span>항목</span><input name="항목" value="${esc(x.항목 || '')}" placeholder="예: 경조사비"></label>
          <label><span>1년 예상 금액</span>${moneyInput('연간금액', x.연간금액)}</label>
          <label><span>쓰는 계좌</span><input name="계좌" value="${esc(x.계좌 || '')}" placeholder="예: 주계좌"></label>
          <p class="calc">월 ${won(x.월적립 || 0)}</p></div>`).join('')}</div>
        <div class="actions"><button type="button" class="btn small" data-add>+ 항목 추가</button><button class="btn primary" type="submit">저장</button></div>
      </form>
      <p>연간 합계 <strong>${won(ir.연간합계)}</strong> → 매달 <strong>${won(ir.월합계)}</strong>씩 예비비로 떼어두세요.</p>
      ${!hasReserve && ir.월합계 ? '<button class="btn" data-make>예비비 계좌 만들기 (월 납입액 자동 입력)</button>' : ''}
    </section>`;
  bindMoneyInputs(root);
  const bf = root.querySelector('#bonus');
  bf.onsubmit = async e => {
    e.preventDefault();
    const v = Object.fromEntries(BONUS_KEYS.map(k => [k, parsePercent(bf[k].value) || 0]));
    const s = BONUS_KEYS.reduce((a, k) => a + v[k], 0);
    if (Math.abs(s - 1) > 1e-6) { toast(`합계가 ${pct(s)}예요. 100%로 맞춰 주세요.`); return; }
    state.상여배분 = v;
    await ctx.save(); toast('명절 상여 규칙을 정했어요.'); ctx.rerender();
  };
  const clr = root.querySelector('[data-clear]');
  if (clr) clr.onclick = async () => { state.상여배분 = null; await ctx.save(); ctx.rerender(); };
  const irf = root.querySelector('#irr');
  const read = () => [...irf.querySelectorAll('.irr-row')].map(r => ({ 항목: r.querySelector('[name="항목"]').value.trim(), 연간금액: parseMoney(r.querySelector('[name="연간금액"]').value), 계좌: r.querySelector('[name="계좌"]').value.trim() }));
  irf.querySelector('[data-add]').onclick = () => {
    p.비정기지출 = [...read(), { 항목: '', 연간금액: 0, 계좌: '' }];
    ctx.rerender();
  };
  irf.onsubmit = async e => {
    e.preventDefault();
    p.비정기지출 = read().filter(x => x.항목 || x.연간금액);
    await ctx.save(); toast('저장했어요.'); ctx.rerender();
  };
  const mk = root.querySelector('[data-make]');
  if (mk) mk.onclick = async () => {
    state.계좌.push({ id: newId(), 별명: '예비비 통장', 은행: '', 종류: '예비비', 잔액: 0, 월납입: ir.월합계, 가입일: '', 만기일: '', 금리: null, 상품: '', 기여유형: '일반', 메모: '비정기 지출 대비' });
    await ctx.save(); toast('예비비 통장을 만들었어요. 은행에서 실제 통장도 만들어 주세요.'); ctx.rerender();
  };
}

// ───────── F11 용어 도우미 ─────────
function terms(root, ctx) {
  const list = (ctx.R.용어 || []).slice().sort((a, b) => String(a.단어).localeCompare(String(b.단어), 'ko'));
  root.innerHTML = `
    <h1>용어 도우미</h1>
    <p class="hint">화면 곳곳의 ⓘ 버튼을 눌러도 같은 설명이 나와요.</p>
    <input type="search" id="q" placeholder="단어 찾기 (예: CMA)" aria-label="용어 찾기">
    <dl class="terms">${list.map(t => `<div data-w="${esc(t.단어)}"><dt>${esc(t.단어)}</dt><dd>${esc(t.설명)}</dd></div>`).join('')}</dl>`;
  root.querySelector('#q').oninput = e => {
    const q = e.target.value.trim().toLowerCase();
    root.querySelectorAll('.terms > div').forEach(d => { d.hidden = q && !d.textContent.toLowerCase().includes(q); });
  };
}

// ───────── 내 정보 ─────────
function profile(root, ctx) {
  const { state, R } = ctx;
  const p = state.프로필;
  const np = C.n(p.연봉) ? C.netPay(p.연봉, R) : null;
  const row = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`;
  const list = (arr, f) => (arr && arr.length ? arr.map(f).join('<br>') : '<span class="hint">없음</span>');
  root.innerHTML = `
    <div class="page-head"><h1>내 정보</h1><button class="btn primary" data-redo>질문 다시 하기(수정)</button></div>
    <section class="card"><h2>월 실수령액</h2>
      ${np ? `<table class="tbl"><tbody>
        ${row('연봉(세전)', won(p.연봉) + ` <small class="sub">(${manwon(p.연봉)})</small>`)}
        ${row('월 세전', won(np.세전))}
        ${row(`${term('4대보험')} 합계`, `${won(np.보험.합계)} <small class="sub">국민연금 ${won(np.보험.국민연금)} · 건강 ${won(np.보험.건강보험)} · 장기요양 ${won(np.보험.장기요양)} · 고용 ${won(np.보험.고용보험)}</small>`)}
        ${row('소득세·지방소득세(근사)', won(np.세금))}
        ${row('자동 계산 월 실수령액', `<strong>${won(np.실수령)}</strong>`)}
        ${C.n(p.월실수령직접) ? row('직접 입력한 월 실수령액 (이 값을 사용)', `<strong>${won(p.월실수령직접)}</strong>`) : ''}
      </tbody></table>
      <p class="hint">소득세는 규칙 JSON의 검산값(연봉 ${won((R.실수령계산.검산 || {}).연봉)} → ${won((R.실수령계산.검산 || {}).월실수령)})에서 역산한 비율로 근사해요. 실제 월급명세서 금액이 있으면 그 값을 직접 입력하세요.</p>`
      : '<p class="hint">연봉이 입력되지 않았어요.</p>'}
    </section>
    <section class="card"><h2>답한 내용</h2><table class="tbl"><tbody>
      ${row('명절 상여', list(p.상여, b => `${esc(b.이름 || '상여')} ${won(b.금액)} ${b.월 ? b.월 + '월' : ''}`))}
      ${row('주계좌', p.주계좌 ? `${esc(p.주계좌.은행 || '')} / ${esc(p.주계좌.별명 || '')}` : '<span class="hint">없음</span>')}
      ${row('계좌를 한 번에 보는 앱', esc(p.금융앱 || '-'))}
      ${row('자동이체', list(p.자동이체, t => `${esc(t.항목)} ${won(t.금액)}${t.날짜 ? ` · ${t.날짜}일` : ''} → ${esc(t.받는계좌 || '')} <small class="sub">(${C.classifyTransfer(state, t)})</small>`))}
      ${row('생활비 계좌', p.생활비 ? `${esc(p.생활비.계좌 || '')} · ${esc((p.생활비.포함항목 || []).join(', '))}` : '<span class="hint">없음</span>')}
      ${row('비정기 지출', list(p.비정기지출, x => `${esc(x.항목)} 연 ${won(x.연간금액)} (${esc(x.계좌 || '')})`))}
      ${row('저축·적금', list(p.저축, s => `${esc(s.종류)} ${esc(s.이름 || '')} ${esc(s.은행 || '')} 월 ${won(s.월납입)}`))}
      ${row('빚', list(p.부채, d => `${esc(d.이름)} ${won(d.잔액)} · 금리 ${d.금리 === null || d.금리 === undefined ? '미입력' : pct(d.금리, 2)} · 월 ${won(d.월상환)}`))}
      ${row(term('무주택 세대주'), esc(p.무주택세대주 || '모름'))}
      ${row('5년 안 목표', list(p.목표, g => `${esc(g.이름)} ${won(g.금액)} ${esc(g.시기 || '')}`))}
      ${row('투자 경험 / 원금 손실', `${esc(p.투자경험 || '-')} / ${esc(p.위험감수 || '-')}`)}
    </tbody></table></section>`;
  root.querySelector('[data-redo]').onclick = () => {
    ctx.state.온보딩임시 = { ...JSON.parse(JSON.stringify(p)), _단계: 0 };
    ctx.go('#/온보딩');
  };
}

// ───────── 설정 (F7 백업/복원 포함) ─────────
function settings(root, ctx) {
  const { state, info } = ctx;
  root.innerHTML = `
    <h1>설정</h1>
    <section class="card"><h2>금융 규칙 정보</h2>
      <table class="tbl"><tbody>
        <tr><td>규칙 기준일</td><td>${esc(info.기준일)}</td></tr>
        <tr><td>읽은 파일</td><td>${esc(info.사용파일)}</td></tr>
        <tr><td>임시값 사용</td><td>${info.임시값사용 ? `<strong class="warn">임시값 사용 중</strong> — ${info.임시항목[0] === '전체' ? '조사 결과 파일(금융규칙.json)이 없어 전부 임시값이에요.' : `다음 항목이 임시값이에요: ${esc(info.임시항목.join(', '))}`}` : '아니요 (조사 결과 값 사용)'}</td></tr>
      </tbody></table>
    </section>
    <section class="card"><h2>화면</h2>
      <label><span>테마</span><select id="theme">${['자동', '밝게', '어둡게'].map(t => `<option ${state.설정.테마 === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    </section>
    <section class="card"><h2>백업·복원</h2>
      <p class="hint">데이터는 이 기기에만 저장돼요. 컴퓨터 ↔ 휴대폰으로 옮길 때 백업 파일을 내보내고, 다른 기기에서 가져오세요.</p>
      <div class="actions">
        <button class="btn primary" data-export>백업 내보내기</button>
        <label class="btn">백업 가져오기<input type="file" accept="application/json,.json" data-import hidden></label>
      </div>
    </section>
    <section class="card"><h2>QR로 기기 간 옮기기</h2>
      <p class="hint">파일 없이 옮겨요. 보내는 기기 화면의 QR을 받는 기기 카메라로 찍으면 전체 데이터가 옮겨져요. 인터넷·서버를 거치지 않아요.</p>
      <div class="actions">
        <button class="btn" data-qr="send">QR로 보내기</button>
        <button class="btn" data-qr="receive">QR로 받기</button>
      </div>
    </section>
    <section class="card"><h2>예시 데이터</h2>
      <p class="hint">가상의 예시 사용자 정보(연봉 3,600만원 등)로 바꿔 둘러볼 수 있어요. 지금 데이터는 지워지니 먼저 백업하세요.</p>
      <button class="btn" data-sample>예시 데이터 불러오기</button>
    </section>
    <section class="card danger-zone"><h2>전체 초기화</h2>
      <p class="hint">이 기기의 모든 데이터를 지우고 처음 질문부터 시작해요. 되돌릴 수 없어요.</p>
      <button class="btn danger" data-reset>전체 초기화</button>
    </section>`;
  root.querySelector('#theme').onchange = async e => { state.설정.테마 = e.target.value; ctx.applyTheme(); await ctx.save(); };
  root.querySelector('[data-export]').onclick = () => {
    const blob = new Blob([JSON.stringify(makeBackup(state), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `자산관리_백업_${C.ymd(new Date())}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('백업 파일을 내보냈어요.');
  };
  root.querySelector('[data-import]').onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const next = parseBackup(JSON.parse(await file.text()));
      if (!confirm('지금 데이터를 백업 파일 내용으로 바꿀까요?')) return;
      await ctx.replace(next);
      toast('백업을 가져왔어요.');
      ctx.go('#/대시보드');
    } catch (err) {
      modal('가져오기 실패', `<p>${esc(err.message || '파일을 읽지 못했어요.')}</p>`);
    } finally { e.target.value = ''; }
  };
  root.querySelectorAll('[data-qr]').forEach(b => { b.onclick = () => { openTransfer(b.dataset.qr); ctx.go('#/옮기기'); }; });
  root.querySelector('[data-sample]').onclick = () => { if (confirm('지금 데이터를 예시 데이터로 바꿀까요?')) ctx.loadSample(); };
  root.querySelector('[data-reset]').onclick = async () => {
    if (!confirm('모든 데이터를 지울까요? 되돌릴 수 없어요.')) return;
    await clearState();
    await ctx.replace(emptyState());
    ctx.go('#/온보딩');
  };
}

function onboarding(root, ctx) {
  renderOnboarding(root, ctx, { first: !ctx.state.프로필.온보딩완료 });
}

export const PAGES = {
  대시보드: { title: '대시보드', icon: '🏠', render: dashboard },
  추천: { title: '지금 할 일', icon: '✅', render: recommendPage },
  배분: { title: '월급 배분', icon: '🔀', render: allocation },
  월급: { title: '월급 기록', icon: '💵', render: payPage },
  생활비: { title: '생활비', icon: '🧾', render: living },
  계좌: { title: '계좌 관리', icon: '🏦', render: accounts },
  저축: { title: '저축 계산기', icon: '🧮', render: savings },
  비상금: { title: '비상금 목표', icon: '🛟', render: emergencyPage },
  비정기: { title: '비정기 수입·지출', icon: '📅', render: irregular },
  가이드: { title: '통장 추천 가이드', icon: '🧭', render: guide },
  용어: { title: '용어 도우미', icon: '📖', render: terms },
  내정보: { title: '내 정보', icon: '👤', render: profile },
  설정: { title: '설정·백업', icon: '⚙️', render: settings },
  온보딩: { title: '처음 시작 질문', icon: '', render: onboarding, hidden: true },
  옮기기: { title: 'QR로 옮기기', icon: '', render: renderTransfer, hidden: true },
};

let lastPage = null;
export function renderPage(name, root, ctx) {
  destroyCharts();
  leaveTransfer(); // QR 화면을 떠나면 QR을 지우고 카메라를 끈다
  if (!PAGES[name]) name = '대시보드';
  // 다른 화면에서 월급 기록으로 들어오면 이번 달(또는 openPayMonth로 고른 달)부터 연다
  if (name === '월급' && lastPage !== '월급') payMonth = payMonthNext;
  payMonthNext = null;
  lastPage = name;
  const page = PAGES[name];
  page.render(root, ctx);
}

export { SAVING_TYPES };
