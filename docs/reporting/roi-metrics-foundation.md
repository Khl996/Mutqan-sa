# ROI / SLA / Cost Reporting Foundation - Phase 2

Phase 2 adds `public.get_tenant_reporting_foundation(p_tenant_id uuid)` as the aggregate source for later reporting screens.

## Why This Exists

Current reporting hooks compute many metrics from raw rows in the browser. That is acceptable for prototypes, but it becomes slow, expensive, and harder to audit as tenants grow.

The new RPC gives future reports a tenant-scoped aggregate payload for:

1. Work-order volume and backlog.
2. Open overdue work.
3. SLA met/breached/late completion.
4. Preventive vs corrective workload ratio.
5. Inventory stock value and 30-day consumption.
6. Work-order estimated/actual/line-item costs.
7. Asset operational health.

## Top Metrics To Productize Next

| Metric | Why it matters |
| --- | --- |
| Preventive vs corrective ratio | Proves whether Mutqan is reducing reactive work |
| SLA breach rate | Gives managers a board-level reliability number |
| Overdue open work orders | Shows operational risk immediately |
| Maintenance cost per asset / period | Supports ROI and budget conversations |
| Inventory consumed value and low-stock exposure | Connects operations to cash and downtime risk |

## Current Boundary

This migration does not create UI, charts, alerts, or exports. It only creates the aggregate foundation so future reporting work has one cleaner backend contract.
