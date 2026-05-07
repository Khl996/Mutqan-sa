# Mutqan AI Handoff — آخر تسليم نشط

> ⚠️ هذا الملف يمثّل آخر حالة فقط. التاريخ الكامل في `work-journal.md`.
> يُستبدل بالكامل في نهاية كل جلسة. لا تُلحق فيه — استبدله.

**التاريخ:** 2026-05-08
**الوكيل المُسلِّم:** Claude Code (sonnet-4-6) → **Codex**
**الفرع:** main
**آخر commit:** d39cdb4 — Revert lockup heights — vector logo no longer needs whitespace compensation

## Current Active Areas
- **Primary:** PRODUCT, BRAND, AUTH
- Secondary: UI

Tags: #product #brand #ui #auth #bug

---

## ✅ ما أُنجز في جلسة Claude (8 مايو)
- إكمال قرار خالد #10 (Brand v2 على كل صفحات المنتج) ودمجه في main.
- إصلاح جذر مشكلة الشعار الأبيض: ملف `mutqan-logo-white.svg` كان PNG مرسطر داخل SVG بمساحة بيضاء (نسبة 1.59:1) → استبدله باستخدام `mutqan-logo-color.svg` (vector نقي 4.23:1) مع Tailwind filter `brightness-0 invert` للـ dark theme. (commits: 6aa4be0, e34222c, d39cdb4)
- البناء تم بنجاح (`npm run build`) — لا errors.

## 🔴 المشاكل المفتوحة (Codex يلتقط من هنا)

### 1. حجم الشعار الملوّن — يحتاج تأكيد بصري
**الحالة:** بعد آخر commit (`d39cdb4`) تم إرجاع `lockupSizeClass` إلى الأحجام الأصلية (h-7/h-9/h-12) بعد ملاحظة خالد:
> "الأبيض تحسن في السايد بار لكن الملون صار اكبر من اللازم"

**ملف:** [src/components/ui/MutqanLogo.tsx:22-26](src/components/ui/MutqanLogo.tsx)

**المتوقع:** الآن كلا الـ themes (light + dark) يستخدمان نفس vector SVG، فالحجم الموحّد يلائم الاثنين.

**خطوة Codex:**
1. اطلب من خالد refresh للمتصفح وتأكيد بصري:
   - هل الشعار الملوّن (light) عاد لحجمه الطبيعي؟
   - هل الشعار الأبيض في الـ Sidebar (dark) ما زال واضح بحجم مناسب؟
2. لو الأبيض رجع صغير، الحل: زيادة `lockupSizeClass` بشكل معتدل (مثلاً `h-9 → h-11`) وتطبيقه على الاثنين معاً.

---

### 2. 🐛 Bug — تسجيل الخروج لا يحرّر الجلسة بشكل كامل

**أعراض من خالد:**
> "اسجل خروج يوجهني الى صفحة تسجيل الدخول والوضع طبيعي، لكن يوم احاول اوصل الى صفحة الهبوط عن طريق mutqan-sa.com بعد تسجيل الخروج يرجعني الى صفحة platform"

**التشخيص:**
في [src/App.tsx:147-158](src/App.tsx)، route الجذر `/` يعيد توجيه أي مستخدم `isAuthenticated === true` إلى `/platform` أو `/dashboard`:
```tsx
isAuthenticated
    ? (...isPlatformUser && !currentTenant
        ? <Navigate to="/platform" replace />
        : <Navigate to="/dashboard" replace />)
    : renderLazyPage(LandingPage)
```

بعد تسجيل الخروج، عند الانتقال إلى mutqan-sa.com (page reload كامل):
- الـ AuthContext يستدعي `supabase.auth.getSession()` ([AuthContext.tsx:105](src/contexts/AuthContext.tsx))
- يبدو أن الجلسة لا تزال محفوظة في localStorage / مُسترَدة من cache
- النتيجة: `isAuthenticated = true` → redirect إلى /platform بدل LandingPage

**الفرضيات للتحقيق (مرتّبة حسب الاحتمال):**
1. **`supabase.auth.signOut()` بدون `scope: 'global'`** ([AuthContext.tsx:180](src/contexts/AuthContext.tsx)) — الافتراضي قد يكون `local` فقط، يحذف tokens من الجهاز الحالي لكن لا يبطل refresh token على Supabase. حلها: `supabase.auth.signOut({ scope: 'global' })`.
2. **PWA Service Worker يخزّن الـ auth response cache** — البناء PWA-enabled (`vite-pwa`) قد يسترجع نسخة مخبّأة من session بعد reload. تحقّق من `vite.config.ts` workbox config وأضف auth endpoints إلى `runtimeCaching` exclusions.
3. **localStorage keys ما تنحذف بشكل كامل بعد signOut** — تأكد عبر DevTools > Application > Local Storage بعد logout: هل توجد مفاتيح `sb-*` متبقية؟ لو نعم، أضف cleanup صريح بعد `signOut()`.

