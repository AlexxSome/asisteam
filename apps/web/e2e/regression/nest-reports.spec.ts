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


for(const role of ['admin','coach','athlete','guardian','multi']) test(`UI-08 ${role}: reportes e historial, tabla contenida y resultados antes del borrador`,async({page,context},info)=>{
 const before=sql(`select settings::text from public.groups where id='${groups.fifty}'`);
 try{
  sql(`update public.groups set settings=settings||'{"athletes_can_view_group_stats":true,"guardians_can_view_group_stats":true}'::jsonb where id='${groups.fifty}'`);
   await context.clearCookies();await login(page,role);
   for(const width of [375,720,1440]) {
    await page.setViewportSize({width,height:900});await visit(page,`/groups/${groups.fifty}/reports?period=season`);
    await checkLayout(page);await checkAccessibility(page,info);
    const main=page.getByRole('main');await expect(main).toContainText('America/Santiago');await expect(main).toContainText('77.8 %');
    if(role==='admin'||role==='coach'||role==='multi') {
     const table=page.getByRole('region',{name:'Resumen por deportista',exact:true});
     const filters=page.getByRole('form',{name:'Filtros de asistencia'});
     expect(await table.evaluate((element)=>Boolean(element.compareDocumentPosition(document.querySelector('form[aria-label="Filtros de asistencia"]')!)&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
     await expect(page.getByRole('region',{name:'Resumen del reporte'})).toContainText('Promedio individual');
     const appliedURL=new URL(page.url());
     await page.getByRole('link',{name:'Ajustar período y filtros',exact:true}).click();
     expect(new URL(page.url()).search).toBe(appliedURL.search);
     await expect(page).toHaveURL(/#attendance-filters$/);
     expect(await filters.evaluate(el=>el.getBoundingClientRect().top)).toBeLessThan(150);
     const oldURL=page.url();await filters.getByRole('combobox',{name:'Período',exact:true}).selectOption('custom');
     await filters.getByLabel('Desde',{exact:true}).fill('2026-03-01');await filters.getByLabel('Hasta',{exact:true}).fill('2026-03-31');
     expect(page.url()).toBe(oldURL);await expect(main).toContainText('77.8 %');
    } else {
     await expect(page.getByRole('region',{name:'Estadísticas agregadas',exact:true})).toBeVisible();
     await expect(main).not.toContainText('Nota propia QA');await expect(main).not.toContainText(email('admin'));
    }
    if(width!==720)await screenshot(page,info,`ui178-${role}-reports-${width}`);
   }
   if(role==='athlete'||role==='guardian') {
    await page.setViewportSize({width:375,height:900});
    const link=role==='athlete'?page.getByRole('link',{name:'Ver mi historial de asistencia',exact:true}):page.getByRole('link',{name:/Ver historial de Pupilo QA/});
    await link.click();await expect(page.getByRole('heading',{name:'Actividades',exact:true})).toBeVisible();
    for(const width of [375,720,1440]) {
     await page.setViewportSize({width,height:900});await checkLayout(page);await checkAccessibility(page,info);
     const region=page.getByRole('region',{name:role==='athlete'?'Mi historial':'Historial del pupilo',exact:true});
     await expect(region.getByRole('columnheader',{name:'Actividad',exact:true})).toHaveCSS('position','sticky');
     const first=region.locator('tbody th').first();
     expect(await first.evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);const selection=window.getSelection()!;selection.removeAllRanges();selection.addRange(range);const text=selection.toString();selection.removeAllRanges();return text;})).toBe(await first.innerText());const beforeLeft=await first.evaluate(el=>el.getBoundingClientRect().left);
     await region.evaluate(el=>el.scrollLeft=200);expect(await first.evaluate(el=>el.getBoundingClientRect().left)).toBeCloseTo(beforeLeft,0);
     expect(await region.evaluate(el=>Boolean(el.compareDocumentPosition(document.querySelector('form[aria-label="Filtros de asistencia"]')!)&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
     if(width!==720)await screenshot(page,info,`ui178-${role}-history-${width}`);
    }
   }
 }finally{sql(`update public.groups set settings=${quote(before)}::jsonb where id='${groups.fifty}'`);}
});
