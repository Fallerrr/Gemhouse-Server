// ShootHandler.js

const { BaseHandler } = require("redweb");
const { getRegistry, logIncomingMessage, sendJsonWithLog } = require("./HandlerUtils");

function isVec2(v) {
  return v && typeof v.x === "number" && typeof v.y === "number";
}

class ShootHandler extends BaseHandler {
  constructor() {
    super("shoot");
  }

  onMessage(socket, data = {}) {
    logIncomingMessage("shoot", data);
    const registry = getRegistry();
    const player = registry.getBySocket(socket);
    if (!player) {
      sendJsonWithLog(socket, { type: "error", message: "Player not found" }, "socket:unregistered");
      return;
    }

    const position  = data.position  && isVec2(data.position)  ? data.position  : { x: player.position.x, y: player.position.y };
    const direction = data.direction && isVec2(data.direction) ? data.direction : { x: player.vector.x,   y: player.vector.y };

    registry.broadcast(
      {
        type: "player_shot",
        shooterId: player.id,
        position,
        direction,
      },
      socket, // don't echo to sender
      player.matchId
    );
  }
}

module.exports = { ShootHandler };
