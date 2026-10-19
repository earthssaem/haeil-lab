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

  /* ---- 그리기 층 (그림 속 표시는 핵심만 크게: 수치·설명은 오른쪽 카드와 해설 카드) ---- */
  const sky = E('rect', { x: -10, y: -10, width: 980, height: 560, fill: '#BFE3F5' }); svg.appendChild(sky);
  const landP = E('path', { fill: '#E6C377', stroke: INK, 'stroke-width': 3, 'stroke-linejoin': 'round' });
  svg.append(landP);
  /* 집: 낮은 땅(해안 마을) 3채 · 높은 지대 1채 */
  const houses = E('g'); svg.appendChild(houses);
  [[790, 26], [832, 30], [868, 24], [938, 28]].forEach(([x, w]) => {
    const g = z(x), y = yOf(g);
    houses.appendChild(E('path', { d: `M${x - w / 2} ${y} V${y - w * .8} L${x} ${y - w * 1.35} L${x + w / 2} ${y - w * .8} V${y} Z`, fill: '#FFFDF8', stroke: INK, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
  });
  const water = E('path', { fill: '#2E7DB0', 'fill-opacity': .85, stroke: INK, 'stroke-width': 3, 'stroke-linejoin': 'round' });
  svg.appendChild(water);
  /* 기압: 공기가 수면을 누르는 화살표 5개 (길이 ∝ 그 자리의 기압 → 태풍 중심에 가까울수록 짧음) */
  const pressG = E('g'); svg.appendChild(pressG);
  const PX = [130, 230, 330, 430, 530];
  const pArrows = PX.map(() => { const a = E('path', { stroke: '#6B7C8A', 'stroke-width': 4, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }); pressG.appendChild(a); return a; });
  /* 바람: 해안 쪽(오른쪽)으로 부는 화살표 한 줄 */
  const windG = E('g'); svg.appendChild(windG);
  const wArrows = [0, 1, 2, 3].map(() => { const a = E('path', { stroke: WIND, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }); windG.appendChild(a); return a; });
  /* 기준선: 평소 해수면(점선, 고정) · 조석 수위(긴 점선) */
  const mslL = E('line', { x1: 0, x2: 960, y1: Y0, y2: Y0, stroke: INK, 'stroke-width': 3, 'stroke-dasharray': '2 7', 'stroke-linecap': 'round' });
  const tideL = E('line', { x1: 0, x2: 960, stroke: TIDE, 'stroke-width': 3, 'stroke-dasharray': '16 9' });
  svg.append(tideL, mslL);
  /* 해안 수위 막대: 조석 · 기압 · 바람을 색으로 쌓음 (색은 오른쪽 '해안 수위 구성' 카드와 같음) */
  const gauge = E('g'); svg.appendChild(gauge);
  const BW = 30;
  gauge.appendChild(E('line', { x1: XG + BW / 2, x2: XG + BW / 2, y1: Y0 - 170, y2: Y0 + 60, stroke: INK, 'stroke-width': 2, opacity: .5 }));
  const segT = E('rect', { x: XG, width: BW, fill: TIDE, stroke: INK, 'stroke-width': 2 });
  const segP = E('rect', { x: XG, width: BW, fill: PRES, stroke: INK, 'stroke-width': 2 });
  const segW = E('rect', { x: XG, width: BW, fill: WIND, stroke: INK, 'stroke-width': 2 });
  const brT = E('path', { stroke: TIDE, 'stroke-width': 3.5, fill: 'none' }), brS = E('path', { stroke: '#C7432E', 'stroke-width': 3.5, fill: 'none' });
  gauge.append(segT, segP, segW, brT, brS);
  const segTxt = k => E('text', { x: XG + BW / 2, 'text-anchor': 'middle', 'font-family': 'Jua', 'font-size': 13, fill: '#fff', text: k });
  const tP = segTxt(TX.lbl.segP), tW = segTxt(TX.lbl.segW); gauge.append(tP, tW);
  /* 이름표 */
  const labG = E('g'); svg.appendChild(labG);
  const FS = 17;
  const pMSL = pill(TX.lbl.msl, { fs: FS }), pTide = pill('', { fs: FS, color: '#fff', bg: TIDE });
  const pSurge = pill(TX.lbl.surge, { fs: FS, color: '#fff', bg: '#C7432E' }), pTideB = pill(TX.lbl.tideB, { fs: FS, color: '#fff', bg: TIDE });
  const pLow = pill('', { fs: FS }), pWind = pill('', { fs: FS, color: '#fff', bg: WIND }), pFlood = pill(TX.lbl.flood, { fs: FS, bg: '#FFE082' });
  const lowMark = E('g', {}, [E('circle', { r: 21, fill: '#E8553E', stroke: INK, 'stroke-width': 3 }), E('text', { y: 7, 'text-anchor': 'middle', 'font-family': 'Jua', 'font-size': 22, fill: '#fff', text: TX.lbl.lowSym })]);
  lowMark.setAttribute('transform', `translate(${XC},44)`);
  labG.append(lowMark, ...[pMSL, pTide, pTideB, pSurge, pLow, pWind, pFlood].map(p => p.g));

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
    /* 수면: 아주 작은 잔물결만 (큰 파도가 아니라 해수면 자체가 높아지는 것을 보이도록) */
    const ra = .6 + (S.wOn ? S.u : 0) * .04;
    let d = '', back = '';
    for (let x = -10; x < xEnd; x += 5) {
      const r = ra * Math.sin((x - tt * 26) / 40 * 2 * Math.PI) * clamp((640 - x) / 80, 0, 1);
      d += (d ? 'L' : 'M') + x + ' ' + f1(yOf(eta(x)) - r);
    }
    d += `L${xEnd} ${f1(yOf(eta(xEnd)))}`;
    for (let x = xEnd; x >= -10; x -= 10) back += `L${x} ${f1(yOf(z(x)))}`;
    water.setAttribute('d', d + back + 'Z');
    /* 땅·해저 */
    if (!landP.getAttribute('d')) {
      let l = ''; for (let x = -20; x <= 980; x += 10) l += (l ? 'L' : 'M') + x + ' ' + f1(yOf(z(x)));
      landP.setAttribute('d', l + 'L980 560L-20 560Z');
    }
    /* 하늘: 기압이 낮을수록 어둡게 */
    const dark = clamp((P0 - S.p) / 83, 0, 1) * .55 + (S.u / 40) * .25;
    sky.setAttribute('fill', `rgb(${Math.round(lerp(191, 150, dark))},${Math.round(lerp(227, 172, dark))},${Math.round(lerp(245, 190, dark))})`);
    /* 기압 화살표 */
    pressG.style.display = S.pOn ? '' : 'none';
    PX.forEach((x, i) => { const p = P0 - (P0 - S.p) * gP(x), len = 14 + (p - 925) * .45, ys = yOf(eta(x)) - 10; pArrows[i].setAttribute('d', arrow1D(x, ys - len, x, ys, 9)); });
    /* 바람 화살표 (바람 효과를 끄면 숨김) */
    const wOn = S.wOn && S.u > 0;
    windG.style.display = wOn ? '' : 'none'; pWind.show(wOn);
    if (wOn) {
      const len = 36 + S.u * 1.6, sw = 3 + S.u / 8, sp = 135, v = 30 + S.u * 3, y = 150;
      wArrows.forEach((a, i) => {
        let x = 80 + i * sp + ((tt * v) % sp); if (x > 80 + sp * 3.6) x -= sp * 4;
        const op = clamp((x - 60) / 50, 0, 1) * clamp((620 - x - len) / 50, 0, 1);
        attr(a, { d: arrow1D(x, y, x + len, y, 8 + S.u / 5), 'stroke-width': f1(sw), opacity: f1(op) });
      });
      pWind.set(TX.lbl.wind(S.u)); pWind.move(190, 108);
    }
    /* 기준선과 이름표 (왼쪽 가장자리에 모아 둠) */
    const yT = yOf(T);
    attr(tideL, { y1: f1(yT), y2: f1(yT) });
    const tideShown = Math.abs(TIDES[S.tide]) > .01;
    tideL.style.display = tideShown ? '' : 'none'; pTide.show(tideShown);
    pTide.set(TX.lbl.tideLine(TX.tideName[S.tide])); pTide.move(300, yT + (T > 0 ? -20 : 20));
    pMSL.move(80, Y0 + 22);
    /* 해안 수위 막대: 조석(평소 해수면 → 조석 수위) + 기압 + 바람 */
    const yP = yOf(T + P), yW = yOf(CL);
    attr(segT, { y: f1(Math.min(Y0, yT)), height: f1(Math.abs(Y0 - yT)) });
    attr(segP, { y: f1(yP), height: f1(Math.max(0, yT - yP)) });
    attr(segW, { y: f1(yW), height: f1(Math.max(0, yP - yW)) });
    tP.style.display = yT - yP >= 18 ? '' : 'none'; attr(tP, { y: f1((yT + yP) / 2 + 5) });
    tW.style.display = yP - yW >= 18 ? '' : 'none'; attr(tW, { y: f1((yP + yW) / 2 + 5) });
    const bx = XG - 10;
    brT.setAttribute('d', `M${bx + 6} ${Y0} H${bx} V${f1(yT)} H${bx + 6}`); brT.style.display = tideShown ? '' : 'none';
    const surge = yT - yW > 3;
    brS.setAttribute('d', `M${bx + 6} ${f1(yT)} H${bx} V${f1(yW)} H${bx + 6}`); brS.style.display = surge ? '' : 'none';
    pSurge.show(surge); pTideB.show(tideShown);
    // 이름표가 겹치지 않게: 폭풍 해일은 막대 가운데, 조석은 그 아래(또는 위)로 최소 30 px 떨어뜨림
    let ySu = (yT + yW) / 2, yTi = (Y0 + yT) / 2;
    if (surge && tideShown && Math.abs(ySu - yTi) < 30) yTi = ySu + (yTi >= ySu ? 30 : -30);
    pSurge.move(bx - 8 - pSurge.width() / 2, ySu); pTideB.move(bx - 8 - pTideB.width() / 2, yTi);
    /* 태풍 중심(저기압) */
    pLow.set(TX.lbl.low(S.p)); pLow.move(XC + 30 + pLow.width() / 2, 44);
    /* 침수 표시 */
    const flooded = xEnd > 752;
    pFlood.show(flooded); if (flooded) pFlood.move((752 + xEnd) / 2, yOf(CL) - 24);
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
