-- HU-ADM-12 (#31): edición parcial posterior, sin reponer campos del cliente
-- que otro administrador pudo haber corregido mientras la pantalla estaba abierta.
create function public.update_attendance_record(p_record_id uuid, p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
    v_activity_id uuid;
    v_membership_id uuid;
    v_status text;
begin
    if public.auth_user_id() is null then
        raise sqlstate 'PT401' using message = 'authentication_required';
    end if;
    select r.activity_id into v_activity_id
    from public.attendance_records r join public.activities a on a.id = r.activity_id
    where r.id = p_record_id and public.is_member(a.group_id);
    if not found then raise sqlstate 'PT404' using message = 'attendance_record_not_found'; end if;

    -- Mismo orden de bloqueo que alta, desmarcado y edición/eliminación de
    -- actividades. Se relee el estado solo después de adquirir el bloqueo.
    perform app_private.lock_attendance_activity(v_activity_id);
    select membership_id, status into v_membership_id, v_status
    from public.attendance_records where id = p_record_id for update;
    if not found then raise sqlstate 'PT404' using message = 'attendance_record_not_found'; end if;

    if p_changes is null or jsonb_typeof(p_changes) <> 'object'
      or p_changes = '{}'::jsonb or p_changes - array['status','note'] <> '{}'::jsonb then
        raise sqlstate 'PT400' using message = 'invalid_attendance_changes';
    end if;

    -- La RPC canónica valida estados/notas y membresía, conserva la nota
    -- omitida y asigna recorded_by/recorded_at exclusivamente en el servidor.
    return public.record_attendance_bulk(v_activity_id, jsonb_build_array(
        jsonb_build_object('membership_id', v_membership_id, 'status', v_status) || p_changes
    ));
end $$;

revoke all on function public.update_attendance_record(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.update_attendance_record(uuid,jsonb) to authenticated;
