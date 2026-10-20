// Create a client's business + its owner account (used when setting up a new install).
//
//   npm run create-business -- --name "Al Ward Salon" --slug al-ward --owner "Ahmad" \
//     --email owner@alward.ps --password "a-strong-password" [--phone 0599123456] [--timezone Asia/Hebron]
//
// The password can also come from the OWNER_PASSWORD env var (keeps it out of shell history).

require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../src/config/db");
const Tenant = require("../src/models/Tenant");
const User = require("../src/models/User");

function readArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) args[argv[i].slice(2)] = argv[i + 1];
  }
  return args;
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  const input = {
    name: args.name?.trim(),
    slug: args.slug?.trim().toLowerCase(),
    owner: args.owner?.trim(),
    email: args.email?.trim().toLowerCase(),
    password: args.password ?? process.env.OWNER_PASSWORD,
    phone: args.phone?.trim(),
    timezone: args.timezone?.trim() || "Asia/Hebron",
  };

  const missing = ["name", "slug", "owner", "email", "password"].filter((k) => !input[k]);
  if (missing.length) {
    console.error(`Missing: ${missing.map((k) => `--${k}`).join(", ")}`);
    process.exitCode = 1;
    return;
  }
  if (!Intl.supportedValuesOf("timeZone").includes(input.timezone)) {
    console.error(`Unknown timezone: ${input.timezone}`);
    process.exitCode = 1;
    return;
  }

  await connectDB();
  if (await Tenant.exists({ slug: input.slug })) throw new Error(`The slug "${input.slug}" is already taken`);
  if (await User.exists({ email: input.email })) throw new Error(`The email ${input.email} already has an account`);

  // Not a transaction: this also works on a single local MongoDB. If the owner fails, the business is removed.
  const tenant = await Tenant.create({ name: input.name, slug: input.slug, timezone: input.timezone });
  try {
    await User.create({
      name: input.owner,
      email: input.email,
      password: input.password,
      phone: input.phone,
      role: "owner",
      tenantId: tenant._id,
    });
  } catch (err) {
    await Tenant.deleteOne({ _id: tenant._id });
    throw err;
  }

  console.log(`\nBusiness created ✅  ${input.name}\n`);
  console.log(`  Owner login:   ${input.email}`);
  console.log(`  Booking page:  /book/${input.slug}\n`);
  console.log("  Server env (Render):  SINGLE_BUSINESS_SLUG=" + input.slug);
  console.log("  Client env (Vercel):  NEXT_PUBLIC_BUSINESS_SLUG=" + input.slug);
  console.log(`                        NEXT_PUBLIC_BRAND_NAME=${input.name}`);
  console.log("                        NEXT_PUBLIC_DEMO_MODE=false\n");
  console.log("  Next: log in as the owner -> Dashboard -> add services, staff and working hours.\n");
}

main()
  .catch((err) => {
    console.error("Failed:", err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
