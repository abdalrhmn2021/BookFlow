import type { Lang } from "@/i18n/dictionaries";

// The privacy policy and terms of use (/privacy, /terms), in Arabic and English.
// Plain, honest descriptions of what the app really does - keep them in sync with the code:
//   2-hour cancel rule + reason: server/src/services/booking.service.js (CUSTOMER_CANCEL_LIMIT_MS)
//   3 upcoming bookings per guest phone: server/src/controllers/public.controller.js
//   unconfirmed bookings closed a day after they end: server/src/services/maintenance.service.js
//   guest details removed after DATA_RETENTION_MONTHS: same file
//   WhatsApp reminders only with the customer's tick: server/src/services/reminder.service.js
//   chat assistant: messages go to Google Gemini, nothing stored: server/src/services/assistant.service.js
// Not legal advice: have a lawyer look at them before relying on them for a client.

export const LEGAL_UPDATED = "2026-10-26";

export interface LegalParams {
  site: string; // the business on a one-business site, else the platform name
  singleBusiness: boolean;
  operator: string | null; // who runs the system (OPERATOR_NAME)
  email: string | null; // privacy contact (OPERATOR_EMAIL)
  retentionMonths: number; // DATA_RETENTION_MONTHS
}

export interface LegalSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface LegalTexts {
  privacyTitle: string;
  termsTitle: string;
  updated: (date: string) => string;
  privacy: (p: LegalParams) => LegalSection[];
  terms: (p: LegalParams) => LegalSection[];
}

