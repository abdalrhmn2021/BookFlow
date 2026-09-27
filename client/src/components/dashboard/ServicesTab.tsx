"use client";

// Owner manages the services customers can book.
// "Delete" is a SOFT delete on the backend (isActive: false) -> we call it "Hide",
// because old appointments still point to the service.

import { useEffect, useState } from "react";
import { useLanguage } from "@/i18n/LanguageContext";
import { api } from "@/lib/api";
import { formatDuration, formatPrice } from "@/lib/format";
import { btnPrimary, btnSecondary, errorBox, inputClass } from "@/lib/ui";
import type { Service } from "@/lib/types";

type ServiceInput = Pick<Service, "name" | "description" | "price" | "duration">;

export default function ServicesTab() {
  const { t, tError } = useLanguage();
  const sv = t.dashboard.services;

  const [services, setServices] = useState<Service[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  // Which form is open: "new", a service id (editing it), or none
  const [editing, setEditing] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; err: unknown } | null>(null);

  useEffect(() => {
    let ignore = false;
    api
      .get<{ services: Service[] }>("/services")
      .then((data) => {
        if (!ignore) setServices(data.services);
      })
      .catch((err) => {
        if (!ignore) setLoadError(err);
      });
    return () => {
      ignore = true;
    };
  }, []);

  // Used by the form for BOTH create and edit. Errors are NOT caught here -
  // they go up to the form, which shows them next to the fields.
  const save = async (data: ServiceInput, id?: string) => {
    if (id) {
      const { service } = await api.patch<{ service: Service }>(`/services/${id}`, data);
      setServices((prev) => prev?.map((s) => (s._id === id ? service : s)) ?? null);
    } else {
      const { service } = await api.post<{ service: Service }>("/services", data);
      setServices((prev) => [service, ...(prev ?? [])]); // newest first, like the backend's sort
    }
    setEditing(null);
  };

  // Hide = DELETE (soft delete). Show again = PATCH isActive: true.
  const toggleActive = async (s: Service) => {
    setRowError(null);
    setBusyId(s._id);
    try {
      const { service } = s.isActive
        ? await api.delete<{ service: Service }>(`/services/${s._id}`)
        : await api.patch<{ service: Service }>(`/services/${s._id}`, { isActive: true });
      setServices((prev) => prev?.map((x) => (x._id === s._id ? service : x)) ?? null);
    } catch (err) {
      setRowError({ id: s._id, err });
    } finally {
      setBusyId(null);
    }
  };

  if (loadError) return <p className={errorBox}>{tError(loadError)}</p>;
  if (!services) return <p className="text-sm text-gray-500">{t.common.loading}</p>;

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-gray-500">{sv.hiddenHint}</p>
        {editing !== "new" && (
          <button onClick={() => setEditing("new")} className={`shrink-0 ${btnPrimary}`}>
            {sv.add}
          </button>
        )}
      </div>

      {editing === "new" && (
        <div className="mt-4">
          <ServiceForm onSave={(data) => save(data)} onCancel={() => setEditing(null)} />
        </div>
      )}

      {services.length === 0 && editing !== "new" ? (
        <p className="mt-6 rounded-lg border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">
          {sv.empty}
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {services.map((s) =>
            editing === s._id ? (
              <li key={s._id}>
                <ServiceForm initial={s} onSave={(data) => save(data, s._id)} onCancel={() => setEditing(null)} />
              </li>
            ) : (
              <li
                key={s._id}
                className={`rounded-lg border border-gray-200 bg-white p-4 ${s.isActive ? "" : "opacity-60"}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold">
                      {s.name}
                      {!s.isActive && (
                        <span className="ms-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                          {sv.hidden}
                        </span>
                      )}
                    </p>
                    {s.description && <p className="mt-0.5 text-sm text-gray-500">{s.description}</p>}
                    <p className="mt-1 text-sm text-gray-700">
                      {formatPrice(s.price)} · {formatDuration(s.duration, t.duration)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button onClick={() => setEditing(s._id)} className={btnSecondary}>
                      {t.common.edit}
                    </button>
                    <button onClick={() => toggleActive(s)} disabled={busyId === s._id} className={btnSecondary}>
                      {s.isActive ? sv.hide : sv.show}
                    </button>
                  </div>
                </div>
                {rowError?.id === s._id && <p className={`mt-2 ${errorBox}`}>{tError(rowError.err)}</p>}
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}

// ONE form for create and edit: `initial` decides which.
function ServiceForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Service;
  onSave: (data: ServiceInput) => Promise<void>;
  onCancel: () => void;
}) {
  const { t, tError } = useLanguage();
  const sv = t.dashboard.services;

  // Inputs always hold STRINGS; we convert to numbers only when sending
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    price: initial ? String(initial.price) : "",
    duration: initial ? String(initial.duration) : "30",
  });
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
      await onSave({
        name: form.name.trim(),
        description: form.description.trim(),
        price: Number(form.price),
        duration: Number(form.duration),
      });
    } catch (err) {
      setError(tError(err)); // e.g. "name already exists" -> "هذا الاسم مستخدم بالفعل"
      setSaving(false); // only on error: on success this form disappears
    }
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium">{sv.name}</span>
          <input name="name" required maxLength={100} value={form.name} onChange={handleChange} className={inputClass} />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-sm font-medium">
            {sv.description} <span className="text-gray-400">{t.common.optional}</span>
          </span>
          <input name="description" maxLength={500} value={form.description} onChange={handleChange} className={inputClass} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">{sv.price}</span>
          <input name="price" type="number" required min={0} step="any" dir="ltr" value={form.price} onChange={handleChange} className={inputClass} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">{sv.duration}</span>
          <input name="duration" type="number" required min={5} max={480} step={5} dir="ltr" value={form.duration} onChange={handleChange} className={inputClass} />
        </label>
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
