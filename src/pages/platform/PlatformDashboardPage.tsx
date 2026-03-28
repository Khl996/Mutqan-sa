import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useTenantStats, usePlatformStats } from '@/hooks/useTenants'
import { usePermission } from '@/hooks/usePermission'
import { Permission } from '@/config/permissions'
import {
    Building2,
    CreditCard,
    Users,
    DollarSign,
    TrendingUp,
    TrendingDown,
    Activity,
    Settings,
    ArrowRight,
    ArrowLeft,
    BarChart3,
    CheckCircle2,
    Crown,
    Shield,
    Loader2
} from 'lucide-react'

export default function PlatformDashboardPage() {
    const { i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const { can } = usePermission()

    const { data: statsData, isLoading } = usePlatformStats()
    const { data: tenantStats } = useTenantStats()

    const totalInstitutions = statsData?.totalTenants || 0
    const activeInstitutions = statsData?.activeTenants || 0
    const monthlyRevenue = statsData?.monthlyRevenue || 0
    const totalUsers = statsData?.totalUsers || 0

    const ArrowIcon = isRTL ? ArrowLeft : ArrowRight

    // Quick action cards
    const quickActions: Array<{
        title: string
        description: string
        icon: React.ElementType
        href: string
        color: string
        permission?: Permission
    }> = [
        {
            title: isRTL ? 'إدارة المنشآت' : 'Manage Institutions',
            description: isRTL ? 'إضافة، تعديل، وإدارة المنشآت المشتركة' : 'Add, edit, and manage subscribing institutions',
            icon: Building2,
            href: '/platform/tenants',
            color: 'bg-primary text-white',
        },
        {
            title: isRTL ? 'إدارة الاشتراكات' : 'Subscription Management',
            description: isRTL ? 'إدارة الباقات والفواتير' : 'Manage plans, billing, and invoices',
            icon: CreditCard,
            href: '/platform/subscriptions',
            color: 'bg-primary text-white',
        },
        {
            title: isRTL ? 'موظفي المنصة' : 'Platform Staff',
            description: isRTL ? 'إدارة فريق المنصة والصلاحيات' : 'Manage platform team and permissions',
            icon: Users,
            href: '/platform/staff',
            color: 'bg-primary text-white',
        },
        {
            title: isRTL ? 'الإدارة المالية' : 'Financial Overview',
            description: isRTL ? 'الإيرادات والفواتير والتقارير المالية' : 'Revenue, invoices, and financial reports',
            icon: DollarSign,
            href: '/platform/financials',
            color: 'bg-primary text-white',
        },
        {
            title: isRTL ? 'سجلات النظام' : 'Audit Logs',
            description: isRTL ? 'تتبع جميع العمليات والأحداث' : 'Track all operations and events',
            icon: Activity,
            href: '/platform/logs',
            color: 'bg-primary text-white',
        },
        {
            title: isRTL ? 'إعدادات المنصة' : 'Platform Settings',
            description: isRTL ? 'إعدادات النظام والتكوينات' : 'System settings and configurations',
            icon: Settings,
            href: '/platform/settings',
            color: 'bg-primary text-white',
        },
    ]

    const quickActionPermissionMap: Record<string, Permission> = {
        '/platform/tenants': 'platform.tenants.view',
        '/platform/subscriptions': 'platform.subscriptions.manage',
        '/platform/staff': 'platform.staff.manage',
        '/platform/financials': 'platform.financials.view',
        '/platform/logs': 'platform.audit.view',
        '/platform/settings': 'platform.settings.manage',
    }

    quickActions.forEach(action => {
        action.permission = quickActionPermissionMap[action.href]
    })

    const filteredQuickActions = quickActions.filter(action => action.permission && can(action.permission))

    // Map real audit logs to activity format
    const recentActivity = statsData?.recentActivity?.map((log: any) => ({
        type: log.action_type || 'system',
        message: isRTL && log.metadata?.message_ar ? log.metadata.message_ar : (log.action || 'System Action'),
        time: log.created_at,
        icon: log.target_type === 'tenant' ? Building2 : (log.target_type === 'subscription' ? TrendingUp : Activity),
        user: log.user_name || 'System'
    })) || []

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="w-12 h-12 text-primary animate-spin" />
            </div>
        )
    }

    return (
        <div className="space-y-8">
            {/* Welcome Header */}
            <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center shadow-lg shadow-secondary/20">
                    <Shield className="w-7 h-7 text-white" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-primary font-cairo">
                        {isRTL ? 'لوحة تحكم المنصة' : 'Platform Dashboard'}
                    </h1>
                    <p className="text-muted-foreground font-cairo">
                        {isRTL ? 'نظرة عامة على حالة المنصة والمنشآت' : 'Overview of platform status and institutions'}
                    </p>
                </div>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title={isRTL ? 'إجمالي المنشآت' : 'Total Institutions'}
                    value={totalInstitutions}
                    change={0}
                    icon={Building2}
                    color="secondary"
                />
                <StatCard
                    title={isRTL ? 'المنشآت النشطة' : 'Active Institutions'}
                    value={activeInstitutions}
                    change={0} // Can calculate change if history available
                    icon={CheckCircle2}
                    color="success"
                />
                <StatCard
                    title={isRTL ? 'إجمالي المستخدمين' : 'Total Users'}
                    value={totalUsers}
                    change={0}
                    icon={Users}
                    color="primary"
                />
                <StatCard
                    title={isRTL ? 'الإيراد الشهري' : 'Monthly Revenue'}
                    value={monthlyRevenue}
                    change={0}
                    icon={DollarSign}
                    color="warning"
                    isCurrency
                />
            </div>

            {/* Quick Actions Grid */}
            <div>
                <h2 className="text-lg font-semibold text-primary font-cairo mb-4 flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-secondary" />
                    {isRTL ? 'إجراءات سريعة' : 'Quick Actions'}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredQuickActions.map((action) => (
                        <Link
                            key={action.href}
                            to={action.href}
                            className="group bg-card border border-border rounded-xl p-5 hover:shadow-lg transition-all"
                        >
                            <div className="flex items-start justify-between">
                                <div className={cn(
                                    "w-12 h-12 rounded-xl flex items-center justify-center",
                                    action.color
                                )}>
                                    <action.icon className="w-6 h-6" />
                                </div>
                                <ArrowIcon className="w-5 h-5 text-muted-foreground group-hover:text-secondary group-hover:translate-x-1 rtl:group-hover:-translate-x-1 transition-all" />
                            </div>
                            <h3 className="text-primary font-semibold mt-4 font-cairo">
                                {action.title}
                            </h3>
                            <p className="text-muted-foreground text-sm mt-1 font-cairo">
                                {action.description}
                            </p>
                        </Link>
                    ))}
                </div>
            </div>

            {/* Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Subscription Distribution */}
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                    <h3 className="text-primary font-semibold font-cairo mb-4 flex items-center gap-2">
                        <Crown className="w-5 h-5 text-secondary" />
                        {isRTL ? 'توزيع الاشتراكات' : 'Subscription Distribution'}
                    </h3>
                    <div className="space-y-4">
                        <TierBar
                            tier={isRTL ? 'مؤسسي' : 'Enterprise'}
                            count={tenantStats?.byTier?.enterprise || 0}
                            total={totalInstitutions}
                            color="bg-primary"
                        />
                        <TierBar
                            tier={isRTL ? 'احترافي' : 'Professional'}
                            count={tenantStats?.byTier?.professional || 0}
                            total={totalInstitutions}
                            color="bg-secondary"
                        />
                        <TierBar
                            tier={isRTL ? 'أساسي' : 'Basic'}
                            count={tenantStats?.byTier?.basic || 0}
                            total={totalInstitutions}
                            color="bg-info"
                        />
                        <TierBar
                            tier={isRTL ? 'مجاني' : 'Free'}
                            count={tenantStats?.byTier?.free || 0}
                            total={totalInstitutions}
                            color="bg-muted"
                        />
                    </div>
                </div>

                {/* Recent Activity */}
                <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
                    <h3 className="text-primary font-semibold font-cairo mb-4 flex items-center gap-2">
                        <Activity className="w-5 h-5 text-secondary" />
                        {isRTL ? 'النشاط الأخير' : 'Recent Activity'}
                    </h3>
                    <div className="space-y-4">
                        {recentActivity.length > 0 ? (
                            recentActivity.map((activity: any, idx: number) => (
                                <div key={idx} className="flex items-start gap-3 text-sm animate-in fade-in duration-500">
                                    <div className="w-8 h-8 rounded-lg bg-muted/20 flex items-center justify-center flex-shrink-0">
                                        <activity.icon className="w-4 h-4 text-primary" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-primary font-cairo line-clamp-1" title={activity.message}>
                                            {activity.message}
                                        </p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <span className="text-muted-foreground text-xs">
                                                {new Date(activity.time).toLocaleDateString(isRTL ? 'ar-SA' : 'en-US', {
                                                    hour: 'numeric',
                                                    minute: 'numeric'
                                                })}
                                            </span>
                                            <span className="text-xs bg-muted/20 px-1.5 rounded text-muted-foreground">
                                                {activity.user}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-8 text-muted-foreground font-cairo text-sm">
                                {isRTL ? 'لا يوجد نشاط حديث' : 'No recent activity'}
                            </div>
                        )}
                    </div>
                    <Link
                        to="/platform/logs"
                        className="mt-4 text-secondary text-sm font-cairo flex items-center gap-1 hover:underline"
                    >
                        {isRTL ? 'عرض الكل' : 'View All'}
                        <ArrowIcon className="w-4 h-4" />
                    </Link>
                </div>
            </div>
        </div>
    )
}

