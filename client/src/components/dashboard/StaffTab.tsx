"use client";

// Owner manages staff accounts. The server decides role="staff" and the tenantId -
// the owner only sends name/email/password/phone.
// "Deactivate" is a soft delete: the account can't log in anymore, old appointments stay.

import { useEffect, useState } from "react";
import { useLanguage } from "@/i18n/LanguageContext";
import { api } from "@/lib/api";
import { btnPrimary, btnSecondary, errorBox, inputClass } from "@/lib/ui";
import type { StaffMember } from "@/lib/types";

interface StaffInput {
  name: string;
  phone?: string;
  email?: string; //    create only - the backend doesn't allow changing it
  password?: string; // create only
}

export default function StaffTab() {
  const { t, tError } = useLanguage();
  const st = t.dashboard.staff;

  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [editing, setEditing] = useState<string | null>(null); // "new" | staff id | null
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

  if (loadError) return <p className={errorBox}>{tError(loadError)}</p>;
  if (!staff) return <p className="text-sm text-gray-500">{t.common.loading}</p>;

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-gray-500">{st.hint}</p>
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

      {staff.length === 0 && editing !== "new" ? (
        <p className="mt-6 rounded-lg border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">
          {st.empty}
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {staff.map((s) =>
            editing === s.id ? (
              <li key={s.id}>
                <StaffForm initial={s} onSave={(data) => save(data, s.id)} onCancel={() => setEditing(null)} />
              </li>
            ) : (
              <li key={s.id} className={`rounded-lg border border-gray-200 bg-white p-4 ${s.isActive ? "" : "opacity-60"}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 font-bold text-indigo-600">
                      {s.name.charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <p className="font-semibold">
                        {s.name}
                        {!s.isActive && (
                          <span className="ms-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                            {st.inactive}
                          </span>
                        )}
                      </p>
                      <p dir="ltr" className="text-sm text-gray-500 rtl:text-right">
                        {s.email}
                        {s.phone && ` · ${s.phone}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
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
            )
          )}
        </ul>
      )}
    </div>
  );
}

// Create: name, email, password, phone.  Edit: name and phone only (what the backend allows).
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
          : { name: form.name.trim(), phone: form.phone.trim() || undefined, email: form.email, password: form.password }
      );
    } catch (err) {
      setError(tError(err)); // e.g. "email already exists"
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium">{st.name}</span>
          <input name="name" required value={form.name} onChange={handleChange} className={inputClass} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">
            {st.phone} <span className="text-gray-400">{t.common.optional}</span>
          </span>
          <input name="phone" type="tel" dir="ltr" value={form.phone} onChange={handleChange} className={inputClass} />
        </label>
        {!isEdit && (
          <>
            <label className="block">
              <span className="text-sm font-medium">{st.email}</span>
              <input name="email" type="email" required dir="ltr" autoComplete="off" value={form.email} onChange={handleChange} className={inputClass} />
            </label>
            <label className="block">
              <span className="text-sm font-medium">{st.password}</span>
              {/* autoComplete="new-password": stop the browser from filling in the OWNER's saved password */}
              <input name="password" type="password" required minLength={6} dir="ltr" autoComplete="new-password" value={form.password} onChange={handleChange} className={inputClass} />
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
