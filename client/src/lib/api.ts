// ONE place that talks to the backend.
// Every page calls api.get / api.post ... instead of writing fetch() by hand, so:
//   - the base URL lives in one place (.env.local)
//   - the token is attached automatically
//   - errors always have the same shape (ApiError)

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";
const TOKEN_KEY = "bookflow_token";

// ---------- Token storage ----------
// We keep the JWT in localStorage: simple, and survives a page refresh.
// Trade-off: any JavaScript on the page can read it (XSS risk).
// The safer option is an httpOnly cookie set by the backend - a later upgrade.
// `typeof window` check: this code can also run on the server, where localStorage doesn't exist.
export const tokenStorage = {
  get: () => (typeof window === "undefined" ? null : localStorage.getItem(TOKEN_KEY)),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

// ---------- Errors ----------
// Our backend always answers errors as { message, errors? }.
// We turn them into a real Error, so pages can simply try/catch.
export class ApiError extends Error {
  status: number;
  errors?: string[]; // validation details, e.g. ["Password must be at least 6 characters"]

  constructor(status: number, message: string, errors?: string[]) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

// ---------- The core request function ----------
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = tokenStorage.get();

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined && { "Content-Type": "application/json" }),
        ...(token && { Authorization: `Bearer ${token}` }),
      },
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
