# إثبات تمرين النسخة المنطقية للإنتاج

**التاريخ المحلي:** 2026-09-05

**المصدر:** Supabase Production `mzpohntjotgeeaukwnbz`

**المشغل:** `DESKTOP-937VAL4\Asas`

**النتيجة:** `PASS`

## النطاق والحدود

- كان الاتصال بالمصدر للقراءة فقط: جرد catalog، `pg_dumpall --roles-only --no-role-passwords`، و`pg_dump`.
- استُخدم Supavisor session pooler على المنفذ `5432` كما توصي وثائق Supabase لمهام `pg_dump/restore`.
- لم تُنفذ هجرة أو DDL أو DML على Production، ولم تُعدّل Auth أو Storage أو Vercel.
- هذا **تمرين recovery مثبت**، وليس النسخة النهائية لنافذة النشر. يجب أخذ نسخة جديدة مباشرة قبل أول DDL إنتاجي.
- لم تُحفظ كلمة مرور قاعدة البيانات في المصدر أو manifest أو السجلات. أُدخلت في prompt مخفي فقط.
- لأن قيمة اعتماد Production أُرسلت في محادثة المستخدم أثناء إغلاق البوابة، يجب معاملتها كمكشوفة وتدوير كلمة مرور قاعدة البيانات قبل نافذة النشر الفعلية، ثم التحقق من أي خدمة خارجية تستخدم اتصال Postgres مباشر. لا تُسجل القيمة نفسها في هذا التقرير.

