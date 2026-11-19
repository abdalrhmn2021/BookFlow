"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/i18n/LanguageContext";
import { api } from "@/lib/api";
import { btnPrimary, btnSecondary, errorBox, inputClass } from "@/lib/ui";
import { formatLongDate, todayIn } from "@/lib/format";
import type { StaffMember, TenantInfo } from "@/lib/types";
import StaffScheduleForm from "./StaffScheduleForm";

type TeamRole = "staff" | "receptionist";

interface StaffInput {
  name: string;
  phone?: string;
  email?: string;
  password?: string;
  role?: TeamRole; // new members only
}

export default function StaffTab({ tenant }: { tenant: TenantInfo }) {
  const { t, tError } = useLanguage();
  const st = t.dashboard.staff;

  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; err: unknown } | null>(null);

  useEffect(() => {
    let ignore = false;
    api
      .get<{ staff: StaffMember[] }>("/staff")
      .then((data) => {
        if (!ignore) setStaff(data.staff);
      })
      .catch((err) => {
        if (!ignore) setLoadError(err);
      });
    return () => {
      ignore = true;
    };
  }, []);

  const save = async (data: StaffInput, id?: string) => {
    if (id) {
      const { staff: updated } = await api.patch<{ staff: StaffMember }>(`/staff/${id}`, {
        name: data.name,
        phone: data.phone,
      });
      setStaff((prev) => prev?.map((s) => (s.id === id ? updated : s)) ?? null);
    } else {
      const { staff: created } = await api.post<{ staff: StaffMember }>("/staff", data);
      setStaff((prev) => [created, ...(prev ?? [])]);
    }
    setEditing(null);
  };

  const toggleActive = async (s: StaffMember) => {
    setRowError(null);
    setBusyId(s.id);
    try {
      const { staff: updated } = s.isActive
        ? await api.delete<{ staff: StaffMember }>(`/staff/${s.id}`)
        : await api.patch<{ staff: StaffMember }>(`/staff/${s.id}`, { isActive: true });
      setStaff((prev) => prev?.map((x) => (x.id === s.id ? updated : x)) ?? null);
    } catch (err) {
      setRowError({ id: s.id, err });
    } finally {
      setBusyId(null);
    }
  };

  // The owner's own row: "I take bookings too" on / off.
  const toggleBookable = async (s: StaffMember) => {
    setRowError(null);
    setBusyId(s.id);
    try {
      const { staff: updated } = await api.patch<{ staff: StaffMember }>(`/staff/${s.id}`, { bookable: !s.bookable });
      setStaff((prev) => prev?.map((x) => (x.id === s.id ? updated : x)) ?? null);
    } catch (err) {
      setRowError({ id: s.id, err });
    } finally {
      setBusyId(null);
    }
  };

  if (loadError) return <p className={errorBox}>{tError(loadError)}</p>;
  if (!staff) return <p className="text-sm text-ink-500">{t.common.loading}</p>;

  // Customers need at least one active staff member, or the owner taking bookings
  // (a receptionist doesn't count: nobody books them).
  const nobodyBookable =
    editing !== "new" && !staff.some((s) => (s.role === "owner" ? s.bookable : s.role === "staff" && s.isActive));

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-ink-500">{st.hint}</p>
        {editing !== "new" && (
          <button onClick={() => setEditing("new")} className={`shrink-0 ${btnPrimary}`}>
            {st.add}
          </button>
        )}
      </div>

      {editing === "new" && (
        <div className="mt-4">
          <StaffForm onSave={(data) => save(data)} onCancel={() => setEditing(null)} />
        </div>
      )}

      <ul className="mt-4 space-y-3">
        {staff.map((s) =>
          editing === `schedule:${s.id}` ? (
            <li key={s.id}>
              <StaffScheduleForm
                staff={s}
                tenant={tenant}
                onSaved={(updated) => {
                  setStaff((prev) => prev?.map((x) => (x.id === s.id ? updated : x)) ?? null);
                  setEditing(null);
                }}
                onCancel={() => setEditing(null)}
              />
            </li>
          ) : editing === s.id ? (
            <li key={s.id}>
              <StaffForm initial={s} onSave={(data) => save(data, s.id)} onCancel={() => setEditing(null)} />
            </li>
          ) : s.role === "owner" ? (
            <OwnerRow
              key={s.id}
              owner={s}
              tenant={tenant}
              busy={busyId === s.id}
              error={rowError?.id === s.id ? rowError.err : null}
              onToggle={() => toggleBookable(s)}
              onSchedule={() => setEditing(`schedule:${s.id}`)}
              onEdit={() => setEditing(s.id)}
            />
          ) : (
            <li
              key={s.id}
              className={`rounded-xl border border-ink-100 bg-white p-4 ${s.isActive ? "" : "opacity-60"}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700">
                    {s.name.charAt(0).toUpperCase()}
                  </span>
                  <div>
                    <p className="font-semibold">
                      {s.name}
                      {s.role === "receptionist" && (
                        <span className="ms-2 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
                          {t.roles.receptionist}
                        </span>
                      )}
                      {!s.isActive && (
                        <span className="ms-2 rounded-full bg-ink-50 px-2 py-0.5 text-xs font-medium text-ink-500">
                          {st.inactive}
                        </span>
                      )}
                    </p>
                    <p dir="ltr" className="text-sm text-ink-500 rtl:text-right">
                      {s.email}
                      {s.phone && ` · ${s.phone}`}
                    </p>
                    {s.role === "receptionist" ? (
                      <p className="mt-0.5 text-xs text-ink-400">{st.receptionistInfo}</p>
                    ) : (
                      <ScheduleSummary staff={s} tenant={tenant} />
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {s.role === "staff" && (
                    <button onClick={() => setEditing(`schedule:${s.id}`)} className={btnSecondary}>
                      {st.schedule}
                    </button>
                  )}
                  <button onClick={() => setEditing(s.id)} className={btnSecondary}>
                    {t.common.edit}
                  </button>
                  <button onClick={() => toggleActive(s)} disabled={busyId === s.id} className={btnSecondary}>
                    {s.isActive ? st.deactivate : st.reactivate}
                  </button>
                </div>
              </div>
              {rowError?.id === s.id && <p className={`mt-2 ${errorBox}`}>{tError(rowError.err)}</p>}
            </li>
          ),
        )}
      </ul>

      {!nobodyBookable ? null : (
        <p className="mt-3 rounded-lg border border-dashed border-ink-200 bg-white px-4 py-8 text-center text-sm text-ink-500">
          {st.empty}
        </p>
      )}
    </div>
  );
}

// The owner's own card: not deactivatable, and bookable only after "I take bookings too".
function OwnerRow({
  owner,
  tenant,
  busy,
  error,
  onToggle,
  onSchedule,
  onEdit,
}: {
  owner: StaffMember;
  tenant: TenantInfo;
  busy: boolean;
  error: unknown;
  onToggle: () => void;
  onSchedule: () => void;
  onEdit: () => void;
}) {
  const { t, tError } = useLanguage();
  const st = t.dashboard.staff;

  return (
    <li className="rounded-xl border border-brand-200 bg-brand-50/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 font-bold text-white">
            {owner.name.charAt(0).toUpperCase()}
          </span>
          <div>
            <p className="font-semibold">
              {owner.name}
              <span className="ms-2 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">
                {st.you}
              </span>
            </p>
            <p dir="ltr" className="text-sm text-ink-500 rtl:text-right">
              {owner.email}
              {owner.phone && ` · ${owner.phone}`}
            </p>
            {owner.bookable ? (
              <ScheduleSummary staff={owner} tenant={tenant} />
            ) : (
              <p className="mt-0.5 text-xs text-ink-400">{st.ownerOff}</p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {owner.bookable && (
            <button onClick={onSchedule} className={btnSecondary}>
              {st.schedule}
            </button>
          )}
          <button onClick={onEdit} className={btnSecondary}>
            {t.common.edit}
          </button>
          <button onClick={onToggle} disabled={busy} className={owner.bookable ? btnSecondary : btnPrimary}>
            {owner.bookable ? st.stopBookings : st.takeBookings}
          </button>
        </div>
      </div>
      {Boolean(error) && <p className={`mt-2 ${errorBox}`}>{tError(error)}</p>}
    </li>
  );
}

function StaffForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: StaffMember;
  onSave: (data: StaffInput) => Promise<void>;
  onCancel: () => void;
}) {
  const { t, tError } = useLanguage();
  const st = t.dashboard.staff;
  const isEdit = !!initial;

  const [form, setForm] = useState({ name: initial?.name ?? "", phone: initial?.phone ?? "", email: "", password: "" });
  const [role, setRole] = useState<TeamRole>("staff");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await onSave(
        isEdit
          ? { name: form.name.trim(), phone: form.phone.trim() }
          : {
              name: form.name.trim(),
              phone: form.phone.trim() || undefined,
              email: form.email,
              password: form.password,
              role,
            },
      );
    } catch (err) {
      setError(tError(err));
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-ink-200 bg-ink-50 p-4">
      {!isEdit && (
        <fieldset className="mb-4">
          <legend className="text-sm font-medium">{st.role}</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {(["staff", "receptionist"] as const).map((r) => (
              <label
                key={r}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition ${
                  role === r
                    ? "border-brand-500 bg-white ring-2 ring-brand-100"
                    : "border-ink-200 bg-white hover:border-ink-300"
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value={r}
                  checked={role === r}
                  onChange={() => setRole(r)}
                  className="accent-brand-600"
                />
                {r === "staff" ? st.roleStaff : st.roleReceptionist}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium">{st.name}</span>
          <input name="name" required value={form.name} onChange={handleChange} className={inputClass} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">
            {st.phone} <span className="text-ink-400">{t.common.optional}</span>
          </span>
          <input name="phone" type="tel" dir="ltr" value={form.phone} onChange={handleChange} className={inputClass} />
        </label>
        {!isEdit && (
          <>
            <label className="block">
              <span className="text-sm font-medium">{st.email}</span>
              <input
                name="email"
                type="email"
                required
                dir="ltr"
                autoComplete="off"
                value={form.email}
                onChange={handleChange}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">{st.password}</span>
              <input
                name="password"
                type="password"
                required
                minLength={8}
                dir="ltr"
                autoComplete="new-password"
                value={form.password}
                onChange={handleChange}
                className={inputClass}
              />
            </label>
          </>
        )}
      </div>
      {error && <p className={`mt-3 ${errorBox}`}>{error}</p>}
      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={saving} className={btnPrimary}>
          {saving ? t.common.saving : t.common.save}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className={btnSecondary}>
          {t.common.cancel}
        </button>
      </div>
    </form>
  );
}

// "Own hours · 2 services · Day off Thu 5 Nov" under the staff member's name.
function ScheduleSummary({ staff, tenant }: { staff: StaffMember; tenant: TenantInfo }) {
  const { t } = useLanguage();
  const st = t.dashboard.staff;
  const nextOff = staff.daysOff.find((d) => d >= todayIn(tenant.timezone));
  const parts = [
    staff.workingHours ? st.ownHours : st.sameHours,
    staff.services.length ? st.servicesCount(staff.services.length) : st.allServices,
    ...(nextOff ? [st.nextDayOff(formatLongDate(nextOff, t.locale))] : []),
  ];
  return <p className="mt-0.5 text-xs text-ink-400">{parts.join(" · ")}</p>;
}
