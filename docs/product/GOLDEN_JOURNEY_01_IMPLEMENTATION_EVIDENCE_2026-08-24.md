# متقن 2.0 - سجل تنفيذ وأدلة الرحلة الذهبية الأولى

التاريخ: 2026-08-24
تحديث توافق PDF العربي: 2026-08-26
الرحلة: أمر العمل من المهمة إلى إثبات الإنجاز
الحالة: أول شريحة رأسية منفذة ومتحققة محليًا، مع إغلاق عيب توافق PDF العربي؛ غير مطبقة على Staging أو Production

## حدود هذا السجل

هذا السجل يثبت ما نُفذ في الفرع المعزول
`codex/integrated-professional-system-20260824` فوق الأب
`5bbfdc325b7d6e45fe32e012a11d7fe955ba20ee`.

لا يثبت هذا السجل اكتمال رؤية متقن كلها، ولا يمثل اعتمادًا أو شهادة مطابقة من
هيئة كفاءة الإنفاق والمشروعات الحكومية أو من أي جهة أخرى. سياسة الصياغة
والأدلة الحاكمة موجودة في
[EXPRO_ALIGNMENT_AND_CLAIMS_POLICY.md](../governance/EXPRO_ALIGNMENT_AND_CLAIMS_POLICY.md).

لم تُنفذ أي كتابة على Production أو Staging، ولم يُدفع أي فرع أو tag أو
deployment بعيد في هذه الدفعة.

## ما نُفذ

### 1. سلطة إثبات الإنجاز

- أضيف عقد إغلاق `contract_version = 2` بهجرة forward-only؛ لم تُعدل أي هجرة تاريخية.
- عند الانتقال الفعلي إلى `completed`، تختم قاعدة البيانات عنوان أمر العمل
  وهوية الأصل داخل `pdf_snapshot` قبل التحقق من القيد.
- بعد الإغلاق لا يمكن إعادة ربط الإثبات بعنوان أو أصل مختلف.
- حُميت لقطة الإغلاق، وبيانات PDF القديمة، ومراجع صور البلاغ وما قبل/بعد
  التنفيذ من الكتابة المباشرة للمستخدم المصادق.
- أزيلت كتابة العميل المباشرة إلى bucket ملفات PDF وإلى `operation_logs`؛
  القراءة تبقى ديناميكية ومقيدة بالسلطة الحالية.
- لقطة v1 التاريخية تبقى مقروءة، لكنها لا تُعرض بوصفها إثباتًا نهائيًا جديدًا.

### 2. نموذج واحد للشاشة وPDF

- الشاشة ووثيقة الطباعة تستخدمان `WorkOrderPrintView` و
  `ProofOfWorkViewModel` واحدين بدل قالب HTML وقالب PDF متباعدين.
- أزيل مولد jsPDF من مسار المستخدم؛ زر الإثبات يفتح الطباعة الأصلية للمتصفح
  التي تتيح الطباعة أو الحفظ بصيغة PDF من القالب نفسه.
- الحقيقة النهائية تأتي من لقطة v2؛ الحقول الحية تستخدم فقط في وضع غير نهائي
  أو كحقول مرجعية معلنة.
- السجل التشغيلي يُرتب ويُستبعد منه كل حدث يتجاوز وقت الإغلاق.
- لا توجد توقيعات صورية أو ادعاءات موافقة غير مسجلة.
- هوية المنشأة والإعدادات تُقرأ صراحة من `workOrder.tenant_id`، لا من مستأجر
  مختار في سياق الواجهة.

### 3. دليل بصري ثنائي اللغة

- واجهة هادئة وواضحة بالعربية والإنجليزية تشمل ملخص العمل، الموقع والأصل،
  التنفيذ والمراجعة، الأدلة البصرية، والأثر التشغيلي.
- ملف PDF A4 حقيقي بالعربية والإنجليزية من صفحتين مقصودتين، مع أعمدة RTL
  صحيحة، وفاصل صفحة صريح يمنع شطر بطاقات التنفيذ، وأكواد لا تُقص أو تنعكس.
