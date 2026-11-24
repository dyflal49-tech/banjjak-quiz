'use strict';
/* 반짝퀴즈 v5: 반짝 오리지널 3종 고급 그래픽 (행운의 보물상자, 우리반 꽃밭, 보스 레이드)
   KQ.arena.treasure / garden / boss = { host(root, view, send), player(root, view, send) }
   - 같은 root 에 반복 호출됨: 최초 1회 골격(prep), 이후 바뀐 값만 갱신.
   - 닉네임 등 사용자 문자열은 textContent 로만. 이모지 금지. */
(() => {
  const KQ = window.KQ || (window.KQ = {});
  KQ.arena = KQ.arena || {};
  const K = () => KQ.modeKit;
  const N = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  const S2 = v => (v === null || v === undefined) ? '' : String(v);
  const A = a => Array.isArray(a) ? a : [];
  const fmt = n => Math.round(N(n)).toLocaleString('ko-KR');
  const rnd = (a, b) => a + Math.random() * (b - a);
  const snd = k => { try { if (KQ.sound && KQ.sound.play) KQ.sound.play(k); } catch { /* 무시 */ } };
  const fx = (name, ...args) => { try { if (KQ.fx && typeof KQ.fx[name] === 'function') KQ.fx[name](...args); } catch { /* 무시 */ } };
  const reduced = () => { try { return K().reducedMotion(); } catch { return false; } };
  const now = () => { try { return K().nowMs(); } catch { return Date.now(); } };
  const mState = v => (v && v.modeState && typeof v.modeState === 'object') ? v.modeState : {};
  const meOf = v => (v && v.me && typeof v.me === 'object') ? v.me : null;
  const SVGNS = 'http://www.w3.org/2000/svg';

  function avatar(a, size, name, cls) {
    const k = K();
    const w = k.H('span', { class: 'ar-o-av ' + (cls || ''), style: { width: size + 'px', height: size + 'px' } });
    let n = null;
    try { if (a && typeof a === 'object' && KQ.avatar && typeof KQ.avatar.render === 'function') n = KQ.avatar.render(a, size); } catch { n = null; }
    if (n instanceof Node) w.append(n);
    else {
      w.classList.add('fb'); w.style.background = k.colorFor(name || '?'); w.style.fontSize = Math.round(size * 0.46) + 'px';
      w.textContent = Array.from(S2(name).trim() || '?')[0];
    }
    return w;
  }
  // 숫자가 부드럽게 올라가는 표시
  function countTo(st, el, to, ms = 800, pre = '', post = '') {
    if (!el) return;
    to = Math.round(N(to));
    const from = el._v === undefined ? to : el._v; el._v = to;
    if (from === to || reduced()) { el.textContent = pre + fmt(to) + post; return; }
    const t0 = performance.now(); const id = (el._tid = (el._tid || 0) + 1);
    const step = () => {
      if (st.dead || el._tid !== id) return;
      const p = Math.min(1, (performance.now() - t0) / ms); const e = 1 - Math.pow(1 - p, 3);
      el.textContent = pre + fmt(from + (to - from) * e) + post;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function replay(n, c) { if (!n) return; n.classList.remove(c); void n.getBoundingClientRect(); n.classList.add(c); }
  function coinSVG(size = 26) {
    const k = K();
    return k.S('svg', { viewBox: '0 0 40 40', width: size, height: size, class: 'ar-o-coin', 'aria-hidden': 'true' },
      k.S('circle', { cx: 20, cy: 20, r: 18, fill: '#f5b800', stroke: '#a86f00', 'stroke-width': 3 }),
      k.S('circle', { cx: 20, cy: 20, r: 12, fill: '#ffd43b', stroke: '#c79100', 'stroke-width': 2 }),
      k.S('path', { d: 'M15 14 h10 M20 14 v13 M15 27 h10', stroke: '#a86f00', 'stroke-width': 3, 'stroke-linecap': 'round' }));
  }

  // =====================================================================
  // 1. 행운의 보물상자
  // =====================================================================
  function chestSVG(extra) {
    const k = K(), S = k.S;
    return S('svg', { viewBox: '0 0 120 112', class: 'ar-o-chest ' + (extra || ''), 'aria-hidden': 'true', focusable: 'false' },
      S('ellipse', { cx: 60, cy: 106, rx: 50, ry: 6, class: 'shadow' }),
      S('rect', { x: 14, y: 46, width: 92, height: 14, class: 'inner' }),
      S('g', { class: 'loot' }, S('circle', { cx: 40, cy: 50, r: 9, class: 'lc' }), S('circle', { cx: 60, cy: 45, r: 10, class: 'lc' }), S('circle', { cx: 80, cy: 50, r: 9, class: 'lc' })),
      S('rect', { x: 10, y: 54, width: 100, height: 48, rx: 8, class: 'wood' }),
      S('rect', { x: 10, y: 72, width: 100, height: 8, class: 'trim' }),
      S('rect', { x: 24, y: 54, width: 7, height: 48, class: 'trim' }), S('rect', { x: 89, y: 54, width: 7, height: 48, class: 'trim' }),
      S('g', { class: 'lid' },
        S('path', { d: 'M10 56 V40 Q10 14 60 14 Q110 14 110 40 V56 Z', class: 'wood2' }),
        S('rect', { x: 11, y: 46, width: 98, height: 7, class: 'trim' }),
        S('rect', { x: 24, y: 18, width: 7, height: 38, class: 'trim' }), S('rect', { x: 89, y: 18, width: 7, height: 38, class: 'trim' }),
        S('circle', { cx: 60, cy: 30, r: 5, class: 'gem' }), S('circle', { cx: 42, cy: 34, r: 3.5, class: 'gem g2' }), S('circle', { cx: 78, cy: 34, r: 3.5, class: 'gem g3' })),
      S('rect', { x: 51, y: 50, width: 18, height: 21, rx: 4, class: 'lock' }),
      S('circle', { cx: 60, cy: 59, r: 3, class: 'hole' }), S('rect', { x: 58.6, y: 59, width: 2.8, height: 7, class: 'hole' }));
  }
  const PRIZE = {
    gold100: { head: '금화 획득!', coins: 12, sound: 'coin' },
    gold250: { head: '금화 듬뿍!', coins: 20, sound: 'coin' },
    gold500: { head: '금화 폭포!!', coins: 34, sound: 'levelup' },
    jackpot: { head: '잭팟!!!', coins: 56, sound: 'fanfare' },
    double: { head: '두 배 상자!', coins: 18, sound: 'levelup' },
    share: { head: '나눔 상자!', coins: 0, sound: 'sparkle' },
    magnet: { head: '자석 상자!', coins: 0, sound: 'whoosh' },
    empty: { head: '꽝…', coins: 0, sound: 'wrong' }
  };
  const BIG_EVENTS = new Set(['jackpot', 'magnet', 'gold500', 'double']);

  function treasurePlayer(root, v, send) {
    const k = K(); const H = k.H;
    const st = k.prep(root, 'orig:treasure:p', ['ar-o', 'ar-o-tp'], (st, rt) => {
      st.root = rt;
      st.btns = [0, 1, 2].map(i => {
        const b = H('button', { type: 'button', class: 'ar-o-tbtn', 'aria-label': `${i + 1}번 상자 열기`, style: { '--d': (i * 0.18) + 's' }, onClick: () => pick(st, i) },
          H('span', { class: 'ar-o-tbtn-glow', 'aria-hidden': 'true' }), chestSVG(), H('span', { class: 'ar-o-tbtn-num', text: `${i + 1}번` }));
        return b;
      });
      st.pickHead = H('div', { class: 'ar-o-tpick-head', text: '상자를 하나 골라요!' });
      st.pickSub = H('div', { class: 'ar-o-tpick-sub', text: '금화, 잭팟, 두 배, 자석, 나눔, 꽝 중 무엇이 나올까요?' });
      st.pick = H('div', { class: 'ar-o-tpick' }, st.pickHead, st.pickSub, H('div', { class: 'ar-o-trow' }, st.btns));
      st.gold = H('b', { class: 'ar-o-tgold' }); st.rank = H('span', { class: 'ar-o-trank' });
      st.dots = [0, 1, 2].map(() => H('i', { class: 'ar-o-dot' }));
      st.streakTxt = H('span', { class: 'ar-o-tstreak-txt' });
      st.last = H('div', { class: 'ar-o-tlast' });
      st.strip = H('div', { class: 'ar-o-strip ar-o-tstrip' },
        H('div', { class: 'ar-o-tcoin' }, coinSVG(40)),
        H('div', { class: 'ar-o-tmain' }, H('div', { class: 'ar-o-tline' }, H('span', { text: '내 금화 ' }), st.gold, st.rank), st.last),
        H('div', { class: 'ar-o-tstreak' }, H('div', { class: 'ar-o-dots' }, st.dots), st.streakTxt));
      root.append(st.pick, st.strip);
      st.busy = false; st.ov = null;
    });
    st.send = send; st.view = v;
    const a = v.actions; const choosing = !!(a && a.kind === 'chest');
    const golden = !!(choosing && a.golden);
    k.show(st.pick, choosing || st.busy); k.show(st.strip, !(choosing || st.busy));
    k.cls(st.pick, 'golden', golden);
    if (st.goldenNow !== golden && choosing) { st.goldenNow = golden; txt(st.pickHead, golden ? '황금 상자 등장! 하나를 골라요' : '상자를 하나 골라요!'); txt(st.pickSub, golden ? '황금 상자에는 꽝이 없어요. 큰 보물이 기다려요!' : '금화, 잭팟, 두 배, 자석, 나눔, 꽝 중 무엇이 나올까요?'); if (golden) snd('sparkle'); }
    if (choosing && !st.busy) st.btns.forEach(b => { b.disabled = false; b.classList.remove('chosen', 'dim'); k.cls(b, 'golden', golden); });
    const me = meOf(v); const s = mState(v);
    const players = A(s.players).filter(Boolean);
    const mine = me ? players.find(p => S2(p.id) === S2(me.id)) : null;
    const gold = mine ? N(mine.gold) : N(me && me.score);
    countTo(st, st.gold, gold, 900);
    const sorted = players.slice().sort((x, y) => N(y.gold) - N(x.gold));
    const idx = me ? sorted.findIndex(p => S2(p.id) === S2(me.id)) : -1;
    txt(st.rank, idx >= 0 ? ` · ${idx + 1}위 / ${players.length}명` : '');
    const streak = N(me && me.streak); const filled = streak > 0 && streak % 3 === 0 ? 3 : streak % 3;
    st.dots.forEach((d, i) => k.cls(d, 'on', i < filled));
    txt(st.streakTxt, filled === 3 ? '황금 상자 찬스!' : `황금 상자까지 ${3 - filled}번`);
    const r = v.result;
    if (r && r.prize && r.seq !== st.lastSeq) { st.lastSeq = r.seq; txt(st.last, S2(r.message)); k.cls(st.last, 'sad', r.prize === 'empty'); }
    else if (!st.last.textContent) txt(st.last, '정답을 맞히면 보물상자를 열 수 있어요');
  }
  function josa(w) { const c = S2(w).charCodeAt(S2(w).length - 1); const has = c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0; return w + (has ? '이' : '가'); }
  function txt(n, s) { if (n && n.textContent !== s) n.textContent = s; }

  function pick(st, i) {
    if (st.busy) return;
    const k = K(); const v = st.view || {}; const a = v.actions;
    if (!a || a.kind !== 'chest') return;
    st.busy = true;
    const golden = !!a.golden;
    st.btns.forEach((b, j) => { b.disabled = true; k.cls(b, 'chosen', j === i); k.cls(b, 'dim', j !== i); });
    snd('pop');
    const ov = openOverlay(st, golden, i);
    const t0 = performance.now();
    k.act(st.send, 'chest', i).then(r => {
      const res = (r && r.result) || null;
      const wait = Math.max(0, (reduced() ? 300 : 1500) - (performance.now() - t0));
      k.later(st, () => reveal(st, ov, res), wait);
    }, () => { closeOverlay(st, ov, true); });
  }
  function openOverlay(st, golden, i) {
    const k = K(), H = k.H;
    const ov = {};
    ov.parts = H('div', { class: 'ar-o-parts', 'aria-hidden': 'true' });
    ov.chestWrap = H('div', { class: 'ar-o-tov-chest' }, chestSVG());
    ov.head = H('div', { class: 'ar-o-tov-head', text: '두근두근…' });
    ov.sub = H('div', { class: 'ar-o-tov-sub', text: `${i + 1}번 상자를 열고 있어요` });
    ov.amt = H('div', { class: 'ar-o-tov-amt' });
    ov.tap = H('div', { class: 'ar-o-tov-tap', text: '화면을 누르면 닫혀요' });
    ov.stamp = H('div', { class: 'ar-o-tov-stamp' });
    ov.node = H('div', { class: 'ar-o-tov suspense' + (golden ? ' golden' : ''), role: 'dialog', 'aria-live': 'assertive', 'aria-label': '보물상자 여는 중' },
      H('div', { class: 'ar-o-rays', 'aria-hidden': 'true' }),
      H('div', { class: 'ar-o-tov-stage' }, H('div', { class: 'ar-o-tov-glow', 'aria-hidden': 'true' }), ov.chestWrap, ov.stamp, ov.parts),
      ov.head, ov.sub, ov.amt, ov.tap);
    ov.node.addEventListener('click', () => { if (ov.canClose) closeOverlay(st, ov); });
    document.body.append(ov.node);
    st.ov = ov;
    setTimeout(() => { if (!ov.closed && !ov.node.classList.contains('reveal')) closeOverlay(st, ov, true); }, 20000);
    snd('drumroll');
    return ov;
  }
  function reveal(st, ov, res) {
    if (!ov || ov.closed) return;
    const k = K(), H = k.H;
    const prize = (res && PRIZE[res.prize]) ? res.prize : ((res && N(res.points) > 0) ? 'gold250' : 'empty');
    const P = PRIZE[prize];
    ov.node.classList.remove('suspense'); ov.node.classList.add('reveal', 'p-' + prize);
    ov.head.textContent = P.head;
    ov.sub.textContent = S2(res && res.message) || (prize === 'empty' ? '텅 빈 상자예요. 다음엔 꼭!' : '보물을 찾았어요!');
    const pts = N(res && res.points);
    if (pts > 0) { ov.amt.textContent = '+0 금화'; ov.amt._v = 0; countTo(st, ov.amt, pts, prize === 'jackpot' ? 1500 : 1000, '+', ' 금화'); }
    snd(P.sound);
    const parts = ov.parts;
    const coin = (cls, vars) => { const c = H('span', { class: 'ar-o-pc ' + cls, style: vars }); c.append(coinSVG(28)); parts.append(c); return c; };
    if (!reduced()) {
      for (let j = 0; j < P.coins; j++) coin('fount', { '--dx': rnd(-260, 260).toFixed(0) + 'px', '--dy': rnd(160, 360).toFixed(0) + 'px', '--r': rnd(-540, 540).toFixed(0) + 'deg', '--dl': (j * 0.025).toFixed(2) + 's' });
      if (prize === 'share') for (let j = 0; j < 24; j++) { const ang = j / 24 * Math.PI * 2; coin('radiate', { '--dx': (Math.cos(ang) * 520).toFixed(0) + 'px', '--dy': (Math.sin(ang) * 420).toFixed(0) + 'px', '--dl': (0.2 + (j % 6) * 0.06).toFixed(2) + 's' }); }
      if (prize === 'magnet') {
        const chip = H('div', { class: 'ar-o-victim' }, H('span', { class: 'ar-o-magnet', 'aria-hidden': 'true' }), H('b', { text: res && res.victim ? S2(res.victim) : '금화 더미' }));
        parts.append(chip);
        for (let j = 0; j < 16; j++) coin('pull', { '--sx': rnd(-60, 60).toFixed(0) + 'px', '--sy': '-300px', '--dl': (0.4 + j * 0.08).toFixed(2) + 's' });
      }
      if (prize === 'empty') for (let j = 0; j < 8; j++) parts.append(H('span', { class: 'ar-o-dust', style: { '--dx': rnd(-150, 150).toFixed(0) + 'px', '--dy': rnd(-120, -20).toFixed(0) + 'px', '--s': rnd(0.6, 1.4).toFixed(2), '--dl': (j * 0.04).toFixed(2) + 's' } }));
      for (let j = 0; j < 10; j++) parts.append(H('span', { class: 'ar-o-spark', style: { '--a': (j * 36) + 'deg', '--dl': (j * 0.02).toFixed(2) + 's' } }));
    }
    if (prize === 'double') { ov.stamp.textContent = 'x2'; ov.stamp.classList.add('on'); }
    if (prize === 'empty') { ov.stamp.textContent = '꽝'; ov.stamp.classList.add('on', 'grey'); }
    if (prize === 'jackpot') { fx('flash', '#fff6c4', 380); fx('fireworks', 4200); fx('rain', 3500); k.later(st, () => snd('cheer'), 500); }
    else if (prize === 'gold500' || prize === 'double') { fx('flash', '#ffffff', 220); fx('confetti', { y: 0.55, count: 140, power: 1.1 }); }
    else if (prize !== 'empty') fx('confetti', { y: 0.6, count: 70, power: 0.8 });
    try { if (navigator.vibrate) navigator.vibrate(prize === 'empty' ? [60, 40, 60] : prize === 'jackpot' ? [80, 50, 80, 50, 160] : 70); } catch { /* 무시 */ }
    k.later(st, () => { ov.canClose = true; ov.tap.classList.add('on'); }, 700);
    setTimeout(() => closeOverlay(st, ov), prize === 'jackpot' ? 4800 : 3600);
  }
  function closeOverlay(st, ov, failed) {
    if (!ov || ov.closed) return;
    ov.closed = true;
    ov.node.classList.add('out');
    setTimeout(() => { try { ov.node.remove(); } catch { /* 무시 */ } }, failed ? 0 : 320);
    if (st.ov === ov) st.ov = null;
    st.busy = false;
    try { if (st.view && !st.dead && st.root) treasurePlayer(st.root, st.view, st.send); } catch { /* 무시 */ }
  }

  function treasureHost(root, v) {
    const k = K(), H = k.H;
    const st = k.prep(root, 'orig:treasure:h', ['ar-o', 'ar-o-host', 'ar-o-th'], st => {
      st.rows = new Map();
      st.list = H('div', { class: 'ar-o-thlist' });
      st.empty = H('div', { class: 'ar-o-empty', text: '정답을 맞히고 상자를 열면 금화가 쌓여요' });
      st.chest = H('div', { class: 'ar-o-thchest' }, chestSVG('big'));
      st.ticker = H('ul', { class: 'ar-o-ticker', 'aria-label': '보물 소식' });
      st.pop = H('div', { class: 'ar-o-thpop-layer', 'aria-live': 'polite' });
      st.floats = H('div', { class: 'ar-o-floats', 'aria-hidden': 'true' });
      const torches = [8, 92].map(x => H('span', { class: 'ar-o-torch', style: { left: x + '%' }, 'aria-hidden': 'true' }));
      const gems = Array.from({ length: 14 }, (_, i) => H('span', { class: 'ar-o-gemsp', style: { left: ((i * 37) % 100) + '%', top: ((i * 53) % 90) + '%', '--dl': (-(i % 7) * 0.6) + 's' }, 'aria-hidden': 'true' }));
      st.scene = H('div', { class: 'ar-o-thscene' }, ...gems, ...torches,
        H('section', { class: 'ar-o-thboard' }, H('h3', { class: 'ar-o-ttl', text: '금화 순위' }), H('div', { class: 'ar-o-thlist-wrap' }, st.list, st.empty)),
        H('section', { class: 'ar-o-thside' }, st.chest, st.floats, H('h3', { class: 'ar-o-ttl', text: '보물 소식' }), st.ticker),
        st.pop);
      root.append(st.scene);
      st.seen = new Set(); st.queue = []; st.popping = false;
    });
    const s = mState(v);
    const players = A(s.players).filter(p => p && p.id !== undefined);
    const sorted = players.slice().sort((x, y) => (N(y.gold) - N(x.gold)) || S2(x.nickname).localeCompare(S2(y.nickname), 'ko'));
    const top = sorted.slice(0, 8); const max = Math.max(1, ...top.map(p => N(p.gold)));
    const keep = new Set();
    top.forEach((p, i) => {
      const id = S2(p.id); keep.add(id);
      let r = st.rows.get(id);
      if (!r) {
        r = { gold: H('b', { class: 'ar-o-thgold' }), bar: H('i', { class: 'ar-o-thbar' }), rank: H('span', { class: 'ar-o-thrank' }), fire: H('span', { class: 'ar-o-thfire' }) };
        r.node = H('div', { class: 'ar-o-throw' + (st.first ? '' : ' enter') }, r.rank, avatar(p.avatar, 34, p.nickname), H('span', { class: 'ar-o-thname', text: S2(p.nickname) }), H('span', { class: 'ar-o-thbarwrap' }, r.bar), r.fire, r.gold);
        st.list.append(r.node); st.rows.set(id, r);
      }
      const prevRank = r.i;
      r.i = i;
      r.node.style.setProperty('--i', i);
      k.cls(r.node, 'top1', i === 0); k.cls(r.node, 'top2', i === 1); k.cls(r.node, 'top3', i === 2);
      if (prevRank !== undefined && i < prevRank && !st.first) replay(r.node, 'up');
      txt(r.rank, String(i + 1));
      r.bar.style.width = (N(p.gold) / max * 100).toFixed(1) + '%';
      if (r.goldVal !== undefined && N(p.gold) > r.goldVal) replay(r.gold, 'bump');
      r.goldVal = N(p.gold);
      countTo(st, r.gold, p.gold, 900);
      txt(r.fire, N(p.streak) >= 2 ? `${N(p.streak)}연속` : '');
      k.cls(r.fire, 'on', N(p.streak) >= 2);
    });
    for (const [id, r] of st.rows) if (!keep.has(id)) { r.node.remove(); st.rows.delete(id); }
    k.show(st.empty, !top.length);
    // 소식
    const events = A(s.events).filter(e => e && typeof e === 'object');
    const keyOf = e => `${N(e.at)}|${S2(e.nickname)}|${S2(e.prize)}|${S2(e.text)}`;
    const fresh = events.filter(e => !st.seen.has(keyOf(e)));
    fresh.forEach(e => st.seen.add(keyOf(e)));
    if (st.first) {
      st.ticker.replaceChildren(...events.slice(0, 5).map(e => tickerItem(e)));
    } else if (fresh.length) {
      fresh.slice(0, 6).reverse().forEach((e, j) => k.later(st, () => {
        st.ticker.prepend(tickerItem(e, true));
        while (st.ticker.children.length > 5) st.ticker.lastChild.remove();
        replay(st.chest, 'open');
        const f = H('div', { class: 'ar-o-hfloat' + (e.prize === 'empty' ? ' sad' : '') }, avatar(e.avatar, 26, e.nickname), H('b', { text: N(e.gain) > 0 ? `+${fmt(e.gain)}` : (e.prize === 'empty' ? '꽝' : '나눔') }));
        f.style.left = rnd(20, 70) + '%'; st.floats.append(f); setTimeout(() => f.remove(), 2200);
        snd(e.prize === 'empty' ? 'pop' : 'coin');
        if (BIG_EVENTS.has(e.prize) && (e.prize !== 'double' || N(e.gain) >= 400) || e.golden || e.prize === 'share') { st.queue.push(e); nextPop(st); }
      }, j * 380));
    }
  }
  function tickerItem(e, fresh) {
    const k = K(), H = k.H;
    const cls = 'ar-o-tick p-' + S2(e.prize) + (e.golden ? ' golden' : '') + (fresh ? ' fresh' : '');
    return H('li', { class: cls }, avatar(e.avatar, 24, e.nickname), H('b', { text: S2(e.nickname) }), H('span', { text: S2(e.text) }));
  }
  function nextPop(st) {
    if (st.popping || !st.queue.length || st.dead) return;
    const k = K(), H = k.H;
    const e = st.queue.shift(); st.popping = true;
    const title = e.prize === 'jackpot' ? '잭팟!!!' : e.prize === 'magnet' ? '자석 상자!' : e.prize === 'share' ? '나눔 상자!' : e.prize === 'double' ? '두 배 상자!' : e.golden ? '황금 상자!' : '큰 보물!';
    const card = H('div', { class: 'ar-o-thpop p-' + S2(e.prize) + (e.golden ? ' golden' : '') },
      H('div', { class: 'ar-o-rays', 'aria-hidden': 'true' }),
      H('div', { class: 'ar-o-thpop-title', text: title }),
      avatar(e.avatar, 84, e.nickname, 'pop'),
      H('div', { class: 'ar-o-thpop-name', text: S2(e.nickname) }),
      H('div', { class: 'ar-o-thpop-text', text: S2(e.text) }));
    st.pop.append(card);
    if (e.prize === 'jackpot') { fx('fireworks', 3000); snd('fanfare'); } else snd('levelup');
    fx('burst', card, { count: e.prize === 'jackpot' ? 90 : 50 });
    k.later(st, () => { card.classList.add('out'); }, 2300);
    k.later(st, () => { card.remove(); st.popping = false; nextPop(st); }, 2650);
  }

  // =====================================================================
  // 2. 우리반 꽃밭
  // =====================================================================
  const PETALS = [['#ff6b9d', '#ffd1e1'], ['#ffd43b', '#fff3bf'], ['#9775fa', '#e5dbff'], ['#ff922b', '#ffe8cc'], ['#4dabf7', '#d0ebff'], ['#f03e3e', '#ffe3e3']];
  const RAINBOW = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#4dabf7', '#9775fa'];
  function flowerSVG(kind, rare) {
    const k = K(), S = k.S;
    const [c1, c2] = PETALS[((N(kind) % 6) + 6) % 6];
    const petals = [];
    const n = rare ? 8 : [5, 6, 5, 8, 6, 5][((N(kind) % 6) + 6) % 6];
    for (let i = 0; i < n; i++) petals.push(S('ellipse', { cx: 0, cy: -9, rx: rare ? 5.2 : 5.6, ry: 9.5, fill: rare ? RAINBOW[i % 6] : c1, stroke: 'rgba(0,0,0,.15)', 'stroke-width': 0.8, transform: `rotate(${(360 / n) * i})` }));
    return S('svg', { viewBox: '0 0 44 80', class: 'ar-o-flsvg', 'aria-hidden': 'true', focusable: 'false' },
      S('ellipse', { cx: 22, cy: 78, rx: 9, ry: 2.6, fill: 'rgba(0,60,0,.25)', class: 'mound' }),
      S('g', { class: 'stem' },
        S('path', { d: 'M22 78 Q19 58 22 34', fill: 'none', stroke: '#2f9e44', 'stroke-width': 3.2, 'stroke-linecap': 'round' }),
        S('ellipse', { cx: 15, cy: 60, rx: 7, ry: 3.2, fill: '#51cf66', transform: 'rotate(-30 15 60)', class: 'leaf' }),
        S('ellipse', { cx: 29, cy: 52, rx: 7, ry: 3.2, fill: '#40c057', transform: 'rotate(30 29 52)', class: 'leaf' })),
      S('g', { transform: 'translate(22 28)' },
        S('g', { class: 'head' }, ...petals, S('circle', { r: 5.5, fill: rare ? '#fff' : c2, stroke: rare ? '#ffd43b' : '#e8a400', 'stroke-width': 1.6 }), S('circle', { r: 2.2, fill: rare ? '#ffd43b' : '#f08c00' }))));
  }
  function butterfly(color) {
    const k = K(), S = k.S;
    return S('svg', { viewBox: '0 0 40 30', class: 'ar-o-bf', 'aria-hidden': 'true' },
      S('g', { class: 'wl' }, S('ellipse', { cx: 12, cy: 10, rx: 10, ry: 8, fill: color }), S('ellipse', { cx: 13, cy: 22, rx: 7, ry: 5.5, fill: color, opacity: 0.85 })),
      S('g', { class: 'wr' }, S('ellipse', { cx: 28, cy: 10, rx: 10, ry: 8, fill: color }), S('ellipse', { cx: 27, cy: 22, rx: 7, ry: 5.5, fill: color, opacity: 0.85 })),
      S('rect', { x: 18.5, y: 5, width: 3, height: 20, rx: 1.5, fill: '#3b2a1a' }));
  }
  function gardenHost(root, v) {
    const k = K(), H = k.H;
    const st = k.prep(root, 'orig:garden:h', ['ar-o', 'ar-o-host', 'ar-o-gh'], st => {
      st.field = H('div', { class: 'ar-o-gfield' });
      st.fl = new Map();
      st.ptext = H('b'); st.fill = H('i', { class: 'ar-o-gfill' }); st.pct = H('span', { class: 'ar-o-gpct' });
      st.marks = [25, 50, 75].map(p => H('span', { class: 'ar-o-gmark', style: { left: p + '%' } }));
      st.banner = H('div', { class: 'ar-o-banner', role: 'status' });
      st.bubble = H('div', { class: 'ar-o-gbubble', 'aria-live': 'polite' });
      st.rain = H('div', { class: 'ar-o-petalrain', 'aria-hidden': 'true' });
      st.sun = H('div', { class: 'ar-o-sun', 'aria-hidden': 'true' }, H('span', { class: 'rays' }), H('span', { class: 'disk' }, H('i', { class: 'eye l' }), H('i', { class: 'eye r' }), H('i', { class: 'smile' })));
      const clouds = [[8, 12, 46], [52, 6, 60], [78, 18, 52]].map(([x, y, d]) => H('span', { class: 'ar-o-cloud', style: { left: x + '%', top: y + '%', '--dur': d + 's' }, 'aria-hidden': 'true' }));
      const flies = [['#f783ac', 'a'], ['#ffd43b', 'b'], ['#74c0fc', 'c']].map(([c, n]) => H('div', { class: 'ar-o-fly f' + n, 'aria-hidden': 'true' }, butterfly(c)));
      const bee = H('div', { class: 'ar-o-bee', 'aria-hidden': 'true' }, H('i', { class: 'body' }), H('i', { class: 'wing' }));
      st.scene = H('div', { class: 'ar-o-gscene' }, st.sun, ...clouds, H('div', { class: 'ar-o-ghill h1' }), H('div', { class: 'ar-o-ghill h2' }), st.field, ...flies, bee, st.rain,
        H('div', { class: 'ar-o-gprog' }, H('div', { class: 'ar-o-gprog-top' }, st.ptext, st.pct), H('div', { class: 'ar-o-gtrack' }, st.fill, ...st.marks)),
        st.bubble, st.banner);
      root.append(st.scene);
      st.lastPct = null; st.bloomKey = null; st.status = null;
    });
    const s = mState(v);
    const flowers = A(s.flowers).filter(f => f && typeof f === 'object').slice(-200);
    const goal = Math.max(0, N(s.goal)); const bloomed = Math.max(0, N(s.bloomed, flowers.length));
    const seen = new Set(); const dup = new Map(); let fresh = 0; const freshNodes = [];
    flowers.forEach(f => {
      const base = `${N(f.at)}|${N(f.x)}|${N(f.y)}|${N(f.kind)}|${S2(f.by)}`; const c = (dup.get(base) || 0) + 1; dup.set(base, c);
      const key = base + '#' + c; seen.add(key);
      if (st.fl.has(key)) return;
      const x = k.clamp(N(f.x, 50), 2, 98), y = k.clamp(N(f.y, 60), 30, 96);
      const depth = (y - 30) / 66; // 0 멀리 ~ 1 가까이
      const n = H('div', { class: 'ar-o-fl' + (f.rare ? ' rare' : ''), style: { left: x + '%', top: (8 + depth * 88).toFixed(1) + '%', '--sc': (0.62 + depth * 0.6).toFixed(2), '--sw': (-(k.hash(key) % 40) / 10) + 's', zIndex: String(10 + Math.round(depth * 80)) } }, flowerSVG(f.kind, f.rare));
      if (!st.first) {
        n.classList.add('grow'); n.style.setProperty('--d', (Math.min(fresh, 24) * 0.11).toFixed(2) + 's');
        n.append(H('span', { class: 'ar-o-flring', 'aria-hidden': 'true' }));
        if (f.by && fresh < 14) n.append(H('span', { class: 'ar-o-fltag', text: S2(f.by) }));
        fresh++; freshNodes.push(n);
      }
      st.field.append(n); st.fl.set(key, n);
    });
    for (const [key, n] of st.fl) if (!seen.has(key)) { n.remove(); st.fl.delete(key); }
    if (fresh) { k.later(st, () => snd('sparkle'), 700); if (freshNodes.some(n => n.classList.contains('rare'))) k.later(st, () => snd('levelup'), 1300); }
    const pct = goal > 0 ? Math.min(100, bloomed / goal * 100) : 0;
    txt(st.ptext, goal > 0 ? `우리 반 꽃 ${fmt(bloomed)} / ${fmt(goal)}송이` : `우리 반 꽃 ${fmt(bloomed)}송이`);
    txt(st.pct, goal > 0 ? Math.floor(pct) + '%' : '');
    st.fill.style.width = pct.toFixed(1) + '%';
    st.marks.forEach((m, i) => k.cls(m, 'done', pct >= (i + 1) * 25));
    if (st.lastPct !== null && !st.first && goal > 0) {
      for (const m of [25, 50, 75]) if (st.lastPct < m && pct >= m && pct < 100) { k.later(st, () => { showBanner(st, `${m}% 달성! 꽃밭이 점점 예뻐져요`, false); fx('confetti', { y: 0.35, count: 60, power: 0.7 }); snd('levelup'); }, 1600); break; }
    }
    st.lastPct = pct;
    const lb = s.lastBloom;
    const lbKey = lb ? `${N(lb.q)}|${N(lb.at)}` : null;
    if (lb && lbKey !== st.bloomKey) {
      if (st.bloomKey !== null || !st.first) {
        st.bubble.replaceChildren(H('b', { text: N(lb.count) > 0 ? `꽃 ${N(lb.count)}송이 활짝!` : '이번엔 꽃이 못 피었어요' }), H('span', { text: `정답률 ${N(lb.accuracy)}%` }));
        replay(st.bubble, 'on');
      }
      st.bloomKey = lbKey;
    }
    const status = S2(s.status);
    if (status !== st.status) {
      const was = st.status; st.status = status;
      k.cls(st.scene, 'success', status === 'success'); k.cls(st.scene, 'failed', status === 'failed');
      if (status === 'success') {
        st.rain.replaceChildren(...Array.from({ length: reduced() ? 0 : 36 }, (_, i) => H('i', { style: { left: rnd(0, 100).toFixed(1) + '%', '--dur': rnd(4, 8).toFixed(1) + 's', '--dl': (-rnd(0, 8)).toFixed(1) + 's', '--c': RAINBOW[i % 6], '--sx': rnd(-60, 60).toFixed(0) + 'px' } })));
        if (was !== null && !st.first) { k.later(st, () => { showBanner(st, '목표 달성! 우리 반 꽃밭 완성', false, true); fx('confetti', { y: 0.5, count: 180, power: 1.2 }); snd('cheer'); }, 1700); }
        else showBanner(st, '목표 달성! 우리 반 꽃밭 완성', false, true);
      } else if (status === 'failed') showBanner(st, '조금 모자랐어요. 그래도 예쁜 꽃밭!', true, true);
      else { st.rain.replaceChildren(); }
    }
  }
  function showBanner(st, text, bad, stay) {
    const b = st.banner; if (!b) return;
    b.textContent = text; b.classList.toggle('bad', !!bad);
    replay(b, 'on');
    clearTimeout(b._t);
    if (!stay) b._t = setTimeout(() => b.classList.remove('on'), 2600);
  }
  function gardenPlayer(root, v) {
    const k = K(), H = k.H;
    const st = k.prep(root, 'orig:garden:p', ['ar-o', 'ar-o-gp'], st => {
      st.icon = H('div', { class: 'ar-o-gpicon' }, flowerSVG(0, false));
      st.big = H('b'); st.fill = H('i', { class: 'ar-o-gfill' }); st.mine = H('div', { class: 'ar-o-gpmine' });
      st.mineN = H('b', { class: 'ar-o-gpnum' });
      st.strip = H('div', { class: 'ar-o-strip ar-o-gstrip' }, st.icon,
        H('div', { class: 'ar-o-gpmain' }, H('div', { class: 'ar-o-gpline' }, st.big), H('div', { class: 'ar-o-gtrack' }, st.fill), st.mine),
        H('div', { class: 'ar-o-gpme' }, H('span', { text: '내 꽃' }), st.mineN));
      root.append(st.strip);
    });
    const s = mState(v), me = meOf(v);
    const goal = Math.max(0, N(s.goal)); const flowers = A(s.flowers); const bloomed = Math.max(0, N(s.bloomed, flowers.length));
    txt(st.big, goal ? `우리 반 꽃 ${fmt(bloomed)} / ${fmt(goal)}송이` : `우리 반 꽃 ${fmt(bloomed)}송이`);
    st.fill.style.width = (goal ? Math.min(100, bloomed / goal * 100) : 0).toFixed(1) + '%';
    const nick = me ? S2(me.nickname) : null;
    const mineList = nick ? flowers.filter(f => f && S2(f.by) === nick) : [];
    const mine = mineList.length, rare = mineList.filter(f => f.rare).length;
    if (st.mineVal !== undefined && mine > st.mineVal) { replay(st.icon, 'pop'); replay(st.mineN, 'bump'); }
    st.mineVal = mine;
    countTo(st, st.mineN, mine, 700, '', '송이');
    const status = S2(s.status);
    txt(st.mine, status === 'success' ? '목표 달성! 꽃밭이 가득 찼어요' : status === 'failed' ? '아쉽지만 예쁜 꽃밭이었어요' : rare ? `무지개 꽃 ${rare}송이도 피웠어요!` : '정답을 맞힐 때마다 꽃이 피어요. 연속 정답이면 무지개 꽃!');
    k.cls(st.strip, 'success', status === 'success');
  }

  // =====================================================================
  // 3. 보스 레이드
  // =====================================================================
  const BOSS_PAL = [['#8e5bd6', '#b794f6', '#3b1d6e'], ['#ff8787', '#ffc9c9', '#7a1f1f'], ['#4dabf7', '#a5d8ff', '#0b3d6e'], ['#51cf66', '#b2f2bb', '#1d5e2a']];
  function bossSVG(pal) {
    const k = K(), S = k.S; const [body, belly, ink] = pal;
    return S('svg', { viewBox: '0 0 200 200', class: 'ar-o-bsvg', 'aria-hidden': 'true', focusable: 'false' },
      S('ellipse', { cx: 100, cy: 190, rx: 74, ry: 9, fill: 'rgba(0,0,0,.35)', class: 'bshadow' }),
      S('g', { class: 'bbody' },
        S('ellipse', { cx: 70, cy: 180, rx: 20, ry: 9, fill: body, stroke: ink, 'stroke-width': 4 }),
        S('ellipse', { cx: 130, cy: 180, rx: 20, ry: 9, fill: body, stroke: ink, 'stroke-width': 4 }),
        S('polygon', { points: '54,58 38,12 82,42', fill: '#ffd43b', stroke: ink, 'stroke-width': 4, 'stroke-linejoin': 'round' }),
        S('polygon', { points: '146,58 162,12 118,42', fill: '#ffd43b', stroke: ink, 'stroke-width': 4, 'stroke-linejoin': 'round' }),
        S('g', { class: 'armL' }, S('path', { d: 'M26 112 Q2 104 6 130 Q10 146 32 134', fill: body, stroke: ink, 'stroke-width': 4 })),
        S('g', { class: 'armR' }, S('path', { d: 'M174 112 Q198 104 194 130 Q190 146 168 134', fill: body, stroke: ink, 'stroke-width': 4 })),
        S('path', { d: 'M100 32 C160 32 184 88 182 128 C180 168 152 182 100 182 C48 182 20 168 18 128 C16 88 40 32 100 32 Z', fill: body, stroke: ink, 'stroke-width': 5 }),
        S('ellipse', { cx: 100, cy: 144, rx: 50, ry: 30, fill: belly }),
        S('g', { class: 'eyes' },
          S('ellipse', { cx: 72, cy: 92, rx: 17, ry: 20, fill: '#fff', stroke: ink, 'stroke-width': 3 }), S('circle', { cx: 76, cy: 96, r: 8, fill: '#222', class: 'pupil' }), S('circle', { cx: 79, cy: 92, r: 2.6, fill: '#fff' }),
          S('ellipse', { cx: 128, cy: 92, rx: 17, ry: 20, fill: '#fff', stroke: ink, 'stroke-width': 3 }), S('circle', { cx: 124, cy: 96, r: 8, fill: '#222', class: 'pupil' }), S('circle', { cx: 127, cy: 92, r: 2.6, fill: '#fff' })),
        S('g', { class: 'xeyes' }, S('path', { d: 'M60 80 L84 104 M84 80 L60 104 M116 80 L140 104 M140 80 L116 104', stroke: ink, 'stroke-width': 6, 'stroke-linecap': 'round' })),
        S('g', { class: 'brows' }, S('path', { d: 'M52 66 L90 80', stroke: ink, 'stroke-width': 7, 'stroke-linecap': 'round' }), S('path', { d: 'M148 66 L110 80', stroke: ink, 'stroke-width': 7, 'stroke-linecap': 'round' })),
        S('ellipse', { cx: 52, cy: 118, rx: 10, ry: 6, fill: '#ff8fb1', opacity: 0.85, class: 'blush' }), S('ellipse', { cx: 148, cy: 118, rx: 10, ry: 6, fill: '#ff8fb1', opacity: 0.85, class: 'blush' }),
        S('g', { class: 'mouth m-normal' }, S('path', { d: 'M78 122 Q100 142 122 122 Z', fill: ink, stroke: ink, 'stroke-width': 4, 'stroke-linejoin': 'round' }), S('polygon', { points: '86,124 90,132 94,126', fill: '#fff' }), S('polygon', { points: '106,126 110,132 114,124', fill: '#fff' })),
        S('g', { class: 'mouth m-angry' }, S('path', { d: 'M74 136 Q100 112 126 136 Z', fill: ink, stroke: ink, 'stroke-width': 4, 'stroke-linejoin': 'round' }), S('polygon', { points: '82,133 87,125 92,131', fill: '#fff' }), S('polygon', { points: '108,131 113,125 118,133', fill: '#fff' })),
        S('g', { class: 'mouth m-laugh' }, S('path', { d: 'M70 118 Q100 162 130 118 Z', fill: ink, stroke: ink, 'stroke-width': 4, 'stroke-linejoin': 'round' }), S('ellipse', { cx: 100, cy: 140, rx: 12, ry: 7, fill: '#ff6b9d' })),
        S('g', { class: 'mouth m-dizzy' }, S('path', { d: 'M80 132 Q90 124 100 132 T120 132', fill: 'none', stroke: ink, 'stroke-width': 5, 'stroke-linecap': 'round' }))));
  }
  const bossPal = name => BOSS_PAL[K().hash(name || '') % BOSS_PAL.length];
  function bossHost(root, v) {
    const k = K(), H = k.H; const s = mState(v);
    const st = k.prep(root, 'orig:boss:h', ['ar-o', 'ar-o-host', 'ar-o-bh'], st => {
      st.name = H('b', { class: 'ar-o-bname' });
      st.hpTrail = H('i', { class: 'ar-o-hptrail' }); st.hpFill = H('i', { class: 'ar-o-hpfill' }); st.hpTxt = H('span', { class: 'ar-o-hptxt' });
      st.phaseTag = H('span', { class: 'ar-o-phase' });
      st.boss = H('div', { class: 'ar-o-boss' }, H('span', { class: 'ar-o-aura', 'aria-hidden': 'true' }), H('div', { class: 'ar-o-bwrap' }, bossSVG(bossPal(s.bossName))), H('span', { class: 'ar-o-steam s1' }), H('span', { class: 'ar-o-steam s2' }));
      st.shFill = H('i', { class: 'ar-o-shfill' }); st.shTxt = H('b');
      st.shield = H('div', { class: 'ar-o-shield' }, H('span', { class: 'ar-o-shicon', 'aria-hidden': 'true' }), H('div', { class: 'ar-o-shmain' }, H('span', { class: 'ar-o-shlabel', text: '우리 반 방패' }), H('div', { class: 'ar-o-shtrack' }, st.shFill, H('span', { class: 'crack c1' }), H('span', { class: 'crack c2' }), H('span', { class: 'crack c3' }))), st.shTxt);
      st.hits = H('ul', { class: 'ar-o-hits', 'aria-label': '최근 공격' });
      st.layer = H('div', { class: 'ar-o-blayer', 'aria-hidden': 'true' });
      st.banner = H('div', { class: 'ar-o-banner', role: 'status' });
      st.vignette = H('div', { class: 'ar-o-vig', 'aria-hidden': 'true' });
      st.finisher = H('div', { class: 'ar-o-finisher' });
      const stars = Array.from({ length: 18 }, (_, i) => H('span', { class: 'ar-o-bstar', style: { left: ((i * 41) % 100) + '%', top: ((i * 29) % 60) + '%', '--dl': (-(i % 5) * 0.7) + 's' }, 'aria-hidden': 'true' }));
      st.scene = H('div', { class: 'ar-o-bscene' }, ...stars, H('div', { class: 'ar-o-bfloor', 'aria-hidden': 'true' }),
        H('div', { class: 'ar-o-btop' }, H('div', { class: 'ar-o-bnameline' }, st.name, st.phaseTag), H('div', { class: 'ar-o-hptrack' }, st.hpTrail, st.hpFill, st.hpTxt)),
        st.boss, st.shield, H('section', { class: 'ar-o-hitbox' }, H('h3', { class: 'ar-o-ttl', text: '최근 공격' }), st.hits),
        st.layer, st.vignette, st.finisher, st.banner);
      root.append(st.scene);
      st.seen = new Set(); st.atkKey = null; st.phase = null; st.status = null; st.hpShown = null; st.busyUntil = 0;
    });
    st.v = v;
    const maxHp = Math.max(1, N(s.bossMaxHp, 1)), hp = Math.max(0, N(s.bossHp));
    txt(st.name, S2(s.bossName) || '보스');
    const hits = A(s.hits).filter(h => h && typeof h === 'object');
    const keyOf = h => `${N(h.at)}|${S2(h.nickname)}|${N(h.damage)}`;
    const fresh = hits.filter(h => !st.seen.has(keyOf(h)));
    fresh.forEach(h => st.seen.add(keyOf(h)));
    const t = performance.now();
    let batchEnd = t;
    if (st.first || !fresh.length) {
      if (st.hpShown === null || st.first) setHp(st, hp, maxHp);
      else if (t >= st.busyUntil) setHp(st, hp, maxHp);
      if (st.first) st.hits.replaceChildren(...hits.slice(0, 5).map(hitItem));
    } else {
      const order = fresh.slice(0, 12).reverse();
      let shown = st.hpShown === null ? hp + order.reduce((n, h) => n + N(h.damage), 0) : st.hpShown;
      const gap = reduced() ? 60 : 280;
      order.forEach((h, j) => {
        k.later(st, () => launch(st, h, () => {
          shown = Math.max(hp, shown - N(h.damage));
          setHp(st, shown, maxHp);
          st.hits.prepend(hitItem(h, true)); while (st.hits.children.length > 5) st.hits.lastChild.remove();
        }), j * gap);
      });
      batchEnd = t + order.length * gap + 700;
      st.busyUntil = batchEnd;
      k.later(st, () => setHp(st, N(mState(st.v).bossHp, hp), maxHp), batchEnd - t + 50);
    }
    const afterMs = Math.max(0, batchEnd - t);
    // 반격
    const la = s.lastAttack; const laKey = la ? `${N(la.q)}|${N(la.at)}` : null;
    const shield = k.clamp(N(s.shield, 100), 0, 100);
    if (laKey && laKey !== st.atkKey && !st.first && st.atkKey !== undefined) {
      st.atkKey = laKey;
      k.later(st, () => counter(st, la, shield), afterMs + 200);
    } else {
      if (st.first) st.atkKey = laKey;
      if (!laKey || laKey === st.atkKey) setShield(st, shield);
    }
    // 단계
    const phase = S2(s.phase) || 'normal'; const status = S2(s.status) || 'fighting';
    if (phase !== st.phase) {
      const was = st.phase; st.phase = phase;
      const apply = () => { k.cls(st.boss, 'angry', phase === 'angry'); k.cls(st.boss, 'rage', phase === 'rage'); txt(st.phaseTag, phase === 'rage' ? '분노' : phase === 'angry' ? '화남' : ''); k.cls(st.phaseTag, 'on', phase !== 'normal'); };
      if (was !== null && !st.first && status === 'fighting' && phase !== 'normal') k.later(st, () => { apply(); replay(st.boss, 'roar'); showBanner(st, phase === 'rage' ? '분노 모드! 거의 다 왔어요!' : `${josa(S2(s.bossName) || '보스')} 화났어요!`, true); snd('boom'); }, afterMs + (laKey && laKey === st.atkKey ? 1400 : 300));
      else apply();
    }
    if (status !== st.status) {
      const was = st.status; st.status = status;
      const play = was !== null && !st.first;
      const run = () => {
        k.cls(st.boss, 'victory', status === 'victory'); k.cls(st.boss, 'defeat', status === 'defeat');
        k.cls(st.scene, 'won', status === 'victory'); k.cls(st.scene, 'lost', status === 'defeat');
        if (status !== 'fighting') k.cls(st.phaseTag, 'on', false);
        if (status === 'victory') {
          showBanner(st, '보스를 물리쳤어요!', false, true);
          const f = s.finisher;
          if (f && f.nickname) { st.finisher.replaceChildren(H('span', { class: 'lbl', text: '마지막 일격' }), avatar(f.avatar, 54, f.nickname), H('b', { text: S2(f.nickname) })); st.finisher.classList.add('on'); }
          if (play) { fx('burst', st.boss, { count: 120 }); fx('fireworks', 5000); fx('confetti', { y: 0.5, count: 200, power: 1.3 }); snd('fanfare'); k.later(st, () => snd('cheer'), 800); }
        } else if (status === 'defeat') {
          showBanner(st, '방패가 깨졌어요… 보스의 승리', true, true);
          if (play) { snd('wrong'); for (let i = 0; i < 4; i++) k.later(st, () => spawnText(st, '하하하!', 'laugh'), i * 450); }
        }
      };
      if (play) k.later(st, run, afterMs + 500); else run();
    }
  }
  function hitItem(h, fresh) {
    const k = K(), H = k.H;
    return H('li', { class: 'ar-o-hit' + (h.crit ? ' crit' : '') + (fresh ? ' fresh' : '') }, avatar(h.avatar, 26, h.nickname), H('b', { text: S2(h.nickname) }), H('span', { text: (h.crit ? '치명타 ' : '') + fmt(h.damage) }));
  }
  function setHp(st, hp, max) {
    st.hpShown = hp;
    const pct = Math.max(0, Math.min(100, hp / max * 100));
    st.hpFill.style.width = pct.toFixed(2) + '%'; st.hpTrail.style.width = pct.toFixed(2) + '%';
    K().cls(st.hpFill, 'low', pct <= 25); K().cls(st.hpFill, 'mid', pct > 25 && pct <= 50);
    txt(st.hpTxt, `${fmt(hp)} / ${fmt(max)}`);
  }
  function setShield(st, v) {
    st.shFill.style.width = v + '%';
    txt(st.shTxt, Math.round(v) + '%');
    const k = K(); k.cls(st.shield, 'c1', v < 75); k.cls(st.shield, 'c2', v < 50); k.cls(st.shield, 'c3', v < 25); k.cls(st.shield, 'low', v < 30);
  }
  function center(el, layer) {
    const a = el.getBoundingClientRect(), b = layer.getBoundingClientRect();
    return { x: a.left - b.left + a.width / 2, y: a.top - b.top + a.height / 2, w: b.width, h: b.height, bw: a.width, bh: a.height };
  }
  function launch(st, h, onHit) {
    const k = K(), H = k.H;
    if (st.dead) return;
    const tgt = center(st.boss, st.layer);
    if (!tgt.w || reduced()) { impact(st, h, tgt); onHit(); return; }
    const sx = rnd(0.1, 0.9) * tgt.w, sy = tgt.h + 30;
    const size = Math.max(30, Math.min(64, tgt.h * 0.12));
    const p = H('div', { class: 'ar-o-proj' + (h.crit ? ' crit' : '') }, avatar(h.avatar, size, h.nickname));
    p.style.left = (sx - size / 2) + 'px'; p.style.top = (sy - size / 2) + 'px';
    st.layer.append(p);
    const tx = tgt.x + rnd(-tgt.bw * 0.15, tgt.bw * 0.15) - sx, ty = tgt.y + rnd(-tgt.bh * 0.1, tgt.bh * 0.15) - sy;
    const midY = Math.min(ty * 0.6, -tgt.h * 0.35);
    let anim = null;
    try {
      anim = p.animate([
        { transform: 'translate(0,0) scale(.6) rotate(0deg)', opacity: 0.4 },
        { transform: `translate(${tx * 0.55}px, ${midY}px) scale(1.15) rotate(220deg)`, opacity: 1, offset: 0.6 },
        { transform: `translate(${tx}px, ${ty}px) scale(.9) rotate(400deg)`, opacity: 1 }], { duration: 560, easing: 'cubic-bezier(.35,.05,.55,1)', fill: 'forwards' });
    } catch { anim = null; }
    snd('whoosh');
    const done = () => { if (st.dead) return; p.remove(); impact(st, h, center(st.boss, st.layer)); onHit(); };
    if (anim) anim.onfinish = done; else setTimeout(done, 560);
  }
  function impact(st, h, c) {
    const k = K(), H = k.H;
    replay(st.boss, h.crit ? 'hitbig' : 'hit');
    const d = H('div', { class: 'ar-o-dmg' + (h.crit ? ' crit' : '') }, h.crit ? H('small', { text: '치명타!' }) : null, H('b', { text: '-' + fmt(h.damage) }));
    d.style.left = (c.x + rnd(-c.bw * 0.3, c.bw * 0.3)) + 'px'; d.style.top = (c.y - c.bh * 0.15 + rnd(-30, 20)) + 'px';
    st.layer.append(d); setTimeout(() => d.remove(), 1500);
    const sp = H('div', { class: 'ar-o-boom' + (h.crit ? ' crit' : '') });
    sp.style.left = (c.x + rnd(-c.bw * 0.2, c.bw * 0.2)) + 'px'; sp.style.top = (c.y + rnd(-c.bh * 0.2, c.bh * 0.2)) + 'px';
    st.layer.append(sp); setTimeout(() => sp.remove(), 700);
    if (h.crit) { fx('flash', '#fff3bf', 160); replay(st.scene, 'shake'); snd('boom'); }
    else snd('pop');
  }
  function counter(st, la, shield) {
    const k = K(), H = k.H;
    replay(st.boss, 'lunge'); replay(st.scene, 'shakebig'); replay(st.vignette, 'on'); replay(st.shield, 'hitme');
    snd('boom'); k.later(st, () => snd('wrong'), 200);
    const d = H('div', { class: 'ar-o-shdmg', text: `방패 -${fmt(la.dmg)}` });
    st.shield.append(d); setTimeout(() => d.remove(), 1600);
    spawnText(st, '반격!', 'counter');
    k.later(st, () => setShield(st, shield), 250);
  }
  function spawnText(st, text, cls) {
    const k = K();
    const n = k.H('div', { class: 'ar-o-btext ' + cls, text });
    const c = center(st.boss, st.layer);
    n.style.left = (c.x + rnd(-c.bw * 0.4, c.bw * 0.4)) + 'px'; n.style.top = (c.y - c.bh * 0.4 + rnd(-20, 20)) + 'px';
    st.layer.append(n); setTimeout(() => n.remove(), 1700);
  }
  function bossPlayer(root, v) {
    const k = K(), H = k.H; const s = mState(v);
    const st = k.prep(root, 'orig:boss:p', ['ar-o', 'ar-o-bp'], st => {
      st.face = H('div', { class: 'ar-o-bpface' }, bossSVG(bossPal(s.bossName)));
      st.name = H('b'); st.fill = H('i', { class: 'ar-o-hpfill' }); st.trail = H('i', { class: 'ar-o-hptrail' }); st.hpTxt = H('span', { class: 'ar-o-hptxt' });
      st.my = H('b', { class: 'ar-o-bpnum' }); st.note = H('div', { class: 'ar-o-bpnote' });
      st.pop = H('div', { class: 'ar-o-bppop', 'aria-live': 'polite' });
      st.shield = H('i', { class: 'ar-o-shfill' });
      st.strip = H('div', { class: 'ar-o-strip ar-o-bstrip' }, st.face,
        H('div', { class: 'ar-o-bpmain' }, H('div', { class: 'ar-o-bpline' }, st.name), H('div', { class: 'ar-o-hptrack' }, st.trail, st.fill, st.hpTxt), H('div', { class: 'ar-o-bpsh' }, H('span', { text: '방패' }), H('div', { class: 'ar-o-shtrack' }, st.shield)), st.note),
        H('div', { class: 'ar-o-bpme' }, H('span', { text: '내 피해' }), st.my), st.pop);
      root.append(st.strip);
      st.seen = new Set(); st.total = 0; st.myCrit = 0;
    });
    const me = meOf(v); const nick = me ? S2(me.nickname) : null;
    const maxHp = Math.max(1, N(s.bossMaxHp, 1)), hp = Math.max(0, N(s.bossHp));
    txt(st.name, S2(s.bossName) || '보스');
    const pct = Math.min(100, hp / maxHp * 100);
    st.fill.style.width = pct.toFixed(1) + '%'; st.trail.style.width = pct.toFixed(1) + '%';
    k.cls(st.fill, 'low', pct <= 25); k.cls(st.fill, 'mid', pct > 25 && pct <= 50);
    txt(st.hpTxt, `HP ${Math.ceil(pct)}%`);
    st.shield.style.width = k.clamp(N(s.shield, 100), 0, 100) + '%';
    const hits = A(s.hits).filter(Boolean);
    const keyOf = h => `${N(h.at)}|${S2(h.nickname)}|${N(h.damage)}`;
    let gain = 0, crit = false;
    for (const h of hits) { const key = keyOf(h); if (st.seen.has(key)) continue; st.seen.add(key); if (nick && S2(h.nickname) === nick) { st.total += N(h.damage); gain += N(h.damage); if (h.crit) { crit = true; st.myCrit++; } } }
    countTo(st, st.my, st.total, 900);
    if (gain && !st.first) {
      st.pop.replaceChildren(crit ? H('small', { text: '치명타!' }) : null, H('b', { text: '-' + fmt(gain) }));
      k.cls(st.pop, 'crit', crit); replay(st.pop, 'on'); replay(st.face, 'hit');
      if (crit) { try { if (navigator.vibrate) navigator.vibrate([40, 30, 80]); } catch { /* 무시 */ } }
    }
    const status = S2(s.status); const phase = S2(s.phase);
    k.cls(st.face, 'angry', phase === 'angry'); k.cls(st.face, 'rage', phase === 'rage'); k.cls(st.face, 'victory', status === 'victory'); k.cls(st.face, 'defeat', status === 'defeat');
    txt(st.note, status === 'victory' ? '우리 반이 보스를 물리쳤어요!' : status === 'defeat' ? '아쉬워요. 다음엔 꼭 이겨요!' : phase === 'rage' ? '분노 모드! 조금만 더!' : st.myCrit ? `치명타 ${st.myCrit}번! 3연속 정답이면 1.5배` : '정답을 맞혀 공격! 3연속 정답이면 치명타');
  }

  KQ.arena.treasure = { host: (r, v, s) => treasureHost(r, v, s), player: (r, v, s) => treasurePlayer(r, v, s) };
  KQ.arena.garden = { host: (r, v, s) => gardenHost(r, v, s), player: (r, v, s) => gardenPlayer(r, v, s) };
  KQ.arena.boss = { host: (r, v, s) => bossHost(r, v, s), player: (r, v, s) => bossPlayer(r, v, s) };
})();
