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

## Lluvia — para qué es la pantalla

**Para ver cómo impacta la lluvia sobre la red vial de la provincia y decidir en
base a eso.** El que mira es quien decide; la herramienta muestra el dato.

Eso marca un límite que conviene respetar: **no se calculan índices de estado ni
de transitabilidad**. Se propuso un índice de humedad antecedente y se descartó,
por una razón de fondo — no existe ni una observación de cómo quedó un camino
después de una lluvia, así que cualquier índice sería una hipótesis presentada
como resultado. Si algún día la app móvil releva transitabilidad, la discusión
se reabre con datos.

Dato que enmarca todo: **el 98 % de la red de consorcios es de tierra** (9.595 de
9.772 tramos en `geo_cc.json`; sólo 16 son pavimento).

La pantalla apunta a escalar hacia simulación de escenarios —eventos del Niño,
por ejemplo—, y para eso el campo de lluvia tiene que quedar separado de su
lectura: la misma vista debería poder alimentarse de lluvia observada, de un
pronóstico o de un análogo histórico. Hoy falta profundidad histórica: hay un
año de datos, y ERA5 permitiría décadas.

## Lluvia — de dónde sale cada número

Hay **dos fuentes** y no significan lo mismo:

| | Qué es | Cobertura | Dónde |
|---|---|---|---|
| **APA** | pluviómetro, medición real | 71 estaciones que informan, sólo días con parte | `lib/apa.ts` → `mediciones_lluvia` |
| **Open-Meteo** | reanálisis, estimación modelada | toda la provincia, cualquier fecha | `lib/lluvia.ts` → `precipitaciones.mm` |

**El número que se muestra sale de los pluviómetros, no del modelo.**
`lib/fusion.ts` interpola las mediciones de la APA sobre los puntos de muestreo
de la red vial con IDW —potencia 2, radio 60 km— y el resultado va a
`precipitaciones.mm_fusion`. El modelo queda de respaldo, sólo donde no hay
ninguna estación dentro del radio, y como control.

Validado dejando cada estación afuera, sobre 162 eventos y 11.502
combinaciones estación-fecha:

| Método | MAE | RMSE | r |
|---|---|---|---|
| Modelo crudo | 6,82 | 15,17 | 0,47 |
| Modelo corregido + pluviómetros | 4,60 | 12,34 | 0,68 |
| Thiessen | 4,47 | 12,50 | 0,70 |
| **IDW² radio 60 km** | **3,98** | **10,47** | **0,77** |

Tres cosas que **no** hay que rehacer porque ya se midieron y salieron mal:

- **Anclar en el modelo y corregirlo con los pluviómetros** sale peor que
  ignorar el modelo: arrastra su patrón espacial, que correlaciona 0,47.
- **Mezclar los dos gradualmente por distancia** sale peor todavía (MAE 4,94):
  contamina la buena estimación de cerca. El cambio al modelo es duro, a 60 km.
- **Corregir el sesgo con un factor único** empeora los eventos que importan. El
  modelo subestima la lluvia liviana y aplasta los picos: `APA ≈ 2,3·modelo^0,68`.

### Procedencia: de dónde salió cada número

Cuatro estados, y los cuatro van a pantalla: `medido`, `interpolado`, `estimado`
y `sin_calcular`. Un número que se va a citar tiene que poder decir de dónde
sale. Tres consorcios (80, 81 y **84**, con el 82 % de su red descubierta) caen
al modelo; es el hueco real de la red de la APA, no un error.

**`sin_calcular` tiene que ser un estado aparte.** Una fila sin `mm_fusion` nunca
se cruzó con los pluviómetros, y eso no es lo mismo que "no había ninguno cerca".
Etiquetarla como `estimado` hacía que el mapa afirmara *"sin pluviómetro a menos
de 60 km"* sobre consorcios que tienen uno a 12 km.

**Y la procedencia del período se pesa por milímetros, no por días.** La primera
versión tomaba la peor de todos los días del rango: en una semana con dos días de
lluvia y seis secos, los seis secos no tienen parte de la APA —no hay nada que
fusionar— y marcaban los 103 consorcios como "sin recalcular", tapando que el
100 % de los milímetros venía de pluviómetros. El número que se muestra es una
suma; un día que aportó 0 mm no debería decidir su etiqueta. El umbral está en
`UMBRAL` dentro de `api/lluvia/route.ts`.

Lo que falta probar —IMERG, radar, kriging— está en `docs/lluvia-pendientes.md`
con el procedimiento para medirlo.

### Isohietas

`lib/isohietas.ts` dibuja las curvas de igual lluvia: evalúa el **mismo** IDW en
una grilla de 5 km y saca los contornos con marching squares. Todo en el
navegador, con los 71 valores que devuelve `/api/lluvia/estaciones`.

Usa el mismo motor a propósito. Si las curvas se trazaran con otro método, el
mapa y la tabla se contradirían, y de las dos cosas la que termina en un
expediente es el número de la tabla.

