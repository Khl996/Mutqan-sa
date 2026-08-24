-- P0 Proof of Work authority adversarial verification.
-- Run after 20260824180500 in the isolated PostgreSQL 17 replay database.

\set ON_ERROR_STOP on

BEGIN;

DO $assert_catalog$
DECLARE
    v_definition text;
BEGIN
    SELECT lower(pg_get_functiondef(
        'public.guard_work_order_sensitive_fields()'::regprocedure
    )) INTO v_definition;

    IF position('pdf_snapshot' IN v_definition) = 0
       OR position('pdf_generated_at' IN v_definition) = 0
       OR position('pdf_version' IN v_definition) = 0
       OR position('pdf_file_url' IN v_definition) = 0
       OR position('reporter_image_url' IN v_definition) = 0
       OR position('before_images' IN v_definition) = 0
       OR position('after_images' IN v_definition) = 0
    THEN
        RAISE EXCEPTION 'Proof of Work fields are not protected by the work-order guard';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'public.work_orders'::regclass
           AND conname = 'work_orders_pdf_snapshot_minimum_shape'
    ) THEN
        RAISE EXCEPTION 'minimum closure-snapshot shape constraint is missing';
    END IF;

    SELECT lower(pg_get_functiondef(
        'public.seal_work_order_proof_identity()'::regprocedure
    )) INTO v_definition;

    IF position('contract_version' IN v_definition) = 0
       OR position('new.title' IN v_definition) = 0
       OR position('new.asset_id' IN v_definition) = 0
       OR position('new.pdf_snapshot is distinct from old.pdf_snapshot' IN v_definition) = 0
    THEN
        RAISE EXCEPTION 'Proof of Work identity sealing is incomplete';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_policies
         WHERE schemaname = 'storage'
           AND tablename = 'objects'
           AND policyname IN ('work_order_pdfs_insert', 'work_order_pdfs_update')
    ) THEN
        RAISE EXCEPTION 'authenticated client PDF write policies still exist';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = 'operation_logs'
           AND policyname IN ('Users can create operation logs', 'operation_logs_insert_scoped')
    ) OR has_table_privilege('authenticated', 'public.operation_logs', 'INSERT')
      OR has_table_privilege('anon', 'public.operation_logs', 'INSERT')
    THEN
        RAISE EXCEPTION 'operation log direct-insert authority is still exposed';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM storage.buckets
         WHERE id = 'work-order-pdfs'
           AND public IS TRUE
    ) THEN
        RAISE EXCEPTION 'work-order-pdfs bucket is public';
    END IF;

    IF has_function_privilege('anon', 'public.is_technician_role()', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.is_technician_role()', 'EXECUTE')
       OR has_function_privilege('service_role', 'public.is_technician_role()', 'EXECUTE')
    THEN
        RAISE EXCEPTION 'technician RLS helper ACL is not explicit and minimal';
    END IF;

    IF has_function_privilege(
           'anon',
           'public.close_work_order(uuid,text)',
           'EXECUTE'
       )
       OR NOT has_function_privilege(
           'authenticated',
           'public.close_work_order(uuid,text)',
           'EXECUTE'
       )
    THEN
        RAISE EXCEPTION 'close_work_order ACL is not explicit and minimal';
    END IF;
END;
$assert_catalog$;

SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', '', true);
SELECT set_config('request.jwt.claim.email', '', true);

INSERT INTO public.tenants (
    id, name, slug, subscription_status, trial_ends_at, is_active
) VALUES (
    '34000000-0000-4000-8000-000000000001',
    'P0 Proof Authority Tenant',
    'p0-proof-authority-tenant',
    'trial',
    now() + interval '30 days',
    true
);

INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at)
VALUES
    (
        '34000000-0000-4000-8000-000000000002',
        'p0-proof-technician@example.invalid',
        '{"full_name":"P0 Proof Technician"}'::jsonb,
        now()
    ),
    (
        '34000000-0000-4000-8000-000000000010',
        'p0-proof-inactive@example.invalid',
        '{"full_name":"P0 Proof Inactive Reporter"}'::jsonb,
        now()
    );

UPDATE public.profiles
   SET tenant_id = '34000000-0000-4000-8000-000000000001',
       role = 'technician',
       is_active = true
 WHERE id = '34000000-0000-4000-8000-000000000002';

UPDATE public.profiles
   SET tenant_id = '34000000-0000-4000-8000-000000000001',
       role = 'reporter',
       is_active = false
 WHERE id = '34000000-0000-4000-8000-000000000010';

