import { test, expect } from './test';
import { randomUUID } from 'node:crypto';
import { email } from './data.mjs';
import { checkAccessibility, checkLayout, login, visit } from './helpers';
import { activityType, flowGroup, prepareFlowGroup, quote, sql } from './local-fixtures.mjs';

test.beforeAll(() => prepareFlowGroup());
test('MIG-10 formulario: fechas Chile/DST, serie futura, historial y tipos a375px', async ({ page }, info) => {
  const name = `MIG10 ${randomUUID().slice(0, 8)}`, typeName=`Tipo ${name}`;
  const dates=JSON.parse(sql("select json_build_object('day',to_char(app_private.chile_today()+14,'YYYY-MM-DD'),'until',to_char(app_private.chile_today()+16,'YYYY-MM-DD'))"));
  const created: string[]=[];
  const cleanup=()=>{
    const ids=created.map(quote).join(',');
    if(ids)sql(`delete from public.attendance_records where activity_id in(${ids});delete from public.activities where id in(${ids});`);
    sql(`delete from public.activity_types where group_id='${flowGroup}' and name=${quote(typeName)};`);
  };
  try {
    await page.setViewportSize({width:375,height:812});await login(page,'admin');
    await visit(page,`/groups/${flowGroup}/activity-types`);
    const typeForm=page.getByRole('form',{name:'Crear tipo de actividad'});
    await typeForm.getByLabel('Nombre',{exact:true}).fill(typeName);await typeForm.getByLabel('Azul',{exact:true}).check();
    await typeForm.getByRole('button',{name:'Crear tipo',exact:true}).click();
    await expect(page.getByRole('button',{name:`Editar ${typeName}`,exact:true})).toBeVisible();
    await visit(page,`/groups/${flowGroup}/activities/new`);
    await page.getByLabel('Título',{exact:true}).fill(name);await page.getByLabel('Tipo de actividad').selectOption(activityType);
    // A DST gap cannot be submitted and leaves the form/other fields intact.
    await page.getByLabel('Inicio',{exact:true}).fill('2026-09-06T00:30');await page.getByLabel('Término',{exact:true}).fill('2026-09-06T02:00');
    await page.getByRole('button',{name:'Crear actividad',exact:true}).click();
    await expect(page.getByLabel('Inicio',{exact:true})).toHaveAttribute('aria-invalid','true');
    await expect(page.getByLabel('Título',{exact:true})).toHaveValue(name);
    expect(sql(`select count(*) from public.activities where group_id='${flowGroup}' and title=${quote(name)}`)).toBe('0');
    await page.getByLabel('Inicio',{exact:true}).fill(`${dates.day}T18:30`);await page.getByLabel('Término',{exact:true}).fill(`${dates.day}T20:00`);
    await page.getByLabel('Repetir semanalmente').check();
    for(const weekday of ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'])await page.getByLabel(weekday,{exact:true}).check();
    await page.getByLabel('Repetir hasta').fill(dates.until);await page.getByRole('button',{name:'Crear serie semanal'}).click();
    await expect(page.getByRole('heading',{level:1})).toHaveText(name);
    const rows=JSON.parse(sql(`select jsonb_agg(to_jsonb(a) order by starts_at) from(select id,starts_at from public.activities where group_id='${flowGroup}' and title=${quote(name)}) a`));
    created.push(...rows.map((row:{id:string})=>row.id));expect(rows).toHaveLength(3);
    const owner=sql(`select id from public.users where email=${quote(email('admin'))}`);
    const athlete=sql(`select id from public.memberships where group_id='${flowGroup}' and role='ATHLETE' and status='ACTIVE' limit 1`);
    sql(`insert into public.attendance_records(activity_id,membership_id,status,recorded_by) values('${rows[1].id}','${athlete}','PRESENT','${owner}')`);
    await page.getByRole('link',{name:'Editar actividad',exact:true}).click();
    await expect(page.getByLabel('Inicio',{exact:true})).toHaveValue(`${dates.day}T18:30`);
    await page.getByLabel('Esta y las siguientes',{exact:true}).check();await page.getByLabel('Título',{exact:true}).fill(`${name} editada`);
    await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();await expect(page.getByRole('heading',{level:1})).toHaveText(`${name} editada`);
    expect(sql(`select title from public.activities where id='${rows[1].id}'`)).toBe(name);
    expect(sql(`select count(*) from public.activities where id in('${rows[0].id}','${rows[2].id}') and title=${quote(`${name} editada`)}`)).toBe('2');
    await page.getByRole('link',{name:'Editar actividad',exact:true}).click();
    await page.getByLabel('Eliminar esta y las siguientes',{exact:true}).check();await page.getByRole('button',{name:'Eliminar esta y las siguientes',exact:true}).click();await page.getByRole('button',{name:'Confirmar eliminación',exact:true}).click();
    await expect(page).toHaveURL(new RegExp(`/groups/${flowGroup}/activities$`));
    expect(sql(`select count(*) from public.attendance_records where activity_id='${rows[1].id}'`)).toBe('1');
    expect(sql(`select count(*) from public.activities where id in('${rows[0].id}','${rows[2].id}')`)).toBe('0');
    await visit(page,`/groups/${flowGroup}/activities/${rows[1].id}/edit`);await expect(page.getByLabel('Inicio',{exact:true})).toHaveValue(`${sql(`select to_char(starts_at at time zone 'America/Santiago','YYYY-MM-DD') from public.activities where id='${rows[1].id}'`)}T18:30`);
    await checkLayout(page);await checkAccessibility(page,info);
    await visit(page,`/groups/${flowGroup}/activity-types`);await page.getByRole('button',{name:`Editar ${typeName}`,exact:true}).click();
    const editForm=page.getByRole('form',{name:`Editar ${typeName}`,exact:true});await editForm.getByLabel('Disponible para nuevas actividades').uncheck();await editForm.getByRole('button',{name:'Guardar cambios',exact:true}).click();
    await expect.poll(() => sql(`select is_active from public.activity_types where group_id='${flowGroup}' and name=${quote(typeName)}`)).toBe('f');
    await expect(page.getByText('Tipo de actividad actualizado.',{exact:true})).toBeVisible();
  } finally { cleanup(); }
});
