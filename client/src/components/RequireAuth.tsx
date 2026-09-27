"use client";

// Wrap a page with this to allow only certain roles:
//   <RequireAuth roles={["owner", "staff"]}> ...page... </RequireAuth>
//
// IMPORTANT: this is for USER EXPERIENCE only (don't show a page you can't use).
// The REAL protection is the backend: protect + restrictTo reject the API calls anyway.
// Anyone can edit JavaScript in their browser - never trust the frontend for security.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { homeFor, useAuth } from "@/context/AuthContext";
import type { Role } from "@/lib/types";
import Loading from "./Loading";

export default function RequireAuth({
  roles,
  children,
}: {
  roles: Role[];
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  const allowed = !!user && roles.includes(user.role);

  useEffect(() => {
    if (loading) return; // still checking the saved token - don't redirect yet!
    if (!user) router.replace("/login");
    else if (!roles.includes(user.role)) router.replace(homeFor(user.role)); // wrong role -> their own home
  }, [loading, user, roles, router]);

  if (loading || !allowed) {
    return <Loading />;
  }
  return <>{children}</>;
}
