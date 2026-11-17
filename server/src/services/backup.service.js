const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const readline = require("readline");
const { pipeline } = require("stream/promises");
const { Readable } = require("stream");
const mongoose = require("mongoose");

// A copy of the whole database in plain files (scripts/backup.js and scripts/restore.js).
// The free MongoDB Atlas plan has no automatic backups unless you turn them on, so this is the
// copy you keep yourself. No mongodump needed: it uses the same driver as the server.
//
// One folder per backup:  <database>-<date>_<time>/
//   manifest.json             what is inside (collections and their document counts)
//   <collection>.jsonl.gz     one document per line, as Extended JSON (ObjectId and Date survive)
//
// The files hold everything: password hashes, phone numbers, emails. Keep them private.

const FORMAT = 1;
const BATCH = 500;
const { EJSON } = mongoose.mongo.BSON;

const stamp = (d = new Date()) => d.toISOString().slice(0, 19).replace("T", "_").replace(/:/g, "-");

async function backupDatabase(db, outDir) {
  const folder = path.join(outDir, `${db.databaseName}-${stamp()}`);
  fs.mkdirSync(folder, { recursive: true });

  const collections = (await db.listCollections({ type: "collection" }).toArray())
    .map((c) => c.name)
    .filter((name) => !name.startsWith("system."))
    .sort();

  const counts = {};
  for (const name of collections) {
    let count = 0;
    const cursor = db.collection(name).find({});
    async function* lines() {
      for await (const doc of cursor) {
        count++;
        yield EJSON.stringify(doc, { relaxed: false }) + "\n";
      }
    }
    await pipeline(
      Readable.from(lines()),
      zlib.createGzip(),
      fs.createWriteStream(path.join(folder, `${name}.jsonl.gz`)),
    );
    counts[name] = count;
  }

  const manifest = {
    format: FORMAT,
    database: db.databaseName,
    createdAt: new Date().toISOString(),
    collections: counts,
  };
  fs.writeFileSync(path.join(folder, "manifest.json"), JSON.stringify(manifest, null, 2));
  return { folder, manifest };
}

function readManifest(folder) {
  const file = path.join(folder, "manifest.json");
  if (!fs.existsSync(file)) throw new Error(`No manifest.json in ${folder} - is this a BookFlow backup folder?`);
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  if (manifest.format !== FORMAT) throw new Error(`Unknown backup format ${manifest.format}`);
  return manifest;
}

// Puts a backup into `db`. Refuses a database that already has data, unless drop: true
// (then each collection in the backup is emptied first). Indexes come from the models.
async function restoreDatabase(db, folder, { drop = false } = {}) {
  const manifest = readManifest(folder);
  const names = Object.keys(manifest.collections);

  if (!drop) {
    for (const name of names) {
      if (await db.collection(name).estimatedDocumentCount()) {
        throw new Error(`"${name}" already has data in "${db.databaseName}". Use --drop to replace it.`);
      }
    }
  }

  const restored = {};
  for (const name of names) {
    const collection = db.collection(name);
    if (drop) await collection.deleteMany({});
    const input = readline.createInterface({
      input: fs.createReadStream(path.join(folder, `${name}.jsonl.gz`)).pipe(zlib.createGunzip()),
      crlfDelay: Infinity,
    });
    let batch = [];
    let count = 0;
    for await (const line of input) {
      if (!line.trim()) continue;
      batch.push(EJSON.parse(line, { relaxed: false }));
      if (batch.length === BATCH) {
        await collection.insertMany(batch, { ordered: true });
        count += batch.length;
        batch = [];
      }
    }
    if (batch.length) {
      await collection.insertMany(batch, { ordered: true });
      count += batch.length;
    }
    if (count !== manifest.collections[name]) {
      throw new Error(`"${name}": restored ${count} documents, the backup says ${manifest.collections[name]}`);
    }
    restored[name] = count;
  }
  return { manifest, restored };
}

// Deletes the oldest backup folders of this database so only `keep` are left.
function pruneBackups(outDir, databaseName, keep) {
  if (!keep || keep < 1 || !fs.existsSync(outDir)) return [];
  const mine = fs
    .readdirSync(outDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith(`${databaseName}-`))
    .filter((e) => fs.existsSync(path.join(outDir, e.name, "manifest.json")))
    .map((e) => e.name)
    .sort();
  const old = mine.slice(0, Math.max(0, mine.length - keep));
  for (const name of old) fs.rmSync(path.join(outDir, name), { recursive: true, force: true });
  return old;
}

module.exports = { backupDatabase, restoreDatabase, readManifest, pruneBackups };
