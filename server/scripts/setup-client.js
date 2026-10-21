// Sets up a NEW copy of BookFlow for one client: creates the business and its owner account.
// Run it once per client, against the database of the server that will serve it (MONGO_URI in server/.env)
// - usually your one shared server for all clients:
//
//   npm run setup-client -- --name "Laila Salon" --slug laila-salon --owner "Laila" --email laila@example.com
//
// Optional: --phone 0599123456  --password <at least 8 chars>  --timezone Asia/Hebron
// Anything required that you leave out is asked for in the terminal.
// No --password = a strong random one is generated and printed (give it to the owner).

require("dotenv").config({ quiet: true });
const crypto = require("crypto");
const readline = require("readline/promises");
const mongoose = require("mongoose");
const { createBusinessWithOwner } = require("../src/services/business.service");

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// [flag, field, question asked in the terminal, required?]
const FIELDS = [
  ["name", "businessName", "Business name (e.g. Laila Salon)", true],
  ["slug", "slug", "Booking link slug - English lowercase, numbers, dashes (e.g. laila-salon)", true],
  ["owner", "ownerName", "Owner's name", true],
  ["email", "email", "Owner's login email", true],
  ["phone", "phone", "Owner's phone (optional)", false],
];

// "--name Laila --slug laila-salon" -> { name: "Laila", slug: "laila-salon" }
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    args[key] = next !== undefined && !next.startsWith("--") ? argv[++i] : "";
  }
  return args;
}

// 16 random characters from a set without look-alikes (no 0/O, 1/l/I).
function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(crypto.randomBytes(16), (b) => chars[b % chars.length]).join("");
}

// Checks the input and fills in defaults. Returns the values or throws a readable error.
function prepare(args) {
  const values = {};
  for (const [flag, field, , required] of FIELDS) {
    const value = args[flag]?.trim();
    if (required && !value) throw new Error(`--${flag} is required`);
    if (value) values[field] = value;
  }

  values.slug = values.slug.toLowerCase();
  if (!SLUG_REGEX.test(values.slug) || values.slug.length < 3 || values.slug.length > 40) {
    throw new Error("--slug must be 3-40 characters: English lowercase letters, numbers and dashes (laila-salon)");
  }

  if (args.password) {
    if (args.password.length < 8) throw new Error("--password must be at least 8 characters");
    values.password = args.password;
    values.passwordGenerated = false;
  } else {
    values.password = generatePassword();
    values.passwordGenerated = true;
  }

  if (args.timezone) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: args.timezone });
    } catch {
      throw new Error(`--timezone "${args.timezone}" is not a valid time zone (e.g. Asia/Hebron, Asia/Riyadh)`);
    }
    values.timezone = args.timezone;
  }

  return values;
}

// Asks in the terminal for every required field that wasn't passed as a flag.
async function askMissing(args) {
  const missing = FIELDS.filter(([flag, , , required]) => required && !args[flag]?.trim());
  if (missing.length === 0 || !process.stdin.isTTY) return args;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (const [flag, , question] of missing) {
      args[flag] = (await rl.question(`${question}: `)).trim();
    }
  } finally {
    rl.close();
  }
  return args;
}

function printSummary({ tenant, owner }, values) {
  const configured = process.env.SINGLE_BUSINESS_SLUG?.trim().toLowerCase();

  console.log("\nClient set up ✅\n");
  console.log(`  Business:  ${tenant.name}  (slug: ${tenant.slug}, time zone: ${tenant.timezone})`);
  console.log(`  Owner:     ${owner.name}`);
  console.log(`  Login:     ${owner.email}`);
  console.log(
    `  Password:  ${values.password}${values.passwordGenerated ? "   <- generated, give it to the owner (shown only now)" : ""}`,
  );

  console.log("\nNext:");
  console.log(
    `  1. New Vercel project for this client with SINGLE_BUSINESS_SLUG=${tenant.slug} + the BRAND_* values (docs/INSTALL.md).`,
  );
  console.log("  2. Add the client's site URL to CLIENT_URL on the server (comma-separated list).");
  console.log(
    "  3. Log in as the owner and add: services, staff (at least one - customers book a staff member) and working hours.",
  );
  console.log("  4. Open the site and make a test booking.\n");

  // Only for a dedicated one-client server (SINGLE_BUSINESS_SLUG on the server itself).
  if (configured && configured !== tenant.slug) {
    console.log(
      `⚠️  This server's SINGLE_BUSINESS_SLUG is "${configured}", not "${tenant.slug}" - a dedicated server only serves that one business.\n`,
    );
  }
}

async function main() {
  const args = await askMissing(parseArgs(process.argv.slice(2)));

  let values;
  try {
    values = prepare(args);
  } catch (err) {
    console.error(`\n${err.message}\n`);
    console.error(
      'Usage: npm run setup-client -- --name "Laila Salon" --slug laila-salon --owner "Laila" --email laila@example.com',
    );
    console.error("Optional: --phone 0599123456 --password <8+ chars> --timezone Asia/Hebron\n");
    process.exitCode = 1;
    return;
  }

  // Same connection code as the server (connectDB exits the process if MongoDB can't be reached).
  await require("../src/config/db")();
  try {
    printSummary(await createBusinessWithOwner(values), values);
  } catch (err) {
    const details = err.errors
      ? Object.values(err.errors)
          .map((e) => `\n  - ${e.message}`)
          .join("")
      : "";
    console.error(`\nSetup failed: ${err.message}${details}\n`);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

// Only run when called from the terminal - tests import the functions above without running anything.
if (require.main === module) main();

module.exports = { parseArgs, prepare, generatePassword };
