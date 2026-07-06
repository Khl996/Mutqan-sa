import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

type PlatformManagedRole =
    | 'platform_admin'
    | 'platform_support'
    | 'platform_finance'
    | 'platform_hr'
type TenantManagedRole =
    | 'tenant_admin'
    | 'facility_manager'
    | 'maintenance_manager'
    | 'supervisor'
    | 'technician'
    | 'engineer'
    | 'reporter'
type ManagedRole = PlatformManagedRole | TenantManagedRole

type Operation = 'upsert' | 'revoke'
// The platform admin route works across a broad set of tables/RPC-era shapes
// that are not represented in the generated Supabase client types here.
// Keep the service client untyped so Vercel type checks do not narrow tables to never.
type UntypedSupabaseClient = any

const PLATFORM_MANAGED_ROLES = new Set<PlatformManagedRole>([
    'platform_admin',
    'platform_support',
    'platform_finance',
    'platform_hr',
])

const TENANT_MANAGED_ROLES = new Set<TenantManagedRole>([
    'tenant_admin',
    'facility_manager',
    'maintenance_manager',
    'supervisor',
    'technician',
    'engineer',
    'reporter',
])

const MANAGED_ROLES = new Set<ManagedRole>([
    ...PLATFORM_MANAGED_ROLES,
    ...TENANT_MANAGED_ROLES,
])

function isPlatformRole(role: string | null | undefined): boolean {
    return !!role && role.startsWith('platform_')
}

function isPlatformManagedRole(role: string): role is PlatformManagedRole {
    return PLATFORM_MANAGED_ROLES.has(role as PlatformManagedRole)
}

function isTenantManagedRole(role: string): role is TenantManagedRole {
    return TENANT_MANAGED_ROLES.has(role as TenantManagedRole)
}

function canAssignRole(
    caller: { role: string; tenant_id: string | null },
    targetRole: string,
    tenantId: string | null,
): boolean {
    if (caller.role === 'platform_owner') {
        return targetRole !== 'platform_owner' && MANAGED_ROLES.has(targetRole as ManagedRole)
    }

    if (caller.role === 'platform_admin') {
        return isTenantManagedRole(targetRole) || ['platform_support', 'platform_finance', 'platform_hr'].includes(targetRole)
    }

    if (caller.role === 'platform_hr') {
        return tenantId === null && ['platform_support', 'platform_finance', 'platform_hr'].includes(targetRole)
    }

    if (caller.role === 'tenant_admin') {
        return !!tenantId && tenantId === caller.tenant_id && isTenantManagedRole(targetRole)
    }

    return false
}

function canRevokeRole(
    caller: { role: string; tenant_id: string | null },
    target: { role: string; tenant_id: string | null },
): boolean {
    if (target.role === 'platform_owner') {
        return false
    }

    if (isTenantManagedRole(target.role)) {
        return canAssignRole(caller, target.role, target.tenant_id)
    }

    return canAssignRole(caller, target.role, null)
}

async function sleep(ms: number) {
    await new Promise(resolve => setTimeout(resolve, ms))
}

async function ensureProfileExists(
    adminSupabase: UntypedSupabaseClient,
    userId: string,
    email: string,
    fullName: string,
) {
    for (let attempt = 0; attempt < 8; attempt++) {
        const { data } = await adminSupabase
            .from('profiles')
            .select('id')
            .eq('id', userId)
            .maybeSingle()

        if (data?.id) {
            return
        }

        await sleep(250)
    }

    const { error } = await adminSupabase
        .from('profiles')
        .upsert({
            id: userId,
            email,
            full_name: fullName,
            full_name_ar: fullName,
            role: 'user',
            is_active: true,
            updated_at: new Date().toISOString(),
        })

    if (error) {
        throw new Error(`Failed to provision profile row: ${error.message}`)
    }
}

async function findProfileByIdentifier(
    adminSupabase: UntypedSupabaseClient,
    { userId, email }: { userId?: string | null; email?: string | null },
) {
    if (userId) {
        const { data, error } = await adminSupabase
            .from('profiles')
            .select('id, email, full_name, role, tenant_id, is_active')
            .eq('id', userId)
            .maybeSingle()

        if (error && error.code !== 'PGRST116') {
            throw new Error(error.message)
        }

        return data
    }

    if (!email) {
        return null
    }

    const { data, error } = await adminSupabase
        .from('profiles')
        .select('id, email, full_name, role, tenant_id, is_active')
        .ilike('email', email)
        .maybeSingle()

    if (error && error.code !== 'PGRST116') {
        throw new Error(error.message)
    }

    return data
}

