'use strict';
(() => {
  const KQ = window.KQ = {};
  const $ = id => document.getElementById(id);
  KQ.el = (tag, attrs = {}, ...children) => {
    const svg = ['svg', 'path', 'circle', 'rect', 'polygon', 'g', 'line', 'ellipse', 'text', 'polyline', 'defs', 'linearGradient', 'radialGradient', 'stop'].includes(tag);
    const node = svg ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') svg ? node.setAttribute('class', v) : (node.className = v);
      else if (k === 'text') node.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (!svg && ['checked', 'disabled', 'hidden', 'required', 'selected', 'multiple', 'readOnly'].includes(k)) node[k] = !!v;
      else if (!svg && k === 'value') node.value = v;
      else node.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of children.flat(Infinity)) if (c !== null && c !== undefined && c !== false) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return node;
  };
  const el = KQ.el;
  KQ.btn = (text, onClick, cls = '', attrs = {}) => el('button', { type: 'button', class: ('btn ' + cls).trim(), onClick, ...attrs }, text);
  KQ.api = async (url, method = 'GET', data) => {
    let r;
    try { r = await fetch(url, { method, credentials: 'same-origin', headers: data === undefined ? {} : { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) }); }
    catch { const e = new Error('서버에 연결할 수 없어요. 같은 Wi-Fi인지, 선생님 컴퓨터의 서버가 켜져 있는지 확인하세요.'); e.status = 0; throw e; }
    const body = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(body.error || `요청을 처리하지 못했어요. (${r.status})`); e.status = r.status; throw e; }
    return body;
  };
  let toastTimer;
  KQ.toast = (msg, isError = false) => { const t = $('toast'); t.textContent = msg; t.className = 'toast' + (isError ? ' error' : ''); t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, isError ? 6000 : 3000); };

  // 라우터
  const routes = []; let leaveFns = [];
  KQ.route = (pattern, handler) => { const keys = []; const rx = new RegExp('^' + pattern.replace(/:[a-zA-Z]+/g, m => { keys.push(m.slice(1)); return '([^/]+)'; }) + '/?$'); routes.push({ rx, keys, handler }); };
  KQ.onLeave = fn => leaveFns.push(fn);
  const runLeave = () => { const fns = leaveFns; leaveFns = []; for (const f of fns) { try { f(); } catch {} } };
  const baseEl = document.querySelector('base');
  KQ.BASE = baseEl ? new URL(baseEl.href).pathname.replace(/\/$/, '') : '';
  const full = p => (typeof p === 'string' && p.startsWith('/') && KQ.BASE && !p.startsWith(KQ.BASE + '/') && p !== KQ.BASE ? KQ.BASE + p : p);
  KQ.replacePath = p => history.replaceState({}, '', full(p));
  KQ.go = (path, replace = false) => { if (replace) history.replaceState({}, '', full(path)); else history.pushState({}, '', full(path)); dispatch(); };
  async function dispatch() {
    runLeave(); KQ.closeModal?.(true);
    const url = new URL(location.href); let path = url.pathname; if (KQ.BASE && (path === KQ.BASE || path.startsWith(KQ.BASE + '/'))) path = path.slice(KQ.BASE.length) || '/'; if (path.endsWith('/index.html') || path.endsWith('/404.html')) path = '/';
    const query = Object.fromEntries(url.searchParams);
    for (const r of routes) { const m = path.match(r.rx); if (m) { const params = {}; r.keys.forEach((k, i) => params[k] = decodeURIComponent(m[i + 1])); try { await r.handler(params, query); } catch (e) { KQ.render(errorPage(e)); } $('app').focus({ preventScroll: true }); return; } }
    KQ.render(errorPage(new Error('페이지를 찾을 수 없어요.')));
  }
  function errorPage(e) { return el('div', { class: 'page purple-bg center' }, el('div', { class: 'card center-card' }, el('h1', {}, '앗, 문제가 생겼어요'), el('p', {}, e.message || String(e)), KQ.btn('처음으로', () => KQ.go('/'), 'primary'))); }
  window.addEventListener('popstate', dispatch);
  document.addEventListener('click', e => { const skip = e.target.closest?.('a[href="#app"]'); if (skip) { e.preventDefault(); $('app').focus(); return; } const a = e.target.closest?.('a[data-link]'); if (a && !e.ctrlKey && !e.metaKey) { e.preventDefault(); KQ.go(a.getAttribute('href')); } });
  KQ.render = (...nodes) => { $('app').replaceChildren(...nodes); window.scrollTo(0, 0); };
  KQ.me = null;
  KQ.refreshMe = async () => { KQ.me = await KQ.api('/api/me'); return KQ.me; };

  // 도형
  KQ.shapes = [{ name: '삼각형', color: '#e21b3c', cls: 'shape-0' }, { name: '마름모', color: '#1368ce', cls: 'shape-1' }, { name: '원', color: '#d89e00', cls: 'shape-2' }, { name: '사각형', color: '#26890c', cls: 'shape-3' }];
  KQ.shapeIcon = (i, size = 28) => {
    const s = el('svg', { viewBox: '0 0 32 32', width: size, height: size, 'aria-hidden': 'true', class: 'shape-icon' });
    const fill = '#fff';
    if (i === 0) s.append(el('polygon', { points: '16,3 30,28 2,28', fill }));
    else if (i === 1) s.append(el('polygon', { points: '16,2 30,16 16,30 2,16', fill }));
    else if (i === 2) s.append(el('circle', { cx: 16, cy: 16, r: 13, fill }));
    else s.append(el('rect', { x: 4, y: 4, width: 24, height: 24, fill }));
    return s;
  };

  // 효과음: WebAudio 합성 (외부 파일 없음)
  const sound = KQ.sound = { enabled: localStorage.getItem('kq-sound') !== 'off', ctx: null, musicTimer: null };
  function ctx() { if (!sound.ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; sound.ctx = new C(); } if (sound.ctx.state === 'suspended') sound.ctx.resume().catch(() => {}); return sound.ctx; }
  function tone(freq, start, dur, type = 'square', vol = 0.06) { const c = ctx(); if (!c) return; const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = freq; const t = c.currentTime + start; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02); }
  const patterns = {
    join: [[660, 0, .08], [880, .08, .1]], tick: [[1200, 0, .03, 'sine', .04]], countdown: [[523, 0, .15]], start: [[523, 0, .1], [659, .1, .1], [784, .2, .1], [1047, .3, .25]],
    correct: [[784, 0, .1, 'triangle', .09], [1047, .1, .2, 'triangle', .09]], wrong: [[220, 0, .18, 'sawtooth', .05], [165, .18, .25, 'sawtooth', .05]], reveal: [[392, 0, .1], [523, .1, .2]],
    fanfare: [[523, 0, .15], [659, .15, .15], [784, .3, .15], [1047, .45, .4], [784, .9, .12], [1047, 1.02, .5]], pop: [[900, 0, .05, 'sine', .07], [1300, .05, .06, 'sine', .05]]
  };
  sound.play = kind => { if (!sound.enabled) return; for (const p of patterns[kind] || []) tone(p[1] === undefined ? 440 : p[0], p[1], p[2], p[3], p[4]); };
  sound.music = on => {
    clearInterval(sound.musicTimer); sound.musicTimer = null; if (!on || !sound.enabled) return;
    const notes = [262, 330, 392, 330, 294, 349, 440, 349, 262, 330, 392, 523, 392, 330, 294, 247]; let i = 0;
    sound.musicTimer = setInterval(() => { if (!sound.enabled) return; tone(notes[i % notes.length], 0, .16, 'triangle', .035); if (i % 4 === 0) tone(notes[i % notes.length] / 2, 0, .3, 'sine', .03); i++; }, 230);
  };
  sound.toggle = () => { sound.enabled = !sound.enabled; localStorage.setItem('kq-sound', sound.enabled ? 'on' : 'off'); if (!sound.enabled) sound.music(false); return sound.enabled; };
  KQ.soundButton = () => { const b = KQ.btn(sound.enabled ? '소리 켬' : '소리 끔', () => { const on = sound.toggle(); b.textContent = on ? '소리 켬' : '소리 끔'; b.setAttribute('aria-pressed', String(on)); }, 'ghost small', { 'aria-pressed': String(sound.enabled) }); return b; };

  // 서버 시간 보정과 실시간 스트림
  let offset = 0;
  KQ.now = () => Date.now() + offset;
  KQ.secondsLeft = endsAt => endsAt ? Math.max(0, Math.ceil((endsAt - KQ.now()) / 1000)) : 0;
  KQ.stream = (pin, role, onState, onStatus = () => {}) => {
    let es = null, closed = false, retry = null;
    const open = () => {
      if (closed) return;
      es = new EventSource(`/api/games/${encodeURIComponent(pin)}/stream?role=${role}`);
      es.addEventListener('state', ev => { let v; try { v = JSON.parse(ev.data); } catch { return; } if (v.serverNow) offset = v.serverNow - Date.now(); onStatus('ok'); onState(v); });
      es.addEventListener('gone', () => { onStatus('gone'); close(); });
      es.onerror = () => { onStatus('reconnecting'); if (es.readyState === 2) { clearTimeout(retry); retry = setTimeout(open, 1500); } };
    };
    const close = () => { closed = true; clearTimeout(retry); es?.close(); };
    open();
    return { close };
  };

  // 모달
  let current = null;
  KQ.modal = (title, opts = {}) => {
    KQ.closeModal(true);
    const prev = document.activeElement;
    const body = el('div', { class: 'modal-body' }), foot = el('div', { class: 'modal-foot' });
    const box = el('section', { class: 'modal' + (opts.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'kq-modal-title', tabindex: '-1' }, el('header', { class: 'modal-head' }, el('h2', { id: 'kq-modal-title' }, title), el('button', { type: 'button', class: 'modal-x', 'aria-label': '닫기', onClick: () => KQ.closeModal() }, '×')), body, foot);
    const overlay = el('div', { class: 'modal-overlay', onClick: e => { if (e.target === overlay && !opts.sticky) KQ.closeModal(); } }, box);
    box.addEventListener('keydown', e => { if (e.key === 'Escape' && !opts.sticky) KQ.closeModal(); });
    $('modal-root').replaceChildren(overlay); document.body.classList.add('modal-open');
    current = { root: box, body, foot, prev, onClose: opts.onClose, close: () => KQ.closeModal(true) };
    requestAnimationFrame(() => (box.querySelector('input,textarea,select') || box).focus());
    return current;
  };
  KQ.closeModal = (force = false) => { if (!current) return; const c = current; current = null; $('modal-root').replaceChildren(); document.body.classList.remove('modal-open'); try { c.onClose?.(); } catch {} if (c.prev?.isConnected) c.prev.focus(); };
  KQ.confirm = (message, okText = '확인', danger = false) => new Promise(resolve => {
    let done = false; const finish = v => { if (done) return; done = true; resolve(v); };
    const m = KQ.modal('확인', { onClose: () => finish(false) });
    m.body.append(el('p', {}, message));
    m.foot.append(KQ.btn('취소', () => { finish(false); KQ.closeModal(true); }, 'ghost'), KQ.btn(okText, () => { finish(true); KQ.closeModal(true); }, danger ? 'danger' : 'primary'));
  });

  KQ.topbar = (...right) => el('header', { class: 'topbar' }, el('a', { href: '/', 'data-link': '', class: 'brand', 'aria-label': '반짝퀴즈 처음 화면' }, el('span', { class: 'brand-mark', 'aria-hidden': 'true' }, '반짝'), '퀴즈'), el('div', { class: 'topbar-right' }, ...right));
  const adj = ['용감한', '반짝이는', '신나는', '똑똑한', '날쌘', '씩씩한', '빛나는', '즐거운', '느긋한', '호기심 많은', '튼튼한', '상냥한'];
  const noun = ['고래', '토끼', '다람쥐', '펭귄', '여우', '거북이', '수달', '부엉이', '돌고래', '판다', '참새', '고양이', '해바라기', '별똥별'];
  KQ.randomNickname = () => adj[Math.floor(Math.random() * adj.length)] + ' ' + noun[Math.floor(Math.random() * noun.length)];
  KQ.modeMeta = id => window.KQModes?.get(id) || { id, name: id, renderHost() {}, renderPlayer() {}, dispose() {} };
  KQ.fmtDate = v => { const d = new Date(v); return Number.isNaN(+d) ? '' : d.toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); };
  KQ.typeNames = { quiz: '퀴즈', truefalse: '참/거짓', type: '주관식', poll: '설문', puzzle: '순서 맞추기', slider: '숫자 슬라이더' };

  document.addEventListener('DOMContentLoaded', async () => {
    try { await KQ.refreshMe(); } catch (e) { KQ.render(errorPage(e)); return; }
    dispatch();
  });
})();
