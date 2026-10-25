const dns = require("dns");
const mongoose = require("mongoose");

// Some home ISPs/routers can't resolve the SRV records of a mongodb+srv:// address. dns.setServers
// changes DNS for the WHOLE process (emails, WhatsApp... too), so it is only done when needed:
//   DNS_SERVERS=8.8.8.8,1.1.1.1   -> always use these
//   not set, outside production  -> public DNS for a mongodb+srv:// address (the local-dev fix)
//   not set, in production       -> the host's own DNS (Render resolves SRV fine)
function chooseDnsServers() {
  const list = (process.env.DNS_SERVERS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length) return list;
  if (process.env.NODE_ENV !== "production" && process.env.MONGO_URI?.startsWith("mongodb+srv://")) {
    return ["8.8.8.8", "8.8.4.4"];
  }
  return null;
}
const dnsServers = chooseDnsServers();
if (dnsServers) dns.setServers(dnsServers);

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    await require("../models/User").dropLegacyEmailIndex();
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
module.exports.chooseDnsServers = chooseDnsServers; // for tests
