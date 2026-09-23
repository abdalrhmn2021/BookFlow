// Run:  node practice/check-overlap.js
const { isOverlapping } = require("../src/utils/time");

const t = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

// [A start, A end, B start, B end, expected, description]
const cases = [
  ["10:00", "11:00", "10:30", "11:30", true,  "B starts in the middle of A"],
  ["10:30", "11:30", "10:00", "11:00", true,  "B ends in the middle of A"],
  ["10:00", "12:00", "10:30", "11:00", true,  "B is completely inside A"],
  ["10:30", "11:00", "10:00", "12:00", true,  "A is completely inside B"],
  ["10:00", "11:00", "10:00", "11:00", true,  "exactly the same time"],
  ["10:00", "11:00", "11:00", "12:00", false, "B starts exactly when A ends"],
  ["11:00", "12:00", "10:00", "11:00", false, "A starts exactly when B ends"],
  ["09:00", "10:00", "13:00", "14:00", false, "far apart (B after A)"],
  ["13:00", "14:00", "09:00", "10:00", false, "far apart (B before A)"],
];

let passed = 0;
for (const [as, ae, bs, be, expected, desc] of cases) {
  const result = isOverlapping(t(as), t(ae), t(bs), t(be));
  const ok = result === expected;
  if (ok) passed++;
  console.log(
    `${ok ? "✅" : "❌"} A ${as}-${ae}  B ${bs}-${be}  expected ${String(expected).padEnd(5)} got ${String(result).padEnd(9)} ${desc}`
  );
}
console.log(`\n${passed}/${cases.length} passed ${passed === cases.length ? "🎉 Great job!" : ""}`);
