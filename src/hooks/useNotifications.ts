import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'

export interface Notification {
    id: string
    title: string
    message: string
    type: 'info' | 'success' | 'warning' | 'error' | 'work_order' | 'alert'
    link: string | null
    is_read: boolean
    created_at: string
}

const NOTIFICATIONS_KEY = 'notifications'

export function useNotifications() {
    const { user } = useAuth()
    const queryClient = useQueryClient()

    // Fetch Notifications
    const { data: notifications = [], isLoading } = useQuery({
        queryKey: [NOTIFICATIONS_KEY, user?.id],
        queryFn: async () => {
            if (!user?.id) return []

            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(20) // Get last 20 notifications

            if (error) throw error
            return data as Notification[]
        },
        enabled: !!user?.id,
        refetchInterval: 30000 // Poll every 30s as backup
    })

    // Mark as Read
    const markAsRead = useMutation({
        mutationFn: async (id: string) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase
                .from('notifications') as any)
                .update({ is_read: true })
                .eq('id', id)

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [NOTIFICATIONS_KEY] })
        }
    })

    // Mark All as Read
    const markAllAsRead = useMutation({
        mutationFn: async () => {
            if (!user?.id) return
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase
                .from('notifications') as any)
                .update({ is_read: true })
                .eq('user_id', user.id)
                .eq('is_read', false)

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [NOTIFICATIONS_KEY] })
            toast.success('تم تحديد الكل كمقروء')
        }
    })

    // Realtime Subscription
    useEffect(() => {
        if (!user?.id) return

        const subscription = supabase
            .channel(`notifications:${user.id}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${user.id}`
                },
                (payload) => {
                    // Add new notification to cache immediately
                    queryClient.setQueryData([NOTIFICATIONS_KEY, user.id], (old: Notification[] = []) => {
                        return [payload.new as Notification, ...old]
                    })

                    // Show toast
                    const newNotif = payload.new as Notification
                    toast(newNotif.title, {
                        description: newNotif.message,
                        action: newNotif.link ? {
                            label: 'عرض',
                            onClick: () => window.location.href = newNotif.link!
                        } : undefined
                    })
                }
            )
            .subscribe()

        return () => {
            subscription.unsubscribe()
        }
    }, [user?.id, queryClient])

    const unreadCount = notifications.filter(n => !n.is_read).length

    return {
        notifications,
        isLoading,
        unreadCount,
        markAsRead: markAsRead.mutate,
        markAllAsRead: markAllAsRead.mutate
    }
}
