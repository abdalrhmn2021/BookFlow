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
    if (url.origin !== NEXT_BASE) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}
