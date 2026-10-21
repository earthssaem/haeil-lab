/* 탭3: 해일이 오기 전 — 재난문자와 현장 안내를 바탕으로 대피하는 1인칭 게임 (three.js, js/vendor/three.min.js · MIT)
   흐름: 시작 안내(시간 멈춤) → 훈련용 가상 재난문자(시간 멈춤, '확인'을 누르면 시작) → 안내방송(짧은 음성 + 자막)·현장 표지판·눈앞의 상황을 보며 이동
        → 지정 대피 장소(해솔 언덕 공원) 도착 = 대피 완료 / 물이 차올라 더 갈 수 없으면 멈춤 → 종료 뒤에만 전체 지도로 이동 경로·판단 지점 복기.
   세계: 단위 m. x 동쪽(+), z 남쪽(+, 바다 쪽). 지형 높이 h(x, z) 하나로 3D 지형·도로 높이·카메라 높이·침수 판정·결과 지도를 모두 계산.
   침수: 수면 높이 level(t) 하나. 지형은 바다(하천 포함)와 이어지지 않은 웅덩이가 없게 설계(해안에서 멀어질수록 높아짐)해서,
        '수면보다 낮은 땅 = 바다와 이어진 낮은 곳'이 됨 → 화면의 물·통행·판정이 같은 값을 씀. 해일은 시나리오 시간에 따라 진행(플레이어를 따라오지 않음).
   이동: 도로·인도·광장만 걷는 이동 격자(0.5 m) + 캐릭터 반지름. 건물·담장·물·무너진 담장은 통과 불가. 막히면 가장 가까운 길 방향으로 미끄러짐.
        입력 벡터를 정규화해 대각선이 빠르지 않고, 이동량은 프레임 시간에 비례. 카메라 흔들림·기울어짐·상하 진동 없음.
   게임용 압축 시간·단순화 모형이며 실제 침수 예측이 아님. 폭풍 해일 등은 SCN 형식을 늘려 확장 */
