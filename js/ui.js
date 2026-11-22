// 화면 공통 도구: 금액 표시, 글자 처리, 용어 버튼, 알림창

// 금액: 1,234,000원
export function won(v) {
  const x = Math.round(Number(v) || 0);
  return x.toLocaleString('ko-KR') + '원';
}
// 만원 단위 설명 (입력 도움말용): 36,000,000 → 3,600만원
export function manwon(v) {
  const x = Math.round(Number(v) || 0);
  if (!x) return '';
  const eok = Math.floor(x / 100000000);
  const man = Math.floor((x % 100000000) / 10000);
  const rest = x % 10000;
  let s = '';
  if (eok) s += eok.toLocaleString('ko-KR') + '억 ';
  if (man) s += man.toLocaleString('ko-KR') + '만';
  if (rest) s += (s ? ' ' : '') + rest.toLocaleString('ko-KR');
  return s.trim() + '원';
}
// 비율: 0.035 → 3.5%
export function pct(v, digits = 1) {
  const f = 10 ** digits;
  const r = Math.round((Number(v) || 0) * 100 * f) / f;
  return r.toLocaleString('ko-KR', { maximumFractionDigits: digits }) + '%';
}
export function parseMoney(s) {
  const x = Number(String(s ?? '').replace(/[^\d-]/g, ''));
  return Number.isFinite(x) ? x : 0;
}
// "4.5" (%) → 0.045, 빈칸 → null
export function parsePercent(s) {
  const t = String(s ?? '').replace(/[^\d.]/g, '');
  if (t === '') return null;
  const x = Number(t);
  return Number.isFinite(x) ? x / 100 : null;
}
export function percentInput(v) {
  if (v === null || v === undefined || v === '') return '';
  return String(Math.round(Number(v) * 100 * 1000) / 1000);
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 용어 도우미 ⓘ 버튼 (F11)
export function term(word, label) {
  return `${label !== undefined ? esc(label) : esc(word)}<button type="button" class="term" data-term="${esc(word)}" aria-label="${esc(word)} 설명 보기">ⓘ</button>`;
}

// 금액 입력칸: 입력하는 동안 쉼표를 넣고, 아래에 만원 단위를 보여준다
export function moneyInput(name, value, attrs = '') {
  const v = Number(value) ? Number(value).toLocaleString('ko-KR') : '';
  return `<span class="money"><input type="text" inputmode="numeric" autocomplete="off" name="${esc(name)}" value="${v}" data-money ${attrs}><span class="unit">원</span></span>`;
}
export function bindMoneyInputs(root) {
  root.querySelectorAll('input[data-money]').forEach(inp => {
    if (inp.dataset.bound) return;
    inp.dataset.bound = '1';
    const hint = document.createElement('small');
    hint.className = 'hint money-hint';
    inp.closest('.money').after(hint);
    const update = () => {
      const x = parseMoney(inp.value);
      inp.value = x ? x.toLocaleString('ko-KR') : '';
      hint.textContent = x >= 10000 ? '= ' + manwon(x) : '';
    };
    inp.addEventListener('input', update);
    update();
  });
}

let modalEl = null;
export function modal(title, html) {
  if (!modalEl) {
    modalEl = document.createElement('dialog');
    modalEl.className = 'modal';
    document.body.appendChild(modalEl);
    modalEl.addEventListener('click', e => { if (e.target === modalEl || e.target.closest('[data-close]')) modalEl.close(); });
  }
  modalEl.innerHTML = `<div class="modal-box"><h3>${esc(title)}</h3><div>${html}</div><div class="actions"><button type="button" class="btn" data-close>닫기</button></div></div>`;
  modalEl.showModal();
}

export function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2400);
}

export function bar(ratio) {
  const r = Math.max(0, Math.min(1, Number(ratio) || 0));
  return `<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(r * 100)}"><span style="width:${(r * 100).toFixed(1)}%"></span></div>`;
}
