# Mutqan AI Handoff — آخر تسليم نشط

> آخر حالة فقط. التاريخ الكامل في `work-journal.md`.
> هذا الملف يستبدل بالكامل في نهاية كل جلسة.

**التاريخ:** 2026-05-08
**الوكيل:** Codex
**الفرع:** codex/logout-session-logo-fix
**آخر commit:** commit pending في هذا الفرع، مبني على `82db187`

## Current Active Areas
- **Primary:** PRODUCT
- Secondary: BRAND, UI, SUPABASE, OPS

Tags: #product #brand #ui #supabase #ops

## السياق الاستراتيجي
- North Star → `docs/strategy/mutqan-company-os.md`
- Sprint → `docs/strategy/pilot-v1-scope.md`
- قرارات مقفلة → `docs/CONSTITUTION.md`
- Brand foundation → `docs/brand/`

## ما أُنجز في هذه الجلسة
- عالجت مشكلة الخروج التي كانت تسمح ببقاء أثر جلسة Supabase في التخزين المحلي، ما قد يجعل الصفحة الرئيسية تعيد المستخدم إلى `/platform` بعد تسجيل الخروج.
- أصبح `signOut` يستدعي Supabase بنطاق `global` ثم ينظف مفاتيح `sb-*` و`currentTenantId` في كل الأحوال حتى لو فشل طلب الخروج.
- نظفت `MutqanLogo` من imports غير مستخدمة للشعار الأبيض القديم حتى لا يعود الاعتماد على ملفات white raster ذات whitespace.

## ملفات لُمست
- `src/contexts/AuthContext.tsx` — تنظيف جلسة Supabase والتخزين المحلي عند تسجيل الخروج.
- `src/components/ui/MutqanLogo.tsx` — إزالة imports غير مستخدمة للشعارات البيضاء القديمة.
- `docs/ops/ai-handoff.md` — تحديث التسليم النشط لهذه الجلسة.
- `docs/ops/work-journal.md` — إضافة سجل مختصر للجلسة.

## ملفات حساسة لم تُلمس
- `supabase/migrations/*`
- `docs/CONSTITUTION.md`

## التحقق
- ✅ `npm run build` نجح.
- ✅ `npm run lint` نجح مع 0 errors و219 warnings موجودة مسبقًا.
- ✅ تم تشغيل الصفحة العامة محليًا بعد توفير env محلي مؤقت، وظهرت صفحة الهبوط بالشعار.
- ⏭ اختبار logout كامل من حساب فعلي لم يتم داخل الجلسة لأنه يحتاج جلسة مستخدم حقيقية/بيانات دخول في المتصفح.

## الحالة الحالية
تسجيل الخروج الآن يزيل حالة الجلسة محليًا بصورة أقوى، لذلك يفترض أن فتح `/` بعد الخروج يعرض صفحة الهبوط بدل الرجوع إلى `/platform`. الشعار العام يستخدم مسار vector الحالي، أما التأكيد النهائي لشعار الـ sidebar الأبيض يحتاج اختبار بصري من جلسة دخول فعلية.

## أفضل خطوة تالية
1. اختبر يدويًا: سجّل دخول، سجّل خروج، افتح `https://mutqan-sa.com/`، والمتوقع ظهور صفحة الهبوط لا `/platform`.
2. إذا استمر الرجوع إلى `/platform` بعد هذا الإصلاح، افحص Service Worker/cache في المتصفح لأن الاحتمال التالي هو PWA cache.
3. بعد اعتماد الاختبار، ادمج الفرع في main وواصل مسار Sales/Pilot.

## أسئلة مفتوحة لخالد
- هل تريد اختبار الخروج على الإنتاج مباشرة بعد الدمج، أم نبدأ أولًا من بيئة محلية/فرعية؟

## تحذيرات للوكيل التالي
- لا تُرجع `MutqanLogo.tsx` إلى استخدام `mutqan-logo-white.svg` أو `mutqan-symbol-white.svg` قبل فحص سبب الـ whitespace في تلك الملفات.
- لا تلمس migrations أو `docs/CONSTITUTION.md` ضمن هذا المسار.
- لا تعتبر مشكلة الخروج مغلقة 100% إلا بعد اختبار جلسة فعلية؛ هذا الإصلاح يغطي سبب التخزين المحلي، وليس احتمال Service Worker إن ظهر.
