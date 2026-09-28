const { BaseHandler } = require("redweb");
const { v4: uuidv4 } = require("uuid");
const matchmakingService = require("../services/MatchmakingService");
const { isInteger, logIncomingMessage, sendJsonWithLog } = require("./HandlerUtils");

class CreateMatchHandler extends BaseHandler {
  constructor() {
    super("create match");
  }

  onMessage(socket, message = {}) {
    logIncomingMessage("create match", message);

    if (typeof message.arenaID !== "string" || !message.arenaID.trim()) {
      sendJsonWithLog(socket, { type: "error", message: "Create match requires an arenaID" }, "socket:create-match");
      return;
    }

    if (!isInteger(message.modeIndex)) {
      sendJsonWithLog(socket, { type: "error", message: "Create match requires an integer modeIndex" }, "socket:create-match");
      return;
    }

    if (!isInteger(message.uid)) {
      sendJsonWithLog(socket, { type: "error", message: "Create match requires an integer uid" }, "socket:create-match");
      return;
    }

    const matchId = uuidv4();
    const match = matchmakingService.createMatch({
      matchId,
      arenaID: message.arenaID.trim(),
      modeIndex: message.modeIndex,
      creatorData: message,
    });

    if (!match) {
      sendJsonWithLog(socket, { type: "error", message: "Match creation failed" }, "socket:create-match");
      return;
    }

    sendJsonWithLog(socket, {
      type: "match_created",
      match,
    }, `match:${matchId}`);
  }
}

module.exports = { CreateMatchHandler };
