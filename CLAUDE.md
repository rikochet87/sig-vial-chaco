# CLAUDE.md

Guía para Claude Code al trabajar en este repositorio.

## Proyecto

Sistema de relevamiento y gestión de infraestructura vial rural en la Provincia
del Chaco, Argentina. Licencia CC BY-NC-ND 4.0.

Son **dos aplicaciones** en un mismo repo, contra la misma base Supabase:

| | Ubicación | Qué es | Quién la usa |
|---|---|---|---|
| **App móvil** | raíz del repo | React Native + Expo, Android | Técnicos en campo |
| **Panel web** | `admin/` | Next.js en Vercel | Oficina: proyectistas y administración |

## Comandos

```bash
# ── App móvil (desde la raíz) ────────────────────────────────────────
npm start                    # Expo dev server
npm run android              # Emulador / dispositivo Android
npx tsc --noEmit             # Type checking

npx expo install <paquete>   # SIEMPRE así, no npm install: resuelve la
                             # versión compatible con el SDK
npx expo prebuild --clean    # Necesario si cambian permisos o plugins de app.json

eas build --platform android --profile preview --non-interactive     # APK
eas build --platform android --profile production --non-interactive  # AAB

# ── Panel web (desde admin/) ─────────────────────────────────────────
npm run dev
npx tsc --noEmit
npx next build
npx expo-doctor               # desde la raíz — detecta incompatibilidades del SDK
```

No hay lint ni tests configurados. La verificación es `tsc --noEmit` + `next build`.

## Stack

**App móvil** — Expo SDK 56, React Native 0.85.3, expo-router v6, TypeScript
estricto. Mapa con Leaflet 1.9.4 dentro de `react-native-webview` (sin
react-native-maps ni Google Maps API). `expo-location` + `expo-task-manager`
para GPS. `expo-file-system/legacy` para persistencia local.

**Panel web** — Next.js 16, React 19, Leaflet 1.9.4, html2canvas para exportar
composiciones. Estilos inline, sin framework CSS.

**Backend** — Supabase (auth + Postgres + Storage). Tablas: `profiles`,
`relevamientos`, `obras`, `obra_destinatarios`, `consorcios`, `proyectos_ripio`,
`ripios`, `equipos`, `precios_base`.

## Arquitectura — App móvil

### Mapa (WebView + Leaflet)

`app/(tabs)/mapa.tsx` (~2340 líneas) es el archivo más grande. El mapa corre en
una WebView aislada:

- **RN → Leaflet**: `injectJavaScript()` para capas, marcadores, controles
- **Leaflet → RN**: `window.ReactNativeWebView.postMessage()` para eventos

**Leaflet va bundleado, no por CDN.** `constants/leafletBundle.ts` exporta el JS
y el CSS como strings que se inyectan inline en el HTML. Antes se cargaba desde
unpkg y la app no abría sin señal. Los tiles de OSM sí siguen siendo online: sin
red el fondo queda gris pero las capas GeoJSON se dibujan igual.

### Formulario de relevamiento

`components/RelevamientoModal.tsx` (~1890 líneas), cinco tipos:

| Tipo | Geometría | Notas |
|---|---|---|
| Puente | Point | Vano, palcos, altura, estructura, barandas |
| Alcantarilla | Point | Dimensiones, materiales, drenaje |
| Tubos | Point | Diámetro, cabezales, profundidad, cantidad |
| **Ripio** | **LineString** | Ancho, espesor, longitud; densidad **editable por tramo** |
| Otro | Point | Descripción libre |

Ripio tiene dos modos de captura: **GPS Track** (graba mientras se recorre) y
**Dibujar en mapa**.

### GPS en segundo plano

`lib/backgroundTrack.ts` — el track se graba con `startLocationUpdatesAsync` +
`TaskManager`, no con `watchPositionAsync`. Con el método anterior el track se
cortaba al apagar la pantalla y el tramo salía como una recta entre el punto
inicial y el final.

Los puntos se persisten en AsyncStorage a medida que llegan, así sobreviven si
Android mata el proceso. Requiere `ACCESS_BACKGROUND_LOCATION` y un servicio en
primer plano con notificación persistente; **el técnico tiene que conceder
"Permitir siempre"**, que Android pide aparte.

### Arranque local-first

`context/AuthContext.tsx` — el arranque **solo toca AsyncStorage**. Si hay perfil
cacheado, la app entra de inmediato y la sesión se valida en segundo plano. Con
el diseño anterior, `getSession()` salía a refrescar el token sin timeout y sin
señal la app quedaba trabada en el splash para siempre.

- `estadoConexion: 'verificando' | 'online' | 'offline'` — tres estados, no un
  booleano: "todavía no sé" no es lo mismo que "sin conexión"
- `withTimeout()` acota toda llamada de red del arranque
- Un refresh de token fallido **no expulsa** al técnico: solo el logout explícito
  limpia el perfil (`salidaExplicitaRef` distingue los dos casos)
