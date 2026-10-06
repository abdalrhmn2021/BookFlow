"use client";

// Who is logged in - shared with EVERY component through React Context,
// so the navbar, pages and guards all read the same user without passing props around.

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
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
  loading: boolean; // true while we ask the backend "is anyone logged in?" on first load
  login: (email: string, password: string) => Promise<User>;
  register: (data: RegisterData) => Promise<User>;
  registerBusiness: (data: RegisterBusinessData) => Promise<User>;
  logout: () => Promise<void>;
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

  // On first load (or page refresh): restore the session.
  // The token is in an httpOnly cookie that JavaScript can't see, so we can't
  // check "is there a token?" ourselves - we just ask /auth/me.
  // 401 = nobody logged in (or the token expired) -> stay logged out.
  useEffect(() => {
    const restoreSession = async () => {
      // One-time cleanup: tokens saved by the OLD version in localStorage aren't used anymore
      localStorage.removeItem("bookflow_token");
      try {
        await loadMe();
      } catch {
        setUser(null);
      }
    };
    // setLoading runs AFTER the async work (in a callback), not directly in the effect body
    restoreSession().finally(() => setLoading(false));
  }, [loadMe]);

  const login = async (email: string, password: string) => {
    await api.post("/auth/login", { email, password }); // the backend sets the cookie
    return loadMe();
  };

  const register = async (data: RegisterData) => {
    await api.post("/auth/register", data);
    return loadMe();
  };

  // Creates the business AND its owner account in one request (a transaction on the backend)
  const registerBusiness = async (data: RegisterBusinessData) => {
    await api.post("/auth/register-business", data);
    return loadMe();
  };

  const logout = async () => {
    // JavaScript can't delete an httpOnly cookie - the backend does it for us
    try {
      await api.post("/auth/logout");
    } finally {
      setUser(null); // even if the request failed, show the user as logged out
    }
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
