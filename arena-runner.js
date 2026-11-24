'use strict';
/* 반짝퀴즈 퀴즈 런 (반짝 오리지널, mode id 'runner')
   학생: 의사 3D 달리기 트랙. 장애물을 피해 달리다가 문제의 정답 문으로 골인 → send('runAnswer').
   진행자: 실시간 경주판(캐릭터, 점수, 연속 정답, 충돌, 달린 거리, 순위 이동). */
(() => {
  const KQ = window.KQ || (window.KQ = {});
  KQ.arena = KQ.arena || {};
  const kit = () => KQ.modeKit || {};
  const N = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const snd = k => { try { if (KQ.sound && KQ.sound.play) KQ.sound.play(k); } catch {} };
  const fx = (k, ...a) => { try { if (KQ.fx && typeof KQ.fx[k] === 'function') KQ.fx[k](...a); } catch {} };
  const nowT = () => { try { return KQ.now ? KQ.now() : Date.now(); } catch { return Date.now(); } };
  const reduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
  const SHAPE_COLORS = ['#e21b3c', '#1368ce', '#d89e00', '#26890c'];
  const SHAPE_NAMES = ['세모', '마름모', '동그라미', '네모'];
  const fmt = n => Math.round(N(n)).toLocaleString('ko-KR');

  function H(tag, attrs, ...kids) {
    const K = kit(); if (K.H) return K.H(tag, attrs, ...kids);
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2).toLowerCase(), v); else n.setAttribute(k, v); }
    for (const c of kids.flat()) if (c != null && c !== false) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return n;
  }
  function prep(root, key, classes, build) {
    const K = kit();
    if (K.prep) return K.prep(root, key, classes, build);
    if (root.__arKey === key) { root.__arSt.first = false; return root.__arSt; }
    root.replaceChildren(); root.classList.add(...classes);
    const st = { first: true, dead: false, timers: new Set(), raf: 0 }; build(st, root); root.__arKey = key; root.__arSt = st; return st;
  }
  function shapeIcon(i, size) {
    try { if (KQ.shapeIcon) { const n = KQ.shapeIcon(i, size); if (n instanceof Node) return n; } } catch {}
    return H('span', { class: 'ar-runner-shp', style: `background:${SHAPE_COLORS[i % 4]};width:${size}px;height:${size}px` });
  }
  function avatarNode(av, size, name) {
    try { if (av && KQ.avatar && KQ.avatar.render) { const n = KQ.avatar.render(av, size); if (n instanceof Node) return n; } } catch {}
    const s = H('span', { class: 'ar-runner-avf', style: `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.48)}px` });
    s.textContent = Array.from(String(name || '?'))[0] || '?'; return s;
  }
  // 캐릭터 SVG → 캔버스용 이미지
  const imgCache = new Map();
  function avatarImage(av, name) {
    const key = JSON.stringify(av || null) + '|' + (name || '');
    if (imgCache.has(key)) return imgCache.get(key);
    const img = new Image(); let ok = false;
    try {
      if (av && KQ.avatar && KQ.avatar.render) {
        const svg = KQ.avatar.render(av, 160);
        const el = svg instanceof SVGElement ? svg : svg.querySelector && svg.querySelector('svg');
        if (el) {
          const c = el.cloneNode(true); c.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); c.setAttribute('width', '160'); c.setAttribute('height', '160');
          img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(c)); ok = true;
        }
      }
    } catch { ok = false; }
    const rec = { img, ok, name: String(name || '') };
    imgCache.set(key, rec); return rec;
  }

  // ======================================================================
  // 학생 화면
  // ======================================================================
  const LANE_W = 2.2, CAM_BACK = 5.5, VIEW_D = 95;
  const BASE_SPEED = 9;
  const KEY_ROWS = [['← →', 'A D', '줄 바꾸기'], ['↑', '스페이스', '점프'], ['↓', 'S', '숙이기']];

  function keyGuide(compact) {
    return H('div', { class: 'ar-runner-keys' + (compact ? ' compact' : ''), 'aria-label': '조작 키 안내' },
      H('div', { class: 'ar-runner-keys-title' }, '조작 키'),
      KEY_ROWS.map(([a, b, t]) => H('div', { class: 'ar-runner-key' }, H('kbd', {}, a), H('kbd', { class: 'alt' }, b), H('span', {}, t))),
      H('div', { class: 'ar-runner-keys-touch' }, '휴대폰: 밀기(스와이프) 또는 아래 버튼'));
  }

  function player(root, view, send) {
    const phase = view && view.phase;
    if (phase === 'running') return playerRun(root, view, send);
    if (phase === 'finished') return playerSummary(root, view);
    return playerIdle(root, view);
  }

  function playerIdle(root, view) {
    prep(root, 'runner-idle', ['ar-runner-pidle'], (st, r) => {
      r.append(H('div', { class: 'ar-runner-idlecard' },
        H('div', { class: 'ar-runner-idle-left' }, H('strong', {}, '퀴즈 런 조작법'), H('span', {}, '장애물을 피해 달리다가 정답 문으로 골인!')),
        H('div', { class: 'ar-runner-idle-keys' }, KEY_ROWS.map(([a, b, t]) => H('span', { class: 'ar-runner-ik' }, H('kbd', {}, a), H('kbd', { class: 'alt' }, b), t)))));
    });
  }

  function playerSummary(root, view) {
    const s = (view.me && view.me.stats) || {};
    const st = prep(root, 'runner-sum', ['ar-runner-psum'], (st, r) => {
      st.box = H('div', { class: 'ar-runner-sumcard' }); r.append(st.box);
    });
    const key = JSON.stringify(s);
    if (st.k === key) return; st.k = key;
    st.box.replaceChildren(H('strong', {}, '나의 퀴즈 런 기록'),
      H('div', { class: 'ar-runner-sumgrid' },
        [['최고 연속', N(s.best) + '번'], ['피한 장애물', N(s.dodges) + '개'], ['충돌', N(s.hits) + '번'], ['코인', N(s.coins) + '개'], ['달린 거리', fmt(s.dist) + 'm']]
          .map(([a, b]) => H('span', {}, H('small', {}, a), H('b', {}, b)))));
  }

  function playerRun(root, view, send) {
    const st = prep(root, 'runner-run', ['ar-runner-p'], (st, r) => buildRun(st, r));
    st.view = view; st.send = send;
    syncView(st, view);
  }

  function buildRun(st, r) {
    st.canvas = H('canvas', { class: 'ar-runner-canvas', 'aria-label': '퀴즈 런 달리기 화면' });
    st.ctx = st.canvas.getContext('2d');
    st.qText = H('div', { class: 'ar-runner-qtext' }, '');
    st.qChoices = H('div', { class: 'ar-runner-qchoices' });
    st.qBox = H('div', { class: 'ar-runner-q', role: 'status', 'aria-live': 'polite' }, st.qText, st.qChoices);
    st.hudScore = H('b', {}, '0'); st.hudSpeed = H('b', {}, '1'); st.hudStreak = H('b', {}, '0'); st.hudCoins = H('b', {}, '0'); st.hudDist = H('b', {}, '0');
    st.speedBar = H('span', { class: 'ar-runner-sbar-fill' });
    st.power = H('div', { class: 'ar-runner-power' });
    st.hud = H('div', { class: 'ar-runner-hud' },
      H('div', { class: 'ar-runner-hrow' }, H('span', { class: 'ar-runner-chip score' }, '점수 ', st.hudScore), H('span', { class: 'ar-runner-chip' }, '연속 ', st.hudStreak), H('span', { class: 'ar-runner-chip coin' }, '코인 ', st.hudCoins), H('span', { class: 'ar-runner-chip' }, st.hudDist, 'm')),
      H('div', { class: 'ar-runner-speed' }, H('span', {}, '속도 ', st.hudSpeed, '단계'), H('span', { class: 'ar-runner-sbar' }, st.speedBar)), st.power);
    st.judge = H('div', { class: 'ar-runner-judge', 'aria-hidden': 'true' });
    st.banner = H('div', { class: 'ar-runner-banner', 'aria-hidden': 'true' });
    st.wait = H('div', { class: 'ar-runner-wait' }, '');
    const btn = (label, cls, fn) => { const b = H('button', { type: 'button', class: 'ar-runner-btn ' + cls, 'aria-label': label }, H('span', { class: 'ar-runner-arrow' }), H('small', {}, label)); b.addEventListener('pointerdown', e => { e.preventDefault(); fn(); }); return b; };
    st.controls = H('div', { class: 'ar-runner-controls' },
      btn('왼쪽', 'left', () => input(st, 'left')), btn('점프', 'up', () => input(st, 'jump')), btn('숙이기', 'down', () => input(st, 'duck')), btn('오른쪽', 'right', () => input(st, 'right')));
    st.topBox = H('div', { class: 'ar-runner-top' }, st.qBox, keyGuide(false));
    st.stage = H('div', { class: 'ar-runner-stage' }, st.canvas, st.topBox, st.hud, st.wait, st.banner, st.judge, st.controls);
    r.append(st.stage);
    st.stage.__runner = st;

    // 게임 상태
    Object.assign(st, {
      pz: 0, px: 1, lane: 1, lanes: 4, vy: 0, y: 0, duckUntil: 0, slowUntil: 0, invulnUntil: 0, shieldOn: false, magnetUntil: 0,
      objs: [], spawnZ: 30, gate: null, curQ: null, needNew: false, ansSeq: -1, judging: false, streak: 0, fever: false, tier: 0,
      seg: { hits: 0, dodges: 0, coins: 0, dist: 0 }, totals: { coins: 0, dist: 0 }, seenSeq: null, qCount: 0, last: performance.now(), runT: 0,
      parts: [], shake: 0, flashCol: null, flashUntil: 0, gateFlash: null, laneFx: 0, scoreShown: 0
    });

    // 키보드
    const onKey = e => {
      if (st.dead) { window.removeEventListener('keydown', onKey); return; }
      const tg = e.target; if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
      const k = e.key;
      let a = null;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') a = 'left';
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') a = 'right';
      else if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === ' ' || k === 'Spacebar') a = 'jump';
      else if (k === 'ArrowDown' || k === 's' || k === 'S') a = 'duck';
      if (!a) return;
      e.preventDefault(); if (!e.repeat || a === 'duck') input(st, a);
    };
    window.addEventListener('keydown', onKey);
    // 스와이프
    let sx = 0, sy = 0, sw = false;
    st.canvas.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; sw = true; });
    st.canvas.addEventListener('pointerup', e => {
      if (!sw) return; sw = false;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) { input(st, 'jump'); return; }
      if (Math.abs(dx) > Math.abs(dy)) input(st, dx > 0 ? 'right' : 'left'); else input(st, dy < 0 ? 'jump' : 'duck');
    });
    st.canvas.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
    // 크기
    const resize = () => {
      const rc = st.stage.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1);
      st.W = Math.max(200, rc.width); st.H = Math.max(240, rc.height); st.dpr = dpr;
      st.canvas.width = Math.round(st.W * dpr); st.canvas.height = Math.round(st.H * dpr);
    };
    resize();
    try { st.ro = new ResizeObserver(resize); st.ro.observe(st.stage); } catch { window.addEventListener('resize', resize); }
    const loop = t => {
      if (st.dead) { try { st.ro && st.ro.disconnect(); } catch {} window.removeEventListener('keydown', onKey); return; }
      try { step(st, t); draw(st, t); hud(st); } catch (e) { if (!st.warned) { st.warned = true; console.warn('[퀴즈 런]', e); } }
      st.raf = requestAnimationFrame(loop);
    };
    st.raf = requestAnimationFrame(loop);
  }

  function input(st, a) {
    if (st.dead) return;
    if (a === 'left') { st.lane = clamp(st.lane - 1, 0, st.lanes - 1); snd('whoosh'); }
    else if (a === 'right') { st.lane = clamp(st.lane + 1, 0, st.lanes - 1); snd('whoosh'); }
    else if (a === 'jump') { if (st.y <= 0.001) { st.vy = 7.6; st.duckUntil = 0; snd('pop'); } }
    else if (a === 'duck') { st.duckUntil = performance.now() + 750; if (st.y > 0) st.vy = Math.min(st.vy, -9); }
  }

  // ---------- 화면 상태 반영 ----------
  function syncView(st, v) {
    const q = v.question;
    const fresh = q && !st.judging && (!st.curQ || st.curQ.id !== q.id || (st.needNew && v.result && N(v.result.seq) >= st.ansSeq));
    if (fresh) { st.curQ = q; st.needNew = false; st.qCount++; showQuestion(st, q); }
    if (!q && !st.judging) { st.qText.textContent = '다음 문제를 준비하는 중…'; st.qChoices.replaceChildren(); }
    const r = v.result;
    if (r && r.seq !== undefined && r.seq !== st.seenSeq && st.seenSeq !== null && !st.judging) { applyResult(st, r); }
    if (r && st.seenSeq === null) { st.seenSeq = r.seq; st.streak = N(r.streak); setTier(st); }
    if (st.seenSeq === null && !r) st.seenSeq = -1;
  }

  function showQuestion(st, q) {
    const choices = Array.isArray(q.choices) ? q.choices : [];
    const n = clamp(choices.length || N(q.choiceCount) || 2, 2, 4);
    st.lanes = n; st.lane = clamp(st.lane, 0, n - 1);
    st.qText.textContent = q.text || '큰 화면의 문제를 보세요';
    st.qChoices.replaceChildren(...choices.map((c, i) => H('span', { class: 'ar-runner-qc', style: `--c:${SHAPE_COLORS[i]}` }, shapeIcon(i, 18), H('span', {}, (c && c.text) || SHAPE_NAMES[i]))));
    st.qBox.classList.remove('pop'); void st.qBox.offsetWidth; st.qBox.classList.add('pop');
    // 문 배치
    const sp = speedNow(st, performance.now());
    const read = clamp(6 + String(q.text || '').length * 0.09 + choices.reduce((a, c) => a + String((c && c.text) || '').length, 0) * 0.05, 7, 14);
    const gz = st.pz + Math.max(60, sp * read);
    st.objs = st.objs.filter(o => o.z < gz - 14 || o.z > gz + 10);
    st.gate = { z: gz, qid: q.id, n, choices: choices.map((c, i) => (c && c.text) || SHAPE_NAMES[i]), passed: false };
    st.spawnZ = Math.min(st.spawnZ, gz - 14);
    snd('sparkle');
  }

  function speedNow(st, t) {
    let s = BASE_SPEED * (1 + 0.1 * st.tier) * (st.fever ? 1.12 : 1);
    if (t < st.slowUntil) s *= 0.5;
    if (!st.gate && !st.judging && !st.curQ) s *= 0.85;
    return s;
  }
  function setTier(st) { st.tier = clamp(st.streak, 0, 5); st.fever = st.streak >= 5; }

  // ---------- 물체 생성 ----------
  function spawnUntil(st) {
    const limit = st.gate ? st.gate.z - 14 : st.pz + VIEW_D;
    const diff = Math.min(1, st.qCount / 10);
    while (st.spawnZ < Math.min(limit, st.pz + VIEW_D)) {
      const z = st.spawnZ; const n = st.lanes;
      const roll = Math.random();
      const lane = Math.floor(Math.random() * n);
      if (roll < 0.22) { // 코인 줄
        const ln = Math.floor(Math.random() * n); for (let k = 0; k < 5; k++) st.objs.push({ type: 'coin', lane: ln, z: z + k * 1.6, h: 0.8 });
      } else if (roll < 0.42) st.objs.push({ type: 'hurdle', lane, z });
      else if (roll < 0.6) st.objs.push({ type: 'bar', lane, z });
      else if (roll < 0.78) {
        st.objs.push({ type: 'block', lane, z });
        if (diff > 0.4 && n >= 3 && Math.random() < diff * 0.6) { const l2 = (lane + 1 + Math.floor(Math.random() * (n - 1))) % n; st.objs.push({ type: 'block', lane: l2, z }); }
        const free = (lane + 1) % n; st.objs.push({ type: 'coin', lane: free, z, h: 0.8 });
      } else if (roll < 0.88 + 0.04 * diff) st.objs.push({ type: 'barrel', lane, z: z + 18, roll: 4 + 2 * diff });
      else if (roll < 0.95) st.objs.push({ type: Math.random() < 0.5 ? 'shield' : 'magnet', lane, z, h: 1 });
      else { for (let k = 0; k < 4; k++) st.objs.push({ type: 'coin', lane: k % n, z: z + k * 1.4, h: 1.6 }); }
      st.spawnZ += clamp(15 - diff * 5, 9, 16) * (0.8 + Math.random() * 0.5);
    }
  }

  // ---------- 진행 ----------
  function step(st, t) {
    const dt = Math.min(0.05, Math.max(0, (t - st.last) / 1000)); st.last = t; st.runT += dt;
    const sp = speedNow(st, t);
    const dz = sp * dt; st.pz += dz; st.seg.dist += dz; st.totals.dist += dz;
    // 좌우, 점프
    st.px += clamp(st.lane - st.px, -dt * 9, dt * 9);
    if (st.y > 0 || st.vy > 0) { st.vy -= 22 * dt; st.y = Math.max(0, st.y + st.vy * dt); if (st.y === 0) st.vy = 0; }
    spawnUntil(st);
    const ducking = t < st.duckUntil && st.y < 0.15;
    const myLane = Math.round(st.px);
    const magnet = t < st.magnetUntil;
    for (const o of st.objs) {
      if (o.type === 'barrel') o.z -= o.roll * dt;
      if (o.type === 'coin' && magnet && !o.got && o.z - st.pz < 14 && o.z - st.pz > 0) o.lane += clamp(st.px - o.lane, -dt * 4, dt * 4);
      if (o.done || o.z > st.pz + 0.2) continue;
      o.done = true;
      const same = Math.abs(o.lane - st.px) < 0.55;
      if (o.type === 'coin' || o.type === 'shield' || o.type === 'magnet') {
        const hgt = o.h || 0.8; const reach = st.y + (ducking ? 0.9 : 1.8);
        if ((same || (magnet && o.type === 'coin' && Math.abs(o.lane - st.px) < 1.6)) && reach >= hgt - 0.2 && st.y <= hgt + 0.6) {
          o.got = true;
          if (o.type === 'coin') { st.seg.coins++; st.totals.coins++; snd('coin'); burst(st, 'coin'); }
          else if (o.type === 'shield') { st.shieldOn = true; snd('levelup'); showBanner(st, '방패 획득! 한 번 부딪혀도 괜찮아요', 'blue'); }
          else { st.magnetUntil = t + 8000; snd('levelup'); showBanner(st, '자석 획득! 8초 동안 코인이 끌려와요', 'red'); }
        }
        continue;
      }
      if (!same) { if (Math.abs(o.lane - st.px) < 1.5) st.seg.dodges++; continue; }
      let hit = false;
      if (o.type === 'hurdle' || o.type === 'barrel') hit = st.y < (o.type === 'barrel' ? 0.75 : 0.55);
      else if (o.type === 'bar') hit = !ducking || st.y > 0.15;
      else if (o.type === 'block') hit = true;
      if (!hit) { st.seg.dodges++; o.ok = true; burst(st, 'dodge'); continue; }
      if (t < st.invulnUntil) continue;
      if (st.shieldOn) { st.shieldOn = false; st.invulnUntil = t + 900; snd('sparkle'); showBanner(st, '방패가 막아 줬어요!', 'blue'); o.smash = t; continue; }
      st.seg.hits++; st.slowUntil = t + 1200; st.invulnUntil = t + 1400; st.shake = 0.35; o.smash = t;
      snd('boom'); try { if (navigator.vibrate) navigator.vibrate(120); } catch {}
      floatText(st, '-20', '#ff6b6b');
      showBanner(st, o.type === 'hurdle' ? '쿵! 허들은 점프(↑)로 넘어요' : o.type === 'bar' ? '쾅! 막대는 숙이기(↓)로 지나가요' : o.type === 'barrel' ? '데굴데굴! 통은 점프로 피해요' : '꽝! 상자는 옆 줄로 피해요', 'bad');
    }
    st.objs = st.objs.filter(o => o.z > st.pz - 6 && !(o.got));
    // 정답 문
    const g = st.gate;
    if (g && !g.passed && st.pz >= g.z) {
      g.passed = true; g.lane = clamp(Math.round(st.px), 0, g.n - 1);
      submitGate(st, g);
    }
    if (g && g.passed && st.pz > g.z + 8 && !st.judging) st.gate = null;
    st.shake = Math.max(0, st.shake - dt);
    for (const p of st.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt; p.life -= dt; }
    st.parts = st.parts.filter(p => p.life > 0);
  }

  function submitGate(st, g) {
    const q = st.curQ; if (!q || q.id !== g.qid) return;
    st.judging = true;
    st.wait.textContent = '판정 중…'; st.wait.classList.add('on');
    const meta = { hits: st.seg.hits, dodges: st.seg.dodges, coins: st.seg.coins, dist: Math.round(st.seg.dist) };
    st.seg = { hits: 0, dodges: 0, coins: 0, dist: 0 };
    const K = kit(); const send = st.send;
    const p = K.act ? K.act(send, 'runAnswer', { questionId: q.id, answer: g.lane, meta }) : Promise.resolve(send && send('runAnswer', { questionId: q.id, answer: g.lane, meta }));
    Promise.resolve(p).then(r => {
      if (st.dead) return;
      st.judging = false; st.wait.classList.remove('on');
      const res = r && r.result;
      if (res) applyResult(st, res, g); else if (st.view && st.view.result) applyResult(st, st.view.result, g);
      st.needNew = true; st.ansSeq = res ? N(res.seq) : (st.view && st.view.result ? N(st.view.result.seq) : 0);
      if (st.view) syncView(st, st.view);
    }).catch(() => {
      if (st.dead) return;
      st.judging = false; st.wait.classList.remove('on'); st.gate = null; st.curQ = null; st.needNew = false;
      if (st.view) syncView(st, st.view);
    });
  }

  function applyResult(st, r, g) {
    if (r.seq === st.seenSeq) return; st.seenSeq = r.seq;
    const before = st.streak;
    st.streak = N(r.streak); setTier(st);
    if (g) g.result = r.correct ? 'ok' : 'bad';
    if (r.correct) {
      st.gateFlash = { col: '#40c057', until: performance.now() + 900 };
      judge(st, st.streak >= 5 && st.streak % 5 === 0 ? '피버 타임!' : '정답 골인!', (N(r.points) >= 0 ? '+' : '') + fmt(r.points), 'good');
      snd('correct'); fx('confetti', { y: 0.55, count: 70 + st.streak * 10, power: 0.8, spread: 70 });
      if (st.streak > before && st.streak >= 2) setTimeout(() => { if (!st.dead) showBanner(st, `연속 ${st.streak}번! 속도 ${st.tier + 1}단계`, 'gold'); }, 700);
      if (st.streak >= 5 && st.streak % 5 === 0) { snd('cheer'); fx('flash', '#ffe066', 260); }
    } else {
      st.gateFlash = { col: '#fa5252', until: performance.now() + 900 };
      const ans = String(r.answerText || '').replace(/^정답:\s*/, '');
      judge(st, '오답이에요', (N(r.points) >= 0 ? '+' : '') + fmt(r.points) + (ans ? `  ·  정답: ${ans}` : ''), 'bad');
      snd('wrong'); st.shake = 0.3; try { if (navigator.vibrate) navigator.vibrate([80, 60, 80]); } catch {}
      if (before >= 2) setTimeout(() => { if (!st.dead) showBanner(st, '속도가 처음으로 돌아갔어요', 'bad'); }, 900);
    }
  }

  function judge(st, big, small, cls) {
    st.judge.replaceChildren(H('strong', {}, big), H('span', {}, small));
    st.judge.className = 'ar-runner-judge show ' + cls;
    clearTimeout(st.judgeT); st.judgeT = setTimeout(() => { if (!st.dead) st.judge.className = 'ar-runner-judge'; }, 1700);
  }
  function showBanner(st, text, cls) {
    st.banner.textContent = text; st.banner.className = 'ar-runner-banner show ' + (cls || '');
    clearTimeout(st.bannerT); st.bannerT = setTimeout(() => { if (!st.dead) st.banner.className = 'ar-runner-banner'; }, 1600);
  }
  function floatText(st, text, col) { st.parts.push({ text, col, x: st.W / 2, y: st.H * 0.62, vx: 0, vy: -160, life: 0.9, big: true }); }
  function burst(st, kind) {
    if (reduced()) return;
    const n = kind === 'coin' ? 6 : 4;
    for (let i = 0; i < n; i++) st.parts.push({ x: st.W / 2 + (Math.random() - 0.5) * 30, y: st.H * 0.7, vx: (Math.random() - 0.5) * 220, vy: -200 - Math.random() * 160, life: 0.6, col: kind === 'coin' ? '#ffd43b' : '#a5d8ff', r: 4 });
  }

  // ---------- 그리기 ----------
  function cam(st) {
    const W = st.W, Hh = st.H, n = st.lanes;
    const ctrl = st.controls ? st.controls.offsetHeight + 18 : 90;
    const feetY = Math.min(Hh * 0.86, Hh - ctrl - 10);
    const topH = st.topBox ? st.topBox.offsetHeight + 8 : 0;
    const horizon = Math.max(Hh * 0.3, Math.min(Hh * 0.42, topH + 30));
    const s0 = Math.min((W * 0.92) / (n * LANE_W + 0.8), (feetY - horizon) / 2.2);
    const camH = (feetY - horizon) / s0;
    const F = s0 * CAM_BACK;
    const camX = (st.px - (n - 1) / 2) * LANE_W * 0.35;
    return { W, H: Hh, n, horizon, F, camH, camX, s0, feetY };
  }
  function proj(c, wx, dz, h) { // dz: 플레이어 기준 앞 거리
    const d = dz + CAM_BACK; if (d < 0.6) return null;
    const s = c.F / d;
    return { x: c.W / 2 + (wx - c.camX) * s, y: c.horizon + (c.camH - (h || 0)) * s, s };
  }
  const laneX = (c, l) => (l - (c.n - 1) / 2) * LANE_W;

  function draw(st, t) {
    const ctx = st.ctx; if (!ctx) return;
    const c = cam(st); const dpr = st.dpr || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let sx = 0, sy = 0; if (st.shake > 0 && !reduced()) { sx = (Math.random() - 0.5) * 14 * st.shake; sy = (Math.random() - 0.5) * 10 * st.shake; }
    ctx.save(); ctx.translate(sx, sy);
    // 하늘
    const fever = st.fever;
    const sky = ctx.createLinearGradient(0, 0, 0, c.horizon);
    if (fever) { const hu = (t / 20) % 360; sky.addColorStop(0, `hsl(${hu},80%,55%)`); sky.addColorStop(1, `hsl(${(hu + 60) % 360},90%,75%)`); }
    else { sky.addColorStop(0, '#4dabf7'); sky.addColorStop(1, '#d0ebff'); }
    ctx.fillStyle = sky; ctx.fillRect(-20, -20, c.W + 40, c.horizon + 22);
    // 구름, 언덕
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    for (let i = 0; i < 5; i++) { const x = ((i * 260 - st.pz * 2) % (c.W + 300) + c.W + 300) % (c.W + 300) - 150; const y = c.horizon * (0.25 + (i % 3) * 0.18); cloud(ctx, x, y, 26 + (i % 2) * 12); }
    ctx.fillStyle = '#69db7c';
    ctx.beginPath(); ctx.moveTo(0, c.horizon);
    for (let x = 0; x <= c.W; x += 20) ctx.lineTo(x, c.horizon - 18 - 14 * Math.sin(x / 70 + st.pz * 0.01) - 8 * Math.sin(x / 23));
    ctx.lineTo(c.W, c.horizon); ctx.closePath(); ctx.fill();
    // 잔디
    const gr = ctx.createLinearGradient(0, c.horizon, 0, c.H); gr.addColorStop(0, '#8ce99a'); gr.addColorStop(1, '#2f9e44');
    ctx.fillStyle = gr; ctx.fillRect(-20, c.horizon, c.W + 40, c.H - c.horizon + 20);
    // 트랙 띠
    const half = (c.n * LANE_W) / 2 + 0.5;
    const z0 = Math.floor((st.pz - 4) / 4) * 4;
    for (let z = z0 + VIEW_D; z >= z0; z -= 4) {
      const a = proj(c, -half, z - st.pz, 0), b = proj(c, half, z - st.pz, 0), a2 = proj(c, -half, z + 4 - st.pz, 0), b2 = proj(c, half, z + 4 - st.pz, 0);
      if (!a || !a2) continue;
      ctx.fillStyle = ((z / 4) & 1) ? '#f08c4a' : '#e8773a';
      if (fever) ctx.fillStyle = ((z / 4) & 1) ? '#cc5de8' : '#9775fa';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(a2.x, a2.y); ctx.closePath(); ctx.fill();
      // 연석
      ctx.fillStyle = ((z / 4) & 1) ? '#fff' : '#e03131';
      const k1 = proj(c, -half - 0.35, z - st.pz, 0), k2 = proj(c, -half - 0.35, z + 4 - st.pz, 0), m1 = proj(c, half + 0.35, z - st.pz, 0), m2 = proj(c, half + 0.35, z + 4 - st.pz, 0);
      ctx.beginPath(); ctx.moveTo(k1.x, k1.y); ctx.lineTo(a.x, a.y); ctx.lineTo(a2.x, a2.y); ctx.lineTo(k2.x, k2.y); ctx.fill();
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(m1.x, m1.y); ctx.lineTo(m2.x, m2.y); ctx.lineTo(b2.x, b2.y); ctx.fill();
      // 줄 표시
      if (((z / 4) & 1) === 0) {
        ctx.strokeStyle = 'rgba(255,255,255,.75)';
        for (let l = 1; l < c.n; l++) { const lx = laneX(c, l) - LANE_W / 2; const p1 = proj(c, lx, z - st.pz, 0), p2 = proj(c, lx, z + 2 - st.pz, 0); ctx.lineWidth = Math.max(1, 0.12 * p1.s); ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke(); }
      }
      // 옆 깃발
      if (z % 12 === 0) for (const side of [-1, 1]) { const p = proj(c, side * (half + 1.4), z - st.pz, 0); if (p) flagPost(ctx, p, ['#e21b3c', '#1368ce', '#d89e00', '#26890c'][(z / 12) & 3]); }
    }
    // 물체 (멀리부터)
    const list = st.objs.filter(o => o.z - st.pz > -CAM_BACK + 0.8 && o.z - st.pz < VIEW_D).sort((a, b) => b.z - a.z);
    let playerDrawn = false;
    const gate = st.gate && !st.gate.passedFar ? st.gate : null;
    const items = list.map(o => ({ z: o.z, o }));
    if (gate) items.push({ z: gate.z, gate });
    items.sort((a, b) => b.z - a.z);
    for (const it of items) {
      if (!playerDrawn && it.z < st.pz) { drawPlayer(st, c, t); playerDrawn = true; }
      if (it.gate) drawGate(st, c, it.gate, t); else drawObj(st, c, it.o, t);
    }
    if (!playerDrawn) drawPlayer(st, c, t);
    // 입자
    for (const p of st.parts) {
      ctx.globalAlpha = clamp(p.life / 0.6, 0, 1);
      if (p.text) { ctx.font = '900 34px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 5; ctx.strokeStyle = '#000'; ctx.strokeText(p.text, p.x, p.y); ctx.fillStyle = p.col; ctx.fillText(p.text, p.x, p.y); }
      else { ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
    // 속도선
    if ((st.tier >= 3 || fever) && !reduced()) {
      ctx.strokeStyle = fever ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.3)'; ctx.lineWidth = 2;
      for (let i = 0; i < (fever ? 14 : 7); i++) { const a = (i * 2.4 + t / 90) % 6.283; const r1 = c.W * 0.35 + ((t / 3 + i * 97) % 120); ctx.beginPath(); ctx.moveTo(c.W / 2 + Math.cos(a) * r1, c.H * 0.5 + Math.sin(a) * r1 * 0.6); ctx.lineTo(c.W / 2 + Math.cos(a) * (r1 + 60), c.H * 0.5 + Math.sin(a) * (r1 + 60) * 0.6); ctx.stroke(); }
    }
    if (t < st.slowUntil) { ctx.fillStyle = 'rgba(255,0,0,' + (0.12 + 0.08 * Math.sin(t / 60)) + ')'; ctx.fillRect(0, 0, c.W, c.H); }
    ctx.restore();
  }
  function cloud(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.arc(x + r, y + 4, r * 0.8, 0, 6.283); ctx.arc(x - r, y + 6, r * 0.7, 0, 6.283); ctx.fill(); }
  function flagPost(ctx, p, col) {
    const h = 3.2 * p.s; ctx.strokeStyle = '#495057'; ctx.lineWidth = Math.max(1, 0.12 * p.s);
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - h); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(p.x, p.y - h); ctx.lineTo(p.x + 0.9 * p.s, p.y - h + 0.3 * p.s); ctx.lineTo(p.x, p.y - h + 0.6 * p.s); ctx.fill();
  }
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function shadow(ctx, p, w) { ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, w * p.s * 0.5, w * p.s * 0.14, 0, 0, 6.283); ctx.fill(); }

  function drawObj(st, c, o, t) {
    const ctx = st.ctx; const wx = laneX(c, o.lane); const dz = o.z - st.pz;
    const p = proj(c, wx, dz, 0); if (!p) return;
    const s = p.s; const w = LANE_W * 0.86 * s;
    const fade = clamp((VIEW_D - dz) / 12, 0, 1); ctx.globalAlpha = fade;
    if (o.smash && !reduced()) ctx.globalAlpha = fade * clamp(1 - (t - o.smash) / 400, 0.2, 1);
    if (o.type === 'hurdle') {
      shadow(ctx, p, LANE_W * 0.8);
      const top = p.y - 0.6 * s;
      ctx.fillStyle = '#868e96'; ctx.fillRect(p.x - w / 2, top, 0.12 * s, 0.6 * s); ctx.fillRect(p.x + w / 2 - 0.12 * s, top, 0.12 * s, 0.6 * s);
      const bh = 0.22 * s; for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#fff' : '#e03131'; ctx.fillRect(p.x - w / 2 + (w / 6) * i, top, w / 6 + 0.5, bh); }
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1; ctx.strokeRect(p.x - w / 2, top, w, bh);
      if (dz < 22 && dz > 4) hint(ctx, p.x, top - 0.5 * s, s, '점프', '#e03131');
    } else if (o.type === 'bar') {
      const lo = 1.15, hi = 1.55;
      ctx.fillStyle = '#495057'; ctx.fillRect(p.x - w / 2 - 0.1 * s, p.y - 2.4 * s, 0.14 * s, 2.4 * s); ctx.fillRect(p.x + w / 2 - 0.04 * s, p.y - 2.4 * s, 0.14 * s, 2.4 * s);
      const y1 = p.y - hi * s, bh = (hi - lo) * s;
      for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#212529' : '#fcc419'; ctx.fillRect(p.x - w / 2 + (w / 8) * i, y1, w / 8 + 0.5, bh); }
      ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(p.x - w / 2, p.y - 0.04 * s, w, 0.08 * s);
      if (dz < 22 && dz > 4) hint(ctx, p.x, y1 - 0.4 * s, s, '숙이기', '#f08c00');
    } else if (o.type === 'block') {
      shadow(ctx, p, LANE_W);
      const h = 1.8 * s; const x = p.x - w / 2, y = p.y - h;
      ctx.fillStyle = '#b97a3c'; rr(ctx, x, y, w, h, 0.1 * s); ctx.fill();
      ctx.strokeStyle = '#7f4f24'; ctx.lineWidth = Math.max(1, 0.1 * s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.moveTo(x + w, y); ctx.lineTo(x, y + h); ctx.stroke();
      ctx.fillStyle = '#d9a066'; ctx.fillRect(x + w * 0.08, y + h * 0.42, w * 0.84, h * 0.16);
    } else if (o.type === 'barrel') {
      shadow(ctx, p, LANE_W * 0.7);
      const r = 0.45 * s; const cy = p.y - r; const rot = (st.pz + o.z) * 1.7;
      ctx.fillStyle = '#a0522d'; rr(ctx, p.x - w * 0.42, cy - r, w * 0.84, r * 2, r * 0.6); ctx.fill();
      ctx.strokeStyle = '#5c2e12'; ctx.lineWidth = Math.max(1, 0.08 * s);
      for (let i = 0; i < 3; i++) { const yy = cy - r + ((i / 3 + rot * 0.15) % 1) * 2 * r; ctx.beginPath(); ctx.moveTo(p.x - w * 0.42, yy); ctx.lineTo(p.x + w * 0.42, yy); ctx.stroke(); }
      if (dz < 24 && dz > 4) hint(ctx, p.x, cy - r - 0.5 * s, s, '점프', '#e03131');
    } else if (o.type === 'coin') {
      const h = o.h || 0.8; const cy = p.y - h * s; const r = 0.32 * s; const sq = Math.abs(Math.cos(t / 180 + o.z));
      ctx.fillStyle = '#fab005'; ctx.beginPath(); ctx.ellipse(p.x, cy, Math.max(1, r * sq), r, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#ffe066'; ctx.beginPath(); ctx.ellipse(p.x, cy, Math.max(0.5, r * sq * 0.6), r * 0.6, 0, 0, 6.283); ctx.fill();
    } else if (o.type === 'shield' || o.type === 'magnet') {
      const cy = p.y - 1.0 * s - Math.sin(t / 200) * 0.15 * s; const r = 0.42 * s;
      ctx.fillStyle = o.type === 'shield' ? 'rgba(77,171,247,.35)' : 'rgba(255,107,107,.35)'; ctx.beginPath(); ctx.arc(p.x, cy, r * 1.35, 0, 6.283); ctx.fill();
      ctx.fillStyle = o.type === 'shield' ? '#1c7ed6' : '#e03131';
      if (o.type === 'shield') { ctx.beginPath(); ctx.moveTo(p.x, cy - r); ctx.lineTo(p.x + r * 0.85, cy - r * 0.6); ctx.lineTo(p.x + r * 0.7, cy + r * 0.3); ctx.lineTo(p.x, cy + r); ctx.lineTo(p.x - r * 0.7, cy + r * 0.3); ctx.lineTo(p.x - r * 0.85, cy - r * 0.6); ctx.closePath(); ctx.fill(); }
      else { ctx.lineWidth = r * 0.45; ctx.strokeStyle = '#e03131'; ctx.beginPath(); ctx.arc(p.x, cy, r * 0.6, 0, Math.PI); ctx.stroke(); ctx.fillStyle = '#ced4da'; ctx.fillRect(p.x - r * 0.83, cy - r * 0.5, r * 0.45, r * 0.5); ctx.fillRect(p.x + r * 0.38, cy - r * 0.5, r * 0.45, r * 0.5); }
    }
    ctx.globalAlpha = 1;
  }
  function hint(ctx, x, y, s, text, col) {
    const fs = clamp(0.38 * s, 10, 22); ctx.font = `900 ${fs}px system-ui, sans-serif`; ctx.textAlign = 'center';
    const w = ctx.measureText(text).width + fs; ctx.fillStyle = col; rr(ctx, x - w / 2, y - fs, w, fs * 1.4, fs * 0.5); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(text, x, y + fs * 0.12);
  }
  function wrapText(ctx, text, maxW, lines) {
    const out = []; let cur = '';
    for (const ch of Array.from(String(text))) { if (ctx.measureText(cur + ch).width > maxW && cur) { out.push(cur); cur = ch; if (out.length >= lines) break; } else cur += ch; }
    if (out.length < lines && cur) out.push(cur);
    if (out.length === lines && Array.from(String(text)).length > out.join('').length) out[lines - 1] = out[lines - 1].slice(0, -1) + '…';
    return out;
  }
  function drawGate(st, c, g, t) {
    const ctx = st.ctx; const dz = g.z - st.pz;
    const flash = st.gateFlash && performance.now() < st.gateFlash.until ? st.gateFlash : null;
    for (let i = 0; i < g.n; i++) {
      const p = proj(c, laneX(c, i), dz, 0); if (!p) continue;
      const s = p.s; const w = LANE_W * 0.94 * s; const top = p.y - 3.5 * s;
      ctx.globalAlpha = clamp((VIEW_D - dz) / 12, 0, 1);
      const col = SHAPE_COLORS[i];
      ctx.fillStyle = col; ctx.fillRect(p.x - w / 2, top, 0.18 * s, 3.5 * s); ctx.fillRect(p.x + w / 2 - 0.18 * s, top, 0.18 * s, 3.5 * s);
      const ph = 1.25 * s;
      ctx.fillStyle = col; rr(ctx, p.x - w / 2, top - 0.1 * s, w, ph, 0.18 * s); ctx.fill();
      if (g.passed && g.lane === i && flash) { ctx.strokeStyle = flash.col; ctx.lineWidth = 0.22 * s; ctx.stroke(); ctx.fillStyle = flash.col; ctx.globalAlpha *= 0.35; ctx.fillRect(p.x - w / 2, top, w, 3.5 * s); ctx.globalAlpha = 1; }
      // 도형
      const ic = 0.3 * s, ix = p.x - w / 2 + 0.45 * s, iy = top + ph / 2 - 0.05 * s;
      ctx.fillStyle = '#fff'; ctx.beginPath();
      if (i === 0) { ctx.moveTo(ix, iy - ic); ctx.lineTo(ix + ic, iy + ic * 0.8); ctx.lineTo(ix - ic, iy + ic * 0.8); }
      else if (i === 1) { ctx.moveTo(ix, iy - ic); ctx.lineTo(ix + ic, iy); ctx.lineTo(ix, iy + ic); ctx.lineTo(ix - ic, iy); }
      else if (i === 2) ctx.arc(ix, iy, ic * 0.9, 0, 6.283);
      else ctx.rect(ix - ic * 0.8, iy - ic * 0.8, ic * 1.6, ic * 1.6);
      ctx.closePath(); ctx.fill();
      // 글
      const fs = clamp(0.36 * s, 8, 30); ctx.font = `800 ${fs}px system-ui, sans-serif`; ctx.textAlign = 'left';
      const tw = w - 1.0 * s; const ls = wrapText(ctx, g.choices[i], tw, 2);
      ctx.fillStyle = '#fff'; ls.forEach((ln, k) => ctx.fillText(ln, p.x - w / 2 + 0.85 * s, top + ph / 2 + (k - (ls.length - 1) / 2) * fs * 1.1 + fs * 0.32));
      // 문 안쪽 빛
      const gl = ctx.createLinearGradient(0, top + ph, 0, p.y); gl.addColorStop(0, 'rgba(255,255,255,.35)'); gl.addColorStop(1, 'rgba(255,255,255,.05)');
      ctx.fillStyle = gl; ctx.fillRect(p.x - w / 2 + 0.18 * s, top + ph, w - 0.36 * s, p.y - top - ph);
      ctx.globalAlpha = 1;
    }
    if (dz > 0 && dz < 60) {
      const p = proj(c, 0, dz, 4.3); if (p) { const fs = clamp(0.5 * p.s, 10, 30); ctx.font = `900 ${fs}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.strokeText('정답 문으로 골인!', p.x, p.y); ctx.fillStyle = '#fff'; ctx.fillText('정답 문으로 골인!', p.x, p.y); }
    }
  }
  function drawPlayer(st, c, t) {
    const ctx = st.ctx; const wx = (st.px - (c.n - 1) / 2) * LANE_W;
    const p = proj(c, wx, 0, 0); if (!p) return;
    const s = p.s; const ducking = t < st.duckUntil && st.y < 0.15;
    const blink = t < st.invulnUntil && Math.floor(t / 90) % 2 === 0;
    shadow(ctx, p, 1.1);
    const feet = p.y - st.y * s; const run = st.y > 0 ? 0 : Math.sin(st.runT * 16);
    const A = clamp(1.7 * s, 58, 150); const bodyH = ducking ? A * 0.25 : A * 0.5;
    if (blink) ctx.globalAlpha = 0.35;
    // 피버 꼬리
    if (st.fever && !reduced()) { for (let i = 0; i < 6; i++) { ctx.fillStyle = `hsla(${(t / 5 + i * 50) % 360},90%,60%,${0.5 - i * 0.07})`; ctx.beginPath(); ctx.arc(p.x, feet - bodyH * 0.5 + i * 7, A * 0.35 - i * 3, 0, 6.283); ctx.fill(); } }
    // 다리
    ctx.strokeStyle = '#343a40'; ctx.lineWidth = Math.max(3, A * 0.09); ctx.lineCap = 'round';
    const hip = feet - bodyH * 0.55;
    if (!ducking) {
      ctx.beginPath(); ctx.moveTo(p.x - A * 0.1, hip); ctx.lineTo(p.x - A * 0.12 - run * A * 0.12, feet); ctx.moveTo(p.x + A * 0.1, hip); ctx.lineTo(p.x + A * 0.12 + run * A * 0.12, feet); ctx.stroke();
    }
    // 몸통
    ctx.fillStyle = st.fever ? `hsl(${(t / 4) % 360},80%,55%)` : '#ff922b';
    rr(ctx, p.x - A * 0.22, hip - bodyH * 0.6, A * 0.44, bodyH * 0.75, A * 0.12); ctx.fill();
    // 머리(캐릭터)
    const me = (st.view && st.view.me) || {};
    const rec = avatarImage(me.avatar, me.nickname);
    const hy = (ducking ? hip - A * 0.3 : hip - bodyH * 0.55 - A * 0.42) - (st.y > 0 ? 0 : Math.abs(run) * A * 0.03);
    if (rec.ok && rec.img.complete && rec.img.naturalWidth) ctx.drawImage(rec.img, p.x - A * 0.45, hy - A * 0.45, A * 0.9, A * 0.9);
    else { ctx.fillStyle = '#845ef7'; ctx.beginPath(); ctx.arc(p.x, hy, A * 0.42, 0, 6.283); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = `900 ${A * 0.4}px system-ui`; ctx.textAlign = 'center'; ctx.fillText(Array.from(rec.name || '?')[0] || '?', p.x, hy + A * 0.14); }
    if (st.shieldOn) { ctx.strokeStyle = 'rgba(77,171,247,.9)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(p.x, hy + A * 0.2, A * 0.75, 0, 6.283); ctx.stroke(); ctx.fillStyle = 'rgba(77,171,247,.15)'; ctx.fill(); }
    if (t < st.magnetUntil) { ctx.strokeStyle = 'rgba(255,107,107,.7)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, hy + A * 0.2, A * 0.9 + Math.sin(t / 120) * 4, 0, 6.283); ctx.stroke(); ctx.setLineDash([]); }
    ctx.globalAlpha = 1;
  }

  function hud(st) {
    const v = st.view || {}; const me = v.me || {};
    const score = N(me.score);
    if (st.scoreShown !== score) { st.scoreShown = score; st.hudScore.textContent = fmt(score); st.hudScore.parentNode.classList.remove('bump'); void st.hudScore.offsetWidth; st.hudScore.parentNode.classList.add('bump'); }
    const set = (n, val) => { const s = String(val); if (n.textContent !== s) n.textContent = s; };
    set(st.hudSpeed, st.tier + 1); set(st.hudStreak, st.streak); set(st.hudCoins, st.totals.coins); set(st.hudDist, fmt(st.totals.dist));
    const w = ((st.tier + 1) / 6 * 100).toFixed(0) + '%'; if (st.speedBar.style.width !== w) st.speedBar.style.width = w;
    st.stage.classList.toggle('fever', !!st.fever);
    const ht = (st.topBox.offsetHeight + 14) + 'px'; if (st.hud.style.top !== ht) st.hud.style.top = ht;
    const t = performance.now();
    const pw = [st.shieldOn ? '방패' : '', t < st.magnetUntil ? `자석 ${Math.ceil((st.magnetUntil - t) / 1000)}초` : '', st.fever ? '피버 타임' : '', t < st.slowUntil ? '느려짐' : ''].filter(Boolean).join(' · ');
    if (st.power.textContent !== pw) st.power.textContent = pw;
  }

  // ======================================================================
  // 진행자 화면: 실시간 경주판
  // ======================================================================
  function host(root, view) {
    const s = (view && view.modeState) || {};
    const players = Array.isArray(s.players) ? s.players : [];
    const st = prep(root, 'runner-host', ['ar-runner-h'], (st, r) => {
      st.title = H('div', { class: 'ar-runner-htitle' }, H('strong', {}, '퀴즈 런 실시간 경주판'), H('span', { class: 'ar-runner-hsub' }, ''));
      st.list = H('div', { class: 'ar-runner-hlist' });
      st.pop = H('div', { class: 'ar-runner-hpop', 'aria-live': 'polite' });
      st.keys = keyGuide(true);
      r.append(H('div', { class: 'ar-runner-hbg', 'aria-hidden': 'true' }), st.title, st.keys, st.list, st.pop);
      st.rows = new Map(); st.prev = new Map(); st.leader = null;
    });
    const sorted = players.slice().sort((a, b) => N(a.rank || 999) - N(b.rank || 999) || N(b.score) - N(a.score));
    const maxDist = Math.max(100, ...sorted.map(p => N(p.dist)));
    const totalDist = sorted.reduce((a, p) => a + N(p.dist), 0);
    const ans = sorted.reduce((a, p) => a + N(p.answered), 0), cor = sorted.reduce((a, p) => a + N(p.correct), 0);
    st.title.lastChild.textContent = `참가 ${sorted.length}명 · 반 전체 ${fmt(totalDist)}m 달림` + (ans ? ` · 정답률 ${Math.round(cor / ans * 100)}%` : '');
    const box = root.getBoundingClientRect();
    const cols = sorted.length > 10 && box.width > 640 ? 2 : 1;
    const perCol = Math.ceil(Math.max(1, sorted.length) / cols);
    const avail = Math.max(120, (box.height || 400) - 70);
    const rowH = clamp(Math.floor(avail / Math.max(1, perCol)), 30, 56);
    const shown = sorted.slice(0, cols * Math.max(1, Math.floor(avail / rowH)));
    st.list.style.setProperty('--rh', rowH + 'px'); st.list.style.setProperty('--cols', cols);
    const keep = new Set();
    shown.forEach((p, i) => {
      keep.add(p.id);
      let row = st.rows.get(p.id);
      if (!row) {
        row = { el: H('div', { class: 'ar-runner-row new' }) };
        row.rank = H('span', { class: 'ar-runner-rank' }); row.av = H('span', { class: 'ar-runner-av' }); row.name = H('span', { class: 'ar-runner-name' });
        row.streak = H('span', { class: 'ar-runner-streak' }); row.hits = H('span', { class: 'ar-runner-hits' });
        row.runner = H('span', { class: 'ar-runner-dot' }); row.bar = H('span', { class: 'ar-runner-bar' }, H('span', { class: 'ar-runner-barfill' }), row.runner);
        row.score = H('span', { class: 'ar-runner-score' });
        row.el.append(row.rank, row.av, H('span', { class: 'ar-runner-mid' }, H('span', { class: 'ar-runner-nl' }, row.name, row.streak, row.hits), row.bar), row.score);
        st.list.append(row.el); st.rows.set(p.id, row);
        setTimeout(() => row.el.classList.remove('new'), 600);
      }
      const avKey = JSON.stringify(p.avatar || null);
      if (row.avKey !== avKey) { row.avKey = avKey; row.av.replaceChildren(avatarNode(p.avatar, Math.round(rowH * 0.78), p.nickname)); }
      const col = Math.floor(i / perCol), ri = i % perCol;
      row.el.style.transform = `translate(${col * 100}%, ${ri * rowH}px)`;
      row.el.style.width = `calc(${100 / cols}% - 8px)`;
      row.el.className = 'ar-runner-row' + (i < 3 ? ' top' + (i + 1) : '') + (N(p.streak) >= 5 ? ' fever' : '');
      row.rank.textContent = String(i + 1);
      row.name.textContent = p.nickname || '';
      row.streak.textContent = N(p.streak) >= 2 ? `연속 ${N(p.streak)}` : '';
      row.streak.hidden = N(p.streak) < 2;
      row.hits.textContent = N(p.hits) ? `충돌 ${N(p.hits)}` : '';
      row.hits.hidden = !N(p.hits);
      const pct = clamp(N(p.dist) / maxDist * 100, 2, 100);
      row.bar.firstChild.style.width = pct + '%'; row.runner.style.left = pct + '%';
      const prev = st.prev.get(p.id);
      if (prev) {
        if (prev.rank > i + 1) { row.el.classList.add('up'); }
        if (N(p.score) !== prev.score) countUp(row.score, prev.score, N(p.score));
        if (N(p.streak) >= 5 && N(p.streak) % 5 === 0 && prev.streak !== N(p.streak)) popup(st, `${p.nickname} 피버 타임! ${N(p.streak)}연속 정답`);
      } else row.score.textContent = fmt(p.score);
      st.prev.set(p.id, { rank: i + 1, score: N(p.score), streak: N(p.streak) });
    });
    for (const [id, row] of st.rows) if (!keep.has(id)) { row.el.remove(); st.rows.delete(id); }
    const lead = sorted[0];
    if (lead && N(lead.score) > 0 && st.leader && st.leader !== lead.id && view.phase === 'running') popup(st, `선두 교체! ${lead.nickname}`);
    if (lead && N(lead.score) > 0) st.leader = lead.id;
    if (!sorted.length) st.list.replaceChildren(H('p', { class: 'ar-runner-empty' }, '곧 친구들이 달리기 시작해요')), st.rows.clear();
  }
  function countUp(el, from, to) {
    if (reduced()) { el.textContent = fmt(to); return; }
    const t0 = performance.now(); el.classList.toggle('down', to < from); el.classList.add('chg');
    const f = t => { const k = Math.min(1, (t - t0) / 700); el.textContent = fmt(from + (to - from) * k); if (k < 1) requestAnimationFrame(f); else setTimeout(() => el.classList.remove('chg', 'down'), 400); };
    requestAnimationFrame(f);
  }
  function popup(st, text) {
    const p = H('div', { class: 'ar-runner-hpopi' }, text); st.pop.append(p);
    while (st.pop.children.length > 2) st.pop.firstChild.remove();
    setTimeout(() => p.remove(), 2600); snd('sparkle');
  }

  KQ.arena.runner = {
    host(root, view, send) { try { host(root, view || {}, send); } catch (e) { console.warn('[퀴즈 런 진행자]', e); } },
    player(root, view, send) { try { player(root, view || {}, send); } catch (e) { console.warn('[퀴즈 런 학생]', e); } }
  };
})();