INSERT INTO public.assets (id, tenant_id, code, name, name_ar)
VALUES
    (
        '34000000-0000-4000-8000-000000000006',
        '34000000-0000-4000-8000-000000000001',
        'PROOF-ASSET-A',
        'Proof Asset A',
        'أصل الإثبات أ'
    ),
    (
        '34000000-0000-4000-8000-000000000007',
        '34000000-0000-4000-8000-000000000001',
        'PROOF-ASSET-B',
        'Proof Asset B',
        'أصل الإثبات ب'
    );

DO $assert_malformed_snapshot_rejected$
BEGIN
    BEGIN
        INSERT INTO public.work_orders (
            id, tenant_id, code, title, status, priority, work_type,
            assigned_to, reported_by, completed_at, pdf_snapshot
        ) VALUES (
            '34000000-0000-4000-8000-000000000004',
            '34000000-0000-4000-8000-000000000001',
            'P0-PROOF-MALFORMED',
            'Malformed proof fixture',
            'completed',
            'medium',
            'reactive',
            '34000000-0000-4000-8000-000000000002',
            '34000000-0000-4000-8000-000000000002',
            now(),
            jsonb_build_object(
                'code', 'P0-PROOF-MALFORMED',
                'priority', 'medium',
                'closed_at', now()
            )
        );
        RAISE EXCEPTION 'snapshot without closed_by passed the shape constraint';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    BEGIN
        INSERT INTO public.work_orders (
            id, tenant_id, code, title, status, priority, work_type,
            assigned_to, reported_by, completed_at, pdf_snapshot
        ) VALUES (
            '34000000-0000-4000-8000-000000000005',
            '34000000-0000-4000-8000-000000000001',
            'P0-PROOF-NO-PRIORITY',
            'Missing priority proof fixture',
            'completed',
            'medium',
            'reactive',
            '34000000-0000-4000-8000-000000000002',
            '34000000-0000-4000-8000-000000000002',
            now(),
            jsonb_build_object(
                'code', 'P0-PROOF-NO-PRIORITY',
                'closed_at', now(),
                'closed_by', jsonb_build_object(
                    'id', '34000000-0000-4000-8000-000000000002',
                    'full_name', 'P0 Proof Technician'
                )
            )
        );
        RAISE EXCEPTION 'snapshot without priority passed the shape constraint';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;
END;
$assert_malformed_snapshot_rejected$;

-- Exercise the real RPC transition boundary, not only trigger metadata. The
-- replacement close_work_order() builds the accepted historical shape and the
-- forward trigger must seal its subject as contract v2 before constraints run.
INSERT INTO public.work_orders (
    id, tenant_id, code, title, status, priority, work_type,
    assigned_to, reported_by, asset_id
) VALUES (
    '34000000-0000-4000-8000-000000000008',
    '34000000-0000-4000-8000-000000000001',
    'P0-PROOF-TRANSITION',
    'Transition proof title',
    'pending_reporter_closure',
    'high',
    'reactive',
    '34000000-0000-4000-8000-000000000002',
    '34000000-0000-4000-8000-000000000002',
    '34000000-0000-4000-8000-000000000006'
);

SELECT set_config(
    'request.jwt.claim.sub', '34000000-0000-4000-8000-000000000002', true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.email', 'p0-proof-technician@example.invalid', true);
SET LOCAL ROLE authenticated;

SELECT public.close_work_order(
    '34000000-0000-4000-8000-000000000008'::uuid,
    'Accepted reporter closure'
);

DO $assert_closed_replay_denied$
BEGIN
    BEGIN
        PERFORM public.close_work_order(
            '34000000-0000-4000-8000-000000000008'::uuid,
            'Conflicting replay'
        );
        RAISE EXCEPTION 'a second close_work_order replay replaced the sealed proof';
    EXCEPTION
        WHEN SQLSTATE '22023' THEN NULL;
    END;
END;
$assert_closed_replay_denied$;

RESET ROLE;

DO $assert_transition_sealed_v2$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM public.work_orders
         WHERE id = '34000000-0000-4000-8000-000000000008'
           AND pdf_snapshot ->> 'contract_version' = '2'
           AND pdf_snapshot ->> 'title' = 'Transition proof title'
           AND pdf_snapshot #>> '{asset,id}' = '34000000-0000-4000-8000-000000000006'
           AND pdf_snapshot #>> '{asset,code}' = 'PROOF-ASSET-A'
           AND pdf_snapshot #>> '{asset,name}' = 'Proof Asset A'
    ) THEN
        RAISE EXCEPTION 'completed transition was not sealed as Proof of Work contract v2';
    END IF;
