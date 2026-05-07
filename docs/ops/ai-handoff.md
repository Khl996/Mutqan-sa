# Mutqan AI Handoff — آخر تسليم نشط

> ⚠️ هذا الملف يمثّل آخر حالة فقط. التاريخ الكامل في `work-journal.md`.
> يُستبدل بالكامل في نهاية كل جلسة. لا تُلحق فيه — استبدله.

**التاريخ:** 2026-05-07
**الوكيل:** Claude Code
**الفرع:** claude/security-fixes (من main `4efb96c`)
**آخر commit (parent):** 4efb96c — Add AI work continuity system

## Current Active Areas
- **Primary:** SECURITY
- Secondary: PRODUCT, BRAND

Tags: #security #product #brand

## السياق الاستراتيجي
- North Star → `docs/strategy/mutqan-company-os.md`
- Snapshot التنفيذية → `docs/strategy/state-of-mutqan-2026-05.md` ← ملاحظة: موجودة على فرعَي Codex/Claude، لم تُدمج في main بعد
- قرارات مقفلة → `docs/CONSTITUTION.md`
- Brand v2 tokens → `src/styles/mutqan-tokens.css`

## قرارات خالد المُوثَّقة (2026-05-07)

| # | القرار | القيمة |
|---|---|---|
| 1 | هدف الإيراد 90 يوم | Cash collected |
| 2 | حد Pilot الأدنى | 15,000 ريال (12,000 بشروط) |
| 3 | CRM | HubSpot |
| 4 | القطاع الأول | شركات إدارة المرافق والمجمعات |
| 5 | إرسال أول 10 رسائل | هذا الأسبوع ✅ |
| 6 | Runway/تكاليف | مؤجل — خالد مشغول بالتصميمات |
| 7 | مرجع الألوان | Brand v2 (`src/styles/mutqan-tokens.css`) |
| 8 | إصلاح تسريب كلمة المرور | فوري ✅ |
| 9 | تقييد broadcast_notification | مُوافَق عليه ✅ |
| 10 | صقل الصفحات | 3 ديمو أولاً، ثم باقي الصفحات (لا تأجيل) |

## ما أُنجز في هذه الجلسة
- حذف `input` من console.log في `useTenants.ts:198` — توقف تسريب `admin_password`.
- تحديث `CONSTITUTION.md` بألوان Brand v2.
- إنشاء `supabase/migrations/130_restrict_broadcast_notification.sql`:
  - REVOKE EXECUTE من `anon` على كلا الـ overloads.
  - إضافة فحص داخلي: يتحقق أن المستدعي `platform_owner` أو `platform_admin`.
  - AnnouncementsPage تستمر تعمل للمستخدمين المصرّح لهم بلا تغيير.

## ملفات لُمست
- `src/hooks/useTenants.ts` — سطر واحد (إزالة `input` من log).
- `docs/CONSTITUTION.md` — تحديث قسم الألوان إلى Brand v2.
- `supabase/migrations/130_restrict_broadcast_notification.sql` — ملف جديد.
- `docs/ops/ai-handoff.md` — استبدال كامل.
- `docs/ops/work-journal.md` — إدخال جديد.

## ملفات حساسة لم تُلمس
- باقي `supabase/migrations/*` — لم أُلمس غير رقم 130.
- `src/**` — لم أُلمس غير `useTenants.ts` سطر واحد.

## التحقق
- ✅ الإصلاح دقيق: السطر 198 الآن `console.log('Creating tenant via provision_tenant RPC...')` بلا بيانات.
- ✅ Migration منطقي: REVOKE anon + role check داخلي لكلا الـ overloads.
- ⏭ build/lint — لم تُطبَّق بعد؛ التحقق الكامل ينتظر Khalid يُشغّل المهاجرة على Supabase.

## الحالة الحالية
3 إصلاحات أمنية منتهية (code + CONSTITUTION + migration). الفرع `claude/security-fixes` جاهز للـ PR. لم يُطبَّق migration على قاعدة البيانات الإنتاجية بعد — هذا يحتاج خالد ينفّذ `supabase db push` أو يطبّق عبر Supabase dashboard.

مهام بانتظار البدء:
- صقل 3 صفحات الديمو (dashboard, work-orders, assets) — المسار 2 من snapshot.
- دمج فرعَي Codex/Claude للـ snapshot في main.
- Codex: إرسال أول 10 رسائل (المسار 1).

## أفضل خطوة تالية
1. **خالد:** يراجع `130_restrict_broadcast_notification.sql` ويُطبّقه على Supabase قبل أي demo.
2. **خالد:** يدمج فرع Codex (`codex/pilot-sales-ops-snapshot`) ثم فرع Claude (`claude/product-ui-brand-snapshot`) في main.
3. **Codex:** يبدأ المسار 1 (إرسال أول 10 رسائل عبر HubSpot) هذا الأسبوع.
4. **Claude:** يبدأ صقل 3 صفحات الديمو فور دمج الـ snapshot في main.
5. **خالد (لاحقاً):** توثيق التكاليف الشهرية والـ runway عند الفراغ من التصميمات.

## تحذيرات للوكيل التالي
- Migration 130 موجود في repo لكن **لم يُطبَّق** على قاعدة البيانات بعد. لا تعتبره مُنفَّذاً.
- لا تزال 16 directory من صفحات المنتج pre-brand — خطوة 10 في قرارات خالد.
- لا تعدّل console.log في `useTenants.ts` مجدداً — الإصلاح الحالي مقصود.
- Snapshot (`state-of-mutqan-2026-05.md`) لم تُدمج في main بعد.
