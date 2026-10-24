// Sets a new password for one account, from your computer. For copies without email set up
// (no BREVO_API_KEY), where "Forgot password?" can't send a link.
// Run it against that client's database (MONGO_URI in server/.env):
//
//   npm run reset-password -- --email laila@example.com
//
// Optional: --password <at least 8 chars>. Without it a strong random one is printed.
// Every device logged in to that account is signed out.

require("dotenv").config({ quiet: true });
const mongoose = require("mongoose");
const User = require("../src/models/User");
const { parseArgs, generatePassword } = require("./setup-client");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = args.email?.trim().toLowerCase();
  if (!email) {
    console.error("\nUsage: npm run reset-password -- --email someone@example.com [--password <8+ chars>]\n");
    process.exitCode = 1;
    return;
  }
  if (args.password && args.password.length < 8) {
    console.error("\n--password must be at least 8 characters\n");
    process.exitCode = 1;
    return;
  }
  const password = args.password || generatePassword();

  await require("../src/config/db")();
  try {
    const user = await User.findOne({ email });
    if (!user) {
      console.error(`\nNo account with the email ${email} in this database. Is MONGO_URI the client's?\n`);
      process.exitCode = 1;
      return;
    }
    user.password = password;
    await user.save(); // hashes it and signs out every device

    console.log("\nPassword changed ✅\n");
    console.log(`  Account:   ${user.name} (${user.role})`);
    console.log(`  Login:     ${user.email}`);
    console.log(
      `  Password:  ${password}${args.password ? "" : "   <- generated, give it to them (shown only now)"}\n`,
    );
  } finally {
    await mongoose.disconnect();
  }
}

main();
