-- HU-ADM-10 (#29): CRUD trivial de tipos propios por PostgREST + RLS.
-- No se conceden DELETE, cambios de identidad ni traslado entre grupos.
grant select(id, group_id, name, color, is_active) on public.activity_types to authenticated;
grant insert(group_id, name, color) on public.activity_types to authenticated;
grant update(name, color, is_active) on public.activity_types to authenticated;

create policy activity_types_insert_admin on public.activity_types
for insert to authenticated
with check (group_id is not null and public.is_group_admin(group_id));

create policy activity_types_update_admin on public.activity_types
for update to authenticated
using (group_id is not null and public.is_group_admin(group_id))
with check (group_id is not null and public.is_group_admin(group_id));

-- El mismo nombre no puede registrarse otra vez agregando espacios exteriores.
-- También normaliza peticiones PostgREST que no pasaron por el formulario.
create function app_private.normalize_activity_type_name() returns trigger
language plpgsql set search_path = '' as $$
begin
    new.name := trim(new.name);
    return new;
end $$;
create trigger trg_activity_type_name before insert or update of name on public.activity_types
for each row execute function app_private.normalize_activity_type_name();
revoke all on function app_private.normalize_activity_type_name() from public, anon, authenticated;
