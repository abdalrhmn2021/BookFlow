// A full copy of the database (MONGO_URI in server/.env) into files on your computer.
//
//   npm run backup                      -> server/backups/<database>-<date>_<time>/
//   npm run backup -- --out D:\Backups  -> another folder (an external drive, a synced folder...)
//   npm run backup -- --keep 10         -> also deletes the oldest backups so 10 are left
//
// The files hold everything (password hashes, phones, emails): keep them private, never in git.
// Put it back with: npm run restore -- --from <folder> --confirm <database>

require("dotenv").config({ quiet: true });
const path = require("path");
const mongoose = require("mongoose");
const { parseArgs } = require("./setup-client");
const { backupDatabase, pruneBackups } = require("../src/services/backup.service");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(args.out || path.join(__dirname, "..", "backups"));
  const keep = args.keep ? Number(args.keep) : 0;
  if (args.keep && (!Number.isInteger(keep) || keep < 1)) {
    console.error("\n--keep must be a whole number of backups to keep (1 or more)\n");
    process.exitCode = 1;
    return;
  }

  await require("../src/config/db")();
  try {
    const db = mongoose.connection.db;
    console.log(`\nBacking up "${db.databaseName}"...`);
    const { folder, manifest } = await backupDatabase(db, outDir);
    for (const [name, count] of Object.entries(manifest.collections)) console.log(`  ${name.padEnd(20)} ${count}`);
    console.log(`\nBackup saved ✅\n  ${folder}\n`);
    const removed = pruneBackups(outDir, db.databaseName, keep);
    if (removed.length) console.log(`Deleted ${removed.length} old backup(s): ${removed.join(", ")}\n`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(`\nBackup failed: ${err.message}\n`);
  process.exitCode = 1;
});
