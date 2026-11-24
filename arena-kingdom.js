'use strict';
/* 반짝퀴즈 컬러 킹덤 (카훗 컬러 킹덤 스타일) 렌더러
   - 진행자: 풀밭 위 육각형 지도(odd-r, 뾰족한 위), 성 탑과 팀 깃발, 팀 패널(방패/이름/구성원/칸 수/%), 영토 비율 막대, 실시간 해설
   - 학생: 평소엔 작은 상태 띠, actions.kind==='flags' 이면 지도에서 깃발 꽂을 칸 고르기
   계약: ARENA-CONTRACT.md */
(() => {
  const KQ = window.KQ || (window.KQ = {});
  KQ.arena = KQ.arena || {};

  const SQ3 = Math.sqrt(3);
  const R = 20, HW = SQ3 * R, PAD = 8;
  const DEF_COLS = 13, DEF_ROWS = 9;
  const snd = k => { try { if (KQ.sound && typeof KQ.sound.play === 'function') KQ.sound.play(k); } catch {} };

  // ---------- 육각 격자 ----------
  function geom(cols, rows) {
    const W = PAD * 2 + HW * cols + HW / 2;
    const Ht = PAD * 2 + R * 2 + (rows - 1) * 1.5 * R;
    const center = idx => { const c = idx % cols, r = Math.floor(idx / cols); return [PAD + HW / 2 + c * HW + (r % 2 ? HW / 2 : 0), PAD + R + r * 1.5 * R]; };
    return { cols, rows, W, H: Ht, center };
  }
  const hexPts = (cx, cy, r) => { const p = []; for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i - 90); p.push((cx + r * Math.cos(a)).toFixed(2) + ',' + (cy + r * Math.sin(a)).toFixed(2)); } return p.join(' '); };
  function neighbors(cols, rows, idx) {
    try { if (window.KQEngine && typeof window.KQEngine.hexNeighbors === 'function') return window.KQEngine.hexNeighbors(cols, rows, idx); } catch {}
    const c = idx % cols, r = Math.floor(idx / cols), odd = r % 2 === 1;
    const d = odd ? [[0, -1], [1, -1], [-1, 0], [1, 0], [0, 1], [1, 1]] : [[-1, -1], [0, -1], [-1, 0], [1, 0], [-1, 1], [0, 1]];
    return d.map(([dc, dr]) => [c + dc, r + dr]).filter(([x, y]) => x >= 0 && y >= 0 && x < cols && y < rows).map(([x, y]) => y * cols + x);
  }
  function canClaim(base, tiles, team, t) {
    const tmp = { cols: base.cols, rows: base.rows, tiles, castles: base.castles };
    try { if (window.KQEngine && typeof window.KQEngine.canClaim === 'function') return window.KQEngine.canClaim(tmp, team, t); } catch {}
    if (!Number.isInteger(t) || t < 0 || t >= tiles.length) return false;
    if (tiles[t] === team || base.castles.includes(t)) return false;
    return neighbors(base.cols, base.rows, t).some(n => tiles[n] === team);
  }
  function readMap(K, v) {
    const s = K.ms(v);
    const cols = K.clamp(Math.floor(K.num(s.cols, DEF_COLS)) || DEF_COLS, 2, 40);
    const rows = K.clamp(Math.floor(K.num(s.rows, DEF_ROWS)) || DEF_ROWS, 2, 40);
    const total = cols * rows;
    const raw = K.arr(s.tiles);
    const tiles = Array.from({ length: total }, (_, i) => (Number.isInteger(raw[i]) && raw[i] >= 0 ? raw[i] : -1));
    const castles = K.arr(s.castles).map(Number).filter(Number.isInteger);
    return { s, cols, rows, total, tiles, castles, claims: K.arr(s.claims) };
  }
  function countTiles(tiles, teams) {
    const m = new Map(teams.map(t => [t.index, 0]));
    for (const o of tiles) if (o >= 0) m.set(o, (m.get(o) || 0) + 1);
    return m;
  }
  function teamRanks(teams, counts) {
    const sorted = teams.slice().sort((a, b) => (counts.get(b.index) || 0) - (counts.get(a.index) || 0));
    const rank = new Map(); let prev = null, r = 0;
    sorted.forEach((t, i) => { const c = counts.get(t.index) || 0; if (c !== prev) { r = i + 1; prev = c; } rank.set(t.index, r); });
    return { sorted, rank };
  }
  function leaderOf(teams, counts) {
    let best = -1, top = 0, tie = false;
    for (const t of teams) { const c = counts.get(t.index) || 0; if (c > top) { top = c; best = t.index; tie = false; } else if (c === top && c > 0) tie = true; }
    return tie ? -1 : best;
  }

  // ---------- 그림 조각 ----------
  function shieldSVG(K, color, size) {
    const { S } = K;
    return S('svg', { viewBox: '0 0 40 44', width: size, height: size * 1.1, class: 'ar-kingdom-shield', 'aria-hidden': 'true', focusable: 'false' },
      S('path', { d: 'M20 2 L37 7 V20 C37 31 29 38 20 42 C11 38 3 31 3 20 V7 Z', fill: K.shade(color, -0.35) }),
      S('path', { d: 'M20 4.5 L34.5 8.8 V20 C34.5 29.6 27.6 35.6 20 39.2 C12.4 35.6 5.5 29.6 5.5 20 V8.8 Z', fill: color }),
      S('path', { d: 'M20 4.5 L34.5 8.8 V20 C34.5 22 34.2 23.8 33.7 25.5 C25 18 14 14 5.5 15 V8.8 Z', fill: '#fff', opacity: 0.18 }),
      // 성 문양
      S('path', { d: 'M12 30 V17 h3 v3 h3 v-3 h4 v3 h3 v-3 h3 v13 Z', fill: '#fff', opacity: 0.92 }),
      S('path', { d: 'M18 30 v-5 a2 2 0 0 1 4 0 v5 Z', fill: K.shade(color, -0.2) }));
  }
  function flagIcon(K, color, size, cls) {
    const { S } = K;
    return S('svg', { viewBox: '0 0 24 24', width: size, height: size, class: cls || '', 'aria-hidden': 'true', focusable: 'false' },
      S('path', { d: 'M5 2.5 V22', stroke: '#5b3a1a', 'stroke-width': 2.2, 'stroke-linecap': 'round' }),
      S('path', { d: 'M6 3.5 C10 1.5 13 6 19 4 L17.2 8.6 L20 13 C14 15 11 10.5 6 12.5 Z', fill: color, stroke: K.shade(color, -0.35), 'stroke-width': 1 }));
  }
  // 지도 위 깃발 (원점이 칸 가운데)
  function mapFlag(K, color) {
    const { S } = K;
    return S('g', { class: 'ar-kingdom-flagshape' },
      S('ellipse', { cx: 0, cy: 7, rx: 5, ry: 1.8, fill: 'rgba(0,0,0,.25)' }),
      S('path', { d: 'M-1 7 V-15', stroke: '#5b3a1a', 'stroke-width': 1.9, 'stroke-linecap': 'round' }),
      S('path', { d: 'M0 -15 C4 -17 7 -12.5 12.5 -14.5 L10.5 -10.2 L13 -6 C7.5 -4 4.5 -8.5 0 -6.6 Z', fill: color, stroke: K.shade(color, -0.35), 'stroke-width': 0.8 }));
  }
  function castleG(K, color, cx, cy) {
    const { S } = K;
    const dark = K.shade(color, -0.3);
    const crown = S('g', { class: 'ar-kingdom-crown', transform: 'translate(0 -38) scale(1.5)' },
      S('path', { d: 'M-9 4 L-10 -6 L-4.5 -1.5 L0 -9 L4.5 -1.5 L10 -6 L9 4 Z', fill: '#ffd43b', stroke: '#b07d00', 'stroke-width': 1.2, 'stroke-linejoin': 'round' }),
      S('circle', { cx: 0, cy: -9.5, r: 1.6, fill: '#fff3bf' }));
    const g = S('g', { class: 'ar-kingdom-castle', transform: `translate(${cx.toFixed(2)} ${cy.toFixed(2)})` },
      S('polygon', { points: hexPts(0, 0, R - 1.2), fill: K.shade(color, -0.12), stroke: dark, 'stroke-width': 2.2 }),
      S('ellipse', { cx: 0, cy: 12.5, rx: 12, ry: 3.4, fill: 'rgba(0,0,0,.28)' }),
      S('rect', { x: -10, y: -17, width: 20, height: 29, rx: 1.5, fill: '#6f7480' }),
      S('rect', { x: -10, y: -17, width: 7, height: 29, fill: '#868c99' }),
      S('path', { d: 'M-10 -4 h20 M-10 5 h20 M-3 -17 v13 M4 -4 v9 M-5 5 v7', stroke: 'rgba(0,0,0,.18)', 'stroke-width': 0.8 }),
      S('rect', { x: -12.5, y: -22, width: 25, height: 6, rx: 1, fill: '#5d626d' }),
      S('rect', { x: -12.5, y: -26.5, width: 5, height: 5, fill: '#5d626d' }),
      S('rect', { x: -2.5, y: -26.5, width: 5, height: 5, fill: '#5d626d' }),
      S('rect', { x: 7.5, y: -26.5, width: 5, height: 5, fill: '#5d626d' }),
      S('rect', { x: -8, y: -15.5, width: 16, height: 2.2, rx: 1, fill: '#e0a63a' }),
      S('path', { d: 'M-6 -14 h12 v15 l-6 -3.6 l-6 3.6 Z', fill: color, stroke: dark, 'stroke-width': 0.9 }),
      S('path', { d: 'M-2.8 -11 v4.6 a2.8 2.8 0 0 0 5.6 0 v-4.6', stroke: '#fff', 'stroke-width': 1.7, fill: 'none', 'stroke-linecap': 'round' }),
      crown);
    return { g, crown };
  }
  function nameTag(K, text, color) {
    const { S } = K;
    const label = String(text || '').slice(0, 10);
    let w = 8; for (const ch of label) w += /[\u3131-\uD79D]/.test(ch) ? 10.5 : 6.4;
    return S('g', { class: 'ar-kingdom-tag' },
      S('rect', { x: -w / 2, y: -8, width: w, height: 15, rx: 3, fill: '#fff', stroke: 'rgba(0,0,0,.15)', 'stroke-width': 0.6 }),
      S('text', { x: 0, y: 3.4, 'text-anchor': 'middle', fill: color, 'font-size': 10.5, 'font-weight': 800 }, label));
  }
  function avatarSmall(K, av, nick, size) {
    try { if (av && KQ.avatar && typeof KQ.avatar.render === 'function') { const n = KQ.avatar.render(av, size); if (n instanceof Node) return K.H('span', { class: 'ar-kingdom-av' }, n); } } catch {}
    const first = Array.from(String(nick || '').trim())[0] || '?';
    return K.H('span', { class: 'ar-kingdom-av ar-kingdom-av-txt', style: { background: K.colorFor(nick), width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.5) + 'px' } }, first);
  }
  // 풀밭 위 흩어진 풀 무늬 (SVG 안)
  function grassDeco(K, W, Ht, seed) {
    const { S } = K;
    const g = S('g', { class: 'ar-kingdom-deco', 'aria-hidden': 'true' });
    let x = seed || 7; const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
    for (let i = 0; i < 14; i++) {
      const cx = rnd() * W, cy = rnd() * Ht, rx = 30 + rnd() * 70, ry = 18 + rnd() * 40;
      g.append(S('ellipse', { cx: cx.toFixed(1), cy: cy.toFixed(1), rx: rx.toFixed(1), ry: ry.toFixed(1), fill: '#7cc63e', opacity: 0.55 }));
    }
    for (let i = 0; i < 70; i++) {
      const cx = rnd() * W, cy = rnd() * Ht;
      g.append(S('path', { d: `M${cx.toFixed(1)} ${cy.toFixed(1)} l1.6 -3.4 l1.6 3.4 Z`, fill: '#5fae2e', opacity: 0.7 }));
    }
    for (let i = 0; i < 10; i++) {
      const cx = rnd() * W, cy = rnd() * Ht;
      g.append(S('circle', { cx: cx.toFixed(1), cy: cy.toFixed(1), r: 1.4, fill: '#fff' }), S('circle', { cx: cx.toFixed(1), cy: cy.toFixed(1), r: 0.6, fill: '#ffc94a' }));
    }
    return g;
  }

  // =====================================================================
  // 진행자
  // =====================================================================
  function host(root, v) {
    const K = KQ.modeKit; if (!K) return;
    const { H, S, txt, css, cls, show, replay, later } = K;
    const M = readMap(K, v);
    const teams = K.teamsOf(v);
    const g = geom(M.cols, M.rows);
    const key = ['kingdom-host', M.cols, M.rows, teams.length, M.castles.join('.')].join('|');
    const st = K.prep(root, key, ['ar-kingdom', 'ar-kingdom-host'], (st, root) => {
      st.owner = new Array(M.total).fill(undefined);
      st.seen = new Set(); st.leader = null; st.msgUntil = 0;
      const svg = S('svg', { viewBox: `0 0 ${g.W.toFixed(1)} ${g.H.toFixed(1)}`, class: 'ar-kingdom-map', preserveAspectRatio: 'xMidYMid meet', role: 'img', 'aria-label': '컬러 킹덤 지도' });
      const grid = S('g', { class: 'ar-kingdom-grid' }), color = S('g', { class: 'ar-kingdom-colors' }), castL = S('g', { class: 'ar-kingdom-castles' });
      st.fx = S('g', { class: 'ar-kingdom-fx' });
      st.color = [];
      for (let i = 0; i < M.total; i++) {
        const [cx, cy] = g.center(i);
        grid.append(S('polygon', { points: hexPts(cx, cy, R), class: 'ar-kingdom-hex' }));
        const p = S('polygon', { points: hexPts(cx, cy, R - 0.6), class: 'ar-kingdom-own', hidden: true });
        color.append(p); st.color.push(p);
      }
      st.castles = [];
      teams.forEach(t => {
        const idx = M.castles[t.index]; if (!Number.isInteger(idx) || idx < 0 || idx >= M.total) return;
        const [cx, cy] = g.center(idx); const c = castleG(K, t.color, cx, cy);
        castL.append(c.g); st.castles[t.index] = c;
      });
      svg.append(grassDeco(K, g.W, g.H, 11), grid, color, castL, st.fx);
      st.svg = svg;
      // 팀 패널
      st.panels = [];
      const mkPanel = t => {
        const n = {};
        n.count = H('strong', { class: 'ar-kingdom-count' }); n.pct = H('span', { class: 'ar-kingdom-pct' });
        n.rank = H('span', { class: 'ar-kingdom-rank' });
        n.members = H('ul', { class: 'ar-kingdom-members' });
        n.node = H('section', { class: 'ar-kingdom-team', style: { '--tc': t.color }, 'aria-label': t.name },
          H('div', { class: 'ar-kingdom-team-head' }, shieldSVG(K, t.color, 40), H('div', { class: 'ar-kingdom-team-name' }, H('span', { text: t.name }), n.rank)),
          H('div', { class: 'ar-kingdom-team-score' }, n.count, n.pct),
          n.members);
        n.memKey = null;
        st.panels[t.index] = n; return n.node;
      };
      const left = H('div', { class: 'ar-kingdom-side left' }), right = H('div', { class: 'ar-kingdom-side right' });
      teams.forEach((t, i) => (i % 2 === 0 ? left : right).append(mkPanel(t)));
      // 비율 막대
      st.share = H('div', { class: 'ar-kingdom-share', role: 'img' }); st.segs = [];
      teams.forEach(t => { const s = H('div', { class: 'ar-kingdom-seg', style: { background: t.color } }, H('span')); st.share.append(s); st.segs[t.index] = s; });
      st.free = H('div', { class: 'ar-kingdom-seg free' }); st.share.append(st.free);
      st.ticker = H('div', { class: 'ar-kingdom-ticker', 'aria-live': 'polite' });
      st.tickText = H('span'); st.ticker.append(H('span', { class: 'ar-kingdom-tick-dot', 'aria-hidden': 'true' }), st.tickText);
      root.append(H('div', { class: 'ar-kingdom-grass' }),
        H('div', { class: 'ar-kingdom-layout' }, H('div', { class: 'ar-kingdom-top' }, st.share), H('div', { class: 'ar-kingdom-body' }, left, H('div', { class: 'ar-kingdom-mapwrap' }, svg), right), st.ticker));
    });
    const reduced = K.reducedMotion();
    const now = K.nowMs();

    // --- 새 깃발 찾기 ---
    const ck = c => [c.at, c.team, c.nickname, K.arr(c.tiles).join('.')].join('|');
    const fresh = [];
    if (st.first) { for (const c of M.claims) st.seen.add(ck(c)); }
    else {
      for (const c of M.claims.slice().reverse()) { const k = ck(c); if (!st.seen.has(k)) { st.seen.add(k); fresh.push(c); } }
      if (st.seen.size > 400) st.seen = new Set(M.claims.map(ck));
    }
    const anim = new Map();
    let best = null;
    fresh.forEach((c, ci) => {
      const team = Number(c.team); const color = K.teamColor(team, teams);
      const base = Math.min(ci, 8) * 0.22;
      const placed = K.arr(c.tiles).filter(t => Number.isInteger(t) && t >= 0 && t < M.total);
      const filled = K.arr(c.filled).filter(t => Number.isInteger(t) && t >= 0 && t < M.total);
      let stolen = 0, stolenFrom = -1;
      placed.forEach((t, k) => {
        const d = base + k * 0.16; anim.set(t, d + 0.38);
        const prev = st.owner[t]; if (prev !== undefined && prev >= 0 && prev !== team) { stolen++; stolenFrom = prev; }
        if (!reduced && ci < 12) dropFlag(K, st, g, t, color, d, k === 0 ? c.nickname : (ci < 4 ? c.nickname : null));
      });
      if (filled.length) {
        const pc = placed.map(t => g.center(t));
        filled.forEach(f => {
          const [fx, fy] = g.center(f);
          let dist = Infinity; for (const [px, py] of pc) dist = Math.min(dist, Math.hypot(fx - px, fy - py));
          if (!Number.isFinite(dist)) dist = 0;
          anim.set(f, base + 0.75 + (dist / HW) * 0.09);
          const prev = st.owner[f]; if (prev !== undefined && prev >= 0 && prev !== team) { stolen++; stolenFrom = prev; }
        });
      }
      const nick = K.str(c.nickname) || '누군가';
      const tname = K.teamName(team, teams);
      let score = 1, msg = `${tname} ${nick} 님이 깃발 ${placed.length}개를 꽂았어요.`;
      if (stolen) { score = 2 + stolen; msg = `${nick} 님이 ${K.teamName(stolenFrom, teams)} 땅을 ${stolen}칸 빼앗았어요!`; }
      if (filled.length >= 3) { score = 10 + filled.length; msg = `대단해요! ${nick} 님이 땅을 빙 둘러싸서 ${filled.length}칸을 한꺼번에 차지했어요!`; }
      if (!best || score > best.score) best = { score, msg, big: filled.length >= 3 || stolen >= 2 };
    });

    // --- 칸 색칠 ---
    for (let i = 0; i < M.total; i++) {
      const o = M.tiles[i];
      if (st.owner[i] === o) continue;
      const p = st.color[i];
      if (o >= 0) {
        const c = K.teamColor(o, teams);
        p.setAttribute('fill', c); p.setAttribute('stroke', K.shade(c, -0.25)); show(p, true);
        if (!st.first && anim.has(i) && !reduced) { p.style.animationDelay = anim.get(i).toFixed(2) + 's'; replay(p, 'ar-kingdom-pop'); }
      } else show(p, false);
      st.owner[i] = o;
    }

    // --- 팀 패널·비율 막대 ---
    const counts = countTiles(M.tiles, teams);
    const { rank } = teamRanks(teams, counts);
    const leader = leaderOf(teams, counts);
    const players = K.arr(v.players);
    teams.forEach(t => {
      const n = st.panels[t.index]; if (!n) return;
      const c = counts.get(t.index) || 0; const pct = M.total ? c / M.total * 100 : 0;
      txt(n.count, `${c}칸`); txt(n.pct, `${Math.round(pct)}%`);
      txt(n.rank, `${rank.get(t.index)}위`);
      cls(n.node, 'lead', leader === t.index);
      const mem = players.filter(p => p && p.team === t.index);
      const mk = mem.map(p => p.id + ':' + p.nickname).join(',');
      if (mk !== n.memKey) {
        n.memKey = mk;
        const shown = mem.slice(0, 5);
        n.members.replaceChildren(...shown.map(p => H('li', {}, avatarSmall(K, p.avatar, p.nickname, 22), H('span', { text: K.str(p.nickname) }))),
          ...(mem.length > shown.length ? [H('li', { class: 'more', text: `외 ${mem.length - shown.length}명` })] : []),
          ...(!mem.length ? [H('li', { class: 'more', text: '아직 팀원이 없어요' })] : []));
      }
      const s = st.segs[t.index];
      if (s) { css(s, 'flex-grow', c.toFixed(0)); txt(s.firstChild, pct >= 7 ? `${Math.round(pct)}%` : ''); show(s, c > 0); }
      const cs = st.castles[t.index]; if (cs) cls(cs.g, 'winner', v.phase === 'finished' && leader === t.index);
    });
    const used = [...counts.values()].reduce((a, b) => a + b, 0);
    css(st.free, 'flex-grow', Math.max(0, M.total - used).toFixed(0));
    K.attr(st.share, 'aria-label', '영토 비율: ' + teams.map(t => `${t.name} ${counts.get(t.index) || 0}칸`).join(', ') + `, 빈 땅 ${Math.max(0, M.total - used)}칸`);
    K.attr(st.svg, 'aria-label', '컬러 킹덤 지도, ' + teams.map(t => `${t.name} ${counts.get(t.index) || 0}칸`).join(', '));

    // --- 해설 ---
    const say = (m, ms2, big) => {
      txt(st.tickText, m); st.msgUntil = now + (ms2 || 6000); cls(st.ticker, 'big', !!big); replay(st.ticker, 'ar-kingdom-tick-in');
      later(st, () => setDefault(), (ms2 || 6000) + 50);
    };
    const setDefault = () => {
      if (K.nowMs() < st.msgUntil) return;
      const vv = st.view || v;
      cls(st.ticker, 'big', false);
      txt(st.tickText, defaultMsg(K, vv, teams, st.lastCounts || counts));
    };
    st.view = v; st.lastCounts = counts;
    if (best) {
      say(best.msg, best.big ? 7000 : 5000, best.big);
      snd(best.big ? 'levelup' : 'pop');
    }
    if (!st.first && v.phase === 'running' && leader >= 0 && st.leader !== null && leader !== st.leader) {
      const tn = K.teamName(leader, teams);
      later(st, () => { say(`${tn}이 선두로 나섰어요!`, 5000, true); snd('whoosh'); }, best ? 2600 : 0);
    }
    st.leader = leader;
    if (st.phase !== v.phase) {
      st.phase = v.phase;
      if (v.phase === 'finished') { st.msgUntil = 0; if (!st.first) snd('cheer'); }
      if (K.nowMs() >= st.msgUntil) setDefault();
    } else if (st.first || now >= st.msgUntil) setDefault();
  }
  function defaultMsg(K, v, teams, counts) {
    if (v.phase === 'countdown' || v.phase === 'lobby') return '곧 시작해요! 정답을 맞히면 깃발 3개, 우리 성 주변부터 넓혀요.';
    if (v.phase === 'finished') {
      const lead = leaderOf(teams, counts);
      if (lead < 0) return '무승부! 모든 팀이 멋지게 싸웠어요.';
      return `${K.teamName(lead, teams)} 승리! 땅 ${counts.get(lead) || 0}칸을 차지했어요.`;
    }
    const tips = ['정답을 맞히면 깃발 3개! 우리 팀 땅과 맞닿은 칸에 꽂아요.', '땅을 빙 둘러싸면 안쪽이 모두 우리 땅이 돼요.', '다른 팀 땅도 빼앗을 수 있어요. 성은 빼앗을 수 없어요.'];
    return tips[Math.floor(K.nowMs() / 9000) % tips.length];
  }
  function dropFlag(K, st, g, idx, color, delay, nick) {
    const { S, later } = K;
    const [cx, cy] = g.center(idx);
    const inner = S('g', { class: 'ar-kingdom-drop', style: { animationDelay: delay.toFixed(2) + 's' } }, mapFlag(K, color));
    const outer = S('g', { transform: `translate(${cx.toFixed(2)} ${cy.toFixed(2)})` }, inner);
    st.fx.append(outer);
    later(st, () => outer.remove(), (delay + 2.6) * 1000);
    if (nick) {
      const tag = S('g', { class: 'ar-kingdom-tagwrap', style: { animationDelay: (delay + 0.3).toFixed(2) + 's' } }, nameTag(K, nick, color));
      const tOuter = S('g', { transform: `translate(${cx.toFixed(2)} ${(cy - 27).toFixed(2)})` }, tag);
      st.fx.append(tOuter);
      later(st, () => tOuter.remove(), (delay + 3.2) * 1000);
    }
  }

  // =====================================================================
  // 학생
  // =====================================================================
  function player(root, v, send) {
    const K = KQ.modeKit; if (!K) return;
    const a = v.actions;
    if (a && a.kind === 'flags' && v.phase === 'running') return playerFlags(K, root, v, send);
    return playerStrip(K, root, v);
  }

  function playerStrip(K, root, v) {
    const { H, txt, css } = K;
    const me = K.meOf(v) || {};
    const teams = K.teamsOf(v);
    const team = Number.isInteger(me.team) ? me.team : -1;
    const tc = K.safeColor(me.teamColor) || K.teamColor(team, teams);
    const st = K.prep(root, 'kingdom-strip|' + team + '|' + teams.length, ['ar-kingdom', 'ar-kingdom-strip'], (st, root) => {
      st.name = H('div', { class: 'ar-kingdom-s-name' }); st.line = H('div', { class: 'ar-kingdom-s-line' });
      st.mine = H('div', { class: 'ar-kingdom-s-mine' }); st.hint = H('div', { class: 'ar-kingdom-s-hint' });
      st.bar = H('div', { class: 'ar-kingdom-s-bar', 'aria-hidden': 'true' }); st.bsegs = [];
      teams.forEach(t => { const s = H('div', { class: 'ar-kingdom-s-seg' + (t.index === team ? ' me' : ''), style: { background: t.color } }); st.bar.append(s); st.bsegs[t.index] = s; });
      st.bfree = H('div', { class: 'ar-kingdom-s-seg free' }); st.bar.append(st.bfree);
      root.append(H('div', { class: 'ar-kingdom-s-card', style: { '--tc': tc } },
        shieldSVG(K, tc, 44),
        H('div', { class: 'ar-kingdom-s-main' }, st.name, st.line, st.bar, st.hint),
        H('div', { class: 'ar-kingdom-s-side' }, flagIcon(K, tc, 22), st.mine)));
    });
    const M = readMap(K, v);
    const counts = countTiles(M.tiles, teams);
    const { rank } = teamRanks(teams, counts);
    const mine = counts.get(team) || 0;
    txt(st.name, me.teamName || K.teamName(team, teams));
    txt(st.line, team >= 0 ? `우리 팀 땅 ${mine}칸 · ${teams.length}팀 중 ${rank.get(team) || '-'}위` : '팀을 배정하는 중…');
    const tiles = me.stats ? K.num(me.stats.tiles, 0) : 0;
    txt(st.mine, `내 땅 ${tiles}칸`);
    let used = 0;
    teams.forEach(t => { const c = counts.get(t.index) || 0; used += c; const s = st.bsegs[t.index]; if (s) css(s, 'flex-grow', String(c)); });
    css(st.bfree, 'flex-grow', String(Math.max(0, M.total - used)));
    const hint = v.phase === 'countdown' || v.phase === 'lobby' ? '곧 시작! 정답을 맞히면 깃발 3개를 받아요.'
      : v.phase === 'finished' ? (rank.get(team) === 1 && mine > 0 ? '우리 팀이 가장 넓은 왕국을 세웠어요!' : '수고했어요! 큰 화면에서 결과를 확인해요.')
      : '정답 1개 = 깃발 3개. 땅을 둘러싸면 안쪽도 우리 땅!';
    txt(st.hint, hint);
  }

  function playerFlags(K, root, v, send) {
    const { H, S, txt, cls, show } = K;
    const me = K.meOf(v) || {};
    const teams = K.teamsOf(v);
    const team = Number.isInteger(me.team) ? me.team : 0;
    const tc = K.safeColor(me.teamColor) || K.teamColor(team, teams);
    const M = readMap(K, v);
    const g = geom(M.cols, M.rows);
    const st = K.prep(root, ['kingdom-flags', M.cols, M.rows, team].join('|'), ['ar-kingdom', 'ar-kingdom-flags'], (st, root) => {
      st.session = null;
      st.svg = S('svg', { class: 'ar-kingdom-pmap', preserveAspectRatio: 'xMidYMid meet', role: 'group', 'aria-label': '깃발을 꽂을 땅 지도' });
      const grid = S('g'), marks = S('g', { class: 'ar-kingdom-marks' }), castL = S('g', { class: 'ar-kingdom-castles' }), flags = S('g', { class: 'ar-kingdom-pflags' });
      st.flagsL = flags;
      st.tile = []; st.mark = [];
      for (let i = 0; i < M.total; i++) {
        const [cx, cy] = g.center(i);
        const p = S('polygon', { points: hexPts(cx, cy, R - 0.4), class: 'ar-kingdom-ptile', 'data-i': i });
        p.addEventListener('click', () => tap(st, i));
        p.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(st, i); } });
        grid.append(p); st.tile.push(p);
        const m = S('polygon', { points: hexPts(cx, cy, R - 4.5), class: 'ar-kingdom-valid', hidden: true });
        marks.append(m); st.mark.push(m);
      }
      teams.forEach(t => { const idx = M.castles[t.index]; if (!Number.isInteger(idx) || idx < 0 || idx >= M.total) return; const [cx, cy] = g.center(idx); const c = castleG(K, t.color, cx, cy); castL.append(c.g); });
      st.svg.append(grassDeco(K, g.W, g.H, 23), grid, marks, castL, flags);
      st.left = H('span', { class: 'ar-kingdom-f-left' });
      st.icons = H('span', { class: 'ar-kingdom-f-icons', 'aria-hidden': 'true' });
      st.title = H('div', { class: 'ar-kingdom-f-title' });
      st.note = H('div', { class: 'ar-kingdom-f-note', 'aria-live': 'polite' });
      st.resetBtn = H('button', { type: 'button', class: 'btn ar-kingdom-f-reset', onClick: () => { const se = st.session; if (!se || se.sending || se.sent) return; se.picks = []; snd('whoosh'); redraw(K, st); } }, '다시 고르기');
      st.sendBtn = H('button', { type: 'button', class: 'btn ar-kingdom-f-send', onClick: () => doSend(K, st) });
      st.done = H('div', { class: 'ar-kingdom-f-done', hidden: true });
      root.append(H('div', { class: 'ar-kingdom-f-card', style: { '--tc': tc } },
        H('div', { class: 'ar-kingdom-f-head' }, shieldSVG(K, tc, 34), H('div', { class: 'ar-kingdom-f-htext' }, st.title, H('div', { class: 'ar-kingdom-f-count' }, st.icons, st.left))),
        H('div', { class: 'ar-kingdom-f-mapwrap ar-kingdom-grassbg' }, st.svg, st.done),
        st.note,
        H('div', { class: 'ar-kingdom-f-btns' }, st.resetBtn, st.sendBtn)));
    });
    st.view = v; st.send = send; st.M = M; st.g = g; st.team = team; st.tc = tc; st.teams = teams;
    const seq = v.result ? K.num(v.result.seq, 0) : 0;
    const a = v.actions || {};
    const remaining = K.clamp(Math.floor(K.num(a.remaining, 3)) || 3, 1, 12);
    if (!st.session || (st.session.sent && seq > st.session.sentSeq)) {
      st.session = { picks: [], sending: false, sent: false, sentSeq: 0, remaining, msg: '' };
      st.cropDone = false;
    }
    st.session.remaining = remaining;
    if (!st.cropDone) { setCrop(K, st, root); st.cropDone = true; }
    redraw(K, st);
  }
  function chain(st, list) {
    const temp = st.M.tiles.slice(); const out = [];
    for (const t of list) { if (out.length >= st.session.remaining) break; if (canClaim(st.M, temp, st.team, t)) { temp[t] = st.team; out.push(t); } }
    return { picks: out, temp };
  }
  function setCrop(K, st, root) {
    const { M, g } = st;
    let w = 0; try { w = root.getBoundingClientRect().width || 0; } catch {}
    let box = [0, 0, g.W, g.H];
    if (w && w < 560) {
      let set = new Set(); M.tiles.forEach((o, i) => { if (o === st.team) set.add(i); });
      if (!set.size) set = new Set(M.tiles.map((_, i) => i));
      for (let k = 0; k < 3; k++) { const add = []; for (const i of set) for (const n of neighbors(M.cols, M.rows, i)) add.push(n); add.forEach(n => set.add(n)); }
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const i of set) { const [cx, cy] = g.center(i); x0 = Math.min(x0, cx - HW / 2); x1 = Math.max(x1, cx + HW / 2); y0 = Math.min(y0, cy - R); y1 = Math.max(y1, cy + R); }
      x0 -= 4; y0 -= 6; x1 += 4; y1 += 4;
      let bw = Math.max(x1 - x0, HW * 7.5), bh = Math.max(y1 - y0, bw * 0.8);
      if (bw < bh / 1.15) bw = bh / 1.15;
      bw = Math.min(bw, g.W); bh = Math.min(bh, g.H);
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      let bx = K.clamp(mx - bw / 2, 0, g.W - bw), by = K.clamp(my - bh / 2, 0, g.H - bh);
      box = [bx, by, bw, bh];
    }
    st.svg.setAttribute('viewBox', box.map(n => n.toFixed(1)).join(' '));
    st.svg.classList.toggle('cropped', box[2] < g.W - 1);
  }
  function tap(st, i) {
    const K = KQ.modeKit; const se = st.session; if (!K || !se || se.sending || se.sent) return;
    const at = se.picks.indexOf(i);
    if (at >= 0) { se.picks.splice(at, 1); se.picks = chain(st, se.picks).picks; snd('whoosh'); redraw(K, st); return; }
    if (se.picks.length >= se.remaining) { se.msg = '깃발을 모두 골랐어요. 바꾸려면 고른 칸을 다시 눌러요.'; redraw(K, st); return; }
    const { temp } = chain(st, se.picks);
    if (!canClaim(st.M, temp, st.team, i)) {
      se.msg = st.M.castles.includes(i) ? '성은 차지할 수 없어요.' : temp[i] === st.team ? '이미 우리 팀 땅이에요.' : '우리 팀 땅과 맞닿은 칸만 고를 수 있어요.';
      snd('wrong'); try { if (navigator.vibrate) navigator.vibrate(40); } catch {}
      redraw(K, st); return;
    }
    se.picks.push(i); se.msg = ''; snd('pop'); try { if (navigator.vibrate) navigator.vibrate(20); } catch {}
    redraw(K, st);
    if (se.picks.length >= se.remaining) {
      const snap = se.picks.join('.');
      K.later(st, () => { if (st.session === se && !se.sending && !se.sent && se.picks.join('.') === snap) doSend(K, st); }, 650);
    }
  }
  function doSend(K, st) {
    const se = st.session; if (!se || se.sending || se.sent || !se.picks.length) return;
    se.sending = true; se.msg = ''; redraw(K, st);
    const list = se.picks.slice();
    K.act(st.send, 'flags', list).then(r => {
      se.sending = false; se.sent = true;
      const rs = r && r.result ? K.num(r.result.seq, 0) : 0;
      se.sentSeq = Math.max(rs, st.view && st.view.result ? K.num(st.view.result.seq, 0) : 0);
      se.msg = r && r.result && r.result.message ? K.str(r.result.message) : `깃발 ${list.length}개를 꽂았어요!`;
      snd('correct');
      if (!st.dead) redraw(K, st);
    }).catch(() => {
      se.sending = false;
      se.picks = chain(st, se.picks).picks;
      se.msg = '다시 골라서 깃발을 꽂아 주세요.';
      if (!st.dead) redraw(K, st);
    });
  }
  function redraw(K, st) {
    const { S, txt, cls, show } = K;
    const se = st.session, M = st.M, g = st.g;
    if (!se) return;
    if (!se.sent && !se.sending) se.picks = chain(st, se.picks).picks;
    const { temp } = chain(st, se.picks);
    const pickSet = new Set(se.picks);
    const full = se.picks.length >= se.remaining;
    const locked = se.sent || se.sending;
    let validCount = 0;
    for (let i = 0; i < M.total; i++) {
      const p = st.tile[i]; const o = M.tiles[i];
      const fill = pickSet.has(i) ? K.shade(st.tc, 0.28) : o >= 0 ? K.teamColor(o, st.teams) : null;
      const fk = fill || '';
      if (p.dataset.f !== fk) { p.dataset.f = fk; if (fill) { p.style.fill = fill; p.style.stroke = K.shade(fill, -0.28); } else { p.style.fill = ''; p.style.stroke = ''; } }
      cls(p, 'owned', o >= 0 && !pickSet.has(i));
      cls(p, 'picked', pickSet.has(i));
      const valid = !locked && !full && !pickSet.has(i) && canClaim(M, temp, st.team, i);
      if (valid) validCount++;
      cls(p, 'valid', valid);
      show(st.mark[i], valid);
      const tab = (valid || (pickSet.has(i) && !locked)) ? '0' : '-1';
      if (p.getAttribute('tabindex') !== tab) p.setAttribute('tabindex', tab);
      const c = i % M.cols, r = Math.floor(i / M.cols);
      const lbl = `${r + 1}줄 ${c + 1}번째 칸` + (pickSet.has(i) ? ', 깃발 고름' : valid ? ', 고를 수 있음' : '');
      if (p.getAttribute('aria-label') !== lbl) p.setAttribute('aria-label', lbl);
    }
    // 고른 칸의 깃발
    const fk = se.picks.join('.') + '|' + (locked ? 1 : 0);
    if (st.flagKey !== fk) {
      st.flagKey = fk;
      st.flagsL.replaceChildren(...se.picks.map((t, k) => { const [cx, cy] = g.center(t); return S('g', { transform: `translate(${cx.toFixed(2)} ${cy.toFixed(2)})` }, S('g', { class: 'ar-kingdom-pdrop' + (k === se.picks.length - 1 && !locked ? ' new' : '') }, mapFlag(K, st.tc))); }));
    }
    const left = Math.max(0, se.remaining - se.picks.length);
    const ik = se.remaining + ':' + left;
    if (st.iconKey !== ik) { st.iconKey = ik; st.icons.replaceChildren(...Array.from({ length: se.remaining }, (_, k) => flagIcon(K, st.tc, 22, 'ar-kingdom-f-icon' + (k < se.picks.length ? ' used' : '')))); }
    txt(st.left, se.sent ? '깃발을 모두 꽂았어요' : `남은 깃발 ${left}개`);
    txt(st.title, se.sent ? '우리 땅이 넓어졌어요!' : se.sending ? '깃발을 꽂는 중…' : full ? '이대로 꽂을까요?' : '깃발을 꽂을 칸을 눌러요');
    let note = se.msg;
    if (!note) {
      if (se.sent) note = '큰 화면에서 우리 팀 땅을 확인해요. 곧 다음 문제가 나와요.';
      else if (se.sending) note = '';
      else if (!validCount && !se.picks.length) note = '지금은 꽂을 수 있는 칸이 없어요. 잠시 뒤 다시 확인해요.';
      else if (full) note = '깃발을 모두 골랐어요. 곧 자동으로 꽂아요.';
      else note = '빛나는 칸이 우리 팀 땅과 맞닿은 칸이에요. 땅을 빙 둘러싸면 안쪽도 우리 땅!';
    }
    txt(st.note, note);
    cls(st.note, 'warn', !!se.msg && !se.sent);
    show(st.done, se.sent || se.sending);
    txt(st.done, se.sent ? '깃발 꽂기 완료!' : '보내는 중…');
    cls(st.done, 'ok', se.sent);
    st.resetBtn.disabled = locked || !se.picks.length;
    st.sendBtn.disabled = locked || !se.picks.length;
    txt(st.sendBtn, se.sending ? '보내는 중…' : se.sent ? '완료' : `깃발 꽂기 (${se.picks.length}/${se.remaining})`);
  }

  KQ.arena.kingdom = {
    host(root, view, send) { try { host(root, view || {}, send); } catch (e) { try { console.warn('[컬러 킹덤] 진행자 화면 오류', e); } catch {} } },
    player(root, view, send) { try { player(root, view || {}, send); } catch (e) { try { console.warn('[컬러 킹덤] 학생 화면 오류', e); } catch {} } }
  };
})();
