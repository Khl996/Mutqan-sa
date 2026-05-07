# Mutqan AI Handoff — آخر تسليم نشط

> ⚠️ هذا الملف يمثّل آخر حالة فقط. التاريخ الكامل في `work-journal.md`.
> يُستبدل بالكامل في نهاية كل جلسة. لا تُلحق فيه — استبدله.

**التاريخ:** 2026-05-08
**الوكيل:** Codex
**الفرع:** codex/pilot-sales-ops-snapshot
**آخر commit:** (commit pending) — تجهيز HubSpot وأول 10 حسابات لمسار Pilot

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
- إنشاء `docs/sales/hubspot-first-10-sales-motion-ar.md`.
- تحديد HubSpot pipeline stages لمسار Pilot من `Target Account` إلى `Deposit Collected`.
- تحديد خصائص HubSpot المطلوبة للشركات، الأشخاص، والصفقات.
- تجهيز جدول أول 10 حسابات مع زاوية التواصل والأولوية وشرط الإرسال.
- تجهيز رسائل أولى مخصصة لكل حساب، ورسالة متابعة بعد 3 أيام عمل.
- تثبيت مسار البيع: رسالة → مكالمة اكتشاف → ديمو → عرض Pilot → تحصيل 50%.
- تضمين قواعد Launch Pilot Offer بسعر 12,000 ريال حسب قرار خالد.

## ملفات لُمست
- `docs/sales/hubspot-first-10-sales-motion-ar.md` — ملف جديد لمسار HubSpot وأول 10 حسابات.
- `docs/ops/ai-handoff.md` — استبدال كامل حسب نظام الاستمرارية.
- `docs/ops/work-journal.md` — إضافة دخول جديد أعلى السجل.

## ملفات حساسة لم تُلمس
- `supabase/migrations/*` — لم تُلمس.
- `docs/CONSTITUTION.md` — لم يُعدّل.
- `src/**` — لم يُعدّل في هذا العمل؛ أي ظهور في `git status` سابق هو خارج هذا النطاق ويحتاج فحص منفصل.
- ملفات التصميم والهوية — لم تُلمس.

## التحقق
- ⏭ build — لم تُلمس ملفات كود.
- ⏭ lint — لم تُلمس ملفات كود.
- ✅ قراءة `ai-handoff.md` و`work-journal.md` وقسم الاستمرارية في `CONSTITUTION.md`.
- ✅ قراءة وثائق `docs/sales/pilot-package` والقطاع ورسائل أول 10 قبل إنشاء الملف.
- ✅ حصر المخرج في Sales / HubSpot / Pilot فقط.

## الحالة الحالية
مسار Codex للمبيعات أصبح قابلا للتنفيذ في HubSpot: المراحل والحقول والرسائل والمتابعة ومسار التحصيل موثقة في ملف واحد. ما يزال التنفيذ الفعلي داخل HubSpot وإرسال الرسائل ينتظر إدخال أسماء الأشخاص وقنوات التواصل لكل حساب، ولا توجد تغييرات كود أو أمن أو تصميم في هذا العمل.

## أفضل خطوة تالية
1. خالد يراجع أول 10 حسابات ويضيف اسم الشخص وقناة التواصل لكل حساب.
2. Codex يحول الجدول إلى إدخالات HubSpot أو checklist إدخال إذا طلب خالد ذلك.
3. بعد إدخال الدفعة الأولى، نرسل أول 5 رسائل ونجدول المتابعة بعد 3 أيام عمل.

## أسئلة مفتوحة لخالد
- هل تريدني أن أستخدم HubSpot connector فعليا لإنشاء pipeline/properties إذا كان متاحا، أم نكتفي بالملف كـ setup spec؟
- ما قناة الإرسال المفضلة للدفعة الأولى: LinkedIn، بريد، واتساب شخصي، أم حسب توفر كل جهة؟
- هل تريد إدخال الحسابات العشرة كلها دفعة واحدة في HubSpot أم 5 ثم 5؟

## تحذيرات للوكيل التالي
- لا تعدّل دخولات قديمة في `work-journal.md`; ألحق فقط.
- لا تعمل على `useTenants.ts` أو migration `broadcast_notification` من هذا الفرع؛ Claude يمسكها.
- لا تلمس التصميم أو قرارات الهوية من هذا المسار.
- working tree يحتوي ملفات غير مرتبطة كثيرة من قبل هذه الجلسة؛ لا تلمسها إلا بإذن خالد.
