// Creates YOUR admin account (role "superadmin") for the admin panel at /admin.
// There is no sign-up for it on the website - only this command, from your computer:
//
//   npm run create-admin -- --email you@example.com --name "Abdalrahman"
//
// Optional: --password <at least 8 chars>. Without it a strong random one is printed.
// Run it against the server's database (MONGO_URI in server/.env).

require("dotenv").config({ quiet: true });
const mongoose = require("mongoose");
const User = require("../src/models/User");
const { parseArgs, generatePassword } = require("./setup-client");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = args.email?.trim().toLowerCase();
  const name = args.name?.trim() || "Admin";
  if (!email) {
    console.error(
      '\nUsage: npm run create-admin -- --email you@example.com --name "Your name" [--password <8+ chars>]\n',
    );
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
    if (await User.exists({ email, scope: null })) {
      console.error(`\n${email} already has an account here. Use another email (or npm run reset-password).\n`);
      process.exitCode = 1;
      return;
    }
    await User.create({ name, email, password, role: "superadmin" });
    console.log("\nAdmin account created ✅\n");
    console.log(`  Login:     ${email}`);
    console.log(`  Password:  ${password}${args.password ? "" : "   <- generated, save it now (shown only once)"}`);
    console.log("  Open:      <any of your sites>/admin\n");
  } catch (err) {
    console.error(`\nFailed: ${err.message}\n`);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

main();
