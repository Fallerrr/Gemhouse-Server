const { BaseHandler } = require("redweb");
const rankService = require("../services/RankService");
const { isInteger, logIncomingMessage, sendJsonWithLog } = require("./HandlerUtils");

class UpdateRankHandler extends BaseHandler {
  constructor() {
    super("update-rank");
  }

  async onMessage(socket, message = {}) {
    logIncomingMessage("update-rank", message);

    if (!isInteger(message.xp) || message.xp < 0) {
      sendJsonWithLog(socket, { type: "error", message: "Update rank requires a non-negative integer xp" }, "socket:update-rank");
      return;
    }

    if (!isInteger(message.id) || message.id <= 0) {
      sendJsonWithLog(socket, { type: "error", message: "Update rank requires a positive integer id" }, "socket:update-rank");
      return;
    }

    if (typeof message.username !== "string" || !message.username.trim()) {
      sendJsonWithLog(socket, { type: "error", message: "Update rank requires a username string" }, "socket:update-rank");
      return;
    }

    try {
      const playerRank = await rankService.updateRank({
        id: message.id,
        username: message.username.trim(),
        xp: message.xp
      });

      sendJsonWithLog(
        socket,
        {
          type: "update-rank",
          position: playerRank.rank
        },
        `rank:${message.id}`
      );
    } catch (error) {
      console.error("[rank] update-rank failed:", error);
      sendJsonWithLog(socket, { type: "error", message: "Rank update failed" }, "socket:update-rank");
    }
  }
}

module.exports = { UpdateRankHandler };
