# SIG Vial Chaco

**Sistema de Información Geográfica para Gestión de Infraestructura Vial Rural — Provincia del Chaco, Argentina**

Sistema de relevamiento y gestión de infraestructura vial rural compuesto por una **aplicación móvil Android** para trabajo de campo y un **panel web** para la oficina: proyectistas y administración. Permite registrar, sincronizar y visualizar información geoespacial sobre puentes, alcantarillas, tubos, ripio y otras obras viales sobre un mapa SIG con capas GeoJSON de elaboración propia, calcular y presupuestar obras, y seguir el impacto de la lluvia y del río sobre la red vial.

---

## Sistema

| Componente | Ubicación | Quién la usa | Descripción |
|---|---|---|---|
| **App móvil** | raíz del repo | Técnicos en campo | Relevamiento en campo; funciona sin señal y sincroniza al conectarse |
| **Panel web** | `admin/` | Oficina | Mapa, relevamientos, obras y calculadoras, hidrología y gestión de usuarios |
| **Backend** | Supabase | — | Autenticación, PostgreSQL y almacenamiento de fotos |

Las dos aplicaciones trabajan contra la misma base Supabase.

---

## App móvil

### Características

- **Mapa SIG** con Leaflet dentro de una WebView. Leaflet va incluido en la app, así que el mapa abre sin señal; los tiles de OpenStreetMap necesitan conexión, y sin ella las capas GeoJSON se dibujan igual sobre fondo gris
- **103 consorcios camineros** con geometrías GeoJSON propias, organizados en 5 zonas (ZI–ZV)
- **Capas de red vial**:
  - Rutas Nacionales (RN 11, 16, 89, 95)
  - Rutas Provinciales: pavimentada, mejorada, en obra y de tierra
  - Red CC: caminos bajo convenio de cada consorcio, con filtro individual por consorcio
- **GPS en tiempo real** y **brújula** por magnetómetro
- **Relevamientos** con formularios especializados por tipo de obra:
  - **Puente**: vanos, palcos, altura, estructura, barandas
  - **Alcantarilla**: dimensiones, materiales, tablero, drenaje, estado estructural
  - **Tubos**: diámetro, cabezales, profundidad, cantidad
  - **Ripio** (línea), con dos modos de captura:
    - **Dibujar en mapa**
    - **GPS Track**: graba el recorrido en segundo plano, aun con la pantalla apagada
    - Ancho, espesor y longitud; **densidad editable por tramo**
  - **Otro**: descripción libre
- **Auto-detección** del consorcio más cercano
- **Fotos** desde la cámara o la galería, hasta 10 por relevamiento, que se resguardan en el teléfono hasta subirse a Supabase Storage
- **Trabajo sin señal**: los relevamientos se guardan en el dispositivo y se sincronizan solos al recuperar conexión. Un indicador muestra el estado de red y cuántos faltan subir
- **Arranque sin conexión**: con sesión previa, la app entra de inmediato y valida la sesión en segundo plano
- **Obras asignadas** al técnico
- **Autenticación** por email y contraseña, con roles

### Stack

| | |
|---|---|
| Framework | React Native 0.85 + Expo SDK 56 |
| Lenguaje | TypeScript (strict) |
| Navegación | expo-router v6 |
| Mapa | Leaflet 1.9.4 en `react-native-webview` |
| GPS | expo-location + expo-task-manager (segundo plano) |
| Brújula | expo-sensors (magnetómetro) |
| Almacenamiento local | expo-file-system/legacy |
| Cámara y galería | expo-image-picker |
| Auth + DB + Storage | Supabase |
| Build | EAS Build (APK / AAB) |

---

## Panel web

### Secciones

- **Dashboard**: mapa interactivo con panel de capas (límites, zonas y departamentos, rutas nacionales y provinciales, red CC por consorcio, sedes, campamentos y relevamientos por tipo), resumen del tiempo e **imágenes satelitales históricas** del lugar que se está mirando (Esri Wayback)
- **Consorcios**: ficha y edición de cada consorcio
- **Relevamientos**:
  - Lista con filtros, ficha con mapa y fotos, edición y exportación GeoJSON
  - **Revisión de campo**
  - **Nuevo de gabinete**: carga de un relevamiento desde la computadora, dibujando sobre imagen satelital
