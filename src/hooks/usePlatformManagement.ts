/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { revokeManagedUser, upsertManagedUser, type ManagedUserRole } from '@/lib/adminUserApi'

// Types
export interface PlatformStaff {
    id: string
    user_id: string | null
    profile_id: string | null
    role: 'platform_owner' | 'platform_admin' | 'platform_support' | 'platform_finance' | 'platform_hr'
    status: 'active' | 'inactive' | 'suspended'
    tenants_access: 'all' | 'assigned' | 'none'
    assigned_tenants: string[]
    permissions: string[]
    custom_permissions: Record<string, boolean>
    notes: string | null
    hired_at: string | null
    created_at: string
    updated_at: string
    // Joined from profiles
    profile?: {
        id: string
        full_name: string
        full_name_ar: string | null
        email: string
        phone: string | null
        avatar_url: string | null
        last_activity_at: string | null
    }
}

export interface AuditLog {
    id: string
    user_id: string | null
    user_email: string | null
    user_name: string | null
    user_role: string | null
    action: string
    action_type: 'auth' | 'create' | 'read' | 'update' | 'delete' | 'export' | 'import' | 'config' | 'warning' | 'error'
    target_type: string | null
    target_id: string | null
    target_name: string | null
    old_values: Record<string, unknown> | null
    new_values: Record<string, unknown> | null
    metadata: Record<string, unknown>
    ip_address: string | null
    success: boolean
    error_message: string | null
    created_at: string
}

// Query Keys
export const platformKeys = {
    staff: ['platform', 'staff'] as const,
    staffList: () => [...platformKeys.staff, 'list'] as const,
    staffMember: (id: string) => [...platformKeys.staff, id] as const,
    auditLogs: ['platform', 'audit-logs'] as const,
    auditLogsList: (filters?: AuditLogFilters) => [...platformKeys.auditLogs, 'list', filters] as const,
}

interface AuditLogFilters {
    actionType?: string
    userId?: string
    dateFrom?: string
    dateTo?: string
    limit?: number
}

// ==================== STAFF HOOKS ====================

