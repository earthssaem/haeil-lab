/* 탭3: 해일이 오기 전 — 실시간 지진 해일 대피 게임 (위에서 내려다본 가상의 해안 마을, 지도 전체가 한 화면)
   - 조작: 방향키·WASD / 태블릿은 지도 밖 방향 패드. 도로·광장(이동 가능 격자 WALK)에서만 움직이고 건물·물은 통과하지 못함.
     대각선 입력은 정규화, 이동량은 프레임 시간(dt)에 비례 → 프레임 속도와 상관없이 같은 속도.
     도로 방향과 입력 방향이 조금 달라도(비스듬한 길) 가까운 진행 가능 방향으로 미끄러지듯 따라감.
   - 해일: 시작과 함께 바다에서 해안으로 다가오고(도달 시각 T), 해안에 닿으면 '바다와 이어진, 침수 한계 고도 L 보다 낮은 칸'으로만
     물이 퍼짐. 칸마다 물이 닿는 시각 FT 를 다익스트라로 미리 계산(하천은 빠르게, 높을수록 느리게) → 화면 표시·이동 가능 여부·판정이 모두 FT 하나를 씀.
     지형에 막힌 낮은 곳은 바다와 이어지지 않으면 잠기지 않음.
   - 판정: 지정 대피 장소에 닿으면 대피 완료. 물이 닿은 칸에 들어가거나 물이 내 위치에 닿으면 멈추고 '경로를 다시 확인해 보자'.
     해안 도달 시각이 지나도 판은 끝나지 않고, 안전한 높은 곳에 있으면 그대로 계속 이동할 수 있음.
   - 게임용 압축 시간·단순화 모형이며 실제 침수 예측이 아님. 폭풍 해일 모드는 MODES 에 같은 형식으로 추가해 확장 */
