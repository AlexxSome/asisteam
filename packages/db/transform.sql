-- Applied only to an empty owned clone. Existing source and history are intact.
-- The target accepts only native authority. Transitional session calls deny.
create or replace function app_private.api_session_user_id(p_session_id uuid)
returns uuid language sql stable security definer set search_path='' as $$select null::uuid$$;
create or replace function app_private.invalidate_legacy_subject(p_subject uuid)
returns void language plpgsql security definer set search_path='' as $$begin
 if not app_private.auth_is_native() then raise exception 'Native authority required';end if;
end$$;
create or replace function app_private.auth_cutover(p_action text)
returns jsonb language plpgsql security definer set search_path='' as $$begin
 if p_action<>'RECOVER_FORWARD' or not app_private.auth_is_native() then raise exception 'Native authority required';end if;
 update app_private.auth_authority set recovery_started_at=now() where singleton;
 return jsonb_build_object('mode','NATIVE');
end$$;