El mapa tiene **tres estados y hay que poder distinguirlos**: color = llovió,
gris tenue = midió cero, sin pintar = no hay pluviómetro a menos de 60 km. Los
nodos fuera de radio quedan en `NaN` y ninguna curva los cruza. Pintar la zona
sin cobertura igual que la zona seca fue un error que se detectó mirando el
render, no el código.

Los **ojos de buey** —curvas cerradas chiquitas alrededor de cada pluviómetro—
son el artefacto propio del IDW, no un patrón meteorológico. Se ven sobre todo
en el nivel más alto.

### Zonas de pluviómetro (Thiessen)

`lib/thiessen.ts` dibuja los polígonos de Thiessen sobre el mapa: la zona donde
cada estación es la más cercana. Es una **capa de cobertura, no el campo de
lluvia** — contesta "¿de qué pluviómetro lee este lugar?", que es otra pregunta
que la de cuántos milímetros cayeron.

Que el polígono no sea el método de cálculo no lo vuelve mentira: bajo IDW el
pluviómetro más cercano es también el que más pesa. Pero **los milímetros no se
calculan así** — Thiessen usa una sola estación y midió peor (MAE 4,47 contra
3,98). Se dibuja porque para mirar la cobertura es insuperable: se ve de un
vistazo si la red de un consorcio cae dentro de un polígono o está partida.

Los polígonos son **exactos y vectoriales**, por recorte de semiplanos: se parte
del contorno provincial y se lo corta por el bisector contra cada otra estación.
La primera versión lo resolvía por fuerza bruta sobre una grilla de 2 km y lo
dibujaba como imagen; **se veía mal y por eso se cambió** — al ampliar, el
navegador escalaba el raster unas cinco veces por celda y una línea de un píxel
quedaba como una banda gris difusa. Con vectores el borde queda fino a cualquier
zoom, cada zona se puede resaltar sola, y encima se calcula más rápido.

Dos recortes que no son decoración: el **contorno provincial**
(`data/contornoChaco.ts`, **generado** con `scripts/build_contorno.py` desde
`geo_bundle.json` — no editar a mano), sin el cual las zonas del borde se estiran
hacia Santiago y Formosa; y el **radio de 60 km**, porque más allá no hay dueño y
ese hueco es el dato — es donde la fusión cae al modelo.

Las zonas van en un panel propio de Leaflet (`zonasThiessen`, z-index 390): son
polígonos con relleno y si compartieran panel se comerían los clics de los
círculos de consorcio, que se dibujan después.

**La Vicuña y Paraje Kolbacks comparten coordenada**, así que una gana siempre el
desempate y la otra queda sin polígono: 70 zonas para 71 estaciones activas. El
test lo afirma para que no se lea como un error del algoritmo.

### La API de la APA

`mapas.apachaco.gob.ar` publica las mediciones en JSON, sin clave ni registro:

```
GET /public/localidades                → 111 estaciones con coordenadas
GET /public/precipitaciones/fechas     → fechas con parte cargado
GET /public/precipitaciones?fecha=…    → FeatureCollection con los mm
```

Cuatro cosas que **rompen la interpretación** si se pierden de vista:

- **Sólo vienen las estaciones que informaron.** Un día grande devuelve 56 de
  111; uno chico, una. Una estación ausente puede ser "no llovió" o "no
  informó", y desde afuera no se distingue. Nunca completar ceros: medido
  contra un cero inventado da 36 % de falsas alarmas que no existen.
- **El período no es el día calendario.** `meta.periodo` viene `17-07`, de las
  17:00 a las 07:00. Se probó comparar contra esa ventana horaria del modelo y
  **empeora** (r 0,23 contra 0,30; sesgo −48 % contra +28 %), así que la
  comparación se hace por día calendario. Está medido, no supuesto.
- **`meta.periodo` es global**, el mismo para todas las fechas: no sirve para
  saber bajo qué ventana se tomó un parte viejo.
- **No hay endpoint de rango**: una llamada por fecha, `desde`/`hasta` da 400.

En el origen, **La Vicuña** y **Paraje Kolbacks** comparten coordenada de
relleno, y **Sáenz Peña** (id 2) y **Presidencia Roque Sáenz Peña** (id 189) son
la misma ciudad cargada dos veces — la APA informa siempre en la segunda, por
eso en `buscarEstacion` **el alias gana sobre el nombre literal**.

### Cuidado con las métricas condicionadas

Comparar sólo donde la APA informó da resultados que se dan vuelta según la
muestra: con 5 fechas de septiembre el modelo parecía sobreestimar 28 %, con las
162 parecía subestimar 26 %. Las dos lecturas son artefactos de mirar únicamente
los casos con lluvia reportada. Contando los ceros deducidos, el modelo
sobreestima alrededor del 15 %. **Cualquier métrica nueva sobre estos datos hay
que calcularla sobre las 11.502 combinaciones estación-fecha, no sobre las 3.334
mediciones.**

### Dos operaciones distintas, y conviene no confundirlas