/* ================= 탭3: 실시간 대피 게임 ================= */
(function () {
  const TX = TEXT.tab3;
  const W = 960, H = 540, INK = '#24303A';
  const sm = smooth;

  /* ---------- 지형 (단위: px, 해발 m) ---------- */
  const coastY = x => 428 + 6 * Math.sin(x / 57) + 4 * Math.sin(x / 23 + 1) - 34 * sm(600, 630, x) * (1 - sm(760, 790, x));   // 해안선 (항구는 안쪽으로)
  const riverX = y => 455 + 14 * Math.sin(y / 70 + .4);
  const riverW = y => 8 + 6 * y / 430;
  function elev(x, y) {
    const d = coastY(x) - y;
    if (d <= 0) return -1;
    let b = d < 70 ? .6 + 3.4 * d / 70 : d < 190 ? 4 + 6 * (d - 70) / 120 : 10 + (d - 190) * .07;
    b += 10 * Math.exp(-((x - 120) ** 2 + (y - 100) ** 2) / (2 * 110 * 110)) + 10 * Math.exp(-((x - 860) ** 2 + (y - 110) ** 2) / (2 * 110 * 110));
    const r = Math.abs(x - riverX(y));
    b -= Math.min(b * .5, 4) * Math.exp(-((r / 60) ** 2));      // 하천 주변은 골짜기처럼 낮음
    return b;
  }
  const isSea = (x, y) => y >= coastY(x);
  const inRiver = (x, y) => !isSea(x, y) && Math.abs(x - riverX(y)) < riverW(y);

  /* ---------- 도로 (kind: coast 해안도로 · river 강변길 → 침수 위험 구간으로 표시 / main · upper · lane · hill) ---------- */
  const ROADS = [
    { id: 'coastW', kind: 'coast', pts: [[20, 410], [200, 413], [300, 411], [405, 410]] },
    { id: 'coastBr', kind: 'coast', bridge: true, pts: [[405, 410], [505, 410]] },
    { id: 'coastE', kind: 'coast', pts: [[505, 410], [585, 404], [612, 374], [770, 374], [800, 404], [900, 410], [945, 410]] },
    { id: 'mainW', kind: 'main', pts: [[20, 300], [420, 300]] },
    { id: 'mainBr', kind: 'main', bridge: true, pts: [[420, 300], [472, 300]] },
    { id: 'mainE', kind: 'main', pts: [[472, 300], [945, 300]] },
    { id: 'upW', kind: 'upper', pts: [[90, 190], [430, 190]] },
    { id: 'upBr', kind: 'upper', bridge: true, pts: [[430, 190], [482, 190]] },
    { id: 'upE', kind: 'upper', pts: [[482, 190], [890, 190]] },
    { id: 'hillW', kind: 'hill', pts: [[80, 410], [80, 300], [90, 190], [108, 112]] },
    { id: 'lane2', kind: 'lane', pts: [[270, 411], [270, 300], [270, 190]] },
    { id: 'riverW', kind: 'river', pts: [[405, 410], [405, 300], [418, 190]] },
    { id: 'riverE', kind: 'river', pts: [[505, 410], [500, 300], [492, 190]] },
    { id: 'lane4', kind: 'lane', pts: [[640, 374], [640, 300]] },
    { id: 'hillE', kind: 'hill', pts: [[800, 404], [800, 300], [838, 258], [812, 226], [845, 190]] },
    { id: 'hillC', kind: 'hill', pts: [[900, 410], [906, 330], [890, 262], [880, 190]] },
    { id: 'school', kind: 'lane', pts: [[870, 190], [870, 120]] },
    { id: 'bldg', kind: 'lane', pts: [[700, 300], [700, 336]], only: 'bldg' },
  ];
  ROADS.forEach(r => { r.name = TX.road[r.id]; });
  const SHELTERS = {
    park: { x: 110, y: 100, kind: 'hill' }, school: { x: 870, y: 106, kind: 'hill' }, bldg: { x: 700, y: 348, kind: 'building' },
  };
  for (const k in SHELTERS) { const s = SHELTERS[k]; s.id = k; s.e = elev(s.x, s.y); s.name = TX.shelter[k]; }

  /* ---------- 모드·조건 (지진 해일 먼저. 폭풍 해일은 같은 형식으로 추가) ----------
     T: 해안 도달 시각(게임 초) · L: 침수 한계 고도(m) · start: 출발 위치 · shelters: 지정 대피 장소 · closed: 통행 금지(공사) 도로 */
  const MODES = {
    tsunami: {
      levels: [
        { id: 'p', T: 22, L: 7, start: [560, 300], shelters: ['park', 'school'], closed: [] },
        { id: 'harbor', T: 9.5, L: 7.5, start: [700, 374], shelters: ['park', 'school'], closed: [] },
        { id: 'debris', T: 10, L: 7.5, start: [200, 413], shelters: ['park', 'school'], closed: [], debris: [[80, 352], [270, 245]] },
        { id: 'west', T: 10, L: 7.5, start: [270, 345], shelters: ['school', 'bldg'], closed: ['mainBr'] },
        { id: 'crowd', T: 9, L: 7.5, start: [640, 340], shelters: ['park'], closed: [], crowd: [[418, 190, 26]] },
        { id: 'short', T: 9.5, L: 7, start: [585, 404], shelters: ['park', 'school', 'bldg'], closed: [] },
      ],
    },
  };
  const MODE = MODES.tsunami;
  const SPEED = 36;          // 걷는 속도 (px/s) — 키를 누르면 0.12초 안에 이 속도에 이름
  const NPC_SPEED = SPEED * .78;   // 함께 대피하는 주민
  const PR = 6;              // 캐릭터 반지름 (그림)

  /* ---------- 캔버스 ---------- */
  const stage = $('#stage3'), cv = $('#cv3'), ctx = cv.getContext('2d');
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W * DPR; cv.height = H * DPR;
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const segDist = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, t = l ? clamp(((px - ax) * dx + (py - ay) * dy) / l, 0, 1) : 0; return Math.hypot(px - ax - t * dx, py - ay - t * dy); };
  const roadDist = (x, y, roads) => { let m = 1e9; for (const r of roads) for (let i = 1; i < r.pts.length; i++) m = Math.min(m, segDist(x, y, r.pts[i - 1][0], r.pts[i - 1][1], r.pts[i][0], r.pts[i][1])); return m; };
  const nearestRoad = (x, y, roads) => { let m = 1e9, best = null; for (const r of roads) for (let i = 1; i < r.pts.length; i++) { const d = segDist(x, y, r.pts[i - 1][0], r.pts[i - 1][1], r.pts[i][0], r.pts[i][1]); if (d < m) { m = d; best = r; } } return best; };

  /* 지형 색 (한 번만 계산) */
  const terrainCv = mk(W, H);
  (function () {
    const c = terrainCv.getContext('2d'), img = c.createImageData(W, H), d = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const e = elev(x, y), o = (y * W + x) * 4;
      let col;
      if (e < 0) { const k = clamp((y - coastY(x)) / 110, 0, 1); col = [lerp(150, 104, k), lerp(198, 160, k), lerp(226, 204, k)]; }
      else if (inRiver(x, y)) col = [118, 178, 218];
      else col = e < 4 ? [240, 228, 186] : e < 10 ? [222, 233, 200] : e < 20 ? [198, 216, 164] : [178, 200, 142];
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  })();

  /* ---------- 침수 격자 (4 px) : 물이 닿는 시각 FT ---------- */
  const FC = 4, FW = W / FC, FH = Math.ceil(H / FC);
  const FE = new Float32Array(FW * FH), FTY = new Uint8Array(FW * FH), BANK = new Float32Array(FW * FH);   // 칸 중심 해발, 종류(0 땅 1 하천 2 바다), 하천 칸의 둑 높이(다리 높이)
  for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) {
    const x = i * FC + 2, y = j * FC + 2, k = j * FW + i;
    FE[k] = elev(x, y); FTY[k] = isSea(x, y) ? 2 : inRiver(x, y) ? 1 : 0;
    if (FTY[k] === 1) BANK[k] = Math.min(elev(riverX(y) - riverW(y) - 4, y), elev(riverX(y) + riverW(y) + 4, y));
  }
  let FT = new Float64Array(FW * FH), FTMAX = 0, LV_L = 7;
  function computeFlood(T, L) {
    LV_L = L;
    FT = new Float64Array(FW * FH).fill(Infinity);
    // 최소 힙
    const hk = [], hv = [];
    const push = (k, v) => { hk.push(k); hv.push(v); let i = hk.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (hv[p] <= hv[i]) break; [hk[p], hk[i]] = [hk[i], hk[p]]; [hv[p], hv[i]] = [hv[i], hv[p]]; i = p; } };
    const pop = () => { const k = hk[0], v = hv[0], lk = hk.pop(), lv = hv.pop(); if (hk.length) { hk[0] = lk; hv[0] = lv; let i = 0; for (;;) { const a = 2 * i + 1, b = a + 1; let m = i; if (a < hk.length && hv[a] < hv[m]) m = a; if (b < hk.length && hv[b] < hv[m]) m = b; if (m === i) break; [hk[m], hk[i]] = [hk[i], hk[m]]; [hv[m], hv[i]] = [hv[i], hv[m]]; i = m; } } return [k, v]; };
    // 해일이 해안에 닿는 시각 T: 바다 칸에서 출발
    for (let k = 0; k < FW * FH; k++) if (FTY[k] === 2) { FT[k] = T; push(k, T); }
    const speed = k => FTY[k] === 1 ? 140 : 10 + 45 * (1 - FE[k] / L);   // px/s: 하천은 빠르게, 땅은 높을수록 느리게
    while (hk.length) {
      const [k, v] = pop(); if (v > FT[k]) continue;
      const i = k % FW, j = (k / FW) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= FW || nj >= FH) continue;
        const n = nj * FW + ni; if (FTY[n] === 2) continue;
        if (FTY[n] === 0 && FE[n] >= L) continue;              // 침수 한계보다 높은 땅에는 물이 오르지 못함 → 그 너머 낮은 곳도 이어지지 않으면 안전
        const nv = v + (di && dj ? 1.414 : 1) * FC / speed(n);
        if (nv < FT[n]) { FT[n] = nv; push(n, nv); }
      }
    }
    FTMAX = 0; for (let k = 0; k < FT.length; k++) { const f = ftCell(k); if (f >= 0 && isFinite(f)) FTMAX = Math.max(FTMAX, f); }
  }
  /* 그 자리가 물에 잠기는 시각 (바다 -1). 하천 칸은 다리 위로만 다니므로, 둑(다리)이 침수 한계보다 낮을 때만 잠김 */
  const ftCell = k => FTY[k] === 2 ? -1 : FTY[k] === 1 ? (BANK[k] < LV_L ? FT[k] : Infinity) : FT[k];
  const ftAt = (x, y) => ftCell(clamp(Math.floor(y / FC), 0, FH - 1) * FW + clamp(Math.floor(x / FC), 0, FW - 1));

  /* ---------- 이동 가능 격자 (2 px): 도로·광장, 물·통행 금지 제외 ---------- */
  const WC = 2, WW = W / WC, WH = H / WC;
  let WALK = new Uint8Array(WW * WH);
  function buildWalk(lv) {
    const c = mk(WW, WH), g = c.getContext('2d');
    g.scale(1 / WC, 1 / WC); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#000'; g.fillStyle = '#000';
    g.lineWidth = 13;                                     // 캐릭터 중심이 다닐 수 있는 폭 (그림 속 도로 폭 18 - 여유)
    for (const r of roadsOf(lv)) { g.beginPath(); r.pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); }
    for (const id of lv.shelters) { const s = SHELTERS[id]; g.beginPath(); g.arc(s.x, s.y, 13, 0, 7); g.fill(); }
    g.beginPath(); g.arc(lv.start[0], lv.start[1], 8, 0, 7); g.fill();
    g.globalCompositeOperation = 'destination-out';      // 통행 금지 구간
    for (const id of lv.closed) { const p = closedAt(id); g.beginPath(); g.arc(p[0], p[1], 9, 0, 7); g.fill(); }
    for (const [x, y] of lv.debris || []) { g.beginPath(); g.arc(x, y, 11, 0, 7); g.fill(); }   // 지진으로 무너진 담장
    const d = g.getImageData(0, 0, WW, WH).data, bridgeMask = mk(WW, WH), bg = bridgeMask.getContext('2d');
    bg.scale(1 / WC, 1 / WC); bg.lineWidth = 16; bg.lineCap = 'butt';
    for (const r of roadsOf(lv)) if (r.bridge && !lv.closed.includes(r.id)) { bg.beginPath(); r.pts.forEach(([x, y], i) => i ? bg.lineTo(x, y) : bg.moveTo(x, y)); bg.stroke(); }
    const bd = bg.getImageData(0, 0, WW, WH).data;
    WALK = new Uint8Array(WW * WH);
    for (let j = 0; j < WH; j++) for (let i = 0; i < WW; i++) {
      const k = j * WW + i, x = i * WC + 1, y = j * WC + 1;
      if (d[k * 4 + 3] < 128 || isSea(x, y)) continue;
      if (inRiver(x, y) && bd[k * 4 + 3] < 128) continue;  // 하천은 다리 위로만
      WALK[k] = 1;
    }
  }
  /* 가장 가까운 도로 구간: 방향(ux, uy)과 그 위의 가장 가까운 점(cx, cy) */
  let SEGS = [];
  const buildSegs = lv => { SEGS = []; for (const r of roadsOf(lv)) for (let i = 1; i < r.pts.length; i++) { const [ax, ay] = r.pts[i - 1], [bx, by] = r.pts[i], l = Math.hypot(bx - ax, by - ay); SEGS.push({ ax, ay, bx, by, ux: (bx - ax) / l, uy: (by - ay) / l, l }); } };
  function nearSeg(x, y) {
    let best = null, bd = 12;
    for (const g of SEGS) { const t = clamp((x - g.ax) * g.ux + (y - g.ay) * g.uy, 0, g.l), cx = g.ax + g.ux * t, cy = g.ay + g.uy * t, d = Math.hypot(x - cx, y - cy); if (d < bd) { bd = d; best = { ux: g.ux, uy: g.uy, cx, cy }; } }
    return best;
  }
  /* 사람들로 혼잡한 곳: 걷는 속도가 느려짐 (시작부터 보임) */
  const slowAt = (x, y) => { for (const [cx, cy, r] of G.lv.crowd || []) if (Math.hypot(x - cx, y - cy) < r) return .35; return 1; };
  const walkable = (x, y) => x >= 0 && y >= 0 && x < W && y < H && WALK[Math.floor(y / WC) * WW + Math.floor(x / WC)] === 1;
  const roadsOf = lv => ROADS.filter(r => !r.only || lv.shelters.includes(r.only));
  const closedAt = id => { const r = ROADS.find(q => q.id === id), a = r.pts[0], b = r.pts[r.pts.length - 1]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };

  /* ---------- 바탕 지도 (조건마다 한 번 그림) ---------- */
  const baseCv = mk(W * DPR, H * DPR);
  function drawBase(lv) {
    const g = baseCv.getContext('2d');
    g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, W, H);
    g.imageSmoothingEnabled = true; g.drawImage(terrainCv, 0, 0, W, H);
    // 등고선 5·10·20 m (marching squares, 4 px 격자)
    g.lineCap = 'round';
    for (const L of [5, 10, 20]) {
      g.beginPath();
      for (let j = 0; j < FH - 1; j++) for (let i = 0; i < FW - 1; i++) {
        const v = [FE[j * FW + i], FE[j * FW + i + 1], FE[(j + 1) * FW + i + 1], FE[(j + 1) * FW + i]];
        if (v.some(q => q < 0) || FTY[j * FW + i] === 1) continue;
        const P = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]], pts = [];
        for (let q = 0; q < 4; q++) { const a0 = v[q], a1 = v[(q + 1) % 4]; if ((a0 < L) !== (a1 < L)) { const f = (L - a0) / (a1 - a0), p0 = P[q], p1 = P[(q + 1) % 4]; pts.push([(p0[0] + (p1[0] - p0[0]) * f) * FC + 2, (p0[1] + (p1[1] - p0[1]) * f) * FC + 2]); } }
        for (let q = 0; q + 1 < pts.length; q += 2) { g.moveTo(pts[q][0], pts[q][1]); g.lineTo(pts[q + 1][0], pts[q + 1][1]); }
      }
      g.strokeStyle = 'rgba(86,104,66,.55)'; g.lineWidth = L === 10 ? 1.8 : 1.1; g.stroke();
    }
    // 해안선·하천 둑
    g.strokeStyle = 'rgba(36,48,58,.6)'; g.lineWidth = 2;
    g.beginPath(); for (let x = 0; x <= W; x += 3) { const y = coastY(x); x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
    for (const s of [-1, 1]) { g.beginPath(); for (let y = 0; y <= 430; y += 4) { const x = riverX(y) + s * riverW(y); y ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
    // 방파제
    g.strokeStyle = '#7B8792'; g.lineWidth = 6; g.beginPath(); g.moveTo(612, 412); g.lineTo(626, 444); g.moveTo(778, 410); g.lineTo(766, 442); g.stroke();
    const roads = roadsOf(lv);
    // 건물(지나갈 수 없음): 도로·하천·대피 장소에서 떨어진 땅에 작은 집
    g.fillStyle = '#D5D9DD'; g.strokeStyle = '#8A949C'; g.lineWidth = 1;
    for (let y = 40; y < 430; y += 19) for (let x = 14; x < W - 10; x += 23) {
      const jx = x + ((y * 7) % 9) - 4, jy = y + ((x * 3) % 7) - 3, e = elev(jx, jy);
      if (e < .8 || e > 17 || Math.abs(jx - riverX(jy)) < riverW(jy) + 14) continue;
      if (roadDist(jx, jy, roads) < 17) continue;
      if (Object.values(SHELTERS).some(s => Math.hypot(s.x - jx, s.y - jy) < 40)) continue;
      g.fillRect(jx - 6, jy - 4.5, 12, 9); g.strokeRect(jx - 6, jy - 4.5, 12, 9);
    }
    // 도로: 테두리 → 바탕(침수 위험 구간은 옅은 파랑) → 위험 구간 파란 점선
    g.lineCap = 'round'; g.lineJoin = 'round';
    const path = r => { g.beginPath(); r.pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); };
    for (const r of roads) { path(r); g.strokeStyle = INK; g.lineWidth = 19; g.stroke(); }
    for (const r of roads) { path(r); g.strokeStyle = r.bridge ? '#ECEFF1' : (r.kind === 'coast' || r.kind === 'river') ? '#D3E6F6' : '#FFFFFF'; g.lineWidth = 15; g.stroke(); }
    for (const r of roads) if (r.kind === 'coast' || r.kind === 'river') { path(r); g.setLineDash([7, 6]); g.strokeStyle = '#2B6CB0'; g.lineWidth = 2; g.stroke(); g.setLineDash([]); }
    // 통행 금지(공사)
    for (const id of lv.closed) {
      const [x, y] = closedAt(id);
      g.save(); g.translate(x, y); g.fillStyle = '#fff'; g.strokeStyle = INK; g.lineWidth = 2; g.fillRect(-11, -11, 22, 22); g.strokeRect(-11, -11, 22, 22);
      g.strokeStyle = '#D9483B'; g.lineWidth = 4; g.beginPath(); g.moveTo(-7, -7); g.lineTo(7, 7); g.moveTo(7, -7); g.lineTo(-7, 7); g.stroke(); g.restore();
      label(g, TX.map.closed, x, y + 24, { fs: 13, bg: '#FCE6E1' });
    }
    // 지명·표고·표지판
    label(g, TX.map.sea, 150, 492, { fs: 22, color: '#1E5A85', plain: true });
    label(g, TX.map.harbor, 694, 410, { fs: 14, plain: true, color: '#1E5A85' });
    label(g, TX.map.river, 470, 70, { fs: 15, plain: true, color: '#1E5A85' });
    label(g, TX.map.low, 190, 372, { fs: 14, plain: true }); label(g, TX.map.high, 330, 120, { fs: 14, plain: true });
    for (const [x, y] of [[200, 413], [640, 374], [560, 300], [270, 190], [700, 190], [405, 300], [905, 330]]) spot(g, x, y);
    for (const [x, y, t] of [[150, 300, TX.map.signW], [760, 300, TX.map.signE], [560, 190, TX.map.signUp], [300, 411, TX.map.signN], [680, 374, TX.map.signN]]) sign(g, x, y, t);
    label(g, TX.map.risk, 250, 432, { fs: 12, bg: '#D3E6F6', color: '#1E5A85' });
    label(g, TX.map.risk, 532, 352, { fs: 12, bg: '#D3E6F6', color: '#1E5A85' });
    // 지정 대피 장소
    for (const id of lv.shelters) shelterIcon(g, SHELTERS[id]);
    // 무너진 담장(지나갈 수 없음)
    for (const [x, y] of lv.debris || []) {
      g.fillStyle = '#A1887F'; g.strokeStyle = INK; g.lineWidth = 1.5;
      for (const [dx, dy, r] of [[-6, -2, 6], [4, 3, 7], [7, -5, 5], [-2, 6, 5], [-8, 5, 4]]) { g.beginPath(); g.moveTo(x + dx - r, y + dy); g.lineTo(x + dx - r * .3, y + dy - r); g.lineTo(x + dx + r, y + dy - r * .4); g.lineTo(x + dx + r * .6, y + dy + r * .8); g.closePath(); g.fill(); g.stroke(); }
      label(g, TX.map.debris, x + (x < 150 ? 52 : 0), y - 20, { fs: 12, bg: '#EFE3D7' });
    }
    for (const [x, y, r] of lv.crowd || []) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = 'rgba(242,178,51,.22)'; g.fill(); g.setLineDash([4, 4]); g.strokeStyle = '#B7791F'; g.lineWidth = 1.5; g.stroke(); g.setLineDash([]); label(g, TX.map.crowd, x, y - r - 12, { fs: 12, bg: '#FFF3D6' }); }
  }
  function label(g, text, x, y, o = {}) {
    g.font = `${o.fs || 14}px Jua, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const w = g.measureText(text).width + 12, h = (o.fs || 14) + 8;
    if (!o.plain) { g.fillStyle = o.bg || '#FFFDF8'; g.strokeStyle = INK; g.lineWidth = 1.5; roundRect(g, x - w / 2, y - h / 2, w, h, h / 2); g.fill(); g.stroke(); }
    else { g.lineWidth = 4; g.strokeStyle = 'rgba(255,253,248,.85)'; g.lineJoin = 'round'; g.strokeText(text, x, y); }
    g.fillStyle = o.color || INK; g.fillText(text, x, y + 1);
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function spot(g, x, y) { label(g, TX.map.spot(Math.max(1, Math.round(elev(x, y)))), x + 22, y - 15, { fs: 11, bg: '#FFFDF8' }); }
  function sign(g, x, y, t) { label(g, t, x, y - 18, { fs: 12, bg: '#2F8F5B', color: '#fff' }); }
  function shelterIcon(g, s) {
    g.save(); g.translate(s.x, s.y);
    if (s.kind === 'building') { g.fillStyle = '#E9EEF2'; g.strokeStyle = INK; g.lineWidth = 2.5; g.fillRect(-13, -16, 26, 30); g.strokeRect(-13, -16, 26, 30); g.fillStyle = '#2F8F5B'; g.fillRect(-13, -16, 26, 9); }
    else { g.fillStyle = '#2F8F5B'; g.strokeStyle = INK; g.lineWidth = 2.5; g.beginPath(); g.moveTo(0, -17); g.lineTo(16, 10); g.lineTo(-16, 10); g.closePath(); g.fill(); g.stroke(); }
    g.restore();
    label(g, TX.map.shelter(s.name, Math.round(s.e)), s.x + (s.x > 800 ? -24 : 0), s.y - 30, { fs: 14, bg: '#E4F3E8' });
  }

  /* ---------- 소리 (대피 시작을 누른 뒤에만, 끌 수 있음) ---------- */
  const Snd = {
    on: true, ctx: null,
    init() {
      if (this.ctx) return; const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const c = this.ctx = new AC();
      this.master = c.createGain(); this.master.gain.value = this.on ? .7 : 0; this.master.connect(c.destination);
      const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
      this.filt = c.createBiquadFilter(); this.filt.type = 'lowpass'; this.filt.frequency.value = 300;
      this.wave = c.createGain(); this.wave.gain.value = 0;
      src.connect(this.filt); this.filt.connect(this.wave); this.wave.connect(this.master); src.start();
    },
    tone(f0, f1, t0, dur, vol = .12, type = 'sine') {
      if (!this.ctx) return; const c = this.ctx, o = c.createOscillator(), gn = c.createGain(), t = c.currentTime + t0;
      o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.linearRampToValueAtTime(f1, t + dur);
      gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(vol, t + .04); gn.gain.setValueAtTime(vol, t + dur - .06); gn.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(gn); gn.connect(this.master); o.start(t); o.stop(t + dur + .02);
    },
    siren() { for (let i = 0; i < 3; i++) { this.tone(620, 920, i * 1.1, .55, .09); this.tone(920, 620, i * 1.1 + .55, .55, .09); } },
    beep() { this.tone(880, 880, 0, .16, .08); this.tone(880, 880, .24, .16, .08); },
    chime() { this.tone(660, 660, 0, .25, .1); this.tone(880, 880, .22, .45, .1); },
    low() { this.tone(330, 260, 0, .6, .09); },
    setWave(level, t) { if (!this.ctx) return; const s = level * (.65 + .35 * Math.sin(t * 2 * Math.PI / 3.2)); this.wave.gain.setTargetAtTime(.02 + .28 * s, this.ctx.currentTime, .1); this.filt.frequency.setTargetAtTime(260 + 1000 * level, this.ctx.currentTime, .2); },
    quiet() { if (this.ctx) this.wave.gain.setTargetAtTime(0, this.ctx.currentTime, .15); },
    pause(v) { if (!this.ctx) return; v ? this.ctx.suspend() : this.ctx.resume(); },
    setOn(v) { this.on = v; if (this.ctx) this.master.gain.setTargetAtTime(v ? .7 : 0, this.ctx.currentTime, .05); },
  };

  /* ---------- 게임 상태 ---------- */
  const G = { li: 0, lv: null, state: 'ready', paused: false, t: 0, x: 0, y: 0, dir: 0, ramp: 0, walk: 0, trail: [], moved: null, beeped: {}, result: null, floodDone: false, npcs: [], saved: 0 };
  const keys = { up: false, down: false, left: false, right: false };
  const clearKeys = () => { for (const k in keys) keys[k] = false; $$('#dpad3 button').forEach(b => b.classList.remove('on')); };
  /* 단계별 별 (이 기기의 브라우저에만 저장, 못 쓰면 저장 없이 진행) */
  const STAR_KEY = 'haeil.stars.v1';
  let STARS = {}; try { STARS = JSON.parse(localStorage.getItem(STAR_KEY) || '{}') || {}; } catch (e) { STARS = {}; }
  const saveStars = () => { try { localStorage.setItem(STAR_KEY, JSON.stringify(STARS)); } catch (e) { /* 저장 못 해도 게임은 그대로 */ } };
  function setLevel(i) {
    G.li = i; G.lv = MODE.levels[i];
    computeFlood(G.lv.T, G.lv.L); buildWalk(G.lv); buildSegs(G.lv); drawBase(G.lv); planNpcs(G.lv);
    reset();
  }
  function reset() {
    const lv = G.lv;
    Object.assign(G, { state: 'ready', paused: false, t: 0, x: lv.start[0], y: lv.start[1], dir: -Math.PI / 2, ramp: 0, walk: 0, trail: [[lv.start[0], lv.start[1], 0]], moved: null, beeped: {}, result: null, floodDone: false, saved: 0 });
    clearKeys(); Snd.quiet(); floodKey = -1;
    $('#g3-paused').hidden = true;
    renderSide(); hud(); draw();
  }
  function start() {
    if (G.state !== 'ready') return;
    Snd.init(); Snd.pause(false); setPaused(false);
    G.state = 'play'; G.paused = false;
    Snd.siren();
    renderSide(); hud();
    cv.focus({ preventScroll: true });
  }
  function setGamePause(v) {
    if (G.state !== 'play') return;
    G.paused = v; clearKeys(); Snd.pause(v); if (!v) setPaused(false);
    $('#g3-paused').hidden = !v; hud();
  }
  function finish(ok, why) {
    G.state = 'done'; clearKeys();
    G.result = analyse(ok, why);
    if (ok) { const id = G.lv.id; STARS[id] = Math.max(STARS[id] || 0, G.result.stars.filter(Boolean).length); saveStars(); }
    ok ? Snd.chime() : Snd.low(); Snd.quiet();
    renderSide(); hud(); draw();
  }

  /* ---------- 함께 대피하는 주민: 대피 장소까지의 거리 지도(흐름장)를 따라 걸음. 시작 전에 침수 시각표로 안전한 사람만 남김 ---------- */
  const NPC_SPOTS = [[150, 300], [330, 300], [600, 300], [740, 300], [880, 300], [330, 190], [640, 190], [760, 190], [270, 380], [640, 340], [800, 350], [150, 412], [560, 404], [860, 410]];
  function planNpcs(lv) {
    const N = WW * WH, D = new Float64Array(N).fill(Infinity), NX = new Int32Array(N).fill(-1), hk = [], hv = [];
    const push = (k, v) => { hk.push(k); hv.push(v); let i = hk.length - 1; while (i > 0) { const q = (i - 1) >> 1; if (hv[q] <= hv[i]) break; [hk[q], hk[i]] = [hk[i], hk[q]]; [hv[q], hv[i]] = [hv[i], hv[q]]; i = q; } };
    const pop = () => { const k = hk[0], v = hv[0], lk = hk.pop(), lv2 = hv.pop(); if (hk.length) { hk[0] = lk; hv[0] = lv2; let i = 0; for (;;) { const a = 2 * i + 1, c = a + 1; let m = i; if (a < hk.length && hv[a] < hv[m]) m = a; if (c < hk.length && hv[c] < hv[m]) m = c; if (m === i) break; [hk[m], hk[i]] = [hk[i], hk[m]]; [hv[m], hv[i]] = [hv[i], hv[m]]; i = m; } } return [k, v]; };
    for (const id of lv.shelters) { const sh = SHELTERS[id]; for (let j = -7; j <= 7; j++) for (let i = -7; i <= 7; i++) { const x = sh.x + i * WC, y = sh.y + j * WC; if (Math.hypot(i * WC, j * WC) < 12 && walkable(x, y)) { const k = Math.floor(y / WC) * WW + Math.floor(x / WC); D[k] = 0; push(k, 0); } } }
    while (hk.length) {
      const [k, d] = pop(); if (d > D[k]) continue;
      const i = k % WW, j = (k / WW) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue; const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= WW || nj >= WH) continue;
        const n = nj * WW + ni; if (!WALK[n]) continue;
        const nd = d + (di && dj ? 1.414 : 1) * WC / slowAt(ni * WC + 1, nj * WC + 1);
        if (nd < D[n]) { D[n] = nd; NX[n] = k; push(n, nd); }
      }
    }
    G.npcs = [];
    NPC_SPOTS.forEach(([x0, y0], q) => {
      if (!walkable(x0, y0) || Math.hypot(x0 - lv.start[0], y0 - lv.start[1]) < 50) return;
      let k = Math.floor(y0 / WC) * WW + Math.floor(x0 / WC); if (!isFinite(D[k])) return;
      const delay = .4 + (q % 4) * .5, pts = [[x0, y0, delay]]; let t = delay, safe = true, steps = 0;
      while (NX[k] >= 0 && steps++ < 5000) {
        const n = NX[k], x = (n % WW) * WC + 1, y = ((n / WW) | 0) * WC + 1, px = (k % WW) * WC + 1, py = ((k / WW) | 0) * WC + 1;
        t += Math.hypot(x - px, y - py) / (NPC_SPEED * slowAt(x, y));
        const ft = ftAt(x, y); if (ft >= 0 && ft <= t + 1.5) { safe = false; break; }
        if (steps % 3 === 0 || NX[n] < 0) pts.push([x, y, t]);
        k = n;
      }
      if (safe && pts.length > 2) G.npcs.push({ pts, end: t, col: ['#7FB3E0', '#8FCB9B', '#B3A4D6', '#F2C46B'][q % 4] });
    });
    G.npcs = G.npcs.slice(0, 7);
  }
  const npcAt = (n, t) => { const P = n.pts; if (t <= P[0][2]) return P[0]; for (let i = 1; i < P.length; i++) if (t <= P[i][2]) { const f = (t - P[i - 1][2]) / (P[i][2] - P[i - 1][2]); return [lerp(P[i - 1][0], P[i][0], f), lerp(P[i - 1][1], P[i][1], f), Math.atan2(P[i][1] - P[i - 1][1], P[i][0] - P[i - 1][0])]; } return null; };

  /* ---------- 이동 (프레임 시간 비례 · 대각선 정규화 · 길을 따라 미끄러짐 · 누르면 바로 빨라짐) ---------- */
  function move(dt) {
    let ix = (keys.right ? 1 : 0) - (keys.left ? 1 : 0), iy = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    if (!ix && !iy) { G.ramp = 0; return; }
    G.ramp = Math.min(1, G.ramp + dt / .12);
    const n = Math.hypot(ix, iy); ix /= n; iy /= n;
    const base = Math.atan2(iy, ix);
    let rest = SPEED * (.35 + .65 * G.ramp) * slowAt(G.x, G.y) * dt, moved = 0;
    while (rest > 1e-6) {
      const step = Math.min(rest, 1.5); rest -= step;
      let done = false;
      const tx = G.x + ix * step, ty = G.y + iy * step;
      if (walkable(tx, ty)) { G.x = tx; G.y = ty; G.dir = base; done = true; moved += step; }
      else {
        // 막히면: 가장 가까운 도로의 진행 방향(입력과 같은 쪽)을 따라 가면서 도로 가운데로 조금 당김 → 비스듬한 길도 떨림 없이 따라감
        const sg = nearSeg(G.x, G.y);
        if (sg) {
          const dot = ix * sg.ux + iy * sg.uy;
          if (Math.abs(dot) > .25) {
            const sgn = Math.sign(dot), cx = sg.cx - G.x, cy = sg.cy - G.y, cl = Math.hypot(cx, cy), pull = Math.min(cl, step * .5);
            const mx = sg.ux * sgn * step + (cl ? cx / cl * pull : 0), my = sg.uy * sgn * step + (cl ? cy / cl * pull : 0), ml = Math.hypot(mx, my);
            const nx = G.x + mx / ml * step, ny = G.y + my / ml * step;
            if (walkable(nx, ny)) { G.x = nx; G.y = ny; G.dir = Math.atan2(my, mx); done = true; moved += step; }
            else if (cl > .3) { const q = Math.min(cl, step); G.x += cx / cl * q; G.y += cy / cl * q; done = true; moved += q; }   // 길 가장자리 칸에 걸리면 먼저 가운데 쪽으로 비켜 섬
          }
        }
        // 그래도 막히면 가까운 방향부터 시험 (광장·모퉁이)
        if (!done) for (const da of [.3, -.3, .6, -.6, .9, -.9]) {
          const a = base + da, nx = G.x + Math.cos(a) * step, ny = G.y + Math.sin(a) * step;
          if (walkable(nx, ny)) { G.x = nx; G.y = ny; G.dir = a; done = true; moved += step; break; }
        }
      }
      if (!done) break;
    }
    G.walk += moved * .45;
    if (G.moved === null && Math.hypot(G.x - G.lv.start[0], G.y - G.lv.start[1]) > 6) G.moved = G.t;
    const last = G.trail[G.trail.length - 1];
    if (Math.hypot(G.x - last[0], G.y - last[1]) > 4) G.trail.push([G.x, G.y, G.t]);
  }
  function frame(dt) {
    if (G.state !== 'play' || G.paused) return;
    G.t += dt;
    move(dt);
    const lv = G.lv, rem = lv.T - G.t;
    // 경보음: 남은 5초·3초 (판이 짧아져서)
    for (const s of [5, 3]) if (rem <= s && !G.beeped[s] && rem > 0) { G.beeped[s] = true; Snd.beep(); }
    Snd.setWave(rem > 0 ? clamp(1 - rem / lv.T, 0, 1) * .8 : (G.t < FTMAX + 2 ? 1 : .35), G.t);
    G.saved = G.npcs.filter(n => G.t >= n.end).length;
    // 도착·침수 판정 (화면의 침수와 같은 FT 사용)
    for (const id of lv.shelters) { const s = SHELTERS[id]; if (Math.hypot(G.x - s.x, G.y - s.y) < 14) { G.trail.push([G.x, G.y, G.t]); finish(true, id); return; } }
    const ft = ftAt(G.x, G.y);
    if (ft >= 0 && ft <= G.t) { G.trail.push([G.x, G.y, G.t]); finish(false, 'flood'); return; }
    G.floodDone = G.t > FTMAX + 1;
    hud(); draw(); sideLive();
  }

  /* ---------- 그리기 (매 프레임) ---------- */
  const floodCv = mk(FW, FH), fctx = floodCv.getContext('2d'), fimg = fctx.createImageData(FW, FH);
  let floodKey = -1;
  function paintFlood(t) {
    const key = Math.round(t * 30); if (key === floodKey) return; floodKey = key;
    const d = fimg.data;
    for (let k = 0; k < FW * FH; k++) {
      const o = k * 4, ft = ftCell(k);
      if (ft < 0 || !(ft <= t)) { d[o + 3] = 0; continue; }
      const age = t - ft;   // 막 물이 닿은 가장자리: 흰 물거품 → 밝은 물 → 깊은 물
      if (age < .35) { d[o] = 240; d[o + 1] = 248; d[o + 2] = 255; d[o + 3] = 240; }
      else if (age < 1.2) { d[o] = 120; d[o + 1] = 186; d[o + 2] = 236; d[o + 3] = 225; }
      else { const w = 8 * Math.sin((k % FW) * .5 + ((k / FW) | 0) * .3 - t * 3); d[o] = 30 + w; d[o + 1] = 96 + w; d[o + 2] = 180 + w; d[o + 3] = 205; }
    }
    fctx.putImageData(fimg, 0, 0);
  }
  function person(x, y, dir, col, sc, phase, outline) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(dir);
    ctx.beginPath(); ctx.ellipse(1, 2, 7 * sc, 5 * sc, 0, 0, 7); ctx.fillStyle = 'rgba(36,48,58,.22)'; ctx.fill();   // 그림자
    const st = Math.sin(phase) * 3.2 * sc;                                                                               // 걸음
    ctx.fillStyle = INK; for (const [fx, fy] of [[st, -2.6 * sc], [-st, 2.6 * sc]]) { ctx.beginPath(); ctx.ellipse(fx, fy, 2.4 * sc, 1.7 * sc, 0, 0, 7); ctx.fill(); }
    ctx.beginPath(); ctx.ellipse(0, 0, 4.2 * sc, 6.4 * sc, 0, 0, 7); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = outline; ctx.stroke();   // 어깨
    ctx.beginPath(); ctx.arc(.8 * sc, 0, 3.3 * sc, 0, 7); ctx.fillStyle = '#3B2F2A'; ctx.fill();                      // 머리
    ctx.restore();
  }
  function draw() {
    const lv = G.lv, t = G.t;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.drawImage(baseCv, 0, 0, W, H);
    // 다가오는 해일 (도달 전): 여러 겹의 물마루가 해안선 모양을 따라 바다 아래쪽에서 해안으로
    if (t < lv.T) {
      const p = t / lv.T, wy = (x, q) => { const cy = coastY(x); return cy + (H + 24 - cy) * (1 - p) + q + 4 * Math.sin(x / 30 + t * 2.4 - q * .1); };
      ctx.beginPath(); for (let x = 0; x <= W; x += 8) x ? ctx.lineTo(x, wy(x, 0)) : ctx.moveTo(x, wy(x, 0));
      ctx.lineTo(W, H + 30); ctx.lineTo(0, H + 30); ctx.closePath();
      ctx.fillStyle = `rgba(16,62,120,${.35 + .25 * p})`; ctx.fill();
      [[0, 5, .95], [16, 3, .55], [34, 2, .35]].forEach(([q, lw, a]) => { ctx.beginPath(); for (let x = 0; x <= W; x += 8) x ? ctx.lineTo(x, wy(x, q)) : ctx.moveTo(x, wy(x, q)); ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = lw; ctx.stroke(); });
      ctx.fillStyle = 'rgba(255,255,255,.85)'; for (let x = 6; x < W; x += 22) { const r = 2 + 1.5 * Math.sin(x * 1.7 + t * 5); ctx.beginPath(); ctx.arc(x, wy(x, 0) - 2, Math.max(.5, r), 0, 7); ctx.fill(); }
      if (G.state !== 'ready' && p < .97) { const y = wy(300, 0); if (y < H - 6) label(ctx, TX.map.wave, 300, y - 16, { fs: 14, bg: '#1E5A85', color: '#fff' }); }
    }
    // 침수 (FT 하나로 그림)
    // 결과 화면: 이 조건에서 물이 결국 닿는 곳 전체(게임 속 최종 침수 구간)를 옅게 겹쳐 보여 줌
    if (G.state === 'done') { paintFlood(FTMAX + 2); ctx.globalAlpha = .55; ctx.drawImage(floodCv, 0, 0, W, FH * FC); ctx.globalAlpha = 1; }
    else if (t >= lv.T) { paintFlood(t); ctx.imageSmoothingEnabled = true; ctx.drawImage(floodCv, 0, 0, W, FH * FC); }
    // 혼잡한 곳의 사람들 (제자리에서 조금씩 움직임)
    for (const [cx, cy, r] of lv.crowd || []) for (let i = 0; i < 9; i++) { const a = i * 2.4, rr = r * (.25 + .6 * ((i * 37) % 10) / 10); person(cx + Math.cos(a) * rr + Math.sin(t * 2 + i) * 1.2, cy + Math.sin(a) * rr * .45, a, '#B8C4CC', .62, t * 3 + i, 1); }
    // 지정 대피 장소 강조 (천천히 커졌다 작아지는 원 — 번쩍임 없음)
    if (G.state === 'play') for (const id of lv.shelters) { const s = SHELTERS[id], r = 22 + 3 * Math.sin(t * 2.4); ctx.beginPath(); ctx.arc(s.x, s.y - 2, r, 0, 7); ctx.strokeStyle = 'rgba(47,143,91,.75)'; ctx.lineWidth = 3; ctx.stroke(); }
    // 함께 대피하는 주민
    if (G.state !== 'ready') for (const n of G.npcs) { const q = npcAt(n, t); if (q) person(q[0], q[1], q[2] ?? -Math.PI / 2, n.col, .95, t * 9, 1.4); }
    else for (const n of G.npcs) person(n.pts[0][0], n.pts[0][1], -Math.PI / 2, n.col, .95, 0, 1.4);
    // 이동한 길
    if (G.trail.length > 1) { ctx.beginPath(); G.trail.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.strokeStyle = G.state === 'done' ? '#7B4FB0' : 'rgba(123,79,176,.5)'; ctx.lineWidth = G.state === 'done' ? 4.5 : 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(); }
    // 출발점
    const [sx, sy] = lv.start; ctx.beginPath(); ctx.arc(sx, sy, 4, 0, 7); ctx.fillStyle = '#7B4FB0'; ctx.fill();
    // 나: 흰 테두리 원 위에 걷는 사람
    ctx.beginPath(); ctx.arc(G.x, G.y, 11, 0, 7); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fill(); ctx.strokeStyle = '#E8553E'; ctx.lineWidth = 2; ctx.stroke();
    person(G.x, G.y, G.dir, G.state === 'done' && !G.result.ok ? '#7B8792' : '#E8553E', 1, G.walk, 1.6);
    // 결과 표시: 중요한 지점 번호
    if (G.state === 'done' && G.result) G.result.marks.forEach((m, i) => { ctx.beginPath(); ctx.arc(m[0], m[1] - 16, 10, 0, 7); ctx.fillStyle = '#F2B233'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = INK; ctx.font = '13px Jua, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(i + 1), m[0], m[1] - 15); });
  }

  /* ---------- 위쪽 표시줄: 남은 시간 · 목표 · 일시 정지 · 소리 ---------- */
  const elTime = $('#g3-time'), elGoal = $('#g3-goal'), elPause = $('#g3-pause'), game = $('#game3');
  let hudKey = '';
  function hud() {
    const lv = G.lv, rem = lv.T - G.t;
    let phase, tt;
    if (G.state === 'done') { phase = G.result.ok ? 'ok' : 'stop'; tt = G.result.ok ? TX.hud.done : TX.hud.stop; }
    else if (rem > 0) { phase = rem / lv.T > .5 ? 'calm' : rem / lv.T > .25 ? 'warn' : 'danger'; tt = TX.hud.left(Math.ceil(rem)); }
    else { phase = 'flood'; tt = G.floodDone ? TX.hud.flooded : TX.hud.arrived; }
    const goal = G.state === 'ready' ? TX.hud.goalReady : G.state === 'done' ? (G.result.ok ? TX.hud.goalOk : TX.hud.goalStop) : G.floodDone ? TX.hud.goalAfter : TX.hud.goal;
    const bar = G.state === 'ready' ? 1 : clamp(rem / lv.T, 0, 1);
    const key = [phase, tt, goal, bar.toFixed(3), G.paused, G.state].join('|'); if (key === hudKey) return; hudKey = key;
    game.dataset.phase = phase;
    elTime.querySelector('b').textContent = tt; elTime.querySelector('i').style.width = (bar * 100).toFixed(1) + '%';
    elGoal.textContent = goal;
    elPause.disabled = G.state !== 'play'; elPause.textContent = G.paused ? TX.hud.resume : TX.hud.pause;
  }

  /* ---------- 결과 분석: 중요한 지점 1~2개 ---------- */
  function analyse(ok, why) {
    const lv = G.lv, roads = roadsOf(lv), notes = [], marks = [];
    const nameAt = (x, y) => { const r = nearestRoad(x, y, roads); return r ? r.name : ''; };
    const delay = G.moved === null ? G.t : G.moved;
    if (!ok) {
      const e = Math.max(1, Math.round(elev(G.x, G.y)));
      marks.push([G.x, G.y]); notes.push(G.moved === null ? TX.note.stay(e, Math.round(G.t)) : TX.note.fail(nameAt(G.x, G.y), e, Math.round(G.t)));
      notes.push(delay >= 2.5 ? TX.note.late(Math.round(delay)) : TX.note.tryHigh);
    } else {
      // 지나간 길 가운데 물이 닿기까지 여유가 가장 짧았던 곳
      let best = null;
      for (const [x, y, t] of G.trail) { const ft = ftAt(x, y); if (ft > 0 && isFinite(ft)) { const m = ft - t; if (!best || m < best.m) best = { x, y, m }; } }
      if (best) { marks.push([best.x, best.y]); const nm = nameAt(best.x, best.y), e = Math.max(1, Math.round(elev(best.x, best.y))); notes.push(best.m < 4 ? TX.note.close(nm, e, Math.max(0, Math.round(best.m))) : TX.note.safeLow(nm, e, Math.round(best.m))); }
      else notes.push(TX.note.allHigh);
      notes.push(delay >= 2.5 ? TX.note.lateOk(Math.round(delay)) : why === 'bldg' ? TX.note.bldg : TX.note.quick);
    }
    // 별: 대피 완료 · 2초 안에 출발 · 여유 있는 길(지나간 곳 모두 물이 닿기 4초 넘게 전에 지남) — 빠르기 순위가 아니라 대피 습관
    let minM = Infinity; for (const [x, y, t] of G.trail) { const ft = ftAt(x, y); if (ft > 0 && isFinite(ft)) minM = Math.min(minM, ft - t); }
    const stars = ok ? [true, G.moved !== null && G.moved <= 2, minM >= 4] : [false, false, false];
    return { ok, why, stars, notes: notes.slice(0, 2), marks: marks.slice(0, 2), time: Math.round(G.t) };
  }

  /* ---------- 지도 옆(좁은 화면은 아래) 안내판: 시작 · 진행 · 결과 ---------- */
  const side = $('#g3-side');
  const starTxt = n => '★'.repeat(n) + '☆'.repeat(3 - n);
  function renderSide() {
    const lv = G.lv, last = G.li === MODE.levels.length - 1;
    let h = '';
    if (G.state === 'ready') {
      h = `<h4 class="g-h">${TX.side.title}</h4>
        <div class="g-levels" role="radiogroup" aria-label="${TX.side.levelQ}">${MODE.levels.map((l, i) => `<button type="button" class="g-opt" role="radio" aria-checked="${i === G.li}" data-lv="${i}"><span class="tx">${TX.level[l.id].name}</span><em class="g-stars" aria-label="${TX.side.starsAria(STARS[l.id] || 0)}">${starTxt(STARS[l.id] || 0)}</em></button>`).join('')}
        <button type="button" class="g-opt" disabled><span class="tx">${TX.side.storm}<small>${TX.side.stormSub}</small></span></button></div>
        <p class="g-intro">${TX.level[lv.id].intro}</p>
        <ul class="g-howto"><li><b>${TX.side.keyL}</b> ${TX.side.keys}</li><li><b>${TX.side.starL}</b> ${TX.side.starInfo}</li></ul>
        <p class="g-note">${TX.side.note}</p>
        <button class="btn primary g-go" type="button" data-start>${TX.side.start}</button>`;
    } else if (G.state === 'play') {
      h = `<h4 class="g-h">${TX.level[lv.id].name}</h4><p class="g-p">${TX.level[lv.id].intro}</p><p class="g-live" id="g3-live"></p>${dpadHTML()}`;
    } else {
      const R = G.result;
      h = `<div class="verdict ${R.ok ? 'ok' : 'bad'}">${R.ok ? TX.side.okTitle(TX.shelter[R.why], R.time) : TX.side.stopTitle}</div>
        ${R.ok ? `<ul class="g-starlist">${R.stars.map((v, i) => `<li class="${v ? 'on' : ''}"><span>${v ? '★' : '☆'}</span>${TX.side.starName[i]}</li>`).join('')}</ul>` : ''}
        <ol class="g-notes">${R.notes.map((n, i) => `<li><span class="n">${R.marks[i] ? i + 1 : '·'}</span><span>${n}</span></li>`).join('')}</ol>
        <p class="g-note">${TX.side.resultNote}</p>
        <div class="g-row">${R.ok && !last ? `<button class="btn primary" type="button" data-next>${TX.side.next}</button>` : ''}<button class="btn ${R.ok && !last ? '' : 'primary'}" type="button" data-again>${TX.side.again}</button><button class="btn" type="button" data-other>${TX.side.other}</button></div>`;
    }
    side.innerHTML = h;
    side.querySelectorAll('[data-lv]').forEach(b => b.onclick = () => { setLevel(+b.dataset.lv); side.querySelector(`[data-lv="${b.dataset.lv}"]`).focus(); });
    side.querySelectorAll('[data-start]').forEach(b => b.onclick = start);
    side.querySelectorAll('[data-again]').forEach(b => b.onclick = again);
    side.querySelectorAll('[data-next]').forEach(b => b.onclick = next);
    side.querySelectorAll('[data-other]').forEach(b => b.onclick = () => { reset(); side.querySelector('[data-lv]').focus(); });
    bindDpad(); liveKey = ''; sideLive();
  }
  const again = () => { reset(); start(); };
  const next = () => { if (G.li < MODE.levels.length - 1) { setLevel(G.li + 1); side.querySelector('[data-start]').focus({ preventScroll: true }); } };
  let liveKey = '';
  function sideLive() {   // 진행 중: 함께 대피한 주민 수
    const el = $('#g3-live'); if (!el) return;
    const k = G.saved + '/' + G.npcs.length; if (k === liveKey) return; liveKey = k;
    el.textContent = G.npcs.length ? TX.side.saved(G.saved, G.npcs.length) : '';
  }
  const dpadHTML = () => `<div class="dpad" id="dpad3" aria-label="${TX.side.pad}">${[['up', '▲'], ['left', '◀'], ['right', '▶'], ['down', '▼']].map(([d, s]) => `<button type="button" data-dir="${d}" aria-label="${TX.side.dir[d]}">${s}</button>`).join('')}</div>`;
  function bindDpad() {
    side.querySelectorAll('#dpad3 [data-dir]').forEach(b => {
      const d = b.dataset.dir, on = v => e => { e.preventDefault(); if (v && (G.state !== 'play' || G.paused)) return; keys[d] = v; b.classList.toggle('on', v); if (v && b.setPointerCapture) b.setPointerCapture(e.pointerId); };
      b.addEventListener('pointerdown', on(true)); ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => b.addEventListener(ev, on(false)));
      b.addEventListener('contextmenu', e => e.preventDefault());
    });
  }

  /* ---------- 키보드: 게임 탭에서는 방향키·스페이스로 페이지가 움직이지 않게 ---------- */
  const KEY = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  addEventListener('keydown', e => {
    if (activeTab !== '3' || e.altKey || e.ctrlKey || e.metaKey) return;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    const k = KEY[e.code];
    if (k) { if (G.state === 'play' || e.code.startsWith('Arrow')) e.preventDefault(); if (G.state === 'play' && !G.paused) keys[k] = true; return; }
    if (e.code === 'Space' && G.state === 'play') e.preventDefault();
    if ((e.code === 'KeyP' || e.code === 'Escape') && G.state === 'play') { e.preventDefault(); setGamePause(!G.paused); return; }
    const onBtn = /^(BUTTON|A|SUMMARY)$/.test(e.target.tagName);
    if (G.state === 'ready' && (e.code === 'Enter' || e.code === 'Space') && !onBtn) { e.preventDefault(); start(); }
    else if (G.state === 'done' && e.code === 'KeyR') { e.preventDefault(); again(); }
    else if (G.state === 'done' && e.code === 'KeyN' && G.result.ok) { e.preventDefault(); next(); }
  });
  addEventListener('keyup', e => { const k = KEY[e.code]; if (k) keys[k] = false; });
  addEventListener('blur', clearKeys);
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'play' && !G.paused) setGamePause(true); });
  elPause.onclick = () => setGamePause(!G.paused);
  const sndBtn = $('#g3-sound');
  sndBtn.textContent = TX.hud.sound; bindToggle(sndBtn, v => Snd.setOn(v));
  $('#g3-paused').textContent = TX.hud.pausedMsg;

  /* 범례·참고 자료 (게임 밖) */
  $('#leg3').innerHTML = TX.legend.map(([sw, t]) => `<li>${sw}<span>${t}</span></li>`).join('');
  $('#t3-h-src').textContent = TX.hSrc; $('#t3-h-leg').textContent = TX.hLeg; cv.setAttribute('aria-label', TX.mapAria); $('#t3-src').innerHTML = TX.sources;

  /* 자동 점검 스크립트용 연결 */
  window.__haeil = { G, keys, setLevel, start, reset, setGamePause, walkable, ftAt, elev, slowAt, levels: MODE.levels, shelters: SHELTERS, SPEED, WC, WW, WH, get WALK() { return WALK; }, get FTMAX() { return FTMAX; } };

  setLevel(0);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { drawBase(G.lv); draw(); });
  frames['3'] = frame;
  tabInit['3'] = () => draw();
  tabLeave['3'] = () => { if (G.state === 'play' && !G.paused) setGamePause(true); };
})();
