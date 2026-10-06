// Every piece of text the user sees, in both languages.
//
// How it works:
//   - `en` is the "master" shape. `Dictionary = typeof en`.
//   - `ar` is typed as Dictionary -> if you add a key to `en` and forget it in `ar`,
//     TypeScript shows an error. You can never ship a half-translated page.
//   - Text with a value inside (a name, a price) is a small FUNCTION, not string gluing:
//     word order differs between languages ("Book for 50 ₪" vs "احجز بـ 50 ₪").
//
// No "use client" here: this is plain data, so the server (layout) can import it too.

import type { AppointmentStatus, DayName, Role } from "@/lib/types";

export type Lang = "ar" | "en";
export const DEFAULT_LANG: Lang = "ar";
export const LANG_COOKIE = "bookflow_lang";

export const isLang = (value: unknown): value is Lang => value === "ar" || value === "en";

const en = {
  dir: "ltr" as "ltr" | "rtl",
  locale: "en-US", // for Intl date formatting

  common: {
    loading: "Loading...",
    backHome: "Back home",
    optional: "(optional)",
    save: "Save",
    saving: "Saving...",
    cancel: "Cancel",
    edit: "Edit",
  },

  nav: {
    businesses: "Businesses",
    myAppointments: "My appointments",
    dashboard: "Dashboard",
    login: "Log in",
    signup: "Sign up",
    logout: "Log out",
    switchLang: "العربية", // the button shows the OTHER language
  },

  roles: {
    superadmin: "admin",
    owner: "owner",
    staff: "staff",
    customer: "customer",
  } satisfies Record<Role, string>,

  home: {
    titleStart: "Bookings for your business, ",
    titleHighlight: "without the phone calls",
    subtitle:
      "Salons, clinics, gyms and training centers get their own booking page. Customers pick a service, a staff member and a free time - no double bookings, ever.",
    book: "Book an appointment",
    createAccount: "Create an account",
  },

  login: {
    title: "Log in",
    subtitle: "Customers, business owners and staff - one login for all.",
    email: "Email",
    password: "Password",
    submit: "Log in",
    submitting: "Logging in...",
    noAccount: "No account?",
    signup: "Sign up",
    demoTitle: "Just looking? Try a demo account",
    demoAs: { customer: "Customer", owner: "Business owner", staff: "Staff" },
  },

  register: {
    title: "Create an account",
    subtitle: "Book appointments at any business on BookFlow.",
    name: "Name",
    email: "Email",
    phone: "Phone",
    password: "Password",
    submit: "Sign up",
    submitting: "Creating account...",
    haveAccount: "Already have an account?",
    login: "Log in",
  },

  registerBusiness: {
    cta: "Own a business? Register it here",
    title: "Register your business",
    subtitle: "Get your own booking page in a minute - free.",
    businessName: "Business name",
    slug: "Booking page link",
    slugHint: "English lowercase letters, numbers and dashes only. You can't change it later.",
    ownerName: "Your name",
    email: "Email",
    phone: "Phone",
    password: "Password",
    submit: "Create my business",
    submitting: "Creating...",
    haveAccount: "Already registered?",
    login: "Log in",
  },

  days: {
    saturday: "Saturday",
    sunday: "Sunday",
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
  } satisfies Record<DayName, string>,

  dashboard: {
    welcome: (name: string, role: string) => `Welcome, ${name} (${role})`,
    publicPage: "Public booking page:",
    copy: "Copy link",
    copied: "Copied ✓",
    tabs: {
      schedule: "Schedule",
      services: "Services",
      staff: "Staff",
      hours: "Working hours",
    },
    schedule: {
      prevDay: "Previous day",
      nextDay: "Next day",
      today: "Today",
      all: "All",
      count: (n: number) => (n === 1 ? "1 appointment" : `${n} appointments`),
      loading: "Loading appointments...",
      empty: "No appointments on this day.",
      with: "with",
      noCustomer: "Deleted account",
      confirm: "Confirm",
      complete: "Completed",
      noShow: "Didn't show up",
      cancel: "Cancel",
      cancelQuestion: "Cancel this appointment?",
      yesCancel: "Yes, cancel",
      keep: "Keep it",
    },
    services: {
      add: "+ Add service",
      empty: "No services yet. Add your first one - customers can't book without services.",
      name: "Name",
      description: "Description",
      price: "Price (₪)",
      duration: "Duration (minutes)",
      hidden: "Hidden",
      hide: "Hide",
      show: "Show again",
      hiddenHint: "Hidden services don't appear on your booking page. Old appointments keep them.",
    },
    staff: {
      add: "+ Add staff member",
      empty: "No staff yet. Customers can't book until you add at least one.",
      hint: "Each staff member logs in with this email and password to see their own schedule.",
      name: "Name",
      email: "Email",
      phone: "Phone",
      password: "Password",
      inactive: "Deactivated",
      deactivate: "Deactivate",
      reactivate: "Reactivate",
    },
    hours: {
      subtitle: "Customers can only book inside these hours.",
      open: "Open",
      closed: "Closed",
      from: "From",
      to: "To",
      save: "Save hours",
      saved: "Saved ✓",
      invalid: "Closing time must be after opening time",
    },
  },

  businesses: {
    title: "Businesses",
    subtitle: "Pick a place to book your appointment.",
    empty: "No businesses yet.",
    bookNow: "Book now →",
  },

  book: {
    notFoundTitle: "Business not found",
    notFoundText: "Check the link - this booking page doesn't exist.",
    loadErrorTitle: "Couldn't load this page",
    subtitle: "Book an appointment in a few clicks.",
    step1: "Choose a service",
    noServices: "This business hasn't added any services yet.",
    step2: "Choose a staff member",
    noStaff: "No staff available right now.",
    step3: "Pick a day",
    today: "Today",
    closed: "Closed",
    step4: (date: string) => `Free times - ${date}`,
    loadingSlots: "Loading free times...",
    closedDay: "Closed on this day.",
    noSlots: (name: string) => `${name} has no free time left on this day. Try another day.`,
    step5: "Confirm",
    service: "Service",
    with: "With",
    when: "When",
    duration: "Duration",
    price: "Price",
    loginToConfirm: "Log in or create a free account to confirm.",
    loginToBook: "Log in to book",
    signup: "Sign up",
    businessAccount: (role: string) =>
      `You're logged in as a business account (${role}). Log in with a customer account to book.`,
    notes: "Notes",
    notesPlaceholder: "Anything the business should know?",
    booking: "Booking...",
    bookFor: (price: string) => `Book for ${price}`,
    taken: "Sorry, someone just booked this time. Please pick another one.",
    bookedTitle: "You're booked!",
    bookedWith: "with",
    bookedAt: (date: string, time: string) => `${date} at ${time}`,
    willConfirm: (business: string) => `${business} will confirm your appointment.`,
    myAppointments: "My appointments",
    bookAnother: "Book another",
  },

  myAppointments: {
    title: "My appointments",
    hi: (name: string) => `Hi ${name} 👋`,
    newBooking: "+ New booking",
    loading: "Loading your appointments...",
    emptyTitle: "No appointments yet",
    emptyText: "Find a business and book your first appointment.",
    browse: "Browse businesses",
    upcoming: (n: number) => `Upcoming (${n})`,
    nothingUpcoming: "Nothing coming up.",
    bookSomething: "Book something",
    past: (n: number) => `Past & cancelled (${n})`,
    with: "with",
    at: "at",
    cancelQuestion: "Cancel this appointment?",
    yesCancel: "Yes, cancel",
    cancelling: "Cancelling...",
    keep: "Keep it",
    cancel: "Cancel appointment",
  },

  status: {
    pending: "Waiting for confirmation",
    confirmed: "Confirmed",
    completed: "Completed",
    cancelled: "Cancelled",
    "no-show": "No-show",
  } satisfies Record<AppointmentStatus, string>,

  // 45 -> "45 min",  90 -> "1h 30min",  60 -> "1h"
  duration: (h: number, m: number) => (h === 0 ? `${m} min` : m === 0 ? `${h}h` : `${h}h ${m}min`),

  // Backend error message (always English) -> text to show. English shows them as they are.
  errors: {} as Record<string, string>,
};

