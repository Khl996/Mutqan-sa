export type MaintenancePlanStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived'
export type MaintenanceTaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'
export type MaintenanceExecutionStatus = 'draft' | 'in_progress' | 'completed' | 'approved' | 'needs_rework'
export type MaintenanceTaskReviewStatus = 'not_required' | 'pending' | 'approved' | 'needs_rework'
export type PmPriority = 'low' | 'medium' | 'high' | 'critical'
export type ChecklistTemplateItemType = 'yes_no' | 'numeric' | 'text' | 'photo' | 'signature' | 'select' | 'reading'
export type TaskCheckStatus = 'pending' | 'pass' | 'fail' | 'na'
export type MaintenancePlanTargetType = 'asset' | 'building' | 'asset_group'
export type MaintenanceFrequencyType = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'semi_annual' | 'annual' | 'custom'
export type ChecklistTemplateStatus = 'draft' | 'active' | 'archived'
export type ChecklistTemplateType = 'pm_sheet' | 'inspection_sheet' | 'safety_sheet' | 'general'
export type ChecklistTemplateSectionType = 'readings' | 'visual' | 'safety' | 'notes' | 'photos' | 'approval' | 'general' | 'custom'
export type MaintenanceTaskAttachmentType =
    | 'general'
    | 'before_photo'
    | 'after_photo'
    | 'check_photo'
    | 'signature'
    | 'review_signature'
    | 'pdf_reference'

export interface PmBuildingRef {
    id: string
    name: string
    name_ar: string | null
}

export interface PmAssetRef {
    id: string
    code: string
    name: string
    name_ar: string | null
    building_id?: string | null
}

export interface PmProfileRef {
    id: string
    full_name: string | null
    full_name_ar: string | null
    role?: string | null
}

export interface PmTeamRef {
    id: string
    code?: string | null
    name: string
    name_ar: string | null
    type?: string | null
}

export interface ChecklistItemLegacy {
    id: string
    text: string
    text_ar: string
    checked: boolean
}

export interface MaintenancePlan {
    id: string
    tenant_id: string
    code: string | null
    name: string
    name_ar: string | null
    year: number
    status: MaintenancePlanStatus
    priority: PmPriority
    description: string | null
    budget: number | null
    start_date: string | null
    end_date: string | null
    completion_rate: number | null
    total_tasks: number | null
    completed_tasks: number | null
    building_id: string | null
    building?: PmBuildingRef | null
    notes: string | null
    created_by: string | null
    created_at: string
    updated_at: string
    targets?: MaintenancePlanTarget[]
    frequency_bundles?: MaintenanceFrequencyBundle[]
}

export interface CreatePlanInput {
    code?: string | null
    name: string
    name_ar?: string | null
    year: number
    priority?: PmPriority
    building_id?: string | null
    budget?: number | null
    start_date?: string | null
    end_date?: string | null
    description?: string | null
    notes?: string | null
}

export interface UpdatePlanInput extends Partial<CreatePlanInput> {
    status?: MaintenancePlanStatus
}

export interface AssetGroup {
    id: string
    tenant_id: string
    code: string | null
    name: string
    name_ar: string | null
    description: string | null
    building_id: string | null
    building?: PmBuildingRef | null
    is_active: boolean
    created_by: string | null
    created_at: string
    updated_at: string
    items?: AssetGroupItem[]
}

export interface AssetGroupItem {
    id: string
    asset_group_id: string
    asset_id: string
    role: string | null
    sort_order: number
    notes: string | null
    created_at: string
    asset?: PmAssetRef | null
}

export interface CreateAssetGroupInput {
    code?: string | null
    name: string
    name_ar?: string | null
    description?: string | null
    building_id?: string | null
    asset_ids?: string[]
}

export type UpdateAssetGroupInput = Partial<CreateAssetGroupInput> & {
    is_active?: boolean
}

