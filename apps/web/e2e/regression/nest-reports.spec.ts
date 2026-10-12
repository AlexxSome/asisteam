import { test, expect } from './test';
import { email, groups, rosterName } from './data.mjs';
import { checkAccessibility, checkLayout, login, screenshot, visit } from './helpers';
import { quote, sql } from './local-fixtures.mjs';

test('MIG-12 ADMIN filtros, paginación y tabla accesible por teclado a375px',async({page},info)=>{
 await page.setViewportSize({width:375,height:812});await login(page,'admin');
 await visit(page,`/groups/${groups.large}/reports?period=season`);
 await expect(page.getByRole('region',{name:'Resumen por deportista'})).toBeVisible();
 await page.getByText(/Más filtros \(/).click();
 await page.getByLabel('Ordenar por').selectOption('name');await page.getByLabel('Incluir deportistas inactivos').check();
 await page.getByRole('button',{name:'Aplicar filtros',exact:true}).focus();await page.keyboard.press('Enter');
 await expect(page).toHaveURL(/include_inactive=true/);await expect(page).toHaveURL(/sort=name/);
 const region=page.getByRole('region',{name:'Resumen por deportista'});await region.focus();await page.keyboard.press('ArrowRight');
 await expect(region).toBeFocused();await expect(region.getByRole('columnheader',{name:'Asistencia',exact:true})).toBeAttached();
 await expect(region.locator('tbody tr')).toHaveCount(50);
 await page.getByRole('navigation',{name:'Páginas del reporte'}).getByRole('link',{name:'Siguiente'}).click();
 await expect(page).toHaveURL(/page=2/);await expect(page).toHaveURL(/sort=name/);await expect(page).toHaveURL(/include_inactive=true/);
 await expect(region.locator('tbody tr')).toHaveCount(50);
 await page.getByRole('combobox',{name:'Período',exact:true}).selectOption('custom');await page.getByLabel('Desde',{exact:true}).fill('2026-03-01');await page.getByLabel('Hasta',{exact:true}).fill('2026-03-31');
 await page.getByRole('button',{name:'Aplicar filtros',exact:true}).click();await expect(page).toHaveURL(/from=2026-03-01/);await expect(page).toHaveURL(/to=2026-03-31/);
 await expect(page.getByRole('main')).toContainText('America/Santiago');await expect(page.getByRole('main')).toContainText('Sin datos');
 await checkLayout(page);await checkAccessibility(page,info);await screenshot(page,info,'reports-mig12-375');
});
test('MIG-12 ATHLETE/GUARDIAN: V1/V2 con toggles apagados, agregados y revocación',async({page,context},info)=>{
 const before=sql(`select settings::text from public.groups where id='${groups.fifty}'`);
 try{
 for(const role of ['athlete','guardian']) {
  sql(`update public.groups set settings=settings||'{"athletes_can_view_group_stats":false,"guardians_can_view_group_stats":false}'::jsonb where id='${groups.fifty}'`);
  await context.clearCookies();await login(page,role);await visit(page,`/groups/${groups.fifty}/reports`);
  await expect(page.getByRole('main')).toContainText('77.8 %');await expect(page.getByRole('main')).not.toContainText(rosterName(1));
  const link=role==='athlete'?page.getByRole('link',{name:'Ver mi historial de asistencia',exact:true}):page.getByRole('link',{name:/Ver historial de Pupilo QA/});
  await link.click();await expect(page.getByRole('main')).toContainText('77.8 %');
  await page.getByRole('combobox',{name:'Período',exact:true}).selectOption('season');await page.getByRole('button',{name:'Aplicar filtros',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Actividades',exact:true})).toBeVisible();await checkLayout(page);await checkAccessibility(page,info);
  sql(`update public.groups set settings=settings||'{"athletes_can_view_group_stats":true,"guardians_can_view_group_stats":true}'::jsonb where id='${groups.fifty}'`);
  await visit(page,`/groups/${groups.fifty}/reports`);await expect(page.getByRole('heading',{name:'Estadísticas del grupo',exact:true})).toBeVisible();
  await expect(page.getByRole('main')).toContainText(rosterName(1));await expect(page.getByRole('main')).not.toContainText(email('admin'));
  sql(`update public.groups set settings=settings||'{"athletes_can_view_group_stats":false,"guardians_can_view_group_stats":false}'::jsonb where id='${groups.fifty}'`);
  await page.reload();await expect(page.getByRole('heading',{name:'Estadísticas del grupo',exact:true})).toHaveCount(0);await expect(page.getByRole('main')).toContainText('77.8 %');
 }
 }finally{sql(`update public.groups set settings=${quote(before)}::jsonb where id='${groups.fifty}'`);}
});
test('MIG-12 COACH mantiene reporte agregado sin notas ni PII',async({page},info)=>{
 await page.setViewportSize({width:375,height:812});await login(page,'coach');await visit(page,`/groups/${groups.fifty}/reports?period=season`);
 await expect(page.getByRole('region',{name:'Resumen por deportista'})).toContainText('77.8 %');
 await expect(page.getByRole('main')).not.toContainText(email('athlete'));await expect(page.getByRole('main')).not.toContainText('Nota propia QA');
 await checkLayout(page);await checkAccessibility(page,info);
});