- **Obras**: lista de obras y **calculadoras**:
  - **Terraplén**
  - **Excavación**: lineal, canal (con caudal por Manning) y área
  - **Ripio**: cómputo sobre el mapa → análisis de precios → presupuesto → composición en A4
  - **Limpieza vial**: desmalezado y desbosque
- **Hidrología**:
  - Lluvia por consorcio y por cuenca, con media areal, isohietas y la lluvia bajada a cada camino
  - Cuencas hídricas y cursos de agua
  - Río Paraná con datos del INA: alturas, recurrencia y traslado de la crecida
  - **Gran Resistencia**: áreas inundables según la altura del río
  - **Tiempo**: alertas del SMN y pronóstico de 7 días por consorcio
  - Lluvia histórica por cuenca desde 1981 (CHIRPS)
- **Herramientas**: medición sobre el mapa
- **Usuarios**: alta y gestión de técnicos y usuarios de oficina, con permisos por sección

El panel incluye un control de tamaño de texto (A / A+ / A++) para usuarios con visión reducida.

### Stack

| | |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 |
| Lenguaje | TypeScript |
| Mapa | Leaflet 1.9.4 / react-leaflet |
| Exportación | jsPDF + jspdf-autotable, html2canvas |
| Auth + DB | Supabase (`service_role` en las rutas de API, con autorización propia por permiso) |
| Deploy | Vercel, con cron diario para la ingesta de lluvia |

### Hidrología: cómo funciona

**Para qué.** La sección muestra cómo impacta la lluvia sobre la red vial para decidir en base a eso; quien mira decide, la herramienta muestra el dato y de dónde salió. Por eso **no calcula índices de estado ni de transitabilidad**: no existe ninguna observación registrada de cómo quedó un camino después de una lluvia, y sin eso cualquier índice sería una hipótesis presentada como resultado. El 98 % de la red de consorcios es de tierra, y los caminos se cortan por un evento, no por el acumulado de la temporada: por eso se mide la **lámina máxima diaria**, día por día.

**De dónde sale cada número.** Las fuentes no significan lo mismo y se muestran separadas:

| Fuente | Qué es | Qué aporta |
|---|---|---|
| **APA** (Administración Provincial del Agua) | pluviómetros, medición real | lluvia observada en ~70 estaciones, sólo las que informaron ese día; nunca se completan ceros |
| **Open-Meteo** | modelo | lluvia estimada en toda la provincia y pronóstico de 7 días por consorcio |
| **SMN** | aviso oficial | alertas meteorológicas vigentes |
| **INA** (Instituto Nacional del Agua) | medición y pronóstico | altura del río Paraná y de los ríos internos |
| **CHIRPS** | satélite + estaciones | lluvia histórica por cuenca desde 1981 |

**Cómo se calcula.** La lluvia entre pluviómetros se interpola por **IDW** (inverso de la distancia al cuadrado, radio de 60 km) y se baja a la red vial **cada 2 km**, así cada tramo tiene su propio valor y una tormenta que moja sólo una punta del consorcio no se pierde en el promedio. La media por consorcio y por cuenca es **precipitación media areal por polígonos de Thiessen**, el método de manual. El río Paraná se trata como una amenaza aparte: la crecida viene de lluvias a miles de kilómetros, con días o semanas de retardo.

**Detalle completo:**
- [`docs/metodologia-lluvia.md`](docs/metodologia-lluvia.md): fuentes, métodos, validación y alternativas descartadas. Es el documento para un tercero o un expediente.
- [`docs/inundaciones-gran-resistencia.md`](docs/inundaciones-gran-resistencia.md): investigación de las áreas inundables del Gran Resistencia con imágenes Landsat y Sentinel-2.

---

## Backend (Supabase)

### Tablas principales

| Tabla | Descripción |
|---|---|
| `profiles` | Usuarios: nombre, zona, rol y permisos |
| `relevamientos` | Relevamientos con coordenadas, fotos y datos específicos en JSONB |
| `obras`, `obra_destinatarios` | Obras y a quién se asignan |
| `consorcios` | Datos de los 103 consorcios |
| `proyectos_ripio`, `ripios` | Proyectos de ripio con su análisis de precios |
| `equipos`, `precios_base` | Equipos y plantillas de precios |
| `precipitaciones`, `mediciones_lluvia`, `pronostico_lluvia` | Lluvia medida y pronosticada |

