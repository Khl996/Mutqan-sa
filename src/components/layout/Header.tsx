import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { useTenant } from '@/contexts/TenantContext'
import { useNotifications } from '@/hooks/useNotifications'
import { cn, getInitials } from '@/lib/utils'
import {
    Menu,
    Bell,
    Search,
    Sun,
    Moon,
    Globe,
    LogOut,
    User,
    ChevronDown,
    Building2,
    Shield,
    ArrowLeft,
} from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'

interface HeaderProps {
    onMenuClick: () => void
}

/**
 * Tenant Header - For Institution/Tenant Users Only
 * 
 * This header is COMPLETELY ISOLATED from platform management.
 * NO tenant switching functionality here.
 * Platform admins have their own separate PlatformHeader.
 */
export default function Header({ onMenuClick }: HeaderProps) {
    const { t, i18n } = useTranslation()
    const { user, profile, signOut } = useAuth()
    const { setTheme, resolvedTheme } = useTheme()
    const { currentTenant, isPlatformUser, clearTenant } = useTenant()

    const [showUserMenu, setShowUserMenu] = useState(false)
    const [showNotifications, setShowNotifications] = useState(false)
    const userMenuRef = useRef<HTMLDivElement>(null)
    const notifRef = useRef<HTMLDivElement>(null)

    const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications()

    const isRTL = i18n.language === 'ar'
    const displayName = isRTL
        ? profile?.full_name_ar || profile?.full_name || user?.email
        : profile?.full_name || profile?.full_name_ar || user?.email

    const toggleLanguage = () => {
        i18n.changeLanguage(i18n.language === 'ar' ? 'en' : 'ar')
    }

    const toggleTheme = () => {
        setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
    }

    // Close menus when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
                setShowUserMenu(false)
            }
            if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
                setShowNotifications(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    return (
        <header className="h-16 bg-card border-b border-border flex items-center justify-between px-4 sm:px-6 sticky top-0 z-30">
            {/* Left side */}
            <div className="flex items-center gap-4">
                {/* Mobile menu button */}
                <button
                    onClick={onMenuClick}
                    className="lg:hidden p-2 rounded-lg hover:bg-muted/10 transition-colors"
                    aria-label={isRTL ? 'فتح القائمة' : 'Open navigation'}
                >
                    <Menu className="w-5 h-5" />
                </button>

                {/* Back to Platform Button - Only for Platform Users viewing a tenant */}
                {isPlatformUser && (
                    <button
                        onClick={() => {
                            clearTenant()
                            window.location.href = '/platform'
                        }}
                        className="hidden md:flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-1.5 hover:bg-amber-500/20 transition-colors"
                    >
                        <Shield className="w-4 h-4 text-amber-500" />
                        <span className="text-sm font-cairo font-medium text-amber-600">
                            {isRTL ? 'العودة للمنصة' : 'Back to Platform'}
                        </span>
                        <ArrowLeft className={cn('w-4 h-4 text-amber-500', isRTL && 'rotate-180')} />
                    </button>
                )}

                {/* Current Tenant Info - Display Only (No Switching) */}
                {currentTenant && (
                    <div className="hidden md:flex items-center gap-2 bg-secondary/5 border border-secondary/10 rounded-lg px-3 py-1.5">
                        <Building2 className="w-4 h-4 text-secondary" />
                        <span className="text-sm font-cairo font-medium text-secondary">
                            {isRTL ? (currentTenant.name_ar || currentTenant.name) : currentTenant.name}
                        </span>
                    </div>
                )}

                {/* Search */}
                <div className="hidden md:flex items-center gap-2 bg-background rounded-lg px-4 py-2 w-64">
                    <Search className="w-4 h-4 text-muted" />
                    <input
                        type="text"
                        placeholder={t('common.search')}
                        className="flex-1 bg-transparent border-none outline-none text-sm font-cairo"
                    />
                </div>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2">
                {/* Language toggle */}
                <button
                    onClick={toggleLanguage}
                    className="p-2 rounded-lg hover:bg-muted/10 transition-colors flex items-center gap-1"
                    title={i18n.language === 'ar' ? 'English' : 'العربية'}
                >
                    <Globe className="w-5 h-5 text-muted" />
                    <span className="text-xs font-medium text-muted hidden sm:inline">
                        {i18n.language === 'ar' ? 'EN' : 'عر'}
                    </span>
                </button>

                {/* Theme toggle */}
                <button
                    onClick={toggleTheme}
                    className="p-2 rounded-lg hover:bg-muted/10 transition-colors"
                >
                    {resolvedTheme === 'dark' ? (
                        <Sun className="w-5 h-5 text-muted" />
                    ) : (
                        <Moon className="w-5 h-5 text-muted" />
                    )}
                </button>

                {/* Notifications */}
                <div className="relative" ref={notifRef}>
                    <button
                        onClick={() => setShowNotifications(!showNotifications)}
                        className="p-2 rounded-lg hover:bg-muted/10 transition-colors relative"
                    >
                        <Bell className="w-5 h-5 text-muted" />
                        {unreadCount > 0 && (
                            <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full animate-pulse" />
                        )}
                    </button>

                    {/* Notifications Dropdown */}
                    {showNotifications && (
                        <div className={cn(
                            'absolute top-full mt-2 w-80 max-h-[400px] flex flex-col bg-card rounded-lg shadow-lg border border-border z-50 overflow-hidden',
                            isRTL ? 'left-0' : 'right-0'
                        )}>
                            <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-muted/50">
                                <p className="font-bold font-cairo text-sm text-primary">
                                    {t('header.notifications')} ({unreadCount})
                                </p>
                                {unreadCount > 0 && (
                                    <button
                                        onClick={() => markAllAsRead()}
                                        className="text-xs text-primary hover:underline font-cairo"
                                    >
                                        {t('notifications.markAllAsRead')}
                                    </button>
                                )}
                            </div>

                            <div className="overflow-y-auto flex-1">
                                {notifications.length > 0 ? (
                                    <div className="divide-y divide-border">
                                        {notifications.map((notif: any) => (
                                            <div
                                                key={notif.id}
                                                className={cn(
                                                    "p-3 hover:bg-muted/5 transition-colors cursor-pointer relative group",
                                                    !notif.is_read && "bg-primary/5"
                                                )}
                                                onClick={() => {
                                                    if (!notif.is_read) markAsRead(notif.id)
                                                    if (notif.link) {
                                                        setShowNotifications(false)
                                                        window.location.href = notif.link
                                                    }
                                                }}
                                            >
                                                <div className="flex items-start gap-3">
                                                    <div className={cn(
                                                        "w-2 h-2 rounded-full mt-1.5 shrink-0",
                                                        !notif.is_read ? "bg-primary" : "bg-muted"
                                                    )} />
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className={cn(
                                                            "text-sm font-medium font-cairo truncate",
                                                            !notif.is_read ? "text-primary" : "text-muted-foreground"
                                                        )}>
                                                            {notif.title}
                                                        </h4>
                                                        <p className="text-xs text-muted-foreground font-cairo line-clamp-2 mt-0.5">
                                                            {notif.message}
                                                        </p>
                                                        <p className="text-[10px] text-muted-foreground mt-1 font-inter">
                                                            {new Date(notif.created_at).toLocaleString(isRTL ? 'ar-SA' : 'en-US')}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="py-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                                        <Bell className="w-8 h-8 text-muted/30" />
                                        <p className="font-cairo text-muted/50">{t('notifications.noNotifications')}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* User Menu */}
                <div className="relative" ref={userMenuRef}>
                    <button
                        onClick={() => setShowUserMenu(!showUserMenu)}
                        className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-muted/10 transition-colors"
                    >
                        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-white text-sm font-medium">
                            {getInitials(displayName || 'U')}
                        </div>
                        <div className="hidden md:block text-sm text-start">
                            <p className="font-medium font-cairo truncate max-w-32">{displayName}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-32">
                                {profile?.role}
                            </p>
                        </div>
                        <ChevronDown className={cn(
                            'w-4 h-4 text-muted transition-transform hidden md:block',
                            showUserMenu && 'rotate-180'
                        )} />
                    </button>

                    {/* Dropdown Menu */}
                    {showUserMenu && (
                        <div className={cn(
                            'absolute top-full mt-2 w-56 bg-card rounded-lg shadow-lg border border-border py-1 z-50',
                            isRTL ? 'left-0' : 'right-0'
                        )}>
                            <div className="px-4 py-3 border-b border-border">
                                <p className="font-medium font-cairo">{displayName}</p>
                                <p className="text-sm text-muted-foreground">{user?.email}</p>
                            </div>

                            <div className="py-1">
                                <Link
                                    to="/profile"
                                    onClick={() => setShowUserMenu(false)}
                                    className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-muted/10 transition-colors font-cairo"
                                >
                                    <User className="w-4 h-4" />
                                    {t('profile.title')}
                                </Link>
                            </div>

                            <div className="border-t border-border py-1">
                                <button
                                    onClick={signOut}
                                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors font-cairo"
                                >
                                    <LogOut className="w-4 h-4" />
                                    {t('auth.logout')}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </header>
    )
}
