import {afterEach,expect,it,vi} from 'vitest';
import {moduleTransport,TRANSPORT_MODULES} from './config';
afterEach(()=>vi.unstubAllEnvs());
function independent(){vi.stubEnv('ASISTEAM_DATABASE_MODE','independent');vi.stubEnv('ASISTEAM_TRANSPORT_AUTH','nest');for(const name of TRANSPORT_MODULES)vi.stubEnv('ASISTEAM_TRANSPORT_'+name.toUpperCase(),'nest');}
it('destino independiente admite todos los módulos sin configuración de proveedor',()=>{independent();for(const name of TRANSPORT_MODULES)expect(moduleTransport(name)).toBe('nest');});
it.each(TRANSPORT_MODULES)('destino independiente rechaza fallback parcial %s',name=>{independent();vi.stubEnv('ASISTEAM_TRANSPORT_'+name.toUpperCase(),'unsupported');expect(()=>moduleTransport('groups')).toThrow();});
it('destino independiente exige identidad propia',()=>{independent();vi.stubEnv('ASISTEAM_TRANSPORT_AUTH','unsupported');expect(()=>moduleTransport('groups')).toThrow();});
