// 서비스 워커: 오프라인에서도 열리도록 앱 파일을 기기에 보관한다
const CACHE = '내돈관리-v5';
const SHELL = [
  './', './index.html', './manifest.json', './css/style.css',
  './js/app.js', './js/store.js', './js/rules.js', './js/calc.js', './js/recommend.js', './js/ui.js', './js/pages.js', './js/onboarding.js',
  './데이터/금융규칙.json', './데이터/금융규칙_임시.json', './데이터/예시_사용자.json',
  './아이콘/icon.svg', './아이콘/icon-192.png', './아이콘/icon-512.png',
];
const CHART = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // 파일을 하나씩 받아 보관한다 (하나가 실패해도 나머지는 보관)
    const urls = [...SHELL.map(p => new URL(encodeURI(p), self.location).href), CHART];
    await Promise.all(urls.map(async u => {
      try {
        const res = await fetch(new Request(u, { cache: 'reload', mode: u === CHART ? 'cors' : 'same-origin' }));
        if (res.ok) await c.put(u, res);
      } catch (err) { /* 인터넷이 안 되면 다음 접속 때 다시 보관 */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isData = url.origin === location.origin && decodeURIComponent(url.pathname).includes('/데이터/');
  if (isData) {
    // 규칙·예시 데이터: 인터넷 먼저 (조사 결과가 바뀌면 바로 반영), 안 되면 보관본
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      try {
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      } catch (err) {
        const hit = await c.match(req, { ignoreSearch: true });
        return hit || new Response('', { status: 404, statusText: 'offline' });
      }
    })());
    return;
  }
  if (url.origin !== location.origin && url.href !== CHART) return;
  // 앱 파일: 보관본 먼저, 뒤에서 새로 받아 갱신
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const res = await net;
    return res || (req.mode === 'navigate' ? c.match(encodeURI('./index.html')) : new Response('', { status: 504 }));
  })());
});
