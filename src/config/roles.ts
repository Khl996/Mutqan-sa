/**
 * Centralized Platform Roles Definition
 * 
 * This is the SINGLE SOURCE OF TRUTH for platform role names.
 * Used by: PlatformLayout, TenantContext, usePermission, LoginPage, DashboardLayout
 * Must match the DB constraint in 068_add_tenant_owner_role.sql
 */

/** All roles that grant platform-level access (no tenant required) */
export const PLATFORM_ROLES = [
    'platform_owner',
    'platform_admin',
    'platform_support',
    'platform_finance',
    'platform_hr',
] as const;

export type PlatformRole = typeof PLATFORM_ROLES[number];

/** Check if a role string is a platform-level role */
export function isPlatformRole(role: string | null | undefined): boolean {
    if (!role) return false;
    return (PLATFORM_ROLES as readonly string[]).includes(role);
}
