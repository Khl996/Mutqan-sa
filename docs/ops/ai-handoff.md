# Mutqan AI Handoff — آخر تسليم نشط

> ⚠️ هذا الملف يمثّل آخر حالة فقط. التاريخ الكامل في `work-journal.md`.
> يُستبدل بالكامل في نهاية كل جلسة. لا تُلحق فيه — استبدله.

**التاريخ:** 2026-06-20
**الوكيل المُسلِّم:** Claude Code → التالي
**الفرع:** claude/system-improvements-updates-y4jrxm (مبني فوق main @ 5d4ec9c)

## Current Active Areas
- **Primary:** QUALITY, OPS, SECURITY
- Secondary: PRODUCT

Tags: #quality #ops #security #tests #docs

---

## ✅ ما أُنجز في هذه الجلسة (مراجعة نظام + تحسينات)

طلب خالد مراجعة للنظام وقائمة تحسينات، ثم تنفيذها. أُنجز التالي:

1. **مزامنة التوثيق مع الواقع** — `ai-handoff.md` و`work-journal.md` و`PROGRESS.md` كانت متوقفة عند 2026-05-08 بينما الكود تقدّم عبر Hospital Lite phases 1–7 وتحويل عميل حقيقي. حُدّثت لتعكس الواقع.

2. **إيقاف تسريب console/PII:**
   - `vite.config.ts`: إضافة `esbuild.drop: ['console','debugger']` في بناء الإنتاج فقط — يمسح كل مخرجات console (وأي بيانات مستخدم) من حزمة الإنتاج كلياً.
   - `AuthContext.tsx` و`PlatformLayout.tsx`: حذف debug `console.log` التي كانت تطبع الإيميل/الاسم/الدور/معرّف المستخدم. أُبقي `console.error` للأخطاء الفعلية فقط.

3. **إطار اختبارات حقيقي (Vitest)** — كان `npm test` يشغّل فحص mojibake فقط (صفر اختبارات). أُضيف:
   - `vitest.config.ts` + 28 اختبار يغطّي قلب التحكم بالوصول (`permissions.ts`, `roles.ts`) ودوال WhatsApp (`whatsapp.ts`).
   - `npm test` الآن = `vitest run && check:mojibake`؛ أُضيف `test:unit` و`test:watch`.

4. **تقسيم الحزم (manualChunks)** — الحزمة الرئيسية نزلت من 1,075 kB إلى 636 kB (gzip: 505→378). react/supabase/radix/query/i18n صارت حزماً منفصلة قابلة للتخزين المؤقت.

**التحقق:** ✅ `npx vitest run` (28/28) · ✅ `npm run build` · ✅ `npm run lint` (0 errors، 218 تحذير).

> ملاحظة lint: جُرّب `eslint --fix` لكنه أزال توجيهات `eslint-disable` غير فعّالة وترك أسطراً فيها مسافات زائدة (قيمة سلبية)، فأُرجعت تلك الملفات. تنظيف الـ218 تحذير (معظمها `no-explicit-any`) يحتاج typing حقيقي تدريجي، لا حملة آلية.

## 🟢 ملاحظة مهمة: مشكلتان من المراجعة القديمة مُصلَحتان أصلاً
- **تحويل `/platform` المبكر عند التحميل البارد:** `ProtectedRoute.tsx:24` ينتظر `isLoading` فعلاً. ✅
- **بق تسجيل الخروج:** `AuthContext.signOut` يستخدم `{ scope: 'global' }` وينظّف مفاتيح `sb-*`. ✅
ملفات التوثيق القديمة فقط كانت توحي أنهما مفتوحتان.

## 🔴 ما يحتاج خالد (لا يمكن إنجازه بدون موارد خارجية)
1. **حالات Tap السلبية:** إضافة `PAYMENT_FAILED_TAP_ID` و`PAYMENT_MISMATCHED_AMOUNT_TAP_ID` ثم `npm run verify:payment`.
2. **WhatsApp BSP API:** يحتاج عقد BSP + قوالب معتمدة + `WHATSAPP_API_KEY` (مؤجّل حتى عميل دافع — الأساس جاهز في `src/lib/whatsapp.ts`).
3. **اختيار أداة analytics** لتتبّع مسار الديمو/التسجيل/الدفع.

## ما تبقى (منخفض/متوسط الأولوية)
- 175 تحذير `no-explicit-any` — typing تدريجي، ليس حملة واحدة.
- فحوصات `verify:*` كلها PowerShell — تحتاج بيئة Windows؛ فكرة: تحويلها لـ Node/TS لتعمل على كل المنصات.
- تقارير قرارية أعمق (overdue/demand متكرر/PM gaps) حسب خطة Pilot v1.
- توسيع تغطية الاختبارات تدريجياً (workflow, billing engine).

## السياق الاستراتيجي
- North Star → `docs/strategy/mutqan-company-os.md`
- خطة Pilot v1 → `docs/strategy/pilot-v1-scope.md`
- قرارات مقفلة → `docs/CONSTITUTION.md`
- خارطة Hospital Lite → `docs/hospital-lite-roadmap.md` (Phases 1–7 مكتملة)

## أفضل خطوة تالية
1. خالد يراجع/يدمج هذا الفرع.
2. إكمال حالات Tap السلبية (يحتاج IDs من خالد).
3. توسيع الاختبارات لتشمل workflow و billing engine.
