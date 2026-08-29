import { createContext, useContext, useEffect, useState, ReactNode, useRef, useCallback } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { InactiveAccountError, isExplicitlyActiveProfile } from '@/lib/authAccess'

interface Profile {
    id: string
    tenant_id: string | null
    full_name: string | null
    full_name_ar: string | null
    email: string | null
    phone: string | null
    avatar_url: string | null
    role: string
    is_super_admin: boolean
    is_active: boolean
    last_activity_at: string | null
}

interface AuthContextType {
    user: User | null
    session: Session | null
    profile: Profile | null
    isLoading: boolean
    isAuthenticated: boolean
    signIn: (email: string, password: string) => Promise<{ error: Error | null }>
    signOut: () => Promise<void>
    refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [session, setSession] = useState<Session | null>(null)
    const [profile, setProfile] = useState<Profile | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const isMountedRef = useRef(true)
    const initializingRef = useRef(false)

    // جلب الـ profile مباشرة باستخدام fetch لتجنب مشاكل AbortError
    const fetchProfile = useCallback(async (userId: string, accessToken?: string): Promise<Profile | null> => {
        try {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

            // Get token manually from storage since we might not have session in context yet
            const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`
            const storedSession = localStorage.getItem(storageKey)
            let token = accessToken ?? null

            if (!token && storedSession) {
                try {
                    token = JSON.parse(storedSession).access_token
                } catch { /* ignore */ }
            }

            if (!token) return null

            const response = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=*`, {
                headers: {
                    'apikey': supabaseAnonKey,
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            })

            if (!response.ok) {
                console.error('Profile fetch failed:', response.status)
                return null
            }

            const data = await response.json()

            if (data && data.length > 0) {
                return data[0] as Profile
            }
            return null
        } catch (e) {
            console.error('Profile fetch exception:', e)
            return null
        }
    }, [])

    const refreshProfile = useCallback(async () => {
        if (user?.id) {
            const p = await fetchProfile(user.id)
            if (p && isMountedRef.current) setProfile(p)
        }
    }, [user?.id, fetchProfile])

    // Initialize auth - simple and stable
    useEffect(() => {
        // Prevent double initialization
        if (initializingRef.current) return
        initializingRef.current = true
        isMountedRef.current = true

        const initAuth = async () => {
            try {
                const { data: { session: sess } } = await supabase.auth.getSession()

                if (!isMountedRef.current) return

                if (!sess?.user) {
                    setIsLoading(false)
                    return
                }

                setSession(sess)
                setUser(sess.user)

                // Fetch profile
                const profileData = await fetchProfile(sess.user.id)
                if (isMountedRef.current) {
                    setProfile(profileData)
                    setIsLoading(false)
                }
            } catch (err) {
                console.error('Auth init error:', err)
                if (isMountedRef.current) setIsLoading(false)
            }
        }

        initAuth()

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, sess) => {
                if (!isMountedRef.current) return

                if (event === 'SIGNED_OUT') {
                    setSession(null)
                    setUser(null)
                    setProfile(null)
                    return
                }

                if (sess?.user) {
                    setSession(sess)
                    setUser(sess.user)

                    if (event === 'SIGNED_IN') {
                        const p = await fetchProfile(sess.user.id)
                        if (isMountedRef.current) setProfile(p)
                    }
                }
            }
        )

        return () => {
            isMountedRef.current = false
            subscription.unsubscribe()
        }
    }, [fetchProfile])

    const signIn = async (email: string, password: string) => {
        setIsLoading(true)
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) {
            console.error('Sign in error:', error.message)
            setIsLoading(false)
            return { error }
        }

        const signedInProfile = data.user
            ? await fetchProfile(data.user.id, data.session?.access_token)
            : null

        if (!isExplicitlyActiveProfile(signedInProfile)) {
            await supabase.auth.signOut({ scope: 'local' })
            if (isMountedRef.current) {
                setUser(null)
                setSession(null)
                setProfile(null)
            }
            setIsLoading(false)
            return { error: new InactiveAccountError() }
        }

        setIsLoading(false)
        return { error: null }
    }

    const signOut = async () => {
        // Sign out from all tabs/sessions — prevents post-logout platform redirect bug
        await supabase.auth.signOut({ scope: 'global' })
        // Clear any stale Supabase auth tokens from localStorage
        Object.keys(localStorage)
            .filter((key) => key.startsWith('sb-'))
            .forEach((key) => localStorage.removeItem(key))
        setUser(null)
        setSession(null)
        setProfile(null)
    }

    return (
        <AuthContext.Provider value={{
            user,
            session,
            profile,
            isLoading,
            isAuthenticated: !!user && profile?.is_active === true,
            signIn,
            signOut,
            refreshProfile,
        }}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const context = useContext(AuthContext)
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider')
    }
    return context
}
