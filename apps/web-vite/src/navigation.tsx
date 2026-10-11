import { useEffect } from "react";
import { Link, useLocation, useNavigate, useNavigation, useRevalidator, useBlocker, useBeforeUnload, type LinkProps } from "react-router";
export function RouterLink({href, prefetch: _prefetch, ...props}: Omit<LinkProps,"to"|"prefetch"> & { href: string; prefetch?: boolean }) { return <Link {...props} to={href} />; }
export function usePathname() { return useLocation().pathname; }
export function useRouter() { const navigate=useNavigate(), revalidator=useRevalidator(); return {push:(to:string)=>void navigate(to),refresh:()=>revalidator.revalidate()}; }
export function NavigationProgress() { const nav=useNavigation(); return nav.state === "idle" ? null : <span className="sr-only" role="status">Cargando página…</span>; }
export function navigateWithUnsavedChanges(navigate:()=>void) { navigate(); }
export function useUnsavedChanges(dirty:boolean) {
 const blocker=useBlocker(({currentLocation,nextLocation})=>dirty && (currentLocation.pathname!==nextLocation.pathname || currentLocation.search!==nextLocation.search));
 useEffect(()=>{if(blocker.state === "blocked") { if(window.confirm("Tienes cambios sin guardar. ¿Quieres salir y descartarlos?")) blocker.proceed(); else blocker.reset(); }},[blocker]);
 useBeforeUnload(event=>{if(dirty){event.preventDefault();event.returnValue="";}});
}
