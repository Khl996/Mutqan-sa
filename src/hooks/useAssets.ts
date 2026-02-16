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

// Types
export interface AssetCategory {
    id: string
    tenant_id: string
    code: string
    name: string
    name_ar: string | null
    parent_id: string | null
    icon: string | null
    description: string | null
    is_active: boolean
    created_at: string
    updated_at: string
}

export interface Asset {
    id: string
    tenant_id: string
    category_id: string | null
    building_id: string | null
    floor_id: string | null
    department_id: string | null
    room_id: string | null
    code: string
    name: string
    name_ar: string | null
    description: string | null
    manufacturer: string | null
    model: string | null
    serial_number: string | null
    status: 'operational' | 'under_maintenance' | 'out_of_service' | 'retired'
    criticality: 'low' | 'medium' | 'high' | 'critical'
    purchase_date: string | null
    purchase_cost: number | null
    warranty_expiry: string | null
    installation_date: string | null
    barcode: string | null
    qr_code: string | null
    image_url: string | null
    specifications: Record<string, unknown> | null
    created_at: string
    updated_at: string
    // Joined data
    category?: AssetCategory
    building?: { id: string; name: string; name_ar: string | null }
    floor?: { id: string; name: string; name_ar: string | null }
    room?: { id: string; name: string; name_ar: string | null }
}

export interface CreateAssetInput {
    tenant_id: string
    code: string
    name: string
    name_ar?: string | null
    description?: string | null
    category_id?: string | null
    building_id?: string | null
    floor_id?: string | null
    department_id?: string | null
    room_id?: string | null
    manufacturer?: string | null
    model?: string | null
    serial_number?: string | null
    status?: 'operational' | 'under_maintenance' | 'out_of_service' | 'retired'
    criticality?: 'low' | 'medium' | 'high' | 'critical'
    purchase_date?: string | null
    purchase_cost?: number | null
    warranty_expiry?: string | null
}