**Roles:** `admin` (acceso total), `panel` (oficina, según permisos), `tecnico` y `usuario` (app móvil).

### Storage

| Bucket | Descripción |
|---|---|
| `relevamiento-fotos` | Fotos de los relevamientos, de la app y del panel |

No hay migraciones versionadas: el SQL se aplica en el editor de Supabase y los scripts quedan como referencia en `docs/sql/`.

---

## Estructura del proyecto

```
sig-vial-chaco/
├── app/                       # Pantallas de la app (expo-router)
│   ├── (tabs)/                # Inicio, Mapa, Consorcios, Obras, Reportes
│   ├── consorcio/[id].tsx
│   ├── reporte/[id].tsx
│   ├── login.tsx, red-vial.tsx, distribucion.tsx, autoridades.tsx
├── components/                # RelevamientoModal, ConexionBadge
├── hooks/                     # Persistencia local, sincronización, auto-sync
├── lib/                       # GPS en segundo plano, fotos, sincronización, Supabase
├── constants/                 # Colores, datos de consorcios y GeoJSON incluidos en la app
├── context/                   # Sesión y tema
├── scripts/                   # Generación de los GeoJSON desde QGIS
├── assets/geojson/            # Capas originales de QGIS
├── docs/                      # Metodología, investigaciones y SQL
└── admin/                     # Panel web (Next.js)
    ├── src/app/dashboard/     # Secciones del panel
    ├── src/app/api/           # Rutas de API
    ├── src/components/        # Mapas, calculadoras, hidrología
    ├── src/lib/               # Motores de cálculo y permisos
    ├── scripts/               # Generación de datos y verificaciones
    └── public/geo/            # GeoJSON del mapa web
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

Para agregar paquetes usar siempre `npx expo install <paquete>`, que elige la versión compatible con el SDK.

#### Build

```bash
eas build --platform android --profile preview --non-interactive    # APK
eas build --platform android --profile production --non-interactive # AAB
```

### Panel web

```bash
cd admin
npm install

# Variables de entorno
# NEXT_PUBLIC_SUPABASE_URL=...
# NEXT_PUBLIC_SUPABASE_ANON_KEY=...
# SUPABASE_SERVICE_ROLE_KEY=...
# CRON_SECRET=...              # protege la ingesta diaria de lluvia

npm run dev
```

### Verificación

```bash
cd admin
npm run verificar
```

Corre el chequeo de tipos, la barrera de lint, la sintaxis de los SQL y los scripts `verificar-*.ts`.

---

## Notas de desarrollo

- **Git y npm en Windows**: en la copia local, hacer commits e instalar paquetes desde PowerShell, no desde WSL; en virtiofs el índice de Git y las instalaciones de npm se corrompen.
- **`android.versionCode`** en `app.json` se sube en cada APK que se reparte: es lo que distingue una versión de otra.
- **`RECEIVE_BOOT_COMPLETED`** tiene que estar en `app.json`; sin ese permiso, el GPS Track cierra la app.
- **Cambios de permisos o plugins** en `app.json`: correr `npx expo prebuild --clean` antes del build.
- **`kotlinVersion`**: `2.1.20` (compatibilidad de async-storage con KSP).
- **GeoJSON incluidos en la app**: regenerar con los scripts Python al actualizar capas en QGIS.
- **Documentación técnica**: `CLAUDE.md` (arquitectura y decisiones) y `docs/metodologia-lluvia.md` (método de la sección Hidrología).

---

## Roadmap

- [x] Autenticación con roles y permisos por sección
- [x] Sincronización con Supabase (datos + fotos), con reintentos y trabajo sin señal
- [x] Panel web con mapa interactivo y sub-capas de relevamientos
- [x] Rutas nacionales y provinciales en el mapa
- [x] GPS Track en segundo plano
- [x] Relevamientos de gabinete desde el panel
- [x] Calculadoras de obra y presupuesto de ripio
- [x] Hidrología: lluvia, cuencas, río Paraná, áreas inundables y pronóstico
- [x] Imágenes satelitales históricas
- [ ] Subida de fotos directo desde el disco, sin pasar por memoria
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
