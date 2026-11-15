"use client";

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
  loading: boolean;
  login: (email: string, password: string, code?: string) => Promise<User>;
  register: (data: RegisterData) => Promise<User>;
  registerBusiness: (data: RegisterBusinessData) => Promise<User>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  // null = the password was changed, but two-step login is on: log in normally (password + code).
  resetPassword: (token: string, password: string) => Promise<User | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function homeFor(role: Role): string {
  if (role === "owner" || role === "staff") return "/dashboard";
  if (role === "customer") return "/my-appointments";
  if (role === "superadmin") return "/admin";
  return "/";
}

// Where to go after logging in (?next=...). Only a page of THIS site:
//  - control characters (tab, new line...) and backslashes are refused first, because browsers
//    silently drop or convert them - "/<tab>/evil.com" would become "//evil.com", another site;
//  - then the value is parsed as a real URL and must stay on our own origin.
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    const { user } = await api.get<{ user: User }>("/auth/me");
    setUser(user);
    return user;
  }, []);

  useEffect(() => {
    const restoreSession = async () => {
      localStorage.removeItem("bookflow_token");
      try {
        await loadMe();
      } catch {
        setUser(null);
      }
    };
    restoreSession().finally(() => setLoading(false));
  }, [loadMe]);

  const login = async (email: string, password: string, code?: string) => {
    await api.post("/auth/login", { email, password, ...(code && { code }) });
    return loadMe();
  };

  const register = async (data: RegisterData) => {
    await api.post("/auth/register", data);
    return loadMe();
  };

  const registerBusiness = async (data: RegisterBusinessData) => {
    await api.post("/auth/register-business", data);
    return loadMe();
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      setUser(null);
    }
  };

  // The server answers with a fresh login cookie, so this device stays logged in.
  const changePassword = async (currentPassword: string, newPassword: string) => {
    await api.patch("/auth/password", { currentPassword, newPassword });
  };

  // The link from the email: new password, then logged in.
  const resetPassword = async (token: string, password: string) => {
    const res = await api.post<{ twoFactorRequired?: boolean }>("/auth/reset-password", { token, password });
    if (res.twoFactorRequired) return null;
    return loadMe();
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, registerBusiness, logout, changePassword, resetPassword }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
