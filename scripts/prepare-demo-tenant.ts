import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

type EnvMap = Record<string, string>
type DemoMode = 'plan' | 'verify' | 'write-foundation' | 'write-workorders'
type DomainStatus = 'PASS' | 'MISSING' | 'WARN'
type SupabaseService = ReturnType<typeof createClient>
type UpsertPayload = Record<string, unknown> | Array<Record<string, unknown>>

type DomainResult = {
    domain: string
    required: number
    found: number
    missing: string[]
    warnings: string[]
}

type TenantRow = {
    id: string
    slug: string
    name: string
    subscription_status: string | null
    is_active: boolean | null
}

const APPROVED_PROJECT_REF = 'mzpohntjotgeeaukwnbz'
const APPROVED_SUPABASE_HOST = `${APPROVED_PROJECT_REF}.supabase.co`
const WRITE_FOUNDATION_CONFIRMATION = 'NOURA_GARDENS_FOUNDATION'
const WRITE_WORKORDERS_CONFIRMATION = 'NOURA_GARDENS_WORKORDERS'

const demoIds = {
    plan: 'd0000000-0000-4000-8000-000000000001',
    tenant: 'd0000000-0000-4000-8000-000000000010',
    subscription: 'd0000000-0000-4000-8000-000000000011',
    team: 'd0000000-0000-4000-8000-000000000020',
    palmTower: 'd0000000-0000-4000-8000-000000000101',
    serviceBlock: 'd0000000-0000-4000-8000-000000000102',
    floor03: 'd0000000-0000-4000-8000-000000000111',
    serviceGround: 'd0000000-0000-4000-8000-000000000112',
    zoneA: 'd0000000-0000-4000-8000-000000000121',
    unit305: 'd0000000-0000-4000-8000-000000000131',
    mech3a: 'd0000000-0000-4000-8000-000000000132',
    ahu3a: 'd0000000-0000-4000-8000-000000000201',
    fcu305: 'd0000000-0000-4000-8000-000000000202',
    pump01: 'd0000000-0000-4000-8000-000000000203',
    gen01: 'd0000000-0000-4000-8000-000000000204',
    lightingLobby: 'd0000000-0000-4000-8000-000000000205',
    filter: 'd0000000-0000-4000-8000-000000000301',
    belt: 'd0000000-0000-4000-8000-000000000302',
    floatSwitch: 'd0000000-0000-4000-8000-000000000303',
    ledLamp: 'd0000000-0000-4000-8000-000000000304',
    jobPlanAhuMonthly: 'd0000000-0000-4000-8000-000000000401',
    jpItemSafety: 'd0000000-0000-4000-8000-000000000411',
    jpItemFilter: 'd0000000-0000-4000-8000-000000000412',
    jpItemCoil: 'd0000000-0000-4000-8000-000000000413',
    jpItemBelt: 'd0000000-0000-4000-8000-000000000414',
    jpItemSupplyTemp: 'd0000000-0000-4000-8000-000000000415',
    pmScheduleAhuMonthly: 'd0000000-0000-4000-8000-000000000501',
    pmScheduleAhuAsset: 'd0000000-0000-4000-8000-000000000511',
    // Phase 3: work orders (deterministic IDs for service-role seeded backup states)
    woPending001: 'd0000000-0000-4000-8000-000000001001',
    woAssigned001: 'd0000000-0000-4000-8000-000000001002',
    woInprog001: 'd0000000-0000-4000-8000-000000001003',
    woSup001: 'd0000000-0000-4000-8000-000000001004',
    woEng001: 'd0000000-0000-4000-8000-000000001005',
    woReporter001: 'd0000000-0000-4000-8000-000000001006',
    woComplete001: 'd0000000-0000-4000-8000-000000001007',
    woCancel001: 'd0000000-0000-4000-8000-000000001008',
    woPm001: 'd0000000-0000-4000-8000-000000001009',
} as const

const demoEnabledModules = {
    dashboard: { enabled: true, features: { quick_stats: true, charts: true, recent_activity: true } },
    facilities: { enabled: true, features: { buildings: true, floors: true, departments: true, rooms: true } },
    assets: {
        enabled: true,
        features: { asset_tracking: true, qr_codes: true, asset_history: true, warranty_tracking: true },
    },
    work_orders: {
        enabled: true,
        features: { create_wo: true, workflow: true, assignment: true, parts_tracking: true },
    },
    maintenance: { enabled: true, features: { maintenance_plans: true, schedules: true, auto_generation: true } },
    inventory: { enabled: true, features: { stock_tracking: true, low_stock_alerts: true, consumption_reports: true } },
    employees: { enabled: true, features: { user_management: true, role_assignment: true } },
    work_teams: { enabled: true, features: { team_creation: true, member_assignment: true } },
    reports: { enabled: true, features: { operational_reports: true, export: true } },
    public_portal: { enabled: false, features: { public_submission: false, qr_portal: false } },
}

const demoManifest = {
    tenant: {
        slug: 'noura-gardens-demo',
        name: 'Noura Gardens Compound Demo',
        sector: 'Residential compound and facility management',
    },
    personas: [
        {
            email: 'demo.admin@noura-gardens.mutqan.test',
            role: 'tenant_admin',
            name: 'Noura Gardens Admin',
            jobTitle: 'Tenant Administrator',
            teamRole: null,
        },
        {
            email: 'demo.manager@noura-gardens.mutqan.test',
            role: 'maintenance_manager',
            name: 'Sara Al-Noura',
            jobTitle: 'Maintenance Manager',
            teamRole: null,
        },
        {
            email: 'demo.supervisor@noura-gardens.mutqan.test',
            role: 'supervisor',
            name: 'Omar Supervisor',
            jobTitle: 'HVAC Supervisor',
            teamRole: 'supervisor',
        },
        {
            email: 'demo.engineer@noura-gardens.mutqan.test',
            role: 'engineer',
            name: 'Lina Engineer',
            jobTitle: 'Facilities Engineer',
            teamRole: 'member',
        },
        {
            email: 'demo.technician@noura-gardens.mutqan.test',
            role: 'technician',
            name: 'Fahad Technician',
            jobTitle: 'HVAC Technician',
            teamRole: 'member',
        },
        {
            email: 'demo.reporter@noura-gardens.mutqan.test',
            role: 'reporter',
            name: 'Unit 305 Resident',
            jobTitle: 'Resident Reporter',
            teamRole: null,
        },
    ],
    team: {
        code: 'DEMO-HVAC-TEAM',
        name: 'HVAC Response Team',
        memberEmails: [
            'demo.technician@noura-gardens.mutqan.test',
            'demo.engineer@noura-gardens.mutqan.test',
            'demo.supervisor@noura-gardens.mutqan.test',
        ],
    },
    locations: [
        { table: 'buildings', code: 'DEMO-PALM-TOWER', name: 'Palm Tower' },
        { table: 'floors', code: 'DEMO-FLOOR-03', name: 'Floor 3' },
        { table: 'departments', code: 'DEMO-ZONE-A', name: 'Residential Zone A' },
        { table: 'rooms', code: 'DEMO-UNIT-305', name: 'Unit 305' },
        { table: 'rooms', code: 'DEMO-MECH-3A', name: 'Mechanical Room 3A' },
        { table: 'buildings', code: 'DEMO-SERVICE-BLOCK', name: 'Service Block' },
        { table: 'floors', code: 'DEMO-SERVICE-G', name: 'Ground Service Level' },
    ],
    assets: [
        { code: 'DEMO-AHU-3A', name: 'AHU-3A, Palm Tower Floor 3' },
        { code: 'DEMO-FCU-305', name: 'FCU, Unit 305' },
        { code: 'DEMO-PUMP-01', name: 'Booster Pump 01' },
        { code: 'DEMO-GEN-01', name: 'Standby Generator 01' },
        { code: 'DEMO-LTG-LOBBY', name: 'Lobby Lighting Circuit' },
    ],
    inventory: [
        { code: 'DEMO-FILTER-AHU-20X24', name: 'AHU Filter 20x24' },
        { code: 'DEMO-BELT-SPA-1250', name: 'AHU Drive Belt SPA-1250' },
        { code: 'DEMO-FLOAT-SWITCH', name: 'Condensate Float Switch' },
        { code: 'DEMO-LAMP-LED-18W', name: 'LED Lamp 18W' },
    ],
    workOrders: [
        { code: 'DEMO-WO-PENDING-001', statuses: ['pending'] },
        { code: 'DEMO-WO-ASSIGNED-001', statuses: ['assigned'] },
        { code: 'DEMO-WO-INPROG-001', statuses: ['in_progress'] },
        { code: 'DEMO-WO-SUP-001', statuses: ['pending_supervisor_approval'] },
        { code: 'DEMO-WO-ENG-001', statuses: ['pending_engineer_review'] },
        { code: 'DEMO-WO-REPORTER-001', statuses: ['pending_reporter_closure'] },
        { code: 'DEMO-WO-COMPLETE-001', statuses: ['completed'] },
        { code: 'DEMO-WO-CANCEL-001', statuses: ['cancelled'] },
        { code: 'DEMO-WO-PM-001', statuses: ['pending', 'completed'] },
    ],
    pm: [
        { table: 'job_plans', code: 'DEMO-JP-AHU-MONTHLY' },
        { table: 'job_plan_items', code: 'Safety isolation confirmed' },
        { table: 'job_plan_items', code: 'Filter condition' },
        { table: 'job_plan_items', code: 'Coil cleanliness' },
        { table: 'job_plan_items', code: 'Belt condition' },
        { table: 'job_plan_items', code: 'Supply air temperature' },
        { table: 'pm_schedules', code: 'DEMO-PM-AHU-3A-MONTHLY' },
        { table: 'pm_schedule_assets', code: 'DEMO-PM-AHU-3A-MONTHLY:DEMO-AHU-3A' },
    ],
} as const

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
        // Optional local env file.
    }
    return map
}

const fileEnv = readEnv('.env.local')

function getEnv(name: string) {
    return process.env[name] || fileEnv[name]
}

function requiredEnv(name: string, aliases: string[] = []) {
    const value = [name, ...aliases].map(getEnv).find(Boolean)
    if (!value) {
        throw new Error(`Missing required env var: ${[name, ...aliases].join(' or ')}`)
    }
    return value
}

function getMode(): DemoMode {
    const mode = getEnv('DEMO_SEED_MODE') || 'plan'
    if (mode === 'plan' || mode === 'verify' || mode === 'write-foundation' || mode === 'write-workorders') return mode
    throw new Error('Unsupported DEMO_SEED_MODE. Use plan, verify, write-foundation, or write-workorders.')
}

function assertApprovedStagingUrl(rawUrl: string) {
    if (getEnv('DEMO_SEED_ALLOWED') !== 'true') {
        throw new Error('Refusing to run. Set DEMO_SEED_ALLOWED=true for the approved staging/demo project.')
    }

    const parsed = new URL(rawUrl)
    if (parsed.hostname !== APPROVED_SUPABASE_HOST) {
        throw new Error(
            `Refusing to run. Supabase host must be ${APPROVED_SUPABASE_HOST}; received ${parsed.hostname}.`,
        )
    }
}

function createReadOnlyServiceClient(supabaseUrl: string) {
    const serviceKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
    return createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    })
}

function assertWriteFoundationConfirmation() {
    if (getEnv('DEMO_SEED_CONFIRM') !== WRITE_FOUNDATION_CONFIRMATION) {
        throw new Error(
            `Refusing to write. Set DEMO_SEED_CONFIRM=${WRITE_FOUNDATION_CONFIRMATION} for write-foundation mode.`,
        )
    }
}

function assertWriteWorkordersConfirmation() {
    if (getEnv('DEMO_SEED_CONFIRM') !== WRITE_WORKORDERS_CONFIRMATION) {
        throw new Error(
            `Refusing to write. Set DEMO_SEED_CONFIRM=${WRITE_WORKORDERS_CONFIRMATION} for write-workorders mode.`,
        )
    }
}

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

