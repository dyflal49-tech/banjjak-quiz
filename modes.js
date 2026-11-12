'use strict';
/* 반짝퀴즈 게임 모드: 메타데이터 + 진행자 무대 그래픽 + 학생 미니 패널
   - renderHost/renderPlayer 는 같은 root 에 반복 호출됨. 최초 1회 골격(root.dataset.mdInit) 후 바뀐 값만 갱신.
   - 사용자 문자열은 textContent 만 사용. 예외를 밖으로 던지지 않음. */
(() => {
  const KQ = window.KQ || (window.KQ = {});
  const SVGNS = 'http://www.w3.org/2000/svg';
  const STATE = new WeakMap();
  let uidSeq = 0;

  // ---------- 기본 도우미 ----------
  function setAttrs(n, a, svg) {
    for (const [k, v] of Object.entries(a || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') n.setAttribute('class', v);
      else if (k === 'text') n.textContent = v;
      else if (k === 'style' && typeof v === 'object') { for (const [p, val] of Object.entries(v)) n.style.setProperty(p.startsWith('--') ? p : p.replace(/[A-Z]/g, m => '-' + m.toLowerCase()), String(val)); }
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
      else if (!svg && k === 'disabled') n.disabled = !!v;
      else n.setAttribute(k, v === true ? '' : String(v));
    }
  }
  function addKids(n, kids) { for (const c of kids.flat(Infinity)) if (c !== null && c !== undefined && c !== false) n.append(c instanceof Node ? c : document.createTextNode(String(c))); }
  const H = (t, a, ...k) => { const n = document.createElement(t); setAttrs(n, a, false); addKids(n, k); return n; };
  const S = (t, a, ...k) => { const n = document.createElementNS(SVGNS, t); setAttrs(n, a, true); addKids(n, k); return n; };
  const svgBox = (vb, cls, ...kids) => S('svg', { viewBox: vb, class: cls, 'aria-hidden': 'true', focusable: 'false' }, ...kids);
  const nest = (svg, x, y, w, h) => { svg.setAttribute('x', x); svg.setAttribute('y', y); svg.setAttribute('width', w); svg.setAttribute('height', h); return svg; };

  const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const str = v => (v === null || v === undefined) ? '' : String(v);
  const arr = a => Array.isArray(a) ? a : [];
  const txt = (n, s) => { if (!n) return; s = str(s); if (n.textContent !== s) n.textContent = s; };
  const css = (n, p, v) => { if (!n) return; v = String(v); if (n.style.getPropertyValue(p) !== v) n.style.setProperty(p, v); };
  const cls = (n, c, on) => { if (n) n.classList.toggle(c, !!on); };
  const show = (n, on) => { if (n) n.toggleAttribute('hidden', !on); };
  const attr = (n, k, v) => { if (n && n.getAttribute(k) !== String(v)) n.setAttribute(k, String(v)); };
  const replay = (n, c) => { if (!n) return; n.classList.remove(c); void n.getBoundingClientRect(); n.classList.add(c); };
  const nowMs = () => { try { return KQ.now ? KQ.now() : Date.now(); } catch { return Date.now(); } };
  const reducedMotion = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
  const nameCmp = (a, b) => str(a && a.nickname).localeCompare(str(b && b.nickname), 'ko');
  const finRank = x => { const r = num(x && x.finishedRank, 0); return r > 0 ? r : Infinity; };
  const byFinishThen = key => (a, b) => { const fa = finRank(a), fb = finRank(b); if (fa !== fb) return fa < fb ? -1 : 1; return (num(b[key]) - num(a[key])) || nameCmp(a, b); };

  const TEAM_COLORS = ['#e21b3c', '#1368ce', '#d89e00', '#26890c'];
  const TEAM_NAMES = ['빨강 팀', '파랑 팀', '노랑 팀', '초록 팀'];
  const PALETTE = ['#e21b3c', '#1368ce', '#d89e00', '#26890c', '#864cbf', '#0aa3a3', '#ff7a00', '#e84393', '#4263eb', '#2f9e44', '#f08c00', '#7048e8'];
  const MEDAL = ['#f5c518', '#c3cbd6', '#d08a4a'];
  const safeColor = c => (typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c)) ? c : null;
  const hash = s => { s = str(s); let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
  const colorFor = id => PALETTE[hash(id) % PALETTE.length];
  function shade(hex, f) {
    let h = (safeColor(hex) || '#888888').slice(1);
    if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map(x => x + x).join('');
    h = h.slice(0, 6); const n = parseInt(h, 16); let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const t = f < 0 ? 0 : 255, p = Math.abs(f);
    r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  const ms = v => (v && v.modeState && typeof v.modeState === 'object') ? v.modeState : {};
  const meOf = v => (v && v.me && typeof v.me === 'object') ? v.me : null;
  function teamsOf(v) {
    const s = ms(v);
    let src = arr(s.teams).length ? arr(s.teams) : arr(v && v.teams);
    if (!src.length) { const n = clamp(Math.floor(num(v && v.options && v.options.teamCount, 4)), 2, 4); src = Array.from({ length: n }, (_, i) => ({ index: i })); }
    return src.filter(t => t && typeof t === 'object').map((t, i) => {
      const idx = Number.isInteger(t.index) ? t.index : i;
      return Object.assign({}, t, { index: idx, name: str(t.name) || TEAM_NAMES[idx] || `${idx + 1}팀`, color: safeColor(t.color) || TEAM_COLORS[idx] || '#888888' });
    });
  }
  const teamColor = (i, teams) => { const t = arr(teams).find(x => x.index === i); return (t && t.color) || TEAM_COLORS[i] || '#888888'; };
  const teamName = (i, teams) => { const t = arr(teams).find(x => x.index === i); return (t && t.name) || TEAM_NAMES[i] || '팀'; };

  // ---------- 상태 보존/정리 ----------
  function prep(root, key, classes, build) {
    let st = STATE.get(root);
    if (st && root.dataset.mdInit === key) { st.first = false; return st; }
    teardown(root);
    root.replaceChildren();
    root.dataset.mdCls = classes.join(' ');
    root.classList.add('md-root', ...classes);
    st = { key, timers: new Set(), raf: 0, first: true, uid: ++uidSeq, dead: false };
    build(st, root);
    STATE.set(root, st);
    root.dataset.mdInit = key;
    return st;
  }
  function teardown(root) {
    const st = STATE.get(root);
    if (st) { st.dead = true; try { cancelAnimationFrame(st.raf); } catch {} st.timers.forEach(t => clearTimeout(t)); st.timers.clear(); }
    STATE.delete(root);
    const c = root.dataset.mdCls; if (c) root.classList.remove(...c.split(' ').filter(Boolean));
    root.classList.remove('md-root');
    delete root.dataset.mdInit; delete root.dataset.mdCls;
  }
  function dispose(root) { try { if (!root) return; teardown(root); root.replaceChildren(); } catch {} }
  function later(st, fn, ms2) { const t = setTimeout(() => { st.timers.delete(t); if (!st.dead) { try { fn(); } catch {} } }, ms2); st.timers.add(t); return t; }

  function act(send, kind, target) {
    let p;
    try { p = typeof send === 'function' ? send(kind, target) : Promise.reject(new Error('지금은 보낼 수 없어요.')); } catch (e) { p = Promise.reject(e); }
    return Promise.resolve(p).catch(err => { try { if (KQ.toast) KQ.toast((err && err.message) || '요청을 처리하지 못했어요.', true); } catch {} throw err; });
  }

  // 새로 들어온 항목 찾기 (목록이 고유 id 없이 잘려 오는 경우)
  function freshItems(prevKeys, items, keyOf) {
    const m = new Map(); for (const k of prevKeys || []) m.set(k, (m.get(k) || 0) + 1);
    const out = [];
    for (const it of items) { const k = keyOf(it); const c = m.get(k) || 0; if (c > 0) m.set(k, c - 1); else out.push(it); }
    return out;
  }

  // 순위 막대 (absolute 배치 + top transition 으로 순위 변동이 미끄러지듯)
  function makeBars(minRows) {
    const node = H('div', { class: 'md-bars' });
    const rows = new Map();
    return {
      node,
      update(items) {
        css(node, '--n', Math.max(minRows, items.length));
        const seen = new Set();
        items.forEach((it, i) => {
          let r = rows.get(it.key);
          if (!r) {
            r = { rank: H('span', { class: 'md-bar-rank' }), label: H('span', { class: 'md-bar-label' }), fill: H('div', { class: 'md-bar-fill' }), val: H('span', { class: 'md-bar-val' }) };
            r.node = H('div', { class: 'md-bar-row' }, r.rank, r.label, r.val, H('div', { class: 'md-bar-track' }, r.fill));
            css(r.node, '--i', i); node.append(r.node); rows.set(it.key, r);
          }
          seen.add(it.key);
          css(r.node, '--i', i); css(r.node, '--c', it.color || '#ffffff');
          txt(r.rank, it.rank !== undefined ? it.rank : i + 1); txt(r.label, it.label); txt(r.val, it.display !== undefined ? it.display : it.value);
          const pct = it.max > 0 ? clamp(num(it.value) / it.max * 100, 0, 100) : 0;
          css(r.fill, 'width', pct.toFixed(1) + '%');
          cls(r.node, 'md-me', !!it.me);
        });
        for (const [k, r] of rows) if (!seen.has(k)) { r.node.remove(); rows.delete(k); }
      }
    };
  }
  const makeBanner = () => H('div', { class: 'md-banner', role: 'status' });
  function setBanner(b, text, bad) { if (text) txt(b, text); cls(b, 'md-show', !!text); cls(b, 'md-bad', !!bad); }

  // ---------- SVG 그림 ----------
  function robotSVG(color) {
    const paint = color ? { fill: color } : undefined;
    return svgBox('0 0 48 52', 'md-robot-svg',
      S('line', { x1: 24, y1: 3, x2: 24, y2: 11, stroke: '#2b2b2b', 'stroke-width': 2.5, 'stroke-linecap': 'round' }),
      S('circle', { cx: 24, cy: 4, r: 3.6, class: 'md-ant', fill: '#ffd43b' }),
      S('rect', { x: 9, y: 10, width: 30, height: 19, rx: 6, class: 'md-paint', style: paint, stroke: '#222', 'stroke-width': 2 }),
      S('rect', { x: 13.5, y: 14, width: 21, height: 10, rx: 4.5, fill: '#e9f6ff' }),
      S('circle', { cx: 19.5, cy: 19, r: 2.5, fill: '#222' }),
      S('circle', { cx: 28.5, cy: 19, r: 2.5, fill: '#222' }),
      S('rect', { x: 13, y: 30, width: 22, height: 11, rx: 3, class: 'md-paint', style: paint, stroke: '#222', 'stroke-width': 2 }),
      S('rect', { x: 18, y: 33, width: 12, height: 3.5, rx: 1.75, fill: '#fff', opacity: 0.75 }),
      S('g', { class: 'md-wheel' }, S('circle', { cx: 15, cy: 45.5, r: 5.5, fill: '#2b2b2b' }), S('line', { x1: 15, y1: 41, x2: 15, y2: 50, stroke: '#bbb', 'stroke-width': 1.6 })),
      S('g', { class: 'md-wheel' }, S('circle', { cx: 33, cy: 45.5, r: 5.5, fill: '#2b2b2b' }), S('line', { x1: 33, y1: 41, x2: 33, y2: 50, stroke: '#bbb', 'stroke-width': 1.6 })));
  }
  const flameSVG = () => svgBox('0 0 40 20', 'md-flame', S('polygon', { points: '40,3 0,10 40,17', fill: '#ff922b' }), S('polygon', { points: '40,6.5 14,10 40,13.5', fill: '#ffe066' }));
  const wrenchSVG = () => svgBox('0 0 24 24', 'md-wrench', S('circle', { cx: 12, cy: 12, r: 11.5, fill: '#fff' }), S('path', { d: 'M15.2 5.6a4 4 0 0 0-5 5.1L4.6 16.3l3.1 3.1 5.6-5.6a4 4 0 0 0 5.1-5l-2.4 2.4-2.3-.5-.5-2.3z', fill: '#868e96', stroke: '#343a40', 'stroke-width': 1.2, 'stroke-linejoin': 'round' }));
  function subSVG() {
    return svgBox('0 0 140 80', 'md-sub-svg',
      S('polygon', { points: '12,34 0,24 0,62 12,52', fill: '#f08c00', stroke: '#7a5a00', 'stroke-width': 2 }),
      S('ellipse', { cx: 72, cy: 50, rx: 60, ry: 24, fill: '#ffd43b', stroke: '#7a5a00', 'stroke-width': 3 }),
      S('rect', { x: 54, y: 14, width: 34, height: 20, rx: 6, fill: '#fcc419', stroke: '#7a5a00', 'stroke-width': 3 }),
      S('path', { d: 'M76 14 V4 H90', fill: 'none', stroke: '#7a5a00', 'stroke-width': 3, 'stroke-linecap': 'round' }),
      [46, 72, 98].map(x => S('circle', { cx: x, cy: 48, r: 7.5, fill: '#9be7ff', stroke: '#7a5a00', 'stroke-width': 3 })),
      S('path', { d: 'M22 58 Q72 78 122 58', fill: 'none', stroke: '#e0a800', 'stroke-width': 3, opacity: 0.8 }));
  }
  function chestSVG(extra) {
    return svgBox('0 0 100 84', 'md-chest-svg ' + (extra || ''),
      S('rect', { x: 8, y: 38, width: 84, height: 42, rx: 6, fill: '#a0522d', stroke: '#5a2d0c', 'stroke-width': 3 }),
      S('g', { class: 'md-coins' }, S('circle', { cx: 32, cy: 37, r: 8, fill: '#ffd43b', stroke: '#c79100', 'stroke-width': 2 }), S('circle', { cx: 50, cy: 33, r: 9, fill: '#ffe066', stroke: '#c79100', 'stroke-width': 2 }), S('circle', { cx: 68, cy: 37, r: 8, fill: '#ffd43b', stroke: '#c79100', 'stroke-width': 2 })),
      S('rect', { x: 8, y: 54, width: 84, height: 7, fill: '#d89e00' }),
      S('rect', { x: 20, y: 38, width: 6, height: 42, fill: '#d89e00' }), S('rect', { x: 74, y: 38, width: 6, height: 42, fill: '#d89e00' }),
      S('g', { class: 'md-lid' }, S('path', { d: 'M8 40 V26 Q8 8 50 8 Q92 8 92 26 V40 Z', fill: '#b5651d', stroke: '#5a2d0c', 'stroke-width': 3 }), S('rect', { x: 9, y: 31, width: 82, height: 6, fill: '#d89e00' })),
      S('rect', { x: 42, y: 33, width: 16, height: 19, rx: 3, fill: '#ffd43b', stroke: '#5a2d0c', 'stroke-width': 2.5 }),
      S('circle', { cx: 50, cy: 42, r: 2.6, fill: '#5a2d0c' }));
  }
  function bossSVG() {
    const ink = '#3b1d6e';
    return svgBox('0 0 200 190', 'md-boss-svg',
      S('ellipse', { cx: 100, cy: 180, rx: 72, ry: 9, fill: 'rgba(0,0,0,.35)' }),
      S('ellipse', { cx: 70, cy: 172, rx: 20, ry: 9, fill: '#6f42c1', stroke: ink, 'stroke-width': 4 }),
      S('ellipse', { cx: 130, cy: 172, rx: 20, ry: 9, fill: '#6f42c1', stroke: ink, 'stroke-width': 4 }),
      S('polygon', { points: '54,50 40,8 80,36', fill: '#ffd43b', stroke: ink, 'stroke-width': 4, 'stroke-linejoin': 'round' }),
      S('polygon', { points: '146,50 160,8 120,36', fill: '#ffd43b', stroke: ink, 'stroke-width': 4, 'stroke-linejoin': 'round' }),
      S('path', { d: 'M24 108 Q2 100 6 124 Q10 138 30 128', fill: '#8e5bd6', stroke: ink, 'stroke-width': 4 }),
      S('path', { d: 'M176 108 Q198 100 194 124 Q190 138 170 128', fill: '#8e5bd6', stroke: ink, 'stroke-width': 4 }),
      S('path', { d: 'M100 26 C160 26 182 80 180 120 C178 160 150 174 100 174 C50 174 22 160 20 120 C18 80 40 26 100 26 Z', fill: '#8e5bd6', stroke: ink, 'stroke-width': 5 }),
      S('ellipse', { cx: 100, cy: 136, rx: 48, ry: 30, fill: '#b794f6' }),
      S('g', { class: 'md-boss-eyes' },
        S('ellipse', { cx: 72, cy: 84, rx: 17, ry: 20, fill: '#fff', stroke: ink, 'stroke-width': 3 }), S('circle', { cx: 76, cy: 88, r: 8, fill: '#222' }), S('circle', { cx: 79, cy: 84, r: 2.6, fill: '#fff' }),
        S('ellipse', { cx: 128, cy: 84, rx: 17, ry: 20, fill: '#fff', stroke: ink, 'stroke-width': 3 }), S('circle', { cx: 124, cy: 88, r: 8, fill: '#222' }), S('circle', { cx: 127, cy: 84, r: 2.6, fill: '#fff' })),
      S('ellipse', { cx: 52, cy: 110, rx: 10, ry: 6, fill: '#ff8fb1', opacity: 0.85 }), S('ellipse', { cx: 148, cy: 110, rx: 10, ry: 6, fill: '#ff8fb1', opacity: 0.85 }),
      S('path', { d: 'M78 114 Q100 134 122 114 Z', fill: ink, stroke: ink, 'stroke-width': 4, 'stroke-linejoin': 'round' }),
      S('polygon', { points: '86,116 90,124 94,118', fill: '#fff' }), S('polygon', { points: '106,118 110,124 114,116', fill: '#fff' }));
  }
  const fishSVG = c => svgBox('0 0 40 24', 'md-fish-svg', S('polygon', { points: '28,12 40,3 40,21', fill: c }), S('ellipse', { cx: 16, cy: 12, rx: 14, ry: 9, fill: c }), S('circle', { cx: 9, cy: 10, r: 2, fill: '#222' }));
  const weedSVG = () => svgBox('0 0 20 60', 'md-weed-svg', S('path', { d: 'M10 60 Q2 48 10 36 Q18 24 10 12 Q6 6 10 0', fill: 'none', stroke: '#2f9e44', 'stroke-width': 5, 'stroke-linecap': 'round' }));
  const crownSVG = () => svgBox('0 0 40 28', 'md-crown', S('polygon', { points: '3,26 3,8 12,16 20,3 28,16 37,8 37,26', fill: '#ffd43b', stroke: '#b07d00', 'stroke-width': 2.2, 'stroke-linejoin': 'round' }), S('circle', { cx: 20, cy: 19, r: 3, fill: '#e21b3c' }), S('circle', { cx: 10, cy: 21, r: 2, fill: '#1368ce' }), S('circle', { cx: 30, cy: 21, r: 2, fill: '#26890c' }));
  const coinSVG = () => svgBox('0 0 40 40', 'md-coin', S('circle', { cx: 20, cy: 20, r: 18, fill: '#ffd43b', stroke: '#c79100', 'stroke-width': 3 }), S('circle', { cx: 20, cy: 20, r: 11.5, fill: 'none', stroke: '#f5b700', 'stroke-width': 2.5 }), S('rect', { x: 17.5, y: 12, width: 5, height: 16, rx: 2.5, fill: '#c79100' }));
  const shieldSVG = () => svgBox('0 0 24 28', 'md-shield-ico', S('path', { d: 'M12 1 L23 5 V13 C23 20 18 25 12 27 C6 25 1 20 1 13 V5 Z', fill: '#4dabf7', stroke: '#fff', 'stroke-width': 2 }));
  const FLOWERS = [
    { petal: '#ffffff', center: '#ffd43b', n: 8, r: 7 },
    { tulip: true, petal: '#e21b3c' },
    { petal: '#ffd43b', center: '#8a4b08', n: 12, r: 6.5 },
    { petal: '#f783ac', center: '#fff3bf', n: 5, r: 7.5, round: true },
    { petal: '#748ffc', center: '#ffffff', n: 6, r: 6.5, round: true },
    { petal: '#ff922b', center: '#e8590c', n: 6, r: 7 }
  ];
  function flowerSVG(kind) {
    const f = FLOWERS[((Math.floor(num(kind)) % 6) + 6) % 6];
    const g = [S('path', { d: 'M20 59 Q18 44 20 25', stroke: '#2b8a3e', 'stroke-width': 3, fill: 'none', 'stroke-linecap': 'round' }), S('path', { d: 'M19 47 Q8 42 5 33 Q16 34 19 43 Z', fill: '#40c057' })];
    if (f.tulip) g.push(S('path', { d: 'M10 10 L14.5 18 L20 8 L25.5 18 L30 10 Q33 30 20 30 Q7 30 10 10 Z', fill: f.petal, stroke: '#a51127', 'stroke-width': 1.2 }));
    else {
      for (let i = 0; i < f.n; i++) {
        const a = (i / f.n * 360).toFixed(1);
        g.push(f.round ? S('circle', { cx: 20, cy: 11.5, r: f.r * 0.85, fill: f.petal, transform: `rotate(${a} 20 20)`, stroke: 'rgba(0,0,0,.08)' })
          : S('ellipse', { cx: 20, cy: 10.5, rx: f.r * 0.55, ry: f.r * 1.1, fill: f.petal, transform: `rotate(${a} 20 20)`, stroke: 'rgba(0,0,0,.1)' }));
      }
      g.push(S('circle', { cx: 20, cy: 20, r: 5.5, fill: f.center }));
    }
    return svgBox('0 0 40 60', 'md-flower-svg', ...g);
  }
  function sunSVG() {
    const rays = []; for (let i = 0; i < 12; i++) rays.push(S('line', { x1: 50, y1: 6, x2: 50, y2: 18, stroke: '#ffd43b', 'stroke-width': 5, 'stroke-linecap': 'round', transform: `rotate(${i * 30} 50 50)` }));
    return svgBox('0 0 100 100', 'md-sun-svg', S('g', { class: 'md-sun-rays' }, ...rays), S('circle', { cx: 50, cy: 50, r: 26, fill: '#ffe066', stroke: '#fab005', 'stroke-width': 3 }), S('circle', { cx: 42, cy: 46, r: 2.5, fill: '#5c3d00' }), S('circle', { cx: 58, cy: 46, r: 2.5, fill: '#5c3d00' }), S('path', { d: 'M41 56 Q50 64 59 56', fill: 'none', stroke: '#5c3d00', 'stroke-width': 2.5, 'stroke-linecap': 'round' }));
  }
  const butterflySVG = c => svgBox('0 0 40 30', 'md-bfly-svg', S('g', { class: 'md-wings' }, S('ellipse', { cx: 11, cy: 10, rx: 10, ry: 8, fill: c }), S('ellipse', { cx: 13, cy: 22, rx: 7, ry: 6, fill: c, opacity: 0.85 }), S('ellipse', { cx: 29, cy: 10, rx: 10, ry: 8, fill: c }), S('ellipse', { cx: 27, cy: 22, rx: 7, ry: 6, fill: c, opacity: 0.85 })), S('rect', { x: 18.5, y: 5, width: 3, height: 22, rx: 1.5, fill: '#333' }));
  const cloud = (top, dur, delay, scale) => H('div', { class: 'md-cloud', style: { '--cy': top, '--cd': dur, '--cdl': delay, '--cs': scale } });

  // ---------- 1. 클래식 ----------
  function classicHost(root, v) {
    const st = prep(root, 'classic:host', ['md-host', 'md-classic'], (st) => {
      st.label = H('div', { class: 'md-classic-label' });
      st.dots = H('div', { class: 'md-qdots', role: 'presentation' });
      st.bar = H('div', { class: 'md-classic-bar' }, st.barFill = H('div', { class: 'md-classic-bar-fill' }));
      st.dotNodes = [];
      root.append(H('div', { class: 'md-stage md-classic-stage' }, st.label, st.dots, st.bar));
    });
    const count = Math.max(0, Math.floor(num(v.questionCount)));
    const idx = Math.floor(num(v.questionIndex, -1));
    const phase = str(v.phase);
    const doneCur = ['reveal', 'leaderboard', 'finished'].includes(phase);
    const useDots = count > 0 && count <= 40;
    show(st.dots, useDots); show(st.bar, !useDots);
    if (useDots) {
      while (st.dotNodes.length < count) { const d = H('span', { class: 'md-qdot' }); st.dots.append(d); st.dotNodes.push(d); }
      while (st.dotNodes.length > count) st.dotNodes.pop().remove();
      st.dotNodes.forEach((d, i) => {
        cls(d, 'md-done', phase === 'finished' || i < idx || (i === idx && doneCur));
        cls(d, 'md-cur', i === idx && phase !== 'finished' && phase !== 'lobby');
      });
    } else {
      const p = phase === 'finished' ? 100 : (phase === 'lobby' || idx < 0 || !count) ? 0 : clamp((idx + (doneCur ? 1 : 0.5)) / count * 100, 0, 100);
      css(st.barFill, 'width', p.toFixed(1) + '%');
    }
    txt(st.label, phase === 'finished' ? '모든 문제 완료' : (phase === 'lobby' || idx < 0) ? `문제 ${count}개` : `${idx + 1} / ${count}`);
  }
  function classicPlayer(root) { prep(root, 'classic:player', ['md-player', 'md-classic', 'md-empty'], () => {}); }

  // ---------- 2. 로봇 경주 ----------
  const MAX_LANES = 12;
  function makeLane() {
    const L = {};
    L.rank = H('span', { class: 'md-lane-rank' });
    L.name = H('span', { class: 'md-lane-name' });
    L.bot = H('div', { class: 'md-bot' }, flameSVG(), robotSVG(), wrenchSVG());
    L.medal = H('span', { class: 'md-medal' });
    L.node = H('div', { class: 'md-lane' }, L.rank, L.name, H('div', { class: 'md-road' }, L.bot), L.medal);
    L.pos = null;
    return L;
  }
  function robotHost(root, v) {
    const st = prep(root, 'robot:host', ['md-host', 'md-robot'], (st) => {
      st.goalText = H('span', { class: 'md-chip' });
      st.more = H('div', { class: 'md-more' });
      st.lanes = H('div', { class: 'md-lanes' });
      st.empty = H('div', { class: 'md-empty-msg', text: '참가자가 들어오면 로봇이 출발선에 서요' });
      st.stage = H('div', { class: 'md-stage md-robot-stage', role: 'img', 'aria-label': '로봇 경주' },
        H('div', { class: 'md-head' }, H('span', { class: 'md-title', text: '로봇 경주' }), st.goalText),
        H('div', { class: 'md-lanes-wrap' }, st.lanes, st.empty), st.more);
      root.append(st.stage);
      st.map = new Map();
    });
    const s = ms(v);
    const goal = Math.max(1, num(s.goal, num(v.options && v.options.goal, 15)));
    const racers = arr(s.racers).filter(r => r && r.id !== undefined && r.id !== null);
    const sorted = racers.slice().sort(byFinishThen('pos'));
    const shown = sorted.slice(0, MAX_LANES);
    css(st.lanes, '--n', Math.max(shown.length, 5));
    txt(st.goalText, `결승선까지 ${goal}칸`);
    show(st.empty, shown.length === 0);
    const seen = new Set();
    shown.forEach((r, i) => {
      const key = str(r.id); seen.add(key);
      let L = st.map.get(key);
      if (!L) { L = makeLane(); st.map.set(key, L); st.lanes.append(L.node); }
      css(L.node, '--i', i); css(L.node, '--c', safeColor(r.color) || colorFor(key));
      cls(L.node, 'md-odd', i % 2 === 1);
      txt(L.rank, i + 1); txt(L.name, str(r.nickname));
      const pos = clamp(num(r.pos), 0, goal);
      css(L.node, '--p', (pos / goal).toFixed(4));
      if (L.pos !== null && pos !== L.pos) { L.bot.classList.add('md-moving'); clearTimeout(L.mt); L.mt = later(st, () => L.bot.classList.remove('md-moving'), 900); }
      L.pos = pos;
      const fr = Math.floor(num(r.finishedRank, 0));
      cls(L.node, 'md-turbo', !!r.turbo && !fr);
      cls(L.node, 'md-repair', !!r.repairing && !fr);
      cls(L.node, 'md-finished', fr > 0);
      txt(L.medal, fr > 0 ? fr : '');
      css(L.medal, '--mc', fr > 0 && fr <= 3 ? MEDAL[fr - 1] : '#ffffff');
      cls(L.medal, 'md-show', fr > 0);
    });
    for (const [k, L] of st.map) if (!seen.has(k)) { L.node.remove(); st.map.delete(k); }
    txt(st.more, sorted.length > MAX_LANES ? `그 외 ${sorted.length - MAX_LANES}명` : '');
    attr(st.stage, 'aria-label', shown.length ? `로봇 경주, 1위 ${str(shown[0].nickname)} ${num(shown[0].pos)}칸` : '로봇 경주 출발 대기');
  }
  function robotPlayer(root, v) {
    const st = prep(root, 'robot:player', ['md-player', 'md-robot'], (st) => {
      st.rank = H('div', { class: 'md-big' }); st.sub = H('div', { class: 'md-sub' });
      st.ptext = H('div', { class: 'md-small' }); st.note = H('div', { class: 'md-note' });
      st.card = H('div', { class: 'md-card' },
        H('div', { class: 'md-prow' }, H('div', { class: 'md-avatar' }, robotSVG(), wrenchSVG()), H('div', { class: 'md-pinfo' }, st.rank, st.sub)),
        H('div', { class: 'md-pbar' }, H('div', { class: 'md-pbar-fill' }), H('div', { class: 'md-pbar-mark' }, robotSVG()), H('div', { class: 'md-pbar-flag' })),
        st.ptext, st.note);
      root.append(st.card);
    });
    const s = ms(v), me = meOf(v);
    const goal = Math.max(1, num(s.goal, 15));
    const racers = arr(s.racers).filter(Boolean);
    const sorted = racers.slice().sort(byFinishThen('pos'));
    const mine = me ? racers.find(r => str(r.id) === str(me.id)) : null;
    const pos = clamp(num(mine && mine.pos), 0, goal);
    const rankIdx = mine ? sorted.indexOf(mine) + 1 : Math.floor(num(me && me.rank, 0));
    css(st.card, '--c', (mine && safeColor(mine.color)) || colorFor(me ? me.id : 'me'));
    css(st.card, '--p', (pos / goal).toFixed(4));
    const total = racers.length || Math.floor(num(me && me.playerCount, 0));
    const fr = Math.floor(num(mine && mine.finishedRank, 0));
    txt(st.rank, fr ? `${fr}위로 도착!` : rankIdx ? `지금 ${rankIdx}위` : '내 로봇');
    txt(st.sub, total ? `참가자 ${total}명` : '출발 준비 중');
    txt(st.ptext, `${pos} / ${goal}칸`);
    const repairing = !fr && (!!(mine && mine.repairing) || num(v.lockedUntil, 0) > nowMs());
    cls(st.card, 'md-repair', repairing); cls(st.card, 'md-turbo', !!(mine && mine.turbo) && !fr);
    txt(st.note, repairing ? '수리 중이에요! 잠시 후 다시 달려요' : fr ? '결승선을 통과했어요!' : (mine && mine.turbo) ? '터보 가속 중!' : '정답을 맞히면 한 칸 앞으로!');
  }

  // ---------- 3. 마블 레이스 ----------
  const MARBLE_PATH = 'M40 70 C300 80 600 110 880 130 C990 140 990 232 880 236 C600 250 350 270 130 290 C20 300 20 386 130 390 C400 400 650 420 880 440 C990 450 990 530 880 532 L470 536';
  function marbleHost(root, v) {
    const st = prep(root, 'marble:host', ['md-host', 'md-marble'], (st) => {
      st.defs = S('defs', {});
      st.path = S('path', { d: MARBLE_PATH, fill: 'none', stroke: 'none' });
      st.layer = S('g', { class: 'md-marbles' });
      const checker = []; for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) checker.push(S('rect', { x: 462 + j * 6, y: 512 + i * 8, width: 6, height: 8, fill: (i + j) % 2 ? '#222' : '#fff' }));
      const flag = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) flag.push(S('rect', { x: 452 + j * 9, y: 466 + i * 9, width: 9, height: 9, fill: (i + j) % 2 ? '#222' : '#fff' }));
      st.svg = svgBox('0 0 1000 580', 'md-course', st.defs,
        S('path', { d: MARBLE_PATH, class: 'md-track-shadow', transform: 'translate(0 9)' }),
        S('path', { d: MARBLE_PATH, class: 'md-track-rail' }),
        S('path', { d: MARBLE_PATH, class: 'md-track-bed' }),
        S('path', { d: MARBLE_PATH, class: 'md-track-dash' }),
        st.path,
        S('circle', { cx: 40, cy: 70, r: 20, class: 'md-start-dot' }),
        S('g', {}, ...checker),
        S('line', { x1: 488, y1: 540, x2: 488, y2: 462, stroke: '#333', 'stroke-width': 4, 'stroke-linecap': 'round' }),
        S('g', { transform: 'translate(0 0)' }, ...flag),
        st.layer);
      st.board = makeBars(8);
      st.empty = H('div', { class: 'md-empty-msg', text: '참가자가 들어오면 구슬이 출발선에 모여요' });
      st.stage = H('div', { class: 'md-stage md-marble-stage', role: 'img', 'aria-label': '마블 레이스' },
        H('div', { class: 'md-course-wrap' }, st.svg, st.empty),
        H('div', { class: 'md-side' }, H('div', { class: 'md-side-title', text: '순위' }), st.board.node));
      root.append(st.stage);
      st.marbles = new Map();
      st.len = 0;
      try { st.len = st.path.getTotalLength(); } catch { st.len = 0; }
    });
    const s = ms(v);
    st.goal = Math.max(1, num(s.goal, 100));
    const list = arr(s.marbles).filter(m => m && m.id !== undefined && m.id !== null);
    const sorted = list.slice().sort(byFinishThen('dist'));
    const top5 = new Set(sorted.slice(0, 5).map(m => str(m.id)));
    const seen = new Set();
    for (const m of list) {
      const key = str(m.id); seen.add(key);
      const color = safeColor(m.color) || colorFor(key);
      const dist = clamp(num(m.dist), 0, st.goal);
      let M = st.marbles.get(key);
      if (!M) {
        const gid = `md-mg${st.uid}-${st.marbles.size}-${hash(key) % 9999}`;
        M = { cur: dist, target: dist, off: ((hash(key) % 5) - 2) * 5, color: null, dist };
        M.stops = [S('stop', { offset: '0%', 'stop-color': '#ffffff' }), S('stop', { offset: '38%', 'stop-color': color }), S('stop', { offset: '100%', 'stop-color': shade(color, -0.45) })];
        M.grad = S('radialGradient', { id: gid, cx: '35%', cy: '30%', r: '75%' }, ...M.stops);
        st.defs.append(M.grad);
        M.roll = S('g', { class: 'md-roll' }, S('path', { d: 'M-8 -2 Q0 -8 8 -2', fill: 'none', stroke: '#fff', 'stroke-width': 2.4, opacity: 0.55, 'stroke-linecap': 'round' }));
        M.label = S('text', { class: 'md-mlabel', y: -22 });
        M.g = S('g', { class: 'md-marble' }, S('circle', { r: 15, class: 'md-boost-ring' }), S('circle', { r: 13, class: 'md-mball', fill: `url(#${gid})`, stroke: 'rgba(0,0,0,.35)', 'stroke-width': 1.5 }), M.roll, M.label);
        st.layer.append(M.g);
        st.marbles.set(key, M);
      }
      if (M.color !== color) { M.color = color; M.stops[1].setAttribute('stop-color', color); M.stops[2].setAttribute('stop-color', shade(color, -0.45)); }
      if (!st.first && dist !== M.dist) replay(M.g, dist > M.dist ? 'md-boosted' : 'md-bumped');
      M.dist = dist; M.target = dist;
      txt(M.label, top5.has(key) ? str(m.nickname).slice(0, 8) : '');
      cls(M.g, 'md-lead', top5.has(key));
    }
    for (const [k, M] of st.marbles) if (!seen.has(k)) { M.g.remove(); M.grad.remove(); st.marbles.delete(k); }
    // 선두 구슬을 위로 그리기
    for (let i = sorted.length - 1; i >= 0; i--) { const M = st.marbles.get(str(sorted[i].id)); if (M && M.g !== st.layer.lastChild) st.layer.append(M.g); }
    show(st.empty, list.length === 0);
    st.board.update(sorted.slice(0, 8).map((m, i) => {
      const fr = Math.floor(num(m.finishedRank, 0)); const d = clamp(num(m.dist), 0, st.goal);
      return { key: str(m.id), rank: i + 1, label: str(m.nickname), value: d, max: st.goal, color: safeColor(m.color) || colorFor(m.id), display: fr ? `${fr}위 도착` : `${Math.round(d)}m` };
    }));
    attr(st.stage, 'aria-label', sorted.length ? `마블 레이스, 1위 ${str(sorted[0].nickname)}` : '마블 레이스 출발 대기');
    for (const M of st.marbles.values()) if (M.placed !== true) { placeMarble(st, M); M.placed = true; }
    marbleTick(st);
  }
  function placeMarble(st, M) {
    if (!st.len) { try { st.len = st.path.getTotalLength(); } catch { st.len = 0; } }
    if (!st.len) return;
    const at = clamp(M.cur / st.goal, 0, 1) * st.len;
    const p = st.path.getPointAtLength(at), q = st.path.getPointAtLength(Math.min(st.len, at + 2)), b = st.path.getPointAtLength(Math.max(0, at - 2));
    let dx = q.x - b.x, dy = q.y - b.y; const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n;
    const x = p.x - dy * M.off, y = p.y + dx * M.off;
    M.g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    M.roll.setAttribute('transform', `rotate(${Math.round(M.cur * 40) % 360})`);
  }
  function marbleTick(st) {
    if (st.raf || st.dead) return;
    let last = performance.now();
    const step = t => {
      st.raf = 0;
      if (st.dead) return;
      const dt = Math.min(0.1, Math.max(0, (t - last) / 1000)); last = t;
      const instant = reducedMotion();
      let moving = false;
      for (const M of st.marbles.values()) {
        const d = M.target - M.cur;
        if (Math.abs(d) < 0.05 || instant) { if (M.cur === M.target) continue; M.cur = M.target; }
        else { M.cur += d * Math.min(1, dt * 2.6); moving = true; }
        try { placeMarble(st, M); } catch {}
      }
      if (moving) st.raf = requestAnimationFrame(step);
    };
    st.raf = requestAnimationFrame(step);
  }
  function marblePlayer(root, v) {
    const st = prep(root, 'marble:player', ['md-player', 'md-marble'], (st) => {
      st.rank = H('div', { class: 'md-big' }); st.sub = H('div', { class: 'md-sub' }); st.left = H('div', { class: 'md-small' }); st.note = H('div', { class: 'md-note' });
      st.card = H('div', { class: 'md-card' }, H('div', { class: 'md-prow' }, H('div', { class: 'md-ball md-ball-big' }), H('div', { class: 'md-pinfo' }, st.rank, st.sub)),
        H('div', { class: 'md-pbar' }, H('div', { class: 'md-pbar-fill' }), H('div', { class: 'md-pbar-mark md-ball' }), H('div', { class: 'md-pbar-flag' })), st.left, st.note);
      root.append(st.card);
    });
    const s = ms(v), me = meOf(v); const goal = Math.max(1, num(s.goal, 100));
    const list = arr(s.marbles).filter(Boolean); const sorted = list.slice().sort(byFinishThen('dist'));
    const mine = me ? list.find(m => str(m.id) === str(me.id)) : null;
    const dist = clamp(num(mine && mine.dist), 0, goal);
    const fr = Math.floor(num(mine && mine.finishedRank, 0));
    const rankIdx = mine ? sorted.indexOf(mine) + 1 : Math.floor(num(me && me.rank, 0));
    css(st.card, '--c', (mine && safeColor(mine.color)) || colorFor(me ? me.id : 'me'));
    css(st.card, '--p', (dist / goal).toFixed(4));
    txt(st.rank, fr ? `${fr}위로 도착!` : rankIdx ? `지금 ${rankIdx}위` : '내 구슬');
    txt(st.sub, `참가자 ${list.length || Math.floor(num(me && me.playerCount, 0))}명`);
    txt(st.left, fr ? '결승선 통과!' : `남은 거리 ${Math.max(0, Math.round(goal - dist))}m`);
    const lb = num(mine && mine.lastBoost, 0);
    txt(st.note, fr ? '멋져요! 다른 친구들을 응원해요' : lb > 0 ? `방금 ${lb}m 가속했어요!` : lb < 0 ? '벽에 부딪혀 살짝 밀렸어요' : '빨리 맞힐수록 멀리 굴러가요');
  }

  // ---------- 4. 잠수함 특공대 ----------
  function subHost(root, v) {
    const st = prep(root, 'submarine:host', ['md-host', 'md-submarine'], (st) => {
      st.scale = H('div', { class: 'md-scale' });
      st.ticks = [0, 1, 2, 3, 4].map(i => { const t = H('span', { class: 'md-tick', style: { '--t': i / 4 } }); st.scale.append(t); return t; });
      st.sub = H('div', { class: 'md-subm' }, H('div', { class: 'md-beam' }), H('div', { class: 'md-sub-bob' }, subSVG()), H('span', { class: 'md-bub md-b1' }), H('span', { class: 'md-bub md-b2' }), H('span', { class: 'md-bub md-b3' }));
      st.o2fill = H('div', { class: 'md-o2-fill' }); st.o2text = H('div', { class: 'md-o2-text' });
      st.depth = H('div', { class: 'md-depth' }); st.acc = H('div', { class: 'md-chip' });
      st.log = H('div', { class: 'md-log' }); st.banner = makeBanner();
      const fishes = [['22%', '19s', '-3s', '#ff922b', 1], ['42%', '25s', '-12s', '#ffd43b', 0.8], ['60%', '21s', '-7s', '#63e6be', 1.1], ['76%', '29s', '-18s', '#f783ac', 0.7]]
        .map(([y, d, dl, c, sc]) => H('div', { class: 'md-fishy', style: { '--fy': y, '--dur': d, '--dl': dl, '--fs': sc } }, fishSVG(c)));
      const floor = H('div', { class: 'md-floor' },
        H('div', { class: 'md-weed', style: { left: '8%', '--wd': '-1s' } }, weedSVG()), H('div', { class: 'md-weed', style: { left: '30%', '--wd': '-2s' } }, weedSVG()),
        H('div', { class: 'md-weed', style: { left: '78%', '--wd': '-.5s' } }, weedSVG()), H('div', { class: 'md-weed', style: { left: '86%', '--wd': '-1.6s' } }, weedSVG()),
        H('div', { class: 'md-seachest' }, chestSVG('md-open')));
      st.stage = H('div', { class: 'md-stage md-sea', role: 'img', 'aria-label': '잠수함 특공대' },
        H('div', { class: 'md-wave' }), st.scale, ...fishes, floor, st.sub,
        H('div', { class: 'md-o2' }, H('div', { class: 'md-o2-label', text: '산소' }), H('div', { class: 'md-o2-track' }, st.o2fill), st.o2text),
        H('div', { class: 'md-hud' }, st.depth, st.acc), st.log, st.banner);
      root.append(st.stage);
    });
    const s = ms(v);
    const target = Math.max(1, num(s.targetDepth, 1000));
    const depth = clamp(num(s.depth), 0, target);
    const oxy = clamp(num(s.oxygen, 100), 0, 100);
    css(st.stage, '--d', (depth / target).toFixed(4));
    st.ticks.forEach((t, i) => txt(t, `${Math.round(target * i / 4)}m`));
    css(st.o2fill, 'height', oxy.toFixed(1) + '%'); txt(st.o2text, `${Math.round(oxy)}%`);
    cls(st.stage, 'md-low', oxy < 30);
    txt(st.depth, `${Math.round(depth)}m`);
    const acc = s.lastAccuracy === null || s.lastAccuracy === undefined ? null : num(s.lastAccuracy, NaN);
    const accPct = acc === null || !Number.isFinite(acc) ? null : Math.round(acc <= 1 && acc > 0 && !Number.isInteger(acc) ? acc * 100 : acc);
    txt(st.acc, accPct === null ? `목표 ${target}m` : `지난 문제 정답률 ${accPct}%`);
    const lines = arr(s.log).slice(0, 3).map(str);
    const sig = lines.join('\n');
    if (st.logSig !== sig) { st.logSig = sig; st.log.replaceChildren(...lines.map((l, i) => H('div', { class: 'md-log-line' + (i === 0 ? ' md-new' : ''), text: l }))); }
    const status = str(s.status);
    setBanner(st.banner, status === 'success' ? '보물에 도착했어요! 탐험 성공' : status === 'failed' ? '산소가 바닥났어요. 다음엔 더 깊이!' : '', status === 'failed');
    attr(st.stage, 'aria-label', `잠수함 특공대, 깊이 ${Math.round(depth)}미터, 산소 ${Math.round(oxy)}퍼센트`);
  }
  function subPlayer(root, v) {
    const st = prep(root, 'submarine:player', ['md-player', 'md-submarine'], (st) => {
      st.depth = H('b'); st.oxy = H('b'); st.dfill = H('div', { class: 'md-mini-fill md-blue' }); st.ofill = H('div', { class: 'md-mini-fill md-cyan' }); st.status = H('div', { class: 'md-note' });
      root.append(H('div', { class: 'md-card' },
        H('div', { class: 'md-sub-mini' }, subSVG()),
        H('div', { class: 'md-stat2' }, H('div', {}, H('span', { text: '깊이' }), st.depth, H('div', { class: 'md-mini-track' }, st.dfill)), H('div', {}, H('span', { text: '산소' }), st.oxy, H('div', { class: 'md-mini-track' }, st.ofill))),
        st.status));
    });
    const s = ms(v); const target = Math.max(1, num(s.targetDepth, 1000)); const depth = clamp(num(s.depth), 0, target); const oxy = clamp(num(s.oxygen, 100), 0, 100);
    txt(st.depth, `${Math.round(depth)}m / ${target}m`); txt(st.oxy, `${Math.round(oxy)}%`);
    css(st.dfill, 'width', (depth / target * 100).toFixed(1) + '%'); css(st.ofill, 'width', oxy.toFixed(1) + '%');
    cls(st.ofill, 'md-red', oxy < 30);
    const status = str(s.status);
    txt(st.status, status === 'success' ? '탐험 성공! 보물을 찾았어요' : status === 'failed' ? '산소가 바닥났어요. 그래도 잘했어요!' : '우리 반 정답률이 잠수함을 움직여요');
  }

  // ---------- 5. 컬러 킹덤 ----------
  function kingdomHost(root, v) {
    const st = prep(root, 'kingdom:host', ['md-host', 'md-kingdom'], (st) => {
      st.grid = H('div', { class: 'md-kgrid' }); st.tiles = [];
      st.bars = makeBars(4); st.free = H('div', { class: 'md-chip' });
      st.stage = H('div', { class: 'md-stage md-kingdom-stage', role: 'img', 'aria-label': '컬러 킹덤 지도' },
        H('div', { class: 'md-kmap' }, st.grid),
        H('div', { class: 'md-side' }, H('div', { class: 'md-side-title', text: '팀별 땅' }), st.bars.node, st.free));
      root.append(st.stage);
    });
    const s = ms(v);
    const cols = clamp(Math.floor(num(s.cols, 10)) || 10, 1, 40), rows = clamp(Math.floor(num(s.rows, 6)) || 6, 1, 40), total = cols * rows;
    const tiles = arr(s.tiles); const teams = teamsOf(v);
    css(st.grid, '--cols', cols); css(st.grid, '--rows', rows); css(st.grid, '--ratio', (cols / rows).toFixed(4));
    while (st.tiles.length < total) { const n = H('div', { class: 'md-tile' }); st.grid.append(n); st.tiles.push({ node: n, owner: undefined }); }
    while (st.tiles.length > total) st.tiles.pop().node.remove();
    const counts = new Map();
    st.tiles.forEach((T, i) => {
      const o = Number.isInteger(tiles[i]) && tiles[i] >= 0 ? tiles[i] : -1;
      if (o >= 0) counts.set(o, (counts.get(o) || 0) + 1);
      if (T.owner !== o) {
        css(T.node, '--tc', o >= 0 ? teamColor(o, teams) : 'var(--md-empty)');
        cls(T.node, 'md-owned', o >= 0);
        if (T.owner !== undefined && !st.first) replay(T.node, 'md-flip');
        T.owner = o;
      }
    });
    let used = 0;
    const items = teams.map(t => { const val = counts.has(t.index) ? counts.get(t.index) : num(t.tiles, 0); used += val; return { key: 't' + t.index, label: t.name, value: val, max: total, color: t.color, display: `${val}칸` }; })
      .sort((a, b) => b.value - a.value);
    items.forEach((it, i) => { it.rank = i + 1; });
    st.bars.update(items);
    txt(st.free, `빈 땅 ${Math.max(0, total - used)}칸`);
    attr(st.stage, 'aria-label', '컬러 킹덤 지도, ' + items.map(it => `${it.label} ${it.value}칸`).join(', '));
  }
  function kingdomPlayer(root, v, send) {
    const st = prep(root, 'kingdom:player', ['md-player', 'md-kingdom'], (st) => {
      st.cTitle = H('div', { class: 'md-big' });
      st.pgrid = H('div', { class: 'md-pgrid', role: 'group', 'aria-label': '땅 지도' });
      st.claim = H('div', { class: 'md-card md-claim' }, st.cTitle, H('div', { class: 'md-sub', text: '차지할 칸을 누르세요. 다른 팀 땅도 빼앗을 수 있어요.' }), st.pgrid);
      st.swatch = H('div', { class: 'md-swatch' }); st.team = H('div', { class: 'md-big' }); st.count = H('div', { class: 'md-sub' });
      st.info = H('div', { class: 'md-card md-kinfo' }, st.swatch, st.team, st.count, H('div', { class: 'md-note', text: '정답을 맞히면 땅을 차지해요' }));
      st.btns = [];
      root.append(st.claim, st.info);
    });
    st.send = send;
    const s = ms(v), me = meOf(v), a = v.actions;
    const claiming = !!(a && a.kind === 'claim' && num(a.remaining) > 0);
    const teams = teamsOf(v);
    const myTeam = me && Number.isInteger(me.team) ? me.team : -1;
    const myColor = safeColor(me && me.teamColor) || (myTeam >= 0 ? teamColor(myTeam, teams) : '#46178f');
    css(st.claim, '--c', myColor); css(st.info, '--c', myColor);
    show(st.claim, claiming); show(st.info, !claiming);
    const cols = clamp(Math.floor(num(s.cols, 10)) || 10, 1, 40), rows = clamp(Math.floor(num(s.rows, 6)) || 6, 1, 40), total = cols * rows;
    const tiles = arr(s.tiles);
    st.myTeam = myTeam; st.myColor = myColor;
    if (claiming) {
      txt(st.cTitle, `남은 땅 ${num(a.remaining)}칸`);
      css(st.pgrid, '--cols', cols);
      while (st.btns.length < total) {
        const i = st.btns.length;
        const T = { owner: undefined, pending: false };
        T.node = H('button', { type: 'button', class: 'md-ptile', onClick: () => {
          if (T.pending || T.owner === st.myTeam) return;
          T.pending = true; T.node.disabled = true; cls(T.node, 'md-pending', true);
          act(st.send, 'claim', i).then(() => { if (st.myColor) css(T.node, '--tc', st.myColor); }, () => {}).finally(() => { T.pending = false; cls(T.node, 'md-pending', false); T.node.disabled = T.owner === st.myTeam; });
        } });
        st.pgrid.append(T.node); st.btns.push(T);
      }
      while (st.btns.length > total) st.btns.pop().node.remove();
      st.btns.forEach((T, i) => {
        const o = Number.isInteger(tiles[i]) && tiles[i] >= 0 ? tiles[i] : -1;
        if (T.owner !== o || T.team !== myTeam) {
          if (T.owner !== undefined && T.owner !== o) replay(T.node, 'md-flip');
          T.owner = o; T.team = myTeam;
          css(T.node, '--tc', o >= 0 ? teamColor(o, teams) : 'var(--md-empty)');
          cls(T.node, 'md-mine', o >= 0 && o === myTeam);
          T.node.disabled = T.pending || (o >= 0 && o === myTeam);
          attr(T.node, 'aria-label', `${i + 1}번 칸, ${o >= 0 ? teamName(o, teams) + ' 땅' : '빈 땅'}${o === myTeam ? ' (우리 팀)' : ''}`);
        }
      });
    } else {
      const tcount = tiles.filter(x => x === myTeam).length;
      css(st.swatch, '--c', myColor);
      txt(st.team, myTeam >= 0 ? (str(me && me.teamName) || teamName(myTeam, teams)) : '컬러 킹덤');
      txt(st.count, myTeam >= 0 ? `우리 팀 땅 ${tcount}칸 / ${total}칸` : '팀이 정해지면 여기에 표시돼요');
    }
  }

  // ---------- 6. 우주 정복 ----------
  const DEFAULT_PLANETS = [['반짝성', 14, 22, 2], ['구름별', 38, 14, 1], ['얼음달', 66, 20, 2], ['불꽃성', 88, 30, 1], ['바다별', 22, 62, 1], ['숲속성', 50, 48, 3], ['무지개성', 80, 70, 2], ['모래달', 40, 82, 1], ['은하섬', 64, 86, 1]]
    .map(([name, x, y, size], i) => ({ id: 'p' + i, name, x, y, size, owner: -1, energy: [] }));
  const PLANET_COLORS = ['#ffa94d', '#74c0fc', '#b197fc', '#63e6be', '#ff8787', '#ffd43b', '#a9e34b', '#f783ac'];
  const planetsOf = s => { const p = arr(s.planets).filter(x => x && x.id !== undefined && x.id !== null); return p.length ? p : DEFAULT_PLANETS; };
  function spaceHost(root, v) {
    const st = prep(root, 'space:host', ['md-host', 'md-space'], (st) => {
      let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const stars = []; for (let i = 0; i < 70; i++) stars.push(H('span', { class: 'md-star' + (i % 3 === 0 ? ' md-tw' : ''), style: { '--x': (rnd() * 100).toFixed(1) + '%', '--y': (rnd() * 100).toFixed(1) + '%', '--dl': (-rnd() * 3).toFixed(2) + 's', '--sz': (1 + rnd() * 2).toFixed(1) + 'px' } }));
      st.board = H('div', { class: 'md-teamboard' }); st.chips = new Map();
      st.layer = H('div', { class: 'md-planets' }); st.pl = new Map();
      st.stage = H('div', { class: 'md-stage md-space-stage', role: 'img', 'aria-label': '우주 정복' }, ...stars, st.layer, st.board);
      root.append(st.stage);
    });
    const s = ms(v); const teams = teamsOf(v); const planets = planetsOf(s);
    // 팀 점수판
    const scores = teams.map(t => {
      const owned = planets.filter(p => p.owner === t.index);
      return { t, planets: num(t.planets, owned.length), score: num(t.score, owned.reduce((n, p) => n + clamp(num(p.size, 1), 1, 3), 0)) };
    });
    const best = Math.max(0, ...scores.map(x => x.score));
    const seenT = new Set();
    scores.forEach(({ t, planets: pc, score }) => {
      const k = 't' + t.index; seenT.add(k);
      let C = st.chips.get(k);
      if (!C) { C = { name: H('span', { class: 'md-tc-name' }), score: H('b'), sub: H('span', { class: 'md-tc-sub' }) }; C.node = H('div', { class: 'md-teamchip' }, H('span', { class: 'md-tdot' }), C.name, C.score, C.sub); st.board.append(C.node); st.chips.set(k, C); }
      css(C.node, '--tc', t.color); txt(C.name, t.name); txt(C.score, `${score}점`); txt(C.sub, `행성 ${pc}`);
      cls(C.node, 'md-lead', best > 0 && score === best);
    });
    for (const [k, C] of st.chips) if (!seenT.has(k)) { C.node.remove(); st.chips.delete(k); }
    // 행성
    const seen = new Set();
    planets.forEach((p, i) => {
      const key = str(p.id); seen.add(key);
      let P = st.pl.get(key);
      if (!P) {
        const pc = PLANET_COLORS[(hash(key) + i) % PLANET_COLORS.length];
        P = { owner: undefined, name: H('div', { class: 'md-pname' }), energy: H('div', { class: 'md-penergy' }), ebars: [] };
        P.body = H('div', { class: 'md-pbody-wrap' }, H('div', { class: 'md-pbody' }), H('div', { class: 'md-pring' }));
        P.node = H('div', { class: 'md-planet', style: { '--pc': pc, '--pc2': shade(pc, -0.5), '--fl': (-(hash(key) % 50) / 10) + 's' } }, P.body, P.name, P.energy);
        st.layer.append(P.node); st.pl.set(key, P);
      }
      css(P.node, '--x', clamp(num(p.x, 50), 0, 100)); css(P.node, '--y', clamp(num(p.y, 50), 0, 100)); css(P.node, '--s', clamp(Math.round(num(p.size, 1)), 1, 3));
      txt(P.name, str(p.name));
      const owner = Number.isInteger(p.owner) && p.owner >= 0 ? p.owner : -1;
      if (P.owner !== owner) { css(P.node, '--oc', owner >= 0 ? teamColor(owner, teams) : 'transparent'); cls(P.node, 'md-owned', owner >= 0); if (P.owner !== undefined && !st.first) replay(P.node, 'md-conquer'); P.owner = owner; }
      const energy = arr(p.energy).map(e => Math.max(0, num(e)));
      const maxE = Math.max(1, ...energy);
      const showE = energy.some(e => e > 0);
      show(P.energy, showE);
      while (P.ebars.length < teams.length) { const b = H('span', { class: 'md-ebar' }); P.energy.append(b); P.ebars.push(b); }
      while (P.ebars.length > teams.length) P.ebars.pop().remove();
      teams.forEach((t, j) => { const b = P.ebars[j]; css(b, '--tc', t.color); css(b, '--e', ((energy[t.index] || 0) / maxE).toFixed(3)); });
    });
    for (const [k, P] of st.pl) if (!seen.has(k)) { P.node.remove(); st.pl.delete(k); }
    attr(st.stage, 'aria-label', '우주 정복, ' + scores.map(x => `${x.t.name} ${x.score}점`).join(', '));
  }
  function spacePlayer(root, v, send) {
    const st = prep(root, 'space:player', ['md-player', 'md-space'], (st) => {
      st.lTitle = H('div', { class: 'md-big' }); st.list = H('div', { class: 'md-plist' }); st.items = new Map();
      st.launch = H('div', { class: 'md-card md-launch' }, st.lTitle, H('div', { class: 'md-sub', text: '에너지를 보낼 행성을 누르세요. 에너지가 가장 많은 팀이 행성을 차지해요.' }), st.list);
      st.swatch = H('div', { class: 'md-swatch' }); st.team = H('div', { class: 'md-big' }); st.count = H('div', { class: 'md-sub' });
      st.info = H('div', { class: 'md-card' }, st.swatch, st.team, st.count, H('div', { class: 'md-note', text: '정답을 맞히면 에너지를 모아요' }));
      root.append(st.launch, st.info);
    });
    st.send = send;
    const s = ms(v), me = meOf(v), a = v.actions; const teams = teamsOf(v); const planets = planetsOf(s);
    const launching = !!(a && a.kind === 'launch' && num(a.remaining) > 0);
    const myTeam = me && Number.isInteger(me.team) ? me.team : -1;
    const myColor = safeColor(me && me.teamColor) || (myTeam >= 0 ? teamColor(myTeam, teams) : '#25076b');
    css(st.launch, '--c', myColor); css(st.info, '--c', myColor);
    show(st.launch, launching); show(st.info, !launching);
    if (launching) {
      txt(st.lTitle, `남은 에너지 ${num(a.remaining)}`);
      const seen = new Set();
      planets.forEach((p, i) => {
        const key = str(p.id); seen.add(key);
        let B = st.items.get(key);
        if (!B) {
          B = { pending: false, name: H('span', { class: 'md-pb-name' }), owner: H('span', { class: 'md-pb-sub' }), en: H('span', { class: 'md-pb-en' }) };
          const pc = PLANET_COLORS[(hash(key) + i) % PLANET_COLORS.length];
          B.node = H('button', { type: 'button', class: 'md-planet-btn', style: { '--pc': pc }, onClick: () => {
            if (B.pending) return; B.pending = true; B.node.disabled = true;
            act(st.send, 'launch', p.id).then(() => {}, () => {}).finally(() => { B.pending = false; B.node.disabled = false; });
          } }, H('span', { class: 'md-pb-ico' }), H('span', { class: 'md-pb-text' }, B.name, B.owner), B.en);
          st.list.append(B.node); st.items.set(key, B);
        }
        const owner = Number.isInteger(p.owner) && p.owner >= 0 ? p.owner : -1;
        css(B.node, '--oc', owner >= 0 ? teamColor(owner, teams) : 'transparent');
        txt(B.name, str(p.name)); txt(B.owner, owner >= 0 ? `${teamName(owner, teams)} 소유${owner === myTeam ? ' (우리 팀)' : ''}` : '주인 없음');
        const mine = myTeam >= 0 ? num(arr(p.energy)[myTeam], 0) : 0;
        txt(B.en, `우리 팀 ${mine}`);
        attr(B.node, 'aria-label', `${str(p.name)}에 에너지 보내기, ${owner >= 0 ? teamName(owner, teams) + ' 소유' : '주인 없음'}, 우리 팀 에너지 ${mine}`);
      });
      for (const [k, B] of st.items) if (!seen.has(k)) { B.node.remove(); st.items.delete(k); }
    } else {
      const t = teams.find(x => x.index === myTeam);
      const owned = planets.filter(p => p.owner === myTeam);
      css(st.swatch, '--c', myColor);
      txt(st.team, myTeam >= 0 ? (str(me && me.teamName) || teamName(myTeam, teams)) : '우주 정복');
      txt(st.count, myTeam >= 0 ? `우리 팀 행성 ${num(t && t.planets, owned.length)}개 · ${num(t && t.score, owned.reduce((n, p) => n + num(p.size, 1), 0))}점` : '팀이 정해지면 여기에 표시돼요');
    }
  }

  // ---------- 7. 하늘 탑 쌓기 ----------
  const MAX_TOWERS = 10;
  function makeTowerCol() {
    const C = { blocks: [], fresh: true, h0: null };
    C.h = H('div', { class: 'md-theight' }); C.name = H('div', { class: 'md-tname' });
    C.stack = H('div', { class: 'md-tstack' }); C.base = H('div', { class: 'md-tbase' });
    C.node = H('div', { class: 'md-tcol' }, crownSVG(), C.h, C.stack, C.base, C.name);
    return C;
  }
  function towerHost(root, v) {
    const st = prep(root, 'tower:host', ['md-host', 'md-tower'], (st) => {
      st.cols = H('div', { class: 'md-tcols' }); st.more = H('div', { class: 'md-more' });
      st.empty = H('div', { class: 'md-empty-msg md-dark', text: '참가자가 들어오면 탑 자리가 생겨요' });
      st.stage = H('div', { class: 'md-stage md-sky', role: 'img', 'aria-label': '하늘 탑 쌓기' },
        cloud('8%', '46s', '-10s', 1), cloud('22%', '60s', '-35s', 0.7), cloud('14%', '52s', '-22s', 1.2), cloud('34%', '70s', '-50s', 0.8),
        H('div', { class: 'md-ground' }), st.cols, st.empty, st.more);
      root.append(st.stage);
      st.map = new Map();
    });
    const s = ms(v);
    const towers = arr(s.towers).filter(t => t && t.id !== undefined && t.id !== null);
    const sorted = towers.slice().sort((a, b) => (num(b.height) - num(a.height)) || nameCmp(a, b));
    const shown = sorted.slice(0, MAX_TOWERS);
    const maxBlocks = Math.max(10, ...shown.map(t => Math.min(30, arr(t.blocks).length)));
    css(st.cols, '--n', Math.max(shown.length, 6)); css(st.cols, '--scale', maxBlocks);
    show(st.empty, shown.length === 0);
    const seen = new Set();
    shown.forEach((t, i) => {
      const key = str(t.id); seen.add(key);
      let C = st.map.get(key);
      if (!C) { C = makeTowerCol(); st.map.set(key, C); st.cols.append(C.node); }
      css(C.node, '--i', i);
      const blocks = arr(t.blocks).slice(-30);
      while (C.blocks.length < blocks.length) { const b = H('div', { class: 'md-block' }); if (!C.fresh && !st.first) b.classList.add('md-drop'); C.stack.append(b); C.blocks.push(b); }
      while (C.blocks.length > blocks.length) C.blocks.pop().remove();
      blocks.forEach((b, j) => { css(C.blocks[j], '--bc', safeColor(b && b.color) || colorFor(key)); cls(C.blocks[j], 'md-gold', !!(b && b.gold)); });
      C.fresh = false;
      const h = Math.max(0, Math.floor(num(t.height)));
      if (C.h0 !== null && h < C.h0 && !st.first) replay(C.node, 'md-wobble');
      C.h0 = h;
      txt(C.h, `${h}층`); txt(C.name, str(t.nickname));
      cls(C.node, 'md-top', i === 0 && h > 0);
      const hidden = h - blocks.reduce((n, b) => n + (b && b.gold ? 2 : 1), 0);
      txt(C.base, hidden > 0 ? `+${hidden}` : ''); show(C.base, hidden > 0);
    });
    for (const [k, C] of st.map) if (!seen.has(k)) { C.node.remove(); st.map.delete(k); }
    const rest = sorted.slice(MAX_TOWERS);
    txt(st.more, rest.length ? `그 외 ${rest.length}명 · 평균 ${Math.round(rest.reduce((n, t) => n + num(t.height), 0) / rest.length)}층` : '');
    attr(st.stage, 'aria-label', shown.length ? `하늘 탑 쌓기, 1위 ${str(shown[0].nickname)} ${num(shown[0].height)}층` : '하늘 탑 쌓기 대기');
  }
  function towerPlayer(root, v) {
    const st = prep(root, 'tower:player', ['md-player', 'md-tower'], (st) => {
      st.stack = H('div', { class: 'md-mstack' }); st.blocks = [];
      st.h = H('div', { class: 'md-big' }); st.rank = H('div', { class: 'md-sub' }); st.note = H('div', { class: 'md-note', text: '정답 1층, 빨리 맞히면 황금 블록 2층!' });
      root.append(H('div', { class: 'md-card md-tcard' }, H('div', { class: 'md-prow' }, H('div', { class: 'md-mtower' }, st.stack, H('div', { class: 'md-mground' })), H('div', { class: 'md-pinfo' }, st.h, st.rank)), st.note));
    });
    const s = ms(v), me = meOf(v);
    const towers = arr(s.towers).filter(Boolean);
    const sorted = towers.slice().sort((a, b) => (num(b.height) - num(a.height)) || nameCmp(a, b));
    const mine = me ? towers.find(t => str(t.id) === str(me.id)) : null;
    const blocks = arr(mine && mine.blocks).slice(-10);
    while (st.blocks.length < blocks.length) { const b = H('div', { class: 'md-block' + (st.first ? '' : ' md-drop') }); st.stack.append(b); st.blocks.push(b); }
    while (st.blocks.length > blocks.length) st.blocks.pop().remove();
    blocks.forEach((b, j) => { css(st.blocks[j], '--bc', safeColor(b && b.color) || '#1368ce'); cls(st.blocks[j], 'md-gold', !!(b && b.gold)); });
    const h = Math.max(0, Math.floor(num(mine && mine.height, num(me && me.score, 0))));
    const rk = mine ? sorted.indexOf(mine) + 1 : Math.floor(num(me && me.rank, 0));
    txt(st.h, `${h}층`);
    txt(st.rank, rk ? `${rk}위 / ${towers.length || num(me && me.playerCount, 0)}명` : '탑 쌓기 준비');
  }

  // ---------- 8. 행운의 보물상자 ----------
  const evKey = e => str(e && e.nickname) + '|' + str(e && e.text);
  function spawnFloat(st, layer, node, life) {
    css(node, '--x', (8 + Math.random() * 62).toFixed(1) + '%');
    layer.append(node);
    const rm = () => node.remove();
    node.addEventListener('animationend', rm);
    later(st, rm, life);
    while (layer.children.length > 10) layer.firstChild.remove();
  }
  function treasureHost(root, v) {
    const st = prep(root, 'treasure:host', ['md-host', 'md-treasure'], (st) => {
      st.bars = makeBars(10); st.feed = H('div', { class: 'md-feed' }); st.bubbles = H('div', { class: 'md-bubbles' });
      st.empty = H('div', { class: 'md-empty-msg', text: '정답을 맞히고 상자를 열면 금화가 쌓여요' });
      const sparkles = [['12%', '20%', '0s'], ['72%', '12%', '-1s'], ['88%', '48%', '-2s'], ['40%', '8%', '-.5s'], ['6%', '70%', '-1.5s']].map(([x, y, d]) => H('span', { class: 'md-spark', style: { left: x, top: y, '--dl': d } }));
      st.stage = H('div', { class: 'md-stage md-treasure-stage', role: 'img', 'aria-label': '행운의 보물상자' }, ...sparkles,
        H('div', { class: 'md-tr-main' }, H('div', { class: 'md-side-title', text: '금화 순위' }), H('div', { class: 'md-tr-bars' }, st.bars.node, st.empty)),
        H('div', { class: 'md-tr-side' }, H('div', { class: 'md-tr-chest' }, chestSVG('md-open md-glow')), H('div', { class: 'md-side-title', text: '최근 소식' }), st.feed),
        st.bubbles);
      root.append(st.stage);
    });
    const s = ms(v);
    const players = arr(s.players).filter(p => p && p.id !== undefined && p.id !== null);
    const sorted = players.slice().sort((a, b) => (num(b.gold) - num(a.gold)) || nameCmp(a, b));
    const max = Math.max(1, ...sorted.map(p => num(p.gold)));
    const GOLD = ['#ffd43b', '#e9ecef', '#f0a868'];
    st.bars.update(sorted.slice(0, 10).map((p, i) => ({ key: str(p.id), rank: i + 1, label: str(p.nickname), value: num(p.gold), max, color: GOLD[i] || '#fab005', display: `${num(p.gold)}` })));
    show(st.empty, sorted.length === 0);
    const events = arr(s.events).filter(e => e && typeof e === 'object');  // 최신이 앞
    const keys = events.map(evKey);
    if (!st.first) {
      const fresh = freshItems(st.prevKeys, events, evKey).slice(0, 4).reverse();
      fresh.forEach((e, i) => later(st, () => spawnFloat(st, st.bubbles, H('div', { class: 'md-bubble' + (/꽝/.test(str(e.text)) ? ' md-sad' : '') }, H('b', { text: str(e.nickname) }), ' ', H('span', { text: str(e.text) })), 5000), i * 450));
    }
    st.prevKeys = keys;
    const sig = keys.slice(0, 4).join('\n');
    if (st.feedSig !== sig) { st.feedSig = sig; st.feed.replaceChildren(...events.slice(0, 4).map(e => H('div', { class: 'md-feed-line' }, H('b', { text: str(e.nickname) }), ' ', str(e.text)))); }
    attr(st.stage, 'aria-label', sorted.length ? `행운의 보물상자, 1위 ${str(sorted[0].nickname)} 금화 ${num(sorted[0].gold)}` : '행운의 보물상자');
  }
  function treasurePlayer(root, v, send) {
    const st = prep(root, 'treasure:player', ['md-player', 'md-treasure'], (st) => {
      st.cRow = H('div', { class: 'md-chest-row' });
      st.chestBtns = [0, 1, 2].map(i => {
        const b = H('button', { type: 'button', class: 'md-chest-btn', 'aria-label': `${i + 1}번 상자 열기`, style: { '--d': (i * 0.22) + 's' }, onClick: () => pick(i) }, chestSVG(), H('span', { class: 'md-chest-num', text: `${i + 1}번` }));
        st.cRow.append(b); return b;
      });
      st.chests = H('div', { class: 'md-card md-chests' }, H('div', { class: 'md-big', text: '상자를 하나 고르세요' }), H('div', { class: 'md-sub', text: '금화, 두 배, 나눔, 꽝 중 무엇이 나올까요?' }), st.cRow);
      st.gold = H('div', { class: 'md-big' }); st.rank = H('div', { class: 'md-sub' });
      st.result = H('div', { class: 'md-result' }, st.resMain = H('b'), st.resSub = H('span'));
      st.info = H('div', { class: 'md-card md-tinfo' }, H('div', { class: 'md-prow' }, coinSVG(), H('div', { class: 'md-pinfo' }, st.gold, st.rank)), st.result, H('div', { class: 'md-note', text: '정답을 맞히면 보물상자를 열 수 있어요' }));
      root.append(st.chests, st.info);
      st.busy = false; st.awaiting = null;
    });
    st.send = send; st.view = v;
    function myGold(view) {
      const me = meOf(view); if (!me) return 0;
      const p = arr(ms(view).players).find(x => x && str(x.id) === str(me.id));
      return p ? num(p.gold) : num(me.score);
    }
    function pick(i) {
      if (st.busy || st.awaiting) return;
      st.busy = true; const before = myGold(st.view); const seq0 = num(st.view && st.view.result && st.view.result.seq, -1);
      st.chestBtns.forEach((b, j) => { b.disabled = true; cls(b, 'md-chosen', j === i); cls(b, 'md-dim', j !== i); });
      act(st.send, 'chest', i).then(() => { st.awaiting = { before, seenOff: false, seq: seq0 }; st.busy = false; try { update(st.view); } catch {} },
        () => { st.busy = false; resetChests(); });
    }
    function resetChests() { st.chestBtns.forEach(b => { b.disabled = false; cls(b, 'md-chosen', false); cls(b, 'md-dim', false); }); }
    function update(view) {
      const a = view.actions, me = meOf(view);
      const choosing = !!(a && a.kind === 'chest' && num(a.remaining) > 0);
      if (choosing && st.awaiting && st.awaiting.seenOff) { st.awaiting = null; }
      if (choosing && !st.busy && !st.awaiting) resetChests();
      const showChests = choosing && !st.awaiting;
      show(st.chests, showChests || st.busy); show(st.info, !(showChests || st.busy));
      if (!choosing && st.awaiting) st.awaiting.seenOff = true;
      const gold = myGold(view);
      txt(st.gold, `금화 ${gold}`);
      const players = arr(ms(view).players).filter(Boolean);
      const sorted = players.slice().sort((x, y) => num(y.gold) - num(x.gold));
      const idx = me ? sorted.findIndex(p => str(p.id) === str(me.id)) : -1;
      txt(st.rank, idx >= 0 ? `${idx + 1}위 / ${players.length}명` : (me && me.rank ? `${me.rank}위` : '보물 사냥 준비'));
      if (st.awaiting) {
        const r = view.result;
        const fromResult = r && r.chest !== undefined && num(r.seq, -1) !== st.awaiting.seq ? r : null;
        const delta = fromResult ? num(fromResult.points) : gold - st.awaiting.before;
        let msg = fromResult ? str(fromResult.message) : '';
        if (!msg && me) { const e = arr(ms(view).events).find(x => x && str(x.nickname) === str(me.nickname)); if (e) msg = str(e.text); }
        txt(st.resMain, delta > 0 ? `+${delta} 금화!` : (/나눔/.test(msg) ? '나눔 상자!' : msg ? '상자를 열었어요' : '상자를 여는 중…'));
        txt(st.resSub, msg);
        show(st.result, true); cls(st.result, 'md-sad', delta <= 0 && /꽝/.test(msg));
      } else show(st.result, false);
    }
    update(v);
  }

  // ---------- 9. 우리반 꽃밭 ----------
  function gardenHost(root, v) {
    const st = prep(root, 'garden:host', ['md-host', 'md-garden'], (st) => {
      st.field = H('div', { class: 'md-field' }); st.fl = new Map();
      st.ptext = H('span'); st.fill = H('div', { class: 'md-gprog-fill' }); st.banner = makeBanner();
      st.stage = H('div', { class: 'md-stage md-garden-stage', role: 'img', 'aria-label': '우리반 꽃밭' },
        H('div', { class: 'md-gsky' }, H('div', { class: 'md-sun' }, sunSVG()), cloud('18%', '55s', '-12s', 0.9), cloud('40%', '70s', '-40s', 0.7)),
        H('div', { class: 'md-ghill md-h1' }), H('div', { class: 'md-ghill md-h2' }),
        H('div', { class: 'md-bfly md-f1' }, butterflySVG('#f783ac')), H('div', { class: 'md-bfly md-f2' }, butterflySVG('#ffd43b')),
        st.field,
        H('div', { class: 'md-gprog' }, H('div', { class: 'md-gprog-label' }, st.ptext), H('div', { class: 'md-gprog-track' }, st.fill)),
        st.banner);
      root.append(st.stage);
    });
    const s = ms(v);
    const flowers = arr(s.flowers).filter(f => f && typeof f === 'object').slice(-200);
    const goal = Math.max(0, num(s.goal, 0)); const bloomed = Math.max(0, num(s.bloomed, flowers.length));
    const dup = new Map(); const seen = new Set(); let newCount = 0;
    flowers.forEach(f => {
      const base = `${num(f.x)}|${num(f.y)}|${num(f.kind)}|${str(f.by)}`; const c = (dup.get(base) || 0) + 1; dup.set(base, c);
      const key = base + '#' + c; seen.add(key);
      if (st.fl.has(key)) return;
      const x = clamp(num(f.x, 50), 0, 100), y = clamp(num(f.y, 60), 0, 100);
      const n = H('div', { class: 'md-flower', style: { '--x': x, '--y': (8 + y * 0.9).toFixed(1), '--sc': (0.7 + y / 100 * 0.55).toFixed(2), '--sw': (-(hash(key) % 40) / 10) + 's', zIndex: String(Math.round(y)) } }, flowerSVG(f.kind));
      if (!st.first) { n.classList.add('md-pop'); css(n, '--pd', (Math.min(newCount, 20) * 0.12).toFixed(2) + 's'); newCount++; }
      st.field.append(n); st.fl.set(key, n);
    });
    for (const [k, n] of st.fl) if (!seen.has(k)) { n.remove(); st.fl.delete(k); }
    txt(st.ptext, goal > 0 ? `우리 반 꽃 ${bloomed} / ${goal}송이` : `우리 반 꽃 ${bloomed}송이`);
    css(st.fill, 'width', (goal > 0 ? clamp(bloomed / goal * 100, 0, 100) : 0).toFixed(1) + '%');
    const status = str(s.status);
    cls(st.stage, 'md-done', status === 'success');
    setBanner(st.banner, status === 'success' ? '목표 달성! 우리 반 꽃밭 완성' : status === 'failed' ? '조금 모자랐어요. 그래도 예쁜 꽃밭!' : '', status === 'failed');
    attr(st.stage, 'aria-label', `우리반 꽃밭, 꽃 ${bloomed}송이${goal ? ', 목표 ' + goal + '송이' : ''}`);
  }
  function gardenPlayer(root, v) {
    const st = prep(root, 'garden:player', ['md-player', 'md-garden'], (st) => {
      st.big = H('div', { class: 'md-big' }); st.fill = H('div', { class: 'md-mini-fill md-green' }); st.mine = H('div', { class: 'md-sub' }); st.note = H('div', { class: 'md-note' });
      root.append(H('div', { class: 'md-card' }, H('div', { class: 'md-flower-row' }, flowerSVG(0), flowerSVG(3), flowerSVG(2), flowerSVG(1), flowerSVG(4)), H('div', { class: 'md-sub', text: '지금까지 우리 반 꽃' }), st.big, H('div', { class: 'md-mini-track' }, st.fill), st.mine, st.note));
    });
    const s = ms(v), me = meOf(v);
    const goal = Math.max(0, num(s.goal, 0)); const flowers = arr(s.flowers).filter(Boolean); const bloomed = Math.max(0, num(s.bloomed, flowers.length));
    txt(st.big, goal > 0 ? `${bloomed} / ${goal}송이` : `${bloomed}송이`);
    css(st.fill, 'width', (goal > 0 ? clamp(bloomed / goal * 100, 0, 100) : 0).toFixed(1) + '%');
    const mine = me ? flowers.filter(f => str(f.by) === str(me.nickname)).length : 0;
    txt(st.mine, `내가 피운 꽃 ${mine}송이`);
    const status = str(s.status);
    txt(st.note, status === 'success' ? '목표 달성! 우리 반 꽃밭 완성' : status === 'failed' ? '조금 모자랐지만 예쁜 꽃밭이에요' : '정답을 맞히면 꽃이 피어요');
  }

  // ---------- 10. 보스 레이드 ----------
  const hitKey = h => str(h && h.nickname) + '|' + num(h && h.damage);
  function bossHost(root, v) {
    const st = prep(root, 'boss:host', ['md-host', 'md-boss'], (st) => {
      st.name = H('div', { class: 'md-bname' });
      st.hp = H('div', { class: 'md-hp' }, st.hpLag = H('div', { class: 'md-hp-lag' }), st.hpFill = H('div', { class: 'md-hp-fill' }), st.hpText = H('div', { class: 'md-hp-text' }));
      st.shFill = H('div', { class: 'md-sh-fill' }); st.shText = H('span', { class: 'md-sh-text' });
      st.boss = H('div', { class: 'md-boss-body' }, bossSVG());
      st.hits = H('div', { class: 'md-hits' }); st.banner = makeBanner();
      st.stage = H('div', { class: 'md-stage md-arena', role: 'img', 'aria-label': '보스 레이드' },
        H('div', { class: 'md-floorglow' }),
        H('div', { class: 'md-bhud' }, st.name, st.hp, H('div', { class: 'md-shield-row' }, shieldSVG(), H('span', { text: '우리 반 방패' }), H('div', { class: 'md-shbar' }, st.shFill), st.shText)),
        H('div', { class: 'md-boss-wrap' }, st.boss, st.hits), st.banner);
      root.append(st.stage);
      st.prevHp = null;
    });
    const s = ms(v);
    const max = Math.max(0, num(s.bossMaxHp, 0)); const hp = max > 0 ? clamp(num(s.bossHp, max), 0, max) : 0;
    const pct = max > 0 ? hp / max * 100 : 100;
    txt(st.name, str(s.bossName) || '말랑 대왕');
    css(st.hpFill, 'width', pct.toFixed(1) + '%'); css(st.hpLag, 'width', pct.toFixed(1) + '%');
    cls(st.hp, 'md-mid', pct <= 50 && pct > 20); cls(st.hp, 'md-low', pct <= 20);
    txt(st.hpText, max > 0 ? `${hp} / ${max}` : '체력 가득');
    if (st.prevHp !== null && max > 0 && hp < st.prevHp && !st.first) replay(st.boss, 'md-hurt');
    st.prevHp = max > 0 ? hp : null;
    const shield = clamp(num(s.shield, 100), 0, 100);
    css(st.shFill, 'width', shield.toFixed(1) + '%'); txt(st.shText, `${Math.round(shield)}%`);
    cls(st.shFill, 'md-red', shield < 30);
    const hits = arr(s.hits).filter(h => h && typeof h === 'object');  // 최신이 앞
    if (!st.first) {
      const fresh = freshItems(st.prevHits, hits, hitKey).slice(0, 8).reverse();
      fresh.forEach((h, i) => later(st, () => {
        const n = H('div', { class: 'md-hit', style: { '--hx': ((Math.random() * 60) - 30).toFixed(0) + '%', '--hy': ((Math.random() * 30) - 10).toFixed(0) + '%' } }, H('b', { text: `-${Math.round(num(h.damage))}` }), H('span', { text: str(h.nickname) }));
        st.hits.append(n);
        const rm = () => n.remove(); n.addEventListener('animationend', rm); later(st, rm, 2500);
        while (st.hits.children.length > 12) st.hits.firstChild.remove();
      }, i * 220));
    }
    st.prevHits = hits.map(hitKey);
    const status = str(s.status);
    cls(st.boss, 'md-ko', status === 'victory'); cls(st.boss, 'md-win', status === 'defeat');
    setBanner(st.banner, status === 'victory' ? '보스를 물리쳤어요! 승리' : status === 'defeat' ? '방패가 부서졌어요. 보스가 버텼어요' : '', status === 'defeat');
    attr(st.stage, 'aria-label', `보스 레이드, ${str(s.bossName) || '보스'} 체력 ${Math.round(pct)}퍼센트, 방패 ${Math.round(shield)}퍼센트`);
  }
  function bossPlayer(root, v) {
    const st = prep(root, 'boss:player', ['md-player', 'md-boss'], (st) => {
      st.name = H('div', { class: 'md-big' }); st.fill = H('div', { class: 'md-mini-fill md-hpcol' }); st.hpText = H('div', { class: 'md-small' }); st.sfill = H('div', { class: 'md-mini-fill md-blue' }); st.note = H('div', { class: 'md-note' });
      root.append(H('div', { class: 'md-card' }, H('div', { class: 'md-prow' }, H('div', { class: 'md-boss-mini' }, bossSVG()), H('div', { class: 'md-pinfo' }, st.name, st.hpText)),
        H('div', { class: 'md-mini-label', text: '보스 체력' }), H('div', { class: 'md-mini-track' }, st.fill), H('div', { class: 'md-mini-label', text: '우리 반 방패' }), H('div', { class: 'md-mini-track' }, st.sfill), st.note));
    });
    const s = ms(v);
    const max = Math.max(0, num(s.bossMaxHp, 0)); const hp = max > 0 ? clamp(num(s.bossHp, max), 0, max) : 0; const pct = max > 0 ? hp / max * 100 : 100;
    txt(st.name, str(s.bossName) || '말랑 대왕');
    css(st.fill, 'width', pct.toFixed(1) + '%'); cls(st.fill, 'md-red', pct <= 20);
    txt(st.hpText, max > 0 ? `체력 ${hp} / ${max}` : '체력 가득');
    css(st.sfill, 'width', clamp(num(s.shield, 100), 0, 100).toFixed(1) + '%');
    const status = str(s.status);
    txt(st.note, status === 'victory' ? '우리 반이 보스를 물리쳤어요!' : status === 'defeat' ? '아쉬워요. 다음엔 꼭 이겨요!' : '정답을 맞혀 공격하세요');
  }

  // ---------- 아이콘 ----------
  function iconBox(color, ...kids) { return S('svg', { viewBox: '0 0 64 64', width: 64, height: 64, class: 'md-icon', 'aria-hidden': 'true', focusable: 'false' }, S('rect', { width: 64, height: 64, rx: 14, fill: color }), ...kids); }
  const ICONS = {
    classic: c => iconBox(c, S('polygon', { points: '19,9 30,28 8,28', fill: '#e21b3c' }), S('polygon', { points: '45,7 56,18 45,29 34,18', fill: '#1368ce' }), S('circle', { cx: 19, cy: 46, r: 10, fill: '#d89e00' }), S('rect', { x: 35, y: 36, width: 20, height: 20, rx: 2, fill: '#26890c' })),
    robot: c => iconBox(c, S('rect', { x: 4, y: 54, width: 56, height: 4, rx: 2, fill: 'rgba(255,255,255,.4)' }), nest(robotSVG('#74c0fc'), 12, 4, 40, 50)),
    marble: c => iconBox(c, S('path', { d: 'M6 20 L58 30', stroke: '#f1dfb4', 'stroke-width': 7, 'stroke-linecap': 'round' }), S('path', { d: 'M58 44 L6 54', stroke: '#f1dfb4', 'stroke-width': 7, 'stroke-linecap': 'round' }), S('circle', { cx: 20, cy: 15, r: 6.5, fill: '#e21b3c', stroke: '#fff', 'stroke-width': 1.5 }), S('circle', { cx: 40, cy: 19, r: 6.5, fill: '#ffd43b', stroke: '#fff', 'stroke-width': 1.5 }), S('circle', { cx: 30, cy: 42, r: 6.5, fill: '#1368ce', stroke: '#fff', 'stroke-width': 1.5 })),
    submarine: c => iconBox(c, S('circle', { cx: 50, cy: 14, r: 3, fill: 'none', stroke: '#9be7ff', 'stroke-width': 1.5 }), S('circle', { cx: 55, cy: 8, r: 2, fill: 'none', stroke: '#9be7ff', 'stroke-width': 1.5 }), nest(subSVG(), 5, 18, 54, 31), S('path', { d: 'M4 56 Q16 50 28 56 T52 56 T64 56 V64 H4 Z', fill: '#c2a66b' })),
    kingdom: c => { const cols = ['#e21b3c', '#1368ce', '#d89e00', '#26890c', '#f3f0ff', '#e21b3c', '#1368ce', '#26890c', '#d89e00']; return iconBox(c, ...cols.map((f, i) => S('rect', { x: 8 + (i % 3) * 17, y: 8 + Math.floor(i / 3) * 17, width: 14, height: 14, rx: 2.5, fill: f }))); },
    space: c => iconBox(c, S('circle', { cx: 12, cy: 12, r: 1.5, fill: '#fff' }), S('circle', { cx: 52, cy: 10, r: 1.2, fill: '#fff' }), S('circle', { cx: 50, cy: 52, r: 1.5, fill: '#fff' }), S('circle', { cx: 10, cy: 48, r: 1, fill: '#fff' }), S('circle', { cx: 32, cy: 33, r: 13, fill: '#ffa94d' }), S('circle', { cx: 27, cy: 28, r: 4, fill: '#fff', opacity: 0.4 }), S('ellipse', { cx: 32, cy: 33, rx: 24, ry: 7, fill: 'none', stroke: '#ffd43b', 'stroke-width': 3, transform: 'rotate(-18 32 33)' })),
    tower: c => iconBox(c, S('rect', { x: 0, y: 56, width: 64, height: 8, fill: '#51cf66' }), S('rect', { x: 20, y: 44, width: 24, height: 12, rx: 2, fill: '#e21b3c', stroke: 'rgba(0,0,0,.3)' }), S('rect', { x: 20, y: 32, width: 24, height: 12, rx: 2, fill: '#1368ce', stroke: 'rgba(0,0,0,.3)' }), S('rect', { x: 20, y: 20, width: 24, height: 12, rx: 2, fill: '#26890c', stroke: 'rgba(0,0,0,.3)' }), S('rect', { x: 20, y: 8, width: 24, height: 12, rx: 2, fill: '#ffd43b', stroke: '#b07d00' })),
    treasure: c => iconBox(c, nest(chestSVG('md-open'), 7, 10, 50, 44)),
    garden: c => iconBox(c, S('rect', { x: 0, y: 50, width: 64, height: 14, fill: '#51cf66' }), nest(flowerSVG(3), 6, 10, 28, 44), nest(flowerSVG(2), 30, 4, 30, 50)),
    boss: c => iconBox(c, nest(bossSVG(), 5, 6, 54, 54))
  };

  // ---------- 모드 목록 ----------
  const META = [
    { id: 'classic', name: '클래식', tag: '카훗 클래식 스타일', pacing: 'host', teams: false, original: false, color: '#46178f', description: '모두가 같은 문제를 동시에 풀고 빠르고 정확할수록 높은 점수를 받아요.', howTo: ['큰 화면의 문제를 보고 내 기기에서 답을 골라요.', '빨리 맞힐수록 점수가 높아요.', '문제마다 순위가 바뀌니 끝까지 집중해요.'], renderHost: classicHost, renderPlayer: classicPlayer },
    { id: 'robot', name: '로봇 경주', tag: '카훗 로봇 경주 스타일', pacing: 'player', teams: false, original: false, color: '#1368ce', description: '각자 자기 속도로 문제를 풀며 내 로봇을 결승선까지 달리게 해요.', howTo: ['정답을 맞히면 로봇이 한 칸 앞으로 가요.', '세 번 연속 맞히면 터보로 한 칸 더 가요.', '틀리면 3초 동안 로봇을 수리해요.'], renderHost: robotHost, renderPlayer: robotPlayer },
    { id: 'marble', name: '마블 레이스', tag: '카훗 마블 레이스 스타일', pacing: 'player', teams: false, original: false, color: '#0aa3a3', description: '정답을 맞힐 때마다 내 구슬이 구불구불한 코스를 굴러 내려가요.', howTo: ['빨리 맞힐수록 구슬이 멀리 굴러가요.', '연속으로 맞히면 보너스 가속이 붙어요.', '틀리면 구슬이 살짝 뒤로 튕겨요.'], renderHost: marbleHost, renderPlayer: marblePlayer },
    { id: 'submarine', name: '잠수함 특공대', tag: '카훗 잠수함 특공대 스타일', pacing: 'host', teams: false, original: false, color: '#0b4f8a', description: '우리 반 정답률로 잠수함을 바다 밑 보물까지 내려보내는 협동 모드예요.', howTo: ['모두가 같은 문제를 함께 풀어요.', '정답률이 높을수록 잠수함이 깊이 내려가요.', '오답이 많으면 산소가 줄어드니 함께 힘내요.'], renderHost: subHost, renderPlayer: subPlayer },
    { id: 'kingdom', name: '컬러 킹덤', tag: '카훗 컬러 킹덤 스타일', pacing: 'host', teams: true, original: false, color: '#e8590c', description: '팀별로 정답을 맞혀 지도 위 땅을 우리 팀 색으로 칠해요.', howTo: ['정답을 맞히면 땅을 차지할 기회가 생겨요.', '정답 공개 때 내 기기에서 원하는 칸을 눌러요.', '다른 팀 땅도 빼앗을 수 있어요.'], renderHost: kingdomHost, renderPlayer: kingdomPlayer },
    { id: 'space', name: '우주 정복', tag: '카훗 우주 정복 스타일', pacing: 'host', teams: true, original: false, color: '#25076b', description: '팀별로 에너지를 모아 행성을 차지하는 우주 전략 모드예요.', howTo: ['정답을 맞히면 에너지를 얻어요.', '정답 공개 때 행성을 골라 에너지를 보내요.', '에너지가 가장 많은 팀이 행성을 차지해요.'], renderHost: spaceHost, renderPlayer: spacePlayer },
    { id: 'tower', name: '하늘 탑 쌓기', tag: '반짝 오리지널', pacing: 'player', teams: false, original: true, color: '#339af0', description: '정답 블록을 하나씩 쌓아 하늘 높이 나만의 탑을 올려요.', howTo: ['정답을 맞히면 블록이 한 층 올라가요.', '빨리 맞히면 황금 블록으로 두 층이 올라가요.', '틀리면 맨 위 블록이 하나 무너져요.'], renderHost: towerHost, renderPlayer: towerPlayer },
    { id: 'treasure', name: '행운의 보물상자', tag: '반짝 오리지널', pacing: 'player', teams: false, original: true, color: '#b8860b', description: '정답을 맞힐 때마다 보물상자를 골라 금화를 모으는 행운 모드예요.', howTo: ['정답을 맞히면 상자 세 개 중 하나를 골라요.', '금화, 두 배, 나눔, 꽝 중 무엇이 나올지 몰라요.', '금화를 가장 많이 모은 사람이 이겨요.'], renderHost: treasureHost, renderPlayer: treasurePlayer },
    { id: 'garden', name: '우리반 꽃밭', tag: '반짝 오리지널', pacing: 'host', teams: false, original: true, color: '#26890c', description: '우리 반이 함께 정답을 맞혀 들판을 꽃으로 가득 채우는 협동 모드예요.', howTo: ['정답 하나마다 꽃 한 송이가 피어요.', '두 배 문제는 꽃이 두 송이 피어요.', '끝날 때 목표만큼 피우면 성공이에요.'], renderHost: gardenHost, renderPlayer: gardenPlayer },
    { id: 'boss', name: '보스 레이드', tag: '반짝 오리지널', pacing: 'host', teams: false, original: true, color: '#864cbf', description: '우리 반이 힘을 모아 정답으로 귀여운 보스 몬스터를 물리치는 협동 모드예요.', howTo: ['정답을 맞히면 점수만큼 보스에게 피해를 줘요.', '오답이 많으면 우리 반 방패가 줄어들어요.', '방패가 남아 있을 때 보스를 쓰러뜨리면 승리예요.'], renderHost: bossHost, renderPlayer: bossPlayer }
  ];

  const list = META.map(m => {
    const mode = {
      id: m.id, name: m.name, tag: m.tag, pacing: m.pacing, teams: m.teams, original: m.original, color: m.color,
      description: m.description, howTo: m.howTo.slice(),
      icon() { try { return ICONS[m.id](m.color); } catch { return iconBox(m.color); } },
      dispose
    };
    const wrap = (fn, role) => function (root, view, sendAction) {
      if (!root || typeof root.append !== 'function') return;
      try { fn(root, (view && typeof view === 'object') ? view : {}, sendAction); }
      catch (e) {
        try {
          if (!wrap.warned) { wrap.warned = true; console.warn('[반짝퀴즈 모드]', m.id, role, e); }
          if (!root.querySelector(':scope > .md-fallback')) root.append(H('div', { class: 'md-fallback', text: m.name }));
        } catch {}
      }
    };
    mode.renderHost = wrap(m.renderHost, 'host');
    mode.renderPlayer = wrap(m.renderPlayer, 'player');
    return Object.freeze(mode);
  });
  const byId = new Map(list.map(m => [m.id, m]));
  window.KQModes = Object.freeze({
    list,
    get(id) { return byId.get(String(id)) || null; },
    dispose
  });
})();
