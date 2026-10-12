import { test, expect } from './test';
import { randomUUID } from 'node:crypto';
import type { Page, TestInfo } from '@playwright/test';

async function screenshot(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  await info.attach(name, { path, contentType: 'image/png' });
}
import { email } from './data.mjs';
import { activityType, quote, sql } from './local-fixtures.mjs';
import { checkAccessibility, checkLayout, login, visit } from './helpers';

test('UI-05 inicio real: seis perfiles, selector de pupilo, toggle, revocación y reflow', async ({ page, context }, info) => {
  test.setTimeout(180000);
  const group = randomUUID(), selected = randomUUID(), wards = [randomUUID(), randomUUID(), randomUUID()] as const;
  const profiles = Object.fromEntries(['admin', 'coach', 'athlete', 'guardian', 'multi'].map(role => [role, sql(`select id from public.users where email=${quote(email(role))}`)]));
  // All accounts and records belong to the disposable native test database.
  sql(`insert into public.groups(id,name,invite_code,created_by) values('${group}','Club sintético UI05',${quote(randomUUID().replaceAll('-', '').slice(0, 8))},'${profiles.admin}');
    insert into app_private.billing_legacy_groups(group_id) values('${group}');`);
  for (const [role, permissions] of [['admin', ['ADMIN']], ['coach', ['COACH']], ['athlete', ['ATHLETE']], ['guardian', ['GUARDIAN']], ['multi', ['ADMIN', 'ATHLETE']]] as const) {
    for (const permission of permissions) sql(`insert into public.memberships(user_id,group_id,role,status,joined_at) values('${profiles[role]}','${group}','${permission}','ACTIVE',now()-interval '100 days');`);
  }
  for (const [index, ward] of wards.entries()) {
    const relationship = randomUUID();
    sql(`insert into public.users(id,full_name,birthdate,account_status) values('${ward}','Pupilo UI05 ${index + 1}',(app_private.chile_today()-interval '12 years')::date,'MANAGED');
      insert into public.guardianships(id,guardian_user_id,athlete_user_id,relationship) values('${relationship}','${profiles.guardian}','${ward}','PARENT');
      ${index < 2 ? `insert into public.consents(guardianship_id,consent_type,terms_version) values('${relationship}','DATA_PROCESSING_MINOR','1.0');` : ''}
      insert into public.memberships(user_id,group_id,role,status,joined_at) values('${ward}','${group}','ATHLETE','${index < 2 ? 'ACTIVE' : 'PENDING'}',now()-interval '100 days');`);
  }
  sql(`insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by) values('${selected}','${group}','${activityType}','Entrenamiento UI05',now()-interval '15 minutes',now()+interval '45 minutes','${profiles.admin}');
    insert into public.activities(group_id,activity_type_id,title,starts_at,ends_at,created_by) select '${group}','${activityType}','Próximo encuentro UI05 '||n,now()+n*interval '1 day',now()+n*interval '1 day'+interval '1 hour','${profiles.admin}' from generate_series(1,2)n;
    insert into public.attendance_records(activity_id,membership_id,status,note,recorded_by) select '${selected}',id,'PRESENT','Nota UI05 autorizada','${profiles.admin}' from public.memberships where group_id='${group}' and role='ATHLETE' and status='ACTIVE';`);
  for (const role of ['admin', 'coach', 'athlete', 'guardian', 'multi']) {
    await context.clearCookies(); await login(page, role); await visit(page, `/groups/${group}`);
    await expect(page.getByRole('heading', { name: 'Inicio', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Próximas actividades' }).getByRole('listitem')).toHaveCount(3);
    await expect(page.getByRole('region', { name: 'Mi asistencia' })).toHaveCount(['athlete', 'multi'].includes(role) ? 1 : 0);
    await expect(page.getByRole('region', { name: 'Mis pupilos' })).toHaveCount(role === 'guardian' ? 1 : 0);
    await expect(page.getByRole('region', { name: 'Resumen de la actividad' })).toHaveCount(['admin', 'coach', 'multi'].includes(role) ? 1 : 0);
    await expect(page.getByRole('link', { name: 'Revisar aprobaciones', exact: true })).toHaveCount(['admin', 'multi'].includes(role) ? 1 : 0);
    await expect(page.getByRole('link', { name: 'Tomar asistencia', exact: true })).toHaveCount(['admin', 'coach', 'multi'].includes(role) ? 1 : 0);
    if (role === 'coach') {
      await expect(page.getByRole('region', { name: 'Resumen de la actividad' })).not.toContainText('Nota UI05');
      await expect(page.getByRole('button', { name: /nota|desmarcar|aprobar/i })).toHaveCount(0);
    }
    if (role === 'guardian') {
      const panel = page.getByRole('region', { name: 'Mis pupilos' });
      await panel.getByLabel('Seleccionar pupilo').selectOption(wards[1]);
      await expect(panel.getByRole('heading', { name: 'Pupilo UI05 2', exact: true })).toBeVisible();
      await expect(panel.getByRole('link', { name: 'Ver historial de Pupilo UI05 2 en Club sintético UI05' })).toHaveAttribute('href', `/groups/${group}/wards/${wards[1]}/history?period=month`);
      await expect(panel).toContainText('Una solicitud PENDING aún no habilita asistencia');
      await expect(panel.getByLabel('Seleccionar pupilo').getByRole('option', { name: 'Pupilo UI05 3' })).toHaveCount(0);
      for (const width of [320, 375, 768, 1024, 1440, 1536]) {
        await page.setViewportSize({ width, height: 900 }); await checkLayout(page); await checkAccessibility(page, info);
      }
      await page.setViewportSize({ width: 375, height: 900 }); await screenshot(page, info, 'guardian-home-375');
      await page.setViewportSize({ width: 1440, height: 900 }); await screenshot(page, info, 'guardian-home-1440');
    } else { await checkLayout(page); await checkAccessibility(page, info); }
  }
  // Compose ATHLETE+GUARDIAN without replacing the athlete membership.
  const athleteRelationship = randomUUID();
  sql(`insert into public.guardianships(id,guardian_user_id,athlete_user_id,relationship) values('${athleteRelationship}','${profiles.athlete}','${wards[0]}','PARENT');
    insert into public.consents(guardianship_id,consent_type,terms_version) values('${athleteRelationship}','DATA_PROCESSING_MINOR','1.0');
    insert into public.memberships(user_id,group_id,role,status) values('${profiles.athlete}','${group}','GUARDIAN','ACTIVE') on conflict(user_id,group_id,role) do update set status='ACTIVE';`);
  await context.clearCookies(); await login(page, 'athlete'); await visit(page, `/groups/${group}`);
  await expect(page.getByRole('region', { name: 'Mi asistencia' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Mis pupilos' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Resumen del grupo' })).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 900 }); await screenshot(page, info, 'athlete-guardian-home-1440');
  sql(`update public.groups set settings='{"athletes_can_view_group_stats":true,"guardians_can_view_group_stats":false}' where id='${group}';`);
  await page.reload(); await expect(page.getByRole('region', { name: 'Resumen del grupo' })).toBeVisible();
  sql(`update public.groups set settings='{"athletes_can_view_group_stats":false,"guardians_can_view_group_stats":false}' where id='${group}';
    update public.guardianships set status='INACTIVE',deactivated_at=now() where id='${athleteRelationship}';`);
  await page.reload(); await expect(page.getByRole('region', { name: 'Resumen del grupo' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Mis pupilos' }).getByRole('heading', { name: 'Pupilo UI05 1', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Mi asistencia' })).toBeVisible();
  await checkLayout(page); await checkAccessibility(page, info); await screenshot(page, info, 'athlete-guardian-revoked-home-1440');
});

test('UI-04 ADMIN: composición, tabla, selección, estados secundarios y responsive', async ({ page }, info) => {
  test.setTimeout(180000);
  const group=randomUUID(), selected=randomUUID(), future=randomUUID(), admin=sql(`select id from public.users where email=${quote(email('admin'))}`);
  sql(`insert into public.groups(id,name,invite_code,created_by) values('${group}','Club sintético UI04',${quote(randomUUID().replaceAll('-','').slice(0,8))},'${admin}');
    insert into app_private.billing_legacy_groups(group_id) values('${group}');
    insert into public.memberships(user_id,group_id,role,status) values('${admin}','${group}','ADMIN','ACTIVE');
    with users as (insert into public.users(full_name,birthdate,account_status) select 'Deportista UI04 '||lpad(n::text,2,'0'),'1990-01-01','MANAGED' from generate_series(1,13)n returning id,full_name)
    insert into public.memberships(user_id,group_id,role,status,joined_at) select id,'${group}','ATHLETE',case when full_name in('Deportista UI04 12','Deportista UI04 13') then 'PENDING' else 'ACTIVE' end,now()-interval '100 days' from users;
    insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by) values
    ('${selected}','${group}','${activityType}','Entrenamiento UI04',now()-interval '5 minutes',now()+interval '1 hour','${admin}'),
    ('${future}','${group}','${activityType}','Encuentro futuro UI04',now()+interval '10 minutes',now()+interval '2 hours','${admin}');
    insert into public.activities(group_id,activity_type_id,title,starts_at,ends_at,created_by) values('${group}','${activityType}','Competencia UI04',now()+interval '1 day',now()+interval '1 day 1 hour','${admin}');
    with roster as (select m.id,row_number() over(order by u.full_name,m.id)n from public.memberships m join public.users u on u.id=m.user_id where m.group_id='${group}' and m.role='ATHLETE' and m.status='ACTIVE')
    insert into public.attendance_records(activity_id,membership_id,status,recorded_by) select '${selected}',id,case when n<=6 then 'PRESENT' when n=7 then 'LATE' when n<=9 then 'ABSENT' else 'EXCUSED' end,'${admin}' from roster where n<=10;
    insert into public.group_announcements(group_id,title,body,created_by) values('${group}','Aviso UI04','Nos reunimos en la cancha. Datos sintéticos para comparación visual.','${admin}');`);
  await login(page,'admin');await visit(page,`/groups/${group}`);
  const preview=page.getByRole('region',{name:'Registros de la actividad',exact:true}), summary=page.getByRole('region',{name:'Resumen de la actividad'}), indicators=page.getByRole('region',{name:'Indicadores del grupo'});
  await expect(page.getByRole('link',{name:'Tomar asistencia',exact:true})).toHaveAttribute('href',`/groups/${group}/activities/${selected}/attendance`);
  await expect(summary).toContainText('77,8 %');await expect(summary).toContainText('(6 + 1) / 9');await expect(summary).toContainText('Sin marcar: 1');
  await expect(indicators).toContainText('77,8 %');await expect(preview).toContainText('Mostrando 4 de 10 registros');await expect(preview.getByRole('table').getByRole('row')).toHaveCount(5);
  await expect(preview.getByRole('link',{name:'Ver actividad',exact:true})).toHaveAttribute('href',`/groups/${group}/activities/${selected}`);
  for(const width of [320,375,768,1024,1440,1536]){
    await page.setViewportSize({width,height:900});await checkLayout(page);await checkAccessibility(page,info);
    const measurements=await page.evaluate(()=>{
      const region=(name:string)=>document.querySelector<HTMLElement>(`section[aria-labelledby="${name}"]`)!.getBoundingClientRect();
      const kpi=document.querySelector<HTMLElement>('section[aria-label="Indicadores del grupo"]')!.getBoundingClientRect();
      return {upcoming:region('upcoming-heading').y,pending:region('pending-heading').y,context:region('context-heading').y,records:region('records-heading').y,kpi:kpi.y,kpiItems:[...document.querySelectorAll('section[aria-label="Indicadores del grupo"] dl > div')].map(el=>el.getBoundingClientRect().y)};
    });
    if(width>=1440){expect(new Set(measurements.kpiItems).size).toBe(1);expect(measurements.kpi).toBeLessThan(measurements.upcoming);expect(measurements.upcoming).toBe(measurements.context);}
    if(width<768){expect(measurements.upcoming).toBeLessThan(measurements.pending);expect(measurements.pending).toBeLessThan(measurements.kpi);expect(measurements.kpi).toBeLessThan(measurements.context);expect(measurements.context).toBeLessThan(measurements.records);}
    if([375,1440,1536].includes(width))await screenshot(page,info,`admin-home-${width}`);
  }
  await page.setViewportSize({width:720,height:900});await checkLayout(page);
  await page.setViewportSize({width:375,height:900});
  const tableScroll=page.getByRole('region',{name:'Tabla de registros de la actividad, desplazamiento horizontal'});
  await tableScroll.focus();await expect(tableScroll).toBeFocused();await page.keyboard.press('ArrowRight');await checkLayout(page);
  await preview.getByRole('link',{name:'Más registros'}).click();await expect(preview).toContainText('Página 2');await expect(preview).toContainText('Mostrando 4 de 10 registros');await expect(preview.getByRole('link',{name:'Ver actividad',exact:true})).toHaveAttribute('href',`/groups/${group}/activities/${selected}`);
  await page.getByLabel('Actividad del día').selectOption(future);await page.getByRole('button',{name:'Ver actividad',exact:true}).click();await expect(summary).toContainText('No hay porcentaje realizado');await expect(summary).not.toContainText('77,8 %');await expect(page.getByRole('link',{name:'Tomar asistencia',exact:true})).toHaveAttribute('href',`/groups/${group}/activities/${future}/attendance`);
  // Inject only the transport representation. SQL subtransaction failures are
  // exercised separately by pgTAP; auth and other DTO fields remain real.
  await page.route(`**/web-api/v1/groups/${group}/dashboard**`,async route=>{
    const response=await route.fetch();const data=await response.json();
    await route.fulfill({response,json:{...data,pending:null,latest_announcement:null,secondary_errors:['pending','latest_announcement']}});
  });
  await page.reload();await expect(page.getByRole('button',{name:'Reintentar anuncio'})).toBeVisible();await expect(indicators).toContainText('No disponible');await expect(page.getByRole('link',{name:'Tomar asistencia',exact:true})).toBeVisible();await expect(page.getByText('No hay anuncios publicados.',{exact:true})).toHaveCount(0);await checkAccessibility(page,info);
  await page.unroute(`**/web-api/v1/groups/${group}/dashboard**`);await page.getByRole('button',{name:'Reintentar anuncio'}).click();await expect(page.getByRole('button',{name:'Reintentar anuncio'})).toHaveCount(0);await expect(page.getByRole('heading',{name:'Aviso UI04',exact:true})).toBeVisible();await expect(page.getByRole('region',{name:'Pendientes del grupo'})).toContainText('2 incorporaciones');await checkLayout(page);
});
