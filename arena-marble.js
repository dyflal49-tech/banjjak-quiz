'use strict';
/* 반짝퀴즈 마블 레이스 렌더러 (KQ.arena.marble)
   - 모으기(collect): 진행자 화면에 학생별 마블 병, 학생 기기에 내 마블 띠
   - 레이스(race): 구불구불한 마블 코스 위에서 모든 마블이 계약서 공식대로 달림 */
(() => {
  const KQ = window.KQ || (window.KQ = {});
  KQ.arena = KQ.arena || {};
  const TAU = Math.PI * 2;
  const VB_W = 1000, VB_H = 600;
  const TRACK_D = 'M 110 70 L 920 70 A 60 60 0 0 1 920 190 L 80 190 A 60 60 0 0 0 80 310 L 920 310 A 60 60 0 0 1 920 430 L 80 430 A 50 50 0 0 0 80 530 L 330 530';
  const LANE_W = 30;
  const SLOT = { x0: 366, y0: 506, dx: 20.5, dy: 21, cols: 30 };
  const STAGE_BOX = { x: 14, y: 16, w: 88, h: 106 };
  const MAX_JARS = 48;
  const SAMPLES = 900;

  const K = () => KQ.modeKit;
  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  const n0 = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const snd = k => { try { if (KQ.sound && KQ.sound.play) KQ.sound.play(k); } catch {} };
  const fx = (name, ...a) => { try { if (KQ.fx && typeof KQ.fx[name] === 'function') KQ.fx[name](...a); } catch {} };
  const nowMs = () => { try { return KQ.now ? KQ.now() : Date.now(); } catch { return Date.now(); } };
  const colorOk = c => (typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c)) ? c : '#0aa3a3';

  // 계약서의 마블 위치 공식
  function rawP(m, t) {
    const T = Math.max(1, n0(m.T) || 1);
    const u = clamp01(t / T);
    const env = 4 * u * (1 - u);
    let s = 0;
    const w = Array.isArray(m.w) ? m.w : [];
    for (let i = 0; i < 2; i++) { const k = w[i]; if (k) s += n0(k.a) * Math.sin(TAU * n0(k.f) * u + n0(k.ph)); }
    return clamp01(u + env * s);
  }
  // 학생별 가장 앞선 마블 기준 실시간 순위
  function liveOrder(marbles, t, maxP) {
    const best = new Map();
    for (const m of marbles) {
      const T = Math.max(1, n0(m.T));
      const done = t >= T;
      let p = done ? 1 : rawP(m, t);
      if (maxP) { const prev = maxP.get(m.id) || 0; if (p < prev) p = prev; else maxP.set(m.id, p); }
      const cur = best.get(m.owner);
      const cand = { owner: m.owner, nickname: m.nickname, color: m.color, gold: !!m.gold, done, place: n0(m.place) || 9999, p, marble: m };
      if (!cur) { best.set(m.owner, cand); continue; }
      if (cand.done && (!cur.done || cand.place < cur.place)) best.set(m.owner, cand);
      else if (!cand.done && !cur.done && cand.p > cur.p) best.set(m.owner, cand);
    }
    return [...best.values()].sort((a, b) => (a.done !== b.done ? (a.done ? -1 : 1) : a.done ? a.place - b.place : b.p - a.p));
  }

  function avatarEl(av, size, nick, extra = '') {
    const { H, colorFor } = K();
    const w = H('span', { class: ('ar-marble-av ' + extra).trim(), 'aria-hidden': 'true', style: { width: size + 'px', height: size + 'px' } });
    try {
      if (av && typeof av === 'object' && KQ.avatar && typeof KQ.avatar.render === 'function') {
        const r = KQ.avatar.render(av, size);
        if (r instanceof Node) { w.append(r); return w; }
      }
    } catch {}
    w.classList.add('fb');
    w.style.background = colorFor(nick || '?');
    w.style.fontSize = Math.round(size * 0.48) + 'px';
    w.textContent = Array.from(String(nick || '?'))[0] || '?';
    return w;
  }
  function dot(color, gold, cls = '') {
    const { H } = K();
    return H('span', { class: 'ar-marble-dot' + (gold ? ' gold' : '') + (cls ? ' ' + cls : ''), style: { '--c': colorOk(color) } });
  }
  function svgDefs(S, uid) {
    return S('defs', {},
      S('radialGradient', { id: 'arm-shine-' + uid, cx: '35%', cy: '30%', r: '70%' },
        S('stop', { offset: '0%', 'stop-color': '#fff', 'stop-opacity': '0.95' }),
        S('stop', { offset: '35%', 'stop-color': '#fff', 'stop-opacity': '0.25' }),
        S('stop', { offset: '100%', 'stop-color': '#000', 'stop-opacity': '0.25' })),
      S('radialGradient', { id: 'arm-gold-' + uid, cx: '35%', cy: '30%', r: '75%' },
        S('stop', { offset: '0%', 'stop-color': '#fffbe0' }),
        S('stop', { offset: '45%', 'stop-color': '#ffd43b' }),
        S('stop', { offset: '100%', 'stop-color': '#b8860b' })),
      S('pattern', { id: 'arm-check-' + uid, width: 8, height: 8, patternUnits: 'userSpaceOnUse' },
        S('rect', { width: 8, height: 8, fill: '#fff' }), S('rect', { width: 4, height: 4, fill: '#222' }), S('rect', { x: 4, y: 4, width: 4, height: 4, fill: '#222' })),
      S('linearGradient', { id: 'arm-bg-' + uid, x1: 0, y1: 0, x2: 0, y2: 1 },
        S('stop', { offset: '0%', 'stop-color': '#12b5b0' }), S('stop', { offset: '100%', 'stop-color': '#086a74' })));
  }

  // =====================================================================
  // 진행자: 마블 모으기
  // =====================================================================
  function hostCollect(root, v) {
    const k = K(); const { H } = k; const s = k.ms(v);
    const st = k.prep(root, 'marble-host-collect', ['ar-marble-host', 'ar-marble-collect'], (st, r) => {
      st.total = H('strong', { class: 'ar-marble-total-num' }, '0');
      st.goldN = H('strong', { class: 'ar-marble-gold-num' }, '0');
      st.people = H('span', { class: 'ar-marble-people' }, '');
      st.title = H('div', { class: 'ar-marble-title' }, '마블을 모아요!');
      st.head = H('div', { class: 'ar-marble-head' }, st.title,
        H('div', { class: 'ar-marble-total' }, dot('#0aa3a3', false, 'big'), H('span', {}, '모은 마블'), st.total, dot('#ffd43b', true, 'big'), H('span', {}, '황금'), st.goldN, st.people));
      st.grid = H('div', { class: 'ar-marble-jars' });
      st.more = H('p', { class: 'ar-marble-more', hidden: true });
      st.empty = H('div', { class: 'ar-marble-empty' },
        H('strong', {}, '정답 하나 = 마블 하나'),
        H('span', {}, '빨리 맞히면 조금 더 빠른 황금 마블이 돼요. 마지막에 모든 마블이 함께 달려요!'));
      st.jars = new Map(); st.orderKey = ''; st.lastPop = 0;
      r.append(st.head, st.empty, st.grid, st.more);
    });
    const players = k.arr(s.players).filter(p => p && p.id);
    const sorted = players.slice().sort((a, b) => (n0(b.marbles) - n0(a.marbles)) || (n0(b.gold) - n0(a.gold)) || String(a.nickname || '').localeCompare(String(b.nickname || ''), 'ko'));
    const shown = sorted.slice(0, MAX_JARS);
    let total = 0, gold = 0;
    for (const p of players) { const m = n0(p.marbles); total += m; gold += Math.min(m, n0(p.gold)); }
    if (k.str(st.total.textContent) !== String(total)) { const was = Number(st.total.textContent) || 0; k.txt(st.total, total); if (!st.first && total > was) k.replay(st.total, 'bump'); }
    k.txt(st.goldN, gold);
    k.txt(st.people, players.length ? `참가 ${players.length}명` : '');
    k.txt(st.title, v.phase === 'finished' ? '마블 모으기 끝' : v.phase === 'countdown' ? '곧 마블 모으기 시작!' : '마블을 모아요!');
    k.show(st.empty, total === 0);
    k.show(st.grid, shown.length > 0);
    k.css(root, '--ar-jar', shown.length > 32 ? '74px' : shown.length > 18 ? '86px' : '104px');
    const seen = new Set();
    let popped = 0;
    for (const p of shown) {
      seen.add(p.id);
      let j = st.jars.get(p.id);
      if (!j) {
        j = { count: 0, goldC: 0 };
        j.tube = H('div', { class: 'ar-marble-tube' });
        j.cnt = H('span', { class: 'ar-marble-cnt' }, '0');
        j.name = H('span', { class: 'ar-marble-name' }, '');
        j.node = H('div', { class: 'ar-marble-jar' }, H('div', { class: 'ar-marble-glass' }, j.tube, j.cnt), H('div', { class: 'ar-marble-who' }, avatarEl(p.avatar, 26, p.nickname), j.name));
        j.avKey = JSON.stringify(p.avatar || null);
        st.jars.set(p.id, j);
      }
      k.txt(j.name, p.nickname || '');
      const c = Math.min(12, n0(p.marbles)), gc = Math.min(c, n0(p.gold));
      if (c !== j.count || gc !== j.goldC) {
        const add = c - j.count;
        j.tube.replaceChildren(...Array.from({ length: c }, (_, i) => {
          const d = dot(p.color, i < gc);
          if (!st.first && add > 0 && i >= c - add) { d.classList.add('pop'); d.style.animationDelay = ((i - (c - add)) * 0.12) + 's'; }
          return d;
        }));
        if (!st.first && add > 0) { popped += add; k.replay(j.node, 'got'); }
        j.count = c; j.goldC = gc;
      }
      k.txt(j.cnt, String(n0(p.marbles)));
      k.cls(j.node, 'full', n0(p.marbles) >= 12);
    }
    for (const [id, j] of st.jars) if (!seen.has(id)) { j.node.remove(); st.jars.delete(id); }
    const key = shown.map(p => p.id).join(',');
    if (key !== st.orderKey) { st.orderKey = key; st.grid.replaceChildren(...shown.map(p => st.jars.get(p.id).node)); }
    const extra = sorted.length - shown.length;
    k.show(st.more, extra > 0); if (extra > 0) k.txt(st.more, `그 밖에 ${extra}명도 마블을 모으고 있어요.`);
    if (popped && Date.now() - st.lastPop > 350) { st.lastPop = Date.now(); snd('pop'); }
  }

  // =====================================================================
  // 진행자: 마지막 레이스
  // =====================================================================
  function hostRace(root, v) {
    const k = K(); const { H, S } = k; const s = k.ms(v);
    const marbles = k.arr(s.marbles).filter(m => m && m.id);
    const sig = 'marble-host-race:' + n0(s.raceStart) + ':' + marbles.length;
    const st = k.prep(root, sig, ['ar-marble-host', 'ar-marble-race'], (st, r) => {
      const uid = 'r' + st.uid;
      st.svg = S('svg', { viewBox: `0 0 ${VB_W} ${VB_H}`, preserveAspectRatio: 'xMidYMid meet', class: 'ar-marble-svg', role: 'img', 'aria-label': '마블 레이스 코스' });
      st.svg.append(svgDefs(S, uid));
      st.svg.append(S('rect', { width: VB_W, height: VB_H, rx: 18, fill: `url(#arm-bg-${uid})` }));
      // 장식: 별가루, 범퍼, 핀
      const deco = S('g', { class: 'ar-marble-deco' });
      for (let i = 0; i < 26; i++) deco.append(S('circle', { cx: (i * 137) % 980 + 10, cy: (i * 89) % 580 + 10, r: (i % 3) + 1.2, fill: '#fff', opacity: 0.18 }));
      for (const [x, y, rr] of [[920, 130, 24], [80, 250, 24], [920, 370, 24], [80, 480, 18]]) {
        deco.append(S('circle', { cx: x, cy: y, r: rr + 7, fill: '#ff922b', opacity: 0.35 }), S('circle', { cx: x, cy: y, r: rr, fill: '#ff6b6b', stroke: '#fff', 'stroke-width': 4 }), S('circle', { cx: x, cy: y, r: rr * 0.45, fill: '#fff', opacity: 0.8 }));
      }
      for (const y of [130, 250, 370]) for (let x = 210; x <= 800; x += 118) {
        deco.append(S('rect', { x: x - 9, y: y - 9, width: 18, height: 18, rx: 4, fill: '#ffe066', stroke: '#e67700', 'stroke-width': 2.5, transform: `rotate(45 ${x} ${y})` }));
      }
      st.svg.append(deco);
      // 코스
      st.path = S('path', { d: TRACK_D, fill: 'none', stroke: '#064e57', 'stroke-width': 56, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      st.svg.append(st.path,
        S('path', { d: TRACK_D, fill: 'none', stroke: '#e6fcf5', 'stroke-width': 44, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
        S('path', { d: TRACK_D, fill: 'none', stroke: '#96f2d7', 'stroke-width': 3, 'stroke-dasharray': '14 18', opacity: 0.9 }));
      // 출발 대기 상자, 출발선
      st.svg.append(S('rect', { x: STAGE_BOX.x - 4, y: STAGE_BOX.y - 4, width: STAGE_BOX.w + 8, height: STAGE_BOX.h + 8, rx: 12, fill: 'rgba(0,0,0,.25)', stroke: '#fff', 'stroke-width': 2, 'stroke-dasharray': '6 5' }),
        S('rect', { x: 104, y: 46, width: 8, height: 48, fill: '#fff' }),
        S('text', { x: 58, y: 146, class: 'ar-marble-svgtxt', 'text-anchor': 'middle' }, '출발'));
      // 결승선, 결승 구역
      st.svg.append(S('rect', { x: 330, y: 506, width: 14, height: 48, fill: `url(#arm-check-${uid})`, stroke: '#222', 'stroke-width': 1 }),
        S('rect', { x: SLOT.x0 - 16, y: SLOT.y0 - 16, width: SLOT.cols * SLOT.dx + 22, height: 4 * SLOT.dy + 12, rx: 14, fill: 'rgba(0,0,0,.28)', stroke: '#ffd43b', 'stroke-width': 3 }),
        S('text', { x: 337, y: 588, class: 'ar-marble-svgtxt small', 'text-anchor': 'middle' }, '결승'));
      // 마블들
      st.mg = S('g', { class: 'ar-marble-ms' });
      st.els = new Map();
      for (const m of marbles) {
        const g = S('g', { class: 'ar-marble-m' + (m.gold ? ' gold' : '') });
        const col = colorOk(m.color);
        if (m.gold) g.append(S('circle', { r: 10.5, fill: `url(#arm-gold-${uid})`, stroke: col, 'stroke-width': 3 }));
        else g.append(S('circle', { r: 9.5, fill: col, stroke: 'rgba(0,0,0,.35)', 'stroke-width': 1.5 }));
        g.append(S('circle', { r: 9, fill: `url(#arm-shine-${uid})`, opacity: m.gold ? 0.55 : 0.9 }));
        st.mg.append(g);
        st.els.set(m.id, { g, m, x: 0, y: 0, s: 1 });
      }
      st.svg.append(st.mg);
      // 선두 3명 이름표
      st.tags = [0, 1, 2].map(i => {
        const t = S('text', { class: 'ar-marble-tag t' + i, 'text-anchor': 'middle' }, '');
        const b = S('rect', { class: 'ar-marble-tagbg t' + i, rx: 8, height: 22 });
        const g = S('g', { class: 'ar-marble-tagg', opacity: 0 }, b, t);
        st.svg.append(g); return { g, t, b, w: 0, txt: '' };
      });
      st.count = H('div', { class: 'ar-marble-count', hidden: true, 'aria-hidden': 'true' });
      st.banner = H('div', { class: 'ar-marble-banner', hidden: true });
      const trackBox = H('div', { class: 'ar-marble-trackbox' }, st.svg, st.count, st.banner);
      // 옆 칸: 실시간 순위 + 해설
      st.top = H('ol', { class: 'ar-marble-top', 'aria-label': '실시간 순위 1~3위' });
      st.topRows = [0, 1, 2].map(i => {
        const av = H('span', { class: 'ar-marble-topav' });
        const nm = H('span', { class: 'ar-marble-topname' }, '');
        const sub = H('span', { class: 'ar-marble-topsub' }, '');
        const li = H('li', { class: 'ar-marble-toprow r' + i, hidden: true }, H('span', { class: 'ar-marble-toprank' }, String(i + 1)), av, H('span', { class: 'ar-marble-topinfo' }, nm, sub));
        st.top.append(li); return { li, av, nm, sub, owner: null };
      });
      st.info = H('div', { class: 'ar-marble-raceinfo' }, `마블 ${marbles.length}개 · ${new Set(marbles.map(m => m.owner)).size}명`);
      st.talk = H('ul', { class: 'ar-marble-talk', 'aria-live': 'polite', 'aria-label': '레이스 해설' });
      const side = H('aside', { class: 'ar-marble-side' }, H('h3', {}, '실시간 순위'), st.top, st.info, H('h3', {}, '레이스 해설'), st.talk);
      r.append(trackBox, side);
      st.maxP = new Map(); st.lines = []; st.leader = null; st.lastLeadAt = 0; st.flags = {}; st.lastCount = null; st.lastSide = 0;
      st.samples = null;
      const loop = () => { if (st.dead) return; try { frame(st); } catch (e) { if (!st.warned) { st.warned = true; console.warn('[마블 레이스]', e); } } st.raf = requestAnimationFrame(loop); };
      st.raf = requestAnimationFrame(loop);
    });
    st.view = v; st.s = s; st.marbles = marbles;
  }

  function sampleTrack(st) {
    if (st.samples) return st.samples;
    let L = 0;
    try { L = st.path.getTotalLength(); } catch { L = 0; }
    if (!L) return null;
    const xs = new Float32Array(SAMPLES + 1), ys = new Float32Array(SAMPLES + 1), nx = new Float32Array(SAMPLES + 1), ny = new Float32Array(SAMPLES + 1);
    for (let i = 0; i <= SAMPLES; i++) { const pt = st.path.getPointAtLength(L * i / SAMPLES); xs[i] = pt.x; ys[i] = pt.y; }
    for (let i = 0; i <= SAMPLES; i++) {
      const a = Math.max(0, i - 1), b = Math.min(SAMPLES, i + 1);
      const dx = xs[b] - xs[a], dy = ys[b] - ys[a]; const len = Math.hypot(dx, dy) || 1;
      nx[i] = -dy / len; ny[i] = dx / len;
    }
    st.samples = { xs, ys, nx, ny, L };
    return st.samples;
  }
  function at(sm, p, lane) {
    const f = clamp01(p) * SAMPLES; const i = Math.min(SAMPLES - 1, Math.floor(f)); const r = f - i;
    const off = (clamp01(n0(lane)) - 0.5) * LANE_W;
    return {
      x: sm.xs[i] + (sm.xs[i + 1] - sm.xs[i]) * r + (sm.nx[i] + (sm.nx[i + 1] - sm.nx[i]) * r) * off,
      y: sm.ys[i] + (sm.ys[i + 1] - sm.ys[i]) * r + (sm.ny[i] + (sm.ny[i + 1] - sm.ny[i]) * r) * off
    };
  }
  function slotPos(place) {
    const i = Math.max(0, place - 1);
    return { x: SLOT.x0 + (i % SLOT.cols) * SLOT.dx, y: SLOT.y0 + Math.floor(i / SLOT.cols) % 4 * SLOT.dy };
  }
  function stagePos(i, n) {
    const cols = Math.max(4, Math.ceil(Math.sqrt(n * STAGE_BOX.w / STAGE_BOX.h)));
    const rows = Math.max(1, Math.ceil(n / cols));
    const cw = STAGE_BOX.w / cols, ch = STAGE_BOX.h / Math.max(rows, 1);
    return { x: STAGE_BOX.x + cw * (i % cols + 0.5), y: STAGE_BOX.y + ch * (Math.floor(i / cols) + 0.5), s: Math.min(1, Math.min(cw, ch) / 20) };
  }
  function say(st, text) {
    const k = K();
    st.lines.unshift(text); st.lines.length = Math.min(st.lines.length, 5);
    st.talk.replaceChildren(...st.lines.map((l, i) => k.H('li', { class: i === 0 ? 'new' : '' }, l)));
  }

  function frame(st) {
    const k = K(); const s = st.s || {}; const marbles = st.marbles || [];
    const sm = sampleTrack(st); if (!sm) return;
    const now = nowMs();
    const raceStart = n0(s.raceStart), raceEnd = n0(s.raceEnd);
    const t = now - raceStart;
    // 카운트다운
    if (t < 0) {
      const n = Math.max(1, Math.ceil(-t / 1000));
      if (st.lastCount !== n) { st.lastCount = n; k.show(st.count, true); st.count.replaceChildren(k.H('span', { class: 'num' }, String(n))); snd('countdown'); }
    } else if (st.lastCount !== 0 && st.lastCount !== 'done') {
      if (t < 900) { st.lastCount = 0; k.show(st.count, true); st.count.replaceChildren(k.H('span', { class: 'num go' }, '출발!')); snd('whoosh'); say(st, `출발! 마블 ${marbles.length}개가 한꺼번에 굴러가요.`); }
      else st.lastCount = 'done';
    } else if (st.lastCount === 0 && t >= 900) { st.lastCount = 'done'; }
    if (st.lastCount === 'done' && !st.count.hidden) k.show(st.count, false);

    const n = marbles.length;
    marbles.forEach((m, i) => {
      const e = st.els.get(m.id); if (!e) return;
      const T = Math.max(1, n0(m.T));
      let x, y, sc = 1;
      if (t < 0) { const p0 = stagePos(i, n); x = p0.x; y = p0.y; sc = p0.s; }
      else if (t >= T) {
        const end = at(sm, 1, m.lane); const slot = slotPos(n0(m.place) || i + 1);
        const f = clamp01((t - T) / 650); const ef = 1 - Math.pow(1 - f, 3);
        x = end.x + (slot.x - end.x) * ef; y = end.y + (slot.y - end.y) * ef - Math.sin(f * Math.PI) * 18; sc = 0.95;
        st.maxP.set(m.id, 1);
      } else {
        let p = rawP(m, t); const prev = st.maxP.get(m.id) || 0; if (p < prev) p = prev; else st.maxP.set(m.id, p);
        const q = at(sm, p, m.lane);
        if (t < 500) { const p0 = stagePos(i, n); const f = t / 500; x = p0.x + (q.x - p0.x) * f; y = p0.y + (q.y - p0.y) * f; sc = p0.s + (1 - p0.s) * f; }
        else { x = q.x; y = q.y; }
      }
      if (Math.abs(x - e.x) > 0.05 || Math.abs(y - e.y) > 0.05 || sc !== e.s) { e.x = x; e.y = y; e.s = sc; e.g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${sc.toFixed(2)})`); }
    });

    // 순위·해설은 0.25초마다
    if (now - st.lastSide < 250) { placeTags(st); return; }
    st.lastSide = now;
    const order = t < 0 ? [] : liveOrder(marbles, t, null).map(o => ({ ...o, p: o.done ? 1 : Math.max(o.p, st.maxP.get(o.marble.id) || 0) }));
    if (t >= 0) order.sort((a, b) => (a.done !== b.done ? (a.done ? -1 : 1) : a.done ? a.place - b.place : b.p - a.p));
    st.order = order;
    const players = k.arr(s.players);
    const avOf = id => { const p = players.find(x => x && x.id === id); return p ? p.avatar : null; };
    st.topRows.forEach((row, i) => {
      const o = order[i];
      k.show(row.li, !!o);
      if (!o) return;
      if (row.owner !== o.owner) {
        row.owner = o.owner; row.av.replaceChildren(avatarEl(avOf(o.owner), 34, o.nickname)); k.txt(row.nm, o.nickname || '');
        if (!st.first) k.replay(row.li, 'swap');
      }
      k.txt(row.sub, o.done ? `${o.place}번째로 도착` : `달리는 중 ${Math.round(o.p * 100)}%`);
      k.cls(row.li, 'done', o.done);
    });
    if (t < 0) { if (!st.flags.ready) { st.flags.ready = true; say(st, '마블들이 출발선에 모였어요. 곧 출발해요!'); } placeTags(st); return; }
    const lead = order[0];
    if (lead) {
      if (st.leader !== lead.owner && !lead.done) {
        if (st.leader && now - st.lastLeadAt > 1400 && t > 1500) say(st, `${lead.nickname}의 마블이 선두로 나섰어요!`);
        st.leader = lead.owner; st.lastLeadAt = now;
      }
      if (!st.flags.half && lead.p >= 0.5 && !lead.done) { st.flags.half = true; say(st, '벌써 코스의 절반을 지났어요!'); }
      if (!st.flags.near && lead.p >= 0.86 && !lead.done) { st.flags.near = true; say(st, '결승선이 눈앞이에요! 누가 먼저 들어올까요?'); }
      if (!st.flags.win && lead.done) {
        st.flags.win = true; st.leader = lead.owner;
        say(st, `${lead.nickname}의 마블이 1등으로 도착했어요!` + (lead.gold ? ' 황금 마블의 힘!' : ''));
        if (t - n0(lead.marble.T) < 4000) {
          snd('cheer'); fx('confetti', { y: 0.85, count: 160 });
          if (!k.reducedMotion()) fx('stamp', '우승!', { color: '#0aa3a3', sub: lead.nickname || '' });
        }
        st.banner.replaceChildren(k.H('span', { class: 'crown' }, k.crownSVG ? k.crownSVG() : ''), avatarEl(avOf(lead.owner), 44, lead.nickname), k.H('span', { class: 'txt' }, k.H('small', {}, '우승'), k.H('strong', {}, lead.nickname || '')));
        k.show(st.banner, true);
      }
      const second = order[1];
      if (!st.flags.second && second && second.done) { st.flags.second = true; say(st, `2등은 ${second.nickname}, 3등 자리를 두고 접전이에요!`); }
    }
    if (!st.flags.end && raceEnd && now >= raceEnd) { st.flags.end = true; say(st, '모든 마블이 도착했어요. 모두 수고했어요!'); }
    placeTags(st);
  }
  function placeTags(st) {
    const order = st.order || [];
    st.tags.forEach((tg, i) => {
      const o = order[i]; const e = o && st.els.get(o.marble.id);
      if (!o || !e || o.done) { if (tg.g.getAttribute('opacity') !== '0') tg.g.setAttribute('opacity', '0'); return; }
      const label = `${i + 1} ${o.nickname || ''}`;
      if (tg.txt !== label) {
        tg.txt = label; tg.t.textContent = label;
        let w = 0; try { w = tg.t.getComputedTextLength(); } catch { w = label.length * 9; }
        tg.w = w + 14; tg.b.setAttribute('width', tg.w.toFixed(0)); tg.b.setAttribute('x', (-tg.w / 2).toFixed(0)); tg.b.setAttribute('y', '-17'); tg.t.setAttribute('y', '-1');
      }
      tg.g.setAttribute('opacity', '1');
      tg.g.setAttribute('transform', `translate(${e.x.toFixed(1)} ${(e.y - 16 - i * 2).toFixed(1)})`);
    });
  }

  function host(root, v) {
    const s = K().ms(v);
    if (s.stage === 'race' && Array.isArray(s.marbles) && s.marbles.length) hostRace(root, v);
    else if (s.stage === 'race') {
      const k = K();
      k.prep(root, 'marble-host-nomarble', ['ar-marble-host', 'ar-marble-collect'], (st, r) => r.append(k.H('div', { class: 'ar-marble-empty' }, k.H('strong', {}, '마블이 하나도 없어요'), k.H('span', {}, '다음 게임에서는 정답으로 마블을 모아 봐요!'))));
    } else hostCollect(root, v);
  }

  // =====================================================================
  // 학생
  // =====================================================================
  function playerCollect(root, v) {
    const k = K(); const { H } = k; const me = k.meOf(v) || {}; const stt = me.stats || {};
    const st = k.prep(root, 'marble-player-collect', ['ar-marble-player', 'ar-marble-pstrip'], (st, r) => {
      st.tray = H('div', { class: 'ar-marble-tray', 'aria-hidden': 'true' });
      st.cnt = H('strong', {}, '0');
      st.gold = H('span', { class: 'ar-marble-pgold' }, '');
      st.hint = H('span', { class: 'ar-marble-phint' }, '');
      r.append(H('div', { class: 'ar-marble-pbox' }, st.tray, H('div', { class: 'ar-marble-ptext' }, H('span', { class: 'ar-marble-pline' }, '내 마블 ', st.cnt, '개'), st.gold, st.hint)));
      st.c = -1; st.g = -1;
    });
    const c = n0(stt.marbles), g = Math.min(c, n0(stt.gold));
    const col = colorOk((k.arr(k.ms(v).players).find(p => p && me && p.id === me.id) || {}).color || '#0aa3a3');
    if (c !== st.c || g !== st.g) {
      const add = st.c >= 0 ? c - st.c : 0;
      st.tray.replaceChildren(...Array.from({ length: 12 }, (_, i) => {
        if (i >= c) return H('span', { class: 'ar-marble-dot empty' });
        const d = dot(col, i < g);
        if (add > 0 && i >= c - add) d.classList.add('pop');
        return d;
      }));
      if (add > 0) snd('pop');
      st.c = c; st.g = g;
    }
    k.txt(st.cnt, String(c));
    k.txt(st.gold, g ? `그중 황금 마블 ${g}개` : '');
    k.txt(st.hint, v.phase === 'finished' ? '마블 모으기가 끝났어요.' : c >= 12 ? '주머니가 가득! 이제 정답은 황금 마블로 바뀌어요.' : '정답을 맞힐 때마다 마블 +1, 빨리 맞히면 황금!');
  }

  function playerRace(root, v) {
    const k = K(); const { H } = k; const s = k.ms(v); const me = k.meOf(v) || {};
    const marbles = k.arr(s.marbles).filter(m => m && m.id);
    const mine = marbles.filter(m => m.owner === me.id);
    const st = k.prep(root, 'marble-player-race:' + n0(s.raceStart) + ':' + marbles.length, ['ar-marble-player', 'ar-marble-prace'], (st, r) => {
      st.h = H('h2', {}, '큰 화면을 보세요!');
      st.sub = H('p', { class: 'ar-marble-psub' }, '');
      st.place = H('div', { class: 'ar-marble-pplace' }, '');
      st.bar = H('div', { class: 'ar-marble-pbar' });
      st.me = dot('#0aa3a3', false, 'me');
      st.bar.append(H('span', { class: 'ar-marble-pflag' }), st.me);
      st.note = H('p', { class: 'ar-marble-pnote' }, '');
      r.append(H('div', { class: 'ar-marble-pcard' }, st.h, st.sub, st.place, st.bar, st.note));
      st.maxP = new Map(); st.done = false; st.lastP = -1;
      const loop = () => { if (st.dead) return; try { tickP(st); } catch {} st.raf = requestAnimationFrame(loop); };
      st.raf = requestAnimationFrame(loop);
    });
    st.marbles = marbles; st.mine = mine; st.s = s; st.me = st.me; st.meId = me.id;
    if (mine.length) { const best = mine.slice().sort((a, b) => n0(a.T) - n0(b.T))[0]; st.me.style.setProperty('--c', colorOk(best.color)); k.cls(st.me, 'gold', !!best.gold); }
  }
  function tickP(st) {
    const k = K(); const s = st.s || {}; const now = nowMs();
    const t = now - n0(s.raceStart);
    const total = new Set(st.marbles.map(m => m.owner)).size;
    if (!st.mine.length) {
      k.txt(st.sub, '이번 레이스에는 내 마블이 없어요.'); k.txt(st.place, '친구들을 응원해요!'); k.show(st.bar, false);
      k.txt(st.note, `마블 ${st.marbles.length}개가 달리고 있어요.`); return;
    }
    if (t < 0) {
      k.txt(st.sub, `내 마블 ${st.mine.length}개가 출발선에 있어요.`); k.txt(st.place, `${Math.max(1, Math.ceil(-t / 1000))}초 뒤 출발!`); k.txt(st.note, '마블이 많을수록 우승 기회가 커요.');
      st.me.style.left = '0%'; return;
    }
    if (now - (st.lastCalc || 0) < 200) return;
    st.lastCalc = now;
    const order = liveOrder(st.marbles, t, st.maxP);
    const idx = order.findIndex(o => o.owner === st.meId);
    const mine = order[idx];
    const p = mine ? (mine.done ? 1 : mine.p) : 0;
    st.me.style.left = (p * 100).toFixed(1) + '%';
    const allDone = n0(s.raceEnd) && now >= n0(s.raceEnd);
    if (mine && mine.done) {
      k.txt(st.place, (allDone ? '최종 ' : '') + `${idx + 1}위` + (idx === 0 ? '! 우승이에요!' : '!'));
      k.txt(st.sub, allDone ? '레이스가 끝났어요.' : '내 마블이 결승선에 들어왔어요!');
      k.txt(st.note, `가장 빠른 내 마블은 ${mine.place}번째로 도착했어요.`);
      if (!st.done) { st.done = true; snd(idx === 0 ? 'cheer' : 'levelup'); if (idx === 0) fx('confetti', { y: 0.8, count: 140 }); }
    } else {
      k.txt(st.place, `지금 ${idx + 1}위 / ${total}명`);
      k.txt(st.sub, `내 마블 ${st.mine.length}개가 달리는 중`);
      k.txt(st.note, idx === 0 ? '내 마블이 선두예요!' : idx < 3 ? '선두권이에요! 조금만 더!' : '아직 몰라요. 끝까지 응원해요!');
    }
    k.cls(st.place, 'top', idx === 0);
  }

  function player(root, v) {
    const s = K().ms(v);
    if (s.stage === 'race') playerRace(root, v); else playerCollect(root, v);
  }

  KQ.arena.marble = {
    host(root, view, send) { try { host(root, view || {}, send); } catch (e) { console.warn('[마블 레이스] 진행자 화면 오류', e); } },
    player(root, view, send) { try { player(root, view || {}, send); } catch (e) { console.warn('[마블 레이스] 학생 화면 오류', e); } }
  };
})();
