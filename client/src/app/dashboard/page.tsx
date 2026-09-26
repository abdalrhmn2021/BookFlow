"use client";

import RequireAuth from "@/components/RequireAuth";
import { useAuth } from "@/context/AuthContext";

// Placeholder - the real dashboard (today's schedule, services, staff, hours) comes next
export default function DashboardPage() {
  return (
    <RequireAuth roles={["owner", "staff"]}>
      <DashboardContent />
    </RequireAuth>
  );
}

function DashboardContent() {
  const { user } = useAuth();
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold">{user?.business?.name}</h1>
      <p className="mt-1 text-gray-500">
        Welcome, {user?.name} ({user?.role})
      </p>
      <p className="mt-6 text-sm text-gray-600">
        Public booking page: <code className="rounded bg-gray-100 px-1.5 py-0.5">/book/{user?.business?.slug}</code>
      </p>
    </div>
  );
}
