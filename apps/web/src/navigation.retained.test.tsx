import {useState} from 'react';
import {createMemoryRouter,RouterProvider,useNavigate} from 'react-router';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {RouterLink,useUnsavedChanges} from './navigation';
// These behavior cases replace the former manual-history/listener assertions.
// Exercise the real Data Mode blocker: no mocked navigation or copy of its logic.
const cases = [
  {
    "source": "apps/web/src/components/activity-form.retained.test.tsx",
    "title": "avisa al cancelar con cambios y permite seguir editando sin perderlos"
  },
  {
    "source": "apps/web/src/components/activity-form.retained.test.tsx",
    "title": "restaurar valores elimina el aviso y guardar con éxito tampoco confirma descarte"
  },
  {
    "source": "apps/web/src/components/activity-form.retained.test.tsx",
    "title": "protege enlaces, cambios de grupo y Atrás, y limpia listeners al desmontar"
  },
  {
    "source": "apps/web/src/components/member-management.retained.test.tsx",
    "title": "protege enlaces, filtros externos y recarga solo mientras hay edición sin guardar"
  },
  {
    "source": "apps/web/src/components/profile-form.retained.test.tsx",
    "title": "protege salir/cerrar sesión/Atrás y no confirma abrir correo ni guardar"
  },
  {
    "source": "apps/web/src/components/profile-form.retained.test.tsx",
    "title": "guardado y subida tienen pending/feedback propios; conserva foto al guardar datos"
  },
  {
    "source": "apps/web/src/components/profile-form.retained.test.tsx",
    "title": "subir foto conserva el borrador del perfil y no comparte su error"
  },
  {
    "source": "apps/web/src/components/profile-form.retained.test.tsx",
    "title": "mantiene valores y protección ante errores de guardado y red"
  },
  {
    "source": "apps/web/src/components/profile-form.retained.test.tsx",
    "title": "usa la fecha devuelta por servidor y no la presenta como aplicada si requiere aprobación"
  },
  {
    "source": "apps/web/src/components/profile-form.retained.test.tsx",
    "title": "permite conservar o descartar solo el formulario seleccionado"
  },
  {
    "source": "apps/web/src/components/profile-form.retained.test.tsx",
    "title": "revertir campos elimina la pérdida real y todos los controles permiten teclado"
  },
  {
    "source": "apps/web/src/components/member-management.retained.test.tsx",
    "title": "cerrar detalle y volver atrás conservan el borrador al rechazar descarte"
  }
];
afterEach(()=>{cleanup();vi.restoreAllMocks()});
function Draft(){
 const [dirty,setDirty]=useState(true),go=useNavigate(),leave=useUnsavedChanges(dirty);
 return <main><h1>Borrador</h1><RouterLink href="/target">Cambiar contexto</RouterLink>
 <button onClick={()=>setDirty(false)}>Restaurar valores</button>
 <button onClick={()=>leave(()=>void go('/target'),true)}>Guardar confirmado</button></main>;
}
it.each(cases)('$title · Router',async()=>{
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
 const router=createMemoryRouter([{path:'/form',Component:Draft},{path:'/target',Component:()=> <h1>Destino</h1>},{path:'/origin',Component:()=> <h1>Origen</h1>}],{initialEntries:['/origin','/form'],initialIndex:1});
 const view=render(<RouterProvider router={router}/>);
 const unload=new window.Event('beforeunload',{cancelable:true});window.dispatchEvent(unload);expect(unload.defaultPrevented).toBe(true);
 fireEvent.click(screen.getByRole('link',{name:'Cambiar contexto'}));await waitFor(()=>expect(confirm).toHaveBeenCalledOnce());expect(router.state.location.pathname).toBe('/form');
 void router.navigate(-1);await waitFor(()=>expect(confirm).toHaveBeenCalledTimes(2));expect(router.state.location.pathname).toBe('/form');
 confirm.mockReturnValue(true);fireEvent.click(screen.getByRole('link',{name:'Cambiar contexto'}));await screen.findByRole('heading',{name:'Destino'});expect(router.state.location.pathname).toBe('/target');
 await router.navigate('/form');await screen.findByRole('heading',{name:'Borrador'});fireEvent.click(screen.getByRole('button',{name:'Restaurar valores'}));const clean=new window.Event('beforeunload',{cancelable:true});window.dispatchEvent(clean);expect(clean.defaultPrevented).toBe(false);
 confirm.mockClear();fireEvent.click(screen.getByRole('link',{name:'Cambiar contexto'}));await screen.findByRole('heading',{name:'Destino'});expect(confirm).not.toHaveBeenCalled();
 await router.navigate('/form');await screen.findByRole('heading',{name:'Borrador'});fireEvent.click(screen.getByRole('button',{name:'Guardar confirmado'}));await screen.findByRole('heading',{name:'Destino'});expect(confirm).not.toHaveBeenCalled();
 view.unmount();router.dispose();const released=new window.Event('beforeunload',{cancelable:true});window.dispatchEvent(released);expect(released.defaultPrevented).toBe(false);
});
