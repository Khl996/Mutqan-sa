import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCurrentTenantId } from './useTenantQuery'

export interface InventoryItem {
    id: string
    code: string
    name: string
    name_ar: string | null
    part_number: string | null
    quantity: number
    min_quantity: number
    unit_of_measure: string
    location: string | null
    unit_cost: number
    image_url: string | null
    category: { name: string; name_ar: string | null } | null
}

export const inventoryKeys = {
    all: ['inventory'] as const,
    items: () => [...inventoryKeys.all, 'items'] as const,
    stats: () => [...inventoryKeys.all, 'stats'] as const,
    lowStock: () => [...inventoryKeys.all, 'lowStock'] as const,
}

// Get Inventory Stats
export function useInventoryStats() {
    const tenantId = useCurrentTenantId()

    return useQuery({
        queryKey: [...inventoryKeys.stats(), tenantId],
        queryFn: async () => {
            if (!tenantId) return { total_items: 0, low_stock: 0, total_value: 0 }

            const { data, error } = await supabase
                .rpc('get_inventory_stats', { check_tenant_id: tenantId } as any)

            if (error) {
                console.error('Error fetching inventory stats:', error)
                return { total_items: 0, low_stock: 0, total_value: 0 }
            }

            return data as { total_items: number, low_stock: number, total_value: number }
        },
    })
}

// Get Inventory Items
export function useInventoryItems(page = 1, search = '') {
    const tenantId = useCurrentTenantId()

    return useQuery({
        queryKey: [...inventoryKeys.items(), page, search, tenantId],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let query = supabase
                .from('inventory_items')
                .select(`
                    *,
                    category:inventory_categories(name, name_ar)
                `) as any

            // Apply tenant filter
            if (tenantId) {
                query = query.eq('tenant_id', tenantId)
            }

            if (search) {
                query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%,part_number.ilike.%${search}%`)
            }

            const { data, error, count } = await query
                .order('created_at', { ascending: false })
                .range((page - 1) * 10, page * 10 - 1)

            if (error) throw error
            return { data: data as InventoryItem[], count }
        },
    })
}

// Get All Inventory Items (Simple List for Dropdowns)
export function useAllInventoryItems() {
    const tenantId = useCurrentTenantId()

    return useQuery({
        queryKey: [...inventoryKeys.items(), 'all', tenantId],
        queryFn: async () => {
            let query = (supabase
                .from('inventory_items')
                .select('id, name, name_ar, code, quantity, unit_of_measure') as any)

            if (tenantId) {
                query = query.eq('tenant_id', tenantId)
            }

            const { data, error } = await query.order('name')
            if (error) throw error
            return data as InventoryItem[]
        },
    })
}



// Create Item
export function useCreateInventoryItem() {
    const queryClient = useQueryClient()
    const tenantId = useCurrentTenantId()

    return useMutation({
        mutationFn: async (newItem: Omit<InventoryItem, 'id' | 'category' | 'created_at' | 'updated_at'>) => {
            if (!tenantId) throw new Error('No tenant selected')

            const { data, error } = await supabase
                .from('inventory_items')
                .insert({ ...newItem, tenant_id: tenantId } as any)
                .select()
                .single()

            if (error) throw error
            return data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: inventoryKeys.all })
        },
    })
}

// Update Item
export function useUpdateInventoryItem() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ id, ...updates }: Partial<InventoryItem> & { id: string }) => {
            const { data, error } = await supabase
                .from('inventory_items')
                .update(updates as any)
                .eq('id', id)
                .select()
                .single()

            if (error) throw error
            return data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: inventoryKeys.all })
        },
    })
}

// Delete Item (Soft Delete)
export function useDeleteInventoryItem() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from('inventory_items')
                .update({ is_active: false } as any)
                .eq('id', id)

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: inventoryKeys.all })
        },
    })
}

// Get Item Transactions
export function useInventoryTransactions(itemId: string) {
    const tenantId = useCurrentTenantId()

    return useQuery({
        queryKey: [...inventoryKeys.all, 'transactions', itemId],
        queryFn: async () => {
            let query = supabase
                .from('inventory_transactions')
                .select('*')
                .eq('item_id', itemId)
                .order('created_at', { ascending: false }) as any

            if (tenantId) {
                query = query.eq('tenant_id', tenantId)
            }

            const { data, error } = await query

            if (error) throw error
            return data
        },
        enabled: !!itemId
    })
}

// Adjust Stock (Transaction)
export function useAdjustStock() {
    const queryClient = useQueryClient()
    const tenantId = useCurrentTenantId()

    return useMutation({
        mutationFn: async ({
            itemId,
            quantityChange,
            type,
            reason
        }: {
            itemId: string
            quantityChange: number
            type: 'in' | 'out' | 'adjustment'
            reason: string
        }) => {
            if (!tenantId) throw new Error('No tenant selected')

            // 1. Get current stock
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: item } = await supabase
                .from('inventory_items')
                .select('quantity')
                .eq('id', itemId)
                .single() as any

            if (!item) throw new Error('Item not found')

            const oldQty = item.quantity
            const newQty = oldQty + quantityChange

            if (newQty < 0) throw new Error('Insufficient stock')

            // 2. Create Transaction
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await supabase.from('inventory_transactions').insert({
                tenant_id: tenantId,
                item_id: itemId,
                transaction_type: type,
                quantity: Math.abs(quantityChange),
                quantity_before: oldQty,
                quantity_after: newQty,
                notes: reason,
            } as any)

            // 3. Update Item
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await supabase
                .from('inventory_items')
                .update({ quantity: newQty } as any)
                .eq('id', itemId)

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: inventoryKeys.all })
        },
    })
}