**خطوات التحقق المقترحة:**
1. خالد يفتح DevTools (F12) > Application > Local Storage بعد logout، يصوّر المفاتيح.
2. خالد يفتح Network tab، يحاول الذهاب لـ mutqan-sa.com، ويرسل HAR/screenshot.
3. Codex يقرأ:
   - [src/contexts/AuthContext.tsx:179-184](src/contexts/AuthContext.tsx) — signOut implementation
   - [src/lib/supabase.ts](src/lib/supabase.ts) — supabase client config (auth options)
   - [vite.config.ts](vite.config.ts) — PWA / service worker config

**الحل الأرجح (دون تأكيد بصري):**
```tsx
const signOut = async () => {
    await supabase.auth.signOut({ scope: 'global' })
    // مسح صريح للمفاتيح المتبقية لو وُجدت
    Object.keys(localStorage)
        .filter(k => k.startsWith('sb-'))
        .forEach(k => localStorage.removeItem(k))
    setUser(null)
    setSession(null)
    setProfile(null)
}
```
**لا تنفّذ الحل قبل التأكد من السبب الفعلي** — احتمال PWA cache يحتاج معالجة مختلفة.

---

## السياق الاستراتيجي
- North Star → `docs/strategy/mutqan-company-os.md`
- Snapshot التنفيذية → `docs/strategy/state-of-mutqan-2026-05.md` (لم تُدمج في main بعد)
- قرارات مقفلة → `docs/CONSTITUTION.md`
- Brand v2 tokens → `src/styles/mutqan-tokens.css`

## قرارات خالد المُوثَّقة (2026-05-07)

| # | القرار | الحالة |
|---|---|---|
| 1 | هدف الإيراد 90 يوم | Cash collected |
| 2 | حد Pilot الأدنى | 15,000 ريال (12,000 بشروط) |
| 3 | CRM | HubSpot |
| 4 | القطاع الأول | شركات إدارة المرافق والمجمعات |
| 5 | إرسال أول 10 رسائل | ✅ |
| 6 | Runway/تكاليف | مؤجل |
| 7 | مرجع الألوان | Brand v2 ✅ |
| 8 | تسريب كلمة المرور | ✅ مدمج |
| 9 | تقييد broadcast_notification | ✅ مدمج |
| 10 | صقل صفحات المنتج | ✅ منتهٍ |

## ما تبقى (منخفض الأولوية)
- `src/pages/site/*` (About, Contact, Privacy, Terms) — ألوان تصميمية متعمدة، لا تغيير مطلوب.
- `src/pages/auth/*` (Register, CompleteRegistration) — أولوية أقل.
- `src/pages/public/PublicReportPage.tsx` و `src/pages/payment/PaymentCallbackPage.tsx` — تحتاج مراجعة لاحقة.
- دمج: `codex/pilot-sales-ops-snapshot`, `claude/product-ui-brand-snapshot`, `claude/brand-v2-docs` في main.
- 26 console.log عبر 8 ملفات — تحتاج قرار خالد.

## أفضل خطوة تالية لـ Codex
1. **Bug الجلسة (مشكلة #2 أعلاه):** اقرأ `AuthContext.tsx` و `lib/supabase.ts` و `vite.config.ts`، اطلب من خالد لقطة LocalStorage بعد logout، ثم نفّذ الحل المناسب.
2. **تأكيد بصري للشعار (مشكلة #1 أعلاه):** اطلب من خالد refresh وفيدباك.
3. الاستمرار في المسار 1 (HubSpot — أول 10 رسائل).

## تحذيرات للوكيل التالي
- Migration 130 مُطبَّق على Supabase.
- `src/index.css` الآن Brand v2 — لا ترجع إلى v1.
- لا تعدّل console.log في `useTenants.ts` — الإصلاح مقصود.
- صفحات `site/*` تحتوي `bg-amber-400` كألوان تصميمية متعمدة — لا تغيّرها.
- `MutqanLogo.tsx`: كلا الـ themes الآن يستخدمان `mutqan-logo-color.svg` (الأبيض = filter CSS). لا ترجع إلى `mutqan-logo-white.svg` (raster مع whitespace).