export function usePlatformStaff() {
    return useQuery({
        queryKey: platformKeys.staffList(),
        queryFn: async () => {
            // First get platform staff with profiles using direct fetch to avoid AbortError
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
            const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`
            const storedSession = localStorage.getItem(storageKey)

            let accessToken = null
            if (storedSession) {
                try {
                    accessToken = JSON.parse(storedSession).access_token
                } catch { /* ignore */ }
            }

            if (!accessToken) return [] as PlatformStaff[]

            const response = await fetch(`${supabaseUrl}/rest/v1/profiles?select=*&role=like.platform_*&order=created_at.desc`, {
                headers: {
                    'apikey': supabaseAnonKey,
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            })

            if (!response.ok) {
                console.error('Fetch staff error:', response.status)
                throw new Error('Failed to fetch staff')
            }

            const platformProfiles = await response.json()

            // Map to staff format
            return platformProfiles.map((p: any) => ({
                id: p.id,
                user_id: p.id,
                profile_id: p.id,
                role: p.role as PlatformStaff['role'],
                status: (p.is_active ? 'active' : 'inactive') as PlatformStaff['status'],
                tenants_access: p.role === 'platform_owner' ? 'all' : 'assigned',
                assigned_tenants: [],
                permissions: [],
                custom_permissions: {},
                notes: null,
                hired_at: p.created_at,
                created_at: p.created_at,
                updated_at: p.updated_at,
                profile: {
                    id: p.id,
                    full_name: p.full_name,
                    full_name_ar: p.full_name_ar,
                    email: p.email,
                    phone: p.phone,
                    avatar_url: p.avatar_url,
                    last_activity_at: p.last_activity_at,
                }
            })) as PlatformStaff[]
        },
    })
}

export function usePlatformStaffStats() {
    return useQuery({
        queryKey: [...platformKeys.staff, 'stats'],
        queryFn: async () => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
            const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`
            const storedSession = localStorage.getItem(storageKey)

            let accessToken = null
            if (storedSession) {
                try {
                    accessToken = JSON.parse(storedSession).access_token
                } catch { /* ignore */ }
            }

            if (!accessToken) return { total: 0, active: 0, inactive: 0, byRole: {} }

            const response = await fetch(`${supabaseUrl}/rest/v1/profiles?select=id,role,is_active&role=like.platform_*`, {
                headers: {
                    'apikey': supabaseAnonKey,
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            })

            if (!response.ok) throw new Error('Failed to fetch stats')

            const platformData = await response.json()

            const stats = {
                total: platformData.length || 0,
                active: platformData.filter((p: any) => p.is_active).length || 0,
                inactive: platformData.filter((p: any) => !p.is_active).length || 0,
                byRole: {} as Record<string, number>
            }

            platformData.forEach((p: any) => {
                if (p.role) {
                    stats.byRole[p.role] = (stats.byRole[p.role] || 0) + 1
                }
            })

            return stats
        },
    })
}

export function useUpdatePlatformStaff() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ id, ...updates }: Partial<PlatformStaff> & { id: string }) => {
            // Get token directly from localStorage
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`
            const storedSession = localStorage.getItem(storageKey)

            let accessToken: string | null = null
            if (storedSession) {
                try {
                    const parsed = JSON.parse(storedSession)
                    accessToken = parsed.access_token
                } catch (e) {
                    console.error('Failed to parse stored session:', e)
                }
            }

            if (!accessToken) throw new Error('Not authenticated')

            const response = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&select=id,email,full_name,role,is_active`, {
                headers: {
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`,
                }
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}))
                throw new Error(errorData.message || `HTTP ${response.status}`)
            }

            const [target] = await response.json() as Array<{
                id: string
                email: string | null
                full_name: string | null
                role: ManagedUserRole
                is_active: boolean
            }>

            if (!target) throw new Error('Platform staff profile not found')

            await upsertManagedUser({
                userId: target.id,
                email: target.email ?? undefined,
                fullName: target.full_name ?? undefined,
                role: (updates.role ?? target.role) as ManagedUserRole,
                tenantId: null,
                status: updates.status
                    ? (updates.status === 'active' ? 'active' : 'inactive')
                    : (target.is_active ? 'active' : 'inactive'),
            })
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: platformKeys.staff })
        },
    })
}

export function useDeletePlatformStaff() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (id: string) => {
            await revokeManagedUser({ userId: id })
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: platformKeys.staff })
        },
    })
}

// ==================== AUDIT LOGS HOOKS ====================

// Helper to get token
const getAccessToken = () => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`
    const storedSession = localStorage.getItem(storageKey)
    if (storedSession) {
        try {
            return JSON.parse(storedSession).access_token
        } catch { return null }
    }
    return null
}

// ==================== AUDIT LOGS HOOKS ====================

export function useAuditLogs(filters?: AuditLogFilters) {
    return useQuery({
        queryKey: platformKeys.auditLogsList(filters),
        queryFn: async () => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()
            if (!accessToken) return [] as AuditLog[]

            let queryString = `${supabaseUrl}/rest/v1/platform_audit_logs?select=*&order=created_at.desc`

            if (filters?.limit) queryString += `&limit=${filters.limit}`
            if (filters?.actionType && filters.actionType !== 'all') queryString += `&action_type=eq.${filters.actionType}`
            if (filters?.userId) queryString += `&user_id=eq.${filters.userId}`
            if (filters?.dateFrom) queryString += `&created_at=gte.${filters.dateFrom}`
            if (filters?.dateTo) queryString += `&created_at=lte.${filters.dateTo}`

            const response = await fetch(queryString, {
                headers: {
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`
                }
            })

            if (!response.ok) {
                console.error('Audit logs error:', response.status)
                return [] as AuditLog[]
            }

            return await response.json() as AuditLog[]
        },
    })
}

export function useAuditLogStats() {
    return useQuery({
        queryKey: [...platformKeys.auditLogs, 'stats'],
        queryFn: async () => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()
            if (!accessToken) return { total: 0, today: 0, byType: {} }

            const today = new Date().toISOString().split('T')[0]

            // Fetch basic stats
            const response = await fetch(`${supabaseUrl}/rest/v1/platform_audit_logs?select=id,action_type,created_at`, {
                headers: {
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`
                }
            })

            if (!response.ok) return { total: 0, today: 0, byType: {} }

            const data = await response.json()

            const stats = {
                total: data?.length || 0,
                today: data?.filter((l: any) => l.created_at.startsWith(today)).length || 0,
                byType: {} as Record<string, number>
            }

            data?.forEach((log: any) => {
                stats.byType[log.action_type] = (stats.byType[log.action_type] || 0) + 1
            })

            return stats
        },
    })
}

export function useLogAction() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (params: {
            action: string
            actionType: AuditLog['action_type']
            targetType?: string
            targetId?: string
            targetName?: string
            oldValues?: Record<string, unknown>
            newValues?: Record<string, unknown>
            metadata?: Record<string, unknown>
        }) => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()
            if (!accessToken) throw new Error('Not authenticated')

            // Fetch current user info manualy or use metadata if passed
            // For now, simpler implementation:
            const response = await fetch(`${supabaseUrl}/rest/v1/platform_audit_logs`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`,
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({
                    action: params.action,
                    action_type: params.actionType,
                    target_type: params.targetType,
                    target_id: params.targetId,
                    target_name: params.targetName,
                    old_values: params.oldValues,
                    new_values: params.newValues,
                    metadata: params.metadata || {},
                    // user_id and others will be set by backend ideally, or we let them be null if RLS handles generic inserts
                    // Ideally we should get user id here but to stay pure fetch we might need another call.
                    // Skipping user details enrichment for THIS fetch call for speed, or we can add it.
                })
            })

            if (!response.ok) throw new Error('Failed to log action')
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: platformKeys.auditLogs })
        },
    })
}

// Invoices/Financials removed — use useBillingInvoices / useBillingStats from useBillingEngine.ts
