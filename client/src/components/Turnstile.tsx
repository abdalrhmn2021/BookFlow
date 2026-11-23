"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "@/i18n/LanguageContext";

// Cloudflare Turnstile ("are you a person?") for the guest booking form - usually invisible,
// sometimes one click. Shown only when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set (docs/INSTALL.md);
// the server checks the token with TURNSTILE_SECRET_KEY.
// A token works once: give the component a new `key` after every booking attempt to get a new one.
// Also on the forms that send an email (sign-up, "forgot password", a new code - security review
// H-2): useCaptcha() + <CaptchaBox> below.

// Set on sites that use Turnstile (with TURNSTILE_SECRET_KEY on the server). Empty = off.
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || "";

type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SCRIPT_SRC;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        scriptPromise = null;
        reject(new Error("Turnstile failed to load"));
      };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

export default function Turnstile({
  siteKey,
  language,
  onToken,
}: {
  siteKey: string;
  language: string;
  onToken: (token: string | null) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    let widgetId: string | null = null;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !box.current || !window.turnstile) return;
        widgetId = window.turnstile.render(box.current, {
          sitekey: siteKey,
          language,
          callback: (token: string) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": () => onTokenRef.current(null),
        });
      })
      .catch(() => onTokenRef.current(null));
    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey, language]);

  return <div ref={box} className="flex justify-center" />;
}

// A form protected by Turnstile: its one-use token, whether the form may be sent, and a reset
// that shows a fresh widget (call it after every request, whatever the answer).
export function useCaptcha() {
  const required = Boolean(TURNSTILE_SITE_KEY);
  const [token, setToken] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const reset = useCallback(() => {
    setToken(null);
    setRound((n) => n + 1);
  }, []);
  return {
    required,
    round,
    setToken,
    reset,
    ready: !required || Boolean(token),
    // Spread into the request body.
    field: token ? { captchaToken: token } : {},
  };
}

export function CaptchaBox({ captcha }: { captcha: ReturnType<typeof useCaptcha> }) {
  const { lang } = useLanguage();
  if (!captcha.required) return null;
  return <Turnstile key={captcha.round} siteKey={TURNSTILE_SITE_KEY} language={lang} onToken={captcha.setToken} />;
}
