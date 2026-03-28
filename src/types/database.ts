// Database types - will be generated from Supabase later
// For now, using placeholder types

export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[]

export interface Database {
    public: {
        Tables: {
            profiles: {
                Row: {
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
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id: string
                    tenant_id?: string | null
                    full_name?: string | null
                    full_name_ar?: string | null
                    email?: string | null
                    phone?: string | null
                    avatar_url?: string | null
                    role?: string
                    is_super_admin?: boolean
                    is_active?: boolean
                    last_activity_at?: string | null
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    tenant_id?: string | null
                    full_name?: string | null
                    full_name_ar?: string | null
                    email?: string | null
                    phone?: string | null
                    avatar_url?: string | null
                    role?: string
                    is_super_admin?: boolean
                    is_active?: boolean
                    last_activity_at?: string | null
                    created_at?: string
                    updated_at?: string
                }
            }
            tenants: {
                Row: {
                    id: string
                    name: string
                    name_ar: string | null
                    slug: string
                    is_active: boolean
                    subscription_status: string
                    subscription_tier: string | null
                    plan_id: string | null
                    billing_cycle: string | null
                    trial_ends_at: string | null
                    subscription_ends_at: string | null
                    cr_number: string | null
                    tax_number: string | null
                    address: string | null
                    country: string | null
                    city: string | null
                    postal_code: string | null
                    phone: string | null
                    email: string | null
                    website: string | null
                    logo_url: string | null
                    primary_color: string | null
                    secondary_color: string | null
                    enabled_modules: Json
                    created_at: string
                    updated_at: string
                }
                Insert: {
                    id?: string
                    name: string
                    name_ar?: string | null
                    slug: string
                    is_active?: boolean
                    plan_id?: string | null
                    subscription_status?: string
                    subscription_tier?: string | null
                    billing_cycle?: string | null
                    trial_ends_at?: string | null
                    subscription_ends_at?: string | null
                    cr_number?: string | null
                    tax_number?: string | null
                    address?: string | null
                    country?: string | null
                    city?: string | null
                    postal_code?: string | null
                    phone?: string | null
                    email?: string | null
                    website?: string | null
                    logo_url?: string | null
                    primary_color?: string | null
                    secondary_color?: string | null
                    enabled_modules?: Json
                    created_at?: string
                    updated_at?: string
                }
                Update: {
                    id?: string
                    name?: string
                    name_ar?: string | null
                    slug?: string
                    is_active?: boolean
                    subscription_status?: string
                    subscription_tier?: string | null
                    plan_id?: string | null
                    billing_cycle?: string | null
                    trial_ends_at?: string | null
                    subscription_ends_at?: string | null
                    logo_url?: string | null
                    primary_color?: string | null
                    secondary_color?: string | null
                    enabled_modules?: Json
                    created_at?: string
                    updated_at?: string
                }
            }
            // Add more tables as needed
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            complete_pending_registration: {
                Args: {
                    p_draft?: Json | null
                }
                Returns: Json
            }
            register_new_tenant: {
                Args: {
                    p_name_ar: string
                    p_name_en: string
                    p_email: string
                    p_address: string
                    p_cr_number: string
                    p_tax_number: string
                    p_first_name: string
                    p_last_name: string
                    p_phone?: string | null
                    p_country?: string | null
                    p_city?: string | null
                    p_postal_code?: string | null
                    p_website?: string | null
                }
                Returns: Json
            }
        }
        Enums: {
            [_ in never]: never
        }
    }
}
