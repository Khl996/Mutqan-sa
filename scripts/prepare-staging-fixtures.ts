import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

type EnvMap = Record<string, string>
type UpsertPayload = Record<string, unknown> | Array<Record<string, unknown>>
type UserFixture = {
    envKey: string
    email: string
    name: string
    nameAr: string
    role: string
    tenantId: string | null
    superAdmin?: boolean
}

const ids = {
    tenantA: '11111111-1111-4111-8111-111111111111',
    tenantB: '22222222-2222-4222-8222-222222222222',
    plan: '33333333-3333-4333-8333-333333333333',
    buildingA: '44444444-4444-4444-8444-444444444441',
    buildingB: '44444444-4444-4444-8444-444444444442',
    assetA: '55555555-5555-4555-8555-555555555551',
    assetB: '55555555-5555-4555-8555-555555555552',
    inventoryA: '66666666-6666-4666-8666-666666666661',
    inventoryB: '66666666-6666-4666-8666-666666666662',
    subscriptionA: '77777777-7777-4777-8777-777777777771',
    subscriptionB: '77777777-7777-4777-8777-777777777772',
    invoiceA: '88888888-8888-4888-8888-888888888881',
    invoiceB: '88888888-8888-4888-8888-888888888882',
    jobPlanA: '99999999-9999-4999-8999-999999999991',
    jobPlanB: '99999999-9999-4999-8999-999999999992',
    scheduleA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    scheduleB: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
    assignedWo: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
    unassignedWo: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    tenantBWo: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3',
    notificationA: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
    notificationB: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
}

const users: UserFixture[] = [
    ['RLS_PLATFORM_ADMIN_JWT', 'fixture.platform.admin@mutqan.test', 'Fixture Platform Admin', 'مسؤول منصة اختباري', 'platform_admin', null, true],
    ['RLS_TENANT_A_ADMIN_JWT', 'fixture.tenant.a.admin@mutqan.test', 'Fixture Tenant A Admin', 'مسؤول المستأجر أ', 'tenant_admin', ids.tenantA],
    ['RLS_TENANT_A_MANAGER_JWT', 'fixture.tenant.a.manager@mutqan.test', 'Fixture Maintenance Manager', 'مدير صيانة اختباري', 'maintenance_manager', ids.tenantA],
    ['RLS_TENANT_A_SUPERVISOR_JWT', 'fixture.tenant.a.supervisor@mutqan.test', 'Fixture Supervisor', 'مشرف اختباري', 'supervisor', ids.tenantA],
    ['RLS_TENANT_A_TECHNICIAN_JWT', 'fixture.tenant.a.technician@mutqan.test', 'Fixture Technician', 'فني اختباري', 'technician', ids.tenantA],
    ['RLS_TENANT_A_REPORTER_JWT', 'fixture.tenant.a.reporter@mutqan.test', 'Fixture Reporter', 'مبلغ اختباري', 'reporter', ids.tenantA],
    ['RLS_TENANT_B_USER_JWT', 'fixture.tenant.b.user@mutqan.test', 'Fixture Tenant B User', 'مستخدم المستأجر ب', 'tenant_admin', ids.tenantB],
].map(([envKey, email, name, nameAr, role, tenantId, superAdmin]) => ({
    envKey: String(envKey),
    email: String(email),
    name: String(name),
    nameAr: String(nameAr),
    role: String(role),
    tenantId: tenantId ? String(tenantId) : null,
    superAdmin: Boolean(superAdmin),
}))

function readEnv(path: string): EnvMap {
    const map: EnvMap = {}
    try {
        for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
            const trimmed = line.trim()
            if (!trimmed || trimmed.startsWith('#') || !line.includes('=')) continue
            const [key, ...rest] = line.split('=')
            map[key.trim()] = rest.join('=').trim().replace(/^['"]|['"]$/g, '')
        }
    } catch {
        // optional
    }
    return map
}

const fileEnv = readEnv('.env.local')
const getEnv = (name: string) => process.env[name] || fileEnv[name]
const requiredEnv = (name: string) => {
    const value = getEnv(name)
    if (!value) throw new Error(`Missing ${name}`)
    return value
}

const supabaseUrl = requiredEnv('VITE_SUPABASE_URL')
const anonKey = requiredEnv('VITE_SUPABASE_ANON_KEY')
const serviceKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
const fixturePassword = process.env.MUTQAN_FIXTURE_PASSWORD || `Mutqan-${randomUUID()}-Fixture!`

const service = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
const anon = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })

