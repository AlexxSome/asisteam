# MIG-20 — Importación y retiro de Supabase Auth (#164)

[Seguro] Base `develop@c0b77320979af0abbb307ec3f18c55374a9ded70`, rama `codex/164-retiro-supabase-auth`, 2026-10-08. Esta entrega implementa y ensaya el corte con cuentas sintéticas; no acredita retiro de un entorno externo. La provisión y OAuth con Google/Apple reales siguen pendientes según #163. PostgreSQL, Storage legacy y Edge conservados para compatibilidad/QA se retiran por los gates de #165–#168.

## Autoridad y datos

[Seguro] `auth_authority` tiene estados persistentes `LEGACY → FROZEN → NATIVE`, con permisos exclusivos del migrador. Locks compartidos en las fronteras de identidad/sesión y triggers legacy hacen esperar la congelación hasta terminar efectos anteriores. En coexistencia, una escritura/login propio marca el sujeto como `native_owned`, invalida sus sesiones GoTrue y bloquea cambios de contraseña/email/vínculos y emisión de sesiones desde la autoridad anterior. El operador no habilita dos escritores para el mismo sujeto.

[Seguro] La preparación reconoce credenciales/familias propias escritas por #162/#163 y conserva la contraseña reemplazada. Para esos sujetos, el ban legacy infinito utilizado por #162 como marcador de traspaso no se convierte en una prohibición nueva; restricciones finitas y borrado legacy sí se conservan. El ensayo incluye una credencial anterior con contraseña distinta del origen y comprueba que solo la nueva autentica después del corte.

[Seguro] `import_auth_identities()` exige FROZEN, recorre todo el origen y conserva UUID de sujeto, `public.users.id`, perfil, membresías, asistencia y consentimientos. Importa bcrypt probado `$2a/$2b/$2y` con coste 4–14 únicamente para email confirmado; hashes ausentes/incompatibles o cuentas sin confirmación requieren recovery con marcador que no autentica. Las cuentas sociales sin contraseña conservan sus pares Google/Apple sin inventar una contraseña. MANAGED/INVITED sin sujeto permanecen sin credenciales; claim dirigido sigue conservando IDs y R1/consentimientos.

[Seguro] Ledger privado relaciona sujeto/perfil/digest de origen/fecha/recovery. Repetir con el mismo mapa no cambia credenciales, perfiles ni vínculos; un delta de origen después de importar, un perfil huérfano/no ACTIVE, email contradictorio o proveedor desconocido bloquea el corte para revisión operativa. No se fusiona por email ni se sobrescribe una credencial propia. Bans/borrado legacy se conservan como restricción privada; una prohibición causada por una transición ya hecha a Nest no se importa como una nueva prohibición. La API continúa verificando ACTIVE y familia vigente.

[Seguro] Los helpers/RLS/vistas de producto y políticas Storage usan primitivas propias de claims en `app_private`, con `search_path` fijo. En NATIVE, un actor requiere contexto Nest y rol API; un token legacy o un claim `auth_provider=nest` presentado a PostgREST no concede identidad. El acceso Nest conserva las verificaciones de familia y permisos por membership. El FK de perfil ya apunta al mapa propio desde #162. ACTIVATE retira los triggers de creación/sincronización GoTrue; el trigger de prohibición permanece mientras existan las tablas legacy. Las funciones operativas de importación/compatibilidad quedan reservadas al migrador y no son llamadas por runtime retirado.

## Ejecutar un corte de entorno

[Seguro] Antes de la ventana: respaldar de forma cifrada la DB actual y su configuración, comprobar restauración, inventario/UUIDs/OAuth/links, clients IDs de #163, envío de recovery, Storage privado de #161 y todos los transportes de dominio. Conservar el mismo Google Client ID/Apple Services ID importado. El backup/snapshot sirve como fuente de reconciliación y recuperación, sin reemplazar escrituras posteriores. Confirmar RTO/volumen/observación del entorno con #166; la referencia propuesta de #145 no es un compromiso aprobado.

