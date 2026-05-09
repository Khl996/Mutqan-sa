import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { MutqanLogo } from '@/components/ui/MutqanLogo'
import { useTenantModules } from '@/hooks/useTenantModules'
import { isFeatureEnabled, isModuleEnabled } from '@/config/modules'
import { usePermission } from '@/hooks/usePermission'
import { Permission } from '@/config/permissions'
import {
    LayoutDashboard,
    Building2,
    Box,
    ClipboardList,
    Wrench,
    Package,
    Users,
    Users2,
    FileText,
    Settings,
    ChevronRight,
    ChevronLeft,
    Shield,
    History,
    CreditCard,
} from 'lucide-react'

interface SidebarProps {
    collapsed: boolean
    mobileOpen: boolean
    onToggle: () => void
    onNavigate: () => void
}

export default function Sidebar({ collapsed, mobileOpen, onToggle, onNavigate }: SidebarProps) {
    const { t, i18n } = useTranslation()
    const location = useLocation()
    const isRTL = i18n.language === 'ar'
    const { can } = usePermission()
    const { data: tenantModules } = useTenantModules()
    const compact = collapsed && !mobileOpen

    const allMenuItems: Array<{
        icon: React.ElementType
        label: string
        href: string
        moduleCode: string
        featureCode?: string
        permission: Permission
    }> = [
        { icon: LayoutDashboard, label: t('sidebar.dashboard'), href: '/dashboard', moduleCode: 'dashboard', permission: 'dashboard.view' },
        { icon: Building2, label: t('sidebar.facilities'), href: '/facilities', moduleCode: 'facilities', permission: 'facilities.view' },
        { icon: Box, label: t('sidebar.assets'), href: '/assets', moduleCode: 'assets', permission: 'assets.view' },
        { icon: History, label: isRTL ? 'سجل الإجراءات' : 'Operations Log', href: '/asset-logs', moduleCode: 'assets', featureCode: 'asset_history', permission: 'assets.view' },
        { icon: ClipboardList, label: t('sidebar.workOrders'), href: '/work-orders', moduleCode: 'work_orders', permission: 'work_orders.view' },
        { icon: Wrench, label: t('sidebar.maintenance'), href: '/maintenance', moduleCode: 'maintenance', permission: 'maintenance.view' },
        { icon: Package, label: t('sidebar.inventory'), href: '/inventory', moduleCode: 'inventory', permission: 'inventory.view' },
        { icon: Users, label: t('sidebar.teams'), href: '/teams', moduleCode: 'employees', permission: 'users.view' },
        { icon: Users2, label: t('sidebar.workTeams'), href: '/work-teams', moduleCode: 'work_teams', permission: 'work_teams.view' },
        { icon: FileText, label: t('sidebar.reports'), href: '/reports', moduleCode: 'reports', permission: 'reports.view' },
    ]

    const menuItems = allMenuItems.filter((item) =>
        isModuleEnabled(tenantModules, item.moduleCode) &&
        (!item.featureCode || isFeatureEnabled(tenantModules, item.moduleCode, item.featureCode)) &&
        can(item.permission)
    )

    const adminItems = [
        { icon: Settings, label: t('sidebar.settings'), href: '/settings', permission: 'settings.view' as Permission },
        ...(can('subscription.manage')
            ? [{
                icon: CreditCard,
                label: isRTL ? 'الاشتراك' : 'Subscription',
                href: '/subscription',
                permission: 'subscription.manage' as Permission,
            }]
            : []),
        { icon: Shield, label: t('sidebar.admin'), href: '/admin', permission: 'settings.manage' as Permission },
    ].filter((item) => can(item.permission))

    const isActive = (href: string) => location.pathname === href || location.pathname.startsWith(href + '/')

    return (
        <aside
            style={{ backgroundColor: '#0B1320', color: '#ffffff' }}
            className={cn(
                'fixed top-0 h-full w-64 !bg-[#0B1320] !text-white z-50 transition-transform duration-300 lg:transition-all',
                'dark:!bg-[#0B1320] dark:!text-white',
                compact ? 'lg:w-20' : 'lg:w-64',
                mobileOpen ? 'translate-x-0' : (isRTL ? 'translate-x-full lg:translate-x-0' : '-translate-x-full lg:translate-x-0'),
                isRTL ? 'right-0 border-l border-white/10' : 'left-0 border-r border-white/10'
            )}
        >
            <div className="h-16 flex items-center justify-center border-b border-white/10 bg-[#0B1320]">
                <Link to="/dashboard" onClick={onNavigate} className="flex items-center gap-3">
                    <MutqanLogo
                        variant={compact ? 'symbol' : 'horizontal'}
                        size={compact ? 'sm' : 'md'}
                        theme="dark"
                        label={t('app.name')}
                    />
                </Link>
            </div>

            <nav className="flex flex-col h-[calc(100vh-4rem)] overflow-y-auto scrollbar-thin scrollbar-thumb-white/20 hover:scrollbar-thumb-white/30 py-4 pb-20">
                <div className="flex-1 px-3 space-y-1">
                    {menuItems.map((item) => (
                        <Link
                            key={item.href}
                            to={item.href}
                            onClick={onNavigate}
                            className={cn(
                                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
                                'text-white/80 hover:bg-white/10 hover:text-white',
                                isActive(item.href) && 'bg-[#00B2A9] text-white shadow-[0_10px_22px_rgba(0,178,169,0.18)]',
                                compact && 'justify-center'
                            )}
                        >
                            <item.icon className="w-5 h-5 flex-shrink-0 text-current" />
                            {!compact && (
                                <span className="font-cairo text-sm">{item.label}</span>
                            )}
                        </Link>
                    ))}
                </div>

                <div className="px-6 py-2 mt-auto">
                    <div className="h-px bg-white/10" />
                </div>

                <div className="px-3 space-y-1">
                    {adminItems.map((item) => (
                        <Link
                            key={item.href}
                            to={item.href}
                            onClick={onNavigate}
                            className={cn(
                                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
                                'text-white/80 hover:bg-white/10 hover:text-white',
                                isActive(item.href) && 'bg-[#00B2A9] text-white shadow-[0_10px_22px_rgba(0,178,169,0.18)]',
                                compact && 'justify-center'
                            )}
                        >
                            <item.icon className="w-5 h-5 flex-shrink-0 text-current" />
                            {!compact && (
                                <span className="font-cairo text-sm">{item.label}</span>
                            )}
                        </Link>
                    ))}
                </div>

                <div className="hidden lg:block px-3 mt-4">
                    <button
                        onClick={onToggle}
                        className={cn(
                            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg',
                            'text-white/70 hover:bg-white/10 hover:text-white transition-all duration-200',
                            compact && 'justify-center'
                        )}
                    >
                        {isRTL ? (
                            compact ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />
                        ) : (
                            compact ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />
                        )}
                        {!compact && (
                            <span className="font-cairo text-sm">
                                {isRTL ? 'تصغير' : 'Collapse'}
                            </span>
                        )}
                    </button>
                </div>
            </nav>
        </aside>
    )
}
