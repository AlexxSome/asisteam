import { pathToFileURL } from 'node:url';
import { email, id } from './data.mjs';
import { activityType, quote, sql } from './local-fixtures.mjs';

// Uses only the disposable database validated by localConfig(). The same fixture
// supports automated review and a supervised human session without deleting marks.
export function prepareRedesignFixture() {
  const group = id(6000), activity = id(6002), empty = id(6003), ward = id(6201), pending = id(6202);
  const groupName = 'Club sintético UI181 · entrenamiento de personas con nombres extensos';
  const activityName = 'EntrenamientoUI181ConNombreExtensoSinEspaciosParaVerificarReflow';
  const profiles = Object.fromEntries(['admin', 'coach', 'athlete', 'guardian', 'multi'].map(role => [role,
    sql(`select id from public.users where email=${quote(email(role))}`)]));
  if (Object.values(profiles).some(value => !value)) throw new Error('Iniciar el servidor QA nativo antes de preparar UI181');
  if (sql(`select count(*) from public.groups where id in('${group}','${empty}') and created_by<>'${profiles.admin}'`) !== '0') throw new Error('Namespace UI181 ocupado');
  if (sql(`select count(*) from public.groups where id='${group}'`) === '0') {
    sql(`begin;
      insert into public.groups(id,name,invite_code,created_by) values
        ('${group}',${quote(groupName)},'${id(6000).slice(0, 6)}Q1','${profiles.admin}'),
        ('${empty}','Club sintético UI181 sin actividades','${id(6000).slice(0, 6)}Q2','${profiles.admin}');
      insert into app_private.billing_legacy_groups(group_id) values('${group}'),('${empty}');
      insert into public.memberships(user_id,group_id,role,status,joined_at) values
        ('${profiles.admin}','${empty}','ADMIN','ACTIVE',now()-interval '90 days');
      ${[['admin', 'ADMIN'], ['coach', 'COACH'], ['athlete', 'ATHLETE'], ['guardian', 'GUARDIAN'], ['multi', 'ADMIN'], ['multi', 'ATHLETE']].map(([role, permission]) =>
        `insert into public.memberships(user_id,group_id,role,status,joined_at) values('${profiles[role]}','${group}','${permission}','ACTIVE',now()-interval '90 days');`).join('\n')}
      insert into public.users(id,full_name,birthdate,account_status) values
        ${Array.from({ length: 17 }, (_, index) => `('${id(6101 + index)}','Deportista UI181 ${String(index + 1).padStart(2, '0')} ApellidoExtensoSinEspaciosParaVerificarReflow','1990-01-01','MANAGED')`).join(',')},
        ('${ward}','Pupilo UI181 con consentimiento vigente',(app_private.chile_today()-interval '12 years')::date,'MANAGED'),
        ('${pending}','Menor UI181 pendiente sin consentimiento',(app_private.chile_today()-interval '12 years')::date,'MANAGED');
      insert into public.guardianships(id,guardian_user_id,athlete_user_id,relationship) values('${id(6210)}','${profiles.guardian}','${ward}','PARENT');
      insert into public.consents(guardianship_id,consent_type,terms_version) values('${id(6210)}','DATA_PROCESSING_MINOR','2026-09-21');
      insert into public.memberships(user_id,group_id,role,status,joined_at)
        select id,'${group}','ATHLETE','ACTIVE',now()-interval '90 days' from public.users where id between '${id(6101)}' and '${id(6117)}' or id='${ward}';
      insert into public.memberships(user_id,group_id,role,status) values('${pending}','${group}','ATHLETE','PENDING');
      insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by) values
        ('${activity}','${group}','${activityType}',${quote(activityName)},now()-interval '15 minutes',now()+interval '45 minutes','${profiles.admin}');
      with roster as(select m.id,row_number() over(order by u.full_name,m.id)n from public.memberships m join public.users u on u.id=m.user_id where m.group_id='${group}' and m.role='ATHLETE' and m.status='ACTIVE')
      insert into public.attendance_records(activity_id,membership_id,status,recorded_by)
        select '${activity}',id,case when n<=6 then 'PRESENT' when n=7 then 'LATE' when n<=9 then 'ABSENT' else 'EXCUSED' end,'${profiles.admin}' from roster where n<=10;
      insert into public.group_announcements(group_id,title,body,created_by)
        values('${group}','Aviso sintético UI181','Texto completo de una convocatoria local. Sin datos de personas reales.','${profiles.admin}');
      commit;`);
  }
  return { group, activity, empty, ward, pending, groupName, activityName };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const fixture = prepareRedesignFixture();
  console.log(JSON.stringify({ group: `/groups/${fixture.group}`, attendance: `/groups/${fixture.group}/activities/${fixture.activity}/attendance`,
    wardHistory: `/groups/${fixture.group}/wards/${fixture.ward}/history`, activeAthletes: 20, humanAcceptance: 'PENDIENTE' }, null, 2));
}