async function insertOne(service: SupabaseService, table: string, payload: Record<string, unknown>) {
    let currentPayload = payload
    const droppedColumns: string[] = []

    for (let attempt = 0; attempt < 12; attempt += 1) {
        const { error } = await service.from(table).insert(currentPayload)
        if (!error) {
            if (droppedColumns.length > 0) {
                console.warn(`${table}: skipped missing staging columns: ${droppedColumns.join(', ')}`)
            }
            return
        }

        const column = missingColumn(error.message)
        if (!column || !hasColumn(currentPayload, column)) {
            throw new Error(`${table} insert failed: ${error.message}`)
        }

        droppedColumns.push(column)
        currentPayload = dropColumn(currentPayload, column) as Record<string, unknown>
    }

    throw new Error(`${table}: too many missing-column retries`)
}

async function updateById(service: SupabaseService, table: string, id: string, payload: Record<string, unknown>) {
    let currentPayload = Object.fromEntries(Object.entries(payload).filter(([key]) => key !== 'id'))
    const droppedColumns: string[] = []

    for (let attempt = 0; attempt < 12; attempt += 1) {
        const { error } = await service.from(table).update(currentPayload).eq('id', id)
        if (!error) {
            if (droppedColumns.length > 0) {
                console.warn(`${table}: skipped missing staging columns: ${droppedColumns.join(', ')}`)
            }
            return
        }

        const column = missingColumn(error.message)
        if (!column || !hasColumn(currentPayload, column)) {
            throw new Error(`${table} update failed: ${error.message}`)
        }

        droppedColumns.push(column)
        currentPayload = dropColumn(currentPayload, column) as Record<string, unknown>
    }

    throw new Error(`${table}: too many missing-column retries`)
}

async function upsertOne(service: SupabaseService, table: string, payload: Record<string, unknown>, onConflict?: string) {
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
            throw new Error(`${table} upsert failed: ${error.message}`)
        }

        droppedColumns.push(column)
        currentPayload = dropColumn(currentPayload, column) as Record<string, unknown>
    }

    throw new Error(`${table}: too many missing-column retries`)
}

async function ensureSingleByMatch(
    service: SupabaseService,
    table: string,
    match: Record<string, unknown>,
    payload: Record<string, unknown>,
    label: string,
) {
    let query = service.from(table).select('id')
    for (const [column, value] of Object.entries(match)) {
        query = query.eq(column, value as string | number | boolean)
    }

    const { data, error } = await query
    if (error) throw new Error(`${table} lookup failed for ${label}: ${error.message}`)

    const rows = (data || []) as Array<{ id: string }>
    if (rows.length > 1) {
        throw new Error(`${table} has ${rows.length} rows for ${label}; refusing ambiguous write.`)
    }

    if (rows.length === 1) {
        await updateById(service, table, rows[0].id, payload)
        return rows[0].id
    }

    await insertOne(service, table, payload)
    const id = payload.id
    if (typeof id !== 'string') {
        throw new Error(`${table} inserted for ${label}, but payload did not include a deterministic id.`)
    }
    return id
}

async function findAuthUser(service: SupabaseService, email: string) {
    for (let page = 1; page < 20; page += 1) {
        const { data, error } = await service.auth.admin.listUsers({ page, perPage: 1000 })
        if (error) throw error
        const found = data.users.find(user => user.email?.toLowerCase() === email.toLowerCase())
        if (found || data.users.length < 1000) return found || null
    }
    return null
}

function statusFor(result: DomainResult): DomainStatus {
    if (result.missing.length > 0) return 'MISSING'
    if (result.warnings.length > 0) return 'WARN'
    return 'PASS'
}

function formatStatus(status: DomainStatus) {
    return status.padEnd(7)
}

function newResult(domain: string, required: number): DomainResult {
    return { domain, required, found: 0, missing: [], warnings: [] }
}

function requireTenant(result: DomainResult, tenant: TenantRow | null, label: string) {
    if (!tenant) {
        result.warnings.push(label)
        return false
    }
    return true
}

async function getDemoTenant(service: ReturnType<typeof createClient>): Promise<TenantRow | null> {
    const { data, error } = await service
        .from('tenants')
        .select('id, slug, name, subscription_status, is_active')
        .eq('slug', demoManifest.tenant.slug)
        .maybeSingle()

    if (error) throw new Error(`tenants read failed: ${error.message}`)
    return data as TenantRow | null
}

async function verifyTenant(service: ReturnType<typeof createClient>) {
    const result = newResult('Tenant', 1)
    const tenant = await getDemoTenant(service)

    if (!tenant) {
        result.missing.push(`${demoManifest.tenant.slug} (${demoManifest.tenant.name})`)
        return { tenant, result }
    }

    result.found = 1

    if (tenant.name !== demoManifest.tenant.name) {
        result.warnings.push(
            `${demoManifest.tenant.slug} name is "${tenant.name}", expected "${demoManifest.tenant.name}".`,
        )
    }

    if (tenant.is_active === false) {
        result.warnings.push(`${demoManifest.tenant.slug} exists but is not active.`)
    }

    return { tenant, result }
}

async function verifyPersonas(service: ReturnType<typeof createClient>, tenant: TenantRow | null) {
    const result = newResult('Personas', demoManifest.personas.length)
    if (!requireTenant(result, tenant, 'Skipped because demo tenant is missing.')) {
        result.missing.push(...demoManifest.personas.map(persona => persona.email))
        return result
    }

    const emails = demoManifest.personas.map(persona => persona.email)
    const { data, error } = await service
        .from('profiles')
        .select('id, tenant_id, email, role, is_active')
        .in('email', emails)

    if (error) throw new Error(`profiles read failed: ${error.message}`)

    const rows = (data || []) as Array<{
        tenant_id: string | null
        email: string | null
        role: string | null
        is_active: boolean | null
    }>

    for (const expected of demoManifest.personas) {
        const matchingRows = rows.filter(row => row.email?.toLowerCase() === expected.email.toLowerCase())
        const profile = matchingRows.find(row => row.tenant_id === tenant!.id)

        if (!profile) {
            result.missing.push(expected.email)
            if (matchingRows.length > 0) {
                result.warnings.push(`${expected.email} exists, but not under tenant ${demoManifest.tenant.slug}.`)
            }
            continue
        }

        result.found += 1

        if (profile.role !== expected.role) {
            result.warnings.push(`${expected.email} role is "${profile.role}", expected "${expected.role}".`)
        }

        if (profile.is_active === false) {
            result.warnings.push(`${expected.email} exists but is inactive.`)
        }
    }

    return result
}

async function verifyLocations(service: ReturnType<typeof createClient>, tenant: TenantRow | null) {
    const result = newResult('Locations', demoManifest.locations.length)
    if (!requireTenant(result, tenant, 'Skipped because demo tenant is missing.')) {
        result.missing.push(...demoManifest.locations.map(location => `${location.table}:${location.code}`))
        return result
    }

    const buildingCodes = demoManifest.locations
        .filter(location => location.table === 'buildings')
        .map(location => location.code)
    const floorCodes = demoManifest.locations
        .filter(location => location.table === 'floors')
        .map(location => location.code)
    const departmentCodes = demoManifest.locations
        .filter(location => location.table === 'departments')
        .map(location => location.code)
    const roomCodes = demoManifest.locations
        .filter(location => location.table === 'rooms')
        .map(location => location.code)

    const found = new Set<string>()

    const { data: allTenantBuildings, error: allBuildingsError } = await service
        .from('buildings')
        .select('id, code')
        .eq('tenant_id', tenant!.id)
    if (allBuildingsError) throw new Error(`buildings read failed: ${allBuildingsError.message}`)

    for (const building of (allTenantBuildings || []) as Array<{ id: string; code: string | null }>) {
        if (buildingCodes.includes(building.code || '')) found.add(`buildings:${building.code}`)
    }

    const buildingIds = ((allTenantBuildings || []) as Array<{ id: string }>).map(building => building.id)
    if (buildingIds.length > 0 && floorCodes.length > 0) {
        const { data: floors, error: floorsError } = await service
            .from('floors')
            .select('id, code, building_id')
            .in('building_id', buildingIds)
            .in('code', floorCodes)
        if (floorsError) throw new Error(`floors read failed: ${floorsError.message}`)

        for (const floor of (floors || []) as Array<{ code: string | null }>) {
            if (floor.code) found.add(`floors:${floor.code}`)
        }
    }

    if (departmentCodes.length > 0) {
        const { data: departments, error: departmentsError } = await service
            .from('departments')
            .select('id, code')
            .eq('tenant_id', tenant!.id)
            .in('code', departmentCodes)
        if (departmentsError) throw new Error(`departments read failed: ${departmentsError.message}`)

        for (const department of (departments || []) as Array<{ code: string | null }>) {
            if (department.code) found.add(`departments:${department.code}`)
        }
    }

    if (roomCodes.length > 0) {
        const { data: rooms, error: roomsError } = await service
            .from('rooms')
            .select('id, code')
            .eq('tenant_id', tenant!.id)
            .in('code', roomCodes)
        if (roomsError) throw new Error(`rooms read failed: ${roomsError.message}`)

        for (const room of (rooms || []) as Array<{ code: string | null }>) {
            if (room.code) found.add(`rooms:${room.code}`)
        }
    }

    for (const expected of demoManifest.locations) {
        const key = `${expected.table}:${expected.code}`
        if (found.has(key)) result.found += 1
        else result.missing.push(key)
    }

    return result
}

async function verifyTenantCodeTable(
    service: ReturnType<typeof createClient>,
    tenant: TenantRow | null,
    domain: string,
    table: string,
    codes: readonly string[],
    select = 'id, code',
) {
    const result = newResult(domain, codes.length)
    if (!requireTenant(result, tenant, 'Skipped because demo tenant is missing.')) {
        result.missing.push(...codes)
        return { result, rows: [] as Array<Record<string, unknown>> }
    }

    const { data, error } = await service
        .from(table)
        .select(select)
        .eq('tenant_id', tenant!.id)
        .in('code', [...codes])

    if (error) throw new Error(`${table} read failed: ${error.message}`)

    const rows = (data || []) as Array<Record<string, unknown>>
    const foundCodes = new Set(rows.map(row => String(row.code)))

    for (const code of codes) {
        if (foundCodes.has(code)) result.found += 1
        else result.missing.push(code)
    }

    return { result, rows }
}

