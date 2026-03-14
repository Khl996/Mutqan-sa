/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

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

export interface PlatformInvoice {
    id: string
    invoice_number: string
    tenant_id: string | null
    subscription_id: string | null
    plan_id: string | null
    plan_name: string | null
    billing_period_start: string | null
    billing_period_end: string | null
    subtotal: number
    discount: number
    discount_code: string | null
    tax_rate: number
    tax_amount: number
    total: number
    currency: string
    status: 'draft' | 'pending' | 'paid' | 'overdue' | 'cancelled' | 'refunded'
    due_date: string | null
    paid_at: string | null
    payment_method: string | null
    payment_reference: string | null
    notes: string | null
    pdf_url: string | null
    created_at: string
    // Joined
    tenant?: {
        id: string
        name: string
        name_ar: string | null
    }
}

export interface FinancialStats {
    totalRevenue: number
    pendingAmount: number
    overdueAmount: number
    paidInvoices: number
    pendingInvoices: number
    overdueInvoices: number
    totalInvoices: number
    collectionRate: number
}

// Query Keys
export const platformKeys = {
    staff: ['platform', 'staff'] as const,
    staffList: () => [...platformKeys.staff, 'list'] as const,
    staffMember: (id: string) => [...platformKeys.staff, id] as const,
    auditLogs: ['platform', 'audit-logs'] as const,
    auditLogsList: (filters?: AuditLogFilters) => [...platformKeys.auditLogs, 'list', filters] as const,
    invoices: ['platform', 'invoices'] as const,
    invoicesList: (filters?: InvoiceFilters) => [...platformKeys.invoices, 'list', filters] as const,
    financials: ['platform', 'financials'] as const,
    financialStats: () => [...platformKeys.financials, 'stats'] as const,
}

interface AuditLogFilters {
    actionType?: string
    userId?: string
    dateFrom?: string
    dateTo?: string
    limit?: number
}

interface InvoiceFilters {
    status?: string
    tenantId?: string
    dateFrom?: string
    dateTo?: string
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

            // Roles filter using LIKE for platform_%
            // Since we can't easily do complicated OR logic in simple REST, we'll fetch all profiles and filter in memory
            // Or use a more specific query if possible. For now, fetching all is safer to debug, but ideally we should filter.
            // Let's filter by checking if role contains 'platform' to limit data a bit if possible, but standard REST simpler:

            const response = await fetch(`${supabaseUrl}/rest/v1/profiles?select=*&order=created_at.desc`, {
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

            const profiles = await response.json()

            // Filter in memory for platform roles
            const platformProfiles = profiles.filter((p: any) =>
                p.role === 'platform_owner' ||
                p.role === 'platform_admin' ||
                p.role === 'platform_support' ||
                p.role === 'platform_finance' ||
                p.role === 'platform_hr' ||
                p.role.startsWith('platform_')
            )

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

            const response = await fetch(`${supabaseUrl}/rest/v1/profiles?select=id,role,is_active`, {
                headers: {
                    'apikey': supabaseAnonKey,
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            })

            if (!response.ok) throw new Error('Failed to fetch stats')

            const data = await response.json()

            // Filter for platform roles
            const platformData = data.filter((p: any) =>
                p.role === 'platform_owner' ||
                p.role?.startsWith('platform_')
            )

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

            const updateData: any = {
                updated_at: new Date().toISOString()
            }

            if (updates.role) updateData.role = updates.role
            if (updates.status) updateData.is_active = updates.status === 'active'

            const response = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${id}`, {
                method: 'PATCH',
                headers: {
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify(updateData)
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}))
                throw new Error(errorData.message || `HTTP ${response.status}`)
            }
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

            // Downgrade to regular user
            const response = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${id}`, {
                method: 'PATCH',
                headers: {
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({
                    role: 'user',
                    updated_at: new Date().toISOString()
                })
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}))
                throw new Error(errorData.message || `HTTP ${response.status}`)
            }
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

// ==================== INVOICES/FINANCIALS HOOKS ====================

export function usePlatformInvoices(filters?: InvoiceFilters) {
    return useQuery({
        queryKey: platformKeys.invoicesList(filters),
        queryFn: async () => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()
            if (!accessToken) return [] as PlatformInvoice[]

            let queryString = `${supabaseUrl}/rest/v1/platform_invoices?select=*,tenant:tenants(id,name,name_ar,address)&order=created_at.desc`

            if (filters?.status && filters.status !== 'all') queryString += `&status=eq.${filters.status}`
            if (filters?.tenantId) queryString += `&tenant_id=eq.${filters.tenantId}`

            const response = await fetch(queryString, {
                headers: {
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`
                }
            })

            if (!response.ok) {
                console.error('Invoices fetch error:', response.status)
                return [] as PlatformInvoice[]
            }

            return await response.json() as PlatformInvoice[]
        },
    })
}

export function useFinancialStats() {
    return useQuery({
        queryKey: platformKeys.financialStats(),
        queryFn: async () => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()
            if (!accessToken) return {
                totalRevenue: 0, pendingAmount: 0, overdueAmount: 0,
                paidInvoices: 0, pendingInvoices: 0, overdueInvoices: 0, totalInvoices: 0, collectionRate: 0
            }

            const response = await fetch(`${supabaseUrl}/rest/v1/platform_invoices?select=id,status,total`, {
                headers: {
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`
                }
            })

            if (!response.ok) return {
                totalRevenue: 0, pendingAmount: 0, overdueAmount: 0,
                paidInvoices: 0, pendingInvoices: 0, overdueInvoices: 0, totalInvoices: 0, collectionRate: 0
            }

            const invoices = await response.json()

            const stats: FinancialStats = {
                totalRevenue: 0,
                pendingAmount: 0,
                overdueAmount: 0,
                paidInvoices: 0,
                pendingInvoices: 0,
                overdueInvoices: 0,
                totalInvoices: invoices?.length || 0,
                collectionRate: 0,
            }

            invoices?.forEach((inv: any) => {
                const amount = Number(inv.total) || 0
                if (inv.status === 'paid') {
                    stats.totalRevenue += amount
                    stats.paidInvoices++
                } else if (inv.status === 'pending') {
                    stats.pendingAmount += amount
                    stats.pendingInvoices++
                } else if (inv.status === 'overdue') {
                    stats.overdueAmount += amount
                    stats.overdueInvoices++
                }
            })

            stats.collectionRate = stats.totalInvoices > 0
                ? Math.round((stats.paidInvoices / stats.totalInvoices) * 100)
                : 0

            return stats
        },
    })
}

export function useCreateInvoice() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (invoice: Partial<PlatformInvoice>) => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()
            if (!accessToken) throw new Error('Not authenticated')

            const response = await fetch(`${supabaseUrl}/rest/v1/platform_invoices`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`,
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify(invoice)
            })

            if (!response.ok) throw new Error('Failed to create invoice')
            const data = await response.json()
            return data && data.length > 0 ? data[0] : null
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: platformKeys.invoices })
            queryClient.invalidateQueries({ queryKey: platformKeys.financials })
        },
    })
}

export function useUpdateInvoice() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ id, ...updates }: Partial<PlatformInvoice> & { id: string }) => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()
            if (!accessToken) throw new Error('Not authenticated')

            const response = await fetch(`${supabaseUrl}/rest/v1/platform_invoices?id=eq.${id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`,
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify({
                    ...updates,
                    updated_at: new Date().toISOString(),
                })
            })

            if (!response.ok) throw new Error('Failed to update invoice')
            const data = await response.json()
            return data && data.length > 0 ? data[0] : null
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: platformKeys.invoices })
            queryClient.invalidateQueries({ queryKey: platformKeys.financials })
        },
    })
}