- تستخدم الشاشة ووثيقة الطباعة هوية مُصدر فعالة واحدة بقواعد fallback موحدة، فلا يختلف
  اسم الجهة بين القناتين.
- تعرض الوثيقة جردًا صريحًا لصور البلاغ وما قبل/بعد التنفيذ. تضمين الصور
  الخاصة الفعلية داخل الوثيقة يبقى بوابة قبول مستضافة مستقلة ولا يُفترض هنا.
- لا يُحمّل مولد jsPDF في مسار إثبات الإنجاز. التشكيل وBiDi ينفذهما المتصفح
  على نص Unicode منطقي قابل للنسخ والبحث، لا على Arabic Presentation Forms.
- خط Amiri regular/bold مضمن محليًا بإصدار ثابت؛ داخل الملف يحمل كل subset
  اسمًا مستقلًا و`ToUnicode` وTTF checksum صحيحًا. لا يوجد جلب وقت الطباعة
  من GitHub أو Google Fonts ولا fallback إلى Helvetica للنص العربي.
- مراجع الصور تقبل مسارات Supabase Storage النسبية فقط، وترفض `http(s)` و
  `data:` والمسارات المطلقة و`..` وWindows paths. وتظل RLS صاحبة القرار عند
  إصدار الرابط الموقع.

## التحقق المنفذ

| بوابة | النتيجة | الدليل |
|---|---|---|
| PostgreSQL isolated replay | PASS | PostgreSQL 17.11، عدد 41 artifact مسجلًا، ثم توقف الخادم المعزول |
| سلطة الإغلاق الحقيقية | PASS | RPC فعلي: المستخدم النشط أغلق وكوّن v2؛ المستخدم الموقوف رُفض `28000` بلا تغيير؛ الإعادة رُفضت `22023` |
| تنافس الإغلاق | PASS | جلستان متزامنتان؛ إغلاق واحد فقط نجح، والثاني انتظر القفل ثم رُفض؛ بقي snapshot v2 وسجل إغلاق واحد |
| خصومة السلطة | PASS | رفض snapshot ناقص، أولوية مفقودة، إعادة ربط العنوان/الأصل، تزوير metadata، تزوير الصور، وإدخال operation log مباشر |
| تزامن الدفع | PASS | استدعاء جديد وإعادة idempotent متزامنة أعادا invoice/subscription نفسيهما |
| اختبارات التطبيق | PASS | 38 من 38 اختبارًا؛ 5 ملفات اختبار |
| Mojibake | PASS | لا فساد ترميز عربي |
| ESLint للنطاق المتغير | PASS مع دين قائم | 0 أخطاء؛ 21 تحذيرًا قديمًا في hookين تاريخيين |
| Production build | PASS | Vite: 3825 module؛ PWA: 177 entry / 5221.38 KiB |
| PWA font/license | PASS | Amiri regular/bold ونصا OFL وMIT موجودة في precache |
| الشاشة العربية والإنجليزية | PASS | 1440x1900، لا console errors أو warnings، فحص بصري يدوي |
| PDF الفعلي | PASS | صفحتان لكل لغة من قالب HTML نفسه؛ لا قص للمرجع ولا شطر لبطاقات التنفيذ؛ render مستقل وفحص الصفحتين |
| Unicode والبحث | PASS | 1128 محرفًا عربيًا أساسيًا، 0 Presentation Forms، 0 NUL؛ نجح البحث الخام عن خمس عبارات عربية مرجعية |
| تضمين الخط | PASS | Amiri regular/bold بأسماء subset مستقلة، `ToUnicode`، وTTF checksum = `b1b0afba` لكليهما |
| قارئ Chrome | PASS | فُتح ملف PDF النهائي نفسه في عارض Chrome عند 100%؛ العربية متصلة والصفحتان ظاهرتان |
| قارئ Edge / Adobe | PASS | فُتح الملف النهائي نفسه في عارض Edge المعتمد على Adobe؛ العربية متصلة بلا استبدال خط ظاهر |
| تطابق Chrome وEdge | PASS | توليد مستقل بالمحركين؛ صفحتا PDF تطابقتا pixel-for-pixel، RMS = 0 |
| TypeScript الكامل للأساس | دين سابق مفتوح | 36 خطأ عبر 15 ملفًا في الأساس؛ سطح Proof الجديد نفسه: 0 أخطاء |

