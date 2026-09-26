// Shapes of the data the backend sends us.
// If the backend response changes, TypeScript points at every place that breaks.

export type Role = "superadmin" | "owner" | "staff" | "customer";

export interface Business {
  id: string;
  name: string;
  slug: string;
}

// What GET /api/auth/me returns
export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  business: Business | null; // owner/staff only
}
