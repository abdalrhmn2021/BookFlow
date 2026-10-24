// No database needed: the install-mode checks and the site middleware on their own.
const MODE_KEYS = ["SINGLE_BUSINESS_SLUG", "SHARED_SERVER", "SITE_PROXY_SECRET"];
const SECRET = "x".repeat(40);

// Load a fresh copy of the modules with exactly these env vars.
function load(env) {
  const saved = Object.fromEntries(MODE_KEYS.map((k) => [k, process.env[k]]));
  for (const k of MODE_KEYS) delete process.env[k];
  Object.assign(process.env, env);
  let mods;
  jest.isolateModules(() => {
    mods = { mode: require("../src/config/mode"), site: require("../src/middlewares/site.middleware") };
  });
  for (const k of MODE_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  return mods;
}

function run(site, headers = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const req = { ip: "10.0.0.1", get: (name) => lower[name.toLowerCase()] };
  site.identifySite(req, {}, () => {});
  return req;
}

describe("checkModeConfig", () => {
  test("platform and dedicated set-ups are fine", () => {
    expect(load({}).mode.checkModeConfig()).toEqual([]);
    expect(load({ SINGLE_BUSINESS_SLUG: "my-salon" }).mode.checkModeConfig()).toEqual([]);
    expect(load({ SHARED_SERVER: "true", SITE_PROXY_SECRET: SECRET }).mode.checkModeConfig()).toEqual([]);
  });

  test("a shared server without a secret, a short secret, or both modes at once is refused", () => {
    expect(load({ SHARED_SERVER: "true" }).mode.checkModeConfig()).toHaveLength(1);
    expect(load({ SITE_PROXY_SECRET: "short" }).mode.checkModeConfig()).toHaveLength(1);
    expect(
      load({
        SHARED_SERVER: "true",
        SITE_PROXY_SECRET: SECRET,
        SINGLE_BUSINESS_SLUG: "a-salon",
      }).mode.checkModeConfig(),
    ).toHaveLength(1);
  });
});

describe("identifySite", () => {
  const proxied = (slug, ip) => ({
    "x-bookflow-proxy-secret": SECRET,
    "x-bookflow-site": slug,
    "x-bookflow-client-ip": ip,
  });

  test("platform: no lock, and the server's own IP view", () => {
    const { site } = load({});
    const req = run(site);
    expect(req.siteLocked).toBe(false);
    expect(req.clientIp).toBe("10.0.0.1");
    expect(site.siteAllows(req, "anything")).toBe(true);
  });

  test("dedicated: locked to the .env slug whatever the headers say", () => {
    const { site } = load({ SINGLE_BUSINESS_SLUG: "My-Salon" });
    const req = run(site, { "x-bookflow-site": "other" });
    expect(req.siteSlug).toBe("my-salon");
    expect(site.siteAllows(req, "MY-SALON")).toBe(true);
    expect(site.siteAllows(req, "other")).toBe(false);
  });

  test("shared: trusts the site and IP only with the right secret", () => {
    const { site } = load({ SHARED_SERVER: "true", SITE_PROXY_SECRET: SECRET });

    const ok = run(site, proxied("Salon-A", "203.0.113.5"));
    expect(ok.siteSlug).toBe("salon-a");
    expect(ok.clientIp).toBe("203.0.113.5");

    const forged = run(site, { ...proxied("salon-a", "203.0.113.5"), "x-bookflow-proxy-secret": "guess" });
    expect(forged.siteLocked).toBe(true);
    expect(forged.siteSlug).toBeNull();
    expect(forged.clientIp).toBe("10.0.0.1");
    expect(site.siteAllows(forged, "salon-a")).toBe(false);
  });

  test("shared: junk in the headers is ignored", () => {
    const { site } = load({ SHARED_SERVER: "true", SITE_PROXY_SECRET: SECRET });
    const req = run(site, proxied("../salon a", "not-an-ip"));
    expect(req.siteSlug).toBeNull();
    expect(req.clientIp).toBe("10.0.0.1");
  });

  test("the secret also gives real visitor IPs on a platform server", () => {
    const { site } = load({ SITE_PROXY_SECRET: SECRET });
    const req = run(site, proxied(undefined, "2001:db8::1"));
    expect(req.siteLocked).toBe(false);
    expect(req.clientIp).toBe("2001:db8::1");
  });
});
