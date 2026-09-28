const { SocketRegistry } = require("redweb");
const Player = require("./Player");

const MATCH_INACTIVITY_ENABLED = process.env.MATCH_INACTIVITY_ENABLED === "true";
const MATCH_INACTIVITY_TIMEOUT_MS = 30_000;
const MATCH_INACTIVITY_SWEEP_INTERVAL_MS = 5_000;

function isSocketOpen(socket) {
  return socket && (socket.readyState == null || socket.readyState === 1);
}

class PlayerRegistry extends SocketRegistry {
  constructor({ inactivityEnabled = MATCH_INACTIVITY_ENABLED } = {}) {
    super();
    this.items = []; // ensure array exists if base class doesn't initialize
    this.maxPlayers = Infinity;
    this.nextJoinIndexByMatch = new Map();
    this._createValidator = null;
    this._removeValidator = null;

    this.inactivityInterval = null;
    if (inactivityEnabled) {
      this.inactivityInterval = setInterval(
        () => this.sweepInactivePlayers(),
        MATCH_INACTIVITY_SWEEP_INTERVAL_MS
      );

      if (typeof this.inactivityInterval.unref === "function") {
        this.inactivityInterval.unref();
      }
    }
  }

  setCreateValidator(fn) { this._createValidator = fn; }
  setRemoveValidator(fn) { this._removeValidator = fn; }

  create(socket, id, data = {}) {
    return new Player(socket, id, data, this);
  }

  add(player) {
    if (!player) return false;
    if (this.items.find(p => p.id === player.id)) return false;
    if (typeof player.matchId !== "string" || !player.matchId.trim()) return false;
    if (this.items.length >= this.maxPlayers) {
      // Let listeners know the cap was reached
      try { this.emit && this.emit("maxPlayersReached"); } catch {}
      return false;
    }
    if (this._createValidator && !this._createValidator(player)) return false;

    if (!Number.isInteger(player.joinIndex)) {
      const nextJoinIndex = this.nextJoinIndexByMatch.get(player.matchId) ?? 0;
      player.joinIndex = nextJoinIndex;
      this.nextJoinIndexByMatch.set(player.matchId, nextJoinIndex + 1);
    }

    this.items.push(player);
    this.touchPlayer(player);

    if (this.items.length >= this.maxPlayers) {
      try { this.emit && this.emit("maxPlayersReached"); } catch {}
    }
    return true;
  }

  remove(target) {
    const idx = this._indexOf(target);
    if (idx < 0) return false;

    const player = this.items[idx];
    if (this._removeValidator && !this._removeValidator(player)) return false;

    this.removePlayerFromMatch(player);
    this.items.splice(idx, 1);
    return true;
  }

  removeBySocket(socket, reason = "disconnected") {
    const removedPlayers = this.items.filter(player => player.socket === socket);

    removedPlayers.forEach(player => {
      const matchId = player.matchId;
      const payload = {
        type: "player_left",
        playerId: player.id,
        matchId,
        reason,
      };

      this.remove(player);
      this.broadcast(payload, socket, matchId, { pruneClosed: false });
    });

    return removedPlayers.length;
  }

  pruneClosedPlayers(reason = "closed socket") {
    const closedPlayers = this.items.filter(player => !isSocketOpen(player.socket));

    closedPlayers.forEach(player => {
      const matchId = player.matchId;
      const payload = {
        type: "player_left",
        playerId: player.id,
        matchId,
        reason,
      };

      this.remove(player);
      this.broadcast(payload, player.socket, matchId, { pruneClosed: false });
    });

    return closedPlayers.length;
  }

  touchPlayer(player) {
    if (!player) return null;
    player.lastMatchActivityAt = Date.now();
    player.lastActivityMatchId = player.matchId;
    return player;
  }

  removePlayerFromMatch(player) {
    try {
      const matchmakingService = require("../services/MatchmakingService");
      matchmakingService.removePlayer(player);
    } catch {}
  }

  sweepInactivePlayers(now = Date.now()) {
    const inactivePlayers = this.items.filter(player =>
      player.matchId &&
      player.lastActivityMatchId === player.matchId &&
      Number.isInteger(player.lastMatchActivityAt) &&
      now - player.lastMatchActivityAt > MATCH_INACTIVITY_TIMEOUT_MS
    );

    inactivePlayers.forEach(player => {
      const matchId = player.matchId;
      const payload = {
        type: "player_left",
        playerId: player.id,
        matchId,
        reason: "inactive",
      };

      player.send("removed from match", {
        playerId: player.id,
        matchId,
        reason: "inactive",
      });
      this.broadcast(payload, player.socket, matchId);
      console.log(`[match-inactivity] removed player ${player.id} from match ${matchId} after ${now - player.lastMatchActivityAt}ms without client messages`);
      this.remove(player);
    });

    return inactivePlayers.length;
  }

  _indexOf(target) {
    if (!target) return -1;
    if (typeof target === "string") {
      return this.items.findIndex(p => p.id === target);
    }
    if (target.socket) {
      return this.items.findIndex(p => p.socket === target.socket);
    }
    if (target.id) {
      return this.items.findIndex(p => p.id === target.id);
    }
    // maybe the exact instance
    const i = this.items.indexOf(target);
    return i >= 0 ? i : -1;
  }

  getById(id, matchId = null) {
    return this.items.find(p =>
      p.id === id && (matchId == null || p.matchId === matchId)
    ) || null;
  }

  getBySocket(socket) {
    const player = this.items.find(p => p.socket === socket) || null;
    if (player) {
      this.touchPlayer(player);
    }
    return player;
  }

  getByMatchId(matchId) {
    return this.items.filter(p => p.matchId === matchId);
  }

  isAtCapacity() {
    return Number.isFinite(this.maxPlayers) &&
      this.maxPlayers > 0 &&
      this.count() >= this.maxPlayers;
  }

  getSanitizedList(matchId = null) {
    return this.items
      .filter(p => matchId == null || p.matchId === matchId)
      .map(p => p.getSanitized());
  }

  broadcast(data, excludeSocket = null, matchId = null, options = {}) {
    if (options.pruneClosed !== false) {
      this.pruneClosedPlayers();
    }

    this.items.forEach(p => {
      if (matchId != null && p.matchId !== matchId) return;
      if (excludeSocket && p.socket === excludeSocket) return;
      if (!isSocketOpen(p.socket)) return;
      p.send(data.type, data);
    });
  }
}

const registry = new PlayerRegistry();
registry.createIsolatedRegistry = (options) => new PlayerRegistry(options);

module.exports = registry;
