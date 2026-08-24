# Mutqan Work Journal — السجل التاريخي للجلسات

> Append-only. لا تعدّل دخولات قديمة. أحدث جلسة في الأعلى.
> إدخال واحد قصير لكل جلسة (≤10 أسطر). للتفاصيل التقنية، راجع commit message.
> الحالة الحالية والخطوة التالية تعيش في `ai-handoff.md`، لا هنا.

---

## 2026-08-24 — Codex — integrated-professional-system
Tags: #integration #security #product #brand #governance
**هدف:** تأسيس خط تنفيذ نظيف للرؤية المتكاملة من المرجع الأمني المقبول مع استعادة خط التطبيق المنشور دون خلط تغييرات مساحة العمل الأصلية.
**أُنجز:** إنشاء worktree مستقل من `04fff80`، تثبيت خط الأساس، وبدء دمج `origin/main@7eb34b2` مع الحفاظ على المهاجرات الخمس المقبولة ووظائف التطبيق المنشورة.
**التحقق:** ✅ mojibake؛ ✅ مخرجات build اكتملت؛ ⏳ إعادة الاختبارات بعد إتمام الدمج.
**التالي:** إغلاق تعارضات السجل والـsidebars، ثم اختبار الدمج وإصدار commit تكامل مستقل قبل تنفيذ الرؤية.

### سجل مسار المرجع المقبول قبل الدمج

## 2026-05-09 — Codex — (commit pending)
Tags: #ui #brand #docs
**هدف:** تصحيح tenant/dashboard sidebar تحديدًا بعد توضيح أنه ليس `PlatformSidebar`.
**أُنجز:** تثبيت الخلفية على `#0B1320`، وضبط inactive إلى `text-white/80`، وactive إلى `bg-[#00B2A9] text-white`، والحدود إلى `border-white/10`.
**ملفات:** `src/components/layout/Sidebar.tsx`, `docs/ops/ai-handoff.md`, `docs/ops/work-journal.md`.
**التحقق:** ✅ build؛ ✅ lint بلا أخطاء؛ ✅ ربط `/dashboard` و`/assets` و`/work-orders` عبر `DashboardLayout`; ✅ لا tokens خلفية متغيرة داخل `Sidebar`.
**التالي:** دفع الفرع ومراجعة النشر بصريًا على tenant demo.

## 2026-05-09 — Codex — (commit pending)
Tags: #ui #brand #docs
**هدف:** تثبيت ألوان tenant sidebar في الوضع الداكن بعد ظهور الخلفية فاتحة مع شعار ونصوص بيضاء.
**أُنجز:** إضافة خلفية inline فحمية و`!bg-[#0b1320]`، وتعديل ألوان عناصر التنقل إلى white/72 مع active تركواز Brand v2.
**ملفات:** `src/components/layout/Sidebar.tsx`, `docs/ops/ai-handoff.md`, `docs/ops/work-journal.md`.
**التحقق:** ✅ `npm run build`; ✅ `npm run lint` بلا أخطاء (219 تحذيرًا قديمًا).
**التالي:** دفع الفرع ثم مراجعة المتصفح بعد وصول النشر.

## 2026-05-09 — Codex — (commit pending)
Tags: #ui #brand #docs
**هدف:** إصلاح تباين السايدبار في الوضع الداكن ومنع تحوله إلى سطح فاتح مع نصوص وشعار أبيض.
**أُنجز:** تثبيت `PlatformSidebar` و`Sidebar` على خلفية Brand v2 فحمية، واستخدام شعار أبيض دائمًا فوق السطح الداكن، وتحديث ألوان عناصر التنقل والفواصل.
**ملفات:** `src/components/layout/PlatformSidebar.tsx`, `src/components/layout/Sidebar.tsx`, `docs/ops/ai-handoff.md`, `docs/ops/work-journal.md`.
**التحقق:** ✅ `npm run build`; ✅ `npm run lint` بلا أخطاء (219 تحذيرًا قديمًا).
**التالي:** دفع الفرع ومراجعة بصرية سريعة في المتصفح عند الحاجة.

