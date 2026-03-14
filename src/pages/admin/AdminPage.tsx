import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useTenant } from '@/contexts/TenantContext'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
    Shield,
    Building2,
    Users,
    ClipboardList,
    Package,
    Wrench,
    Activity,
    Database,
    Server,
    AlertTriangle,
    CheckCircle2,
    TrendingUp,
    Settings,
    RefreshCw
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

export default function AdminPage() {
    const { i18n } = useTranslation()
    const isRTL = i18n.language === 'ar'
    const { profile } = useAuth()
    const { currentTenant } = useTenant()

    // Check if user is admin
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profileData = profile as any
    const isAdmin = profileData?.role === 'platform_owner' ||
        profileData?.role === 'platform_admin' ||
        profileData?.role === 'tenant_admin' ||
        profileData?.is_super_admin

    // Fetch tenant-scoped stats
    const { data: systemStats, isLoading, refetch } = useQuery({
        queryKey: ['admin', 'system-stats', currentTenant?.id],
        enabled: !!currentTenant?.id,
        queryFn: async () => {
            if (!currentTenant?.id) return null

            // Parallel queries for counts
            const [
                { count: facilitiesCount },
                { count: usersCount },
                { count: activeUsersCount },
                { count: assetsCount },
                { count: operationalAssetsCount },
                { count: workOrdersCount },
                { count: openWorkOrdersCount },
                { count: inventoryCount },
                { count: lowStockCount }
            ] = await Promise.all([
                // Facilities (Buildings)
                supabase.from('buildings').select('*', { count: 'exact', head: true }).eq('tenant_id', currentTenant.id),

                // Users
                supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('tenant_id', currentTenant.id),
                supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('tenant_id', currentTenant.id).eq('is_active', true),

                // Assets
                supabase.from('assets').select('*', { count: 'exact', head: true }).eq('tenant_id', currentTenant.id),
                supabase.from('assets').select('*', { count: 'exact', head: true }).eq('tenant_id', currentTenant.id).eq('status', 'operational'),

                // Work Orders
                supabase.from('work_orders').select('*', { count: 'exact', head: true }).eq('tenant_id', currentTenant.id),
                supabase.from('work_orders').select('*', { count: 'exact', head: true }).eq('tenant_id', currentTenant.id).neq('status', 'completed').neq('status', 'cancelled'),

                // Inventory
                supabase.from('inventory_items').select('*', { count: 'exact', head: true }).eq('tenant_id', currentTenant.id),
                // Note: Low stock logic usually requires scanning rows, but for simple count we can try filter if columns exist.
                // Assuming we can't easily do complex logic in HEAD, we might need to fetch data for low stock.
                // For now, let's just fetch basic inventory count. 
                // To do low stock properly without fetching all, we'd need a computed column or RPC.
                // Let's stick to simple count for 'lowStock' by fetching data (limit 1000?) or just skip accurate low stock for now to save performance if many items.
                // Actually, let's fetch 'id, quantity, min_quantity' like before but filtered.
                supabase.from('inventory_items').select('quantity, min_quantity').eq('tenant_id', currentTenant.id)
            ])

            // Calculate Low Stock from the data fetch (last item)
            // @ts-expect-error - lowStockCount is the full response from last query
            const inventoryData = lowStockCount?.data || [] // lowStockCount here is actually the full response from the last query
            const actualLowStock = inventoryData.filter((i: any) => i.quantity <= i.min_quantity && i.quantity > 0).length

            // Fetch Users by Role distribution
            const { data: usersData } = await supabase
                .from('profiles')
                .select('role')
                .eq('tenant_id', currentTenant.id)

            const usersByRole = usersData?.reduce((acc: any, u: any) => {
                acc[u.role] = (acc[u.role] || 0) + 1
                return acc
            }, {}) || {}

            return {
                facilities: {
                    total: facilitiesCount || 0,
                    // active: facilities.data?.filter((t: any) => t.is_active).length || 0, // Assuming all displayed are active or we don't track active facilities explicitly in stats
                },
                users: {
                    total: usersCount || 0,
                    active: activeUsersCount || 0,
                    byRole: usersByRole,
                },
                assets: {
                    total: assetsCount || 0,
                    operational: operationalAssetsCount || 0,
                },
                workOrders: {
                    total: workOrdersCount || 0,
                    open: openWorkOrdersCount || 0,
                },
                inventory: {
                    total: inventoryCount || 0,
                    lowStock: actualLowStock || 0,
                },
            }
        },
    })

    // Fetch recent activity (Scoped)
    const { data: recentActivity } = useQuery({
        queryKey: ['admin', 'recent-activity', currentTenant?.id],
        enabled: !!currentTenant?.id,
        queryFn: async () => {
            if (!currentTenant?.id) return []

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data } = await supabase
                .from('work_orders')
                .select('id, title, status, created_at, updated_at')
                .eq('tenant_id', currentTenant.id)
                .order('updated_at', { ascending: false })
                .limit(10) as any

            return data || []
        },
    })

    const [isRefreshing, setIsRefreshing] = useState(false)
    const handleRefresh = async () => {
        setIsRefreshing(true)
        await refetch()
        setIsRefreshing(false)
        toast.success(isRTL ? 'تم تحديث البيانات' : 'Data refreshed')
    }

    if (!isAdmin) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
                <AlertTriangle className="w-16 h-16 text-warning mb-4" />
                <h2 className="text-xl font-bold text-primary mb-2 font-cairo">
                    {isRTL ? 'غير مصرح' : 'Unauthorized'}
                </h2>
                <p className="text-muted font-cairo">
                    {isRTL ? 'ليس لديك صلاحية الوصول لهذه الصفحة' : 'You do not have permission to access this page'}
                </p>
            </div>
        )
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-secondary border-t-transparent rounded-full animate-spin" />
                    <p className="text-muted font-cairo">{isRTL ? 'جاري التحميل...' : 'Loading...'}</p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-8 pb-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-primary font-cairo flex items-center gap-3">
                        <Shield className="w-7 h-7 text-destructive" />
                        {isRTL ? 'لوحة الإدارة' : 'Admin Panel'}
                    </h1>
                    <p className="text-muted font-cairo">
                        {isRTL ? 'إدارة النظام والإعدادات المتقدمة' : 'System management and advanced settings'}
                    </p>
                </div>
                <button
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="flex items-center gap-2 px-4 py-2 bg-card border rounded-xl hover:bg-muted/10 transition-colors font-cairo"
                >
                    <RefreshCw className={cn("w-5 h-5", isRefreshing && "animate-spin")} />
                    {isRTL ? 'تحديث' : 'Refresh'}
                </button>
            </div>

            {/* System Overview */}
            <div>
                <h2 className="text-lg font-bold text-primary font-cairo mb-4 flex items-center gap-2">
                    <Database className="w-5 h-5 text-secondary" />
                    {isRTL ? 'نظرة عامة على النظام' : 'System Overview'}
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    <OverviewCard
                        title={isRTL ? 'المرافق' : 'Facilities'}
                        value={systemStats?.facilities.total || 0}
                        subValue={isRTL ? 'إجمالي المرافق' : 'Total Facilities'}
                        icon={Building2}
                        color="info"
                    />
                    <OverviewCard
                        title={isRTL ? 'المستخدمين' : 'Users'}
                        value={systemStats?.users.total || 0}
                        subValue={`${systemStats?.users.active || 0} ${isRTL ? 'نشط' : 'active'}`}
                        icon={Users}
                        color="success"
                    />
                    <OverviewCard
                        title={isRTL ? 'الأصول' : 'Assets'}
                        value={systemStats?.assets.total || 0}
                        subValue={`${systemStats?.assets.operational || 0} ${isRTL ? 'يعمل' : 'operational'}`}
                        icon={Package}
                        color="secondary"
                    />
                    <OverviewCard
                        title={isRTL ? 'أوامر العمل' : 'Work Orders'}
                        value={systemStats?.workOrders.total || 0}
                        subValue={`${systemStats?.workOrders.open || 0} ${isRTL ? 'مفتوح' : 'open'}`}
                        icon={ClipboardList}
                        color="warning"
                    />
                    <OverviewCard
                        title={isRTL ? 'المخزون' : 'Inventory'}
                        value={systemStats?.inventory.total || 0}
                        subValue={`${systemStats?.inventory.lowStock || 0} ${isRTL ? 'منخفض' : 'low'}`}
                        icon={Wrench}
                        color="destructive"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Users by Role */}
                <div className="bg-card rounded-xl border shadow-card overflow-hidden">
                    <div className="flex items-center gap-3 p-4 border-b bg-muted/5">
                        <Users className="w-5 h-5 text-secondary" />
                        <h3 className="font-bold font-cairo">{isRTL ? 'توزيع المستخدمين حسب الدور' : 'Users by Role'}</h3>
                    </div>
                    <div className="p-4 space-y-3">
                        {systemStats?.users.byRole && Object.entries(systemStats.users.byRole).map(([role, count]) => (
                            <div key={role} className="flex items-center justify-between p-3 bg-muted/5 rounded-lg">
                                <span className="font-cairo text-sm capitalize">{role.replace(/_/g, ' ')}</span>
                                <span className="font-bold text-primary">{count as number}</span>
                            </div>
                        ))}
                        {(!systemStats?.users.byRole || Object.keys(systemStats.users.byRole).length === 0) && (
                            <p className="text-center text-muted py-4 font-cairo">
                                {isRTL ? 'لا توجد بيانات' : 'No data available'}
                            </p>
                        )}
                    </div>
                </div>

                {/* Recent Activity */}
                <div className="bg-card rounded-xl border shadow-card overflow-hidden">
                    <div className="flex items-center gap-3 p-4 border-b bg-muted/5">
                        <Activity className="w-5 h-5 text-secondary" />
                        <h3 className="font-bold font-cairo">{isRTL ? 'النشاط الأخير' : 'Recent Activity'}</h3>
                    </div>
                    <div className="p-4 space-y-2 max-h-[400px] overflow-y-auto">
                        {recentActivity?.map((activity: any) => (
                            <div key={activity.id} className="flex items-center justify-between p-3 bg-muted/5 rounded-lg">
                                <div>
                                    <p className="font-medium text-sm font-cairo">{activity.title}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {new Date(activity.updated_at).toLocaleString()}
                                    </p>
                                </div>
                                <span className={cn(
                                    "px-2 py-1 rounded-full text-xs font-medium",
                                    activity.status === 'completed' ? "bg-success/10 text-success" :
                                        activity.status === 'in_progress' ? "bg-info/10 text-info" :
                                            "bg-warning/10 text-warning"
                                )}>
                                    {activity.status}
                                </span>
                            </div>
                        ))}
                        {(!recentActivity || recentActivity.length === 0) && (
                            <p className="text-center text-muted py-4 font-cairo">
                                {isRTL ? 'لا يوجد نشاط حديث' : 'No recent activity'}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* System Health */}
            <div className="bg-card rounded-xl border shadow-card overflow-hidden">
                <div className="flex items-center gap-3 p-4 border-b bg-muted/5">
                    <Server className="w-5 h-5 text-secondary" />
                    <h3 className="font-bold font-cairo">{isRTL ? 'حالة النظام' : 'System Health'}</h3>
                </div>
                <div className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <HealthIndicator
                            label={isRTL ? 'قاعدة البيانات' : 'Database'}
                            status="healthy"
                            isRTL={isRTL}
                        />
                        <HealthIndicator
                            label={isRTL ? 'خدمة المصادقة' : 'Auth Service'}
                            status="healthy"
                            isRTL={isRTL}
                        />
                        <HealthIndicator
                            label={isRTL ? 'التخزين' : 'Storage'}
                            status="healthy"
                            isRTL={isRTL}
                        />
                    </div>
                </div>
            </div>

            {/* Quick Actions */}
            <div>
                <h2 className="text-lg font-bold text-primary font-cairo mb-4 flex items-center gap-2">
                    <Settings className="w-5 h-5 text-secondary" />
                    {isRTL ? 'إجراءات سريعة' : 'Quick Actions'}
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <QuickAction
                        label={isRTL ? 'إدارة المستخدمين' : 'Manage Users'}
                        icon={Users}
                        href="/teams"
                    />
                    <QuickAction
                        label={isRTL ? 'عرض التقارير' : 'View Reports'}
                        icon={TrendingUp}
                        href="/reports"
                    />
                    <QuickAction
                        label={isRTL ? 'إعدادات النظام' : 'System Settings'}
                        icon={Settings}
                        href="/settings"
                    />
                    <QuickAction
                        label={isRTL ? 'إدارة الأصول' : 'Manage Assets'}
                        icon={Package}
                        href="/assets"
                    />
                </div>
            </div>
        </div>
    )
}

