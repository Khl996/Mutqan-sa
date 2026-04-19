# Mutqan Phase 3 Sales Demo Flow

## One Story To Demo

Use one connected operational story instead of jumping between unrelated modules:

1. **Site**: show the facility hierarchy and the exact location where risk exists.
2. **Asset**: open one critical asset with maintenance context.
3. **PM Schedule**: show the preventive schedule tied to that asset.
4. **Generated Work Order**: generate or open the PM work order created from the schedule.
5. **Technician Execution**: show checklist execution, photos/notes, and status movement.
6. **Parts Consumption**: consume one spare part from inventory.
7. **Completion**: close the order and show audit/status evidence.
8. **ROI Result**: end in `/reports` with open/overdue, PM compliance, SLA, cost, and inventory risk.

## Demo Rule

Do not demo every module. Demo the chain that proves Mutqan reduces operational risk:

`Site -> Asset -> PM Schedule -> Generated WO -> Execution -> Parts -> Completion -> KPI / ROI`

## Required Staging Fixtures

Prepare these before a serious customer demo:

| Fixture | Purpose |
| --- | --- |
| Tenant A with realistic hospital/facility name | Main demo tenant |
| Tenant B with at least one row per sensitive table | RLS proof |
| Critical asset with PM schedule | Main story asset |
| Due PM schedule with linked asset | Generates work order |
| Assigned technician user | Execution proof |
| Inventory item with low-stock threshold | Stock-risk proof |
| Completed work orders with SLA outcomes | KPI/ROI proof |
| Tap sandbox captured charge | Payment proof |

## Close The Demo In Reports

The final screen should be `/reports`, not a settings page. The buyer should leave with three remembered claims:

1. Mutqan connects PM work to actual work orders.
2. Mutqan exposes overdue/SLA/cost risk without spreadsheet work.
3. Mutqan can prove ROI through preventive ratio, SLA compliance, and inventory consumption.