/* ================= 탭3: 1인칭 대피 게임 ================= */
(function () {
  const TX = TEXT.tab3;
  const stage = $('#stage3'), cv = $('#cv3'), root = $('#fp3');
  if (!window.THREE) { $('#fp-card').innerHTML = `<div class="fp-box"><p class="fp-p">${TX.noGL}</p></div>`; return; }
  cv.setAttribute('aria-label', TX.cvAria);

  /* ---------- 지형 ---------- */
  const coastZ = x => 100 + 3 * Math.sin(x / 23);
  const riverX = z => -64 + 4 * Math.sin(z / 30);
  function h(x, z) {
    const d = coastZ(x) - z;
    if (d < 0) return -1.5 + d * .06;                                   // 바다 밑
    let b = d < 60 ? .6 + .08 * d : d < 120 ? 5.4 + .095 * (d - 60) : 11.1 + .2 * Math.min(d - 120, 52);   // 언덕 꼭대기(공원)는 평평
    const r = Math.abs(x - riverX(z));
    if (r < 6) return Math.min(-1.4, b - 6);                            // 하천 물길
    b -= Math.min(b * .55, 6) * Math.exp(-((r / 17) ** 2));             // 하천 주변은 낮은 골짜기
    return b;
  }
  const inRiver = (x, z) => Math.abs(x - riverX(z)) < 6 && z < coastZ(x);
  const BRIDGE = 1.6;                                                   // 해안도로 다리 높이
  const ground = (x, z) => inRiver(x, z) ? BRIDGE : h(x, z);           // 걷는 면 높이 (다리 위는 다리 높이)

  /* ---------- 길 (a → b, 폭 w). 이 안이 걸을 수 있는 곳 ---------- */
  const ROADS = [
    { id: 'coast', a: [-118, 90], b: [118, 90], w: 10 },
    { id: 'main', a: [0, 90], b: [0, 40], w: 8 },
    { id: 'mid', a: [-48, 40], b: [84, 40], w: 8 },
    { id: 'riverside', a: [-48, 90], b: [-48, -20], w: 6 },
    { id: 'upper', a: [-48, -20], b: [84, -20], w: 8 },
    { id: 'hill', a: [40, 40], b: [40, -20], w: 7 },
    { id: 'stairs', a: [40, -20], b: [40, -70], w: 5.5, stairs: true },
    { id: 'east', a: [84, 90], b: [84, -20], w: 8 },
    { id: 'alley', a: [-14, 40], b: [-14, -20], w: 4.5 },
  ];
  ROADS.forEach(r => { r.name = TX.road[r.id]; const dx = r.b[0] - r.a[0], dz = r.b[1] - r.a[1]; r.len = Math.hypot(dx, dz); r.ux = dx / r.len; r.uz = dz / r.len; });
  const PARK = { x: 40, z: -82, r: 13 };          // 지정 대피 장소 (해솔 언덕 공원) 광장
  const DEBRIS = { x: -14, z: 8, r: 3.2 };         // 지진으로 무너진 담장 (골목을 막음)
  const START = { x: 24, z: 90, yaw: -Math.PI / 2 };   // 해안도로, 서쪽(-x)을 봄
  /* 시나리오 시간 (게임 초, 문자 확인 뒤부터) */
  const SCN = {
    T0: 40,                                        // 해일이 해안에 닿는 시각
    A: 4, TAU: 4,                                  // 처음 몇 초 만에 해안 저지대가 빠르게 잠김 (약 A m 까지)
    RISE: 28, LMAX: 9,                             // 그 뒤 천천히 LMAX m 까지
    events: [                                      // 안내방송·추가 문자 (자막 + 짧은 음성)
      { t: 1.2, kind: 'cast', key: 'b1' },
      { t: 15, kind: 'cast', key: 'b2' },
      { t: 30, kind: 'cast', key: 'b3' },
      { t: 40.5, kind: 'cast', key: 'b4' },
      { t: 56, kind: 'sms', key: 'm2' },
    ],
  };
  const level = t => t < SCN.T0 ? 0 : SCN.A * (1 - Math.exp(-(t - SCN.T0) / SCN.TAU)) + (SCN.LMAX - SCN.A) * smooth(0, 1, (t - SCN.T0 - 6) / SCN.RISE);

  /* ---------- 이동 격자 (0.5 m) ---------- */
  const X0 = -120, Z0 = -110, CS = .5, GW = 480, GH = 440, PRAD = .35;
  const WALK = new Uint8Array(GW * GH);
  const segInfo = (x, z, r) => { const t = clamp((x - r.a[0]) * r.ux + (z - r.a[1]) * r.uz, 0, r.len), cx = r.a[0] + r.ux * t, cz = r.a[1] + r.uz * t; return { d: Math.hypot(x - cx, z - cz), cx, cz, t }; };
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const x = X0 + (i + .5) * CS, z = Z0 + (j + .5) * CS;
    let ok = Math.hypot(x - PARK.x, z - PARK.z) < PARK.r - PRAD;
    let onRoad = null;
    for (const r of ROADS) if (segInfo(x, z, r).d < r.w / 2 - PRAD) { ok = true; onRoad = r; break; }
    if (!ok) continue;
    if (inRiver(x, z) && !(onRoad && onRoad.id === 'coast')) continue;   // 하천은 해안도로 다리로만 건넘
    if (z > coastZ(x) - 1) continue;
    if (Math.hypot(x - DEBRIS.x, z - DEBRIS.z) < DEBRIS.r + PRAD) continue;
    WALK[j * GW + i] = 1;
  }
  const walkable = (x, z) => { const i = Math.floor((x - X0) / CS), j = Math.floor((z - Z0) / CS); return i >= 0 && j >= 0 && i < GW && j < GH && WALK[j * GW + i] === 1; };
  const roadAt = (x, z) => { let best = null, bd = 9; for (const r of ROADS) { const s = segInfo(x, z, r); if (s.d < bd) { bd = s.d; best = { r, ...s }; } } return best; };

  /* ---------- three.js 장면 ---------- */
  const SKY = 0xCFE8F6;
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 35, 150);
  const camera = new THREE.PerspectiveCamera(72, 16 / 9, .1, 400);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa48a, .58));
  const sun = new THREE.DirectionalLight(0xffffff, .5); sun.position.set(-60, 120, 40); scene.add(sun);

  /* 지형: 2 m 격자, 높이에 따라 모래·풀 색 */
  (function () {
    const g = new THREE.PlaneGeometry(320, 300, 160, 150); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position, col = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i) + 20, y = h(x, z); p.setXYZ(i, x, y, z);
      const c = y < 0 ? [.78, .74, .6] : y < 2.2 ? [.93, .86, .66] : y < 12 ? [.72, .82, .58] : [.6, .74, .5];
      col.push(...c);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true })));
  })();
  /* 도로: 지형을 따라가는 띠 (인도 → 차도). 계단길은 줄무늬 */
  function strip(r, w, lift, color, stripes) {
    const pos = [], idx = [], cols = [], n = Math.ceil(r.len / (stripes ? .9 : 1.5)), nx = -r.uz, nz = r.ux, c1 = new THREE.Color(color), c2 = new THREE.Color(color).multiplyScalar(.72);
    const vert = (t, sd, c) => { const x = r.a[0] + (r.b[0] - r.a[0]) * t, z = r.a[1] + (r.b[1] - r.a[1]) * t, px = x + nx * w / 2 * sd, pz = z + nz * w / 2 * sd; pos.push(px, (inRiver(px, pz) || inRiver(x, z) ? BRIDGE : h(px, pz)) + lift, pz); cols.push(c.r, c.g, c.b); };
    for (let k = 0; k < n; k++) {   // 칸마다 따로 (계단길은 칸마다 색을 바꿔 계단 단이 또렷하게)
      const c = stripes && k % 2 ? c2 : c1, o = pos.length / 3;
      vert(k / n, -1, c); vert(k / n, 1, c); vert((k + 1) / n, -1, c); vert((k + 1) / n, 1, c);
      idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.setIndex(idx); g.computeVertexNormals();
    // 지형·인도와 겹쳐 깜빡이지 않게 위 띠일수록 앞으로 당김 (polygonOffset)
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 - lift * 10, polygonOffsetUnits: -2 - lift * 20 })); scene.add(m); return m;
  }
  ROADS.forEach(r => {
    if (r.stairs) { strip(r, r.w, .08, 0xD8CFC2, true); return; }
    strip(r, r.w, .06, 0xE4E1DA);                       // 인도
    strip(r, r.w - 2.4, .1, r.id === 'alley' || r.id === 'riverside' ? 0xBDB7AD : 0x8E949A);   // 차도(골목·산책로는 밝게)
  });
  /* 다리 난간 (해안도로가 하천을 건너는 곳) */
  for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(16, .9, .25), new THREE.MeshLambertMaterial({ color: 0xF2F2F2 })); m.position.set(riverX(90), BRIDGE + .45 + .1, 90 + s * 4.9); scene.add(m); }
  /* 공원 광장 */
  { const g = new THREE.CylinderGeometry(PARK.r, PARK.r, .3, 32); const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0xD6E8C4 })); m.position.set(PARK.x, h(PARK.x, PARK.z) + .05, PARK.z); scene.add(m); }

  /* 건물: 길을 따라 양쪽에 촘촘히 → 먼 길을 가리고 교차로에 다가가야 다음 길이 보임 */
  const winTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#9DB7C9'; g.fillRect(14, 16, 36, 26); g.strokeStyle = '#7B8792'; g.lineWidth = 3; g.strokeRect(14, 16, 36, 26); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
  const WALLS = ['#F2D7B6', '#E9CFA9', '#DCE6EE', '#F4E0DC', '#E2EED8', '#EFE6C8', '#F6EFE4'].map(c => new THREE.MeshLambertMaterial({ color: c, map: winTex }));
  const ROOFS = ['#C9744F', '#6F8FAF', '#8A9A6B', '#B5655A'].map(c => new THREE.MeshLambertMaterial({ color: c }));
  const occ = new Uint8Array(GW * GH);   // 건물 겹침 방지
  const BLD = [];
  function tryBuilding(cx, cz, w, d, ht, q) {
    for (let x = cx - w / 2 - .6; x <= cx + w / 2 + .6; x += .5) for (let z = cz - d / 2 - .6; z <= cz + d / 2 + .6; z += .5) {
      const i = Math.floor((x - X0) / CS), j = Math.floor((z - Z0) / CS);
      if (i < 0 || j < 0 || i >= GW || j >= GH || occ[j * GW + i]) return false;
      if (walkable(x, z) || inRiver(x, z) || h(x, z) < .8 || Math.abs(x - riverX(z)) < 12) return false;
      for (const r of ROADS) if (segInfo(x, z, r).d < r.w / 2 + .3) return false;
      if (Math.hypot(x - PARK.x, z - PARK.z) < PARK.r + 2) return false;
    }
    for (let x = cx - w / 2; x <= cx + w / 2; x += .5) for (let z = cz - d / 2; z <= cz + d / 2; z += .5) { const i = Math.floor((x - X0) / CS), j = Math.floor((z - Z0) / CS); occ[j * GW + i] = 1; }
    let hm = 1e9; for (const [x, z] of [[cx - w / 2, cz - d / 2], [cx + w / 2, cz - d / 2], [cx - w / 2, cz + d / 2], [cx + w / 2, cz + d / 2]]) hm = Math.min(hm, h(x, z));
    const g = new THREE.BoxGeometry(w, ht + 2, d), uv = g.attributes.uv;
    // 옆면만 창문 반복 (가로 3 m · 세로 3 m 마다 한 칸)
    for (let f = 0; f < 6; f++) { if (f === 2 || f === 3) continue; const fw = f < 2 ? d : w; for (let v = 0; v < 4; v++) { const k = f * 4 + v; uv.setXY(k, uv.getX(k) * Math.max(1, Math.round(fw / 3)), uv.getY(k) * Math.max(1, Math.round(ht / 3))); } }
    const m = new THREE.Mesh(g, [WALLS[q % 7], WALLS[q % 7], ROOFS[q % 4], ROOFS[q % 4], WALLS[q % 7], WALLS[q % 7]]);
    m.position.set(cx, hm + (ht + 2) / 2 - 2, cz); scene.add(m); BLD.push({ cx, cz, w, d }); return true;
  }
  (function placeBuildings() {
    let q = 0;
    for (const r of ROADS) {
      if (r.stairs) continue;
      const nx = -r.uz, nz = r.ux;
      for (const s of [-1, 1]) for (let t = 4; t < r.len - 3; t += 2) {
        q++;
        const w = 7 + (q * 37 % 6), d = 7 + (q * 13 % 4), ht = 6 + (q * 29 % 8);
        const along = r.ux !== 0 ? [w, d] : [d, w];   // 축 방향 길: 가로·세로 맞춤
        const off = r.w / 2 + 1.2 + (r.ux !== 0 ? d : w) / 2;
        const cx = r.a[0] + r.ux * t + nx * off * s, cz = r.a[1] + r.uz * t + nz * off * s;
        if (tryBuilding(cx, cz, along[0], along[1], ht, q)) t += (r.ux !== 0 ? w : d) + .8 + (q % 3);
      }
    }
  })();
  /* 무너진 담장 (골목을 막음, 시작부터 그 자리에 있음) */
  (function () {
    const mat = new THREE.MeshLambertMaterial({ color: 0xA1887F }), y0 = h(DEBRIS.x, DEBRIS.z);
    [[-1.4, 0, .6, 1.1, .7], [.6, .4, -.4, 1.4, .9], [1.6, -.6, .3, .9, .6], [-.3, 1.2, .9, 1.2, .5], [.2, -1.3, -.7, 1, .8], [-1.8, 1.0, .2, .8, .6]].forEach(([dx, dz, rot, s, hh]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.6 * s, hh, .9 * s), mat); m.position.set(DEBRIS.x + dx, y0 + hh / 2, DEBRIS.z + dz); m.rotation.set(rot * .5, rot, rot * .4); scene.add(m);
    });
    const wall = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.2, .35), new THREE.MeshLambertMaterial({ color: 0xBCAAA4 })); wall.position.set(DEBRIS.x, y0 + .6, DEBRIS.z - 2.4); wall.rotation.z = .25; scene.add(wall);
  })();

  /* 표지판: 접근하는 사람 쪽을 보고, 화살표는 그 사람 기준 방향 */
  const SIGN_TEX = [];
  function signTex(o) {
    const c = document.createElement('canvas'); c.width = 640; c.height = 400; paintSign(c, o);
    const t = new THREE.CanvasTexture(c); t.anisotropy = 8; SIGN_TEX.push({ c, o, t }); return t;
  }
  // 글꼴(Noto Sans KR)을 늦게 받으면 표지판 글자를 다시 그림
  if (document.fonts && document.fonts.load) document.fonts.load('bold 50px "Noto Sans KR"').then(() => { SIGN_TEX.forEach(s => { paintSign(s.c, s.o); s.t.needsUpdate = true; }); render(); }).catch(() => { /* 기본 글꼴 그대로 */ });
  function paintSign(c, o) {
    const g = c.getContext('2d');
    g.fillStyle = o.bg; g.fillRect(0, 0, 640, 400); g.strokeStyle = '#fff'; g.lineWidth = 16; g.strokeRect(12, 12, 616, 376);
    g.fillStyle = o.fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    const F = (px, w = 'bold') => `${w} ${px}px "Noto Sans KR", sans-serif`;
    if (o.arrow != null) {
      // 왼쪽: 큰 화살표(멀리서도 방향이 보이게, 글꼴 대신 직접 그림) · 오른쪽: 이름·목적지·거리
      g.save(); g.translate(165, 200); g.rotate(o.arrow); g.beginPath();
      g.moveTo(0, -125); g.lineTo(95, -20); g.lineTo(34, -20); g.lineTo(34, 120); g.lineTo(-34, 120); g.lineTo(-34, -20); g.lineTo(-95, -20); g.closePath(); g.fill(); g.restore();
      g.fillRect(318, 40, 6, 320);
      g.font = F(58); g.fillText(o.title[0], 478, 92); g.fillText(o.title[1], 478, 160);
      g.font = F(42, 500); g.fillText(o.sub, 478, 252); g.font = F(54); g.fillText(o.sub2, 478, 322);
    } else {
      g.font = F(64); g.fillText(o.title, 320, 100);
      g.font = F(50); g.fillText(o.sub, 320, 215); if (o.sub2) g.fillText(o.sub2, 320, 295);
    }
  }
  /* 다가오는 방향 기준 화살표 각도 (0 = 앞, +π/2 = 오른쪽) */
  function relArrow(ax, az, gx, gz) { const rx = -az, rz = ax; return Math.atan2(gx * rx + gz * rz, gx * ax + gz * az); }
  const SIGNS = [];
  function addSign(x, z, face, opts) {   // face: 표지판 앞면이 보는 방향(= 다가오는 사람 쪽)
    const y0 = h(x, z), grp = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, 3.3), new THREE.MeshLambertMaterial({ color: 0x8A949C })); pole.position.y = 1.65; grp.add(pole);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.375), new THREE.MeshBasicMaterial({ map: signTex(opts) })); board.position.y = 2.7; board.position.z = .09; grp.add(board);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.375), new THREE.MeshLambertMaterial({ color: 0x9AA3AA })); back.position.y = 2.7; back.position.z = .08; back.rotation.y = Math.PI; grp.add(back);
    grp.position.set(x, y0, z); grp.rotation.y = Math.atan2(face[0], face[1]); scene.add(grp);
    // 기둥은 지나갈 수 없음 (이동 격자에서 뺌)
    for (let i = Math.floor((x - .6 - X0) / CS); i <= Math.floor((x + .6 - X0) / CS); i++) for (let j = Math.floor((z - .6 - Z0) / CS); j <= Math.floor((z + .6 - Z0) / CS); j++) if (Math.hypot(X0 + (i + .5) * CS - x, Z0 + (j + .5) * CS - z) < .1 + PRAD) WALK[j * GW + i] = 0;
    SIGNS.push({ x, z, face, ...opts });
  }
  const evac = (x, z, face, approach, go, dist) => addSign(x, z, face, { bg: '#0B8F4A', fg: '#fff', title: TX.sign.evac, arrow: relArrow(approach[0], approach[1], go[0], go[1]), sub: TX.sign.dest, sub2: TX.sign.dist(dist), kind: 'evac', go });
  // 표지판은 교차로의 인도 위, 다가오는 사람 정면 쪽에 둠 (건물에 가려지지 않게)
  // ① 해안도로 → 중앙길 (서쪽으로 걷다가 오른쪽=북쪽), 반대에서 오는 사람용도 하나
  evac(4.8, 85.6, [1, 0], [-1, 0], [0, -1], 210); evac(-4.8, 85.6, [-1, 0], [1, 0], [0, -1], 210);
  // ② 중앙길 끝 T자 교차로 → 동쪽(오른쪽). 길 끝 정면에 보임
  evac(0, 36.6, [0, 1], [0, -1], [1, 0], 160);
  // ③ 중간길 → 오르막길 (동쪽으로 걷다가 왼쪽=북쪽), 동쪽에서 오는 사람용
  evac(44.4, 36.6, [-1, 0], [1, 0], [0, -1], 120); evac(35.6, 36.6, [1, 0], [-1, 0], [0, -1], 120);
  // ④ 윗길 교차로 → 계단길 (곧장 위), 윗길 동쪽에서 오는 사람용
  evac(43.6, -23.4, [0, 1], [0, -1], [0, -1], 60); evac(36.4, -23.4, [1, 0], [-1, 0], [0, -1], 60);
  // 동쪽 길로 돌아가는 사람용: 중간길 동쪽 끝 → 북쪽, 동쪽 길 위 끝 → 서쪽
  evac(87.4, 36.6, [-1, 0], [1, 0], [0, -1], 170); evac(80.6, -23.4, [0, 1], [0, -1], [-1, 0], 110);
  // 하천변 길을 따라 북쪽으로 온 사람용: 윗길 → 동쪽
  evac(-44.4, -23.4, [0, 1], [0, -1], [1, 0], 150);
  // 하천 쪽 길 입구 경고 (노란 표지판)
  addSign(-41.5, 43.4, [1, 0], { bg: '#F2B233', fg: '#24303A', title: TX.sign.warnT, sub: TX.sign.warn1, sub2: TX.sign.warn2, kind: 'warn' });
  addSign(-41.5, 85.6, [1, 0], { bg: '#F2B233', fg: '#24303A', title: TX.sign.warnT, sub: TX.sign.warn1, sub2: TX.sign.warn2, kind: 'warn' });
  // 공원 입구 안내판 (계단 끝)
  addSign(42.2, -66, [0, 1], { bg: '#0B8F4A', fg: '#fff', title: TX.sign.parkT, sub: TX.sign.parkS, sub2: TX.sign.parkE(Math.round(h(PARK.x, PARK.z))), kind: 'park' });
  /* 공원 깃발·나무 */
  { const p = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, 6), new THREE.MeshLambertMaterial({ color: 0xffffff })); p.position.set(PARK.x + 6, h(PARK.x, PARK.z) + 3, PARK.z - 4); scene.add(p);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.3), new THREE.MeshLambertMaterial({ color: 0x2F8F5B, side: THREE.DoubleSide })); f.position.set(PARK.x + 7.1, h(PARK.x, PARK.z) + 5.3, PARK.z - 4); scene.add(f); }
  [[28, -88], [52, -90], [30, -74], [52, -74], [60, -30], [20, -32]].forEach(([x, z]) => { const y = h(x, z); const t = new THREE.Mesh(new THREE.CylinderGeometry(.2, .25, 2.4), new THREE.MeshLambertMaterial({ color: 0x8D6E63 })); t.position.set(x, y + 1.2, z); scene.add(t); const c = new THREE.Mesh(new THREE.SphereGeometry(1.8, 10, 8), new THREE.MeshLambertMaterial({ color: 0x6AAE78 })); c.position.set(x, y + 3.2, z); scene.add(c); });

  /* 물: 수면 하나 (바다·하천·침수가 모두 같은 높이) + 다가오는 해일 물마루 */
  const water = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshLambertMaterial({ color: 0x3D8FD1, transparent: true, opacity: .9 }));
  water.rotation.x = -Math.PI / 2; water.position.set(0, 0, 100); scene.add(water);
  // 물마루: 단면이 완만한 뒤쪽·가파른 앞쪽인 기둥(높이 1을 scale.y 로 늘림) + 위쪽 흰 거품
  const crest = new THREE.Group();
  const crestBody = (() => {
    const sec = [[-14, 0], [-3, 1], [0, .92], [1.6, 0]], X = 350, pos = [], idx = [];
    sec.forEach(([z, y]) => pos.push(-X, y, z, X, y, z));
    for (let k = 0; k < sec.length - 1; k++) { const o = k * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x3D8FD1, side: THREE.DoubleSide }));
  })(); crest.add(crestBody);
  const foam = new THREE.Mesh(new THREE.BoxGeometry(700, .25, 2.4), new THREE.MeshLambertMaterial({ color: 0xF4FAFF })); crest.add(foam);
  scene.add(crest);

  /* ---------- 소리 (시작을 누른 뒤에만, 끌 수 있음) · 음성 안내(브라우저 음성 합성, 없으면 자막만) ---------- */
  const Snd = {
    on: true, ctx: null,
    init() {
      if (this.ctx) return; const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      const c = this.ctx = new AC(); this.master = c.createGain(); this.master.gain.value = this.on ? .7 : 0; this.master.connect(c.destination);
      const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
      this.filt = c.createBiquadFilter(); this.filt.type = 'lowpass'; this.filt.frequency.value = 400;
      this.sea = c.createGain(); this.sea.gain.value = 0; src.connect(this.filt); this.filt.connect(this.sea); this.sea.connect(this.master); src.start();
    },
    tone(f0, f1, t0, dur, vol = .1, type = 'sine') {
      if (!this.ctx) return; const c = this.ctx, o = c.createOscillator(), gn = c.createGain(), t = c.currentTime + t0;
      o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.linearRampToValueAtTime(f1, t + dur);
      gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(vol, t + .03); gn.gain.setValueAtTime(vol, t + dur - .05); gn.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(gn); gn.connect(this.master); o.start(t); o.stop(t + dur + .02);
    },
    alert() { for (let i = 0; i < 4; i++) { this.tone(880, 880, i * .5, .22, .12, 'square'); this.tone(660, 660, i * .5 + .25, .2, .1, 'square'); } },   // 훈련용 알림음 (실제 재난문자 알림음과 다름)
    chime() { this.tone(523, 523, 0, .25, .08); this.tone(659, 659, .25, .25, .08); this.tone(784, 784, .5, .4, .08); },
    good() { this.tone(660, 660, 0, .25, .1); this.tone(880, 880, .22, .45, .1); },
    low() { this.tone(330, 260, 0, .6, .09); },
    setSea(level, t) { if (!this.ctx) return; const s = level * (.7 + .3 * Math.sin(t * 2 * Math.PI / 3.5)); this.sea.gain.setTargetAtTime(.03 + .3 * s, this.ctx.currentTime, .2); this.filt.frequency.setTargetAtTime(350 + 900 * level, this.ctx.currentTime, .3); },
    quiet() { if (this.ctx) this.sea.gain.setTargetAtTime(0, this.ctx.currentTime, .15); },
    pause(v) { if (!this.ctx) return; v ? this.ctx.suspend() : this.ctx.resume(); if (window.speechSynthesis) v ? speechSynthesis.pause() : speechSynthesis.resume(); },
    say(text) { if (!this.on || !window.speechSynthesis) return; try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'ko-KR'; u.rate = 1.12; speechSynthesis.speak(u); } catch (e) { /* 음성이 없으면 자막만 */ } },
    hush() { if (window.speechSynthesis) try { speechSynthesis.cancel(); } catch (e) { /* 무시 */ } },
    setOn(v) { this.on = v; if (this.ctx) this.master.gain.setTargetAtTime(v ? .7 : 0, this.ctx.currentTime, .05); if (!v) this.hush(); },
  };

  /* ---------- 게임 상태 ---------- */
  const G = { state: 'intro', paused: false, t: 0, x: START.x, z: START.z, yaw: START.yaw, eye: 0, vf: 0, vs: 0, trail: [], log: [], ev: 0, toastT: 0, result: null, flags: {} };
  const keys = { f: false, b: false, l: false, r: false, tl: false, tr: false };
  const clearKeys = () => { for (const k in keys) keys[k] = false; $$('#fp-touch button').forEach(b => b.classList.remove('on')); };
  const SPEED_F = 6.2, SPEED_S = 4.4, SPEED_B = 4.2, TURN = 2.1;   // m/s, rad/s

  function reset() {
    Object.assign(G, { state: 'intro', paused: false, t: 0, x: START.x, z: START.z, yaw: START.yaw, vf: 0, vs: 0, trail: [[START.x, START.z, 0]], log: [], ev: 0, toastT: 0, result: null, flags: {} });
    G.eye = ground(G.x, G.z) + 1.6;
    clearKeys(); Snd.quiet(); Snd.hush(); hideSub(); $('#fp-toast').hidden = true; $('#fp-phone').hidden = true;
    showCard('intro'); hud(); render();
  }
  function showPhone() {   // 훈련용 가상 재난문자 (시간 멈춤)
    G.state = 'sms'; Snd.init(); Snd.pause(false); Snd.alert(); setPaused(false);
    addLog('sms', TX.sms.m1);
    const ph = $('#fp-phone'); ph.hidden = false;
    ph.innerHTML = `<div class="fp-ph-tag">${TX.sms.tag}</div><div class="fp-ph-from">${TX.sms.from}</div><p>${TX.sms.m1}</p><button class="btn primary" type="button" id="fp-ok">${TX.sms.ok}</button>`;
    card.hidden = true; $('#fp-ok').focus({ preventScroll: true });
    $('#fp-ok').onclick = () => { ph.hidden = true; G.state = 'play'; hud(); cv.focus({ preventScroll: true }); };
    hud();
  }
  function setGamePause(v) {
    if (G.state !== 'play') return;
    G.paused = v; clearKeys(); Snd.pause(v);
    if (v) showCard('pause'); else { card.hidden = true; setPaused(false); cv.focus({ preventScroll: true }); }
    hud();
  }
  function finish(ok) {
    G.state = 'done'; clearKeys(); Snd.quiet(); Snd.hush(); hideSub(); $('#fp-toast').hidden = true;
    G.trail.push([G.x, G.z, G.t]);
    G.result = analyse(ok);
    ok ? Snd.good() : Snd.low();
    showCard('result'); hud();
  }
  function addLog(kind, text) { G.log.push({ kind, t: G.t, text }); }

  /* ---------- 자막 · 추가 문자(가리지 않는 작은 알림) ---------- */
  let subTimer = 0;
  function showSub(text) { const el = $('#fp-sub'); el.innerHTML = `<b>${TX.castTag}</b> ${text}`; el.hidden = false; subTimer = 8; }
  function hideSub() { $('#fp-sub').hidden = true; subTimer = 0; }
  function fireEvent(e) {
    if (e.kind === 'cast') { const txt = TX.cast[e.key]; addLog('cast', txt); showSub(txt); Snd.chime(); Snd.say(TX.castSay[e.key]); }
    else { const txt = TX.sms[e.key]; addLog('sms', txt); const el = $('#fp-toast'); el.innerHTML = `<b>${TX.sms.tagShort}</b> ${txt}`; el.hidden = false; G.toastT = 9; Snd.alert(); }
  }

  /* ---------- 이동 ---------- */
  function move(dt) {
    // 회전 (←/→, Q/E, 회전 버튼)
    G.yaw += ((keys.tr ? 1 : 0) - (keys.tl ? 1 : 0)) * TURN * dt;
    // 입력: 앞뒤·옆 걸음 → 정규화해서 대각선이 빠르지 않게
    let f = (keys.f ? 1 : 0) - (keys.b ? 1 : 0), s = (keys.r ? 1 : 0) - (keys.l ? 1 : 0);
    const n = Math.hypot(f, s); if (n > 1) { f /= n; s /= n; }
    const k = Math.min(1, dt * 14);   // 약 0.1초 안에 목표 속도
    G.vf += (f * (f >= 0 ? SPEED_F : SPEED_B) - G.vf) * k; G.vs += (s * SPEED_S - G.vs) * k;
    const fx = Math.sin(G.yaw), fz = -Math.cos(G.yaw), rx = Math.cos(G.yaw), rz = Math.sin(G.yaw);   // 앞, 오른쪽 (yaw 0 = 북쪽(-z))
    const mx = (fx * G.vf + rx * G.vs) * dt, mz = (fz * G.vf + rz * G.vs) * dt;
    const L = Math.hypot(mx, mz); if (L < 1e-5) return;
    const steps = Math.ceil(L / .2), sx = mx / steps, sz = mz / steps;
    for (let i = 0; i < steps; i++) {
      if (walkable(G.x + sx, G.z + sz)) { G.x += sx; G.z += sz; continue; }
      // 막히면: 가장 가까운 길 방향으로 미끄러짐(+ 가운데로 조금) → 축 방향 → 멈춤. 벽을 뚫거나 모서리에 끼지 않음
      const sl = Math.hypot(sx, sz), rd = roadAt(G.x, G.z); let done = false;
      if (rd) {
        const dot = sx * rd.r.ux + sz * rd.r.uz;
        if (Math.abs(dot) > sl * .2) { const px = rd.r.ux * dot, pz = rd.r.uz * dot, cx = (rd.cx - G.x) * .1, cz = (rd.cz - G.z) * .1; if (walkable(G.x + px + cx, G.z + pz + cz)) { G.x += px + cx; G.z += pz + cz; done = true; } }
      }
      if (!done && walkable(G.x + sx, G.z)) { G.x += sx; done = true; }
      if (!done && walkable(G.x, G.z + sz)) { G.z += sz; done = true; }
      if (!done) break;
    }
    const last = G.trail[G.trail.length - 1]; if (Math.hypot(G.x - last[0], G.z - last[1]) > 1.5) G.trail.push([G.x, G.z, G.t]);
    // 들른 곳 기록 (결과 복기용)
    if (G.x < -40) G.flags.river = true;
    if (G.x < -22 && G.z > 80) G.flags.coastW = true;
    if (Math.hypot(G.x - DEBRIS.x, G.z - DEBRIS.z) < 9) G.flags.debris = true;
    if (G.x > 70) G.flags.east = true;
  }

  /* ---------- 매 프레임 ---------- */
  function frame(dt) {
    if (G.state === 'play' && !G.paused) {
      G.t += dt;
      while (G.ev < SCN.events.length && G.t >= SCN.events[G.ev].t) fireEvent(SCN.events[G.ev++]);
      if (subTimer > 0) { subTimer -= dt; if (subTimer <= 0) hideSub(); }
      if (G.toastT > 0) { G.toastT -= dt; if (G.toastT <= 0) $('#fp-toast').hidden = true; }
      move(dt);
      Snd.setSea(G.t < SCN.T0 ? (.15 + .55 * smooth(SCN.T0 - 18, SCN.T0, G.t)) * proximity() : .9, G.t);
      if (Math.hypot(G.x - PARK.x, G.z - PARK.z) < PARK.r - 1.5) { finish(true); return; }
      if (ground(G.x, G.z) < level(G.t) - .15) { finish(false); return; }    // 화면의 수면과 같은 level 로 판정
      hud();
    }
    render();
  }
  const proximity = () => clamp(1 - (90 - G.z) / 140, .2, 1);   // 해안에 가까울수록 파도 소리가 큼
  function render() {
    const lv = level(G.t);
    // 카메라: 눈높이 1.6 m, 지형 높이를 부드럽게 따라감 (흔들림·기울어짐 없음)
    const eyeT = ground(G.x, G.z) + 1.6; G.eye += (eyeT - G.eye) * .25;
    camera.position.set(G.x, G.eye, G.z);
    camera.rotation.set(0, -G.yaw, 0, 'YXZ');
    water.position.y = lv + .03 * Math.sin(G.t * 1.7);
    // 다가오는 해일 물마루 (도달 전 16초 동안 먼바다 → 해안)
    const p = smooth(SCN.T0 - 16, SCN.T0, G.t);
    crest.visible = G.state !== 'intro' && p > 0 && p < 1;
    if (crest.visible) { const z = 260 - (260 - 104) * p, ht = .5 + 2.2 * p; crestBody.scale.y = ht; crestBody.position.y = -.05; foam.position.set(0, ht * .97, -1.4); crest.position.set(0, 0, z); }
    renderer.render(scene, camera);
  }

  /* ---------- 위쪽: 현재 목표 한 줄 · 일시 정지 · 소리 ---------- */
  const elGoal = $('#fp-goal'), elPause = $('#fp-pause');
  // '⏸ 일시 정지' → 아이콘 + 글자(폰에서는 글자를 숨김)
  const iconLabel = (el, str) => { const i = str.indexOf(' '); el.innerHTML = `<span aria-hidden="true">${str.slice(0, i)}</span><span class="lb">${str.slice(i + 1)}</span>`; el.setAttribute('aria-label', str.slice(i + 1)); };
  let hudKey = '';
  function hud() {
    const goal = G.state === 'intro' ? TX.goal.intro : G.state === 'sms' ? TX.goal.sms : G.state === 'done' ? (G.result.ok ? TX.goal.ok : TX.goal.stop) : G.ev > 0 ? TX.goal.park : TX.goal.high;
    const key = goal + G.state + G.paused; if (key === hudKey) return; hudKey = key;
    elGoal.textContent = goal;
    elPause.disabled = G.state !== 'play'; iconLabel(elPause, G.paused ? TX.hud.resume : TX.hud.pause);
    root.dataset.state = G.state + (G.paused ? '-paused' : '');
  }

  /* ---------- 결과: 핵심 피드백 1~2문장 + 판단 지점 ---------- */
  const DECIDE = [{ x: 0, z: 90 }, { x: 0, z: 40 }, { x: 40, z: 40 }, { x: 40, z: -20 }];
  function analyse(ok) {
    const fl = G.flags, out = [];
    if (ok) {
      out.push(fl.river || fl.coastW ? TX.fb.okDetourLow : fl.debris ? TX.fb.okDebris : fl.east ? TX.fb.okEast : TX.fb.okDirect);
      out.push(fl.river || fl.coastW ? TX.fb.lowWhy : fl.debris ? TX.fb.debrisWhy : TX.fb.signs);
    } else {
      const rd = roadAt(G.x, G.z), nm = rd ? rd.r.name : TX.fb.here, e = Math.max(1, Math.round(ground(G.x, G.z)));
      out.push(TX.fb.stop(nm, e));
      out.push(fl.river || fl.coastW ? TX.fb.lowWhy : TX.fb.tryUp);
    }
    return { ok, text: out, time: Math.round(G.t), level: level(G.t) };
  }

  /* ---------- 안내 카드: 시작 안내 · 일시 정지 메뉴(문자 기록) · 결과(전체 지도) ---------- */
  const card = $('#fp-card');
  function showCard(kind) {
    card.hidden = false; card.dataset.kind = kind;
    if (kind === 'intro') {
      card.innerHTML = `<div class="fp-box"><h4 class="fp-h">${TX.intro.title}</h4>
        <p class="fp-p">${TX.intro.story}</p>
        <p class="fp-warn">${TX.intro.natural}</p>
        <ul class="fp-keys"><li><b>${TX.intro.pcL}</b> ${TX.intro.pc}</li><li><b>${TX.intro.padL}</b> ${TX.intro.pad}</li></ul>
        <p class="fp-note">${TX.intro.note}</p>
        <button class="btn primary fp-go" type="button" id="fp-start">${TX.intro.start}</button></div>`;
      $('#fp-start').onclick = showPhone;
    } else if (kind === 'pause') {
      card.innerHTML = `<div class="fp-box"><h4 class="fp-h">${TX.pause.title}</h4>
        <h5 class="fp-h5">${TX.pause.logT}</h5><ol class="fp-log">${G.log.map(l => `<li><span class="fp-tag ${l.kind}">${l.kind === 'sms' ? TX.sms.tagShort : TX.castTag}</span>${l.text}</li>`).join('')}</ol>
        <p class="fp-note">${TX.intro.pc}</p>
        <div class="fp-row"><button class="btn primary" type="button" id="fp-resume">${TX.hud.resume}</button><button class="btn" type="button" id="fp-restart">${TX.pause.restart}</button></div></div>`;
      $('#fp-resume').onclick = () => setGamePause(false); $('#fp-restart').onclick = reset;
      $('#fp-resume').focus({ preventScroll: true });
    } else {
      const R = G.result;
      card.innerHTML = `<div class="fp-box fp-result"><canvas class="fp-map" id="fp-map" width="720" height="560" role="img" aria-label="${TX.res.mapAria}"></canvas>
        <div class="fp-rside"><div class="verdict ${R.ok ? 'ok' : 'bad'}">${R.ok ? TX.res.ok(R.time) : TX.res.stop}</div>
        <p class="fp-p fp-fb">${R.text.join(' ')}</p>
        <div class="fp-row"><button class="btn primary" type="button" id="fp-again">${TX.res.again}</button></div>
        <details class="more"><summary>${TX.res.more}</summary><div class="info">${TX.res.detail}</div></details></div></div>`;
      $('#fp-again').onclick = () => { reset(); };
      drawMap($('#fp-map'), R);
      $('#fp-again').focus({ preventScroll: true });
    }
  }
  /* 종료 뒤에만 보이는 전체 지도: 지형 높이·길·건물·물(끝났을 때 수면)·내 경로·판단 지점 */
  function drawMap(c, R) {
    const g = c.getContext('2d'), W = c.width, H = c.height, xa = -110, xb = 110, za = -100, zb = 112, sx = W / (xb - xa), sz = H / (zb - za);
    const P = (x, z) => [(x - xa) * sx, (z - za) * sz];
    const img = g.createImageData(W, H), d = img.data;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const x = xa + i / sx, z = za + j / sz, y = h(x, z), o = (j * W + i) * 4;
      const c3 = y < 0 ? [70, 140, 205] : y < R.level ? [110, 170, 225] : y < 2.2 ? [237, 222, 176] : y < 12 ? [205, 224, 180] : [178, 205, 152];
      d[o] = c3[0]; d[o + 1] = c3[1]; d[o + 2] = c3[2]; d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    g.lineCap = 'round';
    for (const r of ROADS) { const [ax, az] = P(...r.a), [bx, bz] = P(...r.b); g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = Math.max(3, r.w * sx * .8); g.beginPath(); g.moveTo(ax, az); g.lineTo(bx, bz); g.stroke(); }
    g.fillStyle = 'rgba(120,130,140,.5)'; for (const b of BLD) { const [x, z] = P(b.cx - b.w / 2, b.cz - b.d / 2); g.fillRect(x, z, b.w * sx, b.d * sz); }
    // 잠긴 길 위에 다시 물색 (끝났을 때 수면보다 낮은 곳)
    g.fillStyle = 'rgba(61,143,209,.6)'; for (let j = 0; j < H; j += 2) for (let i = 0; i < W; i += 2) { const y = h(xa + i / sx, za + j / sz); if (y < R.level && y > -.2) g.fillRect(i, j, 2, 2); }
    // 공원·무너진 담장·출발점
    g.font = '15px Jua, sans-serif'; g.textAlign = 'center';
    let [px, pz] = P(PARK.x, PARK.z); g.fillStyle = '#2F8F5B'; g.beginPath(); g.moveTo(px, pz - 14); g.lineTo(px + 12, pz + 8); g.lineTo(px - 12, pz + 8); g.closePath(); g.fill();
    g.fillStyle = '#24303A'; g.fillText(TX.res.park, px, pz - 20);
    [px, pz] = P(DEBRIS.x, DEBRIS.z); g.fillStyle = '#8D6E63'; g.fillRect(px - 6, pz - 4, 12, 8); g.fillStyle = '#24303A'; g.fillText(TX.res.debris, px, pz - 9);
    // 내 경로
    g.strokeStyle = '#7B4FB0'; g.lineWidth = 4; g.lineJoin = 'round'; g.beginPath(); G.trail.forEach(([x, z], i) => { const [a, b] = P(x, z); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.stroke();
    [px, pz] = P(START.x, START.z); g.fillStyle = '#7B4FB0'; g.beginPath(); g.arc(px, pz, 5, 0, 7); g.fill(); g.fillStyle = '#24303A'; g.fillText(TX.res.start, px + 22, pz + 20);
    [px, pz] = P(G.x, G.z); g.fillStyle = R.ok ? '#E8553E' : '#7B8792'; g.beginPath(); g.arc(px, pz, 7, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
    // 판단 지점 ①~④
    DECIDE.forEach((q, i) => { const [a, b] = P(q.x, q.z); g.fillStyle = '#F2B233'; g.strokeStyle = '#24303A'; g.lineWidth = 2; g.beginPath(); g.arc(a, b, 10, 0, 7); g.fill(); g.stroke(); g.fillStyle = '#24303A'; g.font = '13px Jua, sans-serif'; g.fillText(String(i + 1), a, b + 4.5); });
    g.font = '13px "Noto Sans KR", sans-serif'; g.textAlign = 'left'; g.fillStyle = '#24303A'; g.fillText(TX.res.legend, 10, H - 10);
  }

  /* ---------- 조작: 키보드 · 선택적 마우스 끌기 · 태블릿 버튼 ---------- */
  const KEY = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', KeyD: 'r', ArrowLeft: 'tl', ArrowRight: 'tr', KeyQ: 'tl', KeyE: 'tr' };
  addEventListener('keydown', e => {
    if (activeTab !== '3' || e.altKey || e.ctrlKey || e.metaKey) return;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    const k = KEY[e.code];
    if (k) { if (G.state === 'play' || e.code.startsWith('Arrow')) e.preventDefault(); if (G.state === 'play' && !G.paused) keys[k] = true; return; }
    if (e.code === 'Space' && G.state === 'play') e.preventDefault();
    if ((e.code === 'KeyP' || e.code === 'Escape') && G.state === 'play') { e.preventDefault(); setGamePause(!G.paused); }
  });
  addEventListener('keyup', e => { const k = KEY[e.code]; if (k) keys[k] = false; });
  addEventListener('blur', clearKeys);
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'play' && !G.paused) setGamePause(true); });
  // 선택: 마우스를 누른 채 좌우로 끌면 시점 회전 (필수 아님)
  let drag = null;
  cv.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && G.state === 'play' && !G.paused) { drag = e.clientX; cv.setPointerCapture(e.pointerId); } });
  cv.addEventListener('pointermove', e => { if (drag !== null) { G.yaw += (e.clientX - drag) * .006; drag = e.clientX; } });
  cv.addEventListener('pointerup', () => { drag = null; });
  // 태블릿: 이동 패드 + 좌우 회전 버튼 (누르고 있는 동안)
  $('#fp-touch').innerHTML = `<div class="fp-pad">${[['f', '▲'], ['l', '◀'], ['r', '▶'], ['b', '▼']].map(([d, s]) => `<button type="button" data-k="${d}" aria-label="${TX.touch[d]}">${s}</button>`).join('')}</div>
    <div class="fp-turn">${[['tl', '⟲'], ['tr', '⟳']].map(([d, s]) => `<button type="button" data-k="${d}" aria-label="${TX.touch[d]}">${s}</button>`).join('')}</div>`;
  $$('#fp-touch [data-k]').forEach(b => {
    const k = b.dataset.k, on = v => e => { e.preventDefault(); if (v && (G.state !== 'play' || G.paused)) return; keys[k] = v; b.classList.toggle('on', v); if (v && b.setPointerCapture) try { b.setPointerCapture(e.pointerId); } catch (er) { /* 포인터가 이미 끝났으면 무시 */ } };
    b.addEventListener('pointerdown', on(true)); ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => b.addEventListener(ev, on(false)));
    b.addEventListener('contextmenu', e => e.preventDefault());
  });
  elPause.onclick = () => setGamePause(!G.paused);
  const sndBtn = $('#fp-sound'); iconLabel(sndBtn, TX.hud.sound); bindToggle(sndBtn, v => Snd.setOn(v));
  $('#t3-h-guide').textContent = TX.guideT; $('#t3-guide').innerHTML = TX.guide;
  $('#t3-h-src').textContent = TX.hSrc; $('#t3-src').innerHTML = TX.sources;

  /* 화면 크기 */
  function fit() { const w = stage.clientWidth, hh = stage.clientHeight; if (!w || !hh) return; renderer.setSize(w, hh, false); camera.aspect = w / hh; camera.updateProjectionMatrix(); render(); }
  if (window.ResizeObserver) new ResizeObserver(fit).observe(stage); else addEventListener('resize', fit);

  /* 자동 점검용 연결 */
  window.__fp = { G, keys, reset, showPhone, setGamePause, h, ground, walkable, level, SCN, PARK, DEBRIS, SIGNS, ROADS, camera, draw: () => renderer.render(scene, camera), info: () => ({ ...renderer.info.render, geo: renderer.info.memory.geometries, n: scene.children.length }) };

  reset(); fit();
  frames['3'] = frame;
  tabInit['3'] = () => { fit(); };
  tabLeave['3'] = () => { if (G.state === 'play' && !G.paused) setGamePause(true); Snd.hush(); };
})();
