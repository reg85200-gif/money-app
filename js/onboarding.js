// 처음 시작 질문 (F0): 한 화면에 질문 하나, 예시와 함께. 건너뛰기·뒤로가기 지원
import { esc, won, manwon, moneyInput, bindMoneyInputs, parseMoney, parsePercent, percentInput, term } from './ui.js';
import { netPay, n } from './calc.js';
import { newId } from './store.js';

const BANKS = ['KB국민', '신한', '우리', '하나', 'NH농협', 'IBK기업', '카카오뱅크', '토스뱅크', '케이뱅크', '우체국', '새마을금고', '증권사', '기타'];
const LIVING_ITEMS = ['식비', '교통', '차량관리비', '통신', '생활용품', '의료', '경조사', '여가', '구독'];
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
// 4-1번 질문 선택지 (계획서 3장 온보딩 질문 목록)
export const FIN_APPS = ['토스', '뱅크샐러드', '은행 앱만', '기타'];

// 잔액을 어디서 확인하면 되는지 도움말 (계좌 화면에서도 씀)
export function balanceTip(app) {
  if (app === '토스') return '토스 앱 → 전체 자산에서 확인한 금액을 적으세요.';
  if (app === '뱅크샐러드') return '뱅크샐러드 앱의 자산 화면에서 확인한 금액을 적으세요.';
  if (app === '은행 앱만') return '각 은행 앱에서 확인한 잔액을 적으세요.';
  return '';
}

function balanceInputs(d, names) {
  const bal = d.잔액 || {};
  return names.map((nm, i) => `<label><span>${esc(nm)}</span>${moneyInput('잔액__' + i, bal[nm])}</label>`).join('');
}

// 반복 입력 칸 정의
const REPEATS = {
  상여: [
    { k: '이름', label: '이름', type: 'text', ph: '예: 추석 명절 상여' },
    { k: '금액', label: '금액', type: 'money' },
    { k: '월', label: '받는 달', type: 'month' },
  ],
  자동이체: [
    { k: '항목', label: '항목', type: 'text', ph: '예: 보험료' },
    { k: '금액', label: '금액', type: 'money' },
    { k: '날짜', label: '빠지는 날(일)', type: 'day' },
    { k: '받는계좌', label: '받는 곳', type: 'text', ph: '예: 생활비 계좌, 보험사', list: true },
  ],
  비정기지출: [
    { k: '항목', label: '항목', type: 'text', ph: '예: 경조사비' },
    { k: '연간금액', label: '1년 대략 금액', type: 'money' },
    { k: '계좌', label: '쓰는 계좌', type: 'text', ph: '예: 주계좌', list: true },
  ],
  저축: [
    { k: '종류', label: '종류', type: 'select', options: ['적금', '청약', '비상금', '예비비', '투자'] },
    { k: '이름', label: '상품 이름(별명)', type: 'text', ph: '예: 청년미래적금' },
    { k: '은행', label: '은행', type: 'bank' },
    { k: '월납입', label: '월 납입액', type: 'money' },
    { k: '가입일', label: '가입일', type: 'date' },
    { k: '만기', label: '만기일(모르면 비움)', type: 'date' },
  ],
  부채: [
    { k: '이름', label: '이름', type: 'text', ph: '예: 학자금 대출, 휴대폰 할부' },
    { k: '잔액', label: '남은 금액', type: 'money' },
    { k: '금리', label: '연 금리(%)', type: 'percent' },
    { k: '월상환', label: '월 상환액', type: 'money' },
  ],
  목표: [
    { k: '이름', label: '목표', type: 'text', ph: '예: 전세 보증금' },
    { k: '금액', label: '금액', type: 'money' },
    { k: '시기', label: '시기(년-월)', type: 'monthinput' },
  ],
};

