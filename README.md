# SIG Vial Chaco

**Sistema de Información Geográfica para Gestión de Infraestructura Vial Rural — Provincia del Chaco, Argentina**

Sistema completo de relevamiento y gestión de infraestructura vial rural compuesto por una **aplicación móvil Android** para trabajo de campo y un **panel de administración web** para supervisión y análisis. Permite registrar, sincronizar y visualizar información geoespacial sobre puentes, alcantarillas, tubos, ripio y otras obras viales sobre un mapa SIG con capas GeoJSON de elaboración propia.

---

## Sistema

| Componente | Descripción |
|---|---|
| **App móvil** | Relevamiento en campo — funciona offline, sincroniza al conectarse |
| **Panel admin web** | Visualización, análisis y gestión de usuarios y relevamientos |
| **Backend (Supabase)** | Autenticación, base de datos PostgreSQL y almacenamiento de fotos |

---

## App Móvil

### Características

- **Mapa SIG offline** basado en OpenStreetMap + Leaflet.js (sin API key, funciona sin internet)
- **103 consorcios viales** con geometrías GeoJSON propias organizados en 5 zonas (ZI–ZV)
- **Capas de red vial**:
  - Rutas Nacionales (RN 11, 16, 89, 95)
  - Rutas Provinciales — pavimentada, mejorada, en obra y de tierra
  - Red CC — vías bajo convenio de cada consorcio, con filtro individual por consorcio
- **GPS en tiempo real** con punto animado y posicionamiento continuo
- **Brújula** por magnetómetro con compensación portrait/landscape
- **Sistema de relevamientos** con formularios especializados por tipo de obra:
  - **Puente** — palizadas, vanos, altura, estructura, guiarruedas, barandas
  - **Alcantarilla** — dimensiones, materiales, tablero, losa de fondo, situación hidráulica, estado estructural
  - **Tubos** — diámetro, cabezales, tapada, cantidad
  - **Ripio** (linestring) con dos modos de captura:
    - **Dibujar en mapa** — trazado interactivo sobre OSM
    - **GPS Track** — grabación automática del recorrido cada 10 m
    - Cálculo automático de toneladas (2,1 t/m³), empresa y fecha
  - **Otro** — descripción libre
- **Auto-detección** del consorcio más cercano por distancia euclidiana
- **Fotografías** adjuntas desde cámara del dispositivo, subidas a Supabase Storage
- **Sincronización** con Supabase — fotos a Storage, datos a PostgreSQL
- **Persistencia local** — relevamientos guardados en el dispositivo mientras no hay conexión
- **Autenticación** por email/contraseña con roles (técnico, usuario, admin)

### Stack

| | |
|---|---|
| Framework | React Native + Expo SDK 54 |
| Lenguaje | TypeScript (strict mode) |
| Navegación | expo-router v6 |
| Mapa | Leaflet.js 1.9 via WebView |
| GPS | expo-location |
| Brújula | expo-sensors (Magnetometer) |
| Almacenamiento local | expo-file-system/legacy |
| Cámara | expo-image-picker |
| Auth + DB + Storage | Supabase |
| Build | EAS Build (APK/AAB) |

---

## Panel de Administración Web

### Características

- **Dashboard** con mapa interactivo Leaflet y panel de capas:
  - Límite provincial, zonas y departamentos
  - RN Nacional (RN 11, 16, 89, 95)
  - RP Pavimentada, Mejorada, En Obra, Tierra
  - Red CC por zona con filtrado individual por consorcio
  - Puntos de interés: sedes, campamentos, salud
  - Sub-capas de relevamientos por tipo (Puente, Alcantarilla, Tubos, Ripio, Otro)
- **Listado de relevamientos** con filtros por tipo, tipo de usuario, zona y fechas
- **Detalle de relevamiento** — datos completos, mapa individual, fotos con descarga
- **Edición de relevamientos** desde la web
- **Gestión de usuarios** — crear técnicos, usuarios y administradores con o sin zona asignada
- **Exportación GeoJSON** por relevamiento

### Stack

| | |
|---|---|
| Framework | Next.js 14 (App Router) |
| Lenguaje | TypeScript |
| Mapa | Leaflet.js via React (SSR desactivado) |
| Auth + DB | Supabase (service role para admin) |
| Deploy | Vercel |

---

## Backend (Supabase)

### Tablas

| Tabla | Descripción |
|---|---|
| `profiles` | Usuarios: nombre, zona, rol (`tecnico` / `usuario` / `admin`) |
| `relevamientos` | Datos geoespaciales con coords, fotos y datos específicos en JSONB |

### Storage

| Bucket | Descripción |
|---|---|
| `relevamiento-fotos` | Fotos subidas desde la app (lectura pública, escritura autenticada) |

---

## Estructura del proyecto