export interface MaintenancePlanTarget {
    id: string
    tenant_id: string
    plan_id: string
    target_type: MaintenancePlanTargetType
    asset_id: string | null
    building_id: string | null
    asset_group_id: string | null
    is_primary: boolean
    role: string | null
    notes: string | null
    label_snapshot: Record<string, unknown>
    created_at: string
    updated_at: string
    asset?: PmAssetRef | null
    building?: PmBuildingRef | null
    assetGroup?: Pick<AssetGroup, 'id' | 'code' | 'name' | 'name_ar' | 'building_id'> | null
}

export interface CreatePlanTargetInput {
    plan_id: string
    target_type: MaintenancePlanTargetType
    asset_id?: string | null
    building_id?: string | null
    asset_group_id?: string | null
    is_primary?: boolean
    role?: string | null
    notes?: string | null
    label_snapshot?: Record<string, unknown>
}

export type UpdatePlanTargetInput = Partial<Omit<CreatePlanTargetInput, 'plan_id' | 'target_type'>>

export interface ChecklistTemplate {
    id: string
    tenant_id: string
    code: string | null
    name: string
    name_ar: string | null
    description: string | null
    description_ar: string | null
    category: string | null
    asset_type: string | null
    is_active: boolean
    version: number
    status: ChecklistTemplateStatus
    template_type: ChecklistTemplateType
    metadata: Record<string, unknown>
    total_items: number
    created_by: string | null
    created_at: string
    updated_at: string
    sections?: ChecklistTemplateSection[]
}

export interface CreateTemplateInput {
    code?: string | null
    name: string
    name_ar?: string | null
    description?: string | null
    description_ar?: string | null
    category?: string | null
    asset_type?: string | null
    is_active?: boolean
    version?: number
    status?: ChecklistTemplateStatus
    template_type?: ChecklistTemplateType
    metadata?: Record<string, unknown>
}

export type UpdateTemplateInput = Partial<CreateTemplateInput>

export interface ChecklistTemplateSection {
    id: string
    template_id: string
    code: string | null
    title: string
    title_ar: string | null
    description: string | null
    description_ar: string | null
    section_type: ChecklistTemplateSectionType
    sort_order: number
    is_collapsible: boolean
    metadata: Record<string, unknown>
    created_at: string
    updated_at: string
}

export interface CreateTemplateSectionInput {
    code?: string | null
    title: string
    title_ar?: string | null
    description?: string | null
    description_ar?: string | null
    section_type?: ChecklistTemplateSectionType
    sort_order?: number
    is_collapsible?: boolean
    metadata?: Record<string, unknown>
}

export type UpdateTemplateSectionInput = Partial<CreateTemplateSectionInput>

export interface MaintenanceFrequencyBundle {
    id: string
    tenant_id: string
    plan_id: string
    code: string | null
    name: string
    name_ar: string | null
    frequency_type: MaintenanceFrequencyType
    interval_count: number
    checklist_template_id: string | null
    checklistTemplate?: Pick<ChecklistTemplate, 'id' | 'name' | 'name_ar' | 'category' | 'asset_type' | 'total_items'> | null
    default_assigned_to: string | null
    defaultAssignee?: PmProfileRef | null
    default_assigned_team_id: string | null
    defaultTeam?: PmTeamRef | null
    estimated_duration_minutes: number | null
    is_active: boolean
    sort_order: number
    instructions: string | null
    created_by: string | null
    created_at: string
    updated_at: string
}

export interface CreateFrequencyBundleInput {
    plan_id: string
    code?: string | null
    name: string
    name_ar?: string | null
    frequency_type: MaintenanceFrequencyType
    interval_count?: number
    checklist_template_id?: string | null
    default_assigned_to?: string | null
    default_assigned_team_id?: string | null
    estimated_duration_minutes?: number | null
    is_active?: boolean
    sort_order?: number
    instructions?: string | null
}

export type UpdateFrequencyBundleInput = Partial<Omit<CreateFrequencyBundleInput, 'plan_id'>>

