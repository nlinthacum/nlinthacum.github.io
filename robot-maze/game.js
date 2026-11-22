(function () {
  const SAVE_KEY = "robot-maze-v1";
  const DIR = {
    up: { dr: -1, dc: 0 },
    down: { dr: 1, dc: 0 },
    left: { dr: 0, dc: -1 },
    right: { dr: 0, dc: 1 }
  };
  const KEY_DIR = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    w: "up",
    W: "up",
    s: "down",
    S: "down",
    a: "left",
    A: "left",
    d: "right",
    D: "right"
  };

  const reduceQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reduce = reduceQuery.matches;
  reduceQuery.addEventListener("change", function (event) { reduce = event.matches; });

  const $ = function (id) { return document.getElementById(id); };
  const board = $("board");
  const ctx = board.getContext("2d");
  const slot = $("slot");
  const startEl = $("start");
  const playEl = $("play");
  const resultEl = $("result");
  const clearModal = $("clear-modal");

  const ui = {
    level: $("level-readout"),
    moves: $("moves-readout"),
    best: $("best-readout"),
    score: $("score-readout"),
    charge: $("charge-readout"),
    chargeBar: $("charge-bar"),
    chargeStat: $("charge-stat"),
    shift: $("shift-readout"),
    shiftBar: $("shift-bar"),
    hint: $("hint"),
    undo: $("undo"),
    clearEyebrow: $("clear-eyebrow"),
    clearDetail: $("clear-detail"),
    clearBest: $("clear-best"),
    next: $("next-level"),
    deviceBest: $("device-best"),
    startStatus: $("start-status"),
    startScores: $("start-scores"),
    resultReason: $("result-reason"),
    resultScore: $("result-score"),
    resultMeta: $("result-meta"),
    resultMsg: $("result-msg"),
    resultScores: $("result-scores"),
    rankLine: $("rank-line"),
    form: $("score-form"),
    name: $("player-name"),
    submit: $("submit-score"),
    live: $("live"),
    sound: $("sound")
  };

  let save = loadSave();
  let phase = "start";
  let level = 1;
  let cfg = RobotMaze.levelConfig(1);
  let maze = null;
  let shiftRand = null;
  let plan = [];
  let player = { r: 0, c: 0 };
  let facing = { dr: 1, dc: 0 };
  let levelMoves = 0;
  let levelSeconds = 0;
  let bankedMoves = 0;
  let bankedSeconds = 0;
  let levelsCleared = 0;
  let charge = 80;
  let shiftTimer = 12;
  let history = [];
  let footprints = [];
  let particles = [];
  let anim = null;
  let shake = 0;
  let view = { cell: 32, wall: 6, w: 32, h: 32 };
  let activeDirs = [];
  let queuedDir = null;
  let nextMoveAt = 0;
  let endReason = "battery";
  let submitted = false;
  let submitting = false;
  let pendingMine = null;
  let audioCtx = null;
  const listTokens = new WeakMap();

  function loadSave() {
    const fresh = { bestMoves: {}, bestScore: 0, name: "", sound: false };
    try {
      const data = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
      if (!data || typeof data !== "object") return fresh;
      if (data.bestMoves && typeof data.bestMoves === "object") {
        Object.keys(data.bestMoves).forEach(function (key) {
          const n = Number(key);
          const moves = data.bestMoves[key];
          if (Number.isInteger(n) && n >= 1 && n <= 999 && Number.isInteger(moves) && moves >= 0 && moves < 100000) {
            fresh.bestMoves[n] = moves;
          }
        });
      }
      if (Number.isInteger(data.bestScore) && data.bestScore >= 0 && data.bestScore <= 100000) {
        fresh.bestScore = data.bestScore;
      }
      if (typeof data.name === "string") fresh.name = data.name.slice(0, 16);
      fresh.sound = data.sound === true;
    } catch (err) { /* keep defaults */ }
    return fresh;
  }

  function persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (err) { /* private mode */ }
  }

  function motion(ms) { return reduce ? 0 : ms; }

  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  function ease(u) { return u * u * (3 - 2 * u); }

  function currentScore() {
    return RobotMaze.scoreRun(levelsCleared, bankedMoves, bankedSeconds);
  }

  function formatScore(n) {
    return n.toLocaleString("en-US");
  }

  function announce(text) { ui.live.textContent = text; }

  function cleanName(value) {
    return String(value || "").normalize("NFKC").trim().replace(/\s+/g, " ");
  }

  function validName(name) {
    if (name.length < 1 || name.length > 16) return false;
    if (!/^[\p{L}\p{N} _-]+$/u.test(name)) return false;
    return /[\p{L}\p{N}_-]/u.test(name);
  }

  function showDeviceBest() {
    ui.deviceBest.textContent = save.bestScore > 0
      ? "Best on this device: " + formatScore(save.bestScore)
      : "Best on this device: —";
  }

  function blip(freq, dur, type, vol) {
    if (!save.sound) return;
    try {
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === "suspended") audioCtx.resume();
      const t = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type || "sine";
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch (err) { /* audio is optional */ }
  }

  function syncSoundButton() {
    ui.sound.classList.toggle("muted", !save.sound);
    ui.sound.setAttribute("aria-pressed", save.sound ? "true" : "false");
    ui.sound.setAttribute("aria-label", save.sound ? "Mute sound" : "Unmute sound");
  }

  function setScreens(which) {
    startEl.hidden = which !== "start";
    playEl.hidden = which !== "play";
    resultEl.hidden = which !== "result";
    document.body.classList.toggle("in-game", which === "play");
  }

  function layout() {
    if (!maze || playEl.hidden) return;
    const availW = slot.clientWidth;
    const availH = slot.clientHeight;
    if (availW < 16 || availH < 16) return;
    const cell = Math.max(8, Math.min(78, Math.floor(Math.min(availW / maze.cols, availH / maze.rows))));
    const w = cell * maze.cols;
    const h = cell * maze.rows;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (board.width !== Math.floor(w * dpr) || board.height !== Math.floor(h * dpr)) {
      board.width = Math.floor(w * dpr);
      board.height = Math.floor(h * dpr);
    }
    board.style.width = w + "px";
    board.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    view.cell = cell;
    view.wall = Math.max(3, Math.round(cell * 0.18));
    view.w = w;
    view.h = h;
  }

  function beginMaze() {
    cfg = RobotMaze.levelConfig(level);
    const seed = RobotMaze.seedForLevel(level);
    maze = RobotMaze.generateMaze(cfg.cols, cfg.rows, seed, cfg.restless, cfg.braid);
    shiftRand = RobotMaze.mulberry32((seed ^ 0x5A17E) >>> 0);
    plan = RobotMaze.planShift(maze, cfg.shiftCount, shiftRand);
    player = { r: maze.start.r, c: maze.start.c };
    facing = maze.goal.r > player.r ? { dr: 1, dc: 0 } : { dr: 0, dc: 1 };
    shiftTimer = cfg.shiftEvery;
    anim = null;
    footprints = [];
    history = [];
    ui.hint.hidden = level !== 1;
    layout();
  }

  function startRun() {
    level = 1;
    levelsCleared = 0;
    bankedMoves = 0;
    bankedSeconds = 0;
    levelMoves = 0;
    levelSeconds = 0;
    history = [];
    particles = [];
    submitted = false;
    submitting = false;
    pendingMine = null;
    queuedDir = null;
    activeDirs = [];
    endReason = "battery";
    cfg = RobotMaze.levelConfig(1);
    charge = cfg.charge;
    clearModal.hidden = true;
    setScreens("play");
    beginMaze();
    phase = "play";
    announce("Level 1. Charge " + Math.ceil(charge) + " seconds.");
    layout();
  }

  function restartLevel() {
    if (phase !== "play" && phase !== "move" && phase !== "bump" && phase !== "shift") return;
    levelMoves = 0;
    particles = [];
    queuedDir = null;
    activeDirs = [];
    beginMaze();
    phase = "play";
    blip(240, 0.06, "sine", 0.03);
  }

  function undo() {
    if (anim && anim.type === "move") {
      player = { r: anim.from.r, c: anim.from.c };
      levelMoves = Math.max(0, levelMoves - 1);
      history.pop();
      anim = null;
      phase = "play";
      return;
    }
    if (phase !== "play" || !history.length) return;
    const prev = history[history.length - 1];
    const key = RobotMaze.edgeKey(player.r, player.c, prev.r, prev.c);
    if (!maze.pass.has(key)) {
      blip(90, 0.05, "square", 0.02);
      return;
    }
    history.pop();
    facing = { dr: prev.r - player.r, dc: prev.c - player.c };
    if (!facing.dr && !facing.dc) facing = { dr: 1, dc: 0 };
    player = { r: prev.r, c: prev.c };
    levelMoves = Math.max(0, levelMoves - 1);
  }

  function atGoal() {
    return maze && player.r === maze.goal.r && player.c === maze.goal.c;
  }

  function requestMove(name) {
    if (phase === "play" && !anim) {
      tryMove(name);
      nextMoveAt = performance.now() + (reduce ? 80 : 150);
      return;
    }
    if (phase === "move" || phase === "bump" || phase === "shift") queuedDir = name;
  }

  function drainQueue(now) {
    if (!queuedDir || phase !== "play" || anim) return;
    const name = queuedDir;
    queuedDir = null;
    tryMove(name);
    nextMoveAt = now + (reduce ? 80 : 150);
  }

  function tryMove(name) {
    if (phase !== "play" || anim) return;
    const dir = DIR[name];
    if (!dir) return;
    const nr = player.r + dir.dr;
    const nc = player.c + dir.dc;
    const now = performance.now();
    facing = { dr: dir.dr, dc: dir.dc };
    const blocked = nr < 0 || nc < 0 || nr >= maze.rows || nc >= maze.cols
      || !maze.pass.has(RobotMaze.edgeKey(player.r, player.c, nr, nc));
    if (blocked) {
      phase = "bump";
      anim = { type: "bump", dir: dir, t0: now, dur: motion(140) };
      blip(120, 0.07, "square", 0.018);
      return;
    }
    history.push({ r: player.r, c: player.c });
    if (history.length > 200) history.shift();
    footprints.push({ r: player.r, c: player.c, born: now });
    if (footprints.length > 14) footprints.shift();
    const from = { r: player.r, c: player.c };
    player = { r: nr, c: nc };
    levelMoves += 1;
    phase = "move";
    anim = { type: "move", from: from, to: { r: nr, c: nc }, t0: now, dur: motion(130) };
    blip(620, 0.045, "sine", 0.025);
  }

  function burst(x, y) {
    if (reduce) return;
    const colors = ["#ffc857", "#ff6b4a", "#8fd4cf", "#f4efe4"];
    for (let i = 0; i < 46; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 190;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 30,
        life: 0.65 + Math.random() * 0.55,
        age: 0,
        color: colors[i % colors.length],
        size: 2 + Math.random() * 3.2
      });
    }
  }

  function rememberBest(score) {
    if (score > save.bestScore) save.bestScore = score;
    persist();
    showDeviceBest();
  }

  function clearLevel() {
    if (phase === "clear" || phase === "ending" || phase === "result") return;
    phase = "clear";
    anim = null;
    bankedMoves += levelMoves;
    bankedSeconds += levelSeconds;
    levelsCleared += 1;
    const previous = save.bestMoves[level];
    const isBest = previous == null || levelMoves < previous;
    if (isBest) save.bestMoves[level] = levelMoves;
    const score = currentScore();
    rememberBest(score);
    ui.clearEyebrow.textContent = "Level " + level;
    ui.clearDetail.textContent = levelMoves + " moves · score " + formatScore(score);
    ui.clearBest.hidden = !isBest;
    clearModal.hidden = false;
    const center = cellCenter(maze.goal.r, maze.goal.c);
    burst(center.x, center.y);
    blip(523, 0.09, "sine", 0.04);
    setTimeout(function () { blip(659, 0.09, "sine", 0.04); }, 90);
    setTimeout(function () { blip(784, 0.12, "sine", 0.045); }, 180);
    announce("Charged. Level " + level + " cleared in " + levelMoves + " moves. Score " + score + ".");
    ui.next.focus();
  }

  function nextLevel() {
    if (phase !== "clear") return;
    clearModal.hidden = true;
    if (levelsCleared >= 999) {
      endRun("cleared");
      return;
    }
    level += 1;
    levelMoves = 0;
    levelSeconds = 0;
    const nextCfg = RobotMaze.levelConfig(level);
    charge = Math.min(nextCfg.chargeCap, Math.max(0, charge) + nextCfg.charge);
    particles = [];
    beginMaze();
    phase = "play";
    announce("Level " + level + ".");
  }

  function endRun(reason) {
    if (phase === "ending" || phase === "result") return;
    phase = "ending";
    endReason = reason || "battery";
    anim = null;
    clearModal.hidden = true;
    activeDirs = [];
    queuedDir = null;
    const score = currentScore();
    rememberBest(score);
    blip(reason === "battery" ? 90 : 330, 0.2, "triangle", 0.03);
    window.setTimeout(showResult, motion(680));
  }

  function showResult() {
    phase = "result";
    setScreens("result");
    const score = currentScore();
    ui.resultScore.textContent = formatScore(score);
    ui.resultReason.textContent = endReason === "battery"
      ? "The battery gave out."
      : endReason === "bank"
        ? "Score banked."
        : "The last bay is clear.";
    ui.resultMeta.textContent = levelsCleared + " cleared · " + bankedMoves + " moves · " + Math.floor(bankedSeconds) + "s";
    ui.name.value = save.name || "";
    ui.form.hidden = false;
    ui.rankLine.hidden = true;
    ui.resultMsg.textContent = "";
    submitted = false;
    submitting = false;
    pendingMine = null;
    ui.submit.disabled = !validName(cleanName(ui.name.value));
    announce(ui.resultReason.textContent + " Score " + score + ".");
    loadTop(ui.resultScores, ui.resultMsg, null);
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) ui.name.focus();
  }

  function showStart() {
    phase = "start";
    setScreens("start");
    showDeviceBest();
    loadTop(ui.startScores, ui.startStatus, null);
  }

  function rowIsMine(row, index, mine, rows) {
    if (!mine) return false;
    if (RobotLeaderboard.playerName(row) !== mine.name) return false;
    if (RobotLeaderboard.rowScore(row) !== mine.score) return false;
    if (mine.rank >= 1 && mine.rank <= rows.length) {
      const at = rows[mine.rank - 1];
      const rankMatches = at
        && RobotLeaderboard.playerName(at) === mine.name
        && RobotLeaderboard.rowScore(at) === mine.score;
      if (rankMatches) return index === mine.rank - 1;
    }
    return true;
  }

  function fillList(list, rows, mine) {
    list.replaceChildren();
    if (!rows.length) {
      const empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = "No scores yet.";
      list.append(empty);
      return;
    }
    rows.forEach(function (row, index) {
      const item = document.createElement("li");
      const rank = document.createElement("span");
      rank.className = "rank";
      rank.textContent = String(index + 1);
      const name = document.createElement("span");
      name.className = "who";
      name.textContent = RobotLeaderboard.playerName(row);
      const levelSpan = document.createElement("span");
      levelSpan.className = "lvl";
      const rowLevel = RobotLeaderboard.rowLevel(row);
      levelSpan.textContent = rowLevel == null ? "" : "Lv " + rowLevel;
      const score = document.createElement("span");
      score.className = "pts";
      const value = RobotLeaderboard.rowScore(row);
      score.textContent = Number.isFinite(value) ? formatScore(value) : "";
      item.append(rank, name, levelSpan, score);
      if (rowIsMine(row, index, mine, rows)) {
        item.classList.add("mine");
        const you = document.createElement("span");
        you.className = "you";
        you.textContent = "You";
        item.append(you);
      }
      list.append(item);
    });
  }

  async function loadTop(list, messageEl, mine) {
    const token = (listTokens.get(list) || 0) + 1;
    listTokens.set(list, token);
    if (messageEl) messageEl.textContent = list === ui.startScores ? "Loading scores…" : "";
    try {
      const rows = await RobotLeaderboard.topScores(10);
      if (listTokens.get(list) !== token) return;
      if (messageEl && list === ui.startScores) messageEl.textContent = "";
      fillList(list, rows, mine);
    } catch (err) {
      if (listTokens.get(list) !== token) return;
      list.replaceChildren();
      if (messageEl) {
        messageEl.textContent = err.message || "Leaderboard unreachable. Your score is still saved on this device.";
      }
    }
  }

  async function submitScore(event) {
    event.preventDefault();
    if (submitted || submitting || phase !== "result") return;
    const name = cleanName(ui.name.value);
    if (!validName(name)) {
      ui.resultMsg.textContent = "Use 1–16 letters, numbers, spaces, _ or -.";
      return;
    }
    const score = currentScore();
    const reached = levelsCleared;
    if (!Number.isInteger(score) || score < 0 || score > 100000 || reached < 0 || reached > 999) {
      ui.resultMsg.textContent = "That score can't be submitted.";
      return;
    }
    submitting = true;
    ui.submit.disabled = true;
    ui.resultMsg.textContent = "Sending…";
    ui.name.value = name;
    save.name = name;
    persist();
    try {
      const rank = await RobotLeaderboard.submitScore(name, score, reached);
      submitted = true;
      ui.form.hidden = true;
      ui.resultMsg.textContent = "";
      ui.rankLine.hidden = false;
      ui.rankLine.textContent = rank == null ? "Submitted." : "You're #" + rank + ".";
      pendingMine = { name: name, score: score, rank: rank == null ? -1 : rank };
      announce(ui.rankLine.textContent);
      await loadTop(ui.resultScores, ui.resultMsg, pendingMine);
    } catch (err) {
      ui.resultMsg.textContent = err.message || "Leaderboard unreachable. Your score is still saved on this device.";
      ui.submit.disabled = false;
    } finally {
      submitting = false;
    }
  }

  function beginShift(now) {
    if (!plan.length) {
      shiftTimer = cfg.shiftEvery;
      plan = RobotMaze.planShift(maze, cfg.shiftCount, shiftRand);
      return;
    }
    const changes = plan;
    RobotMaze.applyPlan(maze, changes);
    plan = RobotMaze.planShift(maze, cfg.shiftCount, shiftRand);
    phase = "shift";
    anim = { type: "shift", changes: changes, t0: now, dur: motion(420) };
    shake = reduce ? 0 : 6;
    blip(170, 0.16, "triangle", 0.03);
  }

  function finishAnim(now) {
    if (!anim || now - anim.t0 < anim.dur) return;
    const type = anim.type;
    anim = null;
    if (type === "move") {
      if (atGoal()) {
        clearLevel();
        return;
      }
      phase = "play";
      if (charge <= 0) endRun("battery");
      else drainQueue(now);
      return;
    }
    if (type === "bump") {
      phase = "play";
      if (charge <= 0) endRun("battery");
      else drainQueue(now);
      return;
    }
    if (type === "shift") {
      phase = "play";
      shiftTimer = cfg.shiftEvery;
      if (charge <= 0) endRun("battery");
      else drainQueue(now);
    }
  }

  function pressDir(name) {
    const index = activeDirs.indexOf(name);
    if (index >= 0) activeDirs.splice(index, 1);
    activeDirs.push(name);
  }

  function releaseDir(name) {
    const index = activeDirs.indexOf(name);
    if (index >= 0) activeDirs.splice(index, 1);
  }

  function update(dt, now) {
    if (phase === "play" || phase === "move" || phase === "bump" || phase === "shift") {
      charge -= dt;
      if (phase !== "clear") levelSeconds += dt;
      if (phase === "play" || phase === "move" || phase === "bump") {
        shiftTimer -= dt;
        if (shiftTimer <= 0 && phase === "play" && !anim) beginShift(now);
      }
    }
    finishAnim(now);
    if (phase === "play" && !anim && charge <= 0) {
      endRun("battery");
      return;
    }
    if (phase === "play" && !anim && !queuedDir && activeDirs.length && now >= nextMoveAt) {
      tryMove(activeDirs[activeDirs.length - 1]);
      nextMoveAt = now + (reduce ? 80 : 150);
    }
    if (shake > 0.2) shake *= Math.pow(0.02, dt);
    else shake = 0;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 280 * dt;
      if (p.age >= p.life) particles.splice(i, 1);
    }
    syncHud();
  }

  function syncHud() {
    ui.level.textContent = String(level);
    ui.moves.textContent = String(levelMoves);
    const best = save.bestMoves[level];
    ui.best.textContent = best ? "Best " + best : "Best —";
    ui.score.textContent = formatScore(currentScore());
    const secs = Math.max(0, Math.ceil(charge));
    ui.charge.textContent = secs + "s";
    ui.chargeBar.style.width = clamp(charge / cfg.chargeCap, 0, 1) * 100 + "%";
    ui.chargeStat.classList.toggle("low", charge < 15 && phase !== "start" && phase !== "result");
    const left = Math.max(0, shiftTimer);
    ui.shift.textContent = left.toFixed(1) + "s";
    ui.shiftBar.style.width = (cfg.shiftEvery ? clamp(left / cfg.shiftEvery, 0, 1) : 0) * 100 + "%";
    ui.undo.disabled = !((phase === "move" && anim && anim.type === "move") || (phase === "play" && history.length > 0));
  }

  function cellCenter(r, c) {
    return { x: (c + 0.5) * view.cell, y: (r + 0.5) * view.cell };
  }

  function gapRect(edge) {
    const parts = RobotMaze.parseEdge(edge);
    const cell = view.cell;
    const t = view.wall;
    if (parts[0] === parts[2]) {
      return {
        x: (parts[1] + 1) * cell - t / 2,
        y: parts[0] * cell + t / 2,
        w: t,
        h: cell - t
      };
    }
    return {
      x: parts[1] * cell + t / 2,
      y: (parts[0] + 1) * cell - t / 2,
      w: cell - t,
      h: t
    };
  }

  function roundRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function openAmount(edge, now) {
    if (anim && anim.type === "shift") {
      const u = anim.dur <= 0 ? 1 : clamp((now - anim.t0) / anim.dur, 0, 1);
      const eased = ease(u);
      let flips = 0;
      for (let i = 0; i < anim.changes.length; i++) {
        if (anim.changes[i].opened === edge || anim.changes[i].closed === edge) flips += 1;
      }
      if (flips % 2 === 1) {
        const end = maze.pass.has(edge) ? 1 : 0;
        return (1 - end) + (end - (1 - end)) * eased;
      }
    }
    return maze.pass.has(edge) ? 1 : 0;
  }

  function drawConnector(edge, amount) {
    if (amount <= 0.02) return;
    const rect = gapRect(edge);
    const bleed = Math.max(2, (view.cell - view.wall) * 0.22);
    ctx.fillStyle = "#322b4e";
    if (rect.w < rect.h) {
      const h = rect.h * amount;
      const y = rect.y + (rect.h - h) / 2;
      ctx.fillRect(rect.x - bleed, y, rect.w + bleed * 2, h);
    } else {
      const w = rect.w * amount;
      const x = rect.x + (rect.w - w) / 2;
      ctx.fillRect(x, rect.y - bleed, w, rect.h + bleed * 2);
    }
  }

  function drawFloors() {
    const cell = view.cell;
    const t = view.wall;
    const inset = t / 2;
    const size = cell - t;
    ctx.fillStyle = "#322b4e";
    for (let r = 0; r < maze.rows; r++) {
      for (let c = 0; c < maze.cols; c++) {
        roundRect(c * cell + inset, r * cell + inset, size, size, Math.max(4, cell * 0.16));
        ctx.fill();
      }
    }
  }

  function drawGold(edge, amount, hot) {
    const rect = gapRect(edge);
    const pad = Math.max(1, view.cell * 0.04);
    ctx.save();
    ctx.globalAlpha = 0.4 + 0.6 * amount;
    ctx.fillStyle = hot ? "#ff6b4a" : "#ffc857";
    ctx.shadowColor = hot ? "#ff6b4a" : "#ffc857";
    ctx.shadowBlur = reduce ? 0 : 10;
    roundRect(rect.x + pad, rect.y + pad, Math.max(1, rect.w - pad * 2), Math.max(1, rect.h - pad * 2), 3);
    ctx.fill();
    ctx.restore();
  }

  function drawWarning(edge, alpha) {
    const rect = gapRect(edge);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(255, 107, 74, 0.45)";
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
  }

  function drawPad(x, y, now, happy) {
    const s = view.cell * 0.46;
    const pulse = 0.5 + 0.5 * Math.sin(now / 280);
    const glow = ctx.createRadialGradient(x, y, s * 0.1, x, y, s * (happy ? 1.5 : 1.15));
    glow.addColorStop(0, "rgba(255, 200, 87, " + (0.45 + pulse * 0.35) + ")");
    glow.addColorStop(1, "rgba(255, 200, 87, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, s * (happy ? 1.45 : 1.1), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#ffc857";
    ctx.lineWidth = Math.max(2, view.cell * 0.045);
    ctx.beginPath();
    ctx.arc(x, y, s * 0.42, now / 700, now / 700 + Math.PI * 1.4);
    ctx.stroke();
    ctx.strokeStyle = "#8fd4cf";
    ctx.beginPath();
    ctx.arc(x, y, s * 0.28, -now / 500, -now / 500 + Math.PI);
    ctx.stroke();
    ctx.fillStyle = "#8fd4cf";
    ctx.beginPath();
    const b = s * 0.16;
    ctx.moveTo(x + b * 0.2, y - b);
    ctx.lineTo(x - b * 0.55, y + b * 0.05);
    ctx.lineTo(x - b * 0.05, y + b * 0.05);
    ctx.lineTo(x - b * 0.25, y + b);
    ctx.lineTo(x + b * 0.6, y - b * 0.08);
    ctx.lineTo(x + b * 0.08, y - b * 0.08);
    ctx.closePath();
    ctx.fill();
  }

  function robotPosition(now) {
    if (anim && anim.type === "move") {
      const u = anim.dur <= 0 ? 1 : ease(clamp((now - anim.t0) / anim.dur, 0, 1));
      return {
        r: anim.from.r + (anim.to.r - anim.from.r) * u,
        c: anim.from.c + (anim.to.c - anim.from.c) * u
      };
    }
    if (anim && anim.type === "bump") {
      const u = anim.dur <= 0 ? 1 : (now - anim.t0) / anim.dur;
      const kick = Math.sin(Math.min(1, u) * Math.PI) * 0.22;
      return { r: player.r + anim.dir.dr * kick, c: player.c + anim.dir.dc * kick };
    }
    const bob = reduce || phase === "move" ? 0 : Math.sin(now / 320) * 0.03;
    return { r: player.r + bob, c: player.c };
  }

  function drawRobot(x, y, now, happy, dark) {
    const s = view.cell * 0.72;
    const blink = !happy && !dark && (now % 4200) < 130;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
    ctx.beginPath();
    ctx.ellipse(0, s * 0.36, s * 0.28, s * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff6b4a";
    roundRect(-s * 0.34, -s * 0.16, s * 0.12, s * 0.4, s * 0.05);
    ctx.fill();
    roundRect(s * 0.22, -s * 0.16, s * 0.12, s * 0.4, s * 0.05);
    ctx.fill();
    ctx.fillStyle = "#f4efe4";
    roundRect(-s * 0.26, -s * 0.28, s * 0.52, s * 0.5, s * 0.14);
    ctx.fill();
    const sway = reduce ? 0 : Math.sin(now / 220) * s * 0.06;
    ctx.strokeStyle = dark ? "#8a8174" : "#f4efe4";
    ctx.lineWidth = Math.max(1.5, s * 0.045);
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.26);
    ctx.lineTo(sway, -s * 0.48);
    ctx.stroke();
    ctx.fillStyle = dark ? "#5c564c" : "#ffc857";
    ctx.beginPath();
    ctx.arc(sway, -s * 0.48, s * 0.06, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#143236";
    roundRect(-s * 0.15, -s * 0.12, s * 0.3, s * 0.2, s * 0.08);
    ctx.fill();
    if (dark) {
      ctx.strokeStyle = "#5c564c";
      ctx.beginPath();
      ctx.moveTo(-s * 0.06, -s * 0.02);
      ctx.lineTo(s * 0.06, -s * 0.02);
      ctx.stroke();
    } else if (blink) {
      ctx.strokeStyle = "#8fd4cf";
      ctx.beginPath();
      ctx.moveTo(-s * 0.06, -s * 0.02);
      ctx.lineTo(s * 0.06, -s * 0.02);
      ctx.stroke();
    } else if (happy) {
      ctx.strokeStyle = "#8fd4cf";
      ctx.lineWidth = Math.max(1.5, s * 0.05);
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.07, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    } else {
      const lx = facing.dc * s * 0.05;
      const ly = facing.dr * s * 0.035;
      ctx.fillStyle = "#8fd4cf";
      ctx.beginPath();
      ctx.arc(lx, -s * 0.02 + ly, s * 0.055, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f4efe4";
      ctx.beginPath();
      ctx.arc(lx - s * 0.02, -s * 0.04 + ly, s * 0.018, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function draw(now) {
    if (!maze || playEl.hidden || view.w < 8) return;
    ctx.clearRect(0, 0, view.w, view.h);
    ctx.save();
    if (shake) ctx.translate(Math.sin(now / 30) * shake, Math.cos(now / 25) * shake * 0.4);
    ctx.fillStyle = "#17141f";
    ctx.fillRect(0, 0, view.w, view.h);
    drawFloors();
    maze.tree.forEach(function (edge) { drawConnector(edge, 1); });
    const hotOpen = new Set();
    if (!(anim && anim.type === "shift")) {
      for (let i = 0; i < plan.length; i++) hotOpen.add(plan[i].opened);
    }
    maze.restless.forEach(function (edge) {
      const amount = openAmount(edge, now);
      if (amount > 0.02) drawConnector(edge, amount);
    });

    const vignette = ctx.createRadialGradient(view.w / 2, view.h / 2, view.w * 0.15, view.w / 2, view.h / 2, view.w * 0.72);
    vignette.addColorStop(0, "rgba(255, 255, 255, 0.035)");
    vignette.addColorStop(1, "rgba(0, 0, 0, 0.22)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, view.w, view.h);

    maze.restless.forEach(function (edge) {
      const amount = openAmount(edge, now);
      if (amount < 0.98) drawGold(edge, 1 - amount, hotOpen.has(edge));
    });

    const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(now / (shiftTimer < 2.4 ? 90 : 240)));
    if (!(anim && anim.type === "shift")) {
      for (let i = 0; i < plan.length; i++) drawWarning(plan[i].closed, 0.18 + pulse * 0.28);
    }

    for (let i = 0; i < footprints.length; i++) {
      const spot = footprints[i];
      const age = (now - spot.born) / 4000;
      if (age >= 1) continue;
      const at = cellCenter(spot.r, spot.c);
      ctx.globalAlpha = (1 - age) * 0.45;
      ctx.fillStyle = "#8fd4cf";
      ctx.beginPath();
      ctx.arc(at.x, at.y, Math.max(1.5, view.cell * 0.06), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    const goalAt = cellCenter(maze.goal.r, maze.goal.c);
    const happy = phase === "clear";
    const dark = phase === "ending" && endReason === "battery";
    drawPad(goalAt.x, goalAt.y, now, happy);

    const pos = robotPosition(now);
    const at = cellCenter(pos.r, pos.c);
    const hop = happy && !reduce ? Math.sin(now / 110) * view.cell * 0.06 : 0;
    drawRobot(at.x, at.y - hop, now, happy, dark);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    if (charge < 15 && phase !== "clear" && phase !== "ending") {
      ctx.fillStyle = "rgba(255, 107, 74, " + (0.04 + 0.06 * (0.5 + 0.5 * Math.sin(now / 160))) + ")";
      ctx.fillRect(0, 0, view.w, view.h);
    }
    if (dark) {
      ctx.fillStyle = "rgba(8, 6, 12, 0.45)";
      ctx.fillRect(0, 0, view.w, view.h);
    }
    ctx.restore();
  }

  function frame(now) {
    if (document.hidden) {
      requestAnimationFrame(frame);
      return;
    }
    if (!frame.last) frame.last = now;
    let dt = (now - frame.last) / 1000;
    frame.last = now;
    if (dt < 0 || dt > 0.1) dt = 0;
    if (phase === "play" || phase === "move" || phase === "bump" || phase === "shift" || phase === "clear" || phase === "ending") {
      if (slot.clientWidth > 16 && (!view.cell || view.cell * maze.cols !== view.w)) layout();
      update(dt, now);
      draw(now);
    }
    requestAnimationFrame(frame);
  }

  function typingTarget(target) {
    if (!target) return false;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  }

  window.addEventListener("keydown", function (event) {
    if (typingTarget(event.target)) return;
    const dir = KEY_DIR[event.key];
    if (dir && (phase === "play" || phase === "move" || phase === "bump" || phase === "shift")) {
      event.preventDefault();
      if (!event.repeat) {
        pressDir(dir);
        requestMove(dir);
      }
      return;
    }
    if (event.repeat) return;
    if ((event.key === "r" || event.key === "R") && phase !== "start" && phase !== "result") {
      restartLevel();
    } else if ((event.key === "z" || event.key === "Z") && (phase === "play" || phase === "move")) {
      event.preventDefault();
      undo();
    } else if (event.key === "Enter" && phase === "clear" && event.target && event.target.tagName !== "BUTTON") {
      nextLevel();
    } else if (event.key === "Enter" && phase === "start" && event.target && event.target.tagName !== "BUTTON" && event.target.tagName !== "A") {
      startRun();
    }
  });

  window.addEventListener("keyup", function (event) {
    const dir = KEY_DIR[event.key];
    if (dir) releaseDir(dir);
  });

  window.addEventListener("blur", function () { activeDirs = []; });

  document.querySelectorAll(".dpad button").forEach(function (button) {
    const name = button.getAttribute("data-dir");
    button.addEventListener("pointerdown", function (event) {
      event.preventDefault();
      button.classList.add("held");
      try { button.setPointerCapture(event.pointerId); } catch (err) { /* ignore */ }
      pressDir(name);
      requestMove(name);
    });
    function release(event) {
      button.classList.remove("held");
      releaseDir(name);
      if (event) event.preventDefault();
    }
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", function () {
      button.classList.remove("held");
      releaseDir(name);
    });
  });

  let swipe = null;
  board.addEventListener("pointerdown", function (event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    swipe = { x: event.clientX, y: event.clientY, id: event.pointerId };
  });
  board.addEventListener("pointerup", function (event) {
    if (!swipe || swipe.id !== event.pointerId) return;
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    swipe = null;
    if (Math.hypot(dx, dy) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) requestMove(dx > 0 ? "right" : "left");
    else requestMove(dy > 0 ? "down" : "up");
  });
  board.addEventListener("pointercancel", function () { swipe = null; });

  $("restart").addEventListener("click", restartLevel);
  ui.undo.addEventListener("click", undo);
  $("bank").addEventListener("click", function () { endRun("bank"); });
  $("bank-clear").addEventListener("click", function () { endRun("bank"); });
  ui.next.addEventListener("click", nextLevel);
  $("start-play").addEventListener("click", startRun);
  $("again").addEventListener("click", startRun);
  $("refresh-start").addEventListener("click", function () {
    loadTop(ui.startScores, ui.startStatus, null);
  });
  $("refresh-result").addEventListener("click", function () {
    loadTop(ui.resultScores, ui.resultMsg, pendingMine);
  });
  ui.form.addEventListener("submit", submitScore);
  ui.name.addEventListener("input", function () {
    const name = cleanName(ui.name.value);
    ui.submit.disabled = !validName(name);
    if (validName(name)) {
      save.name = name;
      persist();
    }
  });
  ui.sound.addEventListener("click", function () {
    save.sound = !save.sound;
    persist();
    syncSoundButton();
    if (save.sound) blip(660, 0.06, "sine", 0.04);
  });

  window.addEventListener("resize", layout);
  if (window.ResizeObserver) new ResizeObserver(layout).observe(slot);

  /* Stars, in the same night-sky family as the arcade. */
  (function stars() {
    const canvas = $("stars");
    const starCtx = canvas.getContext("2d");
    let stars = [];
    let running = false;

    function build() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      const count = Math.max(36, Math.min(110, Math.floor((window.innerWidth * window.innerHeight) / 16000)));
      stars = [];
      for (let i = 0; i < count; i++) {
        const roll = Math.random();
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          r: (Math.random() * 1.15 + 0.35) * dpr,
          phase: Math.random() * Math.PI * 2,
          speed: Math.random() * 0.006 + 0.002,
          drift: (Math.random() - 0.5) * 0.08 * dpr,
          color: roll > 0.93 ? "255,200,87" : roll > 0.86 ? "143,212,207" : "244,239,228"
        });
      }
    }

    function paint() {
      starCtx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];
        if (!reduce && running) {
          star.phase += star.speed;
          star.y += 0.12 * (window.devicePixelRatio || 1);
          star.x += star.drift;
          if (star.y > canvas.height) star.y = 0;
          if (star.x < 0) star.x = canvas.width;
          if (star.x > canvas.width) star.x = 0;
        }
        const alpha = reduce ? 0.7 : 0.28 + Math.abs(Math.sin(star.phase)) * 0.72;
        starCtx.beginPath();
        starCtx.fillStyle = "rgba(" + star.color + "," + alpha + ")";
        starCtx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        starCtx.fill();
      }
    }

    function loop() {
      if (!running) return;
      paint();
      requestAnimationFrame(loop);
    }

    build();
    paint();
    if (!reduce) {
      running = true;
      requestAnimationFrame(loop);
    }
    window.addEventListener("resize", function () {
      build();
      paint();
    });
    document.addEventListener("visibilitychange", function () {
      running = !document.hidden && !reduce;
      if (running) requestAnimationFrame(loop);
    });
  })();

  syncSoundButton();
  showStart();
  requestAnimationFrame(frame);

  window.robotMaze = {
    getState: function () {
      return {
        phase: phase,
        level: level,
        levelsCleared: levelsCleared,
        moves: levelMoves,
        score: currentScore(),
        charge: charge,
        player: { r: player.r, c: player.c },
        goal: maze ? { r: maze.goal.r, c: maze.goal.c } : null,
        cols: maze ? maze.cols : 0,
        rows: maze ? maze.rows : 0,
        connected: maze ? RobotMaze.isFullyConnected(maze) : false,
        treeIntact: maze ? RobotMaze.treeIntact(maze) : false,
        animating: !!anim,
        held: activeDirs.slice()
      };
    },
    shortestPath: function () {
      if (!maze) return null;
      return RobotMaze.shortestPath(maze, player, maze.goal);
    },
    forceShift: function () {
      if (!maze || phase !== "play") return false;
      beginShift(performance.now());
      if (anim && anim.type === "shift" && anim.dur === 0) finishAnim(performance.now() + 1);
      return RobotMaze.isFullyConnected(maze);
    }
  };
})();
