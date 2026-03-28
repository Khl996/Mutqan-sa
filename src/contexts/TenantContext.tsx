import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { isPlatformRole } from '@/config/roles'

// Tenant Type
export interface Tenant {
    id: string
    code: string
    name: string
    name_ar: string | null
    logo_url: string | null
    is_active: boolean
    subscription_tier: string | null
    subscription_status: string | null
    subscription_ends_at: string | null
    trial_ends_at: string | null
    settings: Record<string, unknown> | null
}

// Context Type
interface TenantContextType {
    currentTenant: Tenant | null
    isLoading: boolean
    isPlatformUser: boolean  // Platform owner/admin
    canAccessTenant: (tenantId: string) => boolean
    switchTenant: (tenantId: string) => Promise<void>
    clearTenant: () => void  // Return to platform mode
    accessibleTenants: Tenant[] // For platform admins who can access multiple tenants
    refreshTenant: () => Promise<void>
}

const TenantContext = createContext<TenantContextType | undefined>(undefined)

export function TenantProvider({ children }: { children: ReactNode }) {
    const { profile, isAuthenticated } = useAuth()
    const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null)
    const [accessibleTenants, setAccessibleTenants] = useState<Tenant[]>([])
    const [isLoading, setIsLoading] = useState(true)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profileData = profile as any

    // Check if user is a platform-level user using centralized role check
    const isPlatformUser = isPlatformRole(profileData?.role) || profileData?.is_super_admin

    const fetchTenants = useCallback(async () => {
        if (!isAuthenticated || !profile) {
            setCurrentTenant(null)
            setAccessibleTenants([])
            setIsLoading(false)
            return
        }

        setIsLoading(true)

        try {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

            const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`
            const storedSession = localStorage.getItem(storageKey)
            let token = null

            if (storedSession) {
                try {
                    token = JSON.parse(storedSession).access_token
                } catch { /* ignore */ }
            }

            if (!token) {
                setIsLoading(false)
                return
            }

            const headers = {
                'apikey': supabaseAnonKey,
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }

            if (isPlatformUser) {
                const response = await fetch(`${supabaseUrl}/rest/v1/tenants?select=*&order=name.asc`, { headers })

                if (response.ok) {
                    const data = await response.json()
                    setAccessibleTenants(data || [])

                    const lastTenantId = localStorage.getItem('currentTenantId')
                    if (lastTenantId && data) {
                        const lastTenant = data.find((tenant: Tenant) => tenant.id === lastTenantId)
                        if (lastTenant) {
                            setCurrentTenant(lastTenant)
                        }
                    }
                } else {
                    console.error('Error fetching tenants:', response.status)
                }
            } else if (profileData?.tenant_id) {
                const response = await fetch(`${supabaseUrl}/rest/v1/tenants?id=eq.${profileData.tenant_id}&select=*`, { headers })

                if (response.ok) {
                    const data = await response.json()
                    if (data && data.length > 0) {
                        setCurrentTenant(data[0])
                        setAccessibleTenants([data[0]])
                    }
                }
            }
        } catch (e) {
            console.error('Exception fetching tenants:', e)
        } finally {
            setIsLoading(false)
        }
    }, [isAuthenticated, profile, profileData?.tenant_id, isPlatformUser])

    // Fetch tenant data
    useEffect(() => {
        fetchTenants()
    }, [fetchTenants])

    // Check if user can access a specific tenant
    const canAccessTenant = (tenantId: string): boolean => {
        if (isPlatformUser) return true
        return profileData?.tenant_id === tenantId
    }

    // Switch to a different tenant (only for platform users)
    const switchTenant = async (tenantId: string): Promise<void> => {
        if (!isPlatformUser) {
            console.warn('Only platform users can switch tenants')
            return
        }

        const tenant = accessibleTenants.find(t => t.id === tenantId)
        if (tenant) {
            setCurrentTenant(tenant)
            localStorage.setItem('currentTenantId', tenantId)
        }
    }

    // Clear current tenant and return to platform mode (only for platform users)
    const clearTenant = (): void => {
        if (!isPlatformUser) {
            console.warn('Only platform users can clear tenant')
            return
        }
        setCurrentTenant(null)
        localStorage.removeItem('currentTenantId')
    }

    return (
        <TenantContext.Provider value={{
            currentTenant,
            isLoading,
            isPlatformUser,
            canAccessTenant,
            switchTenant,
            clearTenant,
            accessibleTenants,
            refreshTenant: fetchTenants,
        }}>
            {children}
        </TenantContext.Provider>
    )
}

export function useTenant() {
    const context = useContext(TenantContext)
    if (!context) {
        throw new Error('useTenant must be used within TenantProvider')
    }
    return context
}

// Helper hook to get current tenant ID for queries
export function useCurrentTenantId(): string | null {
    const { currentTenant } = useTenant()
    return currentTenant?.id || null
}