// Stat Card Component
function StatCard({ title, value, change, icon: Icon, color, isCurrency = false }: {
    title: string
    value: number
    change: number
    icon: React.ElementType
    color: 'primary' | 'secondary' | 'success' | 'warning'
    isCurrency?: boolean
}) {
    const colorClasses = {
        primary: 'bg-primary/10 border-primary/20 text-primary',
        secondary: 'bg-secondary/10 border-secondary/20 text-secondary',
        success: 'bg-green-500/10 border-green-500/20 text-green-600',
        warning: 'bg-amber-500/10 border-amber-500/20 text-amber-600',
    }

    const isPositive = change >= 0

    return (
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
                <div className={cn("p-2 rounded-lg", colorClasses[color])}>
                    <Icon className="w-5 h-5" />
                </div>
                {change !== 0 && (
                    <div className={cn(
                        "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full",
                        isPositive ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'
                    )}>
                        {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {isPositive ? '+' : ''}{change}%
                    </div>
                )}
            </div>
            <p className="text-3xl font-bold text-primary font-inter">
                {isCurrency ? `${value.toLocaleString(undefined, { maximumFractionDigits: 0 })} SAR` : value.toLocaleString()}
            </p>
            <p className="text-muted-foreground text-sm font-cairo mt-1">{title}</p>
        </div>
    )
}

// Tier Bar Component
function TierBar({ tier, count, total, color }: {
    tier: string
    count: number
    total: number
    color: string
}) {
    const percentage = total > 0 ? (count / total) * 100 : 0

    return (
        <div>
            <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-primary font-cairo">{tier}</span>
                <span className="text-muted-foreground font-inter">{count}</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                    className={cn("h-full rounded-full transition-all", color)}
                    style={{ width: `${Math.max(percentage, 2)}%` }} // Minimum 2% visibility
                />
            </div>
        </div>
    )
}
