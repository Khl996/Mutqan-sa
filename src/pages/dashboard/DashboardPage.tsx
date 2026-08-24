import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { useDashboardStats } from '@/hooks/useDashboardStats'
import { useFeatureEnabled } from '@/hooks/useFeatureEnabled'
import { PageHeader } from '@/components/ui/page-header'
import { STATUS_DISPLAY, type WorkOrderStatus } from '@/config/workOrderStatus'
import {
    ClipboardList,
    CheckCircle2,
    Clock,
    AlertTriangle,
    Loader2,
    Building2,
    ArrowLeft,
} from 'lucide-react'
import { WorkOrderChart } from '@/components/dashboard/WorkOrderChart'
import { AssetsPieChart } from '@/components/dashboard/AssetsPieChart'

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
        recentActivities: [],
    }

    const stats = [
        {
            title: t('dashboard.openWorkOrders'),
            value: workOrders.open,
            icon: ClipboardList,
            color: 'bg-info/10 text-info',
        },
        {
            title: t('dashboard.completedToday'),
            value: workOrders.completedToday,
            icon: CheckCircle2,
            color: 'bg-success/10 text-success',
        },
        {
            title: t('dashboard.pendingTasks'),
            value: workOrders.pending,
            icon: Clock,
            color: 'bg-warning/10 text-warning',
        },
        {
            title: t('dashboard.overdueItems'),
            value: workOrders.overdue,
            icon: AlertTriangle,
            color: 'bg-destructive/10 text-destructive',
        },
    ]

    const focusItems = [
        {
            title: isRTL ? 'أعمال متأخرة' : 'Overdue Work',
            value: workOrders.overdue,
            hint: isRTL ? 'تحتاج متابعة قبل نهاية اليوم' : 'Needs follow-up before end of day',
            tone: workOrders.overdue > 0 ? 'danger' : 'success',
            to: '/work-orders',
        },
        {
            title: isRTL ? 'أعمال مفتوحة' : 'Open Work',
            value: workOrders.open,
            hint: isRTL ? 'أوامر عمل قيد المتابعة' : 'Work orders currently active',
            tone: workOrders.open > 0 ? 'info' : 'success',
            to: '/work-orders',
        },
        {
            title: isRTL ? 'أصول خارج الخدمة' : 'Out-of-Service Assets',
            value: assets.outOfService,
            hint: isRTL ? 'أصول تؤثر على جاهزية التشغيل' : 'Assets affecting operational readiness',
            tone: assets.outOfService > 0 ? 'danger' : 'success',
            to: '/assets',
        },
        {
            title: isRTL ? 'تحت الصيانة' : 'Under Maintenance',
            value: assets.underMaintenance,
            hint: isRTL ? 'أصول تحتاج إغلاق أو متابعة' : 'Assets waiting on closure or follow-up',
            tone: assets.underMaintenance > 0 ? 'warning' : 'success',
            to: '/assets',
        },
    ]

    return (
        <div className="space-y-6">
            <PageHeader
                icon={<ClipboardList className="h-5 w-5" />}
                title={isRTL ? 'مركز متابعة التشغيل' : 'Operations Command Center'}
                description={isRTL
                    ? 'المؤشرات الأكثر تأثيرًا على جاهزية المنشأة اليوم: المتأخر، المفتوح، الأصول المتوقفة، وآخر النشاط.'
                    : 'The most operationally relevant signals for today: overdue work, open work, unavailable assets, and recent activity.'}
                actions={(
                    <Link
                        to="/work-orders"
                        className="inline-flex items-center justify-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-muted/30"
                    >
                        {isRTL ? 'فتح أوامر العمل' : 'Open Work Orders'}
                        <ArrowLeft className={cn('h-4 w-4', !isRTL && 'rotate-180')} />
                    </Link>
                )}
            />

            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {focusItems.map((item) => (
                    <Link
                        key={item.title}
                        to={item.to}
                        className="group rounded-lg border bg-card p-4 shadow-card transition hover:border-secondary/40 hover:shadow-card-hover"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                                <p className="font-cairo text-sm font-semibold text-primary">{item.title}</p>
                                <p className="font-cairo text-xs leading-5 text-muted-foreground">{item.hint}</p>
                            </div>
                            <div className={cn(
                                'flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
                                item.tone === 'danger' && 'bg-destructive/10 text-destructive',
                                item.tone === 'warning' && 'bg-warning/10 text-warning',
                                item.tone === 'info' && 'bg-info/10 text-info',
                                item.tone === 'success' && 'bg-success/10 text-success',
                            )}>
                                {item.to === '/assets' ? <Building2 className="h-4 w-4" /> : <ClipboardList className="h-4 w-4" />}
                            </div>
                        </div>
                        <div className="mt-4 flex items-end justify-between">
                            <span className="font-inter text-3xl font-bold text-primary">{item.value}</span>
                            <span className="font-cairo text-xs font-semibold text-secondary opacity-0 transition-opacity group-hover:opacity-100">
                                {isRTL ? 'عرض التفاصيل' : 'View details'}
                            </span>
                        </div>
                    </Link>
                ))}
            </section>

            {isQuickStatsEnabled && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {stats.map((stat) => (
                        <div
                            key={stat.title}
                            className="rounded-lg border bg-card p-5 shadow-card hover:shadow-card-hover transition-shadow"
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className={cn('p-3 rounded-lg', stat.color)}>
                                    <stat.icon className="w-5 h-5" />
                                </div>
                            </div>
                            <h3 className="text-2xl font-bold text-primary font-inter mb-1">
                                {stat.value}
                            </h3>
                            <p className="text-sm text-muted font-cairo">{stat.title}</p>
                        </div>
                    ))}
                </div>
            )}

            {isChartsEnabled && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-auto lg:h-[400px]">
                    <div className="lg:col-span-2">
                        <WorkOrderChart data={statsData?.chartData || []} />
                    </div>

                    <div className="lg:col-span-1">
                        <AssetsPieChart data={{
                            active: assets.active,
                            underMaintenance: assets.underMaintenance,
                            outOfService: assets.outOfService,
                        }} />
                    </div>
                </div>
            )}

            {isRecentActivityEnabled && (
                <div className="rounded-lg border bg-card p-5 shadow-card sm:p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-lg font-bold text-primary font-cairo">
                            {t('dashboard.recentActivity')}
                        </h2>
                    </div>

                    <div className="space-y-3">
                        {recentActivities.length > 0 ? (
                            recentActivities.map((activity, index) => {
                                const statusConfig = STATUS_DISPLAY[activity.status as WorkOrderStatus]
                                const statusLabel = statusConfig ? t(`workOrders.${statusConfig.label}`) : activity.status

                                return (
                                    <div
                                        key={index}
                                        className="flex items-center gap-4 p-3 rounded-lg bg-background border border-border/50 hover:bg-muted/10 transition-colors"
                                    >
                                    <div className={cn(
                                        'w-2 h-2 rounded-full shrink-0',
                                        activity.status === 'new' && 'bg-info',
                                        activity.status === 'completed' && 'bg-success',
                                        activity.status === 'in_progress' && 'bg-warning',
                                        activity.status === 'pending' && 'bg-warning',
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
                                        'px-2 py-1 rounded-full border text-[10px] font-medium font-cairo',
                                        statusConfig ? `${statusConfig.bg} ${statusConfig.color} ${statusConfig.borderColor}` : 'bg-muted/20 text-muted-foreground border-border'
                                    )}>
                                        {statusLabel}
                                    </div>
                                </div>
                                )
                            })
                        ) : (
                            <div className="text-center py-12 text-muted font-cairo flex flex-col items-center gap-2">
                                <Clock className="w-8 h-8 opacity-20" />
                                {isRTL ? 'لا توجد نشاطات حديثة' : 'No recent activity'}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
