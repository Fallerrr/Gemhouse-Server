const { BaseHandler } = require("redweb");
const { getRegistry, logIncomingMessage, sendJsonWithLog } = require("./HandlerUtils");

const REPORT_LIMIT_WINDOW_MS = 10_000;
const MAX_REPORTS_PER_WINDOW = 3;
const CHAT_LIMIT_WINDOW_MS = 5_000;
const MAX_CHATS_PER_WINDOW = 10;
const DANGEROUS_PLAYER_REPORT_THRESHOLD = 3;
const MAX_CHAT_LOGS_PER_MATCH = 200;
const chatTimestampsBySocket = new WeakMap();
const reportTimestampsBySocket = new WeakMap();
const chatLogsByMatch = new Map();
const reportCountsByPlayerId = new Map();

function disconnectSocket(socket) {
    if (typeof socket.close === "function") {
        socket.close();
        return;
    }

    if (typeof socket.terminate === "function") {
        socket.terminate();
        return;
    }

    if (typeof socket.end === "function") {
        socket.end();
    }
}

function isReportingTooFrequently(socket) {
    const now = Date.now();
    const recentTimestamps = (reportTimestampsBySocket.get(socket) || [])
        .filter(timestamp => now - timestamp < REPORT_LIMIT_WINDOW_MS);

    recentTimestamps.push(now);
    reportTimestampsBySocket.set(socket, recentTimestamps);

    return recentTimestamps.length > MAX_REPORTS_PER_WINDOW;
}

function isChattingTooFrequently(socket) {
    const now = Date.now();
    const recentTimestamps = (chatTimestampsBySocket.get(socket) || [])
        .filter(timestamp => now - timestamp < CHAT_LIMIT_WINDOW_MS);

    recentTimestamps.push(now);
    chatTimestampsBySocket.set(socket, recentTimestamps);

    return recentTimestamps.length > MAX_CHATS_PER_WINDOW;
}

function normalizeUsername(value) {
    return typeof value === "string" ? value.trim() : "";
}

function validateSenderUsername(socket, player, message, handlerName) {
    const username = normalizeUsername(message.username);
    if (!username) {
        sendJsonWithLog(socket, { type: "error", message: `${handlerName} requires a 'username' string` }, `player:${player.id}`);
        return null;
    }

    if (player.username && username !== player.username) {
        sendJsonWithLog(socket, { type: "error", message: `${handlerName} 'username' does not match the joined player` }, `player:${player.id}`);
        return null;
    }

    return username;
}

function normalizeMessageText(value) {
    return typeof value === "string" ? value.trim() : "";
}

function addChatLog(matchId, entry) {
    const logs = chatLogsByMatch.get(matchId) || [];
    logs.push(entry);

    if (logs.length > MAX_CHAT_LOGS_PER_MATCH) {
        logs.splice(0, logs.length - MAX_CHAT_LOGS_PER_MATCH);
    }

    chatLogsByMatch.set(matchId, logs);
}

function hasMatchingChatLog(matchId, playerId, messageText) {
    const logs = chatLogsByMatch.get(matchId) || [];
    return logs.some(entry =>
        entry.playerId === playerId &&
        entry.message === messageText
    );
}

function incrementReportCount(playerId) {
    const reportCount = (reportCountsByPlayerId.get(playerId) || 0) + 1;
    reportCountsByPlayerId.set(playerId, reportCount);
    return reportCount;
}

class ChatHandler extends BaseHandler {
    constructor() {
        super("chat");
    }

    onMessage(socket, message) {
        logIncomingMessage("chat", message);

        if (isChattingTooFrequently(socket)) {
            sendJsonWithLog(
                socket,
                {
                    type: "error",
                    message: "Chat sent too frequently. Disconnecting client."
                },
                "socket:rate-limited"
            );

            setTimeout(() => disconnectSocket(socket), 100);
            return;
        }

        const registry = getRegistry();
        const player = registry.getBySocket(socket);
        if (!player) {
            sendJsonWithLog(socket, { type: "error", message: "Player not found" }, "socket:unregistered");
            return;
        }

        if (!Number.isInteger(message.playerId)) {
            sendJsonWithLog(socket, { type: "error", message: "Chat requires an integer 'playerId'" }, `player:${player.id}`);
            return;
        }

        if (message.playerId !== player.uid) {
            sendJsonWithLog(socket, { type: "error", message: "Chat 'playerId' does not match the joined player" }, `player:${player.id}`);
            return;
        }

        const username = validateSenderUsername(socket, player, message, "Chat");
        if (!username) {
            return;
        }

        const messageText = normalizeMessageText(message.message);
        if (!messageText) {
            sendJsonWithLog(socket, { type: "error", message: "Chat requires a 'message' string" }, `player:${player.id}`);
            return;
        }

        addChatLog(player.matchId, {
            matchId: player.matchId,
            serverPlayerId: player.id,
            playerId: message.playerId,
            username,
            message: messageText,
            timestamp: Date.now(),
        });

        registry.broadcast({
            type: "chat",
            player: {
                id: player.id,
                playerId: message.playerId,
                username,
                message: messageText
            }
        }, socket, player.matchId);
    }
}

