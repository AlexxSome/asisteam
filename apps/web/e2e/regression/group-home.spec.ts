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
