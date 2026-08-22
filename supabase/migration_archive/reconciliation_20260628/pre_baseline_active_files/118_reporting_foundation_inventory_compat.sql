-- =============================================================================
-- Migration: 118_reporting_foundation_inventory_compat.sql
-- Purpose:
--   Make get_tenant_reporting_foundation compatible with the current staging
--   inventory_transactions schema.
--
-- Runtime issue fixed:
--   Reports page failed because migration 114 referenced
--   inventory_transactions.total_cost, but staging inventory_transactions does
--   not have total_cost or unit_cost columns. Consumption value is now derived
--   from inventory_items.unit_cost.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_tenant_reporting_foundation(
    p_tenant_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id uuid := auth.uid();
    v_auth_role text := auth.role();
    v_caller_role text;
    v_caller_tenant uuid;
    v_tenant_id uuid;
    v_result jsonb;
BEGIN
    IF v_auth_role = 'service_role' THEN
        IF p_tenant_id IS NULL THEN
            RAISE EXCEPTION 'p_tenant_id is required for service_role reporting calls';
        END IF;
        v_tenant_id := p_tenant_id;
    ELSE
        IF v_caller_id IS NULL THEN
            RAISE EXCEPTION 'Authentication required';
        END IF;

        SELECT role, tenant_id
          INTO v_caller_role, v_caller_tenant
          FROM public.profiles
         WHERE id = v_caller_id;

        IF v_caller_role IS NULL THEN
            RAISE EXCEPTION 'Caller profile not found';
        END IF;

        IF v_caller_role IN ('platform_owner', 'platform_admin', 'platform_finance', 'platform_support') THEN
            v_tenant_id := COALESCE(p_tenant_id, v_caller_tenant);
        ELSE
            v_tenant_id := COALESCE(p_tenant_id, v_caller_tenant);
            IF v_tenant_id IS NULL OR v_tenant_id IS DISTINCT FROM v_caller_tenant THEN
                RAISE EXCEPTION 'Unauthorized tenant reporting scope';
            END IF;
        END IF;
    END IF;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Tenant scope could not be resolved';
    END IF;

    WITH
    wo AS (
        SELECT *
          FROM public.work_orders
         WHERE tenant_id = v_tenant_id
    ),
    wo_costs AS (
        SELECT
            COALESCE(SUM(woc.total_cost), 0)::numeric AS total_cost
          FROM public.work_order_costs woc
          JOIN public.work_orders wo2 ON wo2.id = woc.work_order_id
         WHERE wo2.tenant_id = v_tenant_id
    ),
    asset_stats AS (
        SELECT
            COUNT(*)::integer AS total_assets,
            COUNT(*) FILTER (WHERE status = 'operational')::integer AS operational_assets,
            COUNT(*) FILTER (WHERE status = 'under_maintenance')::integer AS under_maintenance_assets,
            COUNT(*) FILTER (WHERE status = 'out_of_service')::integer AS out_of_service_assets,
            COUNT(*) FILTER (WHERE criticality IN ('high', 'critical'))::integer AS critical_assets
          FROM public.assets
         WHERE tenant_id = v_tenant_id
    ),
    inventory_stats AS (
        SELECT
            COUNT(*)::integer AS total_items,
            COUNT(*) FILTER (WHERE quantity <= 0)::integer AS out_of_stock_items,
            COUNT(*) FILTER (WHERE quantity > 0 AND quantity <= COALESCE(min_quantity, 0))::integer AS low_stock_items,
            COALESCE(SUM(COALESCE(quantity, 0) * COALESCE(unit_cost, 0)), 0)::numeric AS stock_value
          FROM public.inventory_items
         WHERE tenant_id = v_tenant_id
           AND COALESCE(is_active, true) = true
    ),
    inventory_consumption AS (
        SELECT
            COALESCE(SUM(ABS(COALESCE(it.quantity, 0))), 0)::numeric AS consumed_quantity_30d,
            COALESCE(SUM(ABS(COALESCE(it.quantity, 0)) * COALESCE(ii.unit_cost, 0)), 0)::numeric AS consumed_value_30d
          FROM public.inventory_transactions it
          LEFT JOIN public.inventory_items ii
            ON ii.id = it.item_id
           AND ii.tenant_id = it.tenant_id
         WHERE it.tenant_id = v_tenant_id
           AND it.transaction_type IN ('out', 'usage')
           AND it.created_at >= now() - interval '30 days'
    ),
    pm_stats AS (
        SELECT
            COUNT(*)::integer AS schedules_total,
            COUNT(*) FILTER (WHERE status = 'active')::integer AS schedules_active,
            COUNT(*) FILTER (WHERE status = 'active' AND next_due_date < CURRENT_DATE)::integer AS schedules_overdue,
            COUNT(*) FILTER (WHERE status = 'active' AND next_due_date <= CURRENT_DATE + interval '7 days')::integer AS schedules_due_7d
          FROM public.pm_schedules
         WHERE tenant_id = v_tenant_id
    ),
    wo_stats AS (
        SELECT
            COUNT(*)::integer AS total,
            COUNT(*) FILTER (WHERE status NOT IN ('completed', 'auto_closed', 'cancelled', 'rejected_by_technician'))::integer AS open_count,
            COUNT(*) FILTER (
                WHERE status NOT IN ('completed', 'auto_closed', 'cancelled', 'rejected_by_technician')
                  AND due_date IS NOT NULL
                  AND due_date < now()
            )::integer AS overdue_open,
            COUNT(*) FILTER (WHERE status IN ('completed', 'auto_closed'))::integer AS closed_count,
            COUNT(*) FILTER (WHERE work_type = 'preventive' OR source_schedule_id IS NOT NULL)::integer AS preventive_count,
            COUNT(*) FILTER (WHERE COALESCE(work_type, 'reactive') <> 'preventive' AND source_schedule_id IS NULL)::integer AS corrective_count,
            COUNT(*) FILTER (WHERE sla_resolution_met IS TRUE)::integer AS sla_met_count,
            COUNT(*) FILTER (WHERE sla_resolution_met IS FALSE)::integer AS sla_breached_count,
            COUNT(*) FILTER (
                WHERE status IN ('completed', 'auto_closed')
                  AND due_date IS NOT NULL
                  AND completed_at IS NOT NULL
                  AND completed_at > due_date
            )::integer AS completed_late_count,
            ROUND((AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 3600.0) FILTER (
                WHERE status IN ('completed', 'auto_closed')
                  AND completed_at IS NOT NULL
                  AND completed_at >= created_at
            ))::numeric, 2) AS avg_completion_hours,
            COALESCE(SUM(COALESCE(estimated_cost, 0)), 0)::numeric AS estimated_cost_total,
            COALESCE(SUM(COALESCE(actual_cost, 0)), 0)::numeric AS actual_cost_total
          FROM wo
    )
    SELECT jsonb_build_object(
        'tenant_id', v_tenant_id,
        'generated_at', now(),
        'work_orders', jsonb_build_object(
            'total', wo_stats.total,
            'open', wo_stats.open_count,
            'closed', wo_stats.closed_count,
            'overdue_open', wo_stats.overdue_open,
            'preventive', wo_stats.preventive_count,
            'corrective', wo_stats.corrective_count,
            'avg_completion_hours', wo_stats.avg_completion_hours
        ),
        'sla', jsonb_build_object(
            'met', wo_stats.sla_met_count,
            'breached', wo_stats.sla_breached_count,
            'completed_late', wo_stats.completed_late_count,
            'breach_rate', CASE
                WHEN (wo_stats.sla_met_count + wo_stats.sla_breached_count) = 0 THEN NULL
                ELSE ROUND((wo_stats.sla_breached_count::numeric / (wo_stats.sla_met_count + wo_stats.sla_breached_count)) * 100, 2)
            END
        ),
        'pm', jsonb_build_object(
            'schedules_total', pm_stats.schedules_total,
            'schedules_active', pm_stats.schedules_active,
            'schedules_overdue', pm_stats.schedules_overdue,
            'schedules_due_7d', pm_stats.schedules_due_7d,
            'preventive_ratio', CASE
                WHEN (wo_stats.preventive_count + wo_stats.corrective_count) = 0 THEN NULL
                ELSE ROUND((wo_stats.preventive_count::numeric / (wo_stats.preventive_count + wo_stats.corrective_count)) * 100, 2)
            END
        ),
        'assets', jsonb_build_object(
            'total', asset_stats.total_assets,
            'operational', asset_stats.operational_assets,
            'under_maintenance', asset_stats.under_maintenance_assets,
            'out_of_service', asset_stats.out_of_service_assets,
            'critical', asset_stats.critical_assets
        ),
        'inventory', jsonb_build_object(
            'total_items', inventory_stats.total_items,
            'low_stock_items', inventory_stats.low_stock_items,
            'out_of_stock_items', inventory_stats.out_of_stock_items,
            'stock_value', ROUND(inventory_stats.stock_value, 2),
            'consumed_quantity_30d', inventory_consumption.consumed_quantity_30d,
            'consumed_value_30d', ROUND(inventory_consumption.consumed_value_30d, 2)
        ),
        'cost', jsonb_build_object(
            'work_order_estimated_total', ROUND(wo_stats.estimated_cost_total, 2),
            'work_order_actual_total', ROUND(wo_stats.actual_cost_total, 2),
            'work_order_line_cost_total', ROUND(wo_costs.total_cost, 2)
        )
    )
    INTO v_result
    FROM wo_stats, wo_costs, asset_stats, inventory_stats, inventory_consumption, pm_stats;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_reporting_foundation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_reporting_foundation(uuid) TO service_role;
