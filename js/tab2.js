/* 탭2: 지진 해일 — 진원 위 해저면의 급격한 융기 → 해수 교란 → 긴 파의 전파 → 해안 접근을 한 단면에서 이어서 재생 (화면 전환·확대 없음).
   가로 축척은 실제 거리에 비례(1.5 px = 1 km)해, 그림 속 파봉 사이 간격이 곧 파장. 세로(수심·파고)는 크게 과장.
   전파: 천해파 속도 c = √(gh) 로 x 마다 도달 시간 τ(x) = ∫dx/c 를 미리 계산하고, 수면 η(x,t) = A(x)·S(t − tₑ − τ(x)).
   S 는 파봉 3개짜리 파열(주기 T 일정)이라 그 자리의 파장은 저절로 c·T 가 되고 속도·파장 변화가 서로 맞음.
   파고: 그린 법칙 A ∝ h^(−1/4) 를 쓰되 tanh 로 최댓값을 두어 해안에서 무한히 커지지 않게 함 (학습용 단순 모형) */
/* ================= 탭2: 지진 해일 ================= */
(function () {
  const TX = TEXT.tab2;
  const svg = $('#svg2');
  const INK = '#24303A', RED = '#E8553E', SEA = '#2E7DB0';
  const G = 9.8, PXKM = 1.5;                 // 중력 가속도, 가로 축척(px/km)
  const SCALE = 440;                       // 애니메이션 1 s = 실제 440 s (약 7분)
  const TREAL = 900, T = TREAL / SCALE, OM = 2 * Math.PI / T;   // 주기 15분 (모형), 애니메이션 주기
  const Y0 = 170, DS = 4.2;                // 평균 해수면, 수심 그리기 (y = Y0 + DS·√h, 실제 비율 아님)
  const XS = 100, XDEEP = 620, XSHELF = 660, XSH2 = 800, XSHORE = 880, HMIN = 25;   // 진원, 깊은 바다 끝, 대륙붕 시작·끝, 해안선, 계산에 쓰는 최소 수심
  const A0 = 11, AMAX = 38;                // 깊은 바다 진폭(px), 최대 진폭(px)
  const TSLIP = 1.0, TE = 4.2;             // 단층 운동 시각, 교란이 퍼지기 시작하는 시각 (애니메이션 s)
  const N = 961;
  let H = 4000;                            // 깊은 바다 수심 (m)
  const hx = new Float64Array(N), cx = new Float64Array(N), tau = new Float64Array(N), amp = new Float64Array(N), dpx = new Float64Array(N);
  /* 수심 (m): 깊은 바다 → 대륙 사면 → 대륙붕(200 → 60 m) → 해안 근처(60 → 0 m) */
  function depth(x) {
    if (x <= XDEEP) return H;
    if (x <= XSHELF) return 200 + (H - 200) * (1 - smooth(XDEEP, XSHELF, x));
    if (x <= XSH2) return 200 - 140 * (x - XSHELF) / (XSH2 - XSHELF);
    if (x < XSHORE) return 60 * Math.pow((XSHORE - x) / (XSHORE - XSH2), 1.3);
    return 0;
  }
  const cms = h => Math.sqrt(G * h);       // m/s
  function build() {
    for (let x = 0; x < N; x++) {
      const h = depth(x); hx[x] = h; dpx[x] = h > 0 ? DS * Math.sqrt(h) : 0;
      cx[x] = cms(Math.max(h, HMIN)) / 1000 * PXKM * SCALE;            // px/s
      // 진폭: 진원 왼쪽(먼 바다로 가는 파)은 A0, 해안 쪽은 그린 법칙 A0·(H/h)^¼ 를 tanh 로 눌러 AMAX 를 넘지 않게 (진원에서 A0)
      const g = A0 * Math.pow(H / Math.max(h, HMIN), .25);
      amp[x] = x < XS ? A0 : AMAX * Math.tanh(g / AMAX) * A0 / (AMAX * Math.tanh(A0 / AMAX));
    }
    tau[XS] = 0;
    for (let x = XS + 1; x < N; x++) tau[x] = tau[x - 1] + 2 / (cx[x - 1] + cx[x]);
    for (let x = XS - 1; x >= 0; x--) tau[x] = tau[x + 1] + 2 / (cx[x + 1] + cx[x]);
    // ③ 은 앞 파봉이 깊은 바다 끝에 닿을 때 끝남 → 그때 이웃한 두 파봉이 모두 깊은 바다에 있어 깊은 바다의 파장을 잴 수 있음
    stageT = [0, 3.0, TE + 1.3, TE + tau[XDEEP]];
    TEND = TE + 2 * T + tau[XSHORE] + 3;
  }
  let stageT = [], TEND = 0;
  /* 오른쪽으로 가는 파에서 도달 시간이 v 인 곳의 x (이진 탐색) */
  function xAtTau(v) {
    let lo = XS, hi = XSHORE; if (v <= 0) return XS; if (v >= tau[hi]) return hi + 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tau[m] < v) lo = m; else hi = m; }
    return lo + (v - tau[lo]) / (tau[hi] - tau[lo]);
  }
  const at = (A, x) => { const i = clamp(Math.floor(x), 0, N - 2), r = x - i; return A[i] + (A[i + 1] - A[i]) * r; };
  /* 원천 시간 함수: 파봉 3개(s = 0, T, 2T), 주기 T 일정. 둘째 파봉이 조금 더 큼 */
  const S = s => s < -T / 4 || s > 2.25 * T ? 0 : Math.cos(OM * s) * (1 + .1 * Math.sin(Math.PI * clamp(s, 0, 2 * T) / (2 * T)));
  const Sq = s => s < -T / 4 ? 0 : s > 2.25 * T ? 0 : Math.sin(OM * s);   // 물 입자 앞뒤 이동(위상이 1/4 주기 다름)
  const uplift = t => smooth(TSLIP, TSLIP + .35, t);
  const hump = x => { const v = Math.abs(tau[Math.round(clamp(x, 0, N - 1))]) * OM; return v < Math.PI / 2 ? Math.cos(v) : 0; };
  function eta(x, t) {
    if (x >= XSHORE) return 0;
    let e;
    if (t < TE) e = A0 * uplift(t) * hump(x);
    else e = at(amp, x) * S(t - TE - at(tau, x));
    return Math.max(e, -.75 * at(dpx, x));     // 얕은 곳에서 파저가 해저 아래로 내려가지 않게
  }

  /* ---- 그리기 층 ---- */
  svg.appendChild(E('rect', { x: -10, y: -10, width: 980, height: 560, fill: '#BFE3F5' }));
  const crust = E('path', { fill: '#C9A86A', stroke: INK, 'stroke-width': 3, 'stroke-linejoin': 'round' });
  const water = E('path', { fill: SEA, stroke: INK, 'stroke-width': 3, 'stroke-linejoin': 'round' });
  const runup = E('path', { fill: SEA, 'fill-opacity': .85, stroke: INK, 'stroke-width': 2.5 });
  const land = E('path', { fill: '#E6C377', stroke: INK, 'stroke-width': 3, 'stroke-linejoin': 'round' });
  svg.append(crust, water);
  const LANDY = x => Y0 - (x - XSHORE) * .55;
  land.setAttribute('d', `M${XSHORE} ${Y0} L970 ${f1(LANDY(970))} L970 560 L${XSHORE - 2} 560 Z`);
  svg.append(land);
  const town = E('g'); svg.appendChild(town);
  [[905, 22, 34], [930, 18, 46], [952, 20, 28]].forEach(([x, w, h]) => {
    const y = LANDY(x); town.appendChild(E('rect', { x: x - w / 2, y: y - h, width: w, height: h + 4, fill: '#FFFDF8', stroke: INK, 'stroke-width': 2.5 }));
    for (let j = 8; j < h - 4; j += 10) town.appendChild(E('line', { x1: x - w / 2 + 5, x2: x + w / 2 - 5, y1: y - h + j, y2: y - h + j, stroke: '#8A8276', 'stroke-width': 2 }));
  });
  svg.appendChild(runup);
  const msl = E('line', { x1: 0, x2: XSHORE + 40, y1: Y0, y2: Y0, stroke: INK, 'stroke-width': 2, 'stroke-dasharray': '3 6', 'stroke-linecap': 'round', opacity: .7 });
  svg.appendChild(msl);
  /* 단층·진원·융기 화살표·물기둥 화살표 */
  const faultG = E('g'); svg.appendChild(faultG);
  const fault = E('path', { stroke: RED, 'stroke-width': 3.5, 'stroke-dasharray': '9 6', fill: 'none' });
  const star = E('path', { fill: '#FFE082', stroke: INK, 'stroke-width': 2.5, 'stroke-linejoin': 'round' });
  const upA = E('path', { stroke: RED, 'stroke-width': 5, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  faultG.append(fault, star, upA);
  const colG = E('g'); svg.appendChild(colG);
  const colA = [-50, 0, 50].map(() => { const a = E('path', { stroke: '#FFFDF8', 'stroke-width': 3.5, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }); colG.appendChild(a); return a; });
  /* 물 입자 (토글) */
  const dotG = E('g'); svg.appendChild(dotG);
  const DOTX = [380, 740], DOTF = [.25, .55, .85];
  const dots = []; DOTX.forEach(x0 => DOTF.forEach(fr => { const c = E('circle', { r: 5.5, fill: '#FFE082', stroke: INK, 'stroke-width': 2 }); dotG.appendChild(c); dots.push({ x0, fr, c }); }));
  const dotHome = []; DOTX.forEach(x0 => DOTF.forEach(fr => { const c = E('line', { stroke: '#FFFDF8', 'stroke-width': 1.5, opacity: .7 }); dotG.insertBefore(c, dotG.firstChild); dotHome.push({ x0, fr, c }); }));
  /* 관찰 표시: 파장(이웃한 두 파봉) · 파고(파봉 – 파저) · 속도 */
  const obsG = E('g'); svg.appendChild(obsG);
  const lGuide = E('path', { stroke: '#7B4FB0', 'stroke-width': 2, 'stroke-dasharray': '4 4', fill: 'none' });
  const lArrow = E('path', { stroke: '#7B4FB0', 'stroke-width': 3.5, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  const hLines = E('path', { stroke: INK, 'stroke-width': 2, 'stroke-dasharray': '5 4', fill: 'none' });
  const hArrow = E('path', { stroke: '#C7432E', 'stroke-width': 3.5, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  const vArrow = E('path', { stroke: INK, 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  obsG.append(lGuide, lArrow, hLines, hArrow, vArrow);
  /* 이름표 */
  const labG = E('g'); svg.appendChild(labG);
  const FS = 17;
  const pL = pill('', { fs: FS, bg: '#7B4FB0', color: '#fff' }), pH = pill(TX.lbl.height, { fs: FS, bg: '#C7432E', color: '#fff' }), pV = pill('', { fs: FS });
  const pUp = pill(TX.lbl.uplift, { fs: FS, bg: '#FFE082' }), pCol = pill(TX.lbl.column, { fs: FS }), pDots = pill(TX.lbl.dots, { fs: 15 });
  const pEpi = pill(TX.lbl.epi, { fs: 15 }), pClock = pill('', { fs: 16 }), pMsl = pill(TX.lbl.msl, { fs: 15 });
  const pDeep = pill('', { fs: 16 }), pShelf = pill(TX.lbl.shelf, { fs: 16 }), pCoast = pill(TX.lbl.coast, { fs: 16 });
  const scale = E('g', {}, [E('path', { d: 'M240 516 V526 H390 V516', stroke: INK, 'stroke-width': 2.5, fill: 'none' }), E('text', { x: 315, y: 512, 'text-anchor': 'middle', 'font-family': 'Jua', 'font-size': 16, fill: INK, text: TX.lbl.scale })]);
  labG.append(scale, ...[pDeep, pShelf, pCoast, pMsl, pEpi, pUp, pCol, pDots, pL, pH, pV, pClock].map(p => p.g));
  pMsl.move(70, Y0 - 18); pCoast.move(922, Y0 + 150);

  let t = 0, playing = false, stopAt = null, dotsOn = false;
  const setCap = explainCard($('#ex2'));
  const stageAt = tt => tt < stageT[1] ? 0 : tt < stageT[2] ? 1 : tt < stageT[3] ? 2 : 3;
  const regionOf = x => x < XDEEP + 20 ? 0 : x < XSH2 ? 1 : 2;

  function render(dt) {
    if (playing) {
      t += dt;
      if (stopAt !== null && t >= stopAt) { t = stopAt; stopAt = null; playing = false; syncPlay(); }
      if (t >= TEND) { t = TEND; playing = false; syncPlay(); }
    }
    draw();
  }
  function draw() {
    const up = uplift(t);
    /* 해저(융기 포함)와 수면 */
    let bed = '', surf = '';
    for (let x = 0; x <= XSHORE; x += 3) {
      const yb = Y0 + at(dpx, x) - 10 * up * hump(x);
      bed += (bed ? 'L' : 'M') + x + ' ' + f1(yb);
    }
    bed += `L${XSHORE} ${Y0}`;
    for (let x = 0; x <= XSHORE; x += 2) surf += (surf ? 'L' : 'M') + x + ' ' + f1(Y0 - eta(x, t));
    crust.setAttribute('d', bed + `L${XSHORE} 560 L-10 560 L-10 ${f1(Y0 + dpx[0])} Z`);
    // 물: 수면 → 해저를 거꾸로
    let back = ''; for (let x = XSHORE; x >= 0; x -= 3) back += `L${x} ${f1(Y0 + at(dpx, x) - 10 * up * hump(x))}`;
    water.setAttribute('d', surf + `L${XSHORE} ${Y0}` + back + 'Z');
    /* 해안: 해안선 바로 앞 수위만큼 육지로 밀려 올라감 (학습용 단순 표현) */
    const es = Math.max(0, eta(XSHORE - 2, t)), xr = XSHORE + es / .55;
    runup.style.display = es > .5 ? '' : 'none';
    if (es > .5) runup.setAttribute('d', `M${XSHORE - 2} ${f1(Y0 - es)} L${f1(xr)} ${f1(Y0 - es)} L${XSHORE} ${Y0} Z`);
    /* 단층·진원 */
    const yb0 = Y0 + DS * Math.sqrt(H);
    fault.setAttribute('d', `M${XS + 55} ${f1(yb0 - 10 * up + 4)} L${XS - 30} ${f1(yb0 + 70)}`);
    const sx = XS - 18, sy = yb0 + 52; let sd = '';   // 진원(별)
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 6 : 14, a = -Math.PI / 2 + i * Math.PI / 5; sd += (i ? 'L' : 'M') + f1(sx + r * Math.cos(a)) + ' ' + f1(sy + r * Math.sin(a)); }
    star.setAttribute('d', sd + 'Z');
    const st = stageAt(t);
    upA.style.display = st === 0 && t > TSLIP - .3 ? '' : 'none';
    upA.setAttribute('d', arrow1D(XS + 25, yb0 + 40, XS + 25, yb0 + 8 - 10 * up, 10));
    pUp.show(st === 0); pUp.move(XS + 170, yb0 - 40);
    pEpi.move(sx - 46, sy);
    /* ② 물기둥 전체가 들어 올려짐 */
    const colOn = st === 1 && t < TE + .4;
    colG.style.display = colOn ? '' : 'none'; pCol.show(colOn);
    if (colOn) colA.forEach((a, i) => { const x = XS + [-50, 0, 50][i], y1 = Y0 + at(dpx, x) - 18, y2 = Y0 - eta(x, t) + 14; a.setAttribute('d', arrow1D(x, y1, x, y2, 9)); });
    pCol.move(XS + 30, Y0 - 52);
    /* 물 입자: 제자리 근처에서 앞뒤로 (움직임 확대) */
    dotG.style.display = dotsOn ? '' : 'none'; pDots.show(dotsOn);
    if (dotsOn) {
      dots.forEach(({ x0, fr, c }, i) => {
        const d = at(dpx, x0), s = t < TE ? null : t - TE - at(tau, x0);
        const xi = s === null ? 0 : 14 * Sq(s) * at(amp, x0) / A0 * (x0 > 600 ? .8 : 1);
        const ze = eta(x0, t) * (1 - fr);
        attr(c, { cx: f1(x0 + xi), cy: f1(Y0 + d * fr - ze) });
        const hm = dotHome[i]; attr(hm.c, { x1: x0, x2: x0, y1: f1(Y0 + d * fr - 9), y2: f1(Y0 + d * fr + 9) });
      });
      pDots.move(DOTX[0] + 150, Y0 + at(dpx, DOTX[0]) * .4);
    }
    /* 관찰 표시 */
    const tp = t - TE;
    // 아직 바다에 있는 가장 앞 파봉 k (뒤 파봉 k+1 이 이미 생겼을 때 파장 표시)
    let k = 0; while (k < 3 && tp - k * T >= 0 && xAtTau(tp - k * T) > XSHORE - 6) k++;
    const cr = j => xAtTau(tp - j * T);
    const showV = st >= 2 && k < 3 && tp - k * T >= 0;
    pV.show(showV); vArrow.style.display = showV ? '' : 'none';
    let readX = null;
    if (showV) {
      const x0 = cr(k), y0 = Y0 - eta(x0, t);
      readX = x0;
      const c = cms(Math.max(at(hx, x0), HMIN));
      // 속도: 파봉 아래 물속(해안 가까이에서는 왼쪽)에 → 와 함께
      const yv = Y0 + 96, left = x0 > 760;
      pV.set(TX.lbl.speed(c)); pV.move(left ? x0 - 18 - pV.width() / 2 : x0 + 18 + pV.width() / 2, yv);
      vArrow.setAttribute('d', arrow1D(x0 - 8, yv, x0 + 8, yv, 7));
    }
    const showL = st >= 2 && k < 2 && tp - (k + 1) * T >= 0 && cr(k + 1) > XS + 20;
    [lGuide, lArrow].forEach(e => e.style.display = showL ? '' : 'none'); pL.show(showL);
    let Lkm = null, Hrel = null;
    if (showL) {
      const xa = cr(k), xb = cr(k + 1), ya = Y0 - eta(xa, t), yb = Y0 - eta(xb, t), yl = Math.max(Math.min(ya, yb) - 40, 100);   // 오른쪽 위 칩(HTML)과 겹치지 않게 위쪽 한계
      lArrow.setAttribute('d', arrowD(xb, yl, xa, yl, Math.min(9, (xa - xb) / 3)));
      lGuide.setAttribute('d', `M${f1(xa)} ${f1(yl - 6)} V${f1(ya - 4)} M${f1(xb)} ${f1(yl - 6)} V${f1(yb - 4)}`);
      Lkm = (xa - xb) / PXKM;
      pL.set(TX.lbl.length(Lkm)); pL.move((xa + xb) / 2, yl - 21);
      // 파고: 파봉 k 와 바로 뒤 파저(k + ½) 의 높이 차
      const xt = xAtTau(tp - (k + .5) * T), yt = Y0 - eta(xt, t);
      hLines.setAttribute('d', `M${f1(xt - 10)} ${f1(ya)} H${f1(xa + 10)} M${f1(xt - 10)} ${f1(yt)} H${f1(xa + 10)}`);
      const xm = (xa + xt) / 2;
      hArrow.setAttribute('d', arrowD(xm, ya, xm, yt, Math.min(8, (yt - ya) / 3)));
      pH.move(xm, Math.max(ya, yt) + 24);   // 파고 이름표는 파저 아래
      Hrel = (yt - ya) / (2 * A0);
    }
    [hLines, hArrow].forEach(e => e.style.display = showL ? '' : 'none'); pH.show(showL);
    /* 시계·구역 이름 */
    const realMin = Math.max(0, t - TSLIP) * SCALE / 60;
    pClock.set(t < TSLIP ? TX.lbl.clock0 : TX.lbl.clock(realMin)); pClock.move(135, 520);
    pDeep.set(TX.lbl.deep(H)); pDeep.move(440, Math.min(Y0 + DS * Math.sqrt(H) + 26, 488));
    pShelf.move(735, Y0 + 150);
    /* 배지·단계·해설·카드 */
    $('#badge2').textContent = TX.steps[st].badge;
    stepEls.forEach((li, i) => { li.classList.toggle('on', i === st); li.classList.toggle('done', i < st); const e = i < 3 ? stageT[i + 1] : TEND; li.querySelector('.st-bar i').style.width = (clamp((t - stageT[i]) / (e - stageT[i]), 0, 1) * 100).toFixed(0) + '%'; });
    setCap(t >= TEND - .01 ? TX.capEnd : TX.cap[st](H, Lkm));
    readout(readX, Lkm, Hrel);
  }

  /* ---- 오른쪽 카드 ---- */
  const ro = $('#ro2'), sp = $('#sp2');
  let roKey = '';
  function readout(x, Lkm, Hrel) {
    const reg = x === null ? -1 : regionOf(x);
    const h = x === null ? null : at(hx, x);
    const rows = x === null ? (t > TE + T ? TX.ro.done : TX.ro.none) : [
      [TX.ro.where, TX.ro.whereV(TX.region[reg], Math.max(h, HMIN))],
      [TX.ro.speed, TX.ro.speedV(cms(Math.max(h, HMIN)))],
      [TX.ro.length, Lkm === null ? TX.ro.wait : TX.ro.lengthV(Lkm)],
      [TX.ro.height, Hrel === null ? TX.ro.wait : TX.ro.heightV(Hrel)],
      [TX.ro.period, TX.ro.periodV(TREAL / 60)],
    ];
    const key = JSON.stringify(rows);
    if (key !== roKey) { roKey = key; ro.innerHTML = rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join(''); }
    sp.querySelectorAll('.spd-row').forEach((r, i) => r.classList.toggle('now', i === reg));
  }
  function speedCard() {
    $('#v2-h').textContent = num(H) + ' m';
    $('#f2').innerHTML = TX.formula;
    sp.innerHTML = [[TX.region[0], H], [TX.region[1], 200], [TX.region[2], HMIN]].map(([n, h]) => { const c = cms(h); return `<div class="spd-row"><span>${n}</span><em>${num(h)} m</em><b>${TX.ro.speedV(c)}</b></div>`; }).join('');
    $('#n2-speed').innerHTML = TX.noteSpeed(H);
  }

  /* ---- 조작 ---- */
  $('#chip2').textContent = TX.chip;
  $('#t2-h-steps').textContent = TX.hSteps; $('#t2-h-speed').textContent = TX.hSpeed; $('#t2-h-now').textContent = TX.hNow; $('#t2-h-lim').textContent = TX.hLim;
  $('#t2-lim').innerHTML = TX.limits; $('#l2-h').textContent = TX.lh;
  const playBtn = $('#t2-play');
  $('#t2-restart').textContent = TX.restart; $('#t2-prev').textContent = TX.prev; $('#t2-next').textContent = TX.next; $('#t2-dots').textContent = TX.dots;
  const stepEls = TX.steps.map((s, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<button type="button" class="st-btn"><span class="st-num">${i + 1}</span><span class="st-txt"><b>${s.name}</b><small>${s.where}</small></span></button><span class="st-bar"><i></i></span>`;
    li.querySelector('button').onclick = () => goStage(i);
    $('#st2').appendChild(li); return li;
  });
  function syncPlay() { playBtn.textContent = playing ? TX.pause : t >= TEND - .01 ? TX.replay : TX.play; }
  function play() { if (t >= TEND - .01) t = 0; playing = true; setPaused(false); syncPlay(); }
  /* 단계별 보기: 그 단계 처음부터 재생하고 단계의 마지막 장면에서 멈춤 */
  function goStage(i) { i = clamp(i, 0, 3); t = stageT[i]; stopAt = i < 3 ? stageT[i + 1] - .001 : null; playing = true; setPaused(false); syncPlay(); draw(); }
  playBtn.onclick = () => { if (playing) { playing = false; stopAt = null; } else { stopAt = null; play(); } syncPlay(); };
  $('#t2-restart').onclick = () => { t = 0; stopAt = null; playing = true; setPaused(false); syncPlay(); draw(); };
  $('#t2-prev').onclick = () => { const st = stageAt(t); goStage(t - stageT[st] < .6 ? st - 1 : st); };
  $('#t2-next').onclick = () => { const st = stageAt(t); goStage(!playing && t - stageT[st] < .01 ? st : Math.min(3, st + 1)); };   // 처음(아직 안 본 단계)이면 그 단계부터
  bindToggle($('#t2-dots'), v => { dotsOn = v; draw(); });
  const rH = $('#r2-h');
  rH.addEventListener('input', () => { H = +rH.value; build(); if (t > TEND) t = TEND; speedCard(); draw(); });
  build(); speedCard(); syncPlay(); draw();
  frames['2'] = render;
  tabInit['2'] = () => { draw(); };
})();