// Hierarchy Types
export interface HierarchyNode {
    id: string
    type: 'building' | 'floor' | 'room' | 'asset'
    name: string
    name_ar: string | null
    children: HierarchyNode[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: any // Original data object
}

// Query Keys
export const assetsKeys = {
    all: ['assets'] as const,
    list: () => [...assetsKeys.all, 'list'] as const,
    asset: (id: string) => [...assetsKeys.all, id] as const,
    categories: () => [...assetsKeys.all, 'categories'] as const,
    stats: () => [...assetsKeys.all, 'stats'] as const,
    hierarchy: () => [...assetsKeys.all, 'hierarchy'] as const,
}

// Fetch Assets with related data
export function useAssets() {
    const tenantId = useCurrentTenantId()

    return useQuery({
        queryKey: [...assetsKeys.list(), tenantId],
        queryFn: async () => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()
            if (!accessToken) throw new Error('Not authenticated')

            let query = `${supabaseUrl}/rest/v1/assets?select=*,category:asset_categories(id,name,name_ar),building:buildings(id,name,name_ar),floor:floors(id,name,name_ar),room:rooms(id,name,name_ar)&order=created_at.desc`

            if (tenantId) {
                query += `&tenant_id=eq.${tenantId}`
            }

            const response = await fetch(query, {
                headers: {
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`
                }
            })

            if (!response.ok) throw new Error('Failed to fetch assets')
            return await response.json() as Asset[]
        },
    })
}

// Fetch Asset Hierarchy
export function useAssetHierarchy() {
    const tenantId = useCurrentTenantId()

    return useQuery({
        queryKey: assetsKeys.hierarchy(),
        queryFn: async () => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()
            if (!accessToken) throw new Error('Not authenticated')
            if (!tenantId) return []

            const headers = {
                'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${accessToken}`
            }

            // Fetch all required data in parallel
            const [buildingsRes, floorsRes, roomsRes, assetsRes] = await Promise.all([
                fetch(`${supabaseUrl}/rest/v1/buildings?tenant_id=eq.${tenantId}&order=name.asc`, { headers }),
                fetch(`${supabaseUrl}/rest/v1/floors?order=name.asc`, { headers }), // Floors might not have tenant_id directly, filtering by building later is safer but for now we get all and filter in memory if needed
                fetch(`${supabaseUrl}/rest/v1/rooms?tenant_id=eq.${tenantId}&order=name.asc`, { headers }),
                fetch(`${supabaseUrl}/rest/v1/assets?tenant_id=eq.${tenantId}&select=*,category:asset_categories(id,name,name_ar)&order=name.asc`, { headers })
            ])

            if (!buildingsRes.ok || !floorsRes.ok || !roomsRes.ok || !assetsRes.ok) {
                throw new Error('Failed to fetch hierarchy data')
            }

            const buildings = await buildingsRes.json()
            const floors = await floorsRes.json()
            const rooms = await roomsRes.json()
            const assets = await assetsRes.json() as Asset[]

            // Build Tree
            const tree: HierarchyNode[] = []

            buildings.forEach((b: any) => {
                const bNode: HierarchyNode = {
                    id: b.id,
                    type: 'building',
                    name: b.name,
                    name_ar: b.name_ar,
                    children: [],
                    data: b
                }

                // 1. Find floors for this building
                const bFloors = floors.filter((f: any) => f.building_id === b.id)

                bFloors.forEach((f: any) => {
                    const fNode: HierarchyNode = {
                        id: f.id,
                        type: 'floor',
                        name: f.name,
                        name_ar: f.name_ar,
                        children: [],
                        data: f
                    }

                    // 2. Find rooms for this floor
                    const fRooms = rooms.filter((r: any) => r.floor_id === f.id)

                    fRooms.forEach((r: any) => {
                        const rNode: HierarchyNode = {
                            id: r.id,
                            type: 'room',
                            name: r.name,
                            name_ar: r.name_ar,
                            children: [],
                            data: r
                        }

                        // 3. Find assets in this room (Strict check)
                        const rAssets = assets.filter(a => a.room_id === r.id)
                        rAssets.forEach(a => {
                            rNode.children.push(createAssetNode(a))
                        })

                        fNode.children.push(rNode)
                    })

                    // 4. Find assets directly in floor (No Room)
                    // Logic: Must have floor_id matching AND (room_id is null OR matches no room in current list - but checking null is safer)
                    const fAssets = assets.filter(a => a.floor_id === f.id && !a.room_id)
                    fAssets.forEach(a => {
                        fNode.children.push(createAssetNode(a))
                    })

                    bNode.children.push(fNode)
                })

                // 5. Find assets directly in building (No Floor, No Room)
                const bAssets = assets.filter(a => a.building_id === b.id && !a.floor_id && !a.room_id)
                bAssets.forEach(a => {
                    bNode.children.push(createAssetNode(a))
                })

                tree.push(bNode)
            })

            // 6. Handle orphans (Assets not linked to any building)
            const orphans = assets.filter(a => !a.building_id)
            if (orphans.length > 0) {
                tree.push({
                    id: 'orphans',
                    type: 'building', // Logical grouping
                    name: 'Unassigned Assets',
                    name_ar: 'أصول غير مخصصة',
                    children: orphans.map(a => createAssetNode(a))
                })
            }

            return tree
        }
    })
}

function createAssetNode(asset: Asset): HierarchyNode {
    return {
        id: asset.id,
        type: 'asset',
        name: asset.name,
        name_ar: asset.name_ar,
        children: [],
        data: asset
    }
}

// Fetch Single Asset
export function useAsset(id: string) {
    return useQuery({
        queryKey: assetsKeys.asset(id),
        queryFn: async () => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()
            if (!accessToken) throw new Error('Not authenticated')

            const response = await fetch(`${supabaseUrl}/rest/v1/assets?id=eq.${id}&select=*,category:asset_categories(id,name,name_ar),building:buildings(id,name,name_ar),floor:floors(id,name,name_ar),room:rooms(id,name,name_ar)`, {
                headers: {
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`
                }
            })

            if (!response.ok) throw new Error('Failed to fetch asset')
            const data = await response.json()
            return data && data.length > 0 ? data[0] : null
        },
        enabled: !!id,
    })
}

// Fetch Asset Categories
export function useAssetCategories() {
    return useQuery({
        queryKey: assetsKeys.categories(),
        queryFn: async () => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()
            if (!accessToken) throw new Error('Not authenticated')

            const response = await fetch(`${supabaseUrl}/rest/v1/asset_categories?select=*&order=name.asc`, {
                headers: {
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`
                }
            })

            if (!response.ok) throw new Error('Failed to fetch categories')
            return await response.json() as AssetCategory[]
        },
    })
}

// Get Asset Stats
export function useAssetStats() {
    const tenantId = useCurrentTenantId()

    return useQuery({
        queryKey: assetsKeys.stats(),
        queryFn: async () => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()
            if (!accessToken) throw new Error('Not authenticated')

            let query = `${supabaseUrl}/rest/v1/assets?select=status,criticality`
            if (tenantId) query += `&tenant_id=eq.${tenantId}`

            const response = await fetch(query, {
                headers: {
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`
                }
            })

            if (!response.ok) throw new Error('Failed to fetch asset stats')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const data: any[] = await response.json()

            const stats = {
                total: data?.length || 0,
                byStatus: {
                    operational: 0,
                    under_maintenance: 0,
                    out_of_service: 0,
                    retired: 0,
                },
                byCriticality: {
                    low: 0,
                    medium: 0,
                    high: 0,
                    critical: 0,
                },
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data?.forEach((asset: any) => {
                if (asset.status) stats.byStatus[asset.status as keyof typeof stats.byStatus]++
                if (asset.criticality) stats.byCriticality[asset.criticality as keyof typeof stats.byCriticality]++
            })

            return stats
        },
    })
}

// Create Asset
export function useCreateAsset() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (asset: CreateAssetInput) => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()
            if (!accessToken) throw new Error('Not authenticated')

            const response = await fetch(`${supabaseUrl}/rest/v1/assets`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`,
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify(asset)
            })

            if (!response.ok) throw new Error('Failed to create asset')
            const data = await response.json()
            return data && data.length > 0 ? data[0] : null
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: assetsKeys.list() })
            queryClient.invalidateQueries({ queryKey: assetsKeys.stats() })
            queryClient.invalidateQueries({ queryKey: assetsKeys.hierarchy() })
        },
    })
}

