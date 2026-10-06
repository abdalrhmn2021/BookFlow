// ============================================================
// أدوات مشتركة لكل ملفات الاختبار
// ============================================================
// وين بتشتغل الاختبارات؟
//   - على جهازك: على Atlas، بس بداتابيس منفصلة اسمها "bookflow_test".
//     داتا الموقع الحقيقية (داتابيس "test") ما بتنلمس أبداً.
//     (MongoDB المؤقتة حجمها ~650MB على ويندوز - تنزيلها بطيء كثير)
//   - على GitHub Actions (CI=true): MongoDB مؤقتة بالذاكرة (على لينكس صغيرة وسريعة).
// - دوال بتجهّز بزنس + موظفين + خدمة + زبائن بسرعة، مباشرة بالموديلز
//   (بدون ما نمر على /register، عشان rate limit ما يوقفنا).
// ============================================================
require("dotenv").config({ quiet: true });
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-".padEnd(64, "x");
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";

const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const app = require("../src/app"); // بيحمّل كل الموديلز كمان
const Tenant = require("../src/models/Tenant");
const User = require("../src/models/User");
const Service = require("../src/models/Service");
const { dayNameOf } = require("../src/utils/time");

// اسم داتابيس الاختبارات - ثابت، ومستحيل يكون نفس داتابيس الموقع
const TEST_DB_NAME = "bookflow_test";

let replSet;

async function connect() {
  if (process.env.CI) {
    // GitHub Actions: MongoDB مؤقتة (replica set لأنه الحجز بيستخدم transactions)
    const { MongoMemoryReplSet } = require("mongodb-memory-server");
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: "wiredTiger" },
    });
    await mongoose.connect(replSet.getUri(), { dbName: TEST_DB_NAME });
  } else {
    // جهازك: نفس الـ cluster على Atlas، بس dbName بيجبرنا على داتابيس الاختبارات
    const uri = process.env.MONGO_URI_TEST || process.env.MONGO_URI;
    if (!uri) throw new Error("Set MONGO_URI (or MONGO_URI_TEST) in server/.env to run the tests");
    // نفس حل db.js: بعض مزودي الإنترنت ما بيدعموا SRV lookup
    require("dns").setServers(["8.8.8.8", "8.8.4.4"]);
    await mongoose.connect(uri, { dbName: TEST_DB_NAME });
  }

  // حماية إضافية: لو لأي سبب مش على داتابيس الاختبارات -> وقّف فوراً قبل ما نمسح شي
  if (mongoose.connection.name !== TEST_DB_NAME) {
    throw new Error(`Refusing to run tests on database "${mongoose.connection.name}"`);
  }
  // ابنِ الـ indexes (unique على slug/email/staffId...) قبل أي اختبار،
  // لأنه منع التكرار بيعتمد عليها
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
}

// امسح كل الداتا بين الاختبارات (كل اختبار بيبدأ نظيف)
async function clear() {
  const collections = Object.values(mongoose.connection.collections);
  await Promise.all(collections.map((c) => c.deleteMany({})));
}

async function disconnect() {
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
}

// توكن JWT لأي مستخدم - نفس اللي بيعمله السيرفر وقت تسجيل الدخول
const tokenFor = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });

// بزنس كامل: مالك + موظفين + خدمة نص ساعة
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

// أول يوم شغل (مش جمعة) بعد يومين من اليوم -> دايماً بالمستقبل
// وأبعد من حد الساعتين تبع الإلغاء
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
