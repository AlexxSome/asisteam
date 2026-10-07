import { test, expect } from '@playwright/test';
import { groups } from './data.mjs';
import { checkAccessibility, checkLayout, login, visit } from './helpers';

test('MIG-07 Next→Nest→PostgreSQL: configuración y perfil a 375px', async ({ page }, info) => {
  await login(page,'admin');
  await visit(page,`/groups/${groups.single}/settings`);
  await checkLayout(page); await checkAccessibility(page,info);
  const name = page.getByLabel('Nombre del grupo', { exact: true });
  const original = await name.inputValue();
  const changed = original === 'Club QA MIG151 editado' ? 'Club QA MIG151 actualizado' : 'Club QA MIG151 editado';
  try {
    await name.fill(changed);
    await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();
    await expect(page.getByRole('status').filter({hasText:'Cambios guardados.'})).toBeVisible();
    await page.reload(); await expect(name).toHaveValue(changed);
  } finally {
    await name.fill(original);
    await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();
    await expect(page.getByRole('status').filter({hasText:'Cambios guardados.'})).toBeVisible();
  }
  await visit(page,'/profile');
  await checkLayout(page); await checkAccessibility(page,info);
  const fullName=page.getByLabel('Nombre completo',{exact:true});
  const originalProfile=await fullName.inputValue();
  try {
    await fullName.fill('Persona QA MIG151 editada');
    await page.getByRole('button',{name:'Guardar perfil',exact:true}).click();
    await expect(page.getByRole('status').filter({hasText:'Tu perfil se actualizó'})).toBeVisible();
    await page.reload();await expect(fullName).toHaveValue('Persona QA MIG151 editada');
  } finally {
    await fullName.fill(originalProfile);await page.getByRole('button',{name:'Guardar perfil',exact:true}).click();
    await expect(page.getByRole('status').filter({hasText:'Tu perfil se actualizó'})).toBeVisible();
  }
});