// Update Asset
export function useUpdateAsset() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ id, ...updates }: Partial<Asset> & { id: string }) => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()
            if (!accessToken) throw new Error('Not authenticated')

            const response = await fetch(`${supabaseUrl}/rest/v1/assets?id=eq.${id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`,
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() })
            })

            if (!response.ok) throw new Error('Failed to update asset')
            const data = await response.json()
            return data && data.length > 0 ? data[0] : null
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: assetsKeys.list() })
            queryClient.invalidateQueries({ queryKey: assetsKeys.asset(variables.id) })
            queryClient.invalidateQueries({ queryKey: assetsKeys.stats() })
            queryClient.invalidateQueries({ queryKey: assetsKeys.hierarchy() })
        },
    })
}

// Delete Asset
export function useDeleteAsset() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (id: string) => {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const accessToken = getAccessToken()
            if (!accessToken) throw new Error('Not authenticated')

            const response = await fetch(`${supabaseUrl}/rest/v1/assets?id=eq.${id}`, {
                method: 'DELETE',
                headers: {
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`
                }
            })

            if (!response.ok) throw new Error('Failed to delete asset')
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: assetsKeys.list() })
            queryClient.invalidateQueries({ queryKey: assetsKeys.stats() })
            queryClient.invalidateQueries({ queryKey: assetsKeys.hierarchy() })
        },
    })
}
