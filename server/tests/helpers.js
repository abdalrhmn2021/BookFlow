require("dotenv").config({ quiet: true });
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-".padEnd(64, "x");
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";

const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const app = require("../src/app");
const Tenant = require("../src/models/Tenant");
const User = require("../src/models/User");
const Service = require("../src/models/Service");
const { dayNameOf } = require("../src/utils/time");

const TEST_DB_NAME = "bookflow_test";

let replSet;

// Inside Jest the driver's dynamic import("os") fails and it sends empty client metadata,
// which MongoDB 8.2 rejects. Passing `os` explicitly avoids that.
const CONNECT_OPTIONS = { dbName: TEST_DB_NAME, runtimeAdapters: { os: require("os") } };

async function connect() {
  const uri = process.env.MONGO_URI_TEST || process.env.MONGO_URI;

  if (uri) {
    if (uri.startsWith("mongodb+srv://")) {
      require("dns").setServers(["8.8.8.8", "8.8.4.4"]);
    }
    await mongoose.connect(uri, CONNECT_OPTIONS);
  } else {
    const { MongoMemoryReplSet } = require("mongodb-memory-server");
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: "wiredTiger" },
    });
    await mongoose.connect(replSet.getUri(), CONNECT_OPTIONS);
  }

  // Safety net: never wipe a non-test database.
  if (mongoose.connection.name !== TEST_DB_NAME) {
    throw new Error(`Refusing to run tests on database "${mongoose.connection.name}"`);
  }
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
}

async function clear() {
  const collections = Object.values(mongoose.connection.collections);
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

async function disconnect() {
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
}

const tokenFor = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });

async function makeBusiness(slug, { staffCount = 1 } = {}) {
  const tenant = await Tenant.create({ name: `Business ${slug}`, slug });
  const owner = await User.create({
    name: "Owner",
    email: `owner@${slug}.test`,
    password: "password123",
    role: "owner",
    tenantId: tenant._id,
  });
  const staff = [];
  for (let i = 1; i <= staffCount; i++) {
    staff.push(
      await User.create({
        name: `Staff ${i}`,
        email: `staff${i}@${slug}.test`,
        password: "password123",
        role: "staff",
        tenantId: tenant._id,
      }),
    );
  }
  const service = await Service.create({
    tenantId: tenant._id,
    name: "Haircut",
    price: 20,
    duration: 30,
  });
  return { tenant, owner, staff, service };
}

async function makeCustomer(name) {
  return User.create({
    name,
    email: `${name}@customer.test`,
    password: "password123",
    role: "customer",
  });
}

function nextOpenDate() {
  for (let d = 2; d < 10; d++) {
    const date = new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
    if (dayNameOf(date) !== "friday") return date;
  }
}

module.exports = {
  app,
  connect,
  clear,
  disconnect,
  tokenFor,
  makeBusiness,
  makeCustomer,
  nextOpenDate,
};
