import {test,expect} from './test';
import {groups} from './data.mjs';
import {checkAccessibility,checkLayout,login,visit} from './helpers';

test('MIG-14 billing ADMIN a375px: DTO, retorno sin pago, teclado y error de proveedor sin éxito',async({page},info)=>{
 await page.setViewportSize({width:375,height:812});await login(page,'admin');
 await visit(page,`/groups/${groups.fifty}/billing?status=approved`);
 await expect(page.getByRole('heading',{name:'Suscripción del club',exact:true})).toBeVisible();
 await expect(page.getByRole('main')).toContainText('Un cobro previsto o una autorización no equivalen a un pago aprobado');
 await expect(page.getByRole('region',{name:'Historial de cobros'})).toContainText('Aún no hay cobros registrados');
 await checkLayout(page);await checkAccessibility(page,info);
 const sync=page.getByRole('button',{name:'Actualizar estado de pago',exact:true});await sync.focus();await page.keyboard.press('Enter');
 await expect(page.getByRole('alert').filter({hasText:'No pudimos conectar con el servicio de pagos'})).toBeVisible();
 await expect(page.getByRole('main')).not.toContainText('Estado consultado en Mercado Pago');
 await checkLayout(page);
});
