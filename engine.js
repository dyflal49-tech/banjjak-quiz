'use strict';
// 반짝퀴즈 게임 엔진 (진행자 브라우저에서 실행). server.js 의 규칙을 그대로 옮김.
(() => {
  const crypto = {
    randomInt(a, b) { if (b === undefined) { b = a; a = 0; } const r = new Uint32Array(1); globalThis.crypto.getRandomValues(r); return a + (r[0] % (b - a)); },
    randomBytes(n) { const a = new Uint8Array(n); globalThis.crypto.getRandomValues(a); return { toString: () => Array.from(a, x => x.toString(16).padStart(2, '0')).join('') }; }
  };
  const HOOKS = { report() {}, touch() {} };
  const db = { quizzes: [], reports: [] };
  const PORT = '';
  const addresses = () => [HOOKS.site || location.origin];
  function touch(g) { g.touched = Date.now(); HOOKS.touch(g); }
const id = () => crypto.randomBytes(12).toString('hex');
const now = () => Date.now();
const iso = () => new Date().toISOString();
const fail = (status, message) => { const e = new Error(message); e.status = status; throw e; };
const clean = (v, max, fb = '') => String(v ?? fb).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanText = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max);
const shuffle = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// ---------- 문제 정규화 ----------
const THEMES = ['#46178f', '#1368ce', '#26890c', '#e21b3c', '#d89e00', '#0aa3a3', '#864cbf', '#333333'];
const TIMES = [5, 10, 20, 30, 45, 60, 90, 120, 240];
const TYPES = ['quiz', 'truefalse', 'type', 'poll', 'puzzle', 'slider'];
function normQuestion(q, i, keep) {
  const where = (i + 1) + '번 문제: ';
  if (!q || typeof q !== 'object') fail(400, where + '자료가 올바르지 않습니다.');
  const type = TYPES.includes(q.type) ? q.type : fail(400, where + '문제 유형을 선택하세요.');
  const text = cleanText(q.text, 240); if (!text) fail(400, where + '질문을 입력하세요.');
  const timeLimit = TIMES.includes(Number(q.timeLimit)) ? Number(q.timeLimit) : 20;
  let points = ['standard', 'double', 'none'].includes(q.points) ? q.points : 'standard';
  const image = typeof q.image === 'string' && /^kqimg:[a-f0-9]{24}$/.test(q.image) ? q.image : null;
  let choices = [], accepted = [], slider = null;
  const rawChoices = Array.isArray(q.choices) ? q.choices : [];
  if (type === 'quiz' || type === 'poll' || type === 'puzzle') {
    choices = rawChoices.map(c => ({ text: clean(c?.text, 75), correct: type === 'quiz' ? !!c?.correct : false })).filter(c => c.text);
    if (choices.length < 2 || choices.length > 4) fail(400, where + '보기를 2~4개 입력하세요.');
    if (type === 'quiz' && !choices.some(c => c.correct)) fail(400, where + '정답을 하나 이상 고르세요.');
    if (type === 'puzzle') choices = choices.map(c => ({ text: c.text, correct: false }));
  } else if (type === 'truefalse') {
    const trueCorrect = rawChoices[0]?.correct === true, falseCorrect = rawChoices[1]?.correct === true;
    if (trueCorrect === falseCorrect) fail(400, where + '참 또는 거짓 중 정답 하나를 고르세요.');
    choices = [{ text: '참', correct: trueCorrect }, { text: '거짓', correct: falseCorrect }];
  } else if (type === 'type') {
    accepted = [...new Set((Array.isArray(q.accepted) ? q.accepted : []).map(a => clean(a, 20)).filter(Boolean))].slice(0, 5);
    if (!accepted.length) fail(400, where + '인정할 정답을 1개 이상 입력하세요.');
  } else if (type === 'slider') {
    const s = q.slider || {}; const min = Number(s.min), max = Number(s.max), step = Number(s.step ?? 1), answer = Number(s.answer), tolerance = Number(s.tolerance ?? 0);
    if (![min, max, step, answer, tolerance].every(Number.isFinite)) fail(400, where + '슬라이더의 최솟값·최댓값·간격·정답을 숫자로 입력하세요.');
    if (min >= max || step <= 0 || (max - min) / step > 100000) fail(400, where + '슬라이더 범위와 간격을 확인하세요.');
    if (answer < min || answer > max) fail(400, where + '정답이 슬라이더 범위 안에 있어야 합니다.');
    if (tolerance < 0 || tolerance > max - min) fail(400, where + '허용 오차를 확인하세요.');
    slider = { min, max, step, answer, tolerance };
  }
  if (type === 'poll') points = 'none';
  const qid = typeof q.id === 'string' && /^[a-f0-9]{24}$/.test(q.id) ? q.id : id();
  const prev = keep?.get(qid);
  return { id: qid, type, text, image, timeLimit, points, choices, accepted, slider, authorName: prev ? prev.authorName : (q.authorName ? clean(q.authorName, 15) : null), authorKey: prev?.authorKey || null };
}
function normQuestions(list, prevQuestions = []) {
  if (!Array.isArray(list)) fail(400, '문제 목록이 올바르지 않습니다.');
  if (list.length > 200) fail(400, '한 퀴즈에는 문제를 200개까지 넣을 수 있어요.');
  const keep = new Map(prevQuestions.map(q => [q.id, q])); const seen = new Set();
  return list.map((q, i) => { const n = normQuestion(q, i, keep); if (seen.has(n.id)) n.id = id(); seen.add(n.id); return n; });
}
const publicQuestion = q => { const { authorKey, ...rest } = q; return rest; };
function code6() { const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c; do { c = Array.from({ length: 6 }, () => chars[crypto.randomInt(chars.length)]).join(''); } while (db.quizzes.some(q => q.submissionCode === c)); return c; }
const quizView = q => ({ ...q, questions: q.questions.map(publicQuestion) });
const quizSummary = q => ({ id: q.id, title: q.title, description: q.description, theme: q.theme, questionCount: q.questions.length, pendingSubmissions: db.submissions.filter(s => s.quizId === q.id && s.status === 'pending').length, submissionCode: q.submissionCode, acceptSubmissions: q.acceptSubmissions, updatedAt: q.updatedAt, createdAt: q.createdAt });
function getQuiz(qid) { const q = db.quizzes.find(q => q.id === qid); if (!q) fail(404, '퀴즈를 찾을 수 없어요.'); return q; }
function quizFromInput(d, prev) {
  const title = clean(d.title, 80); if (!title) fail(400, '퀴즈 제목을 입력하세요.');
  return { title, description: cleanText(d.description, 400), theme: THEMES.includes(d.theme) ? d.theme : '#46178f', questions: normQuestions(d.questions ?? prev?.questions ?? [], prev?.questions) };
}

// ---------- 닉네임 ----------
const BAD = ['씨발', '시발', 'ㅅㅂ', 'ㅆㅂ', '병신', 'ㅂㅅ', '개새', '새끼', '좆', '지랄', '꺼져', '죽어', '미친', '닥쳐', 'fuck', 'shit', 'bitch', 'sex', '섹스', 'ass'];
const badName = n => { const t = n.toLowerCase().replace(/[\s._\-]/g, ''); return BAD.some(b => t.includes(b)); };
const ADJ = ['용감한', '반짝이는', '신나는', '똑똑한', '날쌘', '씩씩한', '빛나는', '즐거운', '느긋한', '튼튼한', '상냥한', '명랑한', '든든한', '재빠른'];
const NOUN = ['고래', '토끼', '다람쥐', '펭귄', '여우', '거북이', '수달', '부엉이', '돌고래', '판다', '참새', '고양이', '해바라기', '별똥별', '코알라', '오리'];
const randomNick = () => ADJ[crypto.randomInt(ADJ.length)] + ' ' + NOUN[crypto.randomInt(NOUN.length)];

// ---------- 게임 모드 ----------
const MODES = [
  { id: 'classic', name: '클래식', pacing: 'host', teams: false, original: false },
  { id: 'robot', name: '로봇 경주', pacing: 'player', teams: false, original: false },
  { id: 'marble', name: '마블 레이스', pacing: 'host', teams: false, original: false },
  { id: 'submarine', name: '잠수함 특공대', pacing: 'player', teams: false, original: false },
  { id: 'kingdom', name: '컬러 킹덤', pacing: 'player', teams: true, original: false },
  { id: 'space', name: '우주 정복', pacing: 'player', teams: true, original: false },
  { id: 'runner', name: '퀴즈 런', pacing: 'player', teams: false, original: true },
  { id: 'treasure', name: '행운의 보물상자', pacing: 'player', teams: false, original: true },
  { id: 'garden', name: '우리반 꽃밭', pacing: 'host', teams: false, original: true },
  { id: 'boss', name: '보스 레이드', pacing: 'host', teams: false, original: true }
];
const modeOf = mid => MODES.find(m => m.id === mid);
const TEAMS = [{ name: '빨강 팀', color: '#e21b3c' }, { name: '파랑 팀', color: '#1368ce' }, { name: '노랑 팀', color: '#d89e00' }, { name: '초록 팀', color: '#26890c' }];
const MARBLE_COLORS = ['#e21b3c', '#1368ce', '#d89e00', '#26890c', '#864cbf', '#0aa3a3', '#ff7a00', '#e84393', '#2d3436', '#6c5ce7', '#00b894', '#fdcb6e'];
const PLANETS = [['반짝성', 14, 22, 2], ['구름별', 38, 14, 1], ['얼음달', 66, 20, 2], ['불꽃성', 88, 30, 1], ['바다별', 22, 62, 1], ['숲속성', 50, 48, 3], ['무지개성', 80, 70, 2], ['모래달', 40, 82, 1], ['은하섬', 64, 86, 1]];
const BOSS_LEVELS = ['화염의 군주 이그니스', '눈보라 마수 블리자르', '심연의 크라켄', '천둥 거신 볼테우스', '그림자 용 녹투르', '강철 파괴신 메카트론', '혼돈의 마왕 카오스'];
const BOSSES = BOSS_LEVELS;

// ---------- 실시간 게임 ----------
const games = new Map(); // pin → game
function newPin() { let p; do { p = String(crypto.randomInt(100000, 1000000)); } while (games.has(p)); return p; }
function readOptions(o = {}, mode) {
  const int = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  return {
    randomizeQuestions: !!o.randomizeQuestions, randomizeAnswers: !!o.randomizeAnswers, showOnDevice: o.showOnDevice !== false,
    friendlyNicknames: !!o.friendlyNicknames, skipOwnQuestions: o.skipOwnQuestions !== false,
    teamCount: mode.teams ? int(o.teamCount, 2, 4, 4) : 0, duration: int(o.duration, 60, 1800, 300), goal: int(o.goal, 5, 50, 15),
    autoAdvance: AUTO_STEPS.includes(Number(o.autoAdvance)) ? Number(o.autoAdvance) : 10
  };
}
const AUTO_STEPS = [0, 5, 10, 15, 20];
// 캐릭터: c 캐릭터 0~9, k 색 0~11, h 머리 0~7, f 얼굴 0~5, b 배경 0~7
function normAvatar(a) {
  if (!a || typeof a !== 'object') return null;
  const r = (v, max) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0; };
  return { c: r(a.c, 9), k: r(a.k, 11), h: r(a.h, 7), f: r(a.f, 5), b: r(a.b, 7) };
}
// 결과 자동 넘김
function clearAuto(g) { if (g.autoTimer) clearTimeout(g.autoTimer); g.autoTimer = null; g.autoAt = null; }
function scheduleAuto(g, msLeft) {
  clearAuto(g);
  const sec = Number(g.options.autoAdvance) || 0;
  if (g.pacing !== 'host' || !sec || !['reveal', 'leaderboard'].includes(g.phase)) return;
  const ms = msLeft !== undefined ? Math.max(0, msLeft) : sec * 1000;
  g.autoAt = now() + ms;
  const phase = g.phase, qi = g.qIndex;
  g.autoTimer = setTimeout(() => { g.autoTimer = null; g.autoAt = null; if (g.phase !== phase || g.qIndex !== qi) return; try { hostNext(g); } catch (e) { console.error('자동 넘김 오류', e.message); } }, ms);
}
function applySettings(g, o = {}) {
  if (g.phase === 'finished') fail(409, '끝난 게임은 설정을 바꿀 수 없어요.');
  if (o.autoAdvance !== undefined) { const v = Number(o.autoAdvance); if (!AUTO_STEPS.includes(v)) fail(400, '자동 넘김은 끔, 5초, 10초, 15초, 20초 중에서 골라요.'); g.options.autoAdvance = v; scheduleAuto(g); }
  for (const k of ['showOnDevice', 'skipOwnQuestions', 'friendlyNicknames']) if (typeof o[k] === 'boolean') g.options[k] = o[k];
  touch(g);
}
function prepareQuestion(q, opts) {
  const n = q.choices.length; let perm = [...Array(n).keys()];
  if (opts.randomizeAnswers && (q.type === 'quiz' || q.type === 'poll')) perm = shuffle(perm);
  let puzzle = null;
  if (q.type === 'puzzle') { let order = shuffle([...Array(n).keys()]); if (n > 1 && order.every((v, i) => v === i)) order = [...order.slice(1), order[0]]; puzzle = order.map(orig => ({ id: crypto.randomBytes(4).toString('hex'), orig })); }
  return { ...q, perm, puzzle };
}
function createGame(quiz, modeId, rawOpts) {
  const mode = modeOf(modeId); if (!mode) fail(400, '게임 모드를 선택하세요.');
  const options = readOptions(rawOpts, mode);
  let list = quiz.questions.filter(q => mode.pacing === 'host' || q.type !== 'poll');
  if (mode.id === 'runner') { list = list.filter(q => q.type === 'quiz' || q.type === 'truefalse'); if (!list.length) fail(400, '퀴즈 런은 객관식이나 참/거짓 문제가 1개 이상 필요해요.'); }
  if (!list.length) fail(400, mode.pacing === 'player' ? '이 게임은 설문을 제외한 문제가 1개 이상 필요해요.' : '문제가 1개 이상 필요해요.');
  if (options.randomizeQuestions) list = shuffle(list);
  const g = {
    pin: newPin(), quizId: quiz.id, quizTitle: quiz.title, mode: mode.id, modeName: mode.name, pacing: mode.pacing, options,
    questions: list.map(q => prepareQuestion(q, options)), phase: 'lobby', locked: false, createdAt: now(), touched: now(),
    players: new Map(), kicked: new Set(), clients: new Set(), qIndex: -1, endsAt: null, startAt: null, timer: null,
    answers: new Map(), stats: [], feed: [], teams: null, ms: null, reportId: null, resultSeq: 0
  };
  if (options.teamCount) g.teams = TEAMS.slice(0, options.teamCount).map((t, i) => ({ index: i, name: t.name, color: t.color }));
  initModeState(g); games.set(g.pin, g); return g;
}
function initModeState(g) {
  const ms = {};
  if (g.mode === 'robot' || g.mode === 'submarine') Object.assign(ms, { kind: 'chase', theme: g.mode === 'robot' ? 'robot' : 'sub', status: 'ready', startAt: null, catchAt: null, gapMax: CHASE.gapMax, boostMs: 0, boosts: 0, lastBoost: null, symSeed: crypto.randomInt(1, 1000000), symPeriod: CHASE.symPeriod, symStart: null, awards: [] });
  if (g.mode === 'marble') Object.assign(ms, { kind: 'marble', stage: 'collect', raceStart: null, raceEnd: null, duration: 0, mapId: null, seed: 0, marbles: [], finish: [], order: [], bonus: null, lastGain: null, awards: [] });
  if (g.mode === 'kingdom') {
    Object.assign(ms, { kind: 'kingdom', cols: KINGDOM.cols, rows: KINGDOM.rows, tiles: Array(KINGDOM.cols * KINGDOM.rows).fill(-1), castles: [], claims: [], awards: [] });
    g.teams.forEach((t, i) => { const [c, r] = KINGDOM.castles[i]; const idx = r * KINGDOM.cols + c; ms.castles[i] = idx; ms.tiles[idx] = i; });
  }
  if (g.mode === 'space') Object.assign(ms, { kind: 'tower', bonusEvery: TOWER.bonusEvery, towers: g.teams.map(() => ({ height: 0, blocks: [] })), drops: [], awards: [] });
  if (g.mode === 'garden') Object.assign(ms, { kind: 'garden', awards: [], goal: 0, flowers: [], bloomed: 0, status: 'growing' });
  if (g.mode === 'boss') Object.assign(ms, { kind: 'boss', awards: [], phase: 'normal', finisher: null, lastAttack: null, bossName: BOSSES[crypto.randomInt(BOSSES.length)], bossHp: 0, bossMaxHp: 0, shield: 100, status: 'fighting', hits: [] });
  if (g.mode === 'treasure') Object.assign(ms, { kind: 'treasure', events: [] });
  if (g.mode === 'runner') Object.assign(ms, { kind: 'runner', awards: [], mapLen: Math.max(300, Math.min(1600, Math.round(g.options.duration * 12 / 4.5 / 10) * 10)), mapSeed: crypto.randomInt(1, 2147483646) });
  if (g.mode === 'robot') Object.assign(ms, { stage: 1, stages: ROBOT.stages, part: 'chase', stageBoosts: 0, stageGoal: 3, mini: null, lastMini: null, cleared: false, pausedGap: 0 });
  g.ms = ms;
}
function getGame(pin) { const g = games.get(String(pin)); if (!g) fail(404, '게임을 찾을 수 없어요. PIN을 확인하세요.'); return g; }
const activePlayers = g => [...g.players.values()];
function teamFor(g) { const counts = g.teams.map((t, i) => activePlayers(g).filter(p => p.team === i).length); return counts.indexOf(Math.min(...counts)); }
function addFeed(g, nickname, text, good = true) { g.feed.unshift({ nickname, text, good, at: now() }); g.feed.length = Math.min(g.feed.length, 8); }

