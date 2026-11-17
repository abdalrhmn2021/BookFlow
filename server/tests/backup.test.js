// npm run backup / npm run restore (scripts/backup.js, scripts/restore.js).
const fs = require("fs");
const os = require("os");
const path = require("path");
const mongoose = require("mongoose");
const h = require("./helpers");
const User = require("../src/models/User");
const Appointment = require("../src/models/Appointment");
const { backupDatabase, restoreDatabase, readManifest, pruneBackups } = require("../src/services/backup.service");

let outDir;
beforeAll(h.connect);
beforeEach(() => {
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), "bookflow-backup-"));
});
afterEach(async () => {
  fs.rmSync(outDir, { recursive: true, force: true });
  await h.clear();
});
afterAll(h.disconnect);

async function someData() {
  const biz = await h.makeBusiness("backup-salon");
  const customer = await h.makeCustomer("lina");
  const start = new Date(Date.now() + 2 * 86400000);
  const appt = await Appointment.create({
    tenantId: biz.tenant._id,
    customerId: customer._id,
    staffId: biz.staff[0]._id,
    serviceId: biz.service._id,
    serviceName: "Haircut",
    price: 20,
    duration: 30,
    startTime: start,
    endTime: new Date(start.getTime() + 30 * 60000),
    status: "confirmed",
  });
  return { biz, customer, appt };
}

describe("backup and restore", () => {
  test("a backup put back into an empty database gives the same documents, types included", async () => {
    const { customer, appt } = await someData();
    const db = mongoose.connection.db;

    const { folder, manifest } = await backupDatabase(db, outDir);
    expect(manifest.database).toBe(db.databaseName);
    expect(manifest.collections.users).toBe(await User.countDocuments());
    expect(manifest.collections.appointments).toBe(1);
    expect(fs.existsSync(path.join(folder, "users.jsonl.gz"))).toBe(true);
    expect(readManifest(folder)).toEqual(manifest);

    await h.clear();
    const { restored } = await restoreDatabase(db, folder);
    expect(restored).toEqual(manifest.collections);

    // ObjectIds stay ObjectIds and dates stay dates, so the app works on the restored data.
    const back = await Appointment.findById(appt._id).lean();
    expect(back.startTime).toBeInstanceOf(Date);
    expect(back.startTime.getTime()).toBe(appt.startTime.getTime());
    expect(back.customerId).toBeInstanceOf(mongoose.Types.ObjectId);
    const user = await User.findById(customer._id).select("+password");
    expect(await user.comparePassword("password123")).toBe(true);
  });

  test("restore refuses a database that already has data, unless drop is set", async () => {
    await someData();
    const db = mongoose.connection.db;
    const { folder } = await backupDatabase(db, outDir);

    await expect(restoreDatabase(db, folder)).rejects.toThrow(/already has data/);
    await h.makeCustomer("added-after-backup");
    await restoreDatabase(db, folder, { drop: true });
    expect(await User.exists({ email: "added-after-backup@customer.test" })).toBeNull();
    expect(await Appointment.countDocuments()).toBe(1);
  });

  test("a folder that isn't a backup is refused", async () => {
    await expect(restoreDatabase(mongoose.connection.db, outDir)).rejects.toThrow(/manifest\.json/);
  });

  test("--keep deletes the oldest backups of that database only", () => {
    const names = [
      "app-2026-01-01_00-00-00",
      "app-2026-01-02_00-00-00",
      "app-2026-01-03_00-00-00",
      "other-2026-01-01_00-00-00",
    ];
    for (const n of names) {
      fs.mkdirSync(path.join(outDir, n));
      fs.writeFileSync(path.join(outDir, n, "manifest.json"), "{}");
    }
    expect(pruneBackups(outDir, "app", 2)).toEqual(["app-2026-01-01_00-00-00"]);
    expect(fs.readdirSync(outDir).sort()).toEqual(names.slice(1));
  });
});
