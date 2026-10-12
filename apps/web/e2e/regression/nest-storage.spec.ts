import { test, expect } from './test';
import { readFileSync } from 'node:fs';
import { email } from './data.mjs';
import { quote, sql } from './local-fixtures.mjs';
import { login, visit, checkLayout, checkAccessibility } from './helpers';

test.skip(process.env.ASISTEAM_QA_STORAGE !== '1', 'Requiere Next/Nest/S3 local');
test('MIG-17 perfil375px: subir foto→proxy autorizado y errores sin revelar S3',async({page},info)=>{
  const previous=sql(`select coalesce(avatar_url,'') from public.users where email=${quote(email('athlete'))}`);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6rGQAAAAASUVORK5CYII=','base64');
  try{
    await page.setViewportSize({width:375,height:812});await login(page,'athlete');await visit(page,'/profile');
    await page.getByLabel('Seleccionar foto').setInputFiles({name:'avatar.png',mimeType:'image/png',buffer:png});
    await page.getByRole('button',{name:'Subir foto',exact:true}).click();
    await expect(page.getByRole('status').filter({hasText:'Tu foto de perfil se actualizó'})).toBeVisible();
    const reference=sql(`select avatar_url from public.users where email=${quote(email('athlete'))}`);expect(reference).toMatch(/^\/profile\/avatar\//);
    const response=await page.request.get(reference);expect(response.status()).toBe(200);expect(response.headers()['cache-control']).toBe('private, no-store');expect(await response.body()).toEqual(png);
    expect(await page.evaluate(()=>document.body.innerHTML)).not.toContain('X-Amz-');
    await page.getByLabel('Seleccionar foto').setInputFiles({name:'false.png',mimeType:'image/png',buffer:Buffer.from('<svg>')});
    await page.getByRole('button',{name:'Subir foto',exact:true}).click();
    await expect(page.getByRole('alert').filter({hasText:'El contenido no corresponde'})).toBeVisible();
    await checkLayout(page);await checkAccessibility(page,info);
    await page.context().clearCookies();expect((await page.request.get(reference)).status()).toBe(404);
    const report=JSON.parse(readFileSync('.qa/log-check.json','utf8'));for(const key of ['token','sensitivePayload','sensitiveUrl'])expect(report[key],key).toBe(false);
  }finally{sql(`update public.users set avatar_url=${previous?quote(previous):'null'} where email=${quote(email('athlete'))}`);}
});