async function verifyWorkOrders(service: ReturnType<typeof createClient>, tenant: TenantRow | null) {
    const codes = demoManifest.workOrders.map(workOrder => workOrder.code)
    const { result, rows } = await verifyTenantCodeTable(
        service,
        tenant,
        'Work orders',
        'work_orders',
        codes,
        'id, code, status, due_date, completed_at, work_type, source_schedule_id, sla_resolution_met, estimated_cost, actual_cost, asset_id, cancellation_reason',
    )

    const byCode = new Map(rows.map(row => [String(row.code), row]))
    for (const expected of demoManifest.workOrders) {
        const row = byCode.get(expected.code)
        if (!row) continue

        const status = String(row.status)
        if (!expected.statuses.includes(status)) {
            result.warnings.push(
                `${expected.code} status is "${status}", expected ${expected.statuses.join(' or ')}.`,
            )
        }
    }

    if (rows.length > 0 && tenant) {
        const workOrderIds = rows.map(row => String(row.id))

        // Check operation logs exist for each work order
        const { data: logCounts, error: logError } = await service
            .from('operation_logs')
            .select('work_order_id')
            .in('work_order_id', workOrderIds)
        if (logError) throw new Error(`operation_logs verify failed: ${logError.message}`)

        const woIdsWithLogs = new Set(((logCounts || []) as Array<{ work_order_id: string | null }>).map(l => l.work_order_id))
        const missingLogs = workOrderIds.filter(id => !woIdsWithLogs.has(id))
        const missingLogCodes = rows.filter(row => missingLogs.includes(String(row.id))).map(row => String(row.code))
        if (missingLogCodes.length > 0) {
            result.warnings.push(`Work orders missing operation logs: ${missingLogCodes.join(', ')}`)
        }

        // Check at least one completed WO for DEMO-AHU-3A
        const completedAhu = rows.some(row => row.status === 'completed' && row.asset_id != null)
        if (!completedAhu) {
            result.warnings.push('No completed demo work order found linked to an asset (expected DEMO-WO-COMPLETE-001 on AHU-3A).')
        }

        // Check at least one cancelled WO with cancellation_reason
        const cancelledWithReason = rows.some(row => row.status === 'cancelled' && row.cancellation_reason)
        if (!cancelledWithReason) {
            result.warnings.push('No cancelled demo work order found with a cancellation_reason (expected DEMO-WO-CANCEL-001).')
        }

        // Check at least one PM-typed work order
        const hasPmWo = rows.some(row => row.work_type === 'preventive' || row.source_schedule_id)
        if (!hasPmWo) {
            result.warnings.push('No preventive or PM-linked demo work order found (expected DEMO-WO-PM-001).')
        }

        // Check at least one pm_generate operation log exists for PM work order
        const pmWo = rows.find(row => row.work_type === 'preventive' || row.source_schedule_id)
        if (pmWo) {
            const { data: pmLogs, error: pmLogError } = await service
                .from('operation_logs')
                .select('id')
                .eq('work_order_id', String(pmWo.id))
                .eq('type', 'pm_generate')
                .limit(1)
            if (pmLogError) throw new Error(`pm_generate log verify failed: ${pmLogError.message}`)
            if (!pmLogs || pmLogs.length === 0) {
                result.warnings.push(`PM work order ${String(pmWo.code)} has no pm_generate operation log.`)
            }
        }
    }

    return { result, rows }
}

async function verifyTeam(service: ReturnType<typeof createClient>, tenant: TenantRow | null) {
    const result = newResult('Team', 1 + demoManifest.team.memberEmails.length)
    if (!requireTenant(result, tenant, 'Skipped because demo tenant is missing.')) {
        result.missing.push(`teams:${demoManifest.team.code}`)
        result.missing.push(...demoManifest.team.memberEmails.map(email => `team_members:${email}`))
        return result
    }

    const { data: team, error: teamError } = await service
        .from('teams')
        .select('id, code, status')
        .eq('tenant_id', tenant!.id)
        .eq('code', demoManifest.team.code)
        .maybeSingle()
    if (teamError) throw new Error(`teams read failed: ${teamError.message}`)

    if (!team) {
        result.missing.push(`teams:${demoManifest.team.code}`)
        result.missing.push(...demoManifest.team.memberEmails.map(email => `team_members:${email}`))
        return result
    }

    result.found += 1
    if ((team as { status?: string | null }).status !== 'active') {
        result.warnings.push(`teams:${demoManifest.team.code} status is not active.`)
    }

    const { data: profiles, error: profilesError } = await service
        .from('profiles')
        .select('id, email')
        .eq('tenant_id', tenant!.id)
        .in('email', demoManifest.team.memberEmails)
    if (profilesError) throw new Error(`team profile read failed: ${profilesError.message}`)

    const profilesByEmail = new Map(
        ((profiles || []) as Array<{ id: string; email: string | null }>).map(profile => [
            profile.email?.toLowerCase() || '',
            profile.id,
        ]),
    )
    const profileIds = [...profilesByEmail.values()]

    const memberUserIds = new Set<string>()
    if (profileIds.length > 0) {
        const { data: members, error: membersError } = await service
            .from('team_members')
            .select('user_id, is_active')
            .eq('team_id', (team as { id: string }).id)
            .in('user_id', profileIds)
        if (membersError) throw new Error(`team_members read failed: ${membersError.message}`)

        for (const member of (members || []) as Array<{ user_id: string | null; is_active: boolean | null }>) {
            if (member.user_id) memberUserIds.add(member.user_id)
            if (member.is_active === false && member.user_id) {
                result.warnings.push(`team_members:${member.user_id} exists but is inactive.`)
            }
        }
    }

    for (const email of demoManifest.team.memberEmails) {
        const userId = profilesByEmail.get(email.toLowerCase())
        if (userId && memberUserIds.has(userId)) result.found += 1
        else result.missing.push(`team_members:${email}`)
    }

    return result
}

async function verifyPm(service: ReturnType<typeof createClient>, tenant: TenantRow | null) {
    const result = newResult('PM', demoManifest.pm.length)
    if (!requireTenant(result, tenant, 'Skipped because demo tenant is missing.')) {
        result.missing.push(...demoManifest.pm.map(record => `${record.table}:${record.code}`))
        return result
    }

    for (const table of ['job_plans', 'pm_schedules'] as const) {
        const expectedCodes = demoManifest.pm
            .filter(record => record.table === table)
            .map(record => record.code)

        const { data, error } = await service
            .from(table)
            .select('id, code, status')
            .eq('tenant_id', tenant!.id)
            .in('code', expectedCodes)

        if (error) throw new Error(`${table} read failed: ${error.message}`)

        const rows = (data || []) as Array<{ code: string | null; status: string | null }>
        const foundCodes = new Set(rows.map(row => row.code).filter(Boolean))

        for (const code of expectedCodes) {
            if (foundCodes.has(code)) result.found += 1
            else result.missing.push(`${table}:${code}`)
        }

        for (const row of rows) {
            if (row.status && row.status !== 'active') {
                result.warnings.push(`${table}:${row.code} status is "${row.status}", expected "active".`)
            }
        }
    }

    const { data: jobPlan, error: jobPlanError } = await service
        .from('job_plans')
        .select('id')
        .eq('tenant_id', tenant!.id)
        .eq('code', 'DEMO-JP-AHU-MONTHLY')
        .maybeSingle()
    if (jobPlanError) throw new Error(`job_plans detail read failed: ${jobPlanError.message}`)

    if (jobPlan) {
        const expectedLabels = demoManifest.pm
            .filter(record => record.table === 'job_plan_items')
            .map(record => record.code)
        const { data: items, error: itemsError } = await service
            .from('job_plan_items')
            .select('label')
            .eq('job_plan_id', (jobPlan as { id: string }).id)
            .in('label', expectedLabels)
        if (itemsError) throw new Error(`job_plan_items read failed: ${itemsError.message}`)

        const foundLabels = new Set(((items || []) as Array<{ label: string | null }>).map(item => item.label))
        for (const label of expectedLabels) {
            if (foundLabels.has(label)) result.found += 1
            else result.missing.push(`job_plan_items:${label}`)
        }
    } else {
        for (const record of demoManifest.pm.filter(record => record.table === 'job_plan_items')) {
            result.missing.push(`job_plan_items:${record.code}`)
        }
    }

    const { data: schedule, error: scheduleError } = await service
        .from('pm_schedules')
        .select('id')
        .eq('tenant_id', tenant!.id)
        .eq('code', 'DEMO-PM-AHU-3A-MONTHLY')
        .maybeSingle()
    if (scheduleError) throw new Error(`pm_schedules detail read failed: ${scheduleError.message}`)

    const { data: asset, error: assetError } = await service
        .from('assets')
        .select('id')
        .eq('tenant_id', tenant!.id)
        .eq('code', 'DEMO-AHU-3A')
        .maybeSingle()
    if (assetError) throw new Error(`pm asset read failed: ${assetError.message}`)

    if (schedule && asset) {
        const { data: scheduleAsset, error: scheduleAssetError } = await service
            .from('pm_schedule_assets')
            .select('id')
            .eq('schedule_id', (schedule as { id: string }).id)
            .eq('asset_id', (asset as { id: string }).id)
            .maybeSingle()
        if (scheduleAssetError) throw new Error(`pm_schedule_assets read failed: ${scheduleAssetError.message}`)

        if (scheduleAsset) result.found += 1
        else result.missing.push('pm_schedule_assets:DEMO-PM-AHU-3A-MONTHLY:DEMO-AHU-3A')
    } else {
        result.missing.push('pm_schedule_assets:DEMO-PM-AHU-3A-MONTHLY:DEMO-AHU-3A')
    }

    return result
}

async function verifyReportSignals(
    tenant: TenantRow | null,
    inventoryRows: Array<Record<string, unknown>>,
    workOrderRows: Array<Record<string, unknown>>,
) {
    const result = newResult('Report signals', 0)
    if (!tenant) {
        result.warnings.push('Skipped because demo tenant is missing.')
        return result
    }

    const now = Date.now()
    const activeStatuses = new Set([
        'pending',
        'assigned',
        'in_progress',
        'pending_supervisor_approval',
        'pending_engineer_review',
        'pending_reporter_closure',
        'on_hold',
    ])

    const completedCount = workOrderRows.filter(row => row.status === 'completed').length
    const cancelledCount = workOrderRows.filter(row => row.status === 'cancelled').length
    const overdueOpenCount = workOrderRows.filter(row => {
        if (!activeStatuses.has(String(row.status)) || !row.due_date) return false
        return new Date(String(row.due_date)).getTime() < now
    }).length
    const pmCount = workOrderRows.filter(row => row.work_type === 'preventive' || row.source_schedule_id).length
    const slaCount = workOrderRows.filter(row => typeof row.sla_resolution_met === 'boolean').length
    const costCount = workOrderRows.filter(row => row.estimated_cost != null || row.actual_cost != null).length
    const lowStockCount = inventoryRows.filter(row => {
        const quantity = Number(row.quantity)
        const minQuantity = Number(row.min_quantity)
        return Number.isFinite(quantity) && Number.isFinite(minQuantity) && quantity <= minQuantity
    }).length

    if (completedCount === 0) result.warnings.push('No completed demo work orders found for completion reporting.')
    if (cancelledCount === 0) result.warnings.push('No cancelled demo work orders found for cancellation reporting.')
    if (overdueOpenCount === 0) result.warnings.push('No overdue open demo work orders found for overdue reporting.')
    if (pmCount === 0) result.warnings.push('No preventive/PM demo work orders found for PM reporting.')
    if (slaCount === 0) result.warnings.push('No demo work orders found with SLA resolution flags.')
    if (costCount === 0) result.warnings.push('No demo work orders found with estimated or actual costs.')
    if (lowStockCount === 0) result.warnings.push('No low-stock demo inventory items found.')

    return result
}

function printResults(results: DomainResult[]) {
    const required = results.reduce((sum, result) => sum + result.required, 0)
    const found = results.reduce((sum, result) => sum + result.found, 0)
    const missing = results.reduce((sum, result) => sum + result.missing.length, 0)
    const warnings = results.reduce((sum, result) => sum + result.warnings.length, 0)
    const overall: DomainStatus = missing > 0 ? 'MISSING' : warnings > 0 ? 'WARN' : 'PASS'

    console.log('')
    console.log(`Overall: ${overall}`)
    console.log(`Required records found: ${found}/${required}`)
    console.log(`Missing records: ${missing}`)
    console.log(`Warnings: ${warnings}`)
    console.log('')
    console.log('Domain summary:')

    for (const result of results) {
        console.log(
            `- ${formatStatus(statusFor(result))} ${result.domain}: ${result.found}/${result.required} found, ${result.missing.length} missing, ${result.warnings.length} warnings`,
        )
    }

    const missingResults = results.filter(result => result.missing.length > 0)
    if (missingResults.length > 0) {
        console.log('')
        console.log('Missing records by domain:')
        for (const result of missingResults) {
            console.log(`${result.domain}:`)
            for (const item of result.missing) console.log(`  - ${item}`)
        }
    }

    const warningResults = results.filter(result => result.warnings.length > 0)
    if (warningResults.length > 0) {
        console.log('')
        console.log('Warnings by domain:')
        for (const result of warningResults) {
            console.log(`${result.domain}:`)
            for (const item of result.warnings) console.log(`  - ${item}`)
        }
    }
}