async function insertAuditLog(
    adminSupabase: UntypedSupabaseClient,
    input: {
        actorId: string
        actorEmail: string | null
        action: string
        actionType: string
        targetId: string
        targetName: string
        oldValues?: Record<string, unknown> | null
        newValues?: Record<string, unknown> | null
        metadata?: Record<string, unknown>
    },
) {
    await adminSupabase
        .from('platform_audit_logs')
        .insert({
            user_id: input.actorId,
            user_email: input.actorEmail,
            action: input.action,
            action_type: input.actionType,
            target_type: 'profile',
            target_id: input.targetId,
            target_name: input.targetName,
            old_values: input.oldValues ?? null,
            new_values: input.newValues ?? null,
            metadata: input.metadata ?? {},
            success: true,
        })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_KEY) {
        return res.status(500).json({ error: 'Server configuration error' })
    }

    try {
        const authHeader = req.headers.authorization
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authentication required' })
        }

        const {
            operation = 'upsert',
            userId: requestedUserId = null,
            email,
            password,
            fullName,
            role,
            tenantId = null,
            status = 'active',
            department,
            jobTitle,
        } = req.body ?? {}

        const resolvedOperation = operation === 'revoke' ? 'revoke' : 'upsert'
        const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
        const requestedRole = typeof role === 'string' ? role.trim() : ''

        const callerToken = authHeader.replace('Bearer ', '')
        const userSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: `Bearer ${callerToken}` } },
            auth: { autoRefreshToken: false, persistSession: false },
        }) as UntypedSupabaseClient

        const adminSupabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
            auth: { autoRefreshToken: false, persistSession: false },
        }) as UntypedSupabaseClient

        const { data: authData, error: authError } = await userSupabase.auth.getUser()
        if (authError || !authData.user) {
            return res.status(401).json({ error: 'Invalid or expired token' })
        }

        const { data: callerProfile, error: callerProfileError } = await userSupabase
            .from('profiles')
            .select('id, role, tenant_id')
            .eq('id', authData.user.id)
            .maybeSingle()

        if (callerProfileError || !callerProfile) {
            return res.status(403).json({ error: 'Caller profile not found' })
        }

        if (resolvedOperation === 'revoke') {
            const existingProfile = await findProfileByIdentifier(adminSupabase, {
                userId: requestedUserId,
                email: normalizedEmail || null,
            })

            if (!existingProfile) {
                return res.status(404).json({ error: 'Managed user not found' })
            }

            if (existingProfile.role === 'platform_owner') {
                return res.status(403).json({ error: 'Platform owner accounts cannot be modified through this route' })
            }

            if (!MANAGED_ROLES.has(existingProfile.role as ManagedRole)) {
                return res.status(400).json({ error: 'This account is not currently assigned as a managed role' })
            }

            if (!canRevokeRole(callerProfile, existingProfile)) {
                return res.status(403).json({ error: 'You are not allowed to revoke this managed role' })
            }

            const { error: revokeError } = await adminSupabase
                .from('profiles')
                .update({
                    role: 'user',
                    tenant_id: null,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', existingProfile.id)

            if (revokeError) {
                return res.status(500).json({ error: revokeError.message })
            }

            await insertAuditLog(adminSupabase, {
                actorId: authData.user.id,
                actorEmail: authData.user.email ?? null,
                action: 'Revoked managed user role',
                actionType: 'update',
                targetId: existingProfile.id,
                targetName: existingProfile.email,
                oldValues: {
                    role: existingProfile.role,
                    tenant_id: existingProfile.tenant_id,
                },
                newValues: {
                    role: 'user',
                    tenant_id: null,
                },
                metadata: {
                    operation: 'revoke',
                    managed_via: 'api/admin-manage-user',
                },
            })

            return res.status(200).json({
                userId: existingProfile.id,
                email: existingProfile.email,
                role: 'user',
                tenantId: null,
                status: existingProfile.is_active === false ? 'inactive' : 'active',
            })
        }

        if (!requestedRole || !MANAGED_ROLES.has(requestedRole as ManagedRole)) {
            return res.status(400).json({ error: 'Invalid role' })
        }

        if (!canAssignRole(callerProfile, requestedRole, tenantId)) {
            return res.status(403).json({ error: 'You are not allowed to assign this role' })
        }

        if (!requestedUserId && !normalizedEmail) {
            return res.status(400).json({ error: 'Email is required' })
        }

        if (isTenantManagedRole(requestedRole) && !tenantId) {
            return res.status(400).json({ error: 'tenantId is required for tenant-scoped roles' })
        }

        if (isPlatformManagedRole(requestedRole) && tenantId) {
            return res.status(400).json({ error: 'tenantId is not allowed for platform roles' })
        }

        if (callerProfile.role === 'tenant_admin' && tenantId !== callerProfile.tenant_id) {
            return res.status(403).json({ error: 'You can only manage users inside your own tenant' })
        }

        if (tenantId) {
            const { data: tenant, error: tenantError } = await adminSupabase
                .from('tenants')
                .select('id')
                .eq('id', tenantId)
                .maybeSingle()

            if (tenantError || !tenant) {
                return res.status(400).json({ error: 'Target tenant not found' })
            }
        }

        const existingProfile = await findProfileByIdentifier(adminSupabase, {
            userId: requestedUserId,
            email: normalizedEmail || null,
        })

        let userId = existingProfile?.id ?? null
        let created = false
        let resolvedEmail = existingProfile?.email ?? normalizedEmail
        const resolvedName = typeof fullName === 'string' && fullName.trim().length > 0
            ? fullName.trim()
            : (existingProfile?.full_name || resolvedEmail.split('@')[0])

        if (existingProfile) {
            if (existingProfile.role === 'platform_owner') {
                return res.status(403).json({ error: 'Platform owner accounts cannot be modified through this route' })
            }

            if (normalizedEmail && existingProfile.email.toLowerCase() !== normalizedEmail) {
                return res.status(400).json({ error: 'Changing the email address of an existing managed account is not supported here' })
            }

            if (isTenantManagedRole(requestedRole)) {
                if (isPlatformRole(existingProfile.role)) {
                    return res.status(409).json({ error: 'Platform staff accounts cannot be reassigned as tenant users directly' })
                }

                if (existingProfile.tenant_id && existingProfile.tenant_id !== tenantId) {
                    return res.status(409).json({ error: 'This user already belongs to another tenant' })
                }
            } else if (existingProfile.tenant_id) {
                return res.status(409).json({ error: 'Tenant-bound accounts cannot be promoted to platform staff directly' })
            }

            const { data: existingAuthUser, error: existingAuthUserError } = await adminSupabase.auth.admin.getUserById(existingProfile.id)
            if (existingAuthUserError || !existingAuthUser.user) {
                return res.status(409).json({ error: 'User account is out of sync with auth records. Fix the account before reassigning it.' })
            }
        } else {
            if (!normalizedEmail) {
                return res.status(400).json({ error: 'Email is required for new users' })
            }

            if (typeof password !== 'string' || password.length < 10) {
                return res.status(400).json({ error: 'A password with at least 10 characters is required for new users' })
            }

            const { data: createdUserData, error: createUserError } = await adminSupabase.auth.admin.createUser({
                email: normalizedEmail,
                password,
                email_confirm: true,
                user_metadata: {
                    full_name: resolvedName,
                    full_name_ar: resolvedName,
                },
            })

            if (createUserError || !createdUserData.user) {
                return res.status(400).json({ error: createUserError?.message || 'Failed to create user' })
            }

            userId = createdUserData.user.id
            resolvedEmail = normalizedEmail
            created = true

            await ensureProfileExists(adminSupabase, userId, resolvedEmail, resolvedName)
        }

        if (!userId) {
            return res.status(500).json({ error: 'Unable to resolve target user' })
        }

        const isActive = status !== 'inactive'
        const targetTenantId = isTenantManagedRole(requestedRole) ? tenantId : null
        const profileUpdates: Record<string, unknown> = {
            email: resolvedEmail,
            full_name: resolvedName,
            full_name_ar: resolvedName,
            role: requestedRole,
            tenant_id: targetTenantId,
            is_active: isActive,
            updated_at: new Date().toISOString(),
        }

        if (department !== undefined) {
            profileUpdates.department = typeof department === 'string' && department.trim().length > 0
                ? department.trim()
                : null
        }

        if (jobTitle !== undefined) {
            profileUpdates.job_title = typeof jobTitle === 'string' && jobTitle.trim().length > 0
                ? jobTitle.trim()
                : null
        }

        const { error: updateProfileError } = await adminSupabase
            .from('profiles')
            .update(profileUpdates)
            .eq('id', userId)

        if (updateProfileError) {
            return res.status(500).json({ error: updateProfileError.message })
        }

        await insertAuditLog(adminSupabase, {
            actorId: authData.user.id,
            actorEmail: authData.user.email ?? null,
            action: created ? 'Created managed user account' : 'Updated managed user account',
            actionType: created ? 'create' : 'update',
            targetId: userId,
            targetName: resolvedEmail,
            oldValues: existingProfile
                ? {
                    role: existingProfile.role,
                    tenant_id: existingProfile.tenant_id,
                    is_active: existingProfile.is_active,
                }
                : null,
            newValues: {
                role: requestedRole,
                tenant_id: targetTenantId,
                is_active: isActive,
            },
            metadata: {
                created,
                operation: 'upsert',
                managed_via: 'api/admin-manage-user',
            },
        })

        return res.status(created ? 201 : 200).json({
            userId,
            email: resolvedEmail,
            created,
            role: requestedRole,
            tenantId: targetTenantId,
            status: isActive ? 'active' : 'inactive',
        })
    } catch (error: any) {
        console.error('admin-manage-user error:', error)
        return res.status(500).json({ error: error?.message || 'Internal server error' })
    }
}
