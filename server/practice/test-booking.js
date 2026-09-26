// Run (with the server running in another terminal):   node practice/test-booking.js
// Tests the whole booking flow against YOUR running API - no extension needed.
// Every run creates a brand-new salon/users, so you can run it as many times as you like.

const BASE = "http://localhost:5000/api";
const run = Date.now(); // makes emails and slug unique for this run

// Small helper around fetch: sends JSON, returns { status, body }
const call = async (method, url, body, token) => {
  const res = await fetch(BASE + url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

// The next Saturday that is at least 2 days away, as "YYYY-MM-DD"
const nextSaturday = () => {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};
const saturday = nextSaturday();
const friday = new Date(new Date(saturday).getTime() - 86400000)
  .toISOString()
  .slice(0, 10);

let passed = 0;
let total = 0;
const check = (label, res, expected) => {
  total++;
  const ok = res.status === expected;
  if (ok) passed++;
  const info = res.body.message || "";
  console.log(
    `${ok ? "✅" : "❌"} ${label.padEnd(42)} expected ${expected} got ${res.status}  ${info}`,
  );
  return res;
};

(async () => {
  console.log(`Booking day: Saturday ${saturday}\n`);

  // --- Setup: business + owner, a service, a staff member, a customer ---
  const biz = check(
    "register business",
    await call("POST", "/auth/register-business", {
      businessName: "Test Salon",
      slug: `salon-${run}`,
      ownerName: "Ahmad",
      email: `owner-${run}@test.com`,
      password: "secret123",
    }),
    201,
  );
  const ownerToken = biz.body.token;

  const svc = check(
    "owner creates service (30 min)",
    await call(
      "POST",
      "/services",
      { name: "Haircut", price: 30, duration: 30 },
      ownerToken,
    ),
    201,
  );
  const serviceId = svc.body.service?._id;

  const staff = check(
    "owner adds staff",
    await call(
      "POST",
      "/staff",
      { name: "Omar", email: `omar-${run}@test.com`, password: "temp1234" },
      ownerToken,
    ),
    201,
  );
  const staffId = staff.body.staff?.id;

  const cust = check(
    "customer registers",
    await call("POST", "/auth/register", {
      name: "Sara",
      email: `sara-${run}@test.com`,
      password: "secret123",
    }),
    201,
  );
  const customerToken = cust.body.token;

  // --- The real tests ---
  console.log("\n--- Booking ---");
  const book = (extra = {}, token = customerToken) =>
    call(
      "POST",
      "/appointments",
      {
        slug: `salon-${run}`,
        serviceId,
        staffId,
        date: saturday,
        time: "10:00",
        ...extra,
      },
      token,
    );

  const first = check("book 10:00", await book(), 201);
  check("same time again (taken)", await book(), 409);
  check("10:15 overlaps", await book({ time: "10:15" }), 409);
  check("09:45 overlaps from before", await book({ time: "09:45" }), 409);
  check(
    "10:30 starts exactly when 10:00 ends",
    await book({ time: "10:30" }),
    201,
  );
  check("friday (closed)", await book({ date: friday }), 400);
  check("16:45 ends after closing (17:00)", await book({ time: "16:45" }), 400);
  check("date in the past", await book({ date: "2025-01-04" }), 400);
  check("owner tries to book", await book({ time: "12:00" }, ownerToken), 403);
  check("wrong salon slug", await book({ slug: "no-such-salon" }), 404);

  if (first.body.appointment) {
    const a = first.body.appointment;
    console.log(`\nSaved in MongoDB (UTC):  ${a.startTime}  ->  ${a.endTime}`);
    console.log(
      `Snapshot: ${a.serviceName}, ${a.price} NIS, ${a.duration} min, status: ${a.status}`,
    );
  }
  console.log("\n--- My appointments ---");
  const mine = check(
    "customer lists my appointments",
    await call("GET", "/appointments/me", null, customerToken),
    200,
  );
  console.log(`Sara has ${mine.body.appointments.length} appointments`);

  console.log(`\n${passed}/${total} passed ${passed === total ? "🎉" : ""}`);
})().catch((err) => {
  console.error(
    "\n❌ Could not reach the API. Is the server running (npm run dev)?\n",
    err.message,
  );
});
