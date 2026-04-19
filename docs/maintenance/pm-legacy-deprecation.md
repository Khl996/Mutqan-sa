# PM Legacy Deprecation Map - Phase 2

## Source Of Truth

The active preventive-maintenance model is the foundation PM stack:

| Area | Active source |
| --- | --- |
| Job templates | `public.job_plans`, `public.job_plan_items` |
| Scheduling | `public.pm_schedules`, `public.pm_schedule_assets` |
| Generated work orders | `public.work_orders.source_schedule_id`, `public.work_orders.job_plan_id`, `public.work_orders.work_type` |
| Execution checks | `public.work_order_checks` |
| Execution attachments | `public.work_order_attachments` |
| Frontend hooks | `src/hooks/usePMFoundation.ts` |
| Main PM UI | `src/pages/maintenance/MaintenancePage.tsx` |
| Details routes | `/maintenance/job-plans/:id`, `/maintenance/schedules/:id` |

## Isolated Legacy Surface

These files are still present for historical compatibility but are not public routed after Phase 1:

| File/table | Status | Reason not deleted now |
| --- | --- | --- |
| `src/pages/maintenance/MaintenancePlanDetailsPage.tsx` | Legacy isolated | Depends on old task execution UI; safe deletion needs import and type cleanup pass |
| `src/components/maintenance/AddMaintenancePlanDialog.tsx` | Legacy isolated | Uses `maintenance_plans`; not part of active PM route |
| `src/components/maintenance/AddMaintenanceTaskDialog.tsx` | Legacy isolated | Uses `maintenance_tasks`; not part of active PM route |
| `src/components/maintenance/TaskExecutionModal.tsx` | Legacy isolated | Old execution flow; retained until old task data is migrated |
| `src/hooks/useMaintenancePlans.ts` | Legacy isolated | Reads/writes `maintenance_plans` |
| `src/hooks/useMaintenanceTasks.ts` | Legacy isolated | Reads/writes `maintenance_tasks` |
| `public.maintenance_plans` | Legacy DB table | Archived in `pm_legacy_archive` by migration `108`; table remains for data compatibility |
| `public.maintenance_tasks` | Legacy DB table | Archived in `pm_legacy_archive` by migration `108`; table remains for data compatibility |

## Shared Transitional Pieces

These are not safe to remove in Phase 2:

| File/table | Why |
| --- | --- |
| `src/hooks/useChecklistTemplates.ts` | New checklist template screens still import it |
| `src/hooks/useMaintenanceProgram.ts` | Target/frequency dialogs still use transitional PM program tables |
| `src/components/maintenance/ChecklistTemplateDialog.tsx` | Still part of the active PM authoring experience |
| `src/components/maintenance/PlanTargetDialog.tsx` | Still used by transitional setup flows |
| `src/components/maintenance/FrequencyBundleDialog.tsx` | Still used by transitional setup flows |
| `public.asset_groups` and related tables | Explicitly retained by migration `108` as a legacy operational layer |

## Removal Rule

Do not re-add public navigation or routes to `maintenance_plans` / `maintenance_tasks`.
Deletion is safe only after:

1. Any old customer data has been migrated from `maintenance_plans` / `maintenance_tasks` to `job_plans` / `pm_schedules` / `work_orders`.
2. Transitional dialogs no longer import `useMaintenanceProgram` or `useChecklistTemplates` for old data.
3. A build/lint pass proves the old page, dialogs, hooks, and types are unreachable.
