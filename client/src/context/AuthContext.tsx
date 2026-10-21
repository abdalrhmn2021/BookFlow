"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useBrand } from "@/context/BrandContext";
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
  login: (email: string, password: string) => Promise<User>;
  register: (data: RegisterData) => Promise<User>;
  registerBusiness: (data: RegisterBusinessData) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const OTHER_BUSINESS_ERROR = "This account belongs to another business";

export function homeFor(role: Role): string {
  if (role === "owner" || role === "staff") return "/dashboard";
  if (role === "customer") return "/my-appointments";
  return "/";
}

export function safeNext(next: string | null): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const { singleBusinessSlug } = useBrand();

  const loadMe = useCallback(async () => {
    const { user } = await api.get<{ user: User }>("/auth/me");
    // One shared server holds all your clients' businesses. On a client's own site, an owner
    // or staff account of ANOTHER business is logged straight out again.
    const otherBusiness =
      singleBusinessSlug &&
      (user.role === "owner" || user.role === "staff") &&
      user.business?.slug !== singleBusinessSlug;
    if (otherBusiness) {
      await api.post("/auth/logout").catch(() => {});
      setUser(null);
      throw new ApiError(403, OTHER_BUSINESS_ERROR);
    }
    setUser(user);
    return user;
  }, [singleBusinessSlug]);

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

  const login = async (email: string, password: string) => {
    await api.post("/auth/login", { email, password });
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
