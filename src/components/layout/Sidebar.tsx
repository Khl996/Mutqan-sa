import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useTenantModules } from '@/hooks/useTenantModules'
import { isModuleEnabled } from '@/config/modules'
import { usePermission } from '@/hooks/usePermission'
import { Permission } from '@/config/permissions'
import { useAuth } from '@/contexts/AuthContext'
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
    CreditCard
} from 'lucide-react'

interface SidebarProps {
    collapsed: boolean
    onToggle: () => void
}

/**
 * Tenant Sidebar - For Institution/Tenant Users Only
 * 
 * This sidebar is COMPLETELY ISOLATED from platform management.
 * Platform admins have their own separate PlatformSidebar.
 * 
 * Menu items are filtered based on enabled modules for each tenant.
 * No platform-level controls should EVER appear here.
 */

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
    const { t, i18n } = useTranslation()
    const location = useLocation()
    const isRTL = i18n.language === 'ar'
    const { can, isAdmin, isManager } = usePermission()
    const { profile } = useAuth()

    // Get tenant modules configuration
    const { data: tenantModules } = useTenantModules()

    // All menu items with their module codes
    const allMenuItems: { icon: any, label: string, href: string, moduleCode: string, permission: Permission }[] = [
        { icon: LayoutDashboard, label: t('sidebar.dashboard'), href: '/dashboard', moduleCode: 'dashboard', permission: 'dashboard.view' },
        { icon: Building2, label: t('sidebar.facilities'), href: '/facilities', moduleCode: 'facilities', permission: 'facilities.view' },
        { icon: Box, label: t('sidebar.assets'), href: '/assets', moduleCode: 'assets', permission: 'assets.view' },
        { icon: History, label: isRTL ? 'سجل الإجراءات' : "Operations Log", href: '/asset-logs', moduleCode: 'assets', permission: 'assets.view' },
        { icon: ClipboardList, label: t('sidebar.workOrders'), href: '/work-orders', moduleCode: 'work_orders', permission: 'work_orders.view' },
        { icon: Wrench, label: t('sidebar.maintenance'), href: '/maintenance', moduleCode: 'maintenance', permission: 'maintenance.view' },
        { icon: Package, label: t('sidebar.inventory'), href: '/inventory', moduleCode: 'inventory', permission: 'inventory.view' },
        { icon: Users, label: t('sidebar.teams'), href: '/teams', moduleCode: 'employees', permission: 'users.view' },
        { icon: Users2, label: t('sidebar.workTeams'), href: '/work-teams', moduleCode: 'work_teams', permission: 'users.view' }, // Assuming work teams view permissions fall under users or maintenance
        { icon: FileText, label: t('sidebar.reports'), href: '/reports', moduleCode: 'reports', permission: 'reports.view' },
    ]

    // Filter menu items based on enabled modules AND user permissions
    const menuItems = allMenuItems.filter(item =>
        isModuleEnabled(tenantModules, item.moduleCode) && can(item.permission)
    )

    // Tenant admin items - NOT platform items (always visible)
    const adminItems = [
        { icon: Settings, label: t('sidebar.settings'), href: '/settings', permission: 'settings.view' },
        // Subscription - Only for Tenant Admin
        ...(profile?.role === 'tenant_admin' ? [{
            icon: CreditCard,
            label: isRTL ? 'الاشتراك' : 'Subscription',
            href: '/subscription',
            permission: 'settings.manage' as Permission
        }] : []),
        { icon: Shield, label: t('sidebar.admin'), href: '/admin', permission: 'settings.manage' },
    ].filter(item => can(item.permission as Permission))


    const isActive = (href: string) => location.pathname === href || location.pathname.startsWith(href + '/')

    return (
        <aside
            className={cn(
                'fixed top-0 h-full bg-primary text-white transition-all duration-300 z-50',
                collapsed ? 'w-20' : 'w-64',
                isRTL ? 'right-0' : 'left-0'
            )}
        >
            {/* Logo */}
            <div className="h-16 flex items-center justify-center border-b border-white/10">
                <Link to="/dashboard" className="flex items-center gap-3">
                    <img
                        src="/images/logo-white.png"
                        alt="Mutqan"
                        className={cn('h-10 w-10 object-contain', collapsed && 'h-8 w-8')}
                    />
                    {!collapsed && (
                        <span className="text-xl font-bold font-cairo">{t('app.name')}</span>
                    )}
                </Link>
            </div>

            {/* Navigation */}
            <nav className="flex flex-col h-[calc(100vh-4rem)] overflow-y-auto scrollbar-thin scrollbar-thumb-white/20 hover:scrollbar-thumb-white/30 py-4 pb-20">
                {/* Main Menu */}
                <div className="flex-1 px-3 space-y-1">
                    {menuItems.map((item) => (
                        <Link
                            key={item.href}
                            to={item.href}
                            className={cn(
                                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
                                'hover:bg-white/10',
                                isActive(item.href) && 'bg-secondary text-white',
                                collapsed && 'justify-center'
                            )}
                        >
                            <item.icon className="w-5 h-5 flex-shrink-0" />
                            {!collapsed && (
                                <span className="font-cairo text-sm">{item.label}</span>
                            )}
                        </Link>
                    ))}
                </div>

                {/* Divider */}
                <div className="px-6 py-2 mt-auto">
                    <div className="h-px bg-white/10" />
                </div>

                {/* Admin Menu */}
                <div className="px-3 space-y-1">
                    {adminItems.map((item) => (
                        <Link
                            key={item.href}
                            to={item.href}
                            className={cn(
                                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
                                'hover:bg-white/10',
                                isActive(item.href) && 'bg-secondary text-white',
                                collapsed && 'justify-center'
                            )}
                        >
                            <item.icon className="w-5 h-5 flex-shrink-0" />
                            {!collapsed && (
                                <span className="font-cairo text-sm">{item.label}</span>
                            )}
                        </Link>
                    ))}
                </div>

                {/* Collapse Button */}
                <div className="px-3 mt-4">
                    <button
                        onClick={onToggle}
                        className={cn(
                            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg',
                            'hover:bg-white/10 transition-all duration-200',
                            collapsed && 'justify-center'
                        )}
                    >
                        {isRTL ? (
                            collapsed ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />
                        ) : (
                            collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />
                        )}
                        {!collapsed && (
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
