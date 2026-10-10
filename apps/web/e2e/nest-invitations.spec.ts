import { test, expect } from './test';
import {sql} from './local-fixtures.mjs';
import { randomUUID, createHash } from 'node:crypto';
import { groups, email, password } from './data.mjs';
import { checkAccessibility, checkLayout, login } from './helpers';
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
test('MIG-09 Next→Nest→Auth nativo: existing-account link and MANAGED destination preserve history at375px',async({page,context},info)=>{
  test.skip(process.env.ASISTEAM_QA_INVITATIONS!=='1');
  const run=randomUUID(),token=randomUUID(),claimToken=randomUUID(),id=randomUUID(),membership=randomUUID(),invitation=randomUUID(),claimInvitation=randomUUID(),address=`mig153-e2e-${run}@example.test`;
  const actor=sql(`select id from public.users where email='${email('admin')}';`);
  const existingAthlete=sql(`select id from public.memberships where user_id='${actor}' and group_id='${groups.fifty}' and role='ATHLETE';`);
  sql(`insert into public.users(id,full_name,email,birthdate,account_status) values('${id}','Perfil conservado QA','${address}','1990-01-01','MANAGED');
  insert into public.memberships(id,user_id,group_id,role,status,joined_at) values('${membership}','${id}','${groups.fifty}','ATHLETE','ACTIVE',now()-interval '30 days');
  insert into public.invitations(id,group_id,email,role,token,invited_user_id,created_by,activation_membership_id) values
  ('${invitation}','${groups.fifty}','${email('admin')}','ATHLETE','${hash(token)}','${actor}','${actor}',null),
  ('${claimInvitation}','${groups.fifty}','${address}','ATHLETE','${hash(claimToken)}','${id}','${actor}','${membership}');`);
  const snapshot=sql(`select to_jsonb(m)::text from public.memberships m where id='${membership}';`);
  try{
    await login(page,'admin');await page.goto(`/invitations/${token}`);await expect(page.getByRole('button',{name:'Aceptar invitación',exact:true})).toBeVisible();await checkLayout(page);await checkAccessibility(page,info);await page.getByRole('button',{name:'Aceptar invitación',exact:true}).click();await expect(page).toHaveURL(`/groups/${groups.fifty}`);
    await page.goto(`/invitations/${token}`);await expect(page.getByRole('main').getByRole('alert')).toContainText('no está disponible');
    await context.clearCookies();await page.goto(`/invitations/${claimToken}`);await expect(page.getByRole('heading',{name:'Activar mi cuenta',exact:true})).toBeVisible();await page.getByLabel('Email que recibió la invitación').fill(address);await page.getByLabel('Contraseña',{exact:true}).fill(password);await page.getByRole('checkbox').check();await page.getByRole('button',{name:'Activar mi cuenta y ver mi historial',exact:true}).click();await expect(page).toHaveURL(`/groups/${groups.fifty}/me/history`);await checkLayout(page);await checkAccessibility(page,info);
    expect(sql(`select to_jsonb(m)::text from public.memberships m where id='${membership}';`)).toBe(snapshot);expect(sql(`select id||':'||account_status from public.users where email='${address}';`)).toBe(`${id}:ACTIVE`);
  }finally{
    // The entire database belongs to this run. Preserve history until disposal;
    // restore only the ADMIN extra role to avoid affecting the following cases.
    if(!existingAthlete)sql(`delete from public.memberships where user_id='${actor}' and group_id='${groups.fifty}' and role='ATHLETE';`);
  }
});
