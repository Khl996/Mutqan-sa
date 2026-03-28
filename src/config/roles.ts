/**
 * Centralized role definitions for the v1 authorization model.
 *
 * Transitional legacy roles may still exist in the database temporarily:
 * - tenant_owner -> treated as tenant_admin
 * - user -> no operational access
 */

export const PLATFORM_ROLES = [
    'platform_owner',
    'platform_admin',
    'platform_support',
    'platform_finance',
    'platform_hr',
] as const;

export type PlatformRole = typeof PLATFORM_ROLES[number];

export const TENANT_ROLES = [
    'tenant_admin',
    'facility_manager',
    'maintenance_manager',
    'supervisor',
    'engineer',
    'technician',
    'reporter',
] as const;

export type TenantRole = typeof TENANT_ROLES[number];
export type ActiveRole = PlatformRole | TenantRole;
export type LegacyRole = 'tenant_owner' | 'user';
export type KnownRole = ActiveRole | LegacyRole;

export function isPlatformRole(role: string | null | undefined): role is PlatformRole {
    if (!role) return false;
    return (PLATFORM_ROLES as readonly string[]).includes(role);
}

export function isTenantRole(role: string | null | undefined): role is TenantRole {
    if (!role) return false;
    return (TENANT_ROLES as readonly string[]).includes(role);
}

export function normalizeRole(role: string | null | undefined): ActiveRole | null {
    if (!role) return null;

    if (role === 'tenant_owner') {
        return 'tenant_admin';
    }

    if (role === 'user') {
        return null;
    }

    if (isPlatformRole(role) || isTenantRole(role)) {
        return role;
    }

    return null;
}
