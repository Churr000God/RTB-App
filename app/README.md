# RTB Sistema — Refacciones Tomás Badillo

Sistema interno de gestión (ERP) para Refacciones Tomás Badillo, S.A. de C.V.

## Requisitos previos

- Node.js 20+
- Docker y Docker Compose (opcional)
- Cuenta de Supabase con un proyecto creado

## Configuración inicial

### 1. Variables de entorno

```bash
cp nextjs_space/.env.example nextjs_space/.env
```

Edita `nextjs_space/.env` con las credenciales de tu proyecto Supabase:
- `NEXT_PUBLIC_SUPABASE_URL` — URL del proyecto (Settings > API)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Clave anónima (Settings > API)
- `SUPABASE_SERVICE_ROLE_KEY` — Clave de servicio (Settings > API)

### 2. Base de datos

1. Abre el **SQL Editor** en tu dashboard de Supabase
2. Pega y ejecuta el contenido de `supabase-migration.sql`
3. Ve a **Authentication > Users > Add User** para crear el primer super_admin
4. Copia el UUID del usuario y ejecuta el INSERT del seed que aparece al final del script SQL

### 3. Arrancar con Docker

```bash
docker-compose up
```

El sistema estará disponible en `http://localhost:3000`

### 3b. Arrancar sin Docker

```bash
cd nextjs_space
yarn install
yarn dev
```

## Módulos

| Módulo | Estado |
|--------|--------|
| Autenticación y Permisos | ✅ Funcional |
| Ventas | 🛠️ Próximamente |
| Compras | 🛠️ Próximamente |
| Almacén | 🛠️ Próximamente |
| Rutas | 🛠️ Próximamente |
| Facturación | 🛠️ Próximamente |
| Finanzas | 🛠️ Próximamente |

## Roles del sistema

| Rol | Descripción |
|-----|-------------|
| `super_admin` | Administrador IT — gestión total |
| `direccion` | Dirección general — lectura total |
| `ventas` | Asesor de ventas |
| `compras` | Gestor de compras |
| `almacen` | Personal de almacén |
| `logistica` | Motorista/repartidor |
| `facturacion` | Facturación |
| `finanzas` | Administración financiera |
| `gerente_comercial` | Dirección, sólo dentro de Ventas (037) |
| `cobranza` | Sólo lectura de Ventas — precursor de RTB-PRO-FAC-01 (037) |

## Estructura del proyecto

```
rtb-system/
├── docker-compose.yml
├── Dockerfile
├── supabase-migration.sql
└── nextjs_space/
    ├── app/
    │   ├── login/          # Pantalla de login
    │   ├── dashboard/      # Shell del sistema
    │   │   ├── admin/users/  # Gestión de usuarios
    │   │   └── perfil/     # Perfil propio
    │   └── api/admin/      # API de administración
    ├── components/
    │   ├── auth/           # LoginForm
    │   ├── layout/         # Sidebar, Header, Shell
    │   └── ui/             # Componentes base
    ├── lib/
    │   ├── supabase/       # Clientes Supabase
    │   └── rbac/           # Configuración de roles
    └── types/              # Tipos TypeScript
```

---

*Refacciones Tomás Badillo, S.A. de C.V. — Proyecto de reestructuración*