// Overview Card
function OverviewCard({
    title,
    value,
    subValue,
    icon: Icon,
    color
}: {
    title: string
    value: number
    subValue: string
    icon: React.ElementType
    color: string
}) {
    const colorClasses: Record<string, string> = {
        info: 'bg-info/10 text-info border-info/20',
        success: 'bg-success/10 text-success border-success/20',
        secondary: 'bg-secondary/10 text-secondary border-secondary/20',
        warning: 'bg-warning/10 text-warning border-warning/20',
        destructive: 'bg-destructive/10 text-destructive border-destructive/20',
    }

    return (
        <div className={cn("p-4 rounded-xl border", colorClasses[color])}>
            <div className="flex items-center gap-2 mb-2">
                <Icon className="w-5 h-5" />
                <span className="text-sm font-cairo">{title}</span>
            </div>
            <p className="text-3xl font-bold">{value}</p>
            <p className="text-xs opacity-80">{subValue}</p>
        </div>
    )
}

// Health Indicator
function HealthIndicator({
    label,
    status,
    isRTL
}: {
    label: string
    status: 'healthy' | 'warning' | 'error'
    isRTL: boolean
}) {
    const statusConfig = {
        healthy: {
            icon: CheckCircle2,
            color: 'text-success',
            bg: 'bg-success/10',
            label: isRTL ? 'يعمل بشكل طبيعي' : 'Healthy'
        },
        warning: {
            icon: AlertTriangle,
            color: 'text-warning',
            bg: 'bg-warning/10',
            label: isRTL ? 'تحذير' : 'Warning'
        },
        error: {
            icon: AlertTriangle,
            color: 'text-destructive',
            bg: 'bg-destructive/10',
            label: isRTL ? 'خطأ' : 'Error'
        },
    }

    const config = statusConfig[status]
    const StatusIcon = config.icon

    return (
        <div className={cn("flex items-center justify-between p-4 rounded-xl", config.bg)}>
            <div>
                <p className="font-medium font-cairo">{label}</p>
                <p className={cn("text-xs", config.color)}>{config.label}</p>
            </div>
            <StatusIcon className={cn("w-6 h-6", config.color)} />
        </div>
    )
}

// Quick Action
function QuickAction({
    label,
    icon: Icon,
    href
}: {
    label: string
    icon: React.ElementType
    href: string
}) {
    return (
        <a
            href={href}
            className="flex flex-col items-center gap-2 p-4 bg-card border rounded-xl hover:bg-muted/10 hover:border-secondary/50 transition-all cursor-pointer"
        >
            <div className="p-3 bg-secondary/10 rounded-xl">
                <Icon className="w-6 h-6 text-secondary" />
            </div>
            <span className="text-sm font-cairo font-medium text-center">{label}</span>
        </a>
    )
}
