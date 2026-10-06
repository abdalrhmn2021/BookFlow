import type { NextConfig } from "next";

// وين السيرفر (Express)؟ بدون /api بالآخر.
// API_URL هو الجديد. NEXT_PUBLIC_API_URL القديم لسا شغال (منشيل منه /api)
// عشان الموقع المنشور ما يخرب لو ما غيّرت إعدادات Vercel.
const API_ORIGIN = (
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/?$/, "") ??
  "http://localhost:5000"
).replace(/\/$/, "");

const nextConfig: NextConfig = {
  // كل طلب لـ /api/... على الواجهة، Next.js بيمرّره للسيرفر الحقيقي.
  // ليش؟ عشان المتصفح يشوف الواجهة والـ API على نفس الدومين:
  // الكوكي httpOnly (اللي فيها التوكن) بتشتغل بكل المتصفحات،
  // بينما الكوكي بين دومينين مختلفين (vercel.app <-> onrender.com) بتنحجب بـ Safari وغيره.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default nextConfig;
