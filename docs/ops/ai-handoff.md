# Mutqan AI Handoff — آخر تسليم نشط

> ⚠️ هذا الملف يمثل آخر حالة فقط. التاريخ الكامل في `work-journal.md`.
> يُستبدل بالكامل في نهاية كل جلسة. لا تُلحق فيه — استبدله.

**التاريخ:** 2026-05-09
**الوكيل:** Codex
**الفرع:** codex/pilot-sales-ops-snapshot
**آخر commit:** (commit pending) — Brand v2 public/app surfaces polish

## Current Active Areas
- **Primary:** BRAND
- Secondary: UI, DOCS

Tags: #brand #ui #docs

## السياق الاستراتيجي
- North Star → `docs/strategy/mutqan-company-os.md`
- Sprint الحالي → `docs/strategy/pilot-v1-scope.md`
- قرارات مقفلة → `docs/CONSTITUTION.md`
- Brand foundation → `docs/brand/`
- Brand v2 reference → `docs/brand/v2/`
- Operating model → `docs/ops/ai-executive-operating-model.md`

## ما أُنجز في هذه الجلسة
- تحسين تطبيق Brand v2 على صفحة الهبوط والصفحات العامة التابعة لها.
- تخفيف زحمة صفحة الهبوط عبر تقليل كثافة hero، workflow، ومعاينة المنتج، مع الحفاظ على القصة التجارية الأساسية.
- توحيد ألوان الصفحات العامة وصفحات الدخول مع مرجع Brand v2: الفحمي `#0b1320`، التركواز `#00b2a9`، والخلفيات/الحدود من متغيرات `--mutqan-*`.
- إصلاح اختيار الشعار حسب الوضع الفاتح/الداكن في `SiteNav` و`SiteFooter` و`PlatformSidebar`.
- تثبيت خلفية `Sidebar` الأساسية على فحمي Brand v2 حتى لا تنقلب بشكل خاطئ في الوضع الداكن.
- إعادة legal pages إلى chrome موحد باستخدام `SiteNav` و`SiteFooter` بدل تكرار شكل مستقل.
- تحديث صفحات الدخول والتسجيل واستعادة كلمة المرور لتستخدم ألوان Brand v2 بدل الألوان القديمة.

## ملفات لُمست
- `src/pages/LandingPage.tsx` — صقل صفحة الهبوط وتقليل الزحمة وتطبيق Brand v2.
- `src/pages/site/AboutPage.tsx` — توحيد hero والألوان مع Brand v2.
- `src/pages/site/ContactPage.tsx` — توحيد الخلفيات والأزرار والحقول مع Brand v2.
- `src/pages/site/PrivacyPolicyPage.tsx` — استخدام chrome موحد وسطح Brand v2.
- `src/pages/site/TermsOfUsePage.tsx` — استخدام chrome موحد وسطح Brand v2.
- `src/pages/auth/LoginPage.tsx` — تحديث ألوان Brand v2.
- `src/pages/auth/ForgotPasswordPage.tsx` — تحديث ألوان Brand v2.
- `src/pages/auth/RegisterPage.tsx` — تحديث ألوان Brand v2.
- `src/pages/auth/CompleteRegistrationPage.tsx` — تحديث ألوان Brand v2.
- `src/components/site/SiteNav.tsx` — اختيار شعار مناسب للوضع الداكن/الفاتح وتخفيف الحجم.
- `src/components/site/SiteFooter.tsx` — اختيار شعار مناسب للوضع الداكن/الفاتح وتحديث ألوان Brand v2.
- `src/components/site/LanguageToggle.tsx` — تحديث accent واستعادة النص العربي الصحيح.
- `src/components/layout/PlatformSidebar.tsx` — تمرير theme مناسب لشعار متقن.
- `src/components/layout/Sidebar.tsx` — تثبيت لون الشريط الجانبي على فحمي Brand v2.
- `src/components/layout/AuthLayout.tsx` — تحديث خلفية صفحات المصادقة.
- `docs/ops/ai-handoff.md` — استبدال كامل بآخر حالة نشطة.
- `docs/ops/work-journal.md` — إضافة دخول جديد للجلسة.

## ملفات حساسة لم تُلمس
- `supabase/migrations/*` — لم تُلمس.
- `docs/CONSTITUTION.md` — لم يُعدل.
- `src/hooks/useTenants.ts` — لم يُلمس في هذه الجلسة؛ ظهوره في `git status` سابق/خارج هذا النطاق.
- `docs/sales/pilot-package/README-ar.md` — لم يُلمس في هذه الجلسة؛ تغييره سابق/خارج هذا النطاق.
- ملفات `docs/brand/*` غير المتعقبة — لم تُلمس في هذه الجلسة.

## التحقق
- ✅ `npm run build` — نجح.
- ✅ `npm run lint` — نجح بلا أخطاء؛ توجد تحذيرات قديمة غير مرتبطة بهذا العمل.
- ✅ فحص عدم وجود `flowmark` داخل `src` — لا يظهر في المنتج.
- ✅ فحص بقايا الألوان القديمة في الأسطح التي لُمست — لا توجد بقايا في النطاق المستهدف.
- ✅ فحص سريع للنصوص العربية الحساسة بعد التعديل — لا توجد مؤشرات mojibake في الملفات التي لُمست.

## الحالة الحالية
تطبيق Brand v2 أصبح أوضح على صفحة الهبوط والصفحات العامة وصفحات الدخول، والشعار الآن يختار النسخة المناسبة في الأسطح الرئيسية عند تغيّر الوضع الفاتح أو الداكن. ما زال يلزم إجراء مراجعة بصرية نهائية في المتصفح قبل النشر، خصوصًا على أحجام شاشة مختلفة، لأن هذا العمل صقل بصري واسع نسبيًا ولم يتم التقاط screenshots نهائية داخل الجلسة.

## أفضل خطوة تالية
1. فتح صفحة الهبوط والصفحات التابعة في المتصفح ومراجعة الوضع الفاتح/الداكن بصريًا.
2. بعد الموافقة البصرية، فصل تغييرات Brand/UI عن الملفات غير المرتبطة قبل أي commit أو PR.
3. استكمال صقل باقي صفحات المنتج بعد صفحات الديمو الثلاث حسب قرار خالد.

## أسئلة مفتوحة لخالد
- هل تريد اعتماد هذه الحزمة كـ commit مستقل للـ Brand/UI بعد المراجعة البصرية؟
- هل نبدأ بعدها مباشرة بمراجعة صفحات الديمو الثلاث داخل التطبيق أم نكمل أولًا الصفحات العامة؟

## تحذيرات للوكيل التالي
- لا تخلط هذا المسار مع شغل Claude الأمني أو `useTenants.ts`.
- لا تلمس `supabase/migrations/*` أو `docs/CONSTITUTION.md` بدون إذن خالد.
- working tree يحتوي تغييرات غير مرتبطة كانت موجودة قبل هذه الجلسة؛ راجع `git status` قبل أي staging.
- لا تعتمد على terminal output العربي وحده، لأنه قد يظهر mojibake بسبب ترميز PowerShell؛ افحص الملف نفسه أو diff عند الحاجة.
