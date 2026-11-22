/* Robot Maze generator.
   A spanning tree stays open forever, so every cell can always reach the
   charging pad. Only a small set of extra passages ("restless" walls)
   slide, by swapping an open extra with a closed extra. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RobotMaze = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DIRS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function rand() {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function edgeKey(r1, c1, r2, c2) {
    if (r1 > r2 || (r1 === r2 && c1 > c2)) {
      return r2 + "," + c2 + "," + r1 + "," + c1;
    }
    return r1 + "," + c1 + "," + r2 + "," + c2;
  }

  function parseEdge(key) {
    const p = key.split(",");
    return [Number(p[0]), Number(p[1]), Number(p[2]), Number(p[3])];
  }

  function cellId(r, c) {
    return r + "," + c;
  }

  function levelConfig(level) {
    const n = Math.max(1, Math.floor(Number(level) || 1));
    const size = Math.min(13, 6 + n);
    return {
      cols: size,
      rows: size,
      restless: Math.min(12, 4 + n),
      shiftEvery: Math.max(4, 12.5 - (n - 1) * 0.7),
      shiftCount: Math.min(3, 1 + Math.floor((n - 1) / 3)),
      braid: n === 1 ? 0.14 : n < 4 ? 0.08 : 0.04,
      charge: n === 1 ? 90 : Math.max(16, 40 - n * 2),
      chargeCap: 110
    };
  }

  function seedForLevel(level) {
    const n = Math.max(1, Math.floor(Number(level) || 1));
    let x = (Math.imul(n ^ 0xA5C35, 0x9E3779B1) + 0x85EBCA6B) >>> 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x7FEB352D) >>> 0;
    x ^= x >>> 15;
    return x || 1;
  }

  function shuffle(list, rand) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }

  function neighbors(maze, r, c) {
    const out = [];
    for (let i = 0; i < DIRS.length; i++) {
      const nr = r + DIRS[i][0];
      const nc = c + DIRS[i][1];
      if (nr < 0 || nc < 0 || nr >= maze.rows || nc >= maze.cols) continue;
      if (maze.pass.has(edgeKey(r, c, nr, nc))) out.push({ r: nr, c: nc });
    }
    return out;
  }

  function bfs(maze, start) {
    const cols = maze.cols;
    const total = cols * maze.rows;
    const seen = new Uint8Array(total);
    const dist = new Int16Array(total);
    const parent = new Int32Array(total);
    parent.fill(-1);
    const sr = start.r;
    const sc = start.c;
    const q = [sr * cols + sc];
    seen[q[0]] = 1;
    for (let head = 0; head < q.length; head++) {
      const cur = q[head];
      const r = Math.floor(cur / cols);
      const c = cur - r * cols;
      const next = neighbors(maze, r, c);
      for (let i = 0; i < next.length; i++) {
        const ni = next[i].r * cols + next[i].c;
        if (seen[ni]) continue;
        seen[ni] = 1;
        dist[ni] = dist[cur] + 1;
        parent[ni] = cur;
        q.push(ni);
      }
    }
    return { seen: seen, dist: dist, parent: parent, count: q.length };
  }

  function isFullyConnected(maze) {
    return bfs(maze, { r: 0, c: 0 }).count === maze.cols * maze.rows;
  }

  function shortestPath(maze, start, goal) {
    const info = bfs(maze, start);
    const goalIndex = goal.r * maze.cols + goal.c;
    if (!info.seen[goalIndex]) return null;
    const path = [];
    let cur = goalIndex;
    while (cur !== -1) {
      path.push({ r: Math.floor(cur / maze.cols), c: cur % maze.cols });
      if (cur === start.r * maze.cols + start.c) break;
      cur = info.parent[cur];
    }
    path.reverse();
    return path;
  }

  function farthest(maze, start) {
    const info = bfs(maze, start);
    let best = 0;
    let bestDist = -1;
    const total = maze.cols * maze.rows;
    for (let i = 0; i < total; i++) {
      if (!info.seen[i]) continue;
      const r = Math.floor(i / maze.cols);
      const c = i - r * maze.cols;
      const better = info.dist[i] > bestDist
        || (info.dist[i] === bestDist && r + c > Math.floor(best / maze.cols) + (best % maze.cols));
      if (better) {
        best = i;
        bestDist = info.dist[i];
      }
    }
    return { r: Math.floor(best / maze.cols), c: best % maze.cols, dist: bestDist };
  }

  function generateMaze(cols, rows, seed, restlessCount, braid) {
    cols = Math.max(2, cols | 0);
    rows = Math.max(2, rows | 0);
    const rand = mulberry32(seed >>> 0);
    const total = cols * rows;
    const seen = new Uint8Array(total);
    const stack = [0];
    seen[0] = 1;
    const tree = new Set();
    while (stack.length) {
      const cur = stack[stack.length - 1];
      const r = Math.floor(cur / cols);
      const c = cur - r * cols;
      const options = [];
      for (let i = 0; i < DIRS.length; i++) {
        const nr = r + DIRS[i][0];
        const nc = c + DIRS[i][1];
        if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
        const ni = nr * cols + nc;
        if (!seen[ni]) options.push(ni);
      }
      if (!options.length) {
        stack.pop();
        continue;
      }
      const ni = options[Math.floor(rand() * options.length)];
      seen[ni] = 1;
      const nr = Math.floor(ni / cols);
      const nc = ni - nr * cols;
      tree.add(edgeKey(r, c, nr, nc));
      stack.push(ni);
    }

    const nonTree = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (c + 1 < cols) {
          const key = edgeKey(r, c, r, c + 1);
          if (!tree.has(key)) nonTree.push(key);
        }
        if (r + 1 < rows) {
          const key = edgeKey(r, c, r + 1, c);
          if (!tree.has(key)) nonTree.push(key);
        }
      }
    }
    shuffle(nonTree, rand);

    let poolSize = Math.min(Math.max(0, restlessCount | 0), nonTree.length);
    if (poolSize < 2) poolSize = 0;
    const pool = nonTree.slice(0, poolSize);
    const openCount = poolSize
      ? Math.max(1, Math.min(poolSize - 1, Math.round(poolSize * 0.4)))
      : 0;

    const restless = new Set(pool);
    const pass = new Set(tree);
    for (let i = 0; i < openCount; i++) pass.add(pool[i]);
    const spare = nonTree.slice(poolSize);
    const permanent = Math.max(0, Math.min(spare.length, Math.floor(spare.length * (Number(braid) || 0))));
    for (let i = 0; i < permanent; i++) pass.add(spare[i]);

    const maze = {
      cols: cols,
      rows: rows,
      tree: tree,
      restless: restless,
      pass: pass,
      start: { r: 0, c: 0 },
      goal: { r: rows - 1, c: cols - 1 }
    };
    const far = farthest(maze, maze.start);
    maze.goal = { r: far.r, c: far.c };
    return maze;
  }

  function planShift(maze, count, rand) {
    const pass = new Set(maze.pass);
    const pool = [];
    maze.restless.forEach(function (edge) { pool.push(edge); });
    const changes = [];
    const shifts = Math.max(0, count | 0);
    for (let n = 0; n < shifts; n++) {
      const closed = [];
      const open = [];
      for (let i = 0; i < pool.length; i++) {
        if (pass.has(pool[i])) open.push(pool[i]);
        else closed.push(pool[i]);
      }
      if (!closed.length || !open.length) break;
      const wall = closed[Math.floor(rand() * closed.length)];
      const parts = parseEdge(wall);
      const touch = new Set([cellId(parts[0], parts[1]), cellId(parts[2], parts[3])]);
      const adjacent = [];
      for (let i = 0; i < open.length; i++) {
        const op = parseEdge(open[i]);
        if (touch.has(cellId(op[0], op[1])) || touch.has(cellId(op[2], op[3]))) {
          adjacent.push(open[i]);
        }
      }
      const choices = adjacent.length ? adjacent : open;
      const passage = choices[Math.floor(rand() * choices.length)];
      pass.add(wall);
      pass.delete(passage);
      changes.push({ opened: wall, closed: passage });
    }
    return changes;
  }

  function applyPlan(maze, changes) {
    for (let i = 0; i < changes.length; i++) {
      const change = changes[i];
      if (maze.tree.has(change.closed) || maze.tree.has(change.opened)) continue;
      if (!maze.restless.has(change.closed) || !maze.restless.has(change.opened)) continue;
      maze.pass.add(change.opened);
      maze.pass.delete(change.closed);
    }
  }

  function treeIntact(maze) {
    let ok = true;
    maze.tree.forEach(function (edge) {
      if (!maze.pass.has(edge)) ok = false;
    });
    return ok;
  }

  function scoreRun(levelsCleared, moves, seconds) {
    const levels = Math.max(0, Math.floor(Number(levelsCleared) || 0));
    const steps = Math.max(0, Math.floor(Number(moves) || 0));
    const secs = Math.max(0, Math.floor(Number(seconds) || 0));
    const raw = levels * 2500 - steps * 12 - secs * 4;
    if (raw < 0) return 0;
    if (raw > 100000) return 100000;
    return raw;
  }

  function toAscii(maze) {
    let out = "";
    for (let r = 0; r < maze.rows; r++) {
      let top = "";
      let mid = "";
      for (let c = 0; c < maze.cols; c++) {
        top += "+";
        top += r > 0 && maze.pass.has(edgeKey(r - 1, c, r, c)) ? "  " : "--";
        const openLeft = c > 0 && maze.pass.has(edgeKey(r, c - 1, r, c));
        mid += openLeft ? " " : "|";
        if (r === maze.start.r && c === maze.start.c) mid += "S ";
        else if (r === maze.goal.r && c === maze.goal.c) mid += "G ";
        else mid += "  ";
      }
      out += top + "+\n" + mid + "|\n";
    }
    let bottom = "";
    for (let c = 0; c < maze.cols; c++) bottom += "+--";
    return out + bottom + "+\n";
  }

  return {
    DIRS: DIRS,
    mulberry32: mulberry32,
    edgeKey: edgeKey,
    parseEdge: parseEdge,
    levelConfig: levelConfig,
    seedForLevel: seedForLevel,
    generateMaze: generateMaze,
    planShift: planShift,
    applyPlan: applyPlan,
    neighbors: neighbors,
    isFullyConnected: isFullyConnected,
    shortestPath: shortestPath,
    treeIntact: treeIntact,
    scoreRun: scoreRun,
    toAscii: toAscii
  };
});