async function runVerifyMode(supabaseUrl: string) {
    const service = createReadOnlyServiceClient(supabaseUrl)

    console.log('Demo tenant verifier: READ-ONLY VERIFY MODE')
    console.log(`Approved project ref: ${APPROVED_PROJECT_REF}`)
    console.log(`Supabase host: ${APPROVED_SUPABASE_HOST}`)
    console.log('Writes: disabled')

    const { tenant, result: tenantResult } = await verifyTenant(service)
    const personaResult = await verifyPersonas(service, tenant)
    const teamResult = await verifyTeam(service, tenant)
    const locationResult = await verifyLocations(service, tenant)
    const assetCheck = await verifyTenantCodeTable(
        service,
        tenant,
        'Assets',
        'assets',
        demoManifest.assets.map(asset => asset.code),
        'id, code, status, criticality',
    )
    const inventoryCheck = await verifyTenantCodeTable(
        service,
        tenant,
        'Inventory',
        'inventory_items',
        demoManifest.inventory.map(item => item.code),
        'id, code, quantity, min_quantity, unit_cost, is_active',
    )
    const workOrderCheck = await verifyWorkOrders(service, tenant)
    const pmResult = await verifyPm(service, tenant)
    const reportSignalResult = await verifyReportSignals(tenant, inventoryCheck.rows, workOrderCheck.rows)

    printResults([
        tenantResult,
        personaResult,
        teamResult,
        locationResult,
        assetCheck.result,
        inventoryCheck.result,
        workOrderCheck.result,
        pmResult,
        reportSignalResult,
    ])
}

async function readOnlyTenantCheck(supabaseUrl: string) {
    const service = createReadOnlyServiceClient(supabaseUrl)
    const tenant = await getDemoTenant(service)

    if (!tenant) {
        console.log(`Read-only check: tenant slug "${demoManifest.tenant.slug}" does not exist yet.`)
        return
    }

    console.log('Read-only check: demo tenant already exists:')
    console.log(JSON.stringify(tenant, null, 2))
}

async function ensureDemoAuthUser(
    service: SupabaseService,
    persona: (typeof demoManifest.personas)[number],
    tenantId: string,
    password: string,
    passwordProvided: boolean,
) {
    const metadata = {
        full_name: persona.name,
        full_name_ar: persona.name,
        role: persona.role,
        tenant_id: tenantId,
    }
    const existing = await findAuthUser(service, persona.email)

    if (existing) {
        const updatePayload = {
            email_confirm: true,
            user_metadata: metadata,
            ...(passwordProvided ? { password } : {}),
        }
        const { data, error } = await service.auth.admin.updateUserById(existing.id, updatePayload)
        if (error || !data.user) throw error || new Error(`Missing auth user ${persona.email}`)
        return { id: data.user.id, created: false, passwordSet: passwordProvided }
    }

    const { data, error } = await service.auth.admin.createUser({
        email: persona.email,
        password,
        email_confirm: true,
        user_metadata: metadata,
    })
    if (error || !data.user) throw error || new Error(`Missing auth user ${persona.email}`)
    return { id: data.user.id, created: true, passwordSet: true }
}

