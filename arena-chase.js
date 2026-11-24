'use strict';
/* 반짝퀴즈 카훗형 모드: 로봇 경주(robot) + 잠수함 특공대(submarine)
   반 전체가 한 무리로 도망치고, 뒤에서 추격자가 쫓아온다. 남은 거리 = catchAt - now.
   KQ.arena.robot / KQ.arena.submarine 에 host/player 렌더러를 등록한다. */
(() => {
  const KQ = window.KQ || (window.KQ = {});
  KQ.arena = KQ.arena || {};

  const SHAPES = [
    { name: '세모', color: '#e21b3c' }, { name: '마름모', color: '#1368ce' },
    { name: '동그라미', color: '#d89e00' }, { name: '네모', color: '#26890c' }
  ];
  const HOLD_MS = 800, DANGER_MS = 8000;
  const THEME = {
    robot: { chaser: '로봇', title: '로봇에게서 탈출하라!', tip: '정답 3개를 맞히면 부스트 1번', intro: '로봇이 우리 반을 쫓아와요!', escape: '탈출 성공!', caught: '로봇에게 잡혔어요!' },
    sub: { chaser: '바다 괴물', title: '바다 괴물에게서 탈출하라!', tip: '에너지 3칸이 차면 큰 화면의 기호를 골라요', intro: '바다 괴물이 잠수함을 쫓아와요!', escape: '탈출 성공!', caught: '바다 괴물에게 잡혔어요!' }
  };

  // ---------- 작은 도우미 (KQ.modeKit 이 있으면 그것을 씀) ----------
  const K = () => KQ.modeKit || null;
  const SVGNS = 'http://www.w3.org/2000/svg';
  function setA(n, a) {
    for (const [k, v] of Object.entries(a || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'text') n.textContent = v;
      else if (k === 'class') n.setAttribute('class', v);
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
      else n.setAttribute(k, v === true ? '' : String(v));
    }
  }
  const add = (n, kids) => { for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) n.append(c instanceof Node ? c : document.createTextNode(String(c))); };
  const H = (t, a, ...k) => { const n = document.createElement(t); setA(n, a); add(n, k); return n; };
  const S = (t, a, ...k) => { const n = document.createElementNS(SVGNS, t); setA(n, a); add(n, k); return n; };
  const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const str = v => (v === null || v === undefined) ? '' : String(v);
  const arr = a => Array.isArray(a) ? a : [];
  const txt = (n, s) => { if (!n) return; s = str(s); if (n.textContent !== s) n.textContent = s; };
  const cls = (n, c, on) => { if (n) n.classList.toggle(c, !!on); };
  const replay = (n, c) => { if (!n) return; n.classList.remove(c); void n.getBoundingClientRect(); n.classList.add(c); };
  const now = () => { try { return KQ.now ? KQ.now() : Date.now(); } catch { return Date.now(); } };
  const reduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
  const snd = k => { try { KQ.sound && KQ.sound.play && KQ.sound.play(k); } catch {} };
  const hash = s => { s = str(s); let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
  const PAL = ['#e21b3c', '#1368ce', '#d89e00', '#26890c', '#864cbf', '#0aa3a3', '#ff7a00', '#e84393', '#4263eb', '#2f9e44'];
  const colorFor = id => PAL[hash(id) % PAL.length];
  const fmtSec = ms => Math.max(0, Math.ceil(ms / 1000)) + '초';
  const fmtClock = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const msOf = v => (v && v.modeState && typeof v.modeState === 'object') ? v.modeState : {};
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

  // 같은 root 에 반복 호출: 최초 1회 골격, 이후 갱신
  const STATE = new WeakMap();
  let uidSeq = 0;
  function prep(root, key, classes, build) {
    const kit = K();
    if (kit && kit.prep) return kit.prep(root, key, classes, build);
    let st = STATE.get(root);
    if (st && root.dataset.arKey === key) { st.first = false; return st; }
    if (st) { st.dead = true; cancelAnimationFrame(st.raf); st.timers.forEach(clearTimeout); }
    if (root.dataset.arCls) root.classList.remove(...root.dataset.arCls.split(' '));
    root.replaceChildren(); root.dataset.arCls = classes.join(' '); root.classList.add(...classes);
    st = { key, timers: new Set(), raf: 0, first: true, uid: ++uidSeq, dead: false };
    build(st, root); STATE.set(root, st); root.dataset.arKey = key; return st;
  }
  function later(st, fn, ms) { const t = setTimeout(() => { st.timers.delete(t); if (!st.dead) { try { fn(); } catch {} } }, ms); st.timers.add(t); return t; }
  function act(send, kind, target) {
    const kit = K(); if (kit && kit.act) return kit.act(send, kind, target);
    let p; try { p = send(kind, target); } catch (e) { p = Promise.reject(e); }
    return Promise.resolve(p).catch(e => { try { KQ.toast && KQ.toast((e && e.message) || '요청을 처리하지 못했어요.', true); } catch {} throw e; });
  }
  function symbolNow(m, t) {
    try { if (window.KQEngine && KQEngine.symbolAt) return KQEngine.symbolAt(m, t); } catch {}
    const k = Math.floor((t - m.symStart) / m.symPeriod);
    return ((Math.imul(k + 1, 0x9E3779B1) + m.symSeed) >>> 0) % 4;
  }

  // ---------- 그림 ----------
  function shapePath(i, cx, cy, r, fill) {
    if (i === 0) return S('polygon', { points: `${cx},${cy - r} ${cx + r * 0.95},${cy + r * 0.72} ${cx - r * 0.95},${cy + r * 0.72}`, fill });
    if (i === 1) return S('polygon', { points: `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`, fill });
    if (i === 2) return S('circle', { cx, cy, r: r * 0.86, fill });
    return S('rect', { x: cx - r * 0.76, y: cy - r * 0.76, width: r * 1.52, height: r * 1.52, rx: r * 0.08, fill });
  }
  function shapeSvg(i, size) { return S('svg', { viewBox: '0 0 64 64', width: size, height: size, 'aria-hidden': 'true', focusable: 'false' }, shapePath(i, 32, 34, 26, '#fff')); }

  function avatarSvg(p, size) {
    let n = null;
    if (p && p.avatar && KQ.avatar && typeof KQ.avatar.render === 'function') { try { n = KQ.avatar.render(p.avatar, size); } catch { n = null; } }
    if (!(n instanceof SVGElement)) {
      const name = Array.from(str(p && p.nickname).trim())[0] || '?';
      n = S('svg', { viewBox: '0 0 64 64', width: size, height: size },
        S('circle', { cx: 32, cy: 32, r: 31, fill: colorFor(p && (p.id || p.nickname)), stroke: '#fff', 'stroke-width': 3 }),
        S('text', { x: 32, y: 33, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 30, 'font-weight': 800, fill: '#fff', text: name }));
    }
    n.removeAttribute('role'); n.setAttribute('aria-hidden', 'true');
    return n;
  }
  const place = (svg, x, y, w, h) => { svg.setAttribute('x', x); svg.setAttribute('y', y); svg.setAttribute('width', w); svg.setAttribute('height', h); return svg; };

  // 추격 로봇 (오른쪽을 봄, 0,0 = 왼쪽 위, 230x300)
  function chaserRobot() {
    const g = S('g', { class: 'ar-chase-chaser-body' });
    const arm = S('g', { class: 'ar-chase-arm' },
      S('rect', { x: 140, y: 130, width: 78, height: 22, rx: 11, fill: '#5c5f6e', stroke: '#1c1d24', 'stroke-width': 4 }),
      S('path', { d: 'M214 118 l24 -8 l-6 22 l10 18 l-26 -4 z', fill: '#b0b3c4', stroke: '#1c1d24', 'stroke-width': 4, 'stroke-linejoin': 'round' }));
    g.append(
      S('ellipse', { cx: 110, cy: 296, rx: 100, ry: 10, fill: 'rgba(0,0,0,.28)' }),
      S('rect', { x: 30, y: 236, width: 160, height: 52, rx: 26, fill: '#2d2f3a', stroke: '#111', 'stroke-width': 4 }),
      [56, 92, 128, 164].map(x => S('circle', { class: 'ar-chase-tread', cx: x, cy: 262, r: 15, fill: '#4a4d5c', stroke: '#9aa0b8', 'stroke-width': 3, 'stroke-dasharray': '6 5' })),
      S('rect', { x: 46, y: 120, width: 128, height: 116, rx: 20, fill: '#7d8196', stroke: '#1c1d24', 'stroke-width': 5 }),
      S('rect', { x: 66, y: 146, width: 88, height: 58, rx: 10, fill: '#3b3e4b' }),
      S('circle', { class: 'ar-chase-core', cx: 110, cy: 175, r: 16, fill: '#ff6b6b' }),
      S('rect', { x: 52, y: 30, width: 128, height: 92, rx: 22, fill: '#9599ad', stroke: '#1c1d24', 'stroke-width': 5 }),
      S('rect', { x: 70, y: 52, width: 100, height: 44, rx: 18, fill: '#1c1d24' }),
      S('circle', { class: 'ar-chase-eye', cx: 104, cy: 74, r: 10, fill: '#ff3b3b' }),
      S('circle', { class: 'ar-chase-eye', cx: 146, cy: 74, r: 10, fill: '#ff3b3b' }),
      S('path', { d: 'M90 58 L118 66 M132 66 L160 58', stroke: '#ff3b3b', 'stroke-width': 4, 'stroke-linecap': 'round' }),
      S('line', { x1: 116, y1: 30, x2: 116, y2: 6, stroke: '#1c1d24', 'stroke-width': 5 }),
      S('circle', { class: 'ar-chase-ant', cx: 116, cy: 6, r: 8, fill: '#ffd43b', stroke: '#1c1d24', 'stroke-width': 3 }),
      arm);
    return g;
  }
  // 바다 괴물 (오른쪽을 봄, 300x220)
  function chaserMonster() {
    const g = S('g', { class: 'ar-chase-chaser-body' });
    const tail = S('g', { class: 'ar-chase-tail' }, S('path', { d: 'M40 110 L0 60 Q10 110 0 165 Z', fill: '#5f3dc4', stroke: '#2b1a66', 'stroke-width': 5, 'stroke-linejoin': 'round' }));
    g.append(
      tail,
      S('path', { d: 'M120 40 Q150 0 190 20 L170 50 Z', fill: '#7048e8', stroke: '#2b1a66', 'stroke-width': 5 }),
      S('ellipse', { cx: 150, cy: 112, rx: 120, ry: 80, fill: '#7048e8', stroke: '#2b1a66', 'stroke-width': 6 }),
      S('ellipse', { cx: 140, cy: 150, rx: 80, ry: 30, fill: '#9775fa', opacity: 0.6 }),
      S('path', { d: 'M196 112 Q260 112 272 96 L272 140 Q250 150 196 126 Z', fill: '#1b0f3d' }),
      S('path', { d: 'M204 112 l8 12 l8 -12 l8 12 l8 -12 l8 12 l8 -12 l8 12 l8 -14', fill: '#fff', stroke: '#fff', 'stroke-width': 2, 'stroke-linejoin': 'round' }),
      S('path', { d: 'M204 128 l8 -10 l8 10 l8 -10 l8 10 l8 -10 l8 10 l8 -10', fill: '#fff', stroke: '#fff', 'stroke-width': 2, 'stroke-linejoin': 'round' }),
      S('circle', { cx: 200, cy: 76, r: 20, fill: '#fff', stroke: '#2b1a66', 'stroke-width': 4 }),
      S('circle', { class: 'ar-chase-eye', cx: 206, cy: 78, r: 9, fill: '#ff3b3b' }),
      S('path', { d: 'M178 52 L222 62', stroke: '#2b1a66', 'stroke-width': 6, 'stroke-linecap': 'round' }),
      S('path', { d: 'M190 40 Q240 -4 280 40', fill: 'none', stroke: '#2b1a66', 'stroke-width': 5 }),
      S('circle', { class: 'ar-chase-lure', cx: 282, cy: 46, r: 12, fill: '#ffe066' }),
      [60, 96, 132].map(x => S('circle', { cx: x, cy: 90, r: 7, fill: '#9775fa', opacity: 0.7 })));
    return g;
  }
  // 작은 잠수함 (오른쪽을 봄, 0,0 기준 너비 92 높이 52)
  function miniSub(color) {
    return S('g', {},
      S('polygon', { points: '6,22 -6,12 -6,40 6,30', fill: shadeHex(color, -0.25) }),
      S('ellipse', { cx: 46, cy: 28, rx: 44, ry: 20, fill: color, stroke: shadeHex(color, -0.45), 'stroke-width': 3 }),
      S('rect', { x: 34, y: 0, width: 22, height: 14, rx: 4, fill: shadeHex(color, -0.12), stroke: shadeHex(color, -0.45), 'stroke-width': 3 }),
      S('ellipse', { cx: 36, cy: 34, rx: 26, ry: 6, fill: '#fff', opacity: 0.18 }));
  }
  function shadeHex(hex, f) {
    let h = (typeof hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#ffd43b').slice(1);
    const n = parseInt(h, 16); let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const t = f < 0 ? 0 : 255, p = Math.abs(f);
    r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  // 배경: 반복 타일 (tileW 마다 같은 그림 3~4장)
  function tiles(layer, W, draw) { for (let k = 0; k * W < 1500 + W; k++) { const g = S('g', { transform: `translate(${k * W} 0)` }); draw(g); layer.append(g); } }
  function buildBackdrop(svg, theme, uid) {
    const defs = S('defs');
    const sky = 'arsky' + uid;
    const L = { far: S('g'), mid: S('g'), near: S('g'), bubbles: S('g') };
    if (theme === 'robot') {
      defs.append(S('linearGradient', { id: sky, x1: 0, y1: 0, x2: 0, y2: 1 }, S('stop', { offset: '0', 'stop-color': '#2a1259' }), S('stop', { offset: '.55', 'stop-color': '#7b3fa0' }), S('stop', { offset: '1', 'stop-color': '#ff9b73' })));
      svg.append(defs, S('rect', { x: -50, y: -200, width: 2000, height: 760, fill: `url(#${sky})` }),
        S('circle', { cx: 640, cy: 300, r: 90, fill: '#ffd08a', opacity: 0.55 }));
      const r1 = rng(11);
      tiles(L.far, 450, g => { for (let x = 0; x < 450; x += 50) { const h = 90 + r1() * 150; g.append(S('rect', { x, y: 420 - h, width: 46, height: h, fill: '#4b2a7a', opacity: 0.75 })); } });
      const r2 = rng(29);
      tiles(L.mid, 600, g => {
        for (let x = 0; x < 600; x += 100) {
          const h = 110 + r2() * 120, w = 80;
          g.append(S('rect', { x, y: 420 - h, width: w, height: h, fill: '#2f1b52' }));
          for (let wy = 420 - h + 14; wy < 405; wy += 24) for (let wx = x + 12; wx < x + w - 10; wx += 22) if (r2() > 0.35) g.append(S('rect', { x: wx, y: wy, width: 10, height: 12, fill: '#ffe08a', opacity: 0.8 }));
        }
      });
      svg.append(L.far, L.mid, S('rect', { x: -50, y: 410, width: 2000, height: 120, fill: '#3a3a4d' }), S('rect', { x: -50, y: 410, width: 2000, height: 8, fill: '#a5a5c4' }));
      tiles(L.near, 160, g => { g.append(S('rect', { x: 0, y: 470, width: 70, height: 7, rx: 3, fill: '#ffd43b' })); g.append(S('rect', { x: 100, y: 426, width: 6, height: 20, fill: '#6e6e8a' })); });
      svg.append(L.near);
    } else {
      defs.append(S('linearGradient', { id: sky, x1: 0, y1: 0, x2: 0, y2: 1 }, S('stop', { offset: '0', 'stop-color': '#1588c4' }), S('stop', { offset: '.5', 'stop-color': '#0b4f8a' }), S('stop', { offset: '1', 'stop-color': '#062a4d' })));
      svg.append(defs, S('rect', { x: -50, y: -200, width: 2000, height: 760, fill: `url(#${sky})` }));
      for (let i = 0; i < 5; i++) svg.append(S('polygon', { points: `${120 + i * 210},-200 ${200 + i * 210},-200 ${60 + i * 230},520 ${-30 + i * 230},520`, fill: '#fff', opacity: 0.05 }));
      const r1 = rng(7);
      tiles(L.far, 500, g => { for (let x = 0; x < 500; x += 125) { const h = 60 + r1() * 90; g.append(S('path', { d: `M${x} 470 Q${x + 30} ${470 - h} ${x + 62} ${470 - h * 0.7} T${x + 125} 470 Z`, fill: '#073b66', opacity: 0.8 })); } });
      const r2 = rng(19);
      tiles(L.mid, 420, g => {
        g.append(S('path', { d: 'M0 480 Q105 455 210 478 T420 480 V560 H0 Z', fill: '#c9a96e' }));
        for (let k = 0; k < 4; k++) { const x = 30 + k * 100 + r2() * 30, h = 50 + r2() * 70; g.append(S('path', { class: 'ar-chase-kelp', d: `M${x} 482 q-12 -${h / 3} 0 -${h * 2 / 3} q12 -${h / 3} 0 -${h}`, fill: 'none', stroke: '#2f9e44', 'stroke-width': 7, 'stroke-linecap': 'round' })); }
        g.append(S('ellipse', { cx: 300, cy: 484, rx: 34, ry: 14, fill: '#8d7a5a' }));
      });
      svg.append(L.far, L.mid);
      tiles(L.near, 300, g => { g.append(S('circle', { cx: 60, cy: 500, r: 9, fill: '#e8590c' })); g.append(S('path', { d: 'M200 505 l8 -16 l8 16 l-16 -10 h16 z', fill: '#f783ac' })); });
      svg.append(L.near);
      const rb = rng(3);
      for (let i = 0; i < 18; i++) L.bubbles.append(S('circle', { cx: rb() * 1400, cy: rb() * 520, r: 2 + rb() * 5, fill: 'none', stroke: '#c5f6fa', 'stroke-width': 1.5, opacity: 0.6, 'data-s': (20 + rb() * 40).toFixed(1) }));
    }
    return L;
  }

  // ---------- 진행자: 달리기 장면 ----------
  function buildRunScene(st, root, theme) {
    const T = THEME[theme];
    root.append(H('div', { class: 'ar-chase-vignette', 'aria-hidden': 'true' }));
    const svg = S('svg', { class: 'ar-chase-world', viewBox: '0 0 900 520', preserveAspectRatio: 'xMinYMax slice', 'aria-hidden': 'true', focusable: 'false' });
    st.layers = buildBackdrop(svg, theme, st.uid);
    st.speed = S('g', { class: 'ar-chase-speed' });
    for (let i = 0; i < 9; i++) st.speed.append(S('rect', { x: (i * 157) % 900, y: 60 + (i * 53) % 340, width: 120 + (i % 3) * 40, height: 4, rx: 2, fill: '#fff', opacity: 0.55 }));
    st.squad = S('g', { class: 'ar-chase-squad' });
    st.chaser = S('g', { class: 'ar-chase-chaser' }, theme === 'robot' ? chaserRobot() : chaserMonster());
    st.chaserW = theme === 'robot' ? 236 : 290;
    st.chaserY = theme === 'robot' ? 214 : 250;
    svg.append(st.speed, st.squad, st.chaser, st.layers.bubbles);
    root.append(svg);
    st.svg = svg;

    // HUD
    st.gapVal = H('b', { class: 'ar-chase-gap-val' }, '');
    st.gapFill = H('i');
    st.timeVal = H('b', {}, '');
    st.boostVal = H('b', {}, '0');
    st.hud = H('div', { class: 'ar-chase-hud' },
      H('div', { class: 'ar-chase-gap' }, H('span', { class: 'ar-chase-lbl' }, T.chaser + '와 거리'), st.gapVal, H('div', { class: 'ar-chase-meter' }, st.gapFill)),
      H('div', { class: 'ar-chase-title' }, H('b', {}, T.title), theme === 'robot' ? stageBlock(st) : H('span', {}, T.tip)),
      H('div', { class: 'ar-chase-stats' }, H('div', {}, H('span', {}, '탈출까지'), st.timeVal), H('div', {}, H('span', {}, '부스트'), st.boostVal)));
    root.append(st.hud);
    st.off = H('div', { class: 'ar-chase-off', hidden: true }, H('span', { class: 'ar-chase-off-arrow', 'aria-hidden': 'true' }), H('span', {}, ''));
    root.append(st.off);
    if (theme === 'sub') {
      const R = 52, C = 2 * Math.PI * R;
      st.symC = C;
      st.symRing = S('circle', { cx: 60, cy: 60, r: R, fill: 'none', stroke: '#fff', 'stroke-width': 8, 'stroke-linecap': 'round', 'stroke-dasharray': C.toFixed(1), transform: 'rotate(-90 60 60)' });
      st.symBg = S('circle', { cx: 60, cy: 60, r: 46, fill: SHAPES[0].color });
      st.symShape = S('g');
      st.symName = H('b', {}, '');
      st.symCard = H('div', { class: 'ar-chase-sym' }, H('span', { class: 'ar-chase-sym-lbl' }, '지금 기호'),
        S('svg', { viewBox: '0 0 120 120', class: 'ar-chase-sym-art', 'aria-hidden': 'true' }, S('circle', { cx: 60, cy: 60, r: 52, fill: 'none', stroke: 'rgba(255,255,255,.25)', 'stroke-width': 8 }), st.symRing, st.symBg, st.symShape),
        st.symName);
      root.append(st.symCard);
      st.sym = -1;
    }
    st.banner = H('div', { class: 'ar-chase-banner', hidden: true, role: 'status' }, H('b', {}, ''), H('span', {}, ''));
    root.append(st.banner);
    st.dispGap = null; st.off0 = 0; st.lastT = 0; st.surge = 0; st.burst = 0; st.squadKey = ''; st.lastBoostAt = null; st.danger = false;
    st.ro = null;
    const fit = () => {
      const w = root.clientWidth || 900, h = root.clientHeight || 520, a = w / Math.max(1, h);
      let VW = 900, VH = 520;
      if (a >= 900 / 520) VH = Math.max(260, 900 / a); else VW = Math.max(520, 520 * a);
      st.VW = VW; st.svg.setAttribute('viewBox', `0 ${520 - VH} ${VW} ${VH}`);
      st.squadKey = '';
    };
    fit();
    try { st.ro = new ResizeObserver(() => { if (st.dead) { try { st.ro.disconnect(); } catch {} return; } { fit(); if (st.view) layoutSquad(st, st.view, theme); } }); st.ro.observe(root); } catch {}
    const loop = t => { if (st.dead) { try { st.ro && st.ro.disconnect(); } catch {} return; } st.raf = requestAnimationFrame(loop); try { frame(st, t, theme); } catch (e) { if (!st.warned) { st.warned = true; console.warn('[반짝퀴즈 추격]', e); } } };
    st.raf = requestAnimationFrame(loop);
  }

  function layoutSquad(st, v, theme) {
    const m = msOf(v);
    const runners = arr(m.runners).length ? arr(m.runners) : arr(v.players);
    const cols = st.VW >= 780 ? 4 : 3;
    const N = Math.min(runners.length, cols * 3);
    const key = [st.VW, cols, runners.length, runners.slice(0, N).map(r => r.id + ':' + (r.avatar ? [r.avatar.c, r.avatar.k, r.avatar.h, r.avatar.f, r.avatar.b].join('.') : '')).join(',')].join('|');
    if (key === st.squadKey) return;
    st.squadKey = key;
    st.squad.replaceChildren();
    const robot = theme === 'robot';
    const sx = robot ? 66 : 100, size = robot ? 54 : 34;
    const lanes = robot ? [444, 474, 504] : [300, 362, 424];
    st.members = [];
    let minX = 0;
    const list = N ? runners.slice(0, N) : [{ id: 'class', nickname: '우리 반' }];
    // 뒤쪽 줄부터 그려서 앞줄이 위에 보이도록
    const order = list.map((p, i) => ({ p, i, row: i % 3, col: Math.floor(i / 3) })).sort((a, b) => a.row - b.row);
    for (const o of order) {
      const x = -(o.col * sx + (o.row % 2) * (sx / 2)) - (robot ? 40 : 96);
      const y = lanes[o.row];
      minX = Math.min(minX, x);
      const g = S('g', { class: 'ar-chase-runner' });
      const inner = S('g');
      if (robot) {
        inner.append(S('ellipse', { cx: size / 2, cy: 0, rx: size * 0.45, ry: 6, fill: 'rgba(0,0,0,.3)' }),
          S('g', { class: 'ar-chase-feet' }, S('ellipse', { class: 'f1', cx: size * 0.32, cy: -6, rx: 9, ry: 6, fill: '#fff', stroke: '#222', 'stroke-width': 2 }), S('ellipse', { class: 'f2', cx: size * 0.68, cy: -6, rx: 9, ry: 6, fill: '#fff', stroke: '#222', 'stroke-width': 2 })),
          place(avatarSvg(o.p, size), 0, -size - 8, size, size));
      } else {
        const sub = miniSub(o.p.id === 'class' ? '#ffd43b' : shadeHex(colorFor(o.p.id), 0.25));
        inner.append(sub, S('circle', { cx: 62, cy: 26, r: size / 2 + 3, fill: '#9be7ff', stroke: '#333', 'stroke-width': 2.5 }), place(avatarSvg(o.p, size), 62 - size / 2, 26 - size / 2, size, size));
      }
      g.append(inner);
      if (N <= 8 && o.p.id !== 'class') {
        const nm = str(o.p.nickname).slice(0, 6);
        const ty = robot ? -size - 14 : -6;
        g.append(S('text', { class: 'ar-chase-name', x: robot ? size / 2 : 46, y: ty, 'text-anchor': 'middle', text: nm }));
      }
      g.setAttribute('transform', `translate(${x} ${y})`);
      st.squad.append(g);
      st.members.push({ g: inner, phase: (hash(o.p.id) % 628) / 100, bx: x, by: y });
    }
    if (runners.length > N && N) {
      const extra = runners.length - N;
      const bx = minX - 20, by = robot ? 400 : 250;
      st.squad.append(S('g', { transform: `translate(${bx} ${by})` }, S('rect', { x: -38, y: -20, width: 76, height: 36, rx: 18, fill: 'rgba(0,0,0,.55)' }), S('text', { class: 'ar-chase-more', x: 0, y: 5, 'text-anchor': 'middle', text: '+' + extra + '명' })));
      minX -= 40;
    }
    st.squadBack = minX - 8;
    st.squadRight = st.VW - (robot ? 50 : 70);
  }

  function frame(st, t, theme) {
    const v = st.view; if (!v) return;
    const m = msOf(v);
    const dt = st.lastT ? Math.min(0.1, (t - st.lastT) / 1000) : 0; st.lastT = t;
    const n = now();
    const red = reduced();
    const gapMax = num(m.gapMax, 60000) || 60000;
    const running = m.status === 'running' && v.phase === 'running';
    let gap = m.catchAt ? Math.max(0, num(m.catchAt) - n) : 25000;
    if (m.status === 'failed') gap = 0;
    if (v.phase === 'finished') gap = m.status === 'success' ? gapMax * 0.5 : m.status === 'failed' ? 0 : gapMax * 0.4;
    if (st.dispGap === null) st.dispGap = gap;
    st.dispGap += (gap - st.dispGap) * Math.min(1, dt * 5);
    if (Math.abs(gap - st.dispGap) < 40) st.dispGap = gap;
    // 배경 흐름
    st.burst = Math.max(0, st.burst - dt);
    const spd = running ? (140 + (st.burst > 0 ? 520 * (st.burst / 1.4) : 0)) : (m.status === 'success' ? 60 : 0);
    if (!red) st.off0 += spd * dt;
    const L = st.layers, o = st.off0;
    L.far.setAttribute('transform', `translate(${-((o * 0.15) % (theme === 'robot' ? 450 : 500))} 0)`);
    L.mid.setAttribute('transform', `translate(${-((o * 0.45) % (theme === 'robot' ? 600 : 420))} 0)`);
    L.near.setAttribute('transform', `translate(${-((o * 1) % (theme === 'robot' ? 160 : 300))} 0)`);
    if (theme === 'sub' && !red) for (const b of L.bubbles.children) { let y = num(b.getAttribute('cy')) - num(b.dataset.s) * dt; let x = num(b.getAttribute('cx')) - spd * 0.6 * dt; if (y < -10) y = 530; if (x < -10) x += 1420; b.setAttribute('cy', y.toFixed(1)); b.setAttribute('cx', x.toFixed(1)); }
    st.speed.style.opacity = st.burst > 0 && !red ? String(Math.min(1, st.burst)) : '0';
    if (st.burst > 0 && !red) st.speed.setAttribute('transform', `translate(${-((o * 2) % 900)} 0)`);
    // 무리
    st.surge = Math.max(0, st.surge - dt * 30);
    const sr = st.squadRight + st.surge;
    st.squad.setAttribute('transform', `translate(${sr.toFixed(1)} 0)`);
    if (!red && st.members) {
      const moving = running || m.status === 'success';
      for (const mb of st.members) {
        const b = moving ? Math.abs(Math.sin(t / (theme === 'robot' ? 110 : 420) + mb.phase)) * (theme === 'robot' ? 7 : 6) : 0;
        const rot = m.status === 'failed' ? Math.sin(t / 60 + mb.phase) * 6 : 0;
        mb.g.setAttribute('transform', `translate(0 ${(-b).toFixed(1)}) rotate(${rot.toFixed(1)})`);
      }
    }
    // 추격자
    const back = sr + (st.squadBack || -200);
    const span = back + st.chaserW + 60;
    const front = back - 4 - (Math.min(st.dispGap, gapMax) / gapMax) * span;
    const bob = red ? 0 : Math.sin(t / (theme === 'robot' ? 160 : 500)) * (theme === 'robot' ? 3 : 10);
    st.chaser.setAttribute('transform', `translate(${(front - st.chaserW).toFixed(1)} ${(st.chaserY + bob).toFixed(1)})`);
    // 화면 밖 표시
    const offscreen = front < 50 && v.phase !== 'finished';
    st.off.hidden = !offscreen;
    if (offscreen) txt(st.off.lastChild, `${THEME[theme].chaser} ${fmtSec(gap)} 뒤`);
    // HUD
    if (st.gapVal) {
      txt(st.gapVal, m.status === 'failed' ? '잡힘' : fmtSec(gap));
      st.gapFill.style.transform = `scaleX(${clamp(st.dispGap / gapMax, 0, 1).toFixed(3)})`;
      txt(st.timeVal, v.endsAt ? fmtClock(num(v.endsAt) - n) : '-');
      txt(st.boostVal, String(num(m.boosts)));
      const danger = running && gap < DANGER_MS;
      if (danger !== st.danger) { st.danger = danger; cls(st.root, 'ar-chase-danger', danger); if (danger) snd('countdown'); }
    }
    // 기호
    if (st.symCard) {
      const on = running && m.symStart && m.symPeriod;
      st.symCard.hidden = !on;
      if (on) {
        const s = symbolNow(m, n);
        if (s !== st.sym) {
          st.sym = s;
          st.symBg.setAttribute('fill', SHAPES[s].color);
          st.symShape.replaceChildren(shapePath(s, 60, 62, 28, '#fff'));
          txt(st.symName, SHAPES[s].name);
          replay(st.symCard, 'ar-chase-pop');
        }
        const fr = ((n - m.symStart) % m.symPeriod) / m.symPeriod;
        st.symRing.setAttribute('stroke-dashoffset', (st.symC * fr).toFixed(1));
      }
    }
  }

  // ---------- 로봇 경주: 단계 표시 ----------
  const SEEN_STAGE = new WeakMap();
  function stageBlock(st) {
    st.stN = H('b', {}, '1');
    st.stDots = Array.from({ length: 6 }, () => H('i'));
    st.stFill = H('i');
    st.stTxt = H('span', { class: 'ar-chase-stage-t' }, '');
    st.stLast = H('span', { class: 'ar-chase-stage-last', hidden: true }, '');
    return H('div', { class: 'ar-chase-stage' },
      H('div', { class: 'ar-chase-stage-top' }, H('span', { class: 'ar-chase-stage-n' }, st.stN, ' / 6단계'), H('span', { class: 'ar-chase-stage-dots', 'aria-hidden': 'true' }, st.stDots)),
      H('div', { class: 'ar-chase-stage-bar', 'aria-hidden': 'true' }, st.stFill),
      H('div', { class: 'ar-chase-stage-row' }, st.stTxt, st.stLast));
  }
  function stageInfo(m) {
    const stages = num(m.stages, 6) || 6, stage = clamp(num(m.stage, 1) || 1, 1, stages);
    const sb = num(m.stageBoosts), sg = Math.max(1, num(m.stageGoal, 3));
    return { stage, stages, sb, sg, ratio: clamp(sb / sg, 0, 1) };
  }
  function updateStage(st, v, root) {
    if (!st.stN) return;
    const m = msOf(v); const I = stageInfo(m);
    txt(st.stN, String(I.stage));
    st.stDots.forEach((d, i) => { cls(d, 'done', i < I.stage - 1 || (m.cleared && i < I.stages)); cls(d, 'on', i === I.stage - 1 && !m.cleared); });
    st.stFill.style.transform = `scaleX(${I.ratio.toFixed(3)})`;
    txt(st.stTxt, m.cleared ? '모든 단계 클리어!' : `다음 미니게임까지 부스트 ${Math.min(I.sb, I.sg)} / ${I.sg}`);
    const lm = m.lastMini;
    st.stLast.hidden = !lm;
    if (lm) { txt(st.stLast, `지난 미션 ${lm.ok ? '성공' : '실패'}`); cls(st.stLast, 'good', !!lm.ok); cls(st.stLast, 'bad', !lm.ok); }
    const prev = SEEN_STAGE.get(root);
    if (prev === I.stage) return;
    SEEN_STAGE.set(root, I.stage);
    if (I.stage <= 1 || v.phase !== 'running' || (prev !== undefined && prev > I.stage)) return;
    const b = st.banner; if (!b) return;
    txt(b.firstChild, `${I.stage}단계 시작! 로봇이 더 빨라졌어요`);
    txt(b.lastChild, lm ? (lm.ok ? '미니게임 성공! 로봇을 15초 뒤로 밀어냈어요' : '미니게임 실패… 로봇이 10초 가까워졌어요. 힘내요!') : '부스트를 모아 다음 미니게임을 열어요');
    b.hidden = false; cls(b, 'ar-chase-stagebanner', true); cls(b, 'bad', !!(lm && !lm.ok)); replay(b, 'ar-chase-in');
    clearTimeout(st.bannerT); st.bannerT = later(st, () => { b.hidden = true; cls(b, 'ar-chase-stagebanner', false); cls(b, 'bad', false); }, 3600);
    snd(lm && !lm.ok ? 'wrong' : 'levelup');
  }

  function onBoost(st, v, theme) {
    const lb = msOf(v).lastBoost;
    const at = lb && lb.at ? num(lb.at) : null;
    if (st.lastBoostAt === null) { st.lastBoostAt = at || 0; return; }
    if (!at || at === st.lastBoostAt) return;
    st.lastBoostAt = at;
    if (now() - at > 6000) return;
    st.burst = 1.4; st.surge = 46;
    const b = st.banner;
    cls(b, 'ar-chase-stagebanner', false); cls(b, 'bad', false);
    txt(b.firstChild, `${str(lb.nickname)} 부스트!`);
    txt(b.lastChild, `${THEME[theme].chaser}와 거리 +${Math.round(num(lb.gain) / 1000)}초`);
    b.hidden = false; replay(b, 'ar-chase-in');
    clearTimeout(st.bannerT); st.bannerT = later(st, () => { b.hidden = true; }, 2200);
    snd('whoosh');
  }

  // ---------- 진행자: 시작 전 안내 ----------
  function buildIntro(st, root, theme) {
    const T = THEME[theme];
    const icon = S('svg', { viewBox: theme === 'robot' ? '0 0 250 310' : '-10 -10 310 230', class: 'ar-chase-intro-icon', 'aria-hidden': 'true' }, theme === 'robot' ? chaserRobot() : chaserMonster());
    st.introCrew = H('div', { class: 'ar-chase-intro-crew', 'aria-hidden': 'true' });
    st.introCount = H('span', { class: 'ar-chase-intro-count' }, '');
    const steps = H('ol', { class: 'ar-chase-steps' },
      H('li', {}, H('span', { class: 'ar-chase-dots', 'aria-hidden': 'true' }, H('i', { class: 'on' }), H('i', { class: 'on' }), H('i', { class: 'on' })), '정답 3개'),
      H('li', {}, '에너지 완성'),
      H('li', {}, theme === 'robot' ? '부스트 꾹!' : '기호 맞히기'));
    root.append(H('div', { class: 'ar-chase-intro' }, icon, H('div', { class: 'ar-chase-intro-text' }, H('b', {}, T.intro), steps), H('div', { class: 'ar-chase-intro-right' }, st.introCrew, st.introCount)));
    st.introKey = '';
  }
  function updateIntro(st, v) {
    const m = msOf(v); const list = arr(m.runners).length ? arr(m.runners) : arr(v.players);
    const key = list.slice(0, 6).map(p => p.id).join(',') + '|' + list.length;
    if (key === st.introKey) return; st.introKey = key;
    st.introCrew.replaceChildren(...list.slice(0, 6).map(p => H('span', { class: 'ar-chase-intro-av' }, avatarSvg(p, 40))));
    txt(st.introCount, list.length ? `우리 반 ${list.length}명 출발 준비!` : '친구들을 기다려요');
  }

  // ---------- 진행자: 끝 장면 ----------
  function buildEnd(st, root, theme, v) {
    const m = msOf(v); const T = THEME[theme];
    buildRunScene(st, root, theme);
    st.hud.hidden = true;
    const win = m.status === 'success', lose = m.status === 'failed';
    const survived = m.startAt && m.catchAt ? Math.max(0, num(m.catchAt) - num(m.startAt)) : 0;
    const robotStage = theme === 'robot' && num(m.stage) ? `${m.cleared ? num(m.stages, 6) : num(m.stage)}/${num(m.stages, 6)}단계 도달 · ` : '';
    const title = win && theme === 'robot' && m.cleared ? '6단계 완전 탈출 성공!' : win ? T.escape : lose ? T.caught : '게임이 끝났어요';
    const sub = robotStage + (win ? `부스트 ${num(m.boosts)}번으로 끝까지 버텼어요!` : lose ? `부스트 ${num(m.boosts)}번, ${fmtClock(survived)} 동안 버텼어요. 다음엔 꼭 탈출해요!` : '');
    const awards = arr(m.awards).slice(0, 3).map(a => H('div', { class: 'ar-chase-award' },
      H('span', { class: 'ar-chase-award-av' }, avatarSvg(a, 46)),
      H('span', { class: 'ar-chase-award-t' }, str(a.title)), H('b', {}, str(a.nickname)), H('small', {}, `${num(a.value)}${str(a.unit)}`)));
    root.append(H('div', { class: 'ar-chase-end ' + (win ? 'good' : lose ? 'bad' : '') }, H('div', { class: 'ar-chase-end-card' }, H('b', {}, title), sub ? H('span', {}, sub) : null), awards.length ? H('div', { class: 'ar-chase-awards' }, awards) : null));
    if (win && theme === 'robot') st.svg.append(S('g', { class: 'ar-chase-exit', transform: `translate(${st.VW - 40} 300)` }, S('rect', { x: -30, y: 0, width: 60, height: 120, rx: 30, fill: '#69db7c', opacity: 0.85 }), S('text', { x: 0, y: -10, 'text-anchor': 'middle', class: 'ar-chase-name', text: '출구' })));
  }

  function host(theme) {
    return (root, v) => {
      if (!root) return;
      const m = msOf(v);
      const phase = v.phase === 'finished' ? 'end' : (v.phase === 'running' ? 'run' : 'intro');
      const key = `ar-chase-h-${theme}-${phase}`;
      const st = prep(root, key, ['ar-chase', 'ar-chase-host', 'ar-chase-' + theme, 'ar-chase-' + phase], (s, r) => {
        s.root = r; s.view = v;
        if (phase === 'run') buildRunScene(s, r, theme);
        else if (phase === 'end') buildEnd(s, r, theme, v);
        else buildIntro(s, r, theme);
      });
      st.root = root; st.view = v;
      if (phase === 'intro') { updateIntro(st, v); return; }
      layoutSquad(st, v, theme);
      if (phase === 'run') { onBoost(st, v, theme); if (theme === 'robot') updateStage(st, v, root); }
      void m;
    };
  }

  // ---------- 학생 ----------
  function gapMeter(st, theme) {
    st.pGap = H('b', {}, '');
    st.pFill = H('i');
    st.pStage = theme === 'robot' ? H('small', { class: 'ar-chase-pstage' }, '') : null;
    return H('div', { class: 'ar-chase-pgap' }, H('span', {}, THEME[theme].chaser + '까지'), st.pGap, H('div', { class: 'ar-chase-meter' }, st.pFill), st.pStage);
  }
  function tickGap(st) {
    const loop = () => {
      if (st.dead) return; st.raf = requestAnimationFrame(loop);
      const t = now(); if (st.lastTick && t - st.lastTick < 200) return; st.lastTick = t;
      const v = st.view || {}, m = msOf(v);
      if (!st.pGap) return;
      let gap = m.catchAt ? Math.max(0, num(m.catchAt) - t) : null;
      if (m.status === 'failed') gap = 0;
      txt(st.pGap, m.status === 'success' ? '탈출!' : m.status === 'failed' ? '잡힘' : gap === null ? '출발 전' : fmtSec(gap));
      st.pFill.style.transform = `scaleX(${gap === null ? 0.42 : clamp(gap / (num(m.gapMax, 60000) || 60000), 0, 1).toFixed(3)})`;
      cls(st.root, 'ar-chase-danger', m.status === 'running' && v.phase === 'running' && gap !== null && gap < DANGER_MS);
      if (st.pStage) {
        const I = stageInfo(m);
        txt(st.pStage, m.cleared ? '모든 단계 클리어!' : `${I.stage}/${I.stages}단계 · 미니게임까지 부스트 ${Math.min(I.sb, I.sg)}/${I.sg}`);
        const prev = SEEN_STAGE.get(st.root);
        if (prev !== I.stage) { SEEN_STAGE.set(st.root, I.stage); if (prev !== undefined && I.stage > prev) { replay(st.pStage, 'ar-chase-pop'); cls(st.pStage, 'hot', true); later(st, () => cls(st.pStage, 'hot', false), 3500); snd('levelup'); } }
      }
    };
    st.raf = requestAnimationFrame(loop);
  }
  function buildStrip(st, root, theme) {
    st.dots = [0, 1, 2].map(() => H('i'));
    st.chargeLbl = H('span', { class: 'ar-chase-lbl' }, '');
    st.mine = H('b', {}, '0');
    root.append(H('div', { class: 'ar-chase-strip' },
      H('div', { class: 'ar-chase-charge' }, H('span', { class: 'ar-chase-dots', 'aria-hidden': 'true' }, st.dots), st.chargeLbl),
      gapMeter(st, theme),
      H('div', { class: 'ar-chase-mine' }, H('span', {}, '내 부스트'), st.mine)));
    tickGap(st);
  }
  function updateStrip(st, v) {
    const me = v.me || {}, s = me.stats || {};
    const c = clamp(num(s.charge), 0, 3);
    st.dots.forEach((d, i) => cls(d, 'on', i < c));
    if (st.lastCharge !== undefined && c > st.lastCharge) replay(st.dots[c - 1], 'ar-chase-pop');
    st.lastCharge = c;
    txt(st.chargeLbl, `에너지 ${c}/3`);
    txt(st.mine, String(num(s.boosts)) + '번');
  }

  function buildBoost(st, root, theme, send) {
    const R = 92, C = 2 * Math.PI * R;
    const ring = S('circle', { cx: 110, cy: 110, r: R, fill: 'none', stroke: '#ffd43b', 'stroke-width': 16, 'stroke-linecap': 'round', 'stroke-dasharray': C.toFixed(1), 'stroke-dashoffset': C.toFixed(1), transform: 'rotate(-90 110 110)' });
    const label = H('span', { class: 'ar-chase-hold-t' }, '꾹 누르기');
    const btn = H('button', { type: 'button', class: 'ar-chase-hold', 'aria-label': '부스트 버튼. 꾹 누르고 있으면 부스트가 나가요. 스페이스나 엔터를 눌러도 돼요.' },
      S('svg', { viewBox: '0 0 220 220', class: 'ar-chase-hold-ring', 'aria-hidden': 'true' }, S('circle', { cx: 110, cy: 110, r: R, fill: 'none', stroke: 'rgba(255,255,255,.22)', 'stroke-width': 16 }), ring,
        S('g', { transform: 'translate(70 64)' }, S('path', { d: 'M48 0 L8 52 H38 L28 92 L72 34 H42 Z', fill: '#fff' }))),
      label);
    const msg = H('p', { class: 'ar-chase-act-msg', role: 'status' }, '버튼을 0.8초 동안 꾹 누르고 있어요');
    root.append(H('div', { class: 'ar-chase-act' }, H('h2', {}, '에너지 충전 완료!'), msg, btn, gapMeter(st, theme)));
    st.btn = btn; st.msg = msg; st.sent = false;
    let holdAt = 0, prog = 0, raf2 = 0;
    const draw = () => { ring.setAttribute('stroke-dashoffset', (C * (1 - prog)).toFixed(1)); };
    const step = () => {
      if (st.dead) return;
      if (holdAt) {
        prog = Math.min(1, (performance.now() - holdAt) / HOLD_MS); draw();
        if (prog >= 1) { holdAt = 0; fire(); return; }
        raf2 = requestAnimationFrame(step);
      }
    };
    const start = e => {
      if (st.sent || holdAt) return;
      if (e && e.preventDefault) e.preventDefault();
      holdAt = performance.now() - prog * HOLD_MS; cls(btn, 'holding', true); txt(label, '계속 누르세요');
      if (e && e.pointerId !== undefined) { try { btn.setPointerCapture(e.pointerId); } catch {} }
      snd('tick'); cancelAnimationFrame(raf2); raf2 = requestAnimationFrame(step);
    };
    const stop = () => {
      if (!holdAt || st.sent) return;
      holdAt = 0; cls(btn, 'holding', false); txt(label, '꾹 누르기'); cancelAnimationFrame(raf2);
      const drain = () => { if (st.dead || holdAt || st.sent) return; prog = Math.max(0, prog - 0.08); draw(); if (prog > 0) raf2 = requestAnimationFrame(drain); };
      raf2 = requestAnimationFrame(drain);
    };
    const fire = () => {
      st.sent = true; cls(btn, 'holding', false); cls(btn, 'sent', true); btn.disabled = true; txt(label, '보내는 중…');
      snd('whoosh');
      try { if (KQ.fx && KQ.fx.burst) KQ.fx.burst(btn, { count: 40 }); } catch {}
      act(send, 'boost').then(r => {
        const res = r && r.result; txt(label, '부스트!');
        txt(msg, (res && res.message) || '부스트 성공!');
        if (res && res.correct !== false) snd('levelup');
      }).catch(() => { st.sent = false; btn.disabled = false; cls(btn, 'sent', false); prog = 0; draw(); txt(label, '꾹 누르기'); });
    };
    btn.addEventListener('pointerdown', start);
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(ev, stop);
    btn.addEventListener('contextmenu', e => e.preventDefault());
    btn.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) start(e); else if (e.key === ' ' || e.key === 'Enter') e.preventDefault(); });
    btn.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); stop(); } });
    btn.addEventListener('click', e => e.preventDefault());
    tickGap(st);
    later(st, () => { try { btn.focus({ preventScroll: true }); } catch {} }, 60);
  }

  function buildSymbol(st, root, theme, send) {
    const msg = H('p', { class: 'ar-chase-act-msg', role: 'status' }, '큰 화면에 보이는 기호와 같은 버튼을 눌러요');
    const btns = SHAPES.map((s, i) => H('button', { type: 'button', class: 'ar-chase-symbtn', style: `--c:${s.color}`, 'aria-label': s.name },
      shapeSvg(i, 64), H('span', {}, s.name)));
    btns.forEach((b, i) => b.addEventListener('click', () => {
      if (st.sent) return; st.sent = true;
      btns.forEach((x, j) => { x.disabled = true; cls(x, 'picked', j === i); cls(x, 'dim', j !== i); });
      txt(msg, '보내는 중…'); snd('pop');
      act(send, 'symbol', i).then(r => {
        const res = r && r.result;
        txt(msg, (res && res.message) || '보냈어요!');
        if (res && res.correct === false) { snd('wrong'); cls(b, 'bad', true); } else { snd('levelup'); cls(b, 'good', true); }
      }).catch(() => { st.sent = false; btns.forEach(x => { x.disabled = false; cls(x, 'picked', false); cls(x, 'dim', false); }); txt(msg, '다시 골라 주세요'); });
    }));
    root.append(H('div', { class: 'ar-chase-act' }, H('h2', {}, '에너지 충전 완료!'), H('p', { class: 'ar-chase-act-big' }, '큰 화면의 기호를 골라요'), msg, H('div', { class: 'ar-chase-symgrid' }, btns), H('p', { class: 'ar-chase-act-hint' }, '기호는 5초마다 바뀌어요. 지금 보이는 기호를 골라야 부스트!'), gapMeter(st, theme)));
    st.sent = false;
    tickGap(st);
  }

  function player(theme) {
    return (root, v, send) => {
      if (!root) return;
      const a = v && v.actions;
      const ui = a && a.kind === 'boost' ? 'boost' : a && a.kind === 'symbol' ? 'symbol' : 'strip';
      const st = prep(root, `ar-chase-p-${theme}-${ui}`, ['ar-chase', 'ar-chase-player', 'ar-chase-' + theme, 'ar-chase-p-' + ui], (s, r) => {
        s.root = r; s.view = v;
        if (ui === 'boost') buildBoost(s, r, theme, send);
        else if (ui === 'symbol') buildSymbol(s, r, theme, send);
        else buildStrip(s, r, theme);
      });
      st.root = root; st.view = v;
      if (ui === 'strip') updateStrip(st, v);
    };
  }

  KQ.arena.robot = { host: host('robot'), player: player('robot') };
  KQ.arena.submarine = { host: host('sub'), player: player('sub') };
})();
