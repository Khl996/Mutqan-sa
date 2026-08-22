-- =====================================================================
-- Mutqan CMMS — Database Baseline (Supabase-native, single-file build)
-- ---------------------------------------------------------------------
-- This single migration builds the ENTIRE public schema from scratch:
--   57 tables, 342 constraints, 138 indexes, 106 functions, 42 triggers,
--   2 views, 173 RLS policies, 679 grants, 45 comments, 4 sequences.
--
-- Extracted faithfully from the production database (PostgreSQL 17.x)
-- using PostgreSQL catalog functions (pg_get_functiondef / constraintdef
-- / indexdef / triggerdef / viewdef). It is the authoritative source of
-- truth and replaces the historical 001..130 incremental migrations.
--
-- ASSUMES a Supabase environment, i.e. the following already exist:
--   * schemas:  auth, extensions, vault
--   * roles:    anon, authenticated, service_role
--   * the auth.users table (referenced by foreign keys)
-- For LOCAL (non-Supabase / plain PostgreSQL) verification, apply
-- verify/local_stubs.sql BEFORE this file.
--
-- Dependency order: extensions -> sequences -> tables -> constraints ->
--   foreign keys -> indexes -> functions -> triggers -> views ->
--   RLS/policies -> grants -> comments.
-- =====================================================================

SET statement_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET client_min_messages = warning;
SET row_security = off;

-- ===== EXTENSIONS & SEQUENCES =====
-- ============================================================
-- 01 — Extensions & standalone sequences (extracted from prod via MCP, read-only)
-- NOTE: extensions/vault/auth/storage schemas are Supabase-platform managed.
-- pg_net + supabase_vault are NOT installable on plain PG16 → stubbed for local verify only.
-- ============================================================

-- Extensions (as in production)
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- Standalone sequences (not owned by any identity/serial column)
CREATE SEQUENCE IF NOT EXISTS public.intake_report_number_seq AS bigint START 1 INCREMENT 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq      AS bigint START 1 INCREMENT 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.quote_number_seq        AS bigint START 1 INCREMENT 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1;
CREATE SEQUENCE IF NOT EXISTS public.work_order_number_seq   AS bigint START 1 INCREMENT 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1;

-- ===== TABLES =====
CREATE TABLE IF NOT EXISTS public.asset_activity_logs (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid,
    asset_id uuid,
    performed_by uuid,
    action_type text NOT NULL,
    previous_status text,
    new_status text,
    notes text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.asset_categories (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id uuid,
    code character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    name_ar character varying(255),
    parent_id uuid,
    icon character varying(50),
    color character varying(7),
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.assets (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id uuid NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    name_ar character varying(255),
    description text,
    category_id uuid,
    category character varying(100),
    subcategory character varying(100),
    type character varying(100),
    status character varying(30) DEFAULT 'operational'::character varying,
    criticality character varying(20) DEFAULT 'medium'::character varying,
    model character varying(100),
    serial_number character varying(100),
    manufacturer character varying(255),
    manufacture_year integer,
    specifications jsonb DEFAULT '{}'::jsonb,
    purchase_date date,
    purchase_cost numeric(12,2),
    installation_date date,
    depreciation_annual numeric(10,2),
    expected_lifespan_years integer,
    current_value numeric(12,2),
    warranty_provider character varying(255),
    warranty_expiry date,
    supplier character varying(255),
    supplier_contact text,
    building_id uuid,
    floor_id uuid,
    department_id uuid,
    room_id uuid,
    coordinates_x numeric(10,2),
    coordinates_y numeric(10,2),
    parent_asset_id uuid,
    qr_code character varying(100),
    barcode character varying(100),
    rfid_tag character varying(100),
    image_url text,
    images jsonb DEFAULT '[]'::jsonb,
    documents jsonb DEFAULT '[]'::jsonb,
    last_maintenance_date date,
    next_maintenance_date date,
    maintenance_frequency_days integer,
    custom_fields jsonb DEFAULT '{}'::jsonb,
    tags text[],
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    qr_code_url text,
    qr_data jsonb,
    asset_level character varying(20) NOT NULL DEFAULT 'equipment'::character varying
);

CREATE TABLE IF NOT EXISTS public.billing_add_ons (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    code character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    name_ar character varying(100) NOT NULL,
    description text,
    description_ar text,
    price numeric(10,2) NOT NULL DEFAULT 0,
    billing_type character varying(20) NOT NULL DEFAULT 'one_time'::character varying,
    is_active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.billing_invoices (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    invoice_number character varying(20) NOT NULL,
    tenant_id uuid NOT NULL,
    subscription_id uuid,
    quote_id uuid,
    subtotal numeric(10,2) NOT NULL DEFAULT 0,
    discount_amount numeric(10,2) NOT NULL DEFAULT 0,
    tax_rate numeric(5,4) NOT NULL DEFAULT 0.0000,
    tax_amount numeric(10,2) NOT NULL DEFAULT 0,
    total numeric(10,2) NOT NULL DEFAULT 0,
    status character varying(20) NOT NULL DEFAULT 'draft'::character varying,
    payment_method character varying(20),
    payment_reference character varying(255),
    paid_at timestamp with time zone,
    billing_period_start date,
    billing_period_end date,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.billing_quotes (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    quote_number character varying(50) NOT NULL,
    tenant_id uuid NOT NULL,
    plan_id uuid NOT NULL,
    discount_policy_id uuid,
    status character varying(20) NOT NULL DEFAULT 'draft'::character varying,
    billing_cycle character varying(20) NOT NULL DEFAULT 'yearly'::character varying,
    line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
    subtotal numeric(10,2) NOT NULL DEFAULT 0,
    discount_amount numeric(10,2) NOT NULL DEFAULT 0,
    tax_rate numeric(5,4) NOT NULL DEFAULT 0.0000,
    tax_amount numeric(10,2) NOT NULL DEFAULT 0,
    total numeric(10,2) NOT NULL DEFAULT 0,
    valid_until date NOT NULL,
    pricing_snapshot jsonb,
    admin_notes text,
    client_notes text,
    created_by uuid,
    approved_by uuid,
    approved_at timestamp with time zone,
    activated_by uuid,
    activated_at timestamp with time zone,
    subscription_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.buildings (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id uuid NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    name_ar character varying(255),
    description text,
    address text,
    coordinates_lat numeric(10,8),
    coordinates_lng numeric(11,8),
    image_url text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.checklist_template_items (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    template_id uuid NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    label character varying(500) NOT NULL,
    label_ar character varying(500),
    item_type character varying(20) NOT NULL DEFAULT 'yes_no'::character varying,
    is_required boolean NOT NULL DEFAULT false,
    is_critical boolean NOT NULL DEFAULT false,
    options jsonb,
    description text,
    description_ar text,
    created_at timestamp with time zone DEFAULT now(),
    section_id uuid,
    unit character varying(50),
    min_value numeric(12,4),
    max_value numeric(12,4),
    warning_min_value numeric(12,4),
    warning_max_value numeric(12,4),
    placeholder text,
    placeholder_ar text,
    help_text text,
    help_text_ar text,
    applies_to_target_type character varying(20) NOT NULL DEFAULT 'all'::character varying,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.checklist_template_sections (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    template_id uuid NOT NULL,
    code character varying(50),
    title character varying(200) NOT NULL,
    title_ar character varying(200),
    description text,
    description_ar text,
    section_type character varying(30) NOT NULL DEFAULT 'general'::character varying,
    sort_order integer NOT NULL DEFAULT 0,
    is_collapsible boolean NOT NULL DEFAULT false,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.checklist_templates (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    code character varying(50),
    name character varying(200) NOT NULL,
    name_ar character varying(200),
    description text,
    description_ar text,
    category character varying(50),
    asset_type character varying(50),
    total_items integer NOT NULL DEFAULT 0,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    version integer NOT NULL DEFAULT 1,
    status character varying(20) NOT NULL DEFAULT 'active'::character varying,
    template_type character varying(30) NOT NULL DEFAULT 'pm_sheet'::character varying,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_active boolean GENERATED ALWAYS AS (((status)::text = 'active'::text)) STORED
);

CREATE TABLE IF NOT EXISTS public.custom_roles (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id uuid NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    name_ar character varying(100),
    description text,
    permissions jsonb DEFAULT '[]'::jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.departments (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    floor_id uuid,
    building_id uuid,
    tenant_id uuid NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    name_ar character varying(255),
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.discount_policies (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    code character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    name_ar character varying(100) NOT NULL,
    description text,
    description_ar text,
    discount_type character varying(20) NOT NULL,
    discount_value numeric(10,2) NOT NULL,
    valid_from timestamp with time zone,
    valid_to timestamp with time zone,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.floors (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    building_id uuid NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    name_ar character varying(255),
    level integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.intake_messages (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    intake_report_id uuid NOT NULL,
    direction text NOT NULL,
    message_type text NOT NULL DEFAULT 'text'::text,
    body text,
    raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    actor_user_id uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.intake_reports (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    access_token_id uuid,
    report_number text NOT NULL,
    public_access_token text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'::text),
    channel text NOT NULL DEFAULT 'pwa_qr'::text,
    status text NOT NULL DEFAULT 'collecting'::text,
    reporter_identity_status text NOT NULL DEFAULT 'unknown'::text,
    current_step text NOT NULL DEFAULT 'collecting'::text,
    reporter_name text,
    reporter_phone text,
    initial_message text,
    location_hint jsonb NOT NULL DEFAULT '{}'::jsonb,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    converted_work_order_id uuid,
    submitted_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory_categories (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id uuid,
    name character varying(255) NOT NULL,
    name_ar character varying(255),
    description text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory_items (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id uuid NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    name_ar character varying(255),
    description text,
    part_number character varying(100),
    manufacturer character varying(255),
    category_id uuid,
    quantity numeric(10,2) DEFAULT 0,
    min_quantity numeric(10,2) DEFAULT 0,
    max_quantity numeric(10,2),
    unit_of_measure character varying(20) DEFAULT 'pcs'::character varying,
    location character varying(100),
    unit_cost numeric(12,2) DEFAULT 0,
    selling_price numeric(12,2),
    image_url text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory_transactions (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id uuid NOT NULL,
    item_id uuid NOT NULL,
    transaction_type character varying(20) NOT NULL,
    quantity numeric(10,2) NOT NULL,
    quantity_before numeric(10,2),
    quantity_after numeric(10,2),
    notes text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.issue_types (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id uuid,
    code character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    name_ar character varying(255),
    description text,
    default_team_id uuid,
    default_priority character varying(20) DEFAULT 'medium'::character varying,
    sla_hours integer,
    icon character varying(50),
    color character varying(7),
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.job_plan_items (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    job_plan_id uuid NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    section_name character varying(100),
    section_name_ar character varying(100),
    label character varying(500) NOT NULL,
    label_ar character varying(500),
    description text,
    description_ar text,
    help_text text,
    help_text_ar text,
    item_type character varying(20) NOT NULL DEFAULT 'yes_no'::character varying,
    is_required boolean NOT NULL DEFAULT false,
    is_critical boolean NOT NULL DEFAULT false,
    unit character varying(20),
    min_value numeric(14,4),
    max_value numeric(14,4),
    warning_min numeric(14,4),
    warning_max numeric(14,4),
    options jsonb,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.job_plans (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    code character varying(50),
    name character varying(200) NOT NULL,
    name_ar character varying(200),
    description text,
    description_ar text,
    category character varying(50),
    asset_type_hint character varying(50),
    status character varying(20) NOT NULL DEFAULT 'draft'::character varying,
    version integer NOT NULL DEFAULT 1,
    estimated_duration_minutes integer,
    requires_safety_checks boolean NOT NULL DEFAULT false,
    safety_notes text,
    safety_notes_ar text,
    required_parts jsonb NOT NULL DEFAULT '[]'::jsonb,
    total_items integer NOT NULL DEFAULT 0,
    usage_count integer NOT NULL DEFAULT 0,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    required_tools jsonb NOT NULL DEFAULT '[]'::jsonb,
    required_materials jsonb NOT NULL DEFAULT '[]'::jsonb,
    reference_documents jsonb NOT NULL DEFAULT '[]'::jsonb,
    required_skill character varying(100),
    required_role character varying(50)
);

CREATE TABLE IF NOT EXISTS public.maintenance_frequency_bundles (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    plan_id uuid NOT NULL,
    code character varying(50),
    name character varying(200) NOT NULL,
    name_ar character varying(200),
    frequency_type character varying(20) NOT NULL DEFAULT 'monthly'::character varying,
    interval_count integer NOT NULL DEFAULT 1,
    checklist_template_id uuid,
    default_assigned_to uuid,
    default_assigned_team_id uuid,
    estimated_duration_minutes integer,
    is_active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    instructions text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.maintenance_plan_targets (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    plan_id uuid NOT NULL,
    target_type character varying(20) NOT NULL,
    asset_id uuid,
    building_id uuid,
    asset_group_id uuid,
    is_primary boolean NOT NULL DEFAULT false,
    role character varying(100),
    notes text,
    label_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.maintenance_plans (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id uuid NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    name_ar character varying(255),
    year integer NOT NULL,
    status character varying(20) NOT NULL DEFAULT 'draft'::character varying,
    description text,
    budget numeric(12,2) DEFAULT 0,
    start_date date,
    end_date date,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    priority character varying(20) DEFAULT 'medium'::character varying,
    completion_rate numeric(5,2) DEFAULT 0,
    total_tasks integer DEFAULT 0,
    completed_tasks integer DEFAULT 0,
    building_id uuid,
    notes text
);

CREATE TABLE IF NOT EXISTS public.maintenance_task_attachments (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    task_id uuid NOT NULL,
    check_id uuid,
    attachment_type character varying(30) NOT NULL DEFAULT 'general'::character varying,
    file_name character varying(255) NOT NULL,
    file_url text NOT NULL,
    storage_bucket text,
    storage_path text,
    mime_type character varying(120),
    file_size integer,
    notes text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    uploaded_by uuid,
    uploaded_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.maintenance_task_checks (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    task_id uuid NOT NULL,
    template_item_id uuid NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    value_bool boolean,
    value_numeric numeric(12,4),
    value_text text,
    value_photo_url text,
    value_signature_url text,
    status character varying(20) DEFAULT 'pending'::character varying,
    notes text,
    checked_by uuid,
    checked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.maintenance_tasks (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id uuid NOT NULL,
    maintenance_plan_id uuid,
    title character varying(255) NOT NULL,
    description text,
    assigned_to uuid,
    status character varying(20) NOT NULL DEFAULT 'pending'::character varying,
    priority character varying(20) DEFAULT 'medium'::character varying,
    due_date date,
    related_work_order_id uuid,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    recurrence_type text NOT NULL DEFAULT 'once'::text,
    recurrence_interval integer NOT NULL DEFAULT 1,
    checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
    completion_notes text,
    asset_id uuid,
    building_id uuid,
    checklist_template_id uuid,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    estimated_duration_minutes integer,
    actual_duration_minutes integer,
    requires_photo boolean DEFAULT false,
    requires_signature boolean DEFAULT false,
    attachments jsonb DEFAULT '[]'::jsonb,
    frequency_bundle_id uuid,
    assigned_team_id uuid,
    execution_snapshot jsonb,
    execution_reference character varying(80),
    execution_status character varying(20) NOT NULL DEFAULT 'draft'::character varying,
    execution_started_by uuid,
    execution_completed_by uuid,
    execution_completed_at timestamp with time zone,
    executor_signature_url text,
    review_status character varying(20) NOT NULL DEFAULT 'not_required'::character varying,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    review_notes text,
    reviewer_signature_url text,
    pdf_export_count integer NOT NULL DEFAULT 0,
    latest_pdf_url text,
    latest_pdf_exported_at timestamp with time zone,
    latest_pdf_export_id uuid
);

CREATE TABLE IF NOT EXISTS public.notification_logs (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    recipient_user_id uuid,
    channel text NOT NULL,
    template_key text NOT NULL,
    status text NOT NULL DEFAULT 'queued'::text,
    related_entity_type text,
    related_entity_id uuid,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    error_message text,
    queued_at timestamp with time zone NOT NULL DEFAULT now(),
    sent_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    title character varying(255) NOT NULL,
    message text NOT NULL,
    type character varying(50) NOT NULL,
    link character varying(255),
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.operation_logs (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id uuid NOT NULL,
    code character varying(50) NOT NULL,
    type character varying(50) NOT NULL,
    asset_id uuid,
    asset_name character varying(255),
    work_order_id uuid,
    building_id uuid,
    location text,
    system_type character varying(100),
    reason text,
    description text NOT NULL,
    performed_by uuid,
    technician_name character varying(255),
    team_id uuid,
    "timestamp" timestamp with time zone DEFAULT now(),
    start_time timestamp with time zone,
    end_time timestamp with time zone,
    estimated_duration integer,
    actual_duration integer,
    status character varying(30) DEFAULT 'completed'::character varying,
    approval_required boolean DEFAULT false,
    approved_by uuid,
    approved_at timestamp with time zone,
    approval_notes text,
    emergency_measures text,
    affected_areas text[],
    notified_parties text[],
    photos jsonb DEFAULT '[]'::jsonb,
    documents jsonb DEFAULT '[]'::jsonb,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.operational_events (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    event_type text NOT NULL,
    actor_type text NOT NULL DEFAULT 'system'::text,
    actor_user_id uuid,
    source text NOT NULL DEFAULT 'intake_backend'::text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.password_reset_otps (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    email character varying(255) NOT NULL,
    otp_hash character varying(128) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    attempts integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    last_sent_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_audit_logs (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid,
    user_email character varying(255),
    user_name character varying(255),
    user_role character varying(50),
    action text NOT NULL,
    action_type character varying(50) NOT NULL,
    target_type character varying(100),
    target_id text,
    target_name character varying(255),
    old_values jsonb,
    new_values jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    ip_address inet,
    user_agent text,
    session_id character varying(255),
    success boolean DEFAULT true,
    error_message text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_settings (
    key character varying(100) NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    updated_by uuid
);

CREATE TABLE IF NOT EXISTS public.platform_staff (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid,
    profile_id uuid,
    role character varying(50) NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying,
    tenants_access character varying(20) DEFAULT 'none'::character varying,
    assigned_tenants uuid[] DEFAULT '{}'::uuid[],
    permissions jsonb DEFAULT '[]'::jsonb,
    custom_permissions jsonb DEFAULT '{}'::jsonb,
    notes text,
    hired_at date DEFAULT CURRENT_DATE,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    updated_by uuid
);

CREATE TABLE IF NOT EXISTS public.pm_generation_runs (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    run_id uuid NOT NULL,
    tenant_id uuid,
    requested_by uuid,
    requested_by_role text,
    run_scope text NOT NULL,
    generated_count integer NOT NULL DEFAULT 0,
    skipped_count integer NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'completed'::text,
    started_at timestamp with time zone NOT NULL DEFAULT now(),
    completed_at timestamp with time zone,
    error_message text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pm_pdf_exports (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    task_id uuid NOT NULL,
    export_number integer NOT NULL DEFAULT 1,
    file_name character varying(255) NOT NULL,
    file_url text,
    export_format character varying(20) NOT NULL DEFAULT 'pdf'::character varying,
    rendered_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    results_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    generated_by uuid,
    generated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pm_schedule_assets (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    schedule_id uuid NOT NULL,
    asset_id uuid NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pm_schedules (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    code character varying(50),
    name character varying(200) NOT NULL,
    name_ar character varying(200),
    description text,
    job_plan_id uuid NOT NULL,
    primary_asset_id uuid,
    trigger_type character varying(20) NOT NULL DEFAULT 'calendar'::character varying,
    frequency_type character varying(20),
    frequency_interval integer DEFAULT 1,
    meter_field character varying(50),
    meter_threshold numeric(14,4),
    condition_rule jsonb,
    start_date date NOT NULL DEFAULT CURRENT_DATE,
    end_date date,
    next_due_date date,
    last_generated_date date,
    lead_time_days integer NOT NULL DEFAULT 0,
    compliance_window_days integer,
    default_assignee_id uuid,
    default_team_id uuid,
    default_priority character varying(10) NOT NULL DEFAULT 'medium'::character varying,
    status character varying(20) NOT NULL DEFAULT 'draft'::character varying,
    total_generated integer NOT NULL DEFAULT 0,
    total_completed integer NOT NULL DEFAULT 0,
    total_overdue integer NOT NULL DEFAULT 0,
    compliance_rate numeric(5,2) DEFAULT 0,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    generation_mode character varying(20) NOT NULL DEFAULT 'batch_route'::character varying
);

CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid NOT NULL,
    tenant_id uuid,
    full_name character varying(255),
    full_name_ar character varying(255),
    email character varying(255),
    phone character varying(50),
    avatar_url text,
    role character varying(50) DEFAULT 'reporter'::character varying,
    is_super_admin boolean DEFAULT false,
    is_active boolean DEFAULT true,
    last_activity_at timestamp with time zone,
    department character varying(100),
    employee_number character varying(50),
    job_title character varying(100),
    supervisor_id uuid,
    language character varying(5) DEFAULT 'ar'::character varying,
    timezone character varying(50) DEFAULT 'Asia/Riyadh'::character varying,
    notification_preferences jsonb DEFAULT '{"push": true, "email": true}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rooms (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    department_id uuid,
    floor_id uuid,
    building_id uuid,
    tenant_id uuid NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    name_ar character varying(255),
    room_type character varying(50),
    capacity integer,
    coordinates_x numeric(10,2),
    coordinates_y numeric(10,2),
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    code character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    name_ar character varying(100) NOT NULL,
    description text,
    description_ar text,
    price_monthly numeric(10,2) NOT NULL DEFAULT 0,
    price_yearly numeric(10,2) NOT NULL DEFAULT 0,
    is_featured boolean DEFAULT false,
    included_users integer DEFAULT 5,
    included_assets integer DEFAULT 100,
    included_storage_mb integer DEFAULT 1000,
    included_work_orders integer DEFAULT 100,
    features jsonb DEFAULT '[]'::jsonb,
    modules jsonb DEFAULT '[]'::jsonb,
    is_active boolean NOT NULL DEFAULT true,
    display_order integer NOT NULL DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    max_users integer NOT NULL DEFAULT 5,
    max_buildings integer NOT NULL DEFAULT 1,
    max_assets integer NOT NULL DEFAULT 100,
    max_work_orders_monthly integer NOT NULL DEFAULT 100,
    max_storage_mb integer DEFAULT 500,
    is_popular boolean DEFAULT false,
    sort_order integer DEFAULT 0,
    is_default boolean DEFAULT false,
    trial_days integer DEFAULT 7
);

CREATE TABLE IF NOT EXISTS public.team_members (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    team_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role character varying(20) DEFAULT 'member'::character varying,
    specializations text[],
    joined_at timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.teams (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id uuid NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    name_ar character varying(255),
    description text,
    type character varying(50) DEFAULT 'maintenance'::character varying,
    specializations text[],
    status character varying(20) DEFAULT 'active'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tenant_access_tokens (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id uuid NOT NULL,
    token text NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid
);

CREATE TABLE IF NOT EXISTS public.tenant_modules (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id uuid NOT NULL,
    module_code character varying(50) NOT NULL,
    is_enabled boolean DEFAULT true,
    price numeric(10,2) DEFAULT 0,
    configuration jsonb DEFAULT '{}'::jsonb,
    features jsonb DEFAULT '{}'::jsonb,
    enabled_at timestamp with time zone,
    enabled_by uuid,
    disabled_at timestamp with time zone,
    disabled_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tenant_subscriptions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    plan_id uuid NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying,
    billing_cycle character varying(20) DEFAULT 'monthly'::character varying,
    current_period_start timestamp with time zone DEFAULT now(),
    current_period_end timestamp with time zone,
    trial_ends_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    amount numeric(10,2) NOT NULL DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    admin_note text,
    quote_id uuid,
    discount_policy_id uuid,
    activated_by character varying(20)
);

CREATE TABLE IF NOT EXISTS public.tenants (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    name character varying(255) NOT NULL,
    name_ar character varying(255),
    slug character varying(100) NOT NULL,
    description text,
    subscription_status character varying(20) DEFAULT 'trial'::character varying,
    plan_id uuid,
    subscription_starts_at timestamp with time zone,
    subscription_ends_at timestamp with time zone,
    trial_ends_at timestamp with time zone DEFAULT (now() + '14 days'::interval),
    billing_cycle character varying(20) DEFAULT 'monthly'::character varying,
    payment_method character varying(50),
    max_users integer DEFAULT 5,
    max_assets integer DEFAULT 100,
    max_work_orders_per_month integer DEFAULT 100,
    max_storage_mb integer DEFAULT 1000,
    enabled_modules jsonb DEFAULT '{}'::jsonb,
    logo_url text,
    logo_white_url text,
    primary_color character varying(7) DEFAULT '#2E3A45'::character varying,
    secondary_color character varying(7) DEFAULT '#3AAFA9'::character varying,
    email character varying(255),
    phone character varying(50),
    address text,
    website character varying(255),
    timezone character varying(50) DEFAULT 'Asia/Riyadh'::character varying,
    language character varying(5) DEFAULT 'ar'::character varying,
    currency character varying(3) DEFAULT 'SAR'::character varying,
    is_active boolean DEFAULT true,
    suspended_at timestamp with time zone,
    suspended_by uuid,
    suspension_reason text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    settings jsonb DEFAULT '{}'::jsonb,
    cr_number character varying(50),
    tax_number character varying(50),
    subscription_plan_id uuid,
    country character varying(100),
    city character varying(100),
    postal_code character varying(20),
    subscription_tier character varying(50)
);

CREATE TABLE IF NOT EXISTS public.user_custom_roles (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL,
    role_id uuid NOT NULL,
    assigned_by uuid,
    assigned_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.work_order_assets (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    work_order_id uuid NOT NULL,
    asset_id uuid NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    is_completed boolean NOT NULL DEFAULT false,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.work_order_attachments (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    work_order_id uuid NOT NULL,
    check_id uuid,
    attachment_type character varying(20) NOT NULL DEFAULT 'general'::character varying,
    file_name character varying(200),
    file_url text NOT NULL,
    mime_type character varying(50),
    file_size integer,
    notes text,
    uploaded_by uuid,
    uploaded_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.work_order_checks (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    work_order_id uuid NOT NULL,
    asset_id uuid,
    job_plan_item_id uuid,
    item_snapshot jsonb NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    value_bool boolean,
    value_numeric numeric(14,4),
    value_text text,
    value_options jsonb,
    value_photo_url text,
    value_signature_url text,
    status character varying(20) NOT NULL DEFAULT 'pending'::character varying,
    notes text,
    checked_by uuid,
    checked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.work_order_costs (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    work_order_id uuid NOT NULL,
    cost_type character varying(50) NOT NULL,
    description text,
    quantity numeric(10,2) DEFAULT 1,
    unit_cost numeric(12,2),
    total_cost numeric(12,2) GENERATED ALWAYS AS ((quantity * unit_cost)) STORED,
    currency character varying(3) DEFAULT 'SAR'::character varying,
    vendor_id uuid,
    invoice_number character varying(100),
    invoice_date date,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.work_order_drafts (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    intake_report_id uuid NOT NULL,
    status text NOT NULL DEFAULT 'ready_for_review'::text,
    title text NOT NULL,
    description text,
    priority text NOT NULL DEFAULT 'medium'::text,
    issue_type_id uuid,
    issue_type text,
    building_id uuid,
    floor_id uuid,
    department_id uuid,
    room_id uuid,
    asset_id uuid,
    reporter_name text,
    reporter_phone text,
    supervisor_note text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    converted_work_order_id uuid,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.work_order_parts (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id uuid NOT NULL,
    work_order_id uuid NOT NULL,
    part_id uuid NOT NULL,
    quantity numeric(10,2) NOT NULL,
    unit_cost numeric(12,2) NOT NULL,
    total_cost numeric(12,2) GENERATED ALWAYS AS ((quantity * unit_cost)) STORED,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid
);

CREATE TABLE IF NOT EXISTS public.work_orders (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id uuid NOT NULL,
    code character varying(50) NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    issue_type_id uuid,
    issue_type character varying(100),
    status character varying(50) DEFAULT 'pending'::character varying,
    priority character varying(20) DEFAULT 'medium'::character varying,
    reported_by uuid,
    assigned_to uuid,
    assigned_team uuid,
    created_by uuid,
    building_id uuid,
    floor_id uuid,
    department_id uuid,
    room_id uuid,
    asset_id uuid,
    company_id uuid,
    contractor_name character varying(255),
    reported_at timestamp with time zone DEFAULT now(),
    start_time timestamp with time zone,
    end_time timestamp with time zone,
    completed_at timestamp with time zone,
    due_date timestamp with time zone,
    technician_completed_at timestamp with time zone,
    technician_notes text,
    supervisor_approved_at timestamp with time zone,
    supervisor_approved_by uuid,
    supervisor_notes text,
    engineer_approved_at timestamp with time zone,
    engineer_approved_by uuid,
    engineer_notes text,
    customer_reviewed_at timestamp with time zone,
    customer_reviewed_by uuid,
    reporter_notes text,
    maintenance_manager_approved_at timestamp with time zone,
    maintenance_manager_approved_by uuid,
    maintenance_manager_notes text,
    auto_closed_at timestamp with time zone,
    pending_closure_since timestamp with time zone,
    attachments jsonb DEFAULT '[]'::jsonb,
    before_images jsonb DEFAULT '[]'::jsonb,
    after_images jsonb DEFAULT '[]'::jsonb,
    estimated_cost numeric(12,2),
    actual_cost numeric(12,2),
    sla_response_deadline timestamp with time zone,
    sla_resolution_deadline timestamp with time zone,
    sla_response_met boolean,
    sla_resolution_met boolean,
    custom_fields jsonb DEFAULT '{}'::jsonb,
    tags text[],
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    reporter_name text,
    reporter_phone text,
    maintenance_plan_id uuid,
    work_type character varying(20) NOT NULL DEFAULT 'reactive'::character varying,
    source_schedule_id uuid,
    job_plan_id uuid,
    scheduled_date date,
    compliance_deadline date,
    completion_notes text,
    actual_duration_minutes integer,
    started_at timestamp with time zone,
    source_schedule_asset_id uuid,
    job_plan_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    cancelled_at timestamp with time zone,
    cancellation_reason text
);

-- ===== PRIMARY KEYS / UNIQUE / CHECK =====
ALTER TABLE public.asset_activity_logs ADD CONSTRAINT asset_activity_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.asset_categories ADD CONSTRAINT asset_categories_pkey PRIMARY KEY (id);
ALTER TABLE public.assets ADD CONSTRAINT assets_asset_level_check CHECK (((asset_level)::text = ANY ((ARRAY['system'::character varying, 'equipment'::character varying, 'component'::character varying])::text[])));
ALTER TABLE public.assets ADD CONSTRAINT assets_criticality_check CHECK (((criticality)::text = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying, 'critical'::character varying])::text[])));
ALTER TABLE public.assets ADD CONSTRAINT assets_pkey PRIMARY KEY (id);
ALTER TABLE public.assets ADD CONSTRAINT assets_qr_code_key UNIQUE (qr_code);
ALTER TABLE public.assets ADD CONSTRAINT assets_status_check CHECK (((status)::text = ANY ((ARRAY['operational'::character varying, 'under_maintenance'::character varying, 'out_of_service'::character varying, 'retired'::character varying, 'pending_installation'::character varying, 'disposed'::character varying])::text[])));
ALTER TABLE public.assets ADD CONSTRAINT assets_tenant_id_code_key UNIQUE (tenant_id, code);
ALTER TABLE public.billing_add_ons ADD CONSTRAINT billing_add_ons_billing_type_check CHECK (((billing_type)::text = ANY ((ARRAY['recurring'::character varying, 'one_time'::character varying])::text[])));
ALTER TABLE public.billing_add_ons ADD CONSTRAINT billing_add_ons_code_key UNIQUE (code);
ALTER TABLE public.billing_add_ons ADD CONSTRAINT billing_add_ons_pkey PRIMARY KEY (id);
ALTER TABLE public.billing_invoices ADD CONSTRAINT billing_invoices_invoice_number_key UNIQUE (invoice_number);
ALTER TABLE public.billing_invoices ADD CONSTRAINT billing_invoices_payment_method_check CHECK (((payment_method)::text = ANY ((ARRAY['tap'::character varying, 'bank_transfer'::character varying, 'manual'::character varying])::text[])));
ALTER TABLE public.billing_invoices ADD CONSTRAINT billing_invoices_pkey PRIMARY KEY (id);
ALTER TABLE public.billing_invoices ADD CONSTRAINT billing_invoices_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'paid'::character varying, 'void'::character varying])::text[])));
ALTER TABLE public.billing_quotes ADD CONSTRAINT billing_quotes_billing_cycle_check CHECK (((billing_cycle)::text = ANY ((ARRAY['monthly'::character varying, 'yearly'::character varying])::text[])));
ALTER TABLE public.billing_quotes ADD CONSTRAINT billing_quotes_pkey PRIMARY KEY (id);
ALTER TABLE public.billing_quotes ADD CONSTRAINT billing_quotes_quote_number_key UNIQUE (quote_number);
ALTER TABLE public.billing_quotes ADD CONSTRAINT billing_quotes_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'approved'::character varying, 'activated'::character varying, 'expired'::character varying])::text[])));
ALTER TABLE public.buildings ADD CONSTRAINT buildings_pkey PRIMARY KEY (id);
ALTER TABLE public.buildings ADD CONSTRAINT buildings_tenant_id_code_key UNIQUE (tenant_id, code);
ALTER TABLE public.checklist_template_items ADD CONSTRAINT checklist_template_items_applies_to_target_type_check CHECK (((applies_to_target_type)::text = ANY ((ARRAY['all'::character varying, 'asset'::character varying, 'building'::character varying, 'asset_group'::character varying])::text[])));
ALTER TABLE public.checklist_template_items ADD CONSTRAINT checklist_template_items_item_type_check CHECK (((item_type)::text = ANY ((ARRAY['yes_no'::character varying, 'numeric'::character varying, 'text'::character varying, 'photo'::character varying, 'signature'::character varying, 'select'::character varying, 'reading'::character varying])::text[])));
ALTER TABLE public.checklist_template_items ADD CONSTRAINT checklist_template_items_pkey PRIMARY KEY (id);
ALTER TABLE public.checklist_template_sections ADD CONSTRAINT checklist_template_sections_pkey PRIMARY KEY (id);
ALTER TABLE public.checklist_template_sections ADD CONSTRAINT checklist_template_sections_section_type_check CHECK (((section_type)::text = ANY ((ARRAY['readings'::character varying, 'visual'::character varying, 'safety'::character varying, 'notes'::character varying, 'photos'::character varying, 'approval'::character varying, 'general'::character varying, 'custom'::character varying])::text[])));
ALTER TABLE public.checklist_templates ADD CONSTRAINT checklist_templates_pkey PRIMARY KEY (id);
ALTER TABLE public.checklist_templates ADD CONSTRAINT checklist_templates_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'active'::character varying, 'archived'::character varying])::text[])));
ALTER TABLE public.checklist_templates ADD CONSTRAINT checklist_templates_template_type_check CHECK (((template_type)::text = ANY ((ARRAY['pm_sheet'::character varying, 'inspection_sheet'::character varying, 'safety_sheet'::character varying, 'general'::character varying])::text[])));
ALTER TABLE public.checklist_templates ADD CONSTRAINT checklist_templates_version_check CHECK ((version > 0));
ALTER TABLE public.custom_roles ADD CONSTRAINT custom_roles_pkey PRIMARY KEY (id);
ALTER TABLE public.custom_roles ADD CONSTRAINT custom_roles_tenant_id_code_key UNIQUE (tenant_id, code);
ALTER TABLE public.departments ADD CONSTRAINT departments_pkey PRIMARY KEY (id);
ALTER TABLE public.departments ADD CONSTRAINT departments_tenant_id_code_key UNIQUE (tenant_id, code);
ALTER TABLE public.discount_policies ADD CONSTRAINT discount_policies_code_key UNIQUE (code);
ALTER TABLE public.discount_policies ADD CONSTRAINT discount_policies_discount_type_check CHECK (((discount_type)::text = ANY ((ARRAY['percentage'::character varying, 'fixed'::character varying])::text[])));
ALTER TABLE public.discount_policies ADD CONSTRAINT discount_policies_pkey PRIMARY KEY (id);
ALTER TABLE public.floors ADD CONSTRAINT floors_building_id_code_key UNIQUE (building_id, code);
ALTER TABLE public.floors ADD CONSTRAINT floors_pkey PRIMARY KEY (id);
ALTER TABLE public.intake_messages ADD CONSTRAINT intake_messages_direction_check CHECK ((direction = ANY (ARRAY['inbound'::text, 'outbound'::text, 'internal'::text])));
ALTER TABLE public.intake_messages ADD CONSTRAINT intake_messages_message_type_check CHECK ((message_type = ANY (ARRAY['text'::text, 'system'::text, 'confirmation'::text, 'attachment_placeholder'::text])));
ALTER TABLE public.intake_messages ADD CONSTRAINT intake_messages_pkey PRIMARY KEY (id);
ALTER TABLE public.intake_reports ADD CONSTRAINT intake_reports_channel_check CHECK ((channel = ANY (ARRAY['pwa_qr'::text, 'public_portal'::text, 'manual'::text])));
ALTER TABLE public.intake_reports ADD CONSTRAINT intake_reports_pkey PRIMARY KEY (id);
ALTER TABLE public.intake_reports ADD CONSTRAINT intake_reports_public_access_token_key UNIQUE (public_access_token);
ALTER TABLE public.intake_reports ADD CONSTRAINT intake_reports_reporter_identity_status_check CHECK ((reporter_identity_status = ANY (ARRAY['known'::text, 'unknown'::text, 'needs_verification'::text])));
ALTER TABLE public.intake_reports ADD CONSTRAINT intake_reports_status_check CHECK ((status = ANY (ARRAY['collecting'::text, 'awaiting_confirmation'::text, 'in_review'::text, 'needs_reporter_info'::text, 'converted_to_work_order'::text, 'closed'::text, 'cancelled'::text])));
ALTER TABLE public.intake_reports ADD CONSTRAINT intake_reports_tenant_id_report_number_key UNIQUE (tenant_id, report_number);
ALTER TABLE public.inventory_categories ADD CONSTRAINT inventory_categories_pkey PRIMARY KEY (id);
ALTER TABLE public.inventory_categories ADD CONSTRAINT inventory_categories_tenant_id_name_key UNIQUE (tenant_id, name);
ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_pkey PRIMARY KEY (id);
ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_tenant_id_code_key UNIQUE (tenant_id, code);
ALTER TABLE public.inventory_transactions ADD CONSTRAINT inventory_transactions_pkey PRIMARY KEY (id);
ALTER TABLE public.inventory_transactions ADD CONSTRAINT inventory_transactions_transaction_type_check CHECK (((transaction_type)::text = ANY ((ARRAY['in'::character varying, 'out'::character varying, 'adjustment'::character varying, 'return'::character varying, 'usage'::character varying])::text[])));
ALTER TABLE public.issue_types ADD CONSTRAINT issue_types_pkey PRIMARY KEY (id);
ALTER TABLE public.job_plan_items ADD CONSTRAINT job_plan_items_item_type_check CHECK (((item_type)::text = ANY ((ARRAY['yes_no'::character varying, 'pass_fail'::character varying, 'numeric'::character varying, 'text'::character varying, 'photo'::character varying, 'signature'::character varying, 'select'::character varying, 'multi_select'::character varying, 'header'::character varying])::text[])));
ALTER TABLE public.job_plan_items ADD CONSTRAINT job_plan_items_pkey PRIMARY KEY (id);
ALTER TABLE public.job_plans ADD CONSTRAINT job_plans_pkey PRIMARY KEY (id);
ALTER TABLE public.job_plans ADD CONSTRAINT job_plans_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'active'::character varying, 'archived'::character varying])::text[])));
ALTER TABLE public.maintenance_frequency_bundles ADD CONSTRAINT maintenance_frequency_bundles_frequency_type_check CHECK (((frequency_type)::text = ANY ((ARRAY['daily'::character varying, 'weekly'::character varying, 'monthly'::character varying, 'quarterly'::character varying, 'semi_annual'::character varying, 'annual'::character varying, 'custom'::character varying])::text[])));
ALTER TABLE public.maintenance_frequency_bundles ADD CONSTRAINT maintenance_frequency_bundles_interval_count_check CHECK ((interval_count > 0));
ALTER TABLE public.maintenance_frequency_bundles ADD CONSTRAINT maintenance_frequency_bundles_pkey PRIMARY KEY (id);
ALTER TABLE public.maintenance_frequency_bundles ADD CONSTRAINT maintenance_frequency_bundles_plan_id_code_key UNIQUE (plan_id, code);
ALTER TABLE public.maintenance_plan_targets ADD CONSTRAINT maintenance_plan_targets_check CHECK (((((target_type)::text = 'asset'::text) AND (asset_id IS NOT NULL) AND (building_id IS NULL) AND (asset_group_id IS NULL)) OR (((target_type)::text = 'building'::text) AND (building_id IS NOT NULL) AND (asset_id IS NULL) AND (asset_group_id IS NULL)) OR (((target_type)::text = 'asset_group'::text) AND (asset_group_id IS NOT NULL) AND (asset_id IS NULL) AND (building_id IS NULL))));
ALTER TABLE public.maintenance_plan_targets ADD CONSTRAINT maintenance_plan_targets_pkey PRIMARY KEY (id);
ALTER TABLE public.maintenance_plan_targets ADD CONSTRAINT maintenance_plan_targets_target_type_check CHECK (((target_type)::text = ANY ((ARRAY['asset'::character varying, 'building'::character varying, 'asset_group'::character varying])::text[])));
ALTER TABLE public.maintenance_plans ADD CONSTRAINT maintenance_plans_pkey PRIMARY KEY (id);
ALTER TABLE public.maintenance_plans ADD CONSTRAINT maintenance_plans_priority_check CHECK (((priority)::text = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying, 'critical'::character varying])::text[])));
ALTER TABLE public.maintenance_plans ADD CONSTRAINT maintenance_plans_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'active'::character varying, 'paused'::character varying, 'completed'::character varying, 'archived'::character varying])::text[])));
ALTER TABLE public.maintenance_plans ADD CONSTRAINT maintenance_plans_tenant_id_code_key UNIQUE (tenant_id, code);
ALTER TABLE public.maintenance_task_attachments ADD CONSTRAINT maintenance_task_attachments_attachment_type_check CHECK (((attachment_type)::text = ANY ((ARRAY['general'::character varying, 'before_photo'::character varying, 'after_photo'::character varying, 'check_photo'::character varying, 'signature'::character varying, 'review_signature'::character varying, 'pdf_reference'::character varying])::text[])));
ALTER TABLE public.maintenance_task_attachments ADD CONSTRAINT maintenance_task_attachments_pkey PRIMARY KEY (id);
ALTER TABLE public.maintenance_task_checks ADD CONSTRAINT maintenance_task_checks_pkey PRIMARY KEY (id);
ALTER TABLE public.maintenance_task_checks ADD CONSTRAINT maintenance_task_checks_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'pass'::character varying, 'fail'::character varying, 'na'::character varying])::text[])));
ALTER TABLE public.maintenance_task_checks ADD CONSTRAINT maintenance_task_checks_task_template_item_key UNIQUE (task_id, template_item_id);
ALTER TABLE public.maintenance_tasks ADD CONSTRAINT maintenance_tasks_execution_status_check CHECK (((execution_status)::text = ANY ((ARRAY['draft'::character varying, 'in_progress'::character varying, 'completed'::character varying, 'approved'::character varying, 'needs_rework'::character varying, 'cancelled'::character varying])::text[])));
ALTER TABLE public.maintenance_tasks ADD CONSTRAINT maintenance_tasks_pkey PRIMARY KEY (id);
ALTER TABLE public.maintenance_tasks ADD CONSTRAINT maintenance_tasks_recurrence_interval_check CHECK ((recurrence_interval >= 1));
ALTER TABLE public.maintenance_tasks ADD CONSTRAINT maintenance_tasks_recurrence_type_check CHECK ((recurrence_type = ANY (ARRAY['once'::text, 'daily'::text, 'weekly'::text, 'monthly'::text, 'custom'::text])));
ALTER TABLE public.maintenance_tasks ADD CONSTRAINT maintenance_tasks_review_status_check CHECK (((review_status)::text = ANY ((ARRAY['not_required'::character varying, 'pending'::character varying, 'approved'::character varying, 'needs_rework'::character varying])::text[])));
ALTER TABLE public.maintenance_tasks ADD CONSTRAINT maintenance_tasks_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'in_progress'::character varying, 'completed'::character varying, 'cancelled'::character varying])::text[])));
ALTER TABLE public.notification_logs ADD CONSTRAINT notification_logs_channel_check CHECK ((channel = ANY (ARRAY['in_app'::text, 'email'::text, 'sms'::text, 'manual'::text])));
ALTER TABLE public.notification_logs ADD CONSTRAINT notification_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.notification_logs ADD CONSTRAINT notification_logs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'sent'::text, 'delivered'::text, 'failed'::text, 'skipped'::text, 'cancelled'::text])));
ALTER TABLE public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
ALTER TABLE public.operation_logs ADD CONSTRAINT operation_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.operation_logs ADD CONSTRAINT operation_logs_status_check CHECK (((status)::text = ANY ((ARRAY['in_progress'::character varying, 'completed'::character varying, 'cancelled'::character varying, 'pending_approval'::character varying])::text[])));
ALTER TABLE public.operation_logs ADD CONSTRAINT operation_logs_tenant_id_code_key UNIQUE (tenant_id, code);
ALTER TABLE public.operation_logs ADD CONSTRAINT operation_logs_type_check CHECK (((type)::text = ANY ((ARRAY['maintenance'::character varying, 'repair'::character varying, 'inspection'::character varying, 'emergency'::character varying, 'routine'::character varying, 'installation'::character varying, 'calibration'::character varying, 'other'::character varying, 'status_change'::character varying, 'comment'::character varying, 'assignment'::character varying, 'create'::character varying, 'update'::character varying, 'cancellation'::character varying, 'pm_generate'::character varying])::text[])));
ALTER TABLE public.operational_events ADD CONSTRAINT operational_events_actor_type_check CHECK ((actor_type = ANY (ARRAY['reporter'::text, 'user'::text, 'system'::text])));
ALTER TABLE public.operational_events ADD CONSTRAINT operational_events_entity_type_check CHECK ((entity_type = ANY (ARRAY['intake_report'::text, 'intake_message'::text, 'work_order_draft'::text, 'work_order'::text, 'notification'::text])));
ALTER TABLE public.operational_events ADD CONSTRAINT operational_events_pkey PRIMARY KEY (id);
ALTER TABLE public.password_reset_otps ADD CONSTRAINT password_reset_otps_pkey PRIMARY KEY (id);
ALTER TABLE public.platform_audit_logs ADD CONSTRAINT platform_audit_logs_action_type_check CHECK (((action_type)::text = ANY ((ARRAY['auth'::character varying, 'create'::character varying, 'read'::character varying, 'update'::character varying, 'delete'::character varying, 'export'::character varying, 'import'::character varying, 'config'::character varying, 'warning'::character varying, 'error'::character varying])::text[])));
ALTER TABLE public.platform_audit_logs ADD CONSTRAINT platform_audit_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.platform_settings ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (key);
ALTER TABLE public.platform_staff ADD CONSTRAINT platform_staff_pkey PRIMARY KEY (id);
ALTER TABLE public.platform_staff ADD CONSTRAINT platform_staff_role_check CHECK (((role)::text = ANY ((ARRAY['platform_owner'::character varying, 'platform_admin'::character varying, 'platform_support'::character varying, 'platform_finance'::character varying, 'platform_hr'::character varying])::text[])));
ALTER TABLE public.platform_staff ADD CONSTRAINT platform_staff_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying, 'suspended'::character varying])::text[])));
ALTER TABLE public.platform_staff ADD CONSTRAINT platform_staff_tenants_access_check CHECK (((tenants_access)::text = ANY ((ARRAY['all'::character varying, 'assigned'::character varying, 'none'::character varying])::text[])));
ALTER TABLE public.pm_generation_runs ADD CONSTRAINT pgr_run_scope_check CHECK ((run_scope = ANY (ARRAY['tenant'::text, 'all_tenants'::text])));
ALTER TABLE public.pm_generation_runs ADD CONSTRAINT pgr_status_check CHECK ((status = ANY (ARRAY['completed'::text, 'error'::text])));
ALTER TABLE public.pm_generation_runs ADD CONSTRAINT pm_generation_runs_pkey PRIMARY KEY (id);
ALTER TABLE public.pm_pdf_exports ADD CONSTRAINT pm_pdf_exports_export_format_check CHECK (((export_format)::text = 'pdf'::text));
ALTER TABLE public.pm_pdf_exports ADD CONSTRAINT pm_pdf_exports_pkey PRIMARY KEY (id);
ALTER TABLE public.pm_pdf_exports ADD CONSTRAINT pm_pdf_exports_task_id_export_number_key UNIQUE (task_id, export_number);
ALTER TABLE public.pm_schedule_assets ADD CONSTRAINT pm_schedule_assets_pkey PRIMARY KEY (id);
ALTER TABLE public.pm_schedule_assets ADD CONSTRAINT pm_schedule_assets_schedule_id_asset_id_key UNIQUE (schedule_id, asset_id);
ALTER TABLE public.pm_schedules ADD CONSTRAINT pm_schedules_default_priority_check CHECK (((default_priority)::text = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying, 'critical'::character varying])::text[])));
ALTER TABLE public.pm_schedules ADD CONSTRAINT pm_schedules_frequency_interval_check CHECK ((frequency_interval > 0));
ALTER TABLE public.pm_schedules ADD CONSTRAINT pm_schedules_frequency_type_check CHECK (((frequency_type)::text = ANY ((ARRAY['daily'::character varying, 'weekly'::character varying, 'monthly'::character varying, 'quarterly'::character varying, 'semi_annual'::character varying, 'annual'::character varying, 'custom'::character varying])::text[])));
ALTER TABLE public.pm_schedules ADD CONSTRAINT pm_schedules_generation_mode_check CHECK (((generation_mode)::text = ANY ((ARRAY['per_asset'::character varying, 'batch_route'::character varying])::text[])));
ALTER TABLE public.pm_schedules ADD CONSTRAINT pm_schedules_pkey PRIMARY KEY (id);
ALTER TABLE public.pm_schedules ADD CONSTRAINT pm_schedules_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'active'::character varying, 'paused'::character varying, 'completed'::character varying, 'archived'::character varying])::text[])));
ALTER TABLE public.pm_schedules ADD CONSTRAINT pm_schedules_trigger_type_check CHECK (((trigger_type)::text = ANY ((ARRAY['calendar'::character varying, 'meter'::character varying, 'condition'::character varying])::text[])));
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (((role)::text = ANY ((ARRAY['platform_owner'::character varying, 'platform_admin'::character varying, 'platform_support'::character varying, 'platform_finance'::character varying, 'platform_hr'::character varying, 'tenant_admin'::character varying, 'facility_manager'::character varying, 'maintenance_manager'::character varying, 'supervisor'::character varying, 'engineer'::character varying, 'technician'::character varying, 'reporter'::character varying, 'user'::character varying])::text[])));
ALTER TABLE public.rooms ADD CONSTRAINT rooms_pkey PRIMARY KEY (id);
ALTER TABLE public.rooms ADD CONSTRAINT rooms_tenant_id_code_key UNIQUE (tenant_id, code);
ALTER TABLE public.subscription_plans ADD CONSTRAINT subscription_plans_code_key UNIQUE (code);
ALTER TABLE public.subscription_plans ADD CONSTRAINT subscription_plans_pkey PRIMARY KEY (id);
ALTER TABLE public.team_members ADD CONSTRAINT team_members_pkey PRIMARY KEY (id);
ALTER TABLE public.team_members ADD CONSTRAINT team_members_role_check CHECK (((role)::text = ANY ((ARRAY['leader'::character varying, 'member'::character varying, 'supervisor'::character varying])::text[])));
ALTER TABLE public.team_members ADD CONSTRAINT team_members_team_id_user_id_key UNIQUE (team_id, user_id);
ALTER TABLE public.teams ADD CONSTRAINT teams_pkey PRIMARY KEY (id);
ALTER TABLE public.teams ADD CONSTRAINT teams_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'inactive'::character varying, 'archived'::character varying])::text[])));
ALTER TABLE public.teams ADD CONSTRAINT teams_tenant_id_code_key UNIQUE (tenant_id, code);
ALTER TABLE public.teams ADD CONSTRAINT teams_type_check CHECK (((type)::text = ANY ((ARRAY['maintenance'::character varying, 'engineering'::character varying, 'operations'::character varying, 'support'::character varying, 'custom'::character varying])::text[])));
ALTER TABLE public.tenant_access_tokens ADD CONSTRAINT tenant_access_tokens_pkey PRIMARY KEY (id);
ALTER TABLE public.tenant_access_tokens ADD CONSTRAINT tenant_access_tokens_token_key UNIQUE (token);
ALTER TABLE public.tenant_modules ADD CONSTRAINT tenant_modules_pkey PRIMARY KEY (id);
ALTER TABLE public.tenant_modules ADD CONSTRAINT tenant_modules_tenant_id_module_code_key UNIQUE (tenant_id, module_code);
ALTER TABLE public.tenant_subscriptions ADD CONSTRAINT tenant_subscriptions_activated_by_check CHECK (((activated_by)::text = ANY ((ARRAY['self_service'::character varying, 'admin'::character varying, 'quote'::character varying])::text[])));
ALTER TABLE public.tenant_subscriptions ADD CONSTRAINT tenant_subscriptions_billing_cycle_check CHECK (((billing_cycle)::text = ANY ((ARRAY['monthly'::character varying, 'yearly'::character varying])::text[])));
ALTER TABLE public.tenant_subscriptions ADD CONSTRAINT tenant_subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE public.tenant_subscriptions ADD CONSTRAINT tenant_subscriptions_status_check CHECK (((status)::text = ANY ((ARRAY['trial'::character varying, 'active'::character varying, 'past_due'::character varying, 'expired'::character varying, 'cancelled'::character varying])::text[])));
ALTER TABLE public.tenant_subscriptions ADD CONSTRAINT tenant_subscriptions_tenant_id_key UNIQUE (tenant_id);
ALTER TABLE public.tenants ADD CONSTRAINT tenants_billing_cycle_check CHECK (((billing_cycle)::text = ANY ((ARRAY['monthly'::character varying, 'yearly'::character varying, 'custom'::character varying])::text[])));
ALTER TABLE public.tenants ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);
ALTER TABLE public.tenants ADD CONSTRAINT tenants_slug_key UNIQUE (slug);
ALTER TABLE public.tenants ADD CONSTRAINT tenants_subscription_status_check CHECK (((subscription_status)::text = ANY ((ARRAY['trial'::character varying, 'active'::character varying, 'suspended'::character varying, 'cancelled'::character varying, 'expired'::character varying])::text[])));
ALTER TABLE public.user_custom_roles ADD CONSTRAINT user_custom_roles_pkey PRIMARY KEY (id);
ALTER TABLE public.user_custom_roles ADD CONSTRAINT user_custom_roles_user_id_role_id_key UNIQUE (user_id, role_id);
ALTER TABLE public.work_order_assets ADD CONSTRAINT work_order_assets_pkey PRIMARY KEY (id);
ALTER TABLE public.work_order_assets ADD CONSTRAINT work_order_assets_work_order_id_asset_id_key UNIQUE (work_order_id, asset_id);
ALTER TABLE public.work_order_attachments ADD CONSTRAINT work_order_attachments_attachment_type_check CHECK (((attachment_type)::text = ANY ((ARRAY['general'::character varying, 'before_photo'::character varying, 'after_photo'::character varying, 'check_photo'::character varying, 'signature'::character varying, 'document'::character varying])::text[])));
ALTER TABLE public.work_order_attachments ADD CONSTRAINT work_order_attachments_pkey PRIMARY KEY (id);
ALTER TABLE public.work_order_checks ADD CONSTRAINT work_order_checks_pkey PRIMARY KEY (id);
ALTER TABLE public.work_order_checks ADD CONSTRAINT work_order_checks_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'pass'::character varying, 'fail'::character varying, 'na'::character varying])::text[])));
ALTER TABLE public.work_order_costs ADD CONSTRAINT work_order_costs_cost_type_check CHECK (((cost_type)::text = ANY ((ARRAY['labor'::character varying, 'parts'::character varying, 'materials'::character varying, 'external_service'::character varying, 'travel'::character varying, 'other'::character varying])::text[])));
ALTER TABLE public.work_order_costs ADD CONSTRAINT work_order_costs_pkey PRIMARY KEY (id);
ALTER TABLE public.work_order_drafts ADD CONSTRAINT work_order_drafts_intake_report_id_key UNIQUE (intake_report_id);
ALTER TABLE public.work_order_drafts ADD CONSTRAINT work_order_drafts_pkey PRIMARY KEY (id);
ALTER TABLE public.work_order_drafts ADD CONSTRAINT work_order_drafts_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text])));
ALTER TABLE public.work_order_drafts ADD CONSTRAINT work_order_drafts_status_check CHECK ((status = ANY (ARRAY['ready_for_review'::text, 'needs_info'::text, 'approved'::text, 'converted'::text, 'rejected'::text, 'cancelled'::text])));
ALTER TABLE public.work_order_parts ADD CONSTRAINT work_order_parts_pkey PRIMARY KEY (id);
ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_pkey PRIMARY KEY (id);
ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_priority_check CHECK (((priority)::text = ANY ((ARRAY['low'::character varying, 'medium'::character varying, 'high'::character varying, 'urgent'::character varying])::text[])));
ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'assigned'::character varying, 'in_progress'::character varying, 'pending_supervisor_approval'::character varying, 'pending_engineer_review'::character varying, 'pending_reporter_closure'::character varying, 'completed'::character varying, 'rejected_by_technician'::character varying, 'cancelled'::character varying, 'archived'::character varying])::text[])));
ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_tenant_id_code_key UNIQUE (tenant_id, code);
ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_work_type_check CHECK (((work_type)::text = ANY ((ARRAY['preventive'::character varying, 'reactive'::character varying, 'corrective'::character varying, 'inspection'::character varying, 'project'::character varying])::text[])));

-- ===== FOREIGN KEYS =====
ALTER TABLE public.asset_activity_logs ADD CONSTRAINT asset_activity_logs_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE;
ALTER TABLE public.asset_activity_logs ADD CONSTRAINT asset_activity_logs_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.asset_activity_logs ADD CONSTRAINT asset_activity_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.asset_categories ADD CONSTRAINT asset_categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES asset_categories(id);
ALTER TABLE public.asset_categories ADD CONSTRAINT asset_categories_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.assets ADD CONSTRAINT assets_building_id_fkey FOREIGN KEY (building_id) REFERENCES buildings(id);
ALTER TABLE public.assets ADD CONSTRAINT assets_category_id_fkey FOREIGN KEY (category_id) REFERENCES asset_categories(id);
ALTER TABLE public.assets ADD CONSTRAINT assets_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
ALTER TABLE public.assets ADD CONSTRAINT assets_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id);
ALTER TABLE public.assets ADD CONSTRAINT assets_floor_id_fkey FOREIGN KEY (floor_id) REFERENCES floors(id);
ALTER TABLE public.assets ADD CONSTRAINT assets_parent_asset_id_fkey FOREIGN KEY (parent_asset_id) REFERENCES assets(id);
ALTER TABLE public.assets ADD CONSTRAINT assets_room_id_fkey FOREIGN KEY (room_id) REFERENCES rooms(id);
ALTER TABLE public.assets ADD CONSTRAINT assets_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.billing_invoices ADD CONSTRAINT billing_invoices_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
ALTER TABLE public.billing_invoices ADD CONSTRAINT billing_invoices_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES billing_quotes(id);
ALTER TABLE public.billing_invoices ADD CONSTRAINT billing_invoices_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES tenant_subscriptions(id);
ALTER TABLE public.billing_invoices ADD CONSTRAINT billing_invoices_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public.billing_quotes ADD CONSTRAINT billing_quotes_activated_by_fkey FOREIGN KEY (activated_by) REFERENCES profiles(id);
ALTER TABLE public.billing_quotes ADD CONSTRAINT billing_quotes_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES profiles(id);
ALTER TABLE public.billing_quotes ADD CONSTRAINT billing_quotes_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
ALTER TABLE public.billing_quotes ADD CONSTRAINT billing_quotes_discount_policy_id_fkey FOREIGN KEY (discount_policy_id) REFERENCES discount_policies(id);
ALTER TABLE public.billing_quotes ADD CONSTRAINT billing_quotes_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES subscription_plans(id);
ALTER TABLE public.billing_quotes ADD CONSTRAINT billing_quotes_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES tenant_subscriptions(id);
ALTER TABLE public.billing_quotes ADD CONSTRAINT billing_quotes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public.buildings ADD CONSTRAINT buildings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.checklist_template_items ADD CONSTRAINT checklist_template_items_section_id_fkey FOREIGN KEY (section_id) REFERENCES checklist_template_sections(id) ON DELETE SET NULL;
ALTER TABLE public.checklist_template_items ADD CONSTRAINT checklist_template_items_template_id_fkey FOREIGN KEY (template_id) REFERENCES checklist_templates(id) ON DELETE CASCADE;
ALTER TABLE public.checklist_template_sections ADD CONSTRAINT checklist_template_sections_template_id_fkey FOREIGN KEY (template_id) REFERENCES checklist_templates(id) ON DELETE CASCADE;
ALTER TABLE public.checklist_templates ADD CONSTRAINT checklist_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
ALTER TABLE public.checklist_templates ADD CONSTRAINT checklist_templates_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.custom_roles ADD CONSTRAINT custom_roles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.departments ADD CONSTRAINT departments_building_id_fkey FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE;
ALTER TABLE public.departments ADD CONSTRAINT departments_floor_id_fkey FOREIGN KEY (floor_id) REFERENCES floors(id) ON DELETE CASCADE;
ALTER TABLE public.departments ADD CONSTRAINT departments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.floors ADD CONSTRAINT floors_building_id_fkey FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE;
ALTER TABLE public.intake_messages ADD CONSTRAINT intake_messages_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.intake_messages ADD CONSTRAINT intake_messages_intake_report_id_fkey FOREIGN KEY (intake_report_id) REFERENCES intake_reports(id) ON DELETE CASCADE;
ALTER TABLE public.intake_messages ADD CONSTRAINT intake_messages_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.intake_reports ADD CONSTRAINT intake_reports_access_token_id_fkey FOREIGN KEY (access_token_id) REFERENCES tenant_access_tokens(id) ON DELETE SET NULL;
ALTER TABLE public.intake_reports ADD CONSTRAINT intake_reports_converted_work_order_id_fkey FOREIGN KEY (converted_work_order_id) REFERENCES work_orders(id) ON DELETE SET NULL;
ALTER TABLE public.intake_reports ADD CONSTRAINT intake_reports_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.inventory_items ADD CONSTRAINT inventory_items_category_id_fkey FOREIGN KEY (category_id) REFERENCES inventory_categories(id);
ALTER TABLE public.inventory_transactions ADD CONSTRAINT inventory_transactions_item_id_fkey FOREIGN KEY (item_id) REFERENCES inventory_items(id);
ALTER TABLE public.issue_types ADD CONSTRAINT issue_types_default_team_id_fkey FOREIGN KEY (default_team_id) REFERENCES teams(id);
ALTER TABLE public.issue_types ADD CONSTRAINT issue_types_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.job_plan_items ADD CONSTRAINT job_plan_items_job_plan_id_fkey FOREIGN KEY (job_plan_id) REFERENCES job_plans(id) ON DELETE CASCADE;
ALTER TABLE public.job_plans ADD CONSTRAINT job_plans_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.job_plans ADD CONSTRAINT job_plans_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.maintenance_frequency_bundles ADD CONSTRAINT maintenance_frequency_bundles_checklist_template_id_fkey FOREIGN KEY (checklist_template_id) REFERENCES checklist_templates(id) ON DELETE SET NULL;
ALTER TABLE public.maintenance_frequency_bundles ADD CONSTRAINT maintenance_frequency_bundles_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.maintenance_frequency_bundles ADD CONSTRAINT maintenance_frequency_bundles_default_assigned_team_id_fkey FOREIGN KEY (default_assigned_team_id) REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE public.maintenance_frequency_bundles ADD CONSTRAINT maintenance_frequency_bundles_default_assigned_to_fkey FOREIGN KEY (default_assigned_to) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.maintenance_frequency_bundles ADD CONSTRAINT maintenance_frequency_bundles_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES maintenance_plans(id) ON DELETE CASCADE;
ALTER TABLE public.maintenance_frequency_bundles ADD CONSTRAINT maintenance_frequency_bundles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.maintenance_plan_targets ADD CONSTRAINT maintenance_plan_targets_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE;
ALTER TABLE public.maintenance_plan_targets ADD CONSTRAINT maintenance_plan_targets_building_id_fkey FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE;
ALTER TABLE public.maintenance_plan_targets ADD CONSTRAINT maintenance_plan_targets_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES maintenance_plans(id) ON DELETE CASCADE;
ALTER TABLE public.maintenance_plan_targets ADD CONSTRAINT maintenance_plan_targets_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.maintenance_plans ADD CONSTRAINT maintenance_plans_building_id_fkey FOREIGN KEY (building_id) REFERENCES buildings(id);
ALTER TABLE public.maintenance_plans ADD CONSTRAINT maintenance_plans_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
ALTER TABLE public.maintenance_plans ADD CONSTRAINT maintenance_plans_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.maintenance_task_attachments ADD CONSTRAINT maintenance_task_attachments_check_id_fkey FOREIGN KEY (check_id) REFERENCES maintenance_task_checks(id) ON DELETE SET NULL;
ALTER TABLE public.maintenance_task_attachments ADD CONSTRAINT maintenance_task_attachments_task_id_fkey FOREIGN KEY (task_id) REFERENCES maintenance_tasks(id) ON DELETE CASCADE;
ALTER TABLE public.maintenance_task_attachments ADD CONSTRAINT maintenance_task_attachments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.maintenance_task_attachments ADD CONSTRAINT maintenance_task_attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.maintenance_task_checks ADD CONSTRAINT maintenance_task_checks_checked_by_fkey FOREIGN KEY (checked_by) REFERENCES profiles(id);
ALTER TABLE public.maintenance_task_checks ADD CONSTRAINT maintenance_task_checks_task_id_fkey FOREIGN KEY (task_id) REFERENCES maintenance_tasks(id) ON DELETE CASCADE;
ALTER TABLE public.maintenance_task_checks ADD CONSTRAINT maintenance_task_checks_template_item_id_fkey FOREIGN KEY (template_item_id) REFERENCES checklist_template_items(id);
ALTER TABLE public.maintenance_tasks ADD CONSTRAINT maintenance_tasks_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES assets(id);
ALTER TABLE public.maintenance_tasks ADD CONSTRAINT maintenance_tasks_assigned_team_id_fkey FOREIGN KEY (assigned_team_id) REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE public.maintenance_tasks ADD CONSTRAINT maintenance_tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES profiles(id);
ALTER TABLE public.maintenance_tasks ADD CONSTRAINT maintenance_tasks_building_id_fkey FOREIGN KEY (building_id) REFERENCES buildings(id);
ALTER TABLE public.maintenance_tasks ADD CONSTRAINT maintenance_tasks_checklist_template_id_fkey FOREIGN KEY (checklist_template_id) REFERENCES checklist_templates(id);
ALTER TABLE public.maintenance_tasks ADD CONSTRAINT maintenance_tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
ALTER TABLE public.maintenance_tasks ADD CONSTRAINT maintenance_tasks_execution_completed_by_fkey FOREIGN KEY (execution_completed_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.maintenance_tasks ADD CONSTRAINT maintenance_tasks_execution_started_by_fkey FOREIGN KEY (execution_started_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.maintenance_tasks ADD CONSTRAINT maintenance_tasks_frequency_bundle_id_fkey FOREIGN KEY (frequency_bundle_id) REFERENCES maintenance_frequency_bundles(id) ON DELETE SET NULL;
ALTER TABLE public.maintenance_tasks ADD CONSTRAINT maintenance_tasks_latest_pdf_export_id_fkey FOREIGN KEY (latest_pdf_export_id) REFERENCES pm_pdf_exports(id) ON DELETE SET NULL;
ALTER TABLE public.maintenance_tasks ADD CONSTRAINT maintenance_tasks_maintenance_plan_id_fkey FOREIGN KEY (maintenance_plan_id) REFERENCES maintenance_plans(id) ON DELETE SET NULL;
ALTER TABLE public.maintenance_tasks ADD CONSTRAINT maintenance_tasks_related_work_order_id_fkey FOREIGN KEY (related_work_order_id) REFERENCES work_orders(id) ON DELETE SET NULL;
ALTER TABLE public.maintenance_tasks ADD CONSTRAINT maintenance_tasks_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.maintenance_tasks ADD CONSTRAINT maintenance_tasks_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.notification_logs ADD CONSTRAINT notification_logs_recipient_user_id_fkey FOREIGN KEY (recipient_user_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.notification_logs ADD CONSTRAINT notification_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.operation_logs ADD CONSTRAINT operation_logs_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES profiles(id);
ALTER TABLE public.operation_logs ADD CONSTRAINT operation_logs_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES assets(id);
ALTER TABLE public.operation_logs ADD CONSTRAINT operation_logs_building_id_fkey FOREIGN KEY (building_id) REFERENCES buildings(id);
ALTER TABLE public.operation_logs ADD CONSTRAINT operation_logs_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES profiles(id);
ALTER TABLE public.operation_logs ADD CONSTRAINT operation_logs_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id);
ALTER TABLE public.operation_logs ADD CONSTRAINT operation_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.operation_logs ADD CONSTRAINT operation_logs_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES work_orders(id);
ALTER TABLE public.operational_events ADD CONSTRAINT operational_events_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.operational_events ADD CONSTRAINT operational_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.platform_audit_logs ADD CONSTRAINT platform_audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
ALTER TABLE public.platform_settings ADD CONSTRAINT platform_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES profiles(id);
ALTER TABLE public.platform_staff ADD CONSTRAINT platform_staff_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.platform_staff ADD CONSTRAINT platform_staff_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.platform_staff ADD CONSTRAINT platform_staff_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);
ALTER TABLE public.platform_staff ADD CONSTRAINT platform_staff_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.pm_generation_runs ADD CONSTRAINT pm_generation_runs_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.pm_generation_runs ADD CONSTRAINT pm_generation_runs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL;
ALTER TABLE public.pm_pdf_exports ADD CONSTRAINT pm_pdf_exports_generated_by_fkey FOREIGN KEY (generated_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.pm_pdf_exports ADD CONSTRAINT pm_pdf_exports_task_id_fkey FOREIGN KEY (task_id) REFERENCES maintenance_tasks(id) ON DELETE CASCADE;
ALTER TABLE public.pm_pdf_exports ADD CONSTRAINT pm_pdf_exports_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.pm_schedule_assets ADD CONSTRAINT pm_schedule_assets_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE;
ALTER TABLE public.pm_schedule_assets ADD CONSTRAINT pm_schedule_assets_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES pm_schedules(id) ON DELETE CASCADE;
ALTER TABLE public.pm_schedules ADD CONSTRAINT pm_schedules_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.pm_schedules ADD CONSTRAINT pm_schedules_default_assignee_id_fkey FOREIGN KEY (default_assignee_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.pm_schedules ADD CONSTRAINT pm_schedules_default_team_id_fkey FOREIGN KEY (default_team_id) REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE public.pm_schedules ADD CONSTRAINT pm_schedules_job_plan_id_fkey FOREIGN KEY (job_plan_id) REFERENCES job_plans(id);
ALTER TABLE public.pm_schedules ADD CONSTRAINT pm_schedules_primary_asset_id_fkey FOREIGN KEY (primary_asset_id) REFERENCES assets(id) ON DELETE SET NULL;
ALTER TABLE public.pm_schedules ADD CONSTRAINT pm_schedules_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_supervisor_id_fkey FOREIGN KEY (supervisor_id) REFERENCES profiles(id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE public.rooms ADD CONSTRAINT rooms_building_id_fkey FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE;
ALTER TABLE public.rooms ADD CONSTRAINT rooms_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE;
ALTER TABLE public.rooms ADD CONSTRAINT rooms_floor_id_fkey FOREIGN KEY (floor_id) REFERENCES floors(id) ON DELETE CASCADE;
ALTER TABLE public.rooms ADD CONSTRAINT rooms_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.team_members ADD CONSTRAINT team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE public.team_members ADD CONSTRAINT team_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.teams ADD CONSTRAINT teams_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.tenant_access_tokens ADD CONSTRAINT tenant_access_tokens_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
ALTER TABLE public.tenant_access_tokens ADD CONSTRAINT tenant_access_tokens_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.tenant_modules ADD CONSTRAINT tenant_modules_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.tenant_subscriptions ADD CONSTRAINT tenant_subscriptions_discount_policy_id_fkey FOREIGN KEY (discount_policy_id) REFERENCES discount_policies(id);
ALTER TABLE public.tenant_subscriptions ADD CONSTRAINT tenant_subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES subscription_plans(id);
ALTER TABLE public.tenant_subscriptions ADD CONSTRAINT tenant_subscriptions_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES billing_quotes(id);
ALTER TABLE public.tenant_subscriptions ADD CONSTRAINT tenant_subscriptions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.tenants ADD CONSTRAINT tenants_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES subscription_plans(id);
ALTER TABLE public.tenants ADD CONSTRAINT tenants_subscription_plan_id_fkey FOREIGN KEY (subscription_plan_id) REFERENCES subscription_plans(id);
ALTER TABLE public.user_custom_roles ADD CONSTRAINT user_custom_roles_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES profiles(id);
ALTER TABLE public.user_custom_roles ADD CONSTRAINT user_custom_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES custom_roles(id) ON DELETE CASCADE;
ALTER TABLE public.user_custom_roles ADD CONSTRAINT user_custom_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.work_order_assets ADD CONSTRAINT work_order_assets_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES assets(id);
ALTER TABLE public.work_order_assets ADD CONSTRAINT work_order_assets_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE;
ALTER TABLE public.work_order_attachments ADD CONSTRAINT work_order_attachments_check_id_fkey FOREIGN KEY (check_id) REFERENCES work_order_checks(id) ON DELETE SET NULL;
ALTER TABLE public.work_order_attachments ADD CONSTRAINT work_order_attachments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.work_order_attachments ADD CONSTRAINT work_order_attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES profiles(id);
ALTER TABLE public.work_order_attachments ADD CONSTRAINT work_order_attachments_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE;
ALTER TABLE public.work_order_checks ADD CONSTRAINT work_order_checks_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES assets(id);
ALTER TABLE public.work_order_checks ADD CONSTRAINT work_order_checks_checked_by_fkey FOREIGN KEY (checked_by) REFERENCES profiles(id);
ALTER TABLE public.work_order_checks ADD CONSTRAINT work_order_checks_job_plan_item_id_fkey FOREIGN KEY (job_plan_item_id) REFERENCES job_plan_items(id);
ALTER TABLE public.work_order_checks ADD CONSTRAINT work_order_checks_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE;
ALTER TABLE public.work_order_costs ADD CONSTRAINT work_order_costs_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
ALTER TABLE public.work_order_costs ADD CONSTRAINT work_order_costs_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE;
ALTER TABLE public.work_order_drafts ADD CONSTRAINT work_order_drafts_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE SET NULL;
ALTER TABLE public.work_order_drafts ADD CONSTRAINT work_order_drafts_building_id_fkey FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE SET NULL;
ALTER TABLE public.work_order_drafts ADD CONSTRAINT work_order_drafts_converted_work_order_id_fkey FOREIGN KEY (converted_work_order_id) REFERENCES work_orders(id) ON DELETE SET NULL;
ALTER TABLE public.work_order_drafts ADD CONSTRAINT work_order_drafts_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;
ALTER TABLE public.work_order_drafts ADD CONSTRAINT work_order_drafts_floor_id_fkey FOREIGN KEY (floor_id) REFERENCES floors(id) ON DELETE SET NULL;
ALTER TABLE public.work_order_drafts ADD CONSTRAINT work_order_drafts_intake_report_id_fkey FOREIGN KEY (intake_report_id) REFERENCES intake_reports(id) ON DELETE CASCADE;
ALTER TABLE public.work_order_drafts ADD CONSTRAINT work_order_drafts_issue_type_id_fkey FOREIGN KEY (issue_type_id) REFERENCES issue_types(id) ON DELETE SET NULL;
ALTER TABLE public.work_order_drafts ADD CONSTRAINT work_order_drafts_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public.work_order_drafts ADD CONSTRAINT work_order_drafts_room_id_fkey FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL;
ALTER TABLE public.work_order_drafts ADD CONSTRAINT work_order_drafts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.work_order_parts ADD CONSTRAINT work_order_parts_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
ALTER TABLE public.work_order_parts ADD CONSTRAINT work_order_parts_item_id_fkey FOREIGN KEY (part_id) REFERENCES inventory_items(id);
ALTER TABLE public.work_order_parts ADD CONSTRAINT work_order_parts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE public.work_order_parts ADD CONSTRAINT work_order_parts_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE;
ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES assets(id);
ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_assigned_team_fkey FOREIGN KEY (assigned_team) REFERENCES teams(id);
ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES profiles(id);
ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_building_id_fkey FOREIGN KEY (building_id) REFERENCES buildings(id);
ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_customer_reviewed_by_fkey FOREIGN KEY (customer_reviewed_by) REFERENCES profiles(id);
ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_department_id_fkey FOREIGN KEY (department_id) REFERENCES departments(id);
ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_engineer_approved_by_fkey FOREIGN KEY (engineer_approved_by) REFERENCES profiles(id);
ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_floor_id_fkey FOREIGN KEY (floor_id) REFERENCES floors(id);
ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_issue_type_id_fkey FOREIGN KEY (issue_type_id) REFERENCES issue_types(id);
ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_job_plan_id_fkey FOREIGN KEY (job_plan_id) REFERENCES job_plans(id);
ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_maintenance_manager_approved_by_fkey FOREIGN KEY (maintenance_manager_approved_by) REFERENCES profiles(id);
ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_maintenance_plan_id_fkey FOREIGN KEY (maintenance_plan_id) REFERENCES maintenance_plans(id) ON DELETE SET NULL;
ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES profiles(id);
ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_room_id_fkey FOREIGN KEY (room_id) REFERENCES rooms(id);
ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_source_schedule_asset_id_fkey FOREIGN KEY (source_schedule_asset_id) REFERENCES pm_schedule_assets(id) ON DELETE SET NULL;
ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_source_schedule_id_fkey FOREIGN KEY (source_schedule_id) REFERENCES pm_schedules(id);
ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_supervisor_approved_by_fkey FOREIGN KEY (supervisor_approved_by) REFERENCES profiles(id);
ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- ===== INDEXES =====
CREATE INDEX idx_assets_building ON public.assets USING btree (building_id);
CREATE INDEX idx_assets_category ON public.assets USING btree (category_id);
CREATE INDEX idx_assets_criticality ON public.assets USING btree (criticality);
CREATE INDEX idx_assets_level ON public.assets USING btree (asset_level);
CREATE INDEX idx_assets_parent ON public.assets USING btree (parent_asset_id);
CREATE INDEX idx_assets_qr ON public.assets USING btree (qr_code);
CREATE INDEX idx_assets_status ON public.assets USING btree (status);
CREATE INDEX idx_assets_tenant ON public.assets USING btree (tenant_id);
CREATE INDEX idx_audit_logs_action ON public.platform_audit_logs USING btree (action_type);
CREATE INDEX idx_audit_logs_action_type ON public.platform_audit_logs USING btree (action_type);
CREATE INDEX idx_audit_logs_created ON public.platform_audit_logs USING btree (created_at DESC);
CREATE INDEX idx_audit_logs_created_at ON public.platform_audit_logs USING btree (created_at);
CREATE INDEX idx_audit_logs_target ON public.platform_audit_logs USING btree (target_type, target_id);
CREATE INDEX idx_audit_logs_user ON public.platform_audit_logs USING btree (user_id);
CREATE INDEX idx_audit_logs_user_id ON public.platform_audit_logs USING btree (user_id);
CREATE INDEX idx_billing_add_ons_active ON public.billing_add_ons USING btree (is_active);
CREATE INDEX idx_billing_add_ons_code ON public.billing_add_ons USING btree (code);
CREATE INDEX idx_billing_invoices_status ON public.billing_invoices USING btree (status);
CREATE INDEX idx_billing_invoices_tenant ON public.billing_invoices USING btree (tenant_id);
CREATE INDEX idx_billing_quotes_created ON public.billing_quotes USING btree (created_at DESC);
CREATE INDEX idx_billing_quotes_status ON public.billing_quotes USING btree (status);
CREATE INDEX idx_billing_quotes_tenant ON public.billing_quotes USING btree (tenant_id);
CREATE INDEX idx_buildings_tenant ON public.buildings USING btree (tenant_id);
CREATE INDEX idx_checklist_items_applies_to ON public.checklist_template_items USING btree (applies_to_target_type);
CREATE INDEX idx_checklist_items_section ON public.checklist_template_items USING btree (section_id);
CREATE INDEX idx_checklist_sections_sort ON public.checklist_template_sections USING btree (template_id, sort_order);
CREATE INDEX idx_checklist_sections_template ON public.checklist_template_sections USING btree (template_id);
CREATE INDEX idx_checklist_template_items_template ON public.checklist_template_items USING btree (template_id);
CREATE INDEX idx_checklist_templates_category ON public.checklist_templates USING btree (category);
CREATE INDEX idx_checklist_templates_is_active ON public.checklist_templates USING btree (is_active);
CREATE INDEX idx_checklist_templates_tenant ON public.checklist_templates USING btree (tenant_id);
CREATE INDEX idx_departments_tenant ON public.departments USING btree (tenant_id);
CREATE INDEX idx_discount_policies_active ON public.discount_policies USING btree (is_active);
CREATE INDEX idx_discount_policies_code ON public.discount_policies USING btree (code);
CREATE INDEX idx_floors_building ON public.floors USING btree (building_id);
CREATE INDEX idx_intake_messages_report_created ON public.intake_messages USING btree (intake_report_id, created_at);
CREATE INDEX idx_intake_reports_converted_work_order ON public.intake_reports USING btree (converted_work_order_id);
CREATE INDEX idx_intake_reports_tenant_status ON public.intake_reports USING btree (tenant_id, status, created_at DESC);
CREATE INDEX idx_job_plan_items_plan ON public.job_plan_items USING btree (job_plan_id);
CREATE INDEX idx_job_plan_items_sort ON public.job_plan_items USING btree (job_plan_id, sort_order);
CREATE INDEX idx_job_plans_category ON public.job_plans USING btree (category);
CREATE INDEX idx_job_plans_status ON public.job_plans USING btree (status);
CREATE INDEX idx_job_plans_tenant ON public.job_plans USING btree (tenant_id);
CREATE INDEX idx_maintenance_plans_building ON public.maintenance_plans USING btree (building_id);
CREATE INDEX idx_maintenance_plans_status ON public.maintenance_plans USING btree (status);
CREATE INDEX idx_maintenance_plans_tenant ON public.maintenance_plans USING btree (tenant_id);
CREATE INDEX idx_maintenance_tasks_asset ON public.maintenance_tasks USING btree (asset_id);
CREATE INDEX idx_maintenance_tasks_assigned ON public.maintenance_tasks USING btree (assigned_to);
CREATE INDEX idx_maintenance_tasks_assigned_team ON public.maintenance_tasks USING btree (assigned_team_id);
CREATE INDEX idx_maintenance_tasks_building ON public.maintenance_tasks USING btree (building_id);
CREATE INDEX idx_maintenance_tasks_due_date ON public.maintenance_tasks USING btree (due_date);
CREATE INDEX idx_maintenance_tasks_execution_status ON public.maintenance_tasks USING btree (execution_status);
CREATE INDEX idx_maintenance_tasks_frequency_bundle ON public.maintenance_tasks USING btree (frequency_bundle_id);
CREATE INDEX idx_maintenance_tasks_latest_pdf_export ON public.maintenance_tasks USING btree (latest_pdf_export_id);
CREATE INDEX idx_maintenance_tasks_plan ON public.maintenance_tasks USING btree (maintenance_plan_id);
CREATE INDEX idx_maintenance_tasks_related_work_order ON public.maintenance_tasks USING btree (related_work_order_id);
CREATE INDEX idx_maintenance_tasks_review_status ON public.maintenance_tasks USING btree (review_status);
CREATE INDEX idx_maintenance_tasks_reviewed_by ON public.maintenance_tasks USING btree (reviewed_by);
CREATE INDEX idx_maintenance_tasks_status ON public.maintenance_tasks USING btree (status);
CREATE INDEX idx_maintenance_tasks_template ON public.maintenance_tasks USING btree (checklist_template_id);
CREATE INDEX idx_maintenance_tasks_tenant ON public.maintenance_tasks USING btree (tenant_id);
CREATE INDEX idx_notification_logs_related ON public.notification_logs USING btree (related_entity_type, related_entity_id);
CREATE INDEX idx_notification_logs_tenant_status ON public.notification_logs USING btree (tenant_id, status, queued_at DESC);
CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at DESC);
CREATE INDEX idx_notifications_user_unread ON public.notifications USING btree (user_id, is_read) WHERE (is_read = false);
CREATE INDEX idx_operation_logs_asset ON public.operation_logs USING btree (asset_id);
CREATE INDEX idx_operation_logs_tenant ON public.operation_logs USING btree (tenant_id);
CREATE INDEX idx_operation_logs_type ON public.operation_logs USING btree (type);
CREATE INDEX idx_operation_logs_work_order ON public.operation_logs USING btree (work_order_id);
CREATE INDEX idx_operational_events_tenant_entity ON public.operational_events USING btree (tenant_id, entity_type, entity_id, created_at DESC);
CREATE INDEX idx_password_reset_otps_email ON public.password_reset_otps USING btree (email);
CREATE INDEX idx_pgr_run_id ON public.pm_generation_runs USING btree (run_id);
CREATE INDEX idx_pgr_started_at ON public.pm_generation_runs USING btree (started_at DESC);
CREATE INDEX idx_pgr_tenant ON public.pm_generation_runs USING btree (tenant_id);
CREATE INDEX idx_plan_targets_asset ON public.maintenance_plan_targets USING btree (asset_id);
CREATE INDEX idx_plan_targets_asset_group ON public.maintenance_plan_targets USING btree (asset_group_id);
CREATE INDEX idx_plan_targets_building ON public.maintenance_plan_targets USING btree (building_id);
CREATE INDEX idx_plan_targets_plan ON public.maintenance_plan_targets USING btree (plan_id);
CREATE INDEX idx_plan_targets_tenant ON public.maintenance_plan_targets USING btree (tenant_id);
CREATE INDEX idx_platform_staff_role ON public.platform_staff USING btree (role);
CREATE INDEX idx_platform_staff_status ON public.platform_staff USING btree (status);
CREATE INDEX idx_platform_staff_user ON public.platform_staff USING btree (user_id);
CREATE INDEX idx_pm_bundles_default_team ON public.maintenance_frequency_bundles USING btree (default_assigned_team_id);
CREATE INDEX idx_pm_bundles_frequency ON public.maintenance_frequency_bundles USING btree (frequency_type);
CREATE INDEX idx_pm_bundles_plan ON public.maintenance_frequency_bundles USING btree (plan_id);
CREATE INDEX idx_pm_bundles_template ON public.maintenance_frequency_bundles USING btree (checklist_template_id);
CREATE INDEX idx_pm_bundles_tenant ON public.maintenance_frequency_bundles USING btree (tenant_id);
CREATE INDEX idx_pm_pdf_exports_generated_at ON public.pm_pdf_exports USING btree (generated_at DESC);
CREATE INDEX idx_pm_pdf_exports_task ON public.pm_pdf_exports USING btree (task_id);
CREATE INDEX idx_pm_pdf_exports_tenant ON public.pm_pdf_exports USING btree (tenant_id);
CREATE INDEX idx_pm_schedule_assets_asset ON public.pm_schedule_assets USING btree (asset_id);
CREATE INDEX idx_pm_schedule_assets_schedule ON public.pm_schedule_assets USING btree (schedule_id);
CREATE INDEX idx_pm_schedules_asset ON public.pm_schedules USING btree (primary_asset_id);
CREATE INDEX idx_pm_schedules_generation_mode ON public.pm_schedules USING btree (generation_mode);
CREATE INDEX idx_pm_schedules_next_due ON public.pm_schedules USING btree (next_due_date) WHERE ((status)::text = 'active'::text);
CREATE INDEX idx_pm_schedules_status ON public.pm_schedules USING btree (status);
CREATE INDEX idx_pm_schedules_tenant ON public.pm_schedules USING btree (tenant_id);
CREATE INDEX idx_pm_task_attachments_check ON public.maintenance_task_attachments USING btree (check_id);
CREATE INDEX idx_pm_task_attachments_task ON public.maintenance_task_attachments USING btree (task_id);
CREATE INDEX idx_pm_task_attachments_tenant ON public.maintenance_task_attachments USING btree (tenant_id);
CREATE INDEX idx_pm_task_attachments_type ON public.maintenance_task_attachments USING btree (task_id, attachment_type);
CREATE INDEX idx_profiles_email ON public.profiles USING btree (email);
CREATE INDEX idx_profiles_role ON public.profiles USING btree (role);
CREATE INDEX idx_profiles_tenant ON public.profiles USING btree (tenant_id);
CREATE INDEX idx_rooms_tenant ON public.rooms USING btree (tenant_id);
CREATE INDEX idx_task_checks_task ON public.maintenance_task_checks USING btree (task_id);
CREATE INDEX idx_teams_tenant ON public.teams USING btree (tenant_id);
CREATE INDEX idx_tenant_subs_quote ON public.tenant_subscriptions USING btree (quote_id);
CREATE INDEX idx_tenant_subs_status ON public.tenant_subscriptions USING btree (status);
CREATE INDEX idx_tenants_settings ON public.tenants USING gin (settings);
CREATE INDEX idx_tenants_slug ON public.tenants USING btree (slug);
CREATE INDEX idx_tenants_status ON public.tenants USING btree (subscription_status);
CREATE INDEX idx_wo_assets_asset ON public.work_order_assets USING btree (asset_id);
CREATE INDEX idx_wo_assets_wo ON public.work_order_assets USING btree (work_order_id);
CREATE INDEX idx_wo_attachments_check ON public.work_order_attachments USING btree (check_id);
CREATE INDEX idx_wo_attachments_wo ON public.work_order_attachments USING btree (work_order_id);
CREATE INDEX idx_wo_checks_asset ON public.work_order_checks USING btree (asset_id);
CREATE INDEX idx_wo_checks_status ON public.work_order_checks USING btree (status);
CREATE INDEX idx_wo_checks_wo ON public.work_order_checks USING btree (work_order_id);
CREATE INDEX idx_work_order_drafts_converted_work_order ON public.work_order_drafts USING btree (converted_work_order_id);
CREATE INDEX idx_work_order_drafts_tenant_status ON public.work_order_drafts USING btree (tenant_id, status, created_at DESC);
CREATE INDEX idx_work_orders_asset ON public.work_orders USING btree (asset_id);
CREATE INDEX idx_work_orders_assigned ON public.work_orders USING btree (assigned_to);
CREATE INDEX idx_work_orders_compliance ON public.work_orders USING btree (compliance_deadline) WHERE ((status)::text <> ALL ((ARRAY['completed'::character varying, 'cancelled'::character varying])::text[]));
CREATE INDEX idx_work_orders_plan ON public.work_orders USING btree (maintenance_plan_id);
CREATE INDEX idx_work_orders_pm_cycle_asset ON public.work_orders USING btree (source_schedule_id, scheduled_date, source_schedule_asset_id) WHERE ((work_type)::text = 'preventive'::text);
CREATE INDEX idx_work_orders_priority ON public.work_orders USING btree (priority);
CREATE INDEX idx_work_orders_reported ON public.work_orders USING btree (reported_at);
CREATE INDEX idx_work_orders_source_schedule ON public.work_orders USING btree (source_schedule_id);
CREATE INDEX idx_work_orders_source_schedule_asset ON public.work_orders USING btree (source_schedule_asset_id);
CREATE INDEX idx_work_orders_status ON public.work_orders USING btree (status);
CREATE INDEX idx_work_orders_team ON public.work_orders USING btree (assigned_team);
CREATE INDEX idx_work_orders_tenant ON public.work_orders USING btree (tenant_id);
CREATE INDEX idx_work_orders_work_type ON public.work_orders USING btree (work_type);
CREATE UNIQUE INDEX uq_maintenance_tasks_execution_reference ON public.maintenance_tasks USING btree (execution_reference) WHERE (execution_reference IS NOT NULL);
CREATE UNIQUE INDEX uq_plan_targets_asset ON public.maintenance_plan_targets USING btree (plan_id, asset_id) WHERE (((target_type)::text = 'asset'::text) AND (asset_id IS NOT NULL));
CREATE UNIQUE INDEX uq_plan_targets_asset_group ON public.maintenance_plan_targets USING btree (plan_id, asset_group_id) WHERE (((target_type)::text = 'asset_group'::text) AND (asset_group_id IS NOT NULL));
CREATE UNIQUE INDEX uq_plan_targets_building ON public.maintenance_plan_targets USING btree (plan_id, building_id) WHERE (((target_type)::text = 'building'::text) AND (building_id IS NOT NULL));


-- ===== FUNCTIONS =====
CREATE OR REPLACE FUNCTION public.approve_work_order_draft(p_draft_id uuid, p_review_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_id UUID := auth.uid();
  v_actor_role TEXT;
  v_actor_tenant_id UUID;
  v_draft public.work_order_drafts%ROWTYPE;
  v_work_order public.work_orders%ROWTYPE;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT p.role, p.tenant_id
    INTO v_actor_role, v_actor_tenant_id
  FROM public.profiles p
  WHERE p.id = v_actor_id
    AND COALESCE(p.is_active, true) = true;

  IF v_actor_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Active profile is required' USING ERRCODE = '42501';
  END IF;

  IF v_actor_role NOT IN ('tenant_admin', 'maintenance_manager', 'supervisor', 'engineer') THEN
    RAISE EXCEPTION 'User cannot approve intake drafts' USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_draft
  FROM public.work_order_drafts
  WHERE id = p_draft_id
  FOR UPDATE;

  IF v_draft.id IS NULL THEN
    RAISE EXCEPTION 'Work order draft not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_draft.tenant_id <> v_actor_tenant_id THEN
    RAISE EXCEPTION 'Cross-tenant draft approval is not allowed' USING ERRCODE = '42501';
  END IF;

  IF v_draft.status NOT IN ('ready_for_review', 'needs_info') THEN
    RAISE EXCEPTION 'Draft cannot be approved from status %', v_draft.status USING ERRCODE = '23514';
  END IF;

  SELECT *
    INTO v_work_order
  FROM public.create_work_order(
    jsonb_strip_nulls(jsonb_build_object(
      'title', v_draft.title,
      'description', v_draft.description,
      'priority', v_draft.priority,
      'issue_type_id', v_draft.issue_type_id,
      'issue_type', v_draft.issue_type,
      'building_id', v_draft.building_id,
      'floor_id', v_draft.floor_id,
      'department_id', v_draft.department_id,
      'room_id', v_draft.room_id,
      'asset_id', v_draft.asset_id,
      'reporter_name', v_draft.reporter_name,
      'reporter_phone', v_draft.reporter_phone
    )),
    NULL
  );

  UPDATE public.work_order_drafts
  SET status = 'converted',
      reviewed_by = v_actor_id,
      reviewed_at = now(),
      supervisor_note = NULLIF(btrim(COALESCE(p_review_note, '')), ''),
      converted_work_order_id = v_work_order.id,
      updated_at = now()
  WHERE id = v_draft.id;

  UPDATE public.intake_reports
  SET status = 'converted_to_work_order',
      current_step = 'converted',
      converted_work_order_id = v_work_order.id,
      updated_at = now()
  WHERE id = v_draft.intake_report_id;

  INSERT INTO public.operational_events (
    tenant_id,
    entity_type,
    entity_id,
    event_type,
    actor_type,
    actor_user_id,
    source,
    metadata
  )
  VALUES
    (
      v_draft.tenant_id,
      'work_order_draft',
      v_draft.id,
      'work_order_draft_approved',
      'user',
      v_actor_id,
      'operations_inbox',
      jsonb_build_object('work_order_id', v_work_order.id, 'review_note_present', p_review_note IS NOT NULL)
    ),
    (
      v_draft.tenant_id,
      'work_order',
      v_work_order.id,
      'work_order_created_from_intake',
      'user',
      v_actor_id,
      'operations_inbox',
      jsonb_build_object('work_order_draft_id', v_draft.id, 'intake_report_id', v_draft.intake_report_id)
    );

  INSERT INTO public.notification_logs (
    tenant_id,
    channel,
    template_key,
    status,
    related_entity_type,
    related_entity_id,
    payload
  )
  VALUES (
    v_draft.tenant_id,
    'in_app',
    'work_order_created_from_intake',
    'queued',
    'work_order',
    v_work_order.id,
    jsonb_build_object('work_order_draft_id', v_draft.id, 'intake_report_id', v_draft.intake_report_id)
  );

  RETURN jsonb_build_object(
    'work_order_id', v_work_order.id,
    'work_order_code', v_work_order.code,
    'work_order_draft_id', v_draft.id,
    'status', 'converted'
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.approve_work_order_engineer(p_work_order_id uuid, p_notes text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_actor_id             UUID    := auth.uid();
    v_actor_role           TEXT;
    v_actor_tenant         UUID;
    v_is_super             BOOLEAN := FALSE;
    v_tenant_id            UUID;
    v_old_status           TEXT;
    v_is_platform_override BOOLEAN := FALSE;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT role, tenant_id, COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_is_super
      FROM public.profiles
     WHERE id = v_actor_id;

    IF v_actor_role IS NULL AND NOT v_is_super THEN
        RAISE EXCEPTION 'Caller profile not found';
    END IF;

    SELECT tenant_id, status
      INTO v_tenant_id, v_old_status
      FROM public.work_orders
     WHERE id = p_work_order_id;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Work order not found';
    END IF;

    v_is_platform_override := v_is_super OR v_actor_role IN ('platform_owner', 'platform_admin');

    IF NOT v_is_platform_override AND v_actor_tenant IS DISTINCT FROM v_tenant_id THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant';
    END IF;

    IF v_actor_role NOT IN (
        'tenant_admin', 'maintenance_manager', 'engineer',
        'platform_owner', 'platform_admin'
    ) AND NOT v_is_super THEN
        RAISE EXCEPTION 'Unauthorized: only engineers or managers can review';
    END IF;

    IF v_old_status <> 'pending_engineer_review' THEN
        RAISE EXCEPTION 'Cannot review work order in status: %', v_old_status;
    END IF;

    -- Authorize the trigger guard for this transaction before the UPDATE.
    PERFORM set_config('app.work_order_workflow_authorized', 'true', TRUE);

    UPDATE public.work_orders
       SET status               = 'pending_reporter_closure',
           engineer_notes       = p_notes,
           engineer_approved_by = v_actor_id,
           engineer_approved_at = NOW(),
           updated_at           = NOW()
     WHERE id = p_work_order_id;

    PERFORM public.create_operation_log(
        v_tenant_id, p_work_order_id, 'maintenance', 'Approved by engineer', v_actor_id
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.approve_work_order_supervisor(p_work_order_id uuid, p_notes text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_actor_id             UUID    := auth.uid();
    v_actor_role           TEXT;
    v_actor_tenant         UUID;
    v_is_super             BOOLEAN := FALSE;
    v_tenant_id            UUID;
    v_old_status           TEXT;
    v_tenant_settings      JSONB;
    v_require_engineer     BOOLEAN;
    v_next_status          TEXT;
    v_is_platform_override BOOLEAN := FALSE;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT role, tenant_id, COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_is_super
      FROM public.profiles
     WHERE id = v_actor_id;

    IF v_actor_role IS NULL AND NOT v_is_super THEN
        RAISE EXCEPTION 'Caller profile not found';
    END IF;

    SELECT tenant_id, status
      INTO v_tenant_id, v_old_status
      FROM public.work_orders
     WHERE id = p_work_order_id;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Work order not found';
    END IF;

    v_is_platform_override := v_is_super OR v_actor_role IN ('platform_owner', 'platform_admin');

    IF NOT v_is_platform_override AND v_actor_tenant IS DISTINCT FROM v_tenant_id THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant';
    END IF;

    IF v_actor_role NOT IN (
        'tenant_admin', 'maintenance_manager', 'supervisor',
        'platform_owner', 'platform_admin'
    ) AND NOT v_is_super THEN
        RAISE EXCEPTION 'Unauthorized: only supervisors or managers can approve';
    END IF;

    IF v_old_status <> 'pending_supervisor_approval' THEN
        RAISE EXCEPTION 'Cannot approve work order in status: %', v_old_status;
    END IF;

    SELECT settings INTO v_tenant_settings FROM public.tenants WHERE id = v_tenant_id;
    v_require_engineer := COALESCE(
        (v_tenant_settings->'work_orders'->>'require_engineer_review')::BOOLEAN, TRUE
    );
    v_next_status := CASE WHEN v_require_engineer
                          THEN 'pending_engineer_review'
                          ELSE 'pending_reporter_closure' END;

    -- Authorize the trigger guard for this transaction before the UPDATE.
    PERFORM set_config('app.work_order_workflow_authorized', 'true', TRUE);

    UPDATE public.work_orders
       SET status                  = v_next_status,
           supervisor_notes        = p_notes,
           supervisor_approved_by  = v_actor_id,
           supervisor_approved_at  = NOW(),
           updated_at              = NOW()
     WHERE id = p_work_order_id;

    PERFORM public.create_operation_log(
        v_tenant_id, p_work_order_id, 'maintenance',
        'Approved by supervisor. Next status: ' || v_next_status, v_actor_id
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.assign_work_order(p_work_order_id uuid, p_assigned_to uuid DEFAULT NULL::uuid, p_assigned_team uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_actor_id          UUID := auth.uid();
    v_actor_role        TEXT;
    v_actor_tenant      UUID;
    v_actor_active      BOOLEAN;
    v_actor_super       BOOLEAN := FALSE;
    v_wo                public.work_orders%ROWTYPE;
    v_assignee_role     TEXT;
    v_assignee_tenant   UUID;
    v_assignee_active   BOOLEAN;
    v_team_tenant       UUID;
    v_team_status       TEXT;
    v_reason            TEXT := NULLIF(BTRIM(p_reason), '');
    v_target_to         UUID;
    v_target_team       UUID;
    v_reassignment      BOOLEAN := FALSE;
    v_new_status        TEXT;
    v_log_code          TEXT;
    v_description       TEXT;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    IF p_work_order_id IS NULL THEN
        RAISE EXCEPTION 'Work order id is required' USING ERRCODE = '22023';
    END IF;

    IF p_assigned_to IS NULL AND p_assigned_team IS NULL THEN
        RAISE EXCEPTION 'At least one assignee or team is required'
            USING ERRCODE = '22023';
    END IF;

    SELECT role, tenant_id, COALESCE(is_active, TRUE), COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_actor_active, v_actor_super
      FROM public.profiles
     WHERE id = v_actor_id;

    IF v_actor_role IS NULL AND NOT v_actor_super THEN
        RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '28000';
    END IF;

    IF NOT COALESCE(v_actor_active, FALSE) THEN
        RAISE EXCEPTION 'Inactive users cannot assign work orders' USING ERRCODE = '28000';
    END IF;

    SELECT *
      INTO v_wo
      FROM public.work_orders
     WHERE id = p_work_order_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Work order not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_actor_tenant IS DISTINCT FROM v_wo.tenant_id THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant'
            USING ERRCODE = '42501';
    END IF;

    IF v_actor_role NOT IN ('tenant_admin', 'maintenance_manager') THEN
        RAISE EXCEPTION 'Insufficient permissions to assign work orders'
            USING ERRCODE = '42501';
    END IF;

    IF v_wo.status NOT IN ('pending', 'assigned', 'on_hold') THEN
        RAISE EXCEPTION 'Cannot assign work order in status: %', v_wo.status
            USING ERRCODE = '22023';
    END IF;

    IF p_assigned_to IS NOT NULL THEN
        SELECT role, tenant_id, COALESCE(is_active, TRUE)
          INTO v_assignee_role, v_assignee_tenant, v_assignee_active
          FROM public.profiles
         WHERE id = p_assigned_to;

        IF v_assignee_role IS NULL THEN
            RAISE EXCEPTION 'Assignee user not found' USING ERRCODE = '22023';
        END IF;

        IF NOT COALESCE(v_assignee_active, FALSE) THEN
            RAISE EXCEPTION 'Assignee user is inactive' USING ERRCODE = '42501';
        END IF;

        IF v_assignee_tenant IS DISTINCT FROM v_wo.tenant_id THEN
            RAISE EXCEPTION 'Assignee does not belong to this tenant'
                USING ERRCODE = '42501';
        END IF;

        IF v_assignee_role NOT IN ('technician', 'engineer') THEN
            RAISE EXCEPTION 'Assignee role is not allowed for work-order assignment'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    IF p_assigned_team IS NOT NULL THEN
        SELECT tenant_id, status
          INTO v_team_tenant, v_team_status
          FROM public.teams
         WHERE id = p_assigned_team;

        IF v_team_tenant IS NULL THEN
            RAISE EXCEPTION 'Assigned team not found' USING ERRCODE = '22023';
        END IF;

        IF v_team_tenant IS DISTINCT FROM v_wo.tenant_id THEN
            RAISE EXCEPTION 'Assigned team does not belong to this tenant'
                USING ERRCODE = '42501';
        END IF;

        IF COALESCE(v_team_status, 'active') <> 'active' THEN
            RAISE EXCEPTION 'Assigned team is not active' USING ERRCODE = '42501';
        END IF;
    END IF;

    IF p_assigned_to IS NOT NULL
       AND p_assigned_team IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
             FROM public.team_members tm
            WHERE tm.team_id = p_assigned_team
              AND tm.user_id = p_assigned_to
              AND COALESCE(tm.is_active, TRUE) = TRUE
       )
    THEN
        RAISE EXCEPTION 'Assignee is not an active member of the assigned team'
            USING ERRCODE = '42501';
    END IF;

    v_target_to := COALESCE(p_assigned_to, v_wo.assigned_to);
    v_target_team := COALESCE(p_assigned_team, v_wo.assigned_team);

    v_reassignment := (
        (v_wo.assigned_to IS NOT NULL AND v_wo.assigned_to IS DISTINCT FROM v_target_to)
        OR (v_wo.assigned_team IS NOT NULL AND v_wo.assigned_team IS DISTINCT FROM v_target_team)
        OR (v_wo.status <> 'pending' AND (
            (v_wo.assigned_to IS NULL AND v_target_to IS NOT NULL)
            OR (v_wo.assigned_team IS NULL AND v_target_team IS NOT NULL)
        ))
    );

    IF v_reassignment
       AND v_wo.status <> 'pending'
       AND v_reason IS NULL
    THEN
        RAISE EXCEPTION 'Reassignment reason is required'
            USING ERRCODE = '22023';
    END IF;

    v_new_status := CASE WHEN v_wo.status = 'pending' THEN 'assigned' ELSE v_wo.status END;

    PERFORM set_config('app.work_order_workflow_authorized', 'true', TRUE);

    UPDATE public.work_orders
       SET assigned_to = v_target_to,
           assigned_team = v_target_team,
           status = v_new_status,
           updated_at = NOW()
     WHERE id = p_work_order_id
     RETURNING * INTO v_wo;

    v_description := 'Work order assigned'
        || CASE WHEN p_assigned_to IS NULL THEN '' ELSE '; assigned_to=' || p_assigned_to::TEXT END
        || CASE WHEN p_assigned_team IS NULL THEN '' ELSE '; assigned_team=' || p_assigned_team::TEXT END
        || CASE WHEN v_reason IS NULL THEN '' ELSE '; reason=' || v_reason END;

    v_log_code := 'LOG-' || to_char(NOW(), 'YYMMDDHH24MISS') || '-' || substring(gen_random_uuid()::TEXT FROM 1 FOR 4);

    INSERT INTO public.operation_logs (
        tenant_id,
        code,
        type,
        description,
        reason,
        work_order_id,
        asset_id,
        building_id,
        performed_by,
        team_id,
        timestamp,
        status
    ) VALUES (
        v_wo.tenant_id,
        v_log_code,
        'assignment',
        v_description,
        v_reason,
        v_wo.id,
        v_wo.asset_id,
        v_wo.building_id,
        v_actor_id,
        v_wo.assigned_team,
        NOW(),
        'completed'
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'work_order_id', v_wo.id,
        'assigned_to', v_wo.assigned_to,
        'assigned_team', v_wo.assigned_team,
        'status', v_wo.status
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_close_stale_work_orders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- Disabled for Pilot v1.
    -- Pre-existing schema bugs: references non-existent columns closed_at and
    -- closed_notes. Correct column is auto_closed_at; closed_notes has no
    -- equivalent. Additionally, auto-closing in_progress/on_hold orders is
    -- too aggressive for Pilot v1. Reporter closure remains manual via the
    -- close_work_order RPC. See migration 126 for the full re-enable path.
    RETURN 0;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.broadcast_notification(p_target_tenant_id uuid, p_title text, p_message text, p_type text DEFAULT 'info'::text, p_link text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_caller_role text;
    v_count       integer;
BEGIN
    -- Verify caller is a platform admin
    SELECT role INTO v_caller_role
    FROM profiles
    WHERE id = auth.uid();

    IF v_caller_role NOT IN ('platform_owner', 'platform_admin') THEN
        RAISE EXCEPTION 'Access denied: platform admin role required to broadcast notifications';
    END IF;

    WITH inserted AS (
        INSERT INTO notifications (tenant_id, user_id, title, message, type, link, is_read)
        SELECT
            p.tenant_id,
            p.id,
            p_title,
            p_message,
            p_type,
            p_link,
            false
        FROM profiles p
        WHERE
            (p_target_tenant_id IS NULL OR p.tenant_id = p_target_tenant_id)
        RETURNING id
    )
    SELECT count(*) INTO v_count FROM inserted;

    RETURN v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.broadcast_notification(p_target_tenant_id uuid, p_title text, p_message text, p_type text DEFAULT 'info'::text, p_link text DEFAULT NULL::text, p_specific_user_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_caller_role text;
    v_count       integer;
BEGIN
    -- Verify caller is a platform admin
    SELECT role INTO v_caller_role
    FROM profiles
    WHERE id = auth.uid();

    IF v_caller_role NOT IN ('platform_owner', 'platform_admin') THEN
        RAISE EXCEPTION 'Access denied: platform admin role required to broadcast notifications';
    END IF;

    WITH inserted AS (
        INSERT INTO notifications (tenant_id, user_id, title, message, type, link, is_read)
        SELECT
            p.tenant_id,
            p.id,
            p_title,
            p_message,
            p_type,
            p_link,
            false
        FROM profiles p
        WHERE
            p.tenant_id IS NOT NULL
            AND (p_target_tenant_id IS NULL OR p.tenant_id = p_target_tenant_id)
            AND (p_specific_user_ids IS NULL OR p.id = ANY(p_specific_user_ids))
        RETURNING id
    )
    SELECT count(*) INTO v_count FROM inserted;

    RETURN v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.can_create_work_orders_scope(p_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND (
            COALESCE(p.is_super_admin, FALSE) = TRUE
            OR p.role IN ('platform_owner', 'platform_admin')
            OR (
                p.tenant_id = p_tenant_id
                AND public.tenant_has_operational_access(p_tenant_id)
                AND p.role IN ('tenant_admin', 'facility_manager', 'maintenance_manager', 'supervisor', 'engineer', 'reporter')
            )
          )
    );
$function$
;

CREATE OR REPLACE FUNCTION public.can_manage_assets_scope(p_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND (
            COALESCE(p.is_super_admin, FALSE) = TRUE
            OR p.role IN ('platform_owner', 'platform_admin')
            OR (
                p.tenant_id = p_tenant_id
                AND public.tenant_has_operational_access(p_tenant_id)
                AND p.role IN ('tenant_admin', 'facility_manager')
            )
          )
    );
$function$
;

CREATE OR REPLACE FUNCTION public.can_manage_facilities(p_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND (
            COALESCE(p.is_super_admin, FALSE) = TRUE
            OR p.role IN ('platform_owner', 'platform_admin')
            OR (
                p.tenant_id = p_tenant_id
                AND public.tenant_has_operational_access(p_tenant_id)
                AND p.role IN ('tenant_admin', 'facility_manager')
            )
          )
    );
$function$
;

CREATE OR REPLACE FUNCTION public.can_manage_inventory(p_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT EXISTS (
        SELECT 1
          FROM public.profiles p
         WHERE p.id = auth.uid()
           AND (
                COALESCE(p.is_super_admin, FALSE) = TRUE
                OR p.role IN ('platform_owner', 'platform_admin')
                OR (
                    p.tenant_id = p_tenant_id
                    AND public.tenant_has_operational_access(p_tenant_id)
                    AND p.role IN ('tenant_owner', 'tenant_admin', 'maintenance_manager')
                )
           )
    );
$function$
;

CREATE OR REPLACE FUNCTION public.can_manage_work_orders_scope(p_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND (
            COALESCE(p.is_super_admin, FALSE) = TRUE
            OR p.role IN ('platform_owner', 'platform_admin')
            OR (
                p.tenant_id = p_tenant_id
                AND public.tenant_has_operational_access(p_tenant_id)
                AND p.role IN ('tenant_admin', 'maintenance_manager')
            )
          )
    );
$function$
;

CREATE OR REPLACE FUNCTION public.can_manage_work_teams(p_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND (
            COALESCE(p.is_super_admin, FALSE) = TRUE
            OR p.role IN ('platform_owner', 'platform_admin')
            OR (
                p.tenant_id = p_tenant_id
                AND public.tenant_has_operational_access(p_tenant_id)
                AND p.role IN ('tenant_admin', 'maintenance_manager')
            )
          )
    );
$function$
;

CREATE OR REPLACE FUNCTION public.can_view_inventory(p_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT EXISTS (
        SELECT 1
          FROM public.profiles p
         WHERE p.id = auth.uid()
           AND (
                COALESCE(p.is_super_admin, FALSE) = TRUE
                OR p.role IN ('platform_owner', 'platform_admin')
                OR (
                    p.tenant_id = p_tenant_id
                    AND public.tenant_has_operational_access(p_tenant_id)
                )
           )
    );
$function$
;

CREATE OR REPLACE FUNCTION public.can_view_platform_tenants()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role TEXT;
    v_is_super BOOLEAN;
BEGIN
    SELECT role, is_super_admin
      INTO v_role, v_is_super
      FROM public.profiles
     WHERE id = auth.uid();

    RETURN COALESCE(v_is_super, FALSE)
        OR v_role IN ('platform_owner', 'platform_admin', 'platform_support');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cancel_work_order(p_work_order_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_actor_id          UUID := auth.uid();
    v_actor_role        TEXT;
    v_actor_tenant      UUID;
    v_actor_active      BOOLEAN;
    v_actor_super       BOOLEAN := FALSE;
    v_wo                public.work_orders%ROWTYPE;
    v_reason            TEXT := NULLIF(BTRIM(p_reason), '');
    v_log_code          TEXT;
    v_description       TEXT;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    IF p_work_order_id IS NULL THEN
        RAISE EXCEPTION 'Work order id is required' USING ERRCODE = '22023';
    END IF;

    IF v_reason IS NULL THEN
        RAISE EXCEPTION 'Cancellation reason is required' USING ERRCODE = '22023';
    END IF;

    SELECT role, tenant_id, COALESCE(is_active, TRUE), COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_actor_active, v_actor_super
      FROM public.profiles
     WHERE id = v_actor_id;

    IF v_actor_role IS NULL AND NOT v_actor_super THEN
        RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '28000';
    END IF;

    IF NOT COALESCE(v_actor_active, FALSE) THEN
        RAISE EXCEPTION 'Inactive users cannot cancel work orders' USING ERRCODE = '28000';
    END IF;

    IF v_actor_role NOT IN ('tenant_admin', 'maintenance_manager') THEN
        RAISE EXCEPTION 'Insufficient permissions to cancel work orders'
            USING ERRCODE = '42501';
    END IF;

    SELECT *
      INTO v_wo
      FROM public.work_orders
     WHERE id = p_work_order_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Work order not found' USING ERRCODE = 'P0002';
    END IF;

    IF v_actor_tenant IS DISTINCT FROM v_wo.tenant_id THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant'
            USING ERRCODE = '42501';
    END IF;

    IF v_wo.status NOT IN ('pending', 'assigned', 'on_hold') THEN
        RAISE EXCEPTION 'Cannot cancel work order in status: %', v_wo.status
            USING ERRCODE = '22023';
    END IF;

    PERFORM set_config('app.work_order_workflow_authorized', 'true', TRUE);

    UPDATE public.work_orders
       SET status = 'cancelled',
           cancelled_at = NOW(),
           cancellation_reason = v_reason,
           updated_at = NOW()
     WHERE id = p_work_order_id
     RETURNING * INTO v_wo;

    v_description := 'Work order cancelled; reason=' || v_reason;
    v_log_code := 'LOG-' || to_char(NOW(), 'YYMMDDHH24MISS') || '-' || substring(gen_random_uuid()::TEXT FROM 1 FOR 4);

    INSERT INTO public.operation_logs (
        tenant_id,
        code,
        type,
        description,
        reason,
        work_order_id,
        asset_id,
        building_id,
        performed_by,
        team_id,
        timestamp,
        status
    ) VALUES (
        v_wo.tenant_id,
        v_log_code,
        'cancellation',
        v_description,
        v_reason,
        v_wo.id,
        v_wo.asset_id,
        v_wo.building_id,
        v_actor_id,
        v_wo.assigned_team,
        NOW(),
        'completed'
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'work_order_id', v_wo.id,
        'status', v_wo.status,
        'reason', v_reason
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_and_escalate_priority()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_count INTEGER := 0;
    v_tenant RECORD;
    v_max_response_hours INTEGER;
    v_escalation_enabled BOOLEAN;
    v_escalated_count INTEGER;
BEGIN
    -- Loop through all tenants
    FOR v_tenant IN SELECT id, settings FROM tenants WHERE is_active = true
    LOOP
        -- Get settings
        v_max_response_hours := COALESCE(
            (v_tenant.settings->'work_orders'->>'max_response_time_hours')::INTEGER, 
            24
        );
        v_escalation_enabled := COALESCE(
            (v_tenant.settings->'work_orders'->>'priority_escalation_enabled')::BOOLEAN, 
            true
        );
        
        -- Skip if escalation is disabled
        IF NOT v_escalation_enabled THEN
            CONTINUE;
        END IF;
        
        -- Escalate low priority to medium
        UPDATE work_orders
        SET 
            priority = 'medium',
            notes = COALESCE(notes, '') || E'\n[Auto-Escalated] تم تصعيد الأولوية تلقائياً بسبب تجاوز وقت الاستجابة',
            updated_at = NOW()
        WHERE tenant_id = v_tenant.id
          AND status IN ('pending', 'assigned')
          AND priority = 'low'
          AND created_at < (NOW() - (v_max_response_hours || ' hours')::INTERVAL);
        
        GET DIAGNOSTICS v_escalated_count = ROW_COUNT;
        v_count := v_count + v_escalated_count;
        
        -- Escalate medium priority to high
        UPDATE work_orders
        SET 
            priority = 'high',
            notes = COALESCE(notes, '') || E'\n[Auto-Escalated] تم تصعيد الأولوية تلقائياً بسبب تجاوز وقت الاستجابة',
            updated_at = NOW()
        WHERE tenant_id = v_tenant.id
          AND status IN ('pending', 'assigned')
          AND priority = 'medium'
          AND created_at < (NOW() - ((v_max_response_hours * 2) || ' hours')::INTERVAL);
        
        GET DIAGNOSTICS v_escalated_count = ROW_COUNT;
        v_count := v_count + v_escalated_count;
        
        -- Escalate high priority to critical
        UPDATE work_orders
        SET 
            priority = 'critical',
            notes = COALESCE(notes, '') || E'\n[URGENT] تم تصعيد الأولوية للطوارئ بسبب تجاوز وقت الاستجابة الأقصى',
            updated_at = NOW()
        WHERE tenant_id = v_tenant.id
          AND status IN ('pending', 'assigned')
          AND priority = 'high'
          AND created_at < (NOW() - ((v_max_response_hours * 3) || ' hours')::INTERVAL);
        
        GET DIAGNOSTICS v_escalated_count = ROW_COUNT;
        v_count := v_count + v_escalated_count;
    END LOOP;
    
    RETURN v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_subscription_limits(p_tenant_id uuid, p_resource_type character varying)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_limit   integer;
    v_current integer;
    v_plan_id uuid;
BEGIN
    -- Primary: tenant_subscriptions
    SELECT ts.plan_id INTO v_plan_id
      FROM public.tenant_subscriptions ts
     WHERE ts.tenant_id = p_tenant_id
     LIMIT 1;

    -- Fallback 1: tenants.plan_id
    IF v_plan_id IS NULL THEN
        SELECT plan_id INTO v_plan_id FROM public.tenants WHERE id = p_tenant_id;
    END IF;

    -- Fallback 2: default plan
    IF v_plan_id IS NULL THEN
        SELECT id INTO v_plan_id FROM public.subscription_plans
         WHERE is_default = true AND is_active = true LIMIT 1;
    END IF;

    IF v_plan_id IS NULL THEN RETURN true; END IF;

    SELECT CASE p_resource_type
        WHEN 'users'       THEN max_users
        WHEN 'buildings'   THEN max_buildings
        WHEN 'assets'      THEN max_assets
        WHEN 'work_orders' THEN max_work_orders_monthly
        ELSE -1
    END INTO v_limit
    FROM public.subscription_plans WHERE id = v_plan_id;

    IF v_limit IS NULL OR v_limit < 0 THEN RETURN true; END IF;

    IF p_resource_type = 'users' THEN
        SELECT COUNT(*) INTO v_current FROM public.profiles
         WHERE tenant_id = p_tenant_id AND COALESCE(is_active, true) = true;
    ELSIF p_resource_type = 'buildings' THEN
        SELECT COUNT(*) INTO v_current FROM public.buildings WHERE tenant_id = p_tenant_id;
    ELSIF p_resource_type = 'assets' THEN
        SELECT COUNT(*) INTO v_current FROM public.assets WHERE tenant_id = p_tenant_id;
    ELSIF p_resource_type = 'work_orders' THEN
        SELECT COUNT(*) INTO v_current FROM public.work_orders
         WHERE tenant_id = p_tenant_id
           AND created_at >= date_trunc('month', CURRENT_DATE);
    ELSE
        RETURN true;
    END IF;

    RETURN v_current < v_limit;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cleanup_expired_otps()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    DELETE FROM password_reset_otps WHERE expires_at < NOW();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.close_work_order(p_work_order_id uuid, p_notes text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_actor_id               UUID    := auth.uid();
    v_actor_role             TEXT;
    v_actor_tenant           UUID;
    v_is_super               BOOLEAN := FALSE;
    v_tenant_id              UUID;
    v_old_status             TEXT;
    v_reported_by            UUID;
    v_is_platform_override   BOOLEAN := FALSE;
    v_is_management_override BOOLEAN := FALSE;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT role, tenant_id, COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_is_super
      FROM public.profiles
     WHERE id = v_actor_id;

    IF v_actor_role IS NULL AND NOT v_is_super THEN
        RAISE EXCEPTION 'Caller profile not found';
    END IF;

    SELECT tenant_id, status, reported_by
      INTO v_tenant_id, v_old_status, v_reported_by
      FROM public.work_orders
     WHERE id = p_work_order_id;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Work order not found';
    END IF;

    v_is_platform_override   := v_is_super OR v_actor_role IN ('platform_owner', 'platform_admin');
    v_is_management_override := v_is_platform_override OR v_actor_role IN ('tenant_admin', 'maintenance_manager');

    IF NOT v_is_platform_override AND v_actor_tenant IS DISTINCT FROM v_tenant_id THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant';
    END IF;

    IF NOT v_is_management_override AND v_reported_by IS DISTINCT FROM v_actor_id THEN
        RAISE EXCEPTION 'Only the original reporter can close this work order';
    END IF;

    IF v_old_status <> 'pending_reporter_closure' THEN
        RAISE EXCEPTION 'Cannot close work order in status: %', v_old_status;
    END IF;

    -- Authorize the trigger guard for this transaction before the UPDATE.
    PERFORM set_config('app.work_order_workflow_authorized', 'true', TRUE);

    UPDATE public.work_orders
       SET status               = 'completed',
           completed_at         = NOW(),
           customer_reviewed_by = v_actor_id,
           customer_reviewed_at = NOW(),
           reporter_notes       = p_notes,
           updated_at           = NOW()
     WHERE id = p_work_order_id;

    PERFORM public.create_operation_log(
        v_tenant_id, p_work_order_id, 'maintenance', 'Work order closed', v_actor_id
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.complete_pending_registration(p_draft jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_profile public.profiles%ROWTYPE;
    v_draft JSONB := p_draft;
    v_result JSONB;
    v_full_name TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT *
      INTO v_profile
      FROM public.profiles
     WHERE id = v_user_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Caller profile not found';
    END IF;

    IF v_profile.tenant_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'tenant_id', v_profile.tenant_id,
            'already_completed', true
        );
    END IF;

    IF COALESCE(v_profile.is_super_admin, FALSE) = TRUE OR v_profile.role LIKE 'platform_%' THEN
        RAISE EXCEPTION 'Platform users do not require tenant provisioning';
    END IF;

    IF v_draft IS NULL THEN
        SELECT raw_user_meta_data -> 'registration_draft'
          INTO v_draft
          FROM auth.users
         WHERE id = v_user_id;
    END IF;

    IF v_draft IS NULL OR jsonb_typeof(v_draft) <> 'object' THEN
        RAISE EXCEPTION 'No pending registration draft found for this user';
    END IF;

    IF NULLIF(TRIM(v_draft->>'org_name_ar'), '') IS NULL
        OR NULLIF(TRIM(v_draft->>'org_name_en'), '') IS NULL
        OR NULLIF(TRIM(v_draft->>'org_address'), '') IS NULL
        OR NULLIF(TRIM(v_draft->>'org_city'), '') IS NULL
        OR NULLIF(TRIM(v_draft->>'cr_number'), '') IS NULL
        OR NULLIF(TRIM(v_draft->>'tax_number'), '') IS NULL
    THEN
        RAISE EXCEPTION 'Registration draft is incomplete';
    END IF;

    v_full_name := NULLIF(
        TRIM(
            CONCAT_WS(
                ' ',
                NULLIF(TRIM(v_draft->>'first_name'), ''),
                NULLIF(TRIM(v_draft->>'last_name'), '')
            )
        ),
        ''
    );

    v_result := public.provision_tenant(
        p_name                   := NULLIF(TRIM(v_draft->>'org_name_en'), ''),
        p_name_ar                := NULLIF(TRIM(v_draft->>'org_name_ar'), ''),
        p_email                  := COALESCE(NULLIF(TRIM(v_draft->>'org_email'), ''), v_profile.email),
        p_phone                  := NULLIF(TRIM(v_draft->>'org_phone'), ''),
        p_address                := NULLIF(TRIM(v_draft->>'org_address'), ''),
        p_cr_number              := NULLIF(TRIM(v_draft->>'cr_number'), ''),
        p_tax_number             := NULLIF(TRIM(v_draft->>'tax_number'), ''),
        p_country                := NULLIF(TRIM(v_draft->>'org_country'), ''),
        p_city                   := NULLIF(TRIM(v_draft->>'org_city'), ''),
        p_postal_code            := NULLIF(TRIM(v_draft->>'org_postal_code'), ''),
        p_website                := NULLIF(TRIM(v_draft->>'org_website'), ''),
        p_plan_code              := NULL,
        p_trial_days             := NULL,
        p_assign_caller_as_admin := TRUE,
        p_caller_full_name       := COALESCE(v_full_name, v_profile.full_name, v_profile.email),
        p_caller_phone           := COALESCE(
            NULLIF(TRIM(v_draft->>'admin_phone'), ''),
            NULLIF(TRIM(v_draft->>'org_phone'), ''),
            v_profile.phone
        )
    );

    UPDATE auth.users
       SET raw_user_meta_data =
            (COALESCE(raw_user_meta_data, '{}'::jsonb) - 'registration_draft')
            || jsonb_build_object('registration_status', 'completed')
     WHERE id = v_user_id;

    RETURN v_result || jsonb_build_object('completed_via', 'registration_recovery');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.complete_work_order_technician(p_work_order_id uuid, p_technician_notes text DEFAULT ''::text, p_parts jsonb DEFAULT '[]'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_actor_id               UUID    := auth.uid();
    v_actor_role             TEXT;
    v_actor_tenant           UUID;
    v_is_super               BOOLEAN := FALSE;
    v_tenant_id              UUID;
    v_old_status             TEXT;
    v_assigned_to            UUID;
    v_tenant_settings        JSONB;
    v_require_supervisor     BOOLEAN;
    v_require_engineer       BOOLEAN;
    v_next_status            TEXT;
    v_is_platform_override   BOOLEAN := FALSE;
    v_is_management_override BOOLEAN := FALSE;
    v_part                   JSONB;
    v_part_id                UUID;
    v_part_quantity          DECIMAL;
    v_item_cost              DECIMAL;
    v_item_name              VARCHAR;
    v_available_qty          DECIMAL;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    SELECT role, tenant_id, COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_is_super
      FROM public.profiles
     WHERE id = v_actor_id;

    IF v_actor_role IS NULL AND NOT v_is_super THEN
        RAISE EXCEPTION 'Caller profile not found';
    END IF;

    SELECT tenant_id, status, assigned_to
      INTO v_tenant_id, v_old_status, v_assigned_to
      FROM public.work_orders
     WHERE id = p_work_order_id;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Work order not found';
    END IF;

    v_is_platform_override   := v_is_super OR v_actor_role IN ('platform_owner', 'platform_admin');
    v_is_management_override := v_is_platform_override OR v_actor_role IN ('tenant_admin', 'maintenance_manager');

    IF NOT v_is_platform_override AND v_actor_tenant IS DISTINCT FROM v_tenant_id THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant';
    END IF;

    IF v_actor_role NOT IN (
        'tenant_admin', 'maintenance_manager', 'engineer', 'technician',
        'platform_owner', 'platform_admin'
    ) AND NOT v_is_super THEN
        RAISE EXCEPTION 'Unauthorized: you are not allowed to complete this work order';
    END IF;

    IF v_old_status <> 'in_progress' THEN
        RAISE EXCEPTION 'Cannot complete work order in status: %', v_old_status;
    END IF;

    IF NOT v_is_management_override AND v_assigned_to IS DISTINCT FROM v_actor_id THEN
        RAISE EXCEPTION 'Only the assigned technician can complete this work order';
    END IF;

    SELECT settings INTO v_tenant_settings
      FROM public.tenants WHERE id = v_tenant_id;

    v_require_supervisor := COALESCE(
        (v_tenant_settings->'work_orders'->>'require_supervisor_approval')::BOOLEAN, TRUE
    );
    v_require_engineer := COALESCE(
        (v_tenant_settings->'work_orders'->>'require_engineer_review')::BOOLEAN, TRUE
    );

    IF v_require_supervisor THEN
        v_next_status := 'pending_supervisor_approval';
    ELSIF v_require_engineer THEN
        v_next_status := 'pending_engineer_review';
    ELSE
        v_next_status := 'pending_reporter_closure';
    END IF;

    -- Authorize the trigger guard for this transaction before the UPDATE.
    PERFORM set_config('app.work_order_workflow_authorized', 'true', TRUE);

    UPDATE public.work_orders
       SET status                  = v_next_status,
           technician_notes        = p_technician_notes,
           technician_completed_at = NOW(),
           end_time                = NOW(),
           updated_at              = NOW()
     WHERE id = p_work_order_id;

    PERFORM public.create_operation_log(
        v_tenant_id, p_work_order_id, 'maintenance',
        'Work completed by technician. Next status: ' || v_next_status, v_actor_id
    );

    IF p_parts IS NOT NULL AND jsonb_typeof(p_parts) = 'array' AND jsonb_array_length(p_parts) > 0 THEN
        FOR v_part IN SELECT * FROM jsonb_array_elements(p_parts)
        LOOP
            v_part_id       := (v_part->>'part_id')::UUID;
            v_part_quantity := (v_part->>'quantity')::DECIMAL;

            IF v_part_id IS NULL OR COALESCE(v_part_quantity, 0) <= 0 THEN
                RAISE EXCEPTION 'Invalid part usage payload';
            END IF;

            SELECT unit_cost, name, quantity
              INTO v_item_cost, v_item_name, v_available_qty
              FROM public.inventory_items
             WHERE id = v_part_id AND tenant_id = v_tenant_id;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Part % not found or does not belong to this tenant', v_part_id;
            END IF;

            IF v_available_qty < v_part_quantity THEN
                RAISE EXCEPTION 'Insufficient stock for part "%": available=%, requested=%',
                    v_item_name, v_available_qty, v_part_quantity;
            END IF;

            INSERT INTO public.work_order_parts (
                tenant_id, work_order_id, part_id, quantity, unit_cost, created_by
            ) VALUES (
                v_tenant_id, p_work_order_id, v_part_id, v_part_quantity,
                COALESCE(v_item_cost, 0), v_actor_id
            );

            -- inventory_items UPDATE does not touch work_order sensitive fields;
            -- no guard flag needed for this table.
            UPDATE public.inventory_items
               SET quantity = quantity - v_part_quantity
             WHERE id = v_part_id;

            PERFORM public.create_operation_log(
                v_tenant_id, p_work_order_id, 'maintenance',
                'Used part: ' || COALESCE(v_item_name, 'Unknown') || ' (Qty: ' || v_part_quantity || ')',
                v_actor_id
            );
        END LOOP;
    END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_intake_report_from_public_token(p_token text, p_channel text DEFAULT 'pwa_qr'::text, p_reporter_name text DEFAULT NULL::text, p_reporter_phone text DEFAULT NULL::text, p_initial_message text DEFAULT NULL::text, p_location_hint jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_access_token_id UUID;
  v_tenant_id UUID;
  v_report_id UUID;
  v_report_number TEXT;
  v_public_access_token TEXT;
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN
    RAISE EXCEPTION 'Invalid public token' USING ERRCODE = '28000';
  END IF;

  IF p_channel NOT IN ('pwa_qr', 'public_portal', 'manual') THEN
    RAISE EXCEPTION 'Unsupported intake channel: %', p_channel USING ERRCODE = '22023';
  END IF;

  SELECT tat.id, tat.tenant_id
    INTO v_access_token_id, v_tenant_id
  FROM public.tenant_access_tokens tat
  JOIN public.tenants t ON t.id = tat.tenant_id
  WHERE tat.token = p_token
    AND tat.is_active = true
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Invalid public token' USING ERRCODE = '28000';
  END IF;

  IF NOT public.tenant_has_operational_access(v_tenant_id) THEN
    RAISE EXCEPTION 'Tenant does not have operational access' USING ERRCODE = '42501';
  END IF;

  v_report_number := 'RPT-' || lpad(nextval('public.intake_report_number_seq')::text, 6, '0');

  INSERT INTO public.intake_reports (
    tenant_id,
    access_token_id,
    report_number,
    channel,
    reporter_name,
    reporter_phone,
    initial_message,
    location_hint,
    reporter_identity_status,
    status,
    current_step
  )
  VALUES (
    v_tenant_id,
    v_access_token_id,
    v_report_number,
    p_channel,
    NULLIF(btrim(p_reporter_name), ''),
    NULLIF(btrim(p_reporter_phone), ''),
    NULLIF(btrim(p_initial_message), ''),
    COALESCE(p_location_hint, '{}'::jsonb),
    CASE
      WHEN NULLIF(btrim(COALESCE(p_reporter_phone, '')), '') IS NULL THEN 'unknown'
      ELSE 'needs_verification'
    END,
    'collecting',
    'confirm_report'
  )
  RETURNING id, public_access_token
    INTO v_report_id, v_public_access_token;

  IF NULLIF(btrim(COALESCE(p_initial_message, '')), '') IS NOT NULL THEN
    INSERT INTO public.intake_messages (
      tenant_id,
      intake_report_id,
      direction,
      message_type,
      body,
      raw_payload
    )
    VALUES (
      v_tenant_id,
      v_report_id,
      'inbound',
      'text',
      p_initial_message,
      jsonb_build_object('channel', p_channel, 'source', 'public_token')
    );
  END IF;

  INSERT INTO public.operational_events (
    tenant_id,
    entity_type,
    entity_id,
    event_type,
    actor_type,
    source,
    metadata
  )
  VALUES (
    v_tenant_id,
    'intake_report',
    v_report_id,
    'intake_report_created',
    'reporter',
    'public_token',
    jsonb_build_object('channel', p_channel, 'report_number', v_report_number)
  );

  RETURN jsonb_build_object(
    'intake_report_id', v_report_id,
    'report_number', v_report_number,
    'public_access_token', v_public_access_token,
    'status', 'collecting'
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_notification(p_tenant_id uuid, p_user_id uuid, p_title text, p_message text, p_type text, p_link text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_id UUID;
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM public.profiles p
         WHERE p.id = p_user_id
           AND p.tenant_id = p_tenant_id
           AND COALESCE(p.is_active, true) = true
    ) THEN
        RAISE EXCEPTION 'Notification recipient is not active in the requested tenant';
    END IF;

    INSERT INTO public.notifications (tenant_id, user_id, title, message, type, link, metadata)
    VALUES (p_tenant_id, p_user_id, p_title, p_message, p_type, p_link, p_metadata)
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_operation_log(p_tenant_id uuid, p_work_order_id uuid, p_type character varying, p_description character varying, p_performed_by uuid, p_status character varying DEFAULT 'completed'::character varying)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_code VARCHAR;
    v_asset_id UUID;
    v_building_id UUID;
BEGIN
    -- Get related info from work order
    SELECT asset_id, building_id INTO v_asset_id, v_building_id
    FROM work_orders WHERE id = p_work_order_id;

    -- Generate a simple code (timestamp based)
    v_code := 'LOG-' || to_char(NOW(), 'YYMMDDHH24MISS') || '-' || substring(gen_random_uuid()::text from 1 for 4);

    INSERT INTO operation_logs (
        tenant_id, code, type, description, 
        work_order_id, asset_id, building_id, 
        performed_by, timestamp, status
    ) VALUES (
        p_tenant_id, v_code, p_type, p_description,
        p_work_order_id, v_asset_id, v_building_id,
        p_performed_by, NOW(), p_status
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_work_order(p_work_order jsonb, p_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS work_orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_actor_id       UUID := auth.uid();
    v_actor_role     TEXT;
    v_actor_tenant   UUID;
    v_actor_active   BOOLEAN;
    v_is_super       BOOLEAN := FALSE;
    v_is_platform    BOOLEAN := FALSE;
    v_tenant_id      UUID;
    v_title          TEXT;
    v_code           TEXT;
    v_priority       TEXT;
    v_issue_type_id  UUID;
    v_reported_by    UUID;
    v_assigned_team  UUID;
    v_building_id    UUID;
    v_floor_id       UUID;
    v_department_id  UUID;
    v_room_id        UUID;
    v_asset_id       UUID;
    v_due_date       TIMESTAMPTZ;
    v_allowed_keys   TEXT[] := ARRAY[
        'code',
        'title',
        'description',
        'issue_type_id',
        'issue_type',
        'priority',
        'due_date',
        'building_id',
        'floor_id',
        'department_id',
        'room_id',
        'asset_id',
        'reported_by',
        'reporter_name',
        'reporter_phone',
        'assigned_team',
        'created_by',
        'source'
    ];
    v_key            TEXT;
    v_work_order     public.work_orders%ROWTYPE;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    IF p_work_order IS NULL OR jsonb_typeof(p_work_order) <> 'object' THEN
        RAISE EXCEPTION 'Work order payload must be a JSON object' USING ERRCODE = '22023';
    END IF;

    FOR v_key IN SELECT jsonb_object_keys(p_work_order)
    LOOP
        IF NOT (v_key = ANY(v_allowed_keys)) THEN
            RAISE EXCEPTION 'Field "%" is not allowed during work order creation', v_key
                USING ERRCODE = '22023';
        END IF;
    END LOOP;

    SELECT role, tenant_id, COALESCE(is_active, TRUE), COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_actor_active, v_is_super
      FROM public.profiles
     WHERE id = v_actor_id;

    IF v_actor_role IS NULL AND NOT v_is_super THEN
        RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '28000';
    END IF;

    IF NOT COALESCE(v_actor_active, FALSE) THEN
        RAISE EXCEPTION 'Inactive users cannot create work orders' USING ERRCODE = '28000';
    END IF;

    v_is_platform := v_is_super OR v_actor_role IN ('platform_owner', 'platform_admin');

    IF p_tenant_id IS NOT NULL THEN
        IF NOT v_is_platform THEN
            RAISE EXCEPTION 'Only platform owner/admin can pass tenant_id explicitly'
                USING ERRCODE = '42501';
        END IF;
        v_tenant_id := p_tenant_id;
    ELSE
        v_tenant_id := v_actor_tenant;
    END IF;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Tenant is required for work order creation' USING ERRCODE = '22023';
    END IF;

    IF NOT public.tenant_has_operational_access(v_tenant_id) THEN
        RAISE EXCEPTION 'Tenant does not currently have operational access'
            USING ERRCODE = '42501';
    END IF;

    IF NOT public.can_create_work_orders_scope(v_tenant_id) THEN
        RAISE EXCEPTION 'Insufficient permissions to create work orders'
            USING ERRCODE = '42501';
    END IF;

    v_title := NULLIF(BTRIM(p_work_order->>'title'), '');
    IF v_title IS NULL THEN
        RAISE EXCEPTION 'Work order title is required' USING ERRCODE = '23502';
    END IF;

    v_priority := COALESCE(NULLIF(BTRIM(p_work_order->>'priority'), ''), 'medium');
    IF v_priority NOT IN ('low', 'medium', 'high', 'urgent') THEN
        RAISE EXCEPTION 'Invalid work order priority: %', v_priority USING ERRCODE = '22023';
    END IF;

    v_code := NULLIF(BTRIM(p_work_order->>'code'), '');
    IF v_code IS NULL THEN
        v_code := 'WO-' || to_char(NOW(), 'YYMMDD-HH24MISS') || '-' || substring(gen_random_uuid()::text from 1 for 4);
    ELSIF v_code !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,49}$' THEN
        RAISE EXCEPTION 'Invalid work order code format' USING ERRCODE = '22023';
    END IF;

    v_issue_type_id := NULLIF(p_work_order->>'issue_type_id', '')::UUID;
    v_reported_by := COALESCE(NULLIF(p_work_order->>'reported_by', '')::UUID, v_actor_id);
    v_assigned_team := NULLIF(p_work_order->>'assigned_team', '')::UUID;
    v_building_id := NULLIF(p_work_order->>'building_id', '')::UUID;
    v_floor_id := NULLIF(p_work_order->>'floor_id', '')::UUID;
    v_department_id := NULLIF(p_work_order->>'department_id', '')::UUID;
    v_room_id := NULLIF(p_work_order->>'room_id', '')::UUID;
    v_asset_id := NULLIF(p_work_order->>'asset_id', '')::UUID;
    v_due_date := NULLIF(p_work_order->>'due_date', '')::TIMESTAMPTZ;

    IF v_issue_type_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
             FROM public.issue_types it
            WHERE it.id = v_issue_type_id
              AND (it.tenant_id IS NULL OR it.tenant_id = v_tenant_id)
       )
    THEN
        RAISE EXCEPTION 'Issue type does not belong to this tenant' USING ERRCODE = '42501';
    END IF;

    IF v_reported_by IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
             FROM public.profiles p
            WHERE p.id = v_reported_by
              AND p.tenant_id = v_tenant_id
       )
    THEN
        RAISE EXCEPTION 'Reporter does not belong to this tenant' USING ERRCODE = '42501';
    END IF;

    IF v_assigned_team IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
             FROM public.teams t
            WHERE t.id = v_assigned_team
              AND t.tenant_id = v_tenant_id
       )
    THEN
        RAISE EXCEPTION 'Assigned team does not belong to this tenant' USING ERRCODE = '42501';
    END IF;

    IF v_department_id IS NOT NULL
       AND NOT EXISTS (
           SELECT 1
             FROM public.departments d
            WHERE d.id = v_department_id
              AND d.tenant_id = v_tenant_id
       )
    THEN
        RAISE EXCEPTION 'Department does not belong to this tenant' USING ERRCODE = '42501';
    END IF;

    IF NOT public.work_order_asset_location_is_valid(
        v_tenant_id, v_building_id, v_floor_id, v_room_id, v_asset_id
    ) THEN
        RAISE EXCEPTION 'Invalid asset or location for this tenant' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.work_orders (
        tenant_id,
        code,
        title,
        description,
        issue_type_id,
        issue_type,
        status,
        priority,
        reported_by,
        assigned_team,
        created_by,
        building_id,
        floor_id,
        department_id,
        room_id,
        asset_id,
        due_date,
        reporter_name,
        reporter_phone,
        reported_at,
        created_at,
        updated_at
    ) VALUES (
        v_tenant_id,
        v_code,
        v_title,
        NULLIF(BTRIM(p_work_order->>'description'), ''),
        v_issue_type_id,
        NULLIF(BTRIM(p_work_order->>'issue_type'), ''),
        'pending',
        v_priority,
        v_reported_by,
        v_assigned_team,
        v_actor_id,
        v_building_id,
        v_floor_id,
        v_department_id,
        v_room_id,
        v_asset_id,
        v_due_date,
        NULLIF(BTRIM(p_work_order->>'reporter_name'), ''),
        NULLIF(BTRIM(p_work_order->>'reporter_phone'), ''),
        NOW(),
        NOW(),
        NOW()
    )
    RETURNING * INTO v_work_order;

    PERFORM public.create_operation_log(
        v_tenant_id,
        v_work_order.id,
        'create',
        CASE
            WHEN v_assigned_team IS NULL THEN 'Work order created'
            ELSE 'Work order created with initial team context'
        END,
        v_actor_id
    );

    RETURN v_work_order;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.default_enabled_modules_json()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
SELECT jsonb_build_object(
    'dashboard', jsonb_build_object('enabled', true, 'features', jsonb_build_object('quick_stats', true, 'charts', true, 'recent_activity', true)),
    'facilities', jsonb_build_object('enabled', true, 'features', jsonb_build_object('buildings', true, 'floors', true, 'departments', true, 'rooms', true)),
    'assets', jsonb_build_object('enabled', true, 'features', jsonb_build_object('asset_tracking', true, 'qr_codes', true, 'asset_history', true, 'warranty_tracking', true)),
    'work_orders', jsonb_build_object('enabled', true, 'features', jsonb_build_object('create_wo', true, 'workflow', true, 'assignment', true, 'parts_tracking', true)),
    'maintenance', jsonb_build_object('enabled', true, 'features', jsonb_build_object('maintenance_plans', true, 'schedules', true, 'auto_generation', true)),
    'inventory', jsonb_build_object('enabled', true, 'features', jsonb_build_object('stock_tracking', true, 'low_stock_alerts', true, 'consumption_reports', true)),
    'employees', jsonb_build_object('enabled', true, 'features', jsonb_build_object('user_management', true, 'role_assignment', true)),
    'work_teams', jsonb_build_object('enabled', true, 'features', jsonb_build_object('team_creation', true, 'member_assignment', true)),
    'reports', jsonb_build_object('enabled', true, 'features', jsonb_build_object('operational_reports', true, 'export', true)),
    'public_portal', jsonb_build_object('enabled', false, 'features', jsonb_build_object('public_submission', true, 'qr_portal', true))
);
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_profile_update_permissions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role TEXT;
    v_caller_tenant UUID;
BEGIN
    IF current_setting('app.bypass_profile_guard', true) = '1' THEN
        RETURN NEW;
    END IF;

    IF auth.role() = 'service_role' OR v_caller_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT role, tenant_id
      INTO v_caller_role, v_caller_tenant
      FROM public.profiles
     WHERE id = v_caller_id;

    IF v_caller_role IS NULL THEN
        RAISE EXCEPTION 'Caller profile not found';
    END IF;

    IF OLD.id = v_caller_id THEN
        IF NEW.role IS DISTINCT FROM OLD.role
            OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
            OR COALESCE(NEW.is_super_admin, FALSE) IS DISTINCT FROM COALESCE(OLD.is_super_admin, FALSE)
            OR COALESCE(NEW.is_active, TRUE) IS DISTINCT FROM COALESCE(OLD.is_active, TRUE)
            OR COALESCE(NEW.email, '') IS DISTINCT FROM COALESCE(OLD.email, '')
        THEN
            RAISE EXCEPTION 'You are not allowed to modify protected profile fields directly';
        END IF;

        RETURN NEW;
    END IF;

    IF v_caller_role IN ('platform_owner', 'platform_admin') THEN
        IF OLD.role = 'platform_owner' OR NEW.role = 'platform_owner' THEN
            RAISE EXCEPTION 'Platform owner accounts cannot be changed through direct client updates';
        END IF;

        IF v_caller_role = 'platform_admin'
            AND NEW.role = 'platform_admin'
            AND OLD.role IS DISTINCT FROM 'platform_admin'
        THEN
            RAISE EXCEPTION 'Only platform owners can assign platform_admin';
        END IF;

        RETURN NEW;
    END IF;

    IF v_caller_role = 'tenant_admin' THEN
        IF OLD.tenant_id IS DISTINCT FROM v_caller_tenant OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
            RAISE EXCEPTION 'You can only manage profiles inside your own organization';
        END IF;

        IF COALESCE(NEW.email, '') IS DISTINCT FROM COALESCE(OLD.email, '')
            OR COALESCE(NEW.is_super_admin, FALSE) IS DISTINCT FROM COALESCE(OLD.is_super_admin, FALSE)
        THEN
            RAISE EXCEPTION 'You are not allowed to change protected identity fields';
        END IF;

        IF OLD.role LIKE 'platform_%' OR NEW.role LIKE 'platform_%' THEN
            RAISE EXCEPTION 'Tenant administrators cannot assign platform roles';
        END IF;

        IF NEW.role NOT IN (
            'tenant_admin',
            'facility_manager',
            'maintenance_manager',
            'supervisor',
            'engineer',
            'technician',
            'reporter'
        ) THEN
            RAISE EXCEPTION 'Invalid tenant-scoped role assignment';
        END IF;

        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'You are not allowed to update this profile';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_subscription_limits()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
    IF TG_TABLE_NAME = 'profiles' THEN
        IF NEW.tenant_id IS NULL OR COALESCE(NEW.is_active, true) = false THEN
            RETURN NEW;
        END IF;
        IF TG_OP = 'UPDATE'
            AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
            AND NOT (COALESCE(OLD.is_active, false) = false AND COALESCE(NEW.is_active, true) = true)
        THEN
            RETURN NEW;
        END IF;
        IF NOT public.check_subscription_limits(NEW.tenant_id, 'users') THEN
            RAISE EXCEPTION 'User limit reached for this subscription plan';
        END IF;
    ELSIF TG_TABLE_NAME = 'buildings' THEN
        IF NOT public.check_subscription_limits(NEW.tenant_id, 'buildings') THEN
            RAISE EXCEPTION 'Building limit reached for this subscription plan';
        END IF;
    ELSIF TG_TABLE_NAME = 'assets' THEN
        IF NOT public.check_subscription_limits(NEW.tenant_id, 'assets') THEN
            RAISE EXCEPTION 'Asset limit reached for this subscription plan';
        END IF;
    ELSIF TG_TABLE_NAME = 'work_orders' THEN
        IF NOT public.check_subscription_limits(NEW.tenant_id, 'work_orders') THEN
            RAISE EXCEPTION 'Monthly work order limit reached for this subscription plan';
        END IF;
    END IF;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_tenant_subscription_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role TEXT;
    v_has_protected_change BOOLEAN := FALSE;
BEGIN
    IF TG_OP <> 'UPDATE' THEN
        RETURN NEW;
    END IF;

    IF current_setting('app.bypass_tenant_subscription_guard', true) = '1' THEN
        RETURN NEW;
    END IF;

    IF auth.role() = 'service_role' OR v_caller_id IS NULL THEN
        RETURN NEW;
    END IF;

    v_has_protected_change :=
        NEW.plan_id IS DISTINCT FROM OLD.plan_id
        OR COALESCE(NEW.enabled_modules, '{}'::jsonb) IS DISTINCT FROM COALESCE(OLD.enabled_modules, '{}'::jsonb)
        OR COALESCE(NEW.subscription_status, '') IS DISTINCT FROM COALESCE(OLD.subscription_status, '')
        OR COALESCE(NEW.subscription_tier, '') IS DISTINCT FROM COALESCE(OLD.subscription_tier, '')
        OR COALESCE(NEW.billing_cycle, '') IS DISTINCT FROM COALESCE(OLD.billing_cycle, '')
        OR NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at
        OR NEW.subscription_ends_at IS DISTINCT FROM OLD.subscription_ends_at
        OR COALESCE(NEW.is_active, TRUE) IS DISTINCT FROM COALESCE(OLD.is_active, TRUE);

    IF NOT v_has_protected_change THEN
        RETURN NEW;
    END IF;

    SELECT role
      INTO v_caller_role
      FROM public.profiles
     WHERE id = v_caller_id;

    IF v_caller_role IN ('platform_owner', 'platform_admin') THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Tenant subscription fields are managed by billing and platform workflows only';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.engine_activate(p_tenant_id uuid, p_plan_id uuid, p_billing_cycle character varying DEFAULT 'monthly'::character varying, p_source character varying DEFAULT 'admin'::character varying, p_status character varying DEFAULT 'active'::character varying, p_trial_days integer DEFAULT NULL::integer, p_discount_policy_id uuid DEFAULT NULL::uuid, p_quote_id uuid DEFAULT NULL::uuid, p_payment_method character varying DEFAULT NULL::character varying, p_payment_reference character varying DEFAULT NULL::character varying, p_amount numeric DEFAULT NULL::numeric, p_admin_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_caller_id    uuid        := auth.uid();
    v_auth_role    text        := auth.role();
    v_caller_role  text;
    v_caller_tid   uuid;
    v_now          timestamptz := now();
    v_trial_days   integer;
    v_trial_ends   timestamptz;
    v_period_start timestamptz;
    v_period_end   timestamptz;
    v_amount       decimal(10,2);
    v_calc         jsonb;
    v_sub_id       uuid;
    v_inv_id       uuid;
    v_inv_number   text;
    v_plan         RECORD;
    v_is_service_paid_charge boolean := false;
BEGIN
    SELECT role, tenant_id INTO v_caller_role, v_caller_tid
      FROM public.profiles WHERE id = v_caller_id;

    v_is_service_paid_charge :=
        v_auth_role = 'service_role'
        AND p_source = 'self_service'
        AND p_status = 'active'
        AND p_payment_method = 'tap'
        AND COALESCE(NULLIF(TRIM(p_payment_reference), ''), '') <> ''
        AND COALESCE(p_amount, 0) > 0;

    IF v_is_service_paid_charge THEN
        NULL;
    ELSIF p_source = 'self_service' THEN
        IF v_caller_role NOT IN ('tenant_admin','tenant_owner') OR v_caller_tid IS DISTINCT FROM p_tenant_id THEN
            RAISE EXCEPTION 'Unauthorized: self_service requires tenant_admin of the same tenant';
        END IF;
    ELSE
        IF v_caller_role NOT IN ('platform_owner','platform_admin') THEN
            RAISE EXCEPTION 'Unauthorized: source % requires platform_owner or platform_admin', p_source;
        END IF;
    END IF;

    IF p_billing_cycle NOT IN ('monthly', 'yearly') THEN
        RAISE EXCEPTION 'Invalid billing cycle: %', p_billing_cycle;
    END IF;

    SELECT * INTO v_plan FROM public.subscription_plans WHERE id = p_plan_id AND is_active = true;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Plan not found or inactive: %', p_plan_id;
    END IF;

    v_calc := public.engine_calculate(p_plan_id, p_billing_cycle, '{}', p_discount_policy_id);

    IF p_status = 'trial' THEN
        v_trial_days   := COALESCE(p_trial_days, v_plan.trial_days, 14);
        v_trial_ends   := v_now + (v_trial_days || ' days')::interval;
        v_period_start := v_now;
        v_period_end   := v_trial_ends;
        v_amount       := 0;
    ELSE
        v_period_start := v_now;
        v_period_end   := CASE p_billing_cycle
            WHEN 'yearly' THEN v_now + interval '1 year'
            ELSE               v_now + interval '1 month'
        END;
        v_amount := COALESCE(p_amount, (v_calc->>'total')::decimal);
    END IF;

    INSERT INTO public.tenant_subscriptions (
        tenant_id, plan_id, status, billing_cycle,
        trial_ends_at, current_period_start, current_period_end,
        amount, discount_policy_id, activated_by, quote_id, admin_note,
        updated_at
    ) VALUES (
        p_tenant_id, p_plan_id, p_status, p_billing_cycle,
        v_trial_ends, v_period_start, v_period_end,
        v_amount, p_discount_policy_id, p_source, p_quote_id, p_admin_note,
        v_now
    )
    ON CONFLICT (tenant_id) DO UPDATE SET
        plan_id              = EXCLUDED.plan_id,
        status               = EXCLUDED.status,
        billing_cycle        = EXCLUDED.billing_cycle,
        trial_ends_at        = EXCLUDED.trial_ends_at,
        current_period_start = EXCLUDED.current_period_start,
        current_period_end   = EXCLUDED.current_period_end,
        amount               = EXCLUDED.amount,
        discount_policy_id   = EXCLUDED.discount_policy_id,
        activated_by         = EXCLUDED.activated_by,
        quote_id             = EXCLUDED.quote_id,
        admin_note           = EXCLUDED.admin_note,
        cancelled_at         = NULL,
        updated_at           = EXCLUDED.updated_at
    RETURNING id INTO v_sub_id;

    IF p_status = 'active' THEN
        v_inv_number := 'INV-' || EXTRACT(YEAR FROM v_now)::text
                        || '-' || LPAD(nextval('public.invoice_number_seq')::text, 4, '0');

        INSERT INTO public.billing_invoices (
            invoice_number, tenant_id, subscription_id, quote_id,
            subtotal, discount_amount, tax_rate, tax_amount, total,
            status, payment_method, payment_reference, paid_at,
            billing_period_start, billing_period_end,
            created_by, created_at
        ) VALUES (
            v_inv_number, p_tenant_id, v_sub_id, p_quote_id,
            (v_calc->>'subtotal')::decimal,
            (v_calc->>'discount_amount')::decimal,
            (v_calc->>'tax_rate')::decimal,
            (v_calc->>'tax_amount')::decimal,
            v_amount,
            CASE WHEN p_payment_method IS NOT NULL THEN 'paid' ELSE 'draft' END,
            p_payment_method,
            p_payment_reference,
            CASE WHEN p_payment_method IS NOT NULL THEN v_now ELSE NULL END,
            v_period_start::date,
            v_period_end::date,
            v_caller_id,
            v_now
        )
        RETURNING id INTO v_inv_id;
    END IF;

    INSERT INTO public.platform_audit_logs
        (user_id, action, action_type, target_type, target_id, new_values, metadata)
    VALUES (
        v_caller_id,
        'engine_activate',
        'update', 'subscription', v_sub_id::text,
        jsonb_build_object(
            'plan_id',       p_plan_id,
            'status',        p_status,
            'billing_cycle', p_billing_cycle,
            'amount',        v_amount,
            'source',        p_source,
            'period_end',    v_period_end
        ),
        jsonb_build_object(
            'tenant_id', p_tenant_id,
            'plan_id', p_plan_id,
            'payment_reference', p_payment_reference,
            'source', p_source,
            'auth_role', v_auth_role,
            'service_paid_charge', v_is_service_paid_charge
        )
    );

    RETURN jsonb_build_object(
        'subscription_id', v_sub_id,
        'invoice_id',      v_inv_id,
        'invoice_number',  v_inv_number,
        'status',          p_status,
        'period_start',    v_period_start,
        'period_end',      v_period_end,
        'amount',          v_amount
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.engine_activate_from_quote(p_quote_id uuid, p_period_months integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_caller_id   uuid := auth.uid();
    v_caller_role text;
    v_quote       RECORD;
    v_result      jsonb;
BEGIN
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
    IF v_caller_role NOT IN ('platform_owner','platform_admin') THEN
        RAISE EXCEPTION 'Unauthorized: only platform admins can activate quotes';
    END IF;

    SELECT * INTO v_quote FROM public.billing_quotes WHERE id = p_quote_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Quote not found: %', p_quote_id;
    END IF;
    IF v_quote.status <> 'approved' THEN
        RAISE EXCEPTION 'Quote must be approved before activation (current: %)', v_quote.status;
    END IF;
    IF v_quote.valid_until < CURRENT_DATE THEN
        RAISE EXCEPTION 'Quote has expired (valid_until: %)', v_quote.valid_until;
    END IF;

    v_result := public.engine_activate(
        p_tenant_id          := v_quote.tenant_id,
        p_plan_id            := v_quote.plan_id,
        p_billing_cycle      := v_quote.billing_cycle,
        p_source             := 'quote',
        p_status             := 'active',
        p_discount_policy_id := v_quote.discount_policy_id,
        p_quote_id           := p_quote_id,
        p_amount             := v_quote.total
    );

    UPDATE public.billing_quotes SET
        status          = 'activated',
        activated_by    = v_caller_id,
        activated_at    = now(),
        subscription_id = (v_result->>'subscription_id')::uuid,
        updated_at      = now()
    WHERE id = p_quote_id;

    RETURN v_result || jsonb_build_object('quote_number', v_quote.quote_number);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.engine_approve_quote(p_quote_id uuid, p_admin_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_caller_id   uuid := auth.uid();
    v_caller_role text;
    v_quote       RECORD;
BEGIN
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
    IF v_caller_role NOT IN ('platform_owner','platform_admin') THEN
        RAISE EXCEPTION 'Unauthorized: only platform admins can approve quotes';
    END IF;

    SELECT * INTO v_quote FROM public.billing_quotes WHERE id = p_quote_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Quote not found: %', p_quote_id;
    END IF;
    IF v_quote.status <> 'draft' THEN
        RAISE EXCEPTION 'Quote must be draft to approve (current: %)', v_quote.status;
    END IF;
    IF v_quote.valid_until < CURRENT_DATE THEN
        RAISE EXCEPTION 'Quote has expired (valid_until: %)', v_quote.valid_until;
    END IF;

    UPDATE public.billing_quotes SET
        status      = 'approved',
        approved_by = v_caller_id,
        approved_at = now(),
        admin_notes = COALESCE(p_admin_notes, admin_notes),
        updated_at  = now()
    WHERE id = p_quote_id;

    INSERT INTO public.platform_audit_logs
        (user_id, action, action_type, target_type, target_id, new_values, metadata)
    VALUES (
        v_caller_id, 'engine_approve_quote: ' || v_quote.quote_number,
        'update', 'quote', p_quote_id::text,
        jsonb_build_object('status', 'approved', 'quote_number', v_quote.quote_number),
        jsonb_build_object('tenant_id', v_quote.tenant_id)
    );

    RETURN jsonb_build_object(
        'quote_id',     p_quote_id,
        'quote_number', v_quote.quote_number,
        'status',       'approved'
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.engine_calculate(p_plan_id uuid, p_billing_cycle character varying DEFAULT 'monthly'::character varying, p_add_on_ids uuid[] DEFAULT '{}'::uuid[], p_discount_policy_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_plan          RECORD;
    v_dp            RECORD;
    v_add_on        RECORD;
    v_add_on_id     uuid;
    v_plan_amount   decimal(10,2) := 0;
    v_addons_amount decimal(10,2) := 0;
    v_addon_price   decimal(10,2);
    v_subtotal      decimal(10,2);
    v_disc_amount   decimal(10,2) := 0;
    v_tax_rate      decimal(5,4)  := 0.0000;
    v_taxable       decimal(10,2);
    v_tax_amount    decimal(10,2) := 0;
    v_total         decimal(10,2);
    v_breakdown     jsonb         := '[]'::jsonb;
    v_sort          integer       := 0;
    v_tax_cfg       jsonb;
BEGIN
    -- Resolve plan
    SELECT * INTO v_plan
      FROM public.subscription_plans
     WHERE id = p_plan_id AND is_active = true;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Plan not found or inactive: %', p_plan_id;
    END IF;

    v_plan_amount := CASE p_billing_cycle
        WHEN 'yearly' THEN COALESCE(v_plan.price_yearly, 0)
        ELSE               COALESCE(v_plan.price_monthly, 0)
    END;

    v_sort := v_sort + 1;
    v_breakdown := v_breakdown || jsonb_build_object(
        'type',          'plan',
        'id',            v_plan.id,
        'code',          v_plan.code,
        'name',          v_plan.name,
        'name_ar',       v_plan.name_ar,
        'billing_cycle', p_billing_cycle,
        'unit_price',    v_plan_amount,
        'subtotal',      v_plan_amount,
        'sort_order',    v_sort
    );

    -- Add-ons
    IF p_add_on_ids IS NOT NULL AND array_length(p_add_on_ids, 1) > 0 THEN
        FOREACH v_add_on_id IN ARRAY p_add_on_ids LOOP
            SELECT * INTO v_add_on
              FROM public.billing_add_ons
             WHERE id = v_add_on_id AND is_active = true;
            IF FOUND THEN
                v_addon_price   := COALESCE(v_add_on.price, 0);
                v_addons_amount := v_addons_amount + v_addon_price;
                v_sort := v_sort + 1;
                v_breakdown := v_breakdown || jsonb_build_object(
                    'type',         'add_on',
                    'id',           v_add_on.id,
                    'code',         v_add_on.code,
                    'name',         v_add_on.name,
                    'name_ar',      v_add_on.name_ar,
                    'billing_type', v_add_on.billing_type,
                    'unit_price',   v_addon_price,
                    'subtotal',     v_addon_price,
                    'sort_order',   v_sort
                );
            END IF;
        END LOOP;
    END IF;

    v_subtotal := v_plan_amount + v_addons_amount;

    -- Discount policy
    IF p_discount_policy_id IS NOT NULL THEN
        SELECT * INTO v_dp
          FROM public.discount_policies
         WHERE id = p_discount_policy_id
           AND is_active = true
           AND (valid_from IS NULL OR valid_from <= now())
           AND (valid_to   IS NULL OR valid_to   >= now());
        IF FOUND THEN
            v_disc_amount := CASE v_dp.discount_type
                WHEN 'percentage' THEN ROUND(v_subtotal * v_dp.discount_value / 100.0, 2)
                WHEN 'fixed'      THEN LEAST(v_dp.discount_value, v_subtotal)
                ELSE 0
            END;
            v_sort := v_sort + 1;
            v_breakdown := v_breakdown || jsonb_build_object(
                'type',           'discount',
                'id',             v_dp.id,
                'code',           v_dp.code,
                'name',           v_dp.name,
                'name_ar',        v_dp.name_ar,
                'discount_type',  v_dp.discount_type,
                'discount_value', v_dp.discount_value,
                'subtotal',       -v_disc_amount,
                'sort_order',     v_sort
            );
        END IF;
    END IF;

    -- Tax rate from platform_settings (0 if disabled or not found)
    SELECT value INTO v_tax_cfg
      FROM public.platform_settings
     WHERE key = 'tax_config';

    IF v_tax_cfg IS NOT NULL AND (v_tax_cfg->>'enabled')::boolean = true THEN
        v_tax_rate := COALESCE((v_tax_cfg->>'rate')::decimal(5,4), 0.0000);
    ELSE
        v_tax_rate := 0.0000;
    END IF;

    v_taxable    := v_subtotal - v_disc_amount;
    v_tax_amount := ROUND(v_taxable * v_tax_rate, 2);
    v_total      := v_taxable + v_tax_amount;

    RETURN jsonb_build_object(
        'plan_amount',     v_plan_amount,
        'add_ons_amount',  v_addons_amount,
        'subtotal',        v_subtotal,
        'discount_amount', v_disc_amount,
        'taxable_amount',  v_taxable,
        'tax_rate',        v_tax_rate,
        'tax_amount',      v_tax_amount,
        'total',           v_total,
        'currency',        'SAR',
        'breakdown',       v_breakdown
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.engine_cancel(p_tenant_id uuid, p_admin_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_caller_id   uuid := auth.uid();
    v_caller_role text;
    v_sub_id      uuid;
BEGIN
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
    IF v_caller_role NOT IN ('platform_owner','platform_admin') THEN
        RAISE EXCEPTION 'Unauthorized: only platform admins can cancel subscriptions';
    END IF;

    UPDATE public.tenant_subscriptions SET
        status       = 'cancelled',
        cancelled_at = now(),
        admin_note   = COALESCE(p_admin_note, admin_note),
        updated_at   = now()
    WHERE tenant_id = p_tenant_id
    RETURNING id INTO v_sub_id;

    IF v_sub_id IS NULL THEN
        RAISE EXCEPTION 'No subscription found for tenant: %', p_tenant_id;
    END IF;

    INSERT INTO public.platform_audit_logs
        (user_id, action, action_type, target_type, target_id, new_values, metadata)
    VALUES (
        v_caller_id, 'engine_cancel tenant=' || p_tenant_id,
        'update', 'subscription', v_sub_id::text,
        jsonb_build_object('status', 'cancelled', 'admin_note', p_admin_note),
        jsonb_build_object('tenant_id', p_tenant_id)
    );

    RETURN jsonb_build_object(
        'subscription_id', v_sub_id,
        'status',          'cancelled',
        'cancelled_at',    now()
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.engine_create_quote(p_tenant_id uuid, p_plan_id uuid, p_billing_cycle character varying DEFAULT 'yearly'::character varying, p_add_on_ids uuid[] DEFAULT '{}'::uuid[], p_discount_policy_id uuid DEFAULT NULL::uuid, p_valid_days integer DEFAULT 30, p_admin_notes text DEFAULT NULL::text, p_client_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_caller_id   uuid := auth.uid();
    v_caller_role text;
    v_calc        jsonb;
    v_quote_num   text;
    v_quote_id    uuid;
    v_valid_until date;
BEGIN
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
    IF v_caller_role NOT IN ('platform_owner','platform_admin') THEN
        RAISE EXCEPTION 'Unauthorized: only platform admins can create quotes';
    END IF;

    v_calc        := public.engine_calculate(p_plan_id, p_billing_cycle, p_add_on_ids, p_discount_policy_id);
    v_valid_until := (now() + (p_valid_days || ' days')::interval)::date;
    v_quote_num   := 'QT-' || EXTRACT(YEAR FROM now())::text
                     || '-' || LPAD(nextval('public.quote_number_seq')::text, 4, '0');

    INSERT INTO public.billing_quotes (
        quote_number, tenant_id, plan_id, discount_policy_id,
        status, billing_cycle, line_items,
        subtotal, discount_amount, tax_rate, tax_amount, total,
        valid_until, pricing_snapshot, admin_notes, client_notes,
        created_by, created_at, updated_at
    ) VALUES (
        v_quote_num, p_tenant_id, p_plan_id, p_discount_policy_id,
        'draft', p_billing_cycle, v_calc->'breakdown',
        (v_calc->>'subtotal')::decimal,
        (v_calc->>'discount_amount')::decimal,
        (v_calc->>'tax_rate')::decimal,
        (v_calc->>'tax_amount')::decimal,
        (v_calc->>'total')::decimal,
        v_valid_until, v_calc, p_admin_notes, p_client_notes,
        v_caller_id, now(), now()
    )
    RETURNING id INTO v_quote_id;

    INSERT INTO public.platform_audit_logs
        (user_id, action, action_type, target_type, target_id, new_values, metadata)
    VALUES (
        v_caller_id, 'engine_create_quote: ' || v_quote_num,
        'create', 'quote', v_quote_id::text,
        jsonb_build_object('quote_number', v_quote_num, 'total', v_calc->>'total', 'tenant_id', p_tenant_id),
        jsonb_build_object('tenant_id', p_tenant_id)
    );

    RETURN jsonb_build_object(
        'quote_id',     v_quote_id,
        'quote_number', v_quote_num,
        'total',        (v_calc->>'total')::decimal,
        'valid_until',  v_valid_until
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.engine_extend_trial(p_tenant_id uuid, p_extra_days integer, p_admin_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_caller_id     uuid := auth.uid();
    v_caller_role   text;
    v_sub           RECORD;
    v_new_trial_end timestamptz;
BEGIN
    SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
    IF v_caller_role NOT IN ('platform_owner','platform_admin') THEN
        RAISE EXCEPTION 'Unauthorized: only platform admins can extend trials';
    END IF;

    SELECT * INTO v_sub
      FROM public.tenant_subscriptions
     WHERE tenant_id = p_tenant_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No subscription found for tenant: %', p_tenant_id;
    END IF;
    IF v_sub.status NOT IN ('trial','expired') THEN
        RAISE EXCEPTION 'Can only extend trial/expired subscriptions (current: %)', v_sub.status;
    END IF;

    v_new_trial_end := GREATEST(COALESCE(v_sub.trial_ends_at, now()), now())
                       + (p_extra_days || ' days')::interval;

    UPDATE public.tenant_subscriptions SET
        trial_ends_at      = v_new_trial_end,
        current_period_end = v_new_trial_end,
        status             = 'trial',
        admin_note         = COALESCE(p_admin_note, admin_note),
        updated_at         = now()
    WHERE tenant_id = p_tenant_id;

    INSERT INTO public.platform_audit_logs
        (user_id, action, action_type, target_type, target_id, new_values, metadata)
    VALUES (
        v_caller_id,
        'engine_extend_trial tenant=' || p_tenant_id || ' +' || p_extra_days || ' days',
        'update', 'subscription', v_sub.id::text,
        jsonb_build_object(
            'trial_ends_at', v_new_trial_end,
            'extra_days',    p_extra_days,
            'admin_note',    p_admin_note
        ),
        jsonb_build_object('tenant_id', p_tenant_id)
    );

    RETURN jsonb_build_object(
        'subscription_id', v_sub.id,
        'trial_ends_at',   v_new_trial_end,
        'extra_days',      p_extra_days,
        'status',          'trial'
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.facility_location_is_valid(p_tenant_id uuid, p_building_id uuid, p_floor_id uuid, p_room_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT
        p_tenant_id IS NOT NULL
        AND (
            p_building_id IS NULL
            OR EXISTS (
                SELECT 1
                FROM public.buildings b
                WHERE b.id = p_building_id
                  AND b.tenant_id = p_tenant_id
            )
        )
        AND (
            p_floor_id IS NULL
            OR EXISTS (
                SELECT 1
                FROM public.floors f
                JOIN public.buildings b
                  ON b.id = f.building_id
                WHERE f.id = p_floor_id
                  AND b.tenant_id = p_tenant_id
                  AND (p_building_id IS NULL OR f.building_id = p_building_id)
            )
        )
        AND (
            p_room_id IS NULL
            OR EXISTS (
                SELECT 1
                FROM public.rooms r
                WHERE r.id = p_room_id
                  AND r.tenant_id = p_tenant_id
                  AND (p_building_id IS NULL OR r.building_id = p_building_id)
                  AND (p_floor_id IS NULL OR r.floor_id = p_floor_id)
            )
        );
$function$
;

CREATE OR REPLACE FUNCTION public.get_inventory_stats(check_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    total_count INTEGER;
    low_stock_count INTEGER;
    total_val DECIMAL(15, 2);
    v_threshold_percent INTEGER;
    v_settings JSONB;
BEGIN
    -- Get tenant settings for threshold
    SELECT settings INTO v_settings
    FROM tenants
    WHERE id = check_tenant_id;
    
    -- Get threshold from settings (default 20%)
    v_threshold_percent := COALESCE(
        (v_settings->'inventory'->>'low_stock_threshold_percent')::INTEGER,
        20
    );

    -- Total Items
    SELECT COUNT(*) INTO total_count
    FROM inventory_items
    WHERE tenant_id = check_tenant_id AND is_active = TRUE;

    -- Low Stock - using threshold percentage
    -- Item is low stock if quantity <= min_quantity OR quantity <= (min_quantity * threshold% / 100)
    SELECT COUNT(*) INTO low_stock_count
    FROM inventory_items
    WHERE tenant_id = check_tenant_id 
      AND is_active = TRUE 
      AND (
          quantity <= min_quantity 
          OR (min_quantity > 0 AND quantity <= (min_quantity * v_threshold_percent / 100))
      );

    -- Total Value
    SELECT COALESCE(SUM(quantity * unit_cost), 0) INTO total_val
    FROM inventory_items
    WHERE tenant_id = check_tenant_id AND is_active = TRUE;

    RETURN jsonb_build_object(
        'total_items', total_count,
        'low_stock', low_stock_count,
        'total_value', total_val,
        'threshold_percent', v_threshold_percent
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_profile()
 RETURNS SETOF profiles
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT *
  FROM profiles
  WHERE id = auth.uid()
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_tenant_id()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid());
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_public_tenant_data(p_token text)
 RETURNS TABLE(tenant_id uuid, tenant_name text, buildings json, portal_settings json)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_tenant_id UUID;
    v_tenant_name TEXT;
    v_portal_settings JSON;
BEGIN
    SELECT t.tenant_id
      INTO v_tenant_id
      FROM public.tenant_access_tokens t
     WHERE t.token = p_token
       AND t.is_active = TRUE
       AND public.has_public_portal_access(t.tenant_id)
     LIMIT 1;

    IF v_tenant_id IS NULL THEN
        RETURN;
    END IF;

    SELECT ten.name,
           COALESCE(ten.settings -> 'portal', '{}')::JSON
      INTO v_tenant_name, v_portal_settings
      FROM public.tenants ten
     WHERE ten.id = v_tenant_id;

    RETURN QUERY
    SELECT
        v_tenant_id,
        v_tenant_name,
        (
            SELECT json_agg(json_build_object('id', b.id, 'name', b.name, 'name_ar', b.name_ar))
            FROM public.buildings b
            WHERE b.tenant_id = v_tenant_id
        ) AS buildings,
        v_portal_settings AS portal_settings;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_runtime_secret(p_name text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'internal'
AS $function$
DECLARE
    v_value TEXT;
BEGIN
    SELECT rs.secret_value
      INTO v_value
      FROM internal.runtime_secrets rs
     WHERE rs.name = p_name
     LIMIT 1;

    IF v_value IS NOT NULL THEN
        RETURN v_value;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vault') THEN
        EXECUTE format(
            'SELECT decrypted_secret
               FROM vault.decrypted_secrets
              WHERE name = %L
              ORDER BY created_at DESC
              LIMIT 1',
            p_name
        )
        INTO v_value;
    END IF;

    RETURN v_value;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_tenant_reporting_foundation(p_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_caller_id uuid := auth.uid();
    v_auth_role text := auth.role();
    v_caller_role text;
    v_caller_tenant uuid;
    v_tenant_id uuid;
    v_result jsonb;
BEGIN
    IF v_auth_role = 'service_role' THEN
        IF p_tenant_id IS NULL THEN
            RAISE EXCEPTION 'p_tenant_id is required for service_role reporting calls';
        END IF;
        v_tenant_id := p_tenant_id;
    ELSE
        IF v_caller_id IS NULL THEN
            RAISE EXCEPTION 'Authentication required';
        END IF;

        SELECT role, tenant_id
          INTO v_caller_role, v_caller_tenant
          FROM public.profiles
         WHERE id = v_caller_id;

        IF v_caller_role IS NULL THEN
            RAISE EXCEPTION 'Caller profile not found';
        END IF;

        IF v_caller_role IN ('platform_owner', 'platform_admin', 'platform_finance', 'platform_support') THEN
            v_tenant_id := COALESCE(p_tenant_id, v_caller_tenant);
        ELSE
            v_tenant_id := COALESCE(p_tenant_id, v_caller_tenant);
            IF v_tenant_id IS NULL OR v_tenant_id IS DISTINCT FROM v_caller_tenant THEN
                RAISE EXCEPTION 'Unauthorized tenant reporting scope';
            END IF;
        END IF;
    END IF;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Tenant scope could not be resolved';
    END IF;

    WITH
    wo AS (
        SELECT *
          FROM public.work_orders
         WHERE tenant_id = v_tenant_id
    ),
    wo_costs AS (
        SELECT
            COALESCE(SUM(woc.total_cost), 0)::numeric AS total_cost
          FROM public.work_order_costs woc
          JOIN public.work_orders wo2 ON wo2.id = woc.work_order_id
         WHERE wo2.tenant_id = v_tenant_id
    ),
    asset_stats AS (
        SELECT
            COUNT(*)::integer AS total_assets,
            COUNT(*) FILTER (WHERE status = 'operational')::integer AS operational_assets,
            COUNT(*) FILTER (WHERE status = 'under_maintenance')::integer AS under_maintenance_assets,
            COUNT(*) FILTER (WHERE status = 'out_of_service')::integer AS out_of_service_assets,
            COUNT(*) FILTER (WHERE criticality IN ('high', 'critical'))::integer AS critical_assets
          FROM public.assets
         WHERE tenant_id = v_tenant_id
    ),
    inventory_stats AS (
        SELECT
            COUNT(*)::integer AS total_items,
            COUNT(*) FILTER (WHERE quantity <= 0)::integer AS out_of_stock_items,
            COUNT(*) FILTER (WHERE quantity > 0 AND quantity <= COALESCE(min_quantity, 0))::integer AS low_stock_items,
            COALESCE(SUM(COALESCE(quantity, 0) * COALESCE(unit_cost, 0)), 0)::numeric AS stock_value
          FROM public.inventory_items
         WHERE tenant_id = v_tenant_id
           AND COALESCE(is_active, true) = true
    ),
    inventory_consumption AS (
        SELECT
            COALESCE(SUM(ABS(COALESCE(it.quantity, 0))), 0)::numeric AS consumed_quantity_30d,
            COALESCE(SUM(ABS(COALESCE(it.quantity, 0)) * COALESCE(ii.unit_cost, 0)), 0)::numeric AS consumed_value_30d
          FROM public.inventory_transactions it
          LEFT JOIN public.inventory_items ii
            ON ii.id = it.item_id
           AND ii.tenant_id = it.tenant_id
         WHERE it.tenant_id = v_tenant_id
           AND it.transaction_type IN ('out', 'usage')
           AND it.created_at >= now() - interval '30 days'
    ),
    pm_stats AS (
        SELECT
            COUNT(*)::integer AS schedules_total,
            COUNT(*) FILTER (WHERE status = 'active')::integer AS schedules_active,
            COUNT(*) FILTER (WHERE status = 'active' AND next_due_date < CURRENT_DATE)::integer AS schedules_overdue,
            COUNT(*) FILTER (WHERE status = 'active' AND next_due_date <= CURRENT_DATE + interval '7 days')::integer AS schedules_due_7d
          FROM public.pm_schedules
         WHERE tenant_id = v_tenant_id
    ),
    wo_stats AS (
        SELECT
            COUNT(*)::integer AS total,
            COUNT(*) FILTER (WHERE status NOT IN ('completed', 'auto_closed', 'cancelled', 'rejected_by_technician'))::integer AS open_count,
            COUNT(*) FILTER (
                WHERE status NOT IN ('completed', 'auto_closed', 'cancelled', 'rejected_by_technician')
                  AND due_date IS NOT NULL
                  AND due_date < now()
            )::integer AS overdue_open,
            COUNT(*) FILTER (WHERE status IN ('completed', 'auto_closed'))::integer AS closed_count,
            COUNT(*) FILTER (WHERE work_type = 'preventive' OR source_schedule_id IS NOT NULL)::integer AS preventive_count,
            COUNT(*) FILTER (WHERE COALESCE(work_type, 'reactive') <> 'preventive' AND source_schedule_id IS NULL)::integer AS corrective_count,
            COUNT(*) FILTER (WHERE sla_resolution_met IS TRUE)::integer AS sla_met_count,
            COUNT(*) FILTER (WHERE sla_resolution_met IS FALSE)::integer AS sla_breached_count,
            COUNT(*) FILTER (
                WHERE status IN ('completed', 'auto_closed')
                  AND due_date IS NOT NULL
                  AND completed_at IS NOT NULL
                  AND completed_at > due_date
            )::integer AS completed_late_count,
            ROUND((AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 3600.0) FILTER (
                WHERE status IN ('completed', 'auto_closed')
                  AND completed_at IS NOT NULL
                  AND completed_at >= created_at
            ))::numeric, 2) AS avg_completion_hours,
            COALESCE(SUM(COALESCE(estimated_cost, 0)), 0)::numeric AS estimated_cost_total,
            COALESCE(SUM(COALESCE(actual_cost, 0)), 0)::numeric AS actual_cost_total
          FROM wo
    )
    SELECT jsonb_build_object(
        'tenant_id', v_tenant_id,
        'generated_at', now(),
        'work_orders', jsonb_build_object(
            'total', wo_stats.total,
            'open', wo_stats.open_count,
            'closed', wo_stats.closed_count,
            'overdue_open', wo_stats.overdue_open,
            'preventive', wo_stats.preventive_count,
            'corrective', wo_stats.corrective_count,
            'avg_completion_hours', wo_stats.avg_completion_hours
        ),
        'sla', jsonb_build_object(
            'met', wo_stats.sla_met_count,
            'breached', wo_stats.sla_breached_count,
            'completed_late', wo_stats.completed_late_count,
            'breach_rate', CASE
                WHEN (wo_stats.sla_met_count + wo_stats.sla_breached_count) = 0 THEN NULL
                ELSE ROUND((wo_stats.sla_breached_count::numeric / (wo_stats.sla_met_count + wo_stats.sla_breached_count)) * 100, 2)
            END
        ),
        'pm', jsonb_build_object(
            'schedules_total', pm_stats.schedules_total,
            'schedules_active', pm_stats.schedules_active,
            'schedules_overdue', pm_stats.schedules_overdue,
            'schedules_due_7d', pm_stats.schedules_due_7d,
            'preventive_ratio', CASE
                WHEN (wo_stats.preventive_count + wo_stats.corrective_count) = 0 THEN NULL
                ELSE ROUND((wo_stats.preventive_count::numeric / (wo_stats.preventive_count + wo_stats.corrective_count)) * 100, 2)
            END
        ),
        'assets', jsonb_build_object(
            'total', asset_stats.total_assets,
            'operational', asset_stats.operational_assets,
            'under_maintenance', asset_stats.under_maintenance_assets,
            'out_of_service', asset_stats.out_of_service_assets,
            'critical', asset_stats.critical_assets
        ),
        'inventory', jsonb_build_object(
            'total_items', inventory_stats.total_items,
            'low_stock_items', inventory_stats.low_stock_items,
            'out_of_stock_items', inventory_stats.out_of_stock_items,
            'stock_value', ROUND(inventory_stats.stock_value, 2),
            'consumed_quantity_30d', inventory_consumption.consumed_quantity_30d,
            'consumed_value_30d', ROUND(inventory_consumption.consumed_value_30d, 2)
        ),
        'cost', jsonb_build_object(
            'work_order_estimated_total', ROUND(wo_stats.estimated_cost_total, 2),
            'work_order_actual_total', ROUND(wo_stats.actual_cost_total, 2),
            'work_order_line_cost_total', ROUND(wo_costs.total_cost, 2)
        )
    )
    INTO v_result
    FROM wo_stats, wo_costs, asset_stats, inventory_stats, inventory_consumption, pm_stats;

    RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN (
    SELECT p.tenant_id
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND public.tenant_has_operational_access(p.tenant_id)
    LIMIT 1
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.guard_work_order_sensitive_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_authorized       BOOLEAN;
    v_new_json         JSONB;
    v_old_json         JSONB;
    v_field            TEXT;
    v_sensitive_fields TEXT[] := ARRAY[
        'status',
        'assigned_to',
        'assigned_team',
        'start_time',
        'started_at',
        'end_time',
        'completed_at',
        'technician_completed_at',
        'technician_notes',
        'supervisor_approved_by',
        'supervisor_approved_at',
        'supervisor_notes',
        'engineer_approved_by',
        'engineer_approved_at',
        'engineer_notes',
        'maintenance_manager_approved_by',
        'maintenance_manager_approved_at',
        'maintenance_manager_notes',
        'customer_reviewed_by',
        'customer_reviewed_at',
        'reporter_notes',
        'pending_closure_since',
        'auto_closed_at',
        'cancelled_at',
        'cancellation_reason',
        'actual_cost',
        'sla_response_met',
        'sla_resolution_met',
        'completion_notes',
        'work_type',
        'source_schedule_id',
        'source_schedule_asset_id',
        'job_plan_id',
        'job_plan_snapshot',
        'scheduled_date',
        'compliance_deadline',
        'actual_duration_minutes'
    ];
BEGIN
    v_authorized := COALESCE(
        current_setting('app.work_order_workflow_authorized', TRUE) = 'true',
        FALSE
    );

    IF v_authorized THEN
        RETURN NEW;
    END IF;

    v_new_json := to_jsonb(NEW);
    v_old_json := to_jsonb(OLD);

    FOREACH v_field IN ARRAY v_sensitive_fields
    LOOP
        IF NOT (v_new_json ? v_field) THEN
            CONTINUE;
        END IF;

        IF (v_new_json -> v_field) IS DISTINCT FROM (v_old_json -> v_field) THEN
            RAISE EXCEPTION 'Direct update of workflow-sensitive field "%" is not allowed. Use an approved workflow RPC.', v_field
                USING ERRCODE = '42501';
        END IF;
    END LOOP;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_full_name TEXT;
    v_full_name_ar TEXT;
BEGIN
    v_full_name := COALESCE(
        NULLIF(TRIM(new.raw_user_meta_data->>'full_name'), ''),
        SPLIT_PART(new.email, '@', 1)
    );

    v_full_name_ar := COALESCE(
        NULLIF(TRIM(new.raw_user_meta_data->>'full_name_ar'), ''),
        v_full_name
    );

    INSERT INTO public.profiles (
        id,
        email,
        full_name,
        full_name_ar,
        role,
        tenant_id,
        is_active,
        updated_at
    )
    VALUES (
        new.id,
        new.email,
        v_full_name,
        v_full_name_ar,
        'user',
        NULL,
        TRUE,
        NOW()
    )
    ON CONFLICT (id) DO UPDATE
    SET
        email = EXCLUDED.email,
        full_name = COALESCE(NULLIF(public.profiles.full_name, ''), EXCLUDED.full_name),
        full_name_ar = COALESCE(NULLIF(public.profiles.full_name_ar, ''), EXCLUDED.full_name_ar),
        updated_at = NOW();

    RETURN new;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.has_public_portal_access(p_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT public.is_tenant_feature_enabled(p_tenant_id, 'public_portal', 'qr_portal')
       AND public.is_tenant_feature_enabled(p_tenant_id, 'public_portal', 'public_submission');
$function$
;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    user_role TEXT;
    user_is_super BOOLEAN;
BEGIN
    SELECT role, is_super_admin INTO user_role, user_is_super
    FROM public.profiles
    WHERE id = auth.uid();
    
    RETURN (user_is_super = true OR user_role IN ('platform_owner', 'platform_admin'));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_platform_staff()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role TEXT;
    v_is_super BOOLEAN;
BEGIN
    SELECT role, is_super_admin
      INTO v_role, v_is_super
      FROM public.profiles
     WHERE id = auth.uid();

    RETURN COALESCE(v_is_super, FALSE)
        OR COALESCE(v_role, '') LIKE 'platform_%';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN (
    SELECT is_super_admin FROM profiles WHERE id = auth.uid()
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_tenant_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN (
    SELECT role IN ('tenant_admin', 'platform_owner', 'platform_admin') 
    FROM profiles WHERE id = auth.uid()
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_tenant_feature_enabled(p_tenant_id uuid, p_module_code text, p_feature_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT COALESCE(
        (
            SELECT CASE
                WHEN COALESCE((t.enabled_modules -> p_module_code ->> 'enabled')::BOOLEAN, FALSE) = FALSE THEN FALSE
                ELSE COALESCE((t.enabled_modules -> p_module_code -> 'features' ->> p_feature_code)::BOOLEAN, FALSE)
            END
            FROM public.tenants t
            WHERE t.id = p_tenant_id
        ),
        FALSE
    );
$function$
;

CREATE OR REPLACE FUNCTION public.log_platform_action(p_action character varying, p_action_type character varying, p_target_type character varying DEFAULT NULL::character varying, p_target_id uuid DEFAULT NULL::uuid, p_target_name character varying DEFAULT NULL::character varying, p_old_values jsonb DEFAULT NULL::jsonb, p_new_values jsonb DEFAULT NULL::jsonb, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_log_id UUID;
    v_user_email VARCHAR;
    v_user_name VARCHAR;
    v_user_role VARCHAR;
BEGIN
    -- Get user info
    SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();
    SELECT full_name, role INTO v_user_name, v_user_role FROM public.profiles WHERE id = auth.uid();
    
    INSERT INTO public.platform_audit_logs (
        user_id, user_email, user_name, user_role,
        action, action_type, target_type, target_id, target_name,
        old_values, new_values, metadata
    ) VALUES (
        auth.uid(), v_user_email, v_user_name, v_user_role,
        p_action, p_action_type, p_target_type, p_target_id, p_target_name,
        p_old_values, p_new_values, p_metadata
    ) RETURNING id INTO v_log_id;
    
    RETURN v_log_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.normalize_plan_module_codes(p_features jsonb)
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
    v_feature TEXT;
    v_module TEXT;
    v_result TEXT[] := ARRAY[]::TEXT[];
BEGIN
    IF p_features IS NULL OR jsonb_typeof(p_features) <> 'array' THEN
        RETURN v_result;
    END IF;

    FOR v_feature IN SELECT jsonb_array_elements_text(p_features)
    LOOP
        FOREACH v_module IN ARRAY public.plan_feature_to_module_codes(v_feature)
        LOOP
            IF NOT (v_module = ANY (v_result)) THEN
                v_result := array_append(v_result, v_module);
            END IF;
        END LOOP;
    END LOOP;

    RETURN v_result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_on_work_order_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    IF (NEW.assigned_to IS DISTINCT FROM OLD.assigned_to) AND (NEW.assigned_to IS NOT NULL) THEN
        PERFORM create_notification(NEW.tenant_id, NEW.assigned_to, 'New Assignment', 'You have been assigned to work order: ' || NEW.title, 'work_order', '/work-orders/' || NEW.id);
    END IF;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_on_work_order_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    IF (NEW.status IS DISTINCT FROM OLD.status) AND (NEW.reported_by IS NOT NULL) THEN
        PERFORM create_notification(NEW.tenant_id, NEW.reported_by, 'Status Update', 'Work order "' || NEW.title || '" is now ' || NEW.status, 'work_order', '/work-orders/' || NEW.id);
    END IF;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_team_on_new_work_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_member RECORD;
    v_notification_title TEXT;
    v_notification_message TEXT;
BEGIN
    v_notification_title := 'أمر عمل جديد: ' || NEW.code;
    v_notification_message := 'تم إنشاء بلاغ جديد بعنوان: ' || NEW.title;

    -- assigned_team is optional context. If no team is present, do not fan out
    -- to broad role groups; creation/generation should continue without notice.
    IF NEW.assigned_team IS NULL THEN
        RETURN NEW;
    END IF;

    -- If a bad row is inserted by a privileged server path, fail closed for
    -- notifications while allowing the work order insert to proceed.
    IF NOT EXISTS (
        SELECT 1
          FROM public.teams t
         WHERE t.id = NEW.assigned_team
           AND t.tenant_id = NEW.tenant_id
    ) THEN
        RETURN NEW;
    END IF;

    FOR v_member IN
        SELECT tm.user_id
          FROM public.team_members tm
          JOIN public.profiles p
            ON p.id = tm.user_id
           AND p.tenant_id = NEW.tenant_id
           AND COALESCE(p.is_active, TRUE) = TRUE
         WHERE tm.team_id = NEW.assigned_team
           AND COALESCE(tm.is_active, TRUE) = TRUE
    LOOP
        IF v_member.user_id IS DISTINCT FROM NEW.reported_by OR NEW.reported_by IS NULL THEN
            PERFORM public.create_notification(
                NEW.tenant_id,
                v_member.user_id,
                v_notification_title,
                v_notification_message || ' (تم إسناده لفريقك)',
                'work_order',
                '/work-orders/' || NEW.id,
                jsonb_build_object('work_order_id', NEW.id, 'team_id', NEW.assigned_team)
            );
        END IF;
    END LOOP;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.plan_enabled_modules_json(p_plan_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
    v_features JSONB := '[]'::jsonb;
    v_modules JSONB := public.restricted_enabled_modules_json();
    v_default_modules JSONB := public.default_enabled_modules_json();
    v_enabled_codes TEXT[] := ARRAY[]::TEXT[];
    v_module TEXT;
BEGIN
    IF p_plan_id IS NULL THEN
        RETURN v_modules;
    END IF;

    SELECT features
      INTO v_features
      FROM public.subscription_plans
     WHERE id = p_plan_id;

    IF NOT FOUND THEN
        RETURN v_modules;
    END IF;

    v_enabled_codes := public.normalize_plan_module_codes(v_features);

    IF COALESCE(array_length(v_enabled_codes, 1), 0) = 0 THEN
        RETURN v_modules;
    END IF;

    FOREACH v_module IN ARRAY v_enabled_codes
    LOOP
        IF v_default_modules ? v_module THEN
            v_modules := jsonb_set(v_modules, ARRAY[v_module], v_default_modules -> v_module);
        END IF;
    END LOOP;

    RETURN v_modules;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.plan_feature_to_module_codes(p_feature text)
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
    v_feature TEXT := lower(trim(coalesce(p_feature, '')));
BEGIN
    CASE v_feature
        WHEN 'all_features' THEN
            RETURN ARRAY['dashboard', 'facilities', 'assets', 'work_orders', 'maintenance', 'inventory', 'employees', 'work_teams', 'reports', 'public_portal'];

        WHEN 'dashboard', 'basic_dashboard', 'full_dashboard', 'quick_stats', 'charts', 'recent_activity' THEN
            RETURN ARRAY['dashboard'];

        WHEN 'facilities', 'multi_location', 'buildings', 'floors', 'departments', 'rooms' THEN
            RETURN ARRAY['facilities'];

        WHEN 'assets', 'basic_assets', 'asset_tracking', 'qr_codes', 'asset_history', 'warranty_tracking' THEN
            RETURN ARRAY['facilities', 'assets'];

        WHEN 'work_orders', 'basic_work_orders', 'custom_workflows', 'create_wo', 'workflow', 'assignment', 'parts_tracking' THEN
            RETURN ARRAY['facilities', 'work_orders'];

        WHEN 'maintenance', 'maintenance_calendar', 'maintenance_plans', 'schedules', 'auto_generation' THEN
            RETURN ARRAY['facilities', 'maintenance'];

        WHEN 'inventory', 'inventory_management', 'stock_tracking', 'low_stock_alerts', 'consumption_reports' THEN
            RETURN ARRAY['facilities', 'inventory'];

        WHEN 'employees', 'user_management', 'role_assignment' THEN
            RETURN ARRAY['employees'];

        WHEN 'teams', 'work_teams', 'team_creation', 'member_assignment' THEN
            RETURN ARRAY['work_teams'];

        WHEN 'reports', 'basic_reporting', 'advanced_reporting', 'operational_reports', 'export' THEN
            RETURN ARRAY['reports'];

        WHEN 'public_portal', 'public_submission', 'qr_portal' THEN
            RETURN ARRAY['public_portal'];

        ELSE
            IF v_feature = ANY (ARRAY['dashboard', 'facilities', 'assets', 'work_orders', 'maintenance', 'inventory', 'employees', 'work_teams', 'reports', 'public_portal']) THEN
                RETURN ARRAY[v_feature];
            END IF;

            RETURN ARRAY[]::TEXT[];
    END CASE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pm_build_task_execution_snapshot(p_task_id uuid, p_skip_auth boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_task RECORD;
    v_sections JSONB := '[]'::jsonb;
    v_items JSONB := '[]'::jsonb;
    v_targets JSONB := '[]'::jsonb;
BEGIN
    IF auth.uid() IS NULL AND NOT p_skip_auth THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT
        mt.*,
        mp.name AS plan_name,
        mp.name_ar AS plan_name_ar,
        mfb.name AS bundle_name,
        mfb.name_ar AS bundle_name_ar,
        mfb.frequency_type AS bundle_frequency_type,
        mfb.interval_count AS bundle_interval_count,
        mfb.instructions AS bundle_instructions,
        ct.name AS template_name,
        ct.name_ar AS template_name_ar,
        ct.category AS template_category,
        ct.asset_type AS template_asset_type,
        ct.version AS template_version,
        ct.status AS template_status,
        ct.template_type AS template_type,
        ct.metadata AS template_metadata
      INTO v_task
      FROM public.maintenance_tasks mt
      LEFT JOIN public.maintenance_plans mp ON mp.id = mt.maintenance_plan_id
      LEFT JOIN public.maintenance_frequency_bundles mfb ON mfb.id = mt.frequency_bundle_id
      LEFT JOIN public.checklist_templates ct ON ct.id = mt.checklist_template_id
     WHERE mt.id = p_task_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Maintenance task not found';
    END IF;

    IF NOT p_skip_auth AND NOT public.pm_can_view_task(p_task_id) THEN
        RAISE EXCEPTION 'Unauthorized to build execution snapshot';
    END IF;

    IF v_task.checklist_template_id IS NOT NULL THEN
        SELECT COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', cts.id,
                    'code', cts.code,
                    'title', cts.title,
                    'title_ar', cts.title_ar,
                    'description', cts.description,
                    'description_ar', cts.description_ar,
                    'section_type', cts.section_type,
                    'sort_order', cts.sort_order,
                    'is_collapsible', cts.is_collapsible,
                    'metadata', cts.metadata
                )
                ORDER BY cts.sort_order, cts.created_at
            ),
            '[]'::jsonb
        )
        INTO v_sections
        FROM public.checklist_template_sections cts
        WHERE cts.template_id = v_task.checklist_template_id;

        SELECT COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', cti.id,
                    'template_id', cti.template_id,
                    'section_id', cti.section_id,
                    'sort_order', cti.sort_order,
                    'label', cti.label,
                    'label_ar', cti.label_ar,
                    'item_type', cti.item_type,
                    'is_required', cti.is_required,
                    'is_critical', cti.is_critical,
                    'unit', cti.unit,
                    'min_value', cti.min_value,
                    'max_value', cti.max_value,
                    'warning_min_value', cti.warning_min_value,
                    'warning_max_value', cti.warning_max_value,
                    'placeholder', cti.placeholder,
                    'placeholder_ar', cti.placeholder_ar,
                    'help_text', cti.help_text,
                    'help_text_ar', cti.help_text_ar,
                    'applies_to_target_type', cti.applies_to_target_type,
                    'options', cti.options,
                    'description', cti.description,
                    'description_ar', cti.description_ar,
                    'metadata', cti.metadata,
                    'created_at', cti.created_at
                )
                ORDER BY COALESCE(cts.sort_order, 0), cti.sort_order, cti.created_at
            ),
            '[]'::jsonb
        )
        INTO v_items
        FROM public.checklist_template_items cti
        LEFT JOIN public.checklist_template_sections cts ON cts.id = cti.section_id
        WHERE cti.template_id = v_task.checklist_template_id;
    END IF;

    IF v_task.maintenance_plan_id IS NOT NULL THEN
        SELECT COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', mpt.id,
                    'target_type', mpt.target_type,
                    'asset_id', mpt.asset_id,
                    'building_id', mpt.building_id,
                    'asset_group_id', mpt.asset_group_id,
                    'is_primary', mpt.is_primary,
                    'role', mpt.role,
                    'notes', mpt.notes,
                    'label_snapshot', COALESCE(
                        NULLIF(mpt.label_snapshot, '{}'::jsonb),
                        jsonb_strip_nulls(jsonb_build_object(
                            'asset_code', a.code,
                            'asset_name', a.name,
                            'asset_name_ar', a.name_ar,
                            'building_name', b.name,
                            'building_name_ar', b.name_ar,
                            'asset_group_code', ag.code,
                            'asset_group_name', ag.name,
                            'asset_group_name_ar', ag.name_ar
                        ))
                    )
                )
                ORDER BY mpt.is_primary DESC, mpt.created_at
            ),
            '[]'::jsonb
        )
        INTO v_targets
        FROM public.maintenance_plan_targets mpt
        LEFT JOIN public.assets a ON a.id = mpt.asset_id
        LEFT JOIN public.buildings b ON b.id = mpt.building_id
        LEFT JOIN public.asset_groups ag ON ag.id = mpt.asset_group_id
        WHERE mpt.plan_id = v_task.maintenance_plan_id;
    END IF;

    RETURN jsonb_build_object(
        'version', 2,
        'snapshot_type', 'pm_execution',
        'created_at', NOW(),
        'task', jsonb_build_object(
            'id', v_task.id,
            'title', v_task.title,
            'description', v_task.description,
            'asset_id', v_task.asset_id,
            'building_id', v_task.building_id,
            'assigned_to', v_task.assigned_to,
            'assigned_team_id', v_task.assigned_team_id,
            'requires_photo', v_task.requires_photo,
            'requires_signature', v_task.requires_signature,
            'estimated_duration_minutes', v_task.estimated_duration_minutes
        ),
        'plan', jsonb_build_object(
            'id', v_task.maintenance_plan_id,
            'name', v_task.plan_name,
            'name_ar', v_task.plan_name_ar
        ),
        'frequency_bundle', jsonb_build_object(
            'id', v_task.frequency_bundle_id,
            'name', v_task.bundle_name,
            'name_ar', v_task.bundle_name_ar,
            'frequency_type', v_task.bundle_frequency_type,
            'interval_count', v_task.bundle_interval_count,
            'instructions', v_task.bundle_instructions
        ),
        'template', jsonb_build_object(
            'id', v_task.checklist_template_id,
            'name', v_task.template_name,
            'name_ar', v_task.template_name_ar,
            'category', v_task.template_category,
            'asset_type', v_task.template_asset_type,
            'version', v_task.template_version,
            'status', v_task.template_status,
            'template_type', v_task.template_type,
            'metadata', v_task.template_metadata
        ),
        'targets', v_targets,
        'sections', v_sections,
        'items', v_items
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pm_calculate_compliance_stats(p_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_total              INTEGER;
    v_completed_on_time  INTEGER;
    v_overdue            INTEGER;
    v_due_soon           INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_total
      FROM public.work_orders
     WHERE tenant_id   = p_tenant_id
       AND work_type   = 'preventive'
       AND scheduled_date >= CURRENT_DATE - 30;

    SELECT COUNT(*) INTO v_completed_on_time
      FROM public.work_orders
     WHERE tenant_id   = p_tenant_id
       AND work_type   = 'preventive'
       AND scheduled_date >= CURRENT_DATE - 30
       AND status      = 'completed'
       AND completed_at::DATE <= compliance_deadline;

    SELECT COUNT(*) INTO v_overdue
      FROM public.work_orders
     WHERE tenant_id   = p_tenant_id
       AND work_type   = 'preventive'
       AND status NOT IN ('completed', 'cancelled')
       AND compliance_deadline < CURRENT_DATE;

    SELECT COUNT(*) INTO v_due_soon
      FROM public.work_orders
     WHERE tenant_id   = p_tenant_id
       AND work_type   = 'preventive'
       AND status      = 'pending'
       AND scheduled_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7;

    RETURN jsonb_build_object(
        'total',             v_total,
        'completed_on_time', v_completed_on_time,
        'overdue',           v_overdue,
        'due_soon',          v_due_soon,
        'compliance_rate',   CASE
            WHEN v_total > 0
            THEN ROUND((v_completed_on_time::DECIMAL / v_total * 100.0)::NUMERIC, 2)
            ELSE NULL
        END
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pm_calculate_compliance_window(p_frequency_type character varying, p_frequency_interval integer)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
    v_days INTEGER;
BEGIN
    v_days := CASE p_frequency_type
        WHEN 'daily'       THEN p_frequency_interval
        WHEN 'weekly'      THEN p_frequency_interval * 7
        WHEN 'monthly'     THEN p_frequency_interval * 30
        WHEN 'quarterly'   THEN p_frequency_interval * 90
        WHEN 'semi_annual' THEN p_frequency_interval * 180
        WHEN 'annual'      THEN p_frequency_interval * 365
        ELSE 30
    END;
    RETURN GREATEST(1, LEAST(30, (v_days * 0.10)::INTEGER));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pm_calculate_next_due(p_current_due date, p_frequency_type character varying, p_frequency_interval integer)
 RETURNS date
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
BEGIN
    RETURN CASE p_frequency_type
        WHEN 'daily'       THEN p_current_due + (p_frequency_interval || ' days')::INTERVAL
        WHEN 'weekly'      THEN p_current_due + (p_frequency_interval || ' weeks')::INTERVAL
        WHEN 'monthly'     THEN p_current_due + (p_frequency_interval || ' months')::INTERVAL
        WHEN 'quarterly'   THEN p_current_due + (p_frequency_interval * 3 || ' months')::INTERVAL
        WHEN 'semi_annual' THEN p_current_due + (p_frequency_interval * 6 || ' months')::INTERVAL
        WHEN 'annual'      THEN p_current_due + (p_frequency_interval || ' years')::INTERVAL
        ELSE                    p_current_due + '1 month'::INTERVAL
    END;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pm_can_execute_task(p_task_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_tenant_id UUID;
    v_assigned_to UUID;
    v_assigned_team_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT mt.tenant_id, mt.assigned_to, mt.assigned_team_id
      INTO v_tenant_id, v_assigned_to, v_assigned_team_id
      FROM public.maintenance_tasks mt
     WHERE mt.id = p_task_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    RETURN public.pm_can_manage_tenant(v_tenant_id)
        OR v_assigned_to = auth.uid()
        OR EXISTS (
            SELECT 1
              FROM public.team_members tm
             WHERE tm.team_id = v_assigned_team_id
               AND tm.user_id = auth.uid()
               AND tm.is_active = TRUE
        );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pm_can_manage_tenant(p_tenant_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_role TEXT;
    v_tenant_id UUID;
    v_is_super BOOLEAN;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT p.role, p.tenant_id, COALESCE(p.is_super_admin, FALSE)
      INTO v_role, v_tenant_id, v_is_super
      FROM public.profiles p
     WHERE p.id = auth.uid();

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    RETURN v_is_super
        OR v_role IN ('platform_owner', 'platform_admin')
        OR (
            v_tenant_id = p_tenant_id
            AND v_role IN ('tenant_admin', 'maintenance_manager', 'facility_manager')
        );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pm_can_view_task(p_task_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_tenant_id UUID;
    v_assigned_to UUID;
    v_assigned_team_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT mt.tenant_id, mt.assigned_to, mt.assigned_team_id
      INTO v_tenant_id, v_assigned_to, v_assigned_team_id
      FROM public.maintenance_tasks mt
     WHERE mt.id = p_task_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    RETURN public.pm_can_view_tenant(v_tenant_id)
        OR v_assigned_to = auth.uid()
        OR EXISTS (
            SELECT 1
              FROM public.team_members tm
             WHERE tm.team_id = v_assigned_team_id
               AND tm.user_id = auth.uid()
               AND tm.is_active = TRUE
        );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pm_can_view_tenant(p_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT public.is_platform_admin()
        OR p_tenant_id = public.get_user_tenant_id();
$function$
;

CREATE OR REPLACE FUNCTION public.pm_cancel_task(p_task_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_task public.maintenance_tasks%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT *
      INTO v_task
      FROM public.maintenance_tasks
     WHERE id = p_task_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Maintenance task not found';
    END IF;

    IF v_task.status NOT IN ('pending', 'in_progress') THEN
        RAISE EXCEPTION 'Cannot cancel a task with status %', v_task.status;
    END IF;

    IF NOT public.pm_can_execute_task(p_task_id)
       AND NOT public.pm_can_manage_tenant(v_task.tenant_id) THEN
        RAISE EXCEPTION 'Unauthorized to cancel this maintenance task';
    END IF;

    UPDATE public.maintenance_tasks
       SET status           = 'cancelled',
           execution_status = 'cancelled',
           completion_notes = COALESCE(p_reason, completion_notes)
     WHERE id = p_task_id;

    PERFORM public.pm_update_plan_stats(v_task.maintenance_plan_id);

    PERFORM public.pm_write_audit_log(
        p_action      => 'Cancelled preventive maintenance task',
        p_action_type => 'update',
        p_target_type => 'maintenance_task',
        p_target_id   => p_task_id,
        p_metadata    => jsonb_build_object(
            'task_id', p_task_id,
            'reason',  p_reason
        ),
        p_new_values  => jsonb_build_object(
            'status',           'cancelled',
            'execution_status', 'cancelled'
        )
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'task_id', p_task_id,
        'status',  'cancelled'
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pm_complete_task(p_task_id uuid, p_completion_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_task                  public.maintenance_tasks%ROWTYPE;
    v_completed_at          TIMESTAMPTZ := NOW();
    v_missing_required      INTEGER     := 0;
    v_missing_labels        TEXT;
    v_unchecked_legacy      INTEGER     := 0;
    v_has_required_photo    BOOLEAN     := FALSE;
    v_has_required_signature BOOLEAN   := FALSE;
    v_actual_duration       INTEGER     := 0;
    v_reference             TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT *
      INTO v_task
      FROM public.maintenance_tasks
     WHERE id = p_task_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Maintenance task not found';
    END IF;

    IF v_task.status <> 'in_progress' THEN
        RAISE EXCEPTION 'Only in-progress maintenance tasks can be completed';
    END IF;

    IF NOT public.pm_can_execute_task(p_task_id) THEN
        RAISE EXCEPTION 'Unauthorized to complete this maintenance task';
    END IF;

    -- -------------------------------------------------------------------------
    -- Template-based checklist validation
    -- -------------------------------------------------------------------------
    IF v_task.checklist_template_id IS NOT NULL THEN
        PERFORM public.pm_populate_task_checks_internal(p_task_id);

        SELECT
            COUNT(*),
            string_agg(cti.label, ', ' ORDER BY cti.sort_order)
          INTO v_missing_required, v_missing_labels
          FROM public.checklist_template_items cti
          LEFT JOIN public.maintenance_task_checks mtc
                 ON mtc.task_id = p_task_id
                AND mtc.template_item_id = cti.id
         WHERE cti.template_id = v_task.checklist_template_id
           AND cti.is_required = TRUE
           AND COALESCE(
               CASE
                   WHEN cti.item_type = 'yes_no'
                       THEN mtc.value_bool IS NOT NULL OR mtc.status = 'na'
                   WHEN cti.item_type IN ('numeric', 'reading')
                       THEN mtc.value_numeric IS NOT NULL
                   WHEN cti.item_type IN ('text', 'select')
                       THEN NULLIF(BTRIM(mtc.value_text), '') IS NOT NULL
                   WHEN cti.item_type = 'photo'
                       THEN NULLIF(BTRIM(mtc.value_photo_url), '') IS NOT NULL
                   WHEN cti.item_type = 'signature'
                       THEN NULLIF(BTRIM(mtc.value_signature_url), '') IS NOT NULL
                   ELSE FALSE
               END,
               FALSE
           ) = FALSE;

        IF v_missing_required > 0 THEN
            RAISE EXCEPTION 'Required items incomplete: %', COALESCE(v_missing_labels, '(unknown)');
        END IF;

    -- -------------------------------------------------------------------------
    -- Legacy (manual) checklist validation
    -- -------------------------------------------------------------------------
    ELSIF v_task.checklist IS NOT NULL
       AND jsonb_typeof(v_task.checklist) = 'array'
       AND jsonb_array_length(v_task.checklist) > 0 THEN

        SELECT COUNT(*)
          INTO v_unchecked_legacy
          FROM jsonb_array_elements(v_task.checklist) AS item
         WHERE COALESCE((item->>'checked')::BOOLEAN, FALSE) = FALSE;

        IF v_unchecked_legacy > 0 THEN
            RAISE EXCEPTION 'All checklist items must be completed before the task can be marked done (% remaining)', v_unchecked_legacy;
        END IF;
    END IF;

    -- -------------------------------------------------------------------------
    -- Photo requirement
    -- -------------------------------------------------------------------------
    IF COALESCE(v_task.requires_photo, FALSE) AND v_task.checklist_template_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1
              FROM public.maintenance_task_checks mtc
              JOIN public.checklist_template_items cti ON cti.id = mtc.template_item_id
             WHERE mtc.task_id = p_task_id
               AND cti.item_type = 'photo'
               AND NULLIF(BTRIM(mtc.value_photo_url), '') IS NOT NULL
        )
        OR EXISTS (
            SELECT 1
              FROM public.maintenance_task_attachments mta
             WHERE mta.task_id = p_task_id
               AND mta.attachment_type IN ('before_photo', 'after_photo', 'check_photo')
               AND NULLIF(BTRIM(mta.file_url), '') IS NOT NULL
        )
        INTO v_has_required_photo;

        IF NOT v_has_required_photo THEN
            RAISE EXCEPTION 'A photo is required before completing this task';
        END IF;
    END IF;

    -- -------------------------------------------------------------------------
    -- Signature requirement
    -- -------------------------------------------------------------------------
    IF COALESCE(v_task.requires_signature, FALSE) AND v_task.checklist_template_id IS NOT NULL THEN
        IF NULLIF(BTRIM(v_task.executor_signature_url), '') IS NOT NULL THEN
            v_has_required_signature := TRUE;
        ELSE
            SELECT EXISTS (
                SELECT 1
                  FROM public.maintenance_task_checks mtc
                  JOIN public.checklist_template_items cti ON cti.id = mtc.template_item_id
                 WHERE mtc.task_id = p_task_id
                   AND cti.item_type = 'signature'
                   AND NULLIF(BTRIM(mtc.value_signature_url), '') IS NOT NULL
            )
            INTO v_has_required_signature;
        END IF;

        IF NOT v_has_required_signature THEN
            RAISE EXCEPTION 'A signature is required before completing this task';
        END IF;
    END IF;

    -- -------------------------------------------------------------------------
    -- Compute actual duration
    -- -------------------------------------------------------------------------
    IF v_task.started_at IS NOT NULL THEN
        v_actual_duration := GREATEST(0,
            FLOOR(EXTRACT(EPOCH FROM (v_completed_at - v_task.started_at)) / 60.0)::INTEGER
        );
    END IF;

    v_reference := COALESCE(
        v_task.execution_reference,
        'PM-' || UPPER(REPLACE(p_task_id::text, '-', ''))
    );

    -- -------------------------------------------------------------------------
    -- Commit the completed state
    -- -------------------------------------------------------------------------
    UPDATE public.maintenance_tasks
       SET status                  = 'completed',
           completed_at            = v_completed_at,
           completion_notes        = COALESCE(p_completion_notes, completion_notes),
           actual_duration_minutes = CASE
               WHEN v_task.started_at IS NOT NULL THEN v_actual_duration
               ELSE actual_duration_minutes
           END,
           execution_reference     = v_reference,
           execution_status        = 'completed',
           execution_completed_by  = auth.uid(),
           execution_completed_at  = v_completed_at,
           review_status           = 'pending',
           reviewed_by             = NULL,
           reviewed_at             = NULL,
           review_notes            = NULL,
           execution_snapshot      = COALESCE(
               execution_snapshot,
               public.pm_build_task_execution_snapshot(p_task_id, TRUE)
           )
     WHERE id = p_task_id;

    PERFORM public.pm_update_plan_stats(v_task.maintenance_plan_id);

    PERFORM public.pm_write_audit_log(
        p_action      => 'Submitted preventive maintenance execution sheet',
        p_action_type => 'update',
        p_target_type => 'maintenance_task',
        p_target_id   => p_task_id,
        p_metadata    => jsonb_build_object(
            'task_id',                p_task_id,
            'status',                 'completed',
            'execution_status',       'completed',
            'review_status',          'pending',
            'completed_at',           v_completed_at,
            'actual_duration_minutes', v_actual_duration,
            'completion_notes',       p_completion_notes
        ),
        p_new_values  => jsonb_build_object(
            'status',                 'completed',
            'execution_status',       'completed',
            'review_status',          'pending',
            'completed_at',           v_completed_at,
            'actual_duration_minutes', v_actual_duration
        )
    );

    RETURN jsonb_build_object(
        'success',                TRUE,
        'task_id',                p_task_id,
        'status',                 'completed',
        'execution_status',       'completed',
        'review_status',          'pending',
        'completed_at',           v_completed_at,
        'actual_duration_minutes', v_actual_duration,
        'execution_reference',    v_reference
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pm_generate_due_work_orders()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_schedule                RECORD;
    v_plan                    RECORD;
    v_asset                   RECORD;
    v_item                    RECORD;
    v_wo_id                   UUID;
    v_wo_code                 VARCHAR(50);
    v_next_due                DATE;
    v_generated_count         INTEGER := 0;
    v_schedule_generated      INTEGER := 0;
    v_schedules_scanned       INTEGER := 0;
    v_schedules_advanced      INTEGER := 0;
    v_existing_cycles         INTEGER := 0;
    v_skipped_no_assets       INTEGER := 0;
    v_skipped_inactive_tenant INTEGER := 0;
    v_expected_assets         INTEGER := 0;
    v_existing_assets         INTEGER := 0;
    v_job_plan_snapshot       JSONB;
    v_assignee_id             UUID;
    v_run_id                  UUID        := gen_random_uuid();
    v_started_at              TIMESTAMPTZ := NOW();

    v_auth_role               TEXT    := COALESCE(auth.role(), '');
    v_caller_id               UUID    := auth.uid();
    v_profile_role            TEXT;
    v_profile_tenant_id       UUID;
    v_profile_is_super        BOOLEAN := FALSE;
    v_profile_is_active       BOOLEAN := TRUE;
    v_run_all_tenants         BOOLEAN := FALSE;
BEGIN
    -- -------------------------------------------------------------------------
    -- 1. Authentication and authority check
    -- -------------------------------------------------------------------------
    IF v_auth_role = 'anon' THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Service-role / SQL admin have no auth.uid() — all-tenant generation.
    IF v_caller_id IS NULL THEN
        v_run_all_tenants := TRUE;
    ELSE
        SELECT
            role,
            tenant_id,
            COALESCE(is_super_admin, FALSE),
            COALESCE(is_active, TRUE)
          INTO
            v_profile_role,
            v_profile_tenant_id,
            v_profile_is_super,
            v_profile_is_active
          FROM public.profiles
         WHERE id = v_caller_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Caller profile not found';
        END IF;

        IF NOT v_profile_is_active THEN
            RAISE EXCEPTION 'Inactive users cannot generate PM work orders';
        END IF;

        IF v_profile_is_super
           OR v_profile_role IN ('platform_owner', 'platform_admin')
        THEN
            v_run_all_tenants := TRUE;
        ELSIF v_profile_role IN (
            'tenant_admin', 'tenant_owner', 'facility_manager', 'maintenance_manager'
        ) THEN
            IF v_profile_tenant_id IS NULL THEN
                RAISE EXCEPTION 'Caller tenant is required';
            END IF;
        ELSE
            RAISE EXCEPTION 'Insufficient permission to generate PM work orders';
        END IF;
    END IF;

    -- -------------------------------------------------------------------------
    -- 2. Main generation loop
    --    JOIN tenants to skip is_active = FALSE tenants at query time.
    -- -------------------------------------------------------------------------
    FOR v_schedule IN
        SELECT ps.*
          FROM public.pm_schedules ps
          JOIN public.tenants t ON t.id = ps.tenant_id
         WHERE ps.status = 'active'
           AND ps.trigger_type = 'calendar'
           AND ps.next_due_date IS NOT NULL
           AND (ps.next_due_date - COALESCE(ps.lead_time_days, 0)) <= CURRENT_DATE
           AND (ps.end_date IS NULL OR ps.next_due_date <= ps.end_date)
           AND t.is_active = TRUE
           AND (v_run_all_tenants OR ps.tenant_id = v_profile_tenant_id)
         ORDER BY ps.next_due_date, ps.created_at
    LOOP
        -- Belt-and-suspenders: also check subscription / operational access.
        IF NOT public.tenant_has_operational_access(v_schedule.tenant_id) THEN
            v_skipped_inactive_tenant := v_skipped_inactive_tenant + 1;
            CONTINUE;
        END IF;

        v_schedule_generated := 0;
        v_schedules_scanned  := v_schedules_scanned + 1;

        -- Load job plan.
        SELECT * INTO v_plan
          FROM public.job_plans
         WHERE id = v_schedule.job_plan_id;

        IF NOT FOUND THEN
            CONTINUE;
        END IF;

        -- Freeze job plan snapshot.
        v_job_plan_snapshot := jsonb_strip_nulls(jsonb_build_object(
            'id',                          v_plan.id,
            'code',                        v_plan.code,
            'name',                        v_plan.name,
            'name_ar',                     v_plan.name_ar,
            'version',                     v_plan.version,
            'category',                    v_plan.category,
            'estimated_duration_minutes',  v_plan.estimated_duration_minutes,
            'requires_safety_checks',      v_plan.requires_safety_checks,
            'safety_notes',                v_plan.safety_notes,
            'safety_notes_ar',             v_plan.safety_notes_ar,
            'required_parts',              v_plan.required_parts,
            'required_tools',              v_plan.required_tools,
            'required_materials',          v_plan.required_materials,
            'reference_documents',         v_plan.reference_documents,
            'required_skill',              v_plan.required_skill,
            'required_role',               v_plan.required_role
        ));

        -- Validate default_assignee_id: must be active, same tenant, allowed role.
        -- If invalid, generate the WO with assigned_to = NULL (pending-unassigned).
        v_assignee_id := NULL;
        IF v_schedule.default_assignee_id IS NOT NULL THEN
            IF EXISTS (
                SELECT 1
                  FROM public.profiles
                 WHERE id        = v_schedule.default_assignee_id
                   AND tenant_id = v_schedule.tenant_id
                   AND COALESCE(is_active, TRUE) = TRUE
                   AND role IN ('technician', 'engineer', 'maintenance_manager')
            ) THEN
                v_assignee_id := v_schedule.default_assignee_id;
            END IF;
        END IF;

        -- -----------------------------------------------------------------------
        -- Idempotency: if the current due cycle is already fully covered by
        -- existing non-cancelled WOs, advance the schedule and skip generation.
        -- (Unchanged from migration 112.)
        -- -----------------------------------------------------------------------
        IF COALESCE(v_schedule.generation_mode, 'batch_route') = 'per_asset' THEN

            SELECT COUNT(*) INTO v_expected_assets
              FROM (
                  SELECT psa.asset_id
                    FROM public.pm_schedule_assets psa
                   WHERE psa.schedule_id = v_schedule.id

                  UNION

                  SELECT v_schedule.primary_asset_id AS asset_id
                   WHERE v_schedule.primary_asset_id IS NOT NULL
                     AND NOT EXISTS (
                         SELECT 1
                           FROM public.pm_schedule_assets psa
                          WHERE psa.schedule_id = v_schedule.id
                     )
              ) expected_assets;

            IF v_expected_assets = 0 THEN
                v_skipped_no_assets := v_skipped_no_assets + 1;
                CONTINUE;
            END IF;

            SELECT COUNT(DISTINCT woa.asset_id) INTO v_existing_assets
              FROM public.work_orders wo
              JOIN public.work_order_assets woa ON woa.work_order_id = wo.id
             WHERE wo.source_schedule_id = v_schedule.id
               AND wo.scheduled_date     = v_schedule.next_due_date
               AND wo.status            <> 'cancelled'
               AND woa.asset_id IN (
                   SELECT psa.asset_id
                     FROM public.pm_schedule_assets psa
                    WHERE psa.schedule_id = v_schedule.id

                   UNION

                   SELECT v_schedule.primary_asset_id AS asset_id
                    WHERE v_schedule.primary_asset_id IS NOT NULL
                      AND NOT EXISTS (
                          SELECT 1
                            FROM public.pm_schedule_assets psa
                           WHERE psa.schedule_id = v_schedule.id
                      )
               );

            IF v_existing_assets >= v_expected_assets THEN
                v_next_due := public.pm_calculate_next_due(
                    v_schedule.next_due_date,
                    v_schedule.frequency_type,
                    COALESCE(v_schedule.frequency_interval, 1)
                );

                UPDATE public.pm_schedules
                   SET next_due_date       = v_next_due,
                       last_generated_date = v_schedule.next_due_date,
                       updated_at          = NOW()
                 WHERE id = v_schedule.id;

                v_existing_cycles    := v_existing_cycles + 1;
                v_schedules_advanced := v_schedules_advanced + 1;
                CONTINUE;
            END IF;

        ELSE  -- batch_route
            IF v_schedule.primary_asset_id IS NULL
               AND NOT EXISTS (
                   SELECT 1
                     FROM public.pm_schedule_assets psa
                    WHERE psa.schedule_id = v_schedule.id
               ) THEN
                v_skipped_no_assets := v_skipped_no_assets + 1;
                CONTINUE;
            END IF;

            IF EXISTS (
                SELECT 1
                  FROM public.work_orders wo
                 WHERE wo.source_schedule_id       = v_schedule.id
                   AND wo.source_schedule_asset_id IS NULL
                   AND wo.scheduled_date           = v_schedule.next_due_date
                   AND wo.status                  <> 'cancelled'
            ) THEN
                v_next_due := public.pm_calculate_next_due(
                    v_schedule.next_due_date,
                    v_schedule.frequency_type,
                    COALESCE(v_schedule.frequency_interval, 1)
                );

                UPDATE public.pm_schedules
                   SET next_due_date       = v_next_due,
                       last_generated_date = v_schedule.next_due_date,
                       updated_at          = NOW()
                 WHERE id = v_schedule.id;

                v_existing_cycles    := v_existing_cycles + 1;
                v_schedules_advanced := v_schedules_advanced + 1;
                CONTINUE;
            END IF;
        END IF;

        -- -----------------------------------------------------------------------
        -- Generation: per_asset mode — one WO per asset
        -- -----------------------------------------------------------------------
        IF COALESCE(v_schedule.generation_mode, 'batch_route') = 'per_asset' THEN

            FOR v_asset IN
                SELECT
                    psa.id        AS schedule_asset_id,
                    psa.asset_id,
                    psa.sort_order,
                    a.name        AS asset_name,
                    a.name_ar     AS asset_name_ar
                  FROM public.pm_schedule_assets psa
                  JOIN public.assets a ON a.id = psa.asset_id
                 WHERE psa.schedule_id = v_schedule.id

                UNION ALL

                SELECT
                    NULL::UUID     AS schedule_asset_id,
                    v_schedule.primary_asset_id AS asset_id,
                    0              AS sort_order,
                    a.name         AS asset_name,
                    a.name_ar      AS asset_name_ar
                  FROM public.assets a
                 WHERE a.id = v_schedule.primary_asset_id
                   AND NOT EXISTS (
                       SELECT 1
                         FROM public.pm_schedule_assets psa
                        WHERE psa.schedule_id = v_schedule.id
                   )
                 ORDER BY sort_order
            LOOP
                -- Skip asset if this cycle already has a non-cancelled WO.
                IF EXISTS (
                    SELECT 1
                      FROM public.work_orders wo
                      JOIN public.work_order_assets woa ON woa.work_order_id = wo.id
                     WHERE wo.source_schedule_id = v_schedule.id
                       AND wo.scheduled_date     = v_schedule.next_due_date
                       AND woa.asset_id          = v_asset.asset_id
                       AND wo.status            <> 'cancelled'
                ) THEN
                    CONTINUE;
                END IF;

                v_wo_code := 'WO-' || EXTRACT(YEAR FROM CURRENT_DATE)::TEXT
                             || '-' || LPAD(nextval('public.work_order_number_seq')::TEXT, 6, '0');

                INSERT INTO public.work_orders (
                    tenant_id,
                    code,
                    title,
                    description,
                    work_type,
                    source_schedule_id,
                    source_schedule_asset_id,
                    job_plan_id,
                    job_plan_snapshot,
                    status,
                    priority,
                    scheduled_date,
                    compliance_deadline,
                    assigned_to,
                    assigned_team,
                    asset_id,
                    created_at,
                    updated_at
                )
                VALUES (
                    v_schedule.tenant_id,
                    v_wo_code,
                    LEFT(
                        COALESCE(v_schedule.name, v_plan.name) || ' - ' ||
                        COALESCE(v_asset.asset_name, v_asset.asset_id::TEXT),
                        255
                    ),
                    v_schedule.description,
                    'preventive',
                    v_schedule.id,
                    v_asset.schedule_asset_id,
                    v_schedule.job_plan_id,
                    v_job_plan_snapshot,
                    'pending',
                    CASE v_schedule.default_priority
                        WHEN 'critical' THEN 'urgent'
                        ELSE v_schedule.default_priority
                    END,
                    v_schedule.next_due_date,
                    v_schedule.next_due_date + COALESCE(
                        v_schedule.compliance_window_days,
                        public.pm_calculate_compliance_window(
                            v_schedule.frequency_type,
                            COALESCE(v_schedule.frequency_interval, 1)
                        )
                    ),
                    v_assignee_id,
                    v_schedule.default_team_id,
                    v_asset.asset_id,
                    NOW(),
                    NOW()
                )
                RETURNING id INTO v_wo_id;

                INSERT INTO public.work_order_assets (work_order_id, asset_id, sort_order)
                VALUES (v_wo_id, v_asset.asset_id, v_asset.sort_order)
                ON CONFLICT (work_order_id, asset_id) DO NOTHING;

                FOR v_item IN
                    SELECT *
                      FROM public.job_plan_items
                     WHERE job_plan_id = v_schedule.job_plan_id
                     ORDER BY sort_order, id
                LOOP
                    CONTINUE WHEN v_item.item_type = 'header';

                    INSERT INTO public.work_order_checks (
                        work_order_id,
                        asset_id,
                        job_plan_item_id,
                        item_snapshot,
                        sort_order,
                        status
                    )
                    VALUES (
                        v_wo_id,
                        v_asset.asset_id,
                        v_item.id,
                        jsonb_build_object(
                            'label',         v_item.label,
                            'label_ar',      v_item.label_ar,
                            'description',   v_item.description,
                            'description_ar',v_item.description_ar,
                            'item_type',     v_item.item_type,
                            'is_required',   v_item.is_required,
                            'is_critical',   v_item.is_critical,
                            'unit',          v_item.unit,
                            'min_value',     v_item.min_value,
                            'max_value',     v_item.max_value,
                            'warning_min',   v_item.warning_min,
                            'warning_max',   v_item.warning_max,
                            'options',       v_item.options,
                            'help_text',     v_item.help_text,
                            'help_text_ar',  v_item.help_text_ar
                        ),
                        v_item.sort_order,
                        'pending'
                    );
                END LOOP;

                -- Audit: one operation_log per generated WO.
                PERFORM public.create_operation_log(
                    v_schedule.tenant_id,
                    v_wo_id,
                    'pm_generate',
                    'PM work order generated from schedule ' ||
                        COALESCE(v_schedule.code, v_schedule.id::TEXT),
                    v_caller_id
                );

                v_generated_count    := v_generated_count + 1;
                v_schedule_generated := v_schedule_generated + 1;
            END LOOP;

        ELSE
        -- -----------------------------------------------------------------------
        -- Generation: batch_route mode — one WO for all schedule assets
        -- -----------------------------------------------------------------------
            IF v_schedule.primary_asset_id IS NULL
               AND NOT EXISTS (
                   SELECT 1 FROM public.pm_schedule_assets
                    WHERE schedule_id = v_schedule.id
               ) THEN
                CONTINUE;
            END IF;

            IF EXISTS (
                SELECT 1
                  FROM public.work_orders
                 WHERE source_schedule_id       = v_schedule.id
                   AND source_schedule_asset_id IS NULL
                   AND scheduled_date           = v_schedule.next_due_date
                   AND status                  <> 'cancelled'
            ) THEN
                CONTINUE;
            END IF;

            v_wo_code := 'WO-' || EXTRACT(YEAR FROM CURRENT_DATE)::TEXT
                         || '-' || LPAD(nextval('public.work_order_number_seq')::TEXT, 6, '0');

            INSERT INTO public.work_orders (
                tenant_id,
                code,
                title,
                description,
                work_type,
                source_schedule_id,
                source_schedule_asset_id,
                job_plan_id,
                job_plan_snapshot,
                status,
                priority,
                scheduled_date,
                compliance_deadline,
                assigned_to,
                assigned_team,
                asset_id,
                created_at,
                updated_at
            )
            VALUES (
                v_schedule.tenant_id,
                v_wo_code,
                LEFT(COALESCE(v_schedule.name, v_plan.name), 255),
                v_schedule.description,
                'preventive',
                v_schedule.id,
                NULL,
                v_schedule.job_plan_id,
                v_job_plan_snapshot,
                'pending',
                CASE v_schedule.default_priority
                    WHEN 'critical' THEN 'urgent'
                    ELSE v_schedule.default_priority
                END,
                v_schedule.next_due_date,
                v_schedule.next_due_date + COALESCE(
                    v_schedule.compliance_window_days,
                    public.pm_calculate_compliance_window(
                        v_schedule.frequency_type,
                        COALESCE(v_schedule.frequency_interval, 1)
                    )
                ),
                v_assignee_id,
                v_schedule.default_team_id,
                v_schedule.primary_asset_id,
                NOW(),
                NOW()
            )
            RETURNING id INTO v_wo_id;

            INSERT INTO public.work_order_assets (work_order_id, asset_id, sort_order)
            SELECT v_wo_id, asset_id, sort_order
              FROM public.pm_schedule_assets
             WHERE schedule_id = v_schedule.id
            ON CONFLICT (work_order_id, asset_id) DO NOTHING;

            INSERT INTO public.work_order_assets (work_order_id, asset_id, sort_order)
            SELECT v_wo_id, v_schedule.primary_asset_id, 0
             WHERE v_schedule.primary_asset_id IS NOT NULL
               AND NOT EXISTS (
                   SELECT 1
                     FROM public.pm_schedule_assets
                    WHERE schedule_id = v_schedule.id
               )
            ON CONFLICT (work_order_id, asset_id) DO NOTHING;

            FOR v_asset IN
                SELECT asset_id, sort_order
                  FROM public.pm_schedule_assets
                 WHERE schedule_id = v_schedule.id

                UNION ALL

                SELECT v_schedule.primary_asset_id AS asset_id, 0 AS sort_order
                 WHERE v_schedule.primary_asset_id IS NOT NULL
                   AND NOT EXISTS (
                       SELECT 1
                         FROM public.pm_schedule_assets
                        WHERE schedule_id = v_schedule.id
                   )
                 ORDER BY sort_order
            LOOP
                FOR v_item IN
                    SELECT *
                      FROM public.job_plan_items
                     WHERE job_plan_id = v_schedule.job_plan_id
                     ORDER BY sort_order, id
                LOOP
                    CONTINUE WHEN v_item.item_type = 'header';

                    INSERT INTO public.work_order_checks (
                        work_order_id,
                        asset_id,
                        job_plan_item_id,
                        item_snapshot,
                        sort_order,
                        status
                    )
                    VALUES (
                        v_wo_id,
                        v_asset.asset_id,
                        v_item.id,
                        jsonb_build_object(
                            'label',         v_item.label,
                            'label_ar',      v_item.label_ar,
                            'description',   v_item.description,
                            'description_ar',v_item.description_ar,
                            'item_type',     v_item.item_type,
                            'is_required',   v_item.is_required,
                            'is_critical',   v_item.is_critical,
                            'unit',          v_item.unit,
                            'min_value',     v_item.min_value,
                            'max_value',     v_item.max_value,
                            'warning_min',   v_item.warning_min,
                            'warning_max',   v_item.warning_max,
                            'options',       v_item.options,
                            'help_text',     v_item.help_text,
                            'help_text_ar',  v_item.help_text_ar
                        ),
                        v_item.sort_order,
                        'pending'
                    );
                END LOOP;
            END LOOP;

            -- Audit: one operation_log for the batch WO.
            PERFORM public.create_operation_log(
                v_schedule.tenant_id,
                v_wo_id,
                'pm_generate',
                'PM work order generated from schedule ' ||
                    COALESCE(v_schedule.code, v_schedule.id::TEXT),
                v_caller_id
            );

            v_generated_count    := v_generated_count + 1;
            v_schedule_generated := v_schedule_generated + 1;
        END IF;

        -- Advance schedule after successful generation.
        IF v_schedule_generated > 0 THEN
            v_next_due := public.pm_calculate_next_due(
                v_schedule.next_due_date,
                v_schedule.frequency_type,
                COALESCE(v_schedule.frequency_interval, 1)
            );

            UPDATE public.pm_schedules
               SET next_due_date       = v_next_due,
                   last_generated_date = v_schedule.next_due_date,
                   total_generated     = COALESCE(total_generated, 0) + v_schedule_generated,
                   updated_at          = NOW()
             WHERE id = v_schedule.id;

            v_schedules_advanced := v_schedules_advanced + 1;
        END IF;
    END LOOP;

    -- -------------------------------------------------------------------------
    -- 3. Insert pm_generation_runs record (same transaction as WO INSERTs).
    --    If the function rolls back, this row also rolls back — intentional.
    -- -------------------------------------------------------------------------
    INSERT INTO public.pm_generation_runs (
        run_id,
        tenant_id,
        requested_by,
        requested_by_role,
        run_scope,
        generated_count,
        skipped_count,
        status,
        started_at,
        completed_at,
        metadata
    ) VALUES (
        v_run_id,
        CASE WHEN NOT v_run_all_tenants THEN v_profile_tenant_id ELSE NULL END,
        v_caller_id,
        COALESCE(v_profile_role, 'service_role'),
        CASE WHEN v_run_all_tenants THEN 'all_tenants' ELSE 'tenant' END,
        v_generated_count,
        v_skipped_no_assets + v_skipped_inactive_tenant,
        'completed',
        v_started_at,
        NOW(),
        jsonb_build_object(
            'schedules_scanned',         v_schedules_scanned,
            'schedules_advanced',        v_schedules_advanced,
            'existing_cycles_advanced',  v_existing_cycles,
            'skipped_no_assets',         v_skipped_no_assets,
            'skipped_inactive_tenants',  v_skipped_inactive_tenant
        )
    );

    -- -------------------------------------------------------------------------
    -- 4. Return — shape is a superset of the migration 112 shape (additive only).
    -- -------------------------------------------------------------------------
    RETURN jsonb_build_object(
        'success',                  TRUE,
        'generated',                v_generated_count,
        'schedules_scanned',        v_schedules_scanned,
        'schedules_advanced',       v_schedules_advanced,
        'existing_cycles_advanced', v_existing_cycles,
        'skipped_no_assets',        v_skipped_no_assets,
        'scope',                    CASE WHEN v_run_all_tenants THEN 'all_tenants' ELSE 'tenant' END,
        'run_at',                   NOW(),
        'run_id',                   v_run_id
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pm_populate_task_checks(p_task_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF NOT public.pm_can_execute_task(p_task_id) THEN
        RAISE EXCEPTION 'Unauthorized to populate checklist rows for this task';
    END IF;

    PERFORM public.pm_populate_task_checks_internal(p_task_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pm_populate_task_checks_internal(p_task_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_template_id UUID;
BEGIN
    SELECT mt.checklist_template_id
      INTO v_template_id
      FROM public.maintenance_tasks mt
     WHERE mt.id = p_task_id;

    IF NOT FOUND OR v_template_id IS NULL THEN
        RETURN;
    END IF;

    INSERT INTO public.maintenance_task_checks (
        task_id,
        template_item_id,
        sort_order,
        status
    )
    SELECT
        p_task_id,
        cti.id,
        cti.sort_order,
        'pending'
      FROM public.checklist_template_items cti
     WHERE cti.template_id = v_template_id
    ON CONFLICT (task_id, template_item_id) DO NOTHING;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pm_record_pdf_export(p_task_id uuid, p_file_name text, p_file_url text DEFAULT NULL::text, p_rendered_snapshot jsonb DEFAULT '{}'::jsonb, p_results_snapshot jsonb DEFAULT '{}'::jsonb, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_task public.maintenance_tasks%ROWTYPE;
    v_export_id UUID;
    v_export_number INTEGER;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT *
      INTO v_task
      FROM public.maintenance_tasks
     WHERE id = p_task_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Maintenance task not found';
    END IF;

    IF NOT public.pm_can_view_task(p_task_id) THEN
        RAISE EXCEPTION 'Unauthorized to export this maintenance task';
    END IF;

    SELECT COALESCE(MAX(export_number), 0) + 1
      INTO v_export_number
      FROM public.pm_pdf_exports
     WHERE task_id = p_task_id;

    INSERT INTO public.pm_pdf_exports (
        tenant_id,
        task_id,
        export_number,
        file_name,
        file_url,
        rendered_snapshot,
        results_snapshot,
        metadata,
        generated_by
    )
    VALUES (
        v_task.tenant_id,
        p_task_id,
        v_export_number,
        p_file_name,
        p_file_url,
        COALESCE(p_rendered_snapshot, '{}'::jsonb),
        COALESCE(p_results_snapshot, '{}'::jsonb),
        COALESCE(p_metadata, '{}'::jsonb),
        auth.uid()
    )
    RETURNING id INTO v_export_id;

    UPDATE public.maintenance_tasks
       SET latest_pdf_export_id = v_export_id,
           latest_pdf_url = p_file_url,
           latest_pdf_exported_at = NOW(),
           pdf_export_count = COALESCE(pdf_export_count, 0) + 1,
           updated_at = NOW()
     WHERE id = p_task_id;

    PERFORM public.pm_write_audit_log(
        p_action      => 'Exported preventive maintenance PDF',
        p_action_type => 'export',
        p_target_type => 'maintenance_task',
        p_target_id   => p_task_id,
        p_metadata    => jsonb_build_object(
            'task_id', p_task_id,
            'export_id', v_export_id,
            'export_number', v_export_number,
            'file_name', p_file_name
        ),
        p_new_values  => jsonb_build_object(
            'latest_pdf_export_id', v_export_id,
            'pdf_export_count', COALESCE(v_task.pdf_export_count, 0) + 1
        )
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'task_id', p_task_id,
        'export_id', v_export_id,
        'export_number', v_export_number,
        'file_name', p_file_name,
        'file_url', p_file_url
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pm_review_task(p_task_id uuid, p_review_status character varying, p_review_notes text DEFAULT NULL::text, p_reviewer_signature_url text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_task public.maintenance_tasks%ROWTYPE;
    v_reviewed_at TIMESTAMPTZ := NOW();
    v_execution_status VARCHAR(20);
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF p_review_status NOT IN ('approved', 'needs_rework') THEN
        RAISE EXCEPTION 'Invalid review status';
    END IF;

    SELECT *
      INTO v_task
      FROM public.maintenance_tasks
     WHERE id = p_task_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Maintenance task not found';
    END IF;

    IF NOT public.pm_can_manage_tenant(v_task.tenant_id) THEN
        RAISE EXCEPTION 'Unauthorized to review this maintenance task';
    END IF;

    IF v_task.status <> 'completed' THEN
        RAISE EXCEPTION 'Only completed maintenance tasks can be reviewed';
    END IF;

    v_execution_status := CASE
        WHEN p_review_status = 'approved' THEN 'approved'
        ELSE 'needs_rework'
    END;

    UPDATE public.maintenance_tasks
       SET status = CASE
               WHEN p_review_status = 'needs_rework' THEN 'in_progress'
               ELSE status
           END,
           completed_at = CASE
               WHEN p_review_status = 'needs_rework' THEN NULL
               ELSE completed_at
           END,
           execution_completed_at = CASE
               WHEN p_review_status = 'needs_rework' THEN NULL
               ELSE execution_completed_at
           END,
           review_status = p_review_status,
           reviewed_by = auth.uid(),
           reviewed_at = v_reviewed_at,
           review_notes = p_review_notes,
           reviewer_signature_url = COALESCE(p_reviewer_signature_url, reviewer_signature_url),
           execution_status = v_execution_status,
           updated_at = NOW()
     WHERE id = p_task_id;

    IF p_review_status = 'needs_rework' THEN
        PERFORM public.pm_update_plan_stats(v_task.maintenance_plan_id);
    END IF;

    PERFORM public.pm_write_audit_log(
        p_action      => 'Reviewed preventive maintenance execution sheet',
        p_action_type => 'update',
        p_target_type => 'maintenance_task',
        p_target_id   => p_task_id,
        p_metadata    => jsonb_build_object(
            'task_id', p_task_id,
            'review_status', p_review_status,
            'reviewed_at', v_reviewed_at,
            'review_notes', p_review_notes
        ),
        p_new_values  => jsonb_build_object(
            'status', CASE WHEN p_review_status = 'needs_rework' THEN 'in_progress' ELSE v_task.status END,
            'review_status', p_review_status,
            'execution_status', v_execution_status,
            'reviewed_at', v_reviewed_at
        )
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'task_id', p_task_id,
        'status', CASE WHEN p_review_status = 'needs_rework' THEN 'in_progress' ELSE v_task.status END,
        'review_status', p_review_status,
        'execution_status', v_execution_status,
        'reviewed_at', v_reviewed_at
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pm_start_task(p_task_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_task public.maintenance_tasks%ROWTYPE;
    v_started_at TIMESTAMPTZ := NOW();
    v_reference TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT *
      INTO v_task
      FROM public.maintenance_tasks
     WHERE id = p_task_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Maintenance task not found';
    END IF;

    IF v_task.status <> 'pending' THEN
        RAISE EXCEPTION 'Only pending maintenance tasks can be started';
    END IF;

    IF NOT public.pm_can_execute_task(p_task_id) THEN
        RAISE EXCEPTION 'Unauthorized to start this maintenance task';
    END IF;

    v_reference := COALESCE(v_task.execution_reference, 'PM-' || UPPER(REPLACE(p_task_id::text, '-', '')));

    UPDATE public.maintenance_tasks
       SET status = 'in_progress',
           started_at = COALESCE(started_at, v_started_at),
           execution_reference = v_reference,
           execution_status = 'in_progress',
           execution_started_by = COALESCE(execution_started_by, auth.uid()),
           execution_snapshot = COALESCE(execution_snapshot, public.pm_build_task_execution_snapshot(p_task_id, TRUE)),
           updated_at = NOW()
     WHERE id = p_task_id;

    PERFORM public.pm_populate_task_checks_internal(p_task_id);

    PERFORM public.pm_write_audit_log(
        p_action      => 'Started preventive maintenance execution sheet',
        p_action_type => 'update',
        p_target_type => 'maintenance_task',
        p_target_id   => p_task_id,
        p_metadata    => jsonb_build_object(
            'task_id', p_task_id,
            'status', 'in_progress',
            'execution_status', 'in_progress',
            'started_at', v_started_at,
            'execution_reference', v_reference,
            'frequency_bundle_id', v_task.frequency_bundle_id,
            'assigned_team_id', v_task.assigned_team_id
        ),
        p_new_values  => jsonb_build_object(
            'status', 'in_progress',
            'execution_status', 'in_progress',
            'started_at', v_started_at
        )
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'task_id', p_task_id,
        'status', 'in_progress',
        'execution_status', 'in_progress',
        'started_at', v_started_at,
        'execution_reference', v_reference
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pm_sync_execution_status()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Only intervene when status changed but execution_status was not touched
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.execution_status IS NOT DISTINCT FROM OLD.execution_status THEN
        CASE NEW.status
            WHEN 'cancelled' THEN NEW.execution_status := 'cancelled';
            WHEN 'pending'   THEN NEW.execution_status := 'draft';
            ELSE NULL;
        END CASE;
    END IF;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pm_sync_task_from_work_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_task_id UUID;
    v_plan_id UUID;
BEGIN
    -- Only act when status actually changed
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    SELECT mt.id, mt.maintenance_plan_id
      INTO v_task_id, v_plan_id
      FROM public.maintenance_tasks mt
     WHERE mt.related_work_order_id = NEW.id
       AND mt.status NOT IN ('completed', 'cancelled')
     LIMIT 1;

    IF v_task_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.status = 'completed' THEN
        UPDATE public.maintenance_tasks
           SET status                  = 'completed',
               execution_status        = 'completed',
               completed_at            = NOW(),
               execution_completed_at  = NOW(),
               actual_duration_minutes = GREATEST(0,
                   FLOOR(
                       EXTRACT(EPOCH FROM (NOW() - COALESCE(started_at, created_at))) / 60.0
                   )::INTEGER
               )
         WHERE id = v_task_id
           AND status = 'in_progress';

        PERFORM public.pm_update_plan_stats(v_plan_id);

    ELSIF NEW.status = 'in_progress' THEN
        UPDATE public.maintenance_tasks
           SET status           = 'in_progress',
               execution_status = 'in_progress',
               started_at       = COALESCE(started_at, NOW())
         WHERE id = v_task_id
           AND status = 'pending';
    END IF;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pm_update_plan_stats(p_plan_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_total_tasks INTEGER := 0;
    v_completed_tasks INTEGER := 0;
    v_completion_rate DECIMAL(5, 2) := 0;
BEGIN
    IF p_plan_id IS NULL THEN
        RETURN;
    END IF;

    SELECT COUNT(*),
           COUNT(*) FILTER (WHERE status = 'completed')
      INTO v_total_tasks, v_completed_tasks
      FROM public.maintenance_tasks
     WHERE maintenance_plan_id = p_plan_id;

    IF v_total_tasks > 0 THEN
        v_completion_rate := ROUND((v_completed_tasks::NUMERIC * 100.0) / v_total_tasks, 2);
    END IF;

    UPDATE public.maintenance_plans
       SET total_tasks = v_total_tasks,
           completed_tasks = v_completed_tasks,
           completion_rate = v_completion_rate
     WHERE id = p_plan_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pm_update_plan_status(p_plan_id uuid, p_new_status character varying, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_plan public.maintenance_plans%ROWTYPE;
    v_new_status VARCHAR(20) := LOWER(TRIM(COALESCE(p_new_status, '')));
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT *
      INTO v_plan
      FROM public.maintenance_plans
     WHERE id = p_plan_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Maintenance plan not found';
    END IF;

    IF NOT public.pm_can_manage_tenant(v_plan.tenant_id) THEN
        RAISE EXCEPTION 'Unauthorized to manage this maintenance plan';
    END IF;

    IF v_new_status NOT IN ('draft', 'active', 'paused', 'completed', 'archived') THEN
        RAISE EXCEPTION 'Invalid maintenance plan status: %', p_new_status;
    END IF;

    IF v_plan.status = v_new_status THEN
        RAISE EXCEPTION 'Maintenance plan is already in status %', v_new_status;
    END IF;

    IF v_plan.status = 'archived' THEN
        RAISE EXCEPTION 'Archived maintenance plans cannot change status';
    END IF;

    IF v_new_status = 'archived' THEN
        NULL;
    ELSIF NOT (
        (v_plan.status = 'draft' AND v_new_status = 'active')
        OR (v_plan.status = 'active' AND v_new_status IN ('paused', 'completed'))
        OR (v_plan.status = 'paused' AND v_new_status = 'active')
    ) THEN
        RAISE EXCEPTION 'Invalid maintenance plan status transition: % -> %', v_plan.status, v_new_status;
    END IF;

    UPDATE public.maintenance_plans
       SET status = v_new_status
     WHERE id = p_plan_id;

    PERFORM public.pm_write_audit_log(
        p_action      => 'Updated preventive maintenance plan status',
        p_action_type => 'update',
        p_target_type => 'maintenance_plan',
        p_target_id   => p_plan_id,
        p_metadata    => jsonb_build_object(
            'plan_id', p_plan_id,
            'old_status', v_plan.status,
            'new_status', v_new_status,
            'note', p_note
        ),
        p_new_values  => jsonb_build_object(
            'status', v_new_status
        )
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'plan_id', p_plan_id,
        'status', v_new_status
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pm_update_template_totals(p_template_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF p_template_id IS NULL THEN
        RETURN;
    END IF;

    UPDATE public.checklist_templates
       SET total_items = (
           SELECT COUNT(*)
             FROM public.checklist_template_items cti
            WHERE cti.template_id = p_template_id
       )
     WHERE id = p_template_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.pm_write_audit_log(p_action text, p_action_type text, p_target_type text, p_target_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT '{}'::jsonb, p_new_values jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_target_id_type TEXT;
BEGIN
    SELECT c.data_type
      INTO v_target_id_type
      FROM information_schema.columns c
     WHERE c.table_schema = 'public'
       AND c.table_name = 'platform_audit_logs'
       AND c.column_name = 'target_id'
     LIMIT 1;

    IF v_target_id_type IS NULL THEN
        RETURN;
    END IF;

    IF v_target_id_type = 'uuid' THEN
        INSERT INTO public.platform_audit_logs (
            user_id,
            action,
            action_type,
            target_type,
            target_id,
            new_values,
            metadata
        )
        VALUES (
            auth.uid(),
            p_action,
            p_action_type,
            p_target_type,
            p_target_id,
            p_new_values,
            COALESCE(p_metadata, '{}'::jsonb)
        );
    ELSE
        INSERT INTO public.platform_audit_logs (
            user_id,
            action,
            action_type,
            target_type,
            target_id,
            new_values,
            metadata
        )
        VALUES (
            auth.uid(),
            p_action,
            p_action_type,
            p_target_type,
            p_target_id::TEXT,
            p_new_values,
            COALESCE(p_metadata, '{}'::jsonb)
        );
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RETURN;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.populate_platform_audit_log_actor()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_actor public.profiles%ROWTYPE;
    v_actor_id UUID := auth.uid();
BEGIN
    IF v_actor_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT *
      INTO v_actor
      FROM public.profiles
     WHERE id = v_actor_id;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    NEW.user_id := v_actor.id;
    NEW.user_email := v_actor.email;
    NEW.user_name := COALESCE(v_actor.full_name, v_actor.email);
    NEW.user_role := v_actor.role;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.provision_tenant(p_name text, p_name_ar text DEFAULT NULL::text, p_slug text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_address text DEFAULT NULL::text, p_cr_number text DEFAULT NULL::text, p_tax_number text DEFAULT NULL::text, p_country text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_postal_code text DEFAULT NULL::text, p_website text DEFAULT NULL::text, p_timezone text DEFAULT 'Asia/Riyadh'::text, p_plan_code text DEFAULT NULL::text, p_trial_days integer DEFAULT NULL::integer, p_assign_caller_as_admin boolean DEFAULT false, p_caller_full_name text DEFAULT NULL::text, p_caller_phone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
    v_user_id    uuid    := auth.uid();
    v_tenant_id  uuid;
    v_plan_id    uuid;
    v_plan_code  text;
    v_trial_days integer;
    v_slug       text;
    v_base_slug  text;
    v_count      integer;
BEGIN
    IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

    -- Resolve plan: default → by code → cheapest active
    SELECT id, code, COALESCE(trial_days, 14)
      INTO v_plan_id, v_plan_code, v_trial_days
      FROM public.subscription_plans
     WHERE is_default = true AND is_active = true LIMIT 1;

    IF v_plan_id IS NULL AND p_plan_code IS NOT NULL THEN
        SELECT id, code, COALESCE(trial_days, 14)
          INTO v_plan_id, v_plan_code, v_trial_days
          FROM public.subscription_plans
         WHERE code = p_plan_code AND is_active = true LIMIT 1;
    END IF;

    IF v_plan_id IS NULL THEN
        SELECT id, code, COALESCE(trial_days, 14)
          INTO v_plan_id, v_plan_code, v_trial_days
          FROM public.subscription_plans
         WHERE is_active = true ORDER BY price_monthly ASC LIMIT 1;
    END IF;

    IF v_plan_id IS NULL THEN
        RAISE EXCEPTION 'No active subscription plan found. Cannot create tenant without a plan.';
    END IF;

    IF p_trial_days IS NOT NULL THEN v_trial_days := p_trial_days; END IF;

    -- Slug generation
    v_base_slug := CASE
        WHEN p_slug IS NOT NULL AND length(trim(p_slug)) >= 3
        THEN lower(regexp_replace(trim(p_slug), '[^a-z0-9\-]', '', 'g'))
        ELSE lower(regexp_replace(coalesce(p_name, 'tenant'), '[^a-zA-Z0-9]', '', 'g'))
    END;

    IF v_base_slug IS NULL OR length(v_base_slug) < 3 THEN
        v_base_slug := 'tenant' || floor(random() * 10000)::text;
    END IF;

    v_slug := v_base_slug;
    LOOP
        SELECT count(*) INTO v_count FROM public.tenants WHERE slug = v_slug;
        EXIT WHEN v_count = 0;
        v_slug := v_base_slug || floor(random() * 10000)::text;
    END LOOP;

    -- Create tenant (subscription_* columns will be set by the sync trigger)
    INSERT INTO public.tenants (
        name, name_ar, slug, plan_id,
        cr_number, tax_number, address, country, city, postal_code,
        email, phone, website, timezone,
        created_at, updated_at
    ) VALUES (
        p_name, p_name_ar, v_slug, v_plan_id,
        p_cr_number, p_tax_number, p_address, p_country, p_city, p_postal_code,
        p_email, p_phone, p_website, p_timezone,
        now(), now()
    )
    RETURNING id INTO v_tenant_id;

    -- Bypass profile guard for the upcoming UPDATE
    IF p_assign_caller_as_admin THEN
        PERFORM set_config('app.bypass_profile_guard', '1', true);
    END IF;

    -- Insert trial subscription directly (SECURITY DEFINER — no role check needed)
    -- The AFTER INSERT trigger on tenant_subscriptions will sync tenants table.
    INSERT INTO public.tenant_subscriptions (
        tenant_id, plan_id, status, billing_cycle,
        trial_ends_at, current_period_start, current_period_end,
        amount, activated_by, updated_at
    ) VALUES (
        v_tenant_id, v_plan_id, 'trial', 'monthly',
        now() + (v_trial_days || ' days')::interval,
        now(),
        now() + (v_trial_days || ' days')::interval,
        0, 'admin', now()
    )
    ON CONFLICT (tenant_id) DO NOTHING;

    -- Optionally assign caller as tenant_admin
    IF p_assign_caller_as_admin THEN
        UPDATE public.profiles SET
            tenant_id    = v_tenant_id,
            full_name    = coalesce(p_caller_full_name, full_name),
            full_name_ar = coalesce(p_caller_full_name, full_name_ar),
            phone        = coalesce(p_caller_phone, phone),
            role         = 'tenant_admin',
            is_active    = true,
            updated_at   = now()
        WHERE id = v_user_id;

        UPDATE auth.users SET email_confirmed_at = now()
         WHERE id = v_user_id AND email_confirmed_at IS NULL;
    END IF;

    RETURN jsonb_build_object(
        'tenant_id',  v_tenant_id,
        'slug',       v_slug,
        'plan_id',    v_plan_id,
        'plan_code',  v_plan_code,
        'trial_days', v_trial_days,
        'success',    true
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.register_new_tenant(p_name_ar text, p_name_en text, p_email text, p_address text, p_cr_number text, p_tax_number text, p_first_name text, p_last_name text, p_phone text DEFAULT NULL::text, p_country text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_postal_code text DEFAULT NULL::text, p_website text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Delegate to unified function; plan_code and trial_days are NULL
    -- so provision_tenant will use the DB default (is_default = true)
    RETURN provision_tenant(
        p_name                   := p_name_en,
        p_name_ar                := p_name_ar,
        p_email                  := coalesce(p_email, ''),
        p_phone                  := p_phone,
        p_address                := p_address,
        p_cr_number              := p_cr_number,
        p_tax_number             := p_tax_number,
        p_country                := p_country,
        p_city                   := p_city,
        p_postal_code            := p_postal_code,
        p_website                := p_website,
        p_plan_code              := NULL,   -- let DB decide via is_default
        p_trial_days             := NULL,   -- let plan's trial_days decide
        p_assign_caller_as_admin := TRUE,
        p_caller_full_name       := p_first_name || ' ' || p_last_name,
        p_caller_phone           := p_phone
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.register_tenant(p_name_ar text, p_name_en text, p_email text, p_address text, p_cr_number text, p_tax_number text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_user_id UUID;
    v_tenant_id UUID;
    v_plan_id UUID;
BEGIN
    -- Get current user ID
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Check if user already belongs to a tenant (prevent double creation if needed, or allow multiple)
    -- For now, let's assume one tenant per user for signup flow
    
    -- 1. Get a default subscription plan (e.g., Trial or Basic)
    SELECT id INTO v_plan_id FROM subscription_plans WHERE is_active = true ORDER BY price_monthly ASC LIMIT 1;

    -- 2. Create Tenant
    INSERT INTO tenants (
        name, 
        name_ar, 
        status, 
        subscription_plan_id, 
        subscription_status,
        cr_number,
        tax_number,
        address,
        email
    ) VALUES (
        p_name_en,
        p_name_ar,
        'active',
        v_plan_id,
        'trial',
        p_cr_number,
        p_tax_number,
        p_address,
        p_email
    ) RETURNING id INTO v_tenant_id;

    -- 3. Update User Profile to link to Tenant and make result Owner
    UPDATE profiles 
    SET 
        tenant_id = v_tenant_id,
        role = 'tenant_owner',
        status = 'active'
    WHERE id = v_user_id;

    RETURN jsonb_build_object(
        'tenant_id', v_tenant_id,
        'success', true
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.reject_work_order(p_work_order_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_actor_id               UUID    := auth.uid();
    v_actor_role             TEXT;
    v_actor_tenant           UUID;
    v_is_super               BOOLEAN := FALSE;
    v_tenant_id              UUID;
    v_old_status             TEXT;
    v_assigned_to            UUID;
    v_reported_by            UUID;
    v_is_platform_override   BOOLEAN := FALSE;
    v_is_management_override BOOLEAN := FALSE;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF COALESCE(BTRIM(p_reason), '') = '' THEN
        RAISE EXCEPTION 'Rejection reason is required';
    END IF;

    SELECT role, tenant_id, COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_is_super
      FROM public.profiles
     WHERE id = v_actor_id;

    IF v_actor_role IS NULL AND NOT v_is_super THEN
        RAISE EXCEPTION 'Caller profile not found';
    END IF;

    SELECT tenant_id, status, assigned_to, reported_by
      INTO v_tenant_id, v_old_status, v_assigned_to, v_reported_by
      FROM public.work_orders
     WHERE id = p_work_order_id;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Work order not found';
    END IF;

    v_is_platform_override   := v_is_super OR v_actor_role IN ('platform_owner', 'platform_admin');
    v_is_management_override := v_is_platform_override OR v_actor_role IN ('tenant_admin', 'maintenance_manager');

    IF NOT v_is_platform_override AND v_actor_tenant IS DISTINCT FROM v_tenant_id THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant';
    END IF;

    -- Authorize the trigger guard before any branch UPDATE.
    -- The flag covers all UPDATE statements in this transaction.
    PERFORM set_config('app.work_order_workflow_authorized', 'true', TRUE);

    CASE v_old_status
        WHEN 'assigned' THEN
            IF v_actor_role NOT IN (
                'tenant_admin', 'maintenance_manager', 'engineer', 'technician',
                'platform_owner', 'platform_admin'
            ) AND NOT v_is_super THEN
                RAISE EXCEPTION 'Unauthorized: only assigned technicians, engineers, or managers can reject this assignment';
            END IF;
            IF NOT v_is_management_override AND v_assigned_to IS DISTINCT FROM v_actor_id THEN
                RAISE EXCEPTION 'Only the assigned technician can reject this assignment';
            END IF;
            UPDATE public.work_orders
               SET status      = 'pending',
                   assigned_to = NULL,
                   start_time  = NULL,
                   updated_at  = NOW()
             WHERE id = p_work_order_id;

        WHEN 'pending_supervisor_approval' THEN
            IF v_actor_role NOT IN (
                'tenant_admin', 'maintenance_manager', 'supervisor',
                'platform_owner', 'platform_admin'
            ) AND NOT v_is_super THEN
                RAISE EXCEPTION 'Unauthorized: only supervisors or managers can reject at this stage';
            END IF;
            UPDATE public.work_orders
               SET status = 'in_progress', updated_at = NOW()
             WHERE id = p_work_order_id;

        WHEN 'pending_engineer_review' THEN
            IF v_actor_role NOT IN (
                'tenant_admin', 'maintenance_manager', 'engineer',
                'platform_owner', 'platform_admin'
            ) AND NOT v_is_super THEN
                RAISE EXCEPTION 'Unauthorized: only engineers or managers can reject at this stage';
            END IF;
            UPDATE public.work_orders
               SET status = 'in_progress', updated_at = NOW()
             WHERE id = p_work_order_id;

        WHEN 'pending_reporter_closure' THEN
            IF NOT v_is_management_override AND v_reported_by IS DISTINCT FROM v_actor_id THEN
                RAISE EXCEPTION 'Only the original reporter can reject closure for this work order';
            END IF;
            UPDATE public.work_orders
               SET status = 'in_progress', updated_at = NOW()
             WHERE id = p_work_order_id;

        ELSE
            RAISE EXCEPTION 'Cannot reject work order in status: %', v_old_status;
    END CASE;

    PERFORM public.create_operation_log(
        v_tenant_id, p_work_order_id, 'maintenance',
        'Workflow rejected/returned. Reason: ' || p_reason, v_actor_id
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.restricted_enabled_modules_json()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
SELECT jsonb_build_object(
    'dashboard', jsonb_build_object('enabled', true, 'features', jsonb_build_object('quick_stats', true, 'charts', true, 'recent_activity', true)),
    'facilities', jsonb_build_object('enabled', false, 'features', jsonb_build_object('buildings', false, 'floors', false, 'departments', false, 'rooms', false)),
    'assets', jsonb_build_object('enabled', false, 'features', jsonb_build_object('asset_tracking', false, 'qr_codes', false, 'asset_history', false, 'warranty_tracking', false)),
    'work_orders', jsonb_build_object('enabled', false, 'features', jsonb_build_object('create_wo', false, 'workflow', false, 'assignment', false, 'parts_tracking', false)),
    'maintenance', jsonb_build_object('enabled', false, 'features', jsonb_build_object('maintenance_plans', false, 'schedules', false, 'auto_generation', false)),
    'inventory', jsonb_build_object('enabled', false, 'features', jsonb_build_object('stock_tracking', false, 'low_stock_alerts', false, 'consumption_reports', false)),
    'employees', jsonb_build_object('enabled', true, 'features', jsonb_build_object('user_management', true, 'role_assignment', true)),
    'work_teams', jsonb_build_object('enabled', false, 'features', jsonb_build_object('team_creation', false, 'member_assignment', false)),
    'reports', jsonb_build_object('enabled', false, 'features', jsonb_build_object('operational_reports', false, 'export', false)),
    'public_portal', jsonb_build_object('enabled', false, 'features', jsonb_build_object('public_submission', false, 'qr_portal', false))
);
$function$
;

CREATE OR REPLACE FUNCTION public.secure_get_my_tenant_id()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    RETURN (
        SELECT p.tenant_id
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND public.tenant_has_operational_access(p.tenant_id)
        LIMIT 1
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.send_email_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_email TEXT;
    v_resend_body JSONB;
    v_function_url TEXT := public.get_runtime_secret('app.resend_email_url');
    v_shared_secret TEXT := public.get_runtime_secret('app.resend_email_secret');
    v_headers JSONB := jsonb_build_object(
        'Content-Type', 'application/json'
    );
BEGIN
    SELECT email INTO v_user_email
    FROM auth.users
    WHERE id = NEW.user_id;

    IF v_user_email IS NULL THEN
        RETURN NEW;
    END IF;

    v_resend_body := jsonb_build_object(
        'to', v_user_email,
        'type', 'notification',
        'title', NEW.title,
        'message', NEW.message,
        'link', NEW.link
    );

    IF v_function_url IS NULL THEN
        RAISE NOTICE 'Runtime secret app.resend_email_url is not configured; skipping notification email for notification %', NEW.id;
        RETURN NEW;
    END IF;

    IF v_shared_secret IS NULL THEN
        RAISE NOTICE 'Runtime secret app.resend_email_secret is not configured; skipping notification email for notification %', NEW.id;
        RETURN NEW;
    END IF;

    v_headers := v_headers || jsonb_build_object(
        'x-internal-email-secret', v_shared_secret
    );

    PERFORM net.http_post(
        url := v_function_url,
        headers := v_headers,
        body := v_resend_body
    );

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$
;

CREATE OR REPLACE FUNCTION public.start_work_order(p_work_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_actor_id               UUID    := auth.uid();
    v_actor_role             TEXT;
    v_actor_tenant           UUID;
    v_actor_active           BOOLEAN := FALSE;
    v_is_super               BOOLEAN := FALSE;
    v_tenant_id              UUID;
    v_old_status             TEXT;
    v_assigned_to            UUID;
    v_assigned_team          UUID;
    v_is_platform_override   BOOLEAN := FALSE;
    v_is_management_override BOOLEAN := FALSE;
    v_is_team_member         BOOLEAN := FALSE;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
    END IF;

    SELECT role, tenant_id, COALESCE(is_active, TRUE), COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_actor_active, v_is_super
      FROM public.profiles
     WHERE id = v_actor_id;

    IF v_actor_role IS NULL AND NOT v_is_super THEN
        RAISE EXCEPTION 'Caller profile not found' USING ERRCODE = '28000';
    END IF;

    IF NOT COALESCE(v_actor_active, FALSE) THEN
        RAISE EXCEPTION 'Inactive users cannot start work orders' USING ERRCODE = '28000';
    END IF;

    SELECT tenant_id, status, assigned_to, assigned_team
      INTO v_tenant_id, v_old_status, v_assigned_to, v_assigned_team
      FROM public.work_orders
     WHERE id = p_work_order_id
     FOR UPDATE;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Work order not found' USING ERRCODE = 'P0002';
    END IF;

    v_is_platform_override := v_is_super OR v_actor_role IN ('platform_owner', 'platform_admin');
    v_is_management_override := v_is_platform_override OR v_actor_role IN (
        'tenant_admin',
        'maintenance_manager',
        'engineer'
    );

    IF NOT v_is_platform_override AND v_actor_tenant IS DISTINCT FROM v_tenant_id THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant'
            USING ERRCODE = '42501';
    END IF;

    IF v_actor_role NOT IN (
        'tenant_admin', 'maintenance_manager', 'engineer', 'technician',
        'platform_owner', 'platform_admin'
    ) AND NOT v_is_super THEN
        RAISE EXCEPTION 'Unauthorized: you are not allowed to start this work order'
            USING ERRCODE = '42501';
    END IF;

    IF v_old_status NOT IN ('pending', 'assigned') THEN
        RAISE EXCEPTION 'Cannot start work order in status: %', v_old_status
            USING ERRCODE = '22023';
    END IF;

    IF v_assigned_team IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1
              FROM public.team_members tm
             WHERE tm.team_id = v_assigned_team
               AND tm.user_id = v_actor_id
               AND COALESCE(tm.is_active, TRUE) = TRUE
        )
          INTO v_is_team_member;
    END IF;

    IF NOT v_is_management_override THEN
        IF v_assigned_to IS NOT NULL THEN
            IF v_assigned_to IS DISTINCT FROM v_actor_id THEN
                RAISE EXCEPTION 'Only the assigned technician can start this work order'
                    USING ERRCODE = '42501';
            END IF;
        ELSIF v_assigned_team IS NOT NULL THEN
            IF NOT v_is_team_member THEN
                RAISE EXCEPTION 'Only an active member of the assigned team can start this work order'
                    USING ERRCODE = '42501';
            END IF;
        ELSE
            RAISE EXCEPTION 'Work order is not assigned to you or one of your teams'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    PERFORM set_config('app.work_order_workflow_authorized', 'true', TRUE);

    UPDATE public.work_orders
       SET status      = 'in_progress',
           start_time  = NOW(),
           assigned_to = COALESCE(v_assigned_to, v_actor_id),
           updated_at  = NOW()
     WHERE id = p_work_order_id;

    PERFORM public.create_operation_log(
        v_tenant_id, p_work_order_id, 'maintenance', 'Work started', v_actor_id
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_intake_report(p_intake_report_id uuid, p_public_access_token text, p_title text, p_description text DEFAULT NULL::text, p_priority text DEFAULT 'medium'::text, p_building_id uuid DEFAULT NULL::uuid, p_floor_id uuid DEFAULT NULL::uuid, p_department_id uuid DEFAULT NULL::uuid, p_room_id uuid DEFAULT NULL::uuid, p_asset_id uuid DEFAULT NULL::uuid, p_issue_type_id uuid DEFAULT NULL::uuid, p_issue_type text DEFAULT NULL::text, p_reporter_name text DEFAULT NULL::text, p_reporter_phone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_report public.intake_reports%ROWTYPE;
  v_existing_draft public.work_order_drafts%ROWTYPE;
  v_draft_id UUID;
  v_title TEXT;
BEGIN
  IF p_intake_report_id IS NULL OR p_public_access_token IS NULL OR btrim(p_public_access_token) = '' THEN
    RAISE EXCEPTION 'Invalid intake report access' USING ERRCODE = '28000';
  END IF;

  SELECT *
    INTO v_report
  FROM public.intake_reports
  WHERE id = p_intake_report_id
    AND public_access_token = p_public_access_token
  FOR UPDATE;

  IF v_report.id IS NULL THEN
    RAISE EXCEPTION 'Invalid intake report access' USING ERRCODE = '28000';
  END IF;

  IF v_report.status IN ('converted_to_work_order', 'closed', 'cancelled') THEN
    RAISE EXCEPTION 'Intake report cannot be submitted from status %', v_report.status USING ERRCODE = '23514';
  END IF;

  IF p_priority NOT IN ('low', 'medium', 'high', 'urgent') THEN
    RAISE EXCEPTION 'Unsupported priority: %', p_priority USING ERRCODE = '22023';
  END IF;

  v_title := NULLIF(btrim(COALESCE(p_title, '')), '');
  IF v_title IS NULL THEN
    v_title := NULLIF(left(btrim(COALESCE(p_description, '')), 120), '');
  END IF;
  IF v_title IS NULL THEN
    RAISE EXCEPTION 'Draft title is required' USING ERRCODE = '23502';
  END IF;

  SELECT *
    INTO v_existing_draft
  FROM public.work_order_drafts
  WHERE intake_report_id = p_intake_report_id
  LIMIT 1;

  IF v_existing_draft.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'work_order_draft_id', v_existing_draft.id,
      'status', v_existing_draft.status,
      'already_exists', true
    );
  END IF;

  IF p_issue_type_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.issue_types it
    WHERE it.id = p_issue_type_id
      AND it.tenant_id = v_report.tenant_id
  ) THEN
    RAISE EXCEPTION 'Issue type does not belong to this tenant' USING ERRCODE = '42501';
  END IF;

  IF NOT public.work_order_asset_location_is_valid(
    v_report.tenant_id,
    p_building_id,
    p_floor_id,
    p_room_id,
    p_asset_id
  ) THEN
    RAISE EXCEPTION 'Asset/location combination is invalid for this tenant' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.work_order_drafts (
    tenant_id,
    intake_report_id,
    title,
    description,
    priority,
    issue_type_id,
    issue_type,
    building_id,
    floor_id,
    department_id,
    room_id,
    asset_id,
    reporter_name,
    reporter_phone,
    status,
    metadata
  )
  VALUES (
    v_report.tenant_id,
    p_intake_report_id,
    v_title,
    NULLIF(btrim(COALESCE(p_description, '')), ''),
    p_priority,
    p_issue_type_id,
    NULLIF(btrim(COALESCE(p_issue_type, '')), ''),
    p_building_id,
    p_floor_id,
    p_department_id,
    p_room_id,
    p_asset_id,
    COALESCE(NULLIF(btrim(p_reporter_name), ''), v_report.reporter_name),
    COALESCE(NULLIF(btrim(p_reporter_phone), ''), v_report.reporter_phone),
    'ready_for_review',
    jsonb_build_object('source', 'intake_report', 'report_number', v_report.report_number)
  )
  RETURNING id INTO v_draft_id;

  UPDATE public.intake_reports
  SET status = 'in_review',
      current_step = 'operations_review',
      reporter_name = COALESCE(NULLIF(btrim(p_reporter_name), ''), reporter_name),
      reporter_phone = COALESCE(NULLIF(btrim(p_reporter_phone), ''), reporter_phone),
      submitted_at = COALESCE(submitted_at, now()),
      updated_at = now()
  WHERE id = p_intake_report_id;

  INSERT INTO public.intake_messages (
    tenant_id,
    intake_report_id,
    direction,
    message_type,
    body,
    raw_payload
  )
  VALUES (
    v_report.tenant_id,
    p_intake_report_id,
    'inbound',
    'confirmation',
    p_description,
    jsonb_build_object('title', v_title, 'priority', p_priority, 'source', 'submit_intake_report')
  );

  INSERT INTO public.operational_events (
    tenant_id,
    entity_type,
    entity_id,
    event_type,
    actor_type,
    source,
    metadata
  )
  VALUES (
    v_report.tenant_id,
    'work_order_draft',
    v_draft_id,
    'work_order_draft_created',
    'reporter',
    'public_intake',
    jsonb_build_object('intake_report_id', p_intake_report_id, 'report_number', v_report.report_number)
  );

  INSERT INTO public.notification_logs (
    tenant_id,
    channel,
    template_key,
    status,
    related_entity_type,
    related_entity_id,
    payload
  )
  VALUES (
    v_report.tenant_id,
    'in_app',
    'intake_draft_ready_for_review',
    'queued',
    'work_order_draft',
    v_draft_id,
    jsonb_build_object('intake_report_id', p_intake_report_id, 'report_number', v_report.report_number)
  );

  RETURN jsonb_build_object(
    'work_order_draft_id', v_draft_id,
    'status', 'ready_for_review'
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_public_work_order(p_token text, p_reporter_name text, p_reporter_phone text, p_description text, p_building_id uuid, p_floor_id uuid DEFAULT NULL::uuid, p_asset_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_tenant_id UUID;
    v_new_id UUID;
    v_code TEXT;
BEGIN
    SELECT tenant_id
      INTO v_tenant_id
      FROM public.tenant_access_tokens
     WHERE token = p_token
       AND is_active = TRUE
       AND public.has_public_portal_access(tenant_id)
     LIMIT 1;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Invalid or expired token';
    END IF;

    IF p_building_id IS NOT NULL THEN
        PERFORM 1
          FROM public.buildings
         WHERE id = p_building_id
           AND tenant_id = v_tenant_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invalid building for this organization';
        END IF;
    END IF;

    IF p_floor_id IS NOT NULL THEN
        PERFORM 1
          FROM public.floors f
          JOIN public.buildings b ON f.building_id = b.id
         WHERE f.id = p_floor_id
           AND b.tenant_id = v_tenant_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invalid floor for this organization';
        END IF;
    END IF;

    IF p_asset_id IS NOT NULL THEN
        PERFORM 1
          FROM public.assets
         WHERE id = p_asset_id
           AND tenant_id = v_tenant_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invalid asset for this organization';
        END IF;
    END IF;

    v_code := 'PUB-' || to_char(NOW(), 'YYMMDD') || '-' || substring(uuid_generate_v4()::text from 1 for 4);

    INSERT INTO public.work_orders (
        tenant_id,
        code,
        title,
        description,
        status,
        priority,
        building_id,
        floor_id,
        asset_id,
        reporter_name,
        reporter_phone,
        reported_at,
        created_at
    ) VALUES (
        v_tenant_id,
        v_code,
        'بلاغ عام: ' || COALESCE(substring(p_description from 1 for 30), 'General Issue'),
        p_description,
        'pending',
        'medium',
        p_building_id,
        p_floor_id,
        p_asset_id,
        p_reporter_name,
        p_reporter_phone,
        NOW(),
        NOW()
    )
    RETURNING id INTO v_new_id;

    PERFORM public.create_operation_log(
        v_tenant_id,
        v_new_id,
        'create',
        'Public report submitted by: ' || p_reporter_name,
        NULL
    );

    RETURN v_new_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_maintenance_task_from_work_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_task RECORD;
BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    IF NEW.status = 'in_progress' THEN
        FOR v_task IN
            SELECT mt.id
              FROM public.maintenance_tasks mt
             WHERE mt.related_work_order_id = NEW.id
               AND mt.status = 'pending'
        LOOP
            UPDATE public.maintenance_tasks
               SET status = 'in_progress',
                   started_at = COALESCE(started_at, NOW()),
                   execution_snapshot = COALESCE(execution_snapshot, public.pm_build_task_execution_snapshot(v_task.id, TRUE)),
                   updated_at = NOW()
             WHERE id = v_task.id;

            PERFORM public.pm_populate_task_checks_internal(v_task.id);
        END LOOP;

        RETURN NEW;
    END IF;

    IF NEW.status = 'completed' THEN
        FOR v_task IN
            SELECT mt.id, mt.maintenance_plan_id
              FROM public.maintenance_tasks mt
             WHERE mt.related_work_order_id = NEW.id
               AND mt.status NOT IN ('completed', 'cancelled')
        LOOP
            UPDATE public.maintenance_tasks
               SET status = 'completed',
                   completed_at = COALESCE(completed_at, NOW()),
                   execution_snapshot = COALESCE(execution_snapshot, public.pm_build_task_execution_snapshot(v_task.id, TRUE)),
                   updated_at = NOW()
             WHERE id = v_task.id;

            PERFORM public.pm_update_plan_stats(v_task.maintenance_plan_id);
        END LOOP;

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_tenant_modules_from_plan()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    NEW.enabled_modules := public.plan_enabled_modules_json(NEW.plan_id);
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_tenants_from_subscription()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_plan_code text;
BEGIN
    SELECT code INTO v_plan_code
      FROM public.subscription_plans
     WHERE id = NEW.plan_id;

    UPDATE public.tenants SET
        plan_id              = NEW.plan_id,
        subscription_status  = NEW.status,
        subscription_tier    = v_plan_code,
        billing_cycle        = NEW.billing_cycle,
        trial_ends_at        = NEW.trial_ends_at,
        subscription_ends_at = NEW.current_period_end,
        updated_at           = now()
    WHERE id = NEW.tenant_id;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.tenant_has_operational_access(p_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenants t
    WHERE t.id = p_tenant_id
      AND COALESCE(t.is_active, TRUE) = TRUE
      AND COALESCE(t.subscription_status, 'trial') NOT IN ('expired', 'suspended', 'cancelled')
      AND (
        COALESCE(t.subscription_ends_at, t.trial_ends_at) IS NULL
        OR COALESCE(t.subscription_ends_at, t.trial_ends_at) >= now()
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_update_plan_stats()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM public.pm_update_plan_stats(OLD.maintenance_plan_id);
        RETURN OLD;
    END IF;

    IF TG_OP = 'INSERT' THEN
        PERFORM public.pm_update_plan_stats(NEW.maintenance_plan_id);
        RETURN NEW;
    END IF;

    IF OLD.maintenance_plan_id IS DISTINCT FROM NEW.maintenance_plan_id THEN
        PERFORM public.pm_update_plan_stats(OLD.maintenance_plan_id);
        PERFORM public.pm_update_plan_stats(NEW.maintenance_plan_id);
    ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
        PERFORM public.pm_update_plan_stats(NEW.maintenance_plan_id);
    END IF;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_update_template_totals()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        PERFORM public.pm_update_template_totals(OLD.template_id);
        RETURN OLD;
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.template_id IS DISTINCT FROM NEW.template_id THEN
        PERFORM public.pm_update_template_totals(OLD.template_id);
    END IF;

    PERFORM public.pm_update_template_totals(NEW.template_id);
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_asset_status_with_log(p_asset_id uuid, p_new_status text, p_notes text DEFAULT NULL::text)
 RETURNS assets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_actor_id UUID := auth.uid();
    v_asset public.assets%ROWTYPE;
    v_old_status TEXT;
BEGIN
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF p_new_status IS NULL OR p_new_status NOT IN ('operational', 'under_maintenance', 'out_of_service', 'retired') THEN
        RAISE EXCEPTION 'Invalid asset status';
    END IF;

    SELECT *
      INTO v_asset
      FROM public.assets
     WHERE id = p_asset_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Asset not found';
    END IF;

    IF NOT public.can_manage_assets_scope(v_asset.tenant_id) THEN
        RAISE EXCEPTION 'Insufficient permissions to update asset status';
    END IF;

    v_old_status := v_asset.status;

    IF v_old_status = p_new_status THEN
        RETURN v_asset;
    END IF;

    UPDATE public.assets
       SET status = p_new_status,
           updated_at = now()
     WHERE id = p_asset_id
     RETURNING * INTO v_asset;

    INSERT INTO public.asset_activity_logs (
        tenant_id,
        asset_id,
        performed_by,
        action_type,
        previous_status,
        new_status,
        notes
    ) VALUES (
        v_asset.tenant_id,
        v_asset.id,
        v_actor_id,
        'status_change',
        v_old_status,
        p_new_status,
        NULLIF(BTRIM(p_notes), '')
    );

    RETURN v_asset;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_job_plan_total_items()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_plan_id UUID;
BEGIN
    v_plan_id := CASE TG_OP WHEN 'DELETE' THEN OLD.job_plan_id ELSE NEW.job_plan_id END;

    UPDATE public.job_plans
       SET total_items = (
           SELECT COUNT(*)
             FROM public.job_plan_items
            WHERE job_plan_id = v_plan_id
              AND item_type  <> 'header'
       )
     WHERE id = v_plan_id;

    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_modified_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.wo_complete(p_wo_id uuid, p_completion_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_actor_id      UUID    := auth.uid();
    v_actor_role    TEXT;
    v_actor_tenant  UUID;
    v_is_super      BOOLEAN := FALSE;
    v_wo            RECORD;
    v_is_platform   BOOLEAN := FALSE;
    v_is_mgmt       BOOLEAN := FALSE;
    v_missing_labels TEXT;
BEGIN
    -- 1. Authentication
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 2. Actor profile
    SELECT role, tenant_id, COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_is_super
      FROM public.profiles
     WHERE id = v_actor_id;

    IF v_actor_role IS NULL AND NOT v_is_super THEN
        RAISE EXCEPTION 'Caller profile not found';
    END IF;

    -- 3. Work order snapshot (full row for schedule stats update)
    SELECT * INTO v_wo FROM public.work_orders WHERE id = p_wo_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Work order not found';
    END IF;

    -- 4. Override flags
    v_is_platform := v_is_super OR v_actor_role IN ('platform_owner', 'platform_admin');
    v_is_mgmt     := v_is_platform OR v_actor_role IN ('tenant_admin', 'maintenance_manager');

    -- 5. Tenant isolation
    IF NOT v_is_platform AND v_actor_tenant IS DISTINCT FROM v_wo.tenant_id THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 6. Role check
    IF v_actor_role NOT IN (
        'technician', 'engineer', 'maintenance_manager', 'tenant_admin',
        'platform_owner', 'platform_admin'
    ) AND NOT v_is_super THEN
        RAISE EXCEPTION 'Unauthorized: your role is not permitted to complete a work order'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 7. Status check
    IF v_wo.status <> 'in_progress' THEN
        RAISE EXCEPTION 'Only in-progress work orders can be completed; current status: %', v_wo.status;
    END IF;

    -- 8. Assignment check
    IF NOT v_is_mgmt AND v_wo.assigned_to IS DISTINCT FROM v_actor_id THEN
        RAISE EXCEPTION 'Only the assigned technician can complete this work order'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 9. Required checks — build list of incomplete required items
    SELECT string_agg(
        (item_snapshot->>'label')
        || CASE
               WHEN asset_id IS NOT NULL THEN
                   ' (' || COALESCE(
                       (SELECT name FROM public.assets WHERE id = asset_id),
                       'Asset'
                   ) || ')'
               ELSE ''
           END,
        ', '
        ORDER BY sort_order
    )
    INTO v_missing_labels
    FROM public.work_order_checks
    WHERE work_order_id = p_wo_id
      AND COALESCE((item_snapshot->>'is_required')::BOOLEAN, FALSE) = TRUE
      AND status = 'pending';

    IF v_missing_labels IS NOT NULL THEN
        RAISE EXCEPTION 'Required checks incomplete: %', v_missing_labels;
    END IF;

    -- 10. Authorize the upcoming UPDATE to bypass the sensitive-field trigger
    PERFORM set_config('app.work_order_workflow_authorized', 'true', TRUE);

    -- 11. Transition to completed (PM work orders bypass approval stages)
    UPDATE public.work_orders
       SET status                  = 'completed',
           completed_at            = NOW(),
           completion_notes        = COALESCE(p_completion_notes, completion_notes),
           actual_duration_minutes = CASE
               WHEN started_at IS NOT NULL
               THEN GREATEST(0,
                   (EXTRACT(EPOCH FROM (NOW() - started_at)) / 60.0)::INTEGER
               )
               WHEN start_time IS NOT NULL
               THEN GREATEST(0,
                   (EXTRACT(EPOCH FROM (NOW() - start_time)) / 60.0)::INTEGER
               )
               ELSE NULL
           END,
           updated_at = NOW()
     WHERE id = p_wo_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Work order update failed unexpectedly';
    END IF;

    -- 12. Update schedule compliance stats (PM-specific; safe to run even if columns are null)
    IF v_wo.source_schedule_id IS NOT NULL THEN
        UPDATE public.pm_schedules
           SET total_completed = total_completed + 1,
               compliance_rate = CASE
                   WHEN total_generated > 0
                   THEN ((total_completed + 1)::DECIMAL / total_generated * 100.0)
                   ELSE 0
               END,
               updated_at = NOW()
         WHERE id = v_wo.source_schedule_id;
    END IF;

    -- 13. Operation log
    PERFORM public.create_operation_log(
        v_wo.tenant_id,
        p_wo_id,
        'maintenance',
        'PM work order completed',
        v_actor_id
    );

    RETURN jsonb_build_object('success', TRUE, 'work_order_id', p_wo_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.wo_start(p_wo_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_actor_id      UUID    := auth.uid();
    v_actor_role    TEXT;
    v_actor_tenant  UUID;
    v_is_super      BOOLEAN := FALSE;
    v_tenant_id     UUID;
    v_old_status    TEXT;
    v_assigned_to   UUID;
    v_is_platform   BOOLEAN := FALSE;
    v_is_mgmt       BOOLEAN := FALSE;
BEGIN
    -- 1. Authentication
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 2. Actor profile
    SELECT role, tenant_id, COALESCE(is_super_admin, FALSE)
      INTO v_actor_role, v_actor_tenant, v_is_super
      FROM public.profiles
     WHERE id = v_actor_id;

    IF v_actor_role IS NULL AND NOT v_is_super THEN
        RAISE EXCEPTION 'Caller profile not found';
    END IF;

    -- 3. Work order snapshot
    SELECT tenant_id, status, assigned_to
      INTO v_tenant_id, v_old_status, v_assigned_to
      FROM public.work_orders
     WHERE id = p_wo_id;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Work order not found';
    END IF;

    -- 4. Override flags
    v_is_platform := v_is_super OR v_actor_role IN ('platform_owner', 'platform_admin');
    v_is_mgmt     := v_is_platform OR v_actor_role IN ('tenant_admin', 'maintenance_manager');

    -- 5. Tenant isolation
    IF NOT v_is_platform AND v_actor_tenant IS DISTINCT FROM v_tenant_id THEN
        RAISE EXCEPTION 'Access denied: work order belongs to a different tenant'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 6. Role check
    IF v_actor_role NOT IN (
        'technician', 'engineer', 'maintenance_manager', 'tenant_admin',
        'platform_owner', 'platform_admin'
    ) AND NOT v_is_super THEN
        RAISE EXCEPTION 'Unauthorized: your role is not permitted to start a work order'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 7. Status check (PM orders start as pending; allow assigned as well)
    IF v_old_status NOT IN ('pending', 'assigned') THEN
        RAISE EXCEPTION 'Cannot start work order in status: %', v_old_status;
    END IF;

    -- 8. Assignment check
    IF NOT v_is_mgmt
       AND v_assigned_to IS NOT NULL
       AND v_assigned_to IS DISTINCT FROM v_actor_id
    THEN
        RAISE EXCEPTION 'Only the assigned technician can start this work order'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- 9. Authorize the upcoming UPDATE to bypass the sensitive-field trigger
    PERFORM set_config('app.work_order_workflow_authorized', 'true', TRUE);

    -- 10. Transition to in_progress; self-assign if unassigned
    UPDATE public.work_orders
       SET status      = 'in_progress',
           start_time  = COALESCE(start_time, NOW()),
           started_at  = COALESCE(started_at, NOW()),
           assigned_to = COALESCE(v_assigned_to, v_actor_id),
           updated_at  = NOW()
     WHERE id = p_wo_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Work order update failed unexpectedly';
    END IF;

    -- 11. Operation log
    PERFORM public.create_operation_log(
        v_tenant_id,
        p_wo_id,
        'maintenance',
        'PM work order started',
        v_actor_id
    );

    RETURN jsonb_build_object('success', TRUE, 'work_order_id', p_wo_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.work_order_asset_location_is_valid(p_tenant_id uuid, p_building_id uuid, p_floor_id uuid, p_room_id uuid, p_asset_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT
        public.facility_location_is_valid(
            p_tenant_id,
            p_building_id,
            p_floor_id,
            p_room_id
        )
        AND (
            p_asset_id IS NULL
            OR EXISTS (
                SELECT 1
                FROM public.assets a
                WHERE a.id = p_asset_id
                  AND a.tenant_id = p_tenant_id
                  AND (p_building_id IS NULL OR a.building_id = p_building_id)
                  AND (p_floor_id IS NULL OR a.floor_id = p_floor_id)
                  AND (p_room_id IS NULL OR a.room_id = p_room_id)
            )
        );
$function$
;

-- ===== TRIGGERS =====
CREATE TRIGGER update_asset_activity_logs_modtime BEFORE UPDATE ON public.asset_activity_logs FOR EACH ROW EXECUTE FUNCTION update_modified_column();
CREATE TRIGGER check_asset_limits BEFORE INSERT ON public.assets FOR EACH ROW EXECUTE FUNCTION enforce_subscription_limits();
CREATE TRIGGER set_billing_add_ons_updated_at BEFORE UPDATE ON public.billing_add_ons FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_billing_invoices_updated_at BEFORE UPDATE ON public.billing_invoices FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_billing_quotes_updated_at BEFORE UPDATE ON public.billing_quotes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER check_building_limits BEFORE INSERT ON public.buildings FOR EACH ROW EXECUTE FUNCTION enforce_subscription_limits();
CREATE TRIGGER trg_checklist_template_items_update_totals AFTER INSERT OR DELETE OR UPDATE ON public.checklist_template_items FOR EACH ROW EXECUTE FUNCTION trigger_update_template_totals();
CREATE TRIGGER trg_checklist_template_sections_set_updated_at BEFORE UPDATE ON public.checklist_template_sections FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_checklist_templates_set_updated_at BEFORE UPDATE ON public.checklist_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_discount_policies_updated_at BEFORE UPDATE ON public.discount_policies FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_job_plan_items_updated_at BEFORE UPDATE ON public.job_plan_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_update_job_plan_items AFTER INSERT OR DELETE OR UPDATE ON public.job_plan_items FOR EACH ROW EXECUTE FUNCTION update_job_plan_total_items();
CREATE TRIGGER trg_job_plans_updated_at BEFORE UPDATE ON public.job_plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_pm_bundles_set_updated_at BEFORE UPDATE ON public.maintenance_frequency_bundles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_maintenance_plan_targets_set_updated_at BEFORE UPDATE ON public.maintenance_plan_targets FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_maintenance_plans_set_updated_at BEFORE UPDATE ON public.maintenance_plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_maintenance_plans_updated_at BEFORE UPDATE ON public.maintenance_plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_maintenance_task_checks_set_updated_at BEFORE UPDATE ON public.maintenance_task_checks FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_maintenance_task_checks_updated_at BEFORE UPDATE ON public.maintenance_task_checks FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_maintenance_tasks_updated_at BEFORE UPDATE ON public.maintenance_tasks FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_pm_sync_execution_status BEFORE UPDATE OF status ON public.maintenance_tasks FOR EACH ROW EXECUTE FUNCTION pm_sync_execution_status();
CREATE TRIGGER trg_task_created AFTER INSERT ON public.maintenance_tasks FOR EACH ROW EXECUTE FUNCTION trigger_update_plan_stats();
CREATE TRIGGER trg_task_deleted AFTER DELETE ON public.maintenance_tasks FOR EACH ROW EXECUTE FUNCTION trigger_update_plan_stats();
CREATE TRIGGER trg_task_status_change AFTER UPDATE OF status, maintenance_plan_id ON public.maintenance_tasks FOR EACH ROW EXECUTE FUNCTION trigger_update_plan_stats();
CREATE TRIGGER trg_send_email_on_notification AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION send_email_notification();
CREATE TRIGGER trg_populate_platform_audit_log_actor BEFORE INSERT ON public.platform_audit_logs FOR EACH ROW EXECUTE FUNCTION populate_platform_audit_log_actor();
CREATE TRIGGER trg_pm_schedules_updated_at BEFORE UPDATE ON public.pm_schedules FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER check_profile_limits BEFORE INSERT OR UPDATE OF tenant_id, is_active ON public.profiles FOR EACH ROW EXECUTE FUNCTION enforce_subscription_limits();
CREATE TRIGGER enforce_profile_update_permissions BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION enforce_profile_update_permissions();
CREATE TRIGGER set_subscription_plans_updated_at BEFORE UPDATE ON public.subscription_plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_tenant_subscriptions_updated_at BEFORE UPDATE ON public.tenant_subscriptions FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER sync_tenants_on_subscription_change AFTER INSERT OR UPDATE ON public.tenant_subscriptions FOR EACH ROW EXECUTE FUNCTION sync_tenants_from_subscription();
CREATE TRIGGER enforce_tenant_subscription_guard BEFORE UPDATE OF plan_id, enabled_modules, subscription_status, subscription_tier, billing_cycle, trial_ends_at, subscription_ends_at, is_active ON public.tenants FOR EACH ROW EXECUTE FUNCTION enforce_tenant_subscription_guard();
CREATE TRIGGER on_tenant_plan_change BEFORE INSERT OR UPDATE OF plan_id ON public.tenants FOR EACH ROW EXECUTE FUNCTION sync_tenant_modules_from_plan();
CREATE TRIGGER trg_wo_checks_updated_at BEFORE UPDATE ON public.work_order_checks FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER check_work_order_limits BEFORE INSERT ON public.work_orders FOR EACH ROW EXECUTE FUNCTION enforce_subscription_limits();
CREATE TRIGGER trg_guard_work_order_sensitive_fields BEFORE UPDATE ON public.work_orders FOR EACH ROW EXECUTE FUNCTION guard_work_order_sensitive_fields();
CREATE TRIGGER trg_notify_team_on_new_wo AFTER INSERT ON public.work_orders FOR EACH ROW EXECUTE FUNCTION notify_team_on_new_work_order();
CREATE TRIGGER trg_notify_wo_assignment AFTER UPDATE ON public.work_orders FOR EACH ROW EXECUTE FUNCTION notify_on_work_order_assignment();
CREATE TRIGGER trg_notify_wo_status AFTER UPDATE ON public.work_orders FOR EACH ROW EXECUTE FUNCTION notify_on_work_order_status_change();
CREATE TRIGGER trg_pm_sync_from_work_order AFTER UPDATE OF status ON public.work_orders FOR EACH ROW EXECUTE FUNCTION pm_sync_task_from_work_order();
CREATE TRIGGER trg_sync_maintenance_task_from_work_order AFTER UPDATE OF status ON public.work_orders FOR EACH ROW EXECUTE FUNCTION sync_maintenance_task_from_work_order();

-- ===== VIEWS =====
CREATE OR REPLACE VIEW public.asset_maintenance_history AS
 SELECT t.asset_id,
    t.id AS task_id,
    t.title AS task_title,
    t.status AS task_status,
    t.due_date,
    t.completed_at,
    t.assigned_to,
    p.full_name AS technician_name,
    t.maintenance_plan_id,
    mp.name AS plan_name,
    t.related_work_order_id,
    t.checklist_template_id,
    ct.name AS template_name,
    t.tenant_id,
    t.created_at,
    t.execution_reference,
    t.execution_status,
    t.review_status,
    t.reviewed_at,
    t.latest_pdf_export_id,
    t.latest_pdf_url,
    t.latest_pdf_exported_at
   FROM maintenance_tasks t
     LEFT JOIN profiles p ON p.id = t.assigned_to
     LEFT JOIN maintenance_plans mp ON mp.id = t.maintenance_plan_id
     LEFT JOIN checklist_templates ct ON ct.id = t.checklist_template_id
  WHERE t.asset_id IS NOT NULL
  ORDER BY t.created_at DESC;

CREATE OR REPLACE VIEW public.pm_work_order_history AS
 SELECT woa.asset_id,
    wo.id AS work_order_id,
    wo.code AS work_order_code,
    wo.title,
    wo.work_type,
    wo.status,
    wo.scheduled_date,
    wo.completed_at,
    wo.assigned_to,
    p.full_name AS technician_name,
    wo.source_schedule_id,
    s.name AS schedule_name,
    wo.job_plan_id,
    jp.name AS job_plan_name,
    wo.tenant_id,
    wo.created_at
   FROM work_orders wo
     JOIN work_order_assets woa ON woa.work_order_id = wo.id
     LEFT JOIN profiles p ON p.id = wo.assigned_to
     LEFT JOIN pm_schedules s ON s.id = wo.source_schedule_id
     LEFT JOIN job_plans jp ON jp.id = wo.job_plan_id
  ORDER BY wo.created_at DESC;

-- ===== ENABLE RLS =====
ALTER TABLE public.asset_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_add_ons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_template_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discount_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issue_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_frequency_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_plan_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_task_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_task_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_generation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_pdf_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_schedule_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;

-- ===== POLICIES =====
CREATE POLICY asset_activity_logs_insert_scoped ON public.asset_activity_logs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((can_manage_assets_scope(tenant_id) AND (EXISTS ( SELECT 1
   FROM assets a
  WHERE ((a.id = asset_activity_logs.asset_id) AND (a.tenant_id = asset_activity_logs.tenant_id))))));
CREATE POLICY asset_activity_logs_select_scoped ON public.asset_activity_logs AS PERMISSIVE FOR SELECT TO authenticated USING (((tenant_id = get_user_tenant_id()) OR is_platform_admin()));
CREATE POLICY "Admins can manage asset categories" ON public.asset_categories AS PERMISSIVE FOR ALL TO public USING ((((tenant_id = get_user_tenant_id()) AND is_tenant_admin()) OR is_super_admin()));
CREATE POLICY "Platform admins can manage asset categories" ON public.asset_categories AS PERMISSIVE FOR ALL TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY "Users can view asset categories" ON public.asset_categories AS PERMISSIVE FOR SELECT TO public USING (((tenant_id IS NULL) OR (tenant_id = get_user_tenant_id()) OR is_super_admin()));
CREATE POLICY "Admins can manage assets" ON public.assets AS PERMISSIVE FOR ALL TO public USING ((((tenant_id = get_user_tenant_id()) AND is_tenant_admin()) OR is_super_admin()));
CREATE POLICY "Users can view assets in their tenant" ON public.assets AS PERMISSIVE FOR SELECT TO public USING (((tenant_id = get_user_tenant_id()) OR is_super_admin()));
CREATE POLICY assets_delete_scoped ON public.assets AS PERMISSIVE FOR DELETE TO authenticated USING (can_manage_assets_scope(tenant_id));
CREATE POLICY assets_insert_scoped ON public.assets AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((can_manage_assets_scope(tenant_id) AND facility_location_is_valid(tenant_id, building_id, floor_id, room_id)));
CREATE POLICY assets_select_tenant ON public.assets AS PERMISSIVE FOR SELECT TO authenticated USING (((tenant_id = get_user_tenant_id()) OR is_platform_admin()));
CREATE POLICY assets_update_scoped ON public.assets AS PERMISSIVE FOR UPDATE TO authenticated USING (can_manage_assets_scope(tenant_id)) WITH CHECK ((can_manage_assets_scope(tenant_id) AND facility_location_is_valid(tenant_id, building_id, floor_id, room_id)));
CREATE POLICY billing_add_ons_read ON public.billing_add_ons AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY billing_add_ons_write ON public.billing_add_ons AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['platform_owner'::character varying, 'platform_admin'::character varying])::text[])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['platform_owner'::character varying, 'platform_admin'::character varying])::text[]))))));
CREATE POLICY billing_invoices_manage ON public.billing_invoices AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['platform_owner'::character varying, 'platform_admin'::character varying, 'platform_finance'::character varying])::text[])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['platform_owner'::character varying, 'platform_admin'::character varying, 'platform_finance'::character varying])::text[]))))));
CREATE POLICY billing_invoices_platform_read ON public.billing_invoices AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['platform_owner'::character varying, 'platform_admin'::character varying, 'platform_finance'::character varying, 'platform_support'::character varying])::text[]))))));
CREATE POLICY billing_invoices_tenant_read ON public.billing_invoices AS PERMISSIVE FOR SELECT TO authenticated USING ((tenant_id IN ( SELECT profiles.tenant_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY billing_quotes_manage ON public.billing_quotes AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['platform_owner'::character varying, 'platform_admin'::character varying])::text[])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['platform_owner'::character varying, 'platform_admin'::character varying])::text[]))))));
CREATE POLICY billing_quotes_platform_read ON public.billing_quotes AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['platform_owner'::character varying, 'platform_admin'::character varying, 'platform_finance'::character varying, 'platform_support'::character varying])::text[]))))));
CREATE POLICY billing_quotes_tenant_read ON public.billing_quotes AS PERMISSIVE FOR SELECT TO authenticated USING ((tenant_id IN ( SELECT profiles.tenant_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));
CREATE POLICY "Admins can manage buildings" ON public.buildings AS PERMISSIVE FOR ALL TO public USING ((((tenant_id = get_user_tenant_id()) AND is_tenant_admin()) OR is_super_admin()));
CREATE POLICY "Users can view buildings in their tenant" ON public.buildings AS PERMISSIVE FOR SELECT TO public USING (((tenant_id = get_user_tenant_id()) OR is_super_admin()));
CREATE POLICY buildings_delete_admin ON public.buildings AS PERMISSIVE FOR DELETE TO authenticated USING (can_manage_facilities(tenant_id));
CREATE POLICY buildings_insert_admin ON public.buildings AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (can_manage_facilities(tenant_id));
CREATE POLICY buildings_select_tenant ON public.buildings AS PERMISSIVE FOR SELECT TO authenticated USING (((tenant_id = get_user_tenant_id()) OR is_platform_admin()));
CREATE POLICY buildings_update_admin ON public.buildings AS PERMISSIVE FOR UPDATE TO authenticated USING (can_manage_facilities(tenant_id)) WITH CHECK (can_manage_facilities(tenant_id));
CREATE POLICY checklist_template_items_manage_scoped ON public.checklist_template_items AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM checklist_templates ct
  WHERE ((ct.id = checklist_template_items.template_id) AND pm_can_manage_tenant(ct.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM checklist_templates ct
  WHERE ((ct.id = checklist_template_items.template_id) AND pm_can_manage_tenant(ct.tenant_id)))));
CREATE POLICY checklist_template_items_select_scoped ON public.checklist_template_items AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM checklist_templates ct
  WHERE ((ct.id = checklist_template_items.template_id) AND pm_can_view_tenant(ct.tenant_id)))));
CREATE POLICY checklist_template_sections_manage ON public.checklist_template_sections AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM checklist_templates ct
  WHERE ((ct.id = checklist_template_sections.template_id) AND pm_can_manage_tenant(ct.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM checklist_templates ct
  WHERE ((ct.id = checklist_template_sections.template_id) AND pm_can_manage_tenant(ct.tenant_id)))));
CREATE POLICY checklist_template_sections_manage_scoped ON public.checklist_template_sections AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM checklist_templates ct
  WHERE ((ct.id = checklist_template_sections.template_id) AND pm_can_manage_tenant(ct.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM checklist_templates ct
  WHERE ((ct.id = checklist_template_sections.template_id) AND pm_can_manage_tenant(ct.tenant_id)))));
CREATE POLICY checklist_template_sections_select ON public.checklist_template_sections AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM checklist_templates ct
  WHERE ((ct.id = checklist_template_sections.template_id) AND pm_can_view_tenant(ct.tenant_id)))));
CREATE POLICY checklist_template_sections_select_scoped ON public.checklist_template_sections AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM checklist_templates ct
  WHERE ((ct.id = checklist_template_sections.template_id) AND pm_can_view_tenant(ct.tenant_id)))));
CREATE POLICY checklist_templates_manage_scoped ON public.checklist_templates AS PERMISSIVE FOR ALL TO authenticated USING (pm_can_manage_tenant(tenant_id)) WITH CHECK (pm_can_manage_tenant(tenant_id));
CREATE POLICY checklist_templates_select_scoped ON public.checklist_templates AS PERMISSIVE FOR SELECT TO authenticated USING (pm_can_view_tenant(tenant_id));
CREATE POLICY "Admins can manage departments" ON public.departments AS PERMISSIVE FOR ALL TO public USING ((((tenant_id = get_user_tenant_id()) AND is_tenant_admin()) OR is_super_admin()));
CREATE POLICY "Platform admins can view departments" ON public.departments AS PERMISSIVE FOR SELECT TO authenticated USING (is_platform_admin());
CREATE POLICY "Users can view departments in their tenant" ON public.departments AS PERMISSIVE FOR SELECT TO public USING (((tenant_id = get_user_tenant_id()) OR is_super_admin()));
CREATE POLICY discount_policies_read ON public.discount_policies AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY discount_policies_write ON public.discount_policies AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['platform_owner'::character varying, 'platform_admin'::character varying])::text[])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['platform_owner'::character varying, 'platform_admin'::character varying])::text[]))))));
CREATE POLICY "Admins can manage floors" ON public.floors AS PERMISSIVE FOR ALL TO public USING ((((building_id IN ( SELECT buildings.id
   FROM buildings
  WHERE (buildings.tenant_id = get_user_tenant_id()))) AND is_tenant_admin()) OR is_super_admin()));
CREATE POLICY "Users can view floors in their tenant" ON public.floors AS PERMISSIVE FOR SELECT TO public USING (((building_id IN ( SELECT buildings.id
   FROM buildings
  WHERE (buildings.tenant_id = get_user_tenant_id()))) OR is_super_admin()));
CREATE POLICY floors_delete_admin ON public.floors AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM buildings b
  WHERE ((b.id = floors.building_id) AND can_manage_facilities(b.tenant_id)))));
CREATE POLICY floors_insert_admin ON public.floors AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM buildings b
  WHERE ((b.id = floors.building_id) AND can_manage_facilities(b.tenant_id)))));
CREATE POLICY floors_select_tenant ON public.floors AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM buildings b
  WHERE ((b.id = floors.building_id) AND ((b.tenant_id = get_user_tenant_id()) OR is_platform_admin())))));
CREATE POLICY floors_update_admin ON public.floors AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM buildings b
  WHERE ((b.id = floors.building_id) AND can_manage_facilities(b.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM buildings b
  WHERE ((b.id = floors.building_id) AND can_manage_facilities(b.tenant_id)))));
CREATE POLICY intake_messages_select_tenant_scoped ON public.intake_messages AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (COALESCE(p.is_active, true) = true) AND ((p.tenant_id = intake_messages.tenant_id) OR ((p.role)::text = ANY ((ARRAY['platform_owner'::character varying, 'platform_admin'::character varying, 'platform_support'::character varying])::text[])))))));
CREATE POLICY intake_reports_select_tenant_scoped ON public.intake_reports AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (COALESCE(p.is_active, true) = true) AND ((p.tenant_id = intake_reports.tenant_id) OR ((p.role)::text = ANY ((ARRAY['platform_owner'::character varying, 'platform_admin'::character varying, 'platform_support'::character varying])::text[])))))));
CREATE POLICY inventory_categories_delete_tenant ON public.inventory_categories AS PERMISSIVE FOR DELETE TO authenticated USING (can_manage_inventory(tenant_id));
CREATE POLICY inventory_categories_insert_tenant ON public.inventory_categories AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (can_manage_inventory(tenant_id));
CREATE POLICY inventory_categories_select_tenant ON public.inventory_categories AS PERMISSIVE FOR SELECT TO authenticated USING (can_view_inventory(tenant_id));
CREATE POLICY inventory_categories_update_tenant ON public.inventory_categories AS PERMISSIVE FOR UPDATE TO authenticated USING (can_manage_inventory(tenant_id)) WITH CHECK (can_manage_inventory(tenant_id));
CREATE POLICY inventory_items_delete_tenant ON public.inventory_items AS PERMISSIVE FOR DELETE TO authenticated USING (can_manage_inventory(tenant_id));
CREATE POLICY inventory_items_insert_tenant ON public.inventory_items AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (can_manage_inventory(tenant_id));
CREATE POLICY inventory_items_select_tenant ON public.inventory_items AS PERMISSIVE FOR SELECT TO authenticated USING (can_view_inventory(tenant_id));
CREATE POLICY inventory_items_update_tenant ON public.inventory_items AS PERMISSIVE FOR UPDATE TO authenticated USING (can_manage_inventory(tenant_id)) WITH CHECK (can_manage_inventory(tenant_id));
CREATE POLICY inventory_transactions_delete_tenant ON public.inventory_transactions AS PERMISSIVE FOR DELETE TO authenticated USING (can_manage_inventory(tenant_id));
CREATE POLICY inventory_transactions_insert_tenant ON public.inventory_transactions AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (can_manage_inventory(tenant_id));
CREATE POLICY inventory_transactions_select_tenant ON public.inventory_transactions AS PERMISSIVE FOR SELECT TO authenticated USING (can_view_inventory(tenant_id));
CREATE POLICY inventory_transactions_update_tenant ON public.inventory_transactions AS PERMISSIVE FOR UPDATE TO authenticated USING (can_manage_inventory(tenant_id)) WITH CHECK (can_manage_inventory(tenant_id));
CREATE POLICY "Admins can manage issue types" ON public.issue_types AS PERMISSIVE FOR ALL TO public USING ((((tenant_id = get_user_tenant_id()) AND is_tenant_admin()) OR is_super_admin()));
CREATE POLICY "Platform admins can manage issue types" ON public.issue_types AS PERMISSIVE FOR ALL TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY "Users can view issue types" ON public.issue_types AS PERMISSIVE FOR SELECT TO public USING (((tenant_id IS NULL) OR (tenant_id = get_user_tenant_id()) OR is_super_admin()));
CREATE POLICY job_plan_items_manage ON public.job_plan_items AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM job_plans jp
  WHERE ((jp.id = job_plan_items.job_plan_id) AND pm_can_manage_tenant(jp.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM job_plans jp
  WHERE ((jp.id = job_plan_items.job_plan_id) AND pm_can_manage_tenant(jp.tenant_id)))));
CREATE POLICY job_plan_items_select ON public.job_plan_items AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM job_plans jp
  WHERE ((jp.id = job_plan_items.job_plan_id) AND pm_can_view_tenant(jp.tenant_id)))));
CREATE POLICY job_plans_manage ON public.job_plans AS PERMISSIVE FOR ALL TO authenticated USING (pm_can_manage_tenant(tenant_id)) WITH CHECK (pm_can_manage_tenant(tenant_id));
CREATE POLICY job_plans_select ON public.job_plans AS PERMISSIVE FOR SELECT TO authenticated USING (pm_can_view_tenant(tenant_id));
CREATE POLICY maintenance_frequency_bundles_manage ON public.maintenance_frequency_bundles AS PERMISSIVE FOR ALL TO authenticated USING (pm_can_manage_tenant(tenant_id)) WITH CHECK (pm_can_manage_tenant(tenant_id));
CREATE POLICY maintenance_frequency_bundles_select ON public.maintenance_frequency_bundles AS PERMISSIVE FOR SELECT TO authenticated USING (pm_can_view_tenant(tenant_id));
CREATE POLICY maintenance_plan_targets_manage ON public.maintenance_plan_targets AS PERMISSIVE FOR ALL TO authenticated USING (pm_can_manage_tenant(tenant_id)) WITH CHECK (pm_can_manage_tenant(tenant_id));
CREATE POLICY maintenance_plan_targets_select ON public.maintenance_plan_targets AS PERMISSIVE FOR SELECT TO authenticated USING (pm_can_view_tenant(tenant_id));
CREATE POLICY maintenance_plans_manage_scoped ON public.maintenance_plans AS PERMISSIVE FOR ALL TO authenticated USING (pm_can_manage_tenant(tenant_id)) WITH CHECK (pm_can_manage_tenant(tenant_id));
CREATE POLICY maintenance_plans_select_scoped ON public.maintenance_plans AS PERMISSIVE FOR SELECT TO authenticated USING (pm_can_view_tenant(tenant_id));
CREATE POLICY maintenance_task_attachments_delete_scoped ON public.maintenance_task_attachments AS PERMISSIVE FOR DELETE TO authenticated USING (pm_can_execute_task(task_id));
CREATE POLICY maintenance_task_attachments_insert_scoped ON public.maintenance_task_attachments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((pm_can_execute_task(task_id) AND (EXISTS ( SELECT 1
   FROM maintenance_tasks mt
  WHERE ((mt.id = maintenance_task_attachments.task_id) AND (mt.tenant_id = mt.tenant_id))))));
CREATE POLICY maintenance_task_attachments_select_scoped ON public.maintenance_task_attachments AS PERMISSIVE FOR SELECT TO authenticated USING (pm_can_view_task(task_id));
CREATE POLICY maintenance_task_attachments_update_scoped ON public.maintenance_task_attachments AS PERMISSIVE FOR UPDATE TO authenticated USING (pm_can_execute_task(task_id)) WITH CHECK ((pm_can_execute_task(task_id) AND (EXISTS ( SELECT 1
   FROM maintenance_tasks mt
  WHERE ((mt.id = maintenance_task_attachments.task_id) AND (mt.tenant_id = mt.tenant_id))))));
CREATE POLICY maintenance_task_checks_select_scoped ON public.maintenance_task_checks AS PERMISSIVE FOR SELECT TO authenticated USING (pm_can_view_task(task_id));
CREATE POLICY maintenance_task_checks_write_scoped ON public.maintenance_task_checks AS PERMISSIVE FOR ALL TO authenticated USING (pm_can_execute_task(task_id)) WITH CHECK (pm_can_execute_task(task_id));
CREATE POLICY maintenance_tasks_manage_scoped ON public.maintenance_tasks AS PERMISSIVE FOR ALL TO authenticated USING (pm_can_manage_tenant(tenant_id)) WITH CHECK (pm_can_manage_tenant(tenant_id));
CREATE POLICY maintenance_tasks_select_scoped ON public.maintenance_tasks AS PERMISSIVE FOR SELECT TO authenticated USING (pm_can_view_task(id));
CREATE POLICY notification_logs_select_tenant_scoped ON public.notification_logs AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (COALESCE(p.is_active, true) = true) AND ((p.tenant_id = notification_logs.tenant_id) OR ((p.role)::text = ANY ((ARRAY['platform_owner'::character varying, 'platform_admin'::character varying, 'platform_support'::character varying])::text[])))))));
CREATE POLICY "Users can update their own notifications" ON public.notifications AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view their own notifications" ON public.notifications AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can create operation logs" ON public.operation_logs AS PERMISSIVE FOR INSERT TO public WITH CHECK ((tenant_id = get_user_tenant_id()));
CREATE POLICY "Users can view operation logs in their tenant" ON public.operation_logs AS PERMISSIVE FOR SELECT TO public USING (((tenant_id = get_user_tenant_id()) OR is_super_admin()));
CREATE POLICY operation_logs_insert_scoped ON public.operation_logs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((can_create_work_orders_scope(tenant_id) OR can_manage_work_orders_scope(tenant_id)));
CREATE POLICY operation_logs_select_scoped ON public.operation_logs AS PERMISSIVE FOR SELECT TO authenticated USING (((tenant_id = get_user_tenant_id()) OR is_platform_admin()));
CREATE POLICY operational_events_select_tenant_scoped ON public.operational_events AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (COALESCE(p.is_active, true) = true) AND ((p.tenant_id = operational_events.tenant_id) OR ((p.role)::text = ANY ((ARRAY['platform_owner'::character varying, 'platform_admin'::character varying, 'platform_support'::character varying])::text[])))))));
CREATE POLICY "Deny all delete" ON public.password_reset_otps AS PERMISSIVE FOR DELETE TO anon, authenticated USING (false);
CREATE POLICY "Deny all insert" ON public.password_reset_otps AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK (false);
CREATE POLICY "Deny all select" ON public.password_reset_otps AS PERMISSIVE FOR SELECT TO anon, authenticated USING (false);
CREATE POLICY "Deny all update" ON public.password_reset_otps AS PERMISSIVE FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "Service role full access" ON public.password_reset_otps AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Platform admins can insert audit logs" ON public.platform_audit_logs AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((p.is_super_admin = true) OR ((p.role)::text ~~ 'platform_%'::text))))));
CREATE POLICY "Platform admins can view all audit logs" ON public.platform_audit_logs AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['platform_owner'::character varying, 'platform_admin'::character varying, 'platform_support'::character varying])::text[]))))));
CREATE POLICY "Platform admins can view audit logs" ON public.platform_audit_logs AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['platform_owner'::character varying, 'platform_admin'::character varying])::text[]))))));
CREATE POLICY platform_settings_read_authenticated ON public.platform_settings AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY platform_settings_write_owner ON public.platform_settings AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['platform_owner'::character varying, 'platform_admin'::character varying])::text[])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['platform_owner'::character varying, 'platform_admin'::character varying])::text[]))))));
CREATE POLICY "Platform admins can view staff" ON public.platform_staff AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['platform_owner'::character varying, 'platform_admin'::character varying])::text[]))))));
CREATE POLICY "Platform owner can manage staff" ON public.platform_staff AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = 'platform_owner'::text)))));
CREATE POLICY pgr_select_platform ON public.pm_generation_runs AS PERMISSIVE FOR SELECT TO authenticated USING (is_platform_admin());
CREATE POLICY pgr_select_tenant ON public.pm_generation_runs AS PERMISSIVE FOR SELECT TO authenticated USING (((tenant_id IS NOT NULL) AND (tenant_id = get_user_tenant_id())));
CREATE POLICY pm_pdf_exports_delete_scoped ON public.pm_pdf_exports AS PERMISSIVE FOR DELETE TO authenticated USING (pm_can_manage_tenant(tenant_id));
CREATE POLICY pm_pdf_exports_insert_scoped ON public.pm_pdf_exports AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((pm_can_view_task(task_id) AND (EXISTS ( SELECT 1
   FROM maintenance_tasks mt
  WHERE ((mt.id = pm_pdf_exports.task_id) AND (mt.tenant_id = mt.tenant_id))))));
CREATE POLICY pm_pdf_exports_manage_scoped ON public.pm_pdf_exports AS PERMISSIVE FOR UPDATE TO authenticated USING (pm_can_manage_tenant(tenant_id)) WITH CHECK (pm_can_manage_tenant(tenant_id));
CREATE POLICY pm_pdf_exports_select_scoped ON public.pm_pdf_exports AS PERMISSIVE FOR SELECT TO authenticated USING (pm_can_view_task(task_id));
CREATE POLICY pm_schedule_assets_manage ON public.pm_schedule_assets AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM pm_schedules s
  WHERE ((s.id = pm_schedule_assets.schedule_id) AND pm_can_manage_tenant(s.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM pm_schedules s
  WHERE ((s.id = pm_schedule_assets.schedule_id) AND pm_can_manage_tenant(s.tenant_id)))));
CREATE POLICY pm_schedule_assets_select ON public.pm_schedule_assets AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM pm_schedules s
  WHERE ((s.id = pm_schedule_assets.schedule_id) AND pm_can_view_tenant(s.tenant_id)))));
CREATE POLICY pm_schedules_manage ON public.pm_schedules AS PERMISSIVE FOR ALL TO authenticated USING (pm_can_manage_tenant(tenant_id)) WITH CHECK (pm_can_manage_tenant(tenant_id));
CREATE POLICY pm_schedules_select ON public.pm_schedules AS PERMISSIVE FOR SELECT TO authenticated USING (pm_can_view_tenant(tenant_id));
CREATE POLICY "Allow insert profile on signup" ON public.profiles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((id = auth.uid()));
CREATE POLICY "Allow users to read own profile" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING ((id = auth.uid()));
CREATE POLICY "Allow users to update own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));
CREATE POLICY "Platform admins can view own profile" ON public.profiles AS PERMISSIVE FOR SELECT TO public USING (((id = auth.uid()) AND (((role)::text = ANY ((ARRAY['platform_owner'::character varying, 'platform_admin'::character varying, 'platform_support'::character varying])::text[])) OR (is_super_admin = true))));
CREATE POLICY "Platform staff can view all profiles" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING ((is_platform_staff() OR (id = auth.uid())));
CREATE POLICY "Super admins can view all profiles" ON public.profiles AS PERMISSIVE FOR SELECT TO public USING (is_super_admin());
CREATE POLICY "Tenant admins can update tenant profiles" ON public.profiles AS PERMISSIVE FOR UPDATE TO public USING (((tenant_id = get_user_tenant_id()) AND is_tenant_admin()));
CREATE POLICY "Users can manage own profile" ON public.profiles AS PERMISSIVE FOR ALL TO public USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));
CREATE POLICY "Users can update own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO public USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));
CREATE POLICY "Users can view own profile" ON public.profiles AS PERMISSIVE FOR SELECT TO public USING ((id = auth.uid()));
CREATE POLICY "Users can view profiles in same tenant" ON public.profiles AS PERMISSIVE FOR SELECT TO public USING ((tenant_id = get_user_tenant_id()));
CREATE POLICY "Users can view tenant profiles" ON public.profiles AS PERMISSIVE FOR SELECT TO public USING ((tenant_id = get_user_tenant_id()));
CREATE POLICY "View profiles of same tenant" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING ((tenant_id = secure_get_my_tenant_id()));
CREATE POLICY "Admins can manage rooms" ON public.rooms AS PERMISSIVE FOR ALL TO public USING ((((tenant_id = get_user_tenant_id()) AND is_tenant_admin()) OR is_super_admin()));
CREATE POLICY "Platform admins can view rooms" ON public.rooms AS PERMISSIVE FOR SELECT TO authenticated USING (is_platform_admin());
CREATE POLICY "Users can view rooms in their tenant" ON public.rooms AS PERMISSIVE FOR SELECT TO public USING (((tenant_id = get_user_tenant_id()) OR is_super_admin()));
CREATE POLICY "Admins can delete plans" ON public.subscription_plans AS PERMISSIVE FOR DELETE TO authenticated USING (is_platform_admin());
CREATE POLICY "Admins can insert plans" ON public.subscription_plans AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_platform_admin());
CREATE POLICY "Admins can update plans" ON public.subscription_plans AS PERMISSIVE FOR UPDATE TO authenticated USING (is_platform_admin()) WITH CHECK (is_platform_admin());
CREATE POLICY "Platform admins can delete plans" ON public.subscription_plans AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['platform_owner'::character varying, 'platform_admin'::character varying])::text[]))))));
CREATE POLICY "Platform admins can insert plans" ON public.subscription_plans AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['platform_owner'::character varying, 'platform_admin'::character varying])::text[]))))));
CREATE POLICY "Platform admins can update plans" ON public.subscription_plans AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['platform_owner'::character varying, 'platform_admin'::character varying])::text[])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['platform_owner'::character varying, 'platform_admin'::character varying])::text[]))))));
CREATE POLICY subscription_plans_read ON public.subscription_plans AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY subscription_plans_write ON public.subscription_plans AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['platform_owner'::character varying, 'platform_admin'::character varying])::text[])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['platform_owner'::character varying, 'platform_admin'::character varying])::text[]))))));
CREATE POLICY team_members_delete_policy ON public.team_members AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM teams t
  WHERE ((t.id = team_members.team_id) AND can_manage_work_teams(t.tenant_id)))));
CREATE POLICY team_members_insert_policy ON public.team_members AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM (teams t
     JOIN profiles p ON ((p.id = team_members.user_id)))
  WHERE ((t.id = team_members.team_id) AND (p.tenant_id = t.tenant_id) AND can_manage_work_teams(t.tenant_id)))));
CREATE POLICY team_members_select_policy ON public.team_members AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM teams t
  WHERE ((t.id = team_members.team_id) AND ((t.tenant_id = get_user_tenant_id()) OR is_platform_admin())))));
CREATE POLICY team_members_update_policy ON public.team_members AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM teams t
  WHERE ((t.id = team_members.team_id) AND can_manage_work_teams(t.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (teams t
     JOIN profiles p ON ((p.id = team_members.user_id)))
  WHERE ((t.id = team_members.team_id) AND (p.tenant_id = t.tenant_id) AND can_manage_work_teams(t.tenant_id)))));
CREATE POLICY "Admins can manage teams" ON public.teams AS PERMISSIVE FOR ALL TO public USING ((((tenant_id = get_user_tenant_id()) AND is_tenant_admin()) OR is_super_admin()));
CREATE POLICY "Users can view teams in their tenant" ON public.teams AS PERMISSIVE FOR SELECT TO public USING (((tenant_id = get_user_tenant_id()) OR is_super_admin()));
CREATE POLICY teams_delete_policy ON public.teams AS PERMISSIVE FOR DELETE TO authenticated USING (can_manage_work_teams(tenant_id));
CREATE POLICY teams_insert_policy ON public.teams AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (can_manage_work_teams(tenant_id));
CREATE POLICY teams_select_policy ON public.teams AS PERMISSIVE FOR SELECT TO authenticated USING (((tenant_id = get_user_tenant_id()) OR is_platform_admin()));
CREATE POLICY teams_update_policy ON public.teams AS PERMISSIVE FOR UPDATE TO authenticated USING (can_manage_work_teams(tenant_id)) WITH CHECK (can_manage_work_teams(tenant_id));
CREATE POLICY "Admins can manage tokens" ON public.tenant_access_tokens AS PERMISSIVE FOR ALL TO authenticated USING ((has_public_portal_access(tenant_id) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((COALESCE(p.is_super_admin, false) = true) OR ((p.role)::text = ANY ((ARRAY['platform_owner'::character varying, 'platform_admin'::character varying])::text[])) OR ((p.tenant_id = tenant_access_tokens.tenant_id) AND ((p.role)::text = 'tenant_admin'::text)))))))) WITH CHECK ((has_public_portal_access(tenant_id) AND (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND ((COALESCE(p.is_super_admin, false) = true) OR ((p.role)::text = ANY ((ARRAY['platform_owner'::character varying, 'platform_admin'::character varying])::text[])) OR ((p.tenant_id = tenant_access_tokens.tenant_id) AND ((p.role)::text = 'tenant_admin'::text))))))));
CREATE POLICY "Super admins can manage tenant modules" ON public.tenant_modules AS PERMISSIVE FOR ALL TO public USING (is_super_admin());
CREATE POLICY "Users can view their tenant modules" ON public.tenant_modules AS PERMISSIVE FOR SELECT TO public USING (((tenant_id = get_user_tenant_id()) OR is_super_admin()));
CREATE POLICY tenant_subscriptions_manage ON public.tenant_subscriptions AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['platform_owner'::character varying, 'platform_admin'::character varying])::text[])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['platform_owner'::character varying, 'platform_admin'::character varying])::text[]))))));
CREATE POLICY tenant_subscriptions_read ON public.tenant_subscriptions AS PERMISSIVE FOR SELECT TO authenticated USING (((tenant_id IN ( SELECT profiles.tenant_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND ((profiles.role)::text = ANY ((ARRAY['platform_owner'::character varying, 'platform_admin'::character varying, 'platform_finance'::character varying, 'platform_support'::character varying])::text[])))))));
CREATE POLICY "Super admins can manage tenants" ON public.tenants AS PERMISSIVE FOR ALL TO public USING (is_super_admin());
CREATE POLICY "Super admins can view all tenants" ON public.tenants AS PERMISSIVE FOR SELECT TO public USING (is_super_admin());
CREATE POLICY "Users can view linked tenant for billing" ON public.tenants AS PERMISSIVE FOR SELECT TO public USING ((id IN ( SELECT p.tenant_id
   FROM profiles p
  WHERE (p.id = auth.uid()))));
CREATE POLICY "Users can view own tenant" ON public.tenants AS PERMISSIVE FOR SELECT TO public USING ((id = get_user_tenant_id()));
CREATE POLICY tenants_delete_secure ON public.tenants AS PERMISSIVE FOR DELETE TO authenticated USING (is_platform_admin());
CREATE POLICY tenants_insert_secure ON public.tenants AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_platform_admin());
CREATE POLICY tenants_select_secure ON public.tenants AS PERMISSIVE FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.tenant_id = tenants.id)))) OR can_view_platform_tenants()));
CREATE POLICY tenants_update_secure ON public.tenants AS PERMISSIVE FOR UPDATE TO authenticated USING ((is_platform_admin() OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.tenant_id = tenants.id) AND ((p.role)::text = 'tenant_admin'::text)))))) WITH CHECK ((is_platform_admin() OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.tenant_id = tenants.id) AND ((p.role)::text = 'tenant_admin'::text))))));
CREATE POLICY wo_assets_manage ON public.work_order_assets AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM work_orders wo
  WHERE ((wo.id = work_order_assets.work_order_id) AND pm_can_manage_tenant(wo.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM work_orders wo
  WHERE ((wo.id = work_order_assets.work_order_id) AND pm_can_manage_tenant(wo.tenant_id)))));
CREATE POLICY wo_assets_select ON public.work_order_assets AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM work_orders wo
  WHERE ((wo.id = work_order_assets.work_order_id) AND pm_can_view_tenant(wo.tenant_id)))));
CREATE POLICY wo_attachments_manage ON public.work_order_attachments AS PERMISSIVE FOR ALL TO authenticated USING ((pm_can_manage_tenant(tenant_id) OR (uploaded_by = auth.uid()))) WITH CHECK ((pm_can_manage_tenant(tenant_id) OR (uploaded_by = auth.uid())));
CREATE POLICY wo_attachments_select ON public.work_order_attachments AS PERMISSIVE FOR SELECT TO authenticated USING (pm_can_view_tenant(tenant_id));
CREATE POLICY wo_checks_manage ON public.work_order_checks AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM work_orders wo
  WHERE ((wo.id = work_order_checks.work_order_id) AND pm_can_manage_tenant(wo.tenant_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM work_orders wo
  WHERE ((wo.id = work_order_checks.work_order_id) AND pm_can_manage_tenant(wo.tenant_id)))));
CREATE POLICY wo_checks_select ON public.work_order_checks AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM work_orders wo
  WHERE ((wo.id = work_order_checks.work_order_id) AND pm_can_view_tenant(wo.tenant_id)))));
CREATE POLICY wo_checks_technician_update ON public.work_order_checks AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM work_orders wo
  WHERE ((wo.id = work_order_checks.work_order_id) AND ((wo.assigned_to = auth.uid()) OR pm_can_manage_tenant(wo.tenant_id)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM work_orders wo
  WHERE ((wo.id = work_order_checks.work_order_id) AND ((wo.assigned_to = auth.uid()) OR pm_can_manage_tenant(wo.tenant_id))))));
CREATE POLICY work_order_drafts_select_tenant_scoped ON public.work_order_drafts AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (COALESCE(p.is_active, true) = true) AND ((p.tenant_id = work_order_drafts.tenant_id) OR ((p.role)::text = ANY ((ARRAY['platform_owner'::character varying, 'platform_admin'::character varying, 'platform_support'::character varying])::text[])))))));
CREATE POLICY "Technicians and Managers can add parts" ON public.work_order_parts AS PERMISSIVE FOR INSERT TO public WITH CHECK ((work_order_id IN ( SELECT work_orders.id
   FROM work_orders
  WHERE (work_orders.tenant_id = get_user_tenant_id()))));
CREATE POLICY "Users can view parts for their tenant work orders" ON public.work_order_parts AS PERMISSIVE FOR SELECT TO public USING ((work_order_id IN ( SELECT work_orders.id
   FROM work_orders
  WHERE (work_orders.tenant_id = get_user_tenant_id()))));
CREATE POLICY "Admins can delete work orders" ON public.work_orders AS PERMISSIVE FOR DELETE TO public USING ((((tenant_id = get_user_tenant_id()) AND is_tenant_admin()) OR is_super_admin()));
CREATE POLICY "Users can update assigned work orders" ON public.work_orders AS PERMISSIVE FOR UPDATE TO public USING (((tenant_id = get_user_tenant_id()) AND ((assigned_to = auth.uid()) OR (reported_by = auth.uid()) OR (created_by = auth.uid()) OR is_tenant_admin())));
CREATE POLICY "Users can view work orders in their tenant" ON public.work_orders AS PERMISSIVE FOR SELECT TO public USING (((tenant_id = get_user_tenant_id()) OR is_super_admin()));
CREATE POLICY work_orders_delete_disabled_direct ON public.work_orders AS PERMISSIVE FOR DELETE TO authenticated USING (false);
CREATE POLICY work_orders_insert_disabled_direct ON public.work_orders AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY work_orders_select_scoped ON public.work_orders AS PERMISSIVE FOR SELECT TO authenticated USING (((tenant_id = get_user_tenant_id()) OR is_platform_admin()));
CREATE POLICY work_orders_update_scoped ON public.work_orders AS PERMISSIVE FOR UPDATE TO authenticated USING (can_manage_work_orders_scope(tenant_id)) WITH CHECK ((can_manage_work_orders_scope(tenant_id) AND work_order_asset_location_is_valid(tenant_id, building_id, floor_id, room_id, asset_id)));

-- ===== GRANTS =====
-- ===== TABLE/SEQUENCE/VIEW GRANTS =====
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.asset_activity_logs TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.asset_activity_logs TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.asset_activity_logs TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.asset_activity_logs TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.asset_categories TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.asset_categories TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.asset_categories TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.asset_categories TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.asset_maintenance_history TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.asset_maintenance_history TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.asset_maintenance_history TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.asset_maintenance_history TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.assets TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.assets TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.assets TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.assets TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.billing_add_ons TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.billing_add_ons TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.billing_add_ons TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.billing_add_ons TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.billing_invoices TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.billing_invoices TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.billing_invoices TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.billing_invoices TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.billing_quotes TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.billing_quotes TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.billing_quotes TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.billing_quotes TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.buildings TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.buildings TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.buildings TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.buildings TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.checklist_template_items TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.checklist_template_items TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.checklist_template_items TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.checklist_template_items TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.checklist_template_sections TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.checklist_template_sections TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.checklist_template_sections TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.checklist_template_sections TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.checklist_templates TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.checklist_templates TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.checklist_templates TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.checklist_templates TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.custom_roles TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.custom_roles TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.custom_roles TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.custom_roles TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.departments TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.departments TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.departments TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.departments TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.discount_policies TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.discount_policies TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.discount_policies TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.discount_policies TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.floors TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.floors TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.floors TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.floors TO service_role;
GRANT SELECT ON TABLE public.intake_messages TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.intake_messages TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.intake_messages TO service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.intake_report_number_seq TO postgres;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.intake_report_number_seq TO service_role;
GRANT SELECT ON TABLE public.intake_reports TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.intake_reports TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.intake_reports TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.inventory_categories TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.inventory_categories TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.inventory_categories TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.inventory_categories TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.inventory_items TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.inventory_items TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.inventory_items TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.inventory_items TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.inventory_transactions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.inventory_transactions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.inventory_transactions TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.inventory_transactions TO service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.invoice_number_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.invoice_number_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.invoice_number_seq TO postgres;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.invoice_number_seq TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.issue_types TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.issue_types TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.issue_types TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.issue_types TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.job_plan_items TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.job_plan_items TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.job_plan_items TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.job_plan_items TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.job_plans TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.job_plans TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.job_plans TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.job_plans TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.maintenance_frequency_bundles TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.maintenance_frequency_bundles TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.maintenance_frequency_bundles TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.maintenance_frequency_bundles TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.maintenance_plan_targets TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.maintenance_plan_targets TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.maintenance_plan_targets TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.maintenance_plan_targets TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.maintenance_plans TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.maintenance_plans TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.maintenance_plans TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.maintenance_plans TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.maintenance_task_attachments TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.maintenance_task_attachments TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.maintenance_task_attachments TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.maintenance_task_attachments TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.maintenance_task_checks TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.maintenance_task_checks TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.maintenance_task_checks TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.maintenance_task_checks TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.maintenance_tasks TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.maintenance_tasks TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.maintenance_tasks TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.maintenance_tasks TO service_role;
GRANT SELECT ON TABLE public.notification_logs TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.notification_logs TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.notification_logs TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.notifications TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.notifications TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.notifications TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.notifications TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.operation_logs TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.operation_logs TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.operation_logs TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.operation_logs TO service_role;
GRANT SELECT ON TABLE public.operational_events TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.operational_events TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.operational_events TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.password_reset_otps TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.password_reset_otps TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.password_reset_otps TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.password_reset_otps TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.platform_audit_logs TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.platform_audit_logs TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.platform_audit_logs TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.platform_audit_logs TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.platform_settings TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.platform_settings TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.platform_settings TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.platform_settings TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.platform_staff TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.platform_staff TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.platform_staff TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.platform_staff TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.pm_generation_runs TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.pm_generation_runs TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.pm_generation_runs TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.pm_generation_runs TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.pm_pdf_exports TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.pm_pdf_exports TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.pm_pdf_exports TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.pm_pdf_exports TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.pm_schedule_assets TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.pm_schedule_assets TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.pm_schedule_assets TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.pm_schedule_assets TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.pm_schedules TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.pm_schedules TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.pm_schedules TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.pm_schedules TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.pm_work_order_history TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.pm_work_order_history TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.pm_work_order_history TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.pm_work_order_history TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profiles TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profiles TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profiles TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profiles TO service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.quote_number_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.quote_number_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.quote_number_seq TO postgres;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.quote_number_seq TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.rooms TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.rooms TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.rooms TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.rooms TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.subscription_plans TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.subscription_plans TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.subscription_plans TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.subscription_plans TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_members TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_members TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_members TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.team_members TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.teams TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.teams TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.teams TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.teams TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenant_access_tokens TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenant_access_tokens TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenant_access_tokens TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenant_access_tokens TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenant_modules TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenant_modules TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenant_modules TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenant_modules TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenant_subscriptions TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenant_subscriptions TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenant_subscriptions TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenant_subscriptions TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenants TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenants TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenants TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.tenants TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_custom_roles TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_custom_roles TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_custom_roles TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.user_custom_roles TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.work_order_assets TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.work_order_assets TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.work_order_assets TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.work_order_assets TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.work_order_attachments TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.work_order_attachments TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.work_order_attachments TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.work_order_attachments TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.work_order_checks TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.work_order_checks TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.work_order_checks TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.work_order_checks TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.work_order_costs TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.work_order_costs TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.work_order_costs TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.work_order_costs TO service_role;
GRANT SELECT ON TABLE public.work_order_drafts TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.work_order_drafts TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.work_order_drafts TO service_role;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.work_order_number_seq TO anon;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.work_order_number_seq TO authenticated;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.work_order_number_seq TO postgres;
GRANT SELECT, UPDATE, USAGE ON SEQUENCE public.work_order_number_seq TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.work_order_parts TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.work_order_parts TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.work_order_parts TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.work_order_parts TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.work_orders TO anon;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.work_orders TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.work_orders TO postgres;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.work_orders TO service_role;

-- ===== FUNCTION GRANTS =====
GRANT EXECUTE ON FUNCTION public.approve_work_order_draft(p_draft_id uuid, p_review_note text) TO anon;
GRANT EXECUTE ON FUNCTION public.approve_work_order_draft(p_draft_id uuid, p_review_note text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_work_order_draft(p_draft_id uuid, p_review_note text) TO postgres;
GRANT EXECUTE ON FUNCTION public.approve_work_order_draft(p_draft_id uuid, p_review_note text) TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_work_order_engineer(p_work_order_id uuid, p_notes text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_work_order_engineer(p_work_order_id uuid, p_notes text) TO postgres;
GRANT EXECUTE ON FUNCTION public.approve_work_order_engineer(p_work_order_id uuid, p_notes text) TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_work_order_supervisor(p_work_order_id uuid, p_notes text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_work_order_supervisor(p_work_order_id uuid, p_notes text) TO postgres;
GRANT EXECUTE ON FUNCTION public.approve_work_order_supervisor(p_work_order_id uuid, p_notes text) TO service_role;
GRANT EXECUTE ON FUNCTION public.assign_work_order(p_work_order_id uuid, p_assigned_to uuid, p_assigned_team uuid, p_reason text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_work_order(p_work_order_id uuid, p_assigned_to uuid, p_assigned_team uuid, p_reason text) TO postgres;
GRANT EXECUTE ON FUNCTION public.assign_work_order(p_work_order_id uuid, p_assigned_to uuid, p_assigned_team uuid, p_reason text) TO service_role;
GRANT EXECUTE ON FUNCTION public.auto_close_stale_work_orders() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_close_stale_work_orders() TO postgres;
GRANT EXECUTE ON FUNCTION public.auto_close_stale_work_orders() TO service_role;
GRANT EXECUTE ON FUNCTION public.broadcast_notification(p_target_tenant_id uuid, p_title text, p_message text, p_type text, p_link text, p_specific_user_ids uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.broadcast_notification(p_target_tenant_id uuid, p_title text, p_message text, p_type text, p_link text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.broadcast_notification(p_target_tenant_id uuid, p_title text, p_message text, p_type text, p_link text) TO postgres;
GRANT EXECUTE ON FUNCTION public.broadcast_notification(p_target_tenant_id uuid, p_title text, p_message text, p_type text, p_link text, p_specific_user_ids uuid[]) TO postgres;
GRANT EXECUTE ON FUNCTION public.broadcast_notification(p_target_tenant_id uuid, p_title text, p_message text, p_type text, p_link text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.broadcast_notification(p_target_tenant_id uuid, p_title text, p_message text, p_type text, p_link text, p_specific_user_ids uuid[]) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.broadcast_notification(p_target_tenant_id uuid, p_title text, p_message text, p_type text, p_link text) TO service_role;
GRANT EXECUTE ON FUNCTION public.broadcast_notification(p_target_tenant_id uuid, p_title text, p_message text, p_type text, p_link text, p_specific_user_ids uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_create_work_orders_scope(p_tenant_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.can_create_work_orders_scope(p_tenant_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_create_work_orders_scope(p_tenant_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.can_create_work_orders_scope(p_tenant_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_create_work_orders_scope(p_tenant_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_assets_scope(p_tenant_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.can_manage_assets_scope(p_tenant_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_assets_scope(p_tenant_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.can_manage_assets_scope(p_tenant_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_assets_scope(p_tenant_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_facilities(p_tenant_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.can_manage_facilities(p_tenant_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_facilities(p_tenant_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.can_manage_facilities(p_tenant_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_facilities(p_tenant_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_inventory(p_tenant_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.can_manage_inventory(p_tenant_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_inventory(p_tenant_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.can_manage_inventory(p_tenant_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_inventory(p_tenant_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_work_orders_scope(p_tenant_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.can_manage_work_orders_scope(p_tenant_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_work_orders_scope(p_tenant_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.can_manage_work_orders_scope(p_tenant_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_work_orders_scope(p_tenant_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_work_teams(p_tenant_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.can_manage_work_teams(p_tenant_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_work_teams(p_tenant_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.can_manage_work_teams(p_tenant_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_work_teams(p_tenant_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_view_inventory(p_tenant_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.can_view_inventory(p_tenant_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_inventory(p_tenant_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.can_view_inventory(p_tenant_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_inventory(p_tenant_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_view_platform_tenants() TO anon;
GRANT EXECUTE ON FUNCTION public.can_view_platform_tenants() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_platform_tenants() TO postgres;
GRANT EXECUTE ON FUNCTION public.can_view_platform_tenants() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_platform_tenants() TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_work_order(p_work_order_id uuid, p_reason text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_work_order(p_work_order_id uuid, p_reason text) TO postgres;
GRANT EXECUTE ON FUNCTION public.cancel_work_order(p_work_order_id uuid, p_reason text) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_and_escalate_priority() TO anon;
GRANT EXECUTE ON FUNCTION public.check_and_escalate_priority() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_escalate_priority() TO postgres;
GRANT EXECUTE ON FUNCTION public.check_and_escalate_priority() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_and_escalate_priority() TO service_role;
GRANT EXECUTE ON FUNCTION public.check_subscription_limits(p_tenant_id uuid, p_resource_type character varying) TO anon;
GRANT EXECUTE ON FUNCTION public.check_subscription_limits(p_tenant_id uuid, p_resource_type character varying) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_subscription_limits(p_tenant_id uuid, p_resource_type character varying) TO postgres;
GRANT EXECUTE ON FUNCTION public.check_subscription_limits(p_tenant_id uuid, p_resource_type character varying) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_subscription_limits(p_tenant_id uuid, p_resource_type character varying) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_otps() TO anon;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_otps() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_otps() TO postgres;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_otps() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_otps() TO service_role;
GRANT EXECUTE ON FUNCTION public.close_work_order(p_work_order_id uuid, p_notes text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_work_order(p_work_order_id uuid, p_notes text) TO postgres;
GRANT EXECUTE ON FUNCTION public.close_work_order(p_work_order_id uuid, p_notes text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_pending_registration(p_draft jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_pending_registration(p_draft jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION public.complete_pending_registration(p_draft jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_work_order_technician(p_work_order_id uuid, p_technician_notes text, p_parts jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_work_order_technician(p_work_order_id uuid, p_technician_notes text, p_parts jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION public.complete_work_order_technician(p_work_order_id uuid, p_technician_notes text, p_parts jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_intake_report_from_public_token(p_token text, p_channel text, p_reporter_name text, p_reporter_phone text, p_initial_message text, p_location_hint jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.create_intake_report_from_public_token(p_token text, p_channel text, p_reporter_name text, p_reporter_phone text, p_initial_message text, p_location_hint jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_intake_report_from_public_token(p_token text, p_channel text, p_reporter_name text, p_reporter_phone text, p_initial_message text, p_location_hint jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION public.create_intake_report_from_public_token(p_token text, p_channel text, p_reporter_name text, p_reporter_phone text, p_initial_message text, p_location_hint jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_notification(p_tenant_id uuid, p_user_id uuid, p_title text, p_message text, p_type text, p_link text, p_metadata jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION public.create_notification(p_tenant_id uuid, p_user_id uuid, p_title text, p_message text, p_type text, p_link text, p_metadata jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_operation_log(p_tenant_id uuid, p_work_order_id uuid, p_type character varying, p_description character varying, p_performed_by uuid, p_status character varying) TO postgres;
GRANT EXECUTE ON FUNCTION public.create_operation_log(p_tenant_id uuid, p_work_order_id uuid, p_type character varying, p_description character varying, p_performed_by uuid, p_status character varying) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_work_order(p_work_order jsonb, p_tenant_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_work_order(p_work_order jsonb, p_tenant_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.create_work_order(p_work_order jsonb, p_tenant_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.default_enabled_modules_json() TO anon;
GRANT EXECUTE ON FUNCTION public.default_enabled_modules_json() TO authenticated;
GRANT EXECUTE ON FUNCTION public.default_enabled_modules_json() TO postgres;
GRANT EXECUTE ON FUNCTION public.default_enabled_modules_json() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.default_enabled_modules_json() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_profile_update_permissions() TO anon;
GRANT EXECUTE ON FUNCTION public.enforce_profile_update_permissions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_profile_update_permissions() TO postgres;
GRANT EXECUTE ON FUNCTION public.enforce_profile_update_permissions() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_profile_update_permissions() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_subscription_limits() TO anon;
GRANT EXECUTE ON FUNCTION public.enforce_subscription_limits() TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_subscription_limits() TO postgres;
GRANT EXECUTE ON FUNCTION public.enforce_subscription_limits() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_subscription_limits() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_tenant_subscription_guard() TO anon;
GRANT EXECUTE ON FUNCTION public.enforce_tenant_subscription_guard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_tenant_subscription_guard() TO postgres;
GRANT EXECUTE ON FUNCTION public.enforce_tenant_subscription_guard() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_tenant_subscription_guard() TO service_role;
GRANT EXECUTE ON FUNCTION public.engine_activate(p_tenant_id uuid, p_plan_id uuid, p_billing_cycle character varying, p_source character varying, p_status character varying, p_trial_days integer, p_discount_policy_id uuid, p_quote_id uuid, p_payment_method character varying, p_payment_reference character varying, p_amount numeric, p_admin_note text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engine_activate(p_tenant_id uuid, p_plan_id uuid, p_billing_cycle character varying, p_source character varying, p_status character varying, p_trial_days integer, p_discount_policy_id uuid, p_quote_id uuid, p_payment_method character varying, p_payment_reference character varying, p_amount numeric, p_admin_note text) TO postgres;
GRANT EXECUTE ON FUNCTION public.engine_activate(p_tenant_id uuid, p_plan_id uuid, p_billing_cycle character varying, p_source character varying, p_status character varying, p_trial_days integer, p_discount_policy_id uuid, p_quote_id uuid, p_payment_method character varying, p_payment_reference character varying, p_amount numeric, p_admin_note text) TO service_role;
GRANT EXECUTE ON FUNCTION public.engine_activate_from_quote(p_quote_id uuid, p_period_months integer) TO anon;
GRANT EXECUTE ON FUNCTION public.engine_activate_from_quote(p_quote_id uuid, p_period_months integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engine_activate_from_quote(p_quote_id uuid, p_period_months integer) TO postgres;
GRANT EXECUTE ON FUNCTION public.engine_activate_from_quote(p_quote_id uuid, p_period_months integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.engine_activate_from_quote(p_quote_id uuid, p_period_months integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.engine_approve_quote(p_quote_id uuid, p_admin_notes text) TO anon;
GRANT EXECUTE ON FUNCTION public.engine_approve_quote(p_quote_id uuid, p_admin_notes text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engine_approve_quote(p_quote_id uuid, p_admin_notes text) TO postgres;
GRANT EXECUTE ON FUNCTION public.engine_approve_quote(p_quote_id uuid, p_admin_notes text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.engine_approve_quote(p_quote_id uuid, p_admin_notes text) TO service_role;
GRANT EXECUTE ON FUNCTION public.engine_calculate(p_plan_id uuid, p_billing_cycle character varying, p_add_on_ids uuid[], p_discount_policy_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.engine_calculate(p_plan_id uuid, p_billing_cycle character varying, p_add_on_ids uuid[], p_discount_policy_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engine_calculate(p_plan_id uuid, p_billing_cycle character varying, p_add_on_ids uuid[], p_discount_policy_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.engine_calculate(p_plan_id uuid, p_billing_cycle character varying, p_add_on_ids uuid[], p_discount_policy_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.engine_calculate(p_plan_id uuid, p_billing_cycle character varying, p_add_on_ids uuid[], p_discount_policy_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.engine_cancel(p_tenant_id uuid, p_admin_note text) TO anon;
GRANT EXECUTE ON FUNCTION public.engine_cancel(p_tenant_id uuid, p_admin_note text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engine_cancel(p_tenant_id uuid, p_admin_note text) TO postgres;
GRANT EXECUTE ON FUNCTION public.engine_cancel(p_tenant_id uuid, p_admin_note text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.engine_cancel(p_tenant_id uuid, p_admin_note text) TO service_role;
GRANT EXECUTE ON FUNCTION public.engine_create_quote(p_tenant_id uuid, p_plan_id uuid, p_billing_cycle character varying, p_add_on_ids uuid[], p_discount_policy_id uuid, p_valid_days integer, p_admin_notes text, p_client_notes text) TO anon;
GRANT EXECUTE ON FUNCTION public.engine_create_quote(p_tenant_id uuid, p_plan_id uuid, p_billing_cycle character varying, p_add_on_ids uuid[], p_discount_policy_id uuid, p_valid_days integer, p_admin_notes text, p_client_notes text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engine_create_quote(p_tenant_id uuid, p_plan_id uuid, p_billing_cycle character varying, p_add_on_ids uuid[], p_discount_policy_id uuid, p_valid_days integer, p_admin_notes text, p_client_notes text) TO postgres;
GRANT EXECUTE ON FUNCTION public.engine_create_quote(p_tenant_id uuid, p_plan_id uuid, p_billing_cycle character varying, p_add_on_ids uuid[], p_discount_policy_id uuid, p_valid_days integer, p_admin_notes text, p_client_notes text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.engine_create_quote(p_tenant_id uuid, p_plan_id uuid, p_billing_cycle character varying, p_add_on_ids uuid[], p_discount_policy_id uuid, p_valid_days integer, p_admin_notes text, p_client_notes text) TO service_role;
GRANT EXECUTE ON FUNCTION public.engine_extend_trial(p_tenant_id uuid, p_extra_days integer, p_admin_note text) TO anon;
GRANT EXECUTE ON FUNCTION public.engine_extend_trial(p_tenant_id uuid, p_extra_days integer, p_admin_note text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engine_extend_trial(p_tenant_id uuid, p_extra_days integer, p_admin_note text) TO postgres;
GRANT EXECUTE ON FUNCTION public.engine_extend_trial(p_tenant_id uuid, p_extra_days integer, p_admin_note text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.engine_extend_trial(p_tenant_id uuid, p_extra_days integer, p_admin_note text) TO service_role;
GRANT EXECUTE ON FUNCTION public.facility_location_is_valid(p_tenant_id uuid, p_building_id uuid, p_floor_id uuid, p_room_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.facility_location_is_valid(p_tenant_id uuid, p_building_id uuid, p_floor_id uuid, p_room_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.facility_location_is_valid(p_tenant_id uuid, p_building_id uuid, p_floor_id uuid, p_room_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.facility_location_is_valid(p_tenant_id uuid, p_building_id uuid, p_floor_id uuid, p_room_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.facility_location_is_valid(p_tenant_id uuid, p_building_id uuid, p_floor_id uuid, p_room_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_inventory_stats(check_tenant_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_inventory_stats(check_tenant_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_inventory_stats(check_tenant_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.get_inventory_stats(check_tenant_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_inventory_stats(check_tenant_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO postgres;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_my_tenant_id() TO anon;
GRANT EXECUTE ON FUNCTION public.get_my_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_tenant_id() TO postgres;
GRANT EXECUTE ON FUNCTION public.get_my_tenant_id() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_tenant_id() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_public_tenant_data(p_token text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_tenant_data(p_token text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_tenant_data(p_token text) TO postgres;
GRANT EXECUTE ON FUNCTION public.get_public_tenant_data(p_token text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_tenant_data(p_token text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_runtime_secret(p_name text) TO postgres;
GRANT EXECUTE ON FUNCTION public.get_runtime_secret(p_name text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_tenant_reporting_foundation(p_tenant_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_reporting_foundation(p_tenant_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_reporting_foundation(p_tenant_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.get_tenant_reporting_foundation(p_tenant_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tenant_reporting_foundation(p_tenant_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_tenant_id() TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_tenant_id() TO postgres;
GRANT EXECUTE ON FUNCTION public.get_user_tenant_id() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_tenant_id() TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_work_order_sensitive_fields() TO anon;
GRANT EXECUTE ON FUNCTION public.guard_work_order_sensitive_fields() TO authenticated;
GRANT EXECUTE ON FUNCTION public.guard_work_order_sensitive_fields() TO postgres;
GRANT EXECUTE ON FUNCTION public.guard_work_order_sensitive_fields() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.guard_work_order_sensitive_fields() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO anon;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.has_public_portal_access(p_tenant_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.has_public_portal_access(p_tenant_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_public_portal_access(p_tenant_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.has_public_portal_access(p_tenant_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_public_portal_access(p_tenant_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO postgres;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_platform_staff() TO anon;
GRANT EXECUTE ON FUNCTION public.is_platform_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_staff() TO postgres;
GRANT EXECUTE ON FUNCTION public.is_platform_staff() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_staff() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO postgres;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_tenant_admin() TO anon;
GRANT EXECUTE ON FUNCTION public.is_tenant_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_admin() TO postgres;
GRANT EXECUTE ON FUNCTION public.is_tenant_admin() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_tenant_admin() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_tenant_feature_enabled(p_tenant_id uuid, p_module_code text, p_feature_code text) TO anon;
GRANT EXECUTE ON FUNCTION public.is_tenant_feature_enabled(p_tenant_id uuid, p_module_code text, p_feature_code text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tenant_feature_enabled(p_tenant_id uuid, p_module_code text, p_feature_code text) TO postgres;
GRANT EXECUTE ON FUNCTION public.is_tenant_feature_enabled(p_tenant_id uuid, p_module_code text, p_feature_code text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_tenant_feature_enabled(p_tenant_id uuid, p_module_code text, p_feature_code text) TO service_role;
GRANT EXECUTE ON FUNCTION public.log_platform_action(p_action character varying, p_action_type character varying, p_target_type character varying, p_target_id uuid, p_target_name character varying, p_old_values jsonb, p_new_values jsonb, p_metadata jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.log_platform_action(p_action character varying, p_action_type character varying, p_target_type character varying, p_target_id uuid, p_target_name character varying, p_old_values jsonb, p_new_values jsonb, p_metadata jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_platform_action(p_action character varying, p_action_type character varying, p_target_type character varying, p_target_id uuid, p_target_name character varying, p_old_values jsonb, p_new_values jsonb, p_metadata jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION public.log_platform_action(p_action character varying, p_action_type character varying, p_target_type character varying, p_target_id uuid, p_target_name character varying, p_old_values jsonb, p_new_values jsonb, p_metadata jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_platform_action(p_action character varying, p_action_type character varying, p_target_type character varying, p_target_id uuid, p_target_name character varying, p_old_values jsonb, p_new_values jsonb, p_metadata jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.normalize_plan_module_codes(p_features jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.normalize_plan_module_codes(p_features jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_plan_module_codes(p_features jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION public.normalize_plan_module_codes(p_features jsonb) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_plan_module_codes(p_features jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_on_work_order_assignment() TO postgres;
GRANT EXECUTE ON FUNCTION public.notify_on_work_order_assignment() TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_on_work_order_status_change() TO postgres;
GRANT EXECUTE ON FUNCTION public.notify_on_work_order_status_change() TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_team_on_new_work_order() TO postgres;
GRANT EXECUTE ON FUNCTION public.notify_team_on_new_work_order() TO service_role;
GRANT EXECUTE ON FUNCTION public.plan_enabled_modules_json(p_plan_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.plan_enabled_modules_json(p_plan_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plan_enabled_modules_json(p_plan_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.plan_enabled_modules_json(p_plan_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.plan_enabled_modules_json(p_plan_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.plan_feature_to_module_codes(p_feature text) TO anon;
GRANT EXECUTE ON FUNCTION public.plan_feature_to_module_codes(p_feature text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.plan_feature_to_module_codes(p_feature text) TO postgres;
GRANT EXECUTE ON FUNCTION public.plan_feature_to_module_codes(p_feature text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.plan_feature_to_module_codes(p_feature text) TO service_role;
GRANT EXECUTE ON FUNCTION public.pm_build_task_execution_snapshot(p_task_id uuid, p_skip_auth boolean) TO anon;
GRANT EXECUTE ON FUNCTION public.pm_build_task_execution_snapshot(p_task_id uuid, p_skip_auth boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_build_task_execution_snapshot(p_task_id uuid, p_skip_auth boolean) TO postgres;
GRANT EXECUTE ON FUNCTION public.pm_build_task_execution_snapshot(p_task_id uuid, p_skip_auth boolean) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.pm_build_task_execution_snapshot(p_task_id uuid, p_skip_auth boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.pm_calculate_compliance_stats(p_tenant_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_calculate_compliance_stats(p_tenant_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.pm_calculate_compliance_stats(p_tenant_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pm_calculate_compliance_window(p_frequency_type character varying, p_frequency_interval integer) TO anon;
GRANT EXECUTE ON FUNCTION public.pm_calculate_compliance_window(p_frequency_type character varying, p_frequency_interval integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_calculate_compliance_window(p_frequency_type character varying, p_frequency_interval integer) TO postgres;
GRANT EXECUTE ON FUNCTION public.pm_calculate_compliance_window(p_frequency_type character varying, p_frequency_interval integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.pm_calculate_compliance_window(p_frequency_type character varying, p_frequency_interval integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.pm_calculate_next_due(p_current_due date, p_frequency_type character varying, p_frequency_interval integer) TO anon;
GRANT EXECUTE ON FUNCTION public.pm_calculate_next_due(p_current_due date, p_frequency_type character varying, p_frequency_interval integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_calculate_next_due(p_current_due date, p_frequency_type character varying, p_frequency_interval integer) TO postgres;
GRANT EXECUTE ON FUNCTION public.pm_calculate_next_due(p_current_due date, p_frequency_type character varying, p_frequency_interval integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.pm_calculate_next_due(p_current_due date, p_frequency_type character varying, p_frequency_interval integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.pm_can_execute_task(p_task_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_can_execute_task(p_task_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.pm_can_execute_task(p_task_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pm_can_manage_tenant(p_tenant_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_can_manage_tenant(p_tenant_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.pm_can_manage_tenant(p_tenant_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pm_can_view_task(p_task_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_can_view_task(p_task_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.pm_can_view_task(p_task_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pm_can_view_tenant(p_tenant_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_can_view_tenant(p_tenant_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.pm_can_view_tenant(p_tenant_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pm_cancel_task(p_task_id uuid, p_reason text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_cancel_task(p_task_id uuid, p_reason text) TO postgres;
GRANT EXECUTE ON FUNCTION public.pm_cancel_task(p_task_id uuid, p_reason text) TO service_role;
GRANT EXECUTE ON FUNCTION public.pm_complete_task(p_task_id uuid, p_completion_notes text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_complete_task(p_task_id uuid, p_completion_notes text) TO postgres;
GRANT EXECUTE ON FUNCTION public.pm_complete_task(p_task_id uuid, p_completion_notes text) TO service_role;
GRANT EXECUTE ON FUNCTION public.pm_generate_due_work_orders() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_generate_due_work_orders() TO postgres;
GRANT EXECUTE ON FUNCTION public.pm_generate_due_work_orders() TO service_role;
GRANT EXECUTE ON FUNCTION public.pm_populate_task_checks(p_task_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_populate_task_checks(p_task_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.pm_populate_task_checks(p_task_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pm_populate_task_checks_internal(p_task_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.pm_populate_task_checks_internal(p_task_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pm_record_pdf_export(p_task_id uuid, p_file_name text, p_file_url text, p_rendered_snapshot jsonb, p_results_snapshot jsonb, p_metadata jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_record_pdf_export(p_task_id uuid, p_file_name text, p_file_url text, p_rendered_snapshot jsonb, p_results_snapshot jsonb, p_metadata jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION public.pm_record_pdf_export(p_task_id uuid, p_file_name text, p_file_url text, p_rendered_snapshot jsonb, p_results_snapshot jsonb, p_metadata jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.pm_review_task(p_task_id uuid, p_review_status character varying, p_review_notes text, p_reviewer_signature_url text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_review_task(p_task_id uuid, p_review_status character varying, p_review_notes text, p_reviewer_signature_url text) TO postgres;
GRANT EXECUTE ON FUNCTION public.pm_review_task(p_task_id uuid, p_review_status character varying, p_review_notes text, p_reviewer_signature_url text) TO service_role;
GRANT EXECUTE ON FUNCTION public.pm_start_task(p_task_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_start_task(p_task_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.pm_start_task(p_task_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pm_sync_execution_status() TO anon;
GRANT EXECUTE ON FUNCTION public.pm_sync_execution_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_sync_execution_status() TO postgres;
GRANT EXECUTE ON FUNCTION public.pm_sync_execution_status() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.pm_sync_execution_status() TO service_role;
GRANT EXECUTE ON FUNCTION public.pm_sync_task_from_work_order() TO anon;
GRANT EXECUTE ON FUNCTION public.pm_sync_task_from_work_order() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_sync_task_from_work_order() TO postgres;
GRANT EXECUTE ON FUNCTION public.pm_sync_task_from_work_order() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.pm_sync_task_from_work_order() TO service_role;
GRANT EXECUTE ON FUNCTION public.pm_update_plan_stats(p_plan_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_update_plan_stats(p_plan_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.pm_update_plan_stats(p_plan_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pm_update_plan_status(p_plan_id uuid, p_new_status character varying, p_note text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pm_update_plan_status(p_plan_id uuid, p_new_status character varying, p_note text) TO postgres;
GRANT EXECUTE ON FUNCTION public.pm_update_plan_status(p_plan_id uuid, p_new_status character varying, p_note text) TO service_role;
GRANT EXECUTE ON FUNCTION public.pm_update_template_totals(p_template_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.pm_update_template_totals(p_template_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pm_write_audit_log(p_action text, p_action_type text, p_target_type text, p_target_id uuid, p_metadata jsonb, p_new_values jsonb) TO postgres;
GRANT EXECUTE ON FUNCTION public.pm_write_audit_log(p_action text, p_action_type text, p_target_type text, p_target_id uuid, p_metadata jsonb, p_new_values jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.populate_platform_audit_log_actor() TO anon;
GRANT EXECUTE ON FUNCTION public.populate_platform_audit_log_actor() TO authenticated;
GRANT EXECUTE ON FUNCTION public.populate_platform_audit_log_actor() TO postgres;
GRANT EXECUTE ON FUNCTION public.populate_platform_audit_log_actor() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.populate_platform_audit_log_actor() TO service_role;
GRANT EXECUTE ON FUNCTION public.provision_tenant(p_name text, p_name_ar text, p_slug text, p_email text, p_phone text, p_address text, p_cr_number text, p_tax_number text, p_country text, p_city text, p_postal_code text, p_website text, p_timezone text, p_plan_code text, p_trial_days integer, p_assign_caller_as_admin boolean, p_caller_full_name text, p_caller_phone text) TO anon;
GRANT EXECUTE ON FUNCTION public.provision_tenant(p_name text, p_name_ar text, p_slug text, p_email text, p_phone text, p_address text, p_cr_number text, p_tax_number text, p_country text, p_city text, p_postal_code text, p_website text, p_timezone text, p_plan_code text, p_trial_days integer, p_assign_caller_as_admin boolean, p_caller_full_name text, p_caller_phone text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.provision_tenant(p_name text, p_name_ar text, p_slug text, p_email text, p_phone text, p_address text, p_cr_number text, p_tax_number text, p_country text, p_city text, p_postal_code text, p_website text, p_timezone text, p_plan_code text, p_trial_days integer, p_assign_caller_as_admin boolean, p_caller_full_name text, p_caller_phone text) TO postgres;
GRANT EXECUTE ON FUNCTION public.provision_tenant(p_name text, p_name_ar text, p_slug text, p_email text, p_phone text, p_address text, p_cr_number text, p_tax_number text, p_country text, p_city text, p_postal_code text, p_website text, p_timezone text, p_plan_code text, p_trial_days integer, p_assign_caller_as_admin boolean, p_caller_full_name text, p_caller_phone text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_tenant(p_name text, p_name_ar text, p_slug text, p_email text, p_phone text, p_address text, p_cr_number text, p_tax_number text, p_country text, p_city text, p_postal_code text, p_website text, p_timezone text, p_plan_code text, p_trial_days integer, p_assign_caller_as_admin boolean, p_caller_full_name text, p_caller_phone text) TO service_role;
GRANT EXECUTE ON FUNCTION public.register_new_tenant(p_name_ar text, p_name_en text, p_email text, p_address text, p_cr_number text, p_tax_number text, p_first_name text, p_last_name text, p_phone text, p_country text, p_city text, p_postal_code text, p_website text) TO anon;
GRANT EXECUTE ON FUNCTION public.register_new_tenant(p_name_ar text, p_name_en text, p_email text, p_address text, p_cr_number text, p_tax_number text, p_first_name text, p_last_name text, p_phone text, p_country text, p_city text, p_postal_code text, p_website text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_new_tenant(p_name_ar text, p_name_en text, p_email text, p_address text, p_cr_number text, p_tax_number text, p_first_name text, p_last_name text, p_phone text, p_country text, p_city text, p_postal_code text, p_website text) TO postgres;
GRANT EXECUTE ON FUNCTION public.register_new_tenant(p_name_ar text, p_name_en text, p_email text, p_address text, p_cr_number text, p_tax_number text, p_first_name text, p_last_name text, p_phone text, p_country text, p_city text, p_postal_code text, p_website text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_new_tenant(p_name_ar text, p_name_en text, p_email text, p_address text, p_cr_number text, p_tax_number text, p_first_name text, p_last_name text, p_phone text, p_country text, p_city text, p_postal_code text, p_website text) TO service_role;
GRANT EXECUTE ON FUNCTION public.register_tenant(p_name_ar text, p_name_en text, p_email text, p_address text, p_cr_number text, p_tax_number text) TO anon;
GRANT EXECUTE ON FUNCTION public.register_tenant(p_name_ar text, p_name_en text, p_email text, p_address text, p_cr_number text, p_tax_number text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_tenant(p_name_ar text, p_name_en text, p_email text, p_address text, p_cr_number text, p_tax_number text) TO postgres;
GRANT EXECUTE ON FUNCTION public.register_tenant(p_name_ar text, p_name_en text, p_email text, p_address text, p_cr_number text, p_tax_number text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_tenant(p_name_ar text, p_name_en text, p_email text, p_address text, p_cr_number text, p_tax_number text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reject_work_order(p_work_order_id uuid, p_reason text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_work_order(p_work_order_id uuid, p_reason text) TO postgres;
GRANT EXECUTE ON FUNCTION public.reject_work_order(p_work_order_id uuid, p_reason text) TO service_role;
GRANT EXECUTE ON FUNCTION public.restricted_enabled_modules_json() TO anon;
GRANT EXECUTE ON FUNCTION public.restricted_enabled_modules_json() TO authenticated;
GRANT EXECUTE ON FUNCTION public.restricted_enabled_modules_json() TO postgres;
GRANT EXECUTE ON FUNCTION public.restricted_enabled_modules_json() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.restricted_enabled_modules_json() TO service_role;
GRANT EXECUTE ON FUNCTION public.secure_get_my_tenant_id() TO anon;
GRANT EXECUTE ON FUNCTION public.secure_get_my_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.secure_get_my_tenant_id() TO postgres;
GRANT EXECUTE ON FUNCTION public.secure_get_my_tenant_id() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.secure_get_my_tenant_id() TO service_role;
GRANT EXECUTE ON FUNCTION public.send_email_notification() TO anon;
GRANT EXECUTE ON FUNCTION public.send_email_notification() TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_email_notification() TO postgres;
GRANT EXECUTE ON FUNCTION public.send_email_notification() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_email_notification() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO postgres;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.start_work_order(p_work_order_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_work_order(p_work_order_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.start_work_order(p_work_order_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_intake_report(p_intake_report_id uuid, p_public_access_token text, p_title text, p_description text, p_priority text, p_building_id uuid, p_floor_id uuid, p_department_id uuid, p_room_id uuid, p_asset_id uuid, p_issue_type_id uuid, p_issue_type text, p_reporter_name text, p_reporter_phone text) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_intake_report(p_intake_report_id uuid, p_public_access_token text, p_title text, p_description text, p_priority text, p_building_id uuid, p_floor_id uuid, p_department_id uuid, p_room_id uuid, p_asset_id uuid, p_issue_type_id uuid, p_issue_type text, p_reporter_name text, p_reporter_phone text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_intake_report(p_intake_report_id uuid, p_public_access_token text, p_title text, p_description text, p_priority text, p_building_id uuid, p_floor_id uuid, p_department_id uuid, p_room_id uuid, p_asset_id uuid, p_issue_type_id uuid, p_issue_type text, p_reporter_name text, p_reporter_phone text) TO postgres;
GRANT EXECUTE ON FUNCTION public.submit_intake_report(p_intake_report_id uuid, p_public_access_token text, p_title text, p_description text, p_priority text, p_building_id uuid, p_floor_id uuid, p_department_id uuid, p_room_id uuid, p_asset_id uuid, p_issue_type_id uuid, p_issue_type text, p_reporter_name text, p_reporter_phone text) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_public_work_order(p_token text, p_reporter_name text, p_reporter_phone text, p_description text, p_building_id uuid, p_floor_id uuid, p_asset_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_public_work_order(p_token text, p_reporter_name text, p_reporter_phone text, p_description text, p_building_id uuid, p_floor_id uuid, p_asset_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_public_work_order(p_token text, p_reporter_name text, p_reporter_phone text, p_description text, p_building_id uuid, p_floor_id uuid, p_asset_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.submit_public_work_order(p_token text, p_reporter_name text, p_reporter_phone text, p_description text, p_building_id uuid, p_floor_id uuid, p_asset_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_public_work_order(p_token text, p_reporter_name text, p_reporter_phone text, p_description text, p_building_id uuid, p_floor_id uuid, p_asset_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_maintenance_task_from_work_order() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_maintenance_task_from_work_order() TO postgres;
GRANT EXECUTE ON FUNCTION public.sync_maintenance_task_from_work_order() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_tenant_modules_from_plan() TO anon;
GRANT EXECUTE ON FUNCTION public.sync_tenant_modules_from_plan() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_tenant_modules_from_plan() TO postgres;
GRANT EXECUTE ON FUNCTION public.sync_tenant_modules_from_plan() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_tenant_modules_from_plan() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_tenants_from_subscription() TO anon;
GRANT EXECUTE ON FUNCTION public.sync_tenants_from_subscription() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_tenants_from_subscription() TO postgres;
GRANT EXECUTE ON FUNCTION public.sync_tenants_from_subscription() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_tenants_from_subscription() TO service_role;
GRANT EXECUTE ON FUNCTION public.tenant_has_operational_access(p_tenant_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.tenant_has_operational_access(p_tenant_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_has_operational_access(p_tenant_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.tenant_has_operational_access(p_tenant_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.tenant_has_operational_access(p_tenant_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.trigger_update_plan_stats() TO postgres;
GRANT EXECUTE ON FUNCTION public.trigger_update_plan_stats() TO service_role;
GRANT EXECUTE ON FUNCTION public.trigger_update_template_totals() TO postgres;
GRANT EXECUTE ON FUNCTION public.trigger_update_template_totals() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_asset_status_with_log(p_asset_id uuid, p_new_status text, p_notes text) TO anon;
GRANT EXECUTE ON FUNCTION public.update_asset_status_with_log(p_asset_id uuid, p_new_status text, p_notes text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_asset_status_with_log(p_asset_id uuid, p_new_status text, p_notes text) TO postgres;
GRANT EXECUTE ON FUNCTION public.update_asset_status_with_log(p_asset_id uuid, p_new_status text, p_notes text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_asset_status_with_log(p_asset_id uuid, p_new_status text, p_notes text) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_job_plan_total_items() TO anon;
GRANT EXECUTE ON FUNCTION public.update_job_plan_total_items() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_job_plan_total_items() TO postgres;
GRANT EXECUTE ON FUNCTION public.update_job_plan_total_items() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_job_plan_total_items() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_modified_column() TO anon;
GRANT EXECUTE ON FUNCTION public.update_modified_column() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_modified_column() TO postgres;
GRANT EXECUTE ON FUNCTION public.update_modified_column() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_modified_column() TO service_role;
GRANT EXECUTE ON FUNCTION public.wo_complete(p_wo_id uuid, p_completion_notes text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wo_complete(p_wo_id uuid, p_completion_notes text) TO postgres;
GRANT EXECUTE ON FUNCTION public.wo_complete(p_wo_id uuid, p_completion_notes text) TO service_role;
GRANT EXECUTE ON FUNCTION public.wo_start(p_wo_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wo_start(p_wo_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.wo_start(p_wo_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.work_order_asset_location_is_valid(p_tenant_id uuid, p_building_id uuid, p_floor_id uuid, p_room_id uuid, p_asset_id uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.work_order_asset_location_is_valid(p_tenant_id uuid, p_building_id uuid, p_floor_id uuid, p_room_id uuid, p_asset_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.work_order_asset_location_is_valid(p_tenant_id uuid, p_building_id uuid, p_floor_id uuid, p_room_id uuid, p_asset_id uuid) TO postgres;
GRANT EXECUTE ON FUNCTION public.work_order_asset_location_is_valid(p_tenant_id uuid, p_building_id uuid, p_floor_id uuid, p_room_id uuid, p_asset_id uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.work_order_asset_location_is_valid(p_tenant_id uuid, p_building_id uuid, p_floor_id uuid, p_room_id uuid, p_asset_id uuid) TO service_role;

-- ===== COMMENTS =====
COMMENT ON TABLE public.password_reset_otps IS 'OTP codes for password reset. ACCESS RESTRICTED TO service_role ONLY.
Frontend must use Edge Functions (send-otp, update-password) — never direct access.';
COMMENT ON TABLE public.platform_audit_logs IS 'Audit log for all platform actions';
COMMENT ON TABLE public.platform_staff IS 'Platform staff members with roles and permissions';
COMMENT ON TABLE public.pm_generation_runs IS 'Persistent per-call audit record for pm_generate_due_work_orders(). One row per RPC call. Added by migration 127.';
COMMENT ON TABLE public.work_orders IS 'Work orders are operational memory. Direct authenticated DELETE is disabled for Pilot v1; use audited lifecycle RPCs such as cancel_work_order.';
COMMENT ON COLUMN public.assets.qr_code_url IS 'DEPRECATED: Generate QR client-side from asset_id.';
COMMENT ON COLUMN public.assets.qr_data IS 'DEPRECATED: Generate QR client-side from asset_id.';
COMMENT ON COLUMN public.job_plans.required_parts IS 'Array of required inventory parts/spares. Kept separate from consumable materials.';
COMMENT ON COLUMN public.job_plans.required_tools IS 'Array of required tools. Example: [{"name":"Clamp meter","qty":1}].';
COMMENT ON COLUMN public.job_plans.required_materials IS 'Array of required consumable materials. Example: [{"name":"Cleaning chemical","qty":2,"unit":"L"}].';
COMMENT ON COLUMN public.job_plans.reference_documents IS 'Array of reference docs/SOPs/attachments. Example: [{"label":"OEM manual","url":"..."}].';
COMMENT ON COLUMN public.job_plans.required_skill IS 'Optional skill/certification hint required to execute this job plan.';
COMMENT ON COLUMN public.job_plans.required_role IS 'Optional role hint required to execute this job plan.';
COMMENT ON COLUMN public.maintenance_plans.building_id IS 'DEPRECATED: Use maintenance_plan_targets (target_type=building) instead. Retained for backward compatibility. Do not set on new plans.';
COMMENT ON COLUMN public.maintenance_tasks.recurrence_type IS 'Repeat cadence: once | daily | weekly | monthly | custom (uses recurrence_interval)';
COMMENT ON COLUMN public.maintenance_tasks.recurrence_interval IS 'Interval in days for custom recurrence type (ignored for other types)';
COMMENT ON COLUMN public.maintenance_tasks.checklist IS 'JSON array of checklist steps: [{id: uuid, text: string, text_ar: string, checked: boolean}]';
COMMENT ON COLUMN public.maintenance_tasks.completion_notes IS 'Free-text notes entered by the technician when marking the task as completed';
COMMENT ON COLUMN public.pm_schedules.generation_mode IS 'per_asset = one WO per asset; batch_route = one WO covering all assets on the schedule.';
COMMENT ON COLUMN public.tenant_subscriptions.quote_id IS 'NULL = direct admin activation. Set = subscription was activated from a formal quote.';
COMMENT ON COLUMN public.tenants.settings IS 'Flexible tenant-specific settings as JSONB for customization';
COMMENT ON COLUMN public.work_orders.source_schedule_asset_id IS 'Set for per_asset PM generation; identifies which schedule asset produced this WO.';
COMMENT ON COLUMN public.work_orders.job_plan_snapshot IS 'Frozen copy of execution metadata from job_plans at WO generation time.';
COMMENT ON COLUMN public.work_orders.cancelled_at IS 'Timestamp set by the audited cancel_work_order RPC when a work order is cancelled.';
COMMENT ON COLUMN public.work_orders.cancellation_reason IS 'Required cancellation reason set by the audited cancel_work_order RPC.';
COMMENT ON FUNCTION public.approve_work_order_engineer(p_work_order_id uuid, p_notes text) IS 'Phase 2: Authorized workflow RPC — sets app.work_order_workflow_authorized before UPDATE. Updated by migration 120.';
COMMENT ON FUNCTION public.approve_work_order_supervisor(p_work_order_id uuid, p_notes text) IS 'Phase 2: Authorized workflow RPC — sets app.work_order_workflow_authorized before UPDATE. Updated by migration 120.';
COMMENT ON FUNCTION public.assign_work_order(p_work_order_id uuid, p_assigned_to uuid, p_assigned_team uuid, p_reason text) IS 'Audited tenant work-order assignment authority. Tenant admin and maintenance manager may assign pending, assigned, or on_hold work orders to active same-tenant technicians/engineers and active same-tenant teams. Reassignment after pending requires a reason.';
COMMENT ON FUNCTION public.auto_close_stale_work_orders() IS 'Pilot v1: disabled no-op returning 0. Pre-existing schema bugs (closed_at and closed_notes columns do not exist) and aggressive in_progress/on_hold auto-close prevented safe use. Reporter closure is manual via close_work_order. See migration 126 for re-enable path. Added by migration 126.';
COMMENT ON FUNCTION public.cancel_work_order(p_work_order_id uuid, p_reason text) IS 'Audited tenant work-order cancellation authority. Tenant admin and maintenance manager may cancel pending, assigned, or on_hold work orders with a required reason. In-progress and closed-equivalent statuses are denied.';
COMMENT ON FUNCTION public.check_and_escalate_priority() IS 'Escalates priority of unresponded work orders based on tenant settings. Should run hourly via cron.';
COMMENT ON FUNCTION public.close_work_order(p_work_order_id uuid, p_notes text) IS 'Phase 2: Authorized workflow RPC — sets app.work_order_workflow_authorized before UPDATE. Reporter/management authority enforced. Updated by migration 120.';
COMMENT ON FUNCTION public.complete_work_order_technician(p_work_order_id uuid, p_technician_notes text, p_parts jsonb) IS 'Phase 2: Authorized workflow RPC — sets app.work_order_workflow_authorized before UPDATE. Tenant, role, assignment, and status guards enforced. Parts consumption validated. Operation log written. Updated by migration 120.';
COMMENT ON FUNCTION public.create_operation_log(p_tenant_id uuid, p_work_order_id uuid, p_type character varying, p_description character varying, p_performed_by uuid, p_status character varying) IS 'Internal operation log helper. Direct execute is revoked from PUBLIC, anon, and authenticated; authorized RPCs call it internally.';
COMMENT ON FUNCTION public.create_work_order(p_work_order jsonb, p_tenant_id uuid) IS 'Audited authenticated work-order creation authority. Tenant users create in their own tenant; platform owner/admin may pass p_tenant_id. Status always starts as pending. Initial assigned_team is accepted only as compatibility context; full assignment RPC remains pending.';
COMMENT ON FUNCTION public.get_inventory_stats(check_tenant_id uuid) IS 'Returns inventory statistics using tenant-specific low stock threshold settings';
COMMENT ON FUNCTION public.get_public_tenant_data(p_token text) IS 'Returns public portal data only when the token is active and the tenant has the public_portal entitlement.';
COMMENT ON FUNCTION public.guard_work_order_sensitive_fields() IS 'Blocks direct updates to workflow-sensitive work_orders fields unless an approved workflow RPC sets transaction-local app.work_order_workflow_authorized=true. Updated by migration 124 to include cancellation fields.';
COMMENT ON FUNCTION public.has_public_portal_access(p_tenant_id uuid) IS 'Returns TRUE only when the tenant subscription/modules explicitly allow the public portal experience.';
COMMENT ON FUNCTION public.is_tenant_feature_enabled(p_tenant_id uuid, p_module_code text, p_feature_code text) IS 'Returns TRUE only when the tenant module is enabled and the specific feature flag is enabled. Fails closed.';
COMMENT ON FUNCTION public.notify_team_on_new_work_order() IS 'Safely notifies active same-tenant team members on work-order insert. No-op when assigned_team is NULL.';
COMMENT ON FUNCTION public.pm_generate_due_work_orders() IS 'Generates due PM work orders. Tenant-scoped for authenticated users; all-tenant for service/platform. Writes one operation_log per generated WO (type=pm_generate) and one pm_generation_runs row per call. Updated by migration 127.';
COMMENT ON FUNCTION public.reject_work_order(p_work_order_id uuid, p_reason text) IS 'Phase 2: Authorized workflow RPC — sets app.work_order_workflow_authorized before all CASE-branch UPDATEs. Rejection reason required. Updated by migration 120.';
COMMENT ON FUNCTION public.start_work_order(p_work_order_id uuid) IS 'Starts a pending/assigned work order with tenant isolation, status guard, direct-assignee authorization, assigned-team membership authorization, and tenant management override.';
COMMENT ON FUNCTION public.submit_public_work_order(p_token text, p_reporter_name text, p_reporter_phone text, p_description text, p_building_id uuid, p_floor_id uuid, p_asset_id uuid) IS 'Submits a public work order only when the token is active and the tenant has the public_portal entitlement.';