function fieldHtml(f, v, i) {
  const name = `${f.k}__${i}`;
  switch (f.type) {
    case 'money': return moneyInput(name, v);
    case 'percent': return `<input type="text" inputmode="decimal" name="${name}" value="${esc(percentInput(v))}" placeholder="예: 4.5">`;
    case 'month': return `<select name="${name}"><option value="">선택</option>${MONTHS.map(m => `<option value="${m}" ${Number(v) === m ? 'selected' : ''}>${m}월</option>`).join('')}</select>`;
    case 'day': return `<input type="number" min="1" max="31" name="${name}" value="${esc(v ?? '')}" placeholder="예: 25">`;
    case 'date': return `<input type="date" name="${name}" value="${esc(v ?? '')}">`;
    case 'monthinput': return `<input type="month" name="${name}" value="${esc(v ?? '')}">`;
    case 'select': return `<select name="${name}">${f.options.map(o => `<option ${v === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
    case 'bank': return `<input type="text" name="${name}" value="${esc(v ?? '')}" list="bank-list" placeholder="예: ○○은행">`;
    default: return `<input type="text" name="${name}" value="${esc(v ?? '')}" placeholder="${esc(f.ph || '')}" ${f.list ? 'list="acc-list"' : ''}>`;
  }
}

function repeatHtml(key, rows) {
  const spec = REPEATS[key];
  const list = rows && rows.length ? rows : [{}];
  return `<div class="repeat" data-repeat="${key}">
    ${list.map((r, i) => `<fieldset class="row-card" data-row="${i}">
      <legend>${i + 1}번째</legend>
      <div class="grid-fields">${spec.map(f => `<label><span>${f.label}</span>${fieldHtml(f, r[f.k], i)}</label>`).join('')}</div>
      <button type="button" class="btn small ghost" data-del-row="${i}">이 줄 지우기</button>
    </fieldset>`).join('')}
    <button type="button" class="btn small" data-add-row>+ 하나 더 추가</button>
  </div>`;
}

function readRepeat(form, key) {
  const spec = REPEATS[key];
  const rows = [];
  form.querySelectorAll(`[data-repeat="${key}"] [data-row]`).forEach(fs => {
    const i = fs.dataset.row;
    const r = {};
    let filled = false;
    for (const f of spec) {
      const el = fs.querySelector(`[name="${f.k}__${i}"]`);
      let v = el ? el.value : '';
      if (f.type === 'money') v = parseMoney(v);
      else if (f.type === 'percent') v = parsePercent(v);
      else if (f.type === 'month' || f.type === 'day') v = v ? Number(v) : null;
      else v = String(v).trim();
      r[f.k] = v;
      if (f.type !== 'select' && v !== '' && v !== null && v !== 0) filled = true;
    }
    if (filled) rows.push(r);
  });
  return rows;
}

// 질문 목록 (계획서 3장 온보딩 질문 1~13)
function questions(ctx) {
  const R = ctx.R;
  return [
    {
      q: '연봉(세전)은 얼마인가요?', ex: '예: 3,600만원이면 36000000 을 입력하세요.',
      help: '세금 떼기 전 1년 총액이에요. 성과급·상여는 빼고 적어도 돼요.',
      html: d => `<label class="big"><span>연봉(세전)</span>${moneyInput('연봉', d.연봉)}</label>`,
      read: (f, d) => { d.연봉 = parseMoney(f.연봉.value) || null; },
    },
    {
      q: '매달 통장에 실제로 들어오는 금액을 아세요?', ex: '모르면 "자동 계산"을 그대로 두세요.',
      help: `${term('월 실수령액')}은 세금과 ${term('4대보험')}을 뺀 금액이에요.`,
      html: d => {
        const calc = n(d.연봉) ? netPay(d.연봉, R) : null;
        const auto = !(n(d.월실수령직접) > 0);
        return `<div class="choice">
          <label><input type="radio" name="방식" value="자동" ${auto ? 'checked' : ''}> 모름 → 자동 계산</label>
          <label><input type="radio" name="방식" value="직접" ${!auto ? 'checked' : ''}> 알아요 → 직접 입력</label>
        </div>
        ${calc ? `<div class="calc-box">
          <div>월 세전 ${won(calc.세전)}</div>
          <div>− 국민연금 ${won(calc.보험.국민연금)} · 건강보험 ${won(calc.보험.건강보험)} · 장기요양 ${won(calc.보험.장기요양)} · 고용보험 ${won(calc.보험.고용보험)}</div>
          <div>− 소득세·지방소득세(근사) ${won(calc.세금)}</div>
          <strong>= 월 실수령액 약 ${won(calc.실수령)}</strong>
          <small class="hint">규칙 JSON의 실수령계산 요율로 계산한 근사값이에요. 부양가족·비과세 수당에 따라 달라요.</small>
        </div>` : '<p class="hint">1번 연봉을 넣으면 자동으로 계산해 드려요.</p>'}
        <label><span>직접 입력(실제 금액)</span>${moneyInput('월실수령직접', d.월실수령직접)}</label>`;
      },
      read: (f, d) => {
        const direct = parseMoney(f.월실수령직접.value);
        const mode = (f.querySelector('[name="방식"]:checked') || {}).value;
        d.월실수령직접 = mode === '직접' && direct > 0 ? direct : (mode !== '자동' && direct > 0 ? direct : null);
      },
    },
    {
      q: '상여금·명절 보너스가 있나요?', ex: '예: 30만원, 설·추석 각각 한 줄씩',
      help: `${term('명절 상여')}처럼 가끔 들어오는 돈이에요.`,
      html: d => repeatHtml('상여', d.상여), read: (f, d) => { d.상여 = readRepeat(f, '상여'); },
    },
    {
      q: '월급이 들어오는 은행·계좌는?', ex: '예: ○○은행 / 주계좌',
      help: `월급이 들어오는 통장을 이 앱에서는 ${term('주계좌')}라고 불러요. 계좌번호는 적지 마세요.`,
      html: d => {
        const m = d.주계좌 || {};
        return `<label><span>은행</span><select name="은행"><option value="">선택</option>${BANKS.map(b => `<option ${m.은행 === b ? 'selected' : ''}>${b}</option>`).join('')}</select></label>
        <label><span>별명</span><input type="text" name="별명" value="${esc(m.별명 || '주계좌')}"></label>`;
      },
      read: (f, d) => { d.주계좌 = { 은행: f.은행.value, 별명: f.별명.value.trim() || '주계좌' }; },
    },
    {
      // 4-1번 (계획서 2026-11-22 추가)
      no: '4-1',
      q: '계좌를 한 번에 보는 금융 앱을 쓰나요?', ex: '예: 자산을 한 번에 보여주는 앱',
      help: '이 앱은 은행과 직접 연결하지 않아요. 쓰는 앱이 있으면 거기서 본 잔액을 옮겨 적는 방법을 안내해 드려요.',
      html: d => `<div class="choice">${FIN_APPS.map(x => `<label><input type="radio" name="금융앱" value="${x}" ${d.금융앱 === x ? 'checked' : ''}> ${x}</label>`).join('')}</div>`,
      read: (f, d) => { const c = f.querySelector('[name="금융앱"]:checked'); if (c) d.금융앱 = c.value; },
    },
    {
      q: '월급 통장에서 자동으로 빠져나가는 것을 알려주세요', ex: '예: 보험료 8만원, 생활비 이체 70만원, 적금 30만원',
      help: '받는 곳에 내 다른 통장 이름(예: 생활비 계좌)을 적으면 월급 배분 계산에 쓰여요.',
      html: d => repeatHtml('자동이체', d.자동이체), read: (f, d) => { d.자동이체 = readRepeat(f, '자동이체'); },
    },
    {
      q: '생활비는 어느 통장에서 쓰나요? 그 안에 포함된 항목은?', ex: '예: 생활비 계좌 / 식비·교통·생활용품',
      help: '여기서 고른 항목은 생활비 기록 화면의 분류로도 쓰여요.',
      html: d => {
        const l = d.생활비 || {};
        const items = l.포함항목 || [];
        return `<label><span>생활비 계좌 이름</span><input type="text" name="계좌" list="acc-list" value="${esc(l.계좌 || '')}" placeholder="예: 생활비 계좌"></label>
        <label><span>생활비 계좌 은행</span><input type="text" name="은행" list="bank-list" value="${esc(l.은행 || '')}" placeholder="예: ○○은행"></label>
        <div class="checks">${LIVING_ITEMS.map(x => `<label><input type="checkbox" name="항목" value="${x}" ${items.includes(x) ? 'checked' : ''}> ${x}</label>`).join('')}</div>`;
      },
      read: (f, d) => {
        d.생활비 = { 계좌: f.계좌.value.trim(), 은행: f.은행.value.trim(), 포함항목: [...f.querySelectorAll('[name="항목"]:checked')].map(x => x.value) };
      },
    },
    {
      q: '가끔 크게 나가는 돈이 있나요? 작년 기준 대략 얼마?', ex: '예: 경조사·가전 교체 / 1년 100만원 / 주계좌',
      help: `이런 돈은 ${term('예비비')}로 매달 나눠 모으면 계획이 덜 흔들려요.`,
      html: d => repeatHtml('비정기지출', d.비정기지출), read: (f, d) => { d.비정기지출 = readRepeat(f, '비정기지출'); },
    },
    {
      q: '저축·적금이 있나요?', ex: '예: 청약 / 주택청약종합저축 / ○○은행 / 10만원',
      help: `가입일을 넣으면 ${term('만기')}까지 남은 기간과 예상 금액을 계산해요.`,
      html: d => repeatHtml('저축', d.저축), read: (f, d) => { d.저축 = readRepeat(f, '저축'); },
    },
    {
      q: '빚(대출·할부)이 있나요?', ex: '없으면 "건너뛰기"를 누르세요.',
      help: '금리를 알면 먼저 갚는 게 나은지 판단할 수 있어요.',
      html: d => repeatHtml('부채', d.부채), read: (f, d) => { d.부채 = readRepeat(f, '부채'); },
    },
    {
      q: '지금 통장에 있는 돈은 각각 얼마인가요?', ex: '대략이어도 괜찮아요. 나중에 계좌 화면에서 고칠 수 있어요.',
      help: '앞에서 알려주신 통장 목록이에요.',
      html: d => {
        const names = knownAccounts(d);
        const tip = balanceTip(d.금융앱);
        if (tip) return `<p class="notice" data-tip>${esc(tip)}</p>` + (names.length ? '' : '<p class="hint">앞에서 입력한 통장이 없어요. 계좌 화면에서 나중에 추가할 수 있어요.</p>') + balanceInputs(d, names);
        if (!names.length) return '<p class="hint">앞에서 입력한 통장이 없어요. 계좌 화면에서 나중에 추가할 수 있어요.</p>';
        return balanceInputs(d, names);
      },
      read: (f, d) => {
        d.잔액 = {};
        knownAccounts(d).forEach((nm, i) => { const el = f['잔액__' + i]; if (el) d.잔액[nm] = parseMoney(el.value); });
      },
    },
    {
      q: '무주택 세대주인가요?', ex: '청약 소득공제를 받을 수 있는지 판단할 때 써요.',
      help: `${term('무주택 세대주')}는 주민등록상 세대주이고 세대원 모두 집이 없는 경우예요.`,
      html: d => `<div class="choice">${['예', '아니오', '모름'].map(x => `<label><input type="radio" name="무주택" value="${x}" ${d.무주택세대주 === x ? 'checked' : ''}> ${x}</label>`).join('')}</div>`,
      read: (f, d) => { const c = f.querySelector('[name="무주택"]:checked'); d.무주택세대주 = c ? c.value : (d.무주택세대주 || '모름'); },
    },
    {
      q: '앞으로 5년 안에 필요한 큰돈이 있나요?', ex: '예: 전세 보증금 5,000만원 / 2029-03',
      help: '목표가 있으면 저축 계획을 세우기 쉬워요.',
      html: d => repeatHtml('목표', d.목표), read: (f, d) => { d.목표 = readRepeat(f, '목표'); },
    },
    {
      q: '투자해 본 적 있나요? 원금이 줄어도 괜찮은 정도는?', ex: '이 앱은 특정 종목을 추천하지 않아요. 안내 순서를 정할 때만 써요.',
      help: '정답은 없어요. 지금 마음에 가까운 것을 고르세요.',
      html: d => `<label><span>투자 경험</span><select name="경험">${['없음', '조금 있음', '꾸준히 함'].map(x => `<option ${d.투자경험 === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
        <label><span>원금이 줄어도 괜찮은 정도</span><select name="위험">${['원금이 줄면 안 됨', '조금은 괜찮음', '오래 둘 돈이면 괜찮음'].map(x => `<option ${d.위험감수 === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>`,
      read: (f, d) => { d.투자경험 = f.경험.value; d.위험감수 = f.위험.value; },
    },
  ];
}

// 계획서 번호 (4-1처럼 끼워 넣은 질문은 번호를 세지 않음)
function qNo(qs, i) {
  return qs.slice(0, i + 1).filter(x => !x.no).length;
}

// 지금까지 답한 내용에서 통장 이름 모으기
function knownAccounts(d) {
  const set = [];
  const add = x => { const v = String(x || '').trim(); if (v && !set.includes(v)) set.push(v); };
  if (d.주계좌) add(d.주계좌.별명);
  if (d.생활비) add(d.생활비.계좌);
  (d.저축 || []).forEach(s => add(s.이름 || s.종류));
  return set;
}

// 온보딩 답을 계좌·설정으로 옮기기 (같은 별명이 있으면 고치고, 없으면 새로 만든다)
function apply(ctx, d) {
  const st = ctx.state;
  const balances = d.잔액 || {};
  const upsert = (name, patch) => {
    if (!name) return;
    let a = st.계좌.find(x => x.별명 === name);
    if (!a) {
      a = { id: newId(), 별명: name, 은행: '', 종류: '입출금', 잔액: 0, 월납입: 0, 가입일: '', 만기일: '', 금리: null, 상품: '', 기여유형: '일반', 메모: '' };
      st.계좌.push(a);
    }
    Object.assign(a, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined && v !== '')));
    if (name in balances) a.잔액 = balances[name];
  };
  if (d.주계좌) upsert(d.주계좌.별명, { 은행: d.주계좌.은행, 종류: '입출금' });
  if (d.생활비 && d.생활비.계좌) {
    const living = (d.자동이체 || []).find(t => String(t.받는계좌).replace(/\s/g, '') === d.생활비.계좌.replace(/\s/g, ''));
    upsert(d.생활비.계좌, { 은행: d.생활비.은행, 종류: '입출금', 월납입: living ? living.금액 : undefined });
  }
  (d.저축 || []).forEach(s => {
    const name = s.이름 || s.종류;
    upsert(name, {
      은행: s.은행, 종류: s.종류, 월납입: s.월납입, 가입일: s.가입일, 만기일: s.만기,
      상품: s.종류 === '청약' ? '주택청약' : (/청년미래/.test(name) ? '청년미래적금' : ''),
    });
  });
  // 생활비 예산이 비어 있으면 생활비 이체 금액으로 시작
  if (!n(st.생활비.월예산) && d.생활비 && d.생활비.계좌) {
    const living = (d.자동이체 || []).find(t => String(t.받는계좌).replace(/\s/g, '') === d.생활비.계좌.replace(/\s/g, ''));
    if (living) st.생활비.월예산 = living.금액;
  }
  const profile = { ...d };
  delete profile.잔액;
  profile.온보딩완료 = true;
  st.프로필 = profile;
}

export function renderOnboarding(root, ctx, opts = {}) {
  const qs = questions(ctx);
  const d = JSON.parse(JSON.stringify(ctx.state.온보딩임시 || ctx.state.프로필 || {}));
  if (!d.잔액) { d.잔액 = {}; (ctx.state.계좌 || []).forEach(a => { d.잔액[a.별명] = a.잔액; }); }
  let i = Math.min(Number(d._단계) || 0, qs.length - 1);

  const draw = () => {
    const q = qs[i];
    const accNames = [...new Set([...knownAccounts(d), ...(ctx.state.계좌 || []).map(a => a.별명)])];
    root.innerHTML = `<section class="onboarding card">
      <div class="ob-top"><span class="step">질문 ${q.no || qNo(qs, i)} · ${i + 1} / ${qs.length}</span>
        ${opts.first ? '<button type="button" class="link" data-sample>예시 데이터로 둘러보기</button>' : '<a class="link" href="#/내정보">그만두기</a>'}</div>
      <div class="bar"><span style="width:${((i + 1) / qs.length * 100).toFixed(1)}%"></span></div>
      <form class="ob-form" autocomplete="off" novalidate>
        <h2>${esc(q.q)}</h2>
        <p class="example">${esc(q.ex)}</p>
        <p class="hint">${q.help}</p>
        <div class="ob-body">${q.html(d)}</div>
        <datalist id="acc-list">${accNames.map(x => `<option value="${esc(x)}">`).join('')}</datalist>
        <datalist id="bank-list">${BANKS.map(x => `<option value="${x}">`).join('')}</datalist>
        <div class="ob-nav">
          <button type="button" class="btn ghost" data-back ${i === 0 ? 'disabled' : ''}>← 뒤로</button>
          <button type="button" class="btn ghost" data-skip>건너뛰기</button>
          <button type="submit" class="btn primary">${i === qs.length - 1 ? '완료' : '다음 →'}</button>
        </div>
      </form>
    </section>`;
    const form = root.querySelector('form');
    bindMoneyInputs(form);
    const first = form.querySelector('.ob-body input, .ob-body select');
    if (first) first.focus({ preventScroll: true });

    const persist = () => { d._단계 = i; ctx.state.온보딩임시 = d; ctx.save(); };
    const next = async () => {
      if (i === qs.length - 1) {
        delete d._단계;
        apply(ctx, d);
        delete ctx.state.온보딩임시;
        ctx.snapshot();
        await ctx.save();
        ctx.go('#/대시보드');
        return;
      }
      i += 1; persist(); draw();
    };
    form.addEventListener('submit', e => { e.preventDefault(); q.read(form, d); next(); });
    form.querySelector('[data-skip]').addEventListener('click', () => next());
    form.querySelector('[data-back]').addEventListener('click', () => { q.read(form, d); i = Math.max(0, i - 1); persist(); draw(); });
    const sample = root.querySelector('[data-sample]');
    if (sample) sample.addEventListener('click', () => ctx.loadSample());
    // 반복 입력: 줄 추가·삭제 (지금까지 쓴 값은 유지)
    form.addEventListener('click', e => {
      const add = e.target.closest('[data-add-row]');
      const del = e.target.closest('[data-del-row]');
      if (!add && !del) return;
      const key = e.target.closest('[data-repeat]').dataset.repeat;
      const keepEmpty = [...form.querySelectorAll(`[data-repeat="${key}"] [data-row]`)].map(fs => {
        const r = {};
        REPEATS[key].forEach(f => { const el = fs.querySelector(`[name="${f.k}__${fs.dataset.row}"]`); r[f.k] = el ? el.value : ''; });
        return r;
      });
      // 금액·비율 칸은 다시 그릴 때 숫자로 바꿔 넣는다
      const rows = keepEmpty.map(r => {
        const o = { ...r };
        REPEATS[key].forEach(f => {
          if (f.type === 'money') o[f.k] = parseMoney(r[f.k]);
          if (f.type === 'percent') o[f.k] = parsePercent(r[f.k]);
        });
        return o;
      });
      if (add) rows.push({});
      if (del) rows.splice(Number(del.dataset.delRow), 1);
      d[key] = rows;
      form.querySelector(`[data-repeat="${key}"]`).outerHTML = repeatHtml(key, rows);
      bindMoneyInputs(form);
    });
    // 2번 질문: 직접 입력칸에 쓰면 '직접'을 고른 것으로
    const direct = form.querySelector('[name="월실수령직접"]');
    if (direct) direct.addEventListener('input', () => { const r = form.querySelector('[name="방식"][value="직접"]'); if (r && parseMoney(direct.value)) r.checked = true; });
  };
  draw();
}

export { manwon };