- `app/_layout.tsx` tiene un límite duro para ocultar el splash pase lo que pase

### Persistencia y sincronización

- Local: `${documentsDirectory}/relevamientos.json` vía `hooks/useRelevamientos.ts`
- Remoto: upsert a Supabase + fotos a Storage (`hooks/useSupabaseSync.ts`)
- `lib/syncManager.ts` sincroniza a nivel archivo, sin depender de que esté
  montada ninguna pantalla. **Releé el archivo antes de cada escritura y parchea
  por id**, para no pisar relevamientos cargados mientras corría el sync
- `hooks/useAutoSync.ts` dispara al recuperar señal, al volver a primer plano y
  cada minuto mientras queden pendientes
- El reintento incluye los `'error'`, no solo los `'pendiente'`
- `components/ConexionBadge.tsx` muestra estado de red y cuántos faltan subir

### GeoJSON estático

Bundleado offline:

- `constants/geoBundle.ts` — límites, sedes, campamentos (~1,2 MB)
- `constants/geoBundleCC.ts` — red vial por consorcio y zona
- `constants/geoBundleRP.ts` — rutas provinciales por tipo de calzada
- `constants/realData.ts` — 103 consorcios — **no editar a mano**
- `constants/leafletBundle.ts` — Leaflet 1.9.4 — **generado, no editar**

```bash
python scripts/build_geo_bundle.py
python scripts/build_geo_bundle_cc.py
```

## Arquitectura — Panel web (`admin/`)

### Permisos

`admin/src/lib/permisos.ts` es la **fuente única de verdad**: la lista de
permisos, el mapa ruta → permiso y los helpers. Lo consumen el `middleware.ts`
(guard server-side por ruta), el `Sidebar` y los formularios de usuario.

Claves: `dashboard`, `consorcios`, `relevamientos`, `herramientas`, `obras`,
`calc_ripio`, `calc_desmalezado`, `calc_desbosque`.

Roles: `admin` (acceso total), `panel` (usuario de oficina, gateado por
permisos), `tecnico` y `usuario` (app móvil).

El middleware corre en Edge runtime: **`permisos.ts` no debe importar nada de
Node.**

### Autorización en las APIs

`admin/src/lib/apiAuth.ts`:

- `requireAdmin()` — solo verifica sesión válida, **no** rol admin (el nombre
  engaña)
- `requireAdminRole()` — exige rol admin
- `checkOwnerOrAdmin()` — admin o dueño del recurso

### Calculadoras de obra

`admin/src/app/dashboard/obras/calculadoras/page.tsx` — Terraplén, Excavación,
Canal, Limpieza Vial y Desmalezado. Ripio vive aparte en
`components/CalcRipio.tsx`.

### Ripio: cómputo → análisis de precios → presupuesto

Replica el circuito formal de obra pública. Cuatro pestañas: **Cómputo**
(tramos sobre el mapa), **Análisis de precios**, **Presupuesto** y
**Composición** (plano A4).

**`lib/ripioCalculo.ts`** — motor de cálculo puro, sin React. Verificado contra
los valores de la planilla de referencia. Cadena:

```
precios del proyecto ──► coeficientes ──┬──► APU material      $/tn
        │                               ├──► APU transporte $/tn·km
        └──► equipos, mano de obra ─────┴──► APU construcción   $/m
                                              └──► presupuesto oficial
```

Detalles que **no** son obvios y rompen el resultado si se pierden:

- **El gasoil y el neumático entran sin IVA** (`precio ÷ 1,21`): el impuesto se
  suma recién en el coeficiente resumen. Ignorarlo desvía todo un 21 %.
- **El coeficiente resumen es en cascada, no una suma**: costo + GG + beneficio
  = subtotal; los gastos financieros van sobre ese subtotal; los impuestos sobre
  el resultado. Con los valores por defecto da **1,68**.
- **Dos porcentajes de cargas sociales son fórmulas**: `C.Soc. s/vacaciones` =
  vacaciones × subtotal de contribuciones, y `C.Soc. s/SAC` = SAC × 41,55 %.
  Tomarlos como constantes redondeadas desvía el costo horario y se propaga.
- **Los precios son por proyecto**, no globales. Cada obra se aprueba con sus
  números; actualizar el dólar no debe mover presupuestos ya presentados.
  `precios_base` son solo **plantillas** para copiar al crear.
- **El costo de los equipos se guarda en dólares.** El valor en pesos se
  recalcula con la cotización de cada análisis.

**`lib/ripioAnalisis.ts`** — forma del documento que se guarda en
`proyectos_ripio.analisis` (JSONB), con defaults y `normalizarAnalisis()` para
que los proyectos viejos con `analisis: null` no rompan.

**Valores adoptados.** Donde la planilla redondea a mano, van dos valores: el
calculado (solo lectura) y el adoptado (editable). **El adoptado alimenta el
paso siguiente.** Aplica al tonelaje, a los metros y al precio de cada análisis.
Si el calculado cambia y el adoptado quedó viejo, se avisa en pantalla con el
número concreto.

