import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

// Tenant Type - matches database schema
export interface Tenant {
    id: string
    slug: string
    name: string
    name_ar: string | null
    description: string | null
    logo_url: string | null
    logo_white_url: string | null
    primary_color: string | null
    secondary_color: string | null
    website: string | null
    email: string | null
    phone: string | null
    address: string | null
    timezone: string | null
    language: string | null
    currency: string | null
    is_active: boolean
    subscription_status: string | null
    plan_id: string | null
    subscription_starts_at: string | null
    subscription_ends_at: string | null
    trial_ends_at: string | null
    billing_cycle: string | null
    max_users: number | null
    max_assets: number | null
    max_work_orders_per_month: number | null
    max_storage_mb: number | null
    enabled_modules: Record<string, unknown> | null
    created_at: string
    updated_at: string
}

export interface TenantStats {
    total: number
    active: number
    inactive: number
    byTier: Record<string, number>
}

export interface CreateTenantInput {
    slug: string
    name: string
    name_ar?: string | null
    description?: string | null
    logo_url?: string | null
    website?: string | null
    email?: string | null
    phone?: string | null
    address?: string | null
    timezone?: string | null
    language?: string | null
    currency?: string | null
    is_active?: boolean
    subscription_status?: string | null
    max_users?: number | null
    max_assets?: number | null
    // Admin User Details (Optional)
    admin_name?: string
    admin_email?: string
    admin_password?: string
}

// Query Keys
export const tenantsKeys = {
    all: ['tenants'] as const,
    list: () => [...tenantsKeys.all, 'list'] as const,
    tenant: (id: string) => [...tenantsKeys.all, id] as const,
    stats: () => [...tenantsKeys.all, 'stats'] as const,
}

// Note: Subscription tiers/plans are fetched from DB via useSubscriptionPlans hook.
// No hardcoded tiers here — DB (subscription_plans table) is the single source of truth.

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

// Fetch All Tenants (Platform Admins Only)
export function useTenants() {
    return useQuery({
        queryKey: tenantsKeys.list(),
        queryFn: async () => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()

            if (!accessToken) {
                throw new Error('Not authenticated')
            }

            const response = await fetch(`${supabaseUrl}/rest/v1/tenants?order=created_at.desc`, {
                headers: {
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`
                }
            })

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}))
                throw new Error(errorData.message || `HTTP ${response.status}`)
            }

            return await response.json() as Tenant[]
        },
    })
}

// Fetch Single Tenant
export function useTenant(id: string) {
    return useQuery({
        queryKey: tenantsKeys.tenant(id),
        queryFn: async () => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()
            if (!accessToken) throw new Error('Not authenticated')

            const response = await fetch(`${supabaseUrl}/rest/v1/tenants?id=eq.${id}&select=*`, {
                headers: {
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`
                }
            })

            if (!response.ok) throw new Error('Failed to fetch tenant')
            const data = await response.json()
            return (data && data.length > 0 ? data[0] : null) as Tenant
        },
        enabled: !!id,
    })
}

