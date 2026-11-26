/* 반짝퀴즈 보스 레이드: 모든 보스를 쓰러뜨린 뒤 "보물 창고" 화면.
   arena-orig.js 의 KQ.arena.boss 를 감싸서, modeState.cleared 가 되고 5초 뒤(마지막 보스 폭발 연출이 끝난 뒤)부터 보물 화면으로 바꿈. */
(() => {
  const KQ = window.KQ || (window.KQ = {});
  KQ.arena = KQ.arena || {};
  const SVGNS = 'http://www.w3.org/2000/svg';
  const SWITCH_MS = 5200;
  const N = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const now = () => { try { return KQ.now ? KQ.now() : Date.now(); } catch { return Date.now(); } };
  const snd = k => { try { KQ.sound && KQ.sound.play && KQ.sound.play(k); } catch {} };
  const fx = (n, ...a) => { try { KQ.fx && typeof KQ.fx[n] === 'function' && KQ.fx[n](...a); } catch {} };
  const fmt = n => N(n).toLocaleString('ko-KR');
  const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
  function H(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) { if (v === null || v === undefined || v === false) continue; if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v === true ? '' : String(v)); }
    for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return n;
  }
  function S(tag, attrs, ...kids) {
    const n = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v !== null && v !== undefined) n.setAttribute(k, String(v));
    for (const c of kids.flat()) if (c) n.append(c);
    return n;
  }
  function avatar(av, name, size) {
    let n = null;
    if (av && KQ.avatar && typeof KQ.avatar.render === 'function') { try { n = KQ.avatar.render(av, size); } catch { n = null; } }
    const w = H('span', { class: 'ar-loot-av' }); w.style.width = w.style.height = size + 'px';
    if (n) w.append(n); else { w.textContent = Array.from(String(name || '?'))[0] || '?'; w.classList.add('fb'); w.style.fontSize = Math.round(size * 0.45) + 'px'; }
    return w;
  }
  // 보물 아이콘 (tier 1 금화 주머니, 2 보석, 3 왕관, 4 전설의 상자)
  function itemIcon(tier, size) {
    const svg = S('svg', { viewBox: '0 0 64 64', width: size, height: size, 'aria-hidden': 'true', class: 'ar-loot-ico t' + tier });
    if (tier === 2) svg.append(S('polygon', { points: '32,6 54,24 32,58 10,24', fill: '#4dabf7', stroke: '#1864ab', 'stroke-width': 3 }), S('polygon', { points: '32,6 42,24 32,58 22,24', fill: '#a5d8ff' }), S('line', { x1: 10, y1: 24, x2: 54, y2: 24, stroke: '#1864ab', 'stroke-width': 2 }));
    else if (tier === 3) svg.append(S('path', { d: 'M8 46 L12 18 L24 32 L32 12 L40 32 L52 18 L56 46 Z', fill: '#ffd43b', stroke: '#b07d00', 'stroke-width': 3, 'stroke-linejoin': 'round' }), S('rect', { x: 8, y: 46, width: 48, height: 8, rx: 2, fill: '#fab005', stroke: '#b07d00', 'stroke-width': 3 }), S('circle', { cx: 32, cy: 38, r: 4, fill: '#e03131' }), S('circle', { cx: 20, cy: 40, r: 3, fill: '#4dabf7' }), S('circle', { cx: 44, cy: 40, r: 3, fill: '#4dabf7' }));
    else if (tier === 4) svg.append(S('rect', { x: 8, y: 28, width: 48, height: 28, rx: 4, fill: '#8b4513', stroke: '#4a2509', 'stroke-width': 3 }), S('path', { d: 'M8 30 Q32 6 56 30 Z', fill: '#a0522d', stroke: '#4a2509', 'stroke-width': 3 }), S('rect', { x: 28, y: 26, width: 8, height: 12, rx: 2, fill: '#ffd43b', stroke: '#b07d00', 'stroke-width': 2 }), S('rect', { x: 8, y: 40, width: 48, height: 4, fill: '#ffd43b' }), S('circle', { cx: 20, cy: 22, r: 4, fill: '#ffe066' }), S('circle', { cx: 44, cy: 20, r: 3, fill: '#a5d8ff' }));
    else svg.append(S('path', { d: 'M20 18 Q32 10 44 18 L50 50 Q32 60 14 50 Z', fill: '#c9a227', stroke: '#7a5c00', 'stroke-width': 3 }), S('path', { d: 'M22 18 Q32 26 42 18', fill: 'none', stroke: '#7a5c00', 'stroke-width': 3 }), S('text', { x: 32, y: 44, 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 900, fill: '#fff8db' }, document.createTextNode('G')));
    return svg;
  }
  function chestSVG() {
    return S('svg', { viewBox: '0 0 200 150', class: 'ar-loot-chest', 'aria-hidden': 'true' },
      S('ellipse', { cx: 100, cy: 140, rx: 80, ry: 8, fill: 'rgba(0,0,0,.35)' }),
      S('rect', { x: 25, y: 70, width: 150, height: 68, rx: 8, fill: '#8b4513', stroke: '#3d1f08', 'stroke-width': 5 }),
      S('rect', { x: 25, y: 92, width: 150, height: 10, fill: '#ffd43b', stroke: '#b07d00', 'stroke-width': 2 }),
      S('rect', { x: 88, y: 84, width: 24, height: 30, rx: 4, fill: '#ffd43b', stroke: '#b07d00', 'stroke-width': 3 }),
      S('ellipse', { cx: 100, cy: 72, rx: 70, ry: 14, fill: '#ffe066' }),
      S('circle', { cx: 70, cy: 66, r: 9, fill: '#fcc419', stroke: '#b07d00', 'stroke-width': 2 }), S('circle', { cx: 100, cy: 62, r: 10, fill: '#fcc419', stroke: '#b07d00', 'stroke-width': 2 }), S('circle', { cx: 130, cy: 66, r: 9, fill: '#fcc419', stroke: '#b07d00', 'stroke-width': 2 }),
      S('polygon', { points: '85,58 92,48 99,58 92,64', fill: '#4dabf7' }), S('polygon', { points: '112,56 118,48 124,56 118,62', fill: '#f783ac' }),
      S('g', { class: 'ar-loot-lid' }, S('path', { d: 'M25 70 L35 22 Q100 0 165 22 L175 70 Z', fill: '#a0522d', stroke: '#3d1f08', 'stroke-width': 5, 'stroke-linejoin': 'round' }), S('rect', { x: 88, y: 18, width: 24, height: 52, fill: '#ffd43b', stroke: '#b07d00', 'stroke-width': 3 })));
  }

  const STATE = new WeakMap();
  function ensure(root, key, build) {
    let st = STATE.get(root);
    if (st && st.key === key && root.contains(st.box)) return st;
    try { if (KQ.modeKit && KQ.modeKit.dispose) KQ.modeKit.dispose(root); } catch {}
    root.replaceChildren();
    st = { key, seen: new Set(), timers: [] };
    build(st); STATE.set(root, st); root.dataset.lootInit = '1';
    return st;
  }
  function clearLoot(root) {
    const st = STATE.get(root); if (!st) return;
    st.timers.forEach(t => clearTimeout(t)); STATE.delete(root); delete root.dataset.lootInit; root.replaceChildren();
  }

  function hostLoot(root, v) {
    const s = v.modeState || {};
    const small = (root.getBoundingClientRect().height || 999) < 200;
    const st = ensure(root, small ? 'loot-small' : 'loot-big', st => {
      st.total = H('b', { class: 'ar-loot-total' }, '0');
      st.sub = H('span', { class: 'ar-loot-sub' }, '');
      if (small) {
        st.box = H('div', { class: 'ar-loot ar-loot-small' }, H('div', { class: 'ar-loot-sm-ico' }, itemIcon(4, 56)), H('div', {}, H('strong', {}, '보물 창고 열림! 정답을 맞히면 보물을 가져가요'), H('div', {}, '우리 반이 가져간 보물 ', st.total, '점 · ', st.sub)));
      } else {
        st.list = H('ol', { class: 'ar-loot-list', 'aria-label': '최근에 가져간 보물' });
        st.chestWrap = H('div', { class: 'ar-loot-chestwrap' }, H('div', { class: 'ar-loot-rays' }), chestSVG());
        st.box = H('div', { class: 'ar-loot ar-loot-big' },
          H('div', { class: 'ar-loot-head' }, H('h2', {}, '보물 창고가 열렸어요!'), H('p', {}, '', st.sub)),
          H('div', { class: 'ar-loot-body' },
            H('div', { class: 'ar-loot-left' }, st.chestWrap, H('div', { class: 'ar-loot-totbox' }, H('span', {}, '우리 반이 가져간 보물'), st.total, H('span', {}, '점')),
              H('ul', { class: 'ar-loot-guide' }, H('li', {}, itemIcon(1, 26), '정답: 금화 주머니 150'), H('li', {}, itemIcon(2, 26), '빠른 정답: 빛나는 보석 300'), H('li', {}, itemIcon(3, 26), '3연속 정답: 황금 왕관 400'), H('li', {}, itemIcon(4, 26), '빠른 + 연속: 전설의 보물 상자 600'))),
            H('div', { class: 'ar-loot-right' }, H('h3', {}, '방금 보물을 가져간 친구'), st.list)));
      }
      root.append(st.box);
    });
    const defeated = Array.isArray(s.defeated) ? s.defeated.length : 0;
    st.sub.textContent = `보스 ${s.bossCount || defeated}마리를 모두 쓰러뜨렸어요. 남은 문제에서 맞히면 보스가 남긴 보물을 가져가요!`;
    if (small) st.sub.textContent = `보스 ${s.bossCount || defeated}마리 처치`;
    const total = N(s.lootTotal);
    if (st.lastTotal !== total) {
      const from = st.lastTotal || 0; st.lastTotal = total;
      if (KQ.fx && KQ.fx.countUp && !small) KQ.fx.countUp(st.total, from, total, 900); else st.total.textContent = fmt(total);
    }
    if (!st.list) return;
    const loot = Array.isArray(s.loot) ? s.loot : [];
    const fresh = loot.filter(l => !st.seen.has(l.at + '|' + l.nickname)).reverse();
    if (!st.primed) { st.primed = true; loot.forEach(l => st.seen.add(l.at + '|' + l.nickname)); renderList(st, loot); return; }
    if (!fresh.length) return;
    fresh.forEach(l => st.seen.add(l.at + '|' + l.nickname));
    renderList(st, loot);
    // 상자에서 보물이 튀어나오는 연출
    const big = fresh.some(l => l.tier >= 3 || l.secret);
    st.chestWrap.classList.remove('pop'); void st.chestWrap.offsetWidth; st.chestWrap.classList.add('pop');
    snd(big ? 'levelup' : 'coin');
    if (!reduced()) {
      fx('burst', st.chestWrap, { count: Math.min(140, 30 + fresh.length * 12), colors: ['#ffd43b', '#fab005', '#4dabf7', '#f783ac', '#ffffff'] });
      fresh.slice(0, 8).forEach((l, i) => st.timers.push(setTimeout(() => flyItem(st, l), i * 140)));
    }
    if (big) { fx('confetti', { y: 0.5, count: 120 }); snd('cheer'); }
  }
  function renderList(st, loot) {
    st.list.replaceChildren(...loot.slice(0, 7).map((l, i) => H('li', { class: 'ar-loot-row t' + (l.tier || 1) + (i < 3 ? ' fresh' : '') },
      avatar(l.avatar, l.nickname, 40), H('span', { class: 'ar-loot-name' }, l.nickname || ''), itemIcon(l.tier || 1, 34), H('span', { class: 'ar-loot-item' }, l.item || ''), H('b', { class: 'ar-loot-val' }, '+' + fmt(l.value)))));
    if (!loot.length) st.list.append(H('li', { class: 'ar-loot-empty' }, '다음 문제를 맞히면 여기에 이름이 올라가요!'));
  }
  function flyItem(st, l) {
    if (!st.box.isConnected) return;
    const ico = itemIcon(l.tier || 1, 54); const fly = H('div', { class: 'ar-loot-fly' }, ico, H('span', {}, l.nickname || ''));
    fly.style.setProperty('--dx', Math.round((Math.random() - 0.5) * 260) + 'px');
    st.chestWrap.append(fly); st.timers.push(setTimeout(() => fly.remove(), 1500));
  }

  function playerLoot(root, v) {
    const s = v.modeState || {}; const me = v.me || {}; const r = v.result || null;
    const st = ensure(root, 'loot-player', st => {
      st.mine = H('b', {}, '0'); st.msg = H('span', { class: 'ar-loot-pmsg' }, '정답을 맞히면 보스가 남긴 보물을 가져가요!');
      st.box = H('div', { class: 'ar-loot ar-loot-player' }, H('div', { class: 'ar-loot-pico' }, itemIcon(4, 52)), H('div', { class: 'ar-loot-ptext' }, H('strong', {}, '보스 모두 처치! 보물 창고 열림'), H('span', {}, '내가 가져간 보물 ', st.mine, '점'), st.msg));
      root.append(st.box);
    });
    const mine = (Array.isArray(s.loot) ? s.loot : []).filter(l => l.nickname === me.nickname);
    if (r && r.loot && st.lastSeq !== r.seq) {
      st.lastSeq = r.seq; st.got = (st.got || 0) + N(r.loot.value);
      st.msg.textContent = `${r.loot.item} +${fmt(r.loot.value)}점!`;
      st.box.classList.remove('pop'); void st.box.offsetWidth; st.box.classList.add('pop');
      const ic = st.box.querySelector('.ar-loot-pico'); ic.replaceChildren(itemIcon(r.loot.tier || 1, 52));
      snd(r.loot.tier >= 3 ? 'levelup' : 'coin'); fx('burst', ic, { count: 40 + r.loot.tier * 15, colors: ['#ffd43b', '#fab005', '#4dabf7', '#ffffff'] });
      try { navigator.vibrate && navigator.vibrate(60); } catch {}
    }
    st.mine.textContent = fmt(Math.max(st.got || 0, mine.reduce((a, l) => a + N(l.value), 0)));
  }

  function wrap(orig) {
    const pending = new WeakMap();
    const decide = (root, v, role, send) => {
      const s = (v && v.modeState) || {};
      const on = s.cleared && s.status !== 'defeat' && v.phase !== 'finished' && N(s.clearedAt) && now() - N(s.clearedAt) >= SWITCH_MS;
      if (on) { try { (role === 'host' ? hostLoot : playerLoot)(root, v); } catch (e) { console.warn('[보물 창고]', e); } return; }
      if (root.dataset.lootInit) clearLoot(root);
      orig[role](root, v, send);
      // 마지막 보스 폭발 연출이 끝나면 저절로 보물 화면으로
      if (s.cleared && s.status !== 'defeat' && v.phase !== 'finished' && N(s.clearedAt)) {
        clearTimeout(pending.get(root));
        pending.set(root, setTimeout(() => { if (root.isConnected) decide(root, v, role, send); }, Math.max(50, SWITCH_MS - (now() - N(s.clearedAt)) + 30)));
      }
    };
    return { host: (root, v, send) => decide(root, v || {}, 'host', send), player: (root, v, send) => decide(root, v || {}, 'player', send) };
  }
  const install = () => { const o = KQ.arena.boss; if (o && !o.__loot) { const w = wrap(o); w.__loot = true; KQ.arena.boss = w; return true; } return false; };
  if (!install()) document.addEventListener('DOMContentLoaded', install);
})();