## 2026-05-09 — Codex — (commit pending)
Tags: #sales #pilot #docs
**هدف:** إدخال مسودة عرض Pilot الموجهة للعميل كحزمة مبيعات مستقلة قابلة للتنقيح بعد الديمو.
**أُنجز:** فحص الوعود العالية داخل العرض، والتأكد أن AI/IoT/BMS/WhatsApp/24/7 مذكورة كاستثناءات خارج النطاق لا كقدرات حالية.
**ملفات:** `docs/sales/pilot-package/11-client-facing-pilot-offer-ar.md`, `docs/sales/pilot-package/README-ar.md`, `docs/ops/ai-handoff.md`, `docs/ops/work-journal.md`.
**التحقق:** ✅ No Broken Promise scan للمفردات الحساسة؛ ⏭ لا build/lint لأن التغيير توثيق مبيعات فقط.
**التالي:** مراجعة بشرية للعرض قبل إرساله رسميًا لأي عميل.

## 2026-05-09 — Codex — (commit pending)
Tags: #brand #docs #ui
**هدف:** إدخال مرجع هوية متقن وBrand v2 إلى المستودع كحزمة توثيق مستقلة بعد commit صقل الواجهة.
**أُنجز:** تجهيز `docs/brand/**` للإضافة، شامل Brand Guidelines markdown pack ومرجع `docs/brand/v2` المرئي HTML/CSS، مع إبقاء الـ ZIP وملفات Sales خارج هذا commit.
**ملفات:** `docs/brand/**`, `docs/ops/ai-handoff.md`, `docs/ops/work-journal.md`.
**التحقق:** ✅ فحص عينات ترميز عربية بلا mojibake؛ ⏭ لا build/lint لأن التغيير توثيق فقط.
**التالي:** مراجعة ملف Pilot client-facing ثم commit منفصل لمسار Sales/Pilot عند الموافقة.

## 2026-05-09 — Codex — (commit pending)
Tags: #brand #ui #docs
**هدف:** صقل تطبيق Brand v2 على صفحة الهبوط والصفحات العامة/الدخول ومعالجة تبديل الشعار في الوضع الداكن.
**أُنجز:** توحيد الألوان مع Brand v2، تخفيف زحمة الهبوط ومعاينة المنتج، تفعيل شعار مناسب للفاتح/الداكن في SiteNav/SiteFooter/PlatformSidebar، وتوحيد legal pages مع SiteNav/SiteFooter.
**ملفات:** `src/pages/LandingPage.tsx`, `src/pages/site/*`, `src/pages/auth/*`, `src/components/site/*`, `src/components/layout/*`, `docs/ops/ai-handoff.md`, `docs/ops/work-journal.md`.
**التحقق:** ✅ `npm run build`; ✅ `npm run lint` بلا أخطاء (تحذيرات قديمة موجودة)؛ ✅ لا `flowmark` داخل `src`.
**التالي:** مراجعة بصرية في المتصفح للوضع الفاتح/الداكن ثم فصل التغييرات عن أي ملفات غير مرتبطة قبل commit أو PR.

## 2026-05-08 — Codex — (commit pending)
Tags: #sales #pilot #ops #docs
**هدف:** تحويل بيانات HubSpot الفعلية إلى نواة CRM صالحة لأول Pilot دون لمس الكود أو التصميم.
**أُنجز:** قراءة HubSpot، إنشاء 4 Companies حقيقية، ربطها بـ 4 Contacts، وإنشاء 4 Tasks لإرسال أول رسالة Pilot بتاريخ 2026-05-10.
**ملفات:** `docs/ops/ai-handoff.md`, `docs/ops/work-journal.md`.
**التحقق:** ✅ تحقق HubSpot بعد الإنشاء؛ ⏭ لا build/lint لأن العمل CRM + توثيق فقط.
**التالي:** إرسال أول 4 رسائل، ثم إنشاء Deal فقط بعد الإرسال أو ظهور اهتمام حقيقي.

