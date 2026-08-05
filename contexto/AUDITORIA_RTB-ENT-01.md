# Auditoría — Submódulo RTB-ENT-01 Gestión de Entidades

Fecha: 2026-08-05. El paquete de origen (`Desarrollo_Subm_dulo_Cliente.zip`,
generado por AbacusAI) trae un documento técnico maestro (DDL + RLS + API + 6
flujos de aprobación), 6 procedimientos operativos en HTML (P01–P06) y 4 mockups
de pantalla. **No trae código.** Los siete documentos del paquete fueron
generados por agentes distintos y nunca se reconciliaron entre sí ni contra este
proyecto — el documento maestro y P01–P06 se contradicen en roles, estados,
umbrales y hasta en quién puede ver una cuenta bancaria. Este documento recoge lo
encontrado y cómo se resolvió al implementar `db/migrations/002_entidades_core.sql`,
`003_ubicaciones_internas.sql` y `004_cuentas_bancarias.sql`.

## Defectos bloqueantes (la spec no arranca tal cual)

### 1. Las políticas RLS del documento maestro no funcionan
Las ~32 políticas usan `auth.role()`, que en Supabase devuelve
`'authenticated'/'anon'/'service_role'`, nunca un rol de negocio como `'ventas'`.
Cualquier política `using (auth.role() in ('ventas', ...))` evalúa `false` siempre
→ nadie leería nada. **Corrección:** todas las políticas nuevas usan
`public.current_user_role()`, que ya existe y está probada desde
`db/migrations/001_auth_profiles.sql`.

### 2. Roles inexistentes
El documento maestro y los 6 procedimientos usan `admin` y `rutas`; el `CHECK` de
`profiles.role` en producción (migración 001) tiene `direccion` y `logistica`.
**Corrección:** `admin` → `direccion` (decisión del dueño del proyecto: dirección
asume las facultades de aprobación/administración que el paquete atribuía a
`admin`), `rutas` → `logistica`.

### 3. RPCs `SECURITY DEFINER` sin `SET search_path`
El documento no lo menciona; sin ese `SET`, cualquier función `SECURITY DEFINER`
es vulnerable a que el llamante inyecte un objeto con el mismo nombre en
`pg_temp` y lo intercepte — el mismo vector que 001_auth_profiles.sql ya cierra
para `is_super_admin()`. **Corrección:** toda función nueva `SECURITY DEFINER`
lleva `SET search_path = public, pg_temp` y `REVOKE EXECUTE FROM PUBLIC, anon`
explícito (ver hallazgo del advisor de Supabase más abajo).

### 4. Sin `REVOKE`/`GRANT` de tabla
El documento sólo describe RLS. Supabase concede `ALL` por defecto a
`anon`/`authenticated` en tablas nuevas de `public` — sin revocar eso primero,
las políticas RLS son la única barrera y un `GRANT` por defecto mal entendido
puede abrir un agujero. **Corrección:** se replica la doble barrera de la
migración 001 (`REVOKE ALL` primero, luego `GRANT` explícito por acción y a
veces por columna) en las tres migraciones nuevas.

## Contradicciones internas del paquete

### 5. Cuentas bancarias: el DDL contradice a P03
El documento maestro le da a `compras` CRUD completo sobre
`proveedor_cuentas_bancarias`. El procedimiento P03 es explícito: *"Solo
finanzas inicia el proceso; solo super_admin aprueba; nadie más puede ver o
modificar cuentas bancarias"*. **Manda P03** — es un control antifraude (el
cambio de CLABE es el fraude B2B más común en México) y es más específico que
el DDL genérico. La tabla queda con RLS restringida a `finanzas`/`super_admin`;
`direccion` sólo ve un resumen con la CLABE enmascarada vía
`public.proveedor_cuentas_resumen()`.

### 6. `ubicaciones_internas` sin jerarquía
El DDL original no tiene `parent_id` ni `nivel`, pese a que P04 exige una
jerarquía de 5 niveles con código autogenerado por herencia de prefijo.
**Corrección:** árbol auto-referencial (`003_ubicaciones_internas.sql`).

