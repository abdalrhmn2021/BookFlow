// Run (with the server running):   node practice/test-race.js
// Fires 10 booking requests for the SAME staff member at the SAME time - all at once.
// Correct result: exactly 1 succeeds (201), the other 9 get 409.

const BASE = "http://localhost:5000/api";
const run = Date.now();
const PARALLEL = 10;

const call = async (method, url, body, token) => {
  const res = await fetch(BASE + url, {
    method,
    headers: { "Content-Type": "application/json", ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const nextSaturday = () => {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
  return ymd(d);
};

(async () => {
  // Setup (same as test-booking.js)
  const biz = await call("POST", "/auth/register-business", {
    businessName: "Race Salon", slug: `race-${run}`, ownerName: "A",
    email: `race-owner-${run}@test.com`, password: "secret123",
  });
  if (biz.status !== 201) return console.log("Setup failed:", biz.status, biz.body.message);
  const owner = biz.body.token;
  const service = (await call("POST", "/services", { name: "Haircut", price: 30, duration: 30 }, owner)).body.service;
  const staff = (await call("POST", "/staff", { name: "Omar", email: `race-omar-${run}@test.com`, password: "temp1234" }, owner)).body.staff;
  const cust = await call("POST", "/auth/register", { name: "C", email: `race-c-${run}@test.com`, password: "secret123" });
  if (cust.status !== 201) return console.log("Setup failed:", cust.status, cust.body.message);

  const body = { slug: `race-${run}`, serviceId: service._id, staffId: staff.id, date: nextSaturday(), time: "10:00" };

  // The important part: Promise.all sends all requests AT THE SAME TIME
  // (the other test used `await` one by one - each waited for the previous)
  console.log(`Sending ${PARALLEL} bookings for the same slot at the same moment...\n`);
  const results = await Promise.all(
    Array.from({ length: PARALLEL }, () => call("POST", "/appointments", body, cust.body.token))
  );

  const created = results.filter((r) => r.status === 201).length;
  const rejected = results.filter((r) => r.status === 409).length;
  console.log(`201 (booked):   ${created}`);
  console.log(`409 (rejected): ${rejected}`);
  const other = results.filter((r) => r.status !== 201 && r.status !== 409);
  if (other.length) console.log("other:", other.map((r) => `${r.status} ${r.body.message}`));

  console.log(
    created === 1
      ? "\n✅ Safe: only ONE booking got through."
      : `\n❌ RACE CONDITION: Omar was booked ${created} times for the same slot!`
  );
})().catch((err) => console.error("❌ Could not reach the API. Is the server running?\n", err.message));
