# Mutqan AI Handoff — آخر تسليم نشط

> ⚠️ هذا الملف يمثل آخر حالة فقط. التاريخ الكامل في `work-journal.md`.
> يُستبدل بالكامل في نهاية كل جلسة. لا تُلحق فيه — استبدله.

**التاريخ:** 2026-05-09
**الوكيل:** Codex
**الفرع:** codex/pilot-sales-ops-snapshot
**آخر commit:** (commit pending) — Tenant dashboard sidebar Brand v2 contrast correction

## Current Active Areas
- **Primary:** UI
- Secondary: BRAND, DOCS

Tags: #ui #brand #docs

## السياق الاستراتيجي
- North Star → `docs/strategy/mutqan-company-os.md`
- Sprint الحالي → `docs/strategy/pilot-v1-scope.md`
- قرارات مقفلة → `docs/CONSTITUTION.md`
- Brand foundation → `docs/brand/`
- Brand v2 reference → `docs/brand/v2/`
- Operating model → `docs/ops/ai-executive-operating-model.md`

## ما أُنجز في هذه الجلسة
- تأكيد أن المشكلة في tenant/dashboard sidebar داخل `src/components/layout/Sidebar.tsx`، وليس `PlatformSidebar`.
- تأكيد أن `/dashboard` و`/assets` و`/work-orders` كلها تمر عبر `DashboardLayout` وتستخدم نفس tenant `Sidebar`.
- تثبيت خلفية tenant sidebar على لون Brand v2 الفحمي `#0B1320` عبر class مهم وinline background حتى لا يتأثر بـ light/dark tokens.
- إزالة الاعتماد داخل tenant sidebar على tokens متغيرة مثل `bg-background` أو `bg-card` أو `bg-muted` أو `bg-sidebar`.
- ضبط النصوص الافتراضية إلى `text-white/80`، وزر التصغير إلى `text-white/70`، والـ active state إلى `bg-[#00B2A9] text-white`.
- ضبط hover إلى `hover:bg-white/10 hover:text-white` والحدود إلى `border-white/10`.
- إبقاء شعار tenant sidebar بنسخة داكنة السياق `theme="dark"` لأن الخلفية أصبحت فحمية ثابتة.

## ملفات لُمست
- `src/components/layout/Sidebar.tsx` — إصلاح tenant/dashboard sidebar فقط وفق Brand v2.
- `docs/ops/ai-handoff.md` — استبدال كامل بآخر حالة نشطة.
- `docs/ops/work-journal.md` — إضافة دخول جديد للجلسة.

## ملفات حساسة لم تُلمس
- `supabase/migrations/*` — لم تُلمس.
- `docs/CONSTITUTION.md` — لم يُعدل.
- `src/components/layout/PlatformSidebar.tsx` — لم يُعدل في هذه الجلسة.
- `src/hooks/useTenants.ts` — لم يُلمس؛ ما زال يظهر كـ modified خارج نطاق هذا الإصلاح.
- `Mutqan-Visual-Identity-v2.zip` — لم يُدرج في Git.
- ملفات ops القديمة غير المتتبعة بتاريخ 2026-05-03 — لم تُدرج.

## التحقق
- ✅ `npm run build` — نجح.
- ✅ `npm run lint` — نجح بلا أخطاء؛ توجد 219 تحذيرًا قديمًا.
- ✅ تحقق ربط المسارات: `/dashboard` و`/assets` و`/work-orders` داخل `DashboardLayout`.
- ✅ تحقق ثابت: لا توجد `bg-background` أو `bg-card` أو `bg-muted` أو `bg-sidebar` داخل `src/components/layout/Sidebar.tsx`.
- ✅ تحقق CSS build: تم توليد قواعد `!bg-[#0B1320]` و`bg-[#00B2A9]` في ملف CSS المبني.

## الحالة الحالية
tenant/dashboard sidebar أصبح مستقلًا عن ثيم light/dark من ناحية الخلفية، ويستخدم سطحًا فحميًا ثابتًا مع نصوص وأيقونات وشعار قابلة للقراءة في صفحات الديمو الأساسية. لا توجد تغييرات جديدة على `PlatformSidebar` ضمن هذه الجلسة، وما بقي خارج الـ commit هو ملفات غير مرتبطة أو ملاحظات قديمة.

## أفضل خطوة تالية
1. إنشاء commit لهذا التصحيح الدقيق.
2. دفع الفرع إلى remote.
3. مراجعة `/dashboard` في المتصفح بعد وصول النشر للتأكد بصريًا من اختفاء الخلفية الفاتحة في tenant sidebar.

## أسئلة مفتوحة لخالد
- لا توجد أسئلة تمنع الرفع.

## تحذيرات للوكيل التالي
- لا تلمس `PlatformSidebar` عند متابعة هذه المشكلة؛ هذا المسار خاص بـ tenant/dashboard sidebar.
- لا تدرج `src/hooks/useTenants.ts` أو ملفات ops غير المتتبعة أو ZIP الهوية ضمن هذا commit.
- تحذيرات lint الحالية قديمة وليست نتيجة هذا التعديل.
