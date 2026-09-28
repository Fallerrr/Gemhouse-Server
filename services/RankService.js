const fs = require("fs/promises");
const path = require("path");

const ranksPath = process.env.RANKS_FILE || path.join(__dirname, "..", "data", "ranks.json");
const collectionName = process.env.RANKS_COLLECTION || "globalRanks";
const storageMode = process.env.RANK_STORAGE || (process.env.K_SERVICE ? "firestore" : "file");

let firestore = null;

function shouldUseFirestore() {
  return storageMode === "firestore";
}

function getFirestore() {
  if (!shouldUseFirestore()) {
    return null;
  }

  if (!firestore) {
    const { Firestore } = require("@google-cloud/firestore");
    firestore = new Firestore();
  }

  return firestore;
}

function normalizeRankEntry(entry) {
  return {
    id: Number(entry.id),
    username: String(entry.username || "").trim(),
    xp: Number(entry.xp || 0),
    rank: Number(entry.rank || 0),
    updatedAt: entry.updatedAt || new Date().toISOString()
  };
}

function sortRankEntries(entries) {
  return entries.sort((left, right) => {
    if (right.xp !== left.xp) {
      return right.xp - left.xp;
    }

    return left.id - right.id;
  });
}

async function readLocalRanks() {
  try {
    const raw = await fs.readFile(ranksPath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.players) ? parsed.players.map(normalizeRankEntry) : [];
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

async function writeLocalRanks(players) {
  await fs.mkdir(path.dirname(ranksPath), { recursive: true });
  await fs.writeFile(ranksPath, `${JSON.stringify({ players }, null, 2)}\n`);
}

async function updateLocalRank({ id, username, xp }) {
  const players = await readLocalRanks();
  const idNumber = Number(id);
  const now = new Date().toISOString();
  const existing = players.find((player) => player.id === idNumber);

  if (existing) {
    existing.username = username;
    existing.xp = xp;
    existing.updatedAt = now;
  } else {
    players.push({ id: idNumber, username, xp, rank: 0, updatedAt: now });
  }

  sortRankEntries(players);
  players.forEach((player, index) => {
    player.rank = index + 1;
  });

  await writeLocalRanks(players);
  return players.find((player) => player.id === idNumber);
}

async function updateFirestoreRank({ id, username, xp }) {
  const db = getFirestore();
  const collection = db.collection(collectionName);
  const idString = String(id);
  const now = new Date().toISOString();

  await collection.doc(idString).set(
    {
      id: Number(id),
      username,
      xp,
      updatedAt: now
    },
    { merge: true }
  );

  const snapshot = await collection.get();
  const players = snapshot.docs.map((doc) => normalizeRankEntry({ id: Number(doc.id), ...doc.data() }));
  sortRankEntries(players);

  let target = null;
  for (let index = 0; index < players.length; index += 1) {
    players[index].rank = index + 1;
    if (players[index].id === Number(id)) {
      target = players[index];
    }
  }

  for (let index = 0; index < players.length; index += 500) {
    const batch = db.batch();
    for (const player of players.slice(index, index + 500)) {
      batch.set(
        collection.doc(String(player.id)),
        {
          username: player.username,
          xp: player.xp,
          rank: player.rank,
          updatedAt: player.updatedAt
        },
        { merge: true }
      );
    }
    await batch.commit();
  }

  return target;
}

class RankService {
  async updateRank({ id, username, xp }) {
    if (shouldUseFirestore()) {
      return updateFirestoreRank({ id, username, xp });
    }

    return updateLocalRank({ id, username, xp });
  }

  storageMode() {
    return storageMode;
  }
}

module.exports = new RankService();
