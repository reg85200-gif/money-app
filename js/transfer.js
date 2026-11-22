// F17 QR로 기기 간 옮기기 화면 (보내기 / 받기)
import { esc, toast, bar } from './ui.js';
import { makeBackup, parseBackup } from './store.js';
import * as Q from './qr.js';

let mode = 'send'; // 'send' | 'receive'
export function openTransfer(m) { mode = m; }

// 화면을 떠날 때 정리할 일 (QR 지우기, 카메라 끄기, 자동 넘김 멈추기)
let cleanups = [];
export function leaveTransfer() { cleanups.forEach(fn => { try { fn(); } catch (e) { /* 무시 */ } }); cleanups = []; }

// 지금 데이터를 백업 파일로 저장 (설정 화면의 백업 내보내기와 같은 형식)
export function downloadBackup(state, label = '백업') {
  const blob = new Blob([JSON.stringify(makeBackup(state), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  a.download = `자산관리_${label}_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function kb(bytes) { return `${(bytes / 1024).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}KB`; }
// 초 → "2분 24초"
function duration(sec) { const m = Math.floor(sec / 60); const r = Math.round(sec % 60); return m ? `${m}분${r ? ` ${r}초` : ''}` : `${r}초`; }
// 오류 문구에 한글이 없으면(브라우저가 낸 영어 오류) 한국어 기본 문구로 바꾼다 (버그 5)
const HANGUL = /[가-힣]/;
function korean(e, fallback) { const m = e && e.message; return m && HANGUL.test(m) ? m : fallback; }

export function renderTransfer(root, ctx) {
  leaveTransfer();
  root.innerHTML = `
    <div class="page-head"><h1>QR로 기기 간 옮기기</h1><a class="btn ghost" href="#/설정" data-close>닫기</a></div>
    <div class="seg" role="tablist">
      <button type="button" role="tab" class="${mode === 'send' ? 'active' : ''}" data-mode="send" aria-selected="${mode === 'send'}">QR로 보내기</button>
      <button type="button" role="tab" class="${mode === 'receive' ? 'active' : ''}" data-mode="receive" aria-selected="${mode === 'receive'}">QR로 받기</button>
    </div>
    <div id="tx-body"></div>`;
  root.querySelectorAll('[data-mode]').forEach(b => { b.onclick = () => { mode = b.dataset.mode; renderTransfer(root, ctx); }; });
  const body = root.querySelector('#tx-body');
  if (mode === 'send') renderSend(body, ctx); else renderReceive(body, ctx);
}

// ───── 보내기 ─────
async function renderSend(body, ctx) {
  body.innerHTML = `
    <p class="notice"><strong>다른 사람이 찍지 않게 주의하세요.</strong> 이 QR에는 이 기기의 금융 정보 전체가 담겨 있어요. 다 옮기면 "닫기"를 눌러 QR을 지우세요.</p>
    <p class="hint">받는 기기에서 설정 → "QR로 받기"를 열고 이 화면을 찍으세요. 여러 장이면 자동으로 넘어가요. 순서는 상관없고, 놓친 장은 다음 바퀴에 다시 나와요. 이 화면을 닫았다 다시 열면 새 전송이 되어 받는 기기도 처음부터 다시 모아요.</p>
    <div id="qr-many"></div>
    <section class="card qr-card"><p class="hint" id="qr-status">QR 만드는 중…</p></section>`;
  const card = body.querySelector('.qr-card');
  let timer = null;
  cleanups.push(() => { clearInterval(timer); card.innerHTML = ''; });
  let tx;
  try {
    await Q.loadScript(Q.QR_GEN_URL);
    tx = await Q.encodeTransfer(makeBackup(ctx.state));
  } catch (e) {
    card.innerHTML = `<p class="warn">${esc(korean(e, 'QR을 만들지 못했어요.'))}</p><p class="hint">대신 <a href="#/설정">백업 파일 내보내기</a>로 옮길 수 있어요.</p>`;
    return;
  }
  if (!card.isConnected) return; // 그사이 화면을 떠남
  const images = tx.parts.map(p => Q.qrDataUrl(p));
  let i = 0;
  let speed = 1500;
  let playing = images.length > 1;
  // 장 수가 많으면 예상 시간과 백업 파일 안내 (버그 6, 전송 방식은 그대로)
  const many = body.querySelector('#qr-many');
  const drawMany = () => {
    if (images.length <= Q.MANY_PARTS) { many.innerHTML = ''; return; }
    many.innerHTML = `<p class="notice"><strong>장 수가 많아요(${images.length}장).</strong> ${speed / 1000}초 간격이면 한 바퀴에 약 <strong>${duration(images.length * speed / 1000)}</strong> 걸리고, 놓친 장은 다음 바퀴를 기다려야 해요. <a href="#/설정">백업 파일로 옮기면</a> 더 빨라요.</p>`;
  };
  drawMany();
  card.innerHTML = `
    <div class="qr-meta"><span id="qr-count"></span><small class="sub">${kb(tx.원본바이트)} → ${tx.압축 ? `압축 ${kb(tx.압축바이트)}` : '압축 안 함(이 브라우저 미지원)'} · 전송 ${esc(tx.id)}</small></div>
    <img id="qr-img" class="qr-img" alt="QR 코드" width="480" height="480">
    ${images.length > 1 ? `<div class="actions qr-ctrl">
      <button type="button" class="btn" data-prev aria-label="이전 장">◀</button>
      <button type="button" class="btn primary" data-play></button>
      <button type="button" class="btn" data-next aria-label="다음 장">▶</button>
      <label class="inline-select"><span>넘김 간격</span><select data-speed>${[1000, 1500, 2000, 3000].map(v => `<option value="${v}" ${v === speed ? 'selected' : ''}>${v / 1000}초</option>`).join('')}</select></label>
    </div>` : ''}`;
  const img = card.querySelector('#qr-img');
  const count = card.querySelector('#qr-count');
  const play = card.querySelector('[data-play]');
  const show = () => {
    img.src = images[i].url;
    img.dataset.part = tx.parts[i];
    count.innerHTML = `<strong>${i + 1} / ${images.length}장</strong>`;
    if (play) play.textContent = playing ? '⏸ 멈춤' : '▶ 자동 넘김';
  };
  const restart = () => { clearInterval(timer); if (playing) timer = setInterval(() => { i = (i + 1) % images.length; show(); }, speed); };
  show(); restart();
  if (images.length > 1) {
    card.querySelector('[data-prev]').onclick = () => { i = (i - 1 + images.length) % images.length; show(); restart(); };
    card.querySelector('[data-next]').onclick = () => { i = (i + 1) % images.length; show(); restart(); };
    play.onclick = () => { playing = !playing; show(); restart(); };
    card.querySelector('[data-speed]').onchange = e => { speed = Number(e.target.value); restart(); drawMany(); };
  }
}

// ───── 받기 ─────
function renderReceive(body, ctx) {
  const col = new Q.Collector();
  let stream = null;
  let scanning = false;
  let finishing = false;
  body.innerHTML = `
    <p class="hint">보내는 기기에서 설정 → "QR로 보내기"를 열고, 아래 "카메라 켜기"를 눌러 QR을 비추세요. 여러 장이면 넘어가는 대로 계속 비추면 돼요. 보내는 기기에서 QR 화면을 다시 열면 새 전송이 되니, 받던 중이면 그대로 두세요.</p>
    <section class="card">
      <div class="actions"><button type="button" class="btn primary" data-cam>카메라 켜기</button>
        <label class="btn">사진에서 읽기<input type="file" accept="image/*" multiple data-photo hidden></label>
        <button type="button" class="btn ghost" data-reset hidden>처음부터 다시</button></div>
      <div class="cam-box" hidden><video playsinline muted autoplay aria-label="카메라 미리보기"></video></div>
      <p id="rx-msg" class="hint" role="status"></p>
      <div id="rx-other" hidden><p class="warn" data-other-msg></p>
        <div class="actions"><button type="button" class="btn small" data-other-keep>하던 전송 계속 받기</button><button type="button" class="btn small ghost" data-other-switch>새 전송으로 바꾸기</button></div></div>
      <div id="rx-progress"></div>
      <p class="hint">"사진에서 읽기": QR 화면을 찍은 사진이나 화면 캡처 여러 장을 한꺼번에 골라도 돼요.</p>
    </section>
    <div id="rx-confirm"></div>`;
  const video = body.querySelector('video');
  const msg = body.querySelector('#rx-msg');
  const prog = body.querySelector('#rx-progress');
  const camBtn = body.querySelector('[data-cam]');
  const resetBtn = body.querySelector('[data-reset]');
  const otherBox = body.querySelector('#rx-other');
  let otherText = null; // 모으는 중에 읽힌 다른 전송의 조각 (사용자가 고를 때까지 보류)
  const hideOther = () => { otherText = null; otherBox.hidden = true; };
  const say = (t, cls = 'hint') => { msg.className = cls; msg.textContent = t; };
  const stopCam = () => { scanning = false; if (stream) stream.getTracks().forEach(tr => tr.stop()); stream = null; video.srcObject = null; body.querySelector('.cam-box').hidden = true; camBtn.textContent = '카메라 켜기'; };
  cleanups.push(stopCam, () => { col.reset(); hideOther(); });

  const drawProgress = () => {
    if (!col.total) { prog.innerHTML = ''; resetBtn.hidden = true; return; }
    const miss = col.missing();
    resetBtn.hidden = false;
    prog.innerHTML = `<p><strong>${col.count}/${col.total}장</strong> 받음${miss.length ? ` <small class="sub">· 남은 장: ${miss.length > 12 ? `${miss.slice(0, 12).join(', ')} 외 ${miss.length - 12}장` : miss.join(', ')}</small>` : ' ✓'}</p>${bar(col.count / col.total)}`;
  };
  const accept = async text => {
    if (!text || finishing) return;
    const r = col.add(text);
    if (r.other) {
      // 하던 전송은 그대로 두고 사용자에게 묻는다 (버그 2)
      otherText = text;
      otherBox.querySelector('[data-other-msg]').textContent = `다른 전송(${r.otherTotal}장짜리)의 QR이 읽혔어요. 지금 받던 전송(${col.count}/${col.total}장)은 그대로 두었어요. 어느 쪽을 받을지 고르세요.`;
      otherBox.hidden = false;
      return;
    }
    if (!r.ok) { say(r.reason, 'warn'); return; }
    if (r.isNew) { say(`${r.idx}번째 장을 읽었어요.`); hideOther(); }
    drawProgress();
    if (col.done) await complete();
  };
  otherBox.querySelector('[data-other-keep]').onclick = () => { hideOther(); say(`하던 전송을 계속 받아요. (${col.count}/${col.total}장)`); };
  otherBox.querySelector('[data-other-switch]').onclick = async () => {
    const t = otherText;
    hideOther();
    if (!t) return;
    col.switchTo(t);
    say('새 전송으로 바꿨어요. 처음부터 다시 모아요.', 'warn');
    drawProgress();
    if (col.done) await complete();
  };

  const complete = async () => {
    finishing = true;
    stopCam();
    let next;
    let raw;
    try {
      raw = await col.finish();
      next = parseBackup(raw); // 기존 백업 가져오기와 같은 형식 검사
    } catch (e) {
      say(korean(e, '받은 데이터를 읽지 못했어요. 처음부터 다시 받아 주세요.'), 'warn');
      col.reset(); drawProgress(); finishing = false;
      return;
    }
    hideOther();
    say('모든 장을 받았고 체크섬도 맞아요 ✓', 'ok');
    const pay = (next.월급기록 || []).map(r => r.월).sort();
    const lastPay = pay.length ? pay[pay.length - 1].replace('-', '년 ').replace(/년 0?/, '년 ') + '월' : '기록 없음';
    const when = raw.내보낸시각 ? new Date(raw.내보낸시각).toLocaleString('ko-KR') : '알 수 없음';
    const hasData = !!(ctx.state.프로필.온보딩완료 || ctx.state.계좌.length);
    const box = body.querySelector('#rx-confirm');
    box.innerHTML = `<section class="card confirm-card">
      <h2>받은 데이터 확인</h2>
      <table class="tbl"><tbody>
        <tr><td>계좌 수</td><td class="num">${next.계좌.length}개</td></tr>
        <tr><td>마지막 월급 기록 달</td><td class="num">${esc(lastPay)}</td></tr>
        <tr><td>내보낸 시각</td><td class="num">${esc(when)}</td></tr>
        <tr><td>생활비 기록</td><td class="num">${(next.생활비.지출 || []).length}건</td></tr>
      </tbody></table>
      <p class="warn"><strong>보내는 기기의 데이터로 이 기기 데이터가 바뀝니다.</strong> 이 기기에만 있던 기록은 사라져요.</p>
      ${hasData ? '<p class="hint">바꾸기 전에 지금 이 기기 데이터를 백업 파일로 저장해 두는 것을 권해요.</p>' : ''}
      <div class="actions">
        ${hasData ? '<button type="button" class="btn primary" data-apply="backup">지금 데이터 백업 저장 후 바꾸기</button><button type="button" class="btn" data-apply="nobackup">백업 없이 바꾸기</button>' : '<button type="button" class="btn primary" data-apply="nobackup">이 데이터로 바꾸기</button>'}
        <button type="button" class="btn ghost" data-cancel>취소</button>
      </div></section>`;
    box.scrollIntoView({ block: 'nearest' });
    box.querySelectorAll('[data-apply]').forEach(b => {
      b.onclick = async () => {
        if (b.dataset.apply === 'backup') downloadBackup(ctx.state, '바꾸기전_백업');
        await ctx.replace(next);
        leaveTransfer();
        toast('다른 기기의 데이터로 바꿨어요.');
        ctx.go('#/대시보드');
      };
    });
    box.querySelector('[data-cancel]').onclick = () => { box.innerHTML = ''; col.reset(); hideOther(); drawProgress(); finishing = false; say('취소했어요. 이 기기 데이터는 그대로예요.'); };
  };

  // 카메라로 읽기
  const scanLoop = async () => {
    while (scanning) {
      if (video.readyState >= 2 && video.videoWidth) {
        try { await accept(await Q.decodeFrom(video, video.videoWidth, video.videoHeight)); } catch (e) { say(korean(e, 'QR을 읽다가 문제가 생겼어요. 다시 비춰 주세요.'), 'warn'); }
      }
      await new Promise(r => setTimeout(r, 200));
    }
  };
  const noCamera = why => {
    say(`${why} "사진에서 읽기"로 QR 사진을 고르거나, 설정의 백업 파일 내보내기·가져오기로 옮겨 주세요.`, 'warn');
  };
  camBtn.onclick = async () => {
    if (stream) { stopCam(); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      noCamera(window.isSecureContext ? '이 기기·브라우저에서는 카메라를 쓸 수 없어요.' : '보안 주소(https)가 아니라 카메라를 쓸 수 없어요.');
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    } catch (e) {
      stream = null;
      if (e && e.name === 'NotAllowedError') noCamera('카메라 권한이 거부됐어요. 브라우저 설정에서 허용하면 쓸 수 있어요.');
      else if (e && (e.name === 'NotFoundError' || e.name === 'OverconstrainedError')) noCamera('이 기기에서 카메라를 찾지 못했어요.');
      else noCamera('카메라를 켜지 못했어요.');
      return;
    }
    video.srcObject = stream;
    body.querySelector('.cam-box').hidden = false;
    camBtn.textContent = '카메라 끄기';
    say(`QR을 화면 가운데에 비추세요. (읽는 방식: ${await Q.readerName()})`);
    scanning = true;
    scanLoop();
  };

  // 사진에서 읽기 (여러 장)
  body.querySelector('[data-photo]').onchange = async e => {
    const files = [...e.target.files];
    e.target.value = '';
    let ok = 0;
    for (const f of files) {
      try {
        const text = await Q.decodeFile(f);
        if (text) { ok += 1; await accept(text); } else say(`"${f.name}"에서 QR을 찾지 못했어요.`, 'warn');
      } catch (err) { say(`"${f.name}"을 읽지 못했어요.`, 'warn'); }
      if (finishing) break;
    }
    if (!finishing && files.length > 1) say(`사진 ${files.length}장 중 ${ok}장에서 QR을 읽었어요.`);
  };
  resetBtn.onclick = () => { col.reset(); hideOther(); drawProgress(); say('처음부터 다시 모아요.'); };
}
