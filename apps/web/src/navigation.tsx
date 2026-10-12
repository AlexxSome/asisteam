import { useEffect, useRef } from "react";
import { Link, useLocation, useNavigate, useNavigation, useRevalidator, useBlocker, useBeforeUnload, type LinkProps } from "react-router";
export type RouterLinkProps = Omit<LinkProps,"to"|"prefetch"> & { href: string; prefetch?: boolean };
export function RouterLink({href, prefetch: _prefetch, ...props}: RouterLinkProps) { return <Link {...props} to={href} />; }
export function usePathname() { return useLocation().pathname; }
export function useRouter() { const navigate=useNavigate(), revalidator=useRevalidator(); return {push:(to:string)=>void navigate(to),refresh:()=>revalidator.revalidate()}; }
export function NavigationProgress() { const nav=useNavigation(); return nav.state === "idle" ? null : <span className="sr-only" role="status">Cargando página…</span>; }
export function navigateWithUnsavedChanges(navigate:()=>void) { navigate(); }
export function useUnsavedChanges(dirty:boolean) {
 const bypass=useRef(false);
 const blocker=useBlocker(({currentLocation,nextLocation})=>!bypass.current && dirty && (currentLocation.pathname!==nextLocation.pathname || currentLocation.search!==nextLocation.search));
 useEffect(()=>{if(blocker.state === "blocked") { if(window.confirm("Tienes cambios sin guardar. ¿Quieres salir y descartarlos?")) blocker.proceed(); else blocker.reset(); }},[blocker]);
 useBeforeUnload(event=>{if(dirty && !bypass.current){event.preventDefault();event.returnValue="";}});
 return (navigate:()=>void,confirmed=false)=>{if(confirmed)bypass.current=true;navigate();};
}