Los cuatro análisis comparten estructura (es el formato estándar de obra
pública), así que `components/ripio/PanelAPU.tsx` es uno solo parametrizado que
se instancia cuatro veces. Se distinguen por color, título y unidad.

### Accesibilidad

Hay usuarios con visión reducida. El piso de tamaño de texto es **11 px** —
antes había texto de 7 px y el 55 % estaba en 10 px o menos. Además
`components/TamanoTexto.tsx` da un control **A / A+ / A++** en el header que
aplica `zoom` al contenedor `#panel-contenido`, persistido en localStorage.

**Al agregar texto nuevo, no bajar de 11 px.**

`MapComposicion.tsx` y `MapComposicionRipio.tsx` quedan excluidos: renderizan una
hoja A4 de 794 × 1123 px fija para `window.print()`, y agrandar el texto la
desborda.

## Convenciones

- **NO mencionar** DVP, Dirección de Conservación Vial ni Dirección de Vialidad
  Provincial en la UI ni en los impresos. El sistema es independiente.
- Colores: negro `#2C2C2C` (primario), amarillo `#F5C300` (acento). Ver
  `constants/Colors.ts`.
- La densidad del ripio es **editable por tramo**, sin default impuesto. No
  hardcodear 2 ni 2,1 t/m³ en ningún punto nuevo de la cadena.
- Ripio usa `coordsLinea: PuntoTrack[]`; el resto, coordenada única.
- Auto-detección del consorcio más cercano: distancia euclidiana sobre
  `realData.ts`.
- `metro.config.js` habilita importar `.geojson` como JSON.
- `babel.config.js` necesita `react-native-reanimated` al final.

## EAS Build — notas críticas

- Package: `com.rosello.sigvialchaco`
- `kotlinVersion` **2.1.20** (async-storage lo requiere; KSP rompe con 2.1.0)
- `compileSdkVersion` y `targetSdkVersion`: **36**
- `newArchEnabled: true`
- Si cambian permisos o plugins en `app.json`, correr `npx expo prebuild --clean`
  antes del build: se regenera el `AndroidManifest.xml`
- Los fallos de EAS suelen ser **infraestructura, no código**: caídas del cache
  de Maven, `429 Too Many Requests` de Maven Central. Antes de tocar nada,
  revisar el log de "Run gradlew" y `status.expo.dev`

## Datos geográficos — huecos conocidos

`admin/public/geo/geo_cc.json` es la red vial por consorcio y alimenta tanto el
mapa como el muestreo de lluvia. Tiene dos faltantes verificados contra los
kilómetros declarados en la ficha de cada consorcio (la mediana del resto da
1,00, así que el archivo está sano salvo por estos):

| | Declarado | Trazado | Efecto |
|---|---|---|---|
| **CC 96** "Colonia La Esperanza" | 138,8 km | **0 km** | Sin caminos en el mapa. Para la lluvia cae al centroide de QGIS: un punto en vez de promedio. La pantalla lo marca con "1 punto" en naranja |
| **CC 49** | 252,1 km | 140,1 km | Sin sesgo medible: lo trazado está entremezclado con lo que falta, su centroide queda a 1,48 km del de QGIS (mejor que la mediana de 2,09) |

Al actualizar el bundle desde QGIS hay que **regenerar los puntos de lluvia**:

```bash
cd admin && python3 scripts/build_puntos_lluvia.py
```

Y después volver a ingerir desde la pantalla de Lluvias, porque los milímetros
guardados salieron de los puntos viejos.

Los 26 tramos del **CC 44** venían en POSGAR 94 faja 5 (EPSG:22185) en vez de
WGS84 y quedaban fuera del mapa. Ya están reproyectados en el bundle; si se
regenera desde la fuente original, revisar que no vuelvan a entrar proyectados.

`docs/geo/centroides-red-cc.geojson` son los centroides calculados en QGIS sobre
la red completa. Se usan de respaldo donde no hay traza, y sirven de control
cruzado del procesamiento.

## Base de datos

No hay migraciones versionadas en el repo: el SQL se aplica en el editor de
Supabase. Los scripts nuevos van en `docs/sql/` como referencia.

Al escribir SQL: `create table if not exists`, `add column if not exists` y
`on conflict do nothing`, para que se pueda volver a correr sin romper nada.

## Git en Windows

- **NUNCA hacer git commit/push desde el sandbox Linux** (WSL/virtiofs). Usar
  siempre **Windows PowerShell**: el `index.lock` se corrompe en virtiofs.
- Si aparece `.git/index.lock`, borrarlo desde el Explorador de Windows.
- Cuando el usuario pide "el commit", responder **solo con el bloque de
  PowerShell**, sin explicación.

## Documentación

- `docs/propuesta-ripio-presupuesto.md` — análisis de las planillas de cálculo y
  el plan de implementación
- `docs/sql/` — scripts SQL aplicados en Supabase
