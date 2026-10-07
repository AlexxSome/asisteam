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

test('MIG-08 Next→Nest→PostgreSQL: nómina, edición y roles conservan historia a 375px', async ({ page }, info) => {
  await login(page,'admin');
  await visit(page,`/groups/${groups.single}/members/new`);
  const name=`Adulto MIG08 ${Date.now()}`;
  await page.getByLabel('Nombre completo',{exact:true}).fill(name);
  await page.getByLabel('Fecha de nacimiento',{exact:true}).fill('1990-01-01');
  await page.getByRole('button',{name:'Crear cuenta gestionada',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Cuenta gestionada creada');
  await visit(page,`/groups/${groups.single}/members?search=${encodeURIComponent(name)}`);
  let row=page.getByRole('region',{name:`${name}, Deportista`,exact:true});
  await expect(row).toBeVisible();await checkLayout(page);await checkAccessibility(page,info);
  await row.getByText('Acciones',{exact:true}).click();
  await row.getByRole('button',{name:'Editar perfil',exact:true}).click();
  await row.getByLabel('Nombre completo',{exact:true}).fill(`${name} editado`);
  await row.getByRole('button',{name:'Guardar perfil',exact:true}).click();
  row=page.getByRole('region',{name:`${name} editado, Deportista`,exact:true});
  await expect(row).toBeVisible();
  await row.getByText('Acciones',{exact:true}).click();
  await row.getByRole('button',{name:'Asignar rol Entrenador',exact:true}).click();
  await expect(page.getByRole('region',{name:`${name} editado, Entrenador`,exact:true})).toBeVisible();
  await row.getByText('Acciones',{exact:true}).click();
  await row.getByRole('button',{name:'Desactivar este rol',exact:true}).click();
  await row.getByRole('button',{name:'Confirmar desactivación',exact:true}).click();
  await expect(row.getByText('Estado: Inactivo',{exact:true})).toBeVisible();
  await row.getByText('Acciones',{exact:true}).click();
  await row.getByRole('button',{name:'Reactivar este rol',exact:true}).click();
  await expect(row.getByText('Estado: Activo',{exact:true})).toBeVisible();
  await page.reload();await expect(row).toBeVisible();
  await visit(page,`/groups/${groups.single}/members?search=${encodeURIComponent(name)}&page=100`);
  await expect(page.getByRole('heading',{name:'No hay integrantes en esta página'})).toBeVisible();
  await expect(page.getByRole('status')).toContainText('2 membresías encontradas');
});
