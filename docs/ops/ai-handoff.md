# Mutqan AI Handoff — آخر تسليم نشط

> آخر حالة فقط. التاريخ الكامل في `work-journal.md`.
> هذا الملف يستبدل بالكامل في نهاية كل جلسة.

**التاريخ:** 2026-05-08
**الوكيل:** Codex
**الفرع:** codex/logo-usage-system
**آخر commit:** commit pending في هذا الفرع، مبني على `7c8e379`

## Current Active Areas
- **Primary:** BRAND
- Secondary: UI, PRODUCT, OPS

Tags: #brand #ui #product #ops

## السياق الاستراتيجي
- North Star → `docs/strategy/mutqan-company-os.md`
- Sprint → `docs/strategy/pilot-v1-scope.md`
- قرارات مقفلة → `docs/CONSTITUTION.md`
- Brand foundation → `docs/brand/`

## ما أُنجز في هذه الجلسة
- ضبطت نظام استخدام شعار متقن مركزيًا داخل `MutqanLogo` بدل الاعتماد على تعديلات حجم محلية في الصفحات.
- اللون الملون يستخدم على الخلفيات الفاتحة العامة، والأسود يستخدم للنسخة الأحادية/الرسمية، والنسخة البيضاء تنتج من الـ vector الأسود عبر CSS على الخلفيات الداكنة لتفادي ملفات white raster ذات whitespace.
- قصصت عرض الرمز داخل المكوّن وقت العرض فقط لأن ملف الرمز الملوّن مصدره wide viewBox، بدون تعديل ملف SVG الأصلي.
- خففت شعار صفحة الهبوط في الهيدر وأزلت descriptor من الهيدر حتى لا يكبر اللوقو أو يزاحم CTA.
- جعلت صفحات الخصوصية والشروط تستخدم النسخة الأحادية السوداء لأنها سياق رسمي/مستندي.

## ملفات لُمست
- `src/components/ui/MutqanLogo.tsx` — قواعد اختيار النسخة، المقاسات، وقص الرمز في مساحات icon.
- `src/components/site/SiteNav.tsx` — استخدام lockup ملون/أبيض بحجم هيدر مناسب دون override محلي.
- `src/components/layout/AuthLayout.tsx` — إزالة override غير فعال لحجم الرمز والاعتماد على نظام المقاسات المركزي.
- `src/pages/site/PrivacyPolicyPage.tsx` — استخدام النسخة الأحادية الرسمية.
- `src/pages/site/TermsOfUsePage.tsx` — استخدام النسخة الأحادية الرسمية.
- `docs/ops/ai-handoff.md` — تحديث التسليم النشط.
- `docs/ops/work-journal.md` — إضافة سجل مختصر للجلسة.

## ملفات حساسة لم تُلمس
- `supabase/migrations/*`
- `docs/CONSTITUTION.md`

## التحقق
- ✅ `npm run build` نجح.
- ✅ `npm run lint` نجح مع 0 errors و219 warnings موجودة مسبقًا.
- ⏭ لم يكتمل التقاط screenshot آلي؛ Chrome headless تعثر محليًا، لذلك يبقى الفحص البصري النهائي مطلوبًا من المتصفح.

## الحالة الحالية
استخدام الشعار الآن أوضح: الملون للواجهات الفاتحة، الأبيض للداكن عبر vector موثوق، الأسود للصفحات الرسمية، والرمز فقط للمساحات الضيقة مثل collapsed sidebar وشاشات الدخول الصغيرة. البناء سليم ولا توجد أخطاء lint، لكن القرار البصري النهائي يحتاج نظرة خالد على الهيدر والـ sidebar بعد التحديث.

## أفضل خطوة تالية
1. افتح صفحة الهبوط وتأكد أن شعار الهيدر صار أهدأ ولا يزاحم أزرار التنقل.
2. افتح المنتج والـ platform sidebar بحالتي expanded/collapsed وتأكد أن الرمز لا يظهر مقصوصًا أو صغيرًا.
3. إذا اعتمد الشكل، ادمج الفرع في main مع فرع إصلاح الخروج أو بعده حسب ترتيب PRs.

## أسئلة مفتوحة لخالد
- هل تفضّل أن يظهر descriptor أسفل الشعار في الفوتر فقط، أم نحذفه من كل المواضع العامة ونخليه للمواد التسويقية؟

## تحذيرات للوكيل التالي
- لا تستخدم `mutqan-logo-white.svg` أو `mutqan-symbol-white.svg` في واجهة المنتج قبل إعادة تصديرها كـ vector نظيف؛ الملفات الحالية raster/مصدّرة بشكل غير مثالي.
- لا تضبط أحجام الشعار عبر selectors محلية مثل `[&_[role=img]]` إلا لسبب قاهر؛ المقاس يجب أن يأتي من `MutqanLogo`.
- هذا الفرع مبني فوق commit إصلاح logout `7c8e379`.
