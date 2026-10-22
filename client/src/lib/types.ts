export type Role = "superadmin" | "owner" | "staff" | "customer";

export interface Business {
  id: string;
  name: string;
  slug: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  business: Business | null;
}

export type DayName = "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday";

export interface WorkingDay {
  day: DayName;
  isOpen: boolean;
  open?: string;
  close?: string;
}

export interface PublicService {
  id: string;
  name: string;
  description?: string;
  price: number;
  duration: number;
}

export interface PublicStaff {
  id: string;
  name: string;
}

export interface PublicBusinessPage {
  business: {
    name: string;
    slug: string;
    timezone: string;
    workingHours: WorkingDay[];
  };
  services: PublicService[];
  staff: PublicStaff[];
}

export interface Availability {
  date: string;
  isOpen: boolean;
  slots: string[];
}

export type AppointmentStatus = "pending" | "confirmed" | "completed" | "cancelled" | "no-show";

export interface MyAppointment {
  _id: string;
  tenantId: { _id: string; name: string; slug: string; timezone: string };
  staffId: { _id: string; name: string };
  serviceName: string;
  price: number;
  duration: number;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  notes?: string;
}

export interface GuestBookingResult {
  manageToken: string;
  appointment: {
    id: string;
    serviceName: string;
    staffName: string;
    price: number;
    duration: number;
    startTime: string;
    endTime: string;
    status: AppointmentStatus;
  };
}

export interface GuestBooking {
  business: { name: string; slug: string; timezone: string } | null;
  serviceName: string;
  staffName: string | null;
  price: number;
  duration: number;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  notes?: string;
  guestName?: string;
  guestPhone: string;
  canCancel: boolean;
  cancelDeadline: string;
  cancellation: { reason?: string; cancelledAt?: string; byGuest: boolean } | null;
}

export interface BusinessListItem {
  name: string;
  slug: string;
}

export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  plan: string;
  timezone: string;
  workingHours: WorkingDay[];
}

export interface Service {
  _id: string;
  name: string;
  description?: string;
  price: number;
  duration: number;
  isActive: boolean;
}

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone?: string;
  isActive: boolean;
}

export interface BusinessAppointment {
  _id: string;
  customerId?: { _id: string; name: string; phone?: string; email: string } | null;
  guest?: { name: string; phone: string };
  staffId: { _id: string; name: string };
  serviceName: string;
  price: number;
  duration: number;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  notes?: string;
  reminderSentAt?: string;
}

export interface NewBooking {
  _id: string;
  serviceName: string;
  startTime: string;
  status: AppointmentStatus;
  guest?: { name: string; phone: string };
  customerId?: { _id: string; name: string; phone?: string } | null;
  staffId: { _id: string; name: string };
  createdAt: string;
}

export interface NewBookingsResponse {
  now: string;
  appointments: NewBooking[];
}

export interface BusinessStats {
  date: string;
  today: { total: number; byStatus: Record<AppointmentStatus, number>; revenue: number };
  week: { date: string; count: number }[];
  toConfirm: number;
  next: BusinessAppointment | null;
}
