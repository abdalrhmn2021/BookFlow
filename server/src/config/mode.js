// ============================================================
// وضع "بزنس واحد" (Single-business mode)
// ============================================================
// BookFlow مبني كمنصة لكثير من البزنسات (multi-tenant).
// لما نبيعه لصالون أو عيادة وحدة، بدنا نسكّر المنصة عليهم بس:
//   - ما حدا يقدر يسجّل بزنس ثاني على نسختهم
//   - قائمة البزنسات بتعرض بزنسهم بس
//
// التشغيل: حط بالـ .env
//   SINGLE_BUSINESS_SLUG=my-salon
// ولو المتغير فاضي أو مش موجود -> المنصة بتشتغل عادي (multi-tenant).

const SINGLE_BUSINESS_SLUG =
  process.env.SINGLE_BUSINESS_SLUG?.trim().toLowerCase() || null;

module.exports = { SINGLE_BUSINESS_SLUG };
