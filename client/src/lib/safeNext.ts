// Where to go after logging in (?next=...). Only a page of THIS site:
//  - control characters (tab, new line...) and backslashes are refused first, because browsers
//    silently drop or convert them - "/<tab>/evil.com" would become "//evil.com", another site;
//  - then the value is parsed as a real URL and must stay on our own origin.
// Its own file (not in AuthContext) so tests can load it without React (lib/safeNext.test.ts).
const NEXT_BASE = "http://this-site.invalid";

export function safeNext(next: string | null): string | null {
  if (!next || !next.startsWith("/") || /[\u0000-\u001F\u007F\\]/.test(next)) return null;
  try {
    const url = new URL(next, NEXT_BASE);
    // "/.//evil.com" or "/a/..//evil.com" stay on our origin while parsing, but the path left is
    // "//evil.com" - which the router opens as ANOTHER site (security review M-1).
    if (url.origin !== NEXT_BASE || url.pathname.startsWith("//")) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}
