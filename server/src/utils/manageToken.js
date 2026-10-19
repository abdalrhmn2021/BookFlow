// ============================================================
// رابط "إدارة حجزي" للضيف (Guest manage-booking link)
// ============================================================
// الضيف ما عنده حساب ولا باسورد. فكيف نعرف إنه هو صاحب الحجز لما يرجع؟
// بنعطيه وقت الحجز "مفتاح" سري عشوائي داخل رابط:  /booking/<token>
// اللي معه الرابط = صاحب الحجز (نفس فكرة رابط "نسيت كلمة المرور").
//
// القواعد:
//   1) الـ token عشوائي وطويل (24 byte = 192 bit) -> مستحيل حدا يخمّنه،
//      حتى لو جرّب مليار مرة بالثانية لمليارات السنين.
//   2) بالداتابيس منحفظ الـ HASH بس، مش الـ token نفسه - زي الباسورد.
//      لو حدا سرق نسخة من الداتابيس، ما بيقدر يفتح ولا حجز.
//   3) SHA-256 (مش bcrypt) كافي هون: bcrypt بطيء عن قصد لأنه الباسوردات
//      ضعيفة وسهلة التخمين. الـ token عشوائي وقوي أصلاً، فما في شي نحميه بالبطء،
//      وبنحتاج نلاقي الحجز بالـ hash مباشرة (findOne) - هاد ما بيزبط مع bcrypt.
// ============================================================
const crypto = require("crypto");

const TOKEN_BYTES = 24;
// base64url = حروف وأرقام و - و _ بس، فبيمشي جوا الرابط بدون أي ترميز.
// 24 byte -> بالضبط 32 حرف.
const TOKEN_REGEX = /^[A-Za-z0-9_-]{32}$/;

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

// { token: يروح للضيف مرة وحدة بس,  hash: ينحفظ بالداتابيس }
function createManageToken() {
  const token = crypto.randomBytes(TOKEN_BYTES).toString("base64url");
  return { token, hash: hashToken(token) };
}

// "0599123456" -> "*******456" : صاحب الرابط بيعرف رقمه، والباقي ما بيلزم يشوفه
const maskPhone = (phone) =>
  typeof phone === "string" && phone.length > 3 ? "*".repeat(phone.length - 3) + phone.slice(-3) : "***";

module.exports = { TOKEN_REGEX, hashToken, createManageToken, maskPhone };
