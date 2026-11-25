"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { BUSINESS_ROLES, type Role, type User } from "@/lib/types";

interface RegisterData {
  name: string;
  email: string;
  password: string;
  phone?: string;
  captchaToken?: string;
}

interface RegisterBusinessData {
  businessName: string;
  slug: string;
  ownerName: string;
  email: string;
  password: string;
  phone?: string;
  captchaToken?: string;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, code?: string) => Promise<User>;
  // null = the account was made, but the 6-digit code from the email must be typed first
  // (verifyEmail) - the server's email verification is on.
  register: (data: RegisterData) => Promise<User | null>;
  registerBusiness: (data: RegisterBusinessData) => Promise<User | null>;
  // The code from the "confirm your email" email: confirmed, then logged in.
  verifyEmail: (email: string, code: string) => Promise<User>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  // The 6-digit code from the "forgot password" email.
  // null = the password was changed, but two-step login is on: log in normally (password + app code).
  resetPassword: (email: string, code: string, password: string) => Promise<User | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function homeFor(role: Role): string {
  if (BUSINESS_ROLES.includes(role)) return "/dashboard";
  if (role === "customer") return "/my-appointments";
  if (role === "superadmin") return "/admin";
  return "/";
}

// Kept here too, so pages keep importing it from the auth context.
export { safeNext } from "@/lib/safeNext";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    const { user } = await api.get<{ user: User }>("/auth/me");
    setUser(user);
    return user;
  }, []);

  // On page load (and when Back shows a cached page): who is logged in, if anyone. /auth/session
  // answers { user: null } for a visitor with no login, where /auth/me would answer 401 - an error
  // in the console on every page of every logged-out visitor.
  const loadSession = useCallback(async () => {
    const { user } = await api.get<{ user: User | null }>("/auth/session");
    setUser(user);
  }, []);

  useEffect(() => {
    const restoreSession = async () => {
      localStorage.removeItem("bookflow_token");
      try {
        await loadSession();
      } catch {
        setUser(null);
      }
    };
    restoreSession().finally(() => setLoading(false));
  }, [loadSession]);

  // Back/forward cache: after logging out, the browser's Back button can show an earlier page
  // exactly as it was - still "logged in" on screen, though the server already refuses that login.
  // Whenever a page comes back that way, ask the server again who is logged in.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) loadSession().catch(() => setUser(null));
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [loadSession]);

  const login = async (email: string, password: string, code?: string) => {
    await api.post("/auth/login", { email, password, ...(code && { code }) });
    return loadMe();
  };

  const register = async (data: RegisterData) => {
    const res = await api.post<{ verificationRequired?: boolean }>("/auth/register", data);
    if (res.verificationRequired) return null;
    return loadMe();
  };

  const registerBusiness = async (data: RegisterBusinessData) => {
    const res = await api.post<{ verificationRequired?: boolean }>("/auth/register-business", data);
    if (res.verificationRequired) return null;
    return loadMe();
  };

  const verifyEmail = async (email: string, code: string) => {
    await api.post("/auth/verify-email", { email, code });
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
  const resetPassword = async (email: string, code: string, password: string) => {
    const res = await api.post<{ twoFactorRequired?: boolean }>("/auth/reset-password", { email, code, password });
    if (res.twoFactorRequired) return null;
    return loadMe();
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, registerBusiness, verifyEmail, logout, changePassword, resetPassword }}
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
