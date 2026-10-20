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
  login: (email: string, password: string) => Promise<User>;
  register: (data: RegisterData) => Promise<User>;
  registerBusiness: (data: RegisterBusinessData) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

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
