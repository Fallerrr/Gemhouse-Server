# Gemhouse Server

Gemhouse Server is a multiplayer game backend built on [Redweb 0.16.5](https://redweb.magnisolution.com/). It accepts JSON messages over WebSockets for player state, combat, abilities, match events, matchmaking, chat, and global ranks. This repository contains the WebSocket server and no browser client assets.

## Installation

```bash
git clone https://github.com/Fallerrr/Gemhouse-Server.git
cd Gemhouse-Server
npm ci
npm start
```

The WebSocket route is `ws://localhost:3000/socket`. Set `PORT` to change the listener port (Cloud Run sets this automatically); outside Cloud Run, `WS_PORT` is used when `PORT` is unset. Node.js 22 is used by the Docker image.

Redweb uses an HTTP upgrade handshake for WebSocket connections. This service does not start a separate HTTP server or serve browser files.

## Core Files

| File | Purpose |
| --- | --- |
| `index.js` | Starts the WebSocket server |
| `DefaultRoute.js` | Registers all socket handlers and services |
| `handlers/CreateMatchHandler.js` | Creates an available match entry |
| `handlers/CreateDuelHandler.js` | Creates a duel challenge match and broadcasts it |
| `handlers/FindMatchesHandler.js` | Returns the list of currently available matches |
| `handlers/JoinHandler.js` | Handles player join requests |
| `handlers/RankHandler.js` | Handles global rank XP updates |
| `handlers/MoveHandler.js` | Handles movement updates and launch events |
| `handlers/PlayerActionHandlers.js` | Handles action-state events like attack, walk, walkRight, jump, stop jumping, dodge |
| `handlers/AbilityHandlers.js` | Handles ability usage events |
| `handlers/MatchEventHandlers.js` | Handles damage and match point updates |
| `handlers/GetPlayersHandler.js` | Sends the current player list back to a client |
| `handlers/Player.js` | Server-side player model |
| `handlers/PlayerRegistry.js` | Stores connected players and broadcasts messages |
| `services/MatchmakingService.js` | Stores available matches and each match's joined-player list |
| `services/MatchService.js` | Broadcasts match start / match over events |
| `services/RankService.js` | Persists global ranks in Firestore on Cloud Run, or a local JSON file during development |
| `test/unit.test.js` | Unit tests for registry, matchmaking, handlers, and rank storage |
| `test/integration.test.js` | WebSocket integration tests against a live Redweb server |

## Tests

Run the unit and WebSocket integration tests with `npm test`. Use `npm run test:unit` or `npm run test:integration` to run either suite alone. `npm run test:coverage` enforces 100% line, branch, function, and statement coverage for the server source.

## WebSocket Protocol

The server accepts both the existing flat JSON packets and Redweb v1 envelopes. For an envelope, the `payload` fields are passed to the existing message handler and the envelope's top-level `type` selects that handler. Responses keep their existing flat JSON format, so current clients do not need to change.
Match inactivity removal is disabled by default. It can be re-enabled with `MATCH_INACTIVITY_ENABLED=true`, which removes players from a match after 30 seconds without client messages.

Global ranks use Firestore automatically on Cloud Run. Local development uses `data/ranks.json` unless `RANK_STORAGE=firestore` is set. The Firestore collection can be changed with `RANKS_COLLECTION`; the local JSON path can be changed with `RANKS_FILE`.

### Incoming Messages

#### `create match`

Creates an available match, returns a server-generated `matchId`, and stores the creator metadata plus an empty joined-player list. Players later use that `matchId` in `join`.

Join capacity depends on `modeIndex`:
- `modeIndex: 0` allows up to 2 joined players total
- any other `modeIndex` allows up to 8 joined players total

```json
{
  "type": "create match",
  "arenaID": "arena-forest",
  "modeIndex": 2,
  "uid": 1234567890,
  "username": "Ada",
  "customization": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 1234567890, 2500]
}
```

#### `create duel`

Creates a duel match that is always played on `finaleL1`, is limited to 2 players, and broadcasts the duel details to connected players. The challenger provides the challenged player's client-generated ID as `challengedUid`.

```json
{
  "type": "create duel",
  "modeIndex": 0,
  "uid": 1234567890,
  "username": "Ada",
  "challengedUid": 2345678901,
  "customization": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 1234567890, 2500]
}
```

#### `duel recieved`

Sent by the challenged player after receiving a duel challenge. The server pulls `challengerUid` from the stored duel using `matchId`; if the match is missing, it falls back to the provided `challengerUid`.

```json
{
  "type": "duel recieved",
  "matchId": "server-generated-duel-id",
  "challengerUid": 1234567890
}
```

#### `duel accepted`

```json
{
  "type": "duel accepted",
  "matchId": "server-generated-duel-id",
  "challengerUid": 1234567890
}
```

#### `duel declined`

```json
{
  "type": "duel declined",
  "matchId": "server-generated-duel-id",
  "challengerUid": 1234567890
}
```

#### `find matches`

Returns the current list of available matches and each match's joined-player list.

```json
{
  "type": "find matches"
}
```

#### `update-rank`

Permanently saves a player's global rank XP by client-generated player ID, recalculates global positions by highest XP first, and sends the calculated position back to the sender.

```json
{
  "type": "update-rank",
  "xp": 2500,
  "id": 569145,
  "username": "Ada"
}
```

#### `join`

`matchId` is required. The server assigns the player/session `id`. The player-specific 10-digit UID belongs in `customization[10]` or in `uid`. `username` is a string. `playerGivenIndex` is the client/player-provided slot index used by the game client.
`position`, `vector`, and `angle` are not part of the join payload and are ignored if sent.

If the target match is already full, the server rejects the join:
- for `modeIndex: 0`, the 3rd join request is denied
- for any other `modeIndex`, the 9th join request is denied

If a socket sends `join` for a match it is already in, the server re-sends `joined` to that socket and re-broadcasts `player_joined` to the other players in that match. The server keeps the same player `id` and `joinIndex`, but refreshes the player's `username`, `customization`, `uid`, and `playerGivenIndex` from the new join payload.

If a socket is currently in the preset `lobbyL` match and successfully joins another match, the server removes that socket's old `lobbyL` player entry and broadcasts `player_left` to the remaining lobby players with `reason: "joined another match"`.

```json
{
  "type": "join",
  "matchId": "arena-01",
  "username": "Ada",
  "playerGivenIndex": 0,
  "customization": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 1234567890, 2500]
}
```

Alternate UID form:

```json
{
  "type": "join",
  "matchId": "arena-01",
  "uid": 1234567890,
  "username": "Ada",
  "playerGivenIndex": 0,
  "customization": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 2500]
}
```

Customization order:

1. costume
2. eye color
3. headgear
4. hair
5. skin tone
6. weapon
7. banner
8. banner style
9. level
10. rank
11. user id
12. rank xp

#### `chat`

Sending chat too frequently disconnects the client. Current limit: more than 10 chat messages within 5 seconds.

```json
{
  "type": "chat",
  "playerId": 1234567890,
  "username": "Ada",
  "message": "Hello everyone!"
}
```

#### `report chat`

Reports a chat message from another player in the same match. `playerId` is the offending player's client-generated user ID, not their server-generated player ID. Sending this packet too frequently disconnects the client.

```json
{
  "type": "report chat",
  "offendingMessage": "bad message text",
  "playerId": 1234567890,
  "reporterPlayerId": 2345678901,
  "username": "Ada",
  "reason": "harassment"
}
```

#### `move`

All vector values are numeric and may contain floats.

```json
{
  "type": "move",
  "position": { "x": 5.5, "y": 0.0, "z": 2.25 },
  "vector": { "x": 0.0, "y": 0.0, "z": 1.0 },
  "angle": { "x": 0.7071, "y": 0.7071, "z": 0.0 }
}
```

You can send any subset of `position`, `vector`, and `angle`.

#### `launch character`

```json
{
  "type": "launch character",
  "velocity": { "x": 12.5, "y": -8.25, "z": 0.0 }
}
```

#### `shoot`

```json
{
  "type": "shoot",
  "position": { "x": 20.0, "y": 10.0 },
  "direction": { "x": 1.0, "y": 0.0 }
}
```

#### `attack`

```json
{
  "type": "attack",
  "pressed": true
}
```

#### `walk`

```json
{
  "type": "walk",
  "walking": 1.0,
  "location": { "x": 5.5, "y": 0.0, "z": 2.25 },
  "facing": { "x": 0.7071, "y": 0.7071, "z": 0.0 }
}
```

`walking` must be a float between `-1.0` and `1.0`. `location` and `facing` are required vectors. The server also accepts `position` as an alias for `location`, and `angle` or `direction` as aliases for `facing`.

#### `walkRight`

```json
{
  "type": "walkRight",
  "walking": 1.0,
  "location": { "x": 5.5, "y": 0.0, "z": 2.25 },
  "facing": { "x": 0.7071, "y": 0.7071, "z": 0.0 }
}
```

`walking` must be a float between `-1.0` and `1.0`. `location` and `facing` are required vectors. The server also accepts `position` as an alias for `location`, and `angle` or `direction` as aliases for `facing`.

#### `jump`

```json
{
  "type": "jump"
}
```

#### `stop jumping`

```json
{
  "type": "stop jumping"
}
```

#### `hoverboard`

```json
{
  "type": "hoverboard"
}
```

#### `dodge`

```json
{
  "type": "dodge",
  "direction": { "x": 1.0, "y": 0.0, "z": 0.0 }
}
```

If `direction` is omitted, the server uses the player's current facing direction.

#### `stunned`

```json
{
  "type": "stunned",
  "appliedByPlayerId": "server-player-id-that-applied-stun",
  "stunType": "electric"
}
```

`appliedByPlayerId` may be omitted or sent as an empty string. If it is provided and matches a valid server-generated player ID from the same match, the server includes it in the broadcast. If it is empty or invalid, the stun is still broadcast without `appliedByPlayerId`.

#### `update direction`

```json
{
  "type": "update direction",
  "direction": { "x": 0.0, "y": -1.0, "z": 0.0 }
}
```

#### `seehn disk`

```json
{
  "type": "seehn disk",
  "position": { "x": 25.0, "y": 12.5, "z": 0.0 },
  "angle": { "x": 0.0, "y": 1.0, "z": 0.0 }
}
```

#### `special`

```json
{
  "type": "special",
  "position": { "x": 25.0, "y": 12.5, "z": 0.0 }
}
```

#### `super special`

```json
{
  "type": "super special",
  "position": { "x": 25.0, "y": 12.5, "z": 0.0 },
  "angle": { "x": 0.0, "y": 1.0, "z": 0.0 }
}
```

#### `seehn disks ready`

```json
{
  "type": "seehn disks ready"
}
```

#### `special ready`

```json
{
  "type": "special ready"
}
```

#### `super special ready`

```json
{
  "type": "super special ready"
}
```

#### `deal damage`

```json
{
  "type": "deal damage",
  "targetId": "server-player-id",
  "amount": 15.5
}
```

#### `update points`

```json
{
  "type": "update points",
  "points": 2
}
```

#### `get-players`

```json
{
  "type": "get-players"
}
```

### Server Messages

#### `update-rank`

Sent only to the client that sent `update-rank`.

```json
{
  "type": "update-rank",
  "position": 12
}
```

#### `match_created`

Sent only to the socket that created the match.

```json
{
  "type": "match_created",
  "match": {
    "matchId": "server-generated-match-id",
    "arenaID": "arena-forest",
    "modeIndex": 2,
    "creatorUserId": 1234567890,
    "creator": {
      "matchId": "server-generated-match-id",
      "uid": 1234567890,
      "username": "Ada",
      "customization": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 1234567890, 2500]
    },
    "players": [],
    "createdAt": 1776115200000
  }
}
```

#### `duel_created`

Broadcast to connected players when a duel is created. If the creator is not already a joined player, the creator socket also receives this message directly.

```json
{
  "type": "duel_created",
  "matchId": "server-generated-duel-id",
  "challengerUid": 1234567890,
  "username": "Ada",
  "customization": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 1234567890, 2500],
  "challengedUid": 2345678901
}
```

#### `duel recieved`

Broadcast when the challenged player reports receiving the duel.

```json
{
  "type": "duel recieved",
  "matchId": "server-generated-duel-id",
  "challengerUid": 1234567890,
  "challengedUid": 2345678901,
  "playerId": "server-player-id"
}
```

#### `duel accepted`

```json
{
  "type": "duel accepted",
  "matchId": "server-generated-duel-id",
  "challengerUid": 1234567890,
  "challengedUid": 2345678901,
  "playerId": "server-player-id"
}
```

#### `duel declined`

```json
{
  "type": "duel declined",
  "matchId": "server-generated-duel-id",
  "challengerUid": 1234567890,
  "challengedUid": 2345678901,
  "playerId": "server-player-id"
}
```

#### `matches_list`

Sent to the socket that requested `find matches`.

```json
{
  "type": "matches_list",
  "matches": [
    {
      "matchId": "server-generated-match-id",
      "arenaID": "arena-forest",
      "modeIndex": 2,
      "creatorUserId": 1234567890,
      "creator": {
        "matchId": "server-generated-match-id",
        "uid": 1234567890,
        "username": "Ada",
        "customization": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 1234567890, 2500]
      },
      "players": [
        {
          "id": "server-player-id",
          "matchId": "server-generated-match-id",
          "joinIndex": 0,
          "uid": 1234567890,
          "username": "Ada",
          "customization": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 1234567890, 2500]
        }
      ],
      "createdAt": 1776115200000
    }
  ]
}
```

#### `joined`

Sent only to the player who joined.

```json
{
  "type": "joined",
  "id": "server-generated-player-id",
  "playerGivenIndex": 0,
  "player": {
    "id": "server-generated-player-id",
    "matchId": "arena-01",
    "joinIndex": 0,
    "playerGivenIndex": 0,
    "uid": 1234567890,
    "username": "Ada",
    "customization": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 1234567890, 2500]
  }
}
```

#### `player_joined`

Broadcast to the other connected players when someone joins.

```json
{
  "type": "player_joined",
  "id": "server-generated-player-id",
  "uid": 1234567890,
  "username": "Ada",
  "playerGivenIndex": 0,
  "customization": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 1234567890, 2500],
  "player": {
    "id": "server-generated-player-id",
    "matchId": "arena-01",
    "joinIndex": 0,
    "playerGivenIndex": 0,
    "uid": 1234567890,
    "username": "Ada",
    "customization": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 1234567890, 2500]
  }
}
```

#### `players_list`

```json
{
  "type": "players_list",
  "players": [
    {
      "id": "server-generated-player-id",
      "matchId": "arena-01",
      "joinIndex": 0,
      "uid": 1234567890,
      "username": "Ada",
      "customization": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 1234567890, 2500]
    }
  ]
}
```

#### `removed from match`

Sent only to the inactive player when the server removes them from their match after 30 seconds without client messages.

```json
{
  "type": "removed from match",
  "playerId": "server-player-id",
  "matchId": "arena-01",
  "reason": "inactive"
}
```

#### `player_left`

Broadcast to the remaining players in the match when a player is removed for inactivity.

```json
{
  "type": "player_left",
  "playerId": "server-player-id",
  "matchId": "arena-01",
  "reason": "inactive"
}
```

#### `player_moved`

```json
{
  "type": "player_moved",
  "player": {
    "id": "server-generated-player-id",
    "matchId": "arena-01",
    "joinIndex": 0,
    "uid": 1234567890,
    "username": "Ada",
    "position": { "x": 5.5, "y": 0.0, "z": 2.25 },
    "vector": { "x": 0.0, "y": 0.0, "z": 1.0 },
    "angle": { "x": 0.7071, "y": 0.7071, "z": 0.0 },
    "customization": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 1234567890, 2500]
  }
}
```

#### `player_shot`

```json
{
  "type": "player_shot",
  "shooterId": "server-player-id",
  "position": { "x": 20.0, "y": 10.0 },
  "direction": { "x": 1.0, "y": 0.0 }
}
```

#### `chat`

```json
{
  "type": "chat",
  "player": {
    "id": "server-player-id",
    "playerId": 1234567890,
    "username": "Ada",
    "message": "Hello everyone!"
  }
}
```

#### `report recieved`

Sent back only to the client that sent `report chat`.

```json
{
  "type": "report recieved",
  "playerId": 1234567890,
  "reporterPlayerId": 2345678901,
  "username": "Ada",
  "invalid": false
}
```

`invalid` is `true` when the reported message was not found in the server's chat log for that match.

#### `dangerous-player`

Broadcast to players in the match when the same client-generated player ID has been reported several times.

```json
{
  "type": "dangerous-player",
  "playerId": 1234567890,
  "username": "BadPlayer",
  "reportCount": 3
}
```

#### `attack`

```json
{
  "type": "attack",
  "playerId": "server-player-id",
  "pressed": true
}
```

#### `walk`

```json
{
  "type": "walk",
  "playerId": "server-player-id",
  "walking": 1.0,
  "location": { "x": 5.5, "y": 0.0, "z": 2.25 },
  "facing": { "x": 0.7071, "y": 0.7071, "z": 0.0 }
}
```

#### `walkRight`

```json
{
  "type": "walkRight",
  "playerId": "server-player-id",
  "walking": 1.0,
  "location": { "x": 5.5, "y": 0.0, "z": 2.25 },
  "facing": { "x": 0.7071, "y": 0.7071, "z": 0.0 }
}
```

#### `jump`

```json
{
  "type": "jump",
  "playerId": "server-player-id"
}
```

#### `stop jumping`

```json
{
  "type": "stop jumping",
  "playerId": "server-player-id"
}
```

#### `hoverboard`

```json
{
  "type": "hoverboard",
  "playerId": "server-player-id"
}
```

#### `dodge`

```json
{
  "type": "dodge",
  "playerId": "server-player-id",
  "direction": { "x": 1.0, "y": 0.0, "z": 0.0 }
}
```

#### `stunned`

```json
{
  "type": "stunned",
  "playerId": "server-player-id",
  "appliedByPlayerId": "server-player-id-that-applied-stun",
  "stunType": "electric"
}
```

If no valid applier was provided, `appliedByPlayerId` is omitted from the broadcast.

#### `update direction`

```json
{
  "type": "update direction",
  "playerId": "server-player-id",
  "direction": { "x": 0.0, "y": -1.0, "z": 0.0 }
}
```

#### `launch character`

```json
{
  "type": "launch character",
  "targetId": "server-player-id",
  "velocity": { "x": 12.5, "y": -8.25, "z": 0.0 }
}
```

#### `seehn disk`

```json
{
  "type": "seehn disk",
  "playerId": "server-player-id",
  "position": { "x": 25.0, "y": 12.5, "z": 0.0 },
  "angle": { "x": 0.0, "y": 1.0, "z": 0.0 }
}
```

#### `special`

```json
{
  "type": "special",
  "playerId": "server-player-id",
  "position": { "x": 25.0, "y": 12.5, "z": 0.0 }
}
```

#### `super special`

```json
{
  "type": "super special",
  "playerId": "server-player-id",
  "position": { "x": 25.0, "y": 12.5, "z": 0.0 },
  "angle": { "x": 0.0, "y": 1.0, "z": 0.0 }
}
```

#### `seehn disks ready`

```json
{
  "type": "seehn disks ready",
  "playerId": "server-player-id"
}
```

#### `special ready`

```json
{
  "type": "special ready",
  "playerId": "server-player-id"
}
```

#### `super special ready`

```json
{
  "type": "super special ready",
  "playerId": "server-player-id"
}
```

#### `deal damage`

```json
{
  "type": "deal damage",
  "dealerId": "server-player-id",
  "targetId": "server-player-id",
  "amount": 15.5
}
```

#### `update points`

```json
{
  "type": "update points",
  "playerId": "server-player-id",
  "points": 2
}
```

#### `error`

```json
{
  "type": "error",
  "message": "Player not found"
}
```

#### `match_started`

```json
{
  "type": "match_started"
}
```

#### `match_over`

```json
{
  "type": "match_over"
}
```

## Notes

- Incoming client packets are logged in the server terminal as `[client->server] <type> <payload>`.
- `create match` stores available matches in the matchmaking service, and `find matches` returns them as a JSON array.
- `create duel` also stores a match entry in the matchmaking service, with `arenaID: "finaleL1"` and `maxPlayers: 2`.
- `join` adds joined players to that match's `players` list.
- Player broadcasts and `players_list` are scoped to the sender's `matchId`.
- Action and match event broadcasts use the server-assigned player `id` values, not the player-specific `uid`.
- If a handler returns `"Player not found"`, that socket has not successfully completed `join` yet on the server.
