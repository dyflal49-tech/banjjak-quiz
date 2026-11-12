'use strict';
// 반짝퀴즈 Firebase 연결: 서버 없이 Firestore 로 동작 (GitHub Pages 배포용).
// 게임 진행(채점·순위·모드)은 선생님(진행자) 브라우저의 엔진이 맡고, 학생 답과 화면 상태는 Firestore 로 실시간 전달합니다.
(() => {
  const KQ = window.KQ, E = window.KQEngine;
  const TEACHER_EMAIL = 'dyflal49@gmail.com';
  const CFG = {
    apiKey: 'AIzaSyACQ-OaIyCbMYPmY8f4ElNnKdK3c9mNs5A',
    authDomain: 'claude-padlet.firebaseapp.com',
    projectId: 'claude-padlet',
    storageBucket: 'claude-padlet.firebasestorage.app',
    messagingSenderId: '555333083760',
    appId: '1:555333083760:web:ad904023e986ffa2becab5'
  };
  if (!window.firebase || !KQ || !E) {
    console.error('Firebase SDK 또는 게임 엔진을 불러오지 못했어요.');
    KQ && (KQ.refreshMe = async () => { throw Object.assign(new Error('Firebase에 연결하지 못했어요. 인터넷 연결을 확인하고 새로고침하세요.'), { status: 0 }); });
    return;
  }
  // 우리반 보드와 로그인 저장소를 나눠 쓰도록 별도 앱 이름 사용. 탭마다 따로 로그인(새로고침해도 유지).
  const app = firebase.initializeApp(CFG, 'banjjak-quiz');
  const auth = app.auth();
  const fdb = app.firestore();
  const persist = auth.setPersistence(firebase.auth.Auth.Persistence.SESSION).catch(() => {});
  const TS = () => firebase.firestore.FieldValue.serverTimestamp();
  const SITE = location.origin + (KQ.BASE || '');
  E.HOOKS.site = SITE;
  const col = n => fdb.collection(n);
  const gameRef = pin => col('kq_games').doc(String(pin));
  const fail = (status, message) => { const e = new Error(message); e.status = status; throw e; };
  const isTeacher = () => !!auth.currentUser && !auth.currentUser.isAnonymous && auth.currentUser.email === TEACHER_EMAIL;
  const uid = () => (auth.currentUser ? auth.currentUser.uid : null);
  const needTeacher = () => { if (!isTeacher()) fail(401, '선생님 로그인이 필요합니다.'); };
  const safeParse = s => { try { return JSON.parse(s); } catch { return null; } };
  const nowIso = () => new Date().toISOString();

  // ---------- 인증 (학생은 익명 로그인) ----------
  let authError = null, signingIn = false;
  let readyResolve; const ready = new Promise(r => { readyResolve = r; });
  auth.onAuthStateChanged(async u => {
    if (u) { authError = null; readyResolve(); return; }
    if (signingIn) return;
    signingIn = true;
    try { await persist; if (!auth.currentUser) await auth.signInAnonymously(); } catch (e) { authError = e; readyResolve(); } finally { signingIn = false; }
  });
  async function waitUser(ms = 8000) { const end = Date.now() + ms; while (!auth.currentUser && Date.now() < end && !authError) await new Promise(r => setTimeout(r, 60)); }

  function friendly(e) {
    if (e && e.status !== undefined && !e.code) return e;
    const c = (e && e.code) || '';
    const map = {
      'permission-denied': [403, '권한이 없어요. 선생님 로그인 상태를 확인하세요.'],
      'unauthenticated': [401, '로그인이 필요해요.'],
      'unavailable': [0, '인터넷 연결을 확인하세요.'],
      'resource-exhausted': [429, '오늘 Firebase 무료 사용량을 모두 썼어요. 내일 다시 시도하세요.'],
      'auth/invalid-credential': [401, '비밀번호가 맞지 않아요.'],
      'auth/invalid-login-credentials': [401, '비밀번호가 맞지 않아요.'],
      'auth/wrong-password': [401, '비밀번호가 맞지 않아요.'],
      'auth/user-not-found': [401, '선생님 계정을 찾을 수 없어요.'],
      'auth/missing-password': [400, '비밀번호를 입력하세요.'],
      'auth/too-many-requests': [429, '로그인 시도가 너무 많아요. 잠시 후 다시 시도하세요.'],
      'auth/network-request-failed': [0, '인터넷 연결을 확인하세요.'],
      'auth/operation-not-allowed': [503, '학생 접속(익명 로그인)이 Firebase에서 꺼져 있어요. 선생님께 알려 주세요.'],
      'auth/admin-restricted-operation': [503, '학생 접속(익명 로그인)이 Firebase에서 꺼져 있어요. 선생님께 알려 주세요.']
    };
    const m = map[c];
    const err = new Error(m ? m[1] : (e && e.message) || '문제가 생겼어요. 잠시 후 다시 시도하세요.');
    err.status = m ? m[0] : (e && e.status) || 500; return err;
  }

  KQ.refreshMe = async () => {
    await ready; await waitUser();
    const t = isTeacher();
    let name = '선생님'; try { name = localStorage.getItem('kq-teacher-name') || auth.currentUser?.displayName || '선생님'; } catch {}
    KQ.me = { teacher: t ? { name } : null, setupNeeded: false, isLocal: false, addresses: [SITE], port: '', firebase: true, teacherEmail: TEACHER_EMAIL, authError: authError ? friendly(authError).message : null };
    return KQ.me;
  };

  // ---------- 이미지 (Firestore 문서에 압축 저장) ----------
  const imgCache = new Map();
  function loadImage(ref) {
    const iid = String(ref).slice(6);
    if (!imgCache.has(iid)) imgCache.set(iid, col('kq_images').doc(iid).get().then(s => (s.exists ? s.data().data : '')).catch(() => ''));
    return imgCache.get(iid);
  }
  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
  const origEl = KQ.el;
  KQ.el = (tag, attrs, ...children) => {
    if (tag === 'img' && attrs && typeof attrs.src === 'string' && attrs.src.startsWith('kqimg:')) {
      const ref = attrs.src; const node = origEl(tag, { ...attrs, src: BLANK }, ...children);
      loadImage(ref).then(d => { if (d) node.src = d; }); return node;
    }
    return origEl(tag, attrs, ...children);
  };
  async function shrink(src) {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(Object.assign(new Error('이미지를 열 수 없어요.'), { status: 400 })); i.src = src; });
    let max = 1280, q = 0.85;
    for (let k = 0; k < 9; k++) {
      const sc = Math.min(1, max / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round((img.naturalWidth || 1) * sc)); c.height = Math.max(1, Math.round((img.naturalHeight || 1) * sc));
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
      const out = c.toDataURL('image/jpeg', q); if (out.length < 700000) return out;
      max = Math.round(max * 0.8); q = Math.max(0.5, q - 0.07);
    }
    fail(413, '이미지가 너무 커요. 더 작은 이미지를 골라 주세요.');
  }
  async function storeImage(d) {
    const type = String(d.type || '').toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(type)) fail(400, 'JPG, PNG, GIF, WEBP 이미지만 올릴 수 있어요.');
    if (typeof d.data !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(d.data)) fail(400, '이미지 자료가 올바르지 않아요.');
    if (d.data.length * 0.75 > 2.2 * 1024 * 1024) fail(413, '이미지는 2MB 이하로 올려 주세요.');
    let url = `data:${type};base64,${d.data}`;
    if (url.length > 700000) url = await shrink(url);
    const code = isTeacher() ? '' : String(d.code || '').toUpperCase();
    if (!isTeacher() && !/^[A-Z0-9]{6}$/.test(code)) fail(403, '이미지를 올릴 권한이 없어요.');
    const iid = E.id();
    await col('kq_images').doc(iid).set({ data: url, code, by: uid(), at: TS() });
    imgCache.set(iid, Promise.resolve(url));
    return { url: 'kqimg:' + iid };
  }

  // ---------- 퀴즈 ----------
  const quizRef = qid => col('kq_quizzes').doc(String(qid));
  async function loadQuiz(qid) { needTeacher(); const s = await quizRef(qid).get(); if (!s.exists) fail(404, '퀴즈를 찾을 수 없어요.'); return { id: s.id, ...s.data() }; }
  const quizView = q => ({ ...q, questions: (q.questions || []).map(E.publicQuestion) });
  async function newCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let i = 0; i < 15; i++) { const c = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''); const s = await col('kq_codes').doc(c).get(); if (!s.exists) return c; }
    fail(500, '출제 코드를 만들지 못했어요. 다시 시도하세요.');
  }
  async function saveQuiz(q) {
    const { id: qid, ...data } = q;
    const batch = fdb.batch();
    batch.set(quizRef(qid), JSON.parse(JSON.stringify(data)));
    batch.set(col('kq_codes').doc(q.submissionCode), { quizId: qid, title: q.title, description: q.description || '', accepting: !!q.acceptSubmissions, updatedAt: TS() });
    await batch.commit();
  }
  async function pendingCounts() {
    const s = await col('kq_submissions').where('status', '==', 'pending').get(); const m = {};
    s.forEach(d => { const k = d.data().quizId; m[k] = (m[k] || 0) + 1; }); return m;
  }
  const summary = (q, counts) => ({ id: q.id, title: q.title, description: q.description, theme: q.theme, questionCount: (q.questions || []).length, pendingSubmissions: counts[q.id] || 0, submissionCode: q.submissionCode, acceptSubmissions: !!q.acceptSubmissions, updatedAt: q.updatedAt, createdAt: q.createdAt });

  // ---------- 진행자 엔진 연결 ----------
  const hosts = new Map();
  E.HOOKS.touch = g => { const h = hosts.get(g.pin); if (!h || h.flushT || h.closed) return; h.flushT = setTimeout(() => { h.flushT = null; flush(h); }, 50); };
  E.HOOKS.report = (g, report) => { col('kq_reports').doc(report.id).set(JSON.parse(JSON.stringify(report))).catch(e => KQ.toast('리포트를 저장하지 못했어요: ' + friendly(e).message, true)); };
  function publicDoc(hv) { const { role, serverNow, ...rest } = hv; return rest; }
  function playerDoc(g, h, u) {
    const v = E.playerView(g, u);
    const me = v.me ? { ...v.me } : null; if (me) { delete me.rank; delete me.playerCount; }
    return { k: g.phase + ':' + g.qIndex, me, question: v.question, answered: !!v.answered, lockedUntil: v.lockedUntil || null, result: v.result || null, actions: v.actions || null, questionStartedAt: v.questionStartedAt || null, kicked: !!v.kicked, reply: h.replies.get(u) || null };
  }
  let writeErrorShown = 0;
  function onWriteError(e) { if (Date.now() - writeErrorShown > 8000) { writeErrorShown = Date.now(); KQ.toast('학생 화면으로 보내지 못했어요: ' + friendly(e).message, true); } console.error(e); }
  function flush(h) {
    if (h.closed) return;
    const g = h.g; const hv = E.hostView(g);
    for (const cb of h.listeners) { try { cb(hv); } catch (e) { console.error(e); } }
    const batch = fdb.batch(); let ops = 0;
    const json = JSON.stringify(publicDoc(hv)); const key = g.phase + ':' + g.qIndex;
    if (json !== h.lastPub) {
      const wait = g.pacing === 'player' && key === h.lastKey ? Math.max(0, 1200 - (Date.now() - h.lastPubAt)) : 0;
      if (wait > 0) { if (!h.pubT) h.pubT = setTimeout(() => { h.pubT = null; flush(h); }, wait); }
      else {
        h.lastPub = json; h.lastPubAt = Date.now();
        batch.set(gameRef(g.pin), { v: json, phase: g.phase, mode: g.mode, modeName: g.modeName, quizTitle: g.quizTitle, playerCount: g.players.size, createdAt: g.createdAt, updatedAt: Date.now() }); ops++;
      }
    }
    const uids = new Set([...g.players.values()].map(p => p.deviceKey));
    for (const u of h.replies.keys()) uids.add(u);
    for (const u of g.kicked) uids.add(u);
    for (const u of uids) {
      const j = JSON.stringify(playerDoc(g, h, u));
      if (h.cache.get(u) !== j) { h.cache.set(u, j); batch.set(gameRef(g.pin).collection('players').doc(u), { v: j }); ops++; }
      if (ops >= 480) break;
    }
    const keyChanged = key !== h.lastKey; h.lastKey = key;
    if (keyChanged || Date.now() - h.lastSnap > 3000) { const st = JSON.stringify(serialize(h)); if (st.length < 900000) { batch.set(gameRef(g.pin).collection('private').doc('engine'), { state: st }); ops++; h.lastSnap = Date.now(); } }
    else if (!h.snapT) h.snapT = setTimeout(() => { h.snapT = null; E.HOOKS.touch(g); }, 3100);
    if (ops) batch.commit().catch(onWriteError);
  }
  function serialize(h) {
    const g = h.g;
    return { pin: g.pin, quizId: g.quizId, quizTitle: g.quizTitle, mode: g.mode, modeName: g.modeName, pacing: g.pacing, options: g.options, questions: g.questions, phase: g.phase, locked: g.locked, createdAt: g.createdAt,
      qIndex: g.qIndex, endsAt: g.endsAt, startAt: g.startAt, players: [...g.players.values()], kicked: [...g.kicked], answers: [...g.answers.values()], stats: g.stats, feed: g.feed, teams: g.teams, ms: g.ms, reportId: g.reportId, resultSeq: g.resultSeq,
      autoAt: g.autoAt || null, lastTs: h.lastTs, processed: [...h.processed].slice(-1500) };
  }
  function restore(s) {
    const g = { ...s, players: new Map(s.players.map(p => [p.id, p])), kicked: new Set(s.kicked), answers: new Map(s.answers.map(a => [a.playerId, a])), clients: new Set(), timer: null, autoTimer: null, touched: Date.now() };
    if (!g.options || g.options.autoAdvance === undefined) g.options = { ...(g.options || {}), autoAdvance: 0 };
    for (const p of g.players.values()) if (p.finishedRank === undefined) p.finishedRank = null;
    delete g.lastTs; delete g.processed;
    E.games.set(g.pin, g);
    const left = Math.max(0, (g.endsAt || 0) - Date.now());
    if (g.phase === 'countdown') E.setTimer(g, left, () => (g.pacing === 'host' ? E.startQuestion(g) : E.startRun(g)));
    else if (g.phase === 'question') E.setTimer(g, left, () => E.reveal(g));
    else if (g.phase === 'running') E.setTimer(g, left, () => E.finish(g));
    else if (['reveal', 'leaderboard'].includes(g.phase) && s.autoAt) E.scheduleAuto(g, s.autoAt - Date.now());
    return g;
  }
  function handle(h, docId, d) {
    const g = h.g, u = d.uid; let reply;
    try {
      if (!u) fail(400, '잘못된 요청이에요.');
      if (d.type === 'join') {
        const p = E.joinGame(g, u, d.nickname, d.avatar); p.conns = 1;
        reply = { ok: true, body: { me: { id: p.id, nickname: p.nickname, team: p.team, teamName: g.teams ? g.teams[p.team].name : null, avatar: p.avatar || null } } };
      } else {
        const p = [...g.players.values()].find(x => x.deviceKey === u);
        if (!p) fail(403, g.kicked.has(u) ? '진행자가 이 기기를 게임에서 내보냈어요.' : '먼저 게임에 참가하세요.');
        if (d.type === 'answer') { const r = E.submitAnswer(g, p, String(d.questionId || ''), d.answer); reply = { ok: true, body: { ok: true, ...r } }; }
        else if (d.type === 'action') {
          if (d.kind === 'claim') E.claimTile(g, p, d.target);
          else if (d.kind === 'launch') E.launchEnergy(g, p, d.target);
          else if (d.kind === 'chest') { if (g.mode !== 'treasure' || g.phase !== 'running') fail(400, '지금은 상자를 열 수 없어요.'); E.openChest(g, p, d.target); }
          else fail(400, '알 수 없는 행동이에요.');
          reply = { ok: true, body: { ok: true, result: p.result, actions: p.actions } };
        } else fail(400, '알 수 없는 요청이에요.');
      }
    } catch (e) { if (!e.status) console.error(e); reply = { ok: false, status: e.status || 500, error: e.status ? e.message : '처리 중 문제가 생겼어요.' }; }
    h.replies.set(u, { id: d.reqId || docId, ...reply });
    const ms = d.at && d.at.toMillis ? d.at.toMillis() : 0; if (ms > h.lastTs) h.lastTs = ms;
    E.HOOKS.touch(g);
  }
  function listenInbox(h) {
    const since = firebase.firestore.Timestamp.fromMillis(Math.max(0, (h.lastTs || h.g.createdAt) - 3000));
    h.unsub = gameRef(h.g.pin).collection('inbox').where('at', '>', since).orderBy('at').onSnapshot(snap => {
      for (const ch of snap.docChanges()) {
        if (ch.type === 'removed' || h.processed.has(ch.doc.id)) continue;
        const d = ch.doc.data({ serverTimestamps: 'estimate' });
        h.processed.add(ch.doc.id); handle(h, ch.doc.id, d);
      }
    }, e => { KQ.toast('학생 답을 받는 연결에 문제가 생겼어요: ' + friendly(e).message, true); });
  }
  async function hostAttach(pin) {
    needTeacher();
    let h = hosts.get(pin); if (h) return h;
    let g = E.games.get(pin), saved = null;
    if (!g) {
      const s = await gameRef(pin).collection('private').doc('engine').get();
      if (!s.exists) fail(404, '게임을 찾을 수 없어요.');
      saved = safeParse(s.data().state); if (!saved) fail(500, '저장된 게임 상태를 읽지 못했어요.');
      g = restore(saved);
    }
    h = { g, listeners: new Set(), processed: new Set(saved ? saved.processed || [] : []), lastTs: saved ? saved.lastTs || 0 : 0, cache: new Map(), replies: new Map(), lastPub: null, lastKey: null, lastPubAt: 0, lastSnap: 0 };
    hosts.set(pin, h); listenInbox(h);
    h.lockT = setInterval(() => {
      let changed = false;
      for (const p of g.players.values()) if (p.lockedUntil && p.lockedUntil <= Date.now()) { p.lockedUntil = null; changed = true; }
      if (changed) E.HOOKS.touch(g);
    }, 500);
    flush(h);
    return h;
  }
  async function closeHost(pin) {
    const h = hosts.get(pin); const g = (h && h.g) || E.games.get(pin);
    if (h) { h.closed = true; try { h.unsub && h.unsub(); } catch {} clearInterval(h.lockT); clearTimeout(h.flushT); clearTimeout(h.pubT); clearTimeout(h.snapT); hosts.delete(pin); }
    if (g) { E.clearTimer(g); E.clearAuto(g); E.games.delete(pin); }
    const b = fdb.batch(); b.delete(gameRef(pin)); b.delete(gameRef(pin).collection('private').doc('engine')); await b.commit();
  }
  window.addEventListener('beforeunload', e => { for (const h of hosts.values()) if (!['lobby', 'finished'].includes(h.g.phase)) { flush(h); e.preventDefault(); e.returnValue = ''; } });

  // ---------- 학생 요청(답·참가·행동)은 inbox 로 보내고 진행자 응답을 기다림 ----------
  const pdSubs = new Map();
  function watchPlayerDoc(pin, cb) {
    const k = String(pin); let e = pdSubs.get(k);
    if (!e) {
      e = { data: undefined, subs: new Set() };
      e.unsub = gameRef(k).collection('players').doc(uid()).onSnapshot(s => { e.data = s.exists ? safeParse(s.data().v) : null; for (const f of e.subs) f(e.data); }, err => console.error(err));
      pdSubs.set(k, e);
    }
    e.subs.add(cb); if (e.data !== undefined) cb(e.data);
    return () => { e.subs.delete(cb); if (!e.subs.size) { try { e.unsub(); } catch {} pdSubs.delete(k); } };
  }
  async function request(pin, type, payload) {
    await ready; await waitUser();
    if (!uid()) throw friendly(authError || { code: 'auth/operation-not-allowed' });
    const reqId = E.id();
    let off = null;
    const waiter = new Promise((resolve, reject) => {
      const t = setTimeout(() => { off && off(); reject(Object.assign(new Error('선생님 화면이 응답하지 않아요. 진행자 화면이 켜져 있는지 확인하세요.'), { status: 504 })); }, 15000);
      off = watchPlayerDoc(pin, d => {
        const r = d && d.reply; if (!r || r.id !== reqId) return;
        clearTimeout(t); setTimeout(() => off && off(), 0);
        if (r.ok) resolve(r.body); else reject(Object.assign(new Error(r.error || '요청을 처리하지 못했어요.'), { status: r.status || 500 }));
      });
    });
    const doc = { uid: uid(), type, reqId, at: TS() };
    for (const [k, v] of Object.entries(payload)) if (v !== undefined) doc[k] = v;
    try { await gameRef(pin).collection('inbox').add(doc); } catch (e) { off && off(); throw friendly(e); }
    return waiter;
  }

  // ---------- 실시간 화면 스트림 ----------
  KQ.stream = (pin, role, onState, onStatus = () => {}) => {
    let closed = false; const offs = [];
    const close = () => { closed = true; while (offs.length) { try { offs.pop()(); } catch {} } };
    (async () => {
      try { await ready; await waitUser(); } catch {}
      if (closed) return;
      if (role === 'host') {
        try {
          const h = await hostAttach(String(pin)); if (closed) return;
          const cb = v => { if (!closed) onState(v); };
          h.listeners.add(cb); offs.push(() => h.listeners.delete(cb));
          onStatus('ok'); onState(E.hostView(h.g));
        } catch (e) { console.error(e); onStatus('gone'); }
        return;
      }
      let gd = null, pd = null;
      const emit = () => { if (!closed && gd) onState(compose(pin, gd, pd)); };
      offs.push(gameRef(pin).onSnapshot(s => {
        if (!s.exists) { onStatus('gone'); close(); return; }
        gd = safeParse(s.data().v); onStatus('ok'); emit();
      }, () => onStatus('reconnecting')));
      offs.push(watchPlayerDoc(pin, d => { pd = d; emit(); }));
    })();
    return { close };
  };
  function compose(pin, gd, pd) {
    const fresh = pd && pd.k === gd.phase + ':' + gd.questionIndex;
    const me = pd && pd.me ? { ...pd.me } : null;
    if (me) { const idx = (gd.players || []).findIndex(p => p.id === me.id); me.rank = idx >= 0 ? idx + 1 : (gd.playerCount || 1); me.playerCount = gd.playerCount || 1; }
    return {
      role: 'player', pin: String(pin), mode: gd.mode, modeName: gd.modeName, pacing: gd.pacing, phase: gd.phase, serverNow: Date.now(), quizTitle: gd.quizTitle,
      kicked: !!(pd && pd.kicked), endsAt: gd.endsAt, autoAt: gd.autoAt || null, modeState: gd.modeState || {}, me,
      question: fresh ? pd.question : null, answered: fresh ? !!pd.answered : false, lockedUntil: pd ? pd.lockedUntil : null,
      result: fresh || gd.pacing === 'player' ? (pd && pd.result) || null : null, actions: fresh ? pd.actions : null, questionStartedAt: pd ? pd.questionStartedAt : null,
      leaderboard: gd.mode === 'classic' && ['leaderboard', 'finished'].includes(gd.phase) ? gd.leaderboard || [] : [], podium: gd.phase === 'finished' ? gd.podium || [] : []
    };
  }

  // ---------- 내려받기 (퀴즈 내보내기, 리포트 CSV) ----------
  function saveBlob(text, type, filename) {
    const url = URL.createObjectURL(new Blob([text], { type })); const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  async function download(p) {
    let m;
    if ((m = p.match(/\/api\/quizzes\/([^/]+)\/export$/))) {
      const q = await loadQuiz(decodeURIComponent(m[1]));
      const data = JSON.stringify({ format: 'banjjak-quiz-v1', exportedAt: nowIso(), quiz: { title: q.title, description: q.description, theme: q.theme, questions: (q.questions || []).map(E.publicQuestion) } }, null, 2);
      return saveBlob(data, 'application/json', q.title + '.json');
    }
    if ((m = p.match(/\/api\/reports\/([^/]+)\/csv$/))) {
      needTeacher(); const s = await col('kq_reports').doc(decodeURIComponent(m[1])).get(); if (!s.exists) fail(404, '리포트를 찾을 수 없어요.'); const r = s.data();
      const cell = v => { let t = String(v ?? ''); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"'; };
      const rows = [['순위', '닉네임', '팀', '점수', '정답 수', '응답 수', '정답률']].concat((r.players || []).map(x => [x.rank, x.nickname, x.team || '', x.score, x.correct, x.answered, x.answered ? Math.round(x.correct / x.answered * 100) + '%' : '']));
      rows.push([], ['문제', '유형', '응답 수', '정답 수', '정답률']); for (const q of r.questions || []) rows.push([q.text, q.type, q.answered, q.correct, q.accuracy === null ? '' : Math.round(q.accuracy * 100) + '%']);
      return saveBlob('\ufeff' + rows.map(row => row.map(cell).join(',')).join('\r\n'), 'text/csv', r.quizTitle + '-결과.csv');
    }
  }
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href]'); if (!a) return;
    const href = a.getAttribute('href') || ''; if (!href.includes('/api/')) return;
    e.preventDefault(); e.stopPropagation();
    download(new URL(href, 'https://kq.local').pathname).catch(err => KQ.toast(friendly(err).message, true));
  }, true);

  // ---------- API 라우터 (server.js 와 같은 주소·응답 형태) ----------
  async function route(method, p, d) {
    let m;
    if (p === '/api/me') { await KQ.refreshMe(); return KQ.me; }
    if (p === '/api/setup') fail(400, '이 사이트는 우리반 보드와 같은 선생님 계정(' + TEACHER_EMAIL + ')으로 로그인해요.');
    if (p === '/api/login' && method === 'POST') {
      const pw = String(d.password || ''); if (!pw) fail(400, '비밀번호를 입력하세요.');
      await persist; await auth.signInWithEmailAndPassword(TEACHER_EMAIL, pw); await KQ.refreshMe(); return { ok: true };
    }
    if (p === '/api/logout' && method === 'POST') { await auth.signOut(); await waitUser(); await KQ.refreshMe(); return { ok: true }; }
    if (p === '/api/modes') return { modes: E.MODES };
    if (p === '/api/nickname') return { nickname: E.randomNick() };
    if (p === '/api/uploads' && method === 'POST') return storeImage(d || {});

    // 퀴즈
    if (p === '/api/quizzes' && method === 'GET') {
      needTeacher(); const [s, counts] = await Promise.all([col('kq_quizzes').get(), pendingCounts()]);
      const list = []; s.forEach(x => list.push({ id: x.id, ...x.data() }));
      list.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))); return { quizzes: list.map(q => summary(q, counts)) };
    }
    if (p === '/api/quizzes' && method === 'POST') {
      needTeacher(); const q = { id: E.id(), ...E.quizFromInput(d || {}), submissionCode: await newCode(), acceptSubmissions: false, createdAt: nowIso(), updatedAt: nowIso() };
      await saveQuiz(q); return { quiz: quizView(q) };
    }
    if (p === '/api/quizzes/import' && method === 'POST') {
      needTeacher(); const src = d && d.data && (d.data.quiz || d.data); if (!src || typeof src !== 'object') fail(400, '반짝퀴즈에서 내보낸 퀴즈 파일이 아니에요.');
      const qs = (Array.isArray(src.questions) ? src.questions : []).map(q => ({ ...q, id: undefined, image: typeof q.image === 'string' && q.image.startsWith('kqimg:') ? q.image : null }));
      const q = { id: E.id(), ...E.quizFromInput({ ...src, title: E.clean(src.title, 70) + ' (가져옴)', questions: qs }), submissionCode: await newCode(), acceptSubmissions: false, createdAt: nowIso(), updatedAt: nowIso() };
      await saveQuiz(q); return { quiz: quizView(q) };
    }
    if ((m = p.match(/^\/api\/quizzes\/([^/]+)(?:\/(duplicate|code|submissions))?$/))) {
      const q = await loadQuiz(decodeURIComponent(m[1])), action = m[2];
      if (!action && method === 'GET') return { quiz: quizView(q) };
      if (!action && method === 'PUT') {
        Object.assign(q, E.quizFromInput(d || {}, q)); if (typeof d.acceptSubmissions === 'boolean') q.acceptSubmissions = d.acceptSubmissions;
        q.updatedAt = nowIso(); await saveQuiz(q); return { quiz: quizView(q) };
      }
      if (!action && method === 'DELETE') {
        const subs = await col('kq_submissions').where('quizId', '==', q.id).get();
        const b = fdb.batch(); b.delete(quizRef(q.id)); b.delete(col('kq_codes').doc(q.submissionCode)); subs.forEach(s => b.delete(s.ref)); await b.commit(); return { ok: true };
      }
      if (action === 'duplicate' && method === 'POST') {
        const copy = JSON.parse(JSON.stringify(q)); copy.id = E.id(); copy.title = (q.title + ' (복사본)').slice(0, 80); copy.submissionCode = await newCode(); copy.acceptSubmissions = false; copy.createdAt = copy.updatedAt = nowIso();
        copy.questions.forEach(x => { x.id = E.id(); }); await saveQuiz(copy); return { quiz: quizView(copy) };
      }
      if (action === 'code' && method === 'POST') {
        const old = q.submissionCode; q.submissionCode = await newCode(); q.updatedAt = nowIso(); await saveQuiz(q);
        await col('kq_codes').doc(old).delete().catch(() => {}); return { quiz: quizView(q) };
      }
      if (action === 'submissions' && method === 'GET') {
        const s = await col('kq_submissions').where('quizId', '==', q.id).get(); const list = [];
        s.forEach(x => { const v = x.data(); list.push({ id: x.id, authorName: v.authorName, question: E.publicQuestion(v.question), status: v.status, createdAt: v.createdAt }); });
        list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))); return { submissions: list };
      }
    }
    if ((m = p.match(/^\/api\/submissions\/([^/]+)\/(approve|reject)$/)) && method === 'POST') {
      needTeacher(); const ref = col('kq_submissions').doc(decodeURIComponent(m[1])); const s = await ref.get(); if (!s.exists) fail(404, '학생 문제를 찾을 수 없어요.');
      const sub = s.data();
      if (m[2] === 'reject') { await ref.update({ status: 'rejected' }); return { ok: true }; }
      if (sub.status === 'approved') fail(409, '이미 채택한 문제예요.');
      const q = await loadQuiz(sub.quizId); if ((q.questions || []).length >= 200) fail(400, '퀴즈 문제가 200개로 가득 찼어요.');
      const nq = E.normQuestion(d && d.question ? { ...d.question, id: undefined } : { ...sub.question, id: undefined }, q.questions.length);
      nq.authorName = sub.authorName; nq.authorKey = sub.authorUid; q.questions.push(nq); q.updatedAt = nowIso();
      await saveQuiz(q); await ref.update({ status: 'approved' }); return { quiz: quizView(q) };
    }
    // 학생 출제
    if ((m = p.match(/^\/api\/submit\/([A-Za-z0-9]{6})(?:\/([^/]+))?$/))) {
      const code = m[1].toUpperCase(); const cs = await col('kq_codes').doc(code).get();
      if (!cs.exists) fail(404, '문제 내기 코드를 찾을 수 없어요. 선생님께 코드를 다시 확인하세요.');
      const info = cs.data(); const me = uid();
      const mine = async () => { const s = await col('kq_submissions').where('quizId', '==', info.quizId).where('authorUid', '==', me).get(); const list = []; s.forEach(x => list.push({ id: x.id, ...x.data() })); return list.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))); };
      if (method === 'GET' && !m[2]) { const list = await mine(); return { quiz: { title: info.title, description: info.description, accepting: !!info.accepting }, nickname: list.length ? list[list.length - 1].authorName : null, mine: list.slice().reverse().map(s => ({ id: s.id, status: s.status, question: s.question, createdAt: s.createdAt })) }; }
      if (method === 'POST' && !m[2]) {
        if (!info.accepting) fail(403, '지금은 문제를 받지 않고 있어요. 선생님께 말씀드리세요.');
        const nick = E.clean(d.nickname, 15); if (!nick) fail(400, '닉네임을 입력하세요.'); if (E.badName(nick)) fail(400, '친구들이 기분 좋게 볼 수 있는 닉네임을 써 주세요.');
        if ((await mine()).filter(s => s.status === 'pending').length >= 20) fail(429, '검토를 기다리는 문제가 20개예요. 선생님이 확인한 뒤에 더 내 주세요.');
        const q = E.normQuestion({ ...(d.question || {}), id: undefined }, 0); q.authorName = nick; delete q.authorKey;
        const doc = { quizId: info.quizId, code, authorUid: me, authorName: nick, question: JSON.parse(JSON.stringify(q)), status: 'pending', createdAt: nowIso(), at: TS() };
        const ref = await col('kq_submissions').add(doc);
        return { submission: { id: ref.id, status: 'pending', question: q, createdAt: doc.createdAt } };
      }
      if (method === 'DELETE' && m[2]) {
        const ref = col('kq_submissions').doc(decodeURIComponent(m[2])); const s = await ref.get();
        if (!s.exists || s.data().authorUid !== me) fail(404, '문제를 찾을 수 없어요.'); if (s.data().status !== 'pending') fail(409, '이미 검토가 끝난 문제는 지울 수 없어요.');
        await ref.delete(); return { ok: true };
      }
    }
    // 게임
    if (p === '/api/games' && method === 'GET') {
      needTeacher(); const s = await col('kq_games').where('updatedAt', '>', Date.now() - 8 * 3600000).orderBy('updatedAt', 'desc').limit(20).get(); const list = [];
      s.forEach(x => { const v = x.data(); if (v.phase !== 'finished') list.push({ pin: x.id, quizTitle: v.quizTitle, mode: v.mode, modeName: v.modeName, phase: v.phase, playerCount: v.playerCount || 0, createdAt: new Date(v.createdAt || Date.now()).toISOString() }); });
      return { games: list };
    }
    if (p === '/api/games' && method === 'POST') {
      needTeacher(); const q = await loadQuiz(d.quizId);
      let g; for (let i = 0; i < 6; i++) { g = E.createGame(q, d.mode, d.options); const ex = await gameRef(g.pin).get(); if (!ex.exists) break; E.games.delete(g.pin); g = null; }
      if (!g) fail(500, '게임 PIN을 만들지 못했어요. 다시 시도하세요.');
      await hostAttach(g.pin); return { pin: g.pin };
    }
    if ((m = p.match(/^\/api\/games\/(\d{6})\/(info|host|join|answer|action)$/))) {
      const pin = m[1], action = m[2];
      if (action === 'info') { const s = await gameRef(pin).get(); if (!s.exists) fail(404, '게임을 찾을 수 없어요. PIN을 확인하세요.'); const v = safeParse(s.data().v) || {}; return { pin, mode: v.mode, modeName: v.modeName, quizTitle: v.quizTitle, phase: v.phase, locked: v.locked }; }
      if (action === 'host') {
        const h = await hostAttach(pin); const g = h.g; const a = d.action;
        if (a === 'start') E.startGame(g);
        else if (a === 'next') E.hostNext(g);
        else if (a === 'skip') { if (g.phase === 'question') E.reveal(g); else if (g.phase === 'countdown' && g.pacing === 'host') { E.clearTimer(g); E.startQuestion(g); } }
        else if (a === 'lock' || a === 'unlock') { g.locked = a === 'lock'; E.HOOKS.touch(g); }
        else if (a === 'kick') { const pl = g.players.get(String(d.playerId)); if (!pl) fail(404, '참가자를 찾을 수 없어요.'); g.kicked.add(pl.deviceKey); g.players.delete(pl.id); g.answers.delete(pl.id); if (g.phase === 'question' && E.expectedPlayers(g).length && g.answers.size >= E.expectedPlayers(g).length) E.reveal(g); E.HOOKS.touch(g); }
        else if (a === 'settings') E.applySettings(g, (d && d.options) || {});
        else if (a === 'end') E.finish(g);
        else if (a === 'close') { await closeHost(pin); return { ok: true }; }
        else fail(400, '알 수 없는 진행 명령이에요.');
        flush(h); return { ok: true, phase: g.phase };
      }
      if (action === 'join') return request(pin, 'join', { nickname: E.clean(d && d.nickname, 15), avatar: E.normAvatar(d && d.avatar) });
      if (action === 'answer') return request(pin, 'answer', { questionId: String(d.questionId || ''), answer: d.answer === undefined ? null : d.answer });
      if (action === 'action') return request(pin, 'action', { kind: String(d.kind || ''), target: d.target === undefined ? null : d.target });
    }
    // 리포트
    if (p === '/api/reports' && method === 'GET') {
      needTeacher(); const s = await col('kq_reports').orderBy('createdAt', 'desc').limit(300).get(); const list = [];
      s.forEach(x => { const r = x.data(); list.push({ id: x.id, quizTitle: r.quizTitle, mode: r.mode, modeName: r.modeName, playerCount: r.playerCount, createdAt: r.createdAt }); }); return { reports: list };
    }
    if ((m = p.match(/^\/api\/reports\/([^/]+)$/))) {
      needTeacher(); const ref = col('kq_reports').doc(decodeURIComponent(m[1])); const s = await ref.get(); if (!s.exists) fail(404, '리포트를 찾을 수 없어요.');
      if (method === 'DELETE') { await ref.delete(); return { ok: true }; }
      return { report: { id: s.id, ...s.data() } };
    }
    fail(404, '요청한 기능을 찾을 수 없어요.');
  }
  KQ.api = async (url, method = 'GET', data) => {
    try { await ready; const u = new URL(url, 'https://kq.local'); return await route(method, u.pathname, data || {}); }
    catch (e) { const f = friendly(e); if (!e.status && !e.code) console.error(e); throw f; }
  };
})();