function missingColumn(message: string) {
    return (
        message.match(/Could not find the '([^']+)' column/)?.[1] ||
        message.match(/column "([^"]+)" of relation "[^"]+" does not exist/)?.[1] ||
        null
    )
}

function hasColumn(payload: UpsertPayload, column: string) {
    const rows = Array.isArray(payload) ? payload : [payload]
    return rows.some(row => Object.prototype.hasOwnProperty.call(row, column))
}

function dropColumn(payload: UpsertPayload, column: string): UpsertPayload {
    const clean = (row: Record<string, unknown>) =>
        Object.fromEntries(Object.entries(row).filter(([key]) => key !== column))

    return Array.isArray(payload) ? payload.map(clean) : clean(payload)
}

async function upsertOne(table: string, payload: Record<string, unknown>, onConflict?: string) {
    let currentPayload = payload
    const droppedColumns: string[] = []

    for (let attempt = 0; attempt < 12; attempt += 1) {
        const { error } = await service.from(table).upsert(currentPayload, onConflict ? { onConflict } : undefined)
        if (!error) {
            if (droppedColumns.length > 0) {
                console.warn(`${table}: skipped missing staging columns: ${droppedColumns.join(', ')}`)
            }
            return
        }

        const column = missingColumn(error.message)
        if (!column || !hasColumn(currentPayload, column)) {
            throw new Error(`${table}: ${error.message}`)
        }

        droppedColumns.push(column)
        currentPayload = dropColumn(currentPayload, column)
    }

    throw new Error(`${table}: too many missing-column retries`)
}

async function upsert(table: string, payload: UpsertPayload, onConflict?: string) {
    const rows = Array.isArray(payload) ? payload : [payload]
    for (const row of rows) await upsertOne(table, row, onConflict)
}

async function findAuthUser(email: string) {
    for (let page = 1; page < 20; page += 1) {
        const { data, error } = await service.auth.admin.listUsers({ page, perPage: 1000 })
        if (error) throw error
        const found = data.users.find(user => user.email?.toLowerCase() === email.toLowerCase())
        if (found || data.users.length < 1000) return found || null
    }
    return null
}

async function ensureUser(user: UserFixture) {
    const metadata = { full_name: user.name, full_name_ar: user.nameAr, role: user.role, tenant_id: user.tenantId }
    const existing = await findAuthUser(user.email)
    if (existing) {
        const { data, error } = await service.auth.admin.updateUserById(existing.id, {
            password: fixturePassword,
            email_confirm: true,
            user_metadata: metadata,
        })
        if (error || !data.user) throw error || new Error(`Missing user ${user.email}`)
        return data.user.id
    }

    const { data, error } = await service.auth.admin.createUser({
        email: user.email,
        password: fixturePassword,
        email_confirm: true,
        user_metadata: metadata,
    })
    if (error || !data.user) throw error || new Error(`Missing user ${user.email}`)
    return data.user.id
}

async function token(email: string) {
    const { data, error } = await anon.auth.signInWithPassword({ email, password: fixturePassword })
    if (error || !data.session?.access_token) throw error || new Error(`No token for ${email}`)
    return data.session.access_token
}