### 7. `ubicaciones_internas.entidad_id` apuntaba a clientes/proveedores
El "Nivel 1 · Entidad / Centro operativo" de P04 es un centro operativo de RTB
(almacén matriz, sucursal), no un cliente o proveedor externo. **Corrección:**
sin esa FK; el nivel 1 es simplemente un nodo raíz del propio árbol
(`parent_id is null`).

### 8. Jerarquía de 5 niveles (P04) vs. 4 del mockup
P04 define `Entidad → Zona → Pasillo → Rack → Nivel/Posición` con ejemplos como
`ENT-02-Z03-P05-R12-N04`. El mockup `ubicaciones.html` implementa 4 niveles sin
pasillo (`Almacén → Zona → Rack → Nivel`) con códigos como `ALM-A-R01-N2`.
**Corrección:** profundidad flexible 1–5. `nivel` es la profundidad real del
árbol; `tipo` (`centro_operativo|zona|pasillo|rack|posicion`) sólo exige ser
estrictamente "más profundo" que el del padre en la taxonomía de P04, sin
forzar que todos los niveles intermedios existan — así un rack puede colgar
directo de una zona, como hace el mockup, sin permitir un pasillo colgando de
un rack (retroceso ilegal). Verificado end-to-end: ver §Verificación.

### 9. Dos taxonomías bajo el mismo campo "tipo"
P04 define tipos física/lógica/especial (cuarentena, devoluciones, etc.); el
mockup usa `Tipo = "Nivel de Rack"`, que en realidad es un nivel jerárquico, no
una clasificación. **Corrección:** se separan en tres columnas: `nivel`
(profundidad), `tipo` (posición en la taxonomía jerárquica) y `clasificacion`
(`fisica|logica|especial`, con `uso_especial` opcional para cuarentena,
devoluciones, material dañado, recepción, embarque o picking — cubre también el
cross-dock que necesita el módulo de Almacén).

### 10. Estados incompatibles entre documentos
P01 usa 3 estados (`Borrador → Pendiente Aprobación → Activo`); P02 usa 4
(agrega `Validación`); el dashboard del mockup muestra 4 badges (Activo,
Bloqueado, Inactivo, Pendiente); P05 usa `PENDIENTE_MODIFICACIÓN` y
`BLOQUEADO_TEMP`; el DDL define un `registro_estado` de 6 valores repetido en
`entidades`, `clientes` y `proveedores` por separado. **Corrección:** un único
enum `entidad_estado` (`borrador|activo|bloqueado_temporal|bloqueado_permanente|
inactivo`) que vive **sólo** en `entidades` — ver hallazgo 16. "Pendiente" no es
un estado: se deriva de una fila abierta en `solicitudes_cambio`.

### 11. Umbral de aprobación de crédito
P05 dice "> $100,000"; el mockup de `alta-cliente.html` dice "> $50,000".
**Corrección:** manda P05 (documento normativo), centralizado en
`UMBRAL_APROBACION_CREDITO` (`app/lib/entidades/config.ts`).

