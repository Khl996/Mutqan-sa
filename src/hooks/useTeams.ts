import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'


// Types
export interface TeamMember {
    id: string
    tenant_id: string | null
    full_name: string | null
    full_name_ar: string | null
    email: string | null
    phone: string | null
    avatar_url: string | null
    role: string
    is_super_admin: boolean
    is_active: boolean
    last_activity_at: string | null
    department: string | null
    employee_number: string | null
    job_title: string | null
    supervisor_id: string | null
    language: string
    timezone: string
    created_at: string
    updated_at: string
    // Joined data
    supervisor?: { id: string, full_name: string | null, full_name_ar: string | null }
}

export interface TeamStats {
    total: number
    active: number
    inactive: number
    byRole: Record<string, number>
}

export interface CreateTeamMemberInput {
    email: string
    full_name: string
    role: string
    password?: string // Optional, if we want to auto-generate or set it
    department?: string
    job_title?: string
}

// Query Keys
export const teamKeys = {
    all: ['team'] as const,
    list: () => [...teamKeys.all, 'list'] as const,
    member: (id: string) => [...teamKeys.all, id] as const,
    stats: () => [...teamKeys.all, 'stats'] as const,
}

import { useTenant } from '@/contexts/TenantContext'

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

// Fetch All Team Members (Filtered by Tenant)
export function useTeamMembers() {
    const { currentTenant } = useTenant()

    return useQuery({
        queryKey: [...teamKeys.list(), currentTenant?.id],
        queryFn: async () => {
            if (!currentTenant?.id) return []

            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()

            if (!accessToken) throw new Error('Not authenticated')

            const response = await fetch(`${supabaseUrl}/rest/v1/profiles?tenant_id=eq.${currentTenant.id}&order=created_at.desc`, {
                headers: {
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`
                }
            })

            if (!response.ok) throw new Error('Failed to fetch team members')

            const data = await response.json()
            return data as TeamMember[]
        },
        enabled: !!currentTenant?.id
    })
}

// Fetch Single Team Member
export function useTeamMember(id: string) {
    return useQuery({
        queryKey: teamKeys.member(id),
        queryFn: async () => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()
            if (!accessToken) throw new Error('Not authenticated')

            const response = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${id}&select=*`, {
                headers: {
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`
                }
            })

            if (!response.ok) throw new Error('Failed to fetch member')
            const data = await response.json()
            return (data && data.length > 0 ? data[0] : null) as TeamMember
        },
        enabled: !!id,
    })
}

// Get Team Stats (Filtered by Tenant)
export function useTeamStats() {
    const { currentTenant } = useTenant()

    return useQuery({
        queryKey: [...teamKeys.stats(), currentTenant?.id],
        queryFn: async () => {
            if (!currentTenant?.id) return { total: 0, active: 0, inactive: 0, byRole: {} }

            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()

            if (!accessToken) return { total: 0, active: 0, inactive: 0, byRole: {} }

            const response = await fetch(`${supabaseUrl}/rest/v1/profiles?tenant_id=eq.${currentTenant.id}&select=role,is_active`, {
                headers: {
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`
                }
            })

            if (!response.ok) return { total: 0, active: 0, inactive: 0, byRole: {} }

            const data = await response.json()

            const stats: TeamStats = {
                total: data?.length || 0,
                active: 0,
                inactive: 0,
                byRole: {},
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data?.forEach((member: any) => {
                if (member.is_active) stats.active++
                else stats.inactive++

                if (member.role) {
                    stats.byRole[member.role] = (stats.byRole[member.role] || 0) + 1
                }
            })

            return stats
        },
        enabled: !!currentTenant?.id
    })
}

// Update Team Member (Role, Status, etc.)
export function useUpdateTeamMember() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({
            id,
            ...updates
        }: {
            id: string
            role?: string
            is_active?: boolean
            department?: string
            job_title?: string
            supervisor_id?: string | null
        }) => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()

            if (!accessToken) throw new Error('Not authenticated')

            const response = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`,
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() })
            })

            if (!response.ok) {
                const error = await response.json().catch(() => ({}))
                throw new Error(error.message || 'Failed to update member')
            }

            const data = await response.json()
            return data && data.length > 0 ? data[0] : null
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: teamKeys.list() })
            queryClient.invalidateQueries({ queryKey: teamKeys.member(variables.id) })
            queryClient.invalidateQueries({ queryKey: teamKeys.stats() })
        },
    })
}

// Create Team Member
export function useCreateTeamMember() {
    const queryClient = useQueryClient()
    const { currentTenant } = useTenant()

    return useMutation({
        mutationFn: async (input: CreateTeamMemberInput) => {
            if (!currentTenant?.id) throw new Error('No active tenant selected')

            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()

            if (!accessToken) throw new Error('Not authenticated')

            console.log('👤 Creating team member for tenant:', currentTenant.id)

            // Create user via Auth API
            const response = await fetch(`${supabaseUrl}/auth/v1/signup`, {
                method: 'POST',
                headers: {
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({
                    email: input.email,
                    password: input.password || 'Mutqan@123',
                    data: {
                        full_name: input.full_name,
                        role: input.role,
                        tenant_id: currentTenant.id, // CRITICAL: Link to current tenant
                        department: input.department,
                        job_title: input.job_title
                    }
                })
            })

            if (!response.ok) {
                const error = await response.json().catch(() => ({}))
                throw new Error(error.msg || error.message || 'Failed to create member')
            }

            const data = await response.json()
            return data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: teamKeys.list() })
            queryClient.invalidateQueries({ queryKey: teamKeys.stats() })
        },
    })
}

// Get Available Roles (for dropdowns)
export const AVAILABLE_ROLES = [
    { value: 'platform_owner', label: 'Platform Owner', label_ar: 'مالك المنصة', color: 'destructive' },
    { value: 'platform_admin', label: 'Platform Admin', label_ar: 'مدير المنصة', color: 'destructive' },
    { value: 'tenant_admin', label: 'Tenant Admin', label_ar: 'مدير المنشأة', color: 'warning' },
    { value: 'facility_manager', label: 'Facility Manager', label_ar: 'مدير المرافق', color: 'warning' },
    { value: 'maintenance_manager', label: 'Maintenance Manager', label_ar: 'مدير الصيانة', color: 'info' },
    { value: 'engineer', label: 'Engineer', label_ar: 'مهندس', color: 'info' },
    { value: 'supervisor', label: 'Supervisor', label_ar: 'مشرف', color: 'success' },
    { value: 'technician', label: 'Technician', label_ar: 'فني', color: 'success' },
] as const

// Tenant-only roles (excludes platform_owner and platform_admin)
export const TENANT_ROLES = AVAILABLE_ROLES.filter(
    role => !['platform_owner', 'platform_admin'].includes(role.value)
)

export type RoleValue = typeof AVAILABLE_ROLES[number]['value']

