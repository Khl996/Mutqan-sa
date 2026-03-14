import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { useDashboardStats } from '@/hooks/useDashboardStats'
import { useFeatureEnabled } from '@/hooks/useFeatureEnabled'
import { usePermission } from '@/hooks/usePermission'
import {
    ClipboardList,
    CheckCircle2,
    Clock,
    AlertTriangle,
    Box,
    Wrench,
    Package,
    Loader2
} from 'lucide-react'
import { WorkOrderChart } from '@/components/dashboard/WorkOrderChart'
import { AssetsPieChart } from '@/components/dashboard/AssetsPieChart'

// Helper function for time ago
function formatTimeAgo(dateString: string, locale: string) {
    const date = new Date(dateString)
    const now = new Date()
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)

    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })

    if (seconds < 60) return rtf.format(-seconds, 'second')
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return rtf.format(-minutes, 'minute')
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return rtf.format(-hours, 'hour')
    const days = Math.floor(hours / 24)
    return rtf.format(-days, 'day')
}

export default function DashboardPage() {
    const { t, i18n } = useTranslation()
    useAuth()
    const { data: statsData, isLoading } = useDashboardStats()

    // Check dashboard features
    const { can } = usePermission()
    const isQuickStatsEnabled = useFeatureEnabled('dashboard', 'quick_stats')
    const isChartsEnabled = useFeatureEnabled('dashboard', 'charts')
    const isRecentActivityEnabled = useFeatureEnabled('dashboard', 'recent_activity')

    const isRTL = i18n.language === 'ar'

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="w-12 h-12 text-primary animate-spin" />
            </div>
        )
    }

    const { workOrders, assets, recentActivities } = statsData || {
        workOrders: { open: 0, completedToday: 0, pending: 0, overdue: 0, total: 0 },
        assets: { total: 0, active: 0, underMaintenance: 0, outOfService: 0 },
        recentActivities: []
    }

    const stats = [
        {
            title: t('dashboard.openWorkOrders'),
            value: workOrders.open,
            change: 0,
            isPositive: false,
            icon: ClipboardList,
            color: 'bg-info/10 text-info',
        },
        {
            title: t('dashboard.completedToday'),
            value: workOrders.completedToday,
            change: 0,
            isPositive: true,
            icon: CheckCircle2,
            color: 'bg-success/10 text-success',
        },
        {
            title: t('dashboard.pendingTasks'),
            value: workOrders.pending,
            change: 0,
            isPositive: false,
            icon: Clock,
            color: 'bg-warning/10 text-warning',
        },
        {
            title: t('dashboard.overdueItems'),
            value: workOrders.overdue,
            change: 0,
            isPositive: workOrders.overdue === 0,
            icon: AlertTriangle,
            color: 'bg-destructive/10 text-destructive',
        },
    ]

    return (
        <div className="space-y-6">
            {/* Welcome Header */}
            <div className="bg-gradient-to-r from-primary to-primary/80 rounded-2xl p-6 text-white">
                <h1 className="text-2xl font-bold font-cairo mb-2">
                    {isRTL ? 'نظرة عامة على المنشأة' : 'Facility Overview'}
                </h1>
                <p className="text-white/80 font-cairo">
                    {isRTL
                        ? 'متابعة شاملة للأصول، البلاغات، وأداء فرق العمل في الوقت الفعلي'
                        : "Real-time monitoring of assets, work orders, and team performance"}
                </p>
            </div>

            {/* Stats Grid - only if quick_stats feature is enabled */}
            {isQuickStatsEnabled && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {stats.map((stat, index) => (
                        <div
                            key={index}
                            className="bg-card rounded-xl p-5 shadow-card hover:shadow-card-hover transition-shadow"
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className={cn('p-3 rounded-lg', stat.color)}>
                                    <stat.icon className="w-5 h-5" />
                                </div>
                                {/* Removed Percentage Change for now as we don't have historical data yet */}
                                {/* <div className={cn(
                                'flex items-center gap-1 text-sm',
                                stat.isPositive ? 'text-success' : 'text-destructive'
                            )}>
                                {stat.isPositive ? (
                                    <ArrowDownRight className="w-4 h-4" />
                                ) : (
                                    <ArrowUpRight className="w-4 h-4" />
                                )}
                                {stat.change}%
                            </div> */}
                            </div>
                            <h3 className="text-2xl font-bold text-primary font-inter mb-1">
                                {stat.value}
                            </h3>
                            <p className="text-sm text-muted font-cairo">{stat.title}</p>
                        </div>
                    ))}
                </div>
            )}

            {/* Charts Section */}
            {isChartsEnabled && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-auto lg:h-[400px]">
                    {/* Work Orders Chart (Takes 2 columns) */}
                    <div className="lg:col-span-2">
                        <WorkOrderChart data={statsData?.chartData || []} />
                    </div>

                    {/* Assets Chart (Takes 1 column) */}
                    <div className="lg:col-span-1">
                        <AssetsPieChart data={{
                            active: assets.active,
                            underMaintenance: assets.underMaintenance,
                            outOfService: assets.outOfService
                        }} />
                    </div>
                </div>
            )}

            {/* Bottom Section: Recent Activity & Quick Actions */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Recent Activity */}
                {isRecentActivityEnabled && (
                    <div className="lg:col-span-2 bg-card rounded-xl p-6 shadow-card h-full">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-lg font-bold text-primary font-cairo">
                                {t('dashboard.recentActivity')}
                            </h2>
                            {/* <button className="text-sm text-secondary hover:underline font-cairo">
                                {t('common.view')} {isRTL ? 'الكل' : 'All'}
                            </button> */}
                        </div>

                        <div className="space-y-3">
                            {recentActivities.length > 0 ? (
                                recentActivities.map((activity, index) => (
                                    <div
                                        key={index}
                                        className="flex items-center gap-4 p-3 rounded-lg bg-background border border-border/50 hover:bg-muted/10 transition-colors"
                                    >
                                        <div className={cn(
                                            'w-2 h-2 rounded-full shrink-0',
                                            activity.status === 'new' && 'bg-info',
                                            activity.status === 'completed' && 'bg-success',
                                            activity.status === 'in_progress' && 'bg-warning',
                                            activity.status === 'pending' && 'bg-amber-400',
                                            activity.status === 'cancelled' && 'bg-destructive'
                                        )} />
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-medium text-primary font-cairo text-sm truncate">
                                                {activity.title}
                                            </h4>
                                            <p className="text-xs text-muted font-cairo truncate">
                                                {formatTimeAgo(activity.time, i18n.language)}
                                            </p>
                                        </div>
                                        <div className={cn(
                                            "px-2 py-1 rounded text-[10px] font-medium font-cairo bg-muted/20",
                                            activity.status === 'completed' ? 'text-success bg-success/10' : 'text-muted-foreground'
                                        )}>
                                            {activity.status}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-12 text-muted font-cairo flex flex-col items-center gap-2">
                                    <Clock className="w-8 h-8 opacity-20" />
                                    {isRTL ? 'لا توجد نشاطات حديثة' : 'No recent activity'}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Quick Actions */}
                <div className="lg:col-span-1 bg-card rounded-xl p-6 shadow-card h-full">
                    <h2 className="text-lg font-bold text-primary font-cairo mb-6">
                        {isRTL ? 'إجراءات سريعة' : 'Quick Actions'}
                    </h2>
                    <div className="grid grid-cols-2 gap-4">
                        {[
                            {
                                icon: ClipboardList,
                                label: t('workOrders.createNew'),
                                color: 'bg-secondary',
                                permission: 'work_orders.create',
                                // Add onClick or link here later
                            },
                            {
                                icon: Box,
                                label: t('assets.addAsset'),
                                color: 'bg-info',
                                permission: 'assets.manage'
                            },
                            {
                                icon: Wrench,
                                label: isRTL ? 'صيانة جديدة' : 'New Maintenance',
                                color: 'bg-warning',
                                permission: 'maintenance.manage'
                            },
                            {
                                icon: Package,
                                label: t('inventory.addItem'),
                                color: 'bg-success',
                                permission: 'inventory.manage'
                            },
                        ]
                            .filter(action => can(action.permission as any))
                            .map((action, index) => (
                                <button
                                    key={index}
                                    className="aspect-square flex flex-col items-center justify-center gap-3 p-4 rounded-xl bg-background border border-border/50 hover:bg-muted/10 hover:shadow-sm transition-all group"
                                >
                                    <div className={cn(
                                        'p-3 rounded-full text-white transition-transform group-hover:scale-110 shadow-lg',
                                        action.color
                                    )}>
                                        <action.icon className="w-6 h-6" />
                                    </div>
                                    <span className="text-xs font-bold text-primary font-cairo text-center">
                                        {action.label}
                                    </span>
                                </button>
                            ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