| | Qué hace | Cuesta |
|---|---|---|
| **Ingesta** (`POST /api/lluvia/ingesta`) | trae el modelo de Open-Meteo y de paso fusiona | 452 puntos por ventana de 14 días, contra el cupo |
| **Recálculo** (`?soloFusion=1`) | sólo cruza lo guardado con los partes de la APA | nada: no toca Open-Meteo |

El botón **"Recalcular con los pluviómetros"** del cartel usa el segundo. Antes
disparaba la ingesta completa, y arreglar la fusión de tres meses eran siete
vueltas con pausas de 20 segundos gastando cupo para traer números que ya
estaban en la tabla. El recálculo aguanta 90 días de una.

Sólo escribe las columnas de fusión: `mm` no se pisa nunca.

### Importación

Desde la pantalla de Lluvias, botón **Importar**: trae las fechas que falten,
de a 25 por corrida, y consulta el modelo en la coordenada exacta de cada
estación para guardar el par ya armado en `mediciones_lluvia.mm_modelo`. Queda
congelado: si mañana el modelo revisa sus números, la comparación histórica no
se mueve.

`consultarPuntos()` en `lib/lluvia.ts` es el **único** lugar que habla con
Open-Meteo. Importa que sea uno solo: el cupo se factura **por ubicación**, no
por pedido HTTP, y la deduplicación y la espera ante el 429 tienen que valer
para la ingesta por consorcio y para la comparación por estación.

`admin/src/data/estacionesApa.ts` se **genera** desde `docs/geo/localidades-apa.json`
— no editar a mano.

## Base de datos

No hay migraciones versionadas en el repo: el SQL se aplica en el editor de
Supabase. Los scripts nuevos van en `docs/sql/` como referencia.

Al escribir SQL: `create table if not exists`, `add column if not exists` y
`on conflict do nothing`, para que se pueda volver a correr sin romper nada.

`docs/sql/00-diagnostico.sql` es de sólo lectura y devuelve un informe de texto
con el estado real: tablas, RLS, políticas, grants, claves foráneas, CHECK,
índices sin uso y funciones SECURITY DEFINER. Correlo antes de tocar el esquema.

### Dónde está la frontera de seguridad

**Las 21 rutas del panel usan el `service_role`, que saltea RLS por completo.**
Ahí la autorización la hace `lib/apiAuth.ts`, no la base.

La app móvil, en cambio, pega directo contra Supabase con la clave anónima
—`relevamientos`, `obras`, `obra_destinatarios`, `profiles`, `consorcios`— y
todas las tablas tienen `grant` completo a `anon` y `authenticated`, que es el
default de Supabase. O sea: **en esas cinco tablas, RLS es lo único que separa
el teléfono de un técnico de los datos de todos los demás.**

Consecuencia práctica: **un bug de RLS es invisible desde la oficina.** Los dos
que se encontraron en la auditoría del 22/09/2026 vivieron sin que nadie los
notara justamente por eso, y sólo se detectan probando con una cuenta de técnico
real:

- Los técnicos **no podían ver las obras publicadas**. Las políticas de `obras`
  daban acceso sólo por `created_by = auth.uid()`, y el creador es el usuario de
  oficina. Todo el circuito de publicar al celular estaba cortado.
- **Reenviar un relevamiento editado fallaba**: había política de INSERT y de
  SELECT pero no de UPDATE, y la app sincroniza con `upsert(onConflict: 'id')`.
  Un relevamiento que se escribió pero cuya respuesta se perdió quedaba en
  'error' y el auto-sync lo reintentaba para siempre.

Los arregla `docs/sql/09-seguridad.sql`, ya aplicado.

### Cosas del esquema que no son obvias

- **`es_destinatario()` es SECURITY DEFINER a propósito.** Si la política de
  `obras` consultara `obra_destinatarios` con una subconsulta, y la de
  `obra_destinatarios` consulta `obras`, Postgres entra en recursión infinita.
  La función corta el ciclo porque no aplica RLS adentro. Lo mismo vale para
  `is_admin()`. **Toda función SECURITY DEFINER necesita `set search_path`** o es
  un vector de escalada de privilegios.
- **`precipitaciones`, `mediciones_lluvia` y `estaciones_lluvia` tienen RLS y
  cero políticas, a propósito.** Sólo se acceden con la clave de servicio. No es
  un olvido: si algún día el navegador necesita leerlas, se agrega una política
  de select, **no** se desactiva RLS.
- **Siete tablas no tienen script de creación en el repo** — `profiles`,
  `obras`, `relevamientos`, `proyectos_ripio`, `ripios`, `obra_destinatarios` y
  `consorcios` se armaron a mano en el editor de Supabase. Sólo quedaron los
  `alter table` posteriores. Es deuda pendiente: no se puede reconstruir la base
  ni levantar un entorno de prueba.
- `precipitaciones.estaciones_usadas` guarda cuántas estaciones informaron ese
  día **en toda la provincia**, no cuántas se usaron para ese consorcio.

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