class ReportChatHandler extends BaseHandler {
    constructor() {
        super("report chat");
    }

    onMessage(socket, message) {
        logIncomingMessage("report chat", message);

        if (isReportingTooFrequently(socket)) {
            sendJsonWithLog(
                socket,
                {
                    type: "error",
                    message: "Report chat sent too frequently. Disconnecting client."
                },
                "socket:rate-limited"
            );

            setTimeout(() => disconnectSocket(socket), 100);
            return;
        }

        const registry = getRegistry();
        const reporter = registry.getBySocket(socket);
        if (!reporter) {
            sendJsonWithLog(socket, { type: "error", message: "Player not found" }, "socket:unregistered");
            return;
        }

        if (typeof message.offendingMessage !== "string" || !message.offendingMessage.trim()) {
            sendJsonWithLog(socket, { type: "error", message: "Report chat requires an 'offendingMessage' string" }, `player:${reporter.id}`);
            return;
        }

        if (!Number.isInteger(message.playerId)) {
            sendJsonWithLog(socket, { type: "error", message: "Report chat requires an integer 'playerId'" }, `player:${reporter.id}`);
            return;
        }

        if (!Number.isInteger(message.reporterPlayerId)) {
            sendJsonWithLog(socket, { type: "error", message: "Report chat requires an integer 'reporterPlayerId'" }, `player:${reporter.id}`);
            return;
        }

        if (message.reporterPlayerId !== reporter.uid) {
            sendJsonWithLog(socket, { type: "error", message: "Report chat 'reporterPlayerId' does not match the joined player" }, `player:${reporter.id}`);
            return;
        }

        if (typeof message.reason !== "string" || !message.reason.trim()) {
            sendJsonWithLog(socket, { type: "error", message: "Report chat requires a 'reason' string" }, `player:${reporter.id}`);
            return;
        }

        const reporterUsername = validateSenderUsername(socket, reporter, message, "Report chat");
        if (!reporterUsername) {
            return;
        }

        const offendingPlayer = registry
            .getByMatchId(reporter.matchId)
            .find(player => player.uid === message.playerId);

        if (!offendingPlayer) {
            sendJsonWithLog(
                socket,
                { type: "error", message: "Reported player not found in this match" },
                `player:${reporter.id}`
            );
            return;
        }

        const offendingMessage = normalizeMessageText(message.offendingMessage);
        const isInvalidReport = !hasMatchingChatLog(reporter.matchId, message.playerId, offendingMessage);
        const reportCount = incrementReportCount(message.playerId);

        console.log("[chat-report]", JSON.stringify({
            matchId: reporter.matchId,
            reporterId: reporter.id,
            reporterUid: reporter.uid,
            reporterPlayerId: message.reporterPlayerId,
            reporterUsername,
            offendingServerId: offendingPlayer.id,
            offendingUid: message.playerId,
            offendingUsername: offendingPlayer.username,
            offendingMessage,
            reason: message.reason,
            invalid: isInvalidReport,
            reportCount,
        }));

        sendJsonWithLog(
            socket,
            {
                type: "report recieved",
                playerId: message.playerId,
                reporterPlayerId: message.reporterPlayerId,
                username: reporterUsername,
                invalid: isInvalidReport,
            },
            `player:${reporter.id}`
        );

        if (reportCount >= DANGEROUS_PLAYER_REPORT_THRESHOLD) {
            registry.broadcast({
                type: "dangerous-player",
                playerId: message.playerId,
                username: offendingPlayer.username,
                reportCount,
            }, null, reporter.matchId);
        }
    }
}

module.exports = { ChatHandler, ReportChatHandler };
