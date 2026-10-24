// The demo accounts (scripts/seed.js) all use @demo.com and share one public password.
// Their password can't be changed or reset, or one visitor would lock everyone out of the demo.
const isDemoEmail = (email) => typeof email === "string" && /@demo\.com$/i.test(email.trim());

module.exports = { isDemoEmail };
