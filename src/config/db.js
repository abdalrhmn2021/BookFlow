const dns = require("dns");
const mongoose = require("mongoose");

// Force Node to resolve DNS (including the mongodb+srv lookup) through
// Google's public DNS servers. This works around ISPs/routers that don't
// support SRV record queries, which causes "querySrv ECONNREFUSED".
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
