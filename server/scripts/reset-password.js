// Sets a new password for one account, from your computer. For copies without email set up
// (no BREVO_API_KEY), where "Forgot password?" can't send a link.
// Run it against that client's database (MONGO_URI in server/.env):
//
//   npm run reset-password -- --email laila@example.com
//
// Optional: --password <at least 8 chars>. Without it a strong random one is printed.
//           --business <slug>: on a shared server, the customer account of that business
//           (one email can have one per business).
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
    // On a shared server one email can have several accounts (a customer account per salon).
    require("../src/models/Tenant"); // registers the model for populate()
    const accounts = await User.find({ email }).populate("scope", "slug");
    let user = accounts[0];
    if (accounts.length > 1) {
      const slug = args.business?.trim().toLowerCase();
      user = slug ? accounts.find((a) => a.scope?.slug === slug) : accounts.find((a) => !a.scope);
      if (!user) {
        const where = accounts.map((a) => (a.scope ? `--business ${a.scope.slug}` : "(main account: no --business)"));
        console.error(`\n${email} has ${accounts.length} accounts here. Pick one:\n  ${where.join("\n  ")}\n`);
        process.exitCode = 1;
        return;
      }
    }
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
