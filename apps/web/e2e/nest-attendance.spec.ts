import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { email, groups, activity, rosterName, id } from './data.mjs';
import { checkAccessibility, checkLayout, login, screenshot, visit } from './helpers';
import { activityType, quote, sql } from './local-fixtures.mjs';

test.skip(process.env.ASISTEAM_QA_NEST !== '1', 'Requiere Next→Nest→PostgreSQL local');
test('MIG-11 guardado, recarga, corrección ADMIN y COACH por teclado a375px', async ({ page, context }, info) => {
  const coach=sql(`select id from public.users where email=${quote(email('coach'))}`);
  const previous=sql(`select count(*) from public.memberships where user_id='${coach}' and group_id='${groups.single}' and role='COACH'`);
  if(previous==='0')sql(`insert into public.memberships(user_id,group_id,role,status) values('${coach}','${groups.single}','COACH','ACTIVE')`);
  try {
  await page.setViewportSize({ width: 375, height: 812 });await login(page, 'admin');
  const path=`/groups/${groups.single}/activities/${activity(groups.single)}/attendance`;
  await visit(page,path);
  const row=page.getByRole('group',{name:`Asistencia de ${rosterName(1)}`}).locator('..');
  const selected=row.getByRole('button',{pressed:true});
  if(await selected.count()){await selected.click();await expect(page.getByRole('status',{name:`Guardado de ${rosterName(1)}`})).toContainText('Registro desmarcado');}
  const present=row.getByRole('button',{name:'Presente',exact:true});
  await present.focus();await page.keyboard.press('Enter');
  await expect(present).toHaveAttribute('aria-pressed','true');await expect(present).toBeEnabled();
  await page.reload();await expect(present).toHaveAttribute('aria-pressed','true');
  const late=row.getByRole('button',{name:'Atrasado',exact:true});await late.focus();await page.keyboard.press('Space');
  await expect(late).toHaveAttribute('aria-pressed','true');await expect(late).toBeEnabled();
  await page.getByRole('button',{name:`Nota de ${rosterName(1)} (opcional)`}).click();
  await page.getByRole('textbox',{name:`Nota de ${rosterName(1)}`}).fill('Nota sintética MIG11');await page.getByRole('button',{name:'Guardar nota',exact:true}).click();
  await expect(page.getByRole('status',{name:`Guardado de ${rosterName(1)}`})).toContainText('Guardado');
  await page.reload();await expect(late).toHaveAttribute('aria-pressed','true');
  expect(sql(`select status||':'||note from public.attendance_records where activity_id='${activity(groups.single)}' and membership_id=(select id from public.memberships where group_id='${groups.single}' and role='ATHLETE' and user_id='${id(1001)}')`)).toBe('LATE:Nota sintética MIG11');
  await checkLayout(page);await checkAccessibility(page,info);await screenshot(page,info,'attendance-mig11-375');
  await context.clearCookies();await login(page,'coach');await visit(page,path);
  await expect(page.getByRole('button',{name:/^Nota de /})).toHaveCount(0);
  await late.focus();await page.keyboard.press('Enter');await expect(late).toBeEnabled();
  expect(sql(`select status||':'||note from public.attendance_records where activity_id='${activity(groups.single)}' and membership_id=(select id from public.memberships where group_id='${groups.single}' and role='ATHLETE' and user_id='${id(1001)}')`)).toBe('LATE:Nota sintética MIG11');
  const absent=row.getByRole('button',{name:'Ausente',exact:true});await absent.click();await expect(absent).toBeEnabled();await page.reload();await expect(absent).toHaveAttribute('aria-pressed','true');
  expect(sql(`select note from public.attendance_records where activity_id='${activity(groups.single)}' and membership_id=(select id from public.memberships where group_id='${groups.single}' and role='ATHLETE' and user_id='${id(1001)}')`)).toBe('Nota sintética MIG11');
  } finally {if(previous==='0')sql(`delete from public.memberships where user_id='${coach}' and group_id='${groups.single}' and role='COACH'`);}
});

test('MIG-11 dos lotes: fallo de red conserva500 confirmados, sin cola ni reenvío', async ({ page }, info) => {
  const groupId=randomUUID(),activityId=randomUUID(),subscriptionId=randomUUID();
  const owner=sql(`select id from public.users where email=${quote(email('admin'))}`);
  let users: string[]=[];
  try {
    sql(`insert into public.groups(id,name,sport,invite_code,created_by) values('${groupId}','Club sintético MIG11','Tenis',${quote(randomUUID().replaceAll('-','').slice(0,8))},'${owner}');
      insert into public.memberships(user_id,group_id,role,status) values('${owner}','${groupId}','ADMIN','ACTIVE');
      insert into public.group_subscriptions(id,group_id,plan_code,amount_clp,athlete_limit,requested_by,status,activated_at) values('${subscriptionId}','${groupId}','ACADEMY',15990,1000,'${owner}','AUTHORIZED',now());`);
    users=JSON.parse(sql(`with added as(insert into public.users(full_name,birthdate,account_status) select 'MIG11 Deportista '||lpad(i::text,3,'0'),'1990-01-01','MANAGED' from generate_series(1,501) i returning id) select jsonb_agg(id) from added`));
    const ids=users.map(quote).join(',');
    sql(`insert into public.memberships(user_id,group_id,role,status,joined_at) select id,'${groupId}','ATHLETE','ACTIVE',now()-interval '1 day' from public.users where id in(${ids});
      insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by) values('${activityId}','${groupId}','${activityType}','Asistencia MIG11',now()-interval '1 hour',now(),'${owner}');`);
    await page.setViewportSize({width:375,height:812});await login(page,'admin');await visit(page,`/groups/${groupId}/activities/${activityId}/attendance`);
    let calls=0;
    await page.route('**/attendance',async route=>{
      if(route.request().method()==='POST'&&++calls===2)await route.abort('failed');else await route.continue();
    });
    await page.getByRole('button',{name:'Marcar todos como Presente',exact:true}).click();
    await expect(page.getByRole('button',{name:'Cancelar',exact:true})).toBeFocused();
    await page.getByRole('button',{name:/Confirmar/}).focus();await page.keyboard.press('Enter');
    await expect(page.getByRole('status',{name:'Resultado del guardado masivo'})).toContainText('Se confirmaron 500 registros');
    await expect(page.getByRole('main').getByRole('alert').first()).toContainText('Recarga la asistencia');
    expect(calls).toBe(2);expect(sql(`select count(*) from public.attendance_records where activity_id='${activityId}'`)).toBe('500');
    await page.unroute('**/attendance');await page.reload();
    await expect(page.getByRole('region',{name:'Registro de asistencia'})).toContainText('Sin marcar 1');
    expect(calls).toBe(2);expect(sql(`select count(*) from public.attendance_records where activity_id='${activityId}'`)).toBe('500');
    await checkLayout(page);await checkAccessibility(page,info);
  } finally {
    const ids=users.map(quote).join(',');
    sql(`delete from public.attendance_records where activity_id='${activityId}';delete from public.activities where group_id='${groupId}';delete from public.memberships where group_id='${groupId}';delete from public.group_subscriptions where group_id='${groupId}';delete from public.groups where id='${groupId}';${ids?`delete from public.users where id in(${ids});`:''}`);
  }
});
