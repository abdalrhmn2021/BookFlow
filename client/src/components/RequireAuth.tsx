"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { homeFor, useAuth } from "@/context/AuthContext";
import type { Role } from "@/lib/types";
import Loading from "./Loading";

// UX only: hides pages a role can't use. The API enforces permissions itself.
export default function RequireAuth({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  const allowed = !!user && roles.includes(user.role);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (!roles.includes(user.role)) router.replace(homeFor(user.role));
  }, [loading, user, roles, router]);

  if (loading || !allowed) {
    return <Loading />;
  }
  return <>{children}</>;
}
