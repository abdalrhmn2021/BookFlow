const crypto = require("crypto");
const RateLimit = require("../models/RateLimit");

// Where express-rate-limit keeps its counters (security review L-1).
//
// Its default store is the server's memory: every restart or deploy set all counters back to zero
// (Render's free plan sleeps and restarts often), and two copies of the server would each count on
// their own. This store keeps them in MongoDB instead (models/RateLimit.js).
//
// One store per limiter (express-rate-limit refuses a store shared by two limiters): the name keeps
// their counters apart, e.g. new MongoRateLimitStore("login").
class MongoRateLimitStore {
  constructor(name) {
    this.prefix = name; // read by express-rate-limit's double-count check
    this.localKeys = false; // the counters are shared, not per server copy
    this.windowMs = 60 * 1000; // replaced by the limiter's own window in init()
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  id(key) {
    return crypto.createHash("sha256").update(`${this.prefix}:${key}`).digest("hex");
  }

  async get(key) {
    const doc = await RateLimit.collection.findOne({ _id: this.id(key), resetAt: { $gt: new Date() } });
    return doc ? { totalHits: doc.count, resetTime: doc.resetAt } : undefined;
  }

  // One atomic update: +1 inside the current window, or a new window starting at 1 when there is
  // none yet (or the last one is over - the TTL clean-up runs only about once a minute).
  async increment(key) {
    const now = new Date();
    const live = { $gt: ["$resetAt", now] };
    const doc = await RateLimit.collection.findOneAndUpdate(
      { _id: this.id(key) },
      [
        {
          $set: {
            count: { $cond: [live, { $add: ["$count", 1] }, 1] },
            resetAt: { $cond: [live, "$resetAt", new Date(now.getTime() + this.windowMs)] },
          },
        },
      ],
      { upsert: true, returnDocument: "after" },
    );
    return { totalHits: doc.count, resetTime: doc.resetAt };
  }

  // skipSuccessfulRequests: a request that turned out fine gives its hit back.
  async decrement(key) {
    await RateLimit.collection.updateOne(
      { _id: this.id(key), resetAt: { $gt: new Date() }, count: { $gt: 0 } },
      { $inc: { count: -1 } },
    );
  }

  async resetKey(key) {
    await RateLimit.collection.deleteOne({ _id: this.id(key) });
  }
}

module.exports = { MongoRateLimitStore };
