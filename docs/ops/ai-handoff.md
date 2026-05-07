# Mutqan AI Handoff — آخر تسليم نشط

> ⚠️ هذا الملف يمثّل آخر حالة فقط. التاريخ الكامل في `work-journal.md`.
> يُستبدل بالكامل في نهاية كل جلسة. لا تُلحق فيه — استبدله.

**التاريخ:** 2026-05-07
**الوكيل:** Claude Code
**الفرع:** claude/product-ui-brand-snapshot (متفرّع من codex/pilot-sales-ops-snapshot)
**آخر commit (parent):** 0af3bf4 — docs: add May 2026 state snapshot (Codex)

## Current Active Areas
- **Primary:** PRODUCT
- Secondary: UI, BRAND, DOCS

Tags: #product #ui #brand #docs

## السياق الاستراتيجي
- North Star → `docs/strategy/mutqan-company-os.md`
- Sprint الحالي → `docs/strategy/pilot-v1-scope.md`
- Snapshot التنفيذية → `docs/strategy/state-of-mutqan-2026-05.md` (Codex + Claude)
- قرارات مقفلة → `docs/CONSTITUTION.md`
- Brand foundation → `docs/brand/`
- Operating model → `docs/ops/ai-executive-operating-model.md`

## ما أُنجز في هذه الجلسة
- إضافة قسم Claude للـ snapshot: `2.أ` (تعميق المنتج)، `2.ب` (UI)، `2.ج` (البراند).
- التحقق بالأدلة من ملاحظات Codex الثلاث: تسريب كلمة مرور `useTenants.ts:198`، 26 console.log عبر 8 ملفات، `broadcast_notification` مفتوحة لـ anon.
- اكتشاف تباين بين ألوان `CONSTITUTION.md` و `mutqan-tokens.css`.
- توثيق فجوة UI: 16 ملف مشمول بالبراند (قشرة)، 16 directory غير مشمول (صفحات المنتج).
- توثيق فجوة البراند: 5 وثائق مبادئ، صفر أصل خارجي ملموس.
- إضافة قسم `9.أ` يخصّص مهام Claude داخل مسارات Codex الثلاثة.
- إضافة 4 أسئلة جديدة لخالد في القسم 10.

## ملفات لُمست
- `docs/strategy/state-of-mutqan-2026-05.md` — توسيع القسم 2، إضافة 2.أ/2.ب/2.ج/9.أ، تحديث القسم 10.
- `docs/ops/ai-handoff.md` — استبدال كامل.
- `docs/ops/work-journal.md` — إضافة دخول جديد.

## ملفات حساسة لم تُلمس
- `supabase/migrations/*` — قراءة فقط للتحقق من `broadcast_notification`.
- `docs/CONSTITUTION.md` — لم يُعدّل (التباين موثَّق فقط، التوحيد ينتظر قرار خالد).
- `src/**` — قراءة فقط للتحقق. لا إصلاحات بعد.

## التحقق
- ⏭ build — لم تُلمس ملفات كود.
- ⏭ lint — لم تُلمس ملفات كود.
- ✅ قراءة handoff Codex و آخر دخولات journal قبل البدء.
- ✅ `git fetch && git log` للتحقق من حالة origin قبل التفرّع.
- ✅ قراءة `state-of-mutqan-2026-05.md` كاملاً قبل التعديل (احترام لشغل Codex).
- ✅ تحقق بالأدلة من كل ملاحظة (Grep + Read على الملفات الفعلية، لا اعتماد على التقارير).

## الحالة الحالية
الـ snapshot أصبحت ثلاثية المساهمة (Codex + Claude + بانتظار خالد). كل الملاحظات المنتجية مدعومة بأدلة من الكود الفعلي. الفرع `claude/product-ui-brand-snapshot` يحتوي تغييراً توثيقياً فقط فوق فرع Codex، لم يُلمس أي كود مصدر أو migration. الـ snapshot جاهزة لقرار خالد على 10 أسئلة (6 من Codex + 4 من Claude)، وبعدها نبدأ التنفيذ.

## أفضل خطوة تالية
1. خالد يراجع `state-of-mutqan-2026-05.md` ويرد على القرارات العشرة.
2. بعد القرارات: دمج فرع Codex أولاً ثم فرع Claude إلى main (أو دمج كليهما عبر PR واحد بعد التوافق).
3. البدء التنفيذي بإصلاحات Claude الصغيرة (password log + console cleanup) قبل أي demo.
4. التوازي مع Codex على المسار 1 (Sales Motion — أول 10 رسائل).

## أسئلة مفتوحة لخالد
انظر القسم 10 من `state-of-mutqan-2026-05.md` — 10 أسئلة موزّعة بين تجارية/مالية (1-6 من Codex) ومنتجية/براند (7-10 من Claude).

## تحذيرات للوكيل التالي
- لا تعدّل دخولات قديمة في `work-journal.md`.
- `useTenants.ts:198` تسريب أمني مؤكَّد — لا تُجرِ demo إنشاء منشأة قبل إصلاحه.
- `broadcast_notification` RPC مفتوحة للعامة — لا تعرض صفحة `AnnouncementsPage` في أي demo.
- الصفحات غير المصقولة بالبراند (16 directory) ستُلاحَظ بصرياً مقارنة بالـ auth shell — لا تطمئن خالد بأن "البراند طُبِّق" بدون توضيح أن التطبيق على القشرة فقط.
- working tree يحتوي ملفات غير مرتبطة (changes*.txt, build_error.log, إلخ) — لا تلمسها بدون إذن خالد.
- تباين الألوان بين `CONSTITUTION.md` و `mutqan-tokens.css` غير محسوم — لا تعتمد على أحدهما دون قرار خالد.
