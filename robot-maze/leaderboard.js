/* Public leaderboard. The keys below are publishable client keys;
   the server rejects bad names, wild scores, and excess submissions. */
(function (root) {
  const BASE = "https://gaicrmfyjcwkrjlnedsm.supabase.co";
  const PUBLISHABLE = "sb_publishable_FzvhAlOVhLfA9itKswvzog_kEa7M8oT";
  const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdhaWNybWZ5amN3a3JqbG5lZHNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUzMTAwNzUsImV4cCI6MjExMDg4NjA3NX0.2ZG04I7ZxdGSSdY8skXUDNLVKxfxn574uczjdV_inOM";
  const GAME = "robot-maze";
  const OFFLINE = "Leaderboard unreachable. Your score is still saved on this device.";

  let mode = "publishable";

  function headers(which) {
    const h = {
      "Content-Type": "application/json",
      Accept: "application/json"
    };
    if (which === "anon") {
      h.apikey = ANON;
      h.Authorization = "Bearer " + ANON;
    } else {
      h.apikey = PUBLISHABLE;
    }
    return h;
  }

  async function once(fn, body, which) {
    let response;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(function () { ctrl.abort(); }, 8000);
      try {
        response = await fetch(BASE + "/rest/v1/rpc/" + fn, {
          method: "POST",
          headers: headers(which),
          body: JSON.stringify(body),
          signal: ctrl.signal,
          cache: "no-store"
        });
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      const offline = new Error(OFFLINE);
      offline.offline = true;
      throw offline;
    }

    let data = null;
    const text = await response.text();
    if (text) {
      try { data = JSON.parse(text); } catch (err) { data = null; }
    }
    if (!response.ok) {
      const message = data && typeof data.message === "string" && data.message
        ? data.message
        : "Leaderboard request failed.";
      const error = new Error(message);
      error.status = response.status;
      error.auth = response.status === 401 || response.status === 403;
      throw error;
    }
    return data;
  }

  async function rpc(fn, body) {
    try {
      return await once(fn, body, mode);
    } catch (err) {
      if (mode === "publishable" && err.auth) {
        mode = "anon";
        return await once(fn, body, mode);
      }
      throw err;
    }
  }

  function asRank(data) {
    if (typeof data === "number" && Number.isFinite(data)) return Math.round(data);
    if (typeof data === "string" && /^-?\d+$/.test(data)) return Number(data);
    return null;
  }

  function playerName(row) {
    if (!row || typeof row !== "object") return "";
    const value = row.player_name != null ? row.player_name : row.name != null ? row.name : row.p_name;
    return value == null ? "" : String(value);
  }

  function rowScore(row) {
    if (!row || typeof row !== "object") return NaN;
    const value = row.score != null ? row.score : row.p_score;
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
  }

  function rowLevel(row) {
    if (!row || typeof row !== "object") return null;
    const value = row.level != null ? row.level : row.p_level;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  async function submitScore(name, score, level) {
    const data = await rpc("submit_score", {
      p_game: GAME,
      p_name: name,
      p_score: score,
      p_level: level
    });
    return asRank(data);
  }

  async function topScores(limit) {
    const data = await rpc("top_scores", {
      p_game: GAME,
      p_limit: limit || 10
    });
    return Array.isArray(data) ? data : [];
  }

  root.RobotLeaderboard = {
    submitScore: submitScore,
    topScores: topScores,
    playerName: playerName,
    rowScore: rowScore,
    rowLevel: rowLevel
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
