import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { cn, getInitials } from '@/lib/utils'
import {
    Menu,
    Bell,
    Sun,
    Moon,
    Globe,
    ChevronDown,
    Shield,
} from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { useTheme } from '@/contexts/ThemeContext'

interface PlatformHeaderProps {
    onMenuClick: () => void
}

export default function PlatformHeader({ onMenuClick }: PlatformHeaderProps) {
    const { i18n } = useTranslation()
    const { user, profile, signOut } = useAuth()
    const { setTheme, resolvedTheme } = useTheme()

    const [showUserMenu, setShowUserMenu] = useState(false)
    const userMenuRef = useRef<HTMLDivElement>(null)

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
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    return (
        <header className="h-16 bg-card border-b border-border flex items-center justify-between px-6 sticky top-0 z-40">
            {/* Left side */}
            <div className="flex items-center gap-4">
                {/* Mobile menu button */}
                <button
                    onClick={onMenuClick}
                    className="lg:hidden p-2 rounded-lg hover:bg-muted/10 transition-colors"
                >
                    <Menu className="w-5 h-5" />
                </button>

                {/* Platform Badge */}
                <div className="hidden md:flex items-center gap-2 bg-secondary/10 border border-secondary/20 rounded-lg px-3 py-1.5">
                    <Shield className="w-4 h-4 text-secondary" />
                    <span className="text-sm font-medium text-secondary font-cairo">
                        {isRTL ? 'وضع إدارة المنصة' : 'Platform Admin Mode'}
                    </span>
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
                    <Globe className="w-5 h-5 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground hidden sm:inline">
                        {i18n.language === 'ar' ? 'EN' : 'عر'}
                    </span>
                </button>

                {/* Theme toggle */}
                <button
                    onClick={toggleTheme}
                    className="p-2 rounded-lg hover:bg-muted/10 transition-colors"
                >
                    {resolvedTheme === 'dark' ? (
                        <Sun className="w-5 h-5 text-muted-foreground" />
                    ) : (
                        <Moon className="w-5 h-5 text-muted-foreground" />
                    )}
                </button>

                {/* Notifications */}
                <button
                    className="p-2 rounded-lg hover:bg-muted/10 transition-colors relative"
                >
                    <Bell className="w-5 h-5 text-muted-foreground" />
                    <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full" />
                </button>

                {/* User Menu */}
                <div className="relative" ref={userMenuRef}>
                    <button
                        onClick={() => setShowUserMenu(!showUserMenu)}
                        className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-muted/10 transition-colors"
                    >
                        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-white text-sm font-medium">
                            {getInitials(displayName || 'A')}
                        </div>
                        <div className="hidden md:block text-sm text-start">
                            <p className="font-medium font-cairo truncate max-w-32">{displayName}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-32">
                                {isRTL ? 'مدير المنصة' : 'Platform Admin'}
                            </p>
                        </div>
                        <ChevronDown className={cn(
                            'w-4 h-4 text-muted-foreground transition-transform hidden md:block',
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

                            <div className="border-t border-border py-1">
                                <button
                                    onClick={signOut}
                                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors font-cairo"
                                >
                                    {isRTL ? 'تسجيل الخروج' : 'Sign Out'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </header>
    )
}
