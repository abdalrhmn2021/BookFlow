// ============================================================
// التوكن بـ httpOnly cookie (بدل localStorage بالمتصفح)
// ============================================================
// httpOnly -> JavaScript بالصفحة ما بيقدر يقرأ التوكن أبداً.
//             فحتى لو صار XSS (كود خبيث انحقن بالصفحة) ما بيقدر يسرقه.
// secure   -> بالإنتاج الكوكي بتنبعث على https بس.
// sameSite -> "lax": المتصفح ما بيبعث الكوكي مع POST جاي من موقع ثاني
//             (حماية من CSRF). الواجهة والـ API على نفس الدومين (Next.js rewrites)
//             فـ lax ما بيأثر علينا.
const jwt = require("jsonwebtoken");

const COOKIE_NAME = "bookflow_token";

const baseOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
});

// الكوكي بتنتهي بنفس لحظة انتهاء التوكن (exp جوا الـ JWT)
exports.setAuthCookie = (res, token) => {
  const { exp } = jwt.decode(token);
  res.cookie(COOKIE_NAME, token, { ...baseOptions(), expires: new Date(exp * 1000) });
};

exports.clearAuthCookie = (res) => {
  res.clearCookie(COOKIE_NAME, baseOptions());
};

// قراءة الكوكي من الـ header بدون مكتبة إضافية:
// "lang=ar; bookflow_token=eyJ..." -> "eyJ..."
exports.readAuthCookie = (req) => {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE_NAME) return decodeURIComponent(rest.join("="));
  }
  return null;
};

exports.COOKIE_NAME = COOKIE_NAME;
