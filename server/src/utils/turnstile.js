// Cloudflare Turnstile: a free, mostly invisible "are you a person?" check for the guest booking
// form, against scripts that fill a calendar with fake bookings.
// Off until TURNSTILE_SECRET_KEY is set on the server (and NEXT_PUBLIC_TURNSTILE_SITE_KEY on the
// client sites) - see docs/INSTALL.md. When on, a booking without a valid token is refused.
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const isTurnstileOn = () => Boolean(process.env.TURNSTILE_SECRET_KEY?.trim());

async function verifyWithCloudflare(token, ip) {
  const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY.trim(), response: token });
  if (ip) body.set("remoteip", ip);
  const res = await fetch(VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(5000) });
  const data = await res.json().catch(() => ({}));
  return data.success === true;
}

// Tests swap the checker so nothing leaves the machine.
let verify = verifyWithCloudflare;
const setTurnstileVerifierForTests = (fn) => {
  verify = fn || verifyWithCloudflare;
};

// true = let the booking through. With Turnstile on, a missing token, a wrong one, or Cloudflare
// not answering all mean "no" (a check that fails open would stop nothing).
async function passesTurnstile(token, ip) {
  if (!isTurnstileOn()) return true;
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  try {
    return await verify(token, ip);
  } catch {
    return false;
  }
}

module.exports = { isTurnstileOn, passesTurnstile, setTurnstileVerifierForTests };
