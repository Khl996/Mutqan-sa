import { Outlet, Navigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import PlatformSidebar from './PlatformSidebar'
import PlatformHeader from './PlatformHeader'
import { cn } from '@/lib/utils'
import { PLATFORM_ROLES } from '@/config/roles'

type AccessState = 'loading' | 'authenticated' | 'denied' | 'not-logged-in'

interface ProfileData {
    role: string
    is_super_admin: boolean
}

// Get session from localStorage
function getSessionFromStorage(): { userId: string; email: string; accessToken: string } | null {
    try {
        const keys = Object.keys(localStorage)
        const authKey = keys.find(k => k.startsWith('sb-') && k.endsWith('-auth-token'))

        if (!authKey) return null

        const stored = localStorage.getItem(authKey)
        if (!stored) return null

        const parsed = JSON.parse(stored)
        const user = parsed?.user
        const accessToken = parsed?.access_token

        if (user?.id && user?.email && accessToken) {
            return { userId: user.id, email: user.email, accessToken }
        }
        return null
    } catch (e) {
        console.error('Error reading session:', e)
        return null
    }
}

// Fetch profile using native fetch (no React lifecycle issues)
async function fetchProfileDirect(userId: string, accessToken: string): Promise<ProfileData | null> {
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
    const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

    try {
        // Use REST API directly to avoid Supabase client abort issues
        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=role,is_super_admin`,
            {
                method: 'GET',
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        )

        if (!response.ok) {
            console.error('Profile fetch failed:', response.status)
            return null
        }

        const data = await response.json()

        if (Array.isArray(data) && data.length > 0) {
            return data[0] as ProfileData
        }

        return null
    } catch (err) {
        console.error('Profile fetch error:', err)
        return null
    }
}

export default function PlatformLayout() {
    const { i18n } = useTranslation()
    const location = useLocation()
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const [accessState, setAccessState] = useState<AccessState>('loading')

    const isRTL = i18n.language === 'ar'

    // Check access using localStorage + direct fetch
    useEffect(() => {
        let cancelled = false

        const checkAccess = async () => {
            // Step 1: Get session from localStorage
            const storedSession = getSessionFromStorage()

            if (!storedSession) {
                if (!cancelled) setAccessState('not-logged-in')
                return
            }

            // Step 2: Fetch profile using native fetch
            const profile = await fetchProfileDirect(storedSession.userId, storedSession.accessToken)

            if (!profile) {
                if (!cancelled) setAccessState('denied')
                return
            }

            const hasPlatformAccess = (PLATFORM_ROLES as readonly string[]).includes(profile.role) || profile.is_super_admin

            if (!cancelled) {
                setAccessState(hasPlatformAccess ? 'authenticated' : 'denied')
            }
        }

        checkAccess()

        return () => {
            cancelled = true
        }
    }, [])

    // Loading state
    if (accessState === 'loading') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-mutqan-bg">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-secondary border-t-transparent rounded-full animate-spin" />
                    <p className="text-muted-foreground font-cairo">
                        {isRTL ? 'جاري التحقق من الصلاحيات...' : 'Verifying access...'}
                    </p>
                </div>
            </div>
        )
    }

    // Not logged in
    if (accessState === 'not-logged-in') {
        return <Navigate to="/login" state={{ from: location }} replace />
    }

    // Access denied
    if (accessState === 'denied') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-mutqan-bg">
                <div className="flex flex-col items-center gap-4 text-center max-w-md p-6">
                    <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
                        <span className="text-4xl text-destructive">🚫</span>
                    </div>
                    <h2 className="text-2xl font-bold text-foreground font-cairo">
                        {isRTL ? 'غير مصرح بالدخول' : 'Access Denied'}
                    </h2>
                    <p className="text-muted-foreground font-cairo leading-relaxed">
                        {isRTL
                            ? 'هذه الصفحة مخصصة لمدراء المنصة فقط. تأكد من أن حسابك لديه صلاحية platform_admin.'
                            : 'This page is for Platform Administrators only. Make sure your account has platform_admin role.'}
                    </p>
                    <button
                        onClick={() => window.location.href = '/dashboard'}
                        className="mt-4 px-6 py-2.5 bg-secondary text-white rounded-lg font-cairo font-medium hover:bg-secondary/90 transition-colors"
                    >
                        {isRTL ? 'العودة للوحة التحكم' : 'Back to Dashboard'}
                    </button>
                </div>
            </div>
        )
    }

    // Authenticated - show platform layout
    const marginClass = cn(
        'transition-all duration-300',
        isRTL
            ? (sidebarCollapsed ? 'mr-20' : 'mr-64')
            : (sidebarCollapsed ? 'ml-20' : 'ml-64')
    )

    return (
        <div className="min-h-screen bg-mutqan-bg">
            <PlatformSidebar
                collapsed={sidebarCollapsed}
                onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
            />

            <div className={cn('flex flex-col min-h-screen', marginClass)}>
                <PlatformHeader onMenuClick={() => setSidebarCollapsed(!sidebarCollapsed)} />

                <main className="flex-1 p-6 overflow-auto">
                    <Outlet />
                </main>
            </div>
        </div>
    )
}