async function main() {
    const userIds = new Map<string, string>()
    for (const user of users) userIds.set(user.email, await ensureUser(user))

    const admin = userIds.get('fixture.tenant.a.admin@mutqan.test')!
    const manager = userIds.get('fixture.tenant.a.manager@mutqan.test')!
    const supervisor = userIds.get('fixture.tenant.a.supervisor@mutqan.test')!
    const technician = userIds.get('fixture.tenant.a.technician@mutqan.test')!
    const reporter = userIds.get('fixture.tenant.a.reporter@mutqan.test')!
    const tenantBUser = userIds.get('fixture.tenant.b.user@mutqan.test')!

    await upsert('subscription_plans', {
        id: ids.plan, code: 'fixture-professional', name: 'Fixture Professional',
        name_ar: 'باقة احترافية اختبارية', price_monthly: 10, price_yearly: 100,
        max_users: 50, max_buildings: 10, max_assets: 500, max_work_orders_monthly: 500,
        features: ['reports', 'inventory', 'maintenance'], is_active: true, is_default: false,
        trial_days: 14, display_order: 999,
    }, 'code')

    await upsert('tenants', [
        { id: ids.tenantA, name: 'Mutqan Fixture Tenant A', name_ar: 'مستأجر متقن الاختباري أ', slug: 'mutqan-fixture-tenant-a', subscription_status: 'active', subscription_tier: 'fixture-professional', plan_id: ids.plan, billing_cycle: 'yearly', subscription_starts_at: new Date().toISOString(), subscription_ends_at: new Date(Date.now() + 31536000000).toISOString(), max_users: 50, max_assets: 500, max_work_orders_per_month: 500, enabled_modules: { work_orders: true, assets: true, inventory: true, reports: true, maintenance: true, billing: true }, email: 'fixture-a@mutqan.test', is_active: true },
        { id: ids.tenantB, name: 'Mutqan Fixture Tenant B', name_ar: 'مستأجر متقن الاختباري ب', slug: 'mutqan-fixture-tenant-b', subscription_status: 'active', subscription_tier: 'fixture-professional', plan_id: ids.plan, billing_cycle: 'yearly', subscription_starts_at: new Date().toISOString(), subscription_ends_at: new Date(Date.now() + 31536000000).toISOString(), max_users: 20, max_assets: 100, max_work_orders_per_month: 100, enabled_modules: { work_orders: true, assets: true, inventory: true, reports: true, maintenance: true, billing: true }, email: 'fixture-b@mutqan.test', is_active: true },
    ], 'slug')

    await upsert('profiles', users.map(user => ({
        id: userIds.get(user.email), tenant_id: user.tenantId, full_name: user.name,
        full_name_ar: user.nameAr, email: user.email, role: user.role,
        is_super_admin: Boolean(user.superAdmin), is_active: true,
    })))

    await upsert('buildings', [
        { id: ids.buildingA, tenant_id: ids.tenantA, code: 'FX-A-BLDG-01', name: 'Fixture A Main Building', name_ar: 'المبنى الرئيسي أ', address: 'Fixture A', is_active: true },
        { id: ids.buildingB, tenant_id: ids.tenantB, code: 'FX-B-BLDG-01', name: 'Fixture B Main Building', name_ar: 'المبنى الرئيسي ب', address: 'Fixture B', is_active: true },
    ])
    await upsert('assets', [
        { id: ids.assetA, tenant_id: ids.tenantA, code: 'FX-A-AHU-01', name: 'Fixture A AHU', name_ar: 'وحدة مناولة هواء أ', category: 'hvac', type: 'ahu', status: 'operational', criticality: 'critical', building_id: ids.buildingA, purchase_cost: 25000, current_value: 18000, created_by: admin, asset_level: 'equipment' },
        { id: ids.assetB, tenant_id: ids.tenantB, code: 'FX-B-PUMP-01', name: 'Fixture B Pump', name_ar: 'مضخة ب', category: 'mechanical', type: 'pump', status: 'operational', criticality: 'high', building_id: ids.buildingB, purchase_cost: 12000, current_value: 9000, created_by: tenantBUser, asset_level: 'equipment' },
    ])
    await upsert('inventory_items', [
        { id: ids.inventoryA, tenant_id: ids.tenantA, code: 'FX-A-FILTER-01', name: 'Fixture Air Filter', name_ar: 'فلتر هواء اختباري', quantity: 3, min_quantity: 5, max_quantity: 40, unit_of_measure: 'pcs', location: 'Fixture Store A', unit_cost: 75, is_active: true, created_by: admin },
        { id: ids.inventoryB, tenant_id: ids.tenantB, code: 'FX-B-SEAL-01', name: 'Fixture Pump Seal', name_ar: 'جلدة مضخة اختبارية', quantity: 10, min_quantity: 2, max_quantity: 30, unit_of_measure: 'pcs', location: 'Fixture Store B', unit_cost: 45, is_active: true, created_by: tenantBUser },
    ])
    await upsert('tenant_subscriptions', [
        { id: ids.subscriptionA, tenant_id: ids.tenantA, plan_id: ids.plan, status: 'active', billing_cycle: 'yearly', current_period_start: new Date().toISOString(), current_period_end: new Date(Date.now() + 31536000000).toISOString(), amount: 100, activated_by: 'admin' },
        { id: ids.subscriptionB, tenant_id: ids.tenantB, plan_id: ids.plan, status: 'active', billing_cycle: 'yearly', current_period_start: new Date().toISOString(), current_period_end: new Date(Date.now() + 31536000000).toISOString(), amount: 100, activated_by: 'admin' },
    ])
    await upsert('billing_invoices', [
        { id: ids.invoiceA, invoice_number: 'FX-A-0001', tenant_id: ids.tenantA, subscription_id: ids.subscriptionA, subtotal: 100, tax_rate: 0, tax_amount: 0, total: 100, status: 'paid', payment_method: 'manual', payment_reference: 'fixture-a-paid', paid_at: new Date().toISOString(), billing_period_start: new Date().toISOString().slice(0, 10), billing_period_end: new Date(Date.now() + 31536000000).toISOString().slice(0, 10), created_by: admin },
        { id: ids.invoiceB, invoice_number: 'FX-B-0001', tenant_id: ids.tenantB, subscription_id: ids.subscriptionB, subtotal: 100, tax_rate: 0, tax_amount: 0, total: 100, status: 'paid', payment_method: 'manual', payment_reference: 'fixture-b-paid', paid_at: new Date().toISOString(), billing_period_start: new Date().toISOString().slice(0, 10), billing_period_end: new Date(Date.now() + 31536000000).toISOString().slice(0, 10), created_by: tenantBUser },
    ], 'invoice_number')

    await upsert('job_plans', [
        { id: ids.jobPlanA, tenant_id: ids.tenantA, code: 'FX-A-JP-01', name: 'Fixture AHU Monthly PM', name_ar: 'خطة وقائية شهرية لوحدة الهواء', category: 'hvac', status: 'active', estimated_duration_minutes: 45, requires_safety_checks: true, created_by: manager },
        { id: ids.jobPlanB, tenant_id: ids.tenantB, code: 'FX-B-JP-01', name: 'Fixture Pump Monthly PM', name_ar: 'خطة وقائية شهرية للمضخة', category: 'mechanical', status: 'active', estimated_duration_minutes: 30, requires_safety_checks: true, created_by: tenantBUser },
    ])
    await upsert('pm_schedules', [
        { id: ids.scheduleA, tenant_id: ids.tenantA, code: 'FX-A-PM-01', name: 'Fixture AHU PM Schedule', name_ar: 'جدول صيانة وقائية لوحدة الهواء', job_plan_id: ids.jobPlanA, primary_asset_id: ids.assetA, trigger_type: 'calendar', frequency_type: 'monthly', frequency_interval: 1, start_date: new Date().toISOString().slice(0, 10), next_due_date: new Date(Date.now() + 604800000).toISOString().slice(0, 10), default_assignee_id: technician, default_priority: 'medium', status: 'active', created_by: manager, generation_mode: 'per_asset' },
        { id: ids.scheduleB, tenant_id: ids.tenantB, code: 'FX-B-PM-01', name: 'Fixture Pump PM Schedule', name_ar: 'جدول صيانة وقائية للمضخة', job_plan_id: ids.jobPlanB, primary_asset_id: ids.assetB, trigger_type: 'calendar', frequency_type: 'monthly', frequency_interval: 1, start_date: new Date().toISOString().slice(0, 10), next_due_date: new Date(Date.now() + 604800000).toISOString().slice(0, 10), default_priority: 'medium', status: 'active', created_by: tenantBUser, generation_mode: 'per_asset' },
    ])
    await upsert('work_orders', [
        { id: ids.assignedWo, tenant_id: ids.tenantA, code: 'FX-A-WO-ASSIGNED', title: 'Fixture assigned work order', description: 'Disposable WO assigned to fixture technician', issue_type: 'preventive_maintenance', status: 'assigned', priority: 'medium', reported_by: reporter, assigned_to: technician, created_by: manager, building_id: ids.buildingA, asset_id: ids.assetA, due_date: new Date(Date.now() + 172800000).toISOString(), estimated_cost: 250, actual_cost: 0, work_type: 'preventive', source_schedule_id: ids.scheduleA, job_plan_id: ids.jobPlanA, scheduled_date: new Date().toISOString().slice(0, 10), compliance_deadline: new Date(Date.now() + 172800000).toISOString().slice(0, 10) },
        { id: ids.unassignedWo, tenant_id: ids.tenantA, code: 'FX-A-WO-UNASSIGNED', title: 'Fixture unassigned-to-technician work order', description: 'Disposable WO assigned to supervisor, not technician', issue_type: 'corrective_maintenance', status: 'assigned', priority: 'medium', reported_by: reporter, assigned_to: supervisor, created_by: manager, building_id: ids.buildingA, asset_id: ids.assetA, due_date: new Date(Date.now() + 172800000).toISOString(), estimated_cost: 150, actual_cost: 0, work_type: 'corrective' },
        { id: ids.tenantBWo, tenant_id: ids.tenantB, code: 'FX-B-WO-01', title: 'Fixture tenant B work order', description: 'Tenant B isolation row', issue_type: 'inspection', status: 'assigned', priority: 'medium', reported_by: tenantBUser, assigned_to: tenantBUser, created_by: tenantBUser, building_id: ids.buildingB, asset_id: ids.assetB, due_date: new Date(Date.now() + 172800000).toISOString(), estimated_cost: 100, actual_cost: 0, work_type: 'preventive', source_schedule_id: ids.scheduleB, job_plan_id: ids.jobPlanB },
    ], 'tenant_id,code')
    await upsert('notifications', [
        { id: ids.notificationA, tenant_id: ids.tenantA, user_id: technician, title: 'Fixture assignment', message: 'Fixture work order assigned', type: 'work_order', link: `/work-orders/${ids.assignedWo}`, metadata: { fixture: true }, is_read: false },
        { id: ids.notificationB, tenant_id: ids.tenantB, user_id: tenantBUser, title: 'Fixture tenant B', message: 'Tenant B isolation notification', type: 'info', metadata: { fixture: true }, is_read: false },
    ])

    const lines = [
        '# Generated by scripts/prepare-staging-fixtures.ts',
        '# Do not commit this file.',
        `RLS_TENANT_A_ID=${ids.tenantA}`,
        `RLS_TENANT_B_ID=${ids.tenantB}`,
        'RLS_ALLOW_MUTATION_TESTS=1',
        `RLS_TECHNICIAN_ASSIGNED_WO_ID=${ids.assignedWo}`,
        `RLS_TECHNICIAN_UNASSIGNED_WO_ID=${ids.unassignedWo}`,
        `MUTQAN_FIXTURE_PLAN_ID=${ids.plan}`,
    ]

    for (const user of users) {
        const accessToken = await token(user.email)
        lines.push(`${user.envKey}=${accessToken}`)
        if (user.envKey === 'RLS_TENANT_A_ADMIN_JWT') lines.push(`PAYMENT_TEST_USER_JWT=${accessToken}`)
    }

    writeFileSync('.env.staging-fixtures.local', `${lines.join('\n')}\n`, 'utf8')
    console.log('Prepared staging fixtures and wrote .env.staging-fixtures.local')
}

main().catch(error => {
    console.error(error)
    process.exit(1)
})