export interface ChecklistTemplateItem {
    id: string
    template_id: string
    section_id: string | null
    section?: ChecklistTemplateSection | null
    sort_order: number
    label: string
    label_ar: string | null
    item_type: ChecklistTemplateItemType
    is_required: boolean
    is_critical: boolean
    unit: string | null
    min_value: number | null
    max_value: number | null
    warning_min_value: number | null
    warning_max_value: number | null
    placeholder: string | null
    placeholder_ar: string | null
    help_text: string | null
    help_text_ar: string | null
    applies_to_target_type: MaintenancePlanTargetType | 'all'
    options: Record<string, unknown> | string[] | null
    description: string | null
    description_ar: string | null
    metadata: Record<string, unknown>
    created_at: string
}

export interface CreateTemplateItemInput {
    section_id?: string | null
    sort_order?: number
    label: string
    label_ar?: string | null
    item_type?: ChecklistTemplateItemType
    is_required?: boolean
    is_critical?: boolean
    unit?: string | null
    min_value?: number | null
    max_value?: number | null
    warning_min_value?: number | null
    warning_max_value?: number | null
    placeholder?: string | null
    placeholder_ar?: string | null
    help_text?: string | null
    help_text_ar?: string | null
    applies_to_target_type?: MaintenancePlanTargetType | 'all'
    options?: Record<string, unknown> | string[] | null
    description?: string | null
    description_ar?: string | null
    metadata?: Record<string, unknown>
}

export type UpdateTemplateItemInput = Partial<CreateTemplateItemInput>

export interface MaintenanceTask {
    id: string
    tenant_id: string
    maintenance_plan_id: string | null
    plan?: Pick<MaintenancePlan, 'id' | 'name' | 'name_ar' | 'status'> | null
    title: string
    description: string | null
    assigned_to: string | null
    assignee?: PmProfileRef | null
    assigned_team_id: string | null
    assignedTeam?: PmTeamRef | null
    status: MaintenanceTaskStatus
    priority: PmPriority | string
    due_date: string | null
    related_work_order_id: string | null
    created_by: string | null
    created_at: string
    updated_at: string
    recurrence_type?: 'once' | 'daily' | 'weekly' | 'monthly' | 'custom' | null
    recurrence_interval?: number | null
    checklist: ChecklistItemLegacy[]
    completion_notes: string | null
    asset_id: string | null
    asset?: PmAssetRef | null
    building_id: string | null
    building?: PmBuildingRef | null
    checklist_template_id: string | null
    checklistTemplate?: Pick<ChecklistTemplate, 'id' | 'name' | 'name_ar' | 'category' | 'asset_type'> | null
    frequency_bundle_id: string | null
    frequencyBundle?: Pick<MaintenanceFrequencyBundle, 'id' | 'name' | 'name_ar' | 'frequency_type' | 'interval_count'> | null
    started_at: string | null
    completed_at: string | null
    estimated_duration_minutes: number | null
    actual_duration_minutes: number | null
    requires_photo: boolean | null
    requires_signature: boolean | null
    attachments: string[] | Record<string, unknown>[] | null
    execution_snapshot: MaintenanceExecutionSnapshot | null
    execution_reference: string | null
    execution_status: MaintenanceExecutionStatus
    execution_started_by: string | null
    execution_completed_by: string | null
    execution_completed_at: string | null
    executor_signature_url: string | null
    review_status: MaintenanceTaskReviewStatus
    reviewed_by: string | null
    reviewer?: PmProfileRef | null
    reviewed_at: string | null
    review_notes: string | null
    reviewer_signature_url: string | null
    pdf_export_count: number | null
    latest_pdf_export_id: string | null
    latest_pdf_url: string | null
    latest_pdf_exported_at: string | null
}

export interface CreateTaskInput {
    maintenance_plan_id?: string | null
    frequency_bundle_id?: string | null
    title: string
    description?: string | null
    assigned_to?: string | null
    assigned_team_id?: string | null
    due_date?: string | null
    priority?: PmPriority
    asset_id?: string | null
    building_id?: string | null
    checklist_template_id?: string | null
    checklist?: ChecklistItemLegacy[]
    estimated_duration_minutes?: number | null
    requires_photo?: boolean
    requires_signature?: boolean
    recurrence_type?: 'once' | 'daily' | 'weekly' | 'monthly' | 'custom'
    recurrence_interval?: number
    shouldCreateWorkOrder?: boolean
    execution_snapshot?: MaintenanceExecutionSnapshot | null
}

