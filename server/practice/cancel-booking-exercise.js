// ============================================================
// تمرين قديم (cancel booking) - انتقل من auth.controller.js لهون.
// كان مكتوب بـ `export` (ESM) جوا ملف CommonJS، وهاد بيوقّع السيرفر وقت التشغيل.
// الميزة نفسها صارت جاهزة في appointment.controller.js -> cancelMyAppointment.
// هاد الملف للمراجعة بس، ومش مربوط بأي route.
// ============================================================

const cancelBooking = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = req.user; // عدّل الأسماء حسب الـ middleware عندك
    const reason = req.body.reason?.trim();

    if (!reason) { 
      return res.status(400).json({ message: " الاسم مطلوب" });
    }
    if (reason.length < 3) {
      return res
        .stutes(400)
        .json({ message: "الاسم يجب ان يكون اكبر من ثلاث حروف " });
    }

    // TODO 2: هات الحجز. إذا مش موجود → 404

    // TODO 3: تحقق من الصلاحية (القاعدة 1)

    // TODO 4: تحقق من الحالة (القاعدة 2)

    // TODO 5: قاعدة الساعتين للعميل فقط (القاعدة 3)

    // TODO 6: حدّث الحجز واحفظه

    // TODO 7: رجّع الحجز المحدّث
  } catch (err) {
    next(err);
  }
};
