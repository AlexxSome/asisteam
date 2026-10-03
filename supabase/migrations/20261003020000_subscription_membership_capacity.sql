-- #56: conserva las reglas existentes; solo reemplaza el límite operativo fijo
-- por la capacidad del grupo. Los límites ATHLETE se validan en el trigger común.

-- Definición previa: supabase/migrations/20260926020000_claim_managed_accounts.sql
create or replace function app_private.accept_invitation(p_token_hash text, p_auth_user_id uuid, p_registration jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_inv public.invitations%rowtype; v_user public.users%rowtype;
    v_auth_email text; v_birthdate date; v_status text; v_membership public.memberships%rowtype;
    v_new_memberships integer;
begin
    perform 1 from public.users where id = (select invited_user_id from public.invitations
      where token = p_token_hash and activation_membership_id is not null) for update;
    select * into v_inv from public.invitations where token = p_token_hash for update;
    if not found then return jsonb_build_object('error', 'invitation_not_available'); end if;
    if v_inv.status = 'PENDING' and v_inv.expires_at <= now() then
        update public.invitations set status = 'EXPIRED' where id = v_inv.id;
        return jsonb_build_object('error', 'invitation_expired');
    end if;
    if v_inv.status = 'EXPIRED' then return jsonb_build_object('error', 'invitation_expired'); end if;
    if v_inv.status <> 'PENDING' then return jsonb_build_object('error', 'invitation_not_available'); end if;
    select email into v_auth_email from auth.users where id = p_auth_user_id;
    select * into v_user from public.users
      where (v_inv.invited_user_id is not null and id = v_inv.invited_user_id)
         or (v_inv.invited_user_id is null and lower(email) = lower(v_inv.email)) for update;
    if v_user.id is null or v_auth_email is null
      or lower(v_auth_email) is distinct from lower(coalesce(v_inv.email, v_user.email))
      or (v_user.email is not null and lower(v_user.email) <> lower(v_auth_email)) then
        return jsonb_build_object('error', 'invitation_not_available');
    end if;

    -- HU-DEP-07: resolver el perfil vigente en la misma transacción de Auth.
    -- El titular únicamente elige sus credenciales y acepta las condiciones.
    if p_registration -> 'managed_claim' = 'true'::jsonb then
        if v_inv.activation_membership_id is null or v_user.account_status <> 'MANAGED' then
            return jsonb_build_object('error', 'invitation_not_available');
        end if;
        p_registration := jsonb_build_object('full_name', v_user.full_name,
          'birthdate', v_user.birthdate, 'phone', v_user.phone,
          'terms_version', p_registration ->> 'terms_version');
    end if;

    if p_registration is null then
        if v_user.auth_user_id is distinct from p_auth_user_id or v_user.account_status <> 'ACTIVE' then
            return jsonb_build_object('error', 'invitation_not_available');
        end if;
        v_birthdate := v_user.birthdate;
    else
        if v_user.auth_user_id is not null or v_user.account_status not in ('INVITED','MANAGED') then
            return jsonb_build_object('error', 'invitation_not_available');
        end if;
        v_birthdate := (p_registration ->> 'birthdate')::date;
        if v_birthdate is null or v_birthdate >= app_private.chile_today()
          or extract(year from age(app_private.chile_today(), v_birthdate)) > 110
          or length(trim(p_registration ->> 'full_name')) not between 2 and 120
          or coalesce(p_registration ->> 'terms_version', '') <> '2026-09-21' then
            return jsonb_build_object('error', 'invalid_registration');
        end if;
        -- Una fecha precargada por ADMIN no se puede cambiar para eludir R1.
        if v_user.birthdate is not null and v_user.birthdate <> v_birthdate then
            return jsonb_build_object('error', 'birthdate_confirmation_required');
        end if;
        if app_private.is_minor(v_birthdate) and (not app_private.has_minor_consent(v_user.id)
          or (v_user.account_status = 'MANAGED' and not exists (
            select 1 from public.guardianships g join public.consents c on c.guardianship_id = g.id
            where g.athlete_user_id = v_user.id and g.status = 'ACTIVE'
              and c.consent_type = 'ACCOUNT_ACTIVATION_MINOR' and c.revoked_at is null and c.granted_at <= now()
          ))) then return jsonb_build_object('error', 'guardian_consent_required'); end if;
    end if;
    if v_inv.role = 'ATHLETE' and v_birthdate is null then
        return jsonb_build_object('error', 'athlete_birthdate_required');
    end if;
    if v_inv.activation_membership_id is not null then
        if p_registration is null or v_user.account_status <> 'MANAGED' then
            return jsonb_build_object('error','invitation_not_available');
        end if;
        if app_private.is_minor(v_birthdate) and not app_private.has_account_activation_consent(v_user.id) then
            return jsonb_build_object('error','guardian_consent_required');
        end if;
        select * into v_membership from public.memberships where id = v_inv.activation_membership_id
          and user_id = v_user.id and group_id = v_inv.group_id and role = 'ATHLETE';
        if not found then return jsonb_build_object('error','invitation_not_available'); end if;
        -- CB-06: actualizar solo la cuenta; ninguna membresía/vínculo/asistencia
        -- se inserta, reactiva ni modifica (incluido joined_at y updated_at).
        update public.users set auth_user_id = p_auth_user_id, account_status = 'ACTIVE', email = v_auth_email,
          full_name = trim(p_registration ->> 'full_name'), phone = nullif(trim(p_registration ->> 'phone'),'')
          where id = v_user.id;
        update public.invitations set status = 'ACCEPTED', accepted_at = now(),
          terms_version = p_registration ->> 'terms_version' where id = v_inv.id;
        return jsonb_build_object('group_id',v_inv.group_id,'membership_status',v_membership.status);
    end if;
    v_status := case when v_inv.role = 'ATHLETE' and app_private.is_minor(v_birthdate)
      and not app_private.has_minor_consent(v_user.id) then 'PENDING' else 'ACTIVE' end;
    perform 1 from public.groups where id = v_inv.group_id for update;
    select * into v_membership from public.memberships
      where user_id = v_user.id and group_id = v_inv.group_id and role = v_inv.role;
    v_new_memberships := case when coalesce(v_membership.status, '') <> 'ACTIVE' and v_status = 'ACTIVE' then 1 else 0 end;
    if v_inv.role = 'ATHLETE' and v_status = 'ACTIVE' and app_private.is_minor(v_birthdate) then
        -- El trigger canónico incorpora también a los apoderados del menor.
        v_new_memberships := v_new_memberships + (select count(*) from public.guardianships g
          where g.athlete_user_id = v_user.id and g.status = 'ACTIVE'
            and not exists(select 1 from public.memberships m where m.user_id = g.guardian_user_id
              and m.group_id = v_inv.group_id and m.role = 'GUARDIAN' and m.status = 'ACTIVE'));
    end if;
    if (select count(*) from public.memberships where group_id = v_inv.group_id and status = 'ACTIVE') + v_new_memberships > app_private.group_membership_limit(v_inv.group_id) then
        return jsonb_build_object('error', 'group_member_limit');
    end if;
    if not exists(select 1 from public.memberships where user_id = v_user.id and group_id = v_inv.group_id and status in ('ACTIVE','PENDING'))
      and (select count(distinct group_id) from public.memberships where user_id = v_user.id and status in ('ACTIVE','PENDING')) >= 30 then
        return jsonb_build_object('error', 'user_group_limit');
    end if;
    if p_registration is not null then
        update public.users set auth_user_id = p_auth_user_id, account_status = 'ACTIVE', email = v_auth_email,
          full_name = trim(p_registration ->> 'full_name'), birthdate = v_birthdate,
          phone = nullif(trim(p_registration ->> 'phone'), '') where id = v_user.id;
    end if;
    insert into public.memberships(user_id, group_id, role, status, joined_at)
      values(v_user.id, v_inv.group_id, v_inv.role, v_status, case when v_status = 'ACTIVE' then now() end)
    on conflict(user_id, group_id, role) do update set status = excluded.status,
      joined_at = coalesce(public.memberships.joined_at, excluded.joined_at);
    update public.invitations set status = 'ACCEPTED', accepted_at = now(), invited_user_id = v_user.id,
      terms_version = p_registration ->> 'terms_version' where id = v_inv.id;
    return jsonb_build_object('group_id', v_inv.group_id, 'membership_status', v_status);
end $$;

-- Definición previa: supabase/migrations/20260922020000_create_groups.sql
create or replace function public.join_group_as_athlete(p_group_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
    v_user_id uuid := public.auth_user_id();
    v_status text;
    v_birthdate date;
    v_id uuid;
    v_membership_status text;
    v_new_memberships integer := 1;
begin
    if v_user_id is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    select account_status, birthdate into v_status, v_birthdate from public.users where id = v_user_id for update;
    if v_status is distinct from 'ACTIVE' then raise sqlstate 'PT403' using message = 'active_account_required'; end if;
    if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
    perform 1 from public.groups where id = p_group_id for update;
    perform 1 from public.memberships where user_id = v_user_id and group_id = p_group_id
      and role = 'ADMIN' and status = 'ACTIVE' for share;
    if not found then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    select id, status into v_id, v_membership_status from public.memberships
      where user_id = v_user_id and group_id = p_group_id and role = 'ATHLETE';
    if v_membership_status = 'ACTIVE' then return v_id; end if;
    -- Aprobar/reactivar membresías existentes pertenece a sus RPC específicas.
    if v_id is not null then raise sqlstate 'PT409' using message = 'membership_already_exists'; end if;
    if v_birthdate is null then raise sqlstate 'PT422' using message = 'athlete_birthdate_required'; end if;
    if app_private.is_minor(v_birthdate) then
        if not app_private.has_minor_consent(v_user_id) then
            raise sqlstate 'PT422' using message = 'minor_requires_guardian_consent';
        end if;
        -- Las altas automáticas también respetan el límite de grupos del apoderado.
        perform 1 from public.users u where exists(select 1 from public.guardianships g
          where g.guardian_user_id = u.id and g.athlete_user_id = v_user_id and g.status = 'ACTIVE')
          order by u.id for update;
        if exists(select 1 from public.guardianships g where g.athlete_user_id = v_user_id and g.status = 'ACTIVE'
          and not exists(select 1 from public.memberships m where m.user_id = g.guardian_user_id
            and m.group_id = p_group_id and m.status in ('ACTIVE', 'PENDING'))
          and (select count(distinct m.group_id) from public.memberships m
            where m.user_id = g.guardian_user_id and m.status in ('ACTIVE', 'PENDING')) >= 30) then
            raise sqlstate 'PT422' using message = 'guardian_group_limit';
        end if;
        -- El trigger canónico agrega también las membresías GUARDIAN.
        v_new_memberships := v_new_memberships + (select count(*) from public.guardianships g
          where g.athlete_user_id = v_user_id and g.status = 'ACTIVE'
            and not exists(select 1 from public.memberships m where m.user_id = g.guardian_user_id
              and m.group_id = p_group_id and m.role = 'GUARDIAN' and m.status = 'ACTIVE'));
    end if;
    if (select count(*) from public.memberships where group_id = p_group_id and status = 'ACTIVE') + v_new_memberships > app_private.group_membership_limit(p_group_id) then
        raise sqlstate 'PT422' using message = 'group_member_limit';
    end if;
    insert into public.memberships(user_id, group_id, role, status, joined_at)
    values(v_user_id, p_group_id, 'ATHLETE', 'ACTIVE', now()) returning id into v_id;
    return v_id;
end $$;

-- Definición previa: supabase/migrations/20260922040000_join_group_by_code.sql
create or replace function public.join_group_by_code(p_invite_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_user_id uuid := public.auth_user_id();
    v_account_status text;
    v_birthdate date;
    v_attempts timestamptz[];
    v_group_id uuid;
    v_group_name text;
    v_sport text;
    v_membership_id uuid;
    v_status text;
    v_joined_at timestamptz;
begin
    if v_user_id is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    -- El perfil bloqueado serializa incorporaciones simultáneas del mismo usuario.
    select account_status, birthdate into v_account_status, v_birthdate
      from public.users where id = v_user_id for update;
    if v_account_status is distinct from 'ACTIVE' then
        raise sqlstate 'PT403' using message = 'active_account_required';
    end if;
    select array(select attempt from unnest(a.attempts) attempt
                 where attempt > now() - interval '15 minutes')
      into v_attempts from app_private.join_code_attempts a where a.user_id = v_user_id;
    v_attempts := coalesce(v_attempts, '{}'::timestamptz[]);
    if cardinality(v_attempts) >= 10 then
        raise sqlstate 'PT429' using message = 'join_rate_limited';
    end if;
    insert into app_private.join_code_attempts(user_id, attempts, updated_at)
    values(v_user_id, array_append(v_attempts, now()), now())
    on conflict(user_id) do update set attempts = excluded.attempts, updated_at = excluded.updated_at;

    -- Los errores esperados se devuelven: una excepción revertiría también
    -- el contador y permitiría probar códigos sin límite.
    if p_invite_code is null or btrim(p_invite_code) !~ '^[A-Za-z0-9]{8}$' then
        return jsonb_build_object('error', jsonb_build_object('code', 'invalid_invite_code',
          'message', 'Código no válido', 'details', '{}'::jsonb));
    end if;
    -- FOR UPDATE arbitra una rotación concurrente antes de aceptar el código.
    select id, name, sport into v_group_id, v_group_name, v_sport
      from public.groups where invite_code = btrim(p_invite_code) for update;
    if v_group_id is null then
        return jsonb_build_object('error', jsonb_build_object('code', 'invalid_invite_code',
          'message', 'Código no válido', 'details', '{}'::jsonb));
    end if;
    if exists(select 1 from public.memberships where user_id = v_user_id
      and group_id = v_group_id and role = 'ATHLETE') then
        return jsonb_build_object('error', jsonb_build_object('code', 'membership_already_exists',
          'message', 'Ya perteneces a este grupo como deportista', 'details', '{}'::jsonb));
    end if;
    if v_birthdate is null then
        return jsonb_build_object('error', jsonb_build_object('code', 'athlete_birthdate_required',
          'message', 'Completa tu fecha de nacimiento en Mi perfil', 'details', '{}'::jsonb));
    end if;
    if not exists(select 1 from public.memberships where user_id = v_user_id
      and group_id = v_group_id and status in ('ACTIVE', 'PENDING'))
      and (select count(distinct group_id) from public.memberships
           where user_id = v_user_id and status in ('ACTIVE', 'PENDING')) >= 30 then
        return jsonb_build_object('error', jsonb_build_object('code', 'user_group_limit',
          'message', 'Ya alcanzaste el límite de 30 grupos', 'details', '{}'::jsonb));
    end if;

    if app_private.is_minor(v_birthdate) then
        v_status := 'PENDING';
    else
        v_status := 'ACTIVE';
        v_joined_at := now();
        if (select count(*) from public.memberships where group_id = v_group_id
          and status = 'ACTIVE') >= app_private.group_membership_limit(v_group_id) then
            return jsonb_build_object('error', jsonb_build_object('code', 'group_member_limit',
              'message', 'Este grupo alcanzó el límite de membresías activas', 'details', '{}'::jsonb));
        end if;
    end if;
    insert into public.memberships(user_id, group_id, role, status, joined_at)
    values(v_user_id, v_group_id, 'ATHLETE', v_status, v_joined_at)
    returning id into v_membership_id;
    return jsonb_build_object(
      'membership', jsonb_build_object('id', v_membership_id, 'group_id', v_group_id,
        'role', 'ATHLETE', 'status', v_status, 'joined_at', v_joined_at),
      'group', jsonb_build_object('name', v_group_name, 'sport', v_sport)
    ) || case when v_status = 'PENDING' then
      jsonb_build_object('pending_reason', 'minor_requires_guardian_and_admin_approval')
    else '{}'::jsonb end;
end $$;

-- Definición previa: supabase/migrations/20260922060000_create_managed_members.sql
create or replace function public.create_managed_member(
    p_group_id uuid, p_full_name text, p_birthdate date, p_email text default null, p_guardian jsonb default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_actor uuid := public.auth_user_id();
    v_user uuid;
    v_membership uuid;
    v_guardian uuid;
    v_guardianship uuid;
    v_guardian_email text;
    v_minor boolean := app_private.is_minor(p_birthdate);
    v_email text := nullif(lower(trim(p_email)), '');
begin
    if v_actor is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if not exists(select 1 from public.users where id = v_actor and account_status = 'ACTIVE') then
        raise sqlstate 'PT403' using message = 'active_account_required';
    end if;
    if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
    if not public.is_group_admin(p_group_id) then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    if p_full_name is null or length(trim(p_full_name)) not between 2 and 120
      or p_birthdate is null or p_birthdate >= app_private.chile_today()
      or extract(year from age(app_private.chile_today(), p_birthdate)) > 110
      or (v_email is not null and (length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')) then
        raise sqlstate 'PT400' using message = 'invalid_managed_member';
    end if;
    if v_minor then
        v_guardian_email := lower(trim(p_guardian ->> 'email'));
        if p_guardian is null or jsonb_typeof(p_guardian) <> 'object'
          or not (p_guardian ?& array['full_name','email','relationship','authorized'])
          or p_guardian - array['full_name','email','relationship','authorized'] <> '{}'::jsonb
          or p_guardian -> 'authorized' is distinct from 'true'::jsonb
          or length(trim(coalesce(p_guardian ->> 'full_name',''))) not between 2 and 120
          or length(trim(coalesce(p_guardian ->> 'relationship',''))) not between 2 and 40
          or v_guardian_email is null or length(v_guardian_email) > 254
          or v_guardian_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
          or v_guardian_email = v_email then
            raise sqlstate 'PT422' using message = 'invalid_guardian';
        end if;
        -- Identidad por email; nunca se aceptan IDs de terceros desde el cliente.
        -- El perfil existente se conserva y no se expone en la respuesta.
        insert into public.users(full_name, email, account_status)
        values(trim(p_guardian ->> 'full_name'), v_guardian_email, 'INVITED')
        on conflict (lower(email)) where email is not null do nothing;
        select id into v_guardian from public.users where lower(email) = v_guardian_email for update;
    elsif p_guardian is not null then
        raise sqlstate 'PT400' using message = 'invalid_guardian';
    end if;
    -- Mismo orden que la aceptación de invitaciones: persona, luego grupo.
    perform 1 from public.groups where id = p_group_id for update;
    perform 1 from public.memberships where user_id = v_actor and group_id = p_group_id
      and role = 'ADMIN' and status = 'ACTIVE' for share;
    if not found then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    if (select count(*) from public.memberships where group_id = p_group_id and status = 'ACTIVE') >= app_private.group_membership_limit(p_group_id) then
        raise sqlstate 'PT422' using message = 'group_member_limit';
    end if;
    begin
        insert into public.users(full_name, birthdate, email, account_status)
        values(trim(p_full_name), p_birthdate, v_email, 'MANAGED') returning id into v_user;
    exception when unique_violation then
        raise sqlstate 'PT409' using message = 'managed_email_unavailable';
    end;
    if v_minor then
        insert into public.guardianships(guardian_user_id, athlete_user_id, relationship)
        values(v_guardian, v_user, trim(p_guardian ->> 'relationship')) returning id into v_guardianship;
    end if;
    insert into public.memberships(user_id, group_id, role, status, joined_at)
    values(v_user, p_group_id, 'ATHLETE', case when v_minor then 'PENDING' else 'ACTIVE' end,
      case when v_minor then null else now() end) returning id into v_membership;
    if v_minor then
        insert into app_private.managed_member_enrollments(membership_id,guardianship_id,declared_by)
        values(v_membership,v_guardianship,v_actor);
    end if;
    return jsonb_build_object('membership_id', v_membership, 'membership_status', case when v_minor then 'PENDING' else 'ACTIVE' end);
end $$;

-- Definición previa: supabase/migrations/20260922060000_create_managed_members.sql
create or replace function public.consent_managed_member(p_membership_id uuid, p_accepted boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
    v_actor uuid := public.auth_user_id();
    v_enrollment app_private.managed_member_enrollments%rowtype;
    v_athlete uuid;
    v_group uuid;
    v_status text;
    v_new_memberships integer;
begin
    if v_actor is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if p_accepted is distinct from true then raise sqlstate 'PT422' using message = 'consent_required'; end if;
    select m.user_id, m.group_id into v_athlete, v_group
    from app_private.managed_member_enrollments e
    join public.memberships m on m.id = e.membership_id
    join public.guardianships g on g.id = e.guardianship_id
    where m.id = p_membership_id and g.guardian_user_id = v_actor and g.status = 'ACTIVE'
      and public.is_member(m.group_id) and public.is_guardian_of(m.user_id);
    if v_athlete is null then raise sqlstate 'PT404' using message = 'managed_consent_not_found'; end if;
    perform 1 from public.users where id = v_actor and account_status = 'ACTIVE' for update;
    if not found then raise sqlstate 'PT403' using message = 'active_account_required'; end if;
    perform 1 from public.users where id = v_athlete for update;
    perform 1 from public.groups where id = v_group for update;
    select * into v_enrollment from app_private.managed_member_enrollments
      where membership_id = p_membership_id for update;
    perform 1 from public.guardianships where id = v_enrollment.guardianship_id
      and guardian_user_id = v_actor and status = 'ACTIVE' for share;
    if not found or not public.is_member(v_group) or not public.is_guardian_of(v_athlete) then
        raise sqlstate 'PT404' using message = 'managed_consent_not_found';
    end if;
    select status into v_status from public.memberships where id = p_membership_id for update;
    if v_enrollment.activated_at is not null and v_status = 'ACTIVE' then return; end if;
    if v_status <> 'PENDING' or v_enrollment.activated_at is not null then
        raise sqlstate 'PT409' using message = 'managed_member_not_pending';
    end if;
    v_new_memberships := 1 + (select count(*) from public.guardianships g
      where g.athlete_user_id = v_athlete and g.status = 'ACTIVE'
        and not exists(select 1 from public.memberships m where m.user_id = g.guardian_user_id
          and m.group_id = v_group and m.role = 'GUARDIAN' and m.status = 'ACTIVE'));
    if (select count(*) from public.memberships where group_id = v_group and status = 'ACTIVE') + v_new_memberships > app_private.group_membership_limit(v_group) then
        raise sqlstate 'PT422' using message = 'group_member_limit';
    end if;
    if exists(select 1 from public.guardianships g where g.athlete_user_id = v_athlete and g.status = 'ACTIVE'
      and not exists(select 1 from public.memberships m where m.user_id = g.guardian_user_id
        and m.group_id = v_group and m.status in ('ACTIVE','PENDING'))
      and (select count(distinct group_id) from public.memberships where user_id = g.guardian_user_id
        and status in ('ACTIVE','PENDING')) >= 30) then
        raise sqlstate 'PT422' using message = 'guardian_group_limit';
    end if;
    insert into public.consents(guardianship_id,consent_type,terms_version,channel,allows_avatar)
    values(v_enrollment.guardianship_id,'DATA_PROCESSING_MINOR','2026-09-21','IN_APP',false);
    update public.memberships set status = 'ACTIVE', joined_at = now() where id = p_membership_id;
    update app_private.managed_member_enrollments set activated_at = now() where membership_id = p_membership_id;
end $$;

-- Definición previa: supabase/migrations/20260922070000_create_guardianships.sql
create or replace function public.create_guardianship(
    p_group_id uuid, p_athlete_user_id uuid, p_full_name text, p_email text, p_relationship text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
    v_actor uuid := public.auth_user_id();
    v_guardian uuid;
    v_guardianship uuid;
    v_birthdate date;
    v_email text := lower(trim(p_email));
    v_groups uuid[];
    v_group uuid;
begin
    if v_actor is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if not exists(select 1 from public.users where id = v_actor and account_status = 'ACTIVE') then
        raise sqlstate 'PT403' using message = 'active_account_required';
    end if;
    if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
    if not public.is_group_admin(p_group_id) then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    if p_full_name is null or length(trim(p_full_name)) not between 2 and 120
      or p_relationship is null or length(trim(p_relationship)) not between 2 and 40
      or v_email is null or length(v_email) > 254
      or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
        raise sqlstate 'PT400' using message = 'invalid_guardianship';
    end if;
    if not exists(select 1 from public.memberships where group_id = p_group_id
      and user_id = p_athlete_user_id and role = 'ATHLETE' and status in ('ACTIVE','PENDING')) then
        raise sqlstate 'PT404' using message = 'athlete_not_found';
    end if;
    -- Se resuelve por email sin ofrecer búsquedas globales ni sobrescribir perfiles.
    insert into public.users(full_name,email,account_status)
    values(trim(p_full_name),v_email,'INVITED')
    on conflict (lower(email)) where email is not null do nothing;
    select id into v_guardian from public.users where lower(email) = v_email for update;
    if v_guardian = p_athlete_user_id then raise sqlstate 'PT422' using message = 'invalid_guardian'; end if;
    -- Orden compartido con aceptación/consentimiento: personas antes de grupos.
    select birthdate into v_birthdate from public.users where id = p_athlete_user_id for update;
    if not app_private.is_minor(v_birthdate) then
        raise sqlstate 'PT422' using message = 'guardian_only_for_minor';
    end if;
    if exists(select 1 from public.guardianships where guardian_user_id = v_guardian and athlete_user_id = p_athlete_user_id) then
        raise sqlstate 'PT409' using message = 'guardianship_already_exists';
    end if;
    -- El vínculo es global: incluye el grupo solicitado y los grupos activos del pupilo (CB-02).
    select array_agg(id order by id) into v_groups from (
        select p_group_id as id union select group_id from public.memberships
        where user_id = p_athlete_user_id and role = 'ATHLETE' and status = 'ACTIVE'
    ) target_groups;
    perform 1 from public.groups where id = any(v_groups) order by id for update;
    perform 1 from public.memberships where user_id = v_actor and group_id = p_group_id
      and role = 'ADMIN' and status = 'ACTIVE' for share;
    if not found then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    perform 1 from public.memberships where user_id = p_athlete_user_id and group_id = p_group_id
      and role = 'ATHLETE' and status in ('ACTIVE','PENDING') for share;
    if not found then raise sqlstate 'PT404' using message = 'athlete_not_found'; end if;
    if (select count(*) from (
        select group_id from public.memberships where user_id = v_guardian and status in ('ACTIVE','PENDING')
        union select unnest(v_groups)
    ) guardian_groups) > 30 then
        raise sqlstate 'PT422' using message = 'guardian_group_limit';
    end if;
    foreach v_group in array v_groups loop
        if not exists(select 1 from public.memberships where user_id = v_guardian
          and group_id = v_group and role = 'GUARDIAN' and status = 'ACTIVE')
          and (select count(*) from public.memberships where group_id = v_group and status = 'ACTIVE') >= app_private.group_membership_limit(v_group) then
            raise sqlstate 'PT422' using message = 'group_member_limit';
        end if;
        insert into public.memberships(user_id,group_id,role,status,joined_at)
        values(v_guardian,v_group,'GUARDIAN','ACTIVE',now())
        on conflict(user_id,group_id,role) do update set status = 'ACTIVE',
          joined_at = coalesce(public.memberships.joined_at,excluded.joined_at)
        where public.memberships.status <> 'ACTIVE';
    end loop;
    begin
        insert into public.guardianships(guardian_user_id,athlete_user_id,relationship)
        values(v_guardian,p_athlete_user_id,trim(p_relationship)) returning id into v_guardianship;
    exception when unique_violation then
        raise sqlstate 'PT409' using message = 'guardianship_already_exists';
    end;
    return v_guardianship;
end $$;

-- Definición previa: supabase/migrations/20260922080000_membership_approvals.sql
create or replace function app_private.review_pending_membership(p_group_id uuid, p_membership_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
    v_actor uuid := public.auth_user_id();
    v_athlete uuid;
    v_birthdate date;
    v_status text;
    v_new_memberships integer := 1;
begin
    if v_actor is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if not exists(select 1 from public.users where id = v_actor and account_status = 'ACTIVE') then
        raise sqlstate 'PT403' using message = 'active_account_required';
    end if;
    if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
    if not public.is_group_admin(p_group_id) then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    if p_approve is null then raise sqlstate 'PT400' using message = 'invalid_membership_review'; end if;
    select user_id into v_athlete from public.memberships
      where id = p_membership_id and group_id = p_group_id and role = 'ATHLETE';
    if not found then raise sqlstate 'PT404' using message = 'membership_not_found'; end if;

    -- Personas antes de grupos: serializa el límite global de cada apoderado.
    -- Vínculos/consentimientos también bloquean el perfil del pupilo; R1 se
    -- revalida por el trigger incluso frente a una revocación concurrente.
    perform 1 from public.users u where u.id = v_athlete or (p_approve and exists(
      select 1 from public.guardianships g where g.athlete_user_id = v_athlete
        and g.guardian_user_id = u.id and g.status = 'ACTIVE')) order by u.id for update;
    select birthdate into v_birthdate from public.users where id = v_athlete;
    -- Recoge también cualquier vínculo confirmado mientras se esperaba al perfil.
    if p_approve and app_private.is_minor(v_birthdate) then
        perform 1 from public.users u where exists(select 1 from public.guardianships g
          where g.athlete_user_id = v_athlete and g.guardian_user_id = u.id and g.status = 'ACTIVE')
          order by u.id for update;
    end if;
    perform 1 from public.groups where id = p_group_id for update;
    perform 1 from public.memberships where user_id = v_actor and group_id = p_group_id
      and role = 'ADMIN' and status = 'ACTIVE' for share;
    if not found then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    select status into v_status from public.memberships
      where id = p_membership_id and group_id = p_group_id and role = 'ATHLETE' for update;
    if not found then raise sqlstate 'PT404' using message = 'membership_not_found'; end if;
    if v_status <> 'PENDING' then raise sqlstate 'PT409' using message = 'membership_not_pending'; end if;

    if not p_approve then
        update public.memberships set status = 'INACTIVE' where id = p_membership_id;
        return;
    end if;
    if v_birthdate is null then raise sqlstate 'PT422' using message = 'athlete_birthdate_required'; end if;
    if app_private.is_minor(v_birthdate) then
        if not exists(select 1 from public.guardianships where athlete_user_id = v_athlete and status = 'ACTIVE') then
            raise sqlstate 'PT422' using message = 'minor_requires_guardian';
        end if;
        if not app_private.has_minor_consent(v_athlete) then
            raise sqlstate 'PT422' using message = 'minor_requires_guardian_consent';
        end if;
        -- HU-ADM-05: el alta MANAGED ya tiene aprobación ADMIN. La ratificación
        -- del apoderado designado debe seguir su flujo consent_managed_member.
        if exists(select 1 from app_private.managed_member_enrollments
          where membership_id = p_membership_id and activated_at is null) then
            raise sqlstate 'PT422' using message = 'managed_consent_required';
        end if;
        if exists(select 1 from public.guardianships g where g.athlete_user_id = v_athlete and g.status = 'ACTIVE'
          and not exists(select 1 from public.memberships m where m.user_id = g.guardian_user_id
            and m.group_id = p_group_id and m.status in ('ACTIVE','PENDING'))
          and (select count(distinct m.group_id) from public.memberships m where m.user_id = g.guardian_user_id
            and m.status in ('ACTIVE','PENDING')) >= 30) then
            raise sqlstate 'PT422' using message = 'guardian_group_limit';
        end if;
        v_new_memberships := v_new_memberships + (select count(*) from public.guardianships g
          where g.athlete_user_id = v_athlete and g.status = 'ACTIVE'
            and not exists(select 1 from public.memberships m where m.user_id = g.guardian_user_id
              and m.group_id = p_group_id and m.role = 'GUARDIAN' and m.status = 'ACTIVE'));
    end if;
    if (select count(*) from public.memberships where group_id = p_group_id and status = 'ACTIVE') + v_new_memberships > app_private.group_membership_limit(p_group_id) then
        raise sqlstate 'PT422' using message = 'group_member_limit';
    end if;
    -- El trigger canónico sincroniza GUARDIAN. La fecha de ingreso empieza aquí;
    -- no se crean convocatorias ni se arrastran ausencias del período pendiente.
    update public.memberships set status = 'ACTIVE', joined_at = now() where id = p_membership_id;
end $$;

-- Definición previa: supabase/migrations/20260923020000_manage_members.sql
create or replace function app_private.change_membership_status(p_group_id uuid, p_membership_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
    v_actor uuid := public.auth_user_id(); v_user uuid; v_member public.memberships%rowtype;
    v_birthdate date; v_new_memberships integer := 1;
begin
    if v_actor is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
    if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
    if not public.is_group_admin(p_group_id) then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    select user_id into v_user from public.memberships where id = p_membership_id and group_id = p_group_id;
    if not found then raise sqlstate 'PT404' using message = 'membership_not_found'; end if;
    -- Personas antes de grupo, como altas y aprobaciones: serializa límites,
    -- consentimiento y sincronización GUARDIAN durante la reactivación.
    perform 1 from public.users u where u.id = v_user or exists(
      select 1 from public.guardianships g where g.status = 'ACTIVE'
        and ((g.athlete_user_id = v_user and g.guardian_user_id = u.id)
          or (g.guardian_user_id = v_user and g.athlete_user_id = u.id))) order by u.id for update;
    select birthdate into v_birthdate from public.users where id = v_user;
    if p_active and app_private.is_minor(v_birthdate) then
        perform 1 from public.users u where exists(select 1 from public.guardianships g
          where g.athlete_user_id = v_user and g.guardian_user_id = u.id and g.status = 'ACTIVE')
          order by u.id for update;
    end if;
    perform 1 from public.groups where id = p_group_id for update;
    perform 1 from public.memberships where user_id = v_actor and group_id = p_group_id
      and role = 'ADMIN' and status = 'ACTIVE' for share;
    if not found then raise sqlstate 'PT403' using message = 'admin_required'; end if;
    select * into v_member from public.memberships where id = p_membership_id and group_id = p_group_id for update;
    if v_member.status <> (case when p_active then 'INACTIVE' else 'ACTIVE' end) then
        raise sqlstate 'PT409' using message = 'membership_status_changed';
    end if;
    if not p_active then
        if v_member.role = 'ADMIN' and (select count(*) from public.memberships
          where group_id = p_group_id and role = 'ADMIN' and status = 'ACTIVE') <= 1 then
            raise sqlstate 'PT409' using message = 'LAST_ADMIN';
        end if;
        -- V2: no se corta el acceso a pupilos vigentes. La baja del pupilo
        -- conserva sus vínculos y libera después la baja del apoderado.
        if v_member.role = 'GUARDIAN' and exists(select 1 from public.guardianships g
          join public.users u on u.id = g.athlete_user_id join public.memberships m on m.user_id = u.id
          where g.guardian_user_id = v_user and g.status = 'ACTIVE' and app_private.is_minor(u.birthdate)
            and m.group_id = p_group_id and m.role = 'ATHLETE' and m.status in ('ACTIVE','PENDING')) then
            raise sqlstate 'PT422' using message = 'guardian_has_active_wards';
        end if;
        update public.memberships set status = 'INACTIVE' where id = p_membership_id;
        return;
    end if;
    if not exists(select 1 from public.memberships where user_id = v_user and group_id = p_group_id and status in ('ACTIVE','PENDING'))
      and (select count(distinct group_id) from public.memberships where user_id = v_user and status in ('ACTIVE','PENDING')) >= 30 then
        raise sqlstate 'PT422' using message = 'user_group_limit';
    end if;
    if v_member.role = 'GUARDIAN' and not exists(select 1 from public.guardianships g
      join public.users u on u.id = g.athlete_user_id join public.memberships m on m.user_id = u.id
      where g.guardian_user_id = v_user and g.status = 'ACTIVE' and app_private.is_minor(u.birthdate)
        and m.group_id = p_group_id and m.role = 'ATHLETE' and m.status in ('ACTIVE','PENDING')) then
        raise sqlstate 'PT422' using message = 'guardian_requires_active_ward';
    end if;
    if v_member.role = 'ATHLETE' then
        if v_birthdate is null then raise sqlstate 'PT422' using message = 'athlete_birthdate_required'; end if;
        if app_private.is_minor(v_birthdate) then
            if not app_private.has_minor_consent(v_user) then
                raise sqlstate 'PT422' using message = 'minor_requires_guardian_consent';
            end if;
            if exists(select 1 from app_private.managed_member_enrollments
              where membership_id = p_membership_id and activated_at is null) then
                raise sqlstate 'PT422' using message = 'managed_consent_required';
            end if;
            if exists(select 1 from public.guardianships g where g.athlete_user_id = v_user and g.status = 'ACTIVE'
              and not exists(select 1 from public.memberships m where m.user_id = g.guardian_user_id
                and m.group_id = p_group_id and m.status in ('ACTIVE','PENDING'))
              and (select count(distinct m.group_id) from public.memberships m where m.user_id = g.guardian_user_id
                and m.status in ('ACTIVE','PENDING')) >= 30) then
                raise sqlstate 'PT422' using message = 'guardian_group_limit';
            end if;
            v_new_memberships := v_new_memberships + (select count(*) from public.guardianships g
              where g.athlete_user_id = v_user and g.status = 'ACTIVE'
                and not exists(select 1 from public.memberships m where m.user_id = g.guardian_user_id
                  and m.group_id = p_group_id and m.role = 'GUARDIAN' and m.status = 'ACTIVE'));
        end if;
    end if;
    if (select count(*) from public.memberships where group_id = p_group_id and status = 'ACTIVE') + v_new_memberships > app_private.group_membership_limit(p_group_id) then
        raise sqlstate 'PT422' using message = 'group_member_limit';
    end if;
    -- Conserva la fecha original para que los reportes sigan incluyendo todo
    -- su historial. Una incorporación nunca activada inicia su fecha hoy.
    update public.memberships set status = 'ACTIVE', joined_at = coalesce(joined_at, now()) where id = p_membership_id;
end $$;

-- Definición previa: supabase/migrations/20261001010000_coach_role.sql
create or replace function public.assign_member_coach(p_group_id uuid, p_membership_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := public.auth_user_id(); v_user uuid; v_coach uuid;
begin
  if v_actor is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
  if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
  if not public.is_group_admin(p_group_id) then raise sqlstate 'PT403' using message = 'admin_required'; end if;
  select user_id into v_user from public.memberships where id = p_membership_id and group_id = p_group_id;
  if not found then raise sqlstate 'PT404' using message = 'membership_not_found'; end if;
  -- Mismo orden persona -> grupo -> membresías que las transiciones existentes.
  perform 1 from public.users where id = v_user for update;
  perform 1 from public.groups where id = p_group_id for update;
  perform 1 from public.memberships where user_id = v_actor and group_id = p_group_id
    and role = 'ADMIN' and status = 'ACTIVE' for share;
  if not found then raise sqlstate 'PT403' using message = 'admin_required'; end if;
  perform 1 from public.memberships where id = p_membership_id and group_id = p_group_id and status = 'ACTIVE' for share;
  if not found then raise sqlstate 'PT409' using message = 'membership_status_changed'; end if;
  select id into v_coach from public.memberships
    where user_id = v_user and group_id = p_group_id and role = 'COACH' and status = 'ACTIVE';
  if found then return v_coach; end if;
  if (select count(*) from public.memberships where group_id = p_group_id and status = 'ACTIVE') >= app_private.group_membership_limit(p_group_id) then
    raise sqlstate 'PT422' using message = 'group_member_limit';
  end if;
  insert into public.memberships(user_id, group_id, role, status, joined_at)
    values(v_user, p_group_id, 'COACH', 'ACTIVE', now())
    on conflict(user_id, group_id, role) do update set status = 'ACTIVE',
      joined_at = coalesce(public.memberships.joined_at, excluded.joined_at)
    returning id into v_coach;
  return v_coach;
end $$;
