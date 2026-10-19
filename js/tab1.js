/* 탭1: 폭풍 해일 — 바다에서 해안 마을까지의 단면.
   평소 해수면(평균 해수면)은 점선으로 고정, 조석 수위는 다른 모양의 선으로 따로 그리고,
   그 위로 더 올라간 부분(기압 효과 + 바람 효과)을 '폭풍 해일(기상 요인에 따른 추가 상승)'로 구분해 해안의 수위 막대에 쌓아 보여 줌.
   기압 효과: 1 hPa ↓ → 약 1 cm ↑ (이상적인 정적 근사, 태풍 중심에서 해안까지 같고 먼 바다로 갈수록 작아짐)
   바람 효과: 풍속²에 비례하는 학습용 비교값 (해안 쪽으로 갈수록 쌓임) — 실제 예측값처럼 cm 로 표시하지 않음.
   그림·수치·해설이 모두 같은 상태값 S 로 함께 갱신됨. 세로 방향은 크게 확대 (VS px/m) */
/* ================= 탭1: 폭풍 해일 ================= */
(function () {
  const TX = TEXT.tab1;
  const svg = $('#svg1');
  const INK = '#24303A', TIDE = '#5E6FA3', PRES = '#8C7BB5', WIND = '#1F9E8F';
  const Y0 = 300, VS = 45;                 // 평균 해수면(px), 세로 축척 px/m
  const P0 = 1013, XC = 540, XG = 630;     // 주변 기압(hPa), 태풍 중심(x), 해안 수위 막대(x)
  const TIDES = { low: -0.8, mean: 0, high: 0.8 };   // 조석 수위 (학습용 값, m)
  const WMAX = 1.5;                        // 풍속 40 m/s 일 때 바람 효과 (학습용 비교값, m)
  /* 해저·해안 지형 (x px → 해발 m) */
  const LAND = [[-20, -5.3], [560, -2.2], [620, -1.2], [680, 0], [720, 1.2], [745, 1.9], [760, 2.1], [850, 2.4], [880, 2.8], [905, 4.5], [930, 5.6], [980, 5.8]];
  const z = x => { for (let i = 1; i < LAND.length; i++) if (x <= LAND[i][0]) { const [a, za] = LAND[i - 1], [b, zb] = LAND[i]; return za + (zb - za) * (x - a) / (b - a); } return LAND[LAND.length - 1][1]; };
  const yOf = m => Y0 - m * VS;
  const gP = x => x >= XC ? 1 : Math.exp(-Math.pow((x - XC) / 300, 2));   // 기압 효과의 분포 (태풍 중심~해안 = 1)
  const gW = x => Math.pow(clamp((x - 180) / 520, 0, 1), 2);             // 바람 효과의 분포 (해안 쪽으로 쌓임)

  const S = { p: 960, u: 25, tide: 'high', pOn: true, wOn: true, last: 'init' };
  const cur = { T: TIDES.high, P: 0, W: 0 };   // 그림에 보이는 값 (목표값을 부드럽게 따라감)
  const target = () => ({ T: TIDES[S.tide], P: S.pOn ? (P0 - S.p) / 100 : 0, W: S.wOn ? WMAX * Math.pow(S.u / 40, 2) : 0 });

  /* ---- 그리기 층 ---- */
  const sky = E('rect', { x: -10, y: -10, width: 980, height: 560, fill: '#BFE3F5' }); svg.appendChild(sky);
  const cloud = E('path', { d: 'M300 70 a30 30 0 0 1 58 -16 a36 36 0 0 1 70 8 a24 24 0 0 1 6 46 l-130 0 a26 26 0 0 1 -4 -38 Z M640 50 a22 22 0 0 1 44 -12 a28 28 0 0 1 54 6 a18 18 0 0 1 4 36 l-100 0 a20 20 0 0 1 -2 -30 Z', fill: '#EEF2F5', stroke: INK, 'stroke-width': 3 });
  svg.appendChild(cloud);
  const landP = E('path', { fill: '#E6C377', stroke: INK, 'stroke-width': 3, 'stroke-linejoin': 'round' });
  const bedP = E('path', { fill: '#C9A86A' });
  svg.append(bedP, landP);
  /* 집: 낮은 땅(저지대 마을) 3채 · 높은 지대 1채 */
  const houses = E('g'); svg.appendChild(houses);
  [[790, 26], [832, 30], [868, 24], [938, 28]].forEach(([x, w]) => {
    const g = z(x), y = yOf(g);
    houses.appendChild(E('path', { d: `M${x - w / 2} ${y} V${y - w * .8} L${x} ${y - w * 1.35} L${x + w / 2} ${y - w * .8} V${y} Z`, fill: '#FFFDF8', stroke: INK, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
    houses.appendChild(E('rect', { x: x - 4, y: y - 12, width: 8, height: 12, fill: '#8A8276' }));
  });
  const water = E('path', { fill: '#2E7DB0', 'fill-opacity': .82, stroke: INK, 'stroke-width': 3, 'stroke-linejoin': 'round' });
  svg.appendChild(water);
  /* 기압: 공기가 수면을 누르는 화살표 (길이 ∝ 그 자리의 기압) */
  const pressG = E('g'); svg.appendChild(pressG);
  const PX = []; for (let x = 140; x <= 600; x += 66) PX.push(x);
  const pArrows = PX.map(() => { const a = E('path', { stroke: '#5A6B7A', 'stroke-width': 3.5, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }); pressG.appendChild(a); return a; });
  /* 바람: 해안 쪽(오른쪽)으로 부는 화살표 두 줄 + 물속 해수 이동 화살표 */
  const windG = E('g'); svg.appendChild(windG);
  const wArrows = []; for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) { const a = E('path', { stroke: WIND, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }); windG.appendChild(a); wArrows.push({ a, r, i }); }
  const flowG = E('g'); svg.appendChild(flowG);
  const fArrows = [0, 1, 2].map(() => { const a = E('path', { stroke: '#E6F4F2', 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }); flowG.appendChild(a); return a; });
  /* 기준선: 평소 해수면(점선, 고정) · 조석 수위(긴 점선) */
  const mslL = E('line', { x1: 0, x2: 960, y1: Y0, y2: Y0, stroke: INK, 'stroke-width': 2.5, 'stroke-dasharray': '3 6', 'stroke-linecap': 'round' });
  const tideL = E('line', { x1: 0, x2: 960, stroke: TIDE, 'stroke-width': 3, 'stroke-dasharray': '14 8' });
  svg.append(tideL, mslL);
  /* 해안 수위 막대 */
  const gauge = E('g'); svg.appendChild(gauge);
  gauge.appendChild(E('rect', { x: XG - 3, y: Y0 - 175, width: 6, height: 235, fill: '#FFFDF8', stroke: INK, 'stroke-width': 2 }));
  for (let m = -1; m <= 3; m++) gauge.appendChild(E('line', { x1: XG - 9, x2: XG + 9, y1: yOf(m), y2: yOf(m), stroke: INK, 'stroke-width': m ? 1.5 : 2.5 }));
  const segT = E('rect', { x: XG + 6, width: 16, fill: TIDE, stroke: INK, 'stroke-width': 1.5 });
  const segP = E('rect', { x: XG + 6, width: 16, fill: PRES, stroke: INK, 'stroke-width': 1.5 });
  const segW = E('rect', { x: XG + 6, width: 16, fill: WIND, stroke: INK, 'stroke-width': 1.5 });
  const brT = E('path', { stroke: TIDE, 'stroke-width': 3, fill: 'none' }), brS = E('path', { stroke: '#C7432E', 'stroke-width': 3, fill: 'none' });
  const topMark = E('path', { fill: '#C7432E', stroke: INK, 'stroke-width': 1.5 });
  gauge.append(segT, segP, segW, brT, brS, topMark);
  /* 이름표 */
  const labG = E('g'); svg.appendChild(labG);
  const pMSL = pill(TX.lbl.msl, { fs: 15, pad: 8 }), pTide = pill('', { fs: 15, pad: 8, color: '#fff', bg: TIDE });
  const pSurge = pill(TX.lbl.surge, { fs: 15, pad: 8, color: '#fff', bg: '#C7432E' }), pTideB = pill(TX.lbl.tideB, { fs: 15, pad: 8, color: '#fff', bg: TIDE });
  const pLow = pill('', { fs: 16, pad: 9 }), pWind = pill('', { fs: 15, pad: 8, color: '#fff', bg: WIND }), pPush = pill(TX.lbl.push, { fs: 14, pad: 7 });
  const pAir = pill(TX.lbl.air, { fs: 14, pad: 7 }), pFlood = pill(TX.lbl.flood, { fs: 14, pad: 7, bg: '#FFE082' });
  const pSea = pill(TX.lbl.sea, { fs: 16, pad: 8 }), pTown = pill(TX.lbl.town, { fs: 14, pad: 7 }), pHigh = pill(TX.lbl.high, { fs: 14, pad: 7 });
  const tP = E('text', { 'font-family': 'Jua', 'font-size': 13, fill: INK, text: TX.lbl.segP }), tW = E('text', { 'font-family': 'Jua', 'font-size': 13, fill: INK, text: TX.lbl.segW });
  const lowMark = E('g', {}, [E('circle', { r: 19, fill: '#E8553E', stroke: INK, 'stroke-width': 3 }), E('text', { y: 7, 'text-anchor': 'middle', 'font-family': 'Jua', 'font-size': 20, fill: '#fff', text: TX.lbl.lowSym })]);
  lowMark.setAttribute('transform', `translate(${XC},40)`);
  labG.append(lowMark, ...[pMSL, pTide, pTideB, pSurge, pLow, pWind, pPush, pAir, pFlood, pSea, pTown, pHigh].map(p => p.g), tP, tW);
  pSea.move(110, 420); pTown.move(830, yOf(2.4) + 26); pHigh.move(925, yOf(5.6) + 30);
  pLow.move(XC, 80);

  let tt = 0;
  const setCap = explainCard($('#ex1'));
  function render(dt) {
    tt += dt;
    const tg = target(), k = 1 - Math.exp(-dt * 4);
    for (const key in cur) cur[key] += (tg[key] - cur[key]) * (dt ? k : 1);
    const { T, P, W } = cur, CL = T + P + W;
    const eta = x => T + P * gP(x) + W * gW(x);
    /* 수면이 땅과 만나는 곳 (해안선, 침수되면 육지 안쪽으로) */
    let xEnd = 600; while (xEnd < 975 && z(xEnd) < eta(xEnd)) xEnd += 1;
    /* 수면: 작은 잔물결만 (큰 파도가 아니라 해수면 자체가 높아지는 것을 보이도록) */
    const ra = .8 + (S.wOn ? S.u : 0) * .05;
    let d = '', back = '';
    for (let x = -10; x < xEnd; x += 5) {
      const r = ra * Math.sin((x - tt * 26) / 34 * 2 * Math.PI) * clamp((640 - x) / 80, 0, 1);
      d += (d ? 'L' : 'M') + x + ' ' + f1(yOf(eta(x)) - r);
    }
    d += `L${xEnd} ${f1(yOf(eta(xEnd)))}`;
    for (let x = xEnd; x >= -10; x -= 10) back += `L${x} ${f1(yOf(z(x)))}`;
    water.setAttribute('d', d + back + 'Z');
    /* 땅·해저 */
    if (!landP.getAttribute('d')) {
      let l = ''; for (let x = -20; x <= 980; x += 10) l += (l ? 'L' : 'M') + x + ' ' + f1(yOf(z(x)));
      landP.setAttribute('d', l + 'L980 560L-20 560Z'); bedP.setAttribute('d', l + 'L980 560L-20 560Z');
    }
    /* 하늘: 기압이 낮을수록 어둡게 */
    const dark = clamp((P0 - S.p) / 83, 0, 1) * .55 + (S.u / 40) * .25;
    sky.setAttribute('fill', `rgb(${Math.round(lerp(191, 150, dark))},${Math.round(lerp(227, 172, dark))},${Math.round(lerp(245, 190, dark))})`);
    /* 기압 화살표 */
    pressG.style.display = S.pOn ? '' : 'none'; pAir.show(S.pOn);
    PX.forEach((x, i) => { const p = P0 - (P0 - S.p) * gP(x), len = 12 + (p - 925) * .42, ys = yOf(eta(x)) - 8; pArrows[i].setAttribute('d', arrow1D(x, ys - len, x, ys, 8)); });
    if (S.pOn) pAir.move(210, yOf(eta(140)) - 70);
    /* 바람 화살표 (바람 효과를 끄면 숨김) */
    const wOn = S.wOn && S.u > 0;
    windG.style.display = flowG.style.display = wOn ? '' : 'none'; pWind.show(wOn); pPush.show(wOn && S.u >= 8);
    if (wOn) {
      const len = 26 + S.u * 2.3, sw = 2.5 + S.u / 9, sp = 100, v = 30 + S.u * 4;
      wArrows.forEach(({ a, r, i }) => {
        let x = 40 + i * sp + r * 50 + ((tt * v) % sp); const y = r ? 168 : 120;
        if (x > 600) x -= sp * 6;
        const op = clamp((x + len - 20) / 60, 0, 1) * clamp((640 - x - len) / 60, 0, 1);
        attr(a, { d: arrow1D(x, y, x + len, y, 6 + S.u / 5), 'stroke-width': f1(sw), opacity: f1(op) });
      });
      pWind.set(TX.lbl.wind(S.u)); pWind.move(170, 82);
      fArrows.forEach((a, i) => { const x = 330 + i * 95, y = yOf(eta(x)) + 26, l = 14 + S.u * 1.1; a.setAttribute('d', arrow1D(x, y, x + l, y, 7)); });
      pPush.move(430, yOf(eta(430)) + 58);
    }
    /* 기준선과 이름표 */
    const yT = yOf(T);
    attr(tideL, { y1: f1(yT), y2: f1(yT) });
    const tideShown = Math.abs(TIDES[S.tide]) > .01;
    tideL.style.display = tideShown ? '' : 'none'; pTide.show(tideShown);
    pTide.set(TX.lbl.tideLine(TX.tideName[S.tide])); pTide.move(330, yT + (T > 0 ? -16 : 16));
    pMSL.move(70, Y0 + 18);
    /* 해안 수위 막대: 조석(평소 해수면 → 조석 수위) + 기압 + 바람 */
    const yP = yOf(T + P), yW = yOf(CL);
    attr(segT, { y: f1(Math.min(Y0, yT)), height: f1(Math.abs(Y0 - yT)) });
    attr(segP, { y: f1(yP), height: f1(Math.max(0, yT - yP)) });
    attr(segW, { y: f1(yW), height: f1(Math.max(0, yP - yW)) });
    tP.style.display = yT - yP >= 14 ? '' : 'none'; attr(tP, { x: XG + 26, y: f1((yT + yP) / 2 + 5) });
    tW.style.display = yP - yW >= 14 ? '' : 'none'; attr(tW, { x: XG + 26, y: f1((yP + yW) / 2 + 5) });
    const bx = XG - 16;
    brT.setAttribute('d', `M${bx + 6} ${Y0} H${bx} V${f1(yT)} H${bx + 6}`); brT.style.display = tideShown ? '' : 'none';
    const surge = yT - yW > 3;
    brS.setAttribute('d', `M${bx + 6} ${f1(yT)} H${bx} V${f1(yW)} H${bx + 6}`); brS.style.display = surge ? '' : 'none';
    pSurge.show(surge); pTideB.show(tideShown);
    // 이름표가 겹치지 않게: 폭풍 해일은 막대 가운데, 조석은 그 아래(또는 위)로 최소 26 px 떨어뜨림
    let ySu = (yT + yW) / 2, yTi = (Y0 + yT) / 2;
    if (surge && tideShown && Math.abs(ySu - yTi) < 26) yTi = ySu + (yTi >= ySu ? 26 : -26);
    pSurge.move(bx - 8 - pSurge.width() / 2, ySu); pTideB.move(bx - 8 - pTideB.width() / 2, yTi);
    topMark.setAttribute('d', `M${XG + 24} ${f1(yW)} l10 -7 v14 Z`);
    /* 태풍 중심(저기압) */
    pLow.set(TX.lbl.low(S.p));
    /* 침수 표시 */
    const flooded = xEnd > 752;
    pFlood.show(flooded); if (flooded) pFlood.move((752 + xEnd) / 2, yOf(CL) - 20);
  }

  /* ---- 조작부·카드 (같은 상태값 S 로 갱신) ---- */
  $('#badge1').textContent = TX.badge; $('#chip1').textContent = TX.chip;
  $('#t1-h-cond').textContent = TX.hCond; $('#t1-h-sum').textContent = TX.hSum; $('#t1-h-lim').textContent = TX.hLim; $('#t1-lim').innerHTML = TX.limits;
  $('#l1-p').textContent = TX.lp; $('#l1-u').textContent = TX.lu; $('#l1-tide').textContent = TX.ltide;
  $('#t1-press').textContent = TX.togP; $('#t1-wind').textContent = TX.togW; $('#t1-reset').textContent = TX.reset;
  const setTide = segButtons($('#seg1-tide'), ['low', 'mean', 'high'].map(v => ({ v, label: TX.tideName[v] })), v => { S.tide = v; S.last = 'tide'; upd(); });
  const rP = $('#r1-p'), rU = $('#r1-u');
  rP.addEventListener('input', () => { S.p = +rP.value; S.last = 'p'; upd(); });
  rU.addEventListener('input', () => { S.u = +rU.value; S.last = 'u'; upd(); });
  bindToggle($('#t1-press'), v => { S.pOn = v; S.last = 'tog'; upd(); });
  bindToggle($('#t1-wind'), v => { S.wOn = v; S.last = 'tog'; upd(); });
  $('#t1-reset').onclick = () => {
    Object.assign(S, { p: 960, u: 25, tide: 'high', pOn: true, wOn: true, last: 'init' });
    rP.value = S.p; rU.value = S.u; setToggle($('#t1-press'), true); setToggle($('#t1-wind'), true); upd();
  };
  registerPauseBtn($('#t1-pause'));
  const windWord = u => u < 10 ? TX.windLv[0] : u < 20 ? TX.windLv[1] : u < 30 ? TX.windLv[2] : TX.windLv[3];
  function floodState(CL) { let x = 600; while (x < 975 && z(x) < CL) x++; return x <= 690 ? 0 : x <= 752 ? 1 : x < 860 ? 2 : 3; }
  function upd() {
    const tg = target(), CL = tg.T + tg.P + tg.W, dp = P0 - S.p;
    $('#v1-p').textContent = S.p + ' hPa'; $('#v1-u').textContent = S.u + ' m/s';
    $('#n1-p').innerHTML = TX.noteP(dp); $('#n1-u').innerHTML = TX.noteU(windWord(S.u));
    setTide(S.tide);
    const fl = floodState(CL);
    $('#lvl1').innerHTML = [
      ['t', TX.rowT, TX.tideVal[S.tide]],
      ['p', TX.rowP, S.pOn ? TX.valP(dp) : TX.off],
      ['w', TX.rowW, S.wOn ? TX.valW(windWord(S.u)) : TX.off],
      ['s', TX.rowS, tg.P + tg.W > .005 ? TX.valS[S.pOn && tg.P > .005 ? (S.wOn && tg.W > .005 ? 'both' : 'p') : 'w'] : TX.valS0],
      ['f', TX.rowF, TX.flood[fl]],
    ].map(([c, a, b]) => `<li class="lv-${c}"><span>${a}</span><b>${b}</b></li>`).join('');
    $('#n1-flood').innerHTML = TX.floodNote;
    let cap;
    if (!S.pOn && !S.wOn) cap = TX.cap.none;
    else if (S.last === 'p') cap = S.pOn ? TX.cap.p(dp) : TX.cap.pOff;
    else if (S.last === 'u') cap = S.wOn ? TX.cap.u(S.u) : TX.cap.uOff;
    else if (S.last === 'tide') cap = TX.cap.tide[S.tide];
    else if (S.last === 'tog') cap = S.pOn && S.wOn ? TX.cap.both : S.pOn ? TX.cap.onlyP : TX.cap.onlyW;
    else cap = TX.cap.init;
    setCap(cap);
  }
  upd(); render(0);
  frames['1'] = render;
})();