async function seedDemoFoundation(supabaseUrl: string) {
    assertWriteFoundationConfirmation()
    const service = createReadOnlyServiceClient(supabaseUrl)
    const now = new Date()
    const nowIso = now.toISOString()
    const oneYearFromNowIso = new Date(now.getTime() + 31536000000).toISOString()
    const today = nowIso.slice(0, 10)
    const planCode = 'demo-professional'
    const demoPassword = getEnv('DEMO_SEED_USER_PASSWORD') || `Mutqan-Demo-${randomUUID()}!`
    const passwordProvided = Boolean(getEnv('DEMO_SEED_USER_PASSWORD'))

    console.log('WARNING: WRITE-FOUNDATION MODE')
    console.log(`Target host: ${APPROVED_SUPABASE_HOST}`)
    console.log('This will insert/update foundational Noura Gardens demo records in the approved staging project.')
    console.log('Work orders, operation logs, migrations, destructive cleanup, and production data are not touched.')
    console.log('')

    const summary: string[] = []
    const note = (message: string) => {
        summary.push(message)
        console.log(`- ${message}`)
    }

    const planId = await ensureSingleByMatch(
        service,
        'subscription_plans',
        { code: planCode },
        {
            id: demoIds.plan,
            code: planCode,
            name: 'Demo Professional',
            name_ar: 'Demo Professional',
            description: 'Staging-only plan for the Noura Gardens demo tenant.',
            description_ar: 'Staging-only plan for the Noura Gardens demo tenant.',
            price_monthly: 0,
            price_yearly: 0,
            currency: 'SAR',
            max_users: 50,
            max_buildings: 10,
            max_assets: 500,
            max_work_orders_monthly: 500,
            features: [
                'dashboard',
                'facilities',
                'assets',
                'work_orders',
                'maintenance',
                'inventory',
                'employees',
                'work_teams',
                'reports',
            ],
            is_active: true,
            is_default: false,
            trial_days: 0,
            display_order: 998,
        },
        `subscription_plans:${planCode}`,
    )
    note(`Subscription plan ensured: ${planCode}`)

    const tenantId = await ensureSingleByMatch(
        service,
        'tenants',
        { slug: demoManifest.tenant.slug },
        {
            id: demoIds.tenant,
            name: demoManifest.tenant.name,
            name_ar: demoManifest.tenant.name,
            slug: demoManifest.tenant.slug,
            description: `${demoManifest.tenant.sector}. Fictional staging tenant for sales demos.`,
            subscription_status: 'active',
            subscription_tier: planCode,
            plan_id: planId,
            subscription_plan_id: planId,
            billing_cycle: 'yearly',
            subscription_starts_at: nowIso,
            subscription_ends_at: oneYearFromNowIso,
            subscription_expires_at: oneYearFromNowIso,
            trial_ends_at: oneYearFromNowIso,
            max_users: 50,
            max_buildings: 10,
            max_assets: 500,
            max_work_orders_per_month: 500,
            max_storage_mb: 5000,
            enabled_modules: demoEnabledModules,
            email: 'demo.admin@noura-gardens.mutqan.test',
            phone: '+966500000000',
            address: 'Noura Gardens Compound, Riyadh',
            country: 'Saudi Arabia',
            city: 'Riyadh',
            website: 'https://noura-gardens.example.test',
            timezone: 'Asia/Riyadh',
            language: 'en',
            currency: 'SAR',
            settings: {
                demo: true,
                sector: demoManifest.tenant.sector,
                profile: 'Residential compound and facility management',
            },
            is_active: true,
        },
        `tenants:${demoManifest.tenant.slug}`,
    )
    note(`Tenant ensured: ${demoManifest.tenant.slug}`)

    await ensureSingleByMatch(
        service,
        'tenant_subscriptions',
        { tenant_id: tenantId },
        {
            id: demoIds.subscription,
            tenant_id: tenantId,
            plan_id: planId,
            status: 'active',
            billing_cycle: 'yearly',
            current_period_start: nowIso,
            current_period_end: oneYearFromNowIso,
            trial_ends_at: oneYearFromNowIso,
            amount: 0,
            currency: 'SAR',
            activated_by: 'admin',
        },
        `tenant_subscriptions:${demoManifest.tenant.slug}`,
    )
    note('Tenant subscription ensured: active demo foundation')

    const profileIds = new Map<string, string>()
    let authCreated = 0
    let authUpdated = 0
    let authPasswordsSet = 0

    for (const persona of demoManifest.personas) {
        const authUser = await ensureDemoAuthUser(service, persona, tenantId, demoPassword, passwordProvided)
        profileIds.set(persona.email, authUser.id)
        authCreated += authUser.created ? 1 : 0
        authUpdated += authUser.created ? 0 : 1
        authPasswordsSet += authUser.passwordSet ? 1 : 0

        await ensureSingleByMatch(
            service,
            'profiles',
            { id: authUser.id },
            {
                id: authUser.id,
                tenant_id: tenantId,
                full_name: persona.name,
                full_name_ar: persona.name,
                email: persona.email,
                role: persona.role,
                is_super_admin: false,
                is_active: true,
                department: persona.role === 'reporter' ? 'Residents' : 'Facilities',
                job_title: persona.jobTitle,
                language: 'en',
                timezone: 'Asia/Riyadh',
                notification_preferences: { email: true, push: true },
            },
            `profiles:${persona.email}`,
        )
    }
    note(`Personas ensured: ${demoManifest.personas.length} profiles, ${authCreated} auth users created, ${authUpdated} auth users updated`)
    if (!passwordProvided && authCreated > 0) {
        note('Auth note: newly created users received an unprinted generated password; set DEMO_SEED_USER_PASSWORD for usable demo logins.')
    } else if (passwordProvided) {
        note(`Auth note: password was set from DEMO_SEED_USER_PASSWORD for ${authPasswordsSet} auth users without printing it.`)
    } else {
        note('Auth note: existing auth user passwords were left unchanged.')
    }

    const managerId = profileIds.get('demo.manager@noura-gardens.mutqan.test')!
    const technicianId = profileIds.get('demo.technician@noura-gardens.mutqan.test')!

    const palmTowerId = await ensureSingleByMatch(
        service,
        'buildings',
        { tenant_id: tenantId, code: 'DEMO-PALM-TOWER' },
        {
            id: demoIds.palmTower,
            tenant_id: tenantId,
            code: 'DEMO-PALM-TOWER',
            name: 'Palm Tower',
            name_ar: 'Palm Tower',
            description: 'Main residential tower for the Noura Gardens cooling story.',
            address: 'Noura Gardens Compound, Palm Tower',
            is_active: true,
        },
        'buildings:DEMO-PALM-TOWER',
    )
    const serviceBlockId = await ensureSingleByMatch(
        service,
        'buildings',
        { tenant_id: tenantId, code: 'DEMO-SERVICE-BLOCK' },
        {
            id: demoIds.serviceBlock,
            tenant_id: tenantId,
            code: 'DEMO-SERVICE-BLOCK',
            name: 'Service Block',
            name_ar: 'Service Block',
            description: 'Shared service and utilities block.',
            address: 'Noura Gardens Compound, Service Yard',
            is_active: true,
        },
        'buildings:DEMO-SERVICE-BLOCK',
    )
    const floor03Id = await ensureSingleByMatch(
        service,
        'floors',
        { building_id: palmTowerId, code: 'DEMO-FLOOR-03' },
        {
            id: demoIds.floor03,
            building_id: palmTowerId,
            code: 'DEMO-FLOOR-03',
            name: 'Floor 3',
            name_ar: 'Floor 3',
            level: 3,
            is_active: true,
        },
        'floors:DEMO-FLOOR-03',
    )
    const serviceGroundId = await ensureSingleByMatch(
        service,
        'floors',
        { building_id: serviceBlockId, code: 'DEMO-SERVICE-G' },
        {
            id: demoIds.serviceGround,
            building_id: serviceBlockId,
            code: 'DEMO-SERVICE-G',
            name: 'Ground Service Level',
            name_ar: 'Ground Service Level',
            level: 0,
            is_active: true,
        },
        'floors:DEMO-SERVICE-G',
    )
    const zoneAId = await ensureSingleByMatch(
        service,
        'departments',
        { tenant_id: tenantId, code: 'DEMO-ZONE-A' },
        {
            id: demoIds.zoneA,
            tenant_id: tenantId,
            building_id: palmTowerId,
            floor_id: floor03Id,
            code: 'DEMO-ZONE-A',
            name: 'Residential Zone A',
            name_ar: 'Residential Zone A',
            is_active: true,
        },
        'departments:DEMO-ZONE-A',
    )
    const unit305Id = await ensureSingleByMatch(
        service,
        'rooms',
        { tenant_id: tenantId, code: 'DEMO-UNIT-305' },
        {
            id: demoIds.unit305,
            tenant_id: tenantId,
            building_id: palmTowerId,
            floor_id: floor03Id,
            department_id: zoneAId,
            code: 'DEMO-UNIT-305',
            name: 'Unit 305',
            name_ar: 'Unit 305',
            room_type: 'apartment',
            capacity: 4,
            is_active: true,
        },
        'rooms:DEMO-UNIT-305',
    )
    const mech3aId = await ensureSingleByMatch(
        service,
        'rooms',
        { tenant_id: tenantId, code: 'DEMO-MECH-3A' },
        {
            id: demoIds.mech3a,
            tenant_id: tenantId,
            building_id: palmTowerId,
            floor_id: floor03Id,
            department_id: zoneAId,
            code: 'DEMO-MECH-3A',
            name: 'Mechanical Room 3A',
            name_ar: 'Mechanical Room 3A',
            room_type: 'mechanical',
            is_active: true,
        },
        'rooms:DEMO-MECH-3A',
    )
    note(`Locations ensured: ${demoManifest.locations.length}`)

    const teamId = await ensureSingleByMatch(
        service,
        'teams',
        { tenant_id: tenantId, code: demoManifest.team.code },
        {
            id: demoIds.team,
            tenant_id: tenantId,
            code: demoManifest.team.code,
            name: demoManifest.team.name,
            name_ar: demoManifest.team.name,
            description: 'Demo team for HVAC assignment and PM work.',
            type: 'maintenance',
            specializations: ['hvac', 'airflow'],
            status: 'active',
        },
        `teams:${demoManifest.team.code}`,
    )
    for (const persona of demoManifest.personas.filter(persona => persona.teamRole)) {
        const userId = profileIds.get(persona.email)
        if (!userId) throw new Error(`Missing profile id for ${persona.email}`)
        await upsertOne(
            service,
            'team_members',
            {
                team_id: teamId,
                user_id: userId,
                role: persona.teamRole,
                specializations: ['hvac'],
                is_active: true,
            },
            'team_id,user_id',
        )
    }
    note(`Team ensured: ${demoManifest.team.code} with ${demoManifest.team.memberEmails.length} members`)

    const assetPayloads = [
        {
            id: demoIds.ahu3a,
            tenant_id: tenantId,
            code: 'DEMO-AHU-3A',
            name: 'AHU-3A, Palm Tower Floor 3',
            name_ar: 'AHU-3A, Palm Tower Floor 3',
            description: 'Main story asset serving Floor 3 residential zone cooling.',
            category: 'hvac',
            type: 'ahu',
            status: 'operational',
            criticality: 'critical',
            model: 'NG-AHU-3A',
            serial_number: 'DEMO-AHU-3A',
            manufacturer: 'Demo HVAC Systems',
            manufacture_year: 2023,
            specifications: { airflow_cfm: 8500, served_area: 'Palm Tower Floor 3' },
            purchase_date: '2024-01-15',
            purchase_cost: 32000,
            installation_date: '2024-02-01',
            current_value: 28000,
            warranty_provider: 'Demo HVAC Systems',
            warranty_expiry: '2027-02-01',
            building_id: palmTowerId,
            floor_id: floor03Id,
            department_id: zoneAId,
            room_id: mech3aId,
            tags: ['demo', 'hvac', 'ahu'],
            created_by: managerId,
            asset_level: 'equipment',
        },
        {
            id: demoIds.fcu305,
            tenant_id: tenantId,
            code: 'DEMO-FCU-305',
            name: 'FCU, Unit 305',
            name_ar: 'FCU, Unit 305',
            description: 'Resident-facing cooling asset related to AHU-3A complaints.',
            category: 'hvac',
            type: 'fcu',
            status: 'operational',
            criticality: 'medium',
            model: 'NG-FCU-305',
            serial_number: 'DEMO-FCU-305',
            manufacturer: 'Demo HVAC Systems',
            building_id: palmTowerId,
            floor_id: floor03Id,
            department_id: zoneAId,
            room_id: unit305Id,
            tags: ['demo', 'hvac', 'unit-305'],
            created_by: managerId,
            asset_level: 'equipment',
        },
        {
            id: demoIds.pump01,
            tenant_id: tenantId,
            code: 'DEMO-PUMP-01',
            name: 'Booster Pump 01',
            name_ar: 'Booster Pump 01',
            description: 'Supporting mechanical asset for demo variety.',
            category: 'mechanical',
            type: 'pump',
            status: 'operational',
            criticality: 'high',
            model: 'NG-PUMP-01',
            serial_number: 'DEMO-PUMP-01',
            manufacturer: 'Demo Pumps',
            building_id: serviceBlockId,
            floor_id: serviceGroundId,
            tags: ['demo', 'mechanical'],
            created_by: managerId,
            asset_level: 'equipment',
        },
        {
            id: demoIds.gen01,
            tenant_id: tenantId,
            code: 'DEMO-GEN-01',
            name: 'Standby Generator 01',
            name_ar: 'Standby Generator 01',
            description: 'Critical backup power asset for reporting signals.',
            category: 'electrical',
            type: 'generator',
            status: 'operational',
            criticality: 'critical',
            model: 'NG-GEN-01',
            serial_number: 'DEMO-GEN-01',
            manufacturer: 'Demo Power',
            building_id: serviceBlockId,
            floor_id: serviceGroundId,
            tags: ['demo', 'electrical', 'critical'],
            created_by: managerId,
            asset_level: 'equipment',
        },
        {
            id: demoIds.lightingLobby,
            tenant_id: tenantId,
            code: 'DEMO-LTG-LOBBY',
            name: 'Lobby Lighting Circuit',
            name_ar: 'Lobby Lighting Circuit',
            description: 'Supporting electrical asset for a pending request in Phase 3.',
            category: 'electrical',
            type: 'lighting',
            status: 'operational',
            criticality: 'low',
            model: 'NG-LTG-LOBBY',
            serial_number: 'DEMO-LTG-LOBBY',
            manufacturer: 'Demo Electrical',
            building_id: palmTowerId,
            tags: ['demo', 'electrical', 'lighting'],
            created_by: managerId,
            asset_level: 'system',
        },
    ]
    const assetIds = new Map<string, string>()
    for (const asset of assetPayloads) {
        const assetId = await ensureSingleByMatch(
            service,
            'assets',
            { tenant_id: tenantId, code: asset.code },
            asset,
            `assets:${asset.code}`,
        )
        assetIds.set(asset.code, assetId)
    }
    note(`Assets ensured: ${assetPayloads.length}`)

    const inventoryPayloads = [
        {
            id: demoIds.filter,
            tenant_id: tenantId,
            code: 'DEMO-FILTER-AHU-20X24',
            name: 'AHU Filter 20x24',
            name_ar: 'AHU Filter 20x24',
            description: 'Main low-stock part for AHU-3A filter replacement.',
            part_number: 'FLT-20X24-DEMO',
            manufacturer: 'Demo HVAC Supplies',
            quantity: 3,
            min_quantity: 8,
            max_quantity: 40,
            unit_of_measure: 'pcs',
            location: 'Service Block Store A-01',
            unit_cost: 75,
            compatible_assets: ['DEMO-AHU-3A'],
            is_active: true,
            created_by: managerId,
        },
        {
            id: demoIds.belt,
            tenant_id: tenantId,
            code: 'DEMO-BELT-SPA-1250',
            name: 'AHU Drive Belt SPA-1250',
            name_ar: 'AHU Drive Belt SPA-1250',
            description: 'PM spare part for AHU drive inspections.',
            part_number: 'BELT-SPA-1250-DEMO',
            manufacturer: 'Demo HVAC Supplies',
            quantity: 6,
            min_quantity: 2,
            max_quantity: 20,
            unit_of_measure: 'pcs',
            location: 'Service Block Store B-02',
            unit_cost: 45,
            compatible_assets: ['DEMO-AHU-3A'],
            is_active: true,
            created_by: managerId,
        },
        {
            id: demoIds.floatSwitch,
            tenant_id: tenantId,
            code: 'DEMO-FLOAT-SWITCH',
            name: 'Condensate Float Switch',
            name_ar: 'Condensate Float Switch',
            description: 'Corrective spare for FCU condensate faults.',
            part_number: 'FLOAT-SW-DEMO',
            manufacturer: 'Demo HVAC Supplies',
            quantity: 5,
            min_quantity: 3,
            max_quantity: 15,
            unit_of_measure: 'pcs',
            location: 'Service Block Store B-03',
            unit_cost: 38,
            compatible_assets: ['DEMO-FCU-305'],
            is_active: true,
            created_by: managerId,
        },
        {
            id: demoIds.ledLamp,
            tenant_id: tenantId,
            code: 'DEMO-LAMP-LED-18W',
            name: 'LED Lamp 18W',
            name_ar: 'LED Lamp 18W',
            description: 'Supporting spare for lobby lighting requests.',
            part_number: 'LED-18W-DEMO',
            manufacturer: 'Demo Electrical',
            quantity: 24,
            min_quantity: 10,
            max_quantity: 80,
            unit_of_measure: 'pcs',
            location: 'Service Block Store E-01',
            unit_cost: 18,
            compatible_assets: ['DEMO-LTG-LOBBY'],
            is_active: true,
            created_by: managerId,
        },
    ]
    for (const item of inventoryPayloads) {
        await ensureSingleByMatch(
            service,
            'inventory_items',
            { tenant_id: tenantId, code: item.code },
            item,
            `inventory_items:${item.code}`,
        )
    }
    note(`Inventory items ensured: ${inventoryPayloads.length}`)

    const jobPlanId = await ensureSingleByMatch(
        service,
        'job_plans',
        { tenant_id: tenantId, code: 'DEMO-JP-AHU-MONTHLY' },
        {
            id: demoIds.jobPlanAhuMonthly,
            tenant_id: tenantId,
            code: 'DEMO-JP-AHU-MONTHLY',
            name: 'Monthly AHU Inspection',
            name_ar: 'Monthly AHU Inspection',
            description: 'Monthly inspection checklist for AHU-3A.',
            description_ar: 'Monthly inspection checklist for AHU-3A.',
            category: 'hvac',
            asset_type_hint: 'ahu',
            status: 'active',
            version: 1,
            estimated_duration_minutes: 45,
            requires_safety_checks: true,
            safety_notes: 'Confirm isolation before opening AHU access panels.',
            required_parts: [
                { code: 'DEMO-FILTER-AHU-20X24', quantity: 1, optional: true },
                { code: 'DEMO-BELT-SPA-1250', quantity: 1, optional: true },
            ],
            created_by: managerId,
        },
        'job_plans:DEMO-JP-AHU-MONTHLY',
    )

    const jobPlanItems = [
        {
            id: demoIds.jpItemSafety,
            sort_order: 10,
            label: 'Safety isolation confirmed',
            item_type: 'yes_no',
            is_required: true,
            is_critical: true,
        },
        {
            id: demoIds.jpItemFilter,
            sort_order: 20,
            label: 'Filter condition',
            item_type: 'pass_fail',
            is_required: true,
            is_critical: true,
        },
        {
            id: demoIds.jpItemCoil,
            sort_order: 30,
            label: 'Coil cleanliness',
            item_type: 'pass_fail',
            is_required: false,
            is_critical: false,
        },
        {
            id: demoIds.jpItemBelt,
            sort_order: 40,
            label: 'Belt condition',
            item_type: 'pass_fail',
            is_required: false,
            is_critical: false,
        },
        {
            id: demoIds.jpItemSupplyTemp,
            sort_order: 50,
            label: 'Supply air temperature',
            item_type: 'numeric',
            is_required: true,
            is_critical: false,
            unit: 'C',
            warning_min: 10,
            warning_max: 16,
        },
    ]
    for (const item of jobPlanItems) {
        await ensureSingleByMatch(
            service,
            'job_plan_items',
            { job_plan_id: jobPlanId, sort_order: item.sort_order },
            {
                ...item,
                job_plan_id: jobPlanId,
                section_name: 'AHU Monthly Inspection',
                section_name_ar: 'AHU Monthly Inspection',
                label_ar: item.label,
                metadata: { demo: true },
            },
            `job_plan_items:${item.label}`,
        )
    }

    const pmScheduleId = await ensureSingleByMatch(
        service,
        'pm_schedules',
        { tenant_id: tenantId, code: 'DEMO-PM-AHU-3A-MONTHLY' },
        {
            id: demoIds.pmScheduleAhuMonthly,
            tenant_id: tenantId,
            code: 'DEMO-PM-AHU-3A-MONTHLY',
            name: 'AHU-3A Monthly PM',
            name_ar: 'AHU-3A Monthly PM',
            description: 'Active monthly PM schedule for AHU-3A.',
            job_plan_id: jobPlanId,
            primary_asset_id: assetIds.get('DEMO-AHU-3A')!,
            trigger_type: 'calendar',
            frequency_type: 'monthly',
            frequency_interval: 1,
            start_date: today,
            next_due_date: today,
            lead_time_days: 3,
            compliance_window_days: 7,
            default_assignee_id: technicianId,
            default_team_id: teamId,
            default_priority: 'medium',
            status: 'active',
            generation_mode: 'per_asset',
            total_generated: 0,
            total_completed: 0,
            total_overdue: 0,
            compliance_rate: 0,
            notes: 'Seeded foundation only. Work-order generation is Phase 3.',
            created_by: managerId,
        },
        'pm_schedules:DEMO-PM-AHU-3A-MONTHLY',
    )
    await ensureSingleByMatch(
        service,
        'pm_schedule_assets',
        { schedule_id: pmScheduleId, asset_id: assetIds.get('DEMO-AHU-3A')! },
        {
            id: demoIds.pmScheduleAhuAsset,
            schedule_id: pmScheduleId,
            asset_id: assetIds.get('DEMO-AHU-3A')!,
            sort_order: 1,
            notes: 'Primary AHU for the Noura Gardens demo story.',
        },
        'pm_schedule_assets:DEMO-PM-AHU-3A-MONTHLY:DEMO-AHU-3A',
    )
    note(`PM foundation ensured: 1 job plan, ${jobPlanItems.length} checks, 1 active schedule, 1 linked asset`)

    console.log('')
    console.log('Foundation write complete. In-process verify follows.')
    console.log('')
    await runVerifyMode(supabaseUrl)

    return { summary }
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 helpers — work orders, operation logs, parts, and checks
// All writes use service_role INSERT (bypasses RLS INSERT policy and does NOT
// trigger the BEFORE UPDATE guard_work_order_sensitive_fields trigger).
// ─────────────────────────────────────────────────────────────────────────────

async function insertWorkOrderIfNotExists(
    service: SupabaseService,
    code: string,
    tenantId: string,
    payload: Record<string, unknown>,
): Promise<string> {
    const { data, error } = await service
        .from('work_orders')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('code', code)
        .maybeSingle()
    if (error) throw new Error(`work_orders lookup failed for ${code}: ${error.message}`)
    if (data) {
        console.log(`  skip work_orders:${code} (already exists)`)
        return (data as { id: string }).id
    }
    const { error: insertError } = await service.from('work_orders').insert(payload)
    if (insertError) throw new Error(`work_orders insert failed for ${code}: ${insertError.message}`)
    console.log(`  inserted work_orders:${code}`)
    return payload.id as string
}

async function ensureOperationLog(
    service: SupabaseService,
    tenantId: string,
    workOrderId: string,
    logType: string,
    description: string,
    performedBy: string,
    teamId?: string | null,
    assetId?: string | null,
    buildingId?: string | null,
): Promise<void> {
    const { data, error } = await service
        .from('operation_logs')
        .select('id')
        .eq('work_order_id', workOrderId)
        .eq('type', logType)
        .limit(1)
    if (error) throw new Error(`operation_logs check failed for type=${logType}: ${error.message}`)
    if (data && data.length > 0) return
    const logCode = `DEMO-LOG-${randomUUID().slice(0, 12).toUpperCase()}`
    const { error: insertError } = await service.from('operation_logs').insert({
        tenant_id: tenantId,
        code: logCode,
        type: logType,
        description,
        work_order_id: workOrderId,
        performed_by: performedBy,
        team_id: teamId ?? null,
        asset_id: assetId ?? null,
        building_id: buildingId ?? null,
        timestamp: new Date().toISOString(),
        status: 'completed',
    })
    if (insertError) throw new Error(`operation_logs insert failed for type=${logType}: ${insertError.message}`)
}

async function ensureWorkOrderPart(
    service: SupabaseService,
    tenantId: string,
    workOrderId: string,
    partId: string,
    quantity: number,
    unitCost: number,
    createdBy: string,
): Promise<boolean> {
    const { data, error } = await service
        .from('work_order_parts')
        .select('id')
        .eq('work_order_id', workOrderId)
        .eq('part_id', partId)
        .limit(1)
    if (error) throw new Error(`work_order_parts check failed: ${error.message}`)
    if (data && data.length > 0) return false
    const { error: insertError } = await service.from('work_order_parts').insert({
        tenant_id: tenantId,
        work_order_id: workOrderId,
        part_id: partId,
        quantity,
        unit_cost: unitCost,
        created_by: createdBy,
    })
    if (insertError) throw new Error(`work_order_parts insert failed: ${insertError.message}`)
    return true
}

async function ensureWorkOrderChecks(
    service: SupabaseService,
    workOrderId: string,
    assetId: string,
    jobPlanId: string,
): Promise<void> {
    const { data: existing, error: existError } = await service
        .from('work_order_checks')
        .select('id')
        .eq('work_order_id', workOrderId)
        .limit(1)
    if (existError) throw new Error(`work_order_checks check failed: ${existError.message}`)
    if (existing && existing.length > 0) return

    const { data: items, error: itemsError } = await service
        .from('job_plan_items')
        .select('id, label, label_ar, description, description_ar, item_type, is_required, is_critical, unit, min_value, max_value, warning_min, warning_max, options, help_text, help_text_ar, sort_order')
        .eq('job_plan_id', jobPlanId)
        .order('sort_order')
    if (itemsError) throw new Error(`job_plan_items read failed: ${itemsError.message}`)

    for (const item of (items || []) as Array<Record<string, unknown>>) {
        if (item.item_type === 'header') continue
        const { error: checkError } = await service.from('work_order_checks').insert({
            work_order_id: workOrderId,
            asset_id: assetId,
            job_plan_item_id: item.id,
            item_snapshot: {
                label: item.label,
                label_ar: item.label_ar,
                description: item.description,
                description_ar: item.description_ar,
                item_type: item.item_type,
                is_required: item.is_required,
                is_critical: item.is_critical,
                unit: item.unit,
                min_value: item.min_value,
                max_value: item.max_value,
                warning_min: item.warning_min,
                warning_max: item.warning_max,
                options: item.options,
                help_text: item.help_text,
                help_text_ar: item.help_text_ar,
            },
            sort_order: item.sort_order,
            status: 'pending',
        })
        if (checkError) throw new Error(`work_order_checks insert failed: ${checkError.message}`)
    }
}

async function seedDemoWorkOrders(supabaseUrl: string) {
    assertWriteWorkordersConfirmation()
    const service = createReadOnlyServiceClient(supabaseUrl)

    console.log('WARNING: WRITE-WORKORDERS MODE')
    console.log(`Target host: ${APPROVED_SUPABASE_HOST}`)
    console.log('This will insert demo work orders, operation logs, and parts into the approved staging project.')
    console.log('All writes use service-role INSERT (not authenticated RPCs). See docs for details.')
    console.log('')

    // ── 1. Load foundation IDs ─────────────────────────────────────────────────

    const tenant = await getDemoTenant(service)
    if (!tenant) throw new Error('Foundation tenant missing. Run write-foundation first.')
    const tenantId = tenant.id

    const { data: profiles, error: profilesError } = await service
        .from('profiles')
        .select('id, email, role')
        .eq('tenant_id', tenantId)
    if (profilesError) throw new Error(`profiles load failed: ${profilesError.message}`)

    const profilesByEmail = new Map(
        ((profiles || []) as Array<{ id: string; email: string | null; role: string | null }>).map(p => [
            (p.email || '').toLowerCase(),
            p.id,
        ]),
    )
    const managerId = profilesByEmail.get('demo.manager@noura-gardens.mutqan.test')
    const technicianId = profilesByEmail.get('demo.technician@noura-gardens.mutqan.test')
    const supervisorId = profilesByEmail.get('demo.supervisor@noura-gardens.mutqan.test')
    const engineerId = profilesByEmail.get('demo.engineer@noura-gardens.mutqan.test')
    const reporterId = profilesByEmail.get('demo.reporter@noura-gardens.mutqan.test')
    if (!managerId || !technicianId || !supervisorId || !engineerId || !reporterId) {
        throw new Error('Foundation personas missing. Run write-foundation first.')
    }

    const { data: assets, error: assetsError } = await service
        .from('assets')
        .select('id, code')
        .eq('tenant_id', tenantId)
        .in('code', ['DEMO-AHU-3A', 'DEMO-FCU-305', 'DEMO-LTG-LOBBY'])
    if (assetsError) throw new Error(`assets load failed: ${assetsError.message}`)
    const assetsByCode = new Map(
        ((assets || []) as Array<{ id: string; code: string | null }>).map(a => [a.code || '', a.id]),
    )
    const ahu3aId = assetsByCode.get('DEMO-AHU-3A')
    const fcu305Id = assetsByCode.get('DEMO-FCU-305')
    const lightingLobbyId = assetsByCode.get('DEMO-LTG-LOBBY')
    if (!ahu3aId || !fcu305Id || !lightingLobbyId) {
        throw new Error('Foundation assets missing. Run write-foundation first.')
    }

    const { data: buildings, error: buildingsError } = await service
        .from('buildings')
        .select('id, code')
        .eq('tenant_id', tenantId)
        .in('code', ['DEMO-PALM-TOWER'])
    if (buildingsError) throw new Error(`buildings load failed: ${buildingsError.message}`)
    const palmTowerId = ((buildings || []) as Array<{ id: string; code: string | null }>).find(b => b.code === 'DEMO-PALM-TOWER')?.id
    if (!palmTowerId) throw new Error('Foundation building DEMO-PALM-TOWER missing.')

    const { data: floors, error: floorsError } = await service
        .from('floors')
        .select('id, code')
        .in('building_id', [palmTowerId])
        .in('code', ['DEMO-FLOOR-03'])
    if (floorsError) throw new Error(`floors load failed: ${floorsError.message}`)
    const floor03Id = ((floors || []) as Array<{ id: string; code: string | null }>).find(f => f.code === 'DEMO-FLOOR-03')?.id

    const { data: rooms, error: roomsError } = await service
        .from('rooms')
        .select('id, code')
        .eq('tenant_id', tenantId)
        .in('code', ['DEMO-MECH-3A', 'DEMO-UNIT-305'])
    if (roomsError) throw new Error(`rooms load failed: ${roomsError.message}`)
    const mech3aId = ((rooms || []) as Array<{ id: string; code: string | null }>).find(r => r.code === 'DEMO-MECH-3A')?.id
    const unit305Id = ((rooms || []) as Array<{ id: string; code: string | null }>).find(r => r.code === 'DEMO-UNIT-305')?.id

    const { data: team, error: teamError } = await service
        .from('teams')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('code', 'DEMO-HVAC-TEAM')
        .maybeSingle()
    if (teamError) throw new Error(`team load failed: ${teamError.message}`)
    const teamId = (team as { id: string } | null)?.id
    if (!teamId) throw new Error('Foundation team DEMO-HVAC-TEAM missing.')

    const { data: pmSchedule, error: pmSchedError } = await service
        .from('pm_schedules')
        .select('id, job_plan_id, next_due_date')
        .eq('tenant_id', tenantId)
        .eq('code', 'DEMO-PM-AHU-3A-MONTHLY')
        .maybeSingle()
    if (pmSchedError) throw new Error(`pm_schedules load failed: ${pmSchedError.message}`)
    const pmScheduleId = (pmSchedule as { id: string; job_plan_id: string | null; next_due_date: string | null } | null)?.id
    const jobPlanId = (pmSchedule as { id: string; job_plan_id: string | null; next_due_date: string | null } | null)?.job_plan_id
    if (!pmScheduleId || !jobPlanId) throw new Error('Foundation PM schedule DEMO-PM-AHU-3A-MONTHLY missing.')

    const { data: filterItem, error: filterError } = await service
        .from('inventory_items')
        .select('id, quantity, unit_cost')
        .eq('tenant_id', tenantId)
        .eq('code', 'DEMO-FILTER-AHU-20X24')
        .maybeSingle()
    if (filterError) throw new Error(`inventory_items load failed: ${filterError.message}`)
    const filterId = (filterItem as { id: string; quantity: number | null; unit_cost: number | null } | null)?.id
    const filterUnitCost = Number((filterItem as { id: string; quantity: number | null; unit_cost: number | null } | null)?.unit_cost ?? 75)
    if (!filterId) throw new Error('Foundation inventory item DEMO-FILTER-AHU-20X24 missing.')

    console.log('Foundation check: PASS')
    console.log('')

    // ── 2. Date helpers ────────────────────────────────────────────────────────

    const now = new Date()
    const nowIso = now.toISOString()
    const today = nowIso.slice(0, 10)
    const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString()
    const daysFromNow = (n: number) => new Date(now.getTime() + n * 86400000).toISOString()
    const hoursAgo = (n: number) => new Date(now.getTime() - n * 3600000).toISOString()

    const summary: string[] = []
    const note = (message: string) => {
        summary.push(message)
        console.log(`- ${message}`)
    }

    // ── 3. Seed 9 required demo work orders ───────────────────────────────────
    //
    // All work orders are seeded via direct service-role INSERT. This bypasses
    // the work_orders_insert_disabled_direct RLS policy (which applies only to
    // authenticated role) and does NOT trigger the BEFORE UPDATE sensitive-field
    // guard (which fires on UPDATE, not INSERT).
    //
    // These are staging-only backup records. For the live demo story, the main
    // work orders (DEMO-WO-ASSIGNED-001, DEMO-WO-COMPLETE-001) should be
    // (re-)created live via the authenticated RPCs to show the full RPC path.

    // 3.1 DEMO-WO-PENDING-001: pending lobby lighting request
    const woPending001Id = await insertWorkOrderIfNotExists(service, 'DEMO-WO-PENDING-001', tenantId, {
        id: demoIds.woPending001,
        tenant_id: tenantId,
        code: 'DEMO-WO-PENDING-001',
        title: 'Lobby Lighting Repair – Ground Floor Passage',
        description: 'Several LED fixtures in the lobby passage have failed. Residents report visibility issues in the evening.',
        status: 'pending',
        priority: 'low',
        work_type: 'corrective',
        issue_type: 'Electrical',
        asset_id: lightingLobbyId,
        building_id: palmTowerId,
        reported_by: reporterId,
        created_by: reporterId,
        due_date: daysFromNow(7),
        reported_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
    })
    // 3.2 DEMO-WO-ASSIGNED-001: main cooling complaint — assigned, deliberately OVERDUE for reports
    const woAssigned001Id = await insertWorkOrderIfNotExists(service, 'DEMO-WO-ASSIGNED-001', tenantId, {
        id: demoIds.woAssigned001,
        tenant_id: tenantId,
        code: 'DEMO-WO-ASSIGNED-001',
        title: 'Cooling Complaint – Unit 305 AHU-3A Insufficient Airflow',
        description: 'Resident in Unit 305 reports insufficient cooling. AHU-3A airflow and filter suspected. Main cooling complaint for the demo story.',
        status: 'assigned',
        priority: 'high',
        work_type: 'corrective',
        issue_type: 'Cooling',
        asset_id: ahu3aId,
        building_id: palmTowerId,
        floor_id: floor03Id ?? null,
        room_id: mech3aId ?? null,
        assigned_to: technicianId,
        assigned_team: teamId,
        reported_by: reporterId,
        created_by: managerId,
        due_date: daysAgo(2),       // intentionally overdue for the overdue-signal report
        estimated_cost: 200,
        reported_at: daysAgo(5),
        created_at: daysAgo(5),
        updated_at: nowIso,
    })
    // 3.3 DEMO-WO-INPROG-001: in-progress backup cooling work
    const woInprog001Id = await insertWorkOrderIfNotExists(service, 'DEMO-WO-INPROG-001', tenantId, {
        id: demoIds.woInprog001,
        tenant_id: tenantId,
        code: 'DEMO-WO-INPROG-001',
        title: 'AHU-3A Airflow Investigation – In Progress',
        description: 'Backup in-progress cooling fault investigation. Technician on-site performing airflow and coil measurements.',
        status: 'in_progress',
        priority: 'high',
        work_type: 'corrective',
        issue_type: 'Cooling',
        asset_id: ahu3aId,
        building_id: palmTowerId,
        floor_id: floor03Id ?? null,
        room_id: mech3aId ?? null,
        assigned_to: technicianId,
        assigned_team: teamId,
        reported_by: reporterId,
        created_by: managerId,
        start_time: hoursAgo(2),
        started_at: hoursAgo(2),
        due_date: daysFromNow(3),
        reported_at: daysAgo(2),
        created_at: daysAgo(2),
        updated_at: nowIso,
    })
    // 3.4 DEMO-WO-SUP-001: pending supervisor approval
    const woSup001Id = await insertWorkOrderIfNotExists(service, 'DEMO-WO-SUP-001', tenantId, {
        id: demoIds.woSup001,
        tenant_id: tenantId,
        code: 'DEMO-WO-SUP-001',
        title: 'AHU-3A Belt Replacement – Awaiting Supervisor Approval',
        description: 'Technician completed AHU-3A drive belt replacement. Field notes and evidence submitted. Awaiting supervisor review before sign-off.',
        status: 'pending_supervisor_approval',
        priority: 'medium',
        work_type: 'corrective',
        issue_type: 'Cooling',
        asset_id: ahu3aId,
        building_id: palmTowerId,
        floor_id: floor03Id ?? null,
        room_id: mech3aId ?? null,
        assigned_to: technicianId,
        assigned_team: teamId,
        reported_by: managerId,
        created_by: managerId,
        start_time: daysAgo(1),
        started_at: daysAgo(1),
        technician_completed_at: hoursAgo(1),
        technician_notes: 'Belt was worn and showing signs of cracking. Replaced with DEMO-BELT-SPA-1250. AHU running smoothly after replacement.',
        due_date: daysFromNow(5),
        reported_at: daysAgo(3),
        created_at: daysAgo(3),
        updated_at: nowIso,
    })
    // 3.5 DEMO-WO-ENG-001: pending engineer review
    const woEng001Id = await insertWorkOrderIfNotExists(service, 'DEMO-WO-ENG-001', tenantId, {
        id: demoIds.woEng001,
        tenant_id: tenantId,
        code: 'DEMO-WO-ENG-001',
        title: 'AHU-3A Coil Cleaning – Awaiting Engineer Review',
        description: 'Technician completed evaporator coil cleaning and inspection. Technical review by engineer requested before final sign-off.',
        status: 'pending_engineer_review',
        priority: 'medium',
        work_type: 'corrective',
        issue_type: 'Cooling',
        asset_id: ahu3aId,
        building_id: palmTowerId,
        floor_id: floor03Id ?? null,
        room_id: mech3aId ?? null,
        assigned_to: technicianId,
        assigned_team: teamId,
        reported_by: managerId,
        created_by: managerId,
        start_time: daysAgo(3),
        started_at: daysAgo(3),
        technician_completed_at: daysAgo(1),
        technician_notes: 'Coil fins were clogged with dust. Used nitrogen flush and fin comb. Supply air temperature improved from 20°C to 14°C.',
        supervisor_approved_at: hoursAgo(3),
        supervisor_approved_by: supervisorId,
        supervisor_notes: 'Verified coil condition on-site. Technician work is thorough. Forward to engineer for technical sign-off.',
        due_date: daysFromNow(4),
        reported_at: daysAgo(4),
        created_at: daysAgo(4),
        updated_at: nowIso,
    })
    // 3.6 DEMO-WO-REPORTER-001: pending reporter closure
    const woReporter001Id = await insertWorkOrderIfNotExists(service, 'DEMO-WO-REPORTER-001', tenantId, {
        id: demoIds.woReporter001,
        tenant_id: tenantId,
        code: 'DEMO-WO-REPORTER-001',
        title: 'FCU Filter Replacement – Awaiting Resident Closure',
        description: 'FCU filter in Unit 305 replaced after resident cooling complaint. Awaiting resident confirmation that comfort is restored.',
        status: 'pending_reporter_closure',
        priority: 'medium',
        work_type: 'corrective',
        issue_type: 'Cooling',
        asset_id: fcu305Id,
        building_id: palmTowerId,
        floor_id: floor03Id ?? null,
        room_id: unit305Id ?? null,
        assigned_to: technicianId,
        assigned_team: teamId,
        reported_by: reporterId,
        created_by: managerId,
        start_time: daysAgo(4),
        started_at: daysAgo(4),
        technician_completed_at: daysAgo(2),
        technician_notes: 'FCU filter replaced. Cleaned drain pan. Cooling restored to unit.',
        supervisor_approved_at: daysAgo(1),
        supervisor_approved_by: supervisorId,
        supervisor_notes: 'Approved.',
        engineer_approved_at: hoursAgo(4),
        engineer_approved_by: engineerId,
        engineer_notes: 'Technical check complete. Filter condition confirmed. Ready for resident closure.',
        pending_closure_since: hoursAgo(4),
        due_date: daysFromNow(3),
        reported_at: daysAgo(5),
        created_at: daysAgo(5),
        updated_at: nowIso,
    })
    // 3.7 DEMO-WO-COMPLETE-001: completed AHU filter replacement (main story conclusion)
    const woComplete001Id = await insertWorkOrderIfNotExists(service, 'DEMO-WO-COMPLETE-001', tenantId, {
        id: demoIds.woComplete001,
        tenant_id: tenantId,
        code: 'DEMO-WO-COMPLETE-001',
        title: 'AHU-3A Filter Replacement – Cooling Restored',
        description: 'Replaced severely clogged HEPA filter on AHU-3A. Airflow restored to Unit 305 zone. Filter replacement is the confirmed root cause of repeated cooling complaints.',
        status: 'completed',
        priority: 'high',
        work_type: 'corrective',
        issue_type: 'Cooling',
        asset_id: ahu3aId,
        building_id: palmTowerId,
        floor_id: floor03Id ?? null,
        room_id: mech3aId ?? null,
        assigned_to: technicianId,
        assigned_team: teamId,
        reported_by: reporterId,
        created_by: managerId,
        start_time: daysAgo(6),
        started_at: daysAgo(6),
        technician_completed_at: daysAgo(5),
        technician_notes: 'Filter pressure drop was 3× rated limit. Replaced DEMO-FILTER-AHU-20X24. Supply air temperature restored to 13°C. Resident confirmed comfort restored.',
        supervisor_approved_at: daysAgo(5),
        supervisor_approved_by: supervisorId,
        supervisor_notes: 'Verified filter replacement and airflow. Work order ready for closure.',
        engineer_approved_at: daysAgo(5),
        engineer_approved_by: engineerId,
        engineer_notes: 'Thermal scan confirms even airflow distribution across Zone A. Approved.',
        customer_reviewed_at: daysAgo(5),
        customer_reviewed_by: reporterId,
        reporter_notes: 'Cooling is now working well. Thank you.',
        completed_at: daysAgo(5),
        completion_notes: 'Filter replaced. Root cause confirmed: clogged filter reduced airflow to 40% of design. Recommend monthly PM inspection frequency increase.',
        actual_duration_minutes: 90,
        estimated_cost: 150,
        actual_cost: 150,
        sla_resolution_met: true,
        due_date: daysAgo(4),
        reported_at: daysAgo(10),
        created_at: daysAgo(10),
        updated_at: daysAgo(5),
    })
    // 3.8 DEMO-WO-CANCEL-001: cancelled duplicate cooling request
    const woCancel001Id = await insertWorkOrderIfNotExists(service, 'DEMO-WO-CANCEL-001', tenantId, {
        id: demoIds.woCancel001,
        tenant_id: tenantId,
        code: 'DEMO-WO-CANCEL-001',
        title: 'Cooling Complaint – Unit 305 (Duplicate Request)',
        description: 'Second resident logged a duplicate cooling complaint for the same AHU-3A issue. Cancelled in favour of DEMO-WO-ASSIGNED-001.',
        status: 'cancelled',
        priority: 'medium',
        work_type: 'corrective',
        issue_type: 'Cooling',
        asset_id: ahu3aId,
        building_id: palmTowerId,
        floor_id: floor03Id ?? null,
        room_id: unit305Id ?? null,
        reported_by: reporterId,
        created_by: reporterId,
        cancellation_reason: 'Duplicate of DEMO-WO-ASSIGNED-001. Consolidated cooling complaint for AHU-3A. Single active work order is sufficient.',
        cancelled_at: daysAgo(4),
        due_date: daysFromNow(2),
        reported_at: daysAgo(6),
        created_at: daysAgo(6),
        updated_at: daysAgo(4),
    })
    // 3.9 DEMO-WO-PM-001: PM-generated AHU monthly inspection (service-role seeded backup)
    // Note: Seeded with source_schedule_id and scheduled_date=today so that
    // pm_generate_due_work_orders idempotency (scheduled_date = next_due_date) will
    // skip re-generating for this cycle as long as DEMO-WO-PM-001 is non-terminal.
    const woPm001Id = await insertWorkOrderIfNotExists(service, 'DEMO-WO-PM-001', tenantId, {
        id: demoIds.woPm001,
        tenant_id: tenantId,
        code: 'DEMO-WO-PM-001',
        title: 'AHU-3A Monthly PM Inspection – Palm Tower Floor 3',
        description: 'PM-generated monthly inspection work order for AHU-3A. Checklist includes safety isolation, filter condition, coil cleanliness, belt condition, and supply air temperature.',
        status: 'pending',
        priority: 'medium',
        work_type: 'preventive',
        issue_type: 'PM Inspection',
        asset_id: ahu3aId,
        building_id: palmTowerId,
        floor_id: floor03Id ?? null,
        room_id: mech3aId ?? null,
        assigned_to: technicianId,
        assigned_team: teamId,
        reported_by: managerId,
        created_by: managerId,
        source_schedule_id: pmScheduleId,
        job_plan_id: jobPlanId,
        scheduled_date: today,
        compliance_deadline: daysFromNow(7).slice(0, 10),
        due_date: daysFromNow(3),
        reported_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
    })
    note('Work orders: 9 demo work orders processed (see above for inserted/skipped per code)')

    // ── 4. Operation logs for each work order ─────────────────────────────────

    await ensureOperationLog(service, tenantId, woPending001Id, 'create',
        'Work order created by resident reporter.', reporterId, null, lightingLobbyId, palmTowerId)

    await ensureOperationLog(service, tenantId, woAssigned001Id, 'create',
        'Work order created for cooling complaint Unit 305.', reporterId, null, ahu3aId, palmTowerId)
    await ensureOperationLog(service, tenantId, woAssigned001Id, 'assignment',
        `Work order assigned to HVAC technician and team.`, managerId, teamId, ahu3aId, palmTowerId)

    await ensureOperationLog(service, tenantId, woInprog001Id, 'create',
        'Backup in-progress cooling work order created.', managerId, null, ahu3aId, palmTowerId)
    await ensureOperationLog(service, tenantId, woInprog001Id, 'assignment',
        'Assigned to HVAC technician.', managerId, teamId, ahu3aId, palmTowerId)
    await ensureOperationLog(service, tenantId, woInprog001Id, 'maintenance',
        'Work order started. Technician on-site for airflow investigation.', technicianId, teamId, ahu3aId, palmTowerId)

    await ensureOperationLog(service, tenantId, woSup001Id, 'create',
        'AHU belt replacement work order created.', managerId, null, ahu3aId, palmTowerId)
    await ensureOperationLog(service, tenantId, woSup001Id, 'assignment',
        'Assigned to HVAC technician.', managerId, teamId, ahu3aId, palmTowerId)
    await ensureOperationLog(service, tenantId, woSup001Id, 'maintenance',
        'Belt replacement completed by technician. Submitted for supervisor review.', technicianId, teamId, ahu3aId, palmTowerId)

    await ensureOperationLog(service, tenantId, woEng001Id, 'create',
        'Coil cleaning work order created.', managerId, null, ahu3aId, palmTowerId)
    await ensureOperationLog(service, tenantId, woEng001Id, 'assignment',
        'Assigned to HVAC technician.', managerId, teamId, ahu3aId, palmTowerId)
    await ensureOperationLog(service, tenantId, woEng001Id, 'maintenance',
        'Coil cleaning completed by technician.', technicianId, teamId, ahu3aId, palmTowerId)
    await ensureOperationLog(service, tenantId, woEng001Id, 'status_change',
        'Supervisor approved. Work order forwarded to engineer for technical review.', supervisorId, teamId, ahu3aId, palmTowerId)

    await ensureOperationLog(service, tenantId, woReporter001Id, 'create',
        'FCU filter replacement work order created.', managerId, null, fcu305Id, palmTowerId)
    await ensureOperationLog(service, tenantId, woReporter001Id, 'assignment',
        'Assigned to HVAC technician.', managerId, teamId, fcu305Id, palmTowerId)
    await ensureOperationLog(service, tenantId, woReporter001Id, 'maintenance',
        'FCU filter replaced. Drain pan cleaned. Cooling restored.', technicianId, teamId, fcu305Id, palmTowerId)
    await ensureOperationLog(service, tenantId, woReporter001Id, 'status_change',
        'Engineer approved. Work order sent to reporter for closure confirmation.', engineerId, teamId, fcu305Id, palmTowerId)

    await ensureOperationLog(service, tenantId, woComplete001Id, 'create',
        'Cooling complaint work order created for AHU-3A filter investigation.', reporterId, null, ahu3aId, palmTowerId)
    await ensureOperationLog(service, tenantId, woComplete001Id, 'assignment',
        'Assigned to HVAC technician and team for filter replacement.', managerId, teamId, ahu3aId, palmTowerId)
    await ensureOperationLog(service, tenantId, woComplete001Id, 'maintenance',
        'Work completed by technician. Filter replaced. Airflow restored.', technicianId, teamId, ahu3aId, palmTowerId)
    await ensureOperationLog(service, tenantId, woComplete001Id, 'status_change',
        'Work order completed and closed. Cooling confirmed restored by resident.', managerId, teamId, ahu3aId, palmTowerId)

    await ensureOperationLog(service, tenantId, woCancel001Id, 'create',
        'Duplicate cooling complaint logged by second resident.', reporterId, null, ahu3aId, palmTowerId)
    await ensureOperationLog(service, tenantId, woCancel001Id, 'cancellation',
        'Work order cancelled: Duplicate of DEMO-WO-ASSIGNED-001. Consolidated cooling complaint.', managerId, null, ahu3aId, palmTowerId)

    // PM work order: use pm_generate type for the creation log so the verifier can check it
    await ensureOperationLog(service, tenantId, woPm001Id, 'pm_generate',
        'PM work order generated from schedule DEMO-PM-AHU-3A-MONTHLY. Seeded as staging-only backup via write-workorders mode.', managerId, teamId, ahu3aId, palmTowerId)
    await ensureOperationLog(service, tenantId, woPm001Id, 'create',
        'Monthly AHU inspection work order ready for technician.', managerId, teamId, ahu3aId, palmTowerId)

    note('Operation logs: ensured for all 9 demo work orders')

    // ── 5. Work order checks for DEMO-WO-PM-001 ───────────────────────────────

    await ensureWorkOrderChecks(service, woPm001Id, ahu3aId, jobPlanId)
    note('Work order checks: ensured for DEMO-WO-PM-001')

    // ── 6. Parts usage for DEMO-WO-COMPLETE-001 ───────────────────────────────
    // Consumes one DEMO-FILTER-AHU-20X24 to record part usage and stock pressure.
    // Inventory quantity is decremented only if the part record is newly inserted.

    const partInserted = await ensureWorkOrderPart(
        service, tenantId, woComplete001Id, filterId, 1, filterUnitCost, technicianId,
    )
    if (partInserted) {
        // Direct service-role UPDATE to decrement quantity.
        // inventory_items has no sensitive-field UPDATE trigger — this is safe.
        const currentQty = Number((filterItem as { id: string; quantity: number | null; unit_cost: number | null }).quantity ?? 3)
        const newQty = Math.max(0, currentQty - 1)
        const { error: updateError } = await service
            .from('inventory_items')
            .update({ quantity: newQty })
            .eq('id', filterId)
            .eq('tenant_id', tenantId)
        if (updateError) {
            console.warn(`  inventory quantity decrement failed (non-fatal): ${updateError.message}`)
        } else {
            note(`Parts: consumed 1× DEMO-FILTER-AHU-20X24 on DEMO-WO-COMPLETE-001; stock ${currentQty} → ${newQty} (low-stock signal active, min=8)`)
        }
    } else {
        note('Parts: DEMO-WO-COMPLETE-001 part record already exists; inventory not double-decremented')
    }

    // ── 7. Advance PM schedule next_due_date ──────────────────────────────────
    // Prevents pm_generate_due_work_orders from generating another WO for this
    // cycle as long as DEMO-WO-PM-001 remains non-terminal. After the demo, when
    // DEMO-WO-PM-001 is completed, the schedule advances to next month naturally.
    // We also update last_generated_date and total_generated for reporting signals.

    const nextMonthDate = new Date(now)
    nextMonthDate.setMonth(nextMonthDate.getMonth() + 1)
    const nextMonthIso = nextMonthDate.toISOString().slice(0, 10)

    const { error: schedUpdateError } = await service
        .from('pm_schedules')
        .update({
            last_generated_date: today,
            total_generated: 1,
            next_due_date: nextMonthIso,
            updated_at: nowIso,
        })
        .eq('id', pmScheduleId)
        .eq('tenant_id', tenantId)
    if (schedUpdateError) {
        console.warn(`  pm_schedules advance failed (non-fatal): ${schedUpdateError.message}`)
    } else {
        note(`PM schedule: next_due_date advanced to ${nextMonthIso} to prevent duplicate generation`)
    }

    console.log('')
    console.log('Work-orders write complete. In-process verify follows.')
    console.log('')
    await runVerifyMode(supabaseUrl)

    return { summary }
}

async function main() {
    const supabaseUrl = requiredEnv('VITE_SUPABASE_URL', ['SUPABASE_URL'])
    assertApprovedStagingUrl(supabaseUrl)

    const mode = getMode()

    if (mode === 'verify') {
        await runVerifyMode(supabaseUrl)
        return
    }

    if (mode === 'write-foundation') {
        await seedDemoFoundation(supabaseUrl)
        return
    }

    if (mode === 'write-workorders') {
        await seedDemoWorkOrders(supabaseUrl)
        return
    }

    console.log('Demo tenant seed skeleton: PLAN MODE')
    console.log(`Approved project ref: ${APPROVED_PROJECT_REF}`)
    console.log('Writes: disabled')
    console.log(JSON.stringify(demoManifest, null, 2))

    if (getEnv('DEMO_SEED_READ_CHECK') === 'true') {
        await readOnlyTenantCheck(supabaseUrl)
    } else {
        console.log(
            'No database calls made. Use DEMO_SEED_MODE=verify for read-only verification, DEMO_SEED_MODE=write-foundation for Phase 2 writes, or DEMO_SEED_MODE=write-workorders for Phase 3 writes.',
        )
    }
}

main().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
})