تحذيرات البناء غير المانعة المسجلة: بيانات Browserslist عمرها ثمانية أشهر،
وحزمة عامة أكبر من 500 kB خارج chunk إثبات الإنجاز. لم تُخف هذه التحذيرات ولم
يُوسع نطاق الرحلة لمعالجتها عشوائيًا.

## حزمة الأدلة البصرية

- [الشاشة العربية](evidence/golden-journey-01/proof-screen-ar.png)
- [الشاشة الإنجليزية](evidence/golden-journey-01/proof-screen-en.png)
- [PDF العربي](evidence/golden-journey-01/proof-of-work-ar.pdf)
- [PDF الإنجليزي](evidence/golden-journey-01/proof-of-work-en.pdf)
- [رندر PDF العربي - الصفحة الأولى](evidence/golden-journey-01/proof-pdf-render-ar.png)
- [رندر PDF العربي - ملحق الأدلة](evidence/golden-journey-01/proof-pdf-render-ar-p2.png)
- [رندر PDF الإنجليزي - الصفحة الأولى](evidence/golden-journey-01/proof-pdf-render-en.png)
- [رندر PDF الإنجليزي - ملحق الأدلة](evidence/golden-journey-01/proof-pdf-render-en-p2.png)
- [PDF العربي داخل قارئ Chrome](evidence/golden-journey-01/proof-pdf-viewer-chrome-ar.png)
- [PDF العربي داخل قارئ Edge / Adobe](evidence/golden-journey-01/proof-pdf-viewer-edge-ar.png)

## بصمات SHA-256

| Artifact | SHA-256 |
|---|---|
| `20260824180500_p0_work_order_proof_authority.sql` | `1d184802cd2073e5d8256a2a6d15db8a016cf5bd13009dd7d9fa14d3096ab114` |
| `p0_work_order_proof_authority.sql` | `ec138fcf8d6cdcf39d97128c4341c1b9b0b55b5662bfff8c1ea9d54d8e8af23e` |
| `proofOfWork.ts` | `1c6dd1cd095967878749ddf050a354842206b3cd49ff8f0a8fac27697177459d` |
| `proofStorage.ts` | `04a973bc803f7b6f6915c1515a8fa3c7bd65408e322528405ad26bc9c5ed5c02` |
| `WorkOrderPdfButton.tsx` | `405af2386f9797cba199fc1992468046d3cf9eed1ec5ccbc75b7b652c0a108c1` |
| `WorkOrderPrintView.tsx` | `db16b19bc5cc90467317d9977291fd0200fb9f70b086944af82fb1d875818443` |
| `WorkOrderDetailsPage.tsx` | `e7e31d524c21229ddbfd8c00af3298a6d94b3a67ca0279b27d1d92af728e56df` |
| `ProofOfWorkPreview.tsx` | `ccde24e6d63eda493cea54a1cc3743dfc8a71208e6c69b2bd6207fc3349898f9` |
| `workOrderPdf.ts` (deprecated path) | `3faeff2c1ce697b93fd9eaa239337186da2d5cc7769c1088de0ac0b6fdd127c6` |
| `ar.json` | `06b735fd31e8937943b991032c9cbc22d79cbc77226c2d7860ab0e4d4bbe469e` |
| `proof-of-work-ar.pdf` | `2183851c7a413d4b0feb7b0d63b074f05614717142aa39dba0743729088ac147` |
| `proof-of-work-en.pdf` | `c37e956c30428f8397510d4fe88eeb4f9be9d7e4178b55ecf752aac418fb1f97` |
| `proof-screen-ar.png` | `c9c0d59c3bdf17667cdefbe5212330e1534c5a05871de28d5fdb77a32be21629` |
| `proof-screen-en.png` | `741552b75b337cb4de3e62e6b14b575268ef1cb835af82f047965df6543bec55` |
| `proof-pdf-render-ar.png` | `856d02b2f681e5321e8c8efd66d36b0317c34b6d3ecf8c189081f1fcc50d6e99` |
| `proof-pdf-render-ar-p2.png` | `c6fb48816a33e81d6b69a5205b49fb09c22786c265bc076a16437ec7b4018f60` |
| `proof-pdf-render-en.png` | `46cf2459a35231ccf41a96eacd2989e0a9c27917f3ca138a94e291868ceed2ae` |
| `proof-pdf-render-en-p2.png` | `5034e3ef48fe8cdb6b64c49925d53b136b50bcdff81a9e84c70c3fccf9fb12b2` |
| `proof-pdf-viewer-chrome-ar.png` | `f3c38a1c4207e09fcd24e4a4ac2f0532e43cd659de11df4cd3b6d9c39de419ed` |
| `proof-pdf-viewer-edge-ar.png` | `c373b6b351528e745dab98b51bd324c6236c88c37d4045098e1638b3a8fd0358` |
| Amiri Regular TTF | `d26cd95609ed51b6419e3c7d4a066cb9fac7b73117868622f5b7f03998c68568` |
| Amiri Bold TTF | `0cf3c9c5b967adb281a46f17293fe03b1fc05e0538ab4db4a4c2252f45098692` |
| OFL license | `f0fcc7d0a78a4a7df1a69d9a6fe20723f2eb424e560b40715c61e2654220c3f1` |
| Expo MIT license | `f81a99a72ec5e64e3f74fad0db3df27ab69ab0edd4878368f83379d3e4fc9313` |