// Fetch Tenant Stats
export function useTenantStats() {
    return useQuery({
        queryKey: tenantsKeys.stats(),
        queryFn: async () => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()

            if (!accessToken) {
                return { total: 0, active: 0, inactive: 0, byTier: {} }
            }

            const response = await fetch(`${supabaseUrl}/rest/v1/tenants?select=id,is_active,subscription_status,subscription_tier`, {
                headers: {
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`
                }
            })

            if (!response.ok) {
                return { total: 0, active: 0, inactive: 0, byTier: {} }
            }

            const data = await response.json()

            const stats: TenantStats = {
                total: data?.length || 0,
                active: 0,
                inactive: 0,
                byTier: {},
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data?.forEach((t: any) => {
                if (t.is_active) stats.active++
                else stats.inactive++

                // Use subscription_tier (plan name) for distribution, not subscription_status
                const tier = t.subscription_tier || 'free'
                stats.byTier[tier] = (stats.byTier[tier] || 0) + 1
            })

            return stats
        },
    })
}

// Create Tenant via unified provision_tenant RPC
export function useCreateTenant() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (input: CreateTenantInput) => {
            console.log('📝 Creating tenant via provision_tenant RPC...', input)

            const { admin_name, admin_email, admin_password, ...tenantFields } = input

            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
            const accessToken = getAccessToken()

            if (!accessToken) {
                throw new Error('Not authenticated - no access token found')
            }

            // 1. Call the unified provision_tenant RPC
            const rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/provision_tenant`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': supabaseAnonKey,
                    'Authorization': `Bearer ${accessToken}`,
                },
                body: JSON.stringify({
                    p_name: tenantFields.name,
                    p_name_ar: tenantFields.name_ar || null,
                    p_slug: tenantFields.slug || null,
                    p_email: tenantFields.email || null,
                    p_phone: tenantFields.phone || null,
                    p_address: tenantFields.address || null,
                    p_timezone: tenantFields.timezone || 'Asia/Riyadh',
                    p_plan_code: null,        // let DB decide via is_default
                    p_trial_days: null,       // let plan's trial_days decide
                    p_assign_caller_as_admin: false,  // platform admin is NOT the tenant admin
                })
            })

            if (!rpcResponse.ok) {
                const errorData = await rpcResponse.json().catch(() => ({}))
                console.error('❌ provision_tenant RPC error:', errorData)
                throw new Error(errorData.message || errorData.error || `HTTP ${rpcResponse.status}`)
            }

            const rpcResult = await rpcResponse.json()
            console.log('✅ Tenant provisioned:', rpcResult)

            const newTenantId = rpcResult.tenant_id

            // 2. Create the Admin User (if provided) — requires auth.signUp
            if (admin_email && admin_password && newTenantId) {
                console.log('👤 Creating tenant admin user...')

                const authResponse = await fetch(`${supabaseUrl}/auth/v1/signup`, {
                    method: 'POST',
                    headers: {
                        'apikey': supabaseAnonKey,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        email: admin_email,
                        password: admin_password,
                        data: {
                            full_name: admin_name || 'Admin',
                            role: 'tenant_admin',
                            tenant_id: newTenantId
                        }
                    })
                })

                if (!authResponse.ok) {
                    const authError = await authResponse.json().catch(() => ({}))
                    console.error('❌ Failed to create admin user:', authError)
                    // Don't throw — tenant is already created
                } else {
                    console.log('✅ Tenant admin created successfully')
                }
            }

            // 3. Fetch the newly created tenant to return full object
            const tenantResponse = await fetch(
                `${supabaseUrl}/rest/v1/tenants?id=eq.${newTenantId}&select=*`,
                {
                    headers: {
                        'apikey': supabaseAnonKey,
                        'Authorization': `Bearer ${accessToken}`,
                    }
                }
            )

            if (tenantResponse.ok) {
                const tenantData = await tenantResponse.json()
                return (Array.isArray(tenantData) ? tenantData[0] : tenantData) as Tenant
            }

            // Fallback: return minimal object
            return { id: newTenantId, slug: rpcResult.slug, name: input.name } as Tenant
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: tenantsKeys.list() })
            queryClient.invalidateQueries({ queryKey: tenantsKeys.stats() })
        },
    })
}

// Update Tenant
export function useUpdateTenant() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ id, ...updates }: Partial<Tenant> & { id: string }) => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()
            if (!accessToken) throw new Error('Not authenticated')

            const updateData: Record<string, unknown> = {
                updated_at: new Date().toISOString(),
            }
            Object.entries(updates).forEach(([key, value]) => {
                if (value !== undefined) {
                    updateData[key] = value
                }
            })

            const response = await fetch(`${supabaseUrl}/rest/v1/tenants?id=eq.${id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`,
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify(updateData)
            })

            if (!response.ok) {
                const error = await response.json().catch(() => ({}))
                throw new Error(error.message || 'Failed to update tenant')
            }
            const data = await response.json()
            return data[0] as Tenant
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: tenantsKeys.list() })
            queryClient.invalidateQueries({ queryKey: tenantsKeys.tenant(variables.id) })
            queryClient.invalidateQueries({ queryKey: tenantsKeys.stats() })
        },
    })
}

