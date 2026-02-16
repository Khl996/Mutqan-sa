import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useTenant } from '@/contexts/TenantContext'

// Types
export interface WorkTeam {
    id: string
    tenant_id: string
    code: string
    name: string
    name_ar: string | null
    description: string | null
    type: string // Stores specialization like 'electrical', 'mechanical', etc.
    specializations: string[] | null
    status: 'active' | 'inactive' | 'archived'
    created_at: string
    updated_at: string
    // Computed
    member_count?: number
}

export interface TeamMemberAssignment {
    id: string
    team_id: string
    user_id: string
    role: 'leader' | 'member' | 'supervisor'
    specializations: string[] | null
    joined_at: string
    is_active: boolean
    // Joined
    user?: {
        id: string
        full_name: string | null
        full_name_ar: string | null
        email: string | null
        role: string
    }
}

export interface CreateWorkTeamInput {
    code: string
    name: string
    name_ar?: string | null
    description?: string | null
    type?: WorkTeam['type']
    specializations?: string[]
}

export interface AddTeamMemberInput {
    team_id: string
    user_id: string
    role?: 'leader' | 'member' | 'supervisor'
    specializations?: string[]
}

// Query Keys
export const workTeamsKeys = {
    all: ['workTeams'] as const,
    list: () => [...workTeamsKeys.all, 'list'] as const,
    team: (id: string) => [...workTeamsKeys.all, id] as const,
    members: (teamId: string) => [...workTeamsKeys.all, teamId, 'members'] as const,
}

// Team Specializations (matches issue_types)
export const TEAM_SPECIALIZATIONS = [
    { value: 'electrical', label: 'Electrical', label_ar: 'كهرباء', icon: 'zap', color: '#F59E0B' },
    { value: 'mechanical', label: 'Mechanical', label_ar: 'ميكانيكا', icon: 'wrench', color: '#3B82F6' },
    { value: 'plumbing', label: 'Plumbing', label_ar: 'سباكة', icon: 'droplet', color: '#06B6D4' },
    { value: 'hvac', label: 'HVAC', label_ar: 'تكييف وتبريد', icon: 'thermometer', color: '#10B981' },
    { value: 'civil', label: 'Civil', label_ar: 'أعمال مدنية', icon: 'building', color: '#6B7280' },
    { value: 'medical_equipment', label: 'Medical Equipment', label_ar: 'معدات طبية', icon: 'heart-pulse', color: '#EF4444' },
    { value: 'it', label: 'IT & Network', label_ar: 'تقنية المعلومات', icon: 'wifi', color: '#8B5CF6' },
    { value: 'cleaning', label: 'Cleaning', label_ar: 'نظافة', icon: 'sparkles', color: '#EC4899' },
    { value: 'safety', label: 'Safety & Security', label_ar: 'السلامة والأمن', icon: 'shield', color: '#DC2626' },
    { value: 'general', label: 'General Maintenance', label_ar: 'صيانة عامة', icon: 'wrench', color: '#9CA3AF' },
] as const

export type TeamSpecialization = typeof TEAM_SPECIALIZATIONS[number]['value']

// Fetch all teams for current tenant
export function useWorkTeams() {
    const { currentTenant } = useTenant()

    return useQuery({
        queryKey: [...workTeamsKeys.list(), currentTenant?.id],
        queryFn: async () => {
            if (!currentTenant?.id) return []

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase
                .from('teams')
                .select('*')
                .eq('tenant_id', currentTenant.id)
                .order('name', { ascending: true }) as any)

            if (error) throw error

            // Get member counts for each team
            const teamsWithCounts = await Promise.all(
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (data || []).map(async (team: any) => {
                    const { count } = await supabase
                        .from('team_members')
                        .select('*', { count: 'exact', head: true })
                        .eq('team_id', team.id)
                        .eq('is_active', true)

                    return { ...team, member_count: count || 0 }
                })
            )

            return teamsWithCounts as WorkTeam[]
        },
        enabled: !!currentTenant?.id
    })
}

// Fetch single team
export function useWorkTeam(id: string) {
    return useQuery({
        queryKey: workTeamsKeys.team(id),
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase
                .from('teams')
                .select('*')
                .eq('id', id)
                .single() as any)

            if (error) throw error
            return data as WorkTeam
        },
        enabled: !!id
    })
}

// Fetch team members
export function useTeamMembers(teamId: string) {
    return useQuery({
        queryKey: workTeamsKeys.members(teamId),
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase
                .from('team_members')
                .select(`
                    *,
                    user:user_id(id, full_name, full_name_ar, email, role)
                `)
                .eq('team_id', teamId)
                .order('role', { ascending: true }) as any)

            if (error) throw error
            return data as TeamMemberAssignment[]
        },
        enabled: !!teamId
    })
}

// Create team
export function useCreateWorkTeam() {
    const queryClient = useQueryClient()
    const { currentTenant } = useTenant()

    return useMutation({
        mutationFn: async (input: CreateWorkTeamInput) => {
            if (!currentTenant?.id) throw new Error('No tenant selected')

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase
                .from('teams')
                .insert({
                    ...input,
                    tenant_id: currentTenant.id
                })
                .select()
                .single() as any)

            if (error) throw error
            return data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: workTeamsKeys.list() })
        }
    })
}

// Update team
export function useUpdateWorkTeam() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ id, ...updates }: Partial<WorkTeam> & { id: string }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase
                .from('teams')
                .update({ ...updates, updated_at: new Date().toISOString() })
                .eq('id', id)
                .select()
                .single() as any)

            if (error) throw error
            return data
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: workTeamsKeys.list() })
            queryClient.invalidateQueries({ queryKey: workTeamsKeys.team(variables.id) })
        }
    })
}

// Delete team
export function useDeleteWorkTeam() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from('teams')
                .delete()
                .eq('id', id)

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: workTeamsKeys.list() })
        }
    })
}

// Add member to team
export function useAddTeamMember() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (input: AddTeamMemberInput) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase
                .from('team_members')
                .insert({
                    team_id: input.team_id,
                    user_id: input.user_id,
                    role: input.role || 'member',
                    specializations: input.specializations || null,
                    is_active: true
                })
                .select()
                .single() as any)

            if (error) throw error
            return data
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: workTeamsKeys.members(variables.team_id) })
            queryClient.invalidateQueries({ queryKey: workTeamsKeys.list() })
        }
    })
}

// Remove member from team
export function useRemoveTeamMember() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ teamId, memberId }: { teamId: string; memberId: string }) => {
            const { error } = await supabase
                .from('team_members')
                .delete()
                .eq('id', memberId)

            if (error) throw error
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: workTeamsKeys.members(variables.teamId) })
            queryClient.invalidateQueries({ queryKey: workTeamsKeys.list() })
        }
    })
}
