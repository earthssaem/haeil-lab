/* 공통 유틸·해설 카드·토글 버튼·전역 일시 정지·전역 애니메이션 루프·탭 전환·알약 이름표·화살표 — 모든 탭이 쓰는 전역을 제공 */
/* ================= 공통 ================= */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
/* 해설 카드: '<b>제목</b> — 핵심 해설<small>추가 설명</small>' 형식의 글을 받아
   제목 · 핵심 해설(항상 보임) · 추가 설명('자세히 보기'로 펼치고 접음)으로 나눠 시뮬레이션 아래 카드에 표시.
   <small> 이 없으면 '자세히 보기' 버튼을 숨김. 반환값: set(html) 함수 */
function explainCard(el) {
  el.classList.add('explain');
  el.innerHTML = '<div class="ex-row"><span class="ex-title"></span><div class="ex-main" aria-live="polite"></div><button type="button" class="ex-btn" aria-expanded="false"></button></div><div class="ex-more"></div>';
  const title = el.querySelector('.ex-title'), main = el.querySelector('.ex-main'), btn = el.querySelector('.ex-btn'), more = el.querySelector('.ex-more');
  let open = false, last = null;
  const sync = () => { more.hidden = !open || btn.hidden; btn.setAttribute('aria-expanded', open); btn.textContent = open ? '접기 ▴' : '자세히 보기 ▾'; };
  btn.onclick = () => { open = !open; sync(); };
  return html => {
    if (html === last) return; last = html;   // 같은 글이면 다시 그리지 않음 (매 프레임 불러도 됨)
    const sm = html.match(/<small>([\s\S]*)<\/small>\s*$/);
    let body = sm ? html.slice(0, sm.index) : html;
    const m = body.match(/^<b>(.*?)<\/b>\s*—\s*/);
    if (m) body = body.slice(m[0].length);
    title.innerHTML = m ? m[1] : ''; title.hidden = !m;
    main.innerHTML = body.trim();
    more.innerHTML = sm ? sm[1] : ''; btn.hidden = !sm;
    el.hidden = !html; if (!html) open = false; // 카드를 숨기면 '자세히'도 접힌 상태로 되돌림
    sync();
  };
}
/* 관찰 보조 토글 버튼: .on 클래스·aria-pressed 를 함께 바꾸고 cb(켜짐 여부) 호출 */
function bindToggle(btn, cb) {
  btn.setAttribute('aria-pressed', btn.classList.contains('on'));
  btn.addEventListener('click', () => { const v = !btn.classList.contains('on'); setToggle(btn, v); cb(v); });
}
function setToggle(btn, v) { btn.classList.toggle('on', v); btn.setAttribute('aria-pressed', v); }
/* 선택 버튼 묶음(.seg): items = [{v, label, sub}] → 누르면 cb(v). 반환값: set(v) 로 선택 표시만 바꿈 */
function segButtons(el, items, cb) {
  el.innerHTML = '';
  const btns = items.map(it => {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.v = it.v; b.setAttribute('role', 'radio');
    b.innerHTML = it.label + (it.sub ? `<small>${it.sub}</small>` : '');
    b.onclick = () => cb(it.v); el.appendChild(b); return b;
  });
  return v => btns.forEach(b => { const on = b.dataset.v === String(v); b.classList.toggle('sel', on); b.setAttribute('aria-checked', on); });
}
const SVGNS = 'http://www.w3.org/2000/svg';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function E(tag, attrs = {}, children = []) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) {
    if (k === 'text') e.textContent = attrs[k];
    else if (k === 'html') e.innerHTML = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  for (const c of children) if (c) e.appendChild(c);
  return e;
}
function attr(e, o) { for (const k in o) e.setAttribute(k, o[k]); return e; }
const fmt = (v, d = 1) => (+v).toFixed(d).replace(/\.0+$/, '');
const f1 = v => v.toFixed(1);
/* 천 단위 쉼표 */
const num = v => Math.round(v).toLocaleString('ko-KR');

/* ---- 일시 정지 (전역) ---- */
let _paused = false;
const _pauseBtns = [];
function syncPauseBtns() { _pauseBtns.forEach(b => { b.textContent = _paused ? '▶ 재생' : '⏸ 일시 정지'; }); }
function registerPauseBtn(btn) { _pauseBtns.push(btn); btn.addEventListener('click', () => { _paused = !_paused; syncPauseBtns(); }); }
function setPaused(v) { _paused = v; syncPauseBtns(); }

