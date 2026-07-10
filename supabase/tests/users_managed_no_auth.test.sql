-- pgTAP: invariante MANAGED ⇒ sin credenciales propias (HU-GEN-02
-- criterio 3, issue #14). Se ejecuta con `pnpm supabase test db`.
begin;

create extension if not exists pgtap with schema extensions;

select plan(2);

-- El trigger de perfil crea una fila ACTIVE con auth_user_id no nulo.
insert into auth.users (id, email, raw_user_meta_data)
values (
    '00000000-0000-4000-8000-0000000000c1',
    'constraint-check@example.cl',
    '{"full_name": "Cuenta de prueba", "birthdate": "1994-01-01"}'::jsonb
);

select throws_ok(
    $$update public.users set account_status = 'MANAGED' where auth_user_id = '00000000-0000-4000-8000-0000000000c1'$$,
    '23514',
    null,
    'no se puede marcar MANAGED a un perfil con auth_user_id no nulo (criterio 3 de HU-GEN-02)'
);

select lives_ok(
    $$insert into public.users (auth_user_id, full_name, account_status, birthdate) values (null, 'Deportista Gestionado', 'MANAGED', '2015-01-01')$$,
    'una cuenta MANAGED sin auth_user_id es válida'
);

select * from finish();

rollback;
