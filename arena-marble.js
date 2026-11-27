'use strict';
/* 반짝퀴즈 마블 레이스 그래픽 (KQ.arena.marble)
   - collect: 진행자 퀴즈 중 학생별 구슬 병. race: marble-physics.js 로 같은 레이스를 실시간 재생.
   - 가장 늦게 도착한 구슬의 주인이 1등. 카메라는 갈수록 남은 마지막 구슬들을 비춤. */
(() => {
  const KQ = window.KQ || (window.KQ = {});
  KQ.arena = KQ.arena || {};
  const K = () => KQ.modeKit;
  const N = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  const S = v => (v === null || v === undefined) ? '' : String(v);
  const A = a => Array.isArray(a) ? a : [];
  const now = () => { try { return KQ.now ? KQ.now() : Date.now(); } catch { return Date.now(); } };
  const snd = k => { try { KQ.sound && KQ.sound.play && KQ.sound.play(k); } catch { /* 무시 */ } };
  const fx = (n, ...a) => { try { if (KQ.fx && typeof KQ.fx[n] === 'function') KQ.fx[n](...a); } catch { /* 무시 */ } };
  const reduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
  const fmt = n => N(n).toLocaleString('ko-KR');
  const safeColor = c => (typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c)) ? c : '#4dabf7';
  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
  function avatarEl(p, size) {
    let n = null;
    try { if (p && p.avatar && KQ.avatar && typeof KQ.avatar.render === 'function') n = KQ.avatar.render(p.avatar, size); } catch { n = null; }
    const w = el('span', 'ar-mb-av'); w.style.width = w.style.height = size + 'px';
    if (n instanceof Node) w.append(n); else { w.classList.add('fb'); w.textContent = Array.from(S(p && p.nickname) || '?')[0]; }
    return w;
  }
  const msOf = v => (v && v.modeState && typeof v.modeState === 'object') ? v.modeState : {};
  const meOf = v => (v && v.me && typeof v.me === 'object') ? v.me : null;
  const isRace = v => { const s = msOf(v); return s.stage === 'race' && !!s.mapId && Array.isArray(s.marbles) && !!window.KQMarble; };

  // ======================= 진행자: 구슬 모으기 =======================
  function hostCollect(root, v) {
    const k = K(); const s = msOf(v);
    const st = k.prep(root, 'ar-mb-collect', ['ar-mb', 'ar-mb-collect'], (st, r) => {
      st.total = el('b', 'ar-mb-total-n', '0'); st.gold = el('b', 'ar-mb-total-g', '0');
      st.head = el('div', 'ar-mb-chead');
      const t = el('div', 'ar-mb-ctitle'); t.append(el('span', 'ar-mb-ctxt', '구슬을 모아요!'), el('small', null, '마지막 레이스는 늦게 들어오는 구슬이 1등!'));
      const tot = el('div', 'ar-mb-ctot'); tot.append(el('span', 'ar-mb-dot big'), el('span', null, '구슬 '), st.total, el('span', 'ar-mb-dot big gold'), el('span', null, '황금 '), st.gold);
      st.head.append(t, tot);
      st.grid = el('div', 'ar-mb-jars'); st.toast = el('div', 'ar-mb-toast');
      st.jars = new Map(); st.gainKey = null;
      r.append(st.head, st.grid, st.toast);
    });
    const players = A(s.players).slice().sort((a, b) => (N(b.marbles) - N(a.marbles)) || S(a.nickname).localeCompare(S(b.nickname), 'ko'));
    let tot = 0, gold = 0;
    const seen = new Set();
    players.forEach((p, i) => {
      tot += N(p.marbles); gold += N(p.gold); seen.add(p.id);
      let j = st.jars.get(p.id);
      if (!j) {
        j = { node: el('div', 'ar-mb-jar'), glass: el('div', 'ar-mb-glass'), cnt: el('b', 'ar-mb-jcnt', '0'), more: el('span', 'ar-mb-more', ''), n: -1 };
        const nm = el('div', 'ar-mb-jname'); nm.append(avatarEl(p, 22), el('span', null, S(p.nickname)));
        j.glass.append(j.more); j.node.append(j.cnt, j.glass, nm); st.jars.set(p.id, j);
      }
      if (st.grid.children[i] !== j.node) st.grid.insertBefore(j.node, st.grid.children[i] || null);
      const m = N(p.marbles), g = Math.min(m, N(p.gold));
      if (m !== j.n) {
        const prev = j.n, grew = prev >= 0 && m > prev; j.n = m; j.cnt.textContent = fmt(m);
        const show = Math.min(m, 15), col = safeColor(p.color);
        j.glass.querySelectorAll('.ar-mb-dot').forEach(d => d.remove());
        for (let q = 0; q < show; q++) { const d = el('span', 'ar-mb-dot' + (q < g ? ' gold' : '')); d.style.setProperty('--c', col); if (grew && q >= show - (m - prev)) d.classList.add('pop'); j.glass.insertBefore(d, j.more); }
        j.more.textContent = m > 15 ? '+' + (m - 15) : '';
        if (grew) k.replay(j.node, 'grow');
      }
    });
    for (const [id, j] of st.jars) if (!seen.has(id)) { j.node.remove(); st.jars.delete(id); }
    st.total.textContent = fmt(tot); st.gold.textContent = fmt(gold);
    const lg = s.lastGain; const gk = lg ? S(lg.q) + ':' + A(lg.items).length : '';
    if (st.gainKey === null) st.gainKey = gk;
    else if (lg && gk !== st.gainKey) {
      st.gainKey = gk;
      if (A(lg.items).length) {
        const sum = A(lg.items).reduce((n, x) => n + N(x.count), 0), gsum = A(lg.items).reduce((n, x) => n + N(x.gold), 0);
        st.toast.textContent = `${A(lg.items).length}명이 구슬 ${sum}개 획득!` + (gsum ? ` (황금 ${gsum}개)` : '');
        k.replay(st.toast, 'show'); snd('coin');
      }
    }
  }

  // ======================= 진행자: 레이스 =======================
  function ownerColor(st, id) { const m = st.info.get(id); return m ? safeColor(m.color) : '#4dabf7'; }
  function hostRace(root, v) {
    const k = K(); const s = msOf(v);
    const key = 'ar-mb-race-' + s.mapId + '-' + s.seed + '-' + A(s.marbles).length;
    const st = k.prep(root, key, ['ar-mb', 'ar-mb-race'], (st, r) => {
      st.world = window.KQMarble.create(s.mapId, A(s.marbles).map(m => ({ id: m.id, gold: !!m.gold })), s.seed);
      st.map = st.world.map; st.th = st.map.theme;
      st.info = new Map(A(s.marbles).map(m => [S(m.id), m]));
      st.byId = new Map(st.world.bodies.map(b => [b.id, b]));
      st.owners = new Map();
      for (const m of A(s.marbles)) { let o = st.owners.get(m.owner); if (!o) { o = { id: m.owner, nickname: S(m.nickname), color: safeColor(m.color), ids: [] }; st.owners.set(m.owner, o); } o.ids.push(S(m.id)); }
      st.cv = el('canvas', 'ar-mb-cv'); st.ctx = st.cv.getContext('2d');
      st.side = el('aside', 'ar-mb-side'); st.sideTitle = el('div', 'ar-mb-stitle'); st.sideTitle.append(el('b', null, '남은 구슬'), el('small', null, '오래 남을수록 위로!'));
      st.remain = el('div', 'ar-mb-remain'); st.list = el('ol', 'ar-mb-rank');
      st.side.append(st.sideTitle, st.remain, st.list);
      st.mapTag = el('div', 'ar-mb-maptag', st.map.name);
      st.banner = el('div', 'ar-mb-banner'); st.cd = el('div', 'ar-mb-cd');
      st.result = el('div', 'ar-mb-result'); st.result.hidden = true;
      const stage = el('div', 'ar-mb-stage'); stage.append(st.cv, st.mapTag, st.banner, st.cd, st.result);
      r.append(stage, st.side);
      st.stage = stage; st.cam = { y: -60, x: 400, z: 1 }; st.parts = []; st.seenFin = 0; st.tense = 0; st.started = false; st.shown = false; st.popAt = 0;
      const resize = () => { const rc = stage.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1); st.W = Math.max(160, rc.width); st.H = Math.max(160, rc.height); st.dpr = dpr; st.cv.width = Math.round(st.W * dpr); st.cv.height = Math.round(st.H * dpr); };
      resize(); try { st.ro = new ResizeObserver(resize); st.ro.observe(stage); } catch { /* 무시 */ }
      const loop = () => { if (st.dead) { try { st.ro && st.ro.disconnect(); } catch { /* 무시 */ } return; } try { frame(st); } catch (e) { if (!st.warned) { st.warned = true; console.warn('[마블 레이스]', e); } } st.raf = requestAnimationFrame(loop); };
      st.raf = requestAnimationFrame(loop);
    });
    st.s = s;
  }

  function frame(st) {
    const s = st.s, w = st.world, t = now(), rs = N(s.raceStart, t);
    if (t < rs) {
      const n = Math.ceil((rs - t) / 1000);
      if (st.cdN !== n) { st.cdN = n; st.cd.replaceChildren(el('small', null, st.map.name), el('b', null, String(n)), el('span', null, st.map.desc)); st.cd.className = 'ar-mb-cd on'; snd('countdown'); }
    } else if (!st.started) {
      st.started = true;
      if (t - rs < 1500) { st.cd.className = 'ar-mb-cd go'; st.cd.replaceChildren(el('b', null, '출발!')); snd('whoosh'); setTimeout(() => { if (!st.dead) st.cd.className = 'ar-mb-cd'; }, 900); } else st.cd.className = 'ar-mb-cd';
    }
    const target = Math.max(0, Math.floor((t - rs) / 1000 * 60));
    let budget = 900;
    while (w.steps < target && !w.done && budget-- > 0) w.step();
    const fl = w.finishList, catching = target - w.steps > 30;
    if (fl.length > st.seenFin) {
      if (!catching) for (let i = st.seenFin; i < fl.length; i++) { const b = st.byId.get(fl[i].id); if (b) burst(st, b.lastX !== undefined ? b.lastX : b.x, st.map.finishY, ownerColor(st, b.id)); }
      st.seenFin = fl.length;
      if (!catching && t - st.popAt > 140 && !w.done) { st.popAt = t; snd('pop'); }
    }
    for (const b of w.bodies) if (!b.finished) b.lastX = b.x;
    // v12: 역전 리프트가 구슬을 들어 올릴 때 배너
    const le = w.liftEvents || [];
    if (le.length > (st.seenLift || 0)) {
      const ev = le[le.length - 1]; st.seenLift = le.length;
      if (!catching) {
        const names = [...new Set(ev.ids.map(id => { const inf = st.info.get(S(id)); return inf ? S(inf.nickname) : ''; }).filter(Boolean))];
        st.banner.textContent = '역전 리프트! ' + names.join(', ');
        st.banner.classList.add('lift'); K().replay(st.banner, 'show'); snd('levelup');
        setTimeout(() => { if (!st.dead) st.banner.classList.remove('lift'); }, 2600);
      }
    }
    camera(st);
    draw(st);
    if (t - (st.rankAt || 0) > 250) { st.rankAt = t; ranking(st); }
    const end = N(s.raceEnd, rs + N(s.duration) * 1000);
    if (!st.shown && w.done && t >= end - 200) showResult(st);
  }

  function camera(st) {
    const w = st.world, m = st.map, total = w.bodies.length || 1;
    let n = 0, minY = Infinity, maxY = -Infinity;
    const act = [];
    for (const b of w.bodies) if (!b.finished) { n++; if (b.y < minY) minY = b.y; if (b.y > maxY) maxY = b.y; act.push(b); }
    let ty, tz = 1, tx = m.w / 2;
    if (!st.started) ty = 60;
    else if (!n) ty = m.finishY + 120;
    else {
      const f = 1 - n / total, k = Math.min(1, Math.max(0, (f - 0.2) / 0.6));
      const ys = act.map(b => b.y).sort((a, b) => a - b); const q = 0.75 - 0.75 * k;
      ty = ys[Math.min(ys.length - 1, Math.floor(q * (ys.length - 1)))];
      if (n <= 6) { act.sort((a, b) => a.y - b.y); const last = act.slice(0, Math.min(3, n)); ty = last.reduce((q, b) => q + b.y, 0) / last.length; tx = last.reduce((q, b) => q + b.x, 0) / last.length; tz = n <= 3 ? 1.6 : 1.3; }
    }
    const c = st.cam, sm = reduced() ? 1 : 0.08;
    c.y += (ty - c.y) * sm; c.z += (tz - c.z) * 0.05; c.x += (tx - c.x) * 0.06;
  }
  function burst(st, x, y, color) { if (reduced()) return; for (let i = 0; i < 6; i++) { const a = -Math.random() * Math.PI; st.parts.push({ x, y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 160, life: 0.6, color }); } if (st.parts.length > 300) st.parts.splice(0, st.parts.length - 300); }
  function shade(hex) { let h = hex.slice(1); if (h.length === 3) h = h.split('').map(x => x + x).join(''); const n = parseInt(h.slice(0, 6), 16); const f = x => Math.round(x * 0.55); return 'rgb(' + f((n >> 16) & 255) + ',' + f((n >> 8) & 255) + ',' + f(n & 255) + ')'; }

  function draw(st) {
    const ctx = st.ctx, W0 = st.W, H0 = st.H, m = st.map, th = st.th, w = st.world, c = st.cam;
    ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, H0); g.addColorStop(0, th.bg1); g.addColorStop(1, th.bg2); ctx.fillStyle = g; ctx.fillRect(0, 0, W0, H0);
    const sc = W0 / m.w * c.z, viewH = H0 / sc, viewW = W0 / sc;
    let top = c.y - viewH * 0.45; top = Math.max(-260, Math.min(m.h - viewH, top));
    let left = c.x - viewW / 2; left = Math.max(0, Math.min(m.w - viewW, left));
    ctx.setTransform(st.dpr * sc, 0, 0, st.dpr * sc, -left * sc * st.dpr, -top * sc * st.dpr);
    if (m.id === 'space') { ctx.fillStyle = 'rgba(255,255,255,.6)'; for (let i = 0; i < 260; i++) { const x = (i * 97) % m.w, y = (i * 263) % m.h; if (y > top - 10 && y < top + viewH + 10) ctx.fillRect(x, y, 2, 2); } }
    else { ctx.fillStyle = 'rgba(255,255,255,.05)'; for (let y = Math.floor(top / 200) * 200; y < top + viewH; y += 200) ctx.fillRect(0, y, m.w, 100); }
    ctx.fillStyle = th.seg; ctx.globalAlpha = 0.4; ctx.fillRect(0, top - 10, 4, viewH + 20); ctx.fillRect(m.w - 4, top - 10, 4, viewH + 20); ctx.globalAlpha = 1;
    ctx.lineCap = 'round';
    for (const sg of m.segs) {
      if (Math.max(sg[1], sg[3]) < top - 20 || Math.min(sg[1], sg[3]) > top + viewH + 20) continue;
      ctx.strokeStyle = sg[4] === 'funnel' || sg[4] === 'split' ? th.accent : th.seg; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(sg[0], sg[1]); ctx.lineTo(sg[2], sg[3]); ctx.stroke();
    }
    for (const p of m.pegs) {
      if (p[1] < top - 30 || p[1] > top + viewH + 30) continue;
      ctx.beginPath(); ctx.arc(p[0], p[1], p[2], 0, Math.PI * 2);
      if (p[3] === 2) { ctx.fillStyle = th.bump; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p[0], p[1], p[2] * 0.35, 0, Math.PI * 2); ctx.fill(); }
      else { ctx.fillStyle = p[3] === 1 ? th.bump : th.peg; ctx.fill(); }
    }
    for (const r of m.rotors) {
      if (r.cy + r.len < top - 20 || r.cy - r.len > top + viewH + 20) continue;
      const base = w.rotorAngle(r);
      ctx.strokeStyle = th.rotor; ctx.lineWidth = 8;
      for (let a = 0; a < r.arms; a++) { const ang = base + a * Math.PI * 2 / r.arms; ctx.beginPath(); ctx.moveTo(r.cx, r.cy); ctx.lineTo(r.cx + Math.cos(ang) * r.len, r.cy + Math.sin(ang) * r.len); ctx.stroke(); }
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(r.cx, r.cy, 8, 0, Math.PI * 2); ctx.fill();
    }
    for (const s of (w.lifts || [])) {
      const L = s.L, x0 = L.x, half = L.w / 2, topY = L.y - L.rise - 24;
      if (L.y + 20 < top || topY > top + viewH) continue;
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(x0 - half - 8, topY); ctx.lineTo(x0 - half - 8, L.y + 12); ctx.moveTo(x0 + half + 8, topY); ctx.lineTo(x0 + half + 8, L.y + 12); ctx.stroke();
      for (let yy = topY + 14; yy < L.y + 10; yy += 18) { ctx.beginPath(); ctx.moveTo(x0 - half - 13, yy); ctx.lineTo(x0 - half - 3, yy); ctx.moveTo(x0 + half + 3, yy); ctx.lineTo(x0 + half + 13, yy); ctx.stroke(); }
      const busy = s.carry.length > 0;
      if (busy) { ctx.fillStyle = 'rgba(255,212,59,.35)'; ctx.fillRect(x0 - half - 6, s.py - 34, L.w + 12, 34); }
      ctx.fillStyle = busy ? '#ffd43b' : '#ced4da'; ctx.fillRect(x0 - half, s.py - 4, L.w, 9);
      ctx.fillStyle = '#495057'; ctx.fillRect(x0 - half, s.py + 5, L.w, 3);
      ctx.font = 'bold 15px system-ui,sans-serif'; ctx.textAlign = 'center';
      const tag = '역전 리프트', tw = ctx.measureText(tag).width + 16;
      ctx.fillStyle = '#f59f00'; ctx.fillRect(x0 - tw / 2, L.y + 16, tw, 22); ctx.fillStyle = '#fff'; ctx.fillText(tag, x0, L.y + 32);
      if (s.state === 'hold' && ((w.t * 4) | 0) % 2 === 0) { ctx.font = 'bold 24px system-ui,sans-serif'; ctx.fillStyle = '#ffe066'; ctx.strokeStyle = '#3b1d72'; ctx.lineWidth = 5; ctx.strokeText('버텨라!', x0 + half + 70, s.py - 10); ctx.fillText('버텨라!', x0 + half + 70, s.py - 10); }
    }
    const fy = m.finishY;
    if (fy > top - 30 && fy < top + viewH + 30) {
      for (let x = 0; x < m.w; x += 20) { const odd = ((x / 20) | 0) % 2; ctx.fillStyle = odd ? '#fff' : '#222'; ctx.fillRect(x, fy - 6, 20, 6); ctx.fillStyle = odd ? '#222' : '#fff'; ctx.fillRect(x, fy, 20, 6); }
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(0, fy + 6, m.w, m.h - fy); ctx.fillStyle = '#fff'; ctx.font = 'bold 22px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.fillText('결승선', m.w / 2, fy - 14);
    }
    const active = []; let nAct = 0;
    for (const b of w.bodies) {
      if (!b.finished) nAct++;
      if (b.y < top - 20 || b.y > top + viewH + 20 || b.x < left - 20 || b.x > left + viewW + 20) continue;
      const col = ownerColor(st, b.id);
      if (b.gold) { ctx.fillStyle = 'rgba(255,212,59,.45)'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 4, 0, Math.PI * 2); ctx.fill(); }
      const gg = ctx.createRadialGradient(b.x - 2, b.y - 3, 1, b.x, b.y, b.r);
      gg.addColorStop(0, '#fff'); gg.addColorStop(0.35, b.gold ? '#ffe066' : col); gg.addColorStop(1, b.gold ? '#b8860b' : shade(col));
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = b.gold ? '#fff3bf' : col; ctx.stroke();
      if (!b.finished) active.push(b);
    }
    // v12: 보이는 모든 구슬 위에 닉네임 (많으면 작게), 리프트에 탄 구슬은 크게 강조
    if (nAct) {
      const fs0 = (nAct > 60 ? 10.5 : nAct > 24 ? 12 : 14) / Math.max(1, c.z * 0.85);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const sorted = active.slice().sort((a, b) => (a.lift >= 0) - (b.lift >= 0));
      for (const b of sorted) {
        const inf = st.info.get(b.id); const nm = inf ? S(inf.nickname) : ''; if (!nm) continue;
        const up = b.lift >= 0, fsz = up ? fs0 * 1.45 : fs0;
        ctx.font = 'bold ' + fsz.toFixed(1) + 'px system-ui,sans-serif';
        const tw = ctx.measureText(nm).width + fsz * 0.8, th2 = fsz * 1.35, by = b.y - b.r - th2 / 2 - 3 - (up ? b.slot * th2 * 1.1 : 0);
        ctx.fillStyle = up ? '#ffd43b' : 'rgba(0,0,0,.62)'; ctx.fillRect(b.x - tw / 2, by - th2 / 2, tw, th2);
        ctx.lineWidth = up ? 2 : 1.2; ctx.strokeStyle = up ? '#fff' : ownerColor(st, b.id); ctx.strokeRect(b.x - tw / 2, by - th2 / 2, tw, th2);
        ctx.fillStyle = up ? '#3b1d72' : '#fff'; ctx.fillText(nm, b.x, by + 0.5);
      }
      ctx.textBaseline = 'alphabetic';
    }
    const dt = 1 / 60;
    st.parts = st.parts.filter(p => (p.life -= dt) > 0);
    for (const p of st.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 400 * dt; ctx.globalAlpha = Math.max(0, p.life / 0.6); ctx.fillStyle = p.color; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); }
    ctx.globalAlpha = 1;
  }

  function ranking(st) {
    const rows = [];
    for (const o of st.owners.values()) {
      let rem = 0, minY = Infinity, lastT = 0;
      for (const id of o.ids) { const b = st.byId.get(id); if (!b) continue; if (!b.finished) { rem++; if (b.y < minY) minY = b.y; } else if (N(b.finishT) > lastT) lastT = N(b.finishT); }
      rows.push({ o, rem, minY, lastT });
    }
    rows.sort((a, b) => ((b.rem > 0) - (a.rem > 0)) || (a.rem > 0 ? a.minY - b.minY : b.lastT - a.lastT) || a.o.nickname.localeCompare(b.o.nickname, 'ko'));
    const remOwners = rows.filter(r => r.rem > 0).length, remMarbles = rows.reduce((n, r) => n + r.rem, 0);
    st.remain.textContent = st.started ? `남은 구슬 ${fmt(remMarbles)}개 · 학생 ${remOwners}명` : `구슬 ${fmt(st.world.bodies.length)}개 출발 준비`;
    const top = rows.slice(0, 8);
    const sig = top.map(r => r.o.id + ':' + r.rem).join('|') + st.started;
    if (sig !== st.rankSig) {
      st.rankSig = sig;
      st.list.replaceChildren(...top.map((r, i) => {
        const li = el('li', 'ar-mb-rrow' + (r.rem ? '' : ' done') + (i < 3 && st.started ? ' top' + (i + 1) : ''));
        const pinfo = A(st.s.players).find(p => p.id === r.o.id) || { nickname: r.o.nickname };
        const dot = el('span', 'ar-mb-rdot'); dot.style.background = r.o.color;
        li.append(el('span', 'ar-mb-rn', String(i + 1)), avatarEl(pinfo, 26), el('span', 'ar-mb-rname', r.o.nickname), dot, el('span', 'ar-mb-rleft', r.rem ? `${r.rem}개 남음` : '모두 도착'));
        return li;
      }));
    }
    if (st.started && !st.world.done) {
      const tense = remOwners <= 1 ? 1 : remOwners <= 3 ? 3 : 0;
      if (tense && tense !== st.tense) {
        st.tense = tense;
        st.banner.textContent = tense === 1 ? '마지막 한 명! 끝까지 버텨라!' : '마지막 3명! 가장 늦게 들어오면 1등!';
        K().replay(st.banner, 'show'); snd('drumroll'); st.stage.classList.add('tense');
      }
    }
  }

  function showResult(st) {
    st.shown = true; st.stage.classList.remove('tense');
    const s = st.s, order = A(s.order).slice().sort((a, b) => N(a.place) - N(b.place)).slice(0, 3), bonus = s.bonus || {};
    if (!order.length) return;
    const box = el('div', 'ar-mb-rbox');
    box.append(el('h2', null, '레이스 결과'), el('p', null, '가장 늦게 들어온 구슬이 1등!'));
    const row = el('div', 'ar-mb-rpods');
    for (const pl of [2, 1, 3]) {
      const o = order.find(x => N(x.place) === pl); if (!o) continue;
      const pod = el('div', 'ar-mb-rpod p' + pl); pod.style.animationDelay = (pl === 3 ? 0 : pl === 2 ? 0.5 : 1) + 's';
      pod.append(el('b', 'ar-mb-rplace', pl + '등'), avatarEl(o, pl === 1 ? 84 : 64), el('span', 'ar-mb-rpname', S(o.nickname)), el('span', 'ar-mb-rbonus', '+' + fmt(bonus[pl] || 0) + '점'));
      row.append(pod);
    }
    box.append(row); st.result.replaceChildren(box); st.result.hidden = false;
    setTimeout(() => { if (!st.dead) { fx('confetti', { count: 160, power: 1.2 }); snd('fanfare'); } }, 1100);
  }

  function host(root, v) {
    if (!root) return;
    if (v && (v.phase === 'running' || v.phase === 'finished') && isRace(v)) return hostRace(root, v);
    return hostCollect(root, v);
  }

  // ======================= 학생 =======================
  function myMarbles(v) { const s = msOf(v), me = meOf(v); if (!me) return { m: 0, g: 0 }; const p = A(s.players).find(x => x.id === me.id); return p ? { m: N(p.marbles), g: N(p.gold), color: p.color } : { m: N(me.stats && me.stats.marbles), g: N(me.stats && me.stats.gold) }; }
  function playerStrip(root, v) {
    const k = K();
    const st = k.prep(root, 'ar-mb-pstrip', ['ar-mb', 'ar-mb-pstrip'], (st, r) => {
      st.dots = el('div', 'ar-mb-pdots'); st.n = el('b', null, '0'); st.g = el('span', 'ar-mb-pg', '');
      const t = el('div', 'ar-mb-ptext'); const l1 = el('div', 'ar-mb-pl1'); l1.append('내 구슬 ', st.n, '개'); st.prog = el('div', 'ar-mb-prog'); t.append(l1, st.prog, st.g, el('small', null, '정답 3개마다 구슬 1개! 마지막 레이스는 늦게 들어올수록 1등'));
      r.append(st.dots, t); st.last = -1;
    });
    const { m, g, color } = myMarbles(v);
    const meP = A(msOf(v).players).find(x => meOf(v) && x.id === meOf(v).id); const cor = N(meP ? meP.correct : (meOf(v) || {}).correct);
    const pr = cor % 3;
    if (st.lastPr !== pr) { st.lastPr = pr; st.prog.replaceChildren(el('span', null, '다음 구슬까지'), ...[0, 1, 2].map(i => el('i', 'ar-mb-pp' + (i < pr ? ' on' : ''))), el('b', null, `정답 ${3 - pr}개`)); }
    if (m !== st.last) {
      const grew = st.last >= 0 && m > st.last; st.last = m; st.n.textContent = fmt(m); st.g.textContent = g ? `황금 구슬 ${g}개` : '';
      const show = Math.min(m, 18);
      st.dots.replaceChildren(...Array.from({ length: Math.max(show, 1) }, (_, i) => { const d = el('span', 'ar-mb-dot' + (show === 0 ? ' empty' : i < g ? ' gold' : '') + (grew && i === show - 1 ? ' pop' : '')); d.style.setProperty('--c', safeColor(color)); return d; }));
      if (grew) k.replay(st.n, 'bump');
    }
  }
  function playerRace(root, v) {
    const k = K(); const s = msOf(v), me = meOf(v);
    const st = k.prep(root, 'ar-mb-prace-' + s.seed, ['ar-mb', 'ar-mb-prace'], (st, r) => {
      st.h = el('h2', null, '큰 화면을 보세요!'); st.sub = el('p', 'ar-mb-psub', ''); st.big = el('div', 'ar-mb-pbig', ''); st.note = el('p', 'ar-mb-pnote', '');
      st.bar = el('div', 'ar-mb-pbar'); st.fill = el('i'); st.bar.append(st.fill);
      r.append(st.h, st.sub, st.big, st.bar, st.note); st.root = r;
      const loop = () => { if (st.dead) return; try { tick(st); } catch { /* 무시 */ } st.raf = requestAnimationFrame(loop); };
      st.raf = requestAnimationFrame(loop);
    });
    st.s = s; st.me = me;
  }
  function tick(st) {
    const s = st.s, me = st.me; if (!me) return;
    const t = now(), rs = N(s.raceStart, t), end = N(s.raceEnd, rs + N(s.duration) * 1000);
    if (!st.mine) { st.mine = new Set(A(s.marbles).filter(m => m.owner === me.id).map(m => S(m.id))); st.ownerOf = new Map(A(s.marbles).map(m => [S(m.id), m.owner])); }
    const mine = st.mine, fin = A(s.finish), el2 = (t - rs) / 1000, total = mine.size;
    if (t < rs) { st.sub.textContent = `내 구슬 ${total}개가 출발선에 있어요`; st.big.textContent = String(Math.ceil((rs - t) / 1000)); st.note.textContent = '가장 늦게 들어오는 구슬이 1등이에요!'; st.fill.style.width = '0%'; return; }
    if (t < end) {
      if (t - (st.at || 0) < 200) return; st.at = t;
      let arrived = 0; const rest = new Set();
      for (const f of fin) { if (N(f.t) <= el2) { if (mine.has(S(f.id))) arrived++; } else rest.add(st.ownerOf.get(S(f.id))); }
      const left = total - arrived;
      st.sub.textContent = total ? `내 구슬 ${total}개 중` : '이번 레이스에는 내 구슬이 없어요';
      st.big.textContent = total ? (left ? `${left}개 굴러가는 중` : '모두 도착!') : '응원해요!';
      st.note.textContent = total ? `아직 굴러가는 학생 ${rest.size}명` : `정답 3개마다 구슬을 받아요 · 굴러가는 학생 ${rest.size}명`;
      st.fill.style.width = (total ? arrived / total * 100 : 100).toFixed(0) + '%';
      if (st.prevLeft !== undefined && left < st.prevLeft) { try { navigator.vibrate && navigator.vibrate(30); } catch { /* 무시 */ } }
      st.prevLeft = left; return;
    }
    if (st.doneShown) return; st.doneShown = true;
    // 결과(등수·추가 점수)는 선생님 화면에서만 발표
    st.h.textContent = '레이스 끝!';
    st.sub.textContent = '';
    st.big.textContent = '결과는 선생님 화면에서!';
    st.note.textContent = '가장 늦게 들어온 구슬이 1등이에요. 큰 화면을 봐요!';
    st.fill.style.width = '100%';
    snd('sparkle');
  }
  function player(root, v) {
    if (!root) return;
    if (v && v.phase === 'running' && isRace(v)) return playerRace(root, v);
    return playerStrip(root, v);
  }
  KQ.arena.marble = { host, player };
})();
