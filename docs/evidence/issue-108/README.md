# Primer uso y requisito de suscripción — #108

Comparación con `develop` en `677d5e0`. Capturas de la aplicación real, con builds de producción de Next.js y Supabase local; cuentas y grupo sintéticos. No se realizaron pagos ni se usaron datos de producción.

## Comportamiento

La bienvenida y la creación explican que un grupo nuevo tiene 0 cupos, sin prueba gratuita. El ADMIN puede configurar el grupo y crear actividades; activar deportistas requiere el primer pago mensual aprobado. El inicio ofrece pasos opcionales basados en datos del servidor y enlaces para continuar o regresar a la configuración.

El aviso compartido del grupo y la lectura de capacidad solo se habilitan para ADMIN. Se distinguen 0 cupos, capacidad llena, capacidad disponible, grupos históricos sin límite comercial y capacidad desconocida por error de lectura. Los errores de incorporación, consentimiento, aprobación y reactivación ofrecen «Gestionar plan» al ADMIN; ATHLETE/GUARDIAN reciben la indicación de contactar al administrador. Los formularios mantienen sus valores y no presentan una activación exitosa al fallar por cupos.

No cambia el contrato comercial, la autorización, las RPC, RLS ni el procesamiento de pagos. La capacidad deriva de `get_group_billing`; los parámetros de retorno del checkout no la activan.

## Antes y después

| Escenario (375 px) | Antes | Después |
| --- | --- | --- |
| Bienvenida | [Captura](welcome-before-375.jpg) | [Captura](welcome-after-375.jpg) |
| Crear grupo | [Captura](create-before-375.jpg) | [Captura](create-after-375.jpg) |
| Inicio del grupo | [Captura](home-before-375.jpg) | [Captura](home-after-375.jpg) |
| Incorporación propia sin cupos | [Captura](capacity-error-before-375.jpg) | [Captura](capacity-error-after-375.jpg) |

También: [inicio a 1440 px](home-after-1440.jpg), [suscripción](billing-after-375.jpg), [cuenta gestionada](managed-after-375.jpg) y [configuración](settings-after-375.jpg).

## Verificación

- `corepack pnpm -r typecheck`: PASS, core y web.
- `corepack pnpm -r test`: PASS, 147 pruebas core y 677 web; 80 pruebas de integración web omitidas por sus flags habituales. La selección inicial del issue pasó 91 pruebas en 9 archivos.
- `corepack pnpm --filter @asisteam/web build`: PASS, build de producción y TypeScript. Tras ajustar la lectura de existencia de actividades a `v_group_activities`, se repitieron las 32 pruebas afectadas de grupos/capacidad y el build: PASS.
- `git diff --check`: PASS. Auto-revisión limitada al diff del issue, incluidos archivos nuevos; sin hallazgos pendientes.
- [Responsive](responsive.json): crear grupo, inicio, suscripción, cuenta gestionada y configuración en 320, 375, 768, 1024 y 1440 px (25 combinaciones); sin desbordamiento horizontal, un h1 por página y controles nuevos de al menos 44 px.
- [Teclado](keyboard.json): acceso por teclado a Gestionar plan, Continuar configuración y Volver al inicio del grupo, con navegación verificada.
- [Zoom real al 200 %](zoom-200.json): Chrome pasó de 1512 CSS px/DPR 2 a 756 CSS px/DPR 4; las cinco pantallas anteriores conservaron un h1 y no desbordaron. Se restauró el zoom al 100 %.
- [Retorno de checkout](checkout-return.json): abrir Suscripción con `status=approved&preapproval_id=synthetic` mantuvo «Sin suscripción» y 0 cupos del servidor.

## Límites de la evidencia

Los estados lleno, disponible, histórico y desconocido, y las diferencias por rol, se verificaron con pruebas automatizadas. La QA conectada a Supabase local cubrió el ADMIN de un grupo nuevo sin suscripción, incluida la denegación real al incorporarse como deportista. No se verificó un cobro real del proveedor ni se simuló su webhook.

El repositorio no ofrece script de lint. Los comandos recursivos ejecutaron los scripts reales porque Turborepo encontraba pnpm global 11.1.1, distinto del 10.33.2 fijado por el proyecto. El build conservó el aviso preexistente de Next.js sobre `middleware`/`proxy`. No hay migraciones ni cambios de backend en este issue; no se repitieron pgTAP ni integraciones de Edge Functions.