// Toggle Tenant Status
export function useToggleTenantStatus() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()
            if (!accessToken) throw new Error('Not authenticated')

            const response = await fetch(`${supabaseUrl}/rest/v1/tenants?id=eq.${id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({
                    is_active,
                    updated_at: new Date().toISOString()
                })
            })

            if (!response.ok) throw new Error('Failed to toggle status')
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: tenantsKeys.list() })
            queryClient.invalidateQueries({ queryKey: tenantsKeys.tenant(variables.id) })
            queryClient.invalidateQueries({ queryKey: tenantsKeys.stats() })
        },
    })
}

// Delete Tenant
export function useDeleteTenant() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (id: string) => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()
            if (!accessToken) throw new Error('Not authenticated')

            const response = await fetch(`${supabaseUrl}/rest/v1/tenants?id=eq.${id}`, {
                method: 'DELETE',
                headers: {
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`
                }
            })

            if (!response.ok) throw new Error('Failed to delete tenant')
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: tenantsKeys.list() })
            queryClient.invalidateQueries({ queryKey: tenantsKeys.stats() })
        },
    })
}
// Platform Dashboard Stats
export function usePlatformStats() {
    return useQuery({
        queryKey: ['platform-stats'],
        queryFn: async () => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()

            if (!accessToken) {
                return {
                    totalTenants: 0,
                    activeTenants: 0,
                    totalUsers: 0,
                    monthlyRevenue: 0,
                    recentActivity: [] as any[]
                }
            }

            const headers = {
                'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${accessToken}`
            }

            // 1. Fetch Tenants Stats (Total & Active)
            const tenantsResponse = await fetch(`${supabaseUrl}/rest/v1/tenants?select=is_active`, { headers })
            const tenantsData = await tenantsResponse.json()
            const totalTenants = tenantsData?.length || 0
            const activeTenants = tenantsData?.filter((t: any) => t.is_active).length || 0

            // 2. Fetch Total Users Count (Head request for efficiency)
            const usersResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?select=id`, {
                headers: { ...headers, 'Range': '0-0', 'Prefer': 'count=exact' }
            })
            // Content-Range header format: "0-0/123" -> 123 is total
            const contentRange = usersResponse.headers.get('content-range')
            const totalUsers = contentRange ? parseInt(contentRange.split('/')[1] || '0') : 0

            // 3. Fetch Monthly Revenue (Paid Invoices this month)
            const startOfMonth = new Date()
            startOfMonth.setDate(1)
            startOfMonth.setHours(0, 0, 0, 0)

            const invoicesResponse = await fetch(`${supabaseUrl}/rest/v1/platform_invoices?select=total&status=eq.paid&paid_at=gte.${startOfMonth.toISOString()}`, { headers })
            const invoicesData = await invoicesResponse.json()
            const monthlyRevenue = Array.isArray(invoicesData)
                ? invoicesData.reduce((sum: number, inv: any) => sum + (Number(inv.total) || 0), 0)
                : 0

            // 4. Fetch Recent Activity (Audit Logs)
            const logsResponse = await fetch(`${supabaseUrl}/rest/v1/platform_audit_logs?select=*&order=created_at.desc&limit=5`, { headers })
            const recentActivity = await logsResponse.json()

            return {
                totalTenants,
                activeTenants,
                totalUsers,
                monthlyRevenue,
                recentActivity: Array.isArray(recentActivity) ? recentActivity : []
            }
        },
        refetchInterval: 30000 // Refresh every 30s
    })
}
