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

// ---------- Public booking page ----------

export type DayName =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

// One row of the weekly schedule. open/close only exist on open days.
export interface WorkingDay {
  day: DayName;
  isOpen: boolean;
  open?: string; //  "09:00"
  close?: string; // "17:00"
}

export interface PublicService {
  id: string;
  name: string;
  description?: string;
  price: number;
  duration: number; // minutes
}

export interface PublicStaff {
  id: string;
  name: string;
}

// What GET /api/public/businesses/:slug returns
export interface PublicBusinessPage {
  business: {
    name: string;
    slug: string;
    timezone: string; // e.g. "Asia/Hebron" - every date/time on the page is in THIS zone
    workingHours: WorkingDay[];
  };
  services: PublicService[];
  staff: PublicStaff[];
}

// What GET /api/public/businesses/:slug/availability returns
export interface Availability {
  date: string; //   "2026-10-03"
  isOpen: boolean; // false -> the business is closed that day (slots is empty)
  slots: string[]; // free start times: ["09:00", "09:15", ...]
}

// ---------- Customer: my appointments ----------

export type AppointmentStatus = "pending" | "confirmed" | "completed" | "cancelled" | "no-show";

// What GET /api/appointments/me returns (one item).
// tenantId / staffId are "populated" by the backend: the id is replaced by a small object.
export interface MyAppointment {
  _id: string;
  tenantId: { _id: string; name: string; slug: string; timezone: string };
  staffId: { _id: string; name: string };
  serviceName: string; // snapshot at booking time - stays the same even if the service changes
  price: number;
  duration: number;
  startTime: string; // ISO date from JSON, e.g. "2026-10-03T07:30:00.000Z" (UTC)
  endTime: string;
  status: AppointmentStatus;
  notes?: string;
}

// What GET /api/public/businesses returns (one item)
export interface BusinessListItem {
  name: string;
  slug: string;
}

// ---------- Business dashboard ----------

// GET /api/tenants/me
export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  plan: string;
  timezone: string;
  workingHours: WorkingDay[];
}

// GET /api/services (full documents, including hidden ones)
export interface Service {
  _id: string;
  name: string;
  description?: string;
  price: number;
  duration: number;
  isActive: boolean; // false = hidden from the booking page ("soft delete")
}

// GET /api/staff (the backend's toStaffDTO - note: `id`, not `_id`)
export interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone?: string;
  isActive: boolean;
}

// GET /api/appointments/business
export interface BusinessAppointment {
  _id: string;
  customerId: { _id: string; name: string; phone?: string; email: string } | null; // null if the account was deleted
  staffId: { _id: string; name: string };
  serviceName: string;
  price: number;
  duration: number;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  notes?: string;
}
