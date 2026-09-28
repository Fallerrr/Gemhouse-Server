const { BaseHandler } = require("redweb");
const {
  getPlayerOrError,
  getRegistry,
  isFiniteNumber,
  isInteger,
  logIncomingMessage,
  sendError,
} = require("./HandlerUtils");

class DealDamageHandler extends BaseHandler {
  constructor() {
    super("deal damage");
  }

  onMessage(socket, message = {}) {
    logIncomingMessage("deal damage", message);

    const registry = getRegistry();
    const player = getPlayerOrError(socket);

    if (!player) return;

    if (!isFiniteNumber(message.amount)) {
      sendError(socket, "Deal damage requires a numeric 'amount' value");
      return;
    }

    if (typeof message.targetId !== "string" || !message.targetId.trim()) {
      sendError(socket, "Deal damage requires a targetId");
      return;
    }

    const target = registry.getById(message.targetId, player.matchId);

    if (!target) {
      sendError(socket, "Target player not found");
      return;
    }

    registry.broadcast(
      {
        type: "damage dealt",
        dealerId: player.id,
        targetId: target.id,
        amount: message.amount,
      },
      socket,
      player.matchId
    );
  }
}

class UpdateHealthHandler extends BaseHandler {
  constructor() {
    super("update health");
  }

  onMessage(socket, message = {}) {
    logIncomingMessage("update health", message);

    const registry = getRegistry();
    const player = getPlayerOrError(socket);

    if (!player) return;

    if (!isFiniteNumber(message.newHealth)) {
      sendError(socket, "Update health requires a numeric 'newHealth' value");
      return;
    }

    if (typeof message.targetId !== "string" || !message.targetId.trim()) {
      sendError(socket, "Update health requires a targetId");
      return;
    }

    const target = registry.getById(message.targetId, player.matchId);

    if (!target) {
      sendError(socket, "Target player not found");
      return;
    }

    registry.broadcast(
      {
        type: "health updated",
        targetId: target.id,
        newHealth: message.newHealth,
      },
      socket,
      player.matchId
    );
  }
}

class UpdatePointsHandler extends BaseHandler {
  constructor() {
    super("update points");
  }

  onMessage(socket, message = {}) {
    logIncomingMessage("update points", message);
    const registry = getRegistry();
    const player = getPlayerOrError(socket);
    if (!player) return;
    if (!isInteger(message.points)) {
      sendError(socket, "Update points requires an integer 'points' value");
      return;
    }

    registry.broadcast({
      type: "update points",
      playerId: player.id,
      points: message.points,
    }, socket, player.matchId);
  }
}

module.exports = {
  DealDamageHandler,
  UpdateHealthHandler,
  UpdatePointsHandler,
};
