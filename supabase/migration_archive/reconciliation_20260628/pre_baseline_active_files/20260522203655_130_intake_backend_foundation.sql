-- MVP 0 Field Intake Backend Foundation
-- Creates the bounded intake layer before the existing work_orders core.

CREATE SEQUENCE IF NOT EXISTS public.intake_report_number_seq;

CREATE TABLE IF NOT EXISTS public.intake_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  access_token_id UUID REFERENCES public.tenant_access_tokens(id) ON DELETE SET NULL,
  report_number TEXT NOT NULL,
  public_access_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  channel TEXT NOT NULL DEFAULT 'pwa_qr'
    CHECK (channel IN ('pwa_qr', 'public_portal', 'manual')),
  status TEXT NOT NULL DEFAULT 'collecting'
    CHECK (status IN (
      'collecting',
      'awaiting_confirmation',
      'in_review',
      'needs_reporter_info',
      'converted_to_work_order',
      'closed',
      'cancelled'
    )),
  reporter_identity_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (reporter_identity_status IN ('known', 'unknown', 'needs_verification')),
  current_step TEXT NOT NULL DEFAULT 'collecting',
  reporter_name TEXT,
  reporter_phone TEXT,
  initial_message TEXT,
  location_hint JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  converted_work_order_id UUID REFERENCES public.work_orders(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, report_number),
  UNIQUE (public_access_token)
);

CREATE TABLE IF NOT EXISTS public.intake_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  intake_report_id UUID NOT NULL REFERENCES public.intake_reports(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound', 'internal')),
  message_type TEXT NOT NULL DEFAULT 'text'
    CHECK (message_type IN ('text', 'system', 'confirmation', 'attachment_placeholder')),
  body TEXT,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.work_order_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  intake_report_id UUID NOT NULL REFERENCES public.intake_reports(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'ready_for_review'
    CHECK (status IN (
      'ready_for_review',
      'needs_info',
      'approved',
      'converted',
      'rejected',
      'cancelled'
    )),
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  issue_type_id UUID REFERENCES public.issue_types(id) ON DELETE SET NULL,
  issue_type TEXT,
  building_id UUID REFERENCES public.buildings(id) ON DELETE SET NULL,
  floor_id UUID REFERENCES public.floors(id) ON DELETE SET NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  asset_id UUID REFERENCES public.assets(id) ON DELETE SET NULL,
  reporter_name TEXT,
  reporter_phone TEXT,
  supervisor_note TEXT,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  converted_work_order_id UUID REFERENCES public.work_orders(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (intake_report_id)
);

CREATE TABLE IF NOT EXISTS public.operational_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL
    CHECK (entity_type IN ('intake_report', 'intake_message', 'work_order_draft', 'work_order', 'notification')),
  entity_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL DEFAULT 'system'
    CHECK (actor_type IN ('reporter', 'user', 'system')),
  actor_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'intake_backend',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  recipient_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('in_app', 'email', 'sms', 'manual')),
  template_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'skipped', 'cancelled')),
  related_entity_type TEXT,
  related_entity_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intake_reports_tenant_status
  ON public.intake_reports(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_intake_reports_converted_work_order
  ON public.intake_reports(converted_work_order_id);
CREATE INDEX IF NOT EXISTS idx_intake_messages_report_created
  ON public.intake_messages(intake_report_id, created_at);
CREATE INDEX IF NOT EXISTS idx_work_order_drafts_tenant_status
  ON public.work_order_drafts(tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_order_drafts_converted_work_order
  ON public.work_order_drafts(converted_work_order_id);
CREATE INDEX IF NOT EXISTS idx_operational_events_tenant_entity
  ON public.operational_events(tenant_id, entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_logs_tenant_status
  ON public.notification_logs(tenant_id, status, queued_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_logs_related
  ON public.notification_logs(related_entity_type, related_entity_id);

ALTER TABLE public.intake_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.intake_reports TO authenticated;
GRANT SELECT ON public.intake_messages TO authenticated;
GRANT SELECT ON public.work_order_drafts TO authenticated;
GRANT SELECT ON public.operational_events TO authenticated;
GRANT SELECT ON public.notification_logs TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.intake_reports TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intake_messages TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_order_drafts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operational_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_logs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.intake_report_number_seq TO service_role;

DROP POLICY IF EXISTS intake_reports_select_tenant_scoped ON public.intake_reports;
CREATE POLICY intake_reports_select_tenant_scoped
  ON public.intake_reports
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.is_active, true) = true
        AND (
          p.tenant_id = intake_reports.tenant_id
          OR p.role IN ('platform_owner', 'platform_admin', 'platform_support')
        )
    )
  );

DROP POLICY IF EXISTS intake_messages_select_tenant_scoped ON public.intake_messages;
CREATE POLICY intake_messages_select_tenant_scoped
  ON public.intake_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.is_active, true) = true
        AND (
          p.tenant_id = intake_messages.tenant_id
          OR p.role IN ('platform_owner', 'platform_admin', 'platform_support')
        )
    )
  );

DROP POLICY IF EXISTS work_order_drafts_select_tenant_scoped ON public.work_order_drafts;
CREATE POLICY work_order_drafts_select_tenant_scoped
  ON public.work_order_drafts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.is_active, true) = true
        AND (
          p.tenant_id = work_order_drafts.tenant_id
          OR p.role IN ('platform_owner', 'platform_admin', 'platform_support')
        )
    )
  );

DROP POLICY IF EXISTS operational_events_select_tenant_scoped ON public.operational_events;
CREATE POLICY operational_events_select_tenant_scoped
  ON public.operational_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.is_active, true) = true
        AND (
          p.tenant_id = operational_events.tenant_id
          OR p.role IN ('platform_owner', 'platform_admin', 'platform_support')
        )
    )
  );

DROP POLICY IF EXISTS notification_logs_select_tenant_scoped ON public.notification_logs;
CREATE POLICY notification_logs_select_tenant_scoped
  ON public.notification_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND COALESCE(p.is_active, true) = true
        AND (
          p.tenant_id = notification_logs.tenant_id
          OR p.role IN ('platform_owner', 'platform_admin', 'platform_support')
        )
    )
  );

CREATE OR REPLACE FUNCTION public.create_intake_report_from_public_token(
  p_token TEXT,
  p_channel TEXT DEFAULT 'pwa_qr',
  p_reporter_name TEXT DEFAULT NULL,
  p_reporter_phone TEXT DEFAULT NULL,
  p_initial_message TEXT DEFAULT NULL,
  p_location_hint JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.submit_intake_report(
  p_intake_report_id UUID,
  p_public_access_token TEXT,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_priority TEXT DEFAULT 'medium',
  p_building_id UUID DEFAULT NULL,
  p_floor_id UUID DEFAULT NULL,
  p_department_id UUID DEFAULT NULL,
  p_room_id UUID DEFAULT NULL,
  p_asset_id UUID DEFAULT NULL,
  p_issue_type_id UUID DEFAULT NULL,
  p_issue_type TEXT DEFAULT NULL,
  p_reporter_name TEXT DEFAULT NULL,
  p_reporter_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.approve_work_order_draft(
  p_draft_id UUID,
  p_review_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.create_intake_report_from_public_token(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_intake_report(UUID, TEXT, TEXT, TEXT, TEXT, UUID, UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_work_order_draft(UUID, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_intake_report_from_public_token(TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_intake_report(UUID, TEXT, TEXT, TEXT, TEXT, UUID, UUID, UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_work_order_draft(UUID, TEXT) TO authenticated, service_role;
