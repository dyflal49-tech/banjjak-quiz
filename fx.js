'use strict';
// 반짝퀴즈 fx.js: 배경음악(WebAudio 합성), 추가 효과음, 화면 효과, 캐릭터(아바타), QR 코드
(() => {
  const KQ = window.KQ;
  if (!KQ || KQ.fx) return;
  const sound = KQ.sound;
  const store = {
    get(k) { try { return window.localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { window.localStorage.setItem(k, v); } catch {} }
  };
  const rand = (a, b) => a + Math.random() * (b - a);
  const ri = n => Math.floor(Math.random() * n);
  const pick = arr => arr[ri(arr.length)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduced = () => !!(mq && mq.matches);

  function shade(hex, amt) {
    let h = String(hex).replace('#', '');
    if (h.length === 3) h = h.split('').map(x => x + x).join('');
    const n = parseInt(h, 16) || 0;
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const t = amt < 0 ? 0 : 255, p = Math.min(1, Math.abs(amt));
    r = Math.round(r + (t - r) * p); g = Math.round(g + (t - g) * p); b = Math.round(b + (t - b) * p);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }

  /* =====================================================================
   * 오디오 공통
   * ===================================================================== */
  function actx() {
    if (!sound.ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      try { sound.ctx = new C(); } catch { return null; }
    }
    const c = sound.ctx;
    if (c.state === 'suspended') c.resume().catch(() => {});
    return c;
  }
  const unlock = () => { const c = sound.ctx; if (c && c.state === 'suspended') c.resume().catch(() => {}); };
  ['pointerdown', 'keydown', 'touchstart'].forEach(t => document.addEventListener(t, unlock, { capture: true, passive: true }));

  let noiseBuf = null;
  function noise(c) {
    if (!noiseBuf || noiseBuf.sampleRate !== c.sampleRate) {
      const n = c.sampleRate * 2;
      noiseBuf = c.createBuffer(1, n, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  // 한 음 합성: o = {w 파형, v 볼륨, a 어택, r 릴리즈, sus 서스테인 비율, lp 로우패스, q, fenv 필터 엔벨로프 배수, det 디튠(센트), vib 비브라토(센트), glide 시작 주파수 배수}
  function voice(c, out, t, freq, dur, o = {}) {
    const v = o.v ?? 0.06, a = o.a ?? 0.008, r = o.r ?? 0.12;
    const g = c.createGain();
    const hold = t + Math.max(dur, a + 0.01);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v * (o.sus ?? 0.7)), Math.max(t + a + 0.005, hold));
    g.gain.exponentialRampToValueAtTime(0.0001, hold + r);
    let input = g;
    if (o.lp) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass'; f.Q.value = o.q ?? 0.7;
      if (o.fenv) { f.frequency.setValueAtTime(Math.min(18000, o.lp * o.fenv), t); f.frequency.exponentialRampToValueAtTime(o.lp, t + (o.fdt ?? 0.18)); }
      else f.frequency.value = o.lp;
      f.connect(g); input = f;
    }
    const end = hold + r + 0.05;
    const dets = o.det ? [-o.det, o.det] : [0];
    let lfo = null, lg = null;
    if (o.vib) { lfo = c.createOscillator(); lfo.frequency.value = 5.2; lg = c.createGain(); lg.gain.value = o.vib; lfo.connect(lg); lfo.start(t); lfo.stop(end); }
    for (const d of dets) {
      const osc = c.createOscillator();
      osc.type = o.w || 'triangle';
      if (o.glide) { osc.frequency.setValueAtTime(freq * o.glide, t); osc.frequency.exponentialRampToValueAtTime(freq, t + (o.gdt ?? 0.05)); }
      else osc.frequency.setValueAtTime(freq, t);
      osc.detune.value = d;
      if (lg) lg.connect(osc.detune);
      osc.connect(input); osc.start(t); osc.stop(end);
    }
    g.connect(out);
    return g;
  }
  function noiseHit(c, out, t, o) {
    const s = c.createBufferSource(); s.buffer = noise(c); s.loop = true;
    const f = c.createBiquadFilter(); f.type = o.type || 'highpass'; f.Q.value = o.q ?? 0.7;
    f.frequency.setValueAtTime(o.f || 6000, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + (o.fd || o.d));
    const g = c.createGain(); const a = o.a || 0.002;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + o.d);
    s.connect(f).connect(g).connect(out); s.start(t, Math.random() * 0.5); s.stop(t + a + o.d + 0.05);
    return g;
  }
  function kick(c, out, t, v = 0.13, f0 = 150, f1 = 45, d = 0.28) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + Math.min(0.12, d * 0.5));
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(out); o.start(t); o.stop(t + d + 0.03);
  }
  const hat = (c, out, t, v, open) => noiseHit(c, out, t, { type: 'highpass', f: 7000, v, d: open ? 0.16 : 0.035 });
  function snare(c, out, t, v = 0.05, d = 0.13) {
    noiseHit(c, out, t, { type: 'bandpass', f: 1900, q: 0.8, v, d });
    voice(c, out, t, 190, 0.02, { w: 'triangle', v: v * 0.7, a: 0.002, r: 0.06, sus: 0.4 });
  }

  /* =====================================================================
   * 배경음악 곡 데이터
   *  mel: 마디별 문자열(한 칸 = 한 스텝), '0'~'F' 음계 도수, '-' 늘임, '.' 쉼
   *  bass: 1 근음 3 3음 5 5음 7 7음 8 옥타브 / arp: 0~6 화음 구성음 / comp: x 화음 짧게
   *  k/s/h: 킥/스네어/하이햇 (x 보통, X 강하게, o 열린 햇)
   * ===================================================================== */
  const MAJ = [0, 2, 4, 5, 7, 9, 11], MIN = [0, 2, 3, 5, 7, 8, 10], HAR = [0, 2, 3, 5, 7, 8, 11], DOR = [0, 2, 3, 5, 7, 9, 10], LYD = [0, 2, 4, 6, 7, 9, 11];
  const TRACKS = {
    lobby: { // 대기실 그루브: D 도리안, 스윙, 부드러운 건반
      bpm: 100, key: 62, scale: DOR, swing: 0.16, seventh: true,
      chords: [0, 3, 0, 3, 0, 3, 4, 3],
      mel: ['7.6.4...2.4.....', '5.4.3...1.3.....', '7.6.4...9.7.6.4.', '3-------........', '4.4.6.4.7...6.4.', '5.3.5.7.8---7...', '8.6.4.6.8-------', '7...5...3...1...'],
      bass: '1..1..5.8..1.5..', k: 'x......x..x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.',
      comp: '...x..x....x..x.', compI: { w: 'triangle', v: 0.018, r: 0.12, leg: 0.5, o: -1 },
      lead: { w: 'triangle', v: 0.065, r: 0.2, leg: 0.8, vib: 6 }, bassI: { w: 'triangle', v: 0.1, r: 0.08, leg: 0.7 }, dv: 0.8
    },
    classic: { // 경쾌한 퀴즈쇼: C 장조, 통통 튀는 스퀘어
      bpm: 132, key: 60, scale: MAJ,
      chords: [0, 5, 3, 4, 0, 5, 1, 4],
      mel: ['4.4.7.4.9.7.4...', '5.5.9.5.7---....', '3.5.7.5.3.5.7.8.', '8-------6.4.1...', '4.4.7.4.9.7.4.7.', '9.9.C.9.7---....', '8.7.8.A.8.7.5.3.', '4.6.8.B.A---....'],
      bass: '1.8.1.8.1.8.5.8.', k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...x.',
      comp: '..x...x...x...x.', compI: { w: 'triangle', v: 0.018, r: 0.05, leg: 0.4, o: 0 },
      lead: { w: 'square', v: 0.03, r: 0.08, leg: 0.75, lp: 3200 }, bassI: { w: 'triangle', v: 0.1, r: 0.06, leg: 0.6 }
    },
    robot: { // 전자음 8비트: A 단조, 빠른 아르페지오
      bpm: 140, key: 57, scale: MIN,
      chords: [0, 5, 2, 6, 0, 5, 3, 4],
      mel: ['7.7.4...7.9.7...', '5.5.2...5.7.9...', '4.4.2...4.6.9...', '6.6.3...8-----..', '7.7.4...7.9.B...', '9.9.7...5.7.9...', 'A.A.7...5.3.5...', 'B---8---6---4---'],
      bass: '1.1.1.1.1.1.5.5.', k: 'x...x...x...x...', s: '....x.......x..x', h: 'x.x.x.x.x.x.x.x.',
      arp: '0124214201242142', arpI: { w: 'square', v: 0.016, r: 0.03, leg: 0.45, o: 1, lp: 2600 },
      lead: { w: 'square', v: 0.026, r: 0.05, leg: 0.6, o: 1, lp: 3800 }, bassI: { w: 'square', v: 0.04, r: 0.04, leg: 0.5, lp: 900 }, dv: 0.8
    },
    marble: { // 통통 튀는: F 장조, 미끄러져 올라가는 짧은 음
      bpm: 118, key: 65, scale: MAJ,
      chords: [0, 3, 4, 0, 0, 3, 1, 4],
      mel: ['4.2.4.2.7...4...', '5.3.5.3.7...5...', '6.4.6.4.8...6...', '7.4.2.0.........', '2.4.7.9.7.4.2.4.', '3.5.7.A.7.5.3.5.', '8.5.3.5.8.5.3.1.', '4.6.8.B.8.6.4...'],
      bass: '1..8..5.1..8..5.', k: 'x.....x.x.......', s: '....x.......x...', h: '..x...x...x...x.',
      arp: '....2.......4...', arpI: { w: 'sine', v: 0.03, r: 0.1, leg: 0.3, o: 1, glide: 0.6, gdt: 0.03, sus: 0.3 },
      lead: { w: 'triangle', v: 0.075, r: 0.1, leg: 0.35, glide: 0.72, gdt: 0.04, sus: 0.35 }, bassI: { w: 'triangle', v: 0.1, r: 0.05, leg: 0.4, glide: 0.8, sus: 0.4 }
    },
    submarine: { // 깊은 바다: A 도리안, 느린 패드와 소나 핑, 메아리
      bpm: 70, key: 57, scale: DOR, ping: true, delay: [0.75, 0.4, 0.35],
      chords: [0, 0, 3, 3, 2, 2, 6, 4],
      mel: ['4-------........', '........2---0---', '5-------........', '........3---7---', '6-------........', '........4---2---', '8-------........', '........6---4---'],
      bass: '1-------5-------', k: 'x...............', s: '................', h: '........x.......',
      pad: { w: 'triangle', v: 0.02, a: 0.7, r: 0.9, lp: 700, o: -1, sus: 0.9 },
      lead: { w: 'sine', v: 0.055, a: 0.08, r: 0.9, leg: 0.9, vib: 12, o: 1 }, bassI: { w: 'triangle', v: 0.09, a: 0.05, r: 0.5, leg: 0.95, lp: 420, sus: 0.8 }, dv: 0.5
    },
    kingdom: { // 중세 행진: Bb 장조, 금관 느낌 톱니파, 행진 스네어
      bpm: 108, key: 58, scale: MAJ,
      chords: [0, 3, 4, 0, 5, 3, 4, 0],
      mel: ['4--24---7-------', '7--57---5---3---', '6--46---8---6---', '7-------4---0---', '5--45---7---9---', 'A--9A---7---5---', '8--68---B---8---', '7-------........'],
      bass: '1...5...1...5...', k: 'x.......x.......', s: '....x.x.....x.xx', h: '................',
      pad: { w: 'sawtooth', v: 0.012, a: 0.12, r: 0.3, lp: 1100, o: -1, sus: 0.8 },
      lead: { w: 'sawtooth', v: 0.032, a: 0.02, r: 0.12, leg: 0.92, lp: 1900, det: 6, o: 1 }, bassI: { w: 'triangle', v: 0.1, r: 0.1, leg: 0.7 }
    },
    space: { // 우주 신스 아르페지오: C 리디안, 메아리
      bpm: 112, key: 60, scale: LYD, delay: [0.75, 0.35, 0.3],
      chords: [0, 0, 1, 1, 5, 5, 4, 4],
      mel: ['9-------7-------', 'B-------........', 'A-------8-------', 'C-------........', '9-------7-------', 'C-----B-9-------', 'B-------8-------', 'D-------........'],
      bass: '1-------1---5---', k: 'x.......x.......', s: '........x.......', h: '..x...x...x...x.',
      arp: '0245024502450245', arpI: { w: 'sawtooth', v: 0.02, r: 0.09, leg: 0.4, lp: 1500, fenv: 3, o: 0 },
      pad: { w: 'sawtooth', v: 0.011, a: 0.5, r: 0.6, lp: 800, det: 8, o: -1, sus: 0.9 },
      lead: { w: 'sine', v: 0.045, a: 0.04, r: 0.6, leg: 0.95, vib: 15, o: 0 }, bassI: { w: 'triangle', v: 0.09, a: 0.02, r: 0.3, leg: 0.9 }, dv: 0.6
    },
    tower: { // 상승하는 밝은: D 장조, 화음이 한 계단씩 올라감
      bpm: 126, key: 62, scale: MAJ,
      chords: [0, 1, 2, 3, 4, 5, 3, 4],
      mel: ['0.2.4.7.4.7.9...', '1.3.5.8.5.8.A...', '2.4.6.9.6.9.B...', '3.5.7.A.7.A.C...', 'B---8---B.C.D...', 'C---9---C.D.E...', 'A.C.E.C.A.C.E.C.', 'B-------D-------'],
      bass: '1.1.1.1.1.1.1.1.', k: 'x...x...x...x...', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.',
      arp: '0123450123450123', arpI: { w: 'triangle', v: 0.022, r: 0.05, leg: 0.5, o: 0 },
      lead: { w: 'square', v: 0.026, r: 0.1, leg: 0.8, lp: 3000, o: 0 }, bassI: { w: 'sawtooth', v: 0.045, r: 0.05, leg: 0.6, lp: 700 }
    },
    treasure: { // 해적 모험: D 화성단음계, 12/8 지그
      bpm: 100, div: 3, steps: 12, key: 62, scale: HAR,
      chords: [0, 0, 3, 4, 0, 5, 3, 4],
      mel: ['0.04.47--4..', '9.97.74--2..', 'A.A7.75--3..', '8.86.64--1..', '7.79.9B--9..', 'C.C9.97--5..', 'A.97.53.57..', '6-----4-----'],
      bass: '1..5..1..5..', k: 'x.....x.....', s: '...x.....x..', h: '..x..x..x..x',
      comp: '.x..x..x..x.', compI: { w: 'square', v: 0.01, r: 0.05, leg: 0.5, lp: 1500, o: -1 },
      lead: { w: 'sawtooth', v: 0.032, r: 0.08, leg: 0.8, lp: 2200, det: 10, vib: 8 }, bassI: { w: 'triangle', v: 0.1, r: 0.08, leg: 0.6 }
    },
    garden: { // 잔잔한 봄: F 장조 3/4 왈츠, 하프 같은 분산화음
      bpm: 92, steps: 12, key: 65, scale: MAJ, delay: [0.5, 0.3, 0.22],
      chords: [0, 3, 0, 4, 5, 3, 4, 0],
      mel: ['4-----2---4-', '5-------3---', '4---7---4---', '8-------6---', '7-----9---7-', 'A-------7---', '8---6---4---', '7-----------'],
      bass: '1.......5...', k: 'x...........', s: '............', h: '....x...x...',
      arp: '0.2.3.4.3.2.', arpI: { w: 'triangle', v: 0.026, r: 0.35, leg: 0.9, o: -1, sus: 0.4 },
      lead: { w: 'sine', v: 0.06, a: 0.05, r: 0.4, leg: 0.95, vib: 10, o: 0 }, bassI: { w: 'sine', v: 0.1, r: 0.3, leg: 0.9 }, dv: 0.45
    },
    boss: { // 웅장한 전투: C 화성단음계, 말발굽 베이스, 두꺼운 톱니파
      bpm: 150, key: 48, scale: HAR,
      chords: [0, 0, 5, 5, 3, 3, 4, 4],
      mel: ['7---7.8.9---7...', 'B---9---8---7---', 'C---C.B.9---7...', '9-------C-------', 'A---A.9.7---5...', '7---5---3---0---', '6---8---B---D---', 'D-------B---8---'],
      bass: '1.11.11.1.11.15.', k: 'x..x..x.x..x..x.', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.',
      pad: { w: 'sawtooth', v: 0.013, a: 0.15, r: 0.3, lp: 1200, det: 7, o: 0, sus: 0.85 },
      lead: { w: 'sawtooth', v: 0.034, r: 0.1, leg: 0.9, lp: 2600, det: 9, o: 1 }, bassI: { w: 'sawtooth', v: 0.05, r: 0.05, leg: 0.6, lp: 600 }
    },
    podium: { // 팡파르 후 축하: Eb 장조, 앞 2마디 팡파르는 한 번만
      bpm: 120, key: 63, scale: MAJ, loopFrom: 2,
      chords: [0, 4, 0, 3, 4, 0, 5, 3, 4, 0],
      mel: ['0--04--47-------', '8--8B--BD-------', '7.9.B.9.7.9.B...', 'A.C.E.C.A---....', 'B.D.B.8.6.8.B...', 'E-------B---9---', 'C.9.7.9.C---....', 'A.7.5.7.A---....', '8.B.D.B.8.6.4...', '7---9---E-------'],
      bass: '1.5.8.5.1.5.8.5.', k: 'x...x...x...x...', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.',
      comp: '..x...x...x...x.', compI: { w: 'triangle', v: 0.016, r: 0.06, leg: 0.4, o: 0 },
      lead: { w: 'sawtooth', v: 0.03, r: 0.1, leg: 0.85, lp: 2600, det: 6, o: 0 }, bassI: { w: 'triangle', v: 0.1, r: 0.06, leg: 0.6 }
    }
  };
  const DIG = '0123456789ABCDEF';
  const degSemi = (scale, d) => scale[d % scale.length] + 12 * Math.floor(d / scale.length);
  const chordOf = (T, deg) => [deg, deg + 2, deg + 4, deg + 6].map(d => degSemi(T.scale, d));
  const holdLen = (str, s) => { let n = 1; while (str[s + n] === '-') n++; return n; };

  /* =====================================================================
   * 배경음악 엔진 (lookahead 스케줄러)
   * ===================================================================== */
  const FADE = 0.4;
  const volStored = parseFloat(store.get('kq-bgm-vol'));
  const bgm = KQ.bgm = {
    enabled: store.get('kq-bgm') !== 'off',
    volume: Number.isFinite(volStored) ? clamp(volStored, 0, 1) : 0.5,
    current: null,
    tracks: Object.keys(TRACKS)
  };
  let master = null, live = null, timer = null, isTense = false;
  const gainFor = v => Math.pow(v, 1.5) * 0.9;
  const audible = () => !!(sound.enabled && bgm.enabled);

  function masterNode(c) {
    if (!master || master.context !== c) {
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      master = c.createGain(); master.gain.value = gainFor(bgm.volume);
      master.connect(comp); comp.connect(c.destination);
    }
    return master;
  }
  function fadeOut(c) {
    if (!live) return;
    const old = live; live = null;
    const now = c.currentTime;
    try {
      const g = old.bus.gain; g.cancelScheduledValues(now);
      g.setValueAtTime(Math.max(0.0001, g.value), now); g.exponentialRampToValueAtTime(0.0001, now + FADE);
    } catch {}
    setTimeout(() => { for (const n of old.nodes) { try { n.disconnect(); } catch {} } }, (FADE + 0.8) * 1000);
  }
  function startTrack(name) {
    const c = actx(); if (!c) return;
    const T = TRACKS[name]; if (!T) return;
    const m = masterNode(c);
    fadeOut(c);
    const now = c.currentTime;
    const bus = c.createGain();
    bus.gain.setValueAtTime(0.0001, now); bus.gain.exponentialRampToValueAtTime(1, now + FADE);
    bus.connect(m);
    const nodes = [bus];
    let input = bus;
    if (T.delay) {
      const inG = c.createGain(), d = c.createDelay(2), fb = c.createGain(), wet = c.createGain();
      d.delayTime.value = Math.min(1.9, T.delay[0] * 60 / T.bpm); fb.gain.value = T.delay[1]; wet.gain.value = T.delay[2];
      inG.connect(bus); inG.connect(d); d.connect(fb); fb.connect(d); d.connect(wet); wet.connect(bus);
      input = inG; nodes.push(inG, d, fb, wet);
    }
    live = { name, T, bus, input, nodes, step: 0, bar: 0, next: now + 0.06 };
    if (!timer) timer = setInterval(tick, 25);
    tick();
  }
  function halt() { const c = sound.ctx; if (c) fadeOut(c); live = null; }
  function tick() {
    if (!live) { clearInterval(timer); timer = null; return; }
    const c = sound.ctx; if (!c) return;
    const ahead = document.hidden ? 1.5 : 0.2; // 숨은 탭은 타이머가 느려질 수 있어 더 멀리 예약
    if (live.next < c.currentTime - 0.05) live.next = c.currentTime + 0.03; // 밀렸으면 다시 맞춤(몰아치기 방지)
    let guard = 0;
    while (live && live.next < c.currentTime + ahead && guard++ < 96) {
      const L = live;
      try { scheduleStep(c, L, L.next); } catch {}
      L.next += stepDur(L.T);
      L.step++;
      if (L.step >= (L.T.steps || 16)) { L.step = 0; L.bar++; if (L.bar >= L.T.chords.length) L.bar = L.T.loopFrom || 0; }
    }
  }
  const stepDur = T => 60 / (T.bpm * (isTense ? 1.15 : 1)) / (T.div || 4);
  function playLine(c, out, str, s, t, sd, inst, midiOf) {
    if (!str || !inst) return;
    const ch = str[s];
    if (!ch || ch === '.' || ch === '-') return;
    const m = midiOf(ch); if (m === null) return;
    const len = holdLen(str, s);
    voice(c, out, t, mtof(m), len * sd * (inst.leg ?? 0.85), inst);
  }
  function scheduleStep(c, L, t0) {
    const T = L.T, s = L.step, b = L.bar, sd = stepDur(T), out = L.input, div = T.div || 4;
    const t = t0 + (T.swing && s % 2 === 1 ? T.swing * sd : 0);
    const chord = chordOf(T, T.chords[b % T.chords.length]);
    const lead = T.lead;
    playLine(c, out, T.mel[b % T.mel.length], s, t, sd, lead, ch => { const d = DIG.indexOf(ch); return d < 0 ? null : T.key + 12 * (lead.o || 0) + degSemi(T.scale, d); });
    const bi = T.bassI;
    playLine(c, out, T.bass, s, t, sd, bi, ch => {
      const map = { 1: chord[0], 3: chord[1], 5: chord[2], 7: chord[3], 8: chord[0] + 12 };
      return map[ch] === undefined ? null : T.key - 24 + 12 * (bi.o ?? 1) + map[ch];
    });
    if (T.arp) {
      const ext = [chord[0], chord[1], chord[2], chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[0] + 24];
      playLine(c, out, T.arp, s, t, sd, T.arpI, ch => { const d = DIG.indexOf(ch); return d < 0 || d > 6 ? null : T.key + 12 * (T.arpI.o || 0) + ext[d]; });
    }
    const tones = T.seventh ? chord : chord.slice(0, 3);
    if (T.comp && T.comp[s] === 'x') for (const st of tones) voice(c, out, t, mtof(T.key + 12 * (T.compI.o || 0) + st), sd * (T.compI.leg ?? 0.5), T.compI);
    if (T.pad && s === 0) {
      const barLen = sd * (T.steps || 16);
      for (const st of tones) voice(c, out, t, mtof(T.key + 12 * (T.pad.o ?? -1) + st), barLen * 0.95, T.pad);
    }
    const dv = T.dv ?? 1;
    const kk = T.k[s], ss = T.s[s], hh = T.h[s];
    if (kk === 'x' || kk === 'X') kick(c, out, t, (kk === 'X' ? 0.17 : 0.12) * dv);
    if (ss === 'x' || ss === 'X') snare(c, out, t, (ss === 'X' ? 0.07 : 0.045) * dv);
    if (hh === 'x' || hh === 'X' || hh === 'o') hat(c, out, t, (hh === 'X' ? 0.03 : 0.018) * dv, hh === 'o');
    if (T.ping && s === 0 && b % 2 === 0) {
      [0, 0.45, 0.9].forEach((dt, i) => voice(c, out, t + dt, 1318.5, 0.02, { w: 'sine', v: [0.045, 0.016, 0.006][i], a: 0.004, r: 1.2, sus: 0.9 }));
    }
    if (isTense && s % div === 0) voice(c, out, t, mtof(T.key + 24 + chord[0] + (s % (div * 2) ? 7 : 0)), 0.03, { w: 'sine', v: 0.022, a: 0.003, r: 0.06, sus: 0.5 });
  }

  bgm.play = track => {
    if (!TRACKS[track]) return;
    if (bgm.current === track && (!audible() || (live && live.name === track))) return;
    bgm.current = track;
    if (audible()) startTrack(track);
  };
  bgm.stop = () => { bgm.current = null; halt(); };
  bgm.setVolume = v => {
    bgm.volume = clamp(Number(v) || 0, 0, 1);
    store.set('kq-bgm-vol', String(bgm.volume));
    if (master) { const c = master.context; try { master.gain.setTargetAtTime(gainFor(bgm.volume), c.currentTime, 0.05); } catch { master.gain.value = gainFor(bgm.volume); } }
    return bgm.volume;
  };
  bgm.toggle = () => {
    bgm.enabled = !bgm.enabled;
    store.set('kq-bgm', bgm.enabled ? 'on' : 'off');
    if (bgm.enabled) { if (bgm.current && sound.enabled) startTrack(bgm.current); }
    else halt();
    return bgm.enabled;
  };
  bgm.tense = on => { isTense = !!on; return isTense; };
  bgm.isTense = () => isTense;
  bgm.state = () => ({ current: bgm.current, playing: live ? live.name : null, bar: live ? live.bar : null, step: live ? live.step : null, scheduler: !!timer, ctx: sound.ctx ? sound.ctx.state : null });

  // 기존 소리 기능과 연결
  clearInterval(sound.musicTimer); sound.musicTimer = null;
  sound.music = on => (on ? bgm.play('lobby') : bgm.stop());
  const origToggle = sound.toggle;
  sound.toggle = () => {
    const keep = bgm.current;
    const on = origToggle();
    bgm.current = keep;
    if (on) { if (keep && bgm.enabled) startTrack(keep); }
    else halt();
    return on;
  };

  /* =====================================================================
   * 효과음 7종
   * ===================================================================== */
  const SFX = {
    drumroll(c) {
      const out = c.destination, t0 = c.currentTime + 0.02, L = 1.75;
      let t = 0;
      while (t < L) { const p = t / L; noiseHit(c, out, t0 + t, { type: 'bandpass', f: 1700, q: 0.7, v: 0.012 + 0.05 * p, d: 0.07 }); t += 0.06 - 0.022 * p; }
      kick(c, out, t0 + L + 0.08, 0.3, 120, 40, 0.5);
      noiseHit(c, out, t0 + L + 0.08, { type: 'highpass', f: 3500, v: 0.07, d: 1.1 });
    },
    cheer(c) {
      const out = c.destination, t = c.currentTime + 0.02;
      const s = c.createBufferSource(); s.buffer = noise(c); s.loop = true;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 0.6;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 0.25); g.gain.setValueAtTime(0.05, t + 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      const am = c.createGain(); am.gain.value = 0.6;
      const lfo = c.createOscillator(); lfo.frequency.value = 11; const lg = c.createGain(); lg.gain.value = 0.4; lfo.connect(lg).connect(am.gain);
      s.connect(f).connect(g).connect(am).connect(out); s.start(t); s.stop(t + 1.7); lfo.start(t); lfo.stop(t + 1.7);
      [523, 659, 784, 1047].forEach((fr, i) => voice(c, out, t + i * 0.08, fr, i === 3 ? 0.35 : 0.07, { w: 'triangle', v: 0.06, r: 0.15 }));
      voice(c, out, t + 0.35, 1900, 0.25, { w: 'sine', v: 0.025, glide: 0.6, gdt: 0.2, r: 0.1 });
    },
    whoosh(c) {
      const t = c.currentTime + 0.01;
      noiseHit(c, c.destination, t, { type: 'bandpass', f: 350, f2: 2800, fd: 0.28, q: 1.4, v: 0.13, a: 0.16, d: 0.26 });
    },
    levelup(c) {
      const out = c.destination, t = c.currentTime + 0.02;
      [523, 659, 784, 1047, 1319, 1568].forEach((fr, i) => voice(c, out, t + i * 0.06, fr, 0.06, { w: 'square', v: 0.035, r: 0.05, lp: 4000 }));
      [1047, 1319, 1568].forEach(fr => voice(c, out, t + 0.38, fr, 0.3, { w: 'triangle', v: 0.05, r: 0.3, vib: 10 }));
    },
    coin(c) {
      const t = c.currentTime + 0.01;
      voice(c, c.destination, t, 988, 0.07, { w: 'square', v: 0.04, r: 0.02, sus: 1 });
      voice(c, c.destination, t + 0.075, 1319, 0.12, { w: 'square', v: 0.04, r: 0.25, sus: 0.6 });
    },
    sparkle(c) {
      const t = c.currentTime + 0.01, notes = [2093, 2349, 2637, 3136, 3520];
      for (let i = 0; i < 7; i++) voice(c, c.destination, t + i * 0.06 + Math.random() * 0.03, pick(notes), 0.02, { w: 'sine', v: 0.028, a: 0.003, r: 0.25, sus: 0.6 });
    },
    boom(c) {
      const out = c.destination, t = c.currentTime + 0.01;
      kick(c, out, t, 0.32, 95, 28, 0.9);
      noiseHit(c, out, t, { type: 'lowpass', f: 900, f2: 90, fd: 0.8, v: 0.22, d: 1.0 });
    }
  };
  const origPlay = sound.play;
  sound.play = kind => {
    if (!sound.enabled) return;
    const f = SFX[kind];
    if (!f) return origPlay(kind);
    const c = actx(); if (!c) return;
    try { f(c); } catch {}
  };

  /* =====================================================================
   * 화면 효과: 캔버스 파티클 엔진
   * ===================================================================== */
  const fx = KQ.fx = {};
  const PALETTE = ['#e21b3c', '#1368ce', '#d89e00', '#26890c', '#ffd43b', '#ff7eb6', '#7048e8', '#20c997', '#ff922b', '#ffffff'];
  const FIRE = ['#ff6b6b', '#ffd43b', '#69db7c', '#4dabf7', '#da77f2', '#ff922b', '#ffffff', '#63e6be', '#f783ac'];
  const lowEnd = (navigator.hardwareConcurrency || 4) <= 4 || Math.min(screen.width || 1000, screen.height || 1000) < 500;
  const MAXP = lowEnd ? 260 : 520;
  let cv = null, cx = null, W = 0, H = 0, DPR = 1, raf = 0, lastT = 0;
  const parts = [], emitters = [], domNodes = new Set();

  function resize() {
    if (!cv) return;
    DPR = Math.min(window.devicePixelRatio || 1, 2); W = window.innerWidth; H = window.innerHeight;
    const w = Math.round(W * DPR), h = Math.round(H * DPR);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  }
  function ensure() {
    if (!document.body) return false;
    if (!cv) {
      cv = document.createElement('canvas'); cv.className = 'fx-canvas'; cv.setAttribute('aria-hidden', 'true');
      cx = cv.getContext('2d'); window.addEventListener('resize', resize);
    }
    if (!cv.isConnected) document.body.append(cv);
    resize();
    return !!cx;
  }
  const sizeScale = () => clamp(Math.min(W, H) / 700, 0.7, 1.3);
  const add = p => { if (parts.length < MAXP) { parts.push(p); return true; } return false; };
  function run() { if (raf) return; lastT = performance.now(); raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000)); lastT = now;
    const f = dt * 60;
    for (let i = emitters.length - 1; i >= 0; i--) {
      const e = emitters[i];
      if (now >= e.until) { emitters.splice(i, 1); continue; }
      e.acc += dt;
      let n = 0;
      while (e.acc >= e.every && n++ < 10) { e.acc -= e.every; e.fn(e); }
    }
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, cv.width, cv.height);
    const born = [];
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (!stepP(p, dt, f, born)) { parts[i] = parts[parts.length - 1]; parts.pop(); }
      else drawP(p);
    }
    for (const p of born) { if (parts.length >= MAXP + 160) break; parts.push(p); }
    cx.globalAlpha = 1;
    if (parts.length || emitters.length) raf = requestAnimationFrame(frame);
    else { cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, cv.width, cv.height); }
  }
  function stepP(p, dt, f, born) {
    p.age += dt;
    if (p.age < 0) return true;
    if (p.age >= p.life) { if (p.type === 'rocket') explode(p, born); return false; }
    if (p.type === 'rocket') {
      p.vy += p.g * f; p.x += p.vx * f; p.y += p.vy * f;
      if (p.vy >= -0.6) { explode(p, born); return false; }
      if (Math.random() < 0.7) born.push({ type: 'spark', x: p.x, y: p.y + 3, vx: rand(-0.4, 0.4), vy: rand(0.4, 1.4), g: 0.03, decay: 0.92, size: 1.6, tr: 2, color: '#ffe8a3', age: 0, life: rand(0.25, 0.5), fade: 0.3 });
      return true;
    }
    const d = Math.pow(p.decay, f);
    p.vx *= d; p.vy = p.vy * d + p.g * f;
    if (p.wobA) { p.wob += p.wobS * f; p.x += (p.vx + Math.cos(p.wob) * p.wobA) * f; }
    else p.x += p.vx * f;
    p.y += p.vy * f;
    if (p.vr) p.rot += p.vr * f;
    if (p.vt) p.tilt += p.vt * f;
    if (p.y > H + 60 && p.vy > 0) return false;
    return true;
  }
  function starPath(r) {
    cx.beginPath();
    for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.45 : r, a = -Math.PI / 2 + i * Math.PI / 5; const x = Math.cos(a) * rr, y = Math.sin(a) * rr; i ? cx.lineTo(x, y) : cx.moveTo(x, y); }
    cx.closePath();
  }
  function drawP(p) {
    if (p.age < 0) return;
    const a = p.fade ? Math.min(1, (p.life - p.age) / p.fade) : 1;
    if (a <= 0) return;
    cx.globalAlpha = a;
    if (p.type === 'spark' || p.type === 'rocket') {
      cx.setTransform(DPR, 0, 0, DPR, 0, 0);
      cx.strokeStyle = p.color; cx.lineWidth = p.size; cx.lineCap = 'round';
      cx.beginPath(); cx.moveTo(p.x - p.vx * p.tr, p.y - p.vy * p.tr); cx.lineTo(p.x, p.y + 0.01); cx.stroke();
      return;
    }
    const co = Math.cos(p.rot), si = Math.sin(p.rot);
    cx.setTransform(DPR * co, DPR * si, -DPR * si, DPR * co, p.x * DPR, p.y * DPR);
    const k = Math.cos(p.tilt);
    const col = k < 0 && p.dark ? p.dark : p.color;
    if (p.type === 'rect') { cx.fillStyle = col; const hh = p.h * k; cx.fillRect(-p.w / 2, -hh / 2, p.w, hh || 0.5); }
    else if (p.type === 'circle') { cx.fillStyle = col; cx.beginPath(); cx.ellipse(0, 0, p.w / 2, Math.max(0.4, Math.abs(k) * p.w / 2), 0, 0, Math.PI * 2); cx.fill(); }
    else if (p.type === 'ribbon') {
      cx.strokeStyle = col; cx.lineWidth = p.w; cx.lineCap = 'round';
      const L = p.h, wv = Math.sin(p.tilt * 1.3) * 5;
      cx.beginPath(); cx.moveTo(0, -L / 2); cx.quadraticCurveTo(wv, -L / 4, 0, 0); cx.quadraticCurveTo(-wv, L / 4, 0, L / 2); cx.stroke();
    } else if (p.type === 'star') {
      const life = Math.min(1, p.age / p.life);
      const sc = p.size * (0.35 + 0.65 * Math.sin(life * Math.PI));
      cx.fillStyle = p.color; starPath(sc); cx.fill();
      cx.globalAlpha = a * 0.9; cx.fillStyle = '#fff'; cx.beginPath(); cx.arc(0, 0, sc * 0.22, 0, Math.PI * 2); cx.fill();
    }
  }
  function confettiPiece(x, y, ang, speed, colors, sc) {
    const r = Math.random();
    const type = r < 0.55 ? 'rect' : r < 0.8 ? 'ribbon' : 'circle';
    const color = pick(colors);
    return {
      type, x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, g: 0.22 * sc, decay: 0.92,
      w: type === 'ribbon' ? 2.6 * sc : rand(6, 10) * sc, h: type === 'ribbon' ? rand(14, 22) * sc : rand(8, 14) * sc,
      rot: rand(0, 6.28), vr: rand(-0.2, 0.2), tilt: rand(0, 6.28), vt: rand(0.08, 0.25),
      wob: rand(0, 6.28), wobS: rand(0.04, 0.1), wobA: rand(0.3, 1.1),
      color, dark: shade(color, -0.25), age: 0, life: rand(4.5, 6.5), fade: 1
    };
  }
  function explode(p, born) {
    const n = reduced() ? 14 : lowEnd ? 46 : 74;
    const c2 = Math.random() < 0.5 ? pick(FIRE) : p.color;
    const R = clamp(H * 0.011, 4, 11);
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + rand(-0.05, 0.05), sp = R * rand(0.75, 1);
      born.push({ type: 'spark', x: p.x, y: p.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, g: 0.045, decay: 0.95, size: rand(1.8, 2.8), tr: 3.2, color: i % 3 === 0 ? c2 : p.color, age: 0, life: rand(1.0, 1.6), fade: 0.8 });
    }
    for (let i = 0; i < (reduced() ? 0 : 10); i++) {
      const ang = rand(0, 6.28), sp = R * rand(0.15, 0.45);
      born.push({ type: 'star', x: p.x, y: p.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, g: 0.03, decay: 0.95, size: rand(3, 5), rot: rand(0, 6), vr: 0.05, color: '#fff7c2', age: -rand(0.1, 0.4), life: rand(0.7, 1.1), fade: 0.3 });
    }
    if (p.snd) sound.play('boom');
  }
  const rectOf = elm => {
    if (elm && elm.getBoundingClientRect) { const r = elm.getBoundingClientRect(); if (r.width || r.height) return r; }
    return { left: W / 2 - 40, top: H / 2 - 40, width: 80, height: 80 };
  };

  fx.confetti = (opts = {}) => {
    if (!ensure()) return;
    const x = (opts.x ?? 0.5) * W, y = (opts.y ?? 0.92) * H;
    let count = opts.count ?? 120;
    if (reduced()) count = Math.max(4, Math.round(count * 0.12));
    else if (lowEnd) count = Math.round(count * 0.7);
    const spread = (opts.spread ?? 70) * Math.PI / 180, power = opts.power ?? 1;
    const colors = opts.colors && opts.colors.length ? opts.colors : PALETTE;
    const sc = sizeScale(), base = (opts.angle ?? -90) * Math.PI / 180;
    for (let i = 0; i < count; i++) {
      const ang = base + rand(-spread / 2, spread / 2);
      const speed = rand(0.5, 1) * power * H * 0.08;
      if (!add(confettiPiece(x, y, ang, speed, colors, sc))) break;
    }
    run();
  };
  fx.burst = (elm, opts = {}) => {
    if (!ensure()) return;
    const r = rectOf(elm);
    let count = opts.count ?? 40;
    if (reduced()) count = Math.max(3, Math.round(count * 0.15));
    const colors = opts.colors && opts.colors.length ? opts.colors : PALETTE;
    const sc = sizeScale() * 0.85, power = opts.power ?? 1;
    const cxp = r.left + r.width / 2, cyp = r.top + r.height / 2;
    for (let i = 0; i < count; i++) {
      const ang = rand(0, Math.PI * 2), speed = rand(0.35, 1) * power * clamp(H * 0.025, 9, 22);
      const p = confettiPiece(cxp, cyp, ang, speed, colors, sc);
      p.life = rand(1.6, 2.6); p.fade = 0.8;
      if (!add(p)) break;
    }
    run();
  };
  fx.rain = (ms = 4000, opts = {}) => {
    if (!ensure()) return;
    const colors = opts.colors && opts.colors.length ? opts.colors : PALETTE;
    const perSec = (reduced() ? 5 : lowEnd ? 26 : 45) * clamp(W / 1100, 0.5, 1.4);
    const sc = sizeScale();
    emitters.push({
      until: performance.now() + ms, acc: 0, every: 1 / perSec,
      fn() { const p = confettiPiece(rand(0, W), -20, Math.PI / 2, rand(1, 3), colors, sc); p.vx = rand(-1, 1); p.life = H / 200 + 3; add(p); }
    });
    run();
  };
  fx.fireworks = (ms = 5000, opts = {}) => {
    if (ms && typeof ms === 'object') { opts = ms; ms = opts.ms ?? 5000; }
    if (!ensure()) return;
    const snd = !!opts.sound;
    const launch = () => {
      const x = rand(0.15, 0.85) * W, y = H + 5, ty = rand(0.12, 0.42) * H, g = 0.16;
      add({ type: 'rocket', x, y, vx: rand(-0.8, 0.8), vy: -Math.sqrt(2 * g * (y - ty)), g, size: 2.6, tr: 2.5, color: pick(FIRE), snd, age: 0, life: 4 });
    };
    launch();
    emitters.push({ until: performance.now() + ms, acc: 0, every: reduced() ? 1.4 : 0.45, fn(e) { launch(); e.every = reduced() ? 1.4 : rand(0.28, 0.7); } });
    run();
  };
  fx.stars = (elm, opts = {}) => {
    if (!ensure()) return;
    const r = rectOf(elm), n = reduced() ? 3 : (opts.count ?? 9), sc = sizeScale();
    for (let i = 0; i < n; i++) {
      add({ type: 'star', x: r.left + rand(-0.1, 1.1) * r.width, y: r.top + rand(-0.1, 1.1) * r.height, vx: rand(-0.5, 0.5), vy: rand(-1.3, -0.2), g: 0.015, decay: 0.96, size: rand(7, 13) * sc, rot: rand(0, 6.28), vr: rand(-0.06, 0.06), color: pick(['#ffd43b', '#ffe066', '#fff3a8', '#ffffff', '#fcc419']), age: -rand(0, 0.35), life: rand(0.75, 1.2), fade: 0.35 });
    }
    run();
  };
  fx.flash = (color = '#fff', ms = 300) => {
    if (!document.body) return;
    const d = document.createElement('div');
    d.className = 'fx-flash'; d.setAttribute('aria-hidden', 'true');
    d.style.background = color; d.style.animationDuration = Math.max(60, ms) + 'ms';
    document.body.append(d); domNodes.add(d);
    const rm = () => { d.remove(); domNodes.delete(d); };
    d.addEventListener('animationend', rm); setTimeout(rm, ms + 150);
  };
  const shakeTimers = new Map();
  fx.shake = elm => {
    if (!elm || !elm.classList) return;
    clearTimeout(shakeTimers.get(elm));
    elm.classList.remove('fx-shake'); void elm.offsetWidth; elm.classList.add('fx-shake');
    shakeTimers.set(elm, setTimeout(() => { elm.classList.remove('fx-shake'); shakeTimers.delete(elm); }, 560));
  };
  let stampNode = null, stampTimer = null;
  fx.stamp = (text, opts = {}) => {
    if (!document.body) return;
    if (stampNode) { stampNode.remove(); domNodes.delete(stampNode); clearTimeout(stampTimer); }
    const wrap = document.createElement('div'); wrap.className = 'fx-stamp-wrap'; wrap.setAttribute('aria-hidden', 'true');
    const box = document.createElement('div'); box.className = 'fx-stamp';
    if (opts.color) box.style.setProperty('--fx-c', opts.color);
    const main = document.createElement('div'); main.className = 'fx-stamp-main'; main.textContent = String(text ?? '');
    box.append(main);
    if (opts.sub) { const sub = document.createElement('div'); sub.className = 'fx-stamp-sub'; sub.textContent = String(opts.sub); box.append(sub); }
    wrap.append(box); document.body.append(wrap);
    stampNode = wrap; domNodes.add(wrap);
    stampTimer = setTimeout(() => { wrap.remove(); domNodes.delete(wrap); if (stampNode === wrap) stampNode = null; }, opts.ms ?? 1250);
  };
  const counting = new Map();
  const fmtNum = v => Math.round(v).toLocaleString('ko-KR');
  fx.countUp = (elm, from, to, ms = 900) => new Promise(resolve => {
    if (!elm) return resolve();
    const prev = counting.get(elm); if (prev) { cancelAnimationFrame(prev.raf); prev.resolve(); }
    from = Number(from) || 0; to = Number(to) || 0;
    if (reduced() || ms <= 0 || from === to) { elm.textContent = fmtNum(to); counting.delete(elm); return resolve(); }
    elm.textContent = fmtNum(from);
    const t0 = performance.now(), rec = { raf: 0, to, resolve };
    counting.set(elm, rec);
    const stepC = now => {
      const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      elm.textContent = fmtNum(from + (to - from) * e);
      if (k < 1) rec.raf = requestAnimationFrame(stepC);
      else { counting.delete(elm); resolve(); }
    };
    rec.raf = requestAnimationFrame(stepC);
  });
  fx.stop = () => {
    parts.length = 0; emitters.length = 0;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    if (cx && cv) { cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, cv.width, cv.height); }
    for (const n of domNodes) n.remove();
    domNodes.clear(); stampNode = null; clearTimeout(stampTimer);
    for (const [elm, rec] of counting) { cancelAnimationFrame(rec.raf); elm.textContent = fmtNum(rec.to); rec.resolve(); }
    counting.clear();
    for (const [elm, tm] of shakeTimers) { clearTimeout(tm); elm.classList.remove('fx-shake'); }
    shakeTimers.clear();
  };
  fx.active = () => parts.length + emitters.length;

  /* =====================================================================
   * 캐릭터(아바타)
   * ===================================================================== */
  const NS = 'http://www.w3.org/2000/svg';
  const S = (tag, attrs = {}, ...kids) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined && v !== false) n.setAttribute(k, String(v));
    for (const c of kids.flat()) if (c) n.append(c);
    return n;
  };
  const NAMES = ['고양이', '강아지', '토끼', '곰', '펭귄', '여우', '개구리', '판다', '병아리', '로봇'];
  const COLORS = ['#ff9f43', '#c68a5a', '#f5ede0', '#a4b0be', '#ff9cc8', '#ffd43b', '#5fd9b0', '#74c0fc', '#b197fc', '#ff6b6b', '#8ce99a', '#4b5d8f'];
  const COLOR_NAMES = ['주황', '갈색', '크림', '회색', '분홍', '노랑', '민트', '하늘', '보라', '빨강', '연두', '남색'];
  const HATS = ['없음', '왕관', '리본', '야구모자', '마법사 모자', '헤드폰', '꽃', '파티 모자'];
  const FACES = ['없음', '안경', '선글라스', '볼터치', '별 스티커', '콧수염'];
  const BGS = ['#ffd6e0', '#fff1b8', '#cdf5d3', '#cfe8ff', '#e3d9ff', '#ffe2c4', '#bff3e4', '#e6e9ee'];
  const BG_NAMES = ['분홍', '노랑', '연두', '하늘', '보라', '살구', '민트', '회색'];
  const LIM = { c: 10, k: 12, h: 8, f: 6, b: 8 };
  const INK = '#2b2b3a', PINK = '#ff8fb1';

  const sw = (stroke, w = 1.2) => ({ stroke, 'stroke-width': w, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
  function eyes(g, pts, o = {}) {
    for (const [x, y] of pts) {
      g.append(S('ellipse', { cx: x, cy: y, rx: o.rx ?? 3.3, ry: o.ry ?? 3.9, fill: o.fill ?? INK }));
      g.append(S('circle', { cx: x - 1.1, cy: y - 1.4, r: o.hl ?? 1.3, fill: '#fff' }));
      g.append(S('circle', { cx: x + 1.1, cy: y + 1.4, r: 0.55, fill: '#fff', opacity: 0.85 }));
    }
  }
  const BODY = 'M13.35,58 C17,49.5 47,49.5 50.65,58 A32,32 0 0 1 13.35,58 Z';
  const body = (g, fill, line) => g.append(S('path', { d: BODY, fill, ...sw(line) }));
  const head = (g, k, line, r = 18) => g.append(S('circle', { cx: 32, cy: 35, r, fill: k, ...sw(line) }));
  const wMouth = (g, y, line = INK) => g.append(S('path', { d: `M28.6,${y} q1.7,2 3.4,0 q1.7,2 3.4,0`, fill: 'none', ...sw(line, 1.3) }));
  const mirror = pts => pts.split(' ').map(p => { const [x, y] = p.split(','); return `${64 - x},${y}`; }).join(' ');

  // 캐릭터별 그리기: 눈 위치(eyes), 볼(ch), 입/콧수염 높이(my), 머리 장식 변환(hat)
  const CHARS = [
    { // 고양이
      eyes: [[25, 35], [39, 35]], my: 42.6, ch: 42,
      draw(g, k, line, light) {
        body(g, k, line);
        const ear = '13,30 15.5,11 29,19.5', inner = '16.8,25.5 18,15.8 25.2,20.4';
        g.append(S('polygon', { points: ear, fill: k, ...sw(line) }), S('polygon', { points: mirror(ear), fill: k, ...sw(line) }));
        g.append(S('polygon', { points: inner, fill: '#ffb3c7' }), S('polygon', { points: mirror(inner), fill: '#ffb3c7' }));
        head(g, k, line);
        eyes(g, this.eyes);
        g.append(S('path', { d: 'M30.5,39.8 h3 l-1.5,1.8 z', fill: '#ff7aa2', ...sw('#ff7aa2', 0.8) }));
        wMouth(g, 41.8);
        for (const [a, b, c, d] of [[19, 39.5, 11.5, 37.8], [19, 42, 11.5, 42.6]]) {
          g.append(S('line', { x1: a, y1: b, x2: c, y2: d, ...sw(line, 0.9), opacity: 0.7 }), S('line', { x1: 64 - a, y1: b, x2: 64 - c, y2: d, ...sw(line, 0.9), opacity: 0.7 }));
        }
      }
    },
    { // 강아지
      eyes: [[25, 34], [39, 34]], my: 42.4, ch: 41.5,
      draw(g, k, line, light) {
        body(g, k, line);
        head(g, k, line);
        const ear = shade(k, -0.28);
        g.append(S('ellipse', { cx: 15.5, cy: 33, rx: 6, ry: 11.5, transform: 'rotate(18 15.5 33)', fill: ear, ...sw(line) }));
        g.append(S('ellipse', { cx: 48.5, cy: 33, rx: 6, ry: 11.5, transform: 'rotate(-18 48.5 33)', fill: ear, ...sw(line) }));
        g.append(S('ellipse', { cx: 32, cy: 43, rx: 7.8, ry: 5.8, fill: light }));
        eyes(g, this.eyes);
        g.append(S('ellipse', { cx: 32, cy: 40.2, rx: 2.9, ry: 2.1, fill: INK }));
        g.append(S('path', { d: 'M30.6,44.3 q1.4,3.6 2.8,0 z', fill: '#ff7aa2' }));
        g.append(S('path', { d: 'M32,42.2 v1.6 M28.8,43.4 q3.2,2.4 6.4,0', fill: 'none', ...sw(INK, 1.2) }));
      }
    },
    { // 토끼
      eyes: [[25, 35], [39, 35]], my: 42.4, ch: 42,
      draw(g, k, line, light) {
        body(g, k, line);
        for (const [x, rot] of [[24, -10], [40, 10]]) {
          g.append(S('ellipse', { cx: x, cy: 13.5, rx: 5.2, ry: 12, transform: `rotate(${rot} ${x} 22)`, fill: k, ...sw(line) }));
          g.append(S('ellipse', { cx: x, cy: 14.5, rx: 2.4, ry: 8.3, transform: `rotate(${rot} ${x} 22)`, fill: '#ffb3c7' }));
        }
        head(g, k, line);
        eyes(g, this.eyes);
        g.append(S('ellipse', { cx: 32, cy: 40.4, rx: 1.9, ry: 1.3, fill: '#ff7aa2' }));
        g.append(S('rect', { x: 30.3, y: 43.2, width: 3.4, height: 3.2, rx: 0.8, fill: '#fff', ...sw(line, 0.7) }));
        g.append(S('path', { d: 'M32,43.3 v3', fill: 'none', ...sw(line, 0.6) }));
        g.append(S('path', { d: 'M32,41.6 v1.4 M29.4,42.9 q1.3,1.2 2.6,0 q1.3,1.2 2.6,0', fill: 'none', ...sw(INK, 1.1) }));
      }
    },
    { // 곰
      eyes: [[25, 34], [39, 34]], my: 42.6, ch: 41.5,
      draw(g, k, line, light) {
        body(g, k, line);
        for (const x of [18.5, 45.5]) { g.append(S('circle', { cx: x, cy: 20.5, r: 6.5, fill: k, ...sw(line) }), S('circle', { cx: x, cy: 20.5, r: 3.3, fill: light })); }
        head(g, k, line);
        g.append(S('ellipse', { cx: 32, cy: 42.5, rx: 7.2, ry: 5.4, fill: light }));
        eyes(g, this.eyes);
        g.append(S('ellipse', { cx: 32, cy: 40, rx: 2.7, ry: 1.9, fill: '#3a2a22' }));
        g.append(S('path', { d: 'M32,41.8 v1.5 M29.2,43.1 q1.4,1.5 2.8,0 q1.4,1.5 2.8,0', fill: 'none', ...sw(INK, 1.15) }));
      }
    },
    { // 펭귄
      eyes: [[26.2, 36], [37.8, 36]], my: 43.4, ch: 42.5,
      draw(g, k, line, light) {
        body(g, k, line);
        g.append(S('ellipse', { cx: 32, cy: 59, rx: 8.5, ry: 6, fill: '#fff' }));
        g.append(S('path', { d: 'M30,18 q0.5,-4.5 4.5,-5 q-1.6,2.2 -1.2,5', fill: k, ...sw(line) }));
        head(g, k, line);
        g.append(S('circle', { cx: 26.3, cy: 36.5, r: 8.3, fill: '#fff' }), S('circle', { cx: 37.7, cy: 36.5, r: 8.3, fill: '#fff' }), S('ellipse', { cx: 32, cy: 43, rx: 12, ry: 8.4, fill: '#fff' }));
        eyes(g, this.eyes, { rx: 2.9, ry: 3.4, hl: 1.1 });
        g.append(S('path', { d: 'M28.6,41 Q32,39 35.4,41 Q32,45.6 28.6,41 Z', fill: '#ffa94d', ...sw('#e8590c', 0.8) }));
      }
    },
    { // 여우
      eyes: [[25, 34.5], [39, 34.5]], my: 43.2, ch: 41.8,
      draw(g, k, line, light) {
        body(g, k, line);
        g.append(S('ellipse', { cx: 32, cy: 60, rx: 7, ry: 5.2, fill: '#fffaf3' }));
        const ear = '12.5,31 14,7.5 30,19', inner = '16.3,25.5 16.9,13.8 25.5,20';
        g.append(S('polygon', { points: ear, fill: k, ...sw(line) }), S('polygon', { points: mirror(ear), fill: k, ...sw(line) }));
        g.append(S('polygon', { points: inner, fill: '#fff4e6' }), S('polygon', { points: mirror(inner), fill: '#fff4e6' }));
        head(g, k, line);
        g.append(S('path', { d: 'M14.2,37 Q18,47 32,53 Q46,47 49.8,37 Q44,44.5 36.5,41.5 Q32,39.8 27.5,41.5 Q20,44.5 14.2,37 Z', fill: '#fffaf3' }));
        eyes(g, this.eyes);
        g.append(S('ellipse', { cx: 32, cy: 41.3, rx: 2.4, ry: 1.7, fill: INK }));
        wMouth(g, 43.2);
      }
    },
    { // 개구리
      eyes: [[22.5, 24.5], [41.5, 24.5]], my: 44, ch: 44, hat: 'translate(0 -6.5) translate(32 17) scale(.86) translate(-32 -17)',
      draw(g, k, line, light) {
        body(g, k, line);
        g.append(S('ellipse', { cx: 32, cy: 60, rx: 9, ry: 5.5, fill: light }));
        for (const x of [22.5, 41.5]) g.append(S('circle', { cx: x, cy: 24.5, r: 8, fill: k, ...sw(line) }));
        g.append(S('ellipse', { cx: 32, cy: 39.5, rx: 20, ry: 14.5, fill: k, ...sw(line) }));
        for (const x of [22.5, 41.5]) g.append(S('ellipse', { cx: x, cy: 26, rx: 6.6, ry: 4, fill: k }));
        for (const x of [22.5, 41.5]) g.append(S('circle', { cx: x, cy: 24.5, r: 5.6, fill: '#fff' }));
        eyes(g, [[22.5, 25], [41.5, 25]], { rx: 3, ry: 3.5, hl: 1.1 });
        g.append(S('circle', { cx: 29.5, cy: 36.5, r: 0.85, fill: line }), S('circle', { cx: 34.5, cy: 36.5, r: 0.85, fill: line }));
        g.append(S('path', { d: 'M21.5,41.5 Q32,50.5 42.5,41.5', fill: 'none', ...sw(INK, 1.6) }));
      }
    },
    { // 판다
      eyes: [[24.5, 35.5], [39.5, 35.5]], my: 43.2, ch: 42.5,
      draw(g, k, line, light) {
        const dark = k, wline = '#c9cad6';
        body(g, dark, shade(k, -0.35));
        for (const x of [18, 46]) g.append(S('circle', { cx: x, cy: 20.5, r: 6.5, fill: dark, ...sw(shade(k, -0.35)) }));
        head(g, '#ffffff', wline);
        g.append(S('ellipse', { cx: 24.5, cy: 35.5, rx: 5, ry: 6.3, transform: 'rotate(28 24.5 35.5)', fill: dark }));
        g.append(S('ellipse', { cx: 39.5, cy: 35.5, rx: 5, ry: 6.3, transform: 'rotate(-28 39.5 35.5)', fill: dark }));
        for (const [x, y] of this.eyes) { g.append(S('circle', { cx: x + 0.4, cy: y, r: 2.7, fill: '#fff' }), S('circle', { cx: x + 0.6, cy: y + 0.3, r: 1.8, fill: INK }), S('circle', { cx: x, cy: y - 0.6, r: 0.7, fill: '#fff' })); }
        g.append(S('ellipse', { cx: 32, cy: 41.2, rx: 2.4, ry: 1.6, fill: INK }));
        wMouth(g, 43);
      }
    },
    { // 병아리
      eyes: [[25, 35], [39, 35]], my: 43.4, ch: 42.5,
      draw(g, k, line, light) {
        body(g, k, line);
        const wing = shade(k, -0.12);
        g.append(S('ellipse', { cx: 16.5, cy: 57, rx: 3.8, ry: 6, transform: 'rotate(35 16.5 57)', fill: wing, ...sw(line, 1) }));
        g.append(S('ellipse', { cx: 47.5, cy: 57, rx: 3.8, ry: 6, transform: 'rotate(-35 47.5 57)', fill: wing, ...sw(line, 1) }));
        g.append(S('path', { d: 'M29,18.5 q-1.5,-5 1.5,-6.5 q0.3,3.3 1.6,5 q0.8,-4.6 4.3,-5 q-1.4,3 -1.6,6.5 z', fill: k, ...sw(line) }));
        head(g, k, line);
        eyes(g, this.eyes);
        g.append(S('path', { d: 'M28.4,40.4 L35.6,40.4 L32,44 Z', fill: '#ffa94d', ...sw('#e8590c', 0.9) }));
        g.append(S('path', { d: 'M28.6,40.4 L35.4,40.4', fill: 'none', ...sw('#e8590c', 0.7) }));
      }
    },
    { // 로봇
      eyes: [[25, 32.5], [39, 32.5]], my: 41.5, ch: 47,
      draw(g, k, line, light) {
        g.append(S('path', { d: BODY, fill: k, ...sw(line) }));
        g.append(S('circle', { cx: 32, cy: 58.5, r: 2.6, fill: '#ffd43b', ...sw(line, 0.8) }));
        g.append(S('line', { x1: 32, y1: 17.5, x2: 32, y2: 10.5, ...sw(line, 1.8) }));
        g.append(S('circle', { cx: 32, cy: 8.5, r: 3, fill: '#ff6b6b', ...sw(line, 1) }));
        const side = shade(k, -0.2);
        g.append(S('rect', { x: 9, y: 29, width: 6, height: 11, rx: 2, fill: side, ...sw(line, 1) }), S('rect', { x: 49, y: 29, width: 6, height: 11, rx: 2, fill: side, ...sw(line, 1) }));
        g.append(S('rect', { x: 13.5, y: 17.5, width: 37, height: 34, rx: 10, fill: k, ...sw(line) }));
        g.append(S('rect', { x: 18.5, y: 24, width: 27, height: 20.5, rx: 6.5, fill: '#26324a' }));
        for (const [x, y] of this.eyes) { g.append(S('circle', { cx: x, cy: y, r: 3.3, fill: '#7cf5d9' }), S('circle', { cx: x - 1, cy: y - 1.1, r: 1, fill: '#fff' })); }
        g.append(S('path', { d: 'M28,38.2 q4,3.2 8,0', fill: 'none', ...sw('#7cf5d9', 1.7) }));
        g.append(S('circle', { cx: 17, cy: 21, r: 0.9, fill: line }), S('circle', { cx: 47, cy: 21, r: 0.9, fill: line }));
      }
    }
  ];

  function starPoly(x, y, r) {
    const pts = [];
    for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.45 : r, a = -Math.PI / 2 + i * Math.PI / 5; pts.push(`${(x + Math.cos(a) * rr).toFixed(2)},${(y + Math.sin(a) * rr).toFixed(2)}`); }
    return pts.join(' ');
  }
  const HAT_DRAW = [
    null,
    g => { // 왕관
      g.append(S('polygon', { points: '21,19.5 20,8 26.5,13.5 32,5.5 37.5,13.5 44,8 43,19.5', fill: '#ffd43b', ...sw('#e6a700', 1) }));
      g.append(S('rect', { x: 21, y: 16, width: 22, height: 3.6, rx: 1, fill: '#fcc419', ...sw('#e6a700', 0.8) }));
      g.append(S('circle', { cx: 26.5, cy: 17.8, r: 1.2, fill: '#ff6b6b' }), S('circle', { cx: 32, cy: 17.8, r: 1.3, fill: '#4dabf7' }), S('circle', { cx: 37.5, cy: 17.8, r: 1.2, fill: '#69db7c' }));
      for (const [x, y] of [[20, 8], [32, 5.5], [44, 8]]) g.append(S('circle', { cx: x, cy: y, r: 1.5, fill: '#ffe066', ...sw('#e6a700', 0.7) }));
    },
    g => { // 리본
      g.append(S('path', { d: 'M44,19 L36.5,13.5 Q35,19 36.5,24.5 Z', fill: '#ff6b9a', ...sw('#e64980', 1) }));
      g.append(S('path', { d: 'M44,19 L51.5,13.5 Q53,19 51.5,24.5 Z', fill: '#ff6b9a', ...sw('#e64980', 1) }));
      g.append(S('circle', { cx: 44, cy: 19, r: 2.7, fill: '#f783ac', ...sw('#e64980', 1) }));
    },
    g => { // 야구모자
      g.append(S('path', { d: 'M14.5,26 Q14.5,8.5 32,8.5 Q49.5,8.5 49.5,26 Z', fill: '#4dabf7', ...sw('#1c7ed6', 1) }));
      g.append(S('path', { d: 'M32,9 V25.5 M23,11.5 Q21,18 21.5,25.5 M41,11.5 Q43,18 42.5,25.5', fill: 'none', ...sw('#1c7ed6', 0.7), opacity: 0.6 }));
      g.append(S('path', { d: 'M11.5,26.5 Q32,33 52.5,26.5 Q52.5,23.5 49.5,24 Q32,28.5 14.5,24 Q11.5,23.5 11.5,26.5 Z', fill: '#1c7ed6', ...sw('#1864ab', 0.8) }));
      g.append(S('circle', { cx: 32, cy: 9, r: 1.7, fill: '#1c7ed6' }));
      g.append(S('circle', { cx: 32, cy: 18, r: 3.2, fill: '#fff' }), S('polygon', { points: starPoly(32, 18.2, 2.3), fill: '#ffd43b' }));
    },
    g => { // 마법사 모자
      g.append(S('path', { d: 'M17,21 L30.5,2 Q33,0 34.5,3.5 L47,21 Z', fill: '#7048e8', ...sw('#5f3dc4', 1) }));
      g.append(S('ellipse', { cx: 32, cy: 21, rx: 17.5, ry: 3.6, fill: '#5f3dc4' }));
      g.append(S('polygon', { points: starPoly(29.5, 12.5, 2.6), fill: '#ffd43b' }), S('polygon', { points: starPoly(37.5, 16, 1.8), fill: '#ffe066' }), S('circle', { cx: 34, cy: 7.5, r: 0.9, fill: '#fff' }));
    },
    g => { // 헤드폰
      g.append(S('path', { d: 'M12.5,33 Q12.5,12 32,12 Q51.5,12 51.5,33', fill: 'none', ...sw('#495057', 3.4) }));
      g.append(S('rect', { x: 8, y: 28.5, width: 8, height: 13, rx: 3.5, fill: '#ff6b6b', ...sw('#c92a2a', 1) }));
      g.append(S('rect', { x: 48, y: 28.5, width: 8, height: 13, rx: 3.5, fill: '#ff6b6b', ...sw('#c92a2a', 1) }));
      g.append(S('rect', { x: 10, y: 31, width: 2, height: 8, rx: 1, fill: '#fff', opacity: 0.5 }));
    },
    g => { // 꽃
      g.append(S('ellipse', { cx: 26.5, cy: 21.5, rx: 3.4, ry: 1.6, transform: 'rotate(30 26.5 21.5)', fill: '#69db7c', ...sw('#37b24d', 0.6) }));
      for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / 5; g.append(S('circle', { cx: 21 + Math.cos(a) * 3.7, cy: 18.5 + Math.sin(a) * 3.7, r: 3.3, fill: '#ff8cc6', ...sw('#f06595', 0.7) })); }
      g.append(S('circle', { cx: 21, cy: 18.5, r: 2.5, fill: '#ffd43b', ...sw('#f59f00', 0.6) }));
    },
    g => { // 파티 모자
      const hat = S('g', { transform: 'rotate(10 32 19)' });
      hat.append(S('polygon', { points: '23.5,19.5 32,1.8 40.5,19.5', fill: '#4dabf7', ...sw('#1c7ed6', 1) }));
      hat.append(S('circle', { cx: 30, cy: 14.5, r: 1.4, fill: '#ffd43b' }), S('circle', { cx: 33.6, cy: 9.5, r: 1.1, fill: '#ff6b6b' }), S('circle', { cx: 35, cy: 16, r: 1.3, fill: '#fff' }), S('circle', { cx: 31.5, cy: 6.5, r: 0.8, fill: '#fff' }));
      hat.append(S('path', { d: 'M23,19.5 Q32,22.2 41,19.5', fill: 'none', ...sw('#ffd43b', 2.2) }));
      hat.append(S('circle', { cx: 32, cy: 2, r: 2.6, fill: '#ffd43b', ...sw('#f59f00', 0.8) }));
      g.append(hat);
    }
  ];
  const FACE_DRAW = [
    null,
    (g, C) => { // 안경
      const [[x1, y1], [x2, y2]] = C.eyes;
      for (const [x, y] of C.eyes) g.append(S('circle', { cx: x, cy: y, r: 5.6, fill: '#ffffff', 'fill-opacity': 0.22, ...sw(INK, 1.5) }));
      g.append(S('path', { d: `M${x1 + 5.6},${y1 - 0.5} Q32,${y1 - 3} ${x2 - 5.6},${y2 - 0.5}`, fill: 'none', ...sw(INK, 1.4) }));
    },
    (g, C) => { // 선글라스
      const [[x1, y1], [x2, y2]] = C.eyes;
      for (const [x, y] of C.eyes) {
        g.append(S('rect', { x: x - 6, y: y - 4.4, width: 12, height: 8.8, rx: 3.6, fill: '#1f2333', ...sw('#000', 0.8) }));
        g.append(S('path', { d: `M${x - 3.6},${y - 1.6} l2.6,-1.1`, fill: 'none', ...sw('#fff', 1.1), opacity: 0.7 }));
      }
      g.append(S('path', { d: `M${x1 + 6},${y1 - 1.5} Q32,${y1 - 3.5} ${x2 - 6},${y2 - 1.5}`, fill: 'none', ...sw('#1f2333', 1.6) }));
    },
    (g, C) => { // 볼터치
      const [[x1], [x2]] = C.eyes;
      for (const x of [x1 - 4.2, x2 + 4.2]) g.append(S('ellipse', { cx: x, cy: C.ch, rx: 3.4, ry: 2.1, fill: PINK, opacity: 0.7 }));
    },
    (g, C) => { // 별 스티커
      const [, [x2]] = C.eyes;
      g.append(S('polygon', { points: starPoly(x2 + 4.6, C.ch + 0.6, 4.2), fill: '#ffd43b', ...sw('#f08c00', 0.9) }));
      g.append(S('circle', { cx: x2 + 3.8, cy: C.ch - 0.6, r: 0.8, fill: '#fff', opacity: 0.8 }));
    },
    (g, C) => { // 콧수염
      g.append(S('path', { transform: `translate(32 ${C.my})`, d: 'M0,0 C-2,-2.4 -6.5,-2.6 -9,0.4 C-6.8,0 -5,1.9 -3,1.6 C-1.6,1.4 -0.6,0.8 0,0.2 C0.6,0.8 1.6,1.4 3,1.6 C5,1.9 6.8,0 9,0.4 C6.5,-2.6 2,-2.4 0,0 Z', fill: '#5c3d2e', ...sw('#3b2519', 0.6) }));
    }
  ];

  function normalize(av) {
    if (typeof av === 'string') { try { av = JSON.parse(av); } catch { av = null; } }
    const o = av && typeof av === 'object' ? av : {};
    const r = {};
    for (const [key, n] of Object.entries(LIM)) {
      let v = Math.floor(Number(o[key]));
      if (!Number.isFinite(v)) v = 0;
      r[key] = ((v % n) + n) % n;
    }
    return r;
  }
  function render(av, size = 64) {
    av = normalize(av);
    const C = CHARS[av.c], k = COLORS[av.k];
    const line = shade(k, -0.42), light = shade(k, 0.62);
    const svg = S('svg', { viewBox: '0 0 64 64', width: size, height: size, class: 'fx-avatar', role: 'img', 'aria-label': `${NAMES[av.c]} 캐릭터`, focusable: 'false' });
    svg.append(S('circle', { cx: 32, cy: 32, r: 32, fill: BGS[av.b] }));
    const g = S('g');
    C.draw(g, k, line, light);
    if (FACE_DRAW[av.f]) FACE_DRAW[av.f](g, C);
    if (HAT_DRAW[av.h]) { const hg = S('g', C.hat ? { transform: C.hat } : {}); HAT_DRAW[av.h](hg); g.append(hg); }
    svg.append(g);
    return svg;
  }
  function random() {
    return { c: ri(10), k: ri(12), h: Math.random() < 0.3 ? 0 : 1 + ri(7), f: Math.random() < 0.45 ? 0 : 1 + ri(5), b: ri(8) };
  }
  let sessionAv = null;
  function saved() {
    const raw = store.get('kq-avatar');
    if (raw) { try { const v = JSON.parse(raw); if (v && typeof v === 'object') return normalize(v); } catch {} }
    if (!sessionAv) sessionAv = random();
    return { ...sessionAv };
  }
  function save(av) { const v = normalize(av); store.set('kq-avatar', JSON.stringify(v)); sessionAv = v; return { ...v }; }

  let edUid = 0;
  const DICE = () => {
    const s = S('svg', { viewBox: '0 0 20 20', width: 18, height: 18, 'aria-hidden': 'true', focusable: 'false' });
    s.append(S('rect', { x: 2, y: 2, width: 16, height: 16, rx: 4, fill: '#fff', ...sw('#333', 1.6) }));
    for (const [x, y] of [[6.5, 6.5], [13.5, 6.5], [10, 10], [6.5, 13.5], [13.5, 13.5]]) s.append(S('circle', { cx: x, cy: y, r: 1.5, fill: '#333' }));
    return s;
  };
  function editor(av0, onChange) {
    let av = normalize(av0);
    const uid = 'fxed' + (++edUid);
    const el = KQ.el;
    const TABS = [
      { key: 'c', label: '캐릭터', names: NAMES, cols: 5, lab: true },
      { key: 'k', label: '색', names: COLOR_NAMES, cols: 6 },
      { key: 'h', label: '머리', names: HATS, cols: 4, lab: true },
      { key: 'f', label: '얼굴', names: FACES, cols: 3, lab: true },
      { key: 'b', label: '배경', names: BG_NAMES, cols: 4 }
    ];
    let tabIdx = 0;
    const preview = el('div', { class: 'fx-ed-preview' });
    const nameEl = el('div', { class: 'fx-ed-name' });
    const randBtn = el('button', { type: 'button', class: 'btn small fx-ed-random' }, DICE(), '무작위');
    const tablist = el('div', { class: 'fx-ed-tabs', role: 'tablist', 'aria-label': '캐릭터 꾸미기' });
    const panel = el('div', { class: 'fx-ed-panel', role: 'tabpanel', id: uid + '-panel' });
    const root = el('div', { class: 'fx-ed' },
      el('div', { class: 'fx-ed-head' }, preview, el('div', { class: 'fx-ed-side' }, el('div', { class: 'fx-ed-cap' }, '내 캐릭터'), nameEl, randBtn)),
      tablist, panel);
    const tabBtns = TABS.map((t, i) => {
      const b = el('button', { type: 'button', class: 'fx-ed-tab', role: 'tab', id: `${uid}-tab-${i}`, 'aria-controls': uid + '-panel' }, t.label);
      b.addEventListener('click', () => selectTab(i, false));
      tablist.append(b);
      return b;
    });
    tablist.addEventListener('keydown', e => {
      let i = tabIdx;
      if (e.key === 'ArrowRight') i = (tabIdx + 1) % TABS.length;
      else if (e.key === 'ArrowLeft') i = (tabIdx + TABS.length - 1) % TABS.length;
      else if (e.key === 'Home') i = 0;
      else if (e.key === 'End') i = TABS.length - 1;
      else return;
      e.preventDefault(); selectTab(i, true);
    });
    let cells = [];
    function selectTab(i, focus) {
      tabIdx = i;
      tabBtns.forEach((b, j) => { b.setAttribute('aria-selected', String(j === i)); b.tabIndex = j === i ? 0 : -1; });
      panel.setAttribute('aria-labelledby', tabBtns[i].id);
      renderPanel();
      if (focus) tabBtns[i].focus();
    }
    function renderPanel() {
      const t = TABS[tabIdx];
      const grid = el('div', { class: 'fx-ed-grid fx-ed-' + t.key, role: 'radiogroup', 'aria-label': t.label + ' 고르기' });
      grid.style.setProperty('--cols', t.cols);
      cells = t.names.map((name, i) => {
        const v = { ...av, [t.key]: i };
        let vis;
        if (t.key === 'k') { vis = el('span', { class: 'fx-ed-swatch' }); vis.style.background = COLORS[i]; vis.append(render(v, 38)); }
        else vis = render(v, t.key === 'b' ? 46 : 44);
        vis.setAttribute && vis.setAttribute('aria-hidden', 'true');
        const cell = el('button', { type: 'button', class: 'fx-ed-cell', role: 'radio', 'aria-label': name, title: name, 'data-i': i }, vis, t.lab ? el('span', { class: 'fx-ed-label', 'aria-hidden': 'true' }, name) : null);
        cell.addEventListener('click', () => choose(i));
        return cell;
      });
      grid.append(...cells);
      grid.addEventListener('keydown', e => {
        const cur = av[t.key], n = cells.length;
        let i = cur;
        if (e.key === 'ArrowRight') i = (cur + 1) % n;
        else if (e.key === 'ArrowLeft') i = (cur + n - 1) % n;
        else if (e.key === 'ArrowDown') i = Math.min(n - 1, cur + t.cols);
        else if (e.key === 'ArrowUp') i = Math.max(0, cur - t.cols);
        else if (e.key === 'Home') i = 0;
        else if (e.key === 'End') i = n - 1;
        else return;
        e.preventDefault();
        if (i !== cur) choose(i);
        cells[i].focus();
      });
      panel.replaceChildren(grid);
      mark();
    }
    function mark() {
      const key = TABS[tabIdx].key;
      cells.forEach((c, i) => { const on = av[key] === i; c.setAttribute('aria-checked', String(on)); c.tabIndex = on ? 0 : -1; });
    }
    function update() {
      preview.replaceChildren(render(av, 120));
      nameEl.textContent = NAMES[av.c];
    }
    function emit() { try { sound.play('pop'); } catch {} if (typeof onChange === 'function') onChange({ ...av }); }
    function choose(i) {
      const key = TABS[tabIdx].key;
      if (av[key] === i) return;
      av = { ...av, [key]: i };
      mark(); update(); emit();
    }
    randBtn.addEventListener('click', () => { av = random(); renderPanel(); update(); emit(); });
    root.getValue = () => ({ ...av });
    root.setValue = v => { av = normalize(v); renderPanel(); update(); };
    selectTab(0, false); update();
    return root;
  }

  KQ.avatar = {
    CHOICES: { characters: NAMES.slice(), colors: COLORS.slice(), hats: HATS.slice(), faces: FACES.slice(), bgs: BGS.slice(), colorNames: COLOR_NAMES.slice(), bgNames: BG_NAMES.slice() },
    render, normalize, random, saved, save, editor
  };

  /* =====================================================================
   * QR 코드
   * ===================================================================== */
  KQ.qr = (text, px = 240) => {
    const q = window.qrcode;
    const fallback = () => { const s = document.createElement('span'); s.className = 'fx-qr-missing'; s.textContent = 'QR 코드를 만들 수 없어요. 화면의 주소를 직접 입력해 주세요.'; return s; };
    if (typeof q !== 'function') return fallback();
    try {
      if (q.stringToBytesFuncs && q.stringToBytesFuncs['UTF-8']) q.stringToBytes = q.stringToBytesFuncs['UTF-8'];
      const qr = q(0, 'M');
      qr.addData(String(text), 'Byte');
      qr.make();
      const n = qr.getModuleCount(), margin = 4, total = n + margin * 2;
      const cell = Math.max(2, Math.ceil((px * Math.min(window.devicePixelRatio || 1, 3)) / total));
      const c = document.createElement('canvas');
      c.width = c.height = total * cell;
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#000';
      for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) if (qr.isDark(r, col)) g.fillRect((col + margin) * cell, (r + margin) * cell, cell, cell);
      const img = document.createElement('img');
      img.className = 'fx-qr'; img.width = px; img.height = px; img.alt = 'QR 코드: ' + String(text);
      img.src = c.toDataURL('image/png');
      return img;
    } catch { return fallback(); }
  };
})();
