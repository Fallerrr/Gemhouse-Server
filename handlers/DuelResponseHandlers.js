const { BaseHandler } = require("redweb");
const matchmakingService = require("../services/MatchmakingService");
const { getRegistry, isInteger, logIncomingMessage, sendJsonWithLog } = require("./HandlerUtils");

function getMessageMatchId(message = {}) {
  if (typeof message.matchId === "string" && message.matchId.trim()) {
    return message.matchId.trim();
  }

  if (typeof message.matchID === "string" && message.matchID.trim()) {
    return message.matchID.trim();
  }

  return "";
}

function getChallengerUid(match, message = {}, respondingPlayer = null) {
  if (isInteger(match?.creatorUserId)) return match.creatorUserId;
  if (isInteger(message.challengerUid)) return message.challengerUid;
  if (isInteger(message.challengerUID)) return message.challengerUID;
  if (isInteger(respondingPlayer?.uid)) return respondingPlayer.uid;
  return null;
}

class DuelResponseHandler extends BaseHandler {
  constructor(type) {
    super(type);
    this.type = type;
  }

  onMessage(socket, message = {}) {
    logIncomingMessage(this.type, message);

    const matchId = getMessageMatchId(message);
    if (!matchId) {
      sendJsonWithLog(socket, { type: "error", message: `${this.type} requires a matchId` }, `socket:${this.type}`);
      return;
    }

    const registry = getRegistry();
    const respondingPlayer = registry.getBySocket(socket);
    const match = matchmakingService.getMatch(matchId);
    const challengerUid = getChallengerUid(match, message, respondingPlayer);

    if (!isInteger(challengerUid)) {
      sendJsonWithLog(socket, { type: "error", message: `${this.type} requires a challengerUid` }, `socket:${this.type}`);
      return;
    }

    const payload = {
      type: this.type,
      matchId,
      challengerUid,
      challengedUid: isInteger(match?.challengedUid) ? match.challengedUid : respondingPlayer?.uid,
    };

    if (respondingPlayer) {
      payload.playerId = respondingPlayer.id;
    }

    if (!respondingPlayer) {
      sendJsonWithLog(socket, payload, `duel:${matchId}`);
    }

    registry.broadcast(payload, null, null);
  }
}

class DuelRecievedHandler extends DuelResponseHandler {
  constructor() {
    super("duel recieved");
  }
}

class DuelAcceptedHandler extends DuelResponseHandler {
  constructor() {
    super("duel accepted");
  }
}

class DuelDeclinedHandler extends DuelResponseHandler {
  constructor() {
    super("duel declined");
  }
}

module.exports = {
  DuelAcceptedHandler,
  DuelDeclinedHandler,
  DuelRecievedHandler,
};
