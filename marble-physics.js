'use strict';
/* 반짝퀴즈 마블 레이스 물리 (DOM 없음, 시드 난수만 사용)
   - 엔진(진행자 브라우저)과 진행자 화면이 같은 함수를 써서 같은 입력이면 완전히 같은 결과가 나옴.
   - 세로로 긴 맵을 구슬이 중력으로 굴러 내려가며 못, 경사로, 깔때기, 풍차, 범퍼를 지나 결승선으로. */
(() => {
  const W = 800, R = 7, ST = 3, DT = 1 / 120, SUB = 2, CAP = 80, VMAX = 900, CELL = 15, OFF = 1200, BAND = 64;
  function rng(seed) {
    let a = (Number(seed) >>> 0) || 1;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const strHash = s => { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

  // ---------- 맵 조립 도구 ----------
  function newMap() { return { segs: [], pegs: [], rotors: [], y: 60 }; }
  // 지그재그 경사로: 한쪽 벽에 붙어 반대쪽으로 내려가고 끝에 구멍
  function ramps(m, n, slope, opt = {}) {
    const gap = opt.gap || 84, drop = slope * (W - gap), dy = Math.ceil(drop) + (opt.space || 40);
    for (let i = 0; i < n; i++) {
      const y = m.y, flip = (i + (opt.start || 0)) % 2 === 1;
      if (!flip) m.segs.push([0, y, W - gap, y + drop, 'ramp']); else m.segs.push([W, y, gap, y + drop, 'ramp']);
      if (opt.bumps && i % 2 === 0) m.pegs.push([flip ? W * 0.42 : W * 0.58, y + drop * 0.5 - 22, 6, 1]);
      m.y += dy;
    }
    m.y += 26;
  }
  function pegs(m, rows, opt = {}) {
    const sp = opt.sp || 46, r = opt.r || 5, rr = rng(opt.seed || 7);
    for (let row = 0; row < rows; row++) {
      const off = (row % 2) * sp / 2;
      for (let x = 28 + off; x < W - 20; x += sp) {
        const bump = opt.bump && rr() < opt.bump ? 1 : 0;
        m.pegs.push([x, m.y, bump ? r + 2 : r, bump]);
      }
      m.y += sp * 0.82;
    }
    m.y += 20;
  }
  function funnel(m, exitW = 96, h = 130) {
    m.segs.push([0, m.y, W / 2 - exitW / 2, m.y + h, 'funnel'], [W, m.y, W / 2 + exitW / 2, m.y + h, 'funnel']);
    m.y += h + 46;
  }
  function splitter(m) { // 가운데 뾰족한 갈림길
    m.segs.push([W / 2, m.y, W / 2 - 160, m.y + 90, 'split'], [W / 2, m.y, W / 2 + 160, m.y + 90, 'split']);
    m.y += 130;
  }
  function mills(m, count, opt = {}) {
    const len = opt.len || 64, w = opt.w || 2.2, arms = opt.arms || 2;
    for (let i = 0; i < count; i++) m.rotors.push({ cx: (i + 0.5) * W / count, cy: m.y + len, len, arms, w: (i % 2 ? -1 : 1) * w * (opt.vary ? (1 + 0.15 * (i % 3)) : 1), ph: i * 0.7 });
    m.y += len * 2 + 50;
  }
  function bumpers(m, list) { for (const [x, dy, r] of list) m.pegs.push([x, m.y + dy, r || 22, 2]); m.y += Math.max(...list.map(b => b[1])) + 60; }
  function finishMap(m, def) {
    m.finishY = m.y + 40; m.trayTop = m.finishY + 24; m.h = m.finishY + 420;
    m.segs.push([0, m.h, W, m.h, 'floor']);
    Object.assign(m, def);
    // 띠(band)별 정적 물체 목록
    m.bands = [];
    const add = (i, y0, y1) => { for (let b = Math.max(0, Math.floor(y0 / BAND)); b <= Math.floor(y1 / BAND); b++) (m.bands[b] || (m.bands[b] = [])).push(i); };
    m.segs.forEach((s, i) => add(i, Math.min(s[1], s[3]) - R - ST - 2, Math.max(s[1], s[3]) + R + ST + 2));
    m.pegs.forEach((p, i) => add(m.segs.length + i, p[1] - p[2] - R - 2, p[1] + p[2] + R + 2));
    return m;
  }

  const DEFS = {
    peg: {
      id: 'peg', name: '핀볼 숲', desc: '못과 범퍼가 빽빽한 숲! 이리저리 튕겨요.', bgm: 'race0', g: 900,
      theme: { bg1: '#0b3d2e', bg2: '#145c43', seg: '#d8f5a2', peg: '#ffe066', bump: '#ff6b6b', rotor: '#ffa94d', accent: '#69db7c' },
      build(m) { pegs(m, 7, { bump: 0.12, seed: 3 }); ramps(m, 3, 0.155); funnel(m, 134); pegs(m, 8, { bump: 0.18, seed: 5, sp: 50 }); ramps(m, 3, 0.145, { bumps: 1 }); mills(m, 3, { len: 80, w: 1.8 }); pegs(m, 6, { bump: 0.1, seed: 9 }); ramps(m, 3, 0.145); funnel(m, 120); }
    },
    mill: {
      id: 'mill', name: '풍차 공장', desc: '빙글빙글 도는 풍차 사이를 빠져나가요!', bgm: 'race1', g: 900,
      theme: { bg1: '#2b2d42', bg2: '#4a3f6b', seg: '#e9ecef', peg: '#adb5bd', bump: '#ff922b', rotor: '#ffd43b', accent: '#ffd43b' },
      build(m) { ramps(m, 2, 0.155); mills(m, 4, { len: 70, w: 2.4, arms: 4 }); ramps(m, 2, 0.145, { start: 1 }); mills(m, 3, { len: 95, w: 1.6, vary: 1 }); funnel(m, 124); ramps(m, 3, 0.145); mills(m, 5, { len: 58, w: 3, arms: 4 }); ramps(m, 3, 0.145, { start: 1 }); pegs(m, 4, { seed: 2 }); funnel(m, 120); }
    },
    slide: {
      id: 'slide', name: '지그재그 미끄럼틀', desc: '길고 긴 미끄럼틀과 깔때기! 누가 가장 늦게 내려올까?', bgm: 'race2', g: 880,
      theme: { bg1: '#5f3dc4', bg2: '#e64980', seg: '#fff3bf', peg: '#ffffff', bump: '#ffd43b', rotor: '#63e6be', accent: '#ffec99' },
      build(m) { ramps(m, 3, 0.135); funnel(m, 120); ramps(m, 3, 0.130, { bumps: 1 }); splitter(m); pegs(m, 4, { seed: 11 }); ramps(m, 3, 0.135, { start: 1 }); funnel(m, 120); ramps(m, 1, 0.145); }
    },
    space: {
      id: 'space', name: '우주 소용돌이', desc: '중력이 약한 우주! 범퍼와 소용돌이 풍차를 조심해요.', bgm: 'race3', g: 640,
      theme: { bg1: '#05051a', bg2: '#1b1464', seg: '#a5d8ff', peg: '#e599f7', bump: '#4dabf7', rotor: '#f783ac', accent: '#91a7ff' },
      build(m) { pegs(m, 5, { bump: 0.2, seed: 13, sp: 52 }); bumpers(m, [[200, 30], [400, 70], [600, 30], [300, 150], [500, 150]]); ramps(m, 2, 0.165); mills(m, 2, { len: 150, w: 1.1, arms: 3 }); ramps(m, 2, 0.155, { start: 1, bumps: 1 }); funnel(m, 134); pegs(m, 6, { bump: 0.25, seed: 17, sp: 52 }); ramps(m, 3, 0.155); mills(m, 3, { len: 90, w: 1.7, arms: 3, vary: 1 }); ramps(m, 2, 0.155); funnel(m, 120); }
    }
  };
  const cache = new Map();
  function getMap(id) {
    if (!DEFS[id]) id = 'peg';
    if (!cache.has(id)) { const d = DEFS[id]; const m = newMap(); d.build(m); cache.set(id, finishMap(m, { id: d.id, name: d.name, desc: d.desc, bgm: d.bgm, g: d.g, theme: d.theme, w: W })); }
    return cache.get(id);
  }
  const MAPS = Object.values(DEFS).map(d => ({ id: d.id, name: d.name, desc: d.desc, bgm: d.bgm }));
  function mapFor(seed) { return MAPS[rng(strHash('map:' + seed))() * MAPS.length | 0].id; }

  // ---------- 세계 ----------
  function create(mapId, marbles, seed) {
    const map = getMap(mapId), rr = rng(strHash('w:' + seed + ':' + map.id));
    const list = (Array.isArray(marbles) ? marbles : []).map((m, i) => ({ id: String(m && m.id !== undefined ? m.id : i), gold: !!(m && m.gold) }));
    // 출발 순서 섞기
    const idx = list.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = rr() * (i + 1) | 0; const t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
    const cols = 40, sp = (W - 40) / cols;
    const bodies = list.map((m, i) => ({ id: m.id, gold: m.gold, r: R, x: 0, y: 0, vx: 0, vy: 0, angle: 0, finished: false, finishT: null, ax: 0, ay: 0, stuck: 0 }));
    idx.forEach((bi, k) => { const b = bodies[bi]; const row = k / cols | 0, col = k % cols; b.x = 20 + sp * (col + 0.5) + (rr() - 0.5) * 3 + (row % 2) * sp * 0.25; b.y = 30 - row * 16 - rr() * 2; b.ax = b.x; b.ay = b.y; });
    const rows = Math.ceil((map.h + OFF) / CELL) + 2, gcols = Math.ceil(W / CELL) + 2;
    const heads = new Int32Array(rows * gcols).fill(-1), next = new Int32Array(Math.max(1, bodies.length));
    let active = bodies.map((_, i) => i);
    const finishList = [];
    const world = { map, w: W, h: map.h, t: 0, done: bodies.length === 0, bodies, finishList, steps: 0,
      step() { if (this.done) return; for (let s = 0; s < SUB; s++) sub(); this.steps++; },
      rotorAngle(r, t) { return r.ph + r.w * (t === undefined ? this.t : t); },
      statics() { return { segs: map.segs, pegs: map.pegs, rotors: map.rotors.map(r => ({ ...r, angle: this.rotorAngle(r) })), finishY: map.finishY }; },
      remaining() { return active.length; } };

    function hitSeg(b, x1, y1, x2, y2, svx, svy, e, fr) {
      const dx = x2 - x1, dy = y2 - y1, L2 = dx * dx + dy * dy || 1;
      let t = ((b.x - x1) * dx + (b.y - y1) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cx = x1 + dx * t, cy = y1 + dy * t, ex = b.x - cx, ey = b.y - cy, d2 = ex * ex + ey * ey, RR = b.r + ST;
      if (d2 >= RR * RR) return false;
      const d = Math.sqrt(d2) || 1e-6, nx = ex / d, ny = ey / d;
      b.x += nx * (RR - d); b.y += ny * (RR - d);
      let rvx = b.vx - svx, rvy = b.vy - svy; const vn = rvx * nx + rvy * ny;
      if (vn < 0) { const j = -(1 + e) * vn; rvx += j * nx; rvy += j * ny; const tx = -ny, ty = nx, vt = rvx * tx + rvy * ty; rvx -= vt * tx * fr; rvy -= vt * ty * fr; }
      b.vx = rvx + svx; b.vy = rvy + svy; return true;
    }
    function hitCirc(b, x, y, r, kind) {
      const ex = b.x - x, ey = b.y - y, d2 = ex * ex + ey * ey, RR = b.r + r;
      if (d2 >= RR * RR) return;
      const d = Math.sqrt(d2) || 1e-6, nx = ex / d, ny = ey / d;
      b.x += nx * (RR - d); b.y += ny * (RR - d);
      const vn = b.vx * nx + b.vy * ny;
      if (vn < 0) { const e = kind === 2 ? 1.15 : kind === 1 ? 0.95 : 0.45; const j = -(1 + e) * vn; b.vx += j * nx; b.vy += j * ny; }
      if (kind === 2) { b.vx += nx * 120; b.vy += ny * 120; }
    }
    function sub() {
      const t = world.t, g = map.g, h = map.h;
      // 이동 + 정적 충돌
      for (let k = 0; k < active.length; k++) {
        const b = bodies[active[k]];
        b.vy += g * DT;
        const drag = 1 - (b.gold ? 0.3 : 0.06) * DT; b.vx *= drag; b.vy *= drag;
        const sp2 = b.vx * b.vx + b.vy * b.vy; if (sp2 > VMAX * VMAX) { const f = VMAX / Math.sqrt(sp2); b.vx *= f; b.vy *= f; }
        b.x += b.vx * DT; b.y += b.vy * DT; b.angle += b.vx * DT / b.r;
        if (b.y > 0) {
          const band = map.bands[(b.y / BAND) | 0];
          if (band) for (let q = 0; q < band.length; q++) {
            const i = band[q];
            if (i < map.segs.length) { const s = map.segs[i]; hitSeg(b, s[0], s[1], s[2], s[3], 0, 0, s[4] === 'floor' ? 0.1 : 0.3, 0.0012); }
            else { const p = map.pegs[i - map.segs.length]; hitCirc(b, p[0], p[1], p[2], p[3]); }
          }
          for (let q = 0; q < map.rotors.length; q++) {
            const r = map.rotors[q]; const lim = r.len + b.r + ST;
            if (Math.abs(b.y - r.cy) > lim || Math.abs(b.x - r.cx) > lim) continue;
            const base = r.ph + r.w * t;
            for (let a = 0; a < r.arms; a++) {
              const ang = base + a * Math.PI * 2 / r.arms, ex = r.cx + Math.cos(ang) * r.len, ey = r.cy + Math.sin(ang) * r.len;
              // 접점 근처 표면 속도
              const dx = ex - r.cx, dy = ey - r.cy, L2 = dx * dx + dy * dy;
              let u = ((b.x - r.cx) * dx + (b.y - r.cy) * dy) / L2; u = u < 0 ? 0 : u > 1 ? 1 : u;
              const px = r.cx + dx * u, py = r.cy + dy * u;
              hitSeg(b, r.cx, r.cy, ex, ey, -r.w * (py - r.cy), r.w * (px - r.cx), 0.35, 0.01);
            }
          }
        }
        if (b.x < b.r) { b.x = b.r; if (b.vx < 0) b.vx = -b.vx * 0.4; }
        else if (b.x > W - b.r) { b.x = W - b.r; if (b.vx > 0) b.vx = -b.vx * 0.4; }
        if (b.y > h - b.r) { b.y = h - b.r; if (b.vy > 0) b.vy = 0; }
      }
      // 구슬끼리 (격자)
      const used = [];
      for (let k = 0; k < active.length; k++) {
        const i = active[k], b = bodies[i];
        let cx = (b.x / CELL) | 0, cy = ((b.y + OFF) / CELL) | 0; if (cy < 0) cy = 0; if (cy >= rows) cy = rows - 1; if (cx < 0) cx = 0; if (cx >= gcols) cx = gcols - 1;
        const c = cy * gcols + cx; if (heads[c] === -1) used.push(c); next[i] = heads[c]; heads[c] = i;
        b.cx = cx; b.cy = cy;
      }
      const D = R * 2;
      for (let k = 0; k < active.length; k++) {
        const i = active[k], a = bodies[i];
        for (let yy = a.cy - 1; yy <= a.cy + 1; yy++) {
          if (yy < 0 || yy >= rows) continue;
          for (let xx = a.cx - 1; xx <= a.cx + 1; xx++) {
            if (xx < 0 || xx >= gcols) continue;
            for (let j = heads[yy * gcols + xx]; j !== -1; j = next[j]) {
              if (j <= i) continue;
              const c = bodies[j], dx = c.x - a.x, dy = c.y - a.y, d2 = dx * dx + dy * dy;
              if (d2 >= D * D || d2 === 0) continue;
              const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, ov = (D - d) / 2;
              a.x -= nx * ov; a.y -= ny * ov; c.x += nx * ov; c.y += ny * ov;
              const vr = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
              if (vr < 0) { const jj = -(1.25) * vr / 2; a.vx -= jj * nx; a.vy -= jj * ny; c.vx += jj * nx; c.vy += jj * ny; }
            }
          }
        }
      }
      for (let q = 0; q < used.length; q++) heads[used[q]] = -1;
      world.t += DT;
      // 끼임 풀기 + 결승
      let fin = false;
      for (let k = 0; k < active.length; k++) {
        const b = bodies[active[k]];
        const mx = b.x - b.ax, my = b.y - b.ay;
        if (mx * mx + my * my > 400) { b.ax = b.x; b.ay = b.y; b.stuck = 0; }
        else if ((b.stuck += DT) > 2) { b.stuck = 0; b.vx += (rr() - 0.5) * 320; b.vy -= 120 + rr() * 160; }
        if (b.y >= map.finishY) {
          b.finished = true; b.finishT = Math.round(world.t * 1000) / 1000;
          const n = finishList.length; b.x = 12 + (n % 50) * 15.5; b.y = map.trayTop + 10 + ((n / 50) | 0) * 15; b.vx = b.vy = 0;
          finishList.push({ id: b.id, t: b.finishT }); fin = true;
        }
      }
      if (fin) active = active.filter(i => !bodies[i].finished);
      if (!active.length) world.done = true;
      else if (world.t >= CAP) {
        // 시간 초과: 진행이 많은 순서로 붙이고, 가장 적게 내려온 구슬이 맨 마지막
        const rest = active.slice().sort((x, y) => (bodies[y].y - bodies[x].y) || (x - y));
        rest.forEach((i, k) => { const b = bodies[i]; b.finished = true; b.finishT = Math.round((CAP + 0.01 * (k + 1)) * 1000) / 1000; finishList.push({ id: b.id, t: b.finishT }); });
        active = []; world.done = true;
      }
    }
    return world;
  }
  function simulate(mapId, marbles, seed) {
    const w = create(mapId, marbles, seed);
    while (!w.done) w.step();
    const last = w.finishList.length ? w.finishList[w.finishList.length - 1].t : 0;
    return { duration: Math.round(Math.max(last, w.t) * 1000) / 1000, finish: w.finishList.slice() };
  }
  window.KQMarble = { MAPS, mapFor, create, simulate, getMap, R, W };
})();
