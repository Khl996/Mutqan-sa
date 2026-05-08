# Mutqan Work Journal — السجل التاريخي للجلسات

> Append-only. لا تعدّل دخولات قديمة. أحدث جلسة في الأعلى.
> إدخال واحد قصير لكل جلسة (≤10 أسطر). للتفاصيل التقنية، راجع commit message.
> الحالة الحالية والخطوة التالية تعيش في `ai-handoff.md`، لا هنا.

---

## 2026-05-08 — Codex — (commit pending) [logo-usage-system]
Tags: #brand #ui #product #ops
**هدف:** ضبط استخدام نسخ شعار متقن حسب السياق والحجم.
**أُنجز:** مركزت اختيار اللون داخل `MutqanLogo`: الملون للفواتح، الأبيض عبر vector للداكن، الأسود للرسمي، والرمز للمساحات الضيقة؛ وخففت هيدر الموقع.
**ملفات:** `src/components/ui/MutqanLogo.tsx`, `src/components/site/SiteNav.tsx`, `src/components/layout/AuthLayout.tsx`, `src/pages/site/PrivacyPolicyPage.tsx`, `src/pages/site/TermsOfUsePage.tsx`, `docs/ops/ai-handoff.md`, `docs/ops/work-journal.md`.
**التحقق:** ✅ build، ✅ lint 0 errors / 219 warnings، ⏭ screenshot آلي لم يكتمل محليًا.
**التالي:** خالد يراجع الهيدر والـ sidebar بصريًا ثم يدمج الفرع.

## 2026-05-08 — Codex — (commit pending) [logout-session-logo-fix]
Tags: #product #brand #ui #supabase #ops
**هدف:** إغلاق مشكلة بقاء جلسة Supabase بعد الخروج وتثبيت مسار الشعارات الحالي بدون رجوع للملفات البيضاء القديمة.
**أُنجز:** `signOut` صار global مع تنظيف `sb-*` و`currentTenantId` في كل الأحوال؛ وإزالة imports غير مستخدمة للشعار الأبيض القديم.
**ملفات:** `src/contexts/AuthContext.tsx`, `src/components/ui/MutqanLogo.tsx`, `docs/ops/ai-handoff.md`, `docs/ops/work-journal.md`.
**التحقق:** ✅ build، ✅ lint 0 errors / 219 warnings، ⏭ logout e2e يحتاج جلسة فعلية.
**التالي:** خالد يختبر logout → فتح الصفحة الرئيسية؛ إذا بقي redirect نراجع Service Worker/cache.

## 2026-05-08 — Claude Code — d39cdb4 [logo-vector-fix]
Tags: #product #brand #ui
**هدف:** إصلاح الشعار الأبيض الذي كان يظهر صغيراً في كل مواقع الـ dark theme.
**أُنجز:** اكتشاف أن `mutqan-logo-white.svg` PNG مرسطر بمساحة بيضاء (نسبة 1.59:1) — استبداله باستخدام vector `mutqan-logo-color.svg` (4.23:1) مع Tailwind `brightness-0 invert` للـ dark. ثلاث commits: 6aa4be0 → e34222c → d39cdb4 (إرجاع الأحجام الأصلية لأن الـ vector ما يحتاج تعويض whitespace).
**ملفات:** `src/components/ui/MutqanLogo.tsx`.
**التحقق:** ✅ `npm run build` نجح. ⏭ تأكيد بصري معلّق على خالد.
**التالي:** خالد يؤكد بصرياً + Codex يلتقط bug logout → mutqan-sa.com يرجع لـ /platform (موثّق في ai-handoff.md).

## 2026-05-08 — Claude Code — 62fe284 [brand-v2-full-sweep]
Tags: #product #brand #ui
**هدف:** إكمال قرار #10 — صقل Brand v2 على كل صفحات المنتج (لا تأجيل).
**أُنجز:** دمج كل فروع demo-polish/security-fixes في main؛ استبدال hardcoded Tailwind colors بـ semantic tokens في 19 ملفاً؛ `src/index.css` محدَّث عالمياً.
**ملفات:** `src/index.css` + 19 صفحة في `src/pages/`.
**التحقق:** ⏭ build لم يُشغَّل — ينتظر خالد.
**التالي:** خالد يشغّل build ويُبلّغ بأي errors؛ دمج الفروع المعلّقة (snapshot, brand-v2-docs).

## 2026-05-08 — Claude Code — 0577083 [demo-polish]
Tags: #product #brand #ui
**هدف:** صقل Brand v2 على صفحات الديمو — قرار خالد #10.
**أُنجز:** تحديث `src/index.css` متغيرات shadcn من Brand v1 إلى v2 HSL (تأثير عالمي)؛ إصلاح hardcoded `text-blue-500` و `text-indigo-500` في AssetsPage.tsx:421-422.
**ملفات:** `src/index.css`، `src/pages/assets/AssetsPage.tsx`.
**التحقق:** ⏭ build لم يُشغَّل بعد.
**التالي:** خالد يراجع ويدمج الفرع؛ Claude يكمل صقل platform pages؛ تقييم إزالة console.log noise.

## 2026-05-07 — Claude Code — (commit pending) [security-fixes]
Tags: #security #product #brand
**هدف:** تنفيذ قرارات خالد 7+8+9 الفورية — Brand v2، إصلاح تسريب كلمة مرور، تقييد broadcast_notification.
**أُنجز:** حذف `input` من useTenants.ts:198؛ تحديث CONSTITUTION.md بألوان Brand v2؛ migration 130 — REVOKE anon + role check داخلي على كلا overloads.
**ملفات:** `src/hooks/useTenants.ts`، `docs/CONSTITUTION.md`، `supabase/migrations/130_restrict_broadcast_notification.sql`.
**التحقق:** ⏭ migration لم يُطبَّق على Supabase بعد — ينتظر خالد.
**التالي:** خالد يطبّق migration ويدمج snapshot PRs؛ Claude يبدأ صقل 3 صفحات الديمو؛ Codex يبدأ المسار 1.

## 2026-05-07 — Claude Code — (commit pending) [continuity-system]
Tags: #ops #docs
**هدف:** تأسيس نظام استمرارية العمل بين الوكلاء (v1.5).
**أُنجز:** إنشاء `ai-handoff.md` و `work-journal.md`، وإضافة قسم في `CONSTITUTION.md` يثبّت النظام كقاعدة. مفردات Tags و Active Areas موحّدة.
**ملفات:** `docs/ops/ai-handoff.md` (جديد)، `docs/ops/work-journal.md` (جديد)، `docs/CONSTITUTION.md` (إضافة قسم).
**التحقق:** ⏭ N/A — مهمة توثيق، لا كود.
**التالي:** خالد يبلّغ Codex بالنظام، ثم نختار أول مسار تنفيذي حقيقي.