export type Dictionary = typeof en;

const ar: Dictionary = {
  dir: "rtl",
  locale: "ar-u-nu-latn", // Arabic month/day names, but digits stay 0-9

  common: {
    loading: "جاري التحميل...",
    backHome: "العودة للرئيسية",
    optional: "(اختياري)",
    save: "حفظ",
    saving: "جاري الحفظ...",
    cancel: "إلغاء",
    edit: "تعديل",
  },

  nav: {
    businesses: "الأماكن",
    myAppointments: "مواعيدي",
    dashboard: "لوحة التحكم",
    login: "تسجيل الدخول",
    signup: "إنشاء حساب",
    logout: "تسجيل الخروج",
    switchLang: "English",
  },

  roles: {
    superadmin: "مدير النظام",
    owner: "صاحب العمل",
    staff: "موظف",
    customer: "زبون",
  },

  home: {
    titleStart: "حجوزات لعملك، ",
    titleHighlight: "بدون مكالمات هاتفية",
    subtitle:
      "الصالونات والعيادات والنوادي الرياضية ومراكز التدريب تحصل على صفحة حجز خاصة بها. يختار الزبون الخدمة والموظف والوقت المتاح - وبدون أي حجز مزدوج.",
    book: "احجز موعداً",
    createAccount: "أنشئ حساباً",
  },

  login: {
    title: "تسجيل الدخول",
    subtitle: "للزبائن وأصحاب الأعمال والموظفين - تسجيل دخول واحد للجميع.",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    submit: "دخول",
    submitting: "جاري الدخول...",
    noAccount: "ليس لديك حساب؟",
    signup: "أنشئ حساباً",
    demoTitle: "تريد التجربة فقط؟ ادخل بحساب تجريبي",
    demoAs: { customer: "زبون", owner: "صاحب عمل", staff: "موظف" },
  },

  register: {
    title: "إنشاء حساب",
    subtitle: "احجز مواعيدك في أي مكان على BookFlow.",
    name: "الاسم",
    email: "البريد الإلكتروني",
    phone: "رقم الهاتف",
    password: "كلمة المرور",
    submit: "إنشاء الحساب",
    submitting: "جاري إنشاء الحساب...",
    haveAccount: "لديك حساب بالفعل؟",
    login: "سجّل الدخول",
  },

  registerBusiness: {
    cta: "صاحب عمل؟ سجّل عملك من هنا",
    title: "سجّل عملك",
    subtitle: "احصل على صفحة حجز خاصة بك خلال دقيقة - مجاناً.",
    businessName: "اسم العمل",
    slug: "رابط صفحة الحجز",
    slugHint: "أحرف إنجليزية صغيرة وأرقام وشرطات فقط. لا يمكن تغييره لاحقاً.",
    ownerName: "اسمك",
    email: "البريد الإلكتروني",
    phone: "رقم الهاتف",
    password: "كلمة المرور",
    submit: "إنشاء العمل",
    submitting: "جاري الإنشاء...",
    haveAccount: "مسجّل بالفعل؟",
    login: "سجّل الدخول",
  },

  days: {
    saturday: "السبت",
    sunday: "الأحد",
    monday: "الاثنين",
    tuesday: "الثلاثاء",
    wednesday: "الأربعاء",
    thursday: "الخميس",
    friday: "الجمعة",
  },

  dashboard: {
    welcome: (name, role) => `أهلاً ${name} (${role})`,
    publicPage: "صفحة الحجز العامة:",
    copy: "نسخ الرابط",
    copied: "تم النسخ ✓",
    tabs: {
      schedule: "المواعيد",
      services: "الخدمات",
      staff: "الموظفون",
      hours: "ساعات العمل",
    },
    schedule: {
      prevDay: "اليوم السابق",
      nextDay: "اليوم التالي",
      today: "اليوم",
      all: "الكل",
      count: (n) => (n === 1 ? "موعد واحد" : n === 2 ? "موعدان" : `${n} مواعيد`),
      loading: "جاري تحميل المواعيد...",
      empty: "لا توجد مواعيد في هذا اليوم.",
      with: "مع",
      noCustomer: "حساب محذوف",
      confirm: "تأكيد",
      complete: "مكتمل",
      noShow: "لم يحضر",
      cancel: "إلغاء",
      cancelQuestion: "إلغاء هذا الموعد؟",
      yesCancel: "نعم، ألغِه",
      keep: "لا، أبقِه",
    },
    services: {
      add: "+ إضافة خدمة",
      empty: "لا توجد خدمات بعد. أضف خدمتك الأولى - لا يمكن للزبائن الحجز بدون خدمات.",
      name: "الاسم",
      description: "الوصف",
      price: "السعر (₪)",
      duration: "المدة (بالدقائق)",
      hidden: "مخفية",
      hide: "إخفاء",
      show: "إظهار",
      hiddenHint: "الخدمات المخفية لا تظهر في صفحة الحجز، والمواعيد القديمة تبقى كما هي.",
    },
    staff: {
      add: "+ إضافة موظف",
      empty: "لا يوجد موظفون بعد. لا يمكن للزبائن الحجز قبل إضافة موظف واحد على الأقل.",
      hint: "كل موظف يسجّل الدخول بهذا البريد وكلمة المرور ليرى مواعيده.",
      name: "الاسم",
      email: "البريد الإلكتروني",
      phone: "رقم الهاتف",
      password: "كلمة المرور",
      inactive: "معطّل",
      deactivate: "تعطيل",
      reactivate: "إعادة تفعيل",
    },
    hours: {
      subtitle: "يمكن للزبائن الحجز ضمن هذه الساعات فقط.",
      open: "مفتوح",
      closed: "مغلق",
      from: "من",
      to: "إلى",
      save: "حفظ الساعات",
      saved: "تم الحفظ ✓",
      invalid: "وقت الإغلاق يجب أن يكون بعد وقت الفتح",
    },
  },

  businesses: {
    title: "الأماكن",
    subtitle: "اختر مكاناً لحجز موعدك.",
    empty: "لا توجد أماكن بعد.",
    bookNow: "احجز الآن ←",
  },

  book: {
    notFoundTitle: "المكان غير موجود",
    notFoundText: "تأكد من الرابط - صفحة الحجز هذه غير موجودة.",
    loadErrorTitle: "تعذّر تحميل الصفحة",
    subtitle: "احجز موعدك بخطوات بسيطة.",
    step1: "اختر الخدمة",
    noServices: "لم يُضف هذا المكان أي خدمات بعد.",
    step2: "اختر الموظف",
    noStaff: "لا يوجد موظفون متاحون حالياً.",
    step3: "اختر اليوم",
    today: "اليوم",
    closed: "مغلق",
    step4: (date) => `الأوقات المتاحة - ${date}`,
    loadingSlots: "جاري تحميل الأوقات المتاحة...",
    closedDay: "مغلق في هذا اليوم.",
    noSlots: (name) => `لا يوجد وقت متاح لدى ${name} في هذا اليوم. جرّب يوماً آخر.`,
    step5: "تأكيد الحجز",
    service: "الخدمة",
    with: "مع",
    when: "الموعد",
    duration: "المدة",
    price: "السعر",
    loginToConfirm: "سجّل الدخول أو أنشئ حساباً مجانياً لتأكيد الحجز.",
    loginToBook: "سجّل الدخول للحجز",
    signup: "إنشاء حساب",
    businessAccount: (role) => `أنت مسجّل بحساب عمل (${role}). سجّل الدخول بحساب زبون لتتمكن من الحجز.`,
    notes: "ملاحظات",
    notesPlaceholder: "هل هناك شيء يجب أن يعرفه المكان؟",
    booking: "جاري الحجز...",
    bookFor: (price) => `احجز بـ ${price}`,
    taken: "عذراً، تم حجز هذا الوقت للتو. اختر وقتاً آخر.",
    bookedTitle: "تم الحجز!",
    bookedWith: "مع",
    bookedAt: (date, time) => `${date} الساعة ${time}`,
    willConfirm: (business) => `سيقوم ${business} بتأكيد موعدك.`,
    myAppointments: "مواعيدي",
    bookAnother: "حجز موعد آخر",
  },

  myAppointments: {
    title: "مواعيدي",
    hi: (name) => `أهلاً ${name} 👋`,
    newBooking: "+ حجز جديد",
    loading: "جاري تحميل مواعيدك...",
    emptyTitle: "لا توجد مواعيد بعد",
    emptyText: "اختر مكاناً واحجز موعدك الأول.",
    browse: "تصفّح الأماكن",
    upcoming: (n) => `القادمة (${n})`,
    nothingUpcoming: "لا توجد مواعيد قادمة.",
    bookSomething: "احجز موعداً",
    past: (n) => `السابقة والملغاة (${n})`,
    with: "مع",
    at: "في",
    cancelQuestion: "هل تريد إلغاء هذا الموعد؟",
    yesCancel: "نعم، ألغِ الموعد",
    cancelling: "جاري الإلغاء...",
    keep: "لا، أبقِه",
    cancel: "إلغاء الموعد",
  },

  status: {
    pending: "بانتظار التأكيد",
    confirmed: "مؤكد",
    completed: "مكتمل",
    cancelled: "ملغى",
    "no-show": "لم يحضر",
  },

  // 45 -> "45 دقيقة",  60 -> "ساعة",  90 -> "ساعة و30 دقيقة",  120 -> "ساعتان"
  duration: (h, m) => {
    const hours = h === 1 ? "ساعة" : h === 2 ? "ساعتان" : `${h} ساعات`;
    if (h === 0) return `${m} دقيقة`;
    return m === 0 ? hours : `${hours} و${m} دقيقة`;
  },

  // Keys = the EXACT English message the backend sends.
  // A message that isn't here is shown in English (better than showing nothing).
  errors: {
    // frontend (lib/api.ts)
    "Can't reach the server. Is the backend running?": "تعذّر الاتصال بالخادم. تأكد أن الخادم يعمل.",
    "Something went wrong": "حدث خطأ ما، حاول مرة أخرى",
    // auth
    "Invalid credentials": "البريد الإلكتروني أو كلمة المرور غير صحيحة",
    "email and password are required": "البريد الإلكتروني وكلمة المرور مطلوبان",
    "name, email and password are required": "الاسم والبريد الإلكتروني وكلمة المرور مطلوبة",
    "Email already exists": "هذا البريد الإلكتروني مستخدم بالفعل",
    "email already exists": "هذا البريد الإلكتروني مستخدم بالفعل",
    "Account is disabled": "هذا الحساب معطّل",
    "Not authorized, no token": "يجب تسجيل الدخول أولاً",
    "Not authorized, invalid token": "انتهت الجلسة، سجّل الدخول من جديد",
    "User no longer exists": "هذا المستخدم لم يعد موجوداً",
    "You do not have permission to perform this action": "ليس لديك صلاحية للقيام بهذا الإجراء",
    "Too many login attempts, please try again in 15 minutes": "محاولات دخول كثيرة، حاول مجدداً بعد 15 دقيقة",
    "Too many accounts created from this IP, please try again later": "تم إنشاء حسابات كثيرة من هذا الجهاز، حاول لاحقاً",
    "Too many requests, please slow down": "طلبات كثيرة، تمهّل قليلاً",
    // validation (shown one by one from `errors`)
    "Validation failed": "البيانات المدخلة غير صحيحة",
    "Please provide a valid email": "أدخل بريداً إلكترونياً صحيحاً",
    "Password must be at least 8 characters": "يجب أن تكون كلمة المرور 8 أحرف على الأقل",
    "Name is required": "الاسم مطلوب",
    "Email is required": "البريد الإلكتروني مطلوب",
    "Password is required": "كلمة المرور مطلوبة",
    "Notes are too long": "الملاحظات طويلة جداً",
    // booking
    "Business not found": "المكان غير موجود",
    "Service not found": "الخدمة غير موجودة",
    "Staff member not found": "الموظف غير موجود",
    "This staff member is already booked at that time": "هذا الموظف محجوز في هذا الوقت",
    "This time is outside working hours": "هذا الوقت خارج ساعات العمل",
    "You can't book a time in the past": "لا يمكن الحجز في وقت مضى",
    // my appointments
    "Appointment not found": "الموعد غير موجود",
    "You can't cancel an appointment that has already started": "لا يمكن إلغاء موعد بدأ بالفعل",
    "Can't cancel an appointment that is completed": "لا يمكن إلغاء موعد مكتمل",
    "Can't cancel an appointment that is cancelled": "هذا الموعد ملغى بالفعل",
    "Can't cancel an appointment that is no-show": "لا يمكن إلغاء موعد لم يحضره الزبون",
    "This appointment was changed by someone else, please reload": "تم تعديل هذا الموعد من شخص آخر، حدّث الصفحة",
    // business sign-up
    "businessName, slug, ownerName, email and password are required": "جميع الحقول مطلوبة ما عدا رقم الهاتف",
    "This business URL is already taken": "رابط صفحة الحجز هذا مستخدم بالفعل، اختر رابطاً آخر",
    "slug already exists": "رابط صفحة الحجز هذا مستخدم بالفعل، اختر رابطاً آخر",
    "Slug is required": "رابط صفحة الحجز مطلوب",
    "Slug must be at least 3 characters": "الرابط يجب أن يكون 3 أحرف على الأقل",
    "Slug must be at most 40 characters": "الرابط يجب ألا يزيد عن 40 حرفاً",
    "Slug can only contain lowercase letters, numbers and dashes": "الرابط يقبل فقط أحرفاً إنجليزية صغيرة وأرقاماً وشرطات",
    "Tenant name is required": "اسم العمل مطلوب",
    // dashboard
    "This action requires a business account": "هذا الإجراء يتطلب حساب عمل",
    "This business account is disabled": "حساب هذا العمل معطّل",
    "name already exists": "هذا الاسم مستخدم بالفعل",
    "Service name is required": "اسم الخدمة مطلوب",
    "Service name is too long": "اسم الخدمة طويل جداً",
    "Description is too long": "الوصف طويل جداً",
    "Price is required": "السعر مطلوب",
    "Price cannot be negative": "السعر لا يمكن أن يكون سالباً",
    "Duration is required": "المدة مطلوبة",
    "Duration must be at least 5 minutes": "المدة يجب أن تكون 5 دقائق على الأقل",
    "Duration cannot exceed 8 hours": "المدة لا يمكن أن تتجاوز 8 ساعات",
    "Can't mark as completed before the appointment starts": "لا يمكن وضع \"مكتمل\" قبل بدء الموعد",
    "Can't mark as no-show before the appointment starts": "لا يمكن وضع \"لم يحضر\" قبل بدء الموعد",
    "Can't mark as confirmed after the appointment started": "لا يمكن تأكيد موعد بدأ بالفعل",
    "Can't mark as cancelled after the appointment started": "لا يمكن إلغاء موعد بدأ بالفعل",
  },
};

export const dictionaries: Record<Lang, Dictionary> = { en, ar };
