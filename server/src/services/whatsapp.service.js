// WhatsApp messages through Meta's WhatsApp Cloud API (graph.facebook.com).
//
// A business may only START a conversation with an approved *template* message, so the
// reminder is a template you create once in Meta (WhatsApp Manager -> Message templates),
// category "Utility", with 4 variables in the body - see docs/INSTALL.md:
//   {{1}} customer name   {{2}} business name   {{3}} service   {{4}} date and time
//
// Off until WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_TEMPLATE are set.

const DEFAULT_COUNTRY_CODE = "970";

const isWhatsAppConfigured = () =>
  Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_TEMPLATE);

// "0599 123 456" -> "970599123456" (international, digits only - what the API wants).
// Same rules as the dashboard's manual WhatsApp button (client/src/lib/whatsapp.ts).
function toWhatsAppNumber(phone, countryCode) {
  if (typeof phone !== "string" || !phone) return null;
  const code = String(countryCode || process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || DEFAULT_COUNTRY_CODE).replace(
    /\D/g,
    "",
  );
  let n = phone
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[^\d+]/g, "");

  if (n.startsWith("+")) n = n.slice(1);
  else if (n.startsWith("00")) n = n.slice(2);
  else if (n.startsWith("0")) n = code + n.slice(1);
  else return null;

  return /^\d{8,15}$/.test(n) ? n : null;
}

// Pure: the request body for one template message (easy to test, no network).
function buildTemplateMessage({ to, params }) {
  return {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: process.env.WHATSAPP_TEMPLATE,
      language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "ar" },
      components: [
        {
          type: "body",
          // WhatsApp rejects new lines, tabs and 4+ spaces inside a variable.
          parameters: params.map((text) => ({
            type: "text",
            text: String(text ?? "-")
              .replace(/[\n\t]+/g, " ")
              .replace(/ {4,}/g, "   ")
              .slice(0, 200),
          })),
        },
      ],
    },
  };
}

async function sendWithCloudApi(message) {
  const version = process.env.WHATSAPP_API_VERSION || "v21.0";
  const url = `https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const details = await res.text().catch(() => "");
    throw new Error(`WhatsApp answered ${res.status}: ${details.slice(0, 300)}`);
  }
  return res.json().catch(() => ({}));
}

// Tests swap the sender so nothing leaves the machine.
let send = sendWithCloudApi;
const setWhatsAppSenderForTests = (fn) => {
  send = fn || sendWithCloudApi;
};

async function sendTemplate({ to, params }) {
  return send(buildTemplateMessage({ to, params }));
}

module.exports = {
  isWhatsAppConfigured,
  toWhatsAppNumber,
  buildTemplateMessage,
  sendTemplate,
  setWhatsAppSenderForTests,
};
