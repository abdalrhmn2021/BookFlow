// Turns two-step login on (or off) for one account, from your computer. Meant for YOUR superadmin
// account: it can see every business, so a password alone is not enough.
// Run it against the server's database (MONGO_URI in server/.env):
//
//   npm run two-factor -- --email you@example.com            turn it on
//   npm run two-factor -- --email you@example.com --disable  turn it off (lost phone)
//
// Turning it on:
//   1. A secret key is printed. Add it to an authenticator app (Google Authenticator,
//      Microsoft Authenticator, Authy...): "Enter a setup key" -> paste the key, type "Time based".
//   2. Type the 6-digit code the app shows. Only if it's right is two-step login saved -
//      so a typo can't lock you out.
// From then on the login page asks for the code after the password.

require("dotenv").config({ quiet: true });
const readline = require("readline/promises");
const mongoose = require("mongoose");
const User = require("../src/models/User");
const { parseArgs } = require("./setup-client");
const { generateSecret, verifyCode, otpauthUrl } = require("../src/utils/totp");

async function findAccount(email) {
  const accounts = await User.find({ email, scope: null });
  if (accounts.length === 0) {
    throw new Error(`No main account with the email ${email} in this database. Is MONGO_URI right?`);
  }
  return accounts[0];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = args.email?.trim().toLowerCase();
  if (!email) {
    console.error("\nUsage: npm run two-factor -- --email you@example.com [--disable]\n");
    process.exitCode = 1;
    return;
  }

  await require("../src/config/db")();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const user = await findAccount(email);

    if ("disable" in args) {
      await User.updateOne({ _id: user._id }, { $unset: { twoFactorSecret: 1, twoFactorLastStep: 1 } });
      console.log(`\nTwo-step login is OFF for ${email} (${user.role}). Turn it on again soon.\n`);
      return;
    }

    const secret = generateSecret();
    console.log(`\nAccount:  ${user.name} (${user.role}) - ${email}`);
    console.log('\nAdd this key to your authenticator app ("Enter a setup key", time based):\n');
    console.log(`  ${secret.match(/.{1,4}/g).join(" ")}\n`);
    console.log(`Or open this link on the phone: ${otpauthUrl({ secret, account: email })}\n`);

    for (let attempt = 1; attempt <= 3; attempt++) {
      const code = await rl.question("The 6-digit code the app shows now: ");
      const step = verifyCode(secret, code);
      if (step !== null) {
        await User.updateOne({ _id: user._id }, { $set: { twoFactorSecret: secret, twoFactorLastStep: step } });
        console.log("\nTwo-step login is ON ✅  The login page will ask for the code after the password.");
        console.log("Keep the key above somewhere safe (it's how you add the account to a new phone).\n");
        return;
      }
      console.log("That code doesn't match. Check the phone's time is automatic, then try the next code.");
    }
    console.error("\nNot turned on (3 wrong codes). Run the command again for a new key.\n");
    process.exitCode = 1;
  } catch (err) {
    console.error(`\nFailed: ${err.message}\n`);
    process.exitCode = 1;
  } finally {
    rl.close();
    await mongoose.disconnect();
  }
}

main();
