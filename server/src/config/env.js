// Safe by default (security review M-02): the conveniences that weaken security - the login token
// in the JSON answer, a login cookie without `Secure` - are only for an EXPLICIT
// NODE_ENV=development or NODE_ENV=test. A server started with NODE_ENV missing or misspelled
// behaves like production, so a forgotten setting can't quietly turn the protections off.
// Read on every call (not once at start-up), so tests can change NODE_ENV.
const nodeEnv = () => (process.env.NODE_ENV || "").trim().toLowerCase();

const isDevOrTest = () => nodeEnv() === "development" || nodeEnv() === "test";

module.exports = { isDevOrTest, nodeEnv };
