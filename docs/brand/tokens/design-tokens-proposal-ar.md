# مقترح Design Tokens أولي لمتقن

هذا الملف جزء من **Mutqan Brand Guidelines Document v1** وضمن برنامج **MBSU**.

## الغرض

اقتراح بنية أولية للـ Design Tokens التي يمكن اعتمادها لاحقًا، دون تطبيقها على الكود أو الواجهة الآن.

## ما الذي يغطيه؟

- color tokens.
- typography tokens.
- status tokens.
- semantic tokens.
- spacing/radius/shadow كاقتراح.

## ما الذي لا يغطيه؟

- لا يحدد قيم HEX نهائية.
- لا يغير الثيم.
- لا يعدل ملفات CSS.
- لا يطبق tokens على المكونات.

## Color Token Families

| العائلة | الدور |
| --- | --- |
| `brand.ink` | الفحمي/الأزرق الداكن للثقة والقيادة. |
| `brand.signal` | التركواز للربط والإشارة. |
| `neutral.*` | الرماديات والخلفيات والحدود. |
| `surface.*` | أسطح المنتج، التقارير، PDF. |
| `status.stable` | الاستقرار والإنجاز. |
| `status.attention` | يحتاج متابعة أو تحذير. |
| `status.risk` | خطر أو حالة حرجة. |
| `status.info` | معلومة أو Insight. |
| `marketing.paper` | خلفيات ورقية/حجرية للمواد التسويقية. |

## Semantic Tokens

```text
operating.stable
operating.watch
operating.attention
operating.risk
operating.unknown

workorder.open
workorder.in_progress
workorder.waiting_approval
workorder.overdue
workorder.closed

asset.health.good
asset.health.watch
asset.health.risk
asset.health.unknown

decision.brief.background
decision.brief.signal
decision.brief.risk
decision.brief.recommendation

visualGraph.node.default
visualGraph.node.active
visualGraph.edge.default
visualGraph.edge.highlight
```

## Typography Tokens

```text
font.family.ar = Cairo
font.family.en = Inter

font.weight.regular
font.weight.medium
font.weight.semibold
font.weight.bold

font.role.display
font.role.heading
font.role.body
font.role.caption
font.role.kpi
font.role.table
```

## Number / Table Tokens

```text
number.style.operational = 0-9
number.style.table = tabular
number.direction.code = LTR
table.density.default
table.density.compact
table.statusBadge.size
```

## Spacing / Radius / Shadow

هذه القيم لا تعتمد الآن، لكنها تقترح اتجاهًا هادئًا:

```text
space.2
space.4
space.8
space.12
space.16
space.24
space.32

radius.card = small-to-medium
radius.button = controlled
radius.badge = compact

shadow.surface = subtle
shadow.overlay = restrained
```

## قواعد تطبيق مستقبلية

- لا تستخدم token لزينة بلا معنى.
- status tokens لها أولوية على ألوان الزخرفة.
- الأحمر يظل محدودًا للخطر.
- التركواز لا يغرق الواجهة.
- كل token يجب أن يرتبط بدور واضح في المنتج أو التسويق أو التقارير.

## حالة هذا الملف

مقترح توثيقي فقط. أي تطبيق فعلي يحتاج مهمة منفصلة واعتماد صريح.