const en: LegalTexts = {
  privacyTitle: "Privacy policy",
  termsTitle: "Terms of use",
  updated: (date) => `Last updated: ${date}`,
  privacy: (p) => [
    {
      heading: "Who we are",
      paragraphs: [
        p.singleBusiness
          ? `This booking site belongs to ${p.site}. ${p.site} decides how your booking details are used.${p.operator ? ` The booking system is run for them by ${p.operator}, who handles the data only to provide this service.` : ""}`
          : `${p.site} is an online booking platform for businesses such as salons, clinics and gyms.${p.operator ? ` It is run by ${p.operator}.` : ""} Each business decides how the details of its own bookings are used.`,
      ],
    },
    {
      heading: "What we collect",
      bullets: [
        "When you book as a guest: your name, your phone number and anything you write in the notes.",
        "When you create an account: your name, email address, password (stored only as a secure hash) and, if you give it, your phone number.",
        "Your bookings: the service, staff member, date, time, price and status, and a reason if you cancel.",
        "Whether you agreed to get a WhatsApp reminder.",
        "Your IP address, used for a short time to block abuse (too many attempts). It is not kept with your bookings.",
      ],
    },
    {
      heading: "Why we use it",
      bullets: [
        "To make, show, change and cancel your bookings, and to let the business see and manage them.",
        "To tell the business about a new booking (by email).",
        "To send you a reminder on WhatsApp before your appointment - only if you ticked that box.",
        "To keep the service secure and working.",
      ],
      paragraphs: ["We don't sell your data, show you ads or use it for marketing."],
    },
    {
      heading: "Who can see it",
      bullets: [
        p.singleBusiness
          ? `${p.site} and its staff (staff see only their own appointments).`
          : "The business you book with, and its staff (staff see only their own appointments).",
        ...(p.operator ? [`${p.operator}, who runs the system, when needed to operate or support it.`] : []),
        "The services that host and run the system, only to do that: Vercel (the website), Render (the server), MongoDB Atlas (the database), Brevo (emails to the business) and Meta / WhatsApp (reminders, if you agreed). Some of them store data outside your country.",
        "If the booking page has the chat assistant, what you type in the chat is sent to Google (Gemini) to write the answer. We don't save the chat, but don't type private details there - booking needs only the form.",
      ],
    },
    {
      heading: "How long we keep it",
      paragraphs: [
        `A guest's name, phone number and notes are removed from a booking ${p.retentionMonths} months after the appointment. The booking itself (date, service, price) stays, without your details, so the business's records stay correct.`,
        "An account's details are kept until you delete the account.",
      ],
    },
    {
      heading: "Cookies",
      paragraphs: [
        "We use only the cookies the site needs: one that keeps you signed in, and one that remembers your language. No tracking or advertising cookies.",
      ],
    },
    {
      heading: "Your rights",
      bullets: [
        "See, correct or delete your details.",
        'Delete your account at any time from "My appointments". Your upcoming bookings are cancelled and your past ones no longer show your details.',
        "As a guest, you can see or cancel your booking with your private booking link, and ask the business to delete your details.",
        "Stop WhatsApp reminders: simply don't tick the box next time, or ask the business.",
      ],
    },
    {
      heading: "Contact",
      paragraphs: [
        p.email
          ? `For any question or request about your data, write to ${p.email}${p.singleBusiness ? `, or contact ${p.site} directly` : ""}.`
          : p.singleBusiness
            ? `For any question or request about your data, contact ${p.site}.`
            : "For any question or request about your data, contact the business you booked with.",
        "We may update this page; the date at the top shows the latest version.",
      ],
    },
  ],
  terms: (p) => [
    {
      heading: "About this service",
      paragraphs: [
        p.singleBusiness
          ? `This site lets you book appointments with ${p.site}. ${p.site} provides the service you book and is responsible for it.`
          : `${p.site} lets you book appointments with independent businesses. Each business provides its own services and is responsible for them.`,
        "By booking or creating an account you agree to these terms and to the privacy policy.",
      ],
    },
    {
      heading: "Your booking",
      bullets: [
        "A new booking is usually pending until the business confirms it.",
        "Give a real name and a phone number the business can reach you on.",
        "A guest can have at most 3 upcoming bookings per phone number at a business.",
        "A booking nobody confirmed is closed automatically a day after its time.",
        "The business may cancel or move a booking (for example if a staff member is ill); it will try to let you know.",
      ],
    },
    {
      heading: "Cancelling",
      bullets: [
        "You can cancel online up to 2 hours before the appointment, with a short reason.",
        "Closer to the time, please contact the business directly.",
        "If you don't come and didn't cancel, the business may mark the booking as a no-show.",
      ],
    },
    {
      heading: "Reminders",
      paragraphs: [
        "If you tick the box, you get a WhatsApp reminder before your appointment. It's a convenience: please keep track of your own appointments too, as a message can be late or fail.",
      ],
    },
    {
      heading: "Fair use",
      bullets: [
        "Don't make fake bookings, book for someone without their agreement, or try to overload or break into the system.",
        "Keep your password and your private booking link to yourself - anyone with the link can see and cancel that booking.",
      ],
    },
    {
      heading: "Availability and responsibility",
      paragraphs: [
        "We work to keep the site available and correct, but it can sometimes be slow or unavailable. The service you book - its price, quality and timing - is the business's responsibility.",
        "We may update these terms; the date at the top shows the latest version.",
      ],
    },
  ],
};

// "12 شهراً", "3 أشهر", "شهرين", "شهر واحد" - Arabic counts change the noun.
const arabicMonths = (n: number) =>
  n === 1 ? "شهر واحد" : n === 2 ? "شهرين" : n >= 3 && n <= 10 ? `${n} أشهر` : `${n} شهراً`;

