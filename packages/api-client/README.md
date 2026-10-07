# Cliente HTTP · MIG-04 (#148)

[Seguro] SDK ESM compilado con DTO HTTP generados; no importa `Database`, tablas ni tipos de persistencia. La fuente es [core/http-contract](../core/src/http-contract.ts): Zod → [OpenAPI 3.0.3](openapi.json) → [tipos](src/openapi.ts) y [métodos](src/generated.ts). Se fijan openapi-typescript 7.13.0 y zod-to-json-schema 3.25.2 compatibles con Zod3; las reglas de refinamiento/transformación se siguen ejecutando en core y servidor. JSON Schema no reemplaza edad, consentimiento, memberships ni SQL.

```sh
pnpm install --frozen-lockfile
pnpm api:generate
pnpm api:check
pnpm exec turbo run build typecheck test --filter @asisteam/api-client --filter @asisteam/api
pnpm --filter @asisteam/web test:api-contract
```

[Seguro] `api:check` vuelve a generar en memoria y compara OpenAPI, tipos y SDK, sin sobrescribirlos. CI falla si cualquiera diverge. Para añadir una operación: localizarla en la matriz MIG-01, agregar sus schemas/metadata a core, generar, implementar el handler en su issue y probar el transporte HTTP real antes de cambiar la bandera.

```ts
import { createServerApiClient } from "@/lib/api/server";
const client = createServerApiClient();
const health = await client.health(); // /api/v1/health; implementado
// Tras #149/#151: client.listMyGroups({ query: { page: 1, page_size: 50 } })
```

[Seguro] El adaptador Next lleva `import "server-only"`. Obtiene usuario verificado y sesión del cliente Supabase SSR; exige que sus IDs coincidan y mantiene el access token en el servidor. Solo adjunta Bearer cuando la operación lo requiere; no devuelve tokens ni sesiones a componentes. No escribe localStorage. El SDK usa `cache: no-store`, `credentials: omit`, rechaza redirects y exige HTTPS, salvo loopback de pruebas locales. Los schemas TS no son contrato ejecutable de Java/Swift: esas apps consumirán OpenAPI/JSON cuando se implementen.

## Errores y resultado incierto

[Seguro] `ApiClientError` conserva `status`, código estable y requestId UUID válido. Descarta body/error/stack remoto y detalles, y usa mensajes españoles fijos por estado. Cubre 401/403/404/409/422/429; red → 503, timeout → 504, respuesta/DTO inválido → 502. Valida input antes de HTTP y output antes de entregarlo. No hay retry automático ni fallback a Supabase.

[Seguro] El deadline incluye obtención de sesión, HTTP y cuerpo; aborta el fetch. Un write que agota el deadline puede haber sido persistido por el servidor: consultar su estado/idempotencia definida por cada módulo antes de reintentar. No suponer que abortar la conexión deshace una transacción.

## Selección por módulo y coexistencia

[Seguro] [runModuleOperation](../../apps/web/src/lib/api/transport.ts) recibe dos ejecutores del mismo caso de uso. La selección llama exactamente uno y propaga su resultado/error. Las Server Actions quedan responsables de revalidación y mensajes UI; la autorización y las reglas se mantienen en el servidor/SQL existente.

```ts
const result = await runModuleOperation("groups", {
  supabase: () => legacyOperation(),
  nest: client => client.createGroup({ body: input }),
});
```

[Seguro] Configuración **solo servidor**, inyectada por entorno:

| Variable | Contrato |
| --- | --- |
| `ASISTEAM_API_ORIGIN` | Origen Nest sin path/query/credenciales; HTTPS o loopback |
| `ASISTEAM_API_TIMEOUT_MS` | Default 5000; entero 1–120000 |
| `ASISTEAM_TRANSPORT_<MODULE>` | `supabase` default o `nest`; otro valor falla cerrado |
| `ASISTEAM_API_SUPABASE_URL` | Al elegir Nest, declaración del proyecto Supabase usado por su backend; debe coincidir con `NEXT_PUBLIC_SUPABASE_URL` normalizada |

[Seguro] Módulos: `GROUPS`, `PROFILE`, `MEMBERS`, `INVITATIONS`, `ACTIVITIES`, `ATTENDANCE`, `REPORTS`, `BILLING`, `ANNOUNCEMENTS`, `QR`. El chequeo de origen impide configurar deliberadamente dos proyectos diferentes en el selector; **no prueba la conexión física de Nest a esa base**. #149 y cada módulo deberán verificar DATABASE_URL/issuer, roles, RLS y datos compartidos con integración real.

[Seguro] Este PR entrega el adaptador/selector reutilizable; las páginas/acciones existentes conservan Supabase y aún no invocan el selector. Activación de grupos/perfil y su integración a UI corresponden a #151 después de #149. No establecer `nest` en producción antes de esos gates. Las demás banderas son puntos de integración; no acreditan SDK/handler completo de esos módulos. Volver a `supabase` selecciona el ejecutor anterior para futuras operaciones sobre la misma base; no duplica una operación fallida ni revierte datos.

[Seguro] Referencias de generación: [openapi-typescript](https://openapi-ts.dev/cli), [zod-to-json-schema](https://github.com/StefanTerdell/zod-to-json-schema). Alcance/evidencia: [MIG-04](../../docs/migration/issue-148/README.md).
