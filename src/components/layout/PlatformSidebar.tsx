import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { MutqanLogo } from '@/components/ui/MutqanLogo'
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
    FileText,
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

    type NavItem = { icon: React.ElementType; label: string; href: string; permission: Permission }

    const allPlatformItems: NavItem[] = [
        { icon: LayoutDashboard, label: isRTL ? 'لوحة المنصة' : 'Platform Dashboard', href: '/platform', permission: 'platform.dashboard.view' },
        { icon: Building2, label: isRTL ? 'إدارة المنشآت' : 'Institutions', href: '/platform/tenants', permission: 'platform.tenants.view' },
        { icon: CreditCard, label: isRTL ? 'الاشتراكات' : 'Subscriptions', href: '/platform/subscriptions', permission: 'platform.subscriptions.manage' },
        { icon: FileText, label: isRTL ? 'عروض الأسعار' : 'Quotes', href: '/platform/quotes', permission: 'platform.subscriptions.manage' },
        { icon: Users, label: isRTL ? 'موظفو المنصة' : 'Platform Staff', href: '/platform/staff', permission: 'platform.staff.manage' },
        { icon: DollarSign, label: isRTL ? 'الإدارة المالية' : 'Financials', href: '/platform/financials', permission: 'platform.financials.view' },
        { icon: Megaphone, label: isRTL ? 'التعاميم' : 'Announcements', href: '/platform/announcements', permission: 'platform.announcements.manage' },
        { icon: Activity, label: isRTL ? 'سجلات النظام' : 'Audit Logs', href: '/platform/logs', permission: 'platform.audit.view' },
        { icon: BarChart3, label: isRTL ? 'التقارير' : 'Reports', href: '/platform/reports', permission: 'platform.reports.view' },
    ]
    const platformMenuItems = allPlatformItems.filter(item => can(item.permission))

    const allSettingsItems: NavItem[] = [
        { icon: Settings, label: isRTL ? 'إعدادات المنصة' : 'Platform Settings', href: '/platform/settings', permission: 'platform.settings.manage' },
    ]
    const settingsItems = allSettingsItems.filter(item => can(item.permission))

    const isActive = (href: string) =>
        location.pathname === href || (href !== '/platform' && location.pathname.startsWith(href + '/'))

    return (
        <aside
            className={cn(
                'fixed top-0 h-full bg-[#0b1320] text-white border-r border-white/10 shadow-[0_18px_45px_rgba(0,0,0,0.18)] transition-all duration-300 z-50',
                'dark:bg-[#0b1320] dark:text-white',
                collapsed ? 'w-20' : 'w-64',
                isRTL ? 'right-0' : 'left-0'
            )}
        >
            <div className="h-16 flex items-center justify-center border-b border-white/10">
                <Link to="/platform" className="flex items-center gap-3">
                    <MutqanLogo
                        variant={collapsed ? 'symbol' : 'horizontal'}
                        size={collapsed ? 'sm' : 'md'}
                        theme="dark"
                        label={isRTL ? 'متقن' : 'Mutqan'}
                        subtitle={collapsed ? undefined : (isRTL ? 'إدارة المنصة' : 'Platform Console')}
                    />
                </Link>
            </div>

            <nav className="flex flex-col h-[calc(100%-4rem)] py-4">
                <div className="flex-1 px-3 space-y-1">
                    {platformMenuItems.map((item) => (
                        <Link
                            key={item.href}
                            to={item.href}
                            className={cn(
                                'group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
                                'hover:bg-white/10',
                                isActive(item.href)
                                    ? 'bg-[#00b2a9] text-white shadow-[0_10px_22px_rgba(0,178,169,0.18)]'
                                    : 'text-white/72 hover:text-white',
                                collapsed && 'justify-center'
                            )}
                        >
                            <item.icon
                                className={cn(
                                    'w-5 h-5 flex-shrink-0',
                                    isActive(item.href) ? 'text-white' : 'text-white/60 group-hover:text-white/90'
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
                            <div className="h-px bg-white/10" />
                        </div>

                        <div className="px-3 space-y-1">
                            {settingsItems.map((item) => (
                                <Link
                                    key={item.href}
                                    to={item.href}
                                    className={cn(
                                        'group flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
                                        'hover:bg-white/10',
                                        isActive(item.href)
                                            ? 'bg-[#00b2a9] text-white shadow-[0_10px_22px_rgba(0,178,169,0.18)]'
                                            : 'text-white/72 hover:text-white',
                                        collapsed && 'justify-center'
                                    )}
                                >
                                    <item.icon
                                        className={cn(
                                            'w-5 h-5 flex-shrink-0',
                                            isActive(item.href) ? 'text-white' : 'text-white/60 group-hover:text-white/90'
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
                            'text-red-300 hover:bg-red-500/10 hover:text-red-200',
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
                            'text-white/70 hover:bg-white/10 hover:text-white transition-all duration-200',
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
