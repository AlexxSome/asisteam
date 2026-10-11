import { Form, Link, useNavigation } from "react-router";
import { useId } from "react";
import { Button } from "../ui";
export function AccountMenu({compact=false}:{compact?:boolean}) {
 const id=useId(),nav=useNavigation(),busy=nav.state!=="idle";
 return <details className={compact?"relative min-w-0 shrink-0":"rounded-lg border p-3"} onKeyDown={event=>{if(event.key==="Escape"){event.currentTarget.open=false;event.currentTarget.querySelector("summary")?.focus();}}}>
 <summary className="min-h-11 cursor-pointer content-center rounded px-2 font-medium">Mi cuenta</summary>
 <nav aria-label="Mi cuenta" className="absolute right-0 z-20 mt-2 w-64 max-w-[calc(100vw-2rem)] space-y-3 rounded-lg border bg-surface p-4 shadow-overlay">
 <Link to="/profile" className="flex min-h-11 items-center underline">Mi perfil</Link><Form method="post" action="/logout"><p id={id} className="text-small">Cierra tu sesión en este dispositivo. Tus otras sesiones seguirán abiertas.</p><Button variant="outline" busy={busy} aria-describedby={id}>Cerrar sesión</Button></Form>
 </nav></details>;
}
