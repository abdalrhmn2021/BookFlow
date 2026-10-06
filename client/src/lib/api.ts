// ONE place that talks to the backend.
// Every page calls api.get / api.post ... instead of writing fetch() by hand, so:
//   - all requests go to /api on OUR domain (next.config.ts forwards them to Express)
//   - the login token travels in an httpOnly cookie - the browser sends it by itself
//   - errors always have the same shape (ApiError)

// Same domain as the page -> next.config.ts rewrites /api/* to the Express server.
const BASE_URL = "/api";

// ---------- Where is the token? ----------
// NOT here. The backend puts the JWT in an httpOnly cookie on login:
// JavaScript (ours, or an attacker's injected script - XSS) can never read it,
// and the browser attaches it to every request to /api automatically.
// (Before, it lived in localStorage, where any script on the page could steal it.)

// ---------- Errors ----------
// Our backend always answers errors as { message, errors? }.
// We turn them into a real Error, so pages can simply try/catch.
export class ApiError extends Error {
  status: number;
  errors?: string[]; // validation details, e.g. ["Password must be at least 8 characters"]

  constructor(status: number, message: string, errors?: string[]) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

// ---------- The core request function ----------
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined && { "Content-Type": "application/json" }),
      },
      credentials: "same-origin", // send our cookies (the token) - same domain only
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    // fetch only throws when there is NO response at all (server down, no internet, CORS blocked)
    throw new ApiError(0, "Can't reach the server. Is the backend running?");
  }

  // Some responses may have no body - don't crash on res.json()
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(res.status, data.message ?? "Something went wrong", data.errors);
  }
  return data as T;
}

// <T> = "tell me what this endpoint returns", e.g. api.get<{ user: User }>("/auth/me")
export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};

// Turn any caught error into a message we can show the user.
// `translate` lets the caller swap each English message for another language
// (pages use tError() from useLanguage(), which passes the dictionary here).
export function errorMessage(err: unknown, translate: (msg: string) => string = (msg) => msg): string {
  if (err instanceof ApiError) {
    return err.errors?.length ? err.errors.map(translate).join(" · ") : translate(err.message);
  }
  return translate("Something went wrong");
}
