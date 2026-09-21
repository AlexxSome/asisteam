-- HU-GEN-05 (#17). Proyecciones de lectura: los clientes no reciben acceso
-- a groups (invite_code/settings son privados) ni a memberships de terceros.
-- Estas vistas usan deliberadamente al propietario, con barrera de seguridad
-- y autorización explícita por auth_user_id + membership ACTIVE. Las tablas
-- base conservan sus privilegios restringidos y RLS deny-by-default.
create view public.v_my_groups with (security_barrier = true) as
select g.id, g.name, g.sport, g.logo_url,
       array_agg(m.role order by m.role) as roles
from public.groups g
join public.memberships m on m.group_id = g.id
where m.user_id = (select public.auth_user_id()) and m.status = 'ACTIVE'
group by g.id, g.name, g.sport, g.logo_url;

create view public.v_group_detail with (security_barrier = true) as
select g.id, g.name, g.sport, g.description, g.logo_url, mine.roles,
       case when public.is_group_admin(g.id) then g.invite_code end as invite_code,
       case when public.is_group_admin(g.id) then g.settings end as settings
from public.groups g
join public.v_my_groups mine on mine.id = g.id
where public.is_member(g.id);

revoke all on public.v_my_groups, public.v_group_detail from public, anon, authenticated;
grant select on public.v_my_groups, public.v_group_detail to authenticated;

comment on view public.v_my_groups is 'Grupos y roles ACTIVE del usuario autenticado; una fila por grupo, sin datos de terceros.';
comment on view public.v_group_detail is 'Detalle visible por membresía ACTIVE; invite_code y settings solo para ADMIN de ese grupo.';
