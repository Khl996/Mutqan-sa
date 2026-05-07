# Mutqan AI Handoff — آخر تسليم نشط

> ⚠️ هذا الملف يمثّل آخر حالة فقط. التاريخ الكامل في `work-journal.md`.
> يُستبدل بالكامل في نهاية كل جلسة. لا تُلحق فيه — استبدله.

**التاريخ:** 2026-05-07
**الوكيل:** Codex
**الفرع:** codex/pilot-sales-ops-snapshot
**آخر commit:** (commit pending) — تثبيت قرارات خالد التجارية 1-6 في snapshot مايو

## Current Active Areas
- **Primary:** SALES
- Secondary: PILOT, OPS, DOCS

Tags: #sales #pilot #ops #docs

## السياق الاستراتيجي
- North Star → `docs/strategy/mutqan-company-os.md`
- Sprint الحالي → `docs/strategy/pilot-v1-scope.md`
- قرارات مقفلة → `docs/CONSTITUTION.md`
- Brand foundation → `docs/brand/`
- Operating model → `docs/ops/ai-executive-operating-model.md`

## ما أُنجز في هذه الجلسة
- استلام قرارات خالد النهائية للبنود 1-6.
- تثبيت هدف الـ 90 يوم كـ **cash collected**.
- تثبيت 15,000 ريال كحد أدنى قياسي لأول Pilot، مع عرض إطلاق 12,000 ريال بشروط.
- تثبيت HubSpot كـ CRM.
- تثبيت القطاع الأول: شركات إدارة المرافق والمجمعات.
- تثبيت بدء إرسال أول 10 رسائل هذا الأسبوع.
- توثيق تأجيل التكلفة الشهرية والـ runway مؤقتا حتى توثيق المدفوعات.
- إيقاف العمل على البنود 8-9 الأمنية لأن Claude يعمل عليها حاليا.

## ملفات لُمست
- `docs/strategy/state-of-mutqan-2026-05.md` — تحديث قرارات خالد 1-6.
- `docs/ops/ai-handoff.md` — استبدال كامل حسب نظام الاستمرارية.
- `docs/ops/work-journal.md` — إضافة دخول جديد أعلى السجل.

## ملفات حساسة لم تُلمس
- `supabase/migrations/*` — لم تُعدّل في هذا commit؛ تم إيقاف migration الذي بدأته قبل إكماله حتى لا نتداخل مع Claude.
- `docs/CONSTITUTION.md` — لم يُعدّل.
- `src/**` — لم يُعدّل في هذا commit؛ إصلاح `useTenants.ts` عند Claude حسب توجيه خالد.

## التحقق
- ⏭ build — لم تُلمس ملفات كود.
- ⏭ lint — لم تُلمس ملفات كود.
- ✅ حصر التغيير في وثائق snapshot/handoff/journal.
- ✅ تم الرجوع عن مسار migration/useTenants غير المكتمل حتى لا يتداخل مع Claude.

## الحالة الحالية
قرارات خالد التجارية 1-6 أصبحت مثبتة داخل snapshot مايو، وأصبح مسار Codex الحالي محصورا في sales/pilot/ops: cash collected، HubSpot، أول 10 رسائل، ونطاق Pilot المدفوع. البنود الأمنية والـ UI/Brand خارج نطاق هذا الفرع الآن لأن Claude يعمل عليها بالتوازي.

## أفضل خطوة تالية
1. Codex يجهز خطة تنفيذ أول 10 رسائل على HubSpot بدون لمس الأمن أو UI.
2. Claude يكمل التسريب و`broadcast_notification` وصفحات الديمو/Brand v2.
3. بعد دمج مساهمة Claude، نوحد snapshot ونحدد أول دفعة إرسال.

## أسئلة مفتوحة لخالد
- ما شروط عرض الإطلاق 12,000 ريال بالضبط: نطاق أضيق، مرجع تجاري، سرعة دفع، أم كلها؟
- هل تريد Codex يجهز حقول/مراحل HubSpot المقترحة لأول 10 حسابات؟
- هل أول 10 رسائل تُرسل عبر البريد أم LinkedIn/واتساب شخصي حسب توفر جهة التواصل؟

## تحذيرات للوكيل التالي
- لا تعدّل دخولات قديمة في `work-journal.md`; ألحق فقط.
- لا تعمل على `useTenants.ts` أو migration `broadcast_notification` من هذا الفرع؛ Claude يمسكها الآن.
- `docs/CONSTITUTION.md` و`supabase/migrations/*` ملفات حساسة.
- working tree يحتوي ملفات غير مرتبطة كثيرة من قبل هذه الجلسة؛ لا تلمسها إلا بإذن خالد.