```
sig-vial-chaco/
├── app/
│   ├── (tabs)/
│   │   ├── index.tsx          # Dashboard / Inicio
│   │   ├── mapa.tsx           # Mapa SIG + relevamientos
│   │   ├── consorcios.tsx     # Lista de consorcios
│   │   └── reportes.tsx       # Lista de relevamientos locales
│   ├── login.tsx              # Pantalla de login
│   ├── red-vial.tsx           # Red vial por zona
│   ├── distribucion.tsx       # Distribución territorial
│   └── autoridades.tsx        # Autoridades de consorcios
├── components/
│   └── RelevamientoModal.tsx  # Formulario de relevamiento
├── hooks/
│   ├── useRelevamientos.ts    # Persistencia local
│   └── useSupabaseSync.ts     # Sincronización + upload de fotos
├── lib/
│   └── supabase.ts            # Cliente Supabase
├── types/
│   └── relevamiento.ts        # Tipos e interfaces
├── constants/
│   ├── Colors.ts              # Paleta (#2C2C2C / #F5C300)
│   ├── realData.ts            # Datos de 103 consorcios
│   ├── geoBundle.ts           # GeoJSON offline: límites, sedes, campamentos
│   ├── geoBundleCC.ts         # GeoJSON red CC por consorcio/zona
│   └── geoBundleRP.ts         # GeoJSON rutas provinciales
├── context/
│   ├── AuthContext.tsx        # Sesión Supabase
│   └── ThemeContext.tsx       # Tema claro/oscuro
├── scripts/
│   ├── build_geo_bundle.py    # Genera geoBundle.ts desde QGIS
│   └── build_geo_bundle_cc.py # Genera geoBundleCC.ts desde QGIS
├── assets/
│   └── geojson/               # Capas GeoJSON originales (QGIS)
│       ├── Limites/
│       ├── Rutas Nacionales/
│       ├── Rutas Provinciales/
│       ├── Red bajo convenio Consorcios Camineros/
│       └── Puntos de Interes/
└── admin/                     # Panel de administración (Next.js)
    ├── src/
    │   ├── app/
    │   │   ├── dashboard/
    │   │   │   ├── page.tsx              # Dashboard con mapa
    │   │   │   ├── relevamientos/        # Lista y detalle
    │   │   │   ├── tecnicos/             # Gestión de usuarios
    │   │   │   └── consorcios/           # Gestión de consorcios
    │   │   └── api/                      # API Routes
    │   └── components/
    │       ├── MapInner.tsx              # Mapa Leaflet interactivo
    │       ├── RelevamientoEditForm.tsx  # Edición de relevamientos
    │       └── RelevamientoActions.tsx   # Exportar / eliminar
    └── public/
        └── geo/                          # GeoJSON para el mapa web
            ├── geo_bundle.json
            ├── geo_rp.json
            ├── geo_cc.json
            └── geo_rn.json
```

---

## Instalación y ejecución

### App móvil

```bash
git clone https://github.com/rikochet87/sig-vial-chaco.git
cd sig-vial-chaco
npm install

# Variables de entorno
# EXPO_PUBLIC_SUPABASE_URL=...
# EXPO_PUBLIC_SUPABASE_ANON_KEY=...

npm start
```

#### Build APK

```bash
eas build --platform android --profile preview --non-interactive   # APK
eas build --platform android --profile production --non-interactive # AAB
```

### Panel admin

```bash
cd admin
npm install

# Variables de entorno
# NEXT_PUBLIC_SUPABASE_URL=...
# NEXT_PUBLIC_SUPABASE_ANON_KEY=...
# SUPABASE_SERVICE_ROLE_KEY=...

npm run dev
```

---

## Notas de desarrollo

- **Git**: nunca hacer `git commit` desde el sandbox Linux (WSL/virtiofs). Usar siempre Windows PowerShell.
- **EAS Build**: lee el código desde GitHub — TypeScript errors del entorno local no afectan el build.
- **GeoJSON bundles**: regenerar con los scripts Python al actualizar capas en QGIS.
- **`kotlinVersion`**: debe ser `2.1.20` (compatibilidad react-native-async-storage + KSP).

---

## Roadmap

- [x] Autenticación con roles (técnico / usuario / admin)
- [x] Sincronización con Supabase (datos + fotos)
- [x] Panel web de administración con mapa interactivo
- [x] Sub-capas de relevamientos en el mapa
- [x] Rutas Nacionales y Provinciales en el mapa
- [ ] Exportación a PDF de informes de relevamiento
- [ ] Modo offline total con caché de tiles OSM
- [ ] Dashboard de estadísticas (km relevados, tipos, zonas)

---

## Licencia y autoría

**© 2026 Matias Rosello. Todos los derechos reservados.**

Licenciado bajo [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/deed.es).

- ✅ Podés ver y compartir el código con atribución al autor.
- ❌ **No está permitido el uso comercial** sin autorización expresa.
- ❌ No está permitida la distribución de versiones modificadas.

Contacto para licencias: **rosellomatias87@gmail.com**

El incumplimiento puede dar lugar a acciones legales bajo la **Ley 11.723 de Propiedad Intelectual** (Argentina) y tratados internacionales aplicables.
