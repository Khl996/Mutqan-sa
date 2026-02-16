/**
 * useTenantQuery - Helper hook for tenant-scoped queries
 * 
 * This hook provides the current tenant ID and utilities for building
 * tenant-scoped queries across the application.
 */

import { useTenant } from '@/contexts/TenantContext'
import { useAuth } from '@/contexts/AuthContext'

export interface TenantQueryOptions {
    /** If true, skip tenant filtering (for platform-wide queries) */
    skipTenantFilter?: boolean
}

/**
 * Hook to get tenant query parameters
 * Returns the current tenant ID and helper functions for filtering
 */
export function useTenantQuery(options: TenantQueryOptions = {}) {
    const { currentTenant, isPlatformUser } = useTenant()
    const { profile } = useAuth()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profileData = profile as any

    // Determine the effective tenant ID for queries
    const tenantId = options.skipTenantFilter
        ? null
        : currentTenant?.id || profileData?.tenant_id || null

    // For platform users viewing all tenants, we might skip filtering
    const shouldFilter = !options.skipTenantFilter && tenantId !== null

    return {
        tenantId,
        shouldFilter,
        isPlatformUser,
        currentTenant,

        /**
         * Apply tenant filter to a Supabase query builder
         * Usage: applyTenantFilter(supabase.from('table').select('*'))
         */
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        applyTenantFilter: <T extends { eq: (column: string, value: string) => T }>(query: T): T => {
            if (shouldFilter && tenantId) {
                return query.eq('tenant_id', tenantId)
            }
            return query
        },

        /**
         * Get query key with tenant scope
         * This ensures cache is isolated per tenant
         */
        getTenantQueryKey: (baseKey: readonly unknown[]): readonly unknown[] => {
            if (shouldFilter && tenantId) {
                return [...baseKey, { tenant: tenantId }] as const
            }
            return baseKey
        },
    }
}

/**
 * Simple hook to just get the current tenant ID
 */
export function useCurrentTenantId(): string | null {
    const { currentTenant } = useTenant()
    const { profile } = useAuth()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profileData = profile as any

    return currentTenant?.id || profileData?.tenant_id || null
}