export interface UpdateTaskInput extends Partial<CreateTaskInput> {
    title?: string
    status?: MaintenanceTaskStatus
    related_work_order_id?: string | null
    completion_notes?: string | null
    actual_duration_minutes?: number | null
    started_at?: string | null
    completed_at?: string | null
    attachments?: string[] | Record<string, unknown>[] | null
    executor_signature_url?: string | null
    reviewer_signature_url?: string | null
    review_notes?: string | null
    review_status?: MaintenanceTaskReviewStatus
}

export interface MaintenanceTaskAttachment {
    id: string
    tenant_id: string
    task_id: string
    check_id: string | null
    attachment_type: MaintenanceTaskAttachmentType
    file_name: string
    file_url: string
    storage_bucket: string | null
    storage_path: string | null
    mime_type: string | null
    file_size: number | null
    notes: string | null
    metadata: Record<string, unknown>
    uploaded_by: string | null
    uploaded_at: string
}

export interface CreateTaskAttachmentInput {
    task_id: string
    check_id?: string | null
    attachment_type?: MaintenanceTaskAttachmentType
    file_name: string
    file_url: string
    storage_bucket?: string | null
    storage_path?: string | null
    mime_type?: string | null
    file_size?: number | null
    notes?: string | null
    metadata?: Record<string, unknown>
}

export interface PmPdfExport {
    id: string
    tenant_id: string
    task_id: string
    export_number: number
    file_name: string
    file_url: string | null
    export_format: 'pdf'
    rendered_snapshot: Record<string, unknown>
    results_snapshot: Record<string, unknown>
    metadata: Record<string, unknown>
    generated_by: string | null
    generated_at: string
}

export interface RecordPdfExportInput {
    task_id: string
    file_name: string
    file_url?: string | null
    rendered_snapshot?: Record<string, unknown>
    results_snapshot?: Record<string, unknown>
    metadata?: Record<string, unknown>
}

export interface ReviewMaintenanceTaskInput {
    review_status: Exclude<MaintenanceTaskReviewStatus, 'not_required' | 'pending'>
    review_notes?: string | null
    reviewer_signature_url?: string | null
}

export interface MaintenanceTaskCheck {
    id: string
    task_id: string
    template_item_id: string
    sort_order: number
    value_bool: boolean | null
    value_numeric: number | null
    value_text: string | null
    value_photo_url: string | null
    value_signature_url: string | null
    status: TaskCheckStatus | null
    notes: string | null
    checked_by: string | null
    checked_at: string | null
    created_at: string
    updated_at: string
    template_item?: ChecklistTemplateItem | null
}

export interface UpdateCheckInput {
    value_bool?: boolean | null
    value_numeric?: number | null
    value_text?: string | null
    value_photo_url?: string | null
    value_signature_url?: string | null
    status?: TaskCheckStatus | null
    notes?: string | null
}

export interface MaintenanceExecutionSnapshot {
    version: number
    snapshot_type: 'pm_execution'
    created_at: string
    task?: Record<string, unknown>
    plan?: Record<string, unknown>
    frequency_bundle?: Record<string, unknown>
    template?: Record<string, unknown>
    targets?: Record<string, unknown>[]
    sections?: ChecklistTemplateSection[]
    items?: ChecklistTemplateItem[]
}

export interface AssetMaintenanceRecord {
    asset_id: string | null
    task_id: string
    task_title: string
    task_status: MaintenanceTaskStatus
    due_date: string | null
    completed_at: string | null
    assigned_to: string | null
    technician_name: string | null
    maintenance_plan_id: string | null
    plan_name: string | null
    related_work_order_id: string | null
    checklist_template_id: string | null
    template_name: string | null
    tenant_id: string
    created_at: string
    execution_reference?: string | null
    execution_status?: MaintenanceExecutionStatus | null
    review_status?: MaintenanceTaskReviewStatus | null
    reviewed_at?: string | null
    latest_pdf_export_id?: string | null
    latest_pdf_url?: string | null
    latest_pdf_exported_at?: string | null
}
