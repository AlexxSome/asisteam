-- Canonical onboarding selection shared by the paged RPC and task counts.
CREATE FUNCTION app_private.membership_onboarding_rows(p_group_id uuid DEFAULT NULL::uuid, p_athlete_user_id uuid DEFAULT NULL::uuid, p_membership_id uuid DEFAULT NULL::uuid, p_as_guardian boolean DEFAULT false) RETURNS TABLE(membership_id uuid, athlete_user_id uuid, group_id uuid, group_name text, full_name text, membership_status text, account_status text, is_minor boolean, guardian_linked boolean, guardian_ready boolean, requires_managed_consent boolean, can_consent boolean, relationship text, capacity_block text, total_count bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
declare v_actor uuid := public.auth_user_id(); v_admin boolean := false;
begin
  if v_actor is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
  if p_group_id is not null then
    if not public.is_member(p_group_id) then raise sqlstate 'PT404' using message = 'group_not_found'; end if;
    v_admin := public.is_group_admin(p_group_id) and not coalesce(p_as_guardian, false);
  end if;
  return query
  select m.id, u.id, g.id, g.name, u.full_name, m.status, u.account_status,
    app_private.is_minor(u.birthdate),
    exists(select 1 from public.guardianships gs where gs.athlete_user_id = u.id and gs.status = 'ACTIVE'),
    app_private.has_minor_consent(u.id),
    app_private.is_minor(u.birthdate) and e.membership_id is not null and e.activated_at is null,
    m.status = 'PENDING' and own.id is not null and app_private.is_minor(u.birthdate)
      and exists(select 1 from public.users actor where actor.id = v_actor and actor.account_status = 'ACTIVE')
      and ((e.membership_id is not null and e.activated_at is null and e.guardianship_id = own.id)
        or (e.membership_id is null and not app_private.has_minor_consent(u.id))),
    own.relationship,
    case when v_admin and m.status = 'PENDING' then
      case when (select count(*) from public.memberships active_m where active_m.group_id = g.id
        and active_m.role = 'ATHLETE' and active_m.status = 'ACTIVE') >= app_private.group_athlete_limit(g.id)
        then 'subscription_athlete_limit'
      when (select count(*) from public.memberships active_m where active_m.group_id = g.id and active_m.status = 'ACTIVE')
        + 1 + (select count(*) from public.guardianships gs where gs.athlete_user_id = u.id and gs.status = 'ACTIVE'
          and app_private.is_minor(u.birthdate) and not exists(select 1 from public.memberships gm where gm.group_id = g.id
            and gm.user_id = gs.guardian_user_id and gm.role = 'GUARDIAN' and gm.status = 'ACTIVE'))
        > app_private.group_membership_limit(g.id) then 'group_member_limit'
      else null end
    else null end,
    count(*) over ()
  from public.memberships m join public.users u on u.id = m.user_id
  join public.groups g on g.id = m.group_id
  left join app_private.managed_member_enrollments e on e.membership_id = m.id
  left join public.guardianships own on own.athlete_user_id = u.id and own.guardian_user_id = v_actor
    and own.status = 'ACTIVE' and public.is_guardian_of(u.id)
    and exists(select 1 from public.memberships viewer where viewer.group_id = m.group_id
      and viewer.user_id = v_actor and viewer.role = 'GUARDIAN' and viewer.status = 'ACTIVE')
  where m.role = 'ATHLETE' and m.status in ('ACTIVE','PENDING')
    and (p_athlete_user_id is null or u.id = p_athlete_user_id)
    and (p_membership_id is null or m.id = p_membership_id)
    and ((p_group_id is null and m.user_id = v_actor and m.status = 'PENDING')
      or (m.group_id = p_group_id and ((v_admin and (m.status = 'PENDING' or p_membership_id is not null)) or (not v_admin and own.id is not null))))
  order by g.name, m.created_at, m.id;
end $$;
REVOKE ALL ON FUNCTION app_private.membership_onboarding_rows(uuid,uuid,uuid,boolean) FROM PUBLIC;
CREATE OR REPLACE FUNCTION public.list_membership_onboarding(p_group_id uuid DEFAULT NULL::uuid, p_athlete_user_id uuid DEFAULT NULL::uuid, p_membership_id uuid DEFAULT NULL::uuid, p_offset integer DEFAULT 0, p_as_guardian boolean DEFAULT false) RETURNS TABLE(membership_id uuid, athlete_user_id uuid, group_id uuid, group_name text, full_name text, membership_status text, account_status text, is_minor boolean, guardian_linked boolean, guardian_ready boolean, requires_managed_consent boolean, can_consent boolean, relationship text, capacity_block text, total_count bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  if public.auth_user_id() is null then raise sqlstate 'PT401' using message = 'authentication_required'; end if;
  if p_offset is null or p_offset < 0 then raise sqlstate 'PT400' using message = 'invalid_membership_review'; end if;
  return query select r.membership_id,r.athlete_user_id,r.group_id,r.group_name,r.full_name,r.membership_status,r.account_status,
   r.is_minor,r.guardian_linked,r.guardian_ready,r.requires_managed_consent,r.can_consent,r.relationship,r.capacity_block,r.total_count
  from app_private.membership_onboarding_rows(p_group_id,p_athlete_user_id,p_membership_id,p_as_guardian) r
  limit 50 offset p_offset;
end $$;

-- UI-03: one authorized snapshot for the group home. No cache or copied metric.
CREATE FUNCTION public.get_group_dashboard(p_group_id uuid, p_activity_id uuid DEFAULT NULL,
 p_records_page integer DEFAULT 1, p_day_page integer DEFAULT 1, p_wards_page integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_actor uuid := public.auth_user_id(); v_created timestamptz; v_roles text[];
 v_admin boolean; v_operator boolean; v_stats boolean; v_selected uuid; v_result jsonb;
 v_week record; v_month record; v_day record;
BEGIN
 IF v_actor IS NULL THEN RAISE SQLSTATE 'PT401' USING message='authentication_required'; END IF;
 SELECT g.created_at INTO v_created FROM public.groups g WHERE g.id=p_group_id AND public.is_member(g.id);
 IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING message='group_not_found'; END IF;
 IF NOT public.has_account_consent() THEN RAISE SQLSTATE 'PT403' USING message='account_consent_required'; END IF;
 IF p_records_page IS NULL OR p_records_page NOT BETWEEN 1 AND 1000000
  OR p_day_page IS NULL OR p_day_page NOT BETWEEN 1 AND 1000000
  OR p_wards_page IS NULL OR p_wards_page NOT BETWEEN 1 AND 1000000 THEN
  RAISE SQLSTATE 'PT400' USING message='invalid_report_filters';
 END IF;
 SELECT array_agg(role) INTO v_roles FROM public.memberships
  WHERE group_id=p_group_id AND user_id=v_actor AND status='ACTIVE';
 v_admin := 'ADMIN'=ANY(v_roles); v_operator := app_private.can_manage_attendance(p_group_id);
 v_stats := app_private.can_view_group_stats(p_group_id);
 SELECT * INTO v_week FROM app_private.attendance_period_bounds('week',NULL,NULL,v_created);
 SELECT * INTO v_month FROM app_private.attendance_period_bounds('month',NULL,NULL,v_created);
 SELECT * INTO v_day FROM app_private.attendance_period_bounds('custom',app_private.chile_today(),app_private.chile_today(),v_created);
 -- Activities overlapping today include an overnight encounter still in progress.
 IF p_activity_id IS NOT NULL THEN
  SELECT id INTO v_selected FROM public.v_group_activities WHERE group_id=p_group_id AND id=p_activity_id
   AND starts_at<v_day.until_utc AND ends_at>=v_day.from_utc;
  IF NOT FOUND THEN RAISE SQLSTATE 'PT404' USING message='activity_not_found'; END IF;
 ELSE
  SELECT id INTO v_selected FROM public.v_group_activities WHERE group_id=p_group_id
   AND starts_at<v_day.until_utc AND ends_at>=v_day.from_utc
   ORDER BY CASE WHEN starts_at<=now() AND ends_at>=now() THEN 0 WHEN starts_at>now() THEN 1 ELSE 2 END,
    CASE WHEN ends_at>=now() THEN starts_at END, CASE WHEN ends_at<now() THEN ends_at END DESC, id LIMIT 1;
 END IF;
 WITH activities AS MATERIALIZED (
  SELECT id,group_id,activity_type_id,title,description,location,starts_at,ends_at,activity_type_name,
   activity_type_color,is_system_type,recurrence_rule,recurrence_source_id
  FROM public.v_group_activities WHERE group_id=p_group_id
 ), roster AS MATERIALIZED (
  SELECT id,user_id,joined_at FROM public.memberships WHERE group_id=p_group_id AND role='ATHLETE' AND status='ACTIVE'
 ), month_counts AS MATERIALIZED (
  SELECT c.membership_id,c.present,c.late,c.absent,c.excused FROM app_private.attendance_report_counts c
   JOIN roster r ON r.id=c.membership_id
  WHERE c.group_id=p_group_id AND c.activity_date>=v_month.from_date AND c.activity_date<v_month.until_date
 ), totals AS (
  SELECT coalesce(sum(present),0)::bigint AS present,coalesce(sum(late),0)::bigint AS late,
   coalesce(sum(absent),0)::bigint AS absent,coalesce(sum(excused),0)::bigint AS excused FROM month_counts
 ), upcoming AS (
  SELECT a.id,a.group_id,a.activity_type_id,a.title,a.description,a.location,a.starts_at,a.ends_at,
   a.activity_type_name,a.activity_type_color,a.is_system_type,a.recurrence_rule,a.recurrence_source_id
  FROM activities a WHERE ends_at>=now()
  ORDER BY CASE WHEN starts_at<=now() THEN 0 ELSE 1 END,starts_at,id LIMIT 3
 ), today AS MATERIALIZED (
  SELECT a.id,a.group_id,a.activity_type_id,a.title,a.description,a.location,a.starts_at,a.ends_at,
   a.activity_type_name,a.activity_type_color,a.is_system_type,a.recurrence_rule,a.recurrence_source_id
  FROM activities a WHERE starts_at<v_day.until_utc AND ends_at>=v_day.from_utc
 ), today_page AS (
  SELECT t.id,t.group_id,t.activity_type_id,t.title,t.description,t.location,t.starts_at,t.ends_at,
   t.activity_type_name,t.activity_type_color,t.is_system_type,t.recurrence_rule,t.recurrence_source_id
  FROM today t ORDER BY starts_at,id LIMIT 50 OFFSET (p_day_page-1)*50
 ), selected AS (SELECT id,starts_at FROM activities WHERE id=v_selected),
 selected_roster AS MATERIALIZED (
  SELECT r.id,r.user_id FROM roster r JOIN selected a ON r.joined_at<=a.starts_at
 ), saved AS MATERIALIZED (
  SELECT r.id,r.membership_id,r.status,CASE WHEN v_admin THEN r.note ELSE NULL END AS note,u.full_name
  FROM public.attendance_records r JOIN selected_roster m ON m.id=r.membership_id
  JOIN public.users u ON u.id=m.user_id WHERE r.activity_id=v_selected AND v_operator
 ), record_page AS (
  SELECT id,membership_id,full_name,status,note FROM saved ORDER BY full_name,membership_id LIMIT 4 OFFSET (p_records_page-1)*4
 ), activity_counts AS (
  SELECT count(*) FILTER(WHERE status='PRESENT') AS present,count(*) FILTER(WHERE status='LATE') AS late,
   count(*) FILTER(WHERE status='ABSENT') AS absent,count(*) FILTER(WHERE status='EXCUSED') AS excused FROM saved
 ), wards AS MATERIALIZED (
  SELECT r.id AS membership_id,r.user_id AS athlete_user_id,u.full_name
  FROM roster r JOIN public.users u ON u.id=r.user_id
  WHERE 'GUARDIAN'=ANY(v_roles) AND public.is_guardian_of(r.user_id)
 ), ward_page AS (
  SELECT membership_id,athlete_user_id,full_name FROM wards ORDER BY full_name,athlete_user_id LIMIT 4 OFFSET (p_wards_page-1)*4
 ), ward_counts AS (
  SELECT w.membership_id,w.athlete_user_id,w.full_name,
   coalesce(sum(c.present),0)::bigint AS present,coalesce(sum(c.late),0)::bigint AS late,
   coalesce(sum(c.absent),0)::bigint AS absent,coalesce(sum(c.excused),0)::bigint AS excused
  FROM ward_page w LEFT JOIN month_counts c USING(membership_id) GROUP BY w.membership_id,w.athlete_user_id,w.full_name
 )
 SELECT jsonb_build_object(
  'group_id',p_group_id,'now',now(),'access',CASE WHEN v_admin THEN 'admin' WHEN v_operator THEN 'coach' ELSE 'member' END,
  'periods',jsonb_build_object('week',jsonb_build_object('from',v_week.from_date,'to',v_week.until_date-1,'from_utc',v_week.from_utc,'until_utc',v_week.until_utc),
   'month',jsonb_build_object('from',v_month.from_date,'to',v_month.until_date-1,'from_utc',v_month.from_utc,'until_utc',v_month.until_utc),'timezone','America/Santiago'),
  'indicators',CASE WHEN v_stats THEN jsonb_build_object('active_athletes',(SELECT count(*) FROM roster),
   'week_activities',(SELECT count(*) FROM activities WHERE starts_at>=v_week.from_utc AND starts_at<v_week.until_utc),
   'monthly',(SELECT to_jsonb(metric) FROM totals c CROSS JOIN LATERAL app_private.attendance_metrics(c.present,c.late,c.absent,c.excused) metric)) ELSE NULL END,
  'latest_announcement',(SELECT jsonb_build_object('id',a.id,'title',a.title,'body',a.body,'created_at',a.created_at,'updated_at',a.updated_at) FROM public.list_group_announcements(p_group_id,1) a ORDER BY a.created_at DESC,a.id DESC LIMIT 1),
  'pending',CASE WHEN v_admin THEN (SELECT count(*) FROM public.memberships WHERE group_id=p_group_id AND role='ATHLETE' AND status='PENDING') ELSE NULL END,
  'upcoming',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY CASE WHEN starts_at<=now() THEN 0 ELSE 1 END,starts_at,id) FROM upcoming a),'[]'::jsonb),
  'previous',(SELECT to_jsonb(a) FROM activities a WHERE ends_at<now() ORDER BY ends_at DESC,id LIMIT 1),
  'today',jsonb_build_object('data',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY starts_at,id) FROM today_page a),'[]'::jsonb),'total',(SELECT count(*) FROM today),'page',p_day_page),
  'selected_activity_id',v_selected,'selected_activity',(SELECT to_jsonb(a) FROM activities a WHERE id=v_selected),
  'guardian_tasks',CASE WHEN 'GUARDIAN'=ANY(v_roles) THEN jsonb_build_object('consents',(SELECT count(*) FROM app_private.membership_onboarding_rows(p_group_id,NULL,NULL,true) WHERE can_consent),
   'activations',coalesce((SELECT total_count FROM public.list_managed_activation_requests(p_group_id,0,NULL) LIMIT 1),0)) ELSE NULL END,
  'context',CASE WHEN v_operator AND v_selected IS NOT NULL THEN jsonb_build_object('activity_id',v_selected,
   'phase',CASE WHEN (SELECT starts_at FROM selected)>now() THEN 'preparation' ELSE 'started' END,
   'active_athletes',(SELECT count(*) FROM selected_roster),'recorded',(SELECT count(*) FROM saved),
   'unmarked',(SELECT count(*) FROM selected_roster)-(SELECT count(*) FROM saved),
   'counts',(SELECT to_jsonb(metric)||jsonb_build_object('attendance_pct',CASE WHEN (SELECT starts_at FROM selected)<=now() THEN metric.attendance_pct ELSE NULL END,
    'late_rate',CASE WHEN (SELECT starts_at FROM selected)<=now() THEN metric.late_rate ELSE NULL END)
    FROM activity_counts c CROSS JOIN LATERAL app_private.attendance_metrics(c.present,c.late,c.absent,c.excused) metric),
   'records',CASE WHEN v_admin THEN jsonb_build_object('data',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY full_name,membership_id) FROM record_page r),'[]'::jsonb),
    'total',(SELECT count(*) FROM saved),'page',p_records_page) ELSE NULL END) ELSE NULL END,
  'personal',CASE WHEN 'ATHLETE'=ANY(v_roles) THEN jsonb_build_object(
   'monthly',public.get_my_attendance_history(p_group_id,'month',NULL,NULL,'{}',1,1)->'totals',
   'selected_record',(SELECT jsonb_build_object('id',r.id,'status',r.status,'note',r.note) FROM public.attendance_records r
    JOIN roster m ON m.id=r.membership_id WHERE m.user_id=v_actor AND r.activity_id=v_selected)) ELSE NULL END,
  'wards',CASE WHEN 'GUARDIAN'=ANY(v_roles) THEN jsonb_build_object('data',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'athlete_user_id',w.athlete_user_id,'full_name',w.full_name,'monthly',to_jsonb(metric),
   'selected_record',(SELECT jsonb_build_object('id',r.id,'status',r.status,'note',r.note) FROM public.attendance_records r WHERE r.membership_id=w.membership_id AND r.activity_id=v_selected))
   ORDER BY w.full_name,w.athlete_user_id) FROM ward_counts w CROSS JOIN LATERAL app_private.attendance_metrics(w.present,w.late,w.absent,w.excused) metric),'[]'::jsonb),
   'total',(SELECT count(*) FROM wards),'page',p_wards_page) ELSE NULL END
 ) INTO v_result;
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.get_group_dashboard(uuid,uuid,integer,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_group_dashboard(uuid,uuid,integer,integer,integer) TO asisteam_member;
COMMENT ON FUNCTION public.get_group_dashboard(uuid,uuid,integer,integer,integer) IS 'UI-03: ACTIVE tenant, Chile periods, canonical weighted metrics; ADMIN preview4, COACH summary, V1/V2 own/wards, V4 totals null when forbidden.';