END;
$assert_transition_sealed_v2$;

-- A suspended reporter remains denied even though the JWT, role, tenant and
-- reported_by relationship would otherwise authorize the same RPC.
INSERT INTO public.work_orders (
    id, tenant_id, code, title, status, priority, work_type,
    assigned_to, reported_by, asset_id
) VALUES (
    '34000000-0000-4000-8000-000000000009',
    '34000000-0000-4000-8000-000000000001',
    'P0-PROOF-INACTIVE',
    'Inactive reporter proof title',
    'pending_reporter_closure',
    'medium',
    'reactive',
    '34000000-0000-4000-8000-000000000010',
    '34000000-0000-4000-8000-000000000010',
    '34000000-0000-4000-8000-000000000006'
);

SELECT set_config(
    'request.jwt.claim.sub', '34000000-0000-4000-8000-000000000010', true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.email', 'p0-proof-inactive@example.invalid', true);
SET LOCAL ROLE authenticated;

DO $assert_inactive_close_denied$
BEGIN
    BEGIN
        PERFORM public.close_work_order(
            '34000000-0000-4000-8000-000000000009'::uuid,
            'Suspended actor closure'
        );
        RAISE EXCEPTION 'inactive reporter closed a work order';
    EXCEPTION
        WHEN SQLSTATE '28000' THEN NULL;
    END;
END;
$assert_inactive_close_denied$;

RESET ROLE;

DO $assert_inactive_close_state_preserved$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM public.work_orders
         WHERE id = '34000000-0000-4000-8000-000000000009'
           AND status = 'pending_reporter_closure'
           AND COALESCE(pdf_snapshot, '{}'::jsonb) = '{}'::jsonb
    ) THEN
        RAISE EXCEPTION 'inactive closure denial changed work-order proof state';
    END IF;
END;
$assert_inactive_close_state_preserved$;

-- Leave the suspended JWT context before exercising postgres-owned workflow
-- and fixture paths. This ensures the next denial comes from the proof seal,
-- not from the independent active-actor trigger.
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', '', true);
SELECT set_config('request.jwt.claim.email', '', true);

-- Model the write that a losing concurrent SECURITY DEFINER execution would
-- attempt after the first closure commits. The proof seal must reject it even
-- for postgres-owned workflow code, so no v2-to-v1 downgrade is possible.
DO $assert_sealed_snapshot_overwrite_denied$
BEGIN
    BEGIN
        UPDATE public.work_orders
           SET pdf_snapshot = jsonb_build_object(
               'code', 'P0-PROOF-TRANSITION',
               'priority', 'high',
               'closed_at', now(),
               'closed_by', jsonb_build_object(
                   'id', '34000000-0000-4000-8000-000000000002',
                   'full_name', 'P0 Proof Technician'
               )
           )
         WHERE id = '34000000-0000-4000-8000-000000000008';
        RAISE EXCEPTION 'postgres workflow path replaced a sealed v2 snapshot';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;
END;
$assert_sealed_snapshot_overwrite_denied$;

INSERT INTO public.work_orders (
    id, tenant_id, code, title, status, priority, work_type,
    assigned_to, reported_by, asset_id, completed_at, pdf_snapshot
) VALUES (
    '34000000-0000-4000-8000-000000000003',
    '34000000-0000-4000-8000-000000000001',
    'P0-PROOF-WO-1',
    'Original proof title',
    'completed',
    'medium',
    'reactive',
    '34000000-0000-4000-8000-000000000002',
    '34000000-0000-4000-8000-000000000002',
    '34000000-0000-4000-8000-000000000006',
    now(),
    jsonb_build_object(
        'contract_version', 2,
        'code', 'P0-PROOF-WO-1',
        'title', 'Original proof title',
        'priority', 'medium',
        'closed_at', now(),
        'asset', jsonb_build_object(
            'id', '34000000-0000-4000-8000-000000000006',
            'code', 'PROOF-ASSET-A',
            'name', 'Proof Asset A'
        ),
        'closed_by', jsonb_build_object(
            'id', '34000000-0000-4000-8000-000000000002',
            'full_name', 'P0 Proof Technician'
        )
    )
);

SELECT set_config(
    'request.jwt.claim.sub', '34000000-0000-4000-8000-000000000002', true
);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.email', 'p0-proof-technician@example.invalid', true);
SET LOCAL ROLE authenticated;