const ar: LegalTexts = {
  privacyTitle: "سياسة الخصوصية",
  termsTitle: "شروط الاستخدام",
  updated: (date) => `آخر تحديث: ${date}`,
  privacy: (p) => [
    {
      heading: "من نحن",
      paragraphs: [
        p.singleBusiness
          ? `موقع الحجز هذا تابع لـ ${p.site}، وهو من يقرّر كيف تُستخدم بيانات حجوزاتك.${p.operator ? ` يشغّل ${p.operator} نظام الحجز لصالحه، ويتعامل مع البيانات فقط لتقديم هذه الخدمة.` : ""}`
          : `${p.site} منصّة لحجز المواعيد أونلاين لدى الصالونات والعيادات والنوادي وغيرها.${p.operator ? ` يشغّلها ${p.operator}.` : ""} وكل نشاط يقرّر كيف تُستخدم بيانات الحجوزات لديه.`,
      ],
    },
    {
      heading: "ما الذي نجمعه",
      bullets: [
        "عند الحجز كضيف: اسمك ورقم جوالك وما تكتبه في الملاحظات.",
        "عند إنشاء حساب: اسمك وبريدك الإلكتروني وكلمة المرور (تُحفظ مشفّرة فقط) ورقم جوالك إن أضفته.",
        "حجوزاتك: الخدمة والموظف والتاريخ والوقت والسعر والحالة، وسبب الإلغاء إن ألغيت.",
        "هل وافقت على استلام تذكير على واتساب.",
        "عنوان الـ IP الخاص بك، يُستخدم لوقت قصير لمنع إساءة الاستخدام (كثرة المحاولات)، ولا يُحفظ مع حجوزاتك.",
      ],
    },
    {
      heading: "لماذا نستخدمها",
      bullets: [
        "لإنشاء حجوزاتك وعرضها وتعديلها وإلغائها، ولتمكين النشاط من رؤيتها وإدارتها.",
        "لإبلاغ النشاط بالحجز الجديد (بالبريد الإلكتروني).",
        "لإرسال تذكير بموعدك على واتساب - فقط إذا أشّرت على ذلك.",
        "للحفاظ على أمان الخدمة وعملها.",
      ],
      paragraphs: ["لا نبيع بياناتك، ولا نعرض لك إعلانات، ولا نستخدمها للتسويق."],
    },
    {
      heading: "من يمكنه رؤيتها",
      bullets: [
        p.singleBusiness
          ? `${p.site} وموظفوه (كل موظف يرى مواعيده فقط).`
          : "النشاط الذي تحجز لديه وموظفوه (كل موظف يرى مواعيده فقط).",
        ...(p.operator ? [`${p.operator}، مشغّل النظام، عند الحاجة لتشغيله أو تقديم الدعم.`] : []),
        "الخدمات التي تستضيف النظام وتشغّله، لهذا الغرض فقط: Vercel (الموقع)، Render (الخادم)، MongoDB Atlas (قاعدة البيانات)، Brevo (رسائل البريد للنشاط)، وميتا / واتساب (التذكيرات إن وافقت). بعضها يخزّن البيانات خارج بلدك.",
        "إذا كانت صفحة الحجز فيها المساعد الذكي، فما تكتبه في المحادثة يُرسَل إلى Google (Gemini) لكتابة الرد. لا نحفظ المحادثة، لكن لا تكتب فيها معلومات خاصة - الحجز يحتاج النموذج فقط.",
      ],
    },
    {
      heading: "مدة الاحتفاظ بها",
      paragraphs: [
        `يُحذف اسم الضيف ورقم جواله وملاحظاته من الحجز بعد ${arabicMonths(p.retentionMonths)} من الموعد. يبقى الحجز نفسه (التاريخ والخدمة والسعر) بدون بياناتك، لتبقى سجلات النشاط صحيحة.`,
        "تبقى بيانات الحساب حتى تحذف الحساب.",
      ],
    },
    {
      heading: "ملفات تعريف الارتباط (الكوكيز)",
      paragraphs: [
        "نستخدم فقط الكوكيز التي يحتاجها الموقع: واحد يُبقيك مسجّلاً للدخول، وآخر يتذكّر لغتك. لا كوكيز للتتبّع أو الإعلانات.",
      ],
    },
    {
      heading: "حقوقك",
      bullets: [
        "الاطلاع على بياناتك أو تصحيحها أو حذفها.",
        'حذف حسابك في أي وقت من صفحة "مواعيدي". تُلغى حجوزاتك القادمة، ولا تظهر بياناتك في حجوزاتك السابقة.',
        "كضيف، يمكنك رؤية حجزك أو إلغاؤه برابط الحجز الخاص بك، وطلب حذف بياناتك من النشاط.",
        "إيقاف تذكيرات واتساب: لا تؤشّر على الخيار في المرة القادمة، أو اطلب ذلك من النشاط.",
      ],
    },
    {
      heading: "التواصل",
      paragraphs: [
        p.email
          ? `لأي سؤال أو طلب يخص بياناتك، راسلنا على ${p.email}${p.singleBusiness ? ` أو تواصل مع ${p.site} مباشرة` : ""}.`
          : p.singleBusiness
            ? `لأي سؤال أو طلب يخص بياناتك، تواصل مع ${p.site}.`
            : "لأي سؤال أو طلب يخص بياناتك، تواصل مع النشاط الذي حجزت لديه.",
        "قد نحدّث هذه الصفحة؛ التاريخ في الأعلى يدل على آخر نسخة.",
      ],
    },
  ],
  terms: (p) => [
    {
      heading: "عن هذه الخدمة",
      paragraphs: [
        p.singleBusiness
          ? `يتيح لك هذا الموقع حجز المواعيد لدى ${p.site}. ${p.site} هو من يقدّم الخدمة التي تحجزها وهو المسؤول عنها.`
          : `يتيح لك ${p.site} حجز المواعيد لدى أنشطة مستقلة. كل نشاط يقدّم خدماته وهو المسؤول عنها.`,
        "بإتمام الحجز أو إنشاء حساب، أنت توافق على هذه الشروط وعلى سياسة الخصوصية.",
      ],
    },
    {
      heading: "حجزك",
      bullets: [
        "الحجز الجديد يكون غالباً بانتظار تأكيد النشاط.",
        "استخدم اسمك الحقيقي ورقم جوال يمكن للنشاط التواصل معك عليه.",
        "يمكن للضيف أن يكون لديه 3 حجوزات قادمة كحد أقصى لكل رقم جوال لدى النشاط الواحد.",
        "الحجز الذي لم يؤكّده أحد يُغلق تلقائياً بعد يوم من موعده.",
        "قد يُلغي النشاط الحجز أو ينقله لوقت آخر (مثلاً إذا مرض الموظف)، وسيحاول إبلاغك.",
      ],
    },
    {
      heading: "الإلغاء",
      bullets: [
        "يمكنك الإلغاء أونلاين حتى ساعتين قبل الموعد، مع ذكر سبب قصير.",
        "إذا كان الموعد أقرب من ذلك، تواصل مع النشاط مباشرة.",
        'إذا لم تحضر ولم تُلغِ، قد يسجّل النشاط الحجز كـ "لم يحضر".',
      ],
    },
    {
      heading: "التذكيرات",
      paragraphs: [
        "إذا أشّرت على الخيار، يصلك تذكير على واتساب قبل موعدك. هذه خدمة للتسهيل فقط: تابع مواعيدك بنفسك أيضاً، فقد تتأخر الرسالة أو لا تصل.",
      ],
    },
    {
      heading: "الاستخدام العادل",
      bullets: [
        "لا تنشئ حجوزات وهمية، ولا تحجز لشخص بدون موافقته، ولا تحاول إغراق النظام أو اختراقه.",
        "احتفظ بكلمة مرورك ورابط حجزك الخاص لنفسك - من يملك الرابط يستطيع رؤية الحجز وإلغاءه.",
      ],
    },
    {
      heading: "توفّر الخدمة والمسؤولية",
      paragraphs: [
        "نعمل على أن يبقى الموقع متاحاً وصحيحاً، لكنه قد يكون بطيئاً أو غير متاح أحياناً. أما الخدمة التي تحجزها - سعرها وجودتها وموعدها - فهي مسؤولية النشاط.",
        "قد نحدّث هذه الشروط؛ التاريخ في الأعلى يدل على آخر نسخة.",
      ],
    },
  ],
};

export const legalTexts: Record<Lang, LegalTexts> = { en, ar };