[Seguro] Usar conexión migrator privada fuera del repositorio. Cada paso SQL siguiente se confirma por separado; no agrupar FREEZE/import/ACTIVATE en una única transacción. Solo se muestran controles y conteos, sin exportar hashes, emails, tokens o credenciales:

```sql
select app_private.auth_cutover('FREEZE');
select app_private.import_auth_identities();
-- Revisar conteos/mapa en un canal privado y resolver cualquier conflicto.
-- Desplegar artefactos/configuración completos y retirar admisión de GoTrue,
-- PostgREST, Edge y Storage antiguos antes de abrir tráfico nuevo.
select app_private.auth_cutover('ACTIVATE');
```

[Seguro] API: configurar Auth/OAuth/Storage propios de #161–#163 y `SUPABASE_AUTH_RETIRED=1`; eliminar `SUPABASE_AUTH_URL`, `SUPABASE_AUTH_PUBLIC_KEY`, `INVITATION_AUTH_BRIDGE_SECRET`. Configuración mixta falla al arrancar; readiness y endpoints propios rechazan una DB que todavía no esté en NATIVE. Next: `ASISTEAM_TRANSPORT_AUTH=nest` y todos los módulos GROUPS/PROFILE/MEMBERS/INVITATIONS/ACTIVITIES/ATTENDANCE/REPORTS/BILLING/ANNOUNCEMENTS/QR/STORAGE=nest, junto a origen/secreto del proxy. La atestación de misma DB mediante URLs de #151 todavía se conserva hasta #165; no requiere llamar a Auth ni disponer de anon key. El cliente de sesión web no instancia Supabase incluso sin cookies propias. Middleware/callbacks/registro/recovery siguen los caminos Nest de #162/#163.

[Seguro] ACTIVATE revoca familias propias previas y consume recovery/OAuth pendientes; elimina sesiones/refresh legacy. Las cookies viejas no se importan y los usuarios deben iniciar sesión otra vez. Recovery/confirmación/PKCE emitidos por GoTrue no se convierten: solicitar un enlace nuevo desde Nest; callback legacy en Auth=nest devuelve error de acceso. Invitaciones de dominio ya emitidas conservan hash, destinatario, vencimiento de siete días y un uso; el claim/accept consulta las mismas RPC/tablas. El API retirado selecciona registro/claim propio incluso sin el header de compatibilidad.

## Abortar y recuperar

[Seguro] `auth_cutover('ABORT')` permite volver de FROZEN a LEGACY únicamente antes de una importación exitosa. Una importación fallida revierte completa su transacción y puede corregirse/repetirse. Tras importar con éxito, mantener la congelación y completar hacia adelante; regresar al proveedor mientras quedan hashes copiados permitiría una segunda autoridad. Después de NATIVE, ABORT siempre falla.

[Seguro] Ante fallo postcorte: suspender admisión si procede; ejecutar `auth_cutover('RECOVER_FORWARD')`, restaurar un artefacto Nest compatible contra la misma DB y configuración propia, comprobar login/familias/permisos/recovery/OAuth/claim y reabrir tráfico. No restaurar un snapshot anterior sobre la base escritora ni cambiar solo un flag. Perfiles, contraseñas reemplazadas, vínculos y revocaciones creados después del corte quedan en esa base. Un retorno futuro a GoTrue exige una nueva migración explícita de esos deltas y credenciales, fuera de este mecanismo; no tiene ruta automática.

[Seguro] El ensayo local reinicia el artefacto Nest y confirma login con contraseña posterior y vínculo OAuth nuevo en menos de diez segundos. Ese umbral es de prueba sintética, no un RTO de producción ni evidencia de infraestructura externa. Registrar SHA/entorno/fecha/ventana/resultado/RTO real y aceptación operativa antes de declarar el corte externo completado.

## Verificación y evidencia

