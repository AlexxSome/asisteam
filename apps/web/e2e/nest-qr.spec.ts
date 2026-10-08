import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { email, password } from './data.mjs';
import { activityType, quote, sql } from './local-fixtures.mjs';
import { checkAccessibility, checkLayout, login, screenshot, visit } from './helpers';

test.skip(process.env.ASISTEAM_QA_NEST !== '1', 'Requiere Next→Nest→PostgreSQL local');
test('MIG-16 QR emisión/llegada/errores y login a375px con evidencia enmascarada', async ({ page, context }, info) => {
  const groupId=randomUUID(), activityId=randomUUID();
  const owner=sql(`select id from public.users where email=${quote(email('admin'))}`),athlete=sql(`select id from public.users where email=${quote(email('athlete'))}`);
  let currentToken: string | null=null;
  // Next action response stays in process memory; never attach bodies/URLs/trace.
  page.on('response', async response => {
    if(response.request().method()==='POST'&&new URL(response.url()).pathname.endsWith('/qr')){
      const text=await response.text().catch(()=> '');const match=text.match(/"token":"([0-9a-f]{64})"/);if(match)currentToken=match[1]!;
    }
  });
  const scan=async(token: string)=>{
    await visit(page,'/check-in');
    await expect(page.getByRole('heading',{name:'Necesitas el QR de la actividad'})).toBeVisible();
    await page.evaluate(({activityId,token})=>{window.location.hash=new URLSearchParams({activity_id:activityId,token}).toString();},{activityId,token});
    await expect.poll(()=>page.evaluate(()=>window.location.hash==='')).toBe(true);
  };
  try {
    sql(`insert into public.groups(id,name,invite_code,created_by) values('${groupId}','Club QR sintético',${quote(randomUUID().replaceAll('-','').slice(0,8))},'${owner}');
      insert into app_private.billing_legacy_groups(group_id) values('${groupId}');
      insert into public.memberships(user_id,group_id,role,status,joined_at) values('${owner}','${groupId}','ADMIN','ACTIVE',now()-interval '1 day'),('${athlete}','${groupId}','ATHLETE','ACTIVE',now()-interval '1 day');
      insert into public.activities(id,group_id,activity_type_id,title,starts_at,ends_at,created_by) values('${activityId}','${groupId}','${activityType}','Entrenamiento QR sintético',now(),now()+interval '1 hour','${owner}');`);
    await page.setViewportSize({width:375,height:812});await login(page,'admin');
    const qrPath=`/groups/${groupId}/activities/${activityId}/qr`;
    await visit(page,qrPath);await expect(page.getByRole('region',{name:'QR de asistencia'}).locator('svg')).toBeVisible();await expect.poll(()=>currentToken!==null).toBe(true);
    const summary=page.getByText('Ajustes de QR de todo el grupo',{exact:true});await summary.focus();await page.keyboard.press('Enter');
    await page.getByLabel('Abrir minutos antes del inicio').fill('20');await page.getByRole('button',{name:'Guardar horario para todo el grupo',exact:true}).focus();await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({hasText:'Horario guardado'})).toBeVisible();expect(sql(`select opens_before_minutes from app_private.qr_checkin_settings where group_id='${groupId}'`)).toBe('20');
    await checkLayout(page);await checkAccessibility(page,info);await screenshot(page,info,'qr-mig16-admin-375');
    // Refresh the SQL-owned current token as the QR rotates; do not retain an
    // earlier response across login/axe/screenshot work.
    currentToken=null;await page.reload();await expect(page.getByRole('region',{name:'QR de asistencia'}).locator('svg')).toBeVisible();await expect.poll(()=>currentToken!==null).toBe(true);
    await context.clearCookies();await scan(currentToken!);
    await expect(page.getByRole('heading',{name:'Inicia sesión para registrar tu llegada'})).toBeVisible();
    await page.getByLabel('Email',{exact:true}).fill(email('athlete'));await page.getByLabel('Contraseña',{exact:true}).fill(password);await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
    await expect(page.getByRole('button',{name:'Iniciar sesión',exact:true})).toHaveCount(0);
    // A login crossing a60s boundary legitimately asks for a rescan.
    const fresh=sql(`select app_private.qr_checkin_token(activity_id,secret,clock_timestamp()) from app_private.qr_checkin_keys where activity_id='${activityId}'`);
    await scan(fresh);await expect(page.getByRole('heading',{name:/Llegada confirmada|Ya tenías un registro/})).toBeVisible();
    expect(sql(`select count(*) from public.attendance_records where activity_id='${activityId}'`)).toBe('1');
    await checkLayout(page);await checkAccessibility(page,info);await screenshot(page,info,'qr-mig16-llegada-375');
    const repeat=sql(`select app_private.qr_checkin_token(activity_id,secret,clock_timestamp()) from app_private.qr_checkin_keys where activity_id='${activityId}'`);
    await scan(repeat);await expect(page.getByRole('heading',{name:'Ya tenías un registro'})).toBeVisible();expect(sql(`select count(*) from public.attendance_records where activity_id='${activityId}'`)).toBe('1');
    const expired=sql(`select app_private.qr_checkin_token(activity_id,secret,clock_timestamp()-interval '60 seconds') from app_private.qr_checkin_keys where activity_id='${activityId}'`);
    await scan(expired);await expect(page.getByRole('heading',{name:'QR vencido o no válido'})).toBeVisible();await checkLayout(page);await checkAccessibility(page,info);await screenshot(page,info,'qr-mig16-vencido-375');
    sql(`update public.memberships set status='INACTIVE' where user_id='${athlete}' and group_id='${groupId}' and role='ATHLETE'`);
    await scan(repeat);await expect(page.getByRole('heading',{name:'Registro no disponible'})).toBeVisible();
    expect(await page.evaluate(()=>Array.from(document.querySelectorAll('a')).every(link=>!link.href.includes('#')&&!link.href.includes('token=')))).toBe(true);
    const logCheck=JSON.parse(readFileSync('.next/qa/log-check.json','utf8'));for(const key of ['token','sensitivePayload','sensitiveUrl','qrPayload'])expect(logCheck[key],key).toBe(false);
  } finally {
    sql(`delete from public.attendance_records where activity_id='${activityId}';delete from public.activities where id='${activityId}';delete from app_private.qr_checkin_settings where group_id='${groupId}';delete from public.memberships where group_id='${groupId}';delete from app_private.billing_legacy_groups where group_id='${groupId}';delete from public.groups where id='${groupId}';`);
  }
});
