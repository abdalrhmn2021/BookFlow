// Puts a backup from `npm run backup` into the database in MONGO_URI (server/.env).
//
//   npm run restore -- --from backups/bookflow-2026-11-17_09-30-00 --confirm bookflow
//
// --confirm must be the name of the database you are writing to (it is printed if it's wrong):
// it stops you from restoring into the wrong place.
// By default it only fills an EMPTY database. --drop replaces what is there now - every
// collection in the backup is emptied first. Make a fresh backup before you use --drop.

require("dotenv").config({ quiet: true });
const path = require("path");
const mongoose = require("mongoose");
const { parseArgs } = require("./setup-client");
const { restoreDatabase, readManifest } = require("../src/services/backup.service");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.from) {
    console.error("\nUsage: npm run restore -- --from <backup folder> --confirm <database name> [--drop]\n");
    process.exitCode = 1;
    return;
  }
  const folder = path.resolve(args.from);
  const manifest = readManifest(folder);

  await require("../src/config/db")();
  try {
    const db = mongoose.connection.db;
    if (args.confirm !== db.databaseName) {
      console.error(
        `\nThis would write into the database "${db.databaseName}" (from MONGO_URI).\n` +
          `If that is right, run it again with: --confirm ${db.databaseName}\n`,
      );
      process.exitCode = 1;
      return;
    }
    console.log(
      `\nRestoring the backup of "${manifest.database}" from ${manifest.createdAt} into "${db.databaseName}"...`,
    );
    const { restored } = await restoreDatabase(db, folder, { drop: "drop" in args });

    // The indexes (unique emails, slugs...) come from the models, not from the backup.
    for (const file of ["Tenant", "User", "Service", "Appointment", "CustomerTenant", "StaffLock", "GuestLock"]) {
      require(`../src/models/${file}`);
    }
    await Promise.all(Object.values(mongoose.models).map((m) => m.createIndexes()));

    for (const [name, count] of Object.entries(restored)) console.log(`  ${name.padEnd(20)} ${count}`);
    console.log("\nRestore done ✅\n");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(`\nRestore failed: ${err.message}\n`);
  process.exitCode = 1;
});