/* ---- 전역 애니메이션 루프: 활성 탭의 frame(dt)만 호출 (탭을 바꾸면 이전 탭의 애니메이션은 멈춤 → 중복 실행 없음) ---- */
let activeTab = '1'; const frames = {}; const tabInit = {};
let _last = performance.now();
(function loop(now) {
  let dt = (now - _last) / 1000; _last = now; if (dt > 0.1) dt = 0.1;
  if (!_paused && frames[activeTab]) frames[activeTab](dt);
  requestAnimationFrame(loop);
})(performance.now());
/* 탭 전환: 탭 버튼 표시·패널 표시·활성 탭 바꾸고, 처음 여는 탭이면 tabInit 호출 */
function setTab(id) {
  const b = $(`.tab[data-tab="${id}"]`);
  $$('.tab').forEach(x => { x.classList.toggle('active', x === b); x.setAttribute('aria-selected', x === b); }); b.scrollIntoView({ inline: 'center', block: 'nearest' });
  $$('.panel').forEach(p => p.classList.toggle('active', p.id === 'panel' + id));
  activeTab = id; document.documentElement.removeAttribute('data-tab'); // 처음 표시(html[data-tab])를 거두고 .active 로만 보여 줌
  if (tabInit[activeTab]) { tabInit[activeTab](); }
  // 새로고침해도 보던 탭이 열리게 주소 끝에 탭 번호를 적어 둠 (#tab3). 1탭은 주소를 깨끗하게 둠. 방문 기록은 늘리지 않음
  try { history.replaceState(null, '', id === '1' ? location.pathname + location.search : '#tab' + id); } catch (e) { /* 주소를 못 바꾸는 환경이면 그냥 둠 */ }
}
$$('.tab').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
/* 처음 열 때 주소에 탭 번호가 있으면 그 탭으로 (모든 탭 스크립트를 읽은 뒤) */
addEventListener('DOMContentLoaded', () => {
  const m = location.hash.match(/^#tab([1-3])$/);
  if (m && m[1] !== activeTab) setTab(m[1]);
});
/* 제목을 누르면 처음 화면으로: 1탭 (각 탭에서 학생이 바꾼 것은 그대로 둠) */
function goHome() {
  if (activeTab !== '1') setTab('1');      // 이미 1탭이면 다시 부르지 않음 (애니메이션·그림 유지)
  $('.tabs').scrollLeft = 0;               // 좁은 화면에서 탭 줄을 옆으로 밀어 둔 경우 첫 탭이 보이게
  scrollTo(0, 0); document.body.scrollTop = 0;   // 아래로 스크롤한 경우 맨 위로
}
$('#homeLink').addEventListener('click', e => { e.preventDefault(); goHome(); });

/* ---- 글자 폭 추정 + 알약 이름표 ---- */
function textW(t, fs) { let w = 0; for (const ch of t) { w += /[가-힣]/.test(ch) ? fs * .92 : /[①-⑳ⓐ-ⓩ⏱↔→←↑↓≈·]/.test(ch) ? fs * .9 : /[A-Z]/.test(ch) ? fs * .64 : /[0-9a-z.]/.test(ch) ? fs * .55 : ch === ' ' ? fs * .3 : fs * .62; } return w; }
function pill(text, o = {}) {
  const fs = o.fs || 18, pad = o.pad ?? 10, h = fs + pad;
  const g = E('g', { class: 'pill' });
  const r = E('rect', { rx: h / 2, fill: o.bg || '#FFFDF8', stroke: o.line || '#24303A', 'stroke-width': o.sw ?? 2.5, y: -h / 2, height: h });
  const t = E('text', { 'text-anchor': 'middle', 'font-family': 'Jua', 'font-size': fs, fill: o.color || '#24303A', y: fs * .36, text });
  g.appendChild(r); g.appendChild(t);
  let w = 0, cur = null;
  const set = s => { if (s === cur) return; cur = s; t.textContent = s; w = textW(s, fs) + pad * 2; attr(r, { x: -w / 2, width: w }); };
  set(text);
  /* 그림 밖으로 잘리지 않게 x 를 [m, 960 - m] 안으로 (m = 반폭 + 여백) */
  const move = (x, y, W = 960) => { const m = w / 2 + 6; g.setAttribute('transform', `translate(${f1(clamp(x, m, W - m))},${f1(y)})`); };
  const show = v => { g.style.display = v ? '' : 'none'; };
  return { g, set, move, show, width: () => w };
}
/* 양방향 화살표 path */
function arrowD(x1, y1, x2, y2, h = 9) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const head = (x, y, dir) => `M${f1(x + Math.cos(dir + Math.PI * .8) * h)} ${f1(y + Math.sin(dir + Math.PI * .8) * h)} L${f1(x)} ${f1(y)} L${f1(x + Math.cos(dir - Math.PI * .8) * h)} ${f1(y + Math.sin(dir - Math.PI * .8) * h)}`;
  return `M${f1(x1)} ${f1(y1)} L${f1(x2)} ${f1(y2)} ${head(x2, y2, ang)} ${head(x1, y1, ang + Math.PI)}`;
}
/* 한쪽 화살표 path (꼬리 x1,y1 → 머리 x2,y2) */
function arrow1D(x1, y1, x2, y2, h = 10) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  return `M${f1(x1)} ${f1(y1)} L${f1(x2)} ${f1(y2)} M${f1(x2 + Math.cos(a + Math.PI * .8) * h)} ${f1(y2 + Math.sin(a + Math.PI * .8) * h)} L${f1(x2)} ${f1(y2)} L${f1(x2 + Math.cos(a - Math.PI * .8) * h)} ${f1(y2 + Math.sin(a - Math.PI * .8) * h)}`;
}
