"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/i18n/LanguageContext";
import { api } from "@/lib/api";
import { IconChat, IconClose, IconSend } from "@/components/icons";

type Message = { role: "user" | "assistant"; text: string };

// Same limits as the API (public.controller.js): the whole short chat is sent each time.
const MAX_SENT = 12;
const MAX_LENGTH = 500;

// The booking page's AI chat (shown only when the business has it switched on).
// It answers questions; booking itself stays in the form on the page.
export default function BookingAssistant({ slug, businessName }: { slug: string; businessName: string }) {
  const { t, tError } = useLanguage();
  const a = t.assistant;

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, busy, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const send = async (text: string) => {
    const question = text.trim().slice(0, MAX_LENGTH);
    if (!question || busy) return;
    const chat: Message[] = [...messages, { role: "user", text: question }];
    setMessages(chat);
    setDraft("");
    setError(null);
    setBusy(true);
    try {
      const { reply } = await api.post<{ reply: string }>(`/public/businesses/${encodeURIComponent(slug)}/assistant`, {
        messages: chat.slice(-MAX_SENT),
      });
      setMessages([...chat, { role: "assistant", text: reply }]);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed end-4 bottom-4 z-40 inline-flex items-center gap-2 rounded-full bg-navy-900 px-4 py-3 text-sm font-medium text-white shadow-lg transition hover:bg-navy-700"
      >
        <IconChat />
        {a.open}
      </button>
    );
  }

  return (
    <section
      role="dialog"
      aria-label={a.title(businessName)}
      className="fixed inset-x-3 bottom-3 z-40 flex max-h-[75vh] flex-col overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-2xl sm:inset-x-auto sm:end-4 sm:bottom-4 sm:w-96"
    >
      <header className="flex items-start justify-between gap-3 bg-navy-950 px-4 py-3 text-white">
        <div className="min-w-0">
          <p className="truncate font-semibold">{a.title(businessName)}</p>
          <p className="text-xs text-navy-200">{a.subtitle}</p>
        </div>
        <button
          onClick={() => setOpen(false)}
          aria-label={a.close}
          title={a.close}
          className="rounded-md p-1 text-navy-200 hover:bg-navy-800 hover:text-white"
        >
          <IconClose />
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto bg-navy-50/60 px-4 py-4 text-sm" aria-live="polite">
        <Bubble role="assistant" text={a.greeting(businessName)} />
        {messages.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {a.suggestions.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-full border border-navy-200 bg-white px-3 py-1.5 text-xs text-navy-700 hover:border-navy-400"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <Bubble key={i} role={m.role} text={m.text} />
        ))}
        {busy && <p className="text-xs text-navy-500">{a.thinking}</p>}
        {error != null && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{tError(error)}</p>}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
        className="flex items-end gap-2 border-t border-navy-100 p-3"
      >
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(draft);
            }
          }}
          rows={1}
          maxLength={MAX_LENGTH}
          placeholder={a.placeholder}
          aria-label={a.placeholder}
          className="max-h-28 min-h-10 flex-1 resize-none rounded-lg border border-navy-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          aria-label={a.send}
          title={a.send}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-brand-ink transition hover:bg-brand-600 disabled:opacity-50"
        >
          <IconSend className="h-5 w-5 rtl:rotate-180" />
        </button>
      </form>
    </section>
  );
}

function Bubble({ role, text }: Message) {
  const mine = role === "user";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <p
        dir="auto"
        className={`max-w-[85%] rounded-2xl px-3 py-2 whitespace-pre-line ${
          mine ? "bg-navy-900 text-white" : "border border-navy-100 bg-white text-navy-900"
        }`}
      >
        {text}
      </p>
    </div>
  );
}
