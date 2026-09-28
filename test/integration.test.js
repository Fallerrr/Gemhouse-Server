const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const WebSocket = require("ws");

const { startServer } = require("../index");
const registry = require("../handlers/PlayerRegistry");
const matchmaking = require("../services/MatchmakingService");
const { contract } = require("../protocol/socket-contract");

function messageQueue(socket) {
  const queued = [];
  const waiters = [];
  const protocolClient = contract.client(socket);
  socket.on("message", async (data) => {
    let envelope;
    try {
      envelope = await protocolClient.parse(data.toString());
    } catch (error) {
      envelope = { type: "test_parse_failure", payload: { message: error.message } };
    }
    const value = envelope.type === "error"
      ? { type: "error", ...envelope.error }
      : { type: envelope.type, ...envelope.payload };
    const index = waiters.findIndex(waiter => waiter.predicate(value));
    if (index >= 0) {
      const [waiter] = waiters.splice(index, 1);
      clearTimeout(waiter.timeout);
      waiter.resolve(value);
    } else {
      queued.push(value);
    }
  });

  return {
    send(type, payload = {}) {
      return protocolClient.send(type, payload);
    },
    next(predicate, timeoutMs = 2_000) {
      const index = queued.findIndex(predicate);
      if (index >= 0) return Promise.resolve(queued.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const waiter = {
          predicate,
          resolve,
          timeout: setTimeout(() => {
            const index = waiters.indexOf(waiter);
            if (index >= 0) waiters.splice(index, 1);
            reject(new Error("Timed out waiting for WebSocket message"));
          }, timeoutMs),
        };
        waiters.push(waiter);
      });
    },
  };
}

function clearApplicationState() {
  for (const player of registry.all()) registry.remove(player);
  registry.maxPlayers = Infinity;
  matchmaking.availableMatches.clear();
}

test("WebSocket server handles match, join, player list, movement, and disconnect", async (t) => {
  clearApplicationState();
  const originalMaxConnections = process.env.REDWEB_MAX_CONNECTIONS;
  process.env.REDWEB_MAX_CONNECTIONS = "0";
  try {
    await assert.rejects(startServer({ port: 0, bind: "127.0.0.1", signals: false }), /positive safe integer/);
  } finally {
    if (originalMaxConnections === undefined) delete process.env.REDWEB_MAX_CONNECTIONS;
    else process.env.REDWEB_MAX_CONNECTIONS = originalMaxConnections;
  }

  const server = await startServer({ port: 0 });
  await assert.rejects(startServer({ port: 0, signals: false }), /one server instance per Node.js process/);
  t.after(async () => {
    clearApplicationState();
    await server.shutdown();
  });
  const port = server.server.address().port;

  const health = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok" });
  const ready = await fetch(`http://127.0.0.1:${port}/ready`);
  assert.equal(ready.status, 200);
  assert.deepEqual(await ready.json(), { status: "ready" });

  const first = new WebSocket(`ws://127.0.0.1:${port}/socket?redwebVersion=2`);
  const firstMessages = messageQueue(first);
  t.after(() => { if (first.readyState < WebSocket.CLOSING) first.close(); });
  await once(first, "open");

  const invalid = new WebSocket(`ws://127.0.0.1:${port}/socket?redwebVersion=2`);
  t.after(() => { if (invalid.readyState < WebSocket.CLOSING) invalid.close(); });
  await once(invalid, "open");
  const rawPacketWait = new Promise(resolve => invalid.once("message", data => resolve(JSON.parse(data.toString()))));
  invalid.send(JSON.stringify({ v: "2", type: "join", payload: { matchId: 9 } }));
  const invalidPayloadFailure = await rawPacketWait;
  assert.equal(invalidPayloadFailure.type, "error");
  assert.equal(invalidPayloadFailure.error.code, "INVALID_PAYLOAD");

  await firstMessages.send("create match", {
    arenaID: "arena-1",
    modeIndex: 1,
    uid: 101,
    username: "Ada",
    customization: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 101, 100],
  });
  const created = await firstMessages.next(message => message.type === "match_created");
  assert.ok(created.match.matchId);

  await firstMessages.send("join", { matchId: created.match.matchId, uid: 101, username: "Ada" });
  const joinedFirst = await firstMessages.next(message => message.type === "joined");
  assert.equal(joinedFirst.player.username, "Ada");

  const second = new WebSocket(`ws://127.0.0.1:${port}/socket?redwebVersion=2`);
  const secondMessages = messageQueue(second);
  t.after(() => { if (second.readyState < WebSocket.CLOSING) second.close(); });
  await once(second, "open");
  await secondMessages.send("join", { matchId: created.match.matchId, uid: 202, username: "Lin" });
  const joinedSecond = await secondMessages.next(message => message.type === "joined");
  assert.equal(joinedSecond.player.username, "Lin");
  await firstMessages.next(message => message.type === "player_joined" && message.uid === 202);

  const otherMatchSocket = new WebSocket(`ws://127.0.0.1:${port}/socket?redwebVersion=2`);
  const otherMatchMessages = messageQueue(otherMatchSocket);
  t.after(() => { if (otherMatchSocket.readyState < WebSocket.CLOSING) otherMatchSocket.close(); });
  await once(otherMatchSocket, "open");
  await otherMatchMessages.send("create match", {
    arenaID: "arena-2",
    modeIndex: 1,
    uid: 303,
    username: "Morgan",
  });
  const otherMatch = await otherMatchMessages.next(message => message.type === "match_created");
  await otherMatchMessages.send("join", { matchId: otherMatch.match.matchId, uid: 303, username: "Morgan" });
  await otherMatchMessages.next(message => message.type === "joined");

  await firstMessages.send("move", { position: { x: 4, y: 2 }, vector: { x: 1, y: 0 } });
  const moved = await secondMessages.next(message => message.type === "player_moved");
  assert.equal(moved.player.position.x, 4);
  assert.equal(moved.player.vector.x, 1);
  await assert.rejects(otherMatchMessages.next(message => message.type === "player_moved", 50), /Timed out waiting/);

  await firstMessages.send("find matches");
  const matches = await firstMessages.next(message => message.type === "matches_list");
  assert.equal(matches.matches[0].players.length, 2);

  await firstMessages.send("get-players");
  const players = await firstMessages.next(message => message.type === "players_list");
  assert.equal(players.players.length, 2);

  second.close();
  await once(second, "close");
  const left = await firstMessages.next(message => message.type === "player_left");
  assert.equal(left.reason, "disconnected");
});