مرجع طريقة الاتصال: [Supabase — Migrate from Postgres to Supabase](https://supabase.com/docs/guides/platform/migrating-to-supabase/postgres).

## التنفيذ المثبت

- البداية UTC: `2026-09-04T22:15:03.2230084Z`
- النهاية UTC: `2026-09-04T22:16:57.8480200Z`
- مصدر PostgreSQL: `17.6`
- أدوات النسخ والاستعادة: PostgreSQL `17.11`
- استعادة معزولة: PostgreSQL 17 على `127.0.0.1:55440`
- حالة الاستعادة: نجحت، ثم توقف الخادم وحُذف `restore-cluster`.
- مطابقة الجرد: نجحت لكل invariants المراجعة.
- فحص مستقل في عملية جديدة: نجح فك الملفين من مفتاح DPAPI المخزن ومطابقة SHA-256، ثم حُذفت الملفات المفكوكة المؤقتة.

## الآثار والبصمات

مسار الآثار المحلي المقيد إلى حساب المشغل:

`C:\Users\Asas\AppData\Local\Mutqan\ProductionBackupGate\20260904T221503130Z`

| الأثر | bytes | SHA-256 |
|---|---:|---|
| `mutqan-production-20260904T221503130Z.dump.enc` | 1,821,416 | `6b1246b35f11b6e70e02d3c277c7ecd3d1b43ae7cf5714c527b56e5d375f292a` |
| dump بعد فك التشفير، للتحقق فقط | — | `2c228601dfe1d6fcc926d3856f933278164fa9b5ee03f57d3c40342f99b23efd` |
| `mutqan-production-roles-20260904T221503130Z.sql.enc` | 6,056 | `003c22f02f271687893c3156adc0cf7b19f72d21071c2f3dbc3d9ebd236f4746` |
| roles بعد فك التشفير، للتحقق فقط | — | `88ef500119aef8fb8bf9ab8012387ccca38780bd27c94a0b86cbbb812f69898e` |
| `source-inventory-20260904T221503130Z.json` | 802 | `28c1e50eb213886efe473905ccdc04cb250e52163ca5010fdb88bb8f39371c6d` |
| `restore-inventory-20260904T221503130Z.json` | 803 | `5760358345937eb03ebadb7ad103975a11ef81003df919189156c8db2bb2dac5` |
| `manifest-20260904T221503130Z.json` | — | `e76837b94aef6197da57d552b3019dbc333783845d7b9f262926d7b2be00428e` |

اختلاف بصمتي ملفي inventory متوقع لأنهما يسجلان وقت الالتقاط وحجم قاعدة المصدر/الاستعادة. المقارنة المقبولة تتم على invariants التشغيلية أدناه، وقد تطابقت جميعها.

## جرد الاتساق البنيوي

| invariant | المصدر والاستعادة |
|---|---:|
| الجداول | 116 |
| views/materialized views | 3 |
| الدوال | 200 |
| جداول RLS | 98 |
| السياسات | 208 |
| triggers غير الداخلية | 56 |
| إجمالي صفوف schemas المختارة | 4,175 |
| صفوف migration ledger | 30 |
| أول migration version | `00000000000000` |
| آخر migration version | `20260707085234` |
| migration ledger SHA-256 | `28a3b1258557b07bbb0173fcccd80bfe650cbd26fd0f59fc9524a9f5eff52012` |
| Storage buckets | 4 |
| Storage object metadata | 0 |
| `work-order-pdfs` metadata | 0 |
| `internal.runtime_secrets` rows | 2 |
| custom roles | 0 |

حجم قاعدة المصدر وقت الجرد: `27,651,219` bytes. لم يسجل الجرد أي قيمة سرية أو صف أعمال؛ سجّل counts وبصمات بنيوية فقط.

## عهدة مفتاح الاستعادة

- ملف المفتاح: `mutqan-backup-mzpohntjotgeeaukwnbz-20260904T221503130Z.dpapi.json`
- الحجم: `680` bytes
- SHA-256: `1caa9166c0f39d092bd5a8068977c9cdb4a25cd1fcef4cc49969bc84a11b04dd`
- الحماية: Windows DPAPI `CurrentUser` مع ACL للمشغل فقط.
- تحقق round-trip وفك الأثر في عملية مستقلة: `PASS`.
- لا يحتوي الملف plaintext أو hash لعبارة التشفير.

DPAPI وحده ليس عهدة تعافٍ مستقلة؛ فقد جهاز/ملف المستخدم قد يفقد القدرة على فك النسخة. لذلك يبقى أي DDL إنتاجي متوقفًا حتى تُحفظ مادة الاستعادة في password manager أو vault مستقل ومصرح به، من دون إرسالها في المحادثة أو Git.

## ما لا تشمله النسخة المنطقية

- bytes الخاصة بملفات Supabase Storage؛ النسخة تشمل metadata فقط.
- إعدادات Auth/SMTP/providers وقوالب البريد.
- API/JWT/service-role/webhook/Vercel secret values.
- Edge Functions المنشورة وإعدادات runtime الخاصة بها.
- DNS، custom domains، network restrictions، وإعدادات المنصة.
- حالة managed realtime/net/vault والـreplication.
- database role password hashes.

تحتاج هذه العناصر جردًا/تصديرًا منفصلًا في نافذة النشر بحسب runbook، ولا يجوز افتراض أن استعادة قاعدة البيانات تعيدها.

## اختبارات الفشل

- رفض المصادقة أنهى المحاولة قبل النسخ ولم يترك recovery key.
- فشل اتصال محلي متعمد بعد إنشاء المفتاح لم يترك key أو manifest أو `.part`.
- لا تُكتب حالة `PASS` في النسخة المحسنة إلا بعد إيقاف بيئة الاستعادة، حذف ملفاتها المؤقتة، وكتابة manifest وملف بصمته ذريًا.

## قرار البوابة

تم إغلاق **تمرين** backup/restore read-only بنجاح. لا يجيز ذلك النشر أو الهجرات تلقائيًا. قبل أول تعديل إنتاجي يجب إعادة نفس البوابة بنسخة جديدة، إثبات عهدة مفتاح مستقلة، وتطبيق جميع STOP conditions في دليل Canary.

ويضاف شرط توقف أمني: لا يبدأ DDL ما لم تُدوّر كلمة مرور قاعدة Production التي ظهرت في المحادثة ويُثبت نجاح الاتصال بالقيمة الجديدة من قناة سرية.
