"use client";

// Who is logged in - shared with EVERY component through React Context,
// so the navbar, pages and guards all read the same user without passing props around.

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, ApiError, tokenStorage } from "@/lib/api";
import type { Role, User } from "@/lib/types";

interface RegisterData {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

interface RegisterBusinessData {
  businessName: string;
  slug: string;
  ownerName: string;
  email: string;
  password: string;
  phone?: string;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean; // true while we check the saved token on first load
  login: (email: string, password: string) => Promise<User>;
  register: (data: RegisterData) => Promise<User>;
  registerBusiness: (data: RegisterBusinessData) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Where each role lands after logging in
export function homeFor(role: Role): string {
  if (role === "owner" || role === "staff") return "/dashboard";
  if (role === "customer") return "/my-appointments";
  return "/";
}

// Login/register pages accept ?next=/book/al-ward -> "after logging in, go back there".
// NEVER redirect to whatever the URL says: /login?next=https://evil.com would send
// our user to a fake site right after they trusted us with their password ("open redirect").
// Only allow paths on OUR site: must start with "/" but not "//" or "/\"
// (browsers read both of those as "another website").
export function safeNext(next: string | null): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Ask the backend "who owns this token?".
  // /auth/me is the single source of truth: it also tells us if the account
  // was disabled, or the token expired, since the last visit.
  const loadMe = useCallback(async () => {
    const { user } = await api.get<{ user: User }>("/auth/me");
    setUser(user);
    return user;
  }, []);

  // On first load (or page refresh): if a token was saved, restore the session.
  // Why not read localStorage directly in useState(...)? The first render happens
  // on the SERVER too, where there is no localStorage -> server and browser HTML
  // would differ (hydration error). So we start with loading=true and check here.
  useEffect(() => {
    const restoreSession = async () => {
      if (!tokenStorage.get()) return; // never logged in on this browser
      try {
        await loadMe();
      } catch (err) {
        // 401/403 = token expired or account disabled -> forget it.
        // Anything else (e.g. server down) -> keep the token and try again next time.
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          tokenStorage.clear();
        }
      }
    };
    // setLoading runs AFTER the async work (in a callback), not directly in the effect body
    restoreSession().finally(() => setLoading(false));
  }, [loadMe]);

  const login = async (email: string, password: string) => {
    const { token } = await api.post<{ token: string }>("/auth/login", { email, password });
    tokenStorage.set(token);
    return loadMe();
  };

  const register = async (data: RegisterData) => {
    const { token } = await api.post<{ token: string }>("/auth/register", data);
    tokenStorage.set(token);
    return loadMe();
  };

  // Creates the business AND its owner account in one request (a transaction on the backend)
  const registerBusiness = async (data: RegisterBusinessData) => {
    const { token } = await api.post<{ token: string }>("/auth/register-business", data);
    tokenStorage.set(token);
    return loadMe();
  };

  const logout = () => {
    // A JWT can't be "cancelled" on the server - we just throw away our copy
    tokenStorage.clear();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, registerBusiness, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
