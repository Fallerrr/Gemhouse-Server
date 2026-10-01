const { BaseHandler } = require("redweb");
const { v4: uuidv4 } = require("uuid");
const { getRegistry, logIncomingMessage, sendJsonWithLog } = require("./HandlerUtils");
const matchmakingService = require("../services/MatchmakingService");

function getRequestedUid(message = {}) {
    if (Number.isInteger(message.uid) && message.uid > 0) {
        return message.uid;
    }

    if (Array.isArray(message.customization) && Number.isInteger(message.customization[10]) && message.customization[10] > 0) {
        return message.customization[10];
    }

    return 0;
}

class JoinHandler extends BaseHandler {
    constructor() {
        super("join");
    }

    onMessage(socket, message = {}) {
        logIncomingMessage("join", message);
        const registry = getRegistry();
        if (typeof message.matchId !== "string" || !message.matchId.trim()) {
            sendJsonWithLog(socket, { type: "error", message: "Join requires a matchId" }, "socket:unregistered");
            return;
        }
        const matchId = message.matchId.trim();
        if (!matchmakingService.hasMatch(matchId)) {
            sendJsonWithLog(socket, { type: "error", message: "Join requires a valid matchId" }, "socket:unregistered");
            return;
        }

        const existingPlayer = registry.getBySocket(socket);
        if (existingPlayer && existingPlayer.matchId === matchId) {
            const { position, vector, angle, ...joinMessage } = message;
            existingPlayer.updateJoinData(joinMessage);
            matchmakingService.addPlayer(existingPlayer);
            const playerPayload = existingPlayer.getJoinSanitized();

            existingPlayer.send("joined", {
                id: existingPlayer.id,
                playerGivenIndex: existingPlayer.playerGivenIndex,
                player: playerPayload,
            });

            registry.broadcast({
                type: "player_joined",
                id: existingPlayer.id,
                uid: existingPlayer.uid,
                username: existingPlayer.username,
                playerGivenIndex: existingPlayer.playerGivenIndex,
                customization: [...existingPlayer.customization],
                player: playerPayload,
            }, socket, existingPlayer.matchId);

            return;
        }

        const requestedUid = getRequestedUid(message);
        if (requestedUid) {
            registry.getByMatchId(matchId)
                .filter(player => player.uid === requestedUid && player.socket !== socket)
                .forEach(player => {
                    const playerId = player.id;
                    registry.remove(player);
                    registry.broadcast({
                        type: "player_left",
                        playerId,
                        matchId,
                        reason: "duplicate uid rejoined",
                    }, socket, matchId);
                });
        }

        if (existingPlayer && existingPlayer.matchId !== matchId) {
            const previousMatchId = existingPlayer.matchId;
            const previousPlayerId = existingPlayer.id;
            registry.remove(existingPlayer);
            registry.broadcast({
                type: "player_left",
                playerId: previousPlayerId,
                matchId: previousMatchId,
                reason: "joined another match",
            }, socket, previousMatchId);
        }

        const joinCheck = matchmakingService.canJoin(matchId);
        if (!joinCheck.allowed) {
            sendJsonWithLog(socket, { type: "error", message: joinCheck.reason }, "socket:unregistered");
            return;
        }

        const { position, vector, angle, ...joinMessage } = message;
        const playerData = {
            ...joinMessage,
            matchId,
        };
        const id = uuidv4();
        const player = registry.create(socket, id, playerData);
        const success = registry.add(player);
        if (!success) {
            sendJsonWithLog(socket, { type: "error", message: "Join rejected" }, "socket:unregistered");
            return;
        }
        if (!registry.joinRoom(socket, matchId)) {
            registry.remove(player);
            sendJsonWithLog(socket, { type: "error", message: "Match room is full" }, "socket:unregistered");
            return;
        }
        matchmakingService.addPlayer(player);

        player.send("joined", {
            id,
            playerGivenIndex: player.playerGivenIndex,
            player: player.getJoinSanitized(),
        });

        registry.broadcast({
            type: "player_joined",
            id: player.id,
            uid: player.uid,
            username: player.username,
            playerGivenIndex: player.playerGivenIndex,
            customization: [...player.customization],
            player: player.getJoinSanitized(),
        }, socket, player.matchId);

    }
}

module.exports = { JoinHandler };
