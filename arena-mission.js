/* 반짝퀴즈 로봇 경주: 단계별 협동 미니게임 (KQ.arena.robotMini)
   ZEP 처럼 위에서 내려다보는 지도에서 내 캐릭터를 자유롭게 움직여 반 전체가 미션을 해결한다.
   미션: cores(코어 모으기) / plates(스위치 발판) / deliver(부품 배달). 드론은 모두 같은 공식으로 움직인다.
   학생 기기가 자기 위치의 주인이고, 위치·줍기·배달·충돌은 응답을 기다리지 않는 send 로 보낸다. */
(() => {
  const KQ = window.KQ || (window.KQ = {});
  KQ.arena = KQ.arena || {};

  // ---------- 도우미 ----------
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
  const fx = (name, ...a) => { try { if (KQ.fx && typeof KQ.fx[name] === 'function') KQ.fx[name](...a); } catch {} };
  const hash = s => { s = str(s); let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
  const PAL = ['#e21b3c', '#1368ce', '#d89e00', '#26890c', '#864cbf', '#0aa3a3', '#ff7a00', '#e84393', '#4263eb', '#2f9e44'];
  const msOf = v => (v && v.modeState && typeof v.modeState === 'object') ? v.modeState : {};
  const miniOf = v => { const m = msOf(v).mini; return m && typeof m === 'object' ? m : null; };
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

  const STATE = new WeakMap(); let uidSeq = 0;
  function prep(root, key, classes, build) {
    const kit = KQ.modeKit;
    if (kit && kit.prep) return kit.prep(root, key, classes, build);
    let st = STATE.get(root);
    if (st && root.dataset.arKey === key) { st.first = false; return st; }
    if (st) { st.dead = true; cancelAnimationFrame(st.raf); st.timers.forEach(clearTimeout); }
    root.replaceChildren(); root.className = classes.join(' ');
    st = { key, timers: new Set(), raf: 0, first: true, uid: ++uidSeq, dead: false };
    build(st, root); STATE.set(root, st); root.dataset.arKey = key; return st;
  }
  function later(st, fn, ms) { const t = setTimeout(() => { st.timers.delete(t); if (!st.dead) { try { fn(); } catch {} } }, ms); st.timers.add(t); return t; }

  // ---------- 규칙 상수 (엔진과 같음) ----------
  const DRONE_R = 38, PLAYER_R = 26, HIT_D = 60, PICK_D = 55, SPEED = 330, WALL = 90;
  const THEMES = [
    { name: '로봇 공장 입구', floor: '#1d3b57', tile: '#264d6e', line: '#33658c', wall: '#132a40', accent: '#74c0fc' },
    { name: '부품 창고', floor: '#4a3524', tile: '#5a4130', line: '#6e5038', wall: '#2f2117', accent: '#ffa94d' },
    { name: '비밀 연구소', floor: '#0f4a4a', tile: '#145a5a', line: '#1c7070', wall: '#0a3333', accent: '#63e6be' },
    { name: '경비 구역', floor: '#35215a', tile: '#40296b', line: '#523685', wall: '#22143d', accent: '#b197fc' },
    { name: '발전소', floor: '#4f1d1d', tile: '#5e2424', line: '#742f2f', wall: '#331212', accent: '#ffd43b' },
    { name: '탈출선 격납고', floor: '#111a33', tile: '#17244a', line: '#22346a', wall: '#0a0f20', accent: '#ff8cf0' }
  ];
  const TYPE_INFO = {
    cores: { goalLbl: '코어', how: '빛나는 에너지 코어에 다가가면 저절로 주워요.' },
    plates: { goalLbl: '발판', how: '발판 위에 정해진 인원이 함께 서 있으면 켜져요.' },
    deliver: { goalLbl: '부품', how: '부품에 다가가 들고, 가운데 수리 기지로 가져가요.' }
  };
  const themeOf = stage => THEMES[clamp(Math.floor(num(stage, 1)) - 1, 0, THEMES.length - 1)];
  function dronePos(d, t) {
    if (d.kind === 'circle') { const a = num(d.w) * t + num(d.ph); return { x: num(d.cx) + num(d.r) * Math.cos(a), y: num(d.cy) + num(d.r) * Math.sin(a) }; }
    const per = Math.max(0.5, num(d.period, 7));
    const u = (((t / per + num(d.ph)) % 1) + 1) % 1; const k = u < 0.5 ? u * 2 : 2 - u * 2;
    return { x: num(d.ax) + (num(d.bx) - num(d.ax)) * k, y: num(d.ay) + (num(d.by) - num(d.ay)) * k };
  }
  const tSec = (m, t) => (t - num(m.startAt)) / 1000;
  const fmtS = ms => String(Math.max(0, Math.ceil(ms / 1000)));

  function avatarNode(p, size) {
    let n = null;
    if (p && p.avatar && KQ.avatar && typeof KQ.avatar.render === 'function') { try { n = KQ.avatar.render(p.avatar, size); } catch { n = null; } }
    if (!(n instanceof SVGElement)) {
      const ch = Array.from(str(p && p.nickname).trim())[0] || '?';
      n = S('svg', { viewBox: '0 0 64 64', width: size, height: size },
        S('circle', { cx: 32, cy: 32, r: 31, fill: PAL[hash(p && (p.id || p.nickname)) % PAL.length], stroke: '#fff', 'stroke-width': 3 }),
        S('text', { x: 32, y: 33, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 30, 'font-weight': 800, fill: '#fff', text: ch }));
    }
    n.removeAttribute('role'); n.setAttribute('aria-hidden', 'true');
    return n;
  }
  const place = (svg, x, y, w, h) => { svg.setAttribute('x', x); svg.setAttribute('y', y); svg.setAttribute('width', w); svg.setAttribute('height', h); return svg; };

  // ---------- 지도 그리기 ----------
  function coreShape() {
    return S('g', { class: 'ar-mis-bob' },
      S('circle', { r: 30, class: 'ar-mis-glow', fill: 'url(#GLOW)' }),
      S('polygon', { points: '0,-20 17,-10 17,10 0,20 -17,10 -17,-10', fill: '#38d9a9', stroke: '#e6fcf5', 'stroke-width': 3 }),
      S('polygon', { points: '0,-10 8,-5 8,5 0,10 -8,5 -8,-5', fill: '#e6fcf5', opacity: 0.85 }));
  }
  function gearPath(r1, r2, n) {
    let d = '';
    for (let i = 0; i < n * 2; i++) { const a = Math.PI * i / n; const r = i % 2 ? r2 : r1; const a1 = a - Math.PI / n / 2.4, a2 = a + Math.PI / n / 2.4; d += (i ? 'L' : 'M') + (r * Math.cos(a1)).toFixed(1) + ' ' + (r * Math.sin(a1)).toFixed(1) + 'L' + (r * Math.cos(a2)).toFixed(1) + ' ' + (r * Math.sin(a2)).toFixed(1); }
    return d + 'Z';
  }
  function partShape() {
    return S('g', { class: 'ar-mis-part' },
      S('circle', { r: 30, fill: 'url(#GLOWY)' }),
      S('rect', { x: -19, y: -19, width: 38, height: 38, rx: 7, fill: '#e67700', stroke: '#fff3bf', 'stroke-width': 3 }),
      S('path', { d: gearPath(13, 9, 8), fill: '#fff3bf' }), S('circle', { r: 4.5, fill: '#e67700' }));
  }
  function droneShape() {
    return S('g', { class: 'ar-mis-drone' },
      S('circle', { r: HIT_D, class: 'ar-mis-danger' }),
      S('ellipse', { cx: 0, cy: 34, rx: 30, ry: 8, fill: 'rgba(0,0,0,.3)' }),
      S('g', { class: 'ar-mis-drone-body' },
        S('ellipse', { cx: 0, cy: 0, rx: 38, ry: 22, fill: '#495057', stroke: '#212529', 'stroke-width': 3 }),
        S('ellipse', { cx: 0, cy: -6, rx: 26, ry: 12, fill: '#868e96' }),
        S('circle', { cx: 0, cy: 2, r: 9, fill: '#ff2d2d', class: 'ar-mis-eye' }),
        S('circle', { cx: 0, cy: 2, r: 4, fill: '#fff' }),
        S('line', { x1: -40, y1: -14, x2: -18, y2: -14, stroke: '#ced4da', 'stroke-width': 5, 'stroke-linecap': 'round', class: 'ar-mis-rotor' }),
        S('line', { x1: 18, y1: -14, x2: 40, y2: -14, stroke: '#ced4da', 'stroke-width': 5, 'stroke-linecap': 'round', class: 'ar-mis-rotor' })));
  }
  function buildWorld(st, m) {
    const th = themeOf(m.stage); const W = num(m.w, 1600), Ht = num(m.h, 900);
    st.W = W; st.Ht = Ht; st.th = th;
    const id = 'arm' + st.uid;
    const svg = S('svg', { class: 'ar-mis-world', viewBox: `0 0 ${W} ${Ht}`, preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true', focusable: 'false' });
    const defs = S('defs', {},
      S('radialGradient', { id: id + 'g' }, S('stop', { offset: 0, 'stop-color': '#96f2d7', 'stop-opacity': 0.9 }), S('stop', { offset: 1, 'stop-color': '#96f2d7', 'stop-opacity': 0 })),
      S('radialGradient', { id: id + 'y' }, S('stop', { offset: 0, 'stop-color': '#ffe066', 'stop-opacity': 0.85 }), S('stop', { offset: 1, 'stop-color': '#ffe066', 'stop-opacity': 0 })),
      S('pattern', { id: id + 't', width: 100, height: 100, patternUnits: 'userSpaceOnUse' },
        S('rect', { width: 100, height: 100, fill: th.floor }), S('rect', { x: 3, y: 3, width: 94, height: 94, rx: 8, fill: th.tile }),
        S('circle', { cx: 12, cy: 12, r: 3, fill: th.line }), S('circle', { cx: 88, cy: 88, r: 3, fill: th.line })),
      S('pattern', { id: id + 'w', width: 60, height: 60, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
        S('rect', { width: 60, height: 60, fill: th.wall }), S('rect', { width: 30, height: 60, fill: '#ffd43b', opacity: 0.18 })));
    svg.append(defs);
    svg.append(S('rect', { x: 0, y: 0, width: W, height: Ht, fill: `url(#${id}t)` }));
    // 위쪽 벽과 장식
    svg.append(S('rect', { x: 0, y: 0, width: W, height: WALL, fill: `url(#${id}w)` }), S('rect', { x: 0, y: WALL - 8, width: W, height: 8, fill: th.accent, opacity: 0.5 }));
    const r = rng(num(m.stage, 1) * 977 + 13);
    const deco = S('g', { class: 'ar-mis-deco', opacity: 0.85 });
    for (let i = 0; i < 9; i++) {
      const x = 60 + i * (W - 120) / 8 + (r() - 0.5) * 40;
      if (i % 3 === 0) deco.append(S('g', { transform: `translate(${x.toFixed(0)} 18)` }, S('rect', { x: -34, y: 0, width: 68, height: 54, rx: 6, fill: '#1b1b2f', stroke: th.accent, 'stroke-width': 3 }), S('rect', { x: -24, y: 10, width: 48, height: 20, rx: 3, fill: th.accent, opacity: 0.55, class: 'ar-mis-screen' })));
      else deco.append(S('g', { transform: `translate(${x.toFixed(0)} 30)` }, S('circle', { r: 16, fill: 'none', stroke: th.line, 'stroke-width': 6 }), S('circle', { r: 5, fill: th.accent })));
    }
    svg.append(deco);
    svg.append(S('rect', { x: 3, y: 3, width: W - 6, height: Ht - 6, rx: 18, fill: 'none', stroke: th.wall, 'stroke-width': 10 }));
    // 시작 지점 표시
    if (m.spawn) svg.append(S('circle', { cx: num(m.spawn.x), cy: num(m.spawn.y), r: 120, fill: 'none', stroke: '#fff', 'stroke-width': 3, 'stroke-dasharray': '10 12', opacity: 0.25 }));
    st.gPlates = S('g'); st.gBase = S('g'); st.gItems = S('g'); st.gGuide = S('g'); st.gPlayers = S('g'); st.gDrones = S('g'); st.gFx = S('g');
    svg.append(st.gPlates, st.gBase, st.gItems, st.gGuide, st.gPlayers, st.gDrones, st.gFx);
    st.glow = { g: id + 'g', y: id + 'y' };
    st.svg = svg; st.items = new Map(); st.plates = new Map(); st.drones = new Map(); st.ppl = new Map(); st.base = null;
    return svg;
  }
  function fixGlow(st, node) { node.querySelectorAll('[fill="url(#GLOW)"]').forEach(n => n.setAttribute('fill', `url(#${st.glow.g})`)); node.querySelectorAll('[fill="url(#GLOWY)"]').forEach(n => n.setAttribute('fill', `url(#${st.glow.y})`)); return node; }
  function floatText(st, x, y, text, kind) {
    const t = S('text', { x, y, class: 'ar-mis-float ' + (kind || ''), 'text-anchor': 'middle', text });
    st.gFx.append(t); later(st, () => t.remove(), 1600);
  }
  function ringBurst(st, x, y, color) {
    const c = S('circle', { cx: x, cy: y, r: 20, fill: 'none', stroke: color || '#fff', 'stroke-width': 6, class: 'ar-mis-ring' });
    st.gFx.append(c); later(st, () => c.remove(), 900);
  }

  // 미션 대상 갱신 (view 가 올 때마다)
  function syncObjects(st, m, meId) {
    const nameOf = id => { const p = arr(m.players).find(x => x.id === id); return p ? str(p.nickname) : ''; };
    // 아이템
    for (const it of arr(m.items)) {
      let e = st.items.get(it.id);
      if (!e) {
        const shape = fixGlow(st, m.type === 'deliver' ? partShape() : coreShape());
        const g = S('g', { class: 'ar-mis-item', transform: `translate(${num(it.x)} ${num(it.y)})` }, shape);
        st.gItems.append(g);
        e = { g, x: num(it.x), y: num(it.y), by: it.by, carrier: it.carrier, done: !!it.done, gone: false };
        st.items.set(it.id, e);
        if (it.by || it.done) { e.gone = true; g.style.display = 'none'; }
        continue;
      }
      e.carrier = it.carrier || null;
      if (m.type === 'cores' && it.by && !e.by) {
        e.by = it.by;
        if (!e.gone) { e.gone = true; replay(e.g, 'ar-mis-picked'); later(st, () => { e.g.style.display = 'none'; }, 450); }
        floatText(st, e.x, e.y - 34, `+1 ${str(it.by)}`, 'good'); ringBurst(st, e.x, e.y, '#63e6be');
        if (!st.isPlayer || !st.localPicked.has(it.id)) snd('coin');
      }
      if (m.type === 'deliver' && it.done && !e.done) {
        e.done = true; e.gone = true; e.g.style.display = 'none';
        const b = m.base || { x: 800, y: 480 };
        floatText(st, num(b.x), num(b.y) - 110, `${str(it.by)} 배달 완료!`, 'good'); ringBurst(st, num(b.x), num(b.y), '#ffd43b');
        snd('coin');
        if (st.baseParts) st.baseParts.append(fixGlow(st, S('g', { transform: `translate(${(-60 + (st.baseParts.childNodes.length % 6) * 24)} ${46 + Math.floor(st.baseParts.childNodes.length / 6) * 20}) scale(.45)` }, partShape())));
      }
      void nameOf; void meId;
    }
    // 수리 기지
    if (m.base && !st.base) {
      const b = m.base, R = num(b.r, 95), C = 2 * Math.PI * (R + 14);
      st.baseRing = S('circle', { r: R + 14, fill: 'none', stroke: '#ffd43b', 'stroke-width': 10, 'stroke-linecap': 'round', 'stroke-dasharray': C.toFixed(1), 'stroke-dashoffset': C.toFixed(1), transform: 'rotate(-90)' });
      st.baseC = C; st.baseParts = S('g');
      st.base = S('g', { class: 'ar-mis-base', transform: `translate(${num(b.x)} ${num(b.y)})` },
        S('circle', { r: R + 14, fill: 'none', stroke: 'rgba(255,255,255,.15)', 'stroke-width': 10 }), st.baseRing,
        S('circle', { r: R, fill: 'rgba(255,212,59,.16)', stroke: '#ffd43b', 'stroke-width': 4, 'stroke-dasharray': '14 10', class: 'ar-mis-spin' }),
        S('g', { transform: 'translate(0 -18)' },
          S('path', { d: 'M-46 18 Q0 -40 46 18 Z', fill: '#adb5bd', stroke: '#495057', 'stroke-width': 4 }),
          S('rect', { x: -52, y: 14, width: 104, height: 16, rx: 6, fill: '#495057' }),
          S('circle', { cx: 0, cy: -2, r: 12, fill: '#74c0fc', stroke: '#fff', 'stroke-width': 3 })),
        st.baseParts,
        S('text', { y: R + 46, 'text-anchor': 'middle', class: 'ar-mis-label', text: '수리 기지' }));
      st.gBase.append(st.base);
    }
    if (st.baseRing) st.baseRing.setAttribute('stroke-dashoffset', (st.baseC * (1 - clamp(num(m.progress) / Math.max(1, num(m.goal)), 0, 1))).toFixed(1));
    // 발판
    for (const pl of arr(m.plates)) {
      let e = st.plates.get(pl.id);
      const R = num(pl.r, 75);
      if (!e) {
        const C = 2 * Math.PI * (R - 8);
        const ring = S('circle', { r: R - 8, fill: 'none', stroke: '#fff', 'stroke-width': 10, 'stroke-linecap': 'round', 'stroke-dasharray': C.toFixed(1), 'stroke-dashoffset': C.toFixed(1), transform: 'rotate(-90)' });
        const label = S('text', { y: R + 32, 'text-anchor': 'middle', class: 'ar-mis-plate-n', text: '' });
        const g = S('g', { class: 'ar-mis-plate', transform: `translate(${num(pl.x)} ${num(pl.y)})` },
          S('circle', { r: R, class: 'ar-mis-plate-pad' }), S('circle', { r: R - 20, class: 'ar-mis-plate-in' }), ring, label);
        st.gPlates.append(g);
        e = { g, ring, label, C, x: num(pl.x), y: num(pl.y), r: R, done: false, holdFrom: null, need: num(pl.need, 1), on: 0 };
        st.plates.set(pl.id, e);
      }
      e.need = num(pl.need, 1); e.on = num(pl.on); e.holdFrom = pl.holdFrom ? num(pl.holdFrom) : null;
      if (pl.done && !e.done) {
        e.done = true; cls(e.g, 'done', true); ringBurst(st, e.x, e.y, '#51cf66');
        if (!st.first) { floatText(st, e.x, e.y - R - 12, '발판 켜짐!', 'good'); snd('levelup'); }
      }
      cls(e.g, 'some', !e.done && e.on > 0 && e.on < e.need);
      cls(e.g, 'hold', !e.done && !!e.holdFrom);
      txt(e.label, e.done ? '켜짐' : `${Math.min(e.on, e.need)} / ${e.need}명`);
    }
    // 드론
    for (const d of arr(m.drones)) {
      if (st.drones.has(d.id)) continue;
      const g = S('g', { class: 'ar-mis-dronewrap' }, droneShape());
      st.gDrones.append(g); st.drones.set(d.id, { g, d, x: 0, y: 0 });
    }
  }

  // 캐릭터 갱신
  function syncPlayers(st, m, meId) {
    const seen = new Set();
    for (const p of arr(m.players)) {
      seen.add(p.id);
      let e = st.ppl.get(p.id);
      if (!e) {
        const isMe = p.id === meId;
        const tag = S('text', { y: 52, 'text-anchor': 'middle', class: 'ar-mis-name' + (isMe ? ' me' : ''), text: isMe ? '나' : str(p.nickname) });
        const carry = fixGlow(st, S('g', { class: 'ar-mis-carry', transform: 'translate(0 -48) scale(.62)', style: 'display:none' }, partShape()));
        const stun = S('g', { class: 'ar-mis-stun', style: 'display:none' }, [0, 1, 2].map(i => S('polygon', { points: '0,-7 2,-2 7,-2 3,1 5,7 0,3 -5,7 -3,1 -7,-2 -2,-2', fill: '#ffd43b', transform: `translate(${-20 + i * 20} -40)` })));
        const g = S('g', { class: 'ar-mis-player' + (isMe ? ' me' : '') },
          S('ellipse', { cx: 0, cy: 26, rx: 24, ry: 7, fill: 'rgba(0,0,0,.35)' }),
          isMe ? S('circle', { r: 33, class: 'ar-mis-me-ring' }) : null,
          S('g', { class: 'ar-mis-av' }, place(avatarNode(p, 52), -26, -26, 52, 52)),
          tag, carry, stun);
        (isMe ? st.gPlayers : st.gPlayers).append(g);
        e = { g, carry, stun, x: num(p.x), y: num(p.y), tx: num(p.x), ty: num(p.y), isMe };
        st.ppl.set(p.id, e);
      }
      e.tx = num(p.x); e.ty = num(p.y); e.carryId = p.carry || null; e.stunUntil = p.stun ? num(p.stun) : 0;
    }
    for (const [id, e] of st.ppl) if (!seen.has(id)) { e.g.remove(); st.ppl.delete(id); }
    // 내 캐릭터는 맨 위
    const me = st.ppl.get(meId); if (me && me.g.parentNode && me.g !== st.gPlayers.lastChild) st.gPlayers.append(me.g);
  }

  // ---------- 상단 HUD + 덮개 ----------
  function buildHud(st, root, m, isPlayer) {
    const th = themeOf(m.stage);
    st.hTime = H('b', { class: 'ar-mis-time' }, '');
    st.hProg = H('b', {}, '');
    st.hFill = H('i');
    st.hud = H('div', { class: 'ar-mis-hud' },
      H('div', { class: 'ar-mis-hud-l' }, H('span', { class: 'ar-mis-stage' }, `${num(m.stage, 1)}단계 / 6`), H('b', { class: 'ar-mis-title' }, str(m.title)), isPlayer ? null : H('span', { class: 'ar-mis-place' }, th.name)),
      H('div', { class: 'ar-mis-hud-c' }, H('span', {}, (TYPE_INFO[m.type] || {}).goalLbl || '미션'), st.hProg, H('div', { class: 'ar-mis-bar' }, st.hFill)),
      H('div', { class: 'ar-mis-hud-r' }, H('span', {}, '남은 시간'), st.hTime));
    root.append(st.hud);
    // 준비 덮개
    st.cdNum = H('b', { class: 'ar-mis-cd-num' }, '');
    st.ready = H('div', { class: 'ar-mis-ready' },
      H('div', { class: 'ar-mis-ready-card' },
        H('span', { class: 'ar-mis-ready-stage' }, `${num(m.stage, 1)}단계 협동 미션`),
        H('b', { class: 'ar-mis-ready-title' }, str(m.title)),
        H('p', {}, str(m.desc)),
        H('p', { class: 'ar-mis-ready-how' }, (TYPE_INFO[m.type] || {}).how || ''),
        arr(m.drones).length ? H('p', { class: 'ar-mis-ready-warn' }, `경비 드론 ${arr(m.drones).length}대! 닿으면 잠깐 멈춰요.`) : null,
        isPlayer ? H('p', { class: 'ar-mis-ready-keys' }, '방향키 또는 W A S D 로 이동 · 화면을 끌어도 움직여요') : null,
        st.cdNum));
    root.append(st.ready);
    // 결과 덮개
    st.resT = H('b', {}, ''); st.resS = H('span', {}, ''); st.resN = H('small', {}, '');
    st.res = H('div', { class: 'ar-mis-res', hidden: true }, H('div', { class: 'ar-mis-res-card' }, st.resT, st.resS, st.resN));
    root.append(st.res);
    st.lastCd = null; st.shownStatus = null;
  }
  function updateHud(st, m, t) {
    const goal = Math.max(1, num(m.goal)), prog = clamp(num(m.progress), 0, goal);
    txt(st.hProg, `${prog} / ${goal}`);
    st.hFill.style.transform = `scaleX(${(prog / goal).toFixed(3)})`;
    const playing = m.status === 'playing' || (m.status === 'ready' && t >= num(m.startAt));
    const left = m.status === 'ready' && t < num(m.startAt) ? num(m.endAt) - num(m.startAt) : num(m.endAt) - t;
    txt(st.hTime, m.status === 'success' ? '성공' : m.status === 'fail' ? '끝' : fmtS(left) + '초');
    cls(st.hTime, 'hurry', playing && left < 10000 && left > 0);
    // 카운트다운
    const ready = m.status === 'ready' && t < num(m.startAt);
    st.ready.hidden = !ready;
    if (ready) {
      const n = Math.max(1, Math.ceil((num(m.startAt) - t) / 1000));
      if (n !== st.lastCd) { st.lastCd = n; txt(st.cdNum, String(n)); replay(st.cdNum, 'ar-mis-pop'); snd('countdown'); }
    } else if (st.lastCd !== null && st.lastCd !== 0) { st.lastCd = 0; snd('whoosh'); }
    // 결과
    const done = m.status === 'success' || m.status === 'fail';
    if (done && st.shownStatus !== m.status) {
      st.shownStatus = m.status;
      const ok = m.status === 'success', last = num(m.stage) >= 6;
      txt(st.resT, ok ? (last ? '완전 탈출 성공!' : '미션 성공!') : '미션 실패…');
      txt(st.resS, ok ? '로봇을 15초 뒤로 밀어냈어요!' : '로봇이 10초 가까워졌어요');
      txt(st.resN, ok ? (last ? '마지막 미션까지 모두 해냈어요. 최고의 팀워크!' : `곧 ${num(m.stage) + 1}단계 추격이 시작돼요. 로봇이 더 빨라져요!`) : `곧 ${Math.min(6, num(m.stage) + 1)}단계 추격이 시작돼요. 부스트로 만회해요!`);
      cls(st.res, 'good', ok); cls(st.res, 'bad', !ok);
      st.res.hidden = false; replay(st.res, 'ar-mis-in');
      if (ok) { snd('cheer'); fx('confetti', { count: st.isPlayer ? 90 : 170, power: 1.1 }); } else { snd('wrong'); fx('shake', st.root); }
    }
    if (!done) st.res.hidden = true;
  }

  // ---------- 매 프레임 ----------
  function frame(st, t, dt) {
    const m = st.m; if (!m) return;
    const ts = tSec(m, t);
    const live = m.status === 'playing' || (m.status === 'ready' && t >= num(m.startAt) && t < num(m.endAt));
    // 드론
    for (const e of st.drones.values()) {
      const p = dronePos(e.d, ts); e.x = p.x; e.y = p.y;
      e.g.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
    }
    // 내 이동 (학생)
    if (st.isPlayer && st.me) moveMe(st, t, dt, live);
    // 다른 캐릭터 보간
    const k = Math.min(1, dt * 5);
    for (const [id, e] of st.ppl) {
      if (st.isPlayer && id === st.meId && st.me) { e.x = st.me.x; e.y = st.me.y; }
      else { e.x += (e.tx - e.x) * k; e.y += (e.ty - e.y) * k; }
      e.g.setAttribute('transform', `translate(${e.x.toFixed(1)} ${e.y.toFixed(1)})`);
      const carrying = st.isPlayer && id === st.meId ? !!st.localCarry : !!e.carryId;
      e.carry.style.display = carrying ? '' : 'none';
      const stunned = st.isPlayer && id === st.meId ? t < st.stunUntil : e.stunUntil > t;
      e.stun.style.display = stunned ? '' : 'none';
      cls(e.g, 'stunned', stunned);
    }
    // 들려 있는 부품은 숨김(머리 위에 그림)
    if (m.type === 'deliver') for (const [id, e] of st.items) {
      if (e.gone) continue;
      const mine = st.isPlayer && st.localCarry === id;
      e.g.style.display = (e.carrier || mine) ? 'none' : '';
    }
    // 발판 진행 링
    for (const e of st.plates.values()) {
      const pr = e.done ? 1 : e.holdFrom ? clamp((t - e.holdFrom) / Math.max(500, num(m.hold, 3000)), 0, 1) : 0;
      e.ring.setAttribute('stroke-dashoffset', (e.C * (1 - pr)).toFixed(1));
    }
    if (t - (st.hudAt || 0) > 120) { st.hudAt = t; updateHud(st, m, t); }
    if (st.isPlayer) { camera(st); guide(st, live); if (st.tip) txt(st.tip, t < st.stunUntil ? '드론에 부딪혔어요! 잠깐 멈춰요' : m.type === 'deliver' ? (st.localCarry ? '부품을 들었어요! 노란 화살표를 따라 수리 기지로!' : '주황색 부품에 다가가 들어요') : m.type === 'plates' ? '파란 발판 위에 서서 친구를 기다려요' : '초록 코어에 다가가면 저절로 주워요'); if (t - (st.mapAt || 0) > 250) { st.mapAt = t; minimap(st); } }
  }

  // ---------- 학생: 이동·충돌·줍기 ----------
  const KEYS = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] };
  function inputVec(st) {
    let x = 0, y = 0;
    for (const c of st.keys) { const k = KEYS[c]; if (k) { x += k[0]; y += k[1]; } }
    if (st.joy && st.joy.on) { x += st.joy.vx; y += st.joy.vy; }
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }
  function moveMe(st, t, dt, live) {
    const me = st.me, m = st.m;
    const stunned = t < st.stunUntil;
    const v = stunned ? { x: 0, y: 0 } : inputVec(st);
    const moving = Math.hypot(v.x, v.y) > 0.05;
    if (moving) {
      me.x = clamp(me.x + v.x * SPEED * dt, PLAYER_R + 6, st.W - PLAYER_R - 6);
      me.y = clamp(me.y + v.y * SPEED * dt, WALL + PLAYER_R, st.Ht - PLAYER_R - 6);
      st.lastMoveAt = t;
      if (v.x) st.face = v.x > 0 ? 1 : -1;
    }
    // 위치 전송: 움직이는 동안 1초에 한 번, 멈추면 한 번
    const diff = Math.hypot(me.x - st.sentX, me.y - st.sentY);
    if (diff > 3 && ((moving && t - st.sentAt >= 1000) || (!moving && t - st.lastMoveAt > 160 && t - st.sentAt >= 250))) {
      st.sentX = me.x; st.sentY = me.y; st.sentAt = t;
      fire(st, 'move', { x: Math.round(me.x), y: Math.round(me.y) });
    }
    if (!live) return;
    // 드론 충돌
    if (t > st.stunUntil + 900) {
      for (const e of st.drones.values()) {
        if (Math.hypot(e.x - me.x, e.y - me.y) < HIT_D) {
          st.stunUntil = t + 1500; fire(st, 'mhit');
          if (st.localCarry) { floatText(st, me.x, me.y - 82, '부품이 제자리로 돌아갔어요', 'bad'); st.localCarry = null; st.carryAt = 0; }
          snd('boom'); replay(st.stage, 'ar-mis-hitflash'); try { navigator.vibrate && navigator.vibrate([60, 40, 60]); } catch {}
          floatText(st, me.x, me.y - 50, '드론 충돌! 잠깐 멈춤', 'bad');
          break;
        }
      }
    }
    if (t < st.stunUntil) return;
    // 줍기·배달
    if (m.type === 'cores') {
      for (const [id, e] of st.items) {
        if (e.gone || st.localPicked.has(id)) continue;
        if (Math.hypot(e.x - me.x, e.y - me.y) < PICK_D) {
          st.localPicked.add(id); e.gone = true; replay(e.g, 'ar-mis-picked'); later(st, () => { e.g.style.display = 'none'; }, 450);
          fire(st, 'pick', id); snd('coin'); ringBurst(st, e.x, e.y, '#63e6be'); floatText(st, e.x, e.y - 34, '+1', 'good');
        }
      }
    } else if (m.type === 'deliver') {
      if (!st.localCarry) {
        for (const [id, e] of st.items) {
          if (e.gone || e.carrier || st.localPicked.has(id)) continue;
          if (Math.hypot(e.x - me.x, e.y - me.y) < PICK_D) { st.localCarry = id; st.carryAt = t; fire(st, 'pick', id); snd('pop'); floatText(st, me.x, me.y - 60, '부품을 들었어요!', 'good'); break; }
        }
      } else if (m.base && Math.hypot(num(m.base.x) - me.x, num(m.base.y) - me.y) < num(m.base.r, 95)) {
        const id = st.localCarry; st.localCarry = null; st.localPicked.add(id);
        const e = st.items.get(id); if (e) { e.gone = true; e.g.style.display = 'none'; }
        fire(st, 'deliver'); snd('levelup'); ringBurst(st, num(m.base.x), num(m.base.y), '#ffd43b');
      }
    }
  }
  function fire(st, kind, target) {
    try { const p = st.send && st.send(kind, target); if (p && typeof p.catch === 'function') p.catch(() => {}); } catch {}
  }
  function camera(st) {
    const w = st.stage.clientWidth || 400, h = st.stage.clientHeight || 600;
    const VW = Math.min(st.W, w < 600 ? 700 : 950), VH = VW * h / Math.max(1, w);
    const me = st.me || { x: st.W / 2, y: st.Ht / 2 };
    const cx = VW >= st.W ? st.W / 2 : clamp(me.x, VW / 2, st.W - VW / 2);
    const cy = VH >= st.Ht ? st.Ht / 2 : clamp(me.y, VH / 2, st.Ht - VH / 2);
    const vb = `${(cx - VW / 2).toFixed(1)} ${(cy - VH / 2).toFixed(1)} ${VW.toFixed(1)} ${VH.toFixed(1)}`;
    if (vb !== st.vb) { st.vb = vb; st.svg.setAttribute('viewBox', vb); }
  }
  // 가까운 목표를 가리키는 화살표
  function guide(st, live) {
    const me = st.me, m = st.m; if (!me) return;
    let tx = null, ty = null, best = Infinity;
    if (live) {
      if (m.type === 'deliver' && st.localCarry && m.base) { tx = num(m.base.x); ty = num(m.base.y); }
      else if (m.type === 'plates') { for (const e of st.plates.values()) if (!e.done) { const d = Math.hypot(e.x - me.x, e.y - me.y); if (d < best) { best = d; tx = e.x; ty = e.y; } } if (best < 60) tx = null; }
      else for (const [id, e] of st.items) { if (e.gone || e.carrier || st.localPicked.has(id)) continue; const d = Math.hypot(e.x - me.x, e.y - me.y); if (d < best) { best = d; tx = e.x; ty = e.y; } }
    }
    if (tx === null) { st.arrow.style.display = 'none'; return; }
    const a = Math.atan2(ty - me.y, tx - me.x);
    st.arrow.style.display = '';
    st.arrow.setAttribute('transform', `translate(${(me.x + Math.cos(a) * 62).toFixed(1)} ${(me.y + Math.sin(a) * 62).toFixed(1)}) rotate(${(a * 180 / Math.PI).toFixed(1)})`);
  }
  function buildMinimap(st) {
    const W = st.W, Ht = st.Ht;
    st.mm = S('svg', { viewBox: `0 0 ${W} ${Ht}`, class: 'ar-mis-mm', 'aria-hidden': 'true' }, S('rect', { width: W, height: Ht, rx: 40, fill: 'rgba(10,10,30,.7)', stroke: '#fff', 'stroke-width': 14 }));
    st.mmG = S('g'); st.mmView = S('rect', { fill: 'none', stroke: '#ffd43b', 'stroke-width': 14, rx: 20 }); st.mm.append(st.mmG, st.mmView);
    return st.mm;
  }
  function minimap(st) {
    if (!st.mmG) return; const m = st.m; const kids = [];
    if (m.base) kids.push(S('circle', { cx: num(m.base.x), cy: num(m.base.y), r: 70, fill: '#ffd43b', opacity: 0.6 }));
    for (const e of st.plates.values()) kids.push(S('circle', { cx: e.x, cy: e.y, r: 55, fill: e.done ? '#51cf66' : '#74c0fc', opacity: 0.8 }));
    for (const [id, e] of st.items) if (!e.gone && !e.carrier && !(st.localCarry === id)) kids.push(S('circle', { cx: e.x, cy: e.y, r: 30, fill: m.type === 'deliver' ? '#ff922b' : '#38d9a9' }));
    for (const e of st.drones.values()) kids.push(S('circle', { cx: e.x, cy: e.y, r: 34, fill: '#ff4d4d' }));
    for (const [id, e] of st.ppl) if (id !== st.meId) kids.push(S('circle', { cx: e.x, cy: e.y, r: 26, fill: '#fff', opacity: 0.85 }));
    if (st.me) kids.push(S('circle', { cx: st.me.x, cy: st.me.y, r: 42, fill: '#ffd43b', stroke: '#3b1d72', 'stroke-width': 10 }));
    st.mmG.replaceChildren(...kids);
    const vb = (st.vb || '').split(' ').map(Number); if (vb.length === 4) setA(st.mmView, { x: vb[0], y: vb[1], width: vb[2], height: vb[3] });
  }
  function bindInput(st, root) {
    st.keys = new Set();
    const typing = e => { const tg = e.target; return tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable); };
    const kd = e => { if (st.dead) return cleanup(); if (typing(e) || !KEYS[e.code]) return; st.keys.add(e.code); e.preventDefault(); };
    const ku = e => { if (st.dead) return cleanup(); st.keys.delete(e.code); };
    const blur = () => st.keys.clear();
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku); window.addEventListener('blur', blur);
    const cleanup = () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('blur', blur); };
    st.cleanup = cleanup;
    // 끌어서 움직이는 조이스틱
    const base = H('div', { class: 'ar-mis-joy', hidden: true }, H('i'));
    st.stage.append(base);
    st.joy = { on: false, vx: 0, vy: 0, id: null, ox: 0, oy: 0 };
    const RAD = 56;
    st.stage.addEventListener('pointerdown', e => {
      if (st.joy.on || (e.button !== undefined && e.button > 0)) return;
      const r = st.stage.getBoundingClientRect();
      st.joy = { on: true, vx: 0, vy: 0, id: e.pointerId, ox: e.clientX, oy: e.clientY };
      base.style.left = (e.clientX - r.left) + 'px'; base.style.top = (e.clientY - r.top) + 'px'; base.hidden = false; base.firstChild.style.transform = 'translate(-50%,-50%)';
      try { st.stage.setPointerCapture(e.pointerId); } catch {}
      e.preventDefault();
    });
    st.stage.addEventListener('pointermove', e => {
      if (!st.joy.on || e.pointerId !== st.joy.id) return;
      let dx = e.clientX - st.joy.ox, dy = e.clientY - st.joy.oy; const l = Math.hypot(dx, dy);
      if (l > RAD) { dx = dx / l * RAD; dy = dy / l * RAD; }
      st.joy.vx = dx / RAD; st.joy.vy = dy / RAD;
      if (Math.hypot(st.joy.vx, st.joy.vy) < 0.18) { st.joy.vx = 0; st.joy.vy = 0; }
      base.firstChild.style.transform = `translate(calc(-50% + ${dx.toFixed(0)}px), calc(-50% + ${dy.toFixed(0)}px))`;
    });
    const end = e => { if (e.pointerId !== st.joy.id) return; st.joy = { on: false, vx: 0, vy: 0, id: null }; base.hidden = true; };
    st.stage.addEventListener('pointerup', end); st.stage.addEventListener('pointercancel', end);
  }

  function startLoop(st) {
    let last = performance.now();
    const loop = () => {
      if (st.dead) { try { st.cleanup && st.cleanup(); } catch {} return; }
      st.raf = requestAnimationFrame(loop);
      const p = performance.now(); const dt = Math.min(0.1, (p - last) / 1000); last = p;
      try { frame(st, now(), dt); } catch (e) { if (!st.warned) { st.warned = true; console.warn('[반짝퀴즈 미니게임]', e); } }
    };
    st.raf = requestAnimationFrame(loop);
  }

  // ---------- 진행자 ----------
  function host(root, v) {
    if (!root) return;
    const m = miniOf(v); if (!m) return;
    const key = `ar-mis-h-${num(m.stage)}-${str(m.type)}-${num(m.startAt)}`;
    const st = prep(root, key, ['ar-mis', 'ar-mis-host', 'ar-mis-t-' + str(m.type)], (s, r) => {
      s.root = r; s.isPlayer = false; s.m = m;
      s.stage = H('div', { class: 'ar-mis-stagebox' });
      s.stage.append(buildWorld(s, m));
      r.append(s.stage);
      buildHud(s, r, m, false);
      s.cast = H('div', { class: 'ar-mis-cast' }); r.append(s.cast);
      s.castKey = '';
      startLoop(s);
    });
    st.m = m; st.root = root;
    syncObjects(st, m, null); syncPlayers(st, m, null);
    // 아래쪽: 참가 인원 요약
    const ppl = arr(m.players); const k = ppl.length + '|' + num(m.progress);
    if (k !== st.castKey) { st.castKey = k; txt(st.cast, `우리 반 ${ppl.length}명이 함께 미션 중 · ${(TYPE_INFO[m.type] || {}).how || ''}`); }
  }

  // ---------- 학생 ----------
  function player(root, v, send) {
    if (!root) return;
    const m = miniOf(v);
    const meId = v && v.me ? v.me.id : null;
    if (!m || !v || v.phase !== 'running') {
      const st0 = prep(root, 'ar-mis-p-off', ['ar-mis', 'ar-mis-poff'], (s, r) => { s.t = H('div', { class: 'ar-mis-offstrip' }, ''); r.append(s.t); });
      txt(st0.t, m ? `${num(m.stage)}단계 미션: ${str(m.title)} · ${num(m.progress)} / ${num(m.goal)}` : '미니게임이 끝났어요');
      return;
    }
    const key = `ar-mis-p-${num(m.stage)}-${str(m.type)}-${num(m.startAt)}`;
    const st = prep(root, key, ['ar-mis', 'ar-mis-player', 'ar-mis-t-' + str(m.type)], (s, r) => {
      s.root = r; s.isPlayer = true; s.m = m; s.send = send; s.meId = meId;
      s.localPicked = new Set(); s.localCarry = null; s.carryAt = 0; s.stunUntil = 0; s.lastMoveAt = 0;
      const mine = arr(m.players).find(p => p.id === meId);
      const sp = mine || m.spawn || { x: 800, y: 480 };
      s.me = meId ? { x: num(sp.x, 800), y: num(sp.y, 480) } : null;
      s.sentX = s.me ? s.me.x : 0; s.sentY = s.me ? s.me.y : 0; s.sentAt = 0;
      s.stage = H('div', { class: 'ar-mis-stagebox', tabindex: '0', 'aria-label': '미니게임 지도. 방향키나 W A S D 로 내 캐릭터를 움직여요.' });
      s.stage.append(buildWorld(s, m));
      s.arrow = S('g', { class: 'ar-mis-arrow', style: 'display:none' }, S('polygon', { points: '14,0 -8,-11 -3,0 -8,11', fill: '#ffd43b', stroke: '#3b1d72', 'stroke-width': 3 }));
      s.gGuide.append(s.arrow);
      r.append(s.stage);
      buildHud(s, r, m, true);
      s.stage.append(H('div', { class: 'ar-mis-keys', 'aria-hidden': 'true' }, H('b', {}, '이동'), H('span', {}, '방향키 · WASD'), H('span', {}, '화면 끌기')));
      s.stage.append(buildMinimap(s));
      s.tip = H('div', { class: 'ar-mis-tip', role: 'status' }, ''); s.stage.append(s.tip);
      bindInput(s, r);
      startLoop(s);
      later(s, () => { try { s.stage.focus({ preventScroll: true }); } catch {} }, 60);
    });
    st.m = m; st.send = send; st.root = root;
    syncObjects(st, m, meId); syncPlayers(st, m, meId);
    // 서버와 맞추기: 다른 친구가 먼저 든 부품이면 내려놓기, 서버가 내가 든 것으로 알면 들고 있기
    if (m.type === 'deliver') {
      const t = now();
      if (st.localCarry) { const it = arr(m.items).find(x => x.id === st.localCarry); if (it && ((it.carrier && it.carrier !== meId) || it.done) && t - st.carryAt > 2500) { st.localCarry = null; floatText(st, st.me.x, st.me.y - 60, '친구가 먼저 들었어요', 'bad'); } }
      else { const it = arr(m.items).find(x => x.carrier === meId && !x.done); if (it && t > st.stunUntil && !st.localPicked.has(it.id)) { st.localCarry = it.id; st.carryAt = t; } }
    }
  }

  KQ.arena.robotMini = { host, player };
})();