[Seguro] Reproducir `pnpm ci:checks`, `pnpm ci:backend`, `pnpm ci:staging`. El backend incluye el nuevo ensayo `auth-cutover.integration.mjs`, que crea una DB vacía con solo esquema y fixtures sintéticos y la elimina junto a sus credenciales temporales. La prueba compara perfiles/membresías/historial/consentimientos antes/después, cubre congelación/abort/import/replay, credencial legacy/unsupported/banned, coexistencia, nuevas cuentas/password/linking/recovery hacia adelante e invitación MANAGED anterior al corte. Finalmente elimina **solo en su DB aislada** el esquema `auth` completo y comprueba login/sesión/password/claim sin el proveedor original.

[Seguro] Chromium Next→Nest→PostgreSQL recorre registro/perfil/cookies/refresh/logout/recovery/reset/login sin anon key; también corre OAuth/linking firmado sintético de #163. HIBP/Resend y Google/Apple se simulan; estos ensayos no prueban entrega de correo ni login externo. Las unitarias web verifican ausencia de SDK/fallback aun para visitantes anónimos. pgTAP cubre controles/permisos/FK/claims y rechazo de actor PostgREST; la suite canónica cubre V1–V6/R1/métrica SQL↔core.

| Verificación final | Resultado |
| --- | --- |
| `pnpm ci:checks` | [Seguro] PASS 12 gates; core150, web914, API/SDK/worker; 81 integraciones excluidas de la fase unitaria y ejecutadas aparte |
| Chromium Next→Nest→PostgreSQL | [Seguro] PASS contraseña/recovery/cookies sin anon key y OAuth/linking firmado sintético |
| HTTP/PostgreSQL Auth/OAuth/corte y todos los módulos de dominio/Storage | [Seguro] PASS; nuevo ensayo de corte 3.291 s, cero skips |
| Portabilidad y tipos regenerados | [Seguro] PASS; fallo inyectado esperado y limpieza propia PASS; tipos públicos sin diff |
| Staging Docker | [Seguro] PASS despliegue/roles/DB/recuperación; fallo inyectado esperado |
| pgTAP completo final, secuencial | [Seguro] FAIL 1 de 1673 casos en 41 archivos: `send_invitations.test.sql` caso 15; los 16 nuevos casos de corte y las políticas/invariantes restantes PASS |
| Cuota aislada por transacción | [Seguro] PASS 51/51; copia temporal con contador vacío dentro de BEGIN/ROLLBACK; fuente y datos persistentes sin cambios |
| Integraciones producto/Edge | [Seguro] PASS 81/81, cero omitidas, ejecutadas tras detenerse el gate pgTAP |
| CI remoto del SHA publicado y corte externo/RTO/proveedores reales | [Seguro] PENDIENTE |

[Seguro] El fallo de cuota ya consta en la base, [MIG-19](../issue-163/README.md), con have 1 / want 0. El archivo es idéntico a `c0b7732`. No se cambia la suite para ocultarlo: el contador local contiene residuo y el aislamiento transaccional demuestra que el caso funciona sin ese residuo. Un intento adicional en paralelo con integraciones mostró una comparación de historial afectada por escrituras concurrentes del fixture; la repetición final secuencial elimina esa interferencia y reproduce únicamente la cuota. El gate backend completo sigue FAIL y debe quedar visible para revisión.

[Seguro] Evidencia sanitizada: `checks.json`, `backend.json`, `staging.json`, `portability.json`, `product-integrations.json`, `pgtap-final.json` y `verification-summary.json`. `sourceCommit` identifica la base porque las ejecuciones se hicieron sobre el diff pendiente; no acreditan CI remoto del commit publicado. El resumen incluye hashes de los archivos críticos verificados.

[Seguro] Auto-revisión del diff atribuible a #164: corregidos el aborto tras importación, el contexto API exigido al actor nativo, la reconciliación de credenciales previas y el rechazo de configuración retirada antes de activar la autoridad. Revisados grants/SECURITY DEFINER, locks de congelación, replay/revocación, preservación de IDs/consentimientos/historial y privacidad. La prueba OAuth refresca su snapshot de estadísticas para observar la espera real de la operación de contraseña. El cambio ajeno de `next-env.d.ts` se conserva fuera del commit.