-- Prove this actor can reach the row through the involved-user UPDATE policy;
-- the following denials therefore come from the sensitive-field guard.
UPDATE public.work_orders
   SET description = 'Allowed metadata update'
 WHERE id = '34000000-0000-4000-8000-000000000003';

DO $assert_direct_proof_updates_denied$
BEGIN
    BEGIN
        UPDATE public.work_orders
           SET title = 'Rebound proof title'
         WHERE id = '34000000-0000-4000-8000-000000000003';
        RAISE EXCEPTION 'authenticated actor rebound the proof title';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;

    BEGIN
        UPDATE public.work_orders
           SET reporter_image_url = 'tracking-token/reporter/forged-reporter.jpg'
         WHERE id = '34000000-0000-4000-8000-000000000003';
        RAISE EXCEPTION 'authenticated actor forged reporter image evidence';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;

    BEGIN
        UPDATE public.work_orders
           SET after_images = jsonb_build_array(
               'tracking-token/after/forged-after-photo.jpg'
           )
         WHERE id = '34000000-0000-4000-8000-000000000003';
        RAISE EXCEPTION 'authenticated actor forged after-image evidence';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;

    BEGIN
        UPDATE public.work_orders
           SET pdf_snapshot = jsonb_build_object(
               'code', 'FORGED',
               'priority', 'urgent',
               'closed_at', now(),
               'closed_by', jsonb_build_object('id', auth.uid(), 'full_name', 'Forged')
           )
         WHERE id = '34000000-0000-4000-8000-000000000003';
        RAISE EXCEPTION 'authenticated actor forged pdf_snapshot';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;

    BEGIN
        UPDATE public.work_orders
           SET pdf_generated_at = now(),
               pdf_version = 999,
               pdf_file_url = '34000000-0000-4000-8000-000000000001/forged.pdf'
         WHERE id = '34000000-0000-4000-8000-000000000003';
        RAISE EXCEPTION 'authenticated actor forged PDF metadata';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;

    BEGIN
        UPDATE public.work_orders
           SET before_images = jsonb_build_array(
               'https://attacker.invalid/forged-before-photo.jpg'
           )
         WHERE id = '34000000-0000-4000-8000-000000000003';
        RAISE EXCEPTION 'authenticated actor forged closure evidence references';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;

    BEGIN
        INSERT INTO public.operation_logs (
            tenant_id, code, type, description, work_order_id,
            performed_by, timestamp, status
        ) VALUES (
            '34000000-0000-4000-8000-000000000001',
            'FORGED-PROOF-LOG',
            'maintenance',
            'Forged evidence',
            '34000000-0000-4000-8000-000000000003',
            auth.uid(),
            now() - interval '1 day',
            'completed'
        );
        RAISE EXCEPTION 'authenticated actor inserted forged operation evidence';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;
END;
$assert_direct_proof_updates_denied$;

RESET ROLE;

-- Even tenant management authority may not rebind an already closed proof to
-- another asset. This reaches past the governance-input authority check and is
-- denied by the proof-identity seal.
UPDATE public.profiles
   SET role = 'tenant_admin'
 WHERE id = '34000000-0000-4000-8000-000000000002';

SET LOCAL ROLE authenticated;

DO $assert_asset_rebinding_denied$
BEGIN
    BEGIN
        UPDATE public.work_orders
           SET asset_id = '34000000-0000-4000-8000-000000000007'
         WHERE id = '34000000-0000-4000-8000-000000000003';
        RAISE EXCEPTION 'tenant manager rebound the proof asset';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;
END;
$assert_asset_rebinding_denied$;

RESET ROLE;

DO $assert_unchanged$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM public.work_orders
         WHERE id = '34000000-0000-4000-8000-000000000003'
           AND title = 'Original proof title'
           AND description = 'Allowed metadata update'
           AND asset_id = '34000000-0000-4000-8000-000000000006'
           AND pdf_snapshot ->> 'code' = 'P0-PROOF-WO-1'
           AND pdf_snapshot ->> 'title' = 'Original proof title'
           AND pdf_snapshot #>> '{asset,id}' = '34000000-0000-4000-8000-000000000006'
           AND pdf_generated_at IS NULL
           AND COALESCE(pdf_version, 0) = 0
           AND pdf_file_url IS NULL
    ) THEN
        RAISE EXCEPTION 'proof fields changed despite direct-update denial';
    END IF;
END;
$assert_unchanged$;

ROLLBACK;
