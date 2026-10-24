"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/i18n/LanguageContext";
import { api } from "@/lib/api";
import { formatMomentIn } from "@/lib/format";
import type { NewBooking, NewBookingsResponse } from "@/lib/types";

const POLL_MS = 30_000;
const MAX_SHOWN = 4;
const PROMPT_KEY = "bookflow_notify_prompt_dismissed";

// Two short rising tones made in the browser: no sound file to ship.
function chime() {
  try {
    const ctx = new AudioContext();
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime + i * 0.18;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.32);
    });
    setTimeout(() => ctx.close(), 1000);
  } catch {
    // Browsers block sound until the page has been clicked once; the visual alert still shows.
  }
}

const nameOf = (b: NewBooking) => b.guest?.name ?? b.customerId?.name ?? "";

// Polls for bookings made since the last look; on a new one: sound, a card, the count in the
// tab title, a system notification when the tab is in the background, and onNew() so the
// open tab refreshes its data.
export default function NewBookingAlerts({
  timezone,
  onOpenDay,
  onNew,
}: {
  timezone: string;
  onOpenDay: (date: string) => void;
  onNew: () => void;
}) {
  const { t } = useLanguage();
  const a = t.dashboard.alerts;
  const [alerts, setAlerts] = useState<NewBooking[]>([]);
  const [unseen, setUnseen] = useState(0);
  // Only rendered after the dashboard loaded in the browser, so window is always there.
  const [askPermission, setAskPermission] = useState(() => {
    try {
      return "Notification" in window && Notification.permission === "default" && !localStorage.getItem(PROMPT_KEY);
    } catch {
      return false;
    }
  });

  // Latest values for the polling loop, which is set up once.
  const latest = useRef({ onNew, a, timezone, locale: t.locale });
  useEffect(() => {
    latest.current = { onNew, a, timezone, locale: t.locale };
  });

  useEffect(() => {
    let since: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let busy = false;
    let stopped = false;

    const poll = async () => {
      if (busy || stopped) return;
      busy = true;
      clearTimeout(timer);
      try {
        const query = since ? `?since=${encodeURIComponent(since)}` : "";
        const data = await api.get<NewBookingsResponse>(`/appointments/business/new${query}`);
        since = data.now;
        const fresh = data.appointments;
        if (fresh.length && !stopped) {
          const { onNew, a, timezone, locale } = latest.current;
          setAlerts((prev) => [...fresh.slice().reverse(), ...prev].slice(0, MAX_SHOWN));
          setUnseen((n) => n + fresh.length);
          chime();
          onNew();
          if (document.hidden && "Notification" in window && Notification.permission === "granted") {
            const b = fresh[fresh.length - 1];
            const when = formatMomentIn(b.startTime, timezone, locale);
            new Notification(a.newBookings(fresh.length), {
              body: `${nameOf(b)} · ${b.serviceName} · ${when.date} ${when.time}`,
              tag: "bookflow-new-booking",
            });
          }
        }
      } catch {
        // Offline or the server is waking up: try again on the next round.
      } finally {
        busy = false;
        if (!stopped) timer = setTimeout(poll, POLL_MS);
      }
    };

    // Coming back to the tab checks right away instead of waiting up to 30 s.
    const onVisible = () => {
      if (!document.hidden) poll();
    };

    poll();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // "(2) BookFlow" in the tab title until the alerts are looked at.
  useEffect(() => {
    if (!unseen) return;
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = `(${unseen}) ${base}`;
    return () => {
      document.title = base;
    };
  }, [unseen]);

  const dismiss = (id: string) => {
    setAlerts((prev) => prev.filter((b) => b._id !== id));
    setUnseen(0);
  };

  const open = (b: NewBooking) => {
    onOpenDay(new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date(b.startTime)));
    dismiss(b._id);
  };

  const closePrompt = () => {
    setAskPermission(false);
    try {
      localStorage.setItem(PROMPT_KEY, "1");
    } catch {}
  };

  const allow = async () => {
    try {
      await Notification.requestPermission();
    } catch {}
    closePrompt();
  };

  return (
    <>
      {askPermission && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
          <div className="min-w-0">
            <p className="font-semibold text-navy-900">{a.enableTitle}</p>
            <p className="text-sm text-navy-600">{a.enableText}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={allow}
              className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-brand-ink hover:bg-brand-400"
            >
              {a.enable}
            </button>
            <button onClick={closePrompt} className="rounded-lg px-3 py-2 text-sm text-navy-600 hover:bg-navy-100">
              {a.later}
            </button>
          </div>
        </div>
      )}

      {alerts.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 end-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
        >
          {alerts.map((b) => {
            const when = formatMomentIn(b.startTime, timezone, t.locale);
            return (
              <div key={b._id} className="rounded-xl border border-navy-100 bg-white p-4 shadow-lg">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold tracking-wide text-brand-700">{a.newBooking}</p>
                  <button
                    onClick={() => dismiss(b._id)}
                    aria-label={a.dismiss}
                    className="-mt-1 rounded px-1.5 text-lg leading-none text-navy-400 hover:bg-navy-50 hover:text-navy-700"
                  >
                    ×
                  </button>
                </div>
                <p className="mt-1 font-semibold text-navy-900">{nameOf(b)}</p>
                <p className="text-sm text-navy-600">
                  {b.serviceName} · {a.with(b.staffId.name)}
                </p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-sm text-navy-500">
                    {when.date} · <span dir="ltr">{when.time}</span>
                  </p>
                  <button
                    onClick={() => open(b)}
                    className="rounded-lg bg-navy-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-navy-800"
                  >
                    {a.open}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
