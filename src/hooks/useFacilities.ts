import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCurrentTenantId } from './useTenantQuery'

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

// Types - متوافقة مع هيكل الجدول في 001_core_tables.sql
export interface Building {
    id: string
    tenant_id: string
    code: string
    name: string
    name_ar: string | null
    description: string | null
    address: string | null
    coordinates_lat: number | null
    coordinates_lng: number | null
    image_url: string | null
    is_active: boolean
    created_at: string
    updated_at: string
}

export interface Floor {
    id: string
    building_id: string
    code: string
    name: string
    name_ar: string | null
    level: number
    is_active: boolean
    created_at: string
    updated_at: string
}

export interface Department {
    id: string
    tenant_id: string
    floor_id: string | null
    building_id: string | null
    code: string
    name: string
    name_ar: string | null
    is_active: boolean
    created_at: string
    updated_at: string
}

export interface Room {
    id: string
    department_id: string | null
    floor_id: string | null
    building_id: string | null
    tenant_id: string
    code: string
    name: string
    name_ar: string | null
    room_type: string | null
    capacity: number | null
    is_active: boolean
    created_at: string
    updated_at: string
}

// Input types for creating
export interface CreateBuildingInput {
    tenant_id: string
    code: string
    name: string
    name_ar?: string | null
    description?: string | null
    address?: string | null
    coordinates_lat?: number | null
    coordinates_lng?: number | null
    image_url?: string | null
    is_active?: boolean
}

export interface CreateFloorInput {
    building_id: string
    code: string
    name: string
    name_ar?: string | null
    level: number
    is_active?: boolean
}

// Query Keys
export const facilitiesKeys = {
    all: ['facilities'] as const,
    buildings: () => [...facilitiesKeys.all, 'buildings'] as const,
    building: (id: string) => [...facilitiesKeys.buildings(), id] as const,
    floors: (buildingId: string) => [...facilitiesKeys.all, 'floors', buildingId] as const,
    rooms: (floorId: string) => [...facilitiesKeys.all, 'rooms', floorId] as const, // Added rooms key
    departments: () => [...facilitiesKeys.all, 'departments'] as const,
}

// Fetch Buildings
export function useBuildings() {
    const tenantId = useCurrentTenantId()

    return useQuery({
        queryKey: [...facilitiesKeys.buildings(), tenantId],
        queryFn: async () => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()
            if (!accessToken) throw new Error('Not authenticated')

            let query = `${supabaseUrl}/rest/v1/buildings?select=*&order=created_at.desc`

            // Apply tenant filter if available
            if (tenantId) {
                query += `&tenant_id=eq.${tenantId}`
            }

            const response = await fetch(query, {
                headers: {
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`
                }
            })

            if (!response.ok) throw new Error('Failed to fetch buildings')
            return await response.json() as Building[]
        },
    })
}

// Fetch Single Building
export function useBuilding(id: string) {
    return useQuery({
        queryKey: facilitiesKeys.building(id),
        queryFn: async () => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()
            if (!accessToken) throw new Error('Not authenticated')

            const response = await fetch(`${supabaseUrl}/rest/v1/buildings?id=eq.${id}&select=*`, {
                headers: {
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`
                }
            })

            if (!response.ok) throw new Error('Failed to fetch building')
            const data = await response.json()
            return data && data.length > 0 ? data[0] : null
        },
        enabled: !!id,
    })
}

// Fetch Floors by Building
export function useFloors(buildingId: string) {
    return useQuery({
        queryKey: facilitiesKeys.floors(buildingId),
        queryFn: async () => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()
            if (!accessToken) throw new Error('Not authenticated')

            const response = await fetch(`${supabaseUrl}/rest/v1/floors?building_id=eq.${buildingId}&order=level.asc&select=*`, {
                headers: {
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`
                }
            })

            if (!response.ok) throw new Error('Failed to fetch floors')
            return await response.json() as Floor[]
        },
        enabled: !!buildingId,
    })
}

// Fetch Rooms by Floor
export function useRooms(floorId: string) {
    return useQuery({
        queryKey: facilitiesKeys.rooms(floorId),
        queryFn: async () => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()
            if (!accessToken) throw new Error('Not authenticated')

            const response = await fetch(`${supabaseUrl}/rest/v1/rooms?floor_id=eq.${floorId}&order=name.asc&select=*`, {
                headers: {
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`
                }
            })

            if (!response.ok) throw new Error('Failed to fetch rooms')
            return await response.json() as Room[]
        },
        enabled: !!floorId,
    })
}

// Fetch Departments
export function useDepartments() {
    return useQuery({
        queryKey: facilitiesKeys.departments(),
        queryFn: async () => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()
            if (!accessToken) throw new Error('Not authenticated')

            const response = await fetch(`${supabaseUrl}/rest/v1/departments?order=name.asc&select=*`, {
                headers: {
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`
                }
            })

            if (!response.ok) throw new Error('Failed to fetch departments')
            return await response.json() as Department[]
        },
    })
}

// Create Building
export function useCreateBuilding() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (building: CreateBuildingInput) => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()
            if (!accessToken) throw new Error('Not authenticated')

            const response = await fetch(`${supabaseUrl}/rest/v1/buildings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`,
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify(building)
            })

            if (!response.ok) throw new Error('Failed to create building')
            const data = await response.json()
            return data && data.length > 0 ? data[0] : null
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: facilitiesKeys.buildings() })
        },
    })
}

// Create Floor
export function useCreateFloor() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (floor: CreateFloorInput) => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()
            if (!accessToken) throw new Error('Not authenticated')

            const response = await fetch(`${supabaseUrl}/rest/v1/floors`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`,
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify(floor)
            })

            if (!response.ok) throw new Error('Failed to create floor')
            const data = await response.json()
            return data && data.length > 0 ? data[0] : null
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: facilitiesKeys.floors(variables.building_id) })
        },
    })
}

// Update Building
export function useUpdateBuilding() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ id, ...updates }: Partial<Building> & { id: string }) => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()
            if (!accessToken) throw new Error('Not authenticated')

            const response = await fetch(`${supabaseUrl}/rest/v1/buildings?id=eq.${id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`,
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() })
            })

            if (!response.ok) throw new Error('Failed to update building')
            const data = await response.json()
            return data && data.length > 0 ? data[0] : null
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: facilitiesKeys.buildings() })
            queryClient.invalidateQueries({ queryKey: facilitiesKeys.building(variables.id) })
        },
    })
}

// Delete Building
export function useDeleteBuilding() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (id: string) => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()
            if (!accessToken) throw new Error('Not authenticated')

            const response = await fetch(`${supabaseUrl}/rest/v1/buildings?id=eq.${id}`, {
                method: 'DELETE',
                headers: {
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`
                }
            })

            if (!response.ok) throw new Error('Failed to delete building')
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: facilitiesKeys.buildings() })
        },
    })
}
