# Mutqan Work Journal — السجل التاريخي للجلسات

> Append-only. لا تعدّل دخولات قديمة. أحدث جلسة في الأعلى.
> إدخال واحد قصير لكل جلسة (≤10 أسطر). للتفاصيل التقنية، راجع commit message.
> الحالة الحالية والخطوة التالية تعيش في `ai-handoff.md`، لا هنا.

---

## 2026-05-09 — Codex — (commit pending)
Tags: #brand #ui #docs
**هدف:** صقل تطبيق Brand v2 على صفحة الهبوط والصفحات العامة/الدخول ومعالجة تبديل الشعار في الوضع الداكن.
**أُنجز:** توحيد الألوان مع Brand v2، تخفيف زحمة الهبوط ومعاينة المنتج، تفعيل شعار مناسب للفاتح/الداكن في SiteNav/SiteFooter/PlatformSidebar، وتوحيد legal pages مع SiteNav/SiteFooter.
**ملفات:** `src/pages/LandingPage.tsx`, `src/pages/site/*`, `src/pages/auth/*`, `src/components/site/*`, `src/components/layout/*`, `docs/ops/ai-handoff.md`, `docs/ops/work-journal.md`.
**التحقق:** ✅ `npm run build`; ✅ `npm run lint` بلا أخطاء (تحذيرات قديمة موجودة)؛ ✅ لا `flowmark` داخل `src`.
**التالي:** مراجعة بصرية في المتصفح للوضع الفاتح/الداكن ثم فصل التغييرات عن أي ملفات غير مرتبطة قبل commit أو PR.

## 2026-05-08 — Codex — (commit pending)
Tags: #sales #pilot #ops #docs
**هدف:** تحويل بيانات HubSpot الفعلية إلى نواة CRM صالحة لأول Pilot دون لمس الكود أو التصميم.
**أُنجز:** قراءة HubSpot، إنشاء 4 Companies حقيقية، ربطها بـ 4 Contacts، وإنشاء 4 Tasks لإرسال أول رسالة Pilot بتاريخ 2026-05-10.
**ملفات:** `docs/ops/ai-handoff.md`, `docs/ops/work-journal.md`.
**التحقق:** ✅ تحقق HubSpot بعد الإنشاء؛ ⏭ لا build/lint لأن العمل CRM + توثيق فقط.
**التالي:** إرسال أول 4 رسائل، ثم إنشاء Deal فقط بعد الإرسال أو ظهور اهتمام حقيقي.

## 2026-05-08 — Codex — (commit pending)
Tags: #sales #pilot #ops #docs
**هدف:** تجهيز HubSpot Sales Setup وأول 10 حسابات ورسائل Pilot ضمن مسار Sales/Pilot فقط.
**أُنجز:** إنشاء ملف HubSpot pipeline/properties، جدول أول 10 حسابات، رسائل مخصصة، متابعة 3 أيام، ومسار رسالة→اكتشاف→ديمو→عرض→تحصيل 50%.
**ملفات:** `docs/sales/hubspot-first-10-sales-motion-ar.md`, `docs/ops/ai-handoff.md`, `docs/ops/work-journal.md`.
**التحقق:** ⏭ لا build/lint لأن التغيير توثيقي فقط؛ تم الالتزام بعدم لمس الكود أو migrations أو التصميم.
**التالي:** إدخال أسماء الأشخاص وقنوات التواصل، ثم تنفيذ الدفعة الأولى في HubSpot.

## 2026-05-07 — Codex — (commit pending)
Tags: #sales #pilot #ops #docs
**هدف:** تثبيت قرارات خالد التجارية 1-6 والعودة لنطاق Codex دون التداخل مع عمل Claude الأمني.
**أُنجز:** تحديث snapshot بهدف cash collected، HubSpot، حد Pilot الأدنى 15,000 ريال، القطاع الأول، إرسال أول 10 رسائل هذا الأسبوع، وتأجيل runway.
**ملفات:** `docs/strategy/state-of-mutqan-2026-05.md`, `docs/ops/ai-handoff.md`, `docs/ops/work-journal.md`.
**التحقق:** ⏭ لا build/lint لأن التغيير توثيقي فقط؛ تم حصر النطاق والرجوع عن مسار useTenants/migration غير المكتمل.
**التالي:** تجهيز خطة تنفيذ أول 10 رسائل في HubSpot بعد اعتماد شروط عرض 12,000 وقنوات التواصل.

## 2026-05-07 — Codex — (commit pending)
Tags: #pilot #sales #ops #docs
**هدف:** إنتاج snapshot موحدة لحالة متقن من زاوية Pilot/Sales/Ops وربطها بهدف cash flow.
**أُنجز:** إنشاء `state-of-mutqan-2026-05.md`، تلخيص الجاهزية التجارية والتشغيلية، تحديد 3 فجوات كبرى و3 مسارات تنفيذية، وتوثيق أسئلة خالد المالية.
**ملفات:** `docs/strategy/state-of-mutqan-2026-05.md`, `docs/ops/ai-handoff.md`, `docs/ops/work-journal.md`.
**التحقق:** ⏭ لا build/lint لأن التغيير توثيقي فقط؛ تم التحقق قراءة من الوثائق والملفات المرتبطة بالمخاطر.
**التالي:** إضافة مساهمة Claude في Product/UI/Brand ثم تثبيت هدف المبيعات والـ CRM مع خالد.

## 2026-05-07 — Claude Code — (commit pending)
Tags: #ops #docs
**هدف:** تأسيس نظام استمرارية العمل بين الوكلاء (v1.5).
**أُنجز:** إنشاء `ai-handoff.md` و `work-journal.md`، وإضافة قسم في `CONSTITUTION.md` يثبّت النظام كقاعدة. مفردات Tags و Active Areas موحّدة.
**ملفات:** `docs/ops/ai-handoff.md` (جديد)، `docs/ops/work-journal.md` (جديد)، `docs/CONSTITUTION.md` (إضافة قسم).
**التحقق:** ⏭ N/A — مهمة توثيق، لا كود.
**التالي:** خالد يبلّغ Codex بالنظام، ثم نختار أول مسار تنفيذي حقيقي.
