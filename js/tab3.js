/* 탭3: 해일이 오기 전 — 대비 미니게임 (위에서 내려다본 가상의 해안 마을 지도)
   ① 상황 확인 → ② 대비 선택(대피 장소 → 이동 경로 → 출발 전 행동) → ③ 실행 → ④ 결과 확인 → ⑤ 다시 도전(조건 하나만 바꾸기)
   지형: 해발 고도 함수 elev(x, y) 하나로 지도 색·등고선·건물/도로의 고도·학습용 침수 범위·판정을 모두 계산 (서로 어긋나지 않음).
   시간: 실시간 카운트다운이 아니라 행동·이동에 걸리는 시간(분)을 쌓아 감 → 읽는 동안 불이익 없음.
   판정: 고른 행동·경로를 시간표로 만들고, 지나는 지점마다 '그 지점이 위험해지는 시각(onset)'과 비교 (위험할 때 있었음 / 아슬아슬 / 지나간 뒤 위험해짐 / 안전).
   지도와 침수 범위는 실제 지역이 아닌 학습용 가상 상황 */
/* ================= 탭3: 대비 미니게임 ================= */
(function () {
  const TX = TEXT.tab3;
  const svg = $('#svg3'), cv = $('#cv3'), stage = $('#stage3');
  const INK = '#24303A', W = 960, H = 540;

  /* ---------- 지형 (단위: px, 해발 m) ---------- */
  const sm = smooth;
  const coastY = x => 448 + 7 * Math.sin(x / 63) + 4 * Math.sin(x / 23 + 1) - 36 * sm(630, 665, x) * (1 - sm(760, 795, x));   // 해안선 (항구 안쪽으로 들어감)
  const riverX = y => 460 + 18 * Math.sin(y / 80);                                                                          // 하천 중심선
  const riverW = y => 7 + 6 * y / 450;
  function elev(x, y) {
    const d = coastY(x) - y;
    if (d <= 0) return -1;
    let b = d < 80 ? .5 + 3.5 * d / 80 : d < 230 ? 4 + 6 * (d - 80) / 150 : 10 + (d - 230) * .06;
    b += 20 * Math.exp(-((x - 830) ** 2 + (y - 150) ** 2) / (2 * 95 * 95)) + 14 * Math.exp(-((x - 140) ** 2 + (y - 110) ** 2) / (2 * 110 * 110));
    const r = Math.abs(x - riverX(y));
    b -= Math.min(b * .45, 3.5) * Math.exp(-((r / 55) ** 2));     // 하천 주변은 골짜기처럼 낮음
    return b;
  }
  const inRiver = (x, y) => y < coastY(x) + 4 && Math.abs(x - riverX(y)) < riverW(y);
  /* 지점의 성질: 해발 e, 해안에서의 거리 d, 하천 가까움 rv (지진 해일이 하천을 거슬러 빨리 올라옴) */
  const pointInfo = (x, y) => ({ x, y, e: elev(x, y), d: Math.max(0, coastY(x) - y), rv: Math.abs(x - riverX(y)) < 40 });

  /* ---------- 장소·도로 ---------- */
  const NODES = {
    H: { x: 548, y: 390, kind: 'start' }, K: { x: 500, y: 404 }, W: { x: 414, y: 404 }, M: { x: 345, y: 398, kind: 'shelter' },
    Cb: { x: 565, y: 436, kind: 'beach' }, A: { x: 568, y: 300 }, Ue: { x: 502, y: 262 }, Uw: { x: 420, y: 258 }, W2: { x: 360, y: 312 },
    V: { x: 642, y: 378, kind: 'shelter' }, B: { x: 690, y: 262 }, D: { x: 775, y: 212 }, P: { x: 850, y: 190, kind: 'shelter' },
    C1: { x: 628, y: 422 }, Hb: { x: 700, y: 394, kind: 'harbor' }, C2: { x: 800, y: 424 }, C3: { x: 880, y: 350 },
  };
  for (const k in NODES) { const n = NODES[k]; n.id = k; Object.assign(n, pointInfo(n.x, n.y)); n.name = TX.node[k]; }
  /* 도로: 양 끝·꺾이는 점·걸어서 걸리는 시간(분)·종류 (해안도로는 넓고 평평해 빠르지만 바다에 붙어 있음) */
  const ROADS = [
    ['H', 'K', [], 2, 'low'], ['K', 'W', [], 3, 'bridge'], ['W', 'M', [], 2, 'low'], ['H', 'Cb', [], 2, 'low'],
    ['H', 'A', [[558, 345]], 5, 'street'], ['A', 'Ue', [[535, 275]], 3, 'street'], ['Ue', 'Uw', [], 3, 'bridge2'], ['Uw', 'W2', [[390, 290]], 3, 'street'],
    ['W2', 'W', [[392, 360]], 4, 'street'], ['W2', 'M', [], 3, 'street'],
    ['H', 'V', [[600, 384]], 3, 'low'], ['V', 'A', [[610, 330]], 4, 'street'],
    ['A', 'B', [[620, 292], [650, 268]], 6, 'street'], ['B', 'D', [[740, 250], [728, 226]], 6, 'hill'], ['D', 'P', [[820, 214]], 4, 'hill'],
    ['H', 'C1', [[590, 414]], 3, 'coast'], ['C1', 'Hb', [[660, 410]], 3, 'coast'], ['Hb', 'C2', [[770, 400]], 4, 'coast'], ['C2', 'C3', [[850, 402]], 4, 'coast'], ['C3', 'P', [[892, 280], [866, 214]], 4, 'hill'],
  ].map(([a, b, wp, t, kind], i) => {
    const pts = [NODES[a], ...wp.map(([x, y]) => ({ x, y })), NODES[b]];
    let L = 0; const seg = []; for (let j = 1; j < pts.length; j++) { const l = Math.hypot(pts[j].x - pts[j - 1].x, pts[j].y - pts[j - 1].y); seg.push(l); L += l; }
    /* 6 px 마다 표본점 (위치 비율 f, 해발, 해안 거리) — 판정에 사용. 다리 위는 하천 수면이 아니라 다리 높이(양쪽 둑의 낮은 쪽)로 봄 */
    const samples = [], n = Math.max(2, Math.ceil(L / 6));
    for (let s = 0; s <= n; s++) {
      const p = along(pts, seg, L, s / n), info = pointInfo(p.x, p.y);
      if (inRiver(p.x, p.y) || info.e < 0) { info.e = Math.max(.6, Math.min(NODES[a].e, NODES[b].e) - .4); info.rv = true; }
      info.f = s / n; samples.push(info);
    }
    return { i, a, b, pts, seg, L, t, kind, samples, name: TX.road[kind] };
  });
  function along(pts, seg, L, f) {
    let s = f * L;
    for (let j = 0; j < seg.length; j++) { if (s <= seg[j] || j === seg.length - 1) { const r = seg[j] ? clamp(s / seg[j], 0, 1) : 0; return { x: lerp(pts[j].x, pts[j + 1].x, r), y: lerp(pts[j].y, pts[j + 1].y, r) }; } s -= seg[j]; }
  }
  const roadOf = (a, b) => ROADS.find(r => (r.a === a && r.b === b) || (r.a === b && r.b === a));
  const neighbors = a => ROADS.filter(r => r.a === a || r.b === a).map(r => r.a === a ? r.b : r.a);
  /* 도로를 a → b 방향으로 지날 때의 표본점 (방향을 맞춤) */
  const walkSamples = (a, b) => { const r = roadOf(a, b); return r.a === a ? r.samples : r.samples.map(s => ({ ...s, f: 1 - s.f })).reverse(); };

  /* ---------- 상황(시나리오)과 조건 ---------- */
  const SHELTERS = ['P', 'V', 'M'];
  const G = {
    sc: 'storm',                                   // 'storm' 폭풍 해일 | 'tsu' 지진 해일
    cond: { storm: { tide: 'high', wind: 'strong' }, tsu: { left: 10 } },
    changed: null,                                 // 다시 도전에서 바꾼 조건 키
    step: 1, sub: 'shelter',                       // 단계, ②의 세부 단계 (shelter | route | act)
    shelter: null, path: ['H'], acts: { storm: [], tsu: [] },
    result: null, prev: null,                      // 이번 결과, 조건을 바꾸기 전 결과 (비교용)
    anim: null,
  };
  /* 위험이 시작되는 시각(분)을 정하는 규칙 — 학습용 단순 모형 */
  function hazard() {
    if (G.sc === 'storm') {
      const c = G.cond.storm, FL = { low: -.7, high: .7 }[c.tide] + { weak: 1.0, strong: 2.6 }[c.wind], strong = c.wind === 'strong';
      return {
        FL, peak: 90, strong,
        onset: p => Math.min(p.e < FL ? 60 + p.d / 15 : Infinity, strong && p.d < 35 ? 30 : Infinity),   // 해수면 상승: 최접근 30분 전부터 해안에서 안쪽으로 · 강풍 때 해안 35 px 안은 30분부터 월파
        front: p => strong && p.d < 35,
      };
    }
    const T = G.cond.tsu.left, FL = 8;
    return { FL, peak: T, strong: false, onset: p => p.e < FL ? T + p.d / (p.rv ? 90 : 30) : Infinity, front: () => false };
  }
  const MARGIN = 5;   // 위험해지기 5분 전보다 늦게 지나가면 '아슬아슬'
  /* 출발 전 행동: 걸리는 시간·다녀오는 곳 */
  const ACTS = {
    storm: [{ id: 'info', t: 5 }, { id: 'kit', t: 10 }, { id: 'boat', t: 20, trip: ['H', 'C1', 'Hb'] }],
    tsu: [{ id: 'alert', t: 1 }, { id: 'pack', t: 10 }, { id: 'look', t: 5, trip: ['H', 'Cb'] }],
  };

  /* ---------- 시간표 만들기 → 판정 ---------- */
  function buildTimeline() {
    const tl = []; let t = 0;
    const walk = (a, b, cat, label) => { const r = roadOf(a, b); tl.push({ type: 'walk', a, b, road: r, t0: t, t1: t + r.t, cat, label }); t += r.t; };
    for (const ac of ACTS[G.sc]) {
      if (!G.acts[G.sc].includes(ac.id)) continue;
      if (ac.trip) {
        for (let j = 1; j < ac.trip.length; j++) walk(ac.trip[j - 1], ac.trip[j], 'act', ac.id);
        const at = NODES[ac.trip[ac.trip.length - 1]]; tl.push({ type: 'stay', node: at, t0: t, t1: t + ac.t, cat: 'act', label: ac.id }); t += ac.t;
        for (let j = ac.trip.length - 1; j > 0; j--) walk(ac.trip[j], ac.trip[j - 1], 'act', ac.id);
      } else { tl.push({ type: 'stay', node: NODES.H, t0: t, t1: t + ac.t, cat: 'act', label: ac.id }); t += ac.t; }
    }
    const depart = t;
    for (let j = 1; j < G.path.length; j++) walk(G.path[j - 1], G.path[j], 'route', 'route');
    const arrive = t;
    return { tl, depart, arrive };
  }
  const RANK = { safe: 0, passed: 1, close: 2, danger: 3 };
  function evaluate() {
    const hz = hazard(), { tl, depart, arrive } = buildTimeline();
    const end = Math.max(arrive, hz.peak) + 6;
    const sh = NODES[G.shelter];
    tl.push({ type: 'stay', node: sh, t0: arrive, t1: end, cat: 'shelter', label: 'shelter' });
    /* 각 구간의 표본점마다 상태 */
    const worst = { act: null, route: null, shelter: null };
    const note = (cat, s) => { if (!worst[cat] || RANK[s.st] > RANK[worst[cat].st] || (RANK[s.st] === RANK[worst[cat].st] && s.st === 'danger' && s.t < worst[cat].t)) worst[cat] = s; };
    const judge = (p, time, until) => {
      const on = hz.onset(p);
      if (!isFinite(on)) return { st: 'safe', on };
      if (until >= on) return { st: 'danger', on, t: Math.max(time, on) };
      return { st: on - until < MARGIN ? 'close' : 'passed', on, t: until };
    };
    for (const sg of tl) {
      if (sg.type === 'walk') {
        sg.marks = walkSamples(sg.a, sg.b).map(p => {
          const time = lerp(sg.t0, sg.t1, p.f), j = judge(p, time, time), m = { ...j, p, road: sg.road, front: hz.front(p) };
          // '지나간 뒤 위험해짐'은 피할 수 있었던 바다·하천에 붙은 길(해안도로·하구 다리)에서만 아쉬운 점으로 셈.
          // 마을 대부분이 낮은 곳이라 다른 길은 여유 있게 벗어났다면 괜찮음 (위험할 때 있었음·아슬아슬은 어느 길이든 셈)
          if (m.st === 'passed' && !['coast', 'bridge'].includes(sg.road.kind)) m.st = 'safe';
          note(sg.cat, m);
          return m;
        });
      } else {
        const p = sg.node;
        if (sg.cat === 'shelter') {
          const on = hz.onset(p);
          sg.marks = [{ st: !isFinite(on) ? 'safe' : sh.id === 'V' ? 'passed' : 'danger', on, t: on, p }];
          note('shelter', sg.marks[0]);
        } else { const j = judge(p, sg.t0, sg.t1); sg.marks = [{ ...j, p, node: p, front: hz.front(p) }]; note(sg.cat, sg.marks[0]); }
      }
    }
    return { hz, tl, depart, arrive, end, worst, sc: G.sc, cond: JSON.parse(JSON.stringify(G.cond[G.sc])), shelter: G.shelter, path: G.path.slice(), acts: G.acts[G.sc].slice() };
  }
  /* 판정 → 항목별 피드백 (조건 확인 · 대피 장소 · 이동 경로 · 행동 우선순위) */
  function feedback(R) {
    const F = TX.fb, hz = R.hz, sc = R.sc, w = R.worst, c = R.cond;
    const lv = st => st === 'danger' ? 'bad' : st === 'close' || st === 'passed' ? 'mid' : 'ok';
    const out = [];
    /* 대피 장소 */
    const shW = w.shelter, sid = R.shelter;
    let shL, shT;
    if (sid === 'P') { shL = 'ok'; shT = F.shelter.P(sc); }
    else if (sid === 'V') {
      const sur = isFinite(shW.on);
      if (sc === 'tsu') { shL = c.left <= 15 ? 'ok' : 'mid'; shT = c.left <= 15 ? F.shelter.Vshort : F.shelter.Vlong; }
      else { shL = 'mid'; shT = sur ? F.shelter.VstormSur : F.shelter.Vstorm; }
    } else { shL = shW.st === 'danger' ? 'bad' : 'mid'; shT = shW.st === 'danger' ? F.shelter.Mbad(sc, fmtMin(shW.on)) : F.shelter.Mok; }
    /* 이동 경로 */
    const rw = w.route; let rL = rw ? lv(rw.st) : 'ok', rT;
    if (!rw || rw.st === 'safe') rT = F.route.ok(R.arrive);
    else if (rw.st === 'danger') rT = F.route.danger(rw.road ? rw.road.name : '', fmtMin(rw.t), rw.front, rw.road && ['coast', 'bridge', 'low'].includes(rw.road.kind), R.depart >= 5);
    else if (rw.st === 'close') rT = F.route.close(rw.road ? rw.road.name : '', fmtMin(rw.on - rw.t));
    else rT = F.route.passed(rw.road ? rw.road.name : '', sc);
    /* 행동 우선순위 */
    const aw = w.act, acts = R.acts; let aL, aT;
    const bad = sc === 'storm' ? acts.includes('boat') : acts.includes('look');
    const slow = sc === 'tsu' && acts.includes('pack');
    const later = [w.route, w.shelter].some(x => x && x.st === 'danger') && R.depart >= 5;   // 출발이 늦어 그 뒤에 위험해졌는지
    if (aw && aw.st === 'danger') { aL = 'bad'; aT = F.act.danger(sc, bad, fmtMin(aw.t)); }
    else if ((bad || slow) && later) { aL = 'bad'; aT = F.act.late(sc, bad, R.depart); }
    else if (bad) { aL = 'mid'; aT = F.act.badLuck(sc); }
    else if (slow) { aL = 'mid'; aT = F.act.slow(R.depart); }
    else if (sc === 'storm') { const n = ['info', 'kit'].filter(a => acts.includes(a)).length; aL = n === 2 ? 'ok' : 'mid'; aT = n === 2 ? F.act.stormOk : F.act.stormMiss(!acts.includes('info'), !acts.includes('kit')); }
    else { aL = acts.includes('alert') ? 'ok' : 'mid'; aT = acts.includes('alert') ? F.act.tsuOk : F.act.tsuMiss; }
    /* 대피 장소에 '도착하기 전에' 위험한 상황이 있었으면 경로·행동 쪽에서 설명, 도착 뒤 상황은 대피 장소에서 */
    const overall = [shL, rL, aL].includes('bad') ? 'bad' : [shL, rL, aL].includes('mid') ? 'mid' : 'ok';
    out.push({ k: 'cond', lv: 'info', t: F.cond(sc, c, hz) });
    out.push({ k: 'shelter', lv: shL, t: shT });
    out.push({ k: 'route', lv: rL, t: rT });
    out.push({ k: 'act', lv: aL, t: aT });
    return { overall, rows: out };
  }
  const fmtMin = m => Math.round(m);

  /* ---------- 지도 그리기 (캔버스: 지형·침수 / SVG: 도로·장소·표시) ---------- */
  const ctx = cv.getContext('2d');
  const EL = new Float32Array(W * H), DC = new Float32Array(W * H), RV = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; EL[i] = elev(x, y); DC[i] = Math.max(0, coastY(x) - y); RV[i] = inRiver(x, y) ? 2 : Math.abs(x - riverX(y)) < 40 ? 1 : 0;
  }
  const CLS = e => e < 0 ? 0 : e < 3 ? 1 : e < 10 ? 2 : e < 20 ? 3 : 4;
  const COL = [[156, 203, 230], [241, 226, 176], [220, 233, 196], [195, 214, 156], [169, 192, 132]];
  (function paintTerrain() {
    const img = ctx.createImageData(W, H), d = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, e = EL[i];
      let c = RV[i] === 2 ? [125, 184, 222] : COL[CLS(e)];
      if (e < 0) { const k = clamp((y - coastY(x)) / 120, 0, 1); c = [lerp(156, 120, k), lerp(203, 175, k), lerp(230, 214, k)]; }
      // 등고선 (3·10·20·30 m): 이웃 화소와 등급이 다르면 진하게
      if (e >= 0 && RV[i] !== 2 && x > 0 && y > 0) {
        const lv = v => v < 3 ? 0 : v < 10 ? 1 : v < 20 ? 2 : v < 30 ? 3 : 4;
        if (lv(e) !== lv(EL[i - 1]) || lv(e) !== lv(EL[i - W])) c = EL[i - 1] < 0 || EL[i - W] < 0 ? c : [96, 112, 78];
      }
      const o = i * 4; d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  })();
  /* 침수(학습용) 층: 반 해상도 캔버스에 줄무늬 */
  const fcv = document.createElement('canvas'); fcv.width = W / 2; fcv.height = H / 2; fcv.className = 'flood'; stage.insertBefore(fcv, svg);
  const fctx = fcv.getContext('2d');
  let floodKey = '';
  function paintFlood(t) {
    const hz = hazard(), key = G.sc + JSON.stringify(G.cond[G.sc]) + '|' + (t === null ? 'x' : Math.floor(t));
    if (key === floodKey) return; floodKey = key;
    const w = W / 2, h = H / 2, img = fctx.createImageData(w, h), d = img.data;
    if (t !== null) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * 2) * W + x * 2, e = EL[i];
      if (e < 0 || RV[i] === 2) continue;
      const p = { e, d: DC[i], rv: RV[i] > 0 }, on = hz.onset(p);
      if (t < on) continue;
      const o = (y * w + x) * 4, flood = e < hz.FL;
      if (flood) { const s = (x + y) % 5 < 2; d[o] = s ? 20 : 46; d[o + 1] = s ? 80 : 125; d[o + 2] = s ? 160 : 190; d[o + 3] = s ? 200 : 120; }
      else { const s = (y % 4 < 1); d[o] = 232; d[o + 1] = 85; d[o + 2] = 62; d[o + 3] = s ? 190 : 70; }   // 월파 위험(강풍): 가로 줄무늬
    }
    fctx.putImageData(img, 0, 0);
  }

  /* SVG 층 */
  const gScn = E('g'), gRoad = E('g'), gTime = E('g'), gRoute = E('g'), gRes = E('g'), gNode = E('g'), gLab = E('g'), gMark = E('g');
  svg.append(gScn, gRoad, gRoute, gRes, gTime, gNode, gLab, gMark);
  const polyD = pts => pts.map((p, j) => (j ? 'L' : 'M') + f1(p.x) + ' ' + f1(p.y)).join('');
  /* 집(주거지 표시)·항구 방파제 */
  [[520, 330], [612, 300], [540, 230], [588, 248], [375, 340], [395, 282], [330, 345], [640, 230], [700, 300], [660, 302], [742, 300], [525, 290]].forEach(([x, y]) => {
    gRoad.appendChild(E('rect', { x: x - 6, y: y - 5, width: 12, height: 10, fill: '#FFFDF8', stroke: '#7B8792', 'stroke-width': 1.5 }));
  });
  gRoad.appendChild(E('path', { d: 'M640 425 L652 455 M760 420 L748 452', stroke: '#7B8792', 'stroke-width': 6, 'stroke-linecap': 'round' }));
  /* 도로 */
  ROADS.forEach(r => {
    const d = polyD(r.pts);
    gRoad.appendChild(E('path', { d, stroke: INK, 'stroke-width': r.kind === 'coast' ? 11 : 9, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    gRoad.appendChild(E('path', { d, stroke: r.kind === 'coast' ? '#F6D9A0' : '#FFFFFF', 'stroke-width': r.kind === 'coast' ? 7 : 5.5, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    if (r.kind === 'coast') gRoad.appendChild(E('path', { d, stroke: '#B9744A', 'stroke-width': 1.5, 'stroke-dasharray': '6 5', fill: 'none' }));
    if (r.kind === 'bridge' || r.kind === 'bridge2') {
      const mid = r.samples.filter(s => inRiver(s.x, s.y)); if (mid.length) { const a = mid[0], b = mid[mid.length - 1]; gRoad.appendChild(E('path', { d: `M${f1(a.x - 4)} ${f1(a.y)} L${f1(b.x + 4)} ${f1(b.y)}`, stroke: '#8A8276', 'stroke-width': 13, 'stroke-linecap': 'butt' })); gRoad.appendChild(E('path', { d: `M${f1(a.x - 4)} ${f1(a.y)} L${f1(b.x + 4)} ${f1(b.y)}`, stroke: '#FFFFFF', 'stroke-width': 6 })); }
    }
    // 걸리는 시간(분) 표시 — 경로를 고를 때만 보임
    const m = along(r.pts, r.seg, r.L, .5), tg = E('g', { transform: `translate(${f1(m.x)},${f1(m.y)})` }, [E('rect', { x: -15, y: -9, width: 30, height: 18, rx: 9, fill: '#FFFDF8', stroke: INK, 'stroke-width': 1.5 }), E('text', { y: 5, 'text-anchor': 'middle', 'font-family': 'Jua', 'font-size': 13, fill: INK, text: TX.min(r.t) })]);
    r.tag = tg; gTime.appendChild(tg);
  });
  /* 이름표 (지도 글자) */
  const lab = (x, y, text, o = {}) => { const t = E('text', { x, y, 'text-anchor': o.anchor || 'middle', 'font-family': o.font || 'Jua', 'font-size': o.fs || 15, fill: o.color || INK, 'paint-order': 'stroke', stroke: o.halo || 'rgba(255,253,248,.9)', 'stroke-width': o.hw ?? 4, 'stroke-linejoin': 'round', text }); gLab.appendChild(t); return t; };
  lab(150, 500, TX.map.sea, { fs: 22, color: '#1E5A85', halo: 'rgba(200,228,244,.8)' });
  lab(486, 150, TX.map.river, { fs: 15, color: '#1E5A85' }); lab(486, 168, TX.map.riverSub, { fs: 11.5, font: 'Noto Sans KR', color: '#1E5A85' });
  lab(240, 430, TX.map.low, { fs: 14 }); lab(240, 446, TX.map.lowSub, { fs: 11.5, font: 'Noto Sans KR' });
  lab(250, 300, TX.map.mid, { fs: 14 }); lab(250, 316, TX.map.midSub, { fs: 11.5, font: 'Noto Sans KR' });
  lab(640, 140, TX.map.high, { fs: 14 }); lab(640, 156, TX.map.highSub, { fs: 11.5, font: 'Noto Sans KR' });
  lab(150, 80, TX.map.hill, { fs: 13 });
  lab(705, 440, TX.map.harbor, { fs: 14 }); lab(565, 462, TX.map.beach, { fs: 13 });
  lab(930, 462, TX.map.coastRoad, { fs: 12, anchor: 'end', font: 'Noto Sans KR', halo: 'rgba(200,228,244,.85)' });
  [['3 m', 330, 372], ['10 m', 540, 196], ['20 m', 760, 240]].forEach(([s, x, y]) => lab(x, y, s, { fs: 11, font: 'Noto Sans KR', color: '#4F5E3E' }));
  /* 장소: 우리 집·대피 장소 후보 (기호 + 글자) */
  const shelterG = {};
  function placeIcon(n) {
    const g = E('g', { transform: `translate(${n.x},${n.y})`, class: 'place' });
    if (n.id === 'H') g.append(E('circle', { r: 11, fill: '#5B9BD5', stroke: INK, 'stroke-width': 2.5 }), E('path', { d: 'M-6 1 L0 -6 L6 1 V6 H-6 Z', fill: '#fff' }));
    else if (n.id === 'P') g.append(E('path', { d: 'M0 -16 L15 10 H-15 Z', fill: '#3FA36B', stroke: INK, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }), E('text', { y: 7, 'text-anchor': 'middle', 'font-family': 'Jua', 'font-size': 12, fill: '#fff', text: '대' }));
    else if (n.id === 'V') g.append(E('rect', { x: -10, y: -17, width: 20, height: 30, fill: '#E9EEF2', stroke: INK, 'stroke-width': 2.5 }), ...[-10, -2, 6].map(y => E('line', { x1: -6, x2: 6, y1: y, y2: y, stroke: INK, 'stroke-width': 2 })));
    else if (n.id === 'M') g.append(E('path', { d: 'M-12 8 V-3 L0 -13 L12 -3 V8 Z', fill: '#F2B233', stroke: INK, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
    gNode.appendChild(g); return g;
  }
  ['H', ...SHELTERS].forEach(id => { shelterG[id] = placeIcon(NODES[id]); });
  const placeLab = {
    H: [NODES.H.x - 16, NODES.H.y - 18, 'end'], P: [NODES.P.x + 4, NODES.P.y - 24, 'middle'], V: [NODES.V.x + 18, NODES.V.y - 4, 'start'], M: [NODES.M.x, NODES.M.y - 22, 'middle'],
  };
  for (const id in placeLab) {
    const [x, y, a] = placeLab[id], n = NODES[id];
    lab(x, y, TX.place[id], { fs: 14, anchor: a }); lab(x, y + 14, TX.placeSubMap[id](Math.round(n.e)), { fs: 11, anchor: a, font: 'Noto Sans KR' });
  }
  /* 갈림길 점 (경로 고르기) */
  const nodeEls = {};
  for (const k in NODES) {
    if (['H', ...SHELTERS].includes(k)) continue;
    const n = NODES[k], g = E('g', { transform: `translate(${n.x},${n.y})`, class: 'jn' }, [E('circle', { r: 6.5, fill: '#FFFDF8', stroke: INK, 'stroke-width': 2.5 })]);
    gNode.appendChild(g); nodeEls[k] = g;
  }
  /* 누를 수 있는 표시(다음 갈림길·대피 장소 후보) */
  const gHit = E('g'); svg.appendChild(gHit);
  /* 상황 표시: 태풍 진로·바람 / 지진·해일 전파 */
  function drawScenario() {
    gScn.innerHTML = '';
    if (G.sc === 'storm') {
      const c = G.cond.storm, strong = c.wind === 'strong';
      gScn.appendChild(E('path', { d: 'M40 545 Q150 500 250 515', stroke: '#C7432E', 'stroke-width': 4, fill: 'none', 'stroke-dasharray': '10 7' }));
      gScn.appendChild(E('path', { d: arrow1D(225, 518, 255, 513, 10), stroke: '#C7432E', 'stroke-width': 4, fill: 'none', 'stroke-linecap': 'round' }));
      const ty = E('g', { transform: 'translate(270,505)' }, [E('circle', { r: 15, fill: '#fff', stroke: '#C7432E', 'stroke-width': 3.5 }), E('path', { d: 'M-8 -6 A10 10 0 0 1 8 -6 M8 6 A10 10 0 0 1 -8 6', stroke: '#C7432E', 'stroke-width': 3, fill: 'none' })]);
      gScn.appendChild(ty);
      [[350, 520], [470, 522], [590, 518], [820, 520]].forEach(([x, y]) => {
        const len = strong ? 34 : 18;
        gScn.appendChild(E('path', { d: arrow1D(x, y, x + len * .35, y - len, strong ? 9 : 7), stroke: '#1F9E8F', 'stroke-width': strong ? 5 : 3, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      });
      const t1 = E('text', { x: 300, y: 536, 'font-family': 'Jua', 'font-size': 13, fill: '#C7432E', text: TX.map.track }); gScn.appendChild(t1);
      const t2 = E('text', { x: 640, y: 492, 'font-family': 'Jua', 'font-size': 13, fill: '#14695F', text: strong ? TX.map.windS : TX.map.windW }); gScn.appendChild(t2);
    } else {
      gScn.appendChild(E('path', { d: 'M920 548 l6 -14 l-15 0 l12 -9 l-5 -14 l12 9 l12 -9 l-5 14 l12 9 l-15 0 Z', fill: '#FFE082', stroke: INK, 'stroke-width': 2 }));
      [60, 120, 180].forEach(r => gScn.appendChild(E('path', { d: `M${926 - r} 540 A${r} ${r * .5} 0 0 1 ${Math.min(960, 926 + r)} ${540 - r * .5 + (926 + r > 960 ? 30 : 0)}`, stroke: '#2B6CB0', 'stroke-width': 3, fill: 'none', 'stroke-dasharray': '8 6', opacity: .8 })));
      gScn.appendChild(E('text', { x: 885, y: 530, 'text-anchor': 'end', 'font-family': 'Jua', 'font-size': 13, fill: '#1E5A85', 'paint-order': 'stroke', stroke: 'rgba(200,228,244,.85)', 'stroke-width': 4, text: TX.map.quake }));
    }
  }

  /* 경로·결과 표시 */
  const pathLine = E('path', { stroke: '#7B4FB0', 'stroke-width': 6, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: .9 });
  const pathDash = E('path', { stroke: '#fff', 'stroke-width': 2, fill: 'none', 'stroke-dasharray': '2 8', 'stroke-linecap': 'round' });
  gRoute.append(pathLine, pathDash);
  const tripLine = E('path', { stroke: '#C7432E', 'stroke-width': 4, fill: 'none', 'stroke-dasharray': '7 6', 'stroke-linecap': 'round' });
  gRoute.appendChild(tripLine);
  const marker = E('g', {}, [E('circle', { r: 10, fill: '#7B4FB0', stroke: '#fff', 'stroke-width': 3 }), E('circle', { r: 10, fill: 'none', stroke: INK, 'stroke-width': 1.5 })]);
  const warn = E('g', {}, [E('path', { d: 'M0 -30 L13 -8 H-13 Z', fill: '#F2B233', stroke: INK, 'stroke-width': 2, 'stroke-linejoin': 'round' }), E('text', { y: -11, 'text-anchor': 'middle', 'font-family': 'Jua', 'font-size': 14, fill: INK, text: '!' })]);
  gMark.append(marker, warn);
  function pathPts(path) { const pts = []; for (let j = 1; j < path.length; j++) { const r = roadOf(path[j - 1], path[j]); const p = r.a === path[j - 1] ? r.pts : r.pts.slice().reverse(); pts.push(...(j > 1 ? p.slice(1) : p)); } return pts; }
  function drawPath() {
    const pts = pathPts(G.path);
    pathLine.setAttribute('d', pts.length ? polyD(pts) : ''); pathDash.setAttribute('d', pts.length ? polyD(pts) : '');
    const trip = ACTS[G.sc].filter(a => a.trip && G.acts[G.sc].includes(a.id)).map(a => polyD(pathPts(a.trip))).join('');
    tripLine.setAttribute('d', trip);
  }
  const ST_COL = { safe: '#3FA36B', passed: '#F2B233', close: '#F28C28', danger: '#D9483B' };
  function drawResult(R) {
    gRes.innerHTML = '';
    if (!R) return;
    for (const sg of R.tl) {
      if (sg.type !== 'walk') continue;
      const ms = sg.marks;
      for (let j = 1; j < ms.length; j++) {
        const a = ms[j - 1], b = ms[j], st = RANK[a.st] >= RANK[b.st] ? a.st : b.st;
        gRes.appendChild(E('line', { x1: f1(a.p.x), y1: f1(a.p.y), x2: f1(b.p.x), y2: f1(b.p.y), stroke: ST_COL[st], 'stroke-width': sg.cat === 'route' ? 8 : 5, 'stroke-linecap': 'round', opacity: sg.cat === 'route' ? 1 : .85 }));
      }
    }
  }

  /* ---------- 오른쪽 카드: 단계별 내용 ---------- */
  const panel = $('#g3'), setCap = explainCard($('#ex3'));
  $('#gs3').innerHTML = TX.steps.map((s, i) => `<li><i>${i + 1}</i>${s}</li>`).join('');
  $('#badge3').textContent = TX.badge; $('#chip3').textContent = TX.chip;
  $('#t3-h-src').textContent = TX.hSrc; $('#t3-src').innerHTML = TX.sources;
  $('#leg3').innerHTML = TX.legend.map(([sw, t]) => `<li>${sw}<span>${t}</span></li>`).join('');
  const clock = $('#clock3');
  const h = (tag, cls, html) => `<${tag}${cls ? ` class="${cls}"` : ''}>${html}</${tag}>`;
  function render() {
    $$('#gs3 li').forEach((li, i) => { li.classList.toggle('on', i + 1 === G.step); li.classList.toggle('done', i + 1 < G.step); });
    drawScenario(); drawPath();
    const showTimes = G.step === 2 && G.sub === 'route';
    gTime.style.display = showTimes ? '' : 'none';
    marker.style.display = G.step >= 3 ? '' : 'none'; warn.style.display = 'none';
    if (G.step < 3) { paintFlood(null); drawResult(null); clock.hidden = true; const s = NODES.H; marker.setAttribute('transform', `translate(${s.x},${s.y})`); }
    hits();
    let html = '';
    if (G.step === 1) html = stepInfo();
    else if (G.step === 2) html = stepChoose();
    else if (G.step === 3) html = stepRun();
    else if (G.step === 4) html = stepResult();
    else html = stepRetry();
    panel.innerHTML = html;
    bindPanel();
    setCap(TX.cap[G.step === 2 ? 'choose_' + G.sub : 's' + G.step]);
  }
  /* ① 상황 확인 */
  function facts() {
    const F = TX.facts;
    if (G.sc === 'storm') { const c = G.cond.storm; return [['🌀', F.track], ['💨', F.wind(c.wind), G.changed === 'wind'], ['⏱', F.storm_t], ['🌊', F.tide(c.tide), G.changed === 'tide'], ['🏠', F.home(Math.round(NODES.H.e))]]; }
    const c = G.cond.tsu; return [['📍', F.quake], ['📢', F.warn], ['⏱', F.left(c.left), G.changed === 'left'], ['🏠', F.home(Math.round(NODES.H.e))]];
  }
  function stepInfo() {
    const segSc = `<div class="seg" id="g3-sc">${['storm', 'tsu'].map(v => `<button type="button" data-sc="${v}" class="${G.sc === v ? 'sel' : ''}" aria-pressed="${G.sc === v}">${TX.scName[v]}</button>`).join('')}</div>`;
    return h('h4', 'g-h', TX.s1h) + segSc +
      h('ul', 'g-facts', facts().map(([ic, t, chg]) => `<li class="${chg ? 'chg' : ''}"><span class="ic" aria-hidden="true">${ic}</span><span>${t}</span></li>`).join('')) +
      h('p', 'g-p', TX.s1note) +
      `<div class="g-row"><div class="spacer"></div><button class="btn primary" type="button" data-go="2">${G.result ? TX.btn.toChooseKeep : TX.btn.toChoose}</button></div>`;
  }
  /* ② 대비 선택: 대피 장소 → 이동 경로 → 출발 전 행동 (지금 고르는 것만 펼침) */
  const routeDone = () => G.shelter && G.path[G.path.length - 1] === G.shelter;
  const routeTime = () => { let t = 0; for (let j = 1; j < G.path.length; j++) t += roadOf(G.path[j - 1], G.path[j]).t; return t; };
  const actTime = () => ACTS[G.sc].filter(a => G.acts[G.sc].includes(a.id)).reduce((s, a) => s + a.t + (a.trip ? 2 * pathTime(a.trip) : 0), 0);
  const pathTime = p => { let t = 0; for (let j = 1; j < p.length; j++) t += roadOf(p[j - 1], p[j]).t; return t; };
  function stepChoose() {
    const C = TX.choose; let s = h('h4', 'g-h', TX.s2h);
    const sum = (n, label, val, key) => `<div class="g-sum"><span class="g-sub done" style="margin:0"><span class="n">${n}</span></span><b>${label}: ${val}</b><button type="button" class="lnk" data-sub="${key}">${TX.btn.edit}</button></div>`;
    // 가. 대피 장소
    if (G.sub === 'shelter') {
      s += h('div', 'g-sub', `<span class="n">1</span>${C.shelterQ}`) +
        h('div', 'g-opts', SHELTERS.map(id => `<button type="button" class="g-opt" role="radio" aria-checked="${G.shelter === id}" data-shelter="${id}"><span class="ic" aria-hidden="true">${TX.placeIcon[id]}</span><span class="tx">${TX.place[id]}<small>${TX.placeSub[id](Math.round(NODES[id].e))}</small></span></button>`).join('')) +
        h('p', 'g-p mini-note', C.shelterHint);
    } else s += sum(1, C.shelterL, TX.place[G.shelter], 'shelter');
    // 나. 이동 경로
    if (G.sub === 'route') {
      const last = G.path[G.path.length - 1], nx = neighbors(last).filter(k => !G.path.includes(k));
      s += h('div', 'g-sub', `<span class="n">2</span>${C.routeQ(TX.place[G.shelter])}`);
      s += `<div class="g-route">${G.path.map(k => NODES[k].name).join(' → ')}</div>`;
      if (!routeDone()) s += h('div', 'g-opts', nx.map(k => { const r = roadOf(last, k); return `<button type="button" class="g-opt" data-next="${k}"><span class="ic" aria-hidden="true">${TX.roadIcon[r.kind]}</span><span class="tx">${NODES[k].name}<small>${r.name}</small></span><em>${TX.min(r.t)}</em></button>`; }).join('') || h('p', 'g-p', C.deadEnd));
      else s += h('p', 'g-p', C.routeDone(routeTime()));
      s += `<div class="g-row"><span class="g-route">${C.routeTime} <span class="tm">${TX.min(routeTime())}</span></span><div class="spacer"></div><button class="btn" type="button" data-undo ${G.path.length < 2 ? 'disabled' : ''}>${TX.btn.undo}</button><button class="btn" type="button" data-clear ${G.path.length < 2 ? 'disabled' : ''}>${TX.btn.clear}</button></div>`;
      if (routeDone()) s += `<div class="g-row"><div class="spacer"></div><button class="btn primary" type="button" data-sub="act">${TX.btn.next}</button></div>`;
    } else if (G.sub === 'act') s += sum(2, C.routeL, `${G.path.map(k => NODES[k].name).slice(1).join(' → ')} (${TX.min(routeTime())})`, 'route');
    // 다. 출발 전 행동
    if (G.sub === 'act') {
      s += h('div', 'g-sub', `<span class="n">3</span>${C.actQ}`) +
        h('div', 'g-opts', ACTS[G.sc].map(a => { const on = G.acts[G.sc].includes(a.id), t = a.t + (a.trip ? 2 * pathTime(a.trip) : 0); return `<button type="button" class="g-opt chk" aria-pressed="${on}" data-act="${a.id}"><span class="tx">${TX.act[a.id]}<small>${TX.actSub[a.id]}</small></span><em>+${TX.min(t)}</em></button>`; }).join('')) +
        `<div class="g-total"><span>${C.total}</span><b>${TX.min(actTime() + routeTime())}</b></div>` +
        `<div class="g-row"><button class="btn" type="button" data-go="1">${TX.btn.back1}</button><div class="spacer"></div><button class="btn primary" type="button" data-run>${TX.btn.run}</button></div>`;
    }
    return s;
  }
  /* ③ 실행: 시간표 */
  function stepRun() {
    const R = G.result;
    const items = R.tl.filter(sg => sg.cat !== 'shelter').reduce((arr, sg) => { const k = sg.cat === 'route' ? 'route' : sg.label; const last = arr[arr.length - 1]; if (last && last.k === k) last.t1 = sg.t1; else arr.push({ k, t0: sg.t0, t1: sg.t1 }); return arr; }, []);
    items.push({ k: 'arrive', t0: R.arrive, t1: R.arrive });
    G.runItems = items;
    return h('h4', 'g-h', TX.s3h) + `<ol class="g-tl" id="g3-tl">${items.map((it, i) => `<li data-i="${i}"><b>${TX.min(it.t0)}</b><span>${TX.tl[it.k] || TX.tl.route}</span></li>`).join('')}</ol>` +
      `<div class="g-row"><div class="spacer"></div><button class="btn" type="button" data-skip>${TX.btn.skip}</button></div>`;
  }
  /* ④ 결과 확인 */
  function stepResult() {
    const R = G.result, fb = feedback(R);
    G.lastFb = fb;
    let s = h('div', 'verdict ' + fb.overall, TX.verdict[fb.overall]);
    s += h('ul', 'fb', fb.rows.map(r => `<li class="${r.lv}"><div class="fh"><span class="mk" aria-hidden="true">${TX.mark[r.lv]}</span>${TX.fbName[r.k]}<span class="mkw">${TX.markWord[r.lv]}</span></div><p>${r.t}${r.lv === 'mid' || r.lv === 'bad' ? ` <button type="button" class="fix" data-fix="${r.k}">${TX.btn.fix}</button>` : ''}</p></li>`).join(''));
    if (G.prev && G.prev.sc === R.sc) s += h('div', 'cmp', TX.compare(condWord(G.prev.sc, G.prev.cond), TX.verdictShort[G.prev.overall], condWord(R.sc, R.cond), TX.verdictShort[fb.overall]));
    s += `<div class="g-row"><button class="btn" type="button" data-replay>${TX.btn.replay}</button><div class="spacer"></div><button class="btn primary" type="button" data-go="5">${TX.btn.retry}</button></div>`;
    return s;
  }
  const condWord = (sc, c) => sc === 'storm' ? TX.condWord.storm(c) : TX.condWord.tsu(c);
  /* ⑤ 다시 도전: 조건 하나만 바꾸기 */
  function stepRetry() {
    const opts = G.sc === 'storm'
      ? [['tide', TX.retry.tide(G.cond.storm.tide)], ['wind', TX.retry.wind(G.cond.storm.wind)]]
      : [['left', TX.retry.left(G.cond.tsu.left)]];
    return h('h4', 'g-h', TX.s5h) + h('p', 'g-p', TX.s5note) +
      h('div', 'g-opts', opts.map(([k, t]) => `<button type="button" class="g-opt" data-change="${k}"><span class="ic" aria-hidden="true">↻</span><span class="tx">${t}</span></button>`).join('')) +
      `<div class="g-row"><button class="btn" type="button" data-go="4">${TX.btn.back4}</button><div class="spacer"></div><button class="btn" type="button" data-other>${TX.btn.other(TX.scName[G.sc === 'storm' ? 'tsu' : 'storm'])}</button></div>`;
  }

  /* ---------- 조작 ---------- */
  function bindPanel() {
    panel.querySelectorAll('[data-sc]').forEach(b => b.onclick = () => { if (G.sc === b.dataset.sc) return; G.sc = b.dataset.sc; G.changed = null; G.prev = null; G.result = null; render(); });
    panel.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(+b.dataset.go));
    panel.querySelectorAll('[data-sub]').forEach(b => b.onclick = () => { G.sub = b.dataset.sub; render(); });
    panel.querySelectorAll('[data-shelter]').forEach(b => b.onclick = () => pickShelter(b.dataset.shelter));
    panel.querySelectorAll('[data-next]').forEach(b => b.onclick = () => stepTo(b.dataset.next));
    panel.querySelectorAll('[data-undo]').forEach(b => b.onclick = () => { if (G.path.length > 1) G.path.pop(); render(); });
    panel.querySelectorAll('[data-clear]').forEach(b => b.onclick = () => { G.path = ['H']; render(); });
    panel.querySelectorAll('[data-act]').forEach(b => b.onclick = () => { const a = G.acts[G.sc], id = b.dataset.act, i = a.indexOf(id); if (i < 0) a.push(id); else a.splice(i, 1); render(); });
    panel.querySelectorAll('[data-run]').forEach(b => b.onclick = run);
    panel.querySelectorAll('[data-skip]').forEach(b => b.onclick = () => finish());
    panel.querySelectorAll('[data-replay]').forEach(b => b.onclick = run);
    panel.querySelectorAll('[data-fix]').forEach(b => b.onclick = () => fix(b.dataset.fix));
    panel.querySelectorAll('[data-change]').forEach(b => b.onclick = () => changeCond(b.dataset.change));
    panel.querySelectorAll('[data-other]').forEach(b => b.onclick = () => { G.sc = G.sc === 'storm' ? 'tsu' : 'storm'; G.changed = null; G.prev = null; G.result = null; G.step = 1; render(); });
  }
  function go(n) {
    stopAnim();
    if (n === 2 && !G.shelter) G.sub = 'shelter';
    else if (n === 2) G.sub = routeDone() ? 'act' : 'route';
    if (n === 4 && G.result) { G.step = 4; render(); showFinal(); return; }
    G.step = n; render();
  }
  function pickShelter(id) {
    G.shelter = id;
    // 지금까지의 경로가 다른 대피 장소에서 끝나 있으면 그 장소 앞까지 되돌림 (나머지 경로는 그대로 이어 감)
    if (SHELTERS.includes(G.path[G.path.length - 1]) && G.path[G.path.length - 1] !== id) G.path.pop();
    G.sub = routeDone() ? 'act' : 'route'; render();
  }
  function stepTo(k) {
    const last = G.path[G.path.length - 1];
    if (G.path.length > 1 && k === G.path[G.path.length - 2]) { G.path.pop(); render(); return; }   // 바로 전 갈림길을 누르면 한 칸 되돌리기
    if (routeDone()) { setCap(TX.cap.routeFull); return; }
    if (!neighbors(last).includes(k) || G.path.includes(k)) { setCap(TX.cap.notLinked); flashHint(); return; }
    if (SHELTERS.includes(k) && k !== G.shelter) { setCap(TX.cap.otherShelter(TX.place[k])); return; }
    G.path.push(k); render();
  }
  let hintTimer = 0;
  function flashHint() { gHit.classList.add('flash'); clearTimeout(hintTimer); hintTimer = setTimeout(() => gHit.classList.remove('flash'), 700); }
  /* 지도에서 누를 수 있는 것: 대피 장소 후보(①) / 다음 갈림길(②) */
  function hits() {
    gHit.innerHTML = '';
    const add = (n, cls, cb, r = 20) => { const c = E('circle', { cx: n.x, cy: n.y, r, class: 'hit ' + cls, tabindex: 0, role: 'button', 'aria-label': n.name }); c.addEventListener('click', cb); c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cb(); } }); gHit.appendChild(c); };
    if (G.step !== 2) return;
    if (G.sub === 'shelter') SHELTERS.forEach(id => add(NODES[id], 'cand' + (G.shelter === id ? ' sel' : ''), () => pickShelter(id), 24));
    if (G.sub === 'route') {
      const last = G.path[G.path.length - 1];
      for (const k in NODES) {
        if (k === 'H' && G.path.length === 1) continue;
        const cand = !routeDone() && neighbors(last).includes(k) && !G.path.includes(k) && (!SHELTERS.includes(k) || k === G.shelter);
        add(NODES[k], cand ? 'cand' : G.path.includes(k) ? 'onpath' : 'idle', () => stepTo(k), cand ? 20 : 14);
      }
    }
  }
  function fix(k) {
    stopAnim();
    if (k === 'cond') { G.step = 1; render(); return; }
    G.step = 2; G.sub = k === 'shelter' ? 'shelter' : k === 'route' ? 'route' : 'act';
    if (k === 'route') G.path = ['H'];
    render();
  }
  function changeCond(k) {
    G.prev = { sc: G.sc, cond: JSON.parse(JSON.stringify(G.cond[G.sc])), overall: G.lastFb ? G.lastFb.overall : null };
    const c = G.cond[G.sc];
    if (k === 'tide') c.tide = c.tide === 'high' ? 'low' : 'high';
    if (k === 'wind') c.wind = c.wind === 'strong' ? 'weak' : 'strong';
    if (k === 'left') c.left = c.left === 10 ? 30 : 10;
    G.changed = k; G.result = null; G.step = 1; floodKey = ''; render();
  }

  /* ---------- 실행 애니메이션 (1분 = SEC 초) ---------- */
  const SEC = .22;
  function run() {
    G.result = evaluate(); G.step = 3; G.anim = { t: 0 }; setPaused(false);
    render(); drawResult(null);
  }
  function stopAnim() { G.anim = null; }
  function posAt(R, t) {
    for (const sg of R.tl) {
      if (t > sg.t1 && sg !== R.tl[R.tl.length - 1]) continue;
      if (sg.type === 'stay') return { p: sg.node, sg };
      const f = clamp((t - sg.t0) / (sg.t1 - sg.t0), 0, 1), r = sg.road, pts = r.a === sg.a ? r.pts : r.pts.slice().reverse();
      const seg = r.a === sg.a ? r.seg : r.seg.slice().reverse();
      return { p: along(pts, seg, r.L, f), sg };
    }
    return { p: NODES[R.shelter], sg: null };
  }
  function frame(dt) {
    if (!G.anim || G.step !== 3) return;
    const R = G.result; G.anim.t += dt / SEC;
    const t = Math.min(G.anim.t, R.end);
    const { p } = posAt(R, t);
    marker.setAttribute('transform', `translate(${f1(p.x)},${f1(p.y)})`);
    paintFlood(t);
    // 지금 위치가 위험한지 (지점의 onset 과 비교)
    const on = R.hz.onset(pointInfo(p.x, p.y)), atShelterV = t >= R.arrive && R.shelter === 'V';
    const danger = t >= on && !(t >= R.arrive && R.shelter === 'P') && !atShelterV;
    warn.style.display = danger ? '' : 'none'; warn.setAttribute('transform', `translate(${f1(p.x)},${f1(p.y)})`);
    clock.hidden = false; clock.innerHTML = TX.clock(Math.floor(t), G.sc, R.hz.peak, G.sc === 'storm' ? R.hz.strong : false);
    const tl = $('#g3-tl');
    if (tl) G.runItems.forEach((it, i) => { const li = tl.children[i]; li.classList.toggle('on', t >= it.t0 && (t < it.t1 || (it.k === 'arrive' && t >= it.t0))); li.classList.toggle('done', t >= it.t1 && it.k !== 'arrive'); });
    if (G.anim.t >= R.end + 1.5 / SEC) finish();   // 끝난 뒤 1.5 초 보여 주고 결과로
  }
  function showFinal() {
    const R = G.result;
    paintFlood(R.end); drawResult(R);
    const n = NODES[R.shelter]; marker.setAttribute('transform', `translate(${n.x},${n.y})`);
    // 처음 위험했던 곳 표시
    const firstDanger = R.tl.flatMap(sg => sg.marks || []).filter(m => m.st === 'danger').sort((a, b) => a.t - b.t)[0];
    warn.style.display = firstDanger ? '' : 'none';
    if (firstDanger) warn.setAttribute('transform', `translate(${f1(firstDanger.p.x)},${f1(firstDanger.p.y)})`);
    clock.hidden = false; clock.innerHTML = TX.clockEnd(G.sc);
  }
  function finish() { if (!G.result) return; G.anim = null; G.step = 4; render(); showFinal(); }

  /* 지도 크기에 맞춰 누르는 원 크기 조정 (폰에서도 누르기 쉽게) */
  function fitHit() { const s = stage.clientWidth / W; svg.style.setProperty('--hs', s ? Math.max(1, .55 / s).toFixed(2) : 1); }
  if (window.ResizeObserver) new ResizeObserver(fitHit).observe(stage); else addEventListener('resize', fitHit);
  render(); fitHit();
  frames['3'] = frame;
  tabInit['3'] = () => { fitHit(); };
})();
