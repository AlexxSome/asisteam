-- MIG-09: isolated public-registration capability; no table access or service_role.
create role asisteam_invitation nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant usage on schema public to asisteam_invitation;
grant execute on function public.consume_invitation_attempt(text), public.invitation_context(text),
  public.prepare_invitation_registration(text,text,text,jsonb), public.cancel_invitation_registration(text),
  public.invitation_registration_result(text,uuid) to asisteam_invitation;

-- These actor-less adapters only run within the verified API session transaction.
create function app_private.api_issue_invitation(p_group_id uuid,p_token_hash text,p_email text default null,p_role text default null,p_invitation_id uuid default null,p_membership_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.auth_user_id() is null then raise sqlstate 'PT401' using message='authentication_required'; end if;
  if not public.has_account_consent() then raise sqlstate 'PT403' using message='account_terms_required'; end if;
  if p_membership_id is not null then
    return public.issue_managed_activation(auth.uid(),p_group_id,p_membership_id,p_token_hash);
  end if;
  return public.issue_invitation(auth.uid(),p_group_id,p_token_hash,p_email,p_role,p_invitation_id);
end $$;
create function app_private.api_accept_invitation(p_token_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.auth_user_id() is null then raise sqlstate 'PT401' using message='authentication_required'; end if;
  if not public.has_account_consent() then raise sqlstate 'PT422' using message='account_terms_required'; end if;
  return public.accept_invitation(p_token_hash,auth.uid());
end $$;
revoke all on function app_private.api_issue_invitation(uuid,text,text,text,uuid,uuid), app_private.api_accept_invitation(text) from public,anon,authenticated,service_role;
grant execute on function app_private.api_issue_invitation(uuid,text,text,text,uuid,uuid), app_private.api_accept_invitation(text) to asisteam_api;
