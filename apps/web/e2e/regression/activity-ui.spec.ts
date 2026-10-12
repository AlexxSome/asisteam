import { test, expect } from './test';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import type { Page, TestInfo } from '@playwright/test';
import { email } from './data.mjs';
import { activityType, quote, sql } from './local-fixtures.mjs';
import { checkAccessibility, checkLayout, login, visit } from './helpers';

async function screenshot(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(`${name}.png`);
  // Only synthetic agenda/detail/form/roster; no access forms or QR tokens.
  await page.screenshot({path,fullPage:!name.startsWith('attendance'),animations:'disabled'});
  await info.attach(name,{path,contentType:'image/png'});
}

test('UI-06 agenda, detalle, contexto, roles y primera fila sin gestión a375px', async ({ page, context }, info) => {
  test.setTimeout(180000);
  const group = randomUUID(), activity = randomUUID();
  const admin = sql(`select id from public.users where email=${quote(email('admin'))}`);
  const coach = sql(`select id from public.users where email=${quote(email('coach'))}`);
  const athlete = sql(`select id from public.users where email=${quote(email('athlete'))}`);
  sql(`insert into public.groups(id,name,invite_code,created_by) values('${group}','Club sintético UI06',${quote(randomUUID().replaceAll('-','').slice(0,8))},'${admin}');
    insert into app_private.billing_legacy_groups(group_id) values('${group}');
    insert into public.memberships(user_id,group_id,role,status,joined_at) values
    ('${admin}','${group}','ADMIN','ACTIVE',now()-interval '1 day'),
    ('${coach}','${group}','COACH','ACTIVE',now()-interval '1 day'),
    ('${athlete}','${group}','ATHLETE','ACTIVE',now()-interval '1 day');
    with added as(insert into public.users(full_name,birthdate,account_status) select 'Deportista UI06 '||lpad(n::text,2,'0'),'1990-01-01','MANAGED' from generate_series(1,19)n returning id)
    insert into public.memberships(user_id,group_id,role,status,joined_at) select id,'${group}','ATHLETE','ACTIVE',now()-interval '1 day' from added;
    insert into public.activities(id,group_id,activity_type_id,title,location,starts_at,ends_at,created_by) values
    ('${activity}','${group}','${activityType}','Entrenamiento UI06','Cancha sintética',now()+interval '10 minutes',now()+interval '50 minutes','${admin}');`);
  const base = `/groups/${group}`, detail = `${base}/activities/${activity}`;
  await page.setViewportSize({width:375,height:812});
  await login(page,'admin'); await visit(page,base);
  await page.getByRole('link',{name:'Tomar asistencia',exact:true}).click();
  await expect(page).toHaveURL(detail+'/attendance');
  await page.getByRole('link',{name:'Volver a la actividad',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Entrenamiento UI06',level:1})).toBeVisible();
  await page.getByRole('link',{name:'Inicio del grupo',exact:true}).click();
  await expect(page).toHaveURL(base);
  await visit(page,base+'/activities');
  const row = page.getByRole('listitem').filter({has:page.getByRole('link',{name:'Entrenamiento UI06 · Ver detalle'})});
  await expect(row).toContainText('Cancha sintética');
  await expect(row.getByRole('link',{name:'Tomar asistencia · Entrenamiento UI06'})).toHaveAttribute('href',detail+'/attendance?from=group&period=upcoming&page=1');
  for(const width of [320,375,768,1024,1440,1536]){
    await page.setViewportSize({width,height:900});await checkLayout(page);await checkAccessibility(page,info);
    if([375,1440].includes(width))await screenshot(page,info,`activity-agenda-${width}`);
  }
  await row.getByRole('link',{name:'Entrenamiento UI06 · Ver detalle'}).click();
  await page.setViewportSize({width:1440,height:900});
  await expect(page.getByRole('link',{name:'Volver a actividades del grupo',exact:true})).toHaveAttribute('href',base+'/activities?period=upcoming');
  await checkAccessibility(page,info);await screenshot(page,info,'activity-detail-1440');
  await page.setViewportSize({width:375,height:812});await checkLayout(page);await checkAccessibility(page,info);await screenshot(page,info,'activity-detail-375');
  await page.getByRole('link',{name:'Editar actividad',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Editar actividad',level:1})).toBeVisible();
  await checkLayout(page);await checkAccessibility(page,info);await screenshot(page,info,'activity-form-375');
  await page.setViewportSize({width:1440,height:900});await checkLayout(page);await screenshot(page,info,'activity-form-1440');
  await page.getByRole('link',{name:'Volver a la actividad',exact:true}).click();
  await page.getByRole('link',{name:'Tomar asistencia',exact:true}).click();
  await page.setViewportSize({width:375,height:812});
  const roster = page.getByRole('list',{name:'Deportistas'});
  await roster.waitFor();await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(0);
  const first = roster.getByRole('listitem').first();
  const geometry = await first.evaluate(el=>{
    const box=el.getBoundingClientRect();
    return {firstRowTop:box.top,firstRowBottom:box.bottom,initialScroll:scrollY,viewport:{width:innerWidth,height:innerHeight},targets:[...el.querySelectorAll('button')].map(button=>{const rect=button.getBoundingClientRect();return {label:button.textContent?.trim(),width:rect.width,height:rect.height};})};
  });
  expect(geometry.initialScroll).toBe(0);
  expect(geometry.firstRowBottom).toBeLessThanOrEqual(812);
  expect(geometry.targets.every(target=>target.width>=44&&target.height>=44)).toBe(true);
  expect(await page.getByRole('region',{name:'Guardado de toda la nómina'}).evaluate(el=>el.getBoundingClientRect().top)).toBeGreaterThan(geometry.firstRowBottom);
  await checkLayout(page);await checkAccessibility(page,info);await screenshot(page,info,'attendance-ui06-375');
  await page.setViewportSize({width:1440,height:900});await checkLayout(page);await checkAccessibility(page,info);await screenshot(page,info,'attendance-ui06-1440');
  await page.setViewportSize({width:375,height:812});
  const started = Date.now();
  for(const item of await roster.getByRole('listitem').all()){
    await item.getByRole('button',{name:'Presente',exact:true}).click();
    await expect(item.getByRole('status')).toContainText('Guardado');
    await expect(item.getByRole('button',{name:'Presente',exact:true})).toBeEnabled();
  }
  const elapsedMs=Date.now()-started;
  expect(sql(`select count(*) from public.attendance_records where activity_id='${activity}' and status='PRESENT'`)).toBe('20');
  const measurements=info.outputPath('measurements.json');
  writeFileSync(measurements,JSON.stringify({environment:'local-synthetic-chromium',geometry,automatedTask:{athletes:20,elapsedMs,confirmed:20},humanDeviceTask:'PENDING: 20 deportistas / menos de 60 segundos en teléfono real'},null,2)+'\n');
  await info.attach('UI-06 measurements',{path:measurements,contentType:'application/json'});
  await page.getByRole('link',{name:'Volver a la actividad',exact:true}).click();
  await page.getByRole('link',{name:'Volver a actividades del grupo',exact:true}).click();
  await expect(page).toHaveURL(base+'/activities?period=upcoming');
  for(const role of ['coach','athlete']){
    await context.clearCookies();await login(page,role);await visit(page,base+'/activities');
    await expect(page.getByRole('link',{name:'Tomar asistencia · Entrenamiento UI06'})).toHaveCount(role==='coach'?1:0);
    await page.getByRole('link',{name:'Entrenamiento UI06 · Ver detalle'}).click();
    await expect(page.getByRole('link',{name:'Editar actividad',exact:true})).toHaveCount(0);
    if(role==='coach'){
      await page.getByRole('link',{name:'Tomar asistencia',exact:true}).click();
      await expect(page.getByRole('button',{name:/^Nota de/})).toHaveCount(0);
      await checkLayout(page);await checkAccessibility(page,info);
    }else await expect(page.getByRole('link',{name:'Ver mi historial de asistencia',exact:true})).toHaveAttribute('href',base+'/me/history');
  }
});
