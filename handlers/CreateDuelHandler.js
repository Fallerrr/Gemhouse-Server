const { BaseHandler } = require("redweb");
const { v4: uuidv4 } = require("uuid");
const matchmakingService = require("../services/MatchmakingService");
const { getRegistry, isInteger, logIncomingMessage, sendJsonWithLog } = require("./HandlerUtils");

class CreateDuelHandler extends BaseHandler {
  constructor() {
    super("create duel");
  }

  onMessage(socket, message = {}) {
    logIncomingMessage("create duel", message);

    if (!isInteger(message.modeIndex)) {
      sendJsonWithLog(socket, { type: "error", message: "Create duel requires an integer modeIndex" }, "socket:create-duel");
      return;
    }

    if (!isInteger(message.uid)) {
      sendJsonWithLog(socket, { type: "error", message: "Create duel requires an integer uid" }, "socket:create-duel");
      return;
    }

    if (!isInteger(message.challengedUid)) {
      sendJsonWithLog(socket, { type: "error", message: "Create duel requires an integer challengedUid" }, "socket:create-duel");
      return;
    }

    const matchId = uuidv4();
    const match = matchmakingService.createMatch({
      matchId,
      matchType: "duel",
      arenaID: "finaleL1",
      modeIndex: message.modeIndex,
      maxPlayers: 2,
      challengedUid: message.challengedUid,
      creatorData: message,
    });

    if (!match) {
      sendJsonWithLog(socket, { type: "error", message: "Duel creation failed" }, "socket:create-duel");
      return;
    }

    const payload = {
      type: "duel_created",
      matchId: match.matchId,
      challengerUid: match.creatorUserId,
      username: match.creator.username,
      customization: match.creator.customization,
      challengedUid: match.challengedUid,
    };

    const registry = getRegistry();
    const creatorPlayer = registry.getBySocket(socket);
    if (!creatorPlayer) {
      sendJsonWithLog(socket, payload, `duel:${matchId}`);
    }

    registry.broadcast(payload, null, null);
  }
}

module.exports = { CreateDuelHandler };
