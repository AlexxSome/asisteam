# WEB-04 — Acceso, invitaciones y consentimiento (#216)

[Seguro] `apps/web-vite` implementa la vertical de acceso sobre React Router y la sesión cookie Nest de [WEB-02](../issue-214/README.md), usando el SDK generado y schemas canónicos. Base verificada: `7c4c6f4837e2329e12917e2e4a328b341b73fe1c` (develop). Next permanece disponible; producción NO-GO. No hay migración SQL ni nueva regla de dominio.

## Matriz entregada

| URL / código | Loader/action y contrato | Verificación |
| --- | --- | --- |
| `/login` · AUT-01/AUT-07 | Sesión/proveedores; login cookie y OAuth start; retorno local validado | Credenciales erróneas, sesión vigente/revocada, Google firmado sintético, state/replay, Apple indisponible |
| `/register` · AUT-02/AUT-07 | Schema AuthRegister, registro/aceptación informada, login web; conserva código | Cuenta nueva, bienvenida, menor por código, documento legal |
| `/forgot-password` · AUT-03 | WebRecovery email + invite_code opcional; respuesta genérica confirmada por Nest | Email existente/inexistente, error de red sin éxito, reintento y contexto en email |
| `/reset-password?token=` · AUT-04 | Validación sin consumir por lectura; WebReset solo por POST | Contraseña/confirmación, un uso, URL limpia tras éxito y revocación en otra pestaña |
| `/invitations/:token` · AUT-05/AUT-06 | Preview mínimo; accept/register/claim con CSRF | INVITED/ACTIVE/MANAGED, token inválido/expirado/usado, destinatario distinto, preview no consume y no expone email |
| `/accept-terms` · AUT-08 | Consentimiento canónico explícito antes de datos privados | Login dirigido pendiente y retorno a invitación; aceptación no sustituye permiso del apoderado |
| `/legal/2026-09-21` · LEG-01 | Documento canónico HTML sin JS en dev/build/preview y componente SPA | Texto canónico unitario; acceso público; consulta sin aceptación |
| `/welcome` · ONB-01/ONB-03 | Perfil propio/solicitudes; redirige si tiene grupos ACTIVE | Registro sin grupos, recarga/raíz, progreso pendiente |
| `/join?code=` · ONB-02/ONB-03 | JoinByCode y progreso canónico del onboarding propio | Contexto desde login/registro/OAuth, rol ATHLETE, menor PENDING sin acceso privado |
| `/` · GRP-01/ONB-01 | Sesión, grupos autorizados y cookie de preferencia por usuario validada | Bienvenida sin grupos, grupo autorizado recordado, cookie ajena descartada |

[Seguro] Los enlaces a creación de grupos/perfil y el destino de historial tras claim conservan sus URLs. Sus pantallas completas siguen en WEB-05/06/07 (#217–219): el destino Vite muestra el estado seguro disponible en WEB-03, sin declarar paridad de esos módulos. El shell completo #170, infraestructura/selección productiva y aceptación externa siguen en sus hitos. Se mantienen las39 páginas Next y los códigos del inventario.

## Transporte y privacidad

[Seguro] Las actions usan solo el SDK cookie de mismo origen, CSRF y AbortSignal; no reintentan writes automáticamente ni guardan credenciales/DTOs en almacenamiento web. El código de grupo es contexto no secreto validado; únicamente incorpora ATHLETE. Las decisiones de minoría, cupos, apoderado/consentimiento y aprobación ADMIN siguen en Nest/SQL. El preview omite destinatario y datos privados; los tokens de invitación/recovery permanecen hasheados, temporales y de un uso en servicios existentes. Un GET/preview no acepta ni restablece credenciales.

[Seguro] El cuerpo web de recovery incorpora `invite_code` opcional para conservar el enlace de incorporación en el email; AuthRecovery Bearer no cambia. Nest valida el schema y añade únicamente ese código al enlace del origen configurado. Los callbacks continúan en Nest; state/nonce/PKCE, cookies, verificación JWS y ledger existentes no pasan a React. Cabeceras no-store/no-referrer/noindex se aplican en dev/preview y fachada/callback Nest; Vite omite detalles de errores de proxy que podrían contener códigos de callback. La política final de proxy productivo pertenece a WEB-09/10.

[Seguro] Login/register/claim/logout navegan el documento cuando corresponde. Un BroadcastChannel único por documento emite solo invalidación entre pestañas: su emisor no recibe su propio mensaje, por lo que un reset exitoso conserva la confirmación mientras revoca el contenido privado en las otras pestañas. BFCache/visibilidad siguen revalidando sesión. Retornos aceptan rutas locales acotadas y contexto de código validado, sin URLs externas ni query arbitraria.

## Validación y límites

[Seguro] La matriz Vite usa Nest y PostgreSQL17 reales en contenedor propio con migraciones/roles/RLS del proyecto. Email se captura localmente con datos sintéticos; Google se simula con JWKS y JWS RS256 verificado por el SocialAuth real. No hay envío externo ni acceso a datos reales. Apple indisponible se prueba en browser; callback Apple firmado/form_post permanece cubierto por integración backend, sin atribuirle E2E de proveedor externo.

[Seguro] Reflow320/375/768/1024/1440 y axe automático se ejecutan sobre registro, invitación, bienvenida y reset, junto con regresiones de sesión/grupos. No certifican lector humano, zoom nativo, operación en cancha ni paridad de39 rutas. Evidencia y resultados finales se registran en `verification.json` después de los cuatro gates y calificación; ese archivo distingue fuente validada de evidencia posterior y CI remoto.

[Seguro] Comandos: `pnpm api:generate`, `pnpm --filter @asisteam/web-vite typecheck`, `test`, `build`, `test:e2e`, `pnpm ci:checks`, `ci:backend`, `ci:staging`, `ci:extended`, `ci:qualification`. Node24/pnpm10 son los del proyecto; el ejecutor local usa corepack10.33.2 en PATH porque pnpm global11 no coincide. No se cambia el manifest para adaptar la máquina.

[Seguro] Resultado final sobre `ecbd894ea678f16646e3d6ee239eae2af0f18bd6`: cuatro gates y `ci:qualification` PASS; checks14 (core150/web961/Vite8), backend40 suites/1646 aserciones SQL +50 nativas +84 integraciones sin omisiones, staging22 registros con fallo inyectado esperado y rollback/limpieza PASS, extended47 Next +18 Vite +1 transporte sin omisiones. Las84 omisiones de unidades web corresponden a integraciones ejecutadas por backend. Carga500 atletas/5000 registros/192 requests sin errores, p95 máximo86.3ms. Preview legal sin JS/cabeceras sensibles PASS. [verification.json](verification.json) guarda los reportes sanitizados; el commit posterior solo añade evidencia/documentación. CI remoto valida la cabeza final separadamente. Calificación técnica PASS mantiene aceptación operacional NO-GO.
