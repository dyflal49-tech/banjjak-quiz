'use strict';
/* 반짝퀴즈 카훗형 모드: 우주 정복 (팀 타워 쌓기, mode id 'space', modeState.kind 'tower')
   진행자: 팀 타워가 나란히 우주로 올라가는 무대. 학생: 상태 띠 + 블록 떨어뜨리기 미니게임. */
(() => {
  const KQ = window.KQ || (window.KQ = {});
  KQ.arena = KQ.arena || {};

  const kit = () => KQ.modeKit || null;
  const snd = k => { try { if (KQ.sound && KQ.sound.play) KQ.sound.play(k); } catch {} };
  const fx = (name, ...a) => { try { if (KQ.fx && typeof KQ.fx[name] === 'function') KQ.fx[name](...a); } catch {} };
  const nowT = () => { try { return KQ.now ? KQ.now() : Date.now(); } catch { return Date.now(); } };
  const N = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const A = a => Array.isArray(a) ? a : [];
  const S2 = v => (v === null || v === undefined) ? '' : String(v);
  const clampN = (v, a, b) => Math.min(b, Math.max(a, v));
  const reduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
  const TEAM_COLORS = ['#e21b3c', '#1368ce', '#d89e00', '#26890c'];
  const TEAM_NAMES = ['빨강 팀', '파랑 팀', '노랑 팀', '초록 팀'];
  const TUTORIAL = ['팀과 힘을 합쳐 가장 높은 타워를 건설해 보세요.', '건축용 블록을 얻으려면 질문에 올바르게 답하세요.', '블록을 떨어뜨려서 최대한 많은 층을 건축하세요.', '보너스 층까지 쌓으면 파워업 블록을 받아요.'];
  const ZONE_MID = 10, ZONE_SPACE = 25;

  function teamList(v, s) {
    const K = kit();
    let t = [];
    try { t = K ? K.teamsOf(v) : []; } catch { t = []; }
    const n = Math.max(A(s.towers).length, t.length, 2);
    const out = [];
    for (let i = 0; i < Math.min(4, n); i++) {
      const f = t.find(x => x.index === i) || {};
      out.push({ index: i, name: S2(f.name) || TEAM_NAMES[i], color: (K && K.safeColor(f.color)) || TEAM_COLORS[i], members: N(f.members) });
    }
    return out;
  }
  const towerOf = (s, i) => { const t = A(s.towers)[i]; return { height: Math.max(0, Math.floor(N(t && t.height))), blocks: A(t && t.blocks) }; };
  const shade = (c, f) => { const K = kit(); return K ? K.shade(c, f) : c; };

  // ---------- 블록 그림 (Kahoot 우주 정복 금속 블록: 노랑-검정 경고 줄무늬) ----------
  function hazardDefs(S, id) {
    return S('pattern', { id, width: 12, height: 12, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
      S('rect', { width: 12, height: 12, fill: '#ffd02e' }), S('rect', { width: 6, height: 12, fill: '#1f1b2e' }));
  }
  function blockShape(S, w, h, hz, opt = {}) {
    const metal = opt.gold ? '#f6d36b' : '#c5c1e4', dark = opt.gold ? '#9c7a12' : '#5b5683', mid = opt.gold ? '#e2b93b' : '#9d98c9';
    const g = S('g', { class: 'ar-tower-blk' + (opt.perfect ? ' ar-tower-perfect' : '') + (opt.gold ? ' ar-tower-goldblk' : '') });
    if (opt.perfect) g.append(S('rect', { x: -3, y: -3, width: w + 6, height: h + 6, rx: 6, class: 'ar-tower-glow' }));
    const pw = w * 0.13, ph = h * 0.46, py = h * 0.3;
    [0.14, 0.435, 0.73].forEach(px => {
      g.append(S('rect', { x: w * px, y: py, width: pw, height: ph, fill: mid, stroke: dark, 'stroke-width': 1.2 }));
      g.append(S('rect', { x: w * px - 1, y: py + ph * 0.42, width: pw + 2, height: ph * 0.18, rx: 1, fill: metal, stroke: dark, 'stroke-width': 1 }));
    });
    g.append(S('path', { d: `M${w * 0.06} ${h * 0.3} L${w * 0.94} ${h * 0.3} L${w * 0.82} ${h * 0.46} L${w * 0.18} ${h * 0.46} Z`, fill: mid, stroke: dark, 'stroke-width': 1 }));
    g.append(S('rect', { x: 0, y: 0, width: w, height: h * 0.32, rx: 3, fill: metal, stroke: dark, 'stroke-width': 1.5 }));
    g.append(S('rect', { x: w * 0.03, y: h * 0.1, width: w * 0.94, height: h * 0.13, fill: `url(#${hz})` }));
    g.append(S('path', { d: `M${w * 0.18} ${h * 0.76} L${w * 0.82} ${h * 0.76} L${w * 0.96} ${h * 0.88} L${w * 0.04} ${h * 0.88} Z`, fill: mid, stroke: dark, 'stroke-width': 1 }));
    g.append(S('rect', { x: 0, y: h * 0.86, width: w, height: h * 0.14, rx: 2, fill: metal, stroke: dark, 'stroke-width': 1.5 }));
    if (opt.team) g.append(S('rect', { x: w * 0.42, y: h * 0.89, width: w * 0.16, height: h * 0.07, rx: 1, fill: opt.team }));
    return g;
  }
  function shieldShape(S, color, size) {
    const k = size / 40;
    return S('g', { class: 'ar-tower-shield' },
      S('path', { d: 'M20 1 L38 6 V19 C38 30 30 37 20 40 C10 37 2 30 2 19 V6 Z', fill: color, stroke: '#fff', 'stroke-width': 2.5, transform: `scale(${k})` }),
      S('path', { d: 'M20 7 L23.5 15 L32 15.6 L25.5 21 L27.6 29.5 L20 25 L12.4 29.5 L14.5 21 L8 15.6 L16.5 15 Z', fill: '#fff', opacity: 0.9, transform: `scale(${k})` }));
  }

  // =====================================================================
  // 진행자 무대
  // =====================================================================
  const VW = 900, VH = 520, GROUND = 440, BH = 30, HEAD = 70;

  function host(root, view) {
    const K = kit(); if (!K) return;
    const { H, S } = K;
    const s = K.ms(view);
    const teams = teamList(view, s);
    const n = teams.length;
    const st = K.prep(root, 'tower:host:' + n, ['ar-tower', 'ar-tower-host'], (st) => buildHost(st, root, n, teams, K));
    updateHost(st, view, s, teams, K);
  }

  function buildHost(st, root, n, teams, K) {
    const { H, S } = K;
    const u = 'art' + st.uid;
    st.hz = u + 'hz';
    st.colW = VW / n; st.BW = Math.min(76, st.colW * 0.32);
    st.cx = i => st.colW * (i + 0.5);
    const svg = S('svg', { viewBox: `0 0 ${VW} ${VH}`, preserveAspectRatio: 'xMidYMid meet', class: 'ar-tower-svg', role: 'img', 'aria-label': '우주 정복 타워 무대' });
    const yOf = f => GROUND - f * BH;
    svg.append(S('defs', {},
      hazardDefs(S, st.hz),
      S('linearGradient', { id: u + 'zl', x1: 0, y1: yOf(ZONE_MID), x2: 0, y2: GROUND + 80, gradientUnits: 'userSpaceOnUse' }, S('stop', { offset: 0, 'stop-color': '#5b3cc4' }), S('stop', { offset: 1, 'stop-color': '#d9c6ff' })),
      S('linearGradient', { id: u + 'zm', x1: 0, y1: yOf(ZONE_SPACE), x2: 0, y2: yOf(ZONE_MID), gradientUnits: 'userSpaceOnUse' }, S('stop', { offset: 0, 'stop-color': '#2a1270' }), S('stop', { offset: 1, 'stop-color': '#5b3cc4' })),
      S('linearGradient', { id: u + 'zs', x1: 0, y1: yOf(ZONE_SPACE) - 500, x2: 0, y2: yOf(ZONE_SPACE), gradientUnits: 'userSpaceOnUse' }, S('stop', { offset: 0, 'stop-color': '#0b0624' }), S('stop', { offset: 1, 'stop-color': '#2a1270' })),
      S('radialGradient', { id: u + 'pl', cx: 0.35, cy: 0.35, r: 0.75 }, S('stop', { offset: 0, 'stop-color': '#f0c8ff' }), S('stop', { offset: 0.55, 'stop-color': '#b07cf2' }), S('stop', { offset: 1, 'stop-color': '#6b3fc9' }))));
    // 뒤쪽 세계(고도 구역, 별, 구름, 눈금, 보너스 선)
    st.back = S('g', { class: 'ar-tower-world' });
    st.back.append(S('rect', { x: -50, y: -40000, width: VW + 100, height: 40000 + yOf(ZONE_SPACE) - 500 + 1, fill: '#0b0624' }));
    st.back.append(S('rect', { x: -50, y: yOf(ZONE_SPACE) - 500, width: VW + 100, height: 501, fill: `url(#${u}zs)` }));
    st.back.append(S('rect', { x: -50, y: yOf(ZONE_SPACE), width: VW + 100, height: (ZONE_SPACE - ZONE_MID) * BH + 1, fill: `url(#${u}zm)` }));
    st.back.append(S('rect', { x: -50, y: yOf(ZONE_MID), width: VW + 100, height: ZONE_MID * BH + 200, fill: `url(#${u}zl)` }));
    let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const stars = S('g', { class: 'ar-tower-stars' });
    for (let i = 0; i < 260; i++) {
      const y = yOf(ZONE_MID + 4) - rnd() * 4200;
      stars.append(S('circle', { cx: rnd() * VW, cy: y, r: 0.6 + rnd() * 1.6, fill: '#fff', opacity: (0.35 + rnd() * 0.6).toFixed(2), class: i % 7 === 0 ? 'ar-tower-twinkle' : null }));
    }
    st.back.append(stars);
    const cloud = (x, y, k, o) => S('g', { transform: `translate(${x} ${y}) scale(${k})`, opacity: o, class: 'ar-tower-cloud' },
      S('ellipse', { cx: 0, cy: 0, rx: 60, ry: 16, fill: '#fff' }), S('ellipse', { cx: -24, cy: -10, rx: 26, ry: 16, fill: '#fff' }), S('ellipse', { cx: 18, cy: -14, rx: 30, ry: 20, fill: '#fff' }));
    [[120, yOf(3), 1, 0.35], [760, yOf(5), 1.2, 0.3], [430, yOf(8), 0.8, 0.25], [80, yOf(12), 0.9, 0.16], [690, yOf(15), 0.7, 0.13]].forEach(c => st.back.append(cloud(...c)));
    // 고도 구역 이름
    const zl = (f, t) => S('g', { class: 'ar-tower-zone' }, S('line', { x1: 0, x2: VW, y1: yOf(f), y2: yOf(f), stroke: 'rgba(255,255,255,.22)', 'stroke-width': 1 }), S('text', { x: VW - 10, y: yOf(f) - 8, 'text-anchor': 'end', text: t }));
    st.back.append(S('g', { class: 'ar-tower-zone' }, S('text', { x: VW - 10, y: GROUND - 10, 'text-anchor': 'end', text: '구름층' })));
    st.back.append(zl(ZONE_MID, `성층권 · ${ZONE_MID}층`), zl(ZONE_SPACE, `우주 · ${ZONE_SPACE}층`));
    st.rulerG = S('g', { class: 'ar-tower-ruler' }); st.bonusG = S('g', { class: 'ar-tower-bonus' });
    st.back.append(st.rulerG, st.bonusG);
    // 행성 (멀리 있어 천천히 움직임)
    st.par = S('g', { class: 'ar-tower-par' },
      S('g', { opacity: 0.55 }, S('circle', { cx: 735, cy: 170, r: 92, fill: `url(#${u}pl)` }), S('ellipse', { cx: 735, cy: 170, rx: 150, ry: 22, fill: 'none', stroke: '#e5c6ff', 'stroke-width': 5, opacity: 0.55, transform: 'rotate(-14 735 170)' })),
      S('g', { opacity: 0.4 }, S('circle', { cx: 150, cy: 250, r: 58, fill: '#c6b3ef' }), S('circle', { cx: 132, cy: 232, r: 12, fill: '#a996d8' }), S('circle', { cx: 170, cy: 270, r: 8, fill: '#a996d8' })),
      S('circle', { cx: 455, cy: 120, r: 14, fill: '#ffa94d', opacity: 0.55 }));
    // 앞쪽 세계(타워, 기지)
    st.front = S('g', { class: 'ar-tower-world' });
    st.T = teams.map((t, i) => {
      const cx = st.cx(i), bw = st.BW;
      const T = { i, map: new Map(), h0: null };
      T.base = S('g', { class: 'ar-tower-base' },
        S('rect', { x: cx - bw * 1.5, y: GROUND + 8, width: bw * 3, height: 120, rx: 4, fill: shade(t.color, -0.25) }),
        S('rect', { x: cx - bw * 1.5, y: GROUND + 8, width: bw * 3, height: 18, fill: t.color }),
        S('rect', { x: cx - bw * 1.75, y: GROUND, width: bw * 3.5, height: 9, rx: 3, fill: '#6f6a99', stroke: '#3f3a66', 'stroke-width': 1.5 }),
        S('rect', { x: cx - bw * 1.35, y: GROUND + 2.5, width: bw * 0.4, height: 3, rx: 1.5, fill: '#8fe3ff' }),
        S('rect', { x: cx + bw * 0.95, y: GROUND + 2.5, width: bw * 0.4, height: 3, rx: 1.5, fill: '#8fe3ff' }));
      T.beam = S('rect', { x: cx - bw * 0.55, y: -40000, width: bw * 1.1, height: 40000 + GROUND, fill: t.color, opacity: 0.12, class: 'ar-tower-beam' });
      T.pillar = S('rect', { x: cx - bw * 0.36, width: bw * 0.72, y: GROUND, height: 0, fill: '#8f8ab8', stroke: '#5b5683', 'stroke-width': 1.5, rx: 2 });
      T.blocks = S('g', {});
      T.pill = S('g', { class: 'ar-tower-hpill' }, S('rect', { x: -30, y: -15, width: 60, height: 26, rx: 13, fill: '#fff' }), T.pillText = S('text', { x: 0, y: 4, 'text-anchor': 'middle', fill: t.color, text: '0층' }));
      T.crown = K.nest(K.crownSVG(), -18, -46, 36, 26); T.crown.setAttribute('class', 'ar-tower-crown');
      T.pillWrap = S('g', { class: 'ar-tower-pillwrap' }, T.pill, T.crown);
      T.g = S('g', {}, T.beam, T.pillar, T.blocks, T.pillWrap);
      st.front.append(T.g);
      return T;
    });
    st.T.forEach(T => st.front.append(T.base));
    // 바닥 구름 띠
    const band = S('g', { class: 'ar-tower-groundcloud' });
    for (let x = -40; x < VW + 60; x += 70) band.append(S('ellipse', { cx: x + (x % 3) * 7, cy: GROUND + 62 + (x % 2) * 6, rx: 58, ry: 26, fill: '#efe6ff', opacity: 0.92 }));
    band.append(S('rect', { x: -50, y: GROUND + 70, width: VW + 100, height: 200, fill: '#efe6ff' }));
    st.front.append(band);
    // 떠오르는 글자 층
    st.floatG = S('g', { class: 'ar-tower-floats' });
    // 화면에 고정된 머리띠(팀 이름, 높이, 기여자)
    st.head = S('g', { class: 'ar-tower-head' });
    st.HD = teams.map((t, i) => {
      const x0 = i * st.colW + 6, w = st.colW - 12;
      const D = {};
      D.g = S('g', {},
        S('rect', { x: x0, y: 6, width: w, height: 40, rx: 10, fill: 'rgba(37,10,92,.82)' }),
        S('g', { transform: `translate(${x0 + 8} 9)` }, shieldShape(S, t.color, 34)),
        D.name = S('text', { x: x0 + 48, y: 32, class: 'ar-tower-tname', text: t.name }),
        D.h = S('text', { x: x0 + w - 12, y: 33, 'text-anchor': 'end', class: 'ar-tower-theight', text: '0층' }),
        D.crown = K.nest(K.crownSVG(), x0 + 12, -6, 26, 18),
        S('rect', { x: x0 + 8, y: 49, width: w - 16, height: 20, rx: 5, fill: 'rgba(255,255,255,.92)' }),
        D.who = S('text', { x: x0 + 16, y: 63.5, class: 'ar-tower-who', text: '' }));
      st.head.append(D.g);
      return D;
    });
    // 화면 아래로 벗어난 타워 표시
    st.offG = S('g', {});
    st.OFF = teams.map((t, i) => { const g = S('g', { class: 'ar-tower-off', transform: `translate(${st.cx(i)} ${VH - 40})` }, S('rect', { x: -40, y: -14, width: 80, height: 24, rx: 12, fill: t.color, stroke: '#fff', 'stroke-width': 2 }), S('path', { d: 'M-28 -6 L-18 -6 L-23 2 Z', fill: '#fff' }), S('text', { x: 6, y: 4, 'text-anchor': 'middle', text: '' })); st.offG.append(g); return g; });
    // 해설 띠
    st.sayBg = S('rect', { x: 150, y: VH - 30, width: 600, height: 24, rx: 12, fill: 'rgba(25,8,64,.78)' });
    st.say = S('text', { x: VW / 2, y: VH - 13, 'text-anchor': 'middle', class: 'ar-tower-say', text: '' });
    // 덮개(시작 전 안내, 결과)
    st.ov = S('g', { class: 'ar-tower-ov' });
    svg.append(st.back, st.par, st.front, st.floatG, st.head, st.offG, st.sayBg, st.say, st.ov);
    root.append(H('div', { class: 'ar-tower-stage' }, svg));
    st.svg = svg; st.rulerTop = 0; st.dropKeys = null; st.leader = null; st.ovKey = '';
  }

  function rebuildRuler(st, ceil, every, S) {
    if (st.rulerTop === ceil && st.bonusEvery === every) return;
    st.rulerTop = ceil; st.bonusEvery = every;
    st.rulerG.replaceChildren(); st.bonusG.replaceChildren();
    for (let f = 5; f <= ceil; f += 5) {
      const y = GROUND - f * BH;
      st.rulerG.append(S0(S, 'line', { x1: 0, x2: 14, y1: y, y2: y }), S0(S, 'text', { x: 18, y: y + 5, text: `${f}층` }));
    }
    if (every > 0) for (let f = every; f <= ceil + every; f += every) {
      const y = GROUND - f * BH;
      st.bonusG.append(S('line', { x1: 60, x2: VW - 10, y1: y, y2: y, class: 'ar-tower-bline' }),
        S('g', { transform: `translate(${VW / 2} ${y})` }, S('rect', { x: -58, y: -12, width: 116, height: 22, rx: 11, fill: '#ffd02e', stroke: '#8a5d00', 'stroke-width': 1.5 }), S('text', { x: 0, y: 4, 'text-anchor': 'middle', text: `보너스 ${f}층` })));
    }
  }
  const S0 = (S, t, a) => S(t, a);

  function updateHost(st, v, s, teams, K) {
    const { S } = K;
    const now = nowT();
    const every = Math.max(1, Math.floor(N(s.bonusEvery) || 10));
    const heights = teams.map((t, i) => towerOf(s, i).height);
    const maxH = Math.max(0, ...heights);
    rebuildRuler(st, Math.max(30, Math.ceil((maxH + 14) / 5) * 5), every, S);
    // 카메라: 가장 높은 타워 꼭대기가 머리띠 아래에 보이게
    const cam = Math.max(0, maxH * BH - (GROUND - HEAD - 130));
    const tf = `translateY(${cam}px)`;
    if (st.first) { st.back.style.transform = tf; st.front.style.transform = tf; st.floatG.style.transform = tf; }
    else { st.svg.classList.add('ar-tower-moving'); st.back.style.transform = tf; st.front.style.transform = tf; st.floatG.style.transform = tf; }
    st.par.style.transform = `translateY(${Math.min(160, cam * 0.08)}px)`;
    const lead = maxH > 0 && heights.filter(h => h === maxH).length === 1 ? heights.indexOf(maxH) : -1;
    if (!st.first && lead >= 0 && st.leader !== lead && v.phase === 'running') { snd('sparkle'); }
    st.leader = lead;
    const builders = A(s.builders);
    teams.forEach((t, i) => {
      const T = st.T[i], D = st.HD[i]; if (!T || !D) return;
      const tw = towerOf(s, i), h = tw.height, bw = st.BW, cx = st.cx(i);
      const blocks = tw.blocks.slice(-40);
      const firstFloor = h - blocks.length + 1;
      const prevH = T.h0 === null ? h : T.h0;
      const seen = new Set(); let fresh = 0;
      blocks.forEach((b, j) => {
        const f = firstFloor + j; if (f < 1) return;
        const x = clampN(N(b && b.x), -1.3, 1.3), p = N(b && b.p) === 1;
        const key = f + ':' + x + ':' + (p ? 1 : 0); seen.add(f);
        const cur = T.map.get(f);
        if (cur && cur.key === key) return;
        if (cur) cur.g.remove();
        const inner = S('g', { class: 'ar-tower-fallin' }, blockShape(S, bw, BH, st.hz, { perfect: p, team: t.color }));
        const g = S('g', { transform: `translate(${(cx + x * bw - bw / 2).toFixed(1)} ${GROUND - f * BH})` }, inner);
        if (!st.first && f > prevH && !reduced()) { inner.style.animationDelay = (Math.min(fresh, 8) * 0.11) + 's'; inner.classList.add('ar-tower-anim'); fresh++; }
        T.map.set(f, { g, key });
        // 층 순서대로 끼우기
        let before = null; for (const [ff, o] of T.map) if (ff > f && (!before || ff < before.f)) before = { f: ff, g: o.g };
        if (before && before.g.parentNode === T.blocks) T.blocks.insertBefore(g, before.g); else T.blocks.append(g);
      });
      for (const [f, o] of T.map) if (!seen.has(f)) { o.g.remove(); T.map.delete(f); }
      // 기록이 잘린 아래층은 기둥으로
      const pf = Math.max(0, firstFloor - 1);
      T.pillar.setAttribute('y', GROUND - pf * BH); T.pillar.setAttribute('height', pf * BH);
      const topY = GROUND - h * BH;
      const topX = blocks.length ? cx + clampN(N(blocks[blocks.length - 1].x), -1.3, 1.3) * bw : cx;
      T.pillWrap.setAttribute('transform', `translate(${topX.toFixed(1)} ${topY - 14})`);
      T.pillText.textContent = `${h}층`;
      T.crown.style.display = i === lead ? '' : 'none';
      D.crown.style.display = i === lead ? '' : 'none';
      D.h.textContent = `${h}층`;
      const mine = builders.filter(b => b && b.team === i && N(b.floors) > 0).sort((a, b) => N(b.floors) - N(a.floors));
      const maxChars = Math.max(10, Math.floor(st.colW / 9));
      let line = mine.length ? mine.slice(0, 3).map(b => `${S2(b.nickname)} ${N(b.floors)}`).join(' · ') : (t.members ? `팀원 ${t.members}명 · 첫 블록을 기다려요` : '팀원을 기다려요');
      if (mine.length > 3) line += ` 외 ${mine.length - 3}명`;
      if (line.length > maxChars) line = line.slice(0, maxChars - 1) + '…';
      D.who.textContent = line;
      // 보너스 층 도착
      if (!st.first && v.phase === 'running' && Math.floor(h / every) > Math.floor(prevH / every)) {
        snd('levelup');
        floatText(st, S, topX, topY - 50, '보너스 층 도착!', 'ar-tower-fbonus');
      }
      T.h0 = h;
      // 화면 아래로 벗어났는지
      const off = st.OFF[i];
      const sy = topY + cam;
      off.style.display = sy > VH - 60 ? '' : 'none';
      off.lastChild.textContent = `${h}층`;
    });
    // 새로 쌓은 소식
    const drops = A(s.drops);
    const dk = d => `${S2(d && d.at)}|${S2(d && d.nickname)}`;
    if (st.dropKeys) {
      const fr = K.freshItems(st.dropKeys, drops, dk).slice(0, 4);
      fr.forEach((d, k) => {
        const i = N(d.team); const T = st.T[i]; if (!T) return;
        const h = towerOf(s, i).height;
        const x = st.cx(i) + (k % 2 ? 1 : -1) * st.BW * 1.2;
        const t = N(d.count) > 0 ? `${S2(d.nickname)} +${N(d.count)}층` : `${S2(d.nickname)} 아쉽게 실패`;
        floatText(st, S, x, GROUND - h * BH - 40 - k * 22, t, N(d.perfect) > 0 ? 'ar-tower-fperfect' : '');
        if (N(d.perfect) > 0) floatText(st, S, x, GROUND - h * BH - 62 - k * 22, `완벽 ${N(d.perfect)}`, 'ar-tower-fperfect');
      });
      if (fr.length && v.phase === 'running') snd('pop');
    }
    st.dropKeys = drops.map(dk);
    // 해설
    const say = commentary(v, teams, heights, every, drops);
    st.say.textContent = say;
    const wSay = Math.min(VW - 20, 40 + say.length * 15);
    st.sayBg.setAttribute('x', (VW - wSay) / 2); st.sayBg.setAttribute('width', wSay);
    // 덮개
    overlay(st, v, s, teams, heights, K);
    st.svg.setAttribute('aria-label', '우주 정복, ' + teams.map((t, i) => `${t.name} ${heights[i]}층`).join(', '));
  }

  function floatText(st, S, x, y, text, extra) {
    if (st.floatG.childNodes.length > 14) st.floatG.firstChild.remove();
    const g = S('g', { transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` }, S('text', { x: 0, y: 0, 'text-anchor': 'middle', class: 'ar-tower-float ' + (extra || ''), text }));
    st.floatG.append(g);
    const K = kit(); if (K) K.later(st, () => g.remove(), 2600);
  }

  function commentary(v, teams, heights, every, drops) {
    if (v.phase === 'countdown') return '곧 시작해요! 정답을 맞혀 건축용 블록을 모아요.';
    const order = teams.map((t, i) => ({ t, h: heights[i] })).sort((a, b) => b.h - a.h);
    if (v.phase === 'finished') return order[0].h > 0 ? `${order[0].t.name}이 ${order[0].h}층으로 가장 높은 타워를 지었어요!` : '게임이 끝났어요.';
    if (order[0].h === 0) return '정답을 맞혀 첫 블록을 떨어뜨려 보세요!';
    const near = order.find(o => { const left = every - (o.h % every); return left <= 3 && o.h > 0; });
    const d0 = drops[0];
    if (d0 && nowT() - N(d0.at) < 4000 && N(d0.perfect) >= 2) return `${S2(d0.nickname)} 님이 완벽한 착지를 ${N(d0.perfect)}번이나 해냈어요!`;
    if (near && Math.random() < 0.5) return `${near.t.name} 보너스 층까지 ${every - (near.h % every)}층 남았어요!`;
    if (order.length > 1 && order[0].h === order[1].h) return `${order[0].t.name}과 ${order[1].t.name}이 ${order[0].h}층으로 나란히 겨루고 있어요!`;
    const gap = order[0].h - (order[1] ? order[1].h : 0);
    if (order[0].h >= ZONE_SPACE && order[0].h - gap < ZONE_SPACE) return `${order[0].t.name} 타워가 우주에 닿았어요!`;
    return `${order[0].t.name}이 ${gap}층 앞서고 있어요. 따라잡아요!`;
  }

  function overlay(st, v, s, teams, heights, K) {
    const { S } = K;
    const key = v.phase + '|' + (v.phase === 'finished' ? heights.join(',') : '');
    if (key === st.ovKey) return;
    st.ovKey = key;
    st.ov.replaceChildren();
    if (st.tutTimer) { clearTimeout(st.tutTimer); st.timers.delete(st.tutTimer); st.tutTimer = null; }
    if (v.phase === 'countdown') {
      const step = S('text', { x: VW / 2, y: 268, 'text-anchor': 'middle', class: 'ar-tower-tutstep', text: '' });
      const num = S('text', { x: VW / 2, y: 214, 'text-anchor': 'middle', class: 'ar-tower-tutnum', text: '' });
      st.ov.append(S('rect', { x: 0, y: 0, width: VW, height: VH, fill: 'rgba(16,6,44,.55)' }),
        S('rect', { x: 140, y: 150, width: 620, height: 170, rx: 18, fill: '#fff' }),
        S('rect', { x: 140, y: 150, width: 620, height: 34, rx: 18, fill: '#46178f' }), S('rect', { x: 140, y: 168, width: 620, height: 16, fill: '#46178f' }),
        S('text', { x: VW / 2, y: 174, 'text-anchor': 'middle', class: 'ar-tower-tuthead', text: '우주 정복 · 플레이하는 방법' }), num, step,
        S('text', { x: VW / 2, y: 302, 'text-anchor': 'middle', class: 'ar-tower-tutsub', text: '타워가 가장 높은 팀이 우승해요' }));
      let k = 0;
      const tick = () => { num.textContent = `${k + 1}/4`; step.textContent = TUTORIAL[k]; replay(step); k = (k + 1) % 4; st.tutTimer = K.later(st, tick, 2200); };
      tick();
    } else if (v.phase === 'finished') {
      const order = teams.map((t, i) => ({ t, h: heights[i] })).sort((a, b) => b.h - a.h);
      const win = order[0];
      const rows = order.length;
      const boxH = 120 + rows * 34;
      const y0 = 110;
      st.ov.append(S('rect', { x: 0, y: 0, width: VW, height: VH, fill: 'rgba(16,6,44,.45)' }),
        S('rect', { x: 230, y: y0, width: 440, height: boxH, rx: 18, fill: '#fff', class: 'ar-tower-popin' }));
      const g = S('g', { class: 'ar-tower-popin' });
      g.append(K.nest(K.crownSVG(), VW / 2 - 26, y0 - 26, 52, 36));
      g.append(S('text', { x: VW / 2, y: y0 + 50, 'text-anchor': 'middle', class: 'ar-tower-wintext', fill: win.t.color, text: win.h > 0 ? `${win.t.name} 우승!` : '게임 끝' }));
      g.append(S('text', { x: VW / 2, y: y0 + 78, 'text-anchor': 'middle', class: 'ar-tower-tutsub', text: win.h > 0 ? `가장 높은 타워 ${win.h}층` : '' }));
      order.forEach((o, r) => {
        const y = y0 + 100 + r * 34;
        g.append(S('rect', { x: 260, y, width: 380, height: 28, rx: 8, fill: r === 0 ? shade(o.t.color, 0.82) : '#f1f0f7' }),
          S('text', { x: 276, y: y + 20, class: 'ar-tower-rrank', text: `${r + 1}위` }),
          S('g', { transform: `translate(318 ${y + 3})` }, shieldShape(S, o.t.color, 22)),
          S('text', { x: 348, y: y + 20, class: 'ar-tower-rname', text: o.t.name }),
          S('text', { x: 624, y: y + 20, 'text-anchor': 'end', class: 'ar-tower-rname', text: `${o.h}층` }));
      });
      st.ov.append(g);
    }
  }
  function replay(n) { if (!n) return; n.classList.remove('ar-tower-stepin'); void n.getBoundingClientRect(); n.classList.add('ar-tower-stepin'); }

  // =====================================================================
  // 학생 화면
  // =====================================================================
  const PW = 360, PH = 470, TOP_Y = 352, SWING_Y = 118, PBW = 84, PBH = 40, AMP = 1.0;

  function player(root, view, send) {
    const K = kit(); if (!K) return;
    const { H } = K;
    const st = K.prep(root, 'tower:player', ['ar-tower', 'ar-tower-player'], (st) => {
      st.strip = H('div', { class: 'ar-tower-strip' });
      st.gameBox = H('div', { class: 'ar-tower-gamebox', hidden: true });
      root.append(st.strip, st.gameBox);
      st.consumed = new Set(); st.game = null;
      buildStrip(st, K);
      const onKey = e => {
        if (st.dead || !root.isConnected) { document.removeEventListener('keydown', onKey); return; }
        if (!st.game || st.game.state !== 'swing') return;
        const tg = e.target; if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT')) return;
        if (e.key === ' ' || e.key === 'Enter' || e.code === 'Space') { if (tg && tg.classList && tg.classList.contains('ar-tower-tap')) return; e.preventDefault(); drop(st); }
      };
      document.addEventListener('keydown', onKey);
    });
    st.view = view; st.send = send;
    const s = K.ms(view), me = K.meOf(view);
    const teams = teamList(view, s);
    const a = view.actions;
    const seq = view.result ? view.result.seq : null;
    if (view.phase !== 'running' && st.game && st.game.state !== 'send') endGame(st);
    if (!st.game && view.phase === 'running' && me && a && a.kind === 'blocks' && !st.consumed.has(seq)) {
      st.consumed.add(seq);
      startGame(st, K, view, { remaining: N(a.remaining) || 1, bonus: !!a.bonus });
    }
    updateStrip(st, K, view, s, me, teams);
    const gameOn = !!st.game;
    st.strip.hidden = gameOn; st.gameBox.hidden = !gameOn;
  }

  function buildStrip(st, K) {
    const { H, S } = K;
    st.sShield = H('div', { class: 'ar-tower-sshield' });
    st.sTitle = H('strong', {}); st.sSub = H('small', {});
    st.sFill = H('i', {});
    st.sFloors = H('b', { text: '0' }); st.sPerf = H('b', { text: '0' });
    st.strip.append(st.sShield,
      H('div', { class: 'ar-tower-sinfo' }, st.sTitle, H('div', { class: 'ar-tower-sbar', 'aria-hidden': 'true' }, st.sFill), st.sSub),
      H('div', { class: 'ar-tower-mystat' }, H('span', { text: '내가 쌓은 층' }), st.sFloors),
      H('div', { class: 'ar-tower-mystat' }, H('span', { text: '완벽 착지' }), st.sPerf));
    st.sTeam = null;
  }
  function updateStrip(st, K, v, s, me, teams) {
    const { S } = K;
    const ti = me && Number.isInteger(me.team) ? me.team : -1;
    const t = teams[ti] || { name: S2(me && me.teamName) || '우리 팀', color: (me && me.teamColor) || '#46178f' };
    if (st.sTeam !== t.color) {
      st.sTeam = t.color;
      st.sShield.replaceChildren(S('svg', { viewBox: '0 0 40 41', 'aria-hidden': 'true' }, shieldShape(S, t.color, 40)));
      st.strip.style.setProperty('--team', t.color);
    }
    const every = Math.max(1, Math.floor(N(s.bonusEvery) || 10));
    const h = ti >= 0 ? towerOf(s, ti).height : 0;
    const heights = teams.map((x, i) => towerOf(s, i).height);
    const rank = ti >= 0 ? 1 + heights.filter(x => x > h).length : 0;
    const stats = (me && me.stats) || {};
    const left = every - (h % every);
    st.sTitle.textContent = `${t.name} 타워 ${h}층`;
    st.sFill.style.width = ((h % every) / every * 100).toFixed(1) + '%';
    if (v.phase === 'finished') st.sSub.textContent = rank === 1 && h > 0 ? '우리 팀이 1위! 가장 높은 타워예요.' : `우리 팀 최종 ${rank}위`;
    else if (v.phase === 'countdown' || v.phase === 'lobby') st.sSub.textContent = '정답을 맞히면 블록 5개를 얻어요';
    else st.sSub.textContent = `보너스 ${h + left}층까지 ${left}층` + (rank ? ` · 팀 ${rank}위` : '');
    st.sFloors.textContent = String(N(stats.floors));
    st.sPerf.textContent = String(N(stats.perfect));
  }

  // ---------- 블록 떨어뜨리기 미니게임 ----------
  function startGame(st, K, view, act) {
    const { H, S } = K;
    const s = K.ms(view), me = K.meOf(view);
    const teams = teamList(view, s);
    const ti = me && Number.isInteger(me.team) ? me.team : 0;
    const t = teams[ti] || teams[0];
    const tw = towerOf(s, ti);
    const recent = tw.blocks.slice(-6).map(b => ({ x: clampN(N(b && b.x), -1.2, 1.2), p: N(b && b.p) === 1 }));
    const g = {
      n: act.remaining, left: act.remaining, bonus: act.bonus, results: [], stack: recent, height: tw.height, start: tw.height,
      topX: recent.length ? recent[recent.length - 1].x : 0, period: act.bonus ? 2.7 : 2.1, t0: performance.now() - Math.random() * 1000,
      state: 'swing', x: 0, team: t, ti, shift: 0, shiftAt: 0, made: 0, perfect: 0
    };
    st.game = g;
    const hz = 'artp' + st.uid + 'hz' + Math.floor(Math.random() * 1e6);
    g.hz = hz;
    const svg = S('svg', { viewBox: `0 0 ${PW} ${PH}`, preserveAspectRatio: 'xMidYMid meet', class: 'ar-tower-gsvg', 'aria-hidden': 'true' });
    svg.append(S('defs', {}, hazardDefs(S, hz),
      S('linearGradient', { id: hz + 'sky', x1: 0, y1: 0, x2: 0, y2: 1 }, S('stop', { offset: 0, 'stop-color': '#2a1270' }), S('stop', { offset: 0.6, 'stop-color': '#6a48d6' }), S('stop', { offset: 1, 'stop-color': '#c9b2ff' }))));
    svg.append(S('rect', { x: -400, y: 0, width: PW + 800, height: PH, fill: `url(#${hz}sky)` }));
    svg.append(S('circle', { cx: 250, cy: 150, r: 95, fill: '#b98af5', opacity: 0.45 }), S('circle', { cx: 60, cy: 300, r: 40, fill: '#d6c6ff', opacity: 0.25 }));
    for (let i = 0; i < 30; i++) svg.append(S('circle', { cx: (i * 97) % PW, cy: (i * 53) % 260, r: 0.8 + (i % 3) * 0.5, fill: '#fff', opacity: 0.6 }));
    svg.append(S('rect', { x: PW / 2 - PBW * 0.75, y: 0, width: PBW * 1.5, height: PH, fill: '#fff', opacity: 0.12 }));
    g.stackG = S('g', {});
    g.dropG = S('g', {});
    g.missG = S('g', {});
    g.judge = S('text', { x: PW / 2, y: 245, 'text-anchor': 'middle', class: 'ar-tower-judge', text: '' });
    const bubble = S('g', { class: 'ar-tower-bubble' }, S('rect', { x: 70, y: 22, width: 220, height: 40, rx: 12, fill: '#7c3aed' }), S('text', { x: PW / 2, y: 48, 'text-anchor': 'middle', text: '떨어뜨리려면 누르세요' }));
    g.bubble = bubble;
    svg.append(g.stackG, g.missG, g.dropG, g.judge, bubble);
    g.svg = svg;
    g.counter = H('span', { class: 'ar-tower-count' });
    g.hText = H('span', { class: 'ar-tower-gh' });
    g.status = H('p', { class: 'ar-tower-gstatus', role: 'status', 'aria-live': 'polite' });
    g.tap = H('button', { type: 'button', class: 'ar-tower-tap', 'aria-label': '블록 떨어뜨리기 (스페이스바)' });
    g.tap.addEventListener('pointerdown', e => { e.preventDefault(); drop(st); try { g.tap.focus({ preventScroll: true }); } catch {} });
    g.tap.addEventListener('click', e => { if (e.detail === 0) drop(st); });
    const blockIcon = S('svg', { viewBox: `-2 -2 ${PBW + 4} ${PBH + 4}`, class: 'ar-tower-cicon', 'aria-hidden': 'true' }, S('defs', {}, hazardDefs(S, hz + 'i')), blockShape(S, PBW, PBH, hz + 'i', {}));
    st.gameBox.replaceChildren(H('div', { class: 'ar-tower-game' + (act.bonus ? ' ar-tower-isbonus' : ''), style: { '--team': t.color } },
      H('div', { class: 'ar-tower-ghead' },
        H('span', { class: 'ar-tower-gteam' }, S('svg', { viewBox: '0 0 40 41', 'aria-hidden': 'true' }, shieldShape(S, t.color, 40)), H('span', { text: t.name })),
        act.bonus ? H('span', { class: 'ar-tower-bonusbadge', text: '보너스 파워업' }) : null,
        g.hText,
        H('span', { class: 'ar-tower-gcount' }, g.counter, blockIcon)),
      H('div', { class: 'ar-tower-scene' }, svg, g.tap),
      g.status));
    drawStack(st);
    setCounter(g);
    g.status.textContent = act.bonus ? '보너스 층 도착! 파워업 블록은 천천히 움직여요.' : `블록 ${g.n}개를 우리 팀 타워 위에 떨어뜨려요.`;
    if (act.bonus) { snd('levelup'); fx('stars', g.counter); } else snd('whoosh');
    try { g.tap.focus({ preventScroll: true }); } catch {}
    const loop = () => { if (st.dead || st.game !== g) return; frame(st, g); st.raf = requestAnimationFrame(loop); };
    st.raf = requestAnimationFrame(loop);
  }
  function setCounter(g) { g.counter.textContent = `${g.left} ×`; g.hText.textContent = `${g.height}층`; }

  function drawStack(st) {
    const g = st.game, K = kit(); if (!g || !K) return;
    const { S } = K;
    g.stackG.replaceChildren();
    const show = g.stack.slice(-6);
    const base = TOP_Y + show.length * PBH; // 기지 윗면
    // 기지(높이가 낮을 때 보임)
    if (g.height - show.length <= 0) {
      g.stackG.append(S('rect', { x: PW / 2 - PBW * 1.7, y: base, width: PBW * 3.4, height: 10, rx: 3, fill: '#6f6a99', stroke: '#3f3a66', 'stroke-width': 1.5 }),
        S('rect', { x: PW / 2 - PBW * 1.45, y: base + 10, width: PBW * 2.9, height: 200, fill: g.team.color }),
        S('rect', { x: PW / 2 - PBW * 1.45, y: base + 26, width: PBW * 2.9, height: 200, fill: shade(g.team.color, -0.25) }));
    } else {
      g.stackG.append(S('rect', { x: PW / 2 + (show.length ? show[0].x : 0) * PBW - PBW * 0.36, y: base, width: PBW * 0.72, height: 300, fill: '#8f8ab8', stroke: '#5b5683', 'stroke-width': 1.5 }));
    }
    show.forEach((b, j) => {
      const fromTop = show.length - 1 - j;
      const y = TOP_Y + fromTop * PBH;
      g.stackG.append(S('g', { transform: `translate(${(PW / 2 + b.x * PBW - PBW / 2).toFixed(1)} ${y})` }, blockShape(S, PBW, PBH, g.hz, { perfect: b.p, team: g.team.color, gold: b.gold })));
    });
    g.dropG.replaceChildren(blockShape(S, PBW, PBH, g.hz, { team: g.team.color, gold: g.bonus }));
  }

  function frame(st, g) {
    const t = performance.now();
    const rm = reduced();
    if (g.state === 'swing') {
      g.x = AMP * Math.sin(2 * Math.PI * ((t - g.t0) / 1000) / g.period);
      g.dropG.setAttribute('transform', `translate(${(PW / 2 + g.x * PBW - PBW / 2).toFixed(1)} ${SWING_Y})`);
      g.dropG.style.opacity = Math.min(1, (t - (g.appear || 0)) / 250);
    } else if (g.state === 'fall') {
      const dur = rm ? 160 : 380;
      const p = Math.min(1, (t - g.fs) / dur);
      const target = TOP_Y - PBH;
      const y = SWING_Y + (target - SWING_Y) * p * p;
      g.dropG.setAttribute('transform', `translate(${(PW / 2 + g.x * PBW - PBW / 2).toFixed(1)} ${y.toFixed(1)})`);
      if (p >= 1) land(st, g, t);
    } else if (g.state === 'miss') {
      const e = (t - g.ms0) / 1000;
      const y = TOP_Y - PBH + 60 * e + 900 * e * e;
      const x = PW / 2 + g.x * PBW - PBW / 2 + g.dir * 160 * e;
      g.missG.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(g.dir * 160 * e).toFixed(1)} ${PBW / 2} ${PBH / 2})`);
      if (y > PH + 60 || e > 1.2) { g.missG.replaceChildren(); next(st, g); }
    } else if (g.state === 'land') {
      const dur = rm ? 60 : 260;
      const p = Math.min(1, (t - g.shiftAt) / dur);
      const off = -PBH * (1 - (1 - (1 - p) * (1 - p)));
      g.stackG.setAttribute('transform', `translate(0 ${off.toFixed(1)})`);
      if (p >= 1) { g.stackG.removeAttribute('transform'); next(st, g); }
    }
  }

  function drop(st) {
    const g = st.game; if (!g || g.state !== 'swing') return;
    g.state = 'fall'; g.fs = performance.now();
    g.bubble.style.opacity = '0';
    snd('whoosh');
  }

  function land(st, g, t) {
    const dx = Math.round((g.x - g.topX) * 1000) / 1000;
    const ad = Math.abs(dx);
    const perfect = ad <= 0.09, ok = ad < 0.5;
    g.results.push({ dx, ok });
    const K = kit();
    if (ok) {
      const nx = clampN(perfect ? g.topX : g.topX + dx, -1.2, 1.2);
      g.stack.push({ x: nx, p: perfect, gold: g.bonus }); if (g.stack.length > 8) g.stack.shift();
      g.topX = nx; g.height++; g.made++; if (perfect) g.perfect++;
      // 새 블록을 꼭대기 위(-PBH)에 놓은 채로 그린 뒤 아래로 내리기
      drawStack(st);
      g.stackG.setAttribute('transform', `translate(0 ${-PBH})`);
      g.dropG.style.opacity = '0';
      g.state = 'land'; g.shiftAt = t;
      judge(g, perfect ? '완벽!' : (ad < 0.3 ? '좋아요!' : '아슬아슬!'), perfect ? 'ar-tower-jperfect' : 'ar-tower-jgood');
      if (perfect) { snd('levelup'); fx('stars', g.judge); try { if (navigator.vibrate) navigator.vibrate(40); } catch {} }
      else snd('pop');
    } else {
      g.dir = dx >= 0 ? 1 : -1;
      g.missG.replaceChildren(...g.dropG.childNodes);
      g.dropG.replaceChildren(blockShape(K.S, PBW, PBH, g.hz, { team: g.team.color, gold: g.bonus }));
      g.dropG.style.opacity = '0';
      g.state = 'miss'; g.ms0 = t;
      judge(g, '놓쳤어요', 'ar-tower-jmiss');
      snd('wrong');
    }
    setCounter(g);
  }
  function judge(g, text, c) {
    g.judge.textContent = text;
    g.judge.setAttribute('class', 'ar-tower-judge ' + c);
    void g.judge.getBoundingClientRect();
    g.judge.classList.add('ar-tower-jshow');
  }

  function next(st, g) {
    g.left--; setCounter(g);
    if (g.left <= 0) return submit(st, g);
    g.period = Math.max(1.05, g.period * 0.92);
    g.t0 = performance.now() - Math.random() * g.period * 1000;
    g.appear = performance.now();
    g.state = 'swing';
    g.dropG.style.opacity = '0';
  }

  function submit(st, g) {
    const K = kit();
    g.state = 'send';
    g.dropG.style.opacity = '0';
    g.tap.disabled = true;
    g.status.textContent = `보내는 중… ${g.made}층 쌓기 성공` + (g.perfect ? `, 완벽 ${g.perfect}번` : '');
    const go = () => K.act(st.send, 'stack', g.results.slice()).then(r => {
      if (st.dead || st.game !== g) return;
      const res = r && r.result;
      if (res && res.seq !== undefined) st.consumed.add(res.seq);
      g.status.textContent = (res && res.message) || `${g.made}층을 쌓았어요!`;
      g.state = 'done';
      if (g.made > 0) { snd('correct'); fx('confetti', { y: 0.7, count: 60 + g.made * 10 }); }
      const na = r && r.actions;
      if (na && na.kind === 'blocks') {
        K.later(st, () => { if (st.game !== g || st.dead) return; st.game = null; startGame(st, K, st.view, { remaining: N(na.remaining) || 3, bonus: !!na.bonus }); }, 1400);
      } else {
        K.later(st, () => { if (st.game !== g || st.dead) return; endGame(st); }, 1700);
      }
    }).catch(() => {
      if (st.dead || st.game !== g) return;
      g.state = 'error';
      g.status.replaceChildren(document.createTextNode('보내지 못했어요. '), K.H('button', { type: 'button', class: 'ar-tower-retry', text: '다시 보내기', onClick: () => { g.status.textContent = '보내는 중…'; g.state = 'send'; go(); } }));
    });
    go();
  }
  function endGame(st) {
    if (st.raf) { try { cancelAnimationFrame(st.raf); } catch {} st.raf = 0; }
    st.game = null;
    if (st.gameBox) { st.gameBox.replaceChildren(); st.gameBox.hidden = true; }
    if (st.strip) st.strip.hidden = false;
  }

  KQ.arena.space = { host, player };
})();
