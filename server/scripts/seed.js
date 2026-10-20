// Demo data: "Demo Salon" (English) and "صالون الورد" (Arabic client-edition demo).
//
//   npm run seed                      create the demos that don't exist yet
//   npm run seed -- --reset           delete and recreate them (fresh dates)
//   npm run seed -- --reset --only al-ward
//
// On the live server, DEMO_REFRESH=true does the same automatically once a day.

require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../src/config/db");
const { DEMOS, DEMO_PASSWORD, refreshDemos, seedDemo } = require("../src/demo/demoData");

(async () => {
  const args = process.argv.slice(2);
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined;
  const demos = DEMOS.filter((d) => !only || d.slug === only);
  if (!demos.length) {
    console.error(`Unknown demo "${only}". Available: ${DEMOS.map((d) => d.slug).join(", ")}`);
    process.exitCode = 1;
    return;
  }

  await connectDB();
  try {
    if (args.includes("--reset")) {
      await refreshDemos({ force: true, only });
    } else {
      for (const demo of demos) {
        if (!(await seedDemo(demo))) {
          console.log(`"${demo.slug}" (or one of its emails) already exists - skipped. Use --reset to recreate it.`);
        }
      }
    }

    console.log(`\nPassword for every demo account: ${DEMO_PASSWORD}`);
    for (const demo of demos) {
      console.log(`\n  ${demo.name}  ->  /book/${demo.slug}`);
      console.log(`    owner     ${demo.owner.email}`);
      demo.staff.forEach((s) => console.log(`    staff     ${s.email}`));
      console.log(`    customer  ${demo.customers[0].email}`);
    }
    console.log("");
  } catch (err) {
    console.error("Seed failed:", err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
