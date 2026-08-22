-- P0 runtime-secret reconciliation assertions.
BEGIN;

DO $test$
DECLARE
    v_value text;
    v_role text;
    v_privilege text;
    v_function_owner text;
    v_function_security_definer boolean;
    v_function_config text[];
BEGIN
    IF pg_catalog.to_regclass('internal.runtime_secrets') IS NULL THEN
        RAISE EXCEPTION 'internal.runtime_secrets is missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_catalog.pg_class c
         WHERE c.oid = 'internal.runtime_secrets'::regclass
           AND c.relrowsecurity
    ) THEN
        RAISE EXCEPTION 'internal.runtime_secrets must have RLS enabled';
    END IF;

    IF has_schema_privilege('anon', 'internal', 'USAGE')
       OR has_schema_privilege('authenticated', 'internal', 'USAGE')
       OR has_schema_privilege('service_role', 'internal', 'USAGE') THEN
        RAISE EXCEPTION 'Runtime-secret schema leaked to a non-owner role';
    END IF;

    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
        FOREACH v_privilege IN ARRAY ARRAY[
            'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
        ] LOOP
            IF has_table_privilege(v_role, 'internal.runtime_secrets', v_privilege) THEN
                RAISE EXCEPTION 'Runtime-secret table leaked % to role %', v_privilege, v_role;
            END IF;
        END LOOP;
    END LOOP;

    IF has_function_privilege('anon', 'public.get_runtime_secret(text)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.get_runtime_secret(text)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.get_runtime_secret(text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'Runtime-secret function ACL is incorrect';
    END IF;

    SELECT owner_role.rolname, proc.prosecdef, proc.proconfig
      INTO v_function_owner, v_function_security_definer, v_function_config
      FROM pg_catalog.pg_proc proc
      JOIN pg_catalog.pg_roles owner_role ON owner_role.oid = proc.proowner
     WHERE proc.oid = 'public.get_runtime_secret(text)'::regprocedure;

    IF v_function_owner IS DISTINCT FROM 'postgres'
       OR v_function_security_definer IS NOT TRUE
       OR v_function_config IS DISTINCT FROM ARRAY['search_path=pg_catalog, internal, pg_temp']::text[]
    THEN
        RAISE EXCEPTION
            'Runtime-secret function trust boundary is incorrect: owner=%, security_definer=%, config=%',
            v_function_owner, v_function_security_definer, v_function_config;
    END IF;

    INSERT INTO internal.runtime_secrets(name, secret_value, description)
    VALUES ('test.p0_runtime_secret', 'fixture-value', 'transactional fixture');

    SET LOCAL ROLE service_role;
    SELECT public.get_runtime_secret('test.p0_runtime_secret') INTO v_value;
    RESET ROLE;

    IF v_value IS DISTINCT FROM 'fixture-value' THEN
        RAISE EXCEPTION 'Trusted runtime-secret lookup returned an unexpected value';
    END IF;

    BEGIN
        SET LOCAL ROLE anon;
        PERFORM public.get_runtime_secret('test.p0_runtime_secret');
        RAISE EXCEPTION 'Anonymous runtime-secret call unexpectedly succeeded';
    EXCEPTION
        WHEN insufficient_privilege THEN
            RESET ROLE;
    END;

    BEGIN
        SET LOCAL ROLE authenticated;
        PERFORM public.get_runtime_secret('test.p0_runtime_secret');
        RAISE EXCEPTION 'Authenticated runtime-secret call unexpectedly succeeded';
    EXCEPTION
        WHEN insufficient_privilege THEN
            RESET ROLE;
    END;
END
$test$;

ROLLBACK;
