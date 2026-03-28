import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
    LayoutDashboard,
    Building2,
    CreditCard,
    Users,
    DollarSign,
    Settings,
    ChevronRight,
    ChevronLeft,
    Activity,
    BarChart3,
    LogOut,
    Megaphone,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { usePermission } from '@/hooks/usePermission'
import { Permission } from '@/config/permissions'

interface PlatformSidebarProps {
    collapsed: boolean
    onToggle: () => void
}

export default function PlatformSidebar({ collapsed, onToggle }: PlatformSidebarProps) {
    const { i18n } = useTranslation()
    const location = useLocation()
    const { signOut } = useAuth()
    const { can } = usePermission()
    const isRTL = i18n.language === 'ar'

    const platformMenuItems: Array<{
        icon: React.ElementType
        label: string
        href: string
        permission: Permission
    }> = [
        {
            icon: LayoutDashboard,
            label: isRTL ? 'لوحة المنصة' : 'Platform Dashboard',
            href: '/platform',
            permission: 'platform.dashboard.view',
        },
        {
            icon: Building2,
            label: isRTL ? 'إدارة المنشآت' : 'Institutions',
            href: '/platform/tenants',
            permission: 'platform.tenants.view',
        },
        {
            icon: CreditCard,
            label: isRTL ? 'الاشتراكات' : 'Subscriptions',
            href: '/platform/subscriptions',
            permission: 'platform.subscriptions.manage',
        },
        {
            icon: Users,
            label: isRTL ? 'موظفو المنصة' : 'Platform Staff',
            href: '/platform/staff',
            permission: 'platform.staff.manage',
        },
        {
            icon: DollarSign,
            label: isRTL ? 'الإدارة المالية' : 'Financials',
            href: '/platform/financials',
            permission: 'platform.financials.view',
        },
        {
            icon: Megaphone,
            label: isRTL ? 'التعاميم' : 'Announcements',
            href: '/platform/announcements',
            permission: 'platform.announcements.manage',
        },
        {
            icon: Activity,
            label: isRTL ? 'سجلات النظام' : 'Audit Logs',
            href: '/platform/logs',
            permission: 'platform.audit.view',
        },
        {
            icon: BarChart3,
            label: isRTL ? 'التقارير' : 'Reports',
            href: '/platform/reports',
            permission: 'platform.reports.view',
        },
    ].filter(item => can(item.permission))

    const settingsItems: Array<{
        icon: React.ElementType
        label: string
        href: string
        permission: Permission
    }> = [
        {
            icon: Settings,
            label: isRTL ? 'إعدادات المنصة' : 'Platform Settings',
            href: '/platform/settings',
            permission: 'platform.settings.manage',
        },
    ].filter(item => can(item.permission))

    const isActive = (href: string) =>
        location.pathname === href || (href !== '/platform' && location.pathname.startsWith(href + '/'))

    return (
        <aside
            className={cn(
                'fixed top-0 h-full bg-card border-r border-border text-foreground transition-all duration-300 z-50',
                collapsed ? 'w-20' : 'w-64',
                isRTL ? 'right-0' : 'left-0'
            )}
        >
            <div className="h-16 flex items-center justify-center border-b border-border">
                <Link to="/platform" className="flex items-center gap-3">
                    <img
                        src="/images/logo.png"
                        alt="Mutqan"
                        className={cn('h-10 w-10 object-contain', collapsed && 'h-8 w-8')}
                    />
                    {!collapsed && (
                        <div>
                            <span className="text-lg font-bold font-cairo text-primary block">
                                {isRTL ? 'متقن' : 'Mutqan'}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-cairo block -mt-1">
                                {isRTL ? 'إدارة المنصة' : 'Platform Console'}
                            </span>
                        </div>
                    )}
                </Link>
            </div>

            <nav className="flex flex-col h-[calc(100%-4rem)] py-4">
                <div className="flex-1 px-3 space-y-1">
                    {platformMenuItems.map((item) => (
                        <Link
                            key={item.href}
                            to={item.href}
                            className={cn(
                                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
                                'hover:bg-muted',
                                isActive(item.href)
                                    ? 'bg-secondary text-white shadow-md shadow-secondary/20'
                                    : 'text-muted-foreground hover:text-foreground',
                                collapsed && 'justify-center'
                            )}
                        >
                            <item.icon
                                className={cn(
                                    'w-5 h-5 flex-shrink-0',
                                    isActive(item.href) ? 'text-white' : 'text-muted-foreground'
                                )}
                            />
                            {!collapsed && (
                                <span className="font-cairo text-sm">{item.label}</span>
                            )}
                        </Link>
                    ))}
                </div>

                {settingsItems.length > 0 && (
                    <>
                        <div className="px-6 py-2">
                            <div className="h-px bg-border" />
                        </div>

                        <div className="px-3 space-y-1">
                            {settingsItems.map((item) => (
                                <Link
                                    key={item.href}
                                    to={item.href}
                                    className={cn(
                                        'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
                                        'hover:bg-muted',
                                        isActive(item.href)
                                            ? 'bg-secondary text-white shadow-md shadow-secondary/20'
                                            : 'text-muted-foreground hover:text-foreground',
                                        collapsed && 'justify-center'
                                    )}
                                >
                                    <item.icon
                                        className={cn(
                                            'w-5 h-5 flex-shrink-0',
                                            isActive(item.href) ? 'text-white' : 'text-muted-foreground'
                                        )}
                                    />
                                    {!collapsed && (
                                        <span className="font-cairo text-sm">{item.label}</span>
                                    )}
                                </Link>
                            ))}
                        </div>
                    </>
                )}

                <div className="px-3 space-y-1 mt-4">
                    <button
                        onClick={signOut}
                        className={cn(
                            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
                            'hover:bg-destructive/10 text-destructive',
                            collapsed && 'justify-center'
                        )}
                    >
                        <LogOut className="w-5 h-5 flex-shrink-0" />
                        {!collapsed && (
                            <span className="font-cairo text-sm">
                                {isRTL ? 'تسجيل الخروج' : 'Sign Out'}
                            </span>
                        )}
                    </button>
                </div>

                <div className="px-3 mt-4">
                    <button
                        onClick={onToggle}
                        className={cn(
                            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg',
                            'hover:bg-muted transition-all duration-200 text-muted-foreground',
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
