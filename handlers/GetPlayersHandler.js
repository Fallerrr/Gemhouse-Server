const { BaseHandler } = require("redweb");
const { getRegistry, logIncomingMessage, sendJsonWithLog } = require("./HandlerUtils");

class GetPlayersHandler extends BaseHandler {
    constructor() {
        super('get-players');
    }

    onMessage(socket, _) {
        logIncomingMessage("get-players", {});
        const registry = getRegistry();
        const player = registry.getBySocket(socket);
        const players = player ? registry.getByMatchId(player.matchId).map(current => current.getJoinSanitized()) : [];
        sendJsonWithLog(socket, {
            type: 'players_list',
            players
        }, "socket:players-list");
    }
}

module.exports = { GetPlayersHandler };
