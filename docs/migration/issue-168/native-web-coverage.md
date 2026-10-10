# Reemplazo de cobertura web del proveedor retirado

Los 39 archivos históricos (466 casos, incluido un logout integrado) tienen equivalentes en 36 archivos nativos (472 casos PASS, cero omitidos) y el ensayo real de logout Chromium/Next/Nest/PostgreSQL. La evidencia nativa añade revocación de access/refresh, supervivencia de otra sesión e idempotencia de salida anónima.

No es evidencia de CI remoto verde: el head publicado anterior continúa fallando hasta actualizar el runner y publicar las correcciones.

| Archivo previo | Casos previos | Evidencia actual |
|---|---:|---|
| `apps/web/src/app/accept-terms/actions.test.ts` | 6 | `apps/web/src/app/accept-terms/actions.test.ts` — PASS |
| `apps/web/src/app/auth/callback/route.test.ts` | 17 | `apps/web/src/app/auth/callback/route.test.ts` — PASS |
| `apps/web/src/app/check-in/actions.test.ts` | 5 | `apps/web/src/app/check-in/actions.test.ts` — PASS |
| `apps/web/src/app/forgot-password/actions.test.ts` | 8 | `apps/web/src/app/forgot-password/actions.test.ts` — PASS |
| `apps/web/src/app/groups/[groupId]/actions.test.ts` | 31 | `apps/web/src/app/groups/[groupId]/actions.test.ts` — PASS |
| `apps/web/src/app/groups/[groupId]/activities/[activityId]/attendance/actions.test.ts` | 10 | `apps/web/src/app/groups/[groupId]/activities/[activityId]/attendance/actions.test.ts` — PASS |
| `apps/web/src/app/groups/[groupId]/activities/new/actions.test.ts` | 14 | `apps/web/src/app/groups/[groupId]/activities/new/actions.test.ts` — PASS |
| `apps/web/src/app/groups/[groupId]/activity-types/actions.test.ts` | 9 | `apps/web/src/app/groups/[groupId]/activity-types/actions.test.ts` — PASS |
| `apps/web/src/app/groups/[groupId]/announcements/actions.test.ts` | 9 | `apps/web/src/app/groups/[groupId]/announcements/actions.test.ts` — PASS |
| `apps/web/src/app/groups/[groupId]/billing/actions.test.ts` | 6 | `apps/web/src/app/groups/[groupId]/billing/actions.test.ts` — PASS |
| `apps/web/src/app/groups/[groupId]/billing/billing-panel.test.tsx` | 19 | `apps/web/src/app/groups/[groupId]/billing/billing-panel.test.tsx` — PASS |
| `apps/web/src/app/groups/[groupId]/guardians/actions.test.ts` | 9 | `apps/web/src/app/groups/[groupId]/guardians/actions.test.ts` — PASS |
| `apps/web/src/app/groups/[groupId]/invitations/new/actions.test.ts` | 8 | `apps/web/src/app/groups/[groupId]/invitations/new/actions.test.ts` — PASS |
| `apps/web/src/app/groups/[groupId]/members/actions.test.ts` | 14 | `apps/web/src/app/groups/[groupId]/members/actions.test.ts` — PASS |
| `apps/web/src/app/groups/[groupId]/members/new/actions.test.ts` | 5 | `apps/web/src/app/groups/[groupId]/members/new/actions.test.ts` — PASS |
| `apps/web/src/app/groups/[groupId]/members/pending/actions.test.ts` | 10 | `apps/web/src/app/groups/[groupId]/members/pending/actions.test.ts` — PASS |
| `apps/web/src/app/groups/new/actions.test.ts` | 8 | `apps/web/src/app/groups/new/actions.test.ts` — PASS |
| `apps/web/src/app/invitations/[token]/actions.test.ts` | 17 | `apps/web/src/app/invitations/[token]/actions.test.ts` — PASS |
| `apps/web/src/app/join/page.test.tsx` | 4 | `apps/web/src/app/join/page.test.tsx` — PASS |
| `apps/web/src/app/login/actions.test.ts` | 4 | `apps/web/src/app/login/actions.test.ts` — PASS |
| `apps/web/src/app/login/auth-pages.test.tsx` | 15 | `apps/web/src/app/login/auth-pages.test.tsx` — PASS |
| `apps/web/src/app/login/sign-out.integration.test.ts` | 1 | `apps/web/scripts/native-auth-smoke.mjs` — PASS |
| `apps/web/src/app/login/sign-out.test.ts` | 4 | `apps/web/src/app/login/sign-out.test.ts` — PASS |
| `apps/web/src/app/login/social-actions.test.ts` | 11 | `apps/web/src/app/login/social-actions.test.ts` — PASS |
| `apps/web/src/app/profile/actions.test.ts` | 14 | `apps/web/src/app/profile/actions.test.ts` — PASS |
| `apps/web/src/app/profile/page.test.tsx` | 2 | `apps/web/src/app/profile/page.test.tsx` — PASS |
| `apps/web/src/app/reset-password/actions.test.ts` | 14 | `apps/web/src/app/reset-password/actions.test.ts` — PASS |
| `apps/web/src/lib/activity-types.test.ts` | 31 | `apps/web/src/lib/activity-types.test.ts` — PASS |
| `apps/web/src/lib/attendance-history.test.ts` | 9 | `apps/web/src/lib/attendance-history.test.ts` — PASS |
| `apps/web/src/lib/groups.test.ts` | 29 | `apps/web/src/lib/groups.test.ts` — PASS |
| `apps/web/src/lib/invitations.test.ts` | 3 | `apps/web/src/lib/invitations.test.ts` — PASS |
| `apps/web/src/lib/members.test.ts` | 10 | `apps/web/src/lib/members.test.ts` — PASS |
| `apps/web/src/lib/reports.test.ts` | 9 | `apps/web/src/lib/reports.test.ts` — PASS |
| `apps/web/src/lib/social-auth.test.ts` | 7 | `apps/web/src/lib/social-auth.test.ts` — PASS |
| `apps/web/src/lib/supabase/cookie-writes.test.ts` | 2 | `apps/web/src/lib/api/native-session.test.ts` — PASS |
| `apps/web/src/lib/supabase/recovery.test.ts` | 1 | `apps/web/src/lib/api/native-session.test.ts` — PASS |
| `apps/web/src/lib/supabase/server.test.ts` | 2 | `apps/web/src/lib/api/native-session.test.ts` — PASS |
| `apps/web/src/lib/wards.test.tsx` | 36 | `apps/web/src/lib/wards.test.tsx` — PASS |
| `apps/web/src/middleware.test.ts` | 53 | `apps/web/src/middleware.test.ts` — PASS |

Los tres contratos SSR/recuperación se reúnen en siete casos nativos, contados una sola vez. Las aserciones de transporte proveedor (`from`, `rpc`, fábrica GoTrue y opciones SDK) se sustituyen por el contrato HTTP actual; permisos, errores, normalización, visibilidad y navegación permanecen cubiertos. S256 y el verificador cifrado se verifican en la integración API OAuth.

Avatares: el API conserva objetos privados sin referencia cuando una confirmación de transacción resulta ambigua; la integración S3 nativa verifica rollback del puntero y ausencia de exposición. El contrato antiguo de borrar inmediatamente mediante SDK cliente se retira con ese transporte, sin afirmar limpieza inmediata de objetos.
