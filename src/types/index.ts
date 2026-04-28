import type { WorkOrderStatus } from '@/config/workOrderStatus'

// Common Types
export interface BaseEntity {
    id: string
    created_at: string
    updated_at: string
}

// User & Auth Types
export interface User extends BaseEntity {
    email: string
    full_name: string | null
    full_name_ar: string | null
    avatar_url: string | null
    role: UserRole
    is_super_admin: boolean
    is_active: boolean
    tenant_id: string | null
}

export type UserRole =
    | 'platform_owner'
    | 'platform_admin'
    | 'platform_support'
    | 'platform_finance'
    | 'platform_hr'
    | 'tenant_admin'
    | 'facility_manager'
    | 'maintenance_manager'
    | 'engineer'
    | 'supervisor'
    | 'technician'
    | 'reporter'

// Tenant Types
export interface Tenant extends BaseEntity {
    name: string
    name_ar: string | null
    slug: string
    subscription_status: SubscriptionStatus
    plan_id: string | null
    logo_url: string | null
    primary_color: string | null
    secondary_color: string | null
    enabled_modules: ModuleConfig[]
}

export type SubscriptionStatus =
    | 'trial'
    | 'active'
    | 'suspended'
    | 'cancelled'
    | 'expired'

export interface ModuleConfig {
    code: string
    enabled: boolean
    price: number
    features: FeatureConfig[]
}

export interface FeatureConfig {
    code: string
    enabled: boolean
    price: number
}

// Facility Types
export interface Building extends BaseEntity {
    code: string
    name: string
    name_ar: string | null
    description: string | null
    tenant_id: string
}

export interface Floor extends BaseEntity {
    code: string
    name: string
    name_ar: string | null
    level: number
    building_id: string
}

export interface Department extends BaseEntity {
    code: string
    name: string
    name_ar: string | null
    floor_id: string
}

export interface Room extends BaseEntity {
    code: string
    name: string
    name_ar: string | null
    department_id: string
}

// Asset Types
export interface Asset extends BaseEntity {
    code: string
    name: string
    name_ar: string | null
    category: string
    subcategory: string | null
    type: string | null
    status: AssetStatus
    criticality: Criticality
    model: string | null
    serial_number: string | null
    manufacturer: string | null
    purchase_date: string | null
    purchase_cost: number | null
    warranty_expiry: string | null
    qr_code: string | null
    tenant_id: string
    building_id: string | null
    floor_id: string | null
    department_id: string | null
    room_id: string | null
    parent_asset_id: string | null
}

export type AssetStatus =
    | 'operational'
    | 'under_maintenance'
    | 'out_of_service'
    | 'retired'
    | 'pending_installation'

export type Criticality = 'low' | 'medium' | 'high' | 'critical'

// Work Order Types
export interface WorkOrder extends BaseEntity {
    code: string
    title: string
    description: string | null
    issue_type: string
    status: WorkOrderStatus
    priority: Priority
    reported_by: string
    assigned_to: string | null
    assigned_team: string | null
    asset_id: string | null
    tenant_id: string
    building_id: string | null
    floor_id: string | null
    department_id: string | null
    room_id: string | null
    reported_at: string
    start_time: string | null
    end_time: string | null
    completed_at: string | null
    cancelled_at?: string | null
    cancellation_reason?: string | null
}

// Re-export from canonical source
export type { WorkOrderStatus } from '@/config/workOrderStatus'

export type Priority = 'low' | 'medium' | 'high' | 'urgent'

// Team Types
export interface Team extends BaseEntity {
    code: string
    name: string
    name_ar: string | null
    type: TeamType
    status: 'active' | 'inactive' | 'archived'
    tenant_id: string
}

export type TeamType =
    | 'maintenance'
    | 'engineering'
    | 'operations'
    | 'support'
    | 'custom'

export interface TeamMember extends BaseEntity {
    team_id: string
    user_id: string
    role: 'leader' | 'member' | 'supervisor'
    specializations: string[]
}

// Inventory Types
export interface InventoryItem extends BaseEntity {
    code: string
    name: string
    name_ar: string | null
    category: string
    subcategory: string | null
    unit_of_measure: string
    current_stock: number
    min_stock: number
    max_stock: number | null
    reorder_point: number | null
    unit_cost: number
    tenant_id: string
}

// Navigation Types
export interface NavItem {
    title: string
    href: string
    icon: string
    badge?: number
    children?: NavItem[]
    permissions?: string[]
    module?: string
}

// API Response Types
export interface ApiResponse<T> {
    data: T | null
    error: string | null
    status: number
}

export interface PaginatedResponse<T> {
    data: T[]
    total: number
    page: number
    pageSize: number
    totalPages: number
}
