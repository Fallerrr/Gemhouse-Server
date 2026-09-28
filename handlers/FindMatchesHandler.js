const { BaseHandler } = require("redweb");
const matchmakingService = require("../services/MatchmakingService");
const { logIncomingMessage, sendJsonWithLog } = require("./HandlerUtils");

class FindMatchesHandler extends BaseHandler {
  constructor() {
    super("find matches");
  }

  onMessage(socket, _message = {}) {
    logIncomingMessage("find matches", {});
    sendJsonWithLog(socket, {
      type: "matches_list",
      matches: matchmakingService.getAvailableMatches(),
    }, "socket:matches-list");
  }
}

module.exports = { FindMatchesHandler };