## 2026-05-08 — Codex — (commit pending)
Tags: #sales #pilot #ops #docs
**هدف:** تجهيز HubSpot Sales Setup وأول 10 حسابات ورسائل Pilot ضمن مسار Sales/Pilot فقط.
**أُنجز:** إنشاء ملف HubSpot pipeline/properties، جدول أول 10 حسابات، رسائل مخصصة، متابعة 3 أيام، ومسار رسالة→اكتشاف→ديمو→عرض→تحصيل 50%.
**ملفات:** `docs/sales/hubspot-first-10-sales-motion-ar.md`, `docs/ops/ai-handoff.md`, `docs/ops/work-journal.md`.
**التحقق:** ⏭ لا build/lint لأن التغيير توثيقي فقط؛ تم الالتزام بعدم لمس الكود أو migrations أو التصميم.
**التالي:** إدخال أسماء الأشخاص وقنوات التواصل، ثم تنفيذ الدفعة الأولى في HubSpot.

## 2026-05-07 — Codex — (commit pending)
Tags: #sales #pilot #ops #docs
**هدف:** تثبيت قرارات خالد التجارية 1-6 والعودة لنطاق Codex دون التداخل مع عمل Claude الأمني.
**أُنجز:** تحديث snapshot بهدف cash collected، HubSpot، حد Pilot الأدنى 15,000 ريال، القطاع الأول، إرسال أول 10 رسائل هذا الأسبوع، وتأجيل runway.
**ملفات:** `docs/strategy/state-of-mutqan-2026-05.md`, `docs/ops/ai-handoff.md`, `docs/ops/work-journal.md`.
**التحقق:** ⏭ لا build/lint لأن التغيير توثيقي فقط؛ تم حصر النطاق والرجوع عن مسار useTenants/migration غير المكتمل.
**التالي:** تجهيز خطة تنفيذ أول 10 رسائل في HubSpot بعد اعتماد شروط عرض 12,000 وقنوات التواصل.

## 2026-05-07 — Codex — (commit pending)
Tags: #pilot #sales #ops #docs
**هدف:** إنتاج snapshot موحدة لحالة متقن من زاوية Pilot/Sales/Ops وربطها بهدف cash flow.
**أُنجز:** إنشاء `state-of-mutqan-2026-05.md`، تلخيص الجاهزية التجارية والتشغيلية، تحديد 3 فجوات كبرى و3 مسارات تنفيذية، وتوثيق أسئلة خالد المالية.
**ملفات:** `docs/strategy/state-of-mutqan-2026-05.md`, `docs/ops/ai-handoff.md`, `docs/ops/work-journal.md`.
**التحقق:** ⏭ لا build/lint لأن التغيير توثيقي فقط؛ تم التحقق قراءة من الوثائق والملفات المرتبطة بالمخاطر.
**التالي:** إضافة مساهمة Claude في Product/UI/Brand ثم تثبيت هدف المبيعات والـ CRM مع خالد.

## 2026-05-07 — Claude Code — (commit pending)
### سجل مسار التطبيق المنشور قبل الدمج

## 2026-06-20 — Claude Code — [system-improvements-updates]
Tags: #quality #ops #security #tests #docs
**هدف:** مراجعة النظام وتنفيذ قائمة تحسينات طلبها خالد.
**أُنجز:** (1) مزامنة التوثيق مع الواقع (كان متوقفاً عند 2026-05-08 رغم تقدّم Hospital Lite 1–7). (2) إيقاف تسريب console/PII: `esbuild.drop` في بناء الإنتاج + حذف debug logs الحاوية على إيميل/دور/معرّف في AuthContext و PlatformLayout. (3) إطار Vitest + 28 اختبار يغطّي permissions/roles/whatsapp؛ `npm test` صار يشغّل vitest. (4) manualChunks: الحزمة الرئيسية 1,075→636 kB. اكتُشف أن بق logout وتحويل /platform المبكر مُصلَحان أصلاً في الكود — التوثيق فقط كان قديماً.
**ملفات:** `vite.config.ts`، `vitest.config.ts`، `src/config/*.test.ts`، `src/lib/whatsapp.test.ts`، `src/contexts/AuthContext.tsx`، `src/components/layout/PlatformLayout.tsx`، `package.json`، `README.md`، `docs/ops/*`، `docs/PROGRESS.md`.
**التحقق:** ✅ vitest 28/28 · ✅ build · ✅ lint 0 errors (218 تحذير قائم).
**التالي:** حالات Tap السلبية (تحتاج IDs من خالد)؛ توسيع الاختبارات لـ workflow/billing.

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
