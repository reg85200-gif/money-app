// 앱 시작점: 규칙·저장 데이터 읽기, 메뉴, 화면 전환
import { loadRules, findTerm } from './rules.js';
import { loadState, saveState, parseBackup, normalize } from './store.js';
import { PAGES, renderPage } from './pages.js';
import { esc, modal, toast } from './ui.js';
import { netWorth, monthKey } from './calc.js';

// 휴대폰 하단 탭에 보일 화면 (나머지는 "더보기")
const TABS = ['대시보드', '추천', '배분', '생활비'];

const ctx = {
  state: null, R: null, info: null,
  save: () => saveState(ctx.state).catch(e => { console.error(e); toast('저장하지 못했어요.'); }),
  go: hash => { if (location.hash === hash) route(); else location.hash = hash; },
  rerender: () => route(),
  // 이번 달 순자산 기록 (추이 차트용)
  snapshot: () => {
    const m = monthKey();
    const rec = ctx.state.기록.find(r => r.월 === m);
    if (rec) rec.순자산 = netWorth(ctx.state);
    else ctx.state.기록.push({ 월: m, 순자산: netWorth(ctx.state) });
  },
  replace: async next => { ctx.state = normalize(next); applyTheme(); await ctx.save(); },
  loadSample: async () => {
    try {
      const res = await fetch(encodeURI('데이터/예시_사용자.json'), { cache: 'no-store' });
      const st = parseBackup(await res.json());
      await ctx.replace(st);
      toast('예시 데이터를 불러왔어요.');
      ctx.go('#/대시보드');
    } catch (e) {
      console.error(e);
      modal('불러오기 실패', '<p>예시 데이터 파일을 읽지 못했어요.</p>');
    }
  },
  applyTheme: () => applyTheme(),
};

function applyTheme() {
  const t = (ctx.state && ctx.state.설정.테마) || '자동';
  const root = document.documentElement;
  if (t === '밝게') root.dataset.theme = 'light';
  else if (t === '어둡게') root.dataset.theme = 'dark';
  else delete root.dataset.theme;
}

function buildNav() {
  const items = Object.entries(PAGES).filter(([, p]) => !p.hidden);
  document.getElementById('side-nav').innerHTML = items.map(([k, p]) => `<a href="#/${k}" data-page="${k}"><span aria-hidden="true">${p.icon}</span>${esc(p.title)}</a>`).join('');
  document.getElementById('tab-nav').innerHTML = TABS.map(k => `<a href="#/${k}" data-page="${k}"><span aria-hidden="true">${PAGES[k].icon}</span>${esc(PAGES[k].title.replace('월급 ', ''))}</a>`).join('')
    + '<button type="button" id="more-btn" aria-haspopup="true"><span aria-hidden="true">☰</span>더보기</button>';
  document.getElementById('more-menu').innerHTML = items.filter(([k]) => !TABS.includes(k)).map(([k, p]) => `<a href="#/${k}" data-page="${k}"><span aria-hidden="true">${p.icon}</span>${esc(p.title)}</a>`).join('');
  const menu = document.getElementById('more-menu');
  document.getElementById('more-btn').onclick = e => { e.stopPropagation(); menu.hidden = !menu.hidden; };
  document.addEventListener('click', () => { menu.hidden = true; });
}

function ruleBadge() {
  const i = ctx.info;
  document.getElementById('rule-badge').innerHTML = `<a href="#/설정" title="금융 규칙 정보">규칙 기준일 ${esc(i.기준일 || '-')}${i.임시값사용 ? ' · <strong class="warn">임시값 사용 중</strong>' : ''}</a>`;
}

const BEFORE_ONBOARDING = ['설정', '용어', '옮기기'];

function route() {
  let name = decodeURIComponent((location.hash || '').replace(/^#\/?/, '')) || '대시보드';
  // 온보딩 전에도 열 수 있는 화면: 설정(백업 가져오기), 용어, QR 옮기기(새 기기에서 받기)
  if (!ctx.state.프로필.온보딩완료 && !BEFORE_ONBOARDING.includes(name)) name = '온보딩';
  if (!PAGES[name]) name = '대시보드';
  const main = document.getElementById('main');
  document.body.classList.toggle('ob-mode', name === '온보딩');
  document.querySelectorAll('[data-page]').forEach(a => a.classList.toggle('active', a.dataset.page === name));
  document.getElementById('more-btn').classList.toggle('active', !TABS.includes(name) && name !== '온보딩');
  document.getElementById('more-menu').hidden = true;
  document.title = `${PAGES[name].title} · 내 돈 관리`;
  try {
    renderPage(name, main, ctx);
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="notice">화면을 그리다 문제가 생겼어요: ${esc(e.message)}</div>`;
  }
  main.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

// ⓘ 용어 버튼
document.addEventListener('click', e => {
  const b = e.target.closest('button.term');
  if (!b) return;
  e.preventDefault();
  const t = findTerm(ctx.R, b.dataset.term);
  modal(b.dataset.term, t ? `<p>${esc(t.설명)}</p>${t.출처 ? `<small class="hint">출처: ${esc([].concat(t.출처).join(', '))}</small>` : ''}` : '<p>이 단어의 설명은 아직 준비 중이에요.</p>');
});

async function start() {
  try {
    const r = await loadRules();
    ctx.R = r.rules;
    ctx.info = r.info;
    ctx.state = await loadState();
  } catch (e) {
    console.error(e);
    document.getElementById('main').innerHTML = `<div class="notice">앱을 시작하지 못했어요: ${esc(e.message)}<br>파일을 직접 열지 말고 로컬 서버로 열어 주세요 (개발 보고서 참고).</div>`;
    return;
  }
  applyTheme();
  buildNav();
  ruleBadge();
  window.addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('오프라인 기능을 켜지 못했어요:', err.message));
  }
}

start();
