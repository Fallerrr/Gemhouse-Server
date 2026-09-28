function cloneCustomization(value) {
  return Array.isArray(value) ? [...value] : [];
}

function normalizeUsername(value) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeCreatorData(data = {}, matchId) {
  return {
    matchId,
    uid: Number.isInteger(data.uid) ? data.uid : 0,
    username: normalizeUsername(data.username),
    customization: cloneCustomization(data.customization),
  };
}

class MatchmakingService {
  constructor() {
    this.availableMatches = new Map();
  }

  getJoinLimit(match) {
    if (!match) return 0;
    if (Number.isInteger(match.maxPlayers) && match.maxPlayers > 0) {
      return match.maxPlayers;
    }
    return match.modeIndex === 0 ? 2 : 8;
  }

  hasMatch(matchId) {
    if(matchId == "lobbyL")
    {
      return true;
    }
    return this.availableMatches.has(matchId);
  }

  getMatch(matchId) {
    return this.availableMatches.get(matchId) || null;
  }

  getAvailableMatches() {
    return Array.from(this.availableMatches.values()).map(match => ({
      ...match,
      creator: { ...match.creator },
      players: match.players.map(player => ({ ...player })),
    }));
  }

  createMatch({
    matchId,
    arenaID,
    modeIndex,
    creatorData,
    matchType = "match",
    maxPlayers = null,
    challengedUid = null,
  }) {
    if (this.availableMatches.has(matchId)) return null;

    const match = {
      matchId,
      matchType,
      arenaID,
      modeIndex,
      maxPlayers: Number.isInteger(maxPlayers) && maxPlayers > 0 ? maxPlayers : null,
      challengedUid: Number.isInteger(challengedUid) ? challengedUid : null,
      creatorUserId: Number.isInteger(creatorData?.uid) ? creatorData.uid : 0,
      creator: sanitizeCreatorData(creatorData, matchId),
      players: [],
      createdAt: Date.now(),
    };

    this.availableMatches.set(matchId, match);
    return match;
  }

  canJoin(matchId) {
    const match = this.getMatch(matchId);
    if (!match) {
      if (matchId == "lobbyL")
      {
        return {allowed: true};
      }
      return {
        allowed: false,
        reason: "Match not found",
      };
    }

    const joinLimit = this.getJoinLimit(match);
    if (match.players.length >= joinLimit) {
      return {
        allowed: false,
        reason: `Match is full (${joinLimit} players max for modeIndex ${match.modeIndex})`,
      };
    }

    return {
      allowed: true,
      match,
    };
  }

  addPlayer(player) {
    if (!player?.matchId) return null;
    const match = this.availableMatches.get(player.matchId);
    if (!match) return null;

    const playerData = player.getJoinSanitized();
    const existingIndex = match.players.findIndex(existing => existing.id === playerData.id);
    if (existingIndex >= 0) {
      match.players[existingIndex] = playerData;
    } else {
      match.players.push(playerData);
    }

    return match;
  }

  removePlayer(player) {
    if (!player?.matchId) return null;
    const match = this.availableMatches.get(player.matchId);
    if (!match) return null;

    const playerId = player.id;
    const originalLength = match.players.length;
    match.players = match.players.filter(existing => existing.id !== playerId);

    return match.players.length !== originalLength ? match : null;
  }
}

module.exports = new MatchmakingService();