// 점수와 순위
function speedFactor(q, elapsed) { return Math.min(1, Math.max(0, elapsed / (q.timeLimit * 1000))); }
function basePoints(q, elapsed) { if (q.points === 'none' || q.type === 'poll') return 0; let p = Math.round(1000 * (1 - speedFactor(q, elapsed) / 2)); if (q.points === 'double') p *= 2; return p; }
const normAns = s => String(s || '').toLowerCase().normalize('NFC').replace(/[\s.,!?'"~·\-]/g, '');
function evaluate(q, answer) {
  if (q.type === 'quiz' || q.type === 'truefalse' || q.type === 'poll') {
    const idx = Number(answer); if (!Number.isInteger(idx) || idx < 0 || idx >= q.choices.length) fail(400, '보기를 선택하세요.');
    const orig = q.perm[idx]; return { correct: q.type === 'poll' ? null : !!q.choices[orig].correct, factor: 1, value: idx };
  }
  if (q.type === 'type') { const v = clean(answer, 40); if (!v) fail(400, '답을 입력하세요.'); return { correct: q.accepted.some(a => normAns(a) === normAns(v)), factor: 1, value: v }; }
  if (q.type === 'puzzle') {
    if (!Array.isArray(answer) || answer.length !== q.puzzle.length) fail(400, '모든 항목의 순서를 정하세요.');
    const order = answer.map(a => q.puzzle.find(p => p.id === a)?.orig); if (order.some(o => o === undefined) || new Set(order).size !== order.length) fail(400, '순서가 올바르지 않습니다.');
    return { correct: order.every((o, i) => o === i), factor: 1, value: order };
  }
  if (q.type === 'slider') {
    const v = Number(answer); if (!Number.isFinite(v) || v < q.slider.min || v > q.slider.max) fail(400, '범위 안의 숫자를 고르세요.');
    const diff = Math.abs(v - q.slider.answer), tol = q.slider.tolerance;
    const ok = diff <= tol + 1e-9; return { correct: ok, factor: ok ? (tol > 0 ? 1 - 0.5 * diff / tol : 1) : 0, value: v };
  }
  fail(400, '지원하지 않는 문제입니다.');
}
function answerText(q) {
  if (q.type === 'quiz' || q.type === 'truefalse') return '정답: ' + q.choices.filter(c => c.correct).map(c => c.text).join(', ');
  if (q.type === 'type') return '정답: ' + q.accepted.join(', ');
  if (q.type === 'puzzle') return '정답 순서: ' + q.choices.map(c => c.text).join(' → ');
  if (q.type === 'slider') return '정답: ' + q.slider.answer + (q.slider.tolerance ? ` (±${q.slider.tolerance})` : '');
  return '설문 문제예요. 생각을 나눠줘서 고마워요.';
}
function ranking(g) {
  const list = activePlayers(g);
  list.sort((a, b) => {
    const fa = a.finishedRank ?? Infinity, fb = b.finishedRank ?? Infinity; if (fa !== fb) return fa - fb;
    return b.score - a.score || a.reachedAt - b.reachedAt || a.joinedAt - b.joinedAt;
  });
  list.forEach((p, i) => { p.rank = i + 1; }); return list;
}
function teamSummary(g) {
  if (!g.teams) return null;
  return g.teams.map((t, i) => {
    const members = activePlayers(g).filter(p => p.team === i);
    let score = members.reduce((n, p) => n + p.score, 0);
    if (g.mode === 'kingdom') score = g.ms.tiles.filter(x => x === i).length;
    if (g.mode === 'space') score = g.ms.towers[i].height;
    return { index: i, name: t.name, color: t.color, score, members: members.length, tiles: g.mode === 'kingdom' ? score : undefined, height: g.mode === 'space' ? score : undefined };
  });
}

// 단계 진행
function clearTimer(g) { clearTimeout(g.timer); g.timer = null; }
function setTimer(g, ms, fn) { clearTimer(g); g.timer = setTimeout(() => { try { fn(); } catch (e) { console.error('게임 진행 오류', e.message); } }, ms); }
function startGame(g) {
  if (g.phase !== 'lobby') return;
  if (!g.players.size) fail(400, '참가자가 1명 이상 있어야 시작할 수 있어요.');
  const n = g.players.size;
  g.loop = LOOP_MODES.has(g.mode); g.qRound = 0; g.qSeq = 0; g.gameEndsAt = null;
  if (g.loop) { const avgT = g.questions.reduce((a, q) => a + q.timeLimit, 0) / g.questions.length; const perQ = avgT + (Number(g.options.autoAdvance) || 10) + 3 + 2; g.qEst = Math.max(g.questions.length, Math.round(g.options.duration / perQ)); }
  const qn = g.loop ? g.qEst : g.questions.length;
  if (g.mode === 'garden') g.ms.goal = Math.max(5, Math.round(n * qn * 0.8));
  if (g.mode === 'boss') {
    // 보스 수는 문제 수에 맞춤(약 4문제에 1마리, 3~7마리). 전체 체력은 반 정답률 약 85%일 때 문제의 약 80% 지점에서 마지막 보스가 쓰러지게.
    const cnt = Math.max(3, Math.min(BOSS_LEVELS.length, Math.round(qn / 4)));
    const pool = Math.max(3000, n * qn * 0.85 * 1350 * 0.8);
    const w = Array.from({ length: cnt }, (_, i) => Math.pow(1.35, i)); const ws = w.reduce((a, b) => a + b, 0);
    g.ms.hpList = w.map(x => Math.max(800, Math.round(pool * x / ws / 10) * 10)); g.ms.bossCount = cnt; g.ms.cleared = false; g.ms.loot = []; g.ms.lootTotal = 0;
    g.ms.baseHp = g.ms.hpList[0]; g.ms.level = 1; g.ms.defeated = []; g.ms.bossName = BOSS_LEVELS[0]; g.ms.bossMaxHp = g.ms.baseHp; g.ms.bossHp = g.ms.bossMaxHp; g.ms.spawnAt = null; }
  const cd = g.mode === 'runner' ? 12000 : g.mode === 'marble' ? 9000 : g.pacing === 'player' && (ARENA_MODES.has(g.mode) || g.mode === 'treasure') ? 9000 : 3000;
  g.phase = 'countdown'; g.endsAt = now() + cd;
  if (g.pacing === 'host') { g.qIndex = 0; setTimer(g, cd, () => startQuestion(g)); }
  else setTimer(g, cd, () => startRun(g));
  touch(g);
}
function startQuestion(g) {
  const q = g.questions[g.qIndex];
  g.qSeq = (g.qSeq || 0) + 1;
  if (g.loop && !g.gameEndsAt) g.gameEndsAt = now() + g.options.duration * 1000;
  g.phase = 'question'; g.startAt = now(); g.endsAt = g.startAt + q.timeLimit * 1000; g.answers = new Map();
  for (const p of g.players.values()) { p.answeredNow = false; p.delta = 0; }
  setTimer(g, q.timeLimit * 1000, () => reveal(g)); touch(g);
}
function expectedPlayers(g) { const q = g.questions[g.qIndex]; return activePlayers(g).filter(p => p.joinedAt <= g.startAt && !isOwn(g, p, q)); }
const isOwn = (g, p, q) => g.options.skipOwnQuestions && q.authorKey && q.authorKey === p.deviceKey;
function reveal(g) {
  if (g.phase !== 'question') return; clearTimer(g);
  const q = g.questions[g.qIndex]; g.phase = 'reveal'; g.endsAt = null;
  const expected = expectedPlayers(g); let correctCount = 0;
  const answeredList = [...g.answers.values()];
  for (const p of activePlayers(g)) {
    const a = g.answers.get(p.id);
    g.resultSeq++;
    if (isOwn(g, p, q)) { p.result = { seq: g.resultSeq, correct: null, points: 0, streak: p.streak, answerText: answerText(q), message: '내가 낸 문제라 이번에는 쉬었어요.' }; continue; }
    if (p.joinedAt > g.startAt) { p.result = { seq: g.resultSeq, correct: null, points: 0, streak: p.streak, answerText: answerText(q), message: '다음 문제부터 참여해요.' }; continue; }
    if (!a && q.type === 'poll') { p.result = { seq: g.resultSeq, correct: null, points: 0, streak: p.streak, answerText: answerText(q), message: '설문에 답하지 못했어요. 다음 문제에서 만나요!', missed: true }; continue; }
    if (!a) { const lost = p.streak >= 2; p.streak = 0; p.result = { seq: g.resultSeq, correct: false, points: 0, streak: 0, lostStreak: lost, answerText: answerText(q), message: '시간이 끝났어요. 다음 문제는 꼭 도전해요!', missed: true }; continue; }
    if (a.correct) correctCount++;
    p.result = { seq: g.resultSeq, correct: a.correct, points: a.points, streak: p.streak, lostStreak: !!a.lostStreak, answerText: answerText(q) };
    if (g.mode === 'marble' && a.mg) p.result.marbleMsg = `구슬 +${a.mg.count}개` + (a.mg.gold ? ' (빠른 정답 황금 구슬 포함)' : '') + (a.mg.streak ? ' 연속 정답 보너스!' : '');
  }
  // 모드별 효과
  const accuracy = expected.length ? expected.filter(p => g.answers.get(p.id)?.correct).length / expected.length : 0;
  const questionCount = g.loop ? (g.qEst || g.questions.length) : g.questions.length;
  if (q.type !== 'poll') {
    if (g.mode === 'submarine' && g.ms.status === 'diving') {
      const step = Math.round(g.ms.targetDepth / questionCount * 1.25 * accuracy);
      g.ms.depth = Math.min(g.ms.targetDepth, g.ms.depth + step);
      g.ms.oxygen = Math.max(0, g.ms.oxygen - Math.round((1 - accuracy) * (100 / questionCount) * 1.6));
      g.ms.lastAccuracy = Math.round(accuracy * 100);
      g.ms.log.unshift(`${g.qIndex + 1}번 문제: 정답률 ${g.ms.lastAccuracy}%, ${step}m 잠수`); g.ms.log.length = Math.min(g.ms.log.length, 6);
      if (g.ms.depth >= g.ms.targetDepth) { g.ms.status = 'success'; g.ms.log.unshift('바다 밑 보물에 도착했어요!'); }
      else if (g.ms.oxygen <= 0) { g.ms.status = 'failed'; g.ms.log.unshift('산소가 바닥났어요. 다음에는 더 깊이!'); }
    }
    if (g.mode === 'kingdom' || g.mode === 'space') {
      const correctOnes = answeredList.filter(a => a.correct).sort((x, y) => x.elapsed - y.elapsed);
      correctOnes.forEach((a, i) => {
        const p = g.players.get(a.playerId); if (!p) return;
        if (g.mode === 'kingdom') p.actions = { kind: 'claim', remaining: i < Math.ceil(correctOnes.length / 2) ? 2 : 1 };
        else { const third = correctOnes.length / 3; let e = i < third ? 3 : i < third * 2 ? 2 : 1; if (q.points === 'double') e *= 2; p.actions = { kind: 'launch', remaining: e }; }
      });
    }
    if (g.mode === 'garden' && g.ms.status !== 'failed') {
      for (const a of answeredList) if (a.correct) {
        const p = g.players.get(a.playerId); const count = q.points === 'double' ? 2 : 1;
        const rare = !!(p && p.streak >= 3);
        for (let k = 0; k < count + (rare ? 1 : 0); k++) { g.ms.bloomed++; g.ms.flowers.push({ x: 4 + crypto.randomInt(92), y: 30 + crypto.randomInt(64), kind: crypto.randomInt(6), by: p?.nickname || '', rare: rare && k === count, q: g.qIndex, at: now() }); }
        if (p) stat(p, 'flowers', count + (rare ? 1 : 0)); if (p && rare) stat(p, 'rare');
        if (rare) addFeed(g, p.nickname, '연속 정답! 무지개 꽃이 피었어요');
      }
      if (g.ms.flowers.length > 200) g.ms.flowers = g.ms.flowers.slice(-200);
      g.ms.lastBloom = { q: g.qIndex, count: answeredList.filter(a => a.correct).length, accuracy: Math.round(accuracy * 100), at: now() };
      if (g.ms.bloomed >= g.ms.goal && g.ms.status !== 'success') { g.ms.status = 'success'; addFeed(g, '우리반', '목표 달성! 꽃밭이 가득 찼어요'); }
    }
    if (g.mode === 'boss' && g.ms.status === 'fighting' && g.ms.cleared && (g.qSeq || 0) > (g.ms.clearedSeq ?? g.ms.clearedQ)) {
      // 모든 보스 처치 뒤: 맞힌 학생이 보스가 남긴 보물을 가져감
      const got = [];
      for (const a of answeredList.filter(a => a.correct).sort((x, y) => x.elapsed - y.elapsed)) {
        const p = g.players.get(a.playerId); if (!p) continue;
        const fast = a.elapsed <= q.timeLimit * 1000 / 3, hot = p.streak >= 3;
        let item = '금화 주머니', value = 150, tier = 1;
        if (fast && hot) { item = '전설의 보물 상자'; value = 600; tier = 4; } else if (hot) { item = '황금 왕관'; value = 400; tier = 3; } else if (fast) { item = '빛나는 보석'; value = 300; tier = 2; }
        const secret = crypto.randomInt(100) < 10; if (secret) { value += 200; item += ' + 보스의 비밀 보물'; }
        p.score += value; p.delta = (p.delta || 0) + value; stat(p, 'loot', value); stat(p, 'lootCount'); if (tier >= 4 || secret) stat(p, 'legend');
        g.ms.lootTotal += value; got.push({ nickname: p.nickname, avatar: p.avatar || null, item, value, tier, secret, q: g.qIndex, at: now() });
        if (p.result) { p.result.loot = { item, value, tier }; p.result.points = (p.result.points || 0) + value; p.result.message = `보물 획득! ${item} +${value}점`; }
        if (tier >= 3 || secret) addFeed(g, p.nickname, `${item} 획득!`);
      }
      g.ms.loot = got.concat(g.ms.loot).slice(0, 30); g.ms.lastLoot = { q: g.qIndex, count: got.length, at: now() };
      for (const p of activePlayers(g)) if (p.result && p.result.correct === false && !p.result.loot) p.result.message = '아쉬워요! 맞히면 보스가 남긴 보물을 가져갈 수 있어요.';
    }
    else if (g.mode === 'boss' && g.ms.status === 'fighting') {
      for (const a of answeredList.filter(a => a.correct).sort((x, y) => y.points - x.points)) {
        const p = g.players.get(a.playerId); const crit = !!(p && p.streak >= 3); const dmg = Math.round(Math.max(100, a.points) * (crit ? 1.5 : 1));
        if (p) { stat(p, 'dmg', dmg); if (crit) stat(p, 'crit'); }
        g.ms.bossHp = Math.max(0, g.ms.bossHp - dmg); g.ms.hits.unshift({ nickname: p?.nickname || '', avatar: p?.avatar || null, damage: dmg, crit, q: g.qIndex, at: now() });
        if (g.ms.bossHp <= 0) {
          g.ms.finisher = { nickname: p?.nickname || '', avatar: p?.avatar || null }; g.ms.defeated.push({ level: g.ms.level, name: g.ms.bossName, finisher: g.ms.finisher });
          addFeed(g, p?.nickname || '', `${g.ms.level}단계 보스 처치! 마지막 일격`);
          if (g.ms.level >= g.ms.bossCount) { g.ms.cleared = true; g.ms.clearedAt = now(); g.ms.clearedQ = g.qIndex; g.ms.clearedSeq = g.qSeq || 0; g.ms.lastAttack = null; addFeed(g, '우리반', `보스 ${g.ms.bossCount}마리 모두 처치! 보물 창고가 열렸어요`); break; }
          g.ms.level++; g.ms.bossName = BOSS_LEVELS[(g.ms.level - 1) % BOSS_LEVELS.length];
          g.ms.bossMaxHp = g.ms.hpList[g.ms.level - 1]; g.ms.bossHp = g.ms.bossMaxHp; g.ms.spawnAt = now(); g.ms.phase = 'normal';
          addFeed(g, g.ms.bossName, `${g.ms.level}단계 보스 등장! 더 강해졌어요`, false);
        }
        else if (crit) addFeed(g, p?.nickname || '', `치명타 ${dmg}!`);
      }
      g.ms.hits.length = Math.min(g.ms.hits.length, 12);
      if (!g.ms.cleared) {
      const wrong = Math.max(0, expected.length - expected.filter(p => g.answers.get(p.id)?.correct).length);
      const power = (1 + 0.75 * (g.ms.level - 1) / Math.max(1, (g.ms.bossCount || 4) - 1)) * (g.ms.phase === 'rage' ? 1.3 : g.ms.phase === 'angry' ? 1.15 : 1);
      let shieldLoss = Math.round((1 - accuracy) * 235 / questionCount * power);
      if (wrong > 0) shieldLoss = Math.max(shieldLoss, Math.max(1, Math.round(3 * power * Math.min(1, 15 / questionCount))));
      g.ms.shield = Math.max(0, g.ms.shield - shieldLoss); g.ms.attackPower = Math.round(power * 100) / 100;
      g.ms.lastAttack = shieldLoss > 0 ? { q: g.qIndex, dmg: shieldLoss, at: now(), level: g.ms.level, wrong } : null;
      if (shieldLoss > 0) addFeed(g, g.ms.bossName, `반격! 방패 -${shieldLoss}`, false);
      const ratio = g.ms.bossMaxHp ? g.ms.bossHp / g.ms.bossMaxHp : 1;
      const ph = ratio <= 0.25 ? 'rage' : ratio <= 0.5 ? 'angry' : 'normal';
      if (ph !== g.ms.phase && g.ms.bossHp > 0) { if (ph === 'angry') addFeed(g, g.ms.bossName, '화가 났어요! 더 힘내요', false); if (ph === 'rage') addFeed(g, g.ms.bossName, '마지막 발악! 거의 다 왔어요', false); }
      g.ms.phase = ph; g.ms.round = g.qIndex;
      if (g.ms.shield <= 0) { g.ms.status = 'defeat'; addFeed(g, g.ms.bossName, '방패가 부서졌어요… 패배', false); }
      }
    }
  }
  if (g.mode === 'marble') { const items = answeredList.filter(a => a.mg).map(a => { const p = g.players.get(a.playerId); return { nickname: p ? p.nickname : '', count: a.mg.count, gold: a.mg.gold }; }); g.ms.lastGain = { q: g.qIndex, items, at: now() }; }
  const ranked = ranking(g);
  for (const p of ranked) {
    if (!p.result) continue; p.result.rank = p.rank; p.result.prevRank = p.lastRank ?? null; p.boardPrevRank = p.lastRank ?? null; p.lastRank = p.rank;
    if (!p.result.message) {
      if (g.mode === 'kingdom' && p.actions) p.result.message = `땅을 ${p.actions.remaining}칸 차지할 수 있어요! 지도를 눌러요.`;
      else if (g.mode === 'space' && p.actions) p.result.message = `에너지 ${p.actions.remaining}개를 행성으로 보내요!`;
      else if (p.result.marbleMsg) p.result.message = p.result.marbleMsg + ` · 내 구슬 ${stv(p, 'marbles')}개. 마지막 레이스에서 늦게 들어올수록 1등!`;
      else if (p.rank === 1) p.result.message = '지금 1위예요! 이대로 지켜요.';
      else { const above = ranked[p.rank - 2]; p.result.message = `${above.nickname} 님과 ${Math.max(0, above.score - p.score)}점 차이예요.`; }
    }
  }
  const prevSt = g.stats[g.qIndex];
  if (g.loop && g.qRound > 0 && prevSt) { prevSt.answered += answeredList.length; prevSt.correct += correctCount; prevSt.expected = (prevSt.expected || 0) + expected.length; prevSt.rounds = (prevSt.rounds || 1) + 1; }
  else g.stats[g.qIndex] = { questionId: q.id, text: q.text, type: q.type, answered: answeredList.length, correct: correctCount, expected: expected.length };
  scheduleAuto(g);
  touch(g);
}
function advance(g) {
  clearTimer(g); clearAuto(g);
  for (const p of g.players.values()) { p.actions = null; }
  if (g.mode === 'boss' && g.ms.status === 'defeat') return finish(g);
  if (g.mode === 'marble' && g.qIndex + 1 >= g.questions.length) return startRace(g);
  if (g.loop) {
    if (g.gameEndsAt && now() >= g.gameEndsAt) return finish(g);
    let next = g.qIndex + 1; if (next >= g.questions.length) { next = 0; g.qRound = (g.qRound || 0) + 1; }
    g.qIndex = next; g.phase = 'countdown'; g.endsAt = now() + 3000; setTimer(g, 3000, () => startQuestion(g)); touch(g); return;
  }
  if (g.qIndex + 1 < g.questions.length) { g.qIndex++; g.phase = 'countdown'; g.endsAt = now() + 3000; setTimer(g, 3000, () => startQuestion(g)); touch(g); }
  else finish(g);
}
function hostNext(g) {
  if (g.phase === 'lobby') return startGame(g);
  if (g.phase === 'question') return reveal(g);
  clearAuto(g);
  if (g.phase === 'reveal') { if (g.mode === 'classic' || g.mode === 'marble') { g.phase = 'leaderboard'; for (const p of g.players.values()) p.actions = null; scheduleAuto(g); touch(g); return; } return advance(g); }
  if (g.phase === 'leaderboard') return advance(g);
}
// 각자 속도로 진행하는 모드
function startRun(g) {
  g.phase = 'running'; g.startAt = now(); g.endsAt = g.startAt + g.options.duration * 1000;
  for (const p of g.players.values()) nextPersonalQuestion(g, p);
  if (g.ms.kind === 'chase') {
    const n = Math.max(1, g.players.size);
    Object.assign(g.ms, { status: 'running', startAt: g.startAt, symStart: g.startAt, catchAt: g.startAt + CHASE.startGap, boostMs: Math.round(Math.min(26000, Math.max(1200, (g.mode === 'robot' ? 40000 : 30000) / n))) });
    if (g.ms.theme === 'robot') g.ms.stageGoal = stageGoalOf(n, 1);
    scheduleCatch(g);
  }
  setTimer(g, g.options.duration * 1000, () => finish(g)); touch(g);
}
// ---------- 카훗형 모드 공통 ----------
const ARENA_MODES = new Set(['robot', 'submarine', 'kingdom', 'space']);
// 진행자가 넘기지만 정한 게임 시간 동안 문제를 처음부터 반복하는 모드
const LOOP_MODES = new Set(['garden', 'boss']);
const CHASE = { startGap: 40000, gapMax: 60000, symPeriod: 3500 };
const KINGDOM = { cols: 13, rows: 9, castles: [[2, 6], [10, 2], [2, 2], [10, 6]] };
const TOWER = { bonusEvery: 10 };
const MARBLE = { baseMs: 20000, maxPerPlayer: 12, maxTotal: 120 };
const SYMBOLS = ['세모', '마름모', '동그라미', '네모'];
// 진행자 화면과 같은 공식: 지금 화면에 보이는 기호 번호(0~3)
function symbolAt(ms, t) { const k = Math.floor((t - ms.symStart) / ms.symPeriod); return ((Math.imul(k + 1, 0x9E3779B1) + ms.symSeed) >>> 0) % 4; }
function scheduleCatch(g) {
  if (g.catchTimer) clearTimeout(g.catchTimer);
  g.catchTimer = null;
  if (g.ms.kind !== 'chase' || g.ms.status !== 'running' || g.phase !== 'running' || g.ms.part === 'mini') return;
  g.catchTimer = setTimeout(() => {
    g.catchTimer = null;
    if (g.phase !== 'running' || g.ms.status !== 'running' || g.ms.part === 'mini') return;
    if (now() + 30 < g.ms.catchAt) return scheduleCatch(g);
    g.ms.status = 'failed'; addFeed(g, g.mode === 'robot' ? '로봇' : '바다 괴물', '우리 반을 따라잡았어요!', false);
    finish(g);
  }, Math.max(0, g.ms.catchAt - now()));
}
function resumeMode(g) { if (g.ms && g.ms.kind === 'chase') { if (g.ms.part === 'mini') startMiniTicker(g); else scheduleCatch(g); } }
// ---------- 로봇 경주: 단계와 협동 미니게임 ----------
const ROBOT = { stages: 6, miniLead: 4000, miniShow: 4500 };
const MINI_MAP = { w: 1600, h: 900 };
const MINI_SPECS = [
  { type: 'cores', time: 30, drones: 1, many: false, title: '에너지 코어 모으기', desc: '흩어진 에너지 코어를 모두 모아요! 경비 드론을 조심해요.' },
  { type: 'plates', time: 35, drones: 2, need: 1, hold: 4000, title: '스위치 발판 켜기', desc: '친구들과 나눠서 발판 위에 4초 동안 서 있어요!' },
  { type: 'deliver', time: 35, drones: 3, many: false, title: '부품 배달 작전', desc: '부품을 하나씩 들고 가운데 수리 기지로 옮겨요!' },
  { type: 'cores', time: 30, drones: 4, many: true, title: '드론을 피해 코어 모으기', desc: '경비 드론이 늘었어요. 피하면서 코어를 모두 모아요!' },
  { type: 'plates', time: 35, drones: 5, need: 2, hold: 5000, title: '두 명이 함께 발판 켜기', desc: '발판마다 두 명이 함께 5초 동안 서 있어야 켜져요!' },
  { type: 'deliver', time: 40, drones: 7, many: true, title: '최후의 탈출선 수리', desc: '드론 7대를 피해 부품을 모두 옮기면 완전 탈출!' }
];
const stageGoalOf = (n, s) => Math.max(15, Math.round(n * (0.6 + 0.15 * (s - 1)) * 5));
function miniRnd(a, b) { return a + (b - a) * crypto.randomInt(1000000) / 1000000; }
function miniSpots(count, minGap, avoid) {
  const out = [];
  for (let i = 0; i < count; i++) {
    let best = null;
    for (let k = 0; k < 40; k++) {
      const c = { x: Math.round(miniRnd(110, MINI_MAP.w - 110)), y: Math.round(miniRnd(150, MINI_MAP.h - 90)) };
      const ok = out.every(o => Math.hypot(o.x - c.x, o.y - c.y) >= minGap) && (avoid || []).every(a => Math.hypot(a.x - c.x, a.y - c.y) >= a.r);
      if (ok) { best = c; break; } if (!best) best = c;
    }
    out.push(best);
  }
  return out;
}
function startMini(g) {
  const ms = g.ms; const players = activePlayers(g); const n = Math.max(1, players.length);
  const spec = MINI_SPECS[Math.min(ms.stage, MINI_SPECS.length) - 1]; const t0 = now();
  ms.pausedGap = Math.max(4000, ms.catchAt - t0);
  if (g.catchTimer) { clearTimeout(g.catchTimer); g.catchTimer = null; }
  const startAt = t0 + ROBOT.miniLead, endAt = startAt + spec.time * 1000;
  const center = { x: MINI_MAP.w / 2, y: MINI_MAP.h / 2 + 30 };
  const m = { type: spec.type, stage: ms.stage, title: spec.title, desc: spec.desc, startAt, endAt, w: MINI_MAP.w, h: MINI_MAP.h, status: 'ready', goal: 0, progress: 0, items: [], plates: [], base: null, drones: [], hold: spec.hold || 0, spawn: center, pos: {}, stun: {}, result: null };
  if (spec.type === 'cores') {
    const cnt = Math.round(n * (spec.many ? 2.2 : 1.6)) + (spec.many ? 4 : 3);
    m.items = miniSpots(cnt, 70, [{ x: center.x, y: center.y, r: 140 }]).map((s, i) => ({ id: 'c' + i, x: s.x, y: s.y, by: null }));
    m.goal = cnt;
  } else if (spec.type === 'plates') {
    const need = Math.min(spec.need, n); const k = Math.max(2, Math.min(spec.need === 2 ? 8 : 8, Math.ceil(n / (spec.need === 2 ? 2.2 : 2.2))));
    m.plates = miniSpots(k, 260, [{ x: center.x, y: center.y, r: 180 }]).map((s, i) => ({ id: 'p' + i, x: s.x, y: s.y, r: 75, need, on: 0, holdFrom: null, done: false }));
    m.goal = k;
  } else {
    m.base = { x: center.x, y: center.y, r: 95 };
    const cnt = Math.round(n * (spec.many ? 1.6 : 1.1)) + (spec.many ? 3 : 2);
    m.items = miniSpots(cnt, 80, [{ x: center.x, y: center.y, r: 320 }]).map((s, i) => ({ id: 'd' + i, x: s.x, y: s.y, hx: s.x, hy: s.y, carrier: null, done: false }));
    m.goal = cnt;
  }
  const spd = 1.1 + 0.2 * Math.max(0, ms.stage - 2);
  for (let i = 0; i < spec.drones; i++) {
    if (i % 2 === 0) { const c = miniSpots(1, 0, [{ x: center.x, y: center.y, r: 420 }])[0]; m.drones.push({ id: 'z' + i, kind: 'circle', cx: c.x, cy: c.y, r: Math.round(miniRnd(110, 200)), w: Math.round(miniRnd(0.7, 1.1) * spd * 100) / 100 * (i % 4 === 0 ? 1 : -1), ph: Math.round(miniRnd(0, 6.28) * 100) / 100 }); }
    else { const horiz = i % 4 === 1; const pos = Math.round(miniRnd(200, horiz ? MINI_MAP.h - 150 : MINI_MAP.w - 200)); m.drones.push({ id: 'z' + i, kind: 'line', ax: horiz ? 90 : pos, ay: horiz ? pos : 140, bx: horiz ? MINI_MAP.w - 90 : pos, by: horiz ? pos : MINI_MAP.h - 70, period: Math.round(miniRnd(6, 9) / spd * 10) / 10, ph: Math.round(miniRnd(0, 1) * 100) / 100 }); }
  }
  players.forEach((p, i) => { const a = (i / players.length) * Math.PI * 2; const rr = 60 + 22 * Math.floor(i / 12); m.pos[p.id] = { x: Math.round(center.x + Math.cos(a) * rr), y: Math.round(center.y + Math.sin(a) * rr), at: t0 }; });
  ms.part = 'mini'; ms.mini = m;
  addFeed(g, `${ms.stage}단계`, `미니게임 시작! ${spec.title}`);
  startMiniTicker(g); touch(g);
}
function startMiniTicker(g) {
  if (g.miniTick) clearInterval(g.miniTick);
  g.miniTick = setInterval(() => { try { miniTick(g); } catch (e) { console.error('미니게임 오류', e); } }, 250);
}
function miniTick(g) {
  const ms = g.ms, m = ms.mini; if (!m || g.phase !== 'running') { clearInterval(g.miniTick); g.miniTick = null; return; }
  const t = now(); let changed = false;
  if (m.status === 'ready' && t >= m.startAt) { m.status = 'playing'; changed = true; }
  if (m.status === 'playing') {
    if (m.type === 'plates') {
      for (const pl of m.plates) {
        if (pl.done) continue;
        const on = Object.entries(m.pos).filter(([pid, q]) => g.players.has(pid) && Math.hypot(q.x - pl.x, q.y - pl.y) <= pl.r + 10).map(([pid]) => pid);
        if (on.length !== pl.on) { pl.on = on.length; changed = true; }
        if (on.length >= pl.need) { if (!pl.holdFrom) { pl.holdFrom = t; changed = true; } else if (t - pl.holdFrom >= m.hold) { pl.done = true; pl.holdFrom = null; m.progress++; changed = true; for (const pid of on) { const p = g.players.get(pid); if (p) { stat(p, 'mission'); arenaScore(g, p); } } addFeed(g, '발판', `${m.progress}/${m.goal} 켜졌어요!`); } }
        else if (pl.holdFrom) { pl.holdFrom = null; changed = true; }
      }
    }
    if (m.progress >= m.goal) return endMini(g, true);
    if (t >= m.endAt) return endMini(g, false);
  }
  if (m.status === 'success' || m.status === 'fail') { if (t >= m.resultAt + ROBOT.miniShow) return resumeChase(g); }
  if (changed) touch(g);
}
function endMini(g, ok) {
  const ms = g.ms, m = ms.mini; m.status = ok ? 'success' : 'fail'; m.resultAt = now();
  ms.pausedGap = ok ? Math.min(ms.gapMax, ms.pausedGap + 12000) : Math.max(4000, ms.pausedGap - 15000);
  m.result = { ok, gapChange: ok ? 12 : -15 };
  addFeed(g, `${ms.stage}단계`, ok ? '미니게임 성공! 로봇이 12초 뒤로 밀렸어요' : '미니게임 실패… 로봇이 15초 가까워졌어요', ok);
  touch(g);
}
function resumeChase(g) {
  const ms = g.ms, m = ms.mini; const ok = m.status === 'success';
  clearInterval(g.miniTick); g.miniTick = null;
  ms.lastMini = { stage: m.stage, type: m.type, title: m.title, ok };
  ms.mini = null; ms.part = 'chase';
  if (ms.stage >= ms.stages && ok) { ms.cleared = true; ms.status = 'success'; addFeed(g, '우리반', '모든 단계 클리어! 완전 탈출 성공!'); finish(g); return; }
  if (ms.stage < ms.stages) ms.stage++;
  ms.stageBoosts = 0; ms.stageGoal = stageGoalOf(Math.max(1, activePlayers(g).length), ms.stage);
  ms.catchAt = now() + ms.pausedGap;
  addFeed(g, `${ms.stage}단계`, '다시 달려요! 로봇이 더 빨라졌어요', false);
  scheduleCatch(g); touch(g);
}
function miniAction(g, p, kind, target) {
  const ms = g.ms, m = ms.mini; if (!m || g.phase !== 'running') return;
  const t = now();
  if (kind === 'move') {
    const x = Number(target && target.x), y = Number(target && target.y); if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    m.pos[p.id] = { x: Math.round(Math.max(0, Math.min(m.w, x))), y: Math.round(Math.max(0, Math.min(m.h, y))), at: t };
    if (m.type === 'plates' && m.status === 'playing') miniTick(g); else touch(g); return;
  }
  if (m.status !== 'playing') return;
  if (kind === 'pick') {
    const it = m.items.find(x => x.id === String(target)); if (!it) return;
    if (m.type === 'cores') { if (it.by) return; it.by = p.nickname; m.progress++; stat(p, 'mission'); }
    else { if (it.done || it.carrier || m.items.some(x => x.carrier === p.id)) return; it.carrier = p.id; }
  } else if (kind === 'deliver') {
    const it = m.items.find(x => x.carrier === p.id && !x.done); if (!it) return;
    it.done = true; it.carrier = null; it.by = p.nickname; m.progress++; stat(p, 'mission');
  } else if (kind === 'mhit') {
    m.stun[p.id] = t + 2500;
    const it = m.items.find(x => x.carrier === p.id && !x.done); if (it) it.carrier = null;
  } else return;
  arenaScore(g, p);
  if (m.progress >= m.goal) return endMini(g, true);
  touch(g);
}
function miniView(g, m) {
  if (!m) return null;
  const pos = activePlayers(g).map(p => { const q = m.pos[p.id] || m.spawn; const it = m.items.find(x => x.carrier === p.id && !x.done); return { id: p.id, nickname: p.nickname, avatar: p.avatar || null, x: q.x, y: q.y, carry: it ? it.id : null, stun: m.stun[p.id] && m.stun[p.id] > now() ? m.stun[p.id] : null }; });
  return { type: m.type, stage: m.stage, title: m.title, desc: m.desc, startAt: m.startAt, endAt: m.endAt, w: m.w, h: m.h, status: m.status, goal: m.goal, progress: m.progress, hold: m.hold, items: m.items.map(i => ({ id: i.id, x: i.x, y: i.y, by: i.by || null, carrier: i.carrier || null, done: !!i.done })), plates: m.plates.map(pl => ({ id: pl.id, x: pl.x, y: pl.y, r: pl.r, need: pl.need, on: pl.on, holdFrom: pl.holdFrom, done: pl.done })), base: m.base, drones: m.drones, spawn: m.spawn, result: m.result, resultAt: m.resultAt || null, players: pos };
}
function stat(p, k, d = 1) { p.st = p.st || {}; p.st[k] = (p.st[k] || 0) + d; return p.st[k]; }
const stv = (p, k) => (p.st && p.st[k]) || 0;
function arenaScore(g, p) {
  const c = p.correct * 100;
  if (g.ms.kind === 'chase') p.score = c + stv(p, 'boosts') * 250 + stv(p, 'mission') * 80;
  else if (g.ms.kind === 'marble') p.score = c + stv(p, 'marbles') * 50 + stv(p, 'gold') * 50;
  else if (g.ms.kind === 'kingdom') p.score = c + stv(p, 'tiles') * 20;
  else if (g.ms.kind === 'tower') p.score = c + stv(p, 'floors') * 20 + stv(p, 'perfect') * 10;
}
function arenaAnswer(g, p, q, ev, elapsed) {
  const ms = g.ms; let message = '';
  const fast = elapsed <= q.timeLimit * 1000 / 3;
  if (!ev.correct) { p.lockedUntil = now() + 3000; message = '아쉬워요! 3초 숨 고르고 다시 도전해요.'; return message; }
  if (ms.kind === 'chase') {
    p.charge = Math.min(3, (p.charge || 0) + 1);
    if (p.charge >= 3) { p.actions = ms.theme === 'robot' ? { kind: 'boost' } : { kind: 'symbol', choices: SYMBOLS }; message = ms.theme === 'robot' ? '에너지 3칸 완성! 부스트를 길게 눌러요.' : '에너지 완성! 큰 화면의 기호를 골라 부스트!'; }
    else message = `에너지 ${p.charge}/3 충전!`;
  } else if (ms.kind === 'marble') {
    const have = stv(p, 'marbles');
    if (have < MARBLE.maxPerPlayer) {
      stat(p, 'marbles'); if (fast) stat(p, 'gold');
      message = fast ? '빠른 정답! 황금 마블을 얻었어요.' : '새로운 마블을 얻었어요!';
      if (p.streak > 0 && p.streak % 3 === 0 && stv(p, 'marbles') < MARBLE.maxPerPlayer) { stat(p, 'marbles'); message += ' 연속 정답 보너스 마블도 하나 더!'; addFeed(g, p.nickname, '연속 정답 보너스 마블!'); }
    } else { stat(p, 'gold'); message = '마블 주머니가 가득! 마블을 황금으로 바꿨어요.'; }
  } else if (ms.kind === 'kingdom') {
    const n = (q.points === 'double' ? 4 : 2) + (p.streak >= 3 ? 1 : 0); p.actions = { kind: 'flags', remaining: n }; message = `깃발 ${n}개 획득!` + (p.streak >= 3 ? ' 연속 정답 보너스 깃발 포함!' : '') + ' 우리 팀 땅 옆에 꽂아요.';
  } else if (ms.kind === 'tower') {
    const n = (q.points === 'double' ? 6 : 4); p.actions = { kind: 'blocks', remaining: n, bonus: false }; message = `블록 ${n}개 획득! 타워 위에 떨어뜨려요.`;
  }
  return message;
}
function arenaAction(g, p, kind, target) {
  if (g.phase !== 'running') fail(409, '지금은 할 수 없어요.');
  const ms = g.ms; const a = p.actions; let message = '', points = 0, correct = true;
  if (kind === 'boost' || kind === 'symbol') {
    if (ms.kind !== 'chase' || !a || a.kind !== kind) fail(400, '지금은 부스트를 쓸 수 없어요.');
    if (ms.part === 'mini') fail(409, '지금은 미니게임 중이에요. 미니게임이 끝나면 부스트를 써요!');
    let ok = true;
    if (kind === 'symbol') { const t = Number(target), n = now(); ok = Number.isInteger(t) && (t === symbolAt(ms, n) || (((n - ms.symStart) % ms.symPeriod) < 1800 && t === symbolAt(ms, n - 1800))); }
    p.actions = null; p.charge = 0;
    if (ok && ms.status === 'running') {
      const prog = Math.min(1, (now() - g.startAt) / Math.max(1, g.endsAt - g.startAt));
      const diff = ms.theme === 'robot' ? ms.stage - 1 : 0;
      const gain = Math.round(ms.theme === 'robot' ? ms.boostMs * (1 - 0.06 * diff) / (1 + 0.15 * diff) * (1 - 0.15 * prog) : ms.boostMs * (1 - 0.35 * prog));
      ms.catchAt = Math.min(now() + ms.gapMax, Math.max(now(), ms.catchAt) + gain);
      ms.boosts++; ms.lastBoost = { nickname: p.nickname, at: now(), gain }; stat(p, 'boosts'); points = 250;
      message = `부스트 성공! ${ms.theme === 'robot' ? '로봇' : '바다 괴물'}에게서 ${Math.round(gain / 1000)}초 더 멀어졌어요.`;
      addFeed(g, p.nickname, '부스트!'); scheduleCatch(g);
      if (ms.theme === 'robot' && ms.part === 'chase') { ms.stageBoosts++; if (ms.stageBoosts >= ms.stageGoal) startMini(g); }
    } else { correct = false; message = '기호가 달랐어요. 부스트 실패! 다시 에너지를 모아요.'; }
  } else if (kind === 'flags') {
    if (ms.kind !== 'kingdom' || !a || a.kind !== 'flags') fail(400, '지금은 깃발을 꽂을 수 없어요.');
    const list = (Array.isArray(target) ? target : [target]).map(Number).filter(Number.isInteger).slice(0, a.remaining);
    const placed = [];
    for (const t of list) { if (canClaim(ms, p.team, t)) { ms.tiles[t] = p.team; placed.push(t); } }
    if (!placed.length) fail(400, '우리 팀 땅과 맞닿은 칸을 골라요.');
    const filled = encloseFill(ms, p.team);
    p.actions = null; stat(p, 'tiles', placed.length + filled.length); points = (placed.length + filled.length) * 20;
    ms.claims.unshift({ team: p.team, nickname: p.nickname, tiles: placed, filled, at: now() }); ms.claims.length = Math.min(ms.claims.length, 12);
    message = `깃발 ${placed.length}개를 꽂았어요!` + (filled.length ? ` 둘러싼 땅 ${filled.length}칸도 차지!` : '');
    if (filled.length) addFeed(g, p.nickname, `땅 ${filled.length}칸을 둘러싸 차지했어요!`);
  } else if (kind === 'stack') {
    if (ms.kind !== 'tower' || !a || a.kind !== 'blocks') fail(400, '지금은 블록을 떨어뜨릴 수 없어요.');
    const list = (Array.isArray(target) ? target : []).slice(0, a.remaining);
    const tw = ms.towers[p.team]; let ok = 0, perf = 0, bonus = false;
    for (const d of list) {
      const dx = Number(d && d.dx);
      if (!(d && d.ok) || !Number.isFinite(dx) || Math.abs(dx) > 0.5) continue;
      const top = tw.blocks.length ? tw.blocks[tw.blocks.length - 1].x : 0;
      const perfect = Math.abs(dx) <= 0.09;
      const x = Math.max(-1.2, Math.min(1.2, perfect ? top : top + dx));
      tw.height++; tw.blocks.push({ x: Math.round(x * 1000) / 1000, p: perfect ? 1 : 0 }); if (tw.blocks.length > 40) tw.blocks.shift();
      ok++; if (perfect) perf++;
      if (tw.height % ms.bonusEvery === 0) bonus = true;
    }
    stat(p, 'floors', ok); if (perf) stat(p, 'perfect', perf); points = ok * 20 + perf * 10;
    ms.drops.unshift({ team: p.team, nickname: p.nickname, count: ok, perfect: perf, at: now() }); ms.drops.length = Math.min(ms.drops.length, 12);
    p.actions = null;
    message = ok ? `${ok}층을 쌓았어요!` + (perf ? ` 완벽한 착지 ${perf}번!` : '') : '블록이 모두 떨어졌어요. 다음엔 가운데를 노려요!';
    if (bonus) { p.actions = { kind: 'blocks', remaining: 3, bonus: true }; message += ' 보너스 층 도착! 파워업 블록 3개!'; addFeed(g, p.nickname, `${tw.height}층 보너스 달성!`); }
    if (!ok) correct = false;
  } else fail(400, '알 수 없는 행동이에요.');
  arenaScore(g, p); p.reachedAt = now();
  g.resultSeq++; ranking(g);
  p.result = { seq: g.resultSeq, correct, points, streak: p.streak, answerText: '', message, rank: p.rank, prevRank: p.lastRank ?? null, action: kind }; p.lastRank = p.rank;
  touch(g);
}
// 컬러 킹덤 육각 격자 (홀수 줄이 오른쪽으로 반 칸 밀림)
function hexNeighbors(cols, rows, idx) {
  const c = idx % cols, r = Math.floor(idx / cols), odd = r % 2 === 1;
  const d = odd ? [[0, -1], [1, -1], [-1, 0], [1, 0], [0, 1], [1, 1]] : [[-1, -1], [0, -1], [-1, 0], [1, 0], [-1, 1], [0, 1]];
  return d.map(([dc, dr]) => [c + dc, r + dr]).filter(([x, y]) => x >= 0 && y >= 0 && x < cols && y < rows).map(([x, y]) => y * cols + x);
}
function canClaim(ms, team, t) {
  if (!Number.isInteger(t) || t < 0 || t >= ms.tiles.length) return false;
  if (ms.tiles[t] === team || ms.castles.includes(t)) return false;
  return hexNeighbors(ms.cols, ms.rows, t).some(n => ms.tiles[n] === team);
}
function encloseFill(ms, team) {
  const { cols, rows, tiles } = ms; const seen = new Uint8Array(tiles.length); const stack = [];
  for (let i = 0; i < tiles.length; i++) { const c = i % cols, r = Math.floor(i / cols); if ((c === 0 || r === 0 || c === cols - 1 || r === rows - 1) && tiles[i] !== team) { seen[i] = 1; stack.push(i); } }
  while (stack.length) { const i = stack.pop(); for (const n of hexNeighbors(cols, rows, i)) if (!seen[n] && tiles[n] !== team) { seen[n] = 1; stack.push(n); } }
  // 막힌 영역마다 다른 팀 성이 없으면 채움
  const filled = []; const done = new Uint8Array(tiles.length);
  for (let i = 0; i < tiles.length; i++) {
    if (seen[i] || done[i] || tiles[i] === team) continue;
    const region = [i]; done[i] = 1; let castle = false;
    for (let k = 0; k < region.length; k++) { const j = region[k]; if (ms.castles.includes(j)) castle = true; for (const n of hexNeighbors(cols, rows, j)) if (!seen[n] && !done[n] && tiles[n] !== team) { done[n] = 1; region.push(n); } }
    if (!castle) for (const j of region) { tiles[j] = team; filled.push(j); }
  }
  return filled;
}
// 마블 레이스: 모은 마블로 마지막 경주 (결과는 시작할 때 엔진이 미리 정함)
function startRace(g) {
  clearTimer(g); clearAuto(g);
  const ms = g.ms; const list = activePlayers(g);
  const marbles = []; let n = 0;
  for (const p of list) { const cnt = stv(p, 'marbles'), gold = Math.min(cnt, stv(p, 'gold')); for (let k = 0; k < cnt; k++) marbles.push({ id: 'm' + (n++), owner: p.id, nickname: p.nickname, color: p.color, gold: k < gold }); }
  // 섞기(같은 학생 구슬이 한곳에 몰리지 않게)
  for (let i = marbles.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [marbles[i], marbles[j]] = [marbles[j], marbles[i]]; }
  const seed = crypto.randomInt(1, 2147483646);
  const P = window.KQMarble; let mapId = null, sim = null;
  try { if (P && marbles.length) { mapId = P.mapFor(seed); sim = P.simulate(mapId, marbles.map(m => ({ id: m.id, gold: m.gold })), seed); } } catch (e) { console.error('구슬 레이스 계산 오류', e); sim = null; }
  if (!sim) { const fin = marbles.map(m => ({ id: m.id, t: 20 + crypto.randomInt(20000) / 1000 })).sort((a, b) => a.t - b.t); sim = { duration: fin.length ? fin[fin.length - 1].t : 3, finish: fin }; }
  // 학생별 가장 늦게 도착한 구슬 → 늦을수록 높은 등수
  const lastT = new Map(); const byId = new Map(marbles.map(m => [m.id, m]));
  sim.finish.forEach((f, i) => { const m = byId.get(f.id); if (m) lastT.set(m.owner, i); });
  const order = [...lastT.entries()].sort((a, b) => b[1] - a[1]).map(([pid], i) => { const p = g.players.get(pid); return { id: pid, nickname: p ? p.nickname : '', avatar: p ? p.avatar || null : null, place: i + 1 }; });
  // 추가 점수: 평균 근처 학생이 1등 하면 역전, 꼴등은 1등 해도 역전 못 함
  const scores = list.map(p => p.score); const top = Math.max(0, ...scores), low = scores.length ? Math.min(...scores) : 0, mean = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const r10 = v => Math.round(v / 10) * 10;
  let b1 = r10((top - mean) * 1.15 + 100);
  if (list.length > 1) b1 = Math.min(b1, Math.max(100, r10(top - low - 20)));
  b1 = Math.max(100, b1);
  const bonus = { 1: b1, 2: r10(b1 * 0.6), 3: r10(b1 * 0.35) };
  order.forEach(o => { o.bonus = bonus[o.place] || 0; });
  const lead = 4500, dur = Math.round(sim.duration * 1000);
  Object.assign(ms, { stage: 'race', mapId, seed, raceStart: now() + lead, duration: sim.duration, raceEnd: now() + lead + dur, marbles, finish: sim.finish, order, bonus, preScores: Object.fromEntries(list.map(p => [p.id, p.score])) });
  for (const p of g.players.values()) { p.actions = null; p.currentQ = null; }
  g.phase = 'running'; g.startAt = now(); g.endsAt = now() + lead + dur + 7000;
  addFeed(g, '마블 레이스', marbles.length ? `구슬 ${marbles.length}개의 마지막 레이스! 가장 늦게 들어오는 구슬이 1등` : '구슬이 없어 레이스 없이 끝나요');
  setTimer(g, lead + dur + 7000, () => finish(g, true)); touch(g);
}
function makeAwards(g) {
  const list = activePlayers(g); const best = (key, fn) => { let top = null, val = 0; for (const p of list) { const v = fn(p); if (v > val || (v === val && v > 0 && top && p.reachedAt < top.reachedAt)) { top = p; val = v; } } return top && val > 0 ? { nickname: top.nickname, avatar: top.avatar || null, value: val } : null; };
  const k = g.ms.kind; const out = [];
  const push = (id, title, desc, unit, fn) => { const b = best(id, fn); if (b) out.push({ id, title, desc, unit, ...b }); };
  if (k === 'chase') { push('energizer', '에너자이저', '부스트를 가장 많이 쓴 친구', '번', p => stv(p, 'boosts')); push('leader', '리더', '정답을 가장 많이 맞힌 친구', '개', p => p.correct); push('explorer', '탐험가', '문제를 가장 많이 도전한 친구', '문제', p => p.answered); if (g.ms.theme === 'robot') push('teamwork', '협동왕', '미니게임 미션을 가장 많이 해낸 친구', '번', p => stv(p, 'mission')); }
  if (k === 'runner') { push('streak', '연속 정답왕', '가장 길게 연속으로 맞힌 친구', '연속', p => stv(p, 'best')); push('dodger', '장애물 달인', '장애물을 가장 잘 피한 친구', '번', p => Math.max(0, stv(p, 'dodges') - stv(p, 'hits') * 2)); push('runner', '질주왕', '가장 멀리 달린 친구', 'm', p => stv(p, 'dist')); push('coin', '코인 수집왕', '코인을 가장 많이 모은 친구', '개', p => stv(p, 'coins')); push('hunter', '보스 사냥꾼', '퀴즈 런 보스를 가장 많이 쓰러뜨린 친구', '마리', p => stv(p, 'bossKills')); }
  if (k === 'garden') { push('fairy', '꽃 요정', '꽃을 가장 많이 피운 친구', '송이', p => stv(p, 'flowers')); push('rainbow', '무지개 정원사', '무지개 꽃을 가장 많이 피운 친구', '송이', p => stv(p, 'rare')); push('leader', '리더', '정답을 가장 많이 맞힌 친구', '개', p => p.correct); }
  if (k === 'boss') { push('striker', '최강 공격수', '보스에게 가장 큰 피해를 준 친구', '', p => stv(p, 'dmg')); push('critical', '치명타 장인', '치명타를 가장 많이 낸 친구', '번', p => stv(p, 'crit')); if (g.ms.finisher) out.push({ id: 'finisher', title: '마지막 일격', desc: '보스를 쓰러뜨린 친구', unit: '', nickname: g.ms.finisher.nickname, avatar: g.ms.finisher.avatar, value: 0 }); if (g.ms.cleared) { push('looter', '보물 사냥꾼', '보스의 보물을 가장 많이 가져간 친구', '점', p => stv(p, 'loot')); push('legend', '전설의 수집가', '전설의 보물과 비밀 보물을 가장 많이 찾은 친구', '개', p => stv(p, 'legend')); } }
  if (k === 'treasure') { push('lucky', '행운왕', '가장 큰 보물을 찾은 친구', '금화', p => stv(p, 'bigWin')); push('opener', '상자 탐험가', '상자를 가장 많이 연 친구', '개', p => stv(p, 'chests')); push('leader', '리더', '정답을 가장 많이 맞힌 친구', '개', p => p.correct); }
  if (k === 'marble') { const w = (g.ms.order || [])[0]; if (w) out.push({ id: 'lastone', title: '끈질긴 구슬', desc: '구슬 레이스에서 가장 늦게 들어온 친구', unit: '', nickname: w.nickname, avatar: w.avatar, value: 0 }); push('collector', '수집가', '마블을 가장 많이 모은 친구', '개', p => stv(p, 'marbles')); push('golden', '황금손', '황금 마블을 가장 많이 만든 친구', '개', p => stv(p, 'gold')); push('leader', '리더', '정답을 가장 많이 맞힌 친구', '개', p => p.correct); }
  if (k === 'kingdom') { push('pioneer', '개척자', '땅을 가장 많이 차지한 친구', '칸', p => stv(p, 'tiles')); push('leader', '리더', '정답을 가장 많이 맞힌 친구', '개', p => p.correct); push('explorer', '탐험가', '문제를 가장 많이 도전한 친구', '문제', p => p.answered); }
  if (k === 'tower') { push('builder', '건축왕', '가장 많은 층을 쌓은 친구', '층', p => stv(p, 'floors')); push('perfect', '완벽 장인', '완벽한 착지를 가장 많이 한 친구', '번', p => stv(p, 'perfect')); push('leader', '리더', '정답을 가장 많이 맞힌 친구', '개', p => p.correct); }
  return out;
}
function nextPersonalQuestion(g, p) {
  if (!p.queue || !p.queue.length) {
    let idx = g.questions.map((q, i) => i).filter(i => !isOwn(g, p, g.questions[i]));
    if (!idx.length) idx = g.questions.map((q, i) => i);
    p.queue = g.options.randomizeQuestions || p.round ? shuffle(idx) : idx; p.round = (p.round || 0) + 1;
    if (p.queue.length > 1 && p.queue[0] === p.lastQ) p.queue.push(p.queue.shift());
  }
  p.currentQ = p.queue.shift(); p.lastQ = p.currentQ; p.qStartedAt = now();
}
function arenaStats(p) { return { best: stv(p, 'best'), hits: stv(p, 'hits'), dodges: stv(p, 'dodges'), coins: stv(p, 'coins'), dist: stv(p, 'dist'), mission: stv(p, 'mission'), charge: p.charge || 0, boosts: stv(p, 'boosts'), marbles: stv(p, 'marbles'), gold: stv(p, 'gold'), tiles: stv(p, 'tiles'), floors: stv(p, 'floors'), perfect: stv(p, 'perfect') }; }
function playerAnswer(g, p, q, ev, elapsed, meta) {
  const lostStreak = !ev.correct && p.streak >= 2;
  p.answered++; if (ev.correct) { p.correct++; p.streak++; } else p.streak = 0;
  const st = g.stats[g.questions.indexOf(q)] || (g.stats[g.questions.indexOf(q)] = { questionId: q.id, text: q.text, type: q.type, answered: 0, correct: 0 });
  st.answered++; if (ev.correct) st.correct++;
  const ms = g.ms; let message = '', points = 0;
  if (ARENA_MODES.has(g.mode)) {
    message = arenaAnswer(g, p, q, ev, elapsed); arenaScore(g, p); points = ev.correct ? 100 : 0;
  } else if (g.mode === 'robot') {
    if (ev.correct) { let step = 1; p.turbo = p.streak > 0 && p.streak % 3 === 0; if (p.turbo) { step++; addFeed(g, p.nickname, '터보 부스트!'); } p.pos = Math.min(ms.goal, p.pos + step); points = step; message = p.turbo ? '터보! 두 칸 전진!' : '한 칸 전진!'; }
    else { p.turbo = false; p.lockedUntil = now() + 3000; message = '로봇 수리 중… 3초만 기다려요.'; }
    p.score = p.pos; if (p.pos >= ms.goal && !p.finishedRank) finishLine(g, p);
  } else if (g.mode === 'marble') {
    if (ev.correct) { let boost = Math.round(4 + 6 * (1 - speedFactor(q, elapsed))); if (p.streak > 0 && p.streak % 3 === 0) boost += 2; p.dist = Math.min(ms.goal, p.dist + boost); p.lastBoost = boost; points = boost; message = `${boost}m 가속!`; }
    else { p.dist = Math.max(0, p.dist - 2); p.lastBoost = -2; message = '앗, 벽에 부딪혀 2m 밀려났어요.'; }
    p.score = p.dist; if (p.dist >= ms.goal && !p.finishedRank) finishLine(g, p);
  } else if (g.mode === 'runner') {
    const m = meta && typeof meta === 'object' ? meta : {}; const ci = (v, hi) => Math.max(0, Math.min(hi, Math.round(Number(v) || 0)));
    const hits = ci(m.hits, 20), dodges = ci(m.dodges, 60), coins = ci(m.coins, 60), dist = ci(m.dist, 5000);
    stat(p, 'hits', hits); stat(p, 'dodges', dodges); stat(p, 'coins', coins); stat(p, 'dist', dist);
    const bossKill = Number(m.boss) === 1 ? 1 : 0; if (bossKill) stat(p, 'bossKills');
    if (ev.correct) {
      const lv = Math.min(5, Math.max(0, p.streak - 1)); points = Math.round(100 * (1 + 0.2 * lv)) + coins * 10;
      if (p.streak > stv(p, 'best')) { p.st.best = p.streak; }
      message = lv ? `정답! 연속 ${p.streak}번, 속도 ${lv + 1}단계!` : '정답! 골인!';
      if (p.streak > 0 && p.streak % 5 === 0) { points += 300; message = `피버 타임! ${p.streak}연속 정답 보너스 300점!`; addFeed(g, p.nickname, `${p.streak}연속 정답 피버!`); }
    } else { points = -50; message = '오답 문으로 들어갔어요. 속도가 처음으로 돌아가고 50점이 깎였어요.'; }
    if (bossKill) { points += 200; message += ' 보스 처치 보너스 +200점!'; addFeed(g, p.nickname, '퀴즈 런 보스를 쓰러뜨렸어요!'); }
    if (hits) { points -= hits * 20; message += ` 장애물 ${hits}번 충돌 -${hits * 20}점`; }
    if (coins && ev.correct) message += ` 코인 ${coins}개!`;
    p.score = Math.max(0, p.score + points); p.reachedAt = now();
  } else if (g.mode === 'tower') {
    if (ev.correct) { const gold = elapsed <= q.timeLimit * 1000 / 3; const block = { color: MARBLE_COLORS[crypto.randomInt(MARBLE_COLORS.length)], gold, value: gold ? 2 : 1 }; p.blocks.push(block); p.height += block.value; points = block.value; message = gold ? '황금 블록! 2층 쌓았어요.' : '블록 한 층 쌓았어요.'; if (gold && p.streak % 3 === 0) addFeed(g, p.nickname, '황금 블록 연속!'); }
    else { const top = p.blocks.pop(); if (top) { p.height -= top.value; message = '블록이 하나 무너졌어요.'; } else message = '아쉬워요! 다시 도전!'; }
    p.score = p.height; p.reachedAt = now();
  } else if (g.mode === 'treasure') {
    if (ev.correct) { const golden = p.streak >= 3 && p.streak % 3 === 0; p.actions = { kind: 'chest', remaining: 1, golden }; message = golden ? `연속 ${p.streak}번 정답! 황금 상자가 나타났어요!` : '정답! 보물상자를 하나 골라요.'; if (golden) addFeed(g, p.nickname, '황금 상자 등장!'); }
    else { p.lockedUntil = now() + 3000; message = '아쉬워요! 3초 쉬고 다음 문제로 상자에 도전해요.'; }
  }
  if (g.mode !== 'tower' && points > 0) p.reachedAt = now();
  g.resultSeq++;
  p.result = { seq: g.resultSeq, correct: ev.correct, points, streak: p.streak, lostStreak, answerText: answerText(q), message, prevRank: p.lastRank ?? null };
  if (g.mode !== 'treasure' || !ev.correct) nextPersonalQuestion(g, p); else p.currentQ = null;
  ranking(g); p.result.rank = p.rank; p.lastRank = p.rank;
}
function finishLine(g, p) {
  const done = activePlayers(g).filter(x => x.finishedRank).length;
  p.finishedRank = done + 1; addFeed(g, p.nickname, `결승선 통과! ${p.finishedRank}위`);
  if (activePlayers(g).every(x => x.finishedRank)) setTimeout(() => { if (g.phase === 'running') finish(g); }, 1500);
}
function openChest(g, p, choice) {
  if (!p.actions || p.actions.kind !== 'chest') fail(400, '지금은 상자를 열 수 없어요.');
  if (![0, 1, 2].includes(Number(choice))) fail(400, '상자를 고르세요.');
  const golden = !!p.actions.golden; const roll = crypto.randomInt(100); let text, gain = 0, prize, victim = null;
  const leader = activePlayers(g).filter(x => x.id !== p.id).sort((a, b) => b.score - a.score)[0];
  const table = golden
    ? [[25, 'gold250'], [55, 'gold500'], [75, 'double'], [90, 'magnet'], [100, 'jackpot']]
    : [[25, 'gold100'], [42, 'gold250'], [52, 'gold500'], [54, 'jackpot'], [62, 'double'], [69, 'share'], [77, 'magnet'], [100, 'empty']];
  prize = table.find(([lim]) => roll < lim)[1];
  if (prize === 'gold100') { gain = 100; text = '금화 100개'; }
  else if (prize === 'gold250') { gain = 250; text = '금화 250개!'; }
  else if (prize === 'gold500') { gain = 500; text = '금화 500개!!'; }
  else if (prize === 'jackpot') { gain = 1000; text = '잭팟! 금화 1000개!!!'; }
  else if (prize === 'double') { gain = Math.min(Math.max(p.score, 100), 1000); text = `두 배 상자! 금화 ${gain}개`; }
  else if (prize === 'share') { for (const x of g.players.values()) if (x.id !== p.id) x.score += 50; gain = 100; text = '나눔 상자! 모두에게 금화 50개, 나는 100개'; }
  else if (prize === 'magnet') {
    if (leader && leader.score > 0) { const take = Math.max(50, Math.min(400, Math.round(leader.score * 0.1))); leader.score = Math.max(0, leader.score - take); gain = take; victim = leader.nickname; text = `자석 상자! ${leader.nickname}에게서 금화 ${take}개를 끌어왔어요`; }
    else { gain = 200; text = '자석 상자! 금화 200개'; }
  } else { text = '텅 빈 상자… 꽝!'; }
  p.score += gain; p.reachedAt = now(); p.actions = null; stat(p, 'chests'); if (gain > stv(p, 'bigWin')) p.st.bigWin = gain;
  g.ms.events.unshift({ nickname: p.nickname, avatar: p.avatar || null, text, prize, gain, victim, golden, at: now() }); g.ms.events.length = Math.min(g.ms.events.length, 12);
  if (gain >= 500 || prize === 'share' || prize === 'magnet') addFeed(g, p.nickname, text, prize !== 'magnet' || !victim);
  g.resultSeq++; ranking(g);
  p.result = { seq: g.resultSeq, correct: true, points: gain, streak: p.streak, answerText: '', message: text, rank: p.rank, prevRank: p.lastRank ?? null, chest: Number(choice), prize, golden, victim }; p.lastRank = p.rank;
  nextPersonalQuestion(g, p);
}
function claimTile(g, p, target) {
  if (g.mode !== 'kingdom' || g.phase !== 'reveal' || !p.actions || p.actions.kind !== 'claim' || p.actions.remaining < 1) fail(400, '지금은 땅을 차지할 수 없어요.');
  const t = Number(target); if (!Number.isInteger(t) || t < 0 || t >= g.ms.tiles.length) fail(400, '칸을 다시 고르세요.');
  if (g.ms.tiles[t] === p.team) fail(400, '이미 우리 팀 땅이에요.');
  const stolen = g.ms.tiles[t] >= 0; g.ms.tiles[t] = p.team; p.actions.remaining--; p.score += 50;
  if (stolen) addFeed(g, p.nickname, '상대 팀 땅을 빼앗았어요!');
  if (!p.actions.remaining) p.actions = null;
}
function launchEnergy(g, p, target) {
  if (g.mode !== 'space' || g.phase !== 'reveal' || !p.actions || p.actions.kind !== 'launch' || p.actions.remaining < 1) fail(400, '지금은 에너지를 보낼 수 없어요.');
  const planet = g.ms.planets.find(x => x.id === target); if (!planet) fail(400, '행성을 다시 고르세요.');
  planet.energy[p.team]++; p.actions.remaining--; p.score += 30;
  const max = Math.max(...planet.energy); const leaders = planet.energy.map((e, i) => e === max ? i : -1).filter(i => i >= 0);
  if (leaders.length === 1 && planet.owner !== leaders[0]) { planet.owner = leaders[0]; addFeed(g, p.nickname, `${planet.name} 정복!`); }
  if (!p.actions.remaining) p.actions = null;
}
function finish(g, force) {
  if (g.phase === 'finished') return;
  if (g.mode === 'marble' && g.ms.stage === 'collect' && !force) { if (g.phase === 'question') reveal(g); startRace(g); return; }
  if (g.mode === 'marble' && g.ms.stage === 'race' && !g.ms.paid) { g.ms.paid = true; for (const o of g.ms.order) { const p = g.players.get(o.id); if (p && o.bonus) { p.score += o.bonus; p.delta = o.bonus; addFeed(g, p.nickname, `구슬 레이스 ${o.place}등! +${o.bonus}점`); } } }
  clearTimer(g); clearAuto(g); if (g.catchTimer) { clearTimeout(g.catchTimer); g.catchTimer = null; } if (g.miniTick) { clearInterval(g.miniTick); g.miniTick = null; }
  if (g.ms.kind === 'chase' && (g.ms.status === 'running' || g.ms.status === 'ready')) g.ms.status = g.phase === 'running' && (g.ms.part === 'mini' || now() < g.ms.catchAt) ? 'success' : (g.phase === 'running' ? 'failed' : 'ready');
  if (g.ms.kind === 'chase' && g.phase === 'running') { const ranked = activePlayers(g); ranked.forEach(p => arenaScore(g, p)); }
  if (g.ms && g.ms.kind) g.ms.awards = makeAwards(g);
  if (g.pacing === 'host' && g.phase === 'question') reveal(g);
  g.phase = 'finished'; g.endsAt = null;
  for (const p of g.players.values()) { p.actions = null; p.currentQ = null; }
  if (g.mode === 'garden' && g.ms.status === 'growing') g.ms.status = g.ms.bloomed >= g.ms.goal ? 'success' : 'failed';
  if (g.mode === 'boss' && g.ms.status === 'fighting') g.ms.status = g.ms.cleared || g.ms.defeated.length ? 'victory' : 'defeat';
  saveReport(g); touch(g);
}
function saveReport(g) {
  const ranked = ranking(g); const teams = teamSummary(g);
  const report = {
    id: id(), quizId: g.quizId, quizTitle: g.quizTitle, mode: g.mode, modeName: g.modeName, createdAt: iso(), playerCount: ranked.length,
    teams: teams ? teams.map(t => ({ name: t.name, score: t.score, members: t.members })) : null,
    players: ranked.map(p => ({ nickname: p.nickname, team: g.teams ? g.teams[p.team].name : null, score: p.score, rank: p.rank, correct: p.correct, answered: p.answered })),
    questions: g.questions.map((q, i) => { const s = g.stats[i]; const answered = s?.answered || 0; return { text: q.text, type: q.type, answered, correct: s?.correct || 0, accuracy: q.type === 'poll' || !answered ? null : (s.correct / answered) }; })
  };
  if (!ranked.length) return;
  g.reportId = report.id; HOOKS.report(g, report);
}

// 플레이어 참가와 답 제출
function joinGame(g, deviceKey, nickname, avatar, rejoin) {
  if (g.kicked.has(deviceKey)) fail(403, '진행자가 이 기기를 게임에서 내보냈어요.');
  const rj = typeof rejoin === 'string' && /^[a-z0-9]{12,64}$/i.test(rejoin) ? rejoin : null;
  let existing = [...g.players.values()].find(p => p.deviceKey === deviceKey);
  if (!existing && rj) { existing = [...g.players.values()].find(p => p.rejoinKey === rj) || null; if (existing) { if (g.kicked.has(existing.deviceKey)) fail(403, '진행자가 이 기기를 게임에서 내보냈어요.'); existing.deviceKey = deviceKey; existing.seenAt = now(); if (g.phase !== 'lobby') addFeed(g, existing.nickname, '다시 들어왔어요.'); touch(g); return existing; } }
  if (existing) { existing.seenAt = now(); const av = normAvatar(avatar); if (av && g.phase === 'lobby') { existing.avatar = av; touch(g); } return existing; }
  if (g.phase === 'finished') fail(409, '이미 끝난 게임이에요.');
  if (g.locked) fail(423, '진행자가 게임을 잠갔어요. 선생님께 말씀드리세요.');
  if (g.players.size >= 300) fail(409, '참가 인원이 가득 찼어요.');
  let nick;
  const taken = n => [...g.players.values()].some(p => p.nickname.toLowerCase() === n.toLowerCase());
  if (g.options.friendlyNicknames) { let tries = 0; do { nick = randomNick(); if (++tries > 30) nick = randomNick() + ' ' + crypto.randomInt(10, 100); } while (taken(nick)); }
  else {
    nick = clean(nickname, 15); if (!nick) fail(400, '닉네임을 입력하세요.');
    if (badName(nick)) fail(400, '친구들이 기분 좋게 볼 수 있는 닉네임을 써 주세요.');
    if (taken(nick)) fail(409, '이미 사용 중인 닉네임이에요. 다른 닉네임을 정해 주세요.');
  }
  const p = {
    id: crypto.randomBytes(6).toString('hex'), deviceKey, nickname: nick, avatar: normAvatar(avatar), team: g.teams ? teamFor(g) : null, score: 0, correct: 0, answered: 0, streak: 0, delta: 0,
    joinedAt: now(), seenAt: now(), rejoinKey: rj, reachedAt: now(), conns: 0, result: null, actions: null, rank: 0,
    pos: 0, dist: 0, lastBoost: 0, height: 0, blocks: [], color: MARBLE_COLORS[g.players.size % MARBLE_COLORS.length], turbo: false, lockedUntil: null, finishedRank: null, currentQ: null
  };
  g.players.set(p.id, p);
  if (g.phase === 'running') nextPersonalQuestion(g, p);
  if (g.phase !== 'lobby') addFeed(g, nick, '게임에 들어왔어요.');
  touch(g); return p;
}
function submitAnswer(g, p, questionId, answer, meta) {
  if (g.pacing === 'host') {
    if (g.phase !== 'question') fail(409, '지금은 답을 낼 수 없어요.');
    const q = g.questions[g.qIndex]; if (q.id !== questionId) fail(409, '이미 다음 문제로 넘어갔어요.');
    if (isOwn(g, p, q)) fail(409, '내가 낸 문제는 풀지 않아요.');
    if (p.joinedAt > g.startAt) fail(409, '다음 문제부터 참여할 수 있어요.');
    if (g.answers.has(p.id)) fail(409, '이미 답을 냈어요.');
    const elapsed = now() - g.startAt; const ev = evaluate(q, answer);
    let points = 0, lostStreak = false;
    if (ev.correct === false) lostStreak = p.streak >= 2;
    if (ev.correct) { p.streak++; points = Math.round(basePoints(q, elapsed) * ev.factor); if (points > 0 && p.streak >= 2) points += Math.min(p.streak - 1, 5) * 100; p.correct++; }
    else if (ev.correct === false) p.streak = 0;
    if (q.type !== 'poll') p.answered++;
    p.score += points; p.delta = points; p.reachedAt = now();
    let mg = null;
    if (g.mode === 'marble' && ev.correct) { const fast = elapsed <= q.timeLimit * 1000 / 3; const extra = p.streak >= 3 ? 1 : 0; mg = { count: 1 + (fast ? 1 : 0) + extra, gold: fast ? 1 : 0, streak: extra }; stat(p, 'marbles', mg.count); if (fast) stat(p, 'gold'); }
    g.answers.set(p.id, { playerId: p.id, value: ev.value, correct: ev.correct, points, elapsed, lostStreak, mg });
    if (g.answers.size >= expectedPlayers(g).length) reveal(g); else touch(g);
    return {};
  }
  if (g.phase !== 'running') fail(409, '지금은 답을 낼 수 없어요.');
  if (p.finishedRank && (g.mode === 'robot' || g.mode === 'marble')) fail(409, '이미 결승선을 통과했어요!');
  if (ARENA_MODES.has(g.mode) && p.actions) fail(409, '먼저 지금 할 일을 끝내요.');
  if (g.mode === 'marble' && g.ms.stage !== 'collect') fail(409, '마블 레이스가 시작됐어요. 큰 화면을 보세요!');
  if (g.mode === 'robot' && g.ms.part === 'mini') fail(409, '지금은 미니게임 중이에요!');
  if (p.currentQ === null || p.currentQ === undefined) fail(409, '보물상자를 먼저 골라요.');
  if (p.lockedUntil && p.lockedUntil > now()) fail(409, '잠깐 숨을 고르는 중이에요.');
  const q = g.questions[p.currentQ]; if (q.id !== questionId) fail(409, '문제가 바뀌었어요. 화면을 확인하세요.');
  const elapsed = now() - p.qStartedAt; const ev = evaluate(q, answer);
  playerAnswer(g, p, q, ev, elapsed, meta); touch(g);
  return { result: p.result };
}

// ---------- 화면 상태 ----------
function hostQuestion(g, q, revealed) {
  const out = { id: q.id, type: q.type, text: q.text, image: q.image, timeLimit: q.timeLimit, points: q.points, authorName: q.authorName,
    choices: q.perm.map(o => revealed ? { text: q.choices[o].text, correct: !!q.choices[o].correct } : { text: q.choices[o].text }),
    puzzleItems: q.puzzle ? q.puzzle.map(x => ({ id: x.id, text: q.choices[x.orig].text })) : [],
    slider: q.slider ? { min: q.slider.min, max: q.slider.max, step: q.slider.step } : null };
  if (q.type === 'puzzle') out.choices = [];
  if (revealed) { if (q.type === 'type') out.accepted = q.accepted; if (q.slider) Object.assign(out.slider, { answer: q.slider.answer, tolerance: q.slider.tolerance }); if (q.type === 'puzzle') out.puzzleOrder = q.choices.map(c => c.text); }
  return out;
}
function modeStateView(g) {
  const ms = g.ms, list = ranking(g);
  const lite = p => ({ id: p.id, nickname: p.nickname, avatar: p.avatar || null, team: p.team, correct: p.correct, answered: p.answered, ...arenaStats(p) });
  if (ms.kind === 'chase') return { kind: 'chase', theme: ms.theme, status: ms.status, startAt: ms.startAt, endsAt: g.endsAt, catchAt: ms.catchAt, gapMax: ms.gapMax, boostMs: ms.boostMs, boosts: ms.boosts, lastBoost: ms.lastBoost, symSeed: ms.symSeed, symPeriod: ms.symPeriod, symStart: ms.symStart, symbols: SYMBOLS, runners: list.slice(0, 60).map(lite), awards: ms.awards, stage: ms.stage || 0, stages: ms.stages || 0, part: ms.part || 'chase', stageBoosts: ms.stageBoosts || 0, stageGoal: ms.stageGoal || 0, cleared: !!ms.cleared, lastMini: ms.lastMini || null, pausedGap: ms.part === 'mini' ? ms.pausedGap : null, mini: miniView(g, ms.mini) };
  if (ms.kind === 'runner') return { mapLen: ms.mapLen, mapSeed: ms.mapSeed, kind: 'runner', players: list.slice(0, 60).map(p => ({ id: p.id, nickname: p.nickname, avatar: p.avatar || null, score: p.score, rank: p.rank, correct: p.correct, answered: p.answered, streak: p.streak, best: stv(p, 'best'), hits: stv(p, 'hits'), dodges: stv(p, 'dodges'), coins: stv(p, 'coins'), dist: stv(p, 'dist'), lastAt: p.reachedAt })), awards: ms.awards };
  if (ms.kind === 'marble') { const pl = list.slice(0, 80).map(p => ({ id: p.id, nickname: p.nickname, avatar: p.avatar || null, color: p.color, marbles: stv(p, 'marbles'), gold: stv(p, 'gold'), correct: p.correct, score: p.score })); const base = { kind: 'marble', stage: ms.stage, totalMarbles: pl.reduce((a, p) => a + p.marbles, 0), totalGold: pl.reduce((a, p) => a + p.gold, 0), players: pl, lastGain: ms.lastGain, awards: ms.awards }; return ms.stage === 'race' ? { ...base, mapId: ms.mapId, seed: ms.seed, raceStart: ms.raceStart, duration: ms.duration, raceEnd: ms.raceEnd, marbles: ms.marbles, finish: ms.finish, order: ms.order, bonus: ms.bonus, paid: !!ms.paid } : base; }
  if (ms.kind === 'kingdom') return { kind: 'kingdom', cols: ms.cols, rows: ms.rows, tiles: ms.tiles, castles: ms.castles, claims: ms.claims, teams: teamSummary(g), builders: list.slice(0, 60).map(lite), awards: ms.awards };
  if (ms.kind === 'tower') return { kind: 'tower', bonusEvery: ms.bonusEvery, towers: ms.towers, drops: ms.drops, teams: teamSummary(g), builders: list.slice(0, 60).map(lite), awards: ms.awards };
  if (g.mode === 'robot') return { goal: ms.goal, racers: list.map(p => ({ id: p.id, nickname: p.nickname, pos: p.pos, finishedRank: p.finishedRank, turbo: p.turbo, repairing: !!(p.lockedUntil && p.lockedUntil > now()) })) };
  if (g.mode === 'marble') return { goal: ms.goal, marbles: list.map(p => ({ id: p.id, nickname: p.nickname, dist: p.dist, color: p.color, finishedRank: p.finishedRank, lastBoost: p.lastBoost })) };
  if (g.mode === 'tower') return { towers: list.map(p => ({ id: p.id, nickname: p.nickname, height: p.height, blocks: p.blocks.slice(-30).map(b => ({ color: b.color, gold: b.gold })) })) };
  if (g.mode === 'treasure') return { kind: 'treasure', players: list.slice(0, 60).map(p => ({ id: p.id, nickname: p.nickname, avatar: p.avatar || null, gold: p.score, streak: p.streak, chests: stv(p, 'chests') })), events: ms.events, awards: ms.awards || [] };
  if (g.mode === 'kingdom') return { cols: ms.cols, rows: ms.rows, tiles: ms.tiles, teams: teamSummary(g) };
  if (g.mode === 'space') return { planets: ms.planets, teams: teamSummary(g) };
  if (g.mode === 'submarine' || g.mode === 'garden' || g.mode === 'boss') return { ...ms };
  return {};
}
function podium(g) { return ranking(g).slice(0, 5).map(p => ({ rank: p.rank, nickname: p.nickname, score: p.score, team: g.teams ? g.teams[p.team].name : null, avatar: p.avatar || null })); }
function leaderboard(g) { return ranking(g).slice(0, 5).map(p => ({ rank: p.rank, nickname: p.nickname, score: p.score, delta: p.delta || 0, streak: p.streak, avatar: p.avatar || null, prevRank: p.boardPrevRank ?? null })); }
function hostView(g) {
  const q = g.pacing === 'host' && g.qIndex >= 0 && ['question', 'reveal', 'leaderboard'].includes(g.phase) ? g.questions[g.qIndex] : null;
  const revealed = g.phase === 'reveal' || g.phase === 'leaderboard';
  let rev = null;
  if (q && revealed) {
    const answers = [...g.answers.values()];
    rev = { correctCount: answers.filter(a => a.correct).length, answered: answers.length, distribution: null, typed: null, sliderAverage: null };
    if (['quiz', 'truefalse', 'poll'].includes(q.type)) { rev.distribution = q.perm.map(() => 0); for (const a of answers) rev.distribution[a.value]++; }
    if (q.type === 'type') { const m = new Map(); for (const a of answers) { const k = normAns(a.value); const e = m.get(k) || { text: a.value, count: 0, correct: a.correct }; e.count++; m.set(k, e); } rev.typed = [...m.values()].sort((x, y) => y.count - x.count).slice(0, 8); }
    if (q.type === 'slider' && answers.length) rev.sliderAverage = Math.round(answers.reduce((n, a) => n + a.value, 0) / answers.length * 100) / 100;
  }
  const ranked = ranking(g);
  return {
    role: 'host', pin: g.pin, quizId: g.quizId, mode: g.mode, modeName: g.modeName, pacing: g.pacing, teamsEnabled: !!g.teams, quizTitle: g.quizTitle, phase: g.phase, serverNow: now(),
    joinUrls: addresses().length ? addresses() : [`http://localhost:${PORT}`], locked: g.locked, options: g.options, reportId: g.reportId,
    players: ranked.map(p => ({ id: p.id, nickname: p.nickname, team: p.team, score: p.score, correct: p.correct, connected: p.conns > 0, answered: g.answers.has(p.id), avatar: p.avatar || null })), playerCount: ranked.length, autoAt: g.autoAt || null,
    teams: teamSummary(g), questionIndex: g.qIndex, questionCount: g.questions.length,
    loop: !!g.loop || LOOP_MODES.has(g.mode), gameEndsAt: g.gameEndsAt || null, questionRound: g.qRound || 0, questionSeq: g.qSeq || 0, gameDuration: g.options.duration,
    question: q ? hostQuestion(g, q, revealed) : null, endsAt: g.endsAt,
    answeredCount: g.phase === 'question' ? g.answers.size : (rev?.answered ?? 0), expectedCount: g.phase === 'question' ? expectedPlayers(g).length : 0,
    reveal: rev, leaderboard: ['leaderboard', 'finished'].includes(g.phase) || g.mode === 'classic' || g.mode === 'marble' ? leaderboard(g) : [],
    podium: g.phase === 'finished' ? podium(g) : [], feed: g.feed, modeState: modeStateView(g)
  };
}
function playerView(g, deviceKey) {
  const p = [...g.players.values()].find(x => x.deviceKey === deviceKey);
  const base = { role: 'player', pin: g.pin, mode: g.mode, modeName: g.modeName, pacing: g.pacing, phase: g.phase, serverNow: now(), quizTitle: g.quizTitle, kicked: g.kicked.has(deviceKey), endsAt: g.endsAt, autoAt: g.autoAt || null, modeState: modeStateView(g) };
  if (!p) return { ...base, me: null, question: null, answered: false, result: null, actions: null, leaderboard: [], podium: g.phase === 'finished' ? podium(g) : [] };
  ranking(g);
  const me = { stats: arenaStats(p), id: p.id, nickname: p.nickname, team: p.team, teamName: g.teams ? g.teams[p.team].name : null, teamColor: g.teams ? g.teams[p.team].color : null, score: p.score, rank: p.rank, streak: p.streak, correct: p.correct, answered: p.answered, playerCount: g.players.size, avatar: p.avatar || null };
  let question = null, answered = false;
  let q = null;
  if (g.pacing === 'host' && g.phase === 'question') { q = g.questions[g.qIndex]; answered = g.answers.has(p.id); }
  if (g.pacing === 'player' && g.phase === 'running' && p.currentQ !== null && p.currentQ !== undefined && !(ARENA_MODES.has(g.mode) ? (p.actions || (g.mode === 'marble' && g.ms.stage !== 'collect') || (g.mode === 'robot' && g.ms.part === 'mini')) : (p.finishedRank && (g.mode === 'robot' || g.mode === 'marble')))) q = g.questions[p.currentQ];
  if (q) {
    const show = g.options.showOnDevice || g.pacing === 'player';
    question = { id: q.id, type: q.type, text: show ? q.text : null, image: show ? q.image : null, timeLimit: q.timeLimit, points: q.points, choiceCount: q.perm.length,
      choices: q.perm.map(o => ({ text: show ? q.choices[o].text : null })), puzzleItems: q.puzzle ? q.puzzle.map(x => ({ id: x.id, text: q.choices[x.orig].text })) : [],
      slider: q.slider ? { min: q.slider.min, max: q.slider.max, step: q.slider.step } : null, ownQuestion: g.pacing === 'host' && (isOwn(g, p, q) || p.joinedAt > g.startAt) };
    if (q.type === 'puzzle') question.choices = [];
  }
  return { ...base, me, question, answered, endsAt: g.pacing === 'player' ? g.endsAt : g.endsAt, lockedUntil: p.lockedUntil && p.lockedUntil > now() ? p.lockedUntil : null,
    result: ['reveal', 'leaderboard', 'running', 'finished'].includes(g.phase) ? p.result : null, actions: p.actions, questionStartedAt: g.pacing === 'player' ? p.qStartedAt : g.startAt,
    leaderboard: (g.mode === 'classic' || g.mode === 'marble') && ['leaderboard', 'finished'].includes(g.phase) ? leaderboard(g) : [], podium: g.phase === 'finished' ? podium(g) : [] };
}
  function seenPlayer(g, p, kind) { p.seenAt = now(); if (kind === 'leave' && g.phase === 'lobby') { g.players.delete(p.id); touch(g); } }
  function sweepLobby(g, ms) { if (g.phase !== 'lobby') return false; let ch = false; for (const p of [...g.players.values()]) if (now() - (p.seenAt || p.joinedAt) > ms) { g.players.delete(p.id); ch = true; } if (ch) touch(g); return ch; }
  window.KQEngine = { seenPlayer, sweepLobby, miniAction, MINI_SPECS, ROBOT, arenaAction, resumeMode, symbolAt, hexNeighbors, canClaim, ARENA_MODES, scheduleAuto, clearAuto, applySettings, normAvatar, HOOKS, games, MODES, modeOf, createGame, getGame, startGame, hostNext, reveal, finish, joinGame, submitAnswer, openChest, claimTile, launchEnergy, hostView, playerView, ranking, expectedPlayers, setTimer, clearTimer, startQuestion, startRun, normQuestion, normQuestions, publicQuestion, quizFromInput, randomNick, badName, clean, cleanText, id, iso, fail, THEMES };
})();
