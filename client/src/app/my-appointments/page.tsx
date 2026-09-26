"use client";

import RequireAuth from "@/components/RequireAuth";
import { useAuth } from "@/context/AuthContext";

// Placeholder - the real list (with cancel button) comes next
export default function MyAppointmentsPage() {
  return (
    <RequireAuth roles={["customer"]}>
      <Content />
    </RequireAuth>
  );
}

function Content() {
  const { user } = useAuth();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">My appointments</h1>
      <p className="mt-1 text-gray-500">Hi {user?.name}, your bookings will show up here.</p>
    </div>
  );
}
