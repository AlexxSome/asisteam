import { test, expect } from './test';
import { randomUUID } from 'node:crypto';
import { email } from './data.mjs';
import { checkAccessibility, checkLayout, login, visit } from './helpers';
import { quote, sql } from './local-fixtures.mjs';
test('MIG-15 muro: publicar editar borrar, preferencia y permisos a375px', async ({ page, context }, info) => {
  const groupId=randomUUID(), admin=sql(`select id from public.users where email=${quote(email('admin'))}`),athlete=sql(`select id from public.users where email=${quote(email('athlete'))}`);
  const preference=sql(`select coalesce((select enabled::text from public.announcement_push_preferences where user_id='${athlete}'),'missing')`);
  try {
    sql(`insert into public.groups(id,name,sport,invite_code,created_by) values('${groupId}','Club sintético MIG15','Tenis',${quote(randomUUID().replaceAll('-','').slice(0,8))},'${admin}');
      insert into app_private.billing_legacy_groups(group_id) values('${groupId}');
      insert into public.memberships(user_id,group_id,role,status) values('${admin}','${groupId}','ADMIN','ACTIVE'),('${athlete}','${groupId}','ATHLETE','ACTIVE');`);
    await page.setViewportSize({width:375,height:812});await login(page,'admin');await visit(page,`/groups/${groupId}/announcements`);
    await expect(page.getByText('Todavía no hay anuncios en este grupo')).toBeVisible();
    await page.getByRole('button',{name:'Publicar anuncio',exact:true}).click();await expect(page.getByLabel('Título',{exact:true})).toBeFocused();
    await page.getByLabel('Título',{exact:true}).fill('Anuncio sintético MIG15');await page.getByLabel('Contenido',{exact:true}).fill('Texto sintético <script>sin ejecutar</script>');
    await page.getByRole('form',{name:'Publicar anuncio',exact:true}).getByRole('button',{name:'Publicar anuncio',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Anuncio sintético MIG15',exact:true})).toBeVisible();
    const article=page.locator('[data-announcement]').first();
    await article.getByRole('button',{name:'Editar anuncio',exact:true}).click();await article.getByLabel('Título',{exact:true}).fill('Anuncio corregido MIG15');
    await article.getByRole('button',{name:'Guardar cambios',exact:true}).click();await expect(page.getByRole('heading',{name:'Anuncio corregido MIG15',exact:true})).toBeVisible();
    await page.reload();await expect(page.getByRole('heading',{name:'Anuncio corregido MIG15',exact:true})).toBeVisible();
    expect(sql(`select count(*) from public.group_announcements where group_id='${groupId}'`)).toBe('1');
    await checkLayout(page);await checkAccessibility(page,info);
    await context.clearCookies();await login(page,'athlete');await visit(page,`/groups/${groupId}/announcements`);
    await expect(page.getByRole('button',{name:'Publicar anuncio',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Editar anuncio',exact:true})).toHaveCount(0);
    await expect(page.getByText('Texto sintético <script>sin ejecutar</script>',{exact:true})).toBeVisible();
    await page.getByText('Avisos de todos mis grupos',{exact:true}).click();const checkbox=page.getByRole('checkbox');if(!(await checkbox.isChecked())){await checkbox.focus();await page.keyboard.press("Space");}await expect(checkbox).toBeEnabled();await expect(checkbox).toBeChecked();
    await page.reload();await page.getByText('Avisos de todos mis grupos',{exact:true}).click();await expect(checkbox).toBeChecked();await checkbox.focus();await page.keyboard.press("Space");await expect(checkbox).toBeEnabled();
    await checkLayout(page);await checkAccessibility(page,info);
    await context.clearCookies();await login(page,'admin');await visit(page,`/groups/${groupId}/announcements`);await page.getByRole('button',{name:'Eliminar anuncio',exact:true}).click();
    await expect(page.getByRole('button',{name:'Cancelar',exact:true})).toBeFocused();await page.getByRole('button',{name:'Confirmar eliminación',exact:true}).focus();await page.keyboard.press('Enter');
    await expect(page.getByRole('heading',{name:'Anuncio corregido MIG15',exact:true})).toHaveCount(0);expect(sql(`select count(*) from public.group_announcements where group_id='${groupId}' and deleted_at is not null`)).toBe('1');
  } finally {
    sql(`delete from app_private.announcement_push_deliveries where announcement_id in(select id from public.group_announcements where group_id='${groupId}');
      delete from public.group_announcements where group_id='${groupId}';delete from public.memberships where group_id='${groupId}';delete from app_private.billing_legacy_groups where group_id='${groupId}';delete from public.groups where id='${groupId}';
      ${preference==='missing'?`delete from public.announcement_push_preferences where user_id='${athlete}';`:`update public.announcement_push_preferences set enabled=${preference} where user_id='${athlete}';`}`);
  }
});