حزمة npm المثبتة: `@expo-google-fonts/amiri@0.4.1`
Integrity:
`sha512-JTZUZ4olyqGeXu5UBWVEerrbym/MD9U3wU8qzSg8z4qEtHFKAI3uPg2DuytfeRmJ6EppaHLYsYqpGerMOrpJeA==`

## ما لم يُثبت بعد

هذه عناصر قبول الدفعة التالية، وليست نتائج مفترضة:

1. تطبيق الهجرة الجديدة على Staging فقط ضمن نافذة مستقلة ومصرح بها.
2. إغلاق أمر عمل مستضاف عبر `close_work_order` وإثبات أن snapshot v2 تكوّنت
   في الخدمة الفعلية.
3. توليد PDF مستضاف بهوية مستأجر حقيقية، وتضمين صور خاصة فعلية بعد تحميلها
   المصرح، مع اختبار مستخدم عادي وtenant admin وplatform admin ومحاولة عابرة للمستأجرين.
4. اختبار محتوى طويل ومتعدد الصفحات وصور كبيرة وحالات البيانات الناقصة.
5. قياس الرحلة مع مستخدمين فعليين: زمن الإتمام، نسبة الأخطاء، اكتمال الأدلة،
   الثقة في المستند، والحاجة إلى شرح أو تدريب.
6. إغلاق دين TypeScript العام ضمن مسار جودة مستقل قبل توسيع إعادة البناء.
7. يبقى `upload-report-photo` مسار P1 موثقًا؛ لا يوسع P0 إلا إذا صار شرطًا
   لمسار قبول إلزامي.
8. لا تستخدم عبارة «مطابق لدليل الهيئة» أو «معتمد» قبل اكتمال مصفوفة الأدلة
   والحصول على اعتماد رسمي صريح.

## القرار التنفيذي

أول رحلة ذهبية انتقلت من وثيقة إلى شريحة رأسية قابلة للمراجعة: سلطة قاعدة
البيانات، نموذج حقيقة واحد، تجربة عربية/إنجليزية، وPDF محمول بين القارئات،
وأدلة قابلة لإعادة التحقق. الخطوة التالية ليست تعميم إعادة البناء، بل قبول مستضاف مضبوط ثم قياس
الرحلة مع المستخدم قبل فتح الرحلة الذهبية الثانية.
