import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { upsertManagedUser, type ManagedUserRole } from '@/lib/adminUserApi'
import { useTenant } from '@/contexts/TenantContext'

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
    supervisor?: { id: string, full_name: string | null, full_name_ar: string | null }
}

export interface TeamStats {
    total: number
    active: number
    inactive: number
    byRole: Record<string, number>
}

export const AVAILABLE_ROLES = [
    { value: 'tenant_admin', label: 'Tenant Admin', label_ar: 'مدير المنشأة', color: 'warning' },
    { value: 'facility_manager', label: 'Facility Manager', label_ar: 'مدير المرافق', color: 'warning' },
    { value: 'maintenance_manager', label: 'Maintenance Manager', label_ar: 'مدير الصيانة', color: 'info' },
    { value: 'engineer', label: 'Engineer', label_ar: 'مهندس', color: 'info' },
    { value: 'supervisor', label: 'Supervisor', label_ar: 'مشرف', color: 'success' },
    { value: 'technician', label: 'Technician', label_ar: 'فني', color: 'success' },
    { value: 'reporter', label: 'Reporter', label_ar: 'مبلّغ', color: 'muted' },
] as const

export const TENANT_ROLES = AVAILABLE_ROLES

export type RoleValue = typeof AVAILABLE_ROLES[number]['value']
export type TenantRoleValue = typeof TENANT_ROLES[number]['value']

export interface CreateTeamMemberInput {
    email: string
    full_name: string
    role: TenantRoleValue
    password: string
    department?: string
    job_title?: string
}

export const teamKeys = {
    all: ['team'] as const,
    list: () => [...teamKeys.all, 'list'] as const,
    member: (id: string) => [...teamKeys.all, id] as const,
    stats: () => [...teamKeys.all, 'stats'] as const,
}

const getAccessToken = () => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`
    const storedSession = localStorage.getItem(storageKey)

    if (storedSession) {
        try {
            return JSON.parse(storedSession).access_token
        } catch {
            return null
        }
    }

    return null
}

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
                    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
                    Authorization: `Bearer ${accessToken}`,
                },
            })

            if (!response.ok) throw new Error('Failed to fetch team members')

            const data = await response.json()
            return data as TeamMember[]
        },
        enabled: !!currentTenant?.id,
    })
}

export function useTeamMember(id: string) {
    return useQuery({
        queryKey: teamKeys.member(id),
        queryFn: async () => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()

            if (!accessToken) throw new Error('Not authenticated')

            const response = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${id}&select=*`, {
                headers: {
                    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
                    Authorization: `Bearer ${accessToken}`,
                },
            })

            if (!response.ok) throw new Error('Failed to fetch member')

            const data = await response.json()
            return (data && data.length > 0 ? data[0] : null) as TeamMember
        },
        enabled: !!id,
    })
}

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
                    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
                    Authorization: `Bearer ${accessToken}`,
                },
            })

            if (!response.ok) return { total: 0, active: 0, inactive: 0, byRole: {} }

            const data = await response.json()
            const stats: TeamStats = {
                total: data?.length || 0,
                active: 0,
                inactive: 0,
                byRole: {},
            }

            data?.forEach((member: { is_active?: boolean; role?: string }) => {
                if (member.is_active) stats.active++
                else stats.inactive++

                if (member.role) {
                    stats.byRole[member.role] = (stats.byRole[member.role] || 0) + 1
                }
            })

            return stats
        },
        enabled: !!currentTenant?.id,
    })
}

export function useUpdateTeamMember() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({
            id,
            ...updates
        }: {
            id: string
            role?: TenantRoleValue
            is_active?: boolean
            department?: string
            job_title?: string
            supervisor_id?: string | null
        }) => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()

            if (!accessToken) throw new Error('Not authenticated')

            const hasProtectedAuthorityUpdate = updates.role !== undefined || updates.is_active !== undefined
            let managedResult: Awaited<ReturnType<typeof upsertManagedUser>> | null = null

            if (hasProtectedAuthorityUpdate) {
                const targetResponse = await fetch(
                    `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&select=id,email,full_name,role,tenant_id,is_active,department,job_title`,
                    {
                        headers: {
                            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
                            Authorization: `Bearer ${accessToken}`,
                        },
                    },
                )

                if (!targetResponse.ok) {
                    const error = await targetResponse.json().catch(() => ({}))
                    throw new Error(error.message || 'Failed to load managed member authority')
                }

                const [target] = await targetResponse.json() as Array<{
                    id: string
                    email: string | null
                    full_name: string | null
                    role: ManagedUserRole
                    tenant_id: string | null
                    is_active: boolean
                    department: string | null
                    job_title: string | null
                }>

                if (!target) throw new Error('Managed member not found')

                managedResult = await upsertManagedUser({
                    userId: target.id,
                    email: target.email ?? undefined,
                    fullName: target.full_name ?? undefined,
                    role: (updates.role ?? target.role) as ManagedUserRole,
                    tenantId: target.tenant_id,
                    status: (updates.is_active ?? target.is_active) ? 'active' : 'inactive',
                    department: updates.department ?? target.department,
                    jobTitle: updates.job_title ?? target.job_title,
                })
            }

            const directUpdates: Record<string, unknown> = {}
            if (!hasProtectedAuthorityUpdate) {
                if (updates.department !== undefined) directUpdates.department = updates.department
                if (updates.job_title !== undefined) directUpdates.job_title = updates.job_title
            }
            if (updates.supervisor_id !== undefined) directUpdates.supervisor_id = updates.supervisor_id

            if (Object.keys(directUpdates).length === 0) {
                return managedResult
            }

            const response = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
                    Authorization: `Bearer ${accessToken}`,
                    Prefer: 'return=representation',
                },
                body: JSON.stringify({ ...directUpdates, updated_at: new Date().toISOString() }),
            })

            if (!response.ok) {
                const error = await response.json().catch(() => ({}))
                throw new Error(error.message || 'Failed to update member')
            }

            const data = await response.json()
            return data && data.length > 0 ? data[0] : managedResult
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: teamKeys.list() })
            queryClient.invalidateQueries({ queryKey: teamKeys.member(variables.id) })
            queryClient.invalidateQueries({ queryKey: teamKeys.stats() })
        },
    })
}

export function useCreateTeamMember() {
    const queryClient = useQueryClient()
    const { currentTenant } = useTenant()

    return useMutation({
        mutationFn: async (input: CreateTeamMemberInput) => {
            if (!currentTenant?.id) throw new Error('No active tenant selected')

            return upsertManagedUser({
                email: input.email.trim().toLowerCase(),
                password: input.password,
                fullName: input.full_name,
                role: input.role,
                tenantId: currentTenant.id,
                status: 'active',
                department: input.department || null,
                jobTitle: input.job_title || null,
            })
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: teamKeys.list() })
            queryClient.invalidateQueries({ queryKey: teamKeys.stats() })
        },
    })
}
