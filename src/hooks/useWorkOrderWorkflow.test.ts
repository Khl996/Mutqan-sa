import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { invalidateWorkOrderWorkflowQueries } from './useWorkOrderWorkflow'

describe('work-order workflow query refresh', () => {
    it('waits for the active work-order detail refresh before a mutation completes', async () => {
        let releaseDetailRefresh: (() => void) | undefined
        const detailRefresh = new Promise<void>((resolve) => {
            releaseDetailRefresh = resolve
        })
        const invalidateQueries = vi.fn(({ queryKey }: { queryKey: readonly unknown[] }) =>
            queryKey.join('/') === 'workOrders/wo-1'
                ? detailRefresh
                : Promise.resolve()
        )

        let completed = false
        const refresh = invalidateWorkOrderWorkflowQueries({ invalidateQueries }, 'wo-1')
            .then(() => { completed = true })

        await Promise.resolve()
        expect(completed).toBe(false)
        expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['workOrders', 'wo-1'] })

        releaseDetailRefresh?.()
        await refresh
        expect(completed).toBe(true)
    })
})