### 12. `audit_log` no existía
P03 y P05 lo citan por nombre ("Todo cambio genera una entrada inmutable en la
tabla `audit_log`") y "el historial no se borra, se controla" es regla de
negocio no negociable — pero la tabla no estaba en el DDL. **Corrección:** se
crea, append-only (sin `GRANT UPDATE`/`DELETE` para `authenticated` bajo
ninguna circunstancia), alimentada por un trigger genérico (`audit_row()`,
diffs de fila) y por escritura explícita desde las rutas de API para eventos de
negocio que necesitan IP/motivo (bloqueo, aprobación) — un trigger de Postgres
no tiene acceso a la IP de la petición HTTP.

## Errores de modelo

### 13. `rfc unique` rompía los RFC genéricos
`XAXX010101000` (público en general) y `XEXX010101000` (extranjero) se repiten
legítimamente en cualquier padrón mexicano; un `UNIQUE` simple habría impedido
dar de alta el segundo cliente de mostrador. **Corrección:** índice único
parcial que los excluye.

### 14. Doble fuente de verdad del estado
El DDL original le daba `estado`/`bloqueado`/`bloqueado_motivo` tanto a
`entidades` como, por separado, a `clientes` y a `proveedores`. Nada impedía un
`cliente` en estado `aprobado` colgando de una `entidad` `bloqueada`.
**Corrección:** el estado y el bloqueo viven únicamente en `entidades`;
`clientes`/`proveedores` son extensiones 1:1 sin estado propio.

### 15. `direcciones.estado` invertido
En el DDL original, `estado` era el estado *geográfico* (p.ej. "Jalisco") y
`estado_registro` el del flujo de aprobación — al revés de cómo se nombran las
otras 7 tablas. **Corrección:** `entidad_federativa` para lo geográfico;
contactos y direcciones ni siquiera llevan estado de flujo, porque P05 las
clasifica como "modificación libre" (sin aprobación).

### 16. `created_by`/`updated_by` sin `DEFAULT` ni `FK`
Si el valor lo pone el cliente, cualquiera puede mentir sobre quién hizo el
cambio. **Corrección:** `DEFAULT auth.uid()`, `REFERENCES profiles(id)`, y sin
`GRANT UPDATE` sobre esas columnas para `authenticated`.

### 17. `updated_at` sin trigger real
El DDL original decía "aplicar a las 8 tablas" en un comentario, sin hacerlo, y
además redefinía una función (`set_updated_at()`) que ya existe con otro nombre
(`public.handle_updated_at()`, de la migración 001). **Corrección:** se
reutiliza el patrón existente; las tablas con `updated_by` usan una variante
propia (`set_updated_meta()`) porque `profiles` no tiene esa columna y no se
podía extender la función original sin romperla.

### 18. CLABE sin dígito verificador
P03 especifica el algoritmo completo (pesos `[3,7,1]` cíclicos, módulo 10); el
DDL sólo comprobaba "18 dígitos". **Corrección:** `public.clabe_valida()` en
SQL (usada en un `CHECK`) con espejo exacto en TypeScript
(`app/lib/entidades/validaciones.ts`) para validar en captura sin round-trip.
Verificado con una CLABE válida y su dígito verificador alterado — ver
§Verificación.

### 19. `entidades.clave` sin generador
La regla 12 del documento maestro exige "nomenclatura RTB" en claves y códigos,
pero no había ningún mecanismo. **Corrección:** secuencia + trigger,
`ENT-000123`. La clave es inmutable tras el alta (un cliente que se vuelve
`mixta` no cambia de folio).

### 20. `GRANT DELETE` en las políticas del documento
El DDL crea políticas `for delete` para varias tablas pese a que la regla de
negocio 4 dice "no borrado físico operativo". **Corrección:** ninguna tabla de
este submódulo tiene `GRANT DELETE` para `authenticated`; los "borrados" son
siempre `activo = false` o un cambio de `estado`.

### 21. Redundancias menores
`check (estado in (...))` duplicando el propio `CREATE TYPE ... AS ENUM`, y
`create extension "uuid-ossp"` innecesaria (`gen_random_uuid()` es núcleo desde
PostgreSQL 13, y el proyecto corre en PostgreSQL 17). Se limpiaron.

## Huecos frente a los módulos que van a consumir esto

Ni Ventas (`contexto/RTB-PRO-VEN-01_Modulo_Ventas.md`) ni Compras
(`contexto/RTB-PRO-COM-01_Modulo_Compras.md`) están escritos contra un esquema
relacional — describen bases estilo Notion con campos de texto libre. Aun así,
señalan atributos que ENT-01 no contemplaba:

- **`condicion_pago` del proveedor** (crédito abierto / contado / anticipo
  requerido) — Compras clasifica así a sus proveedores; se añadió a
  `proveedores`.
- **`vendedor_id` y `canal_origen` del cliente** — Ventas asume un vendedor
  titular y un "portal de origen" (Ariba/Correo/WhatsApp/Teléfono/Mostrador);
  se añadieron a `clientes`.
- **"Área Responsable" y "Crédito Disponible"** del mockup no tienen fuente en
  ninguna spec — "Área Responsable" se **deriva** de `tipo` en la UI
  (cliente→Ventas, proveedor→Compras, mixta→ambas), no es columna. "Crédito
  Disponible" no se implementó: depende de saldo/pedidos, que sólo existirán
  cuando se construya Ventas.

## Hallazgo del advisor de Supabase durante la implementación

`get_advisors` marcó **ERROR** (no sólo WARN) la primera versión de
`usuarios_directorio` como vista `SECURITY DEFINER` — Supabase trata las vistas
definer como una superficie de riesgo mayor que las funciones equivalentes.
**Corrección:** se implementó como función (`public.usuarios_directorio()`),
mismo patrón `SECURITY DEFINER STABLE SET search_path` que
`is_super_admin()`/`is_active_user()` de la migración 001, que sólo generan
WARN (ya aceptado). Se aplicó el mismo criterio a
`public.proveedor_cuentas_resumen()`. Dos funciones de trigger
(`entidades_before_insert()`, `sync_entidad_tipo()`) quedaron por descuido
expuestas como RPC público (`EXECUTE` a `PUBLIC` es el valor por defecto de
`CREATE FUNCTION`) — se revocó, replicando lo que 001_auth_profiles.sql ya hace
para sus 3 helpers.

## Bugs encontrados verificando la UI real (no por lectura de código)

Estos dos no aparecieron en la auditoría del paquete original ni en las
pruebas de RLS por SQL directo (que corren como `postgres` y no los habrían
detectado) — sólo al probar la pestaña **Auditoría** con una sesión real de
`super_admin` en el navegador:

### 22. `audit_log` sin `GRANT SELECT` para `authenticated`
`002_entidades_core.sql` escribió la política RLS `audit_log_select`
(`super_admin`/`direccion` pueden leer) pero nunca el `GRANT SELECT`
subyacente sobre la tabla — sólo `GRANT ALL` a `service_role`. El privilegio
de tabla se comprueba **antes** que RLS: sin el `GRANT`, cualquier lectura
desde `authenticated` fallaba con `42501 permission denied`, sin importar el
rol. La pestaña de Auditoría mostraba "Sin movimientos registrados" en vez de
fallar visiblemente, porque el error de PostgREST se pierde en el `.then()`
del cliente. **Corrección:** `008_audit_log_grant_select.sql`. Reverificado
con un usuario `compras` de prueba: el `GRANT` no abrió una brecha —
`compras` sigue viendo 0 filas, RLS sigue siendo la barrera real.

### 23. `audit_log.usuario_id` sin `ON DELETE SET NULL`
Al limpiar los usuarios de prueba de la verificación de RLS, borrar
`auth.users` falló: la cascada hasta `profiles` chocó con la FK de
`audit_log.usuario_id`, que no tenía ninguna acción de borrado definida. Como
`audit_log` es append-only y existe justamente para sobrevivir a lo que
describe, bloquear el borrado de un perfil por su propio historial de
auditoría es el comportamiento equivocado. **Corrección:**
`007_audit_log_on_delete_set_null.sql`. Deliberadamente **no** se aplicó el
mismo cambio a `created_by`/`updated_by`/`responsable_id`/`vendedor_id`/
`aprobada_por` de las demás tablas: ésas sí deben seguir bloqueando el
borrado de un perfil con historial operativo real — la misma decisión que ya
documenta `contexto/AUDITORIA_MODULO_AUTH.md` §Pendiente.

## Fuera de alcance de esta entrega (reportado, no corregido)

- **P01, P02, P04 y P06 están fuera de la identidad visual RTB.** Usan paleta
  roja/ámbar sobre fondo oscuro y tipografías Poppins/Montserrat — P01 llega a
  afirmar que *"la identidad visual RTB se expresa con rojo corporativo"*, lo
  cual es falso (el primario de RTB es teal `#159895`; el rojo sólo existe como
  color de error). Sólo P03 y P05 respetan la paleta/tipografía reales. Los 4
  mockups de pantalla (`RTB-ENT-01-mockup/screens/*.html`) sí la respetan y
  fueron la base visual de esta implementación.
- **`proveedores_productos`** — fuera de alcance por decisión: es un catálogo
  de precios que pertenece al módulo de Compras y aún no existe un maestro de
  productos al que referenciar.
- **Notificaciones automáticas** (P05 §VII) — no hay infraestructura de
  email/notificaciones todavía; los eventos quedan en `audit_log`, listos para
  engancharlas cuando exista.
- **Selección de vendedor en el alta** — `clientes.vendedor_id` existe en el
  modelo pero el formulario de alta no lo expone todavía (no hay una fuente de
  "vendedores" filtrable en la UI); se puede asignar después vía `PATCH`.

## Verificación aplicada

Contra Supabase real (`dgafffpbhktxadiqmmwl`), no sólo lectura del código:

- Alta de entidad → `clave` se genera `ENT-000001`, `ENT-000002`... y el RFC se
  normaliza a mayúsculas.
- Insertar un `clientes` y luego un `proveedores` sobre la misma entidad → 
  `entidades.tipo` pasa a `'mixta'` automáticamente (trigger `sync_entidad_tipo`).
- Árbol de ubicaciones `ALM-PRINCIPAL → ALM-A → R01 → N2` → `codigo` sale
  `ALM-PRINCIPAL-ALM-A-R01-N2`, `nivel` se calcula solo (`4`). Un segmento
  duplicado entre hermanos se rechaza (`unique_violation`); un pasillo colgando
  de un rack se rechaza (retroceso de taxonomía).
- `public.clabe_valida()` acepta una CLABE con dígito verificador correcto y
  rechaza la misma CLABE con el dígito alterado.
- `get_advisors` (security + performance) sin hallazgos `ERROR`; los `WARN`
  restantes son de la misma clase ya aceptada en la migración 001, más dos
  preexistentes del proyecto (`pg_trgm` en `public`, protección de contraseñas
  filtradas desactivada) ajenos a este submódulo.
- `docker build --target builder` (el stage que corre `next build`, con
  `typescript.ignoreBuildErrors: false`) completa sin errores con las 20 rutas
  de API y las 4 páginas nuevas.
- **Clic a clic en la app real** (`docker compose up`, sesión de
  `super_admin`, sin tocar la cuenta real del dueño del proyecto — se creó y
  luego se borró una cuenta de prueba): `/dashboard/entidades` renderiza KPIs
  en 0 y tabla vacía; alta de una entidad cliente vía
  `/dashboard/entidades/nueva` con RFC genérico `XAXX010101000` → detalle
  correcto (`ENT-000005`, badges, tabs condicionales sin "Cuenta bancaria" por
  no ser proveedor); bloqueo temporal desde el detalle → badge cambia a
  "Bloqueado (temporal)", aparece "Desbloquear"; `/dashboard/ubicaciones` →
  alta de `QA-ALM` (centro operativo) y `Z01` debajo → código
  `QA-ALM-Z01`, breadcrumb correcto. Esta pasada encontró los hallazgos 22 y
  23 — la pestaña de Auditoría fallaba en silencio pese a que toda la
  verificación por SQL directo había pasado, porque SQL directo corre como
  `postgres` y no pasa por el `GRANT` que le faltaba a `authenticated`.
  Reverificado tras el fix. Todos los datos de prueba se limpiaron al
  terminar (`entidades`/`ubicaciones_internas`/`profiles`/`auth.users` con
  prefijo `QA` en cero).
