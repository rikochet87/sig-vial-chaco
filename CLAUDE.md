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

**Todo eso corre junto con `npm run verificar`** (desde `admin/`):
`tsc --noEmit`, la barrera de lint, la sintaxis de los `.sql` y los treinta
`scripts/verificar-*.ts`. `next build` queda afuera a propósito: tarda minutos y
usa el binario nativo de SWC, así que sólo corre donde se instalaron los
paquetes. El orquestador es `scripts/verificar-todo.mjs`, en Node y no en un
`for` de shell **porque los scripts de npm corren bajo cmd.exe en Windows**, que
es de donde se verifica este repo.

**`shell` se decide por paso y ahí hay una trampa.** Con `shell: true` en
Windows el comando se pasa a cmd.exe sin comillas, así que `process.execPath`
—que es `C:\Program Files\nodejs\node.exe`— se parte en el espacio y cmd
contesta *"C:\Program no se reconoce como un comando"*. Los pasos que llaman a
Node van **sin** shell; los que llaman a `npx.cmd` lo **necesitan**, porque Node
20+ no ejecuta archivos `.cmd` sin él. Los argumentos de esos pasos se citan si
tienen espacios, para que mover el repo a una carpeta con espacio no lo rompa.

**`tsx` es dependencia de desarrollo**, no algo que `npx` baje al vuelo: los
`verificar-*.ts` lo necesitan y sin declararlo `npm run verificar` se
frenaba preguntando *"Ok to proceed?"* en medio de la corrida.

Dos advertencias que costaron encontrar:

- **`next build` no corría el chequeo de tipos.** `next.config.ts` tenía
  `typescript: { ignoreBuildErrors: true }`, así que el build decía *"Skipping
  validation of types"* y pasaba con errores de tipo adentro. Ya se sacó, pero si
  algún día vuelve a aparecer, el build deja de ser una barrera.
- **El lint falla y `next build` no lo corre**, así que estaba muerto en la
  práctica. Ahora lo corre `npm run verificar`.

### La barrera de lint es por línea de base, no por cero

`scripts/verificar-lint.mjs` compara el conteo **por regla** contra
`scripts/lint-linea-base.json` (73 errores al 02/10/2026) y falla si alguna sube
o aparece una nueva. Que baje no falla; ahí conviene correr `--actualizar` y
commitear el piso más bajo.

```bash
npm run lint            # eslint crudo
npm run lint:barrera    # compara contra la línea de base
node scripts/verificar-lint.mjs --actualizar
```

**Es por regla y no por total a propósito**: un total deja pasar el caso de
arreglar dos `prefer-const` y meter dos `any` nuevos. Probado metiendo un `any`:
la barrera lo marca y sale con código 1.

**No conviene llevar el lint a cero a fuerza bruta**, y eso se revisó caso por
caso:

| Regla | Cuántas | Qué son en este repo |
|---|---|---|
| `@typescript-eslint/no-explicit-any` | 39 | Casi todas el objeto mapa de Leaflet. Arreglarlas de verdad es tipar Leaflet, no poner `unknown` |
| `react-hooks/set-state-in-effect` | 24 | **Mayormente falsos positivos acá.** Leer `localStorage` en un efecto es la forma *correcta* de evitar un desajuste de hidratación en SSR; la regla no sabe de hidratación. Reescribirlas con estado perezoso introduciría el bug que hoy no existe |
| `react-hooks/refs` | 5 | Reales, pero adentro de componentes de mapa de mil líneas sin tests de interfaz |
| `react-hooks/preserve-manual-memoization` | 4 | |
| `react-hooks/immutability` | 1 | |

Las que **sí** eran bugs reales ya se arreglaron: `useRedFondo` recibía
`mapRef.current` leído en render, `cargar()` usaba `setCobertura` antes de
declararlo, y `PanelMediciones` llamaba `Date.now()` en el cuerpo del componente
en vez de inicializar el estado de forma perezosa.

### Chequeo de sintaxis del SQL

`scripts/verificar-sql.mjs` parsea todos los `docs/sql/*.sql` con el parser real
de Postgres (`libpg_query`, vía `pglast` de Python). Existe porque **acá el SQL
se aplica a mano en el editor de Supabase**: no hay migraciones ni nada que lo
corra antes, así que un paréntesis de más se descubre pegándolo en producción.

Sólo valida que **parsee** — no dice nada de si las tablas existen ni de si el
script es reejecutable. Si `pglast` no está instalado, avisa y sale en verde:
`pip install pglast` para habilitarlo.

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

**`RECEIVE_BOOT_COMPLETED` tiene que estar en `app.json`, y sin él la app se
cierra.** `expo-task-manager` entrega cada posición programando un trabajo con
`setPersisted(true)`, y Android exige ese permiso para persistir un trabajo. La
librería no lo declara en su manifiesto ni lo agrega su plugin, y sólo ataja
`IllegalStateException`, así que la `IllegalArgumentException` que tira Android
mata el proceso:

```
java.lang.IllegalArgumentException: Requested job cannot be persisted without
holding android.permission.RECEIVE_BOOT_COMPLETED permission
  at expo.modules.taskManager.TaskManagerUtils.scheduleJob
  at expo.modules.location.taskConsumers.LocationTaskConsumer.reportLocationsImmediately
```

Lo que lo volvía difícil de leer desde afuera:

- **El cierre no es al guardar: es cuando llega una posición con un track
  registrado.** Arrancar el GPS Track lo dispara a los dos segundos.
- **Después se cierra al abrir, siempre.** El track queda registrado en el
  sistema aunque la app haya muerto, así que cada arranque recibe una posición y
  vuelve a caer. Es el cuadro "primero fallaba al relevar y después ya al
  abrirla". Reinstalar lo borra, hasta la próxima vez que se usa el GPS Track.
- **No deja rastro en Supabase**: lo que se guardó, llegó bien. Y no es memoria,
  que fue la primera hipótesis.

Se encontró con el informe de errores de un teléfono (Ajustes → Opciones de
desarrollador → Informe de errores): `dumpstate.txt` trae la traza completa bajo
`AndroidRuntime: FATAL EXCEPTION`. **Sin ese archivo se persiguieron dos causas
equivocadas**; ante un cierre en campo, pedirlo es el primer paso.

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

#### Las fotos

`lib/fotos.ts` + `hooks/useSupabaseSync.ts`. Se sacan con la cámara o se eligen
de la galería (hasta 10 por relevamiento), y en el formulario se ven en
miniatura y se pueden quitar.

- **Un relevamiento no está sincronizado mientras le falte una foto.** Antes, si
  una foto fallaba al subir, la fila se guardaba con la ruta `file://` del
  teléfono y el relevamiento quedaba como sincronizado: nadie lo reintentaba y
  el panel recibía una ruta que no puede abrir. Pasó de verdad —dos
  relevamientos del 18/09/2026—. Ahora la fila se manda **sólo con las fotos que
  están en el servidor**, el relevamiento queda en 'error' y se reintenta.
  `necesitaSubir()` además recupera los viejos que quedaron así.
- **Las fotos se copian a `documentDirectory/fotos/` al entrar al formulario.**
  La cámara y la galería las dejan en la caché, que Android puede vaciar, y un
  relevamiento cargado sin señal puede esperar días. La copia se borra cuando la
  foto ya subió.
- **El nombre en Storage es el del archivo local, no la posición en la lista.**
  Con `${id}/${posición}.jpg`, quitar una foto y agregar otra hacía que la nueva
  pisara a una ya subida. Ahora que se pueden quitar fotos, eso era alcanzable.
- **Si el archivo local no está, se pregunta al servidor antes de darlo por
  perdido.** La copia se borra al subir, así que "no está" es también lo que ve
  una sincronización que arranca con una lista vieja. Tomarlo como pérdida
  mandaría la fila sin la foto y **la borraría del servidor**. Como el nombre es
  determinístico, alcanza un `HEAD`: Storage contesta **400**, no 404, cuando el
  objeto no existe. Sin red no se decide nada y se reintenta.
- **Lo que de verdad se perdió se cuenta** en `fotosPerdidas` y se le dice al
  técnico en la lista. No desaparece sin aviso.
- **`sincronizarAhora` relee cada relevamiento justo antes de subirlo.** La
  lista se lee al empezar y subir cada uno tarda.
- Las fotos todavía pasan enteras por memoria en base64, de a una. Subirlas
  directo desde el disco es el arreglo de fondo y está sin hacer.

`lib/version.ts` muestra `v1.0.0 (3)` al pie de Inicio y del login. El APK se
reparte a mano, así que **`android.versionCode` hay que subirlo en cada build
que se reparte**: es lo único que distingue dos APK.

`types/expo-file-system-legacy.d.ts` se eliminó: era un shim escrito a mano que
tapaba los tipos reales de la librería —le faltaba `copyAsync`, entre otras—.
Mismo caso que el de `jspdf` en el panel.

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
- `requirePermiso(clave)` — exige un permiso concreto, con el mismo
  `tienePermiso()` que usan el middleware y el Sidebar
- `requireAlgunPermiso([claves])` — alguno de varios permisos, para las rutas
  que alimentan a más de una pantalla (el tiempo va en Dashboard y Hidrología)
- `checkOwnerOrAdmin()` — admin o dueño del recurso

**`requirePermiso` es el que faltaba.** Había sólo dos extremos —sesión a secas o
rol admin— y varias rutas se quedaron con el primero para no romper a los
usuarios de oficina, que no son admin pero sí tienen permisos. El resultado era
que cualquiera con sesión podía llamarlas, **incluido un técnico de la app
móvil**, que tiene cuenta y puede obtener sesión en `/login` aunque el middleware
después lo saque del panel. Toma `PermisoKey`, no `string`, así que un permiso
mal escrito es error de compilación.

Ese nombre engañoso ya causó varios agujeros, todos del mismo molde: el botón
escondido en la pantalla y el endpoint abierto, que es seguridad por interfaz y
no cuenta.

| Ruta | Qué permitía | Ahora |
|---|---|---|
| `/api/lluvia/ingesta` | cualquier sesión quemaba el cupo de Open-Meteo | `requireAdminRole()` |
| `/api/consorcios/[numero]` | cualquier sesión editaba cualquier consorcio, **y con `{...body}` escribía cualquier columna**, incluida `numero` | `requirePermiso('consorcios')` + lista blanca |
| `/api/relevamientos/[id]` | cualquier sesión editaba cualquier relevamiento | `requirePermiso('relevamientos')` |
| `/api/obras` POST | cualquier sesión creaba obras | `requirePermiso('obras')` |
| `/api/proyectos-ripio` POST | cualquier sesión creaba proyectos | `requirePermiso('calc_ripio')` |

**Al agregar una ruta que escribe o gasta cupo, elegir el guard a propósito.** Y
nunca `update({ ...body })`: lista blanca de campos, como hace
`/api/relevamientos/[id]`.

**Los defaults de rol van al menor privilegio.** `/api/me`, el layout del
dashboard y el contexto de usuario caían los tres a `rol: 'admin'` cuando faltaba
la fila de perfil —el contexto además con `hasPermiso: () => true`—. El servidor
no se dejaba engañar, pero la interfaz mostraba los controles de administrador.
Un dato ausente tiene que significar no poder hacer nada.

### Relevamientos de gabinete

`/dashboard/relevamientos/nuevo` — el formulario de la app de campo, cargado
desde la computadora sin ir al lugar: una alcantarilla que se ve en el satélite,
un tramo que se dibuja sobre la imagen. Mapa propio
(`components/relevamiento/MapaGabinete.tsx`) con satélite por defecto, imágenes
anteriores y la red vial de fondo.

- **Queda marcado `datos_especificos.origen = 'gabinete'`**, y la lista, la
  ficha y Hidrología lo distinguen. Una medida tomada mirando una imagen no es
  una medida con cinta. Va en el JSON y no en una columna para no depender de un
  `alter table` aplicado a mano; la app ignora la clave. `lib/relevamientoOrigen.ts`
  la lee.
- **Lo que en la app sale del GPS acá sale del mapa**: zona y consorcio de la
  sede más cercana (euclidiana, como la app), y la ruta del camino de la red
  que pasa por el punto, con el mismo formato que arma la app. Se pueden
  corregir, y una vez tocados dejan de seguir al mapa.
- **`POST /api/relevamientos`** con `requirePermiso('relevamientos')`. El
  `tecnico_id` sale de la sesión, no del navegador. Es `insert` y no `upsert`:
  el id tiene el formato de la app (`Date.now()`) y un choque tiene que ser un
  error, no pisar un relevamiento de campo.
- **Las fotos se suben primero** (`/api/relevamientos/fotos`, mismo bucket y
  carpeta que la app, `upsert: false`) y la fila lleva sólo las que llegaron.
  **El navegador las achica a 2.000 px antes**: el cuerpo de una función de
  Vercel tiene tope de 4,5 MB.
- **El mapa es la pantalla y el formulario es un panel de propiedades** de 380
  px a la derecha, con Guardar fijo abajo. La primera versión era al revés —un
  formulario largo de cajas con el mapa al costado— y no gustó: había que bajar
  hasta el fondo para guardar, el mapa abría en medio continente y la zona, el
  consorcio y la ruta eran campos vacíos que invitaban a cargarlos a mano.
  Ahora el mapa encuadra la provincia, esos tres se muestran como dato con un
  «editar», y sobre el mapa va sólo lo que es del mapa.
- **Los campos son compactos** (28 px, rótulo chico, secciones separadas por una
  línea y no por cajas) y los estilos están en `editores.tsx`: la edición de un
  relevamiento los comparte.
- **Los campos de cada tipo están en `components/relevamiento/editores.tsx`** y
  los usan la carga nueva y la edición. Tienen los nombres de la app
  (`types/relevamiento.ts` en la raíz): antes la edición del panel no tenía los
  subtipos Tramo y Canal, ni las luces del puente, ni el tablero de la
  alcantarilla.
- **La ficha ya no muestra toneladas de ripio**: la tarjeta vieja multiplicaba
  por 2,1 t/m³ fijo. Muestra el volumen, que es geometría y no supone densidad.

### Calculadoras de obra

`admin/src/app/dashboard/obras/calculadoras/page.tsx` — cuatro pestañas:
Terraplén, Excavación, Ripio y Limpieza Vial (desmalezado y desbosque).
Terraplén, Excavación y Ripio viven en su propio componente
(`CalcTerraplen`, `CalcExcavacion`, `CalcRipio`), cada uno con su motor en
`lib/` y su test; Limpieza Vial sigue adentro de la página, sin motor aparte.

#### El canal es un modo de Excavación, no una calculadora

Excavación tiene **tres modos sobre dos cómputos** (`lib/excavacionCalculo.ts`):

| Modo | Qué es | Cómputo |
|---|---|---|
| **Lineal** | cuneta, zanja, corte | sección trapezoidal por longitud dibujada |
| **Canal** | lo mismo, con su caudal | el del lineal, más Manning |
| **Área** | préstamo, pozo | tronco de pirámide sobre el recinto |

**Canal fue una pestaña aparte y se sacó.** Repetía la sección trapezoidal y el
volumen que Excavación ya calculaba —la misma zanja en dos archivos—, sin mapa,
sin tramos y guardando sólo un total. Lo único propio era el caudal, que ahora
es `caudalManning()` en el motor. El test afirma que da **lo mismo que la
calculadora retirada**, cuyas fórmulas quedaron copiadas ahí como referencia.

Cosas que no son obvias:

- **Lineal y Canal comparten la sección y los tramos.** Pasar de uno a otro no
  pierde la traza: una cuneta es un canal, y lo que cambia es si se quiere ver
  cuánta agua lleva. Lo propio del canal son la rugosidad y la pendiente.
- **Triangular es el trapecio con ancho de fondo cero.** Va como botón y no como
  "poné 0", y al volver a trapecial se repone el ancho que había.
- **El caudal es a sección llena**: el tirante se toma igual a la profundidad
  excavada. Es lo máximo que entra, no el caudal de diseño —un canal se proyecta
  con revancha—, y la pantalla lo dice.
- **El caudal de la obra es el del tramo que menos lleva**: lo que entra por una
  sección grande no pasa por la chica de más abajo.
- **Un canal se guarda con `tipo: 'canal'`**, que es como se lo busca en la
  lista de obras, pero `datos_calculadora.calculadora` es `'excavacion'` con
  `inputs.modo: 'canal'`: la calculadora que lo reabre es la de excavación. Las
  obras de canal viejas no tienen `datos_calculadora` y no se pueden reabrir,
  igual que antes.
- **Editar una excavación abría la pestaña de Terraplén vacía.** Al efecto que
  elige la pestaña le faltaba la rama de `'excavacion'`: la obra se cargaba,
  pero en una pestaña que no la mostraba. Se encontró al sumar el canal.
- **En planta se dibuja la sección, no una franja.** Lineal y Canal le pasan a
  `RipioMapPanel` el ancho de fondo (`anFondo`) además del de boca, y el mapa
  dibuja la boca, el fondo más oscuro y los taludes con el rayado de plano
  —rayas largas hasta el pie del talud y cortas hasta la mitad—, que es lo que
  el corte muestra de perfil. Con sección triangular las rayas llegan al eje.
  Sin `anFondo` (ripio, terraplén) la banda sigue siendo una sola superficie.
  El rayado tiene tope de 1.500 rayas por lado y por tramo: en un canal de
  kilómetros se espacian en vez de sumar miles de trazos.
- **El mapa de tramos decía «Eliminar ripio» en las tres calculadoras** que lo
  usan, porque nació en Ripio. Ahora dice «Eliminar tramo».
- **La botonera «Dibujar en mapa» / «Guardar obra» de la página se sacó.** Canal
  era la última calculadora que la usaba; las demás dibujan y guardan desde su
  propio panel.
- **Terraplén y Excavación no cargan precio.** La barra «Precio unit.» de la
  cabecera se sacó: una obra nueva se guarda con presupuesto cero, y el modal
  de guardar no muestra Total ni P. Unit. cuando el precio es cero, para no
  presentar un $0 como dato. **Una obra vieja que se abre para editar conserva
  su `precio_unitario`** (la página lo repone sin mostrarlo), así que volver a
  guardarla no le borra el presupuesto.
- **La pantalla de Planta (`obras/planta`) se borró**, con `lib/obraTransfer.ts`,
  que sólo existía para pasarle datos. Era el mapa al que mandaba «Dibujar en
  mapa»: sin la botonera no quedaba ningún enlace que llevara a ella, y eran
  1.675 líneas de un quinto mapa de dibujo. Si hace falta, está en el historial
  de git antes del 02/10/2026.

### Ripio: cómputo → análisis de precios → presupuesto

Replica el circuito formal de obra pública. Cuatro pestañas: **Cómputo**
(tramos sobre el mapa), **Análisis de precios**, **Presupuesto** y
**Composición** (plano A4).

**`lib/ripioCalculo.ts`** — motor de cálculo puro, sin React. Cadena:

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

#### Cómo está verificado el motor, y hasta dónde llega esa verificación

`scripts/verificar-ripio-motor.ts` **congela 158 salidas** del motor sobre un
escenario fijo, guardadas en `ripio-motor-congelado.json`.

**Es regresión, no validación.** Afirma que el motor sigue dando lo mismo, no que
esos números sean los correctos: si un coeficiente estaba mal desde el principio,
el test lo defiende igual. Se hizo así porque la planilla de obra pública con la
que se verificó originalmente no está en el repo — **cuando aparezca, este
archivo se reemplaza por uno que afirme los valores oficiales.**

Existe porque tapa un agujero concreto: el único test que tocaba el motor era
`verificar-excel-ripio.ts`, que compara **el Excel contra el motor**. Si alguien
cambia una fórmula, los dos lados se mueven juntos y ese test pasa igual.

```bash
npx tsx scripts/verificar-ripio-motor.ts              # compara
npx tsx scripts/verificar-ripio-motor.ts --actualizar # regraba
```

El congelado va en archivo aparte a propósito: al cambiar el motor **a
propósito**, se regraba y el **diff de git muestra qué números se movieron y
cuánto**. Eso es lo que hay que mirar en la revisión. Tiene sensibilidad
medida: mover el IVA un 0,008 % produce 42 diferencias de 158, y el monto en
letras del legajo cambia en veinte mil pesos.

**Si `--actualizar` mueve números que no esperabas, eso es el hallazgo.** No se
commitea sin entender la causa.

### La red vial de fondo en los mapas de cálculo

`lib/redFondo.ts` + `components/RedFondoLectura.tsx` — los cuatro mapas donde se
dibuja (`InlineMapDraw`, `InlineLineDraw`, `DesmMapPanel`, `RipioMapPanel`)
muestran la red vial de fondo para saber sobre qué camino se está trabajando.

**La capa es completamente inerte y eso es el punto.** Va en un panel propio
(`redFondo`, z-index 350, `pointerEvents: none`) y con `interactive: false`.
El motivo es concreto: `bindTooltip` sobre una polilínea la vuelve interactiva, y
entonces al marcar un vértice encima de un camino **el clic se lo comía la capa
en vez de llegar al dibujo**. Por eso las capas `cc*` del panel de capas también
perdieron su tooltip.

Los datos del tramo salen de un **hit-test propio**: el mapa escucha `mousemove`
a nivel mapa —no a nivel capa— y `RedFondo.tramoEn()` contesta qué tramo hay bajo
el cursor, que se muestra en un recuadro al pie. Resolverlo por afuera de Leaflet
es lo que permite que la capa nunca participe del ruteo de eventos.

Detalles que importan:

- **Índice espacial en grilla de 0,05°** (~5 km). La red son 249.209 vértices y
  recorrerlos en cada `mousemove` no cierra; una consulta mira la celda del
  cursor y sus ocho vecinas. Verificado contra fuerza bruta: misma respuesta,
  ~100 veces más rápido. La celda tiene que ser **más grande que la tolerancia**
  o mirar las ocho vecinas no alcanzaría.
- **La tolerancia es en píxeles, no en km.** `toleranciaKm()` la convierte al
  zoom actual: a zoom 8 medio km es razonable, a zoom 16 agarraría media ciudad.
- **Doble trazo**: uno oscuro grueso abajo y uno celeste fino arriba. Una línea
  de un solo color siempre se pierde contra uno de los dos fondos, y estos mapas
  alternan entre OSM claro y satélite.
- **El archivo y el índice se comparten** entre los cuatro mapas: son cuatro
  calculadoras pero la red es la misma y pesa 8,6 MB. Un fetch fallido **no**
  queda cacheado, para que el próximo intento pueda reintentar.
- Las capas `ZIV_DVP` y `ZV_DVP` se muestran como "Red primaria", y los dos
  códigos `Nc` que nombran al organismo se descartan enteros: sacarles la sigla
  deja una frase coja.

**`Nm` y `T` son excluyentes y hay que leer los dos.** `Nm` es el número de ruta
provincial y sólo lo traen 624 tramos; los otros 9.148 llevan el número de tramo
del consorcio en `T`. Leer sólo `Nm` —que fue el primer error— mostraba el 94 %
de la red como "sin designación". Como último recurso se parsea `Nc`, el código
compuesto: `Z1C005028` es zona 1, CC 005, tramo 028; `Z1C005RP049` es RP 049.

**Los campos cargados a mano vienen con erratas y se normalizan para pantalla.**
`J` trae PRIMRARIA, TIERCIARIA, SECUNDARI y SECUNDRAR, y 26 filas con un material
o una letra suelta en el campo de jurisdicción; `M` tiene 'Mejora', '' y una
jurisdicción entera metida adentro. Lo que no se entiende se omite, que es más
honesto que inventarlo. Corregirlo en el bundle es otra tarea.

### Imágenes satelitales históricas

`lib/wayback.ts` + `components/ImagenesHistoricas.tsx` — en el mapa principal
(`MapInner`), con la capa **Satélite** elegida, un botón al pie abre un
deslizador que recorre las fotos de años anteriores del lugar que se está
mirando.

**Lo que se ve por defecto es la imagen actual**, que es la capa de satélite de
siempre. Las anteriores van encima, y la última posición del deslizador
—«Actual»— es no poner ninguna. La primera versión era una tercera opción de
mapa base aparte, sobre OSM; se integró porque al que mira le importa "el
satélite, y cómo estaba antes", no dos capas distintas. El deslizador arranca
cerrado: abierto, busca las fotos del lugar cada vez que se mueve el mapa.

La fuente es **Esri World Imagery Wayback**: cada versión publicada del mosaico
desde 2014 (~200) se sirve como una capa de tiles propia. Es lo más parecido al
deslizador de Google Earth que se puede usar desde afuera; el archivo histórico
de Google no está en ninguna API. Los tres servicios —config, tilemap y
metadatos— responden sin clave y con CORS abierto, así que todo corre en el
navegador.

**La lista es del lugar, no del mapa.** Una versión nueva sólo cambia donde Esri
cargó imagen nueva, así que en un punto dado casi todas repiten la misma foto.
Para mostrar sólo las distintas hay dos pasos:

- **La cadena de dueños.** `tilemap/{versión}/{z}/{y}/{x}` contesta en `select`
  de qué versión anterior viene realmente ese tile. Se salta de dueño en dueño:
  12 a 22 dueños entre ~200 versiones.
- **La fecha de captura.** Que el tile haya cambiado no quiere decir que haya
  foto nueva: a veces Esri reprocesa la misma. Se consultan los metadatos de
  cada dueño y se colapsan los que muestran la misma toma. Medido el 01/10/2026:
  Castelli, 12 dueños y 7 fotos (2007 a 2023); Resistencia, 5 fotos (2007 a 2026).

**La fecha que se muestra es la de toma, no la de publicación**: es la que dice
cuándo el terreno estaba así, y pueden diferir en años — la foto de Castelli de
2007 se publicó en 2016. Si una versión no la informa, se muestra la de
publicación **y se dice que es esa**.

Cosas que no son obvias:

- **`SRC_DATE` llega como número, no como texto** (`20230216`, el campo es
  `esriFieldTypeInteger`). La primera versión de `fechaSrc` esperaba texto y
  reventaba; como el error se atajaba más arriba —"una versión sin metadatos
  queda con su fecha de publicación"— **no fallaba nada: simplemente ninguna
  foto tenía fecha de toma**. Se encontró corriendo la búsqueda contra el
  servicio real, no con el test. Un `catch` que degrada con elegancia también
  esconde el bug que lo dispara siempre.
- **El detalle está topado en zoom 17** (`ZOOM_NATIVO_MAX`). El 18 y el 19 dan
  404 en Castelli y en campo abierto, y en Resistencia sólo existen en las
  versiones recientes. Pasado el 17 Leaflet agranda el tile en vez de pedir uno
  que falta, y todas las fechas se ven con el mismo detalle y se pueden
  comparar.
- **Debajo queda el satélite actual, y eso tiene un costo asumido.** Mientras
  cargan los tiles de una fecha, o si alguno falla, lo que se ve en ese hueco es
  la foto de hoy. Con el tope en zoom 17 no hay tiles que falten de forma
  sistemática, así que es transitorio.
- **Debajo de zoom 12 no se busca.** A escala provincial "el centro del mapa" no
  es un lugar —el tile que se consulta mide ~550 m— y cada búsqueda son la
  cadena más los metadatos.
- **La cadena se recorre por tandas en paralelo** (`cadenaPorTandas`). En serie
  es mínima en pedidos pero cada uno espera al anterior: 12 pedidos, 6 s antes
  de mostrar nada. Ahora la primera tanda pregunta por una versión de cada 8,
  todas juntas —cualquier versión contesta con su dueño—, y las siguientes
  preguntan por la anterior a cada dueño nuevo, que es el paso de la cadena en
  serie y lo que garantiza que no falte ninguno. Son ~35 pedidos en dos o tres
  esperas: **1 a 3 s**. El test la compara contra la cadena en serie.
- **Se precargan la fecha anterior y la siguiente**, invisibles. Son las dos a
  las que se llega con un paso del deslizador; con los tiles ya bajados el paso
  es instantáneo en vez de ~0,7 s por tile. Estando en «Actual», la vecina es la
  última del historial.
- **Las fechas de toma son lentas y no se arregla desde acá.** La primera
  consulta de metadatos en una zona tarda 0,3 a 30 s por pedido, del lado de
  Esri; repetida, o a 10 km, 0,3 s. El total de un lugar frío se midió entre 9 y
  98 s, y con 4, 8 o 24 pedidos en simultáneo los tiempos se pisan. Por eso
  **nada de la pantalla espera a esas fechas**: la lista sale de la cadena y
  cada fecha aparece cuando llega; mientras tanto se muestra la de publicación,
  dicho. El resultado se cachea por tile.
- **No cambiar la capa de metadatos 6 por la 7 para ganar velocidad.** Se probó:
  la 7 pareció diez veces más rápida, pero era el orden de la prueba —se
  consultó segunda, con la zona ya tibia—. Y no dicen lo mismo: en Sáenz Peña,
  para la misma versión, la 7 da una toma de 2007 y la 6 una de 2009. **Al
  comparar tiempos contra este servicio, cada variante va en un lugar que nadie
  consultó**, o se mide el caché.
- **Al mover el mapa se conserva el momento, no la posición del deslizador**: la
  misma versión si sigue en la lista, la misma toma si la hay, y si no la que
  esa versión muestra en el lugar nuevo (`entradaVigente`: la más nueva
  publicada hasta esa fecha).
- **El colapso por captura se hace una sola vez, al final**, para que las marcas
  del deslizador no se reacomoden bajo el dedo de quien lo está usando. **Y el
  orden también**: mientras llegan las fechas de toma la lista va por fecha de
  publicación, que no cambia. Antes cada fecha que llegaba reordenaba la lista
  —una toma de 2007 publicada en 2016 saltaba hacia atrás— y el cursor del
  deslizador se corría solo.
- **Acercar o alejar no relanza la búsqueda si el centro sigue en el mismo
  tile** (`claveTile`, zoom 16). La rueda acerca hacia el cursor y corre el
  centro unos metros; cada `moveend` cortaba la búsqueda a mitad de las fechas
  de toma —que tardan de 9 a 98 s en un lugar frío— y la empezaba de cero, así
  que el deslizador volvía a la lista a medio armar y se reacomodaba otra vez.
  Era lo que se veía como "se mueve solo al hacer zoom".
- **Las fechas de toma ya consultadas se cachean por tile y versión**, así una
  búsqueda cortada no pierde lo que trajo. Sólo se cachea una respuesta: si
  alguna capa de metadatos no contestó, `metadatos()` tira en vez de devolver
  "no informa", que quedaría guardado para siempre.
- La fecha que se venía mirando se queda debajo hasta que la nueva cargó. Sin
  eso, un paso a una fecha sin precargar parpadea a la imagen actual.

`scripts/verificar-wayback.ts` cubre la parte pura y **no sale a la red**, por
el mismo motivo que `relevar-ina.ts` queda afuera de `verificar`: que Esri
cambie la forma de una respuesta no es algo que deba romper un commit. La
contracara es la del primer punto — el test no habría atrapado lo de
`SRC_DATE`. Ahora lo afirma con el número tal como llega.

Está en dos mapas: el principal (`MapInner`) y el de Lluvias (`MapaLluvia`),
con el mismo hook y el mismo deslizador. Los mapas de cálculo y la revisión de
relevamientos siguen con el satélite de Google a secas; el hook toma la ref de
cualquier mapa de Leaflet, así que sumarlo ahí es montarlo.

En Lluvias el mapa base se elige arriba del panel de capas (Mapa / Satélite).
Dos cosas propias de esa pantalla:

- **Con el satélite, la lectura del tramo bajo el cursor sube al lado de los
  botones de zoom.** Su lugar de siempre, abajo a la izquierda, queda debajo del
  deslizador de imágenes.
- **El mapa de lluvia se mira casi siempre a zoom 7 a 10 y las fotos se buscan
  desde el 12**, así que al abrir el deslizador lo normal es que pida acercar.
  Es correcto: a escala provincial "el centro del mapa" no es un lugar.

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
- **Estilo del panel web: técnico, de programa de CAD.** Caja casi negra
  (`#0e0e0e` a `#191919`), borde de 1 px (`#1e1e1e` a `#2a2a2a`), **esquinas
  rectas** (radio 0 a 2), fuente monoespaciada, rótulos en mayúsculas con
  `letterSpacing` de 0,8 a 1,4, y el amarillo como filo de 3 px a la izquierda,
  no como fondo. Grises neutros, nunca azulados. **Sin emojis**: los íconos son
  SVG de trazo 1,2 px como los de `Sidebar.tsx`, o glifos geométricos (◀ ▶ ✕).
  Vale también para lo que flota sobre los mapas:
  - Los popups de Leaflet de `MapInner` comparten las clases de `POPUP_CSS`
    (`ph`, `pn`, `pl`, `pr`, `plb`, `pv`…); el color del elemento entra por
    `--pc` en el encabezado. **Hay que declararles la fuente**: el CSS de Leaflet
    le pone Helvetica a todo lo que cuelga del mapa.
  - Los paneles flotantes llevan `className="sv-panel"`, que en `globals.css`
    vuelve cuadradas las casillas y opciones; los deslizadores, `sv-range`.
  - Los tooltips de Leaflet se crean con `className: 'sv-tt'`. Sin clase sale el
    globo blanco redondeado con flecha que trae Leaflet. Adentro, `tt-k` es el
    rótulo chico en mayúsculas que dice qué es lo que se está señalando.
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

**En pantalla la sección se llama «Hidrología»** desde el 02/10/2026: dejó de
ser sólo lluvia cuando sumó cuencas, cursos de agua y el río Paraná. Cambió el
rótulo del menú, el título de la página y la etiqueta del permiso; **la ruta
(`/dashboard/lluvia`), la clave del permiso (`lluvia`) y los nombres de archivos
y componentes siguen igual**, porque cambiarlos rompe enlaces guardados y obliga
a tocar los permisos de cada usuario en la base. En este documento «Lluvias» y
«Hidrología» nombran la misma pantalla.

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
pronóstico o de un análogo histórico. Hoy falta profundidad histórica en lo
medido: hay un año de partes. Hacia atrás está CHIRPS por cuenca, desde 1981
(ver «Lluvia histórica: CHIRPS por cuenca»), en la vista «Histórico» de Cuencas.

## Lluvia — cómo está organizada la pantalla

Seis pestañas, cada una con la pantalla entera:

| Pestaña | Qué tiene | Selector de período |
|---|---|---|
| **Mapa** | el mapa y, al lado, la lista de consorcios **o** de cuencas | sí |
| **Cuencas** | `PanelCuencas` con sus siete vistas | sí, salvo la de cursos de agua y la histórica |
| **Río Paraná** | `PanelRio`, abierto | sí |
| **Gran Resistencia** | las áreas inundables: mapa propio y panel de escenarios (ver «Gran Resistencia — áreas inundables») | no: se elige una altura del río, no un período |
| **Tiempo** | alertas del SMN y pronóstico por consorcio (ver «El tiempo») | no: mira hacia adelante |
| **Precisión** | la comparación de métodos y `PanelMediciones` | no: habla de métodos, no de un período |

**Antes todo iba apilado** —el mapa, y debajo, en renglones plegados, el río,
las cuencas y la comparación de métodos— y eso tenía un costo medido: en un
monitor de 1080 el mapa quedaba con **418 px de alto**, tan bajo que el encuadre
de la provincia caía un nivel de zoom y el Chaco se veía chiquito en medio de
medio continente. Las tres tablas de cuencas vivían al fondo, adentro de un
renglón. Se encontró mirando la pantalla real, no el código.

Cosas que no son obvias:

- **La lista al lado del mapa alterna entre consorcios y cuencas**, y elegir una
  cuenca la resalta y la encuadra, igual que con un consorcio. Antes la tabla de
  cuencas no hacía nada sobre el mapa. Al cambiar de lista se suelta lo elegido
  en la otra, para que el mapa no quede resaltando dos cosas.
- **Elegir una cuenca prende la capa aunque el interruptor esté apagado**
  (`mostrarCuencas` en `MapaLluvia`): no se puede resaltar algo que no se dibuja.
- **`useCuencasLluvia` calcula las cuencas una sola vez** para la lista del mapa
  y para la pestaña, por el mismo motivo que `useRedLluvia`: dos lugares que
  muestran el mismo número tienen que sacarlo del mismo cálculo. No hace nada
  hasta que alguien mira cuencas — son 310 KB y ~150 ms por período.
- **El panel de capas del mapa tiene tope de alto, barra propia y se pliega.**
  Creció con cada capa nueva hasta medir 572 px sobre un mapa de 418: se salía
  por abajo y tapaba lo que había debajo.
- **La franja «Datos» del selector se pliega sola cuando el período está al
  día**, que es casi siempre. Eran 60 px fijos arriba del mapa para decir "no
  hace falta tocar nada"; queda un indicador chico que la abre. Si falta algo o
  se está descargando, aparece sin que nadie la pida.
- **Los límites administrativos —provincia, cinco zonas viales, 25
  departamentos— son capas del mapa** (`lib/limites.ts`). Salen de
  `geo_bundle.json`, que se pide recién al prender la primera: pesa 1,3 MB.
  **Van en negro o gris y se distinguen por el trazo**, como en un plano: lleno
  y grueso, rayas largas, rayas cortas. Sin color propio, porque el color en
  este mapa es de la lluvia y el violeta de las cuencas; y sin relleno, que
  taparía los caminos. No reciben el cursor. Con Departamentos prendido, la
  lectura del tramo dice en cuál está. Los 25 nombres aparecen recién desde
  zoom 9, igual que los de las cuencas.
- **El nombre del departamento viene en `Departamen`**, no en `nombre`: lo cortó
  a diez caracteres el shapefile de origen. `MapInner` busca `nombre` y
  `NOMBRE`, así que **el popup de departamento del mapa principal no aparecía
  nunca**. Se arregló el 05/10/2026: lee `Departamen`.
- `scripts/verificar-limites.ts` cruza las 103 sedes contra los polígonos: cada
  una cae en una sola zona y un solo departamento, y **la zona del polígono es
  la que dice la ficha del consorcio en las 103** — dos datos cargados por
  separado.
- **`zoomSnap: 0.5` en el mapa.** Con niveles enteros el encuadre de la
  provincia salta de "entra con medio continente alrededor" a "no entra".
- **El texto gris se subió de contraste** en toda la sección. Había 102 usos por
  debajo de 4,5:1 contra el fondo de los paneles —la mitad eran `#555`, a
  2,4:1— y hay usuarios con visión reducida. Quedan dos escalones: `#8f8f8f`
  (5,4:1) para lo terciario y `#a0a0a0` para lo secundario. **Al agregar texto,
  no bajar de `#8f8f8f`.**

## Gran Resistencia — áreas inundables

`lib/inundaciones.ts` + `components/inundaciones/` + `public/geo/inundaciones/`.
Pestaña «Gran Resistencia» de Hidrología (`?vista=inundables`): qué se moja
con una crecida del Paraná, con una lluvia larga, o con las dos. El mapa es la
pantalla, **debajo va el deslizador de la altura del río, que es el control**,
y a la derecha un panel con lo que queda adentro.

**La pantalla se rehízo el 07/10/2026 porque no se entendía.** La primera
versión pintaba cada imagen de un color —celeste la zona, naranja la mancha
más cercana, rojizo la que ve una parte— y explicaba cada uno en el panel, con
el deslizador chico ahí mismo entre diez botones de atajo. Era correcta y
había que leer tres párrafos para mirar un mapa. Lo que se pidió fue una
imagen que, al subir la altura del río, vaya mostrando lo que se inunda:

- **Una sola mancha celeste.** Para una altura se dibujan la zona de esa
  altura y **todas** las imágenes de un río igual o más bajo (`aguaDelRio` en
  `lib/inundaciones.ts`), del mismo color. De qué imagen sale cada cosa lo
  dice la lectura bajo el cursor —«agua con el río en 7,23 m · imagen del
  14/01/2016», que es la más baja que tiene agua ahí— y el detalle plegado,
  no el color.
- **Es acumulado para que subir el deslizador nunca saque agua.** Las manchas
  de un día no son monótonas, y mostrando sólo la más cercana el mapa se
  secaba en partes al pasar de 8,25 a 8,30 m. Sigue siendo sólo lo observado y
  nunca de un río más alto que el pedido; el test afirma las dos cosas de 2 a
  9,5 m.
- **Las capas del río van en un panel aparte, llenas, y la transparencia es
  del panel** (`union` en `CapaDibujo`, panel `inuUnion`). Con transparencia
  por capa, donde dos imágenes se pisan queda más oscuro y siete capas se leen
  como siete manchas. **No se juntan en un solo polígono**: el lienzo de
  Leaflet rellena con regla par-impar y lo pisado saldría como hueco.
- **El título de esas capas no lleva la altura** («Agua con el río a la altura
  elegida»): con la altura adentro, cada paso del deslizador redibujaba todo.
  Medido: un paso dentro de la misma imagen cuesta ~15 ms; cruzar una imagen,
  200 a 350 ms, y son siete cruces en todo el recorrido. **Medido con saltos de
  `MessageChannel`, no con `setTimeout`**: con la pestaña en segundo plano los
  temporizadores van a uno por segundo y todo «tardaba» un segundo.
- **Las marcas del deslizador reemplazan a los atajos**: arriba Hoy y el techo
  del pronóstico del INA (si no queda pegado a lo de hoy), abajo alerta,
  evacuación y los picos de 2023, 1998 y 1983. Se alinean con el cursor
  descontando su ancho (`enRiel`). **Los atajos de recurrencia de 10, 50 y 100
  años se sacaron**; queda la frase de en cuántos años el río llegó a esa
  altura y, en «Situación de hoy», la recurrencia ajustada.
- **Arriba del panel van tres cifras**: km² bajo agua, en el área urbana y
  sobre lo construido hoy. Son el mayor de cada columna entre las capas
  dibujadas —se pisan y no se suman—, así que es «como mínimo», y se dice.
- **Lluvia, río con lluvia y defensa rota siguen, plegados** (`<details>`), lo
  mismo que la tabla por imagen y «Cómo leerlo».
- **El límite de una imagen parcial se rotula por lo que significa**: «Sin
  imagen de 8,02 m · acá, agua hasta 7,80 m». Decía «Sin imagen el
  07/03/1983», y con el deslizador en 1998 nadie entendía qué hacía ahí una
  fecha de 1983. Corto y en dos renglones: en uno medía media ciudad. Sólo lo
  marca la parcial vigente; con una imagen más alta que ve todo, desaparece.

### La defensa y lo que viene río arriba

Desde el 08/10/2026.

- **La traza de la defensa del Área Metropolitana** (`docs/geo/inundaciones/defensa-amgr.kml`,
  del KMZ «Defensa AMGR» que aportó el usuario; 31,5 km, una sola línea) va en
  `defensas` del índice y se dibuja en color tierra, encima de las rutas. La
  arma `build_inundaciones.mjs` (`DEFENSAS`). **No es un anillo cerrado**:
  corre por el este y el sur, y al oeste el recinto lo cierran terrenos
  altos. Por eso no se calcula «adentro del recinto» como polígono.
- **`ladoDeDefensa()` dice de qué lado está un punto, sólo a menos de 2 km de
  la traza** (`LADO_DEFENSA_KM`): toma el tramo más cercano, y lejos ése
  puede ser el de la otra punta. Depende del sentido de dibujo —de norte a
  sur, con el río a la izquierda—, y el test lo afirma con algo que no sale
  de la traza: de los vértices de agua permanente a menos de 2 km, 963 caen
  del lado del río y 256 del de la ciudad (las lagunas). **Si se cambia el
  KML por uno dibujado al revés, ese test falla**, y hay que invertirlo.
- Con la traza a la vista, el aviso de las imágenes de 1983 dice «del lado de
  la ciudad de la defensa» en vez de «dentro del recinto».
- **«Qué viene río arriba»** (`components/inundaciones/RioArriba.tsx`): las
  nueve escalas de `/api/rio/arriba`, con el cambio en siete días y cuántos
  días antes que por Barranqueras pasa el pico (`anticipaciones()`), y una
  línea arriba: cuántas escalas del Paraná suben y cuánto antes avisa la más
  lejana. Sube o baja es con **10 cm en la semana** (`SEMANA_M`), no con el
  `QUIETO_M` diario del panel del río. **No mueve el deslizador ni traslada
  alturas**: dice que viene agua y cuándo, no a cuánto. A cuánto lo dice el
  pronóstico del INA, que ya está en el deslizador.

**Toda el agua que se dibuja es agua que se vio desde un satélite, con su fecha
y la altura que tenía el río ese día. No hay ninguna mancha calculada.** No hay
modelo hidráulico ni cotas: no da profundidades ni sirve para un lote. La
zonificación que vale es la de la APA, y la pantalla lo dice. De dónde sale
cada capa está en `docs/inundaciones-gran-resistencia.md`.

**Un escenario de crecida son dos capas que no valen lo mismo:**

| | Qué es | Hasta dónde |
|---|---|---|
| **Zona** | lo que se moja con el río hasta cierta altura, de la serie de 337 escenas Landsat | **7 m** |
| **Mancha observada** | el agua de un día | 8,53 m, el 20/06/1983 |

- **Sobre 7 m hay una sola escena limpia en cuarenta años que vea todo el
  recuadro**: las crecidas llegan con nubes. Por encima sólo hay manchas
  sueltas, y las de más de 7,3 m son todas de 1983: otra ciudad, sin el anillo
  de defensas terminado. La pantalla lo avisa con la imagen a la vista.
- **Una mancha puede no ver todo el recuadro** (`vistoPct`), y entonces **se
  suma a la referencia, no la reemplaza** (`parcial` en `escenarioRio`). Es la
  del 07/03/1983: río en 8,02 m, sin nubes, de la órbita 227/079, que ve la
  ciudad entera y no el valle del Paraná (64 % del recuadro). Con la altura de
  1998 entran las dos, la del 28/02/1983 (7,80 m) y ésa.
  Lo que una imagen no ve va con la capa (`sinImagen`) y se encierra con
  una línea a rayas y su rótulo, sin relleno: sin eso, «sin agua» y «sin
  imagen» se leen igual. También lo lleva la
  del 20/05/1998, por las nubes.
- **Nunca se muestra una mancha de un río más alto que el pedido**
  (`escenarioRio`, `aguaDelRio`): sería dibujar más agua de la que esa altura
  trajo. Si la más alta que no lo supera queda a más de 30 cm, se dice cuánto
  falta.
  El test lo afirma de 2 a 9,5 m.
- **La lluvia es un solo evento** (enero de 2019) y **la combinación, otro**
  (mayo de 1998, con nubes). Van como lo que son: una observación cada uno. No
  se suman con las zonas del río ni se calcula nada con ellas. También se puede
  prender la mancha del 14/08/1982, tres semanas después de la rotura del
  dique del río Negro: es lo único que hay de una falla de defensa.
- **La lluvia pronosticada** es la del pronóstico por conjuntos de Cuencas,
  sobre los nodos que caen en el recuadro o a medio paso de grilla (cinco).

### El Canal 16, la otra órbita y lo informado

El 07/10/2026 se corrigió un error de la pestaña: **con el
pico de 1998 (8,17 m) el agua entró al Canal 16**, el último al sur de la
ciudad, y la pantalla lo mostraba seco. De ahí salieron cuatro cosas; el
detalle está en «Tercera pasada» de `docs/inundaciones-gran-resistencia.md`.

- **La órbita 227/079 se había descartado mal.** Se la miró con escenas del
  Landsat 5, que cubren sólo el oeste, y se concluyó que no servía. Su huella
  cambia de una pasada a otra: el 07/03/1983 entra la ciudad entera. **Listar
  las escenas de todas las órbitas con el río alto** dio 29 con 7,20 m o más;
  la serie sigue armada sólo con la 226/079.
- **Una escena de la 227 hay que mirarla antes de usarla.** La del 27/05/1998
  figura cubriendo todo el recuadro y muestra otro lugar: está mal
  georreferenciada y ningún número lo delata. `crecidas-altas.mjs` deja una
  vista en falso color por escena para eso.
- **El infrarrojo con umbral de Otsu no vale en una escena sin el Paraná**:
  sin un cuerpo de agua grande parte la tierra en dos. El 09/04/1998 da 207 km²
  de «agua» contra 6 de agua abierta. La del 07/03/1983 tiene el desborde
  adentro y se revisó a la vista.
- **Lo que dicen las imágenes es menos que lo que se sabe que pasó, y la
  pantalla no lo estira.** Hasta 7,23 m no hay agua junto al canal; entre 7,80
  y 8,02 m aparece junto al tramo final, el que da al Paraná (26 a 59 % a
  menos de 310 m). El 22/07/1983, con 8,26 m, hay menos: no es monótono.
  **Ninguna imagen muestra el canal desbordado**: a 60 m un canal no se ve.
- **Lo informado no se pinta como agua.** Va en `informes` del índice y se
  muestra como texto —«Informado, sin imagen»— con lo que muestran
  las imágenes más cercanas, al llegar a esa altura (`informesHasta`). La caja
  es gris con filo blanco: ni el naranja de los avisos ni el color de una
  capa. La traza del canal va en `referencias`, de OpenStreetMap, como línea
  blanca a rayas, **y se dibuja sólo mientras está a la vista el informe que
  la cita**. **Un informe nuevo se agrega en `INFORMES` de
  `build_inundaciones.mjs`**. **No lleva quién lo informó**: se pidió
  expresamente que la pantalla no lo diga.
- **Las manchas de un día pasaron de 90 a 60 m y de 8 a 1,5 ha.** A 90 m se
  perdían los bajos chicos del área urbana, que son lo que se mira ahí: el
  agua junto al tramo final del canal son manchas de 5 a 10 ha. El compuesto
  de frecuencia sigue a 90 m. A 30 m las de TM pesan 2 MB cada una.
- **Regenerar las manchas no movió ningún número**: las 23 escenas de antes
  dan la misma superficie y el compuesto las mismas 389, 238 y 149 km². Es la
  comprobación de que cambió el contorno y no la clasificación. **Las máscaras
  intermedias de la investigación no están en el repo**: si no están a mano,
  el script las vuelve a bajar.
- **Los modelos de elevación de 30 m se probaron y no alcanzan.** El MDE-Ar del
  IGN y el Copernicus GLO-30 difieren 1,8 m de media en el recuadro urbano;
  uno pone el canal 2,5 m sobre el agua de 1998 y el otro, medio metro. Entre
  una crecida de 7 m y la de 1998 hay 1,2 m. **No se dibuja ninguna «zona bajo
  cota»**. Lo que lo cambiaría es el MDT de 5 m del IGN sobre
  Corrientes–Resistencia (2016) y el de 0,5 m de Fontana (2021), que se piden
  por correo: el borrador está en `docs/pedido-ign-mde-gran-resistencia.txt`.
- **El IGN publica qué modelos tiene por WFS**
  (`wms.ign.gob.ar/geoserver/modelos-digitales-elevaciones`, capas `mde_5m`,
  `mdt_5m`, `mde_50cm`, `mdt_50cm`, `mde_v2_30m`). El de 30 m baja sin cuenta
  y viene en `.img`, que se convierte con el `gdalwarp` de QGIS.
- **Mirándolo en pantalla, dos veces.** Primero la línea del canal en celeste
  fino no se veía y lo no visto en gris tenue tampoco, y se los hizo más
  fuertes. Así tampoco se entendían (07/10/2026): el canal salía siempre, con
  cartel fijo y en color de agua, aunque el río estuviera en 4 m y nada
  hablara de él; y lo no visto era una placa gris que tapaba el agua que otras
  imágenes sí vieron en el valle y se confundía con lo construido, que
  también es gris. Ahora el canal aparece con su informe, en blanco y sin
  cartel, y lo no visto es sólo un contorno a rayas con su rótulo. **Una línea de referencia sin el texto que la explica es ruido.**

Cosas que no son obvias:

- **Las capas van partidas, una por archivo, con un índice chico.** Todas
  juntas pesan 8,9 MB y la pantalla muestra dos o tres: cada una se pide
  recién cuando se la prende. Se generan con `node scripts/build_inundaciones.mjs`
  —no editar a mano— desde los GeoJSON de `docs/geo/inundaciones/`.
- **Las superficies de la tabla no se calculan en el navegador.** Polígono
  contra polígono no cierra; se midieron sobre las grillas originales
  (`scripts/inundaciones/capas-resumen.mjs`) y van en el índice. Son «fuera del
  agua de siempre», por eso la zona de menos de 4 m da 0.
- **Cada capa se informa por separado y no se suman**: las manchas se pisan.
- **Un camino sobre agua permanente es un puente, no un camino inundado.** El
  puente a Corrientes salía en rojo porque cruza el Paraná, que está en todas
  las manchas. `viaContra` toma el agua permanente como excepción. Se vio en
  la pantalla, no en el test.
- **Que un tramo caiga adentro no quiere decir que se corte.** La mancha no ve
  terraplenes. La pantalla lo dice: es la lista de dónde mirar.
- **`IndicePoligonos` es una grilla de 30 m, no punto en polígono.** Se pinta
  una vez por capa y una consulta es mirar una celda. Coincide con la prueba
  exacta en el 98,7 % de los puntos; difieren los que están a menos de media
  celda de un borde.
- **Todo lo dibujado es inerte** y va en lienzo, con una polilínea múltiple por
  color. La lectura bajo el cursor se resuelve por afuera de Leaflet, como en
  el mapa de lluvia.
- **Las rutas nacionales y provinciales entran al cruce** (`geo_rn.json`,
  `geo_rp.json`), además de los caminos de consorcio: en el área metropolitana
  son las que importan. El campo `Mantenim` de esos archivos no se muestra.

**Una captura que falla no es una pestaña congelada.** Al probar esto, las
capturas de pantalla del navegador se vencían después de elegir una altura y se
leyó como que la pestaña se colgaba. Se reescribió el índice y el dibujo de
caminos persiguiendo eso. La pestaña del navegador estaba en segundo plano
(`document.visibilityState === 'hidden'`): ahí no hay cuadros de animación y
los temporizadores van a uno por segundo. Medido después, elegir una altura
cuesta de 6 a 54 ms. **Antes de optimizar por un cuelgue, medirlo.**

`scripts/verificar-inundaciones.ts` no sale a la red. No hay un valor oficial
contra el cual comparar una mancha, así que afirma geometría con casos que se
saben sin calcular, la regla de las alturas —también para la mancha parcial—,
que las zonas del río estén anidadas, el índice en grilla contra la prueba
exacta, y sobre el Canal 16 sólo lo que las imágenes muestran. **Tres
afirmaciones que se escribieron primero no se cumplían** —que el agua de 8,02 m
cubría la mayor parte del tramo final— y se cambiaron por lo medido.

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

Cinco estados, y los cinco van a pantalla: `medido`, `interpolado`, `estimado`,
`sin_parte` y `sin_calcular`. Un número que se va a citar tiene que poder decir
de dónde sale. Tres consorcios (80, 81 y **84**, con el 82 % de su red
descubierta) caen al modelo; es el hueco real de la red de la APA, no un error.

**`sin_calcular` tiene que ser un estado aparte.** Una fila sin `mm_fusion` nunca
se cruzó con los pluviómetros, y eso no es lo mismo que "no había ninguno cerca".
Etiquetarla como `estimado` hacía que el mapa afirmara *"sin pluviómetro a menos
de 60 km"* sobre consorcios que tienen uno a 12 km.

**Y `sin_parte` tiene que ser otro más.** Hay dos motivos distintos para que una
fila no tenga `mm_fusion`, y se los había juntado:

| | Qué pasó | ¿Lo arregla recalcular? |
|---|---|---|
| `sin_calcular` | hay parte de la APA, pero esta fila todavía no se cruzó con él | **sí** |
| `sin_parte` | ese día la APA no publicó nada | **no, nunca**: el dato no existe |

**La APA publica parte sólo los días que llueve, así que la mayoría de los días
no tiene ninguno.** En agosto-septiembre de 2026 hay parte en 6 días de 31. Con
los dos estados mezclados, el cartel decía *"el período todavía no se cruzó con
los pluviómetros"* y ofrecía «Recalcular»; uno lo apretaba, el recálculo hacía
bien su trabajo sobre los días que sí tenían parte — y el cartel volvía igual,
porque los días sin parte seguían ahí y van a seguir para siempre. Un botón que
no puede cambiar nada es peor que no tener botón.

Ahora la ingesta **marca esas filas** con `procedencia: 'sin_parte'` y
`mm_fusion` en null, y la pantalla muestra un cartel distinto, informativo y sin
botón.

**Eso sí necesitó SQL, contra lo que decía acá antes.** `09-seguridad.sql` le
había puesto a la columna un `check (procedencia in ('medido','interpolado',
'estimado'))`, y el valor nuevo lo violaba: la interpolación fallaba al escribir
con `23514 check_violation`. Lo arregla `docs/sql/10-procedencia-sin-parte.sql`.
**Al agregar un valor a una columna con CHECK hay que tocar el CHECK**, y en
este repo los CHECK viven en `docs/sql/`, no en el código.

`sin_calcular` **no** está en el CHECK a propósito: nunca se escribe. Es lo que
deduce `api/lluvia/route.ts` cuando `mm_fusion` es null y no hay marca de
`sin_parte`. Si se pudiera persistir, dejaría de significar "no se hizo
todavía".

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

### La lluvia bajada al camino

`lib/redLluvia.ts` cruza el campo de lluvia con la red vial: **cada tramo lleva
su propio número, no el de su consorcio**. Antes toda la red de un consorcio
salía de un color solo, y una tormenta que mojaba una punta y no la otra quedaba
tapada por el promedio — un consorcio puede tener 250 km.

El número sale del **mismo IDW** que la tabla y las isohietas. El polígono de
Thiessen queda como referencia —de qué pluviómetro lee el tramo y a cuántos km
está— pero no calcula: como método midió peor (MAE 4,47 contra 3,98).

Tres cosas que importan:

- **Se muestrea cada 2 km, no vértice por vértice.** La red tiene 249.209
  vértices; con 71 estaciones serían 17,7 millones de distancias por cambio de
  fecha. Muestreando son 14.989 puntos y 40 ms. No pierde nada: la longitud de
  decorrelación de la lluvia acá es de 42 km.
- **El promedio del tramo se toma sólo sobre la parte cubierta**, pesado por
  longitud. Promediar la parte sin pluviómetro como si fuera 0 mm diluía el
  número hacia abajo e inventaba sequía donde sólo faltaba una estación.
- **`mm: null` no es cero.** Un tramo sin ningún pluviómetro en el radio no tiene
  dato, y se dibuja punteado y apagado, no seco. Mismo criterio que las
  isohietas.

**Ojo con los kilómetros: hay dos números y miden cosas distintas.** El largo
geométrico de las trazas del GeoJSON da **28.756 km** (29.128 contando los 372,3
de los 26 tramos sin número de CC, que quedan afuera). La suma de `red_km`
declarado en la ficha de cada consorcio da **28.347,3 km**. No es un error de
ninguno de los dos: uno mide la traza dibujada y el otro lo que declara el
consorcio, y ya se sabe que difieren por consorcio (ver los huecos del CC 96 y
el CC 49 más arriba). **Al citar kilómetros hay que decir cuál de los dos es.**

Por eso el resumen de kilómetros por rango que estuvo un rato en pantalla se
sacó: mostraba el número geométrico sin aclarar cuál era, al lado de una tabla
que usa el declarado. `kmPorRango()` y `kmSobre()` siguen en la librería y
verificados, para cuando se decida cuál citar.

Hallazgo de mirar esto a nivel tramo: **son siete los consorcios con red fuera de
cobertura, no tres.** La tabla por consorcio muestra 80, 81 y 84 porque promedia
toda la red; tramo por tramo aparecen otros cuatro que el promedio tapaba.

| | Sin cobertura | De | |
|---|---|---|---|
| **CC 84** | 217,3 km | 292,1 km | 74 % |
| **CC 80** | 115,7 km | 350,4 km | 33 % |
| **CC 81** | 97,5 km | 480,9 km | 20 % |
| **CC 69** | 51,0 km | 421,5 km | 12 % |
| **CC 53** | 36,4 km | 552,4 km | 7 % |
| **CC 55** | 8,9 km | 275,3 km | 3 % |
| **CC 87** | 1,8 km | 225,4 km | 1 % |

Que este número no coincida con el de la tabla no es una contradicción: son dos
preguntas distintas y la de acá es la más fina.

`hooks/useRedLluvia.ts` hace el cálculo **una sola vez** y lo reparte al mapa, al
resumen de kilómetros y a la descarga CSV. Si cada uno lo calculara por su
cuenta podrían llegar a decir números distintos. Partir el GeoJSON en tramos
cuesta ~300 ms y no depende de la fecha, así que se hace una vez; estimar la
lluvia son 40 ms y se rehace en cada período.

Los caminos son `interactive: false`: 9.743 polilíneas recibiendo eventos traban
el mapa. Como entonces no pueden contestar por sí mismas qué tramo son, la
lectura bajo el cursor se resuelve **por afuera de Leaflet**, igual que en los
mapas de las calculadoras: `lib/indiceTramos.ts` indexa los tramos ya extraídos
en la misma grilla de 0,05°, el mapa escucha `mousemove` **a nivel mapa** y un
recuadro al pie muestra designación, consorcio, kilómetros, jurisdicción,
material, los milímetros del tramo y de qué pluviómetro lee.

**No se reusa `RedFondo` para esto**, aunque haga algo parecido: aquél indexa el
GeoJSON crudo que se baja aparte, y acá los tramos ya están partidos y con la
lluvia calculada. Reusarlo significaría bajar y recorrer los 8,6 MB **una
segunda vez** para llegar a los mismos 9.743 tramos que ya están en memoria. Lo
que sí se reusa son sus dos piezas de geometría, que están verificadas:
`distanciaAlSegmentoKm` y `toleranciaKm`.

**Se indexa por segmento, no por tramo.** Un tramo de 50 km cruza muchas celdas;
metido entero en la celda de su primer vértice sería invisible en casi todo su
recorrido. El test lo afirma probando cinco puntos a lo largo del tramo más
largo de la red.

Verificado contra fuerza bruta sobre 42 puntos: misma respuesta, 2 ms contra
435. **Y el primer test estaba mal medido**: cronometraba el índice y la fuerza
bruta dentro del mismo bucle y le atribuía al índice los 10 ms por consulta que
gastaba el control. Los tiempos van en bloques separados.

**La capa de sedes** sale de `datos`, que ya trae la coordenada de cada
consorcio, y no de `geo_bundle.json`: son los mismos 103 puntos y el archivo
pesa 1,3 MB.

#### Si la red vial no carga, hay que decirlo

`useRedLluvia` bajaba los 8,6 MB con un `catch` vacío, justificado con que «la
pantalla sigue sirviendo con los círculos por consorcio». **Los círculos se
sacaron y con ellos se fue el motivo**: hoy, si la descarga falla, el mapa queda
vacío. El comentario quedó defendiendo algo que había dejado de ser cierto, que
es la peor clase de comentario.

Faltaban tres cosas, y las tres se notaban como el mismo síntoma —"a veces entro
y no aparece la capa de caminos"—:

- **Mirar `r.ok`.** Un 404 o un 502 devuelven una página HTML de error; `.json()`
  revienta al parsearla y el `catch` se lo tragaba, con síntoma idéntico al de un
  corte de red.
- **Reintentar.** Tres intentos con espera creciente (400 ms, 800 ms). Una
  descarga de ese tamaño sobre una conexión mala falla de a ratos y anda al
  segundo.
- **Decirlo.** Agotados los intentos, la pantalla muestra qué pasó y un botón
  para reintentar, en vez de un mapa vacío sin explicación.

**Y había una cuarta causa, que no era de la descarga sino del mapa.** El efecto
que dibuja la red dependía sólo de `tramos` y salía si la capa de Leaflet todavía
no existía. El mapa se crea de forma asíncrona: si la red llegaba **antes** —con
el archivo ya en la caché del navegador llega enseguida— el efecto salía y no
volvía a correr nunca, porque `tramos` no cambia más. El mapa quedaba sin caminos
hasta recargar, sin ningún error. Ahora depende también de `mapaListo`, igual que
el que escucha el cursor.

Y una quinta, del mismo molde: las polilíneas también se crean de forma
asíncrona, y el efecto que las pinta corre en el mismo ciclo y las encuentra sin
crear. Si después no cambiaba nada más, quedaban en el gris de recién creadas.
`lineasListas` avisa cuando terminaron.

**Se encontró corriendo el panel en local**, donde el archivo se sirve al
instante y la carrera se pierde siempre: en producción la descarga de 8,6 MB
suele tardar más que el mapa y por eso era "a veces". **Un efecto que sale
temprano porque algo todavía no existe tiene que depender de ese algo**, o no
vuelve.

**El círculo por consorcio se sacó.** Iba en el centro de gravedad de cada red,
con el radio según los milímetros, como resumen para la vista provincial. Una vez
que cada camino lleva su propio número el círculo promedia y tapa justamente lo
que se vino a ver: la tormenta que moja una punta del consorcio y no la otra. El
consorcio se elige desde la lista de la derecha, y elegirlo encuadra el mapa y
atenúa el resto de la red.

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

**El recorte del radio es por rectas tangentes, así que el polígono queda
circunscripto**, no inscripto: pasa los 60 km por 0,05 % en las esquinas y el
área se va 0,08 % arriba del disco. Es lo que hay detrás del "60,183 km" que
informa `verificar-thiessen.ts` como vértice más lejano. Está medido y asumido.

### La media areal por Thiessen — el método del manual

`lib/thiessenAreal.ts` calcula la fórmula clásica, que no estaba:

```
      Σ wᵢ Pᵢ
 P̄ = ─────────
        Σ wᵢ
```

Está para dos cosas: **poder citar el método de manual** —«precipitación media
areal por polígonos de Thiessen», con la tabla de pesos al lado, se defiende
ante cualquiera, mientras que IDW hay que explicarlo— y como **control
cruzado**. Si los dos dan parecido el número está firme; si difieren mucho en un
consorcio, eso mismo es el dato: la cobertura ahí es pobre o la traza está
partida entre zonas con láminas muy distintas. **El número que manda en pantalla
sigue siendo el de IDW.**

**Hay dos pesos y la diferencia no es cosmética.** En hidrología clásica `wᵢ` es
el **área**, porque el objeto que recibe la lluvia es la cuenca y toda ella
cuenta igual. Acá el objeto de interés es la red vial:

| | Peso | Dónde se puede |
|---|---|---|
| `arealPorSuperficie` | km² de zona dentro de la región | provincia, zona ZI–ZV, departamento |
| `arealPorLongitud` | km de camino dentro de la zona | cualquier recorte, incluido consorcio |

**Los 103 consorcios no tienen polígono.** En `geo_cc.json` son 9.772
MultiLineString y nada más; lo único poligonal del proyecto es el límite
provincial, los 25 departamentos y las 5 zonas. Por eso a nivel consorcio el
peso es por longitud, y el panel dice por qué en vez de mostrar un guión. Si
algún día se exporta la capa de límites de CC desde QGIS, entra sin tocar nada:
`arealPorSuperficie` toma cualquier anillo.

Pesar un consorcio por superficie tampoco sería lo que se quiere: le daría peso
a territorio donde no hay ni un camino.

**`areaKm2` exige la latitud de referencia y eso no es comodidad.** El factor
que pasa grados de longitud a km depende de la latitud, así que dos anillos
medidos cada uno con *su propia* latitud media quedan en planos distintos y sus
áreas no son comparables. Todas las zonas de una región se miden con la misma
referencia, **y tiene que ser la que usó `poligonosThiessen` para recortarlas**,
o el área no sería la del polígono dibujado en el mapa. El test lo afirma con un
triángulo que es la mitad de un cuadrado con la misma referencia y deja de serlo
con referencias distintas.

**El promedio se toma sólo sobre la parte cubierta**, y el resto va en
`cobertura`. Repartir el hueco entre las estaciones que sí hay sería inventar un
dato; promediarlo como 0 mm sería inventar sequía. Mismo criterio que
`mm: null` en `redLluvia` y que la zona sin pintar en las isohietas.

**El test no compara la lista de consorcios descubiertos contra la de
`redLluvia`, y no sería válido**: aquella sale de las 71 estaciones que
informaron en un evento real y el test carga las 111 del catálogo. Con otro
conjunto de estaciones el hueco de cobertura es otro. Lo que se afirma son las
invariantes: cobertura en [0,1], y que tener cobertura y tener media sean la
misma cosa.

### Cuencas hídricas

`lib/cuencas.ts` + `public/geo/geo_cuencas.json` — las **13 cuencas** de la
provincia, como capa del mapa de Lluvias (interruptor «Cuencas»).

**Son el primer recorte del sistema que es un polígono con sentido
hidrológico**, y eso es lo que habilitan. Los consorcios son líneas y por eso su
lámina areal se pesa por kilómetros; una cuenca es justamente el objeto para el
que se inventó la precipitación media areal.

En el mapa la capa es de referencia: dibuja el contorno y el rótulo de cada una,
y con la capa prendida la lectura del tramo bajo el cursor dice en qué cuenca
está. El cálculo va en una tabla aparte.

#### La lluvia punto por punto

`leerPunto()` en `lib/lluviaCuencas.ts` + `components/cuencas/LecturaPunto.tsx`
— con la capa de cuencas prendida, pasar el cursor por el mapa muestra los
milímetros en ese punto, cuántos pluviómetros entran, cuál es el más cercano,
en qué cuenca cae y cuánto se aparta de la lámina media de esa cuenca.

- **Es el mismo `estimarPunto` que promedia la lámina areal**, sin respaldo del
  modelo. Pasar el cursor es ver uno por uno los números que la tabla promedió.
  El test lo afirma: el promedio de las lecturas sobre la grilla de cada cuenca
  es su lámina, con 0,005 mm de diferencia.
- **Si hay un camino bajo el cursor manda la lectura del tramo**, que ya dice la
  cuenca. Para leer sólo por punto se apaga la capa Caminos.
- **Es un componente aparte que escucha el mapa por su cuenta.** La posición
  cambia en cada movimiento; guardada en el estado de `MapaLluvia` volvería a
  renderizar el mapa entero por cada píxel. Y calcula una vez por cuadro de
  pantalla, no por evento.
- **Prender la capa desde el mapa pide la lámina** (`onCapaCuencas`):
  `useCuencasLluvia` no calcula nada hasta que alguien mira cuencas, y el
  interruptor de la capa es estado interno del mapa.
- Fuera del radio de todo pluviómetro no hay dato, y se dice igual cuál es el
  más cercano y a cuánto está.

#### La lámina por cuenca

`lib/lluviaCuencas.ts` + `components/PanelCuencas.tsx` — la pestaña Cuencas,
vista «Período elegido». Por cuenca: superficie, lámina
areal, Thiessen, lámina máxima, cobertura y **volumen precipitado** en hm³.

**Se calcula por dos caminos y manda el de IDW**, igual que en toda la pantalla:

| | Cómo | Para qué |
|---|---|---|
| **Lámina areal** | el IDW de siempre, evaluado en una grilla de 2,5 km adentro de la cuenca y promediado | es el número que se muestra |
| **Thiessen** | cada pluviómetro pesa los km² de su polígono dentro de la cuenca | el método de manual, con su tabla de pesos al abrir la fila |

**Que sean dos no es redundancia: es la verificación.** Uno muestrea puntos y el
otro recorta polígonos; no comparten ni una línea de geometría. Con las 71
estaciones activas los dos dan la misma cobertura en las trece cuencas —la
mayor diferencia son 0,13 puntos— y eso no sale por construcción.

Cosas que no son obvias:

- **No hay respaldo del modelo.** Donde no hay pluviómetro a menos de 60 km no
  hay dato: esa parte queda afuera del promedio y va en `cobertura`. Sin
  mediciones de la APA en el período no hay tabla, y se dice por qué — una tabla
  llena de ceros se leería como "no llovió".
- **El Impenetrable (13) tiene 80 % de cobertura** con todas las estaciones
  activas, y es la única que no llega al 100. Su lámina y su volumen describen
  cuatro quintos de la cuenca.
- **El volumen es lámina × superficie *cubierta***, no la total. Un milímetro
  sobre un km² son mil m³. Es aritmética, no un índice: no dice nada de
  escurrimiento ni de cuánta de esa agua llega a un cauce.
- **Sin decimales en pantalla**, como el resto: contra el pluviómetro el error
  es de varios milímetros. El CSV sí lleva uno.
- **La grilla se ancla a múltiplos del paso, no al borde de cada cuenca**, para
  que dos cuencas vecinas compartan grilla y ningún punto caiga en las dos. Y el
  paso en longitud se calcula por fila, así cada punto representa la misma
  superficie y el promedio simple es un promedio por área. El test lo afirma
  contando puntos: se recupera el área de cada cuenca a menos del 1,2 %.
- **El valle del Paraná son doce partes y se promedian juntas**
  (`arealPorPartes` en `thiessenAreal.ts`): se suman los km² de todas antes de
  dividir. Promediar los promedios pesaría igual una isla chica que una grande.
- **El nombre de una cuenca no dice dónde queda.** La «Línea Paraná» no está
  sobre el río sino tierra adentro; el test de la tormenta en el este la
  esperaba mojada por el nombre y falló.
- Las cuencas y la lámina del período llegan por `useCuencasLluvia`, que no
  carga nada hasta que alguien abre la pestaña o la lista de cuencas del mapa.

`scripts/verificar-lluvia-cuencas.ts` no tiene un valor oficial contra el cual
comparar —nadie publicó la lámina por cuenca de un evento—, así que afirma casos
donde la respuesta se sabe sin calcular: con todos los pluviómetros en 30 mm
toda cuenca da 30, sin pluviómetros la lámina es `null` y no cero, y los dos
caminos coinciden en la cobertura.

#### La serie diaria y las láminas máximas en varios días

La segunda vista del panel, «Máximas en varios días»: para cada cuenca, la mayor
lámina areal acumulada en **1, 3, 5 y 7 días corridos** (`VENTANAS_DIAS`), con
las fechas en que pasó. Al abrir una fila se ve el hietograma de la cuenca.

**Varios días y no sólo uno porque el Chaco es llanura.** Con pendientes
menores al 0,1 % el agua no se va por un cauce: se junta. Lo que anega es lo que
se acumula en una semana, no el pico de una tarde, y 60 mm en un día y 60 mm
repartidos en cinco son eventos distintos. El test tiene el caso: el mayor
acumulado de 3 días **no** es el que contiene al día de mayor lámina.

Cómo está hecho:

- **`/api/lluvia/estaciones/diario`** devuelve lo que midió cada pluviómetro día
  por día. La ruta del acumulado no alcanzaba. Guard `requirePermiso('lluvia')`,
  y pagina **con `order`**. Trae **sólo los días con parte**; adentro de un día
  con parte sí van los ceros de todas las activas, que es la misma deducción de
  la ruta del acumulado.
- **No se corre el IDW cada día: se usa que es lineal.** El peso de cada
  estación en un punto depende sólo de las distancias, así que la lámina de una
  cuenca es siempre la misma combinación de pluviómetros. `pesosIdw` calcula
  esos pesos una vez —15 ms— y cada día son 71 multiplicaciones. Correr
  `laminaPorCuenca` por cada día cuesta ~150 ms: con los cincuenta días con
  parte de un trimestre serían unos 7 s.
- **Eso repite las reglas de `estimarPunto` en otro lugar** (radio, potencia, y
  la estación pegada que manda sola; `PEGADO_KM` se exportó para eso). El test
  afirma que los dos caminos dan la misma lámina —la mayor diferencia, 0,005
  mm— y **si alguien cambia una regla en uno solo, falla**.
- **La suma de la serie es la lámina del período.** Es lo que garantiza que esta
  vista y la del acumulado, que se calculan distinto, no puedan decir números
  distintos para lo mismo. También está afirmado.
- **Mira los últimos 90 días**, como la línea de tiempo y el río, y se estira
  hacia atrás si el período elegido es anterior: una máxima de siete días no se
  puede buscar adentro de un evento de dos. `hoy` llega por prop para no leer el
  reloj al renderizar.

**Los días sin parte suman cero, y es una suposición declarada.** La APA publica
sólo cuando llueve, así que casi siempre es cierto — y es la misma deducción que
hace el acumulado en toda la pantalla. Pero si un día llovió y no hubo parte,
las máximas quedan cortas, y la pantalla lo dice.

Por eso el hietograma tiene **tres estados que se distinguen**: barra = llovió,
raya gris = hubo parte y la cuenca dio cero, vacío = la APA no publicó parte.
Los dos últimos casi siempre significan lo mismo, pero uno es una medición y el
otro una deducción.

**Esto no es un índice de humedad antecedente**, que se descartó (ver «Lluvia —
para qué es la pantalla»). Son sumas de lluvia medida en ventanas fijas: no
llevan un coeficiente de decaimiento ni dicen nada del estado del suelo o de un
camino.

Si dos ventanas empatan se informa la más reciente. `laminaMaxima` devuelve
`null` —no cero— cuando la serie no tiene ningún día con parte.

#### La red vial y las obras de arte por cuenca

`lib/redCuencas.ts` + `components/cuencas/VistaRed.tsx` — la tercera vista del
panel. Por cuenca: km de red, qué parte es de tierra, km que recibieron 10, 25,
50 y 100 mm o más (los cortes del mapa), km sin dato, y cuántos puentes,
alcantarillas y tubos relevados hay adentro. Al abrir una fila se listan esas
obras, de la que más lluvia recibió a la que menos.

**Son dos universos y la pantalla no los deja confundir:**

| | Qué es | Está completo |
|---|---|---|
| **La red** | la traza de los caminos de consorcio de `geo_cc.json` | sí, salvo los huecos del CC 96 y el CC 49 |
| **Las obras de arte** | los relevamientos de tipo Puente, Alcantarilla y Tubos | **no**: son las relevadas con la app, no un inventario |

Cosas que no son obvias:

- **Se reparte por muestra, no por tramo.** Un tramo largo cruza de una cuenca a
  otra, y asignarlo entero a una le regalaría kilómetros. Las muestras —una cada
  2 km, con el largo que representan— son las mismas que usa el IDW de la red.
- **Los caminos del límite provincial van a la cuenca de al lado.** Con la
  contención a secas **483 km de red quedaban fuera de todas las cuencas**. Se
  midió dónde estaban antes de decidir nada: 473 a menos de 1 km del límite
  provincial, y ninguno en un hueco entre dos cuencas — son las picadas
  limítrofes, y el contorno de las cuencas corre unos cientos de metros por
  adentro. `TOLERANCIA_BORDE_KM` = 1 los asigna a la cuenca más cercana; queda
  afuera menos de 1 km, y la fila «Fuera de las cuencas» sólo aparece si tiene
  algo. Las obras de arte usan la misma tolerancia.
- **La lluvia de cada muestra es la de su tramo**, no un IDW nuevo en la
  muestra. Así la suma de las cuencas es exactamente `kmSobre` de la red entera,
  y el test lo afirma para los cuatro umbrales: dos tablas de la misma pantalla
  no pueden contradecirse.
- **Los km son de traza** —28.756 en total—, no los declarados en la ficha de
  cada consorcio. La pantalla lo dice, por lo de siempre: hay dos números de
  kilómetros y hay que decir cuál es.
- **La lámina de una obra es la que cayó en su punto, no el agua que le llega.**
  Eso depende de la cuenca de aporte de cada alcantarilla, que no se conoce sin
  un modelo de elevación. Sirve para ordenar por dónde llovió más, no para decir
  cuál trabajó al límite.
- **`/api/lluvia/obras-de-arte` existe en vez de leer `relevamientos` desde el
  navegador**, como hacen las otras pantallas, porque quien tiene el permiso de
  Lluvias puede no tener el de Relevamientos. Entrega sólo tipo, coordenada y
  ruta — ni fotos, ni observaciones, ni quién lo cargó. Guard
  `requirePermiso('lluvia')`. Los relevamientos sin coordenada se cuentan aparte
  en vez de perderse.
- Asignar las ~15.000 muestras cuesta ~300 ms y no depende de la fecha: se hace
  una vez al abrir la vista. Probar primero la última cuenca en la que cayó una
  muestra lo bajó a la mitad, porque la siguiente casi siempre repite.

`components/cuencas/piezas.ts` son los formatos y estilos de tabla que comparten
las cuatro vistas.

#### Los ríos internos: qué hizo el agua después

`lib/riosInternos.ts` + `app/api/lluvia/rios-internos/route.ts` +
`components/cuencas/VistaRios.tsx`, la sexta vista del panel. Una fila por
escala del INA con la última altura, el cambio en 7 días, la mínima y la máxima
de la ventana y la serie en miniatura. Al abrir una fila, dos franjas con el
mismo eje de tiempo: la lámina diaria de la cuenca arriba y la altura abajo.

**Es la primera observación del sistema de qué hace el agua después de la
lluvia**, que es lo que el plan del balance hídrico pide antes de cualquier
modelo. No es el Paraná: éstos sí responden a lo que llueve acá.

Siete escalas, con altura media diaria desde 09/2024:

| Curso | Escala (id del INA, serie) | Cuenca |
|---|---|---|
| Río Negro | Philipon (7295, 38276) | 6 |
| Río Negro | Laguna Blanca (6432, 38058) | 6 |
| Río Negro | San Fernando (7296, 38277) | 6 |
| Río Salado | RN 11 (6633, 38041) | 6 |
| Arroyo Tapenagá | Estancia Tapenagá (7184, 38205) | 8 |
| Canal Línea Paraná | Tramo IV (7190, 38211) | 10, a la salida |
| Canal Línea Paraná | Los Amores (7193, 38214) | 10, a la salida |

- **Se eligieron estaciones, no se filtran lecturas.** El INA lista más de
  veinte escalas en la provincia; se miró la serie de cada una y quedaron las
  que se leen como un río —crecida tras la lluvia y bajante lenta—. Afuera: la
  Obra de Control del Negro (piso fijo en 1,21 m), Canal Soberanía (una
  compuerta que se opera), Laguna María Cristina (puntas de −8 m), Bajo
  Chorotis (piso en −2,50 y una punta de 12 m), PF El Aguará (escalones) y las
  tres del Bermejo (puntas de metros, y agua que viene de los Andes). La lista
  con el motivo está en la cabecera de `riosInternos.ts`.
- **No pasan por `depurar()`**, que descarta saltos de más de 2 m: está pensado
  para el Paraná. El Negro en Laguna Blanca subió 2,34 m en un día el
  15/04/2026, y San Fernando 1,23 m el mismo día: es una crecida, no basura.
  Para esto se agregó `observacionesDeSerie()` en `ina.ts`.
- **Dos franjas y no dos líneas en un eje**, por lo mismo que en el Paraná:
  milímetros y metros no comparten eje vertical. Comparten el horizontal.
- **La franja de la altura va de su mínima a su máxima, no desde cero.** El
  cero de cada escala es arbitrario y ninguna está vinculada: no se comparan
  entre sí en metros ni contra el terreno. Una altura negativa es agua bajo el
  cero y es un dato.
- **No hay niveles de alerta**: el INA no publica ninguno para estas escalas y
  no se inventan.
- **Las dos del canal están fuera de los polígonos de cuencas** —sobre el
  límite sur y 12 km adentro de Santa Fe—, así que la cuenca no se les asigna
  por posición sino por el canal que miden. El test lo comprueba contra la
  traza de `geo_hidro.json`: están a 0,6 y 0,9 km de un canal principal del
  sistema Línea Paraná. Subiendo derecho al norte desde Los Amores se entra a
  La Rica - Sábalo, no a Línea Paraná.
- **La escala sólo ve lo que drena aguas arriba de ella**, y la lámina que va
  al lado es la de la cuenca entera. La pantalla lo dice.
- **Una estación atrasada se ve atrasada.** Philipon no informa desde el
  17/08/2026 y el Salado desde el 20/08: van en la tabla con la fecha en
  naranja y un aviso de que el número no es de hoy (`DIAS_ATRASO` = 3).
- **El cambio en 7 días es contra el día exacto**, no contra la lectura más
  cercana: si ese día no hay lectura, no hay cambio.
- **La ruta va de a una estación, no en paralelo**, como `/api/rio`: el INA deja
  de contestar ante una ráfaga. Tarda 3 a 4 s y se cachea una hora. Guard
  `requirePermiso('lluvia')`. Si no contesta ninguna da 502, no una lista vacía.
- **`timeend` es un instante**: con la fecha a secas el INA deja afuera la
  lectura de ese día, marcada a las 03:00 UTC. Se pide un día de más y se
  recorta.
- De paso se sacó un pedido repetido en `observadasDeSerie()` de `ina.ts`: bajaba
  la serie, la descartaba y la volvía a bajar.

**Lo que se vio al abrir la vista, el 05/10/2026: a `mediciones_lluvia` le
faltaban casi todos los partes.** El Negro en Laguna Blanca había subido de
2,0 a 5,2 m entre el 3 y el 8 de agosto y la franja de lluvia de su cuenca
estaba vacía. No era que no hubiera llovido: la APA tenía 168 fechas con parte
y la tabla 11, todas desde el 10/09/2026. Todo lo que usa la serie diaria por
cuenca —«Máximas en varios días», lo medido del pronóstico y esta vista— veía
sólo esas fechas, sin avisar. El acumulado por consorcio no estaba afectado: la
fusión lee los partes de la APA en vivo, no de esta tabla.

Ya está importado entero (3.425 mediciones, 168 fechas), y con eso la franja
muestra 12 mm el 01/08 y 30 mm el 03/08 sobre la cuenca, y el río llegando a su
máxima cinco días después. Salieron tres cosas:

- **La importación no podía terminar nunca, por una lectura sin paginar.** Para
  saltear lo ya importado la ruta pedía las fechas con `importado_en`, una
  fila por medición, y Supabase corta en mil. Pasadas las mil mediciones el
  conjunto venía incompleto y cada corrida volvía a traer las mismas 25 fechas:
  decía que había guardado, y el contador de pendientes no bajaba. **Se
  encontró porque un bucle que tenía que terminar en siete corridas no
  terminaba.** Ahora pagina con `order`.
- **Las métricas de Precisión se calculaban sobre mil mediciones**, no sobre
  todas: el GET tenía `.limit(5000)`, que no levanta el tope de mil filas por
  pedido. Con la tabla llena mostraba 1.000 mediciones en 56 eventos como si
  fuera el total. También pagina. **En este repo, toda lectura que pueda pasar
  de mil filas va con `range()` y `order`; `.limit()` solo no alcanza.**
- **La serie diaria ahora dice lo que le falta.** `/api/lluvia/estaciones/diario`
  le pide a la APA la lista de fechas publicadas y devuelve `faltan`: las que
  están en el rango y no tienen filas (`partesFaltantes()` en
  `lluviaCuencas.ts`). Las tres vistas muestran un aviso con cuántas son y
  entre qué fechas. `faltan: null` es «la APA no contestó, no se pudo
  comprobar», y también se dice: no es lo mismo que «no falta nada». El aviso
  no lleva botón: importar es de administrador y gasta cupo.

**El cron de las 12:00 importa los partes nuevos.** Antes la tabla se llenaba
sólo con el botón Importar, y un paso manual que hay que hacer cada vez que
llueve es un paso que se olvida. La lógica se sacó de la ruta a
`lib/importarPartes.ts`, que usan el botón y el cron: trae lo que falte de los
últimos 30 días —lo normal es una fecha o ninguna— con `cargado_por` en null.
Con eso el aviso queda para cuando algo falla de verdad. Un fallo de la
importación no frena el recálculo: queda en el log.

`scripts/verificar-rios-internos.ts` no sale a la red: afirma el catálogo
contra las cuencas y los canales, y el armado de la serie y su resumen.

#### Sentinel-1: lo que se probó, y por qué no se usa

Era el paso 2 del plan del balance hídrico: la superficie anegada por cuenca
después de cada evento, como observación. **Se midió el 05/10/2026 y el
producto disponible no sirve para eso en el Chaco.** No hay pantalla; queda
`scripts/explorar-gfm.mjs` para repetir la medición.

**La fuente es buena y está abierta**, que es lo que conviene no volver a
averiguar: el *Global Flood Monitoring* de Copernicus publica, por cada pasada
de Sentinel-1 desde 2015, el agua observada, lo inundado y una máscara de
exclusión, a 20 m. Catálogo STAC en `stac.eodc.eu` (colección `GFM`) y
archivos en `data.eodc.eu`, sin cuenta ni clave. Se leen desde Node sin
dependencias: son TIFF con ZSTD.

Lo medido, sobre un año de pasadas (09/2025 a 10/2026) en el mosaico del este
de la provincia, cruzado con los partes de la APA y la altura de los ríos:

- **Más de la mitad del terreno está excluido.** La máscara de exclusión cubre
  el 65 % de Negro - Salado, el 42 a 56 % del Tapenagá y un tercio de Línea
  Paraná: monte y vegetación densa, donde el radar de banda C no ve el agua.
- **Donde ve, detecta muy poco.** En los 5.091 km² de Negro - Salado lo
  inundado fue de 0,5 a 7,4 km² en todo el año. El 14/08/2026, con el Negro en
  4,29 m en Laguna Blanca —bajando de una crecida de 5,22—, dio 1,2 km²: lo
  mismo que un día cualquiera. El agua de una crecida de llanura está debajo de
  vegetación o es una lámina con plantas emergentes, y eso no se detecta.
- **En Línea Paraná no sigue a la lluvia, y a veces va al revés.** 193 km² el
  20/05/2026 sin lluvia en la semana; 99 y 107 km² en septiembre con 1 a 7 mm
  y el canal bajo; y **0,1 km² el 14/04/2026, después de la semana más
  lluviosa de la serie** (83 mm de media, 173 en una estación). Es lo que hace
  un suelo desnudo, seco y liso: se ve oscuro como el agua, y cuando se moja
  deja de verse así. Buena parte de lo que marca ahí no es agua.
- **La revisita no alcanza para un evento.** Una misma órbita vuelve cada 12
  días. La crecida del Negro de agosto culminó entre el 8 y el 9; las pasadas
  que cubren la cuenca entera fueron el 2 y el 14.
- Sí vio el encharcamiento del 22/12/2025 (7,4 km², el máximo del año en Negro
  - Salado), con la pasada el mismo día en que empezó a subir el río. Ve el
  agua recién caída en campo abierto, no la crecida.

**El servicio de estadísticas de EODC (titiler) no sirve para esto**: falla en
la mayoría de las escenas y decima el archivo. Se leen los TIFF.

**Lo que queda como observación son las escalas del INA** (la vista «Ríos
internos»), que sí responden. Si se vuelve sobre el satélite, lo que falta
probar es otra cosa: la retrodispersión cruda de Sentinel-1 contra su propia
historia en cada píxel —EODC publica `SENTINEL1_SIG0_20M`—, o el agua de la
clasificación de escena de Sentinel-2, que es óptico y no ve con nubes.

#### En diciembre de 2025 llovió y la APA no publicó ningún parte

Salió de mirar las escalas contra los partes. Entre el 20 y el 26/12/2025
subieron a la vez las cuatro: el Negro en Laguna Blanca de −0,03 a 5,07 m, en
San Fernando de 1,19 a 3,23, el Tapenagá de 1,79 a 3,48 y el canal Línea
Paraná de 1,01 a 1,54. **La APA no tiene ningún parte entre el 01/12 y el
31/12/2025.**

Es el caso que la pantalla declara como posible —«si un día llovió y no hubo
parte, estos números quedan cortos»— y acá es un mes entero con el evento más
grande del período adentro. Consecuencias que hay que tener presentes:

- **«Día sin parte = no llovió» no vale para diciembre de 2025.** Las láminas
  por cuenca, las máximas en varios días y la procedencia `sin_parte` de ese
  mes describen la falta de dato, no la falta de lluvia.
- Lo único que hay para ese mes es la serie modelada de Open-Meteo, que no pasa
  por los pluviómetros.
- **Las escalas sirven de control de los partes, y la vista «Ríos internos» lo
  avisa.** `crecidasSinParte()` en `riosInternos.ts`: si dos cursos de agua
  distintos suben 0,5 m o más en tres días y no hay ningún parte desde cinco
  días antes, lo que falta es el parte. Dos escalas del mismo río no alcanzan,
  y una sola puede ser una compuerta. **Es un control de los datos de lluvia,
  no un aviso de crecida.** Sobre el año de 09/2025 a 10/2026 hay siete
  crecidas y marca una sola, la de diciembre; con el umbral en un metro o
  contando escalas en vez de cursos da lo mismo. El aviso aparece cuando la
  ventana que se mira incluye la crecida: en los 90 días de siempre, hoy no
  hay ninguna.
- **Primero se arma la crecida entera y después se le busca el parte.** La
  primera versión miraba día por día, y un río que sigue subiendo varios días
  después de la lluvia quedaba «sin parte» al final de una crecida que sí lo
  tenía. Lo atrapó el test, con un parte cinco días antes.
- Para esto `/api/lluvia/estaciones/diario` devuelve también `publicadas`, las
  fechas con parte según la APA: una fecha publicada y sin importar no es un
  día seco.
- La pregunta abierta para la APA de `docs/lluvia-pendientes.md` —¿publican
  parte sólo los días que llueve?— tiene acá una respuesta parcial: al menos
  ese mes, no.

#### El pronóstico por cuenca

`lib/pronostico.ts` + `app/api/lluvia/pronostico/route.ts` +
`components/cuencas/VistaPronostico.tsx`, la quinta vista del panel. Por
cuenca: lo medido en los últimos 7 días y lo pronosticado para mañana, 3 y 7
días, la probabilidad de juntar 25 mm en tres días, la ET₀ y el balance
climático. Al abrir una fila, siete días medidos y catorce pronosticados en el
mismo hietograma.

Es el paso 1 de tres que se acordaron el 02/10/2026: **(1)** el pronóstico
como suma de lluvia; **(2)** manchas de agua de Sentinel-1 por cuenca, como
observación; **(3)** recién entonces suelos y humedad, para un balance hídrico
que se pueda verificar contra esas manchas. Sin el paso 2, un balance con
suelos sería una hipótesis presentada como resultado — el mismo motivo por el
que se descartó el índice de humedad antecedente.

- **La fuente es el pronóstico por conjuntos de ECMWF** (IFS 0,25°, 51
  corridas, 15 días) de `ensemble-api.open-meteo.com`, sin clave. **Windy se
  evaluó y no sirve como fuente**: su API cuesta 990 € por año, la gratuita
  devuelve "datos mezclados al azar y levemente modificados", no incluye ECMWF
  por licencia y no guarda pronósticos pasados. Es un visor de los mismos
  modelos públicos.
- **Se muestra como rango, no como un número**: mediana y p10–p90. Mismo
  criterio que la banda del INA.
- **Se promedia por corrida y recién después se saca el rango**, y las
  ventanas de varios días suman por corrida. Promediar o sumar percentiles da
  un rango más ancho que el real; el test lo afirma con dos puntos que se
  compensan corrida a corrida (rango de 10 a 90 cada uno, 50 fijo la cuenca).
- **Grilla de 0,25°, la resolución nativa del modelo: 137 nodos.** Todas las
  cuencas tienen al menos uno adentro; Quiá y el valle del Paraná, uno solo, y
  la pantalla lo dice. Si alguna quedara sin nodo, toma el más cercano a su
  rótulo (`prestado`).
- **El día de hoy no entra**: el diario de hoy arranca a las 00:00, horas que
  ya pasaron.
- **La ruta cachea 3 horas** (ECMWF corre cada 6). Son 137 ubicaciones por
  consulta contra el cupo de Open-Meteo, que se cuenta por ubicación: con la
  caché, a lo sumo ~1.100 por día, sumadas a las ~453 de la ingesta. **No pasa
  por `consultarPuntos()`**, que es de la API de archivo.
- **Lo medido y lo pronosticado no se suman en ningún número**, y van en
  colores distintos (azul medido, violeta claro pronóstico). El violeta de las
  cuencas en el mapa es otro tono y no aparece en esta vista.
- **El balance es la mediana de la lluvia menos la ET₀**, no cuánta agua se
  queda. La pantalla lo dice.
- **Cada día se guarda el pronóstico emitido**, para medir después cuánto
  acierta contra la APA: el servicio no ofrece pronósticos pasados, así que lo
  que no se guarda no se puede verificar nunca. Tabla `pronostico_lluvia`
  (`docs/sql/13-pronostico-registro.sql`), **por nodo y con las 51 corridas**,
  no promediado por cuenca: mismo criterio que `mediciones_lluvia` por
  estación — la agregación es una decisión de cálculo que puede cambiar. Una
  fila por día y por nodo (137), con los mm en un arreglo plano
  `dias × corridas`; `filasRegistro` y `pronosticoDeFilas` hacen la ida y la
  vuelta, y el test la afirma.
- **Lo guarda el cron de las 12:00** (la rama de las 15:00 UTC de
  `/api/lluvia/ingesta`), no el de la mañana, que ya está cerca del minuto. Un
  fallo del registro no frena el recálculo de la fusión: queda en el log.
  **Por eso el pie de la vista dice cuántos días hay guardados y avisa si el
  último tiene más de un día**: un registro que se corta en silencio se
  descubre meses después, cuando se va a medir. Un admin puede guardar el del
  día a mano (`POST /api/lluvia/pronostico/registro`).
- **La consulta a Open-Meteo está en `lib/pronosticoFuente.ts`**, compartida por
  la ruta que muestra y el cron que guarda: lo que se verifica tiene que ser lo
  que se mostró.
- **La comparación contra la APA todavía no está hecha**: hacen falta semanas de
  registro antes de que diga algo. Cuando se haga, va sobre todos los días —los
  sin parte cuentan como cero deducido— y no sólo sobre los días con lluvia
  (ver «Cuidado con las métricas condicionadas»).

`scripts/verificar-pronostico.ts` no sale a la red. Una consulta real del
02/10/2026 tardó 2 s y la respuesta propia pesa 263 KB.

#### Cursos de agua, canales y cruces con la red

`lib/hidrografia.ts` + `public/geo/geo_hidro.json`, la cuarta vista del panel
(`components/cuencas/VistaHidro.tsx`) y tres capas del mapa de Lluvias bajo
«Hidrografía»: cursos de agua, canales y cruces con la red.

**Hasta acá una cuenca era un contorno.** Se sabía cuánta lámina le cayó y
cuántos km de camino tiene adentro, pero no por dónde corre el agua. Con los
cursos se puede preguntar lo que le importa a un camino: **dónde lo cruza el
agua**, que es donde tiene que haber una obra de arte.

Dos orígenes, los dos en `docs/geo/hidrografia/`, que se complementan:

| | Qué es | Dónde | En el archivo |
|---|---|---|---|
| `rios_ign.kml` | hidrografía del IGN a 1:250.000 | toda la provincia | 1.137 cursos, 12.383 km |
| `canales/` | shapefiles del sistema de canales de la Línea Paraná | el sudoeste | 110 canales, 1.752 km |

El IGN casi no tiene cursos en el sudoeste —91 km en los Bajos de Chorotis— porque
ahí no hay drenaje natural organizado: el agua sale por canales, y los canales
son la otra capa.

El archivo se **genera** —no editar a mano—:

```bash
cd admin && node scripts/build_hidrografia.mjs
```

**Los cruces: 1.208** entre la red de consorcios y los cursos y canales — 195
sobre cursos permanentes, 610 sobre no permanentes y 403 sobre canales.
`crucesConRed()` los calcula en el navegador en ~100 ms, segmento contra
segmento con una grilla; `crucesDe()` guarda el resultado, y el mapa y la tabla
reciben **el mismo arreglo**.

Cosas que no son obvias:

- **No son un inventario de obras de arte, y la pantalla lo dice.** Un cruce
  dice que ahí el camino pasa sobre un curso que figura en la carta, no qué hay
  construido. A 1:250.000 faltan los cursos menores: que un tramo no tenga
  cruces no quiere decir que no tenga alcantarillas. La posición vale al
  centenar de metros.
- **Un camino al costado de un canal no lo cruza** (`ANGULO_MINIMO` = 30°). En
  el sudoeste muchos canales corren al lado de un camino —hay uno que se llama
  «Ruta Nac. Nº 89»—, y dos líneas paralelas dibujadas por separado se pisan
  una y otra vez. Lo que distingue un cruce de un roce es el ángulo.
- **Varios cortes del mismo curso en menos de 300 m son un cruce**
  (`SEPARACION_KM`): un arroyo con meandros corta tres veces la misma recta, y
  en el terreno es un puente.
- **Cada segmento de agua va en todas las celdas que toca su caja**, no sólo en
  las de sus extremos como en `IndiceTramos`: la traza está simplificada y hay
  segmentos de kilómetros. El test lo compara contra fuerza bruta.
- **Contra las obras relevadas: 9 de 1.208** cruces tienen una a menos de 500 m
  (`TOLERANCIA_OBRA_KM`), y de las 46 obras relevadas, 9 están cerca de un
  cruce (02/10/2026). La diferencia es lo que falta relevar, no lo que falta
  construir. Las otras 37 están sobre cursos que la carta no tiene o sobre
  caminos que no son de consorcio.
- **«Fuera de las cuencas» acá no es un resto**: son los ríos limítrofes
  —Bermejo, Teuco, Paraná, Paraguay, 976 km— y los 231 km del canal troncal que
  salen de la provincia por el sur.
- **La densidad de drenaje depende de la escala de la carta.** Sirve para
  comparar una cuenca con otra —0,46 km/km² en el valle del Paraná contra 0,01
  en el Impenetrable—, no contra valores de otra fuente.
- **El reparto por cuenca se guarda** (`kmPorCuenca`). La primera versión lo
  rehacía cuando llegaban las obras de arte y tardaba dos segundos con la
  pantalla trabada: preguntaba por cada segmento suelto, 75 mil consultas para
  14 mil km. Ahora junta los segmentos cortos hasta completar un kilómetro y
  prueba primero la cuenca del pedazo anterior: 240 ms, una vez.
  **Se encontró abriendo la vista, no con el test**, que pasaba igual.
- **El agua va en verde azulado y los canales en verde claro, no en azul.** El
  azul es de la lluvia leve y moderada, y el violeta de las cuencas. Permanente
  o no se distingue por el trazo, lleno o a rayas.
- **Los cruces van en un panel arriba de los caminos** (`cruces`, z-index 410) y
  las líneas debajo (`hidro`, 385). Los puntos debajo de la traza no se veían.
- **Ninguna capa recibe el cursor.** El nombre del curso lo contesta
  `LecturaCurso` con `IndiceCursos`, por afuera de Leaflet, y va arriba al lado
  del panel de capas: el pie del mapa ya es de la lectura del tramo.

Lo que se le hace a los datos, y lo que no:

- **La Ñ se perdió al exportar el KML** (CA�ADA) y se repone.
- **Los nombres del IGN vienen en mayúsculas y sin tildes.** Se les pone la
  tilde a los topónimos conocidos (`TILDES` en el script). «GUAYEURU CHICO SUR»
  es una errata del origen y se corrige.
- **Los nombres de los canales están cortados a 16 caracteres** por el .dbf
  («Dfsa Oeste La Cl»). Se completan sólo los que no admiten otra lectura; el
  resto queda cortado.
- **La traza se simplifica a 10 m**: de 188 mil vértices a 74 mil, perdiendo el
  0,2 % del largo.
- **De las siete capas del zip de canales se usan dos y un canal de una
  tercera.** `posgar_canales` (106, con módulo y clasificación) y `linea parana`
  (el troncal, 410 km). `canales` es la primera en otro datum; `Canales/canales`
  es una versión anterior de la que se toma sólo el Paralelo 28º Este;
  `Canales_2do` es una exportación de CAD a 70 m de la otra, con ~130 km de
  colectores que quedan afuera porque no hay cómo saber qué traza vale.
- **Los canales son los de la Línea Paraná.** No están los del área
  metropolitana ni las defensas, ni hay esteros ni lagunas: sigue siendo un
  pedido a la APA.

**El datum de los shapefiles sin .prj, y lo que dice de las cuencas.**
`canales.shp` y `posgar_canales.shp` son la misma capa en dos sistemas:
comparadas vértice por vértice, el corrimiento es constante, −59,9 m al este y
−214,0 m al norte. Es Campo Inchauspe contra POSGAR. `linea parana` comparte
coordenadas con `canales.shp`, así que está en Campo Inchauspe y se le aplica el
corrimiento; el test lo afirma por un lado independiente —las puntas de los
secundarios llegan al troncal a 4 m de mediana, y sin el corrimiento quedarían
a 220—. **En esa carpeta, lo que viene sin .prj está en Campo Inchauspe.** El
shapefile de cuencas tampoco trae .prj y se supuso POSGAR con evidencia débil.
No se sabe si son del mismo origen y no se cambió nada, pero es un indicio en
contra de esa suposición.

`scripts/verificar-hidrografia.ts` afirma el archivo contra su origen, la
geometría de un cruce con casos donde la respuesta se sabe sin calcular, y sobre
la red real que cada cruce está sobre su camino y sobre su curso.

| | Cuenca | ha |
|---|---|---|
| 1 | Bermejo - Bermejito | 1.121.550 |
| 2 | Oro | 363.961 |
| 3 | Guaycurú - Iné | 904.342 |
| 4 | Quiá | 93.099 |
| 5 | Tragadero | 207.503 |
| 6 | Negro - Salado | 1.024.132 |
| 7 | Polvorín - Palometa | 518.194 |
| 8 | Tapenagá | 1.268.056 |
| 9 | La Rica - Sábalo | 425.476 |
| 10 | Línea Paraná | 1.361.778 |
| 11 | Bajos de Chorotis | 670.819 |
| 12 | Valle de inundación del río Paraná | 116.862 |
| 13 | Impenetrable | 1.882.213 |

El archivo se **genera** —no editar a mano— desde el shapefile que está en
`docs/geo/cuencas/`:

```bash
cd admin && node scripts/build_cuencas.mjs
```

**Va en Node y sin dependencias, no en Python como los otros `build_`**: en la
máquina donde se trabaja este repo no hay Python instalado. Lee el `.shp` y el
`.dbf` a mano y reproyecta con la serie de Krüger.

**El shapefile no trae `.prj`, y el datum es una suposición.** La proyección no:
X entre 5.156.000 y 5.661.000 es falso este de 5.500.000, Gauss-Krüger faja 5.
Pero entre POSGAR y Campo Inchauspe hay unos 200 m y el archivo no dice cuál.
Se compararon las dos contra el límite provincial del bundle y las tres medidas
favorecen a **POSGAR** (extremo norte a 44 m contra 254; este a 33 contra 90;
corrimiento sistemático 0 contra 30 m), **pero la evidencia es débil**: el borde
de las cuencas se aparta 335 m de mediana del límite con cualquiera de los dos.
Para promediar lluvia de pluviómetros que están a decenas de km, 200 m no mueven
ningún número. Si aparece el `.prj`, se corrige `ELIPSOIDE` en el script y se
regenera.

Cosas que no son obvias:

- **El borde de las cuencas no es el límite provincial.** Son dos trazados
  distintos: las cuencas se pasan 4,5 km al oeste y se quedan 1,7 km cortas al
  sur. Suman 99.580 km² contra los 99.633 de la provincia.
- **La capa no recibe el cursor** (`pointerEvents: none` en su panel, y
  `interactive: false`): son polígonos que cubren la provincia entera y se
  comerían los eventos de todo lo demás. Por eso el nombre de la cuenca va en
  rótulos fijos y en la lectura del tramo, no en un tooltip.
- **El rótulo no va en el centroide.** Varias cuencas son alargadas y curvas, y
  el centro de gravedad de una forma así cae afuera, sobre la cuenca de al lado.
  `puntoInterior` toma el punto medio del tramo interior más ancho.
- **La cuenca de un tramo se pregunta por su punto medio.** Un tramo largo puede
  cruzar de una a otra.
- **Los nombres del `.dbf` vienen sin tildes** y se corrigen en el script; el
  original queda en `nombreOrigen`.
- El valle del Paraná (12) son doce partes sueltas. No hay huecos en ninguna, y
  el script falla si aparece uno en vez de armarlo mal.

`scripts/verificar-cuencas.ts` afirma lo que sí se puede: que el área medida de
cada polígono reproyectado coincide con las hectáreas que declara el origen (la
que más se aparta, 0,54 %) y que las 103 sedes de consorcio caen cada una en
una sola cuenca. Con la faja equivocada o los ejes cruzados, ninguna de las dos
cierra. **No puede afirmar el datum.**

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

## El río Paraná — Alerta Hidrológico del INA

`lib/ina.ts`. **Es la segunda amenaza y no es la misma que la lluvia.**

La crecida se genera en las cuencas altas —Paranaíba, Grande, Iguazú, y el
Paraguay por el Pantanal—, a miles de kilómetros y con días o semanas de
retardo. **Lo que llueve en Chaco no mueve la altura en Barranqueras.** Por eso
el módulo no se mezcla con `lib/fusion.ts`: se traen las dos series, se las
muestra sobre el mismo eje de tiempo, y la coincidencia la lee el que mira.

Que sean independientes es lo que las vuelve peligrosas juntas: **con el río en
cota alta el agua de una tormenta local no tiene dónde ir**, porque el río le
pone condición de borde al drenaje. No se suman, se condicionan. Modelar eso
necesita cotas y un modelo hidráulico; hasta entonces el sistema muestra las dos
series y no afirma nada sobre su combinación.

**Y el río se pronostica mejor que la lluvia**, al revés de lo que uno supone: el
INA emite a ~11 días porque el agua ya está en tránsito. Para anticipar, esta
serie es el dato más fuerte que hay.

### La API

`alerta.ina.gob.ar/a5` — **lectura abierta, sin token** (la `apiUI` de gestión sí
pide sesión, pero no hace falta para leer). Verificado el 26/09/2026:

```
GET /a5/obs/puntual/estaciones?format=json              → 4.683 estaciones
GET /a5/obs/puntual/series?estacion_id=N&format=json    → series de una estación
GET /a5/obs/puntual/series/{id}/observaciones
      ?timestart=…&timeend=…&format=json                → [{timestart, valor}]
GET /a5/sim/calibrados/{cal_id}/corridas/last
      ?series_id=N&includeProno=true&format=json        → el pronóstico
```

Cuatro cosas que importan:

- **Los umbrales los pone el organismo.** Cada estación trae `nivel_alerta` y
  `nivel_evacuacion`. **No se inventa ninguno acá** — mismo criterio que con la
  procedencia de la lluvia: el número y la autoridad que lo respalda salen
  juntos de la fuente. Y son **por estación**: Goya evacúa a 5,7 m y Corrientes
  a 7, así que `estadoDe()` exige la estación y no acepta una altura suelta.
- **El pronóstico es una banda, no una línea.** Cada punto trae
  `qualifier: inferior | medio | superior`. Dibujar sólo el medio sería
  presentar como certeza algo que la fuente entrega como rango.
- **Se usa la serie de medición directa, no la simulada.** El número que se
  muestra tiene que ser el que alguien leyó en la escala. Mismo criterio que los
  pluviómetros frente al modelo.
- **El registro largo es el de Barranqueras, desde 1906** (ver «Recurrencia y
  permanencia en Barranqueras»).
- **Corrientes tiene altura medida desde 1901** —47.954 registros— y caudal
  desde 1910. Acá el histórico profundo **ya existe**, al revés de la lluvia
  donde tenemos un año. Eso permite decir "es la mayor en N años", que es la
  lectura que a la lluvia le falta.

### Cómo se muestra: dos franjas, no dos líneas en un eje

`components/PanelRio.tsx` + `app/api/rio/route.ts`.

La tentación es superponer río y lluvia en el mismo gráfico. **Sería
incorrecto**: una serie está en milímetros de lámina y la otra en metros de
altura. Un eje Y compartido entre dos magnitudes distintas no significa nada y,
peor, invita a leer cruces y paralelismos que son artefactos del escalado. Van
en **franjas apiladas que comparten el eje X**: la coincidencia en el tiempo
—lo único que se quiere ver— se lee de un vistazo y ninguna altura se compara
contra ningún milímetro.

**El eje vertical incluye siempre los dos umbrales**, aunque el río esté muy por
debajo. Escalar sólo a los datos dejaría la línea de evacuación fuera del dibujo
justo cuando el río está tranquilo, y entonces el gráfico no muestra cuán lejos
está de ella — que es la única lectura que importa.

**La ruta pasa por el servidor y no la pide el navegador**, por tres motivos en
orden: no sabemos si el INA sirve CORS; son doce pedidos por pantalla —serie y
pronóstico de seis estaciones— y multiplicarlos por cada navegador es maltratar
a un organismo público sin motivo; y desde el servidor se puede cachear media
hora, que es lo que tarda en haber algo nuevo.

`Promise.allSettled` y no `all`: **una estación caída no puede tirar abajo las
otras cinco**. Lo que no llegó se informa con `fallaron`, para que un panel con
cuatro de seis diga que faltan dos en vez de mostrarse completo.

**El guard es `requirePermiso('lluvia')`**, el permiso de la pantalla que lo
consume. Las cuatro lecturas de lluvia que quedaban con `requireAdmin()` —que
sólo verifica sesión— se emparejaron el 05/10/2026: `/api/lluvia`,
`/api/lluvia/serie`, `/api/lluvia/estaciones` y el GET de
`/api/lluvia/mediciones`. Las consume sólo esta pantalla.

### La fuente publica lecturas imposibles, y hay que filtrarlas

El 28/09/2026 a las 16:34 UTC el INA cargó en la serie de Empedrado un lote de
observaciones de las 12:00 —**cinco ceros exactos seguidos y después 12,33 y
12,44 m**— intercaladas con las mediciones normales de las 03:00, que venían en
4,0 m. El panel tomaba la última lectura, así que **anunció que Empedrado había
superado su nivel de evacuación**: una falsa alarma en la única pantalla que
alguien mira para decidir. Y el gráfico zigzagueaba, porque dibujaba las dos
familias alternadas.

`depurar()` en `lib/ina.ts` descarta lo que no puede ser cierto, con **un solo
criterio**: un salto de más de `SALTO_MAX_M` = **2 m** respecto de la última
lectura aceptada. El Paraná en este tramo sube de 10 a 30 cm por día incluso en
crecida, así que 2 m deja margen de sobra sobre cualquier evento conocido.

Cuatro decisiones que no son obvias:

- **El umbral es deliberadamente flojo.** Descartar una lectura real en un
  evento extremo es mucho peor que dejar pasar una basura chica: la basura se
  lee como ruido, la lectura descartada se lee como que no pasó nada.
- **No hay una regla aparte para los ceros**, aunque el lote fueran ceros. Con el
  río en 4 m un cero ya es un salto de cuatro metros, y una altura de cero en la
  escala **es posible** en una bajante extrema. Una regla contra el cero
  descartaría un dato real justo en el otro evento que importa. Eso deja un
  hueco declarado: con el río bajo, un cero falso entra — y ahí es
  indistinguible de una medición.
- **La referencia inicial es la mediana, no la primera lectura.** Encadenar
  desde la primera es frágil: si justo la primera es basura, se acepta ella y se
  descarta la serie entera. El test lo afirma.
- **Lo descartado se muestra**, con fecha y valor. Filtrar en silencio dejaría a
  este sistema afirmando algo distinto de su fuente sin que nadie pueda notarlo,
  y si mañana el salto es real el aviso es lo único que lo delata.

`scripts/verificar-rio-depuracion.ts` usa **las observaciones reales de ese
episodio**, no un caso inventado, y afirma las dos puntas: que el lote se
descarta y que una crecida de 25 cm diarios que cruza los dos umbrales pasa
entera.

### Aguas arriba de Resistencia

`lib/rioArriba.ts` + `app/api/rio/arriba/route.ts` +
`components/rio/AguasArriba.tsx`, un bloque dentro de `PanelRio`, entre las
franjas grandes y el resto del tramo. Desde el 08/10/2026.

Las franjas dicen cuánto le falta al alerta acá; este bloque dice **qué viene**.
Nueve escalas, en `ESTACIONES_ARRIBA` de `lib/ina.ts`:

| Río | Escala (id del INA) | Alerta · evacuación | Pronóstico diario |
|---|---|---|---|
| Paraná | Posadas (14) | 11 · 12 | no |
| Paraná | Ituzaingó (15) | 3,5 · 4 | no |
| Paraná | Itá Ibaté (16) | 7 · 7,5 | no |
| Paraná | Itatí (17) | 6,8 · 7,5 | no |
| Paraná | Paso de la Patria (18) | 6,5 · 7 | no |
| Paraguay | Puerto Pilcomayo (55) | 5,35 · 6 | sí |
| Paraguay | Puerto Formosa (57) | 7,8 · 8,3 | sí |
| Paraguay | Puerto Bermejo (58) | 6,5 · 7 | no |
| Bermejo | El Colorado (2046) | **sin umbral publicado** | no |

Umbrales del catálogo del INA, leídos el 08/10/2026. Lo de «pronóstico diario»
es lo que encontró `serieMedida()` ese día: sólo las dos del Paraguay lo tienen
colgado de la serie medida (`cal_id` 312, una semana). Itatí, Paso de la Patria
y Bermejo tienen el pronóstico **semanal** a tres meses (`cal_id` 499), colgado
de la serie de altura media semanal, así que salen «sin corrida». Es otro
producto —una altura por semana— y no se mezcla con el diario.

- **Lo central es la tendencia**: cuánto cambió en un día y en siete, **contra el
  día exacto**, igual que en «Ríos internos». Si ese día no tiene lectura, el
  cambio es `null` y se muestra «—», no cero. Menos de 2 cm por día es
  «estable» (`QUIETO_M`): es el orden de la lectura de una escala a ojo.
- **La columna «Llega a Barranqueras» es medida** sobre el registro de 1970 a
  hoy, con `anticipaciones()` de `lib/rioArriba.ts`, que llama a las mismas
  funciones que la tabla «Traslado de la crecida»: para el Paraná, cuántos días
  antes pasa el pico (Posadas 6, Ituzaingó 4, Itá Ibaté 3, Itatí 2, Paso de la
  Patria 1); para el Paraguay, «aporta» con el desfase del aporte; para el
  Bermejo, «no se distingue». No es un pronóstico de altura: dice cuándo.
  `useTramoDiario` baja el archivo una sola vez para los dos bloques, y el
  cálculo (~0,5 s) se guarda por archivo en un `WeakMap`.
- **El Paraguay y el Bermejo van en su propio grupo y lo dicen**: no anuncian a
  Barranqueras (ver «El aporte del río Paraguay»); lo que aportan es caudal.
- **El Colorado no tiene umbral**: el estado es `sin_umbral` (gris), sin margen
  ni franja grande, y en la columna dice «sin umbral». **Se carga con meses de
  atraso** (al 08/10/2026, la última lectura es del 30/06/2026): sale con la
  fecha en naranja. Es la escala del INA más cercana a la boca con
  observaciones: Puerto Velaz y Puerto Lavalle no tienen.
- **Ituzaingó está al pie de Yacyretá**: la altura la maneja la represa y sus
  umbrales no se comparan con los de aguas abajo. La pantalla lo aclara.
- **Ruta aparte de `/api/rio`, y de a una estación.** Sumar ocho escalas a la
  ruta del panel duplicaba lo que tarda la franja de Barranqueras, que es lo
  primero que se mira. Separadas, el panel aparece igual que antes y este
  bloque llega cuando llega. Misma caché (media hora), mismo guard
  (`requirePermiso('lluvia')`), misma `depurar()`, y `maxDuration = 60`.
- **Itá Ibaté está en las dos listas** (`ESTACIONES` y `ESTACIONES_ARRIBA`) y
  el test afirma que dicen los mismos umbrales; lo mismo para Pilcomayo y
  Bermejo contra `ESTACIONES_PARAGUAY`. Cuando el bloque carga, `PanelRio` la
  saca del «resto del tramo» para no mostrarla dos veces; si el bloque falla,
  vuelve a aparecer ahí.
- **Una escala que llega a su alerta —medida o pronosticada— se despliega en
  franja grande**, con la misma `Franja` de `PanelRio`, que se le pasa por
  prop para no tener dos dibujos del mismo gráfico.
- **Una escala atrasada se ve atrasada**: desde dos días sin lectura
  (`DIAS_ATRASO_ARRIBA`) va la fecha de la última en naranja. Las escalas de
  Prefectura se leen todos los días, a las 03:00 UTC.

`scripts/verificar-rio-arriba.ts` no sale a la red: afirma la lista contra las
otras dos, la tendencia con casos que se saben sin calcular y la anticipación
sobre el archivo real —que todo el Paraná pasa antes y en orden, que Corrientes
da cero y que El Colorado no se distingue—. `relevar-ina.ts` compara los
umbrales contra el catálogo.

### El cero de cada escala: MOP no es IGN

Para comparar "6,5 m en la escala" contra la cota de un modelo de elevación hace
falta saber a qué cota está el cero de la escala **y en qué sistema vertical**.
Cada estación de `lib/ina.ts` lleva los dos:

| | `ceroMop` | `ceroIgn` |
|---|---|---|
| Itá Ibaté | 52,42 | 51,89 |
| Corrientes | 42,39 | 41,84 |
| **Barranqueras** | **41,80** | **41,25** |
| Empedrado | 39,68 | 39,13 |
| Bella Vista | 34,74 | 34,18 |
| Goya | 29,67 | 29,12 |

**Lo que el INA publica como `cero_ign` en este tramo es la cota MOP.** Acá
estuvo cargado como `ceroIgn: 42.39` y documentado como el ancla para cualquier
simulación: habría metido 55 cm de error sistemático contra un MDE, en una
llanura donde la franja que importa es de pocos metros sobre el cauce. Se
encontró buscando el cero de Barranqueras:
la tabla de estaciones de un estudio del CFI de 1999 trae dos columnas, MOP e
IGM, y la del INA coincide al centímetro con la MOP en las cinco. Aguas abajo de
La Paz el INA sí tiene los valores que el IGN midió en 2016. **Que un campo se
llame `cero_ign` no dice en qué sistema está el número.**

- **`ceroMop`** sirve para leer documentos de obra: las defensas del Gran
  Resistencia y la línea de ribera de la APA están en cota MOP.
- **`ceroIgn`** es el que va contra un MDE. Para las cinco de la tabla del CFI
  **son cotas IGM de 1999, no una vinculación al SRVN16**: el IGN no midió
  Corrientes ni Barranqueras en sus campañas. Valen al decímetro. Una
  vinculación moderna sigue siendo un pedido al IGN o a Prefectura.
- **Barranqueras no figura en el INA.** Su cero MOP sale de dos fuentes que no se
  conocen entre sí: la tabla del CFI, y la Resolución 1111/98 de la APA —"8,17 m
  en el hidrómetro de Puerto Barranqueras, equivalente a cota MOP 49,97 m"—.
- **Empedrado tiene control**: el IGN vinculó en 2017 dos tramos de esa escala,
  y descontando los metros de cada tramo el cero da 39,11 y 39,14.
- **Los valores del IGN están en `ramsac.ign.gob.ar/buh/kml.php`**, no en la
  página que los anuncia, que es un mapa. **Lo que lista no es siempre el cero**:
  en Empedrado da 45,11 y 46,14, que son el arranque de los tramos de 6 y 7 m.
- Una nota de El Litoral de 2021 cita 41,42 m IGN para Corrientes. No se pudo
  conciliar con lo demás.

`relevar-ina.ts` compara el `cero_ign` del INA contra `ceroMop` y avisa si
cambia: lo más probable es que ese día hayan cargado el del IGN de verdad.

### Recurrencia y permanencia en Barranqueras

`lib/rioHistorico.ts` + `components/rio/HistoricoBarranqueras.tsx` — debajo de
las franjas del río. Contesta lo que las franjas no pueden: **qué tan raro es**
que el río esté a cierta altura. Máximo de cada año, cada cuánto se supera cada
umbral, altura por recurrencia y curva de permanencia.

**Hasta el 06/10/2026 era la escala de Corrientes, y se cambió.** Se había
elegido Corrientes porque su media diaria arranca en 1901 y la de Barranqueras
en 1970. El costo era que la pantalla contestaba cada cuánto se supera el
alerta *de Corrientes* (6,50 m), no el de Barranqueras (6,00 m), que es el que
decide de este lado. Y no es lo mismo: en Corrientes el alerta se superó 1 año
de cada 3,4; en Barranqueras, 1 de cada 2,3.

**Hay dos clases de número y van separadas en pantalla:**

| | Qué es | Ejemplo, serie completa |
|---|---|---|
| **Contado** | en cuántos años se superó, qué parte de los días | alerta en 51 de 117 años; 4,61 % de los días |
| **Ajustado** | Gumbel sobre los máximos anuales, con su error | 100 años: 8,96 ± 0,72 m |

Si difieren, lo contado es lo que pasó. El ajuste da el alerta 1 cada 2,8 años
y la cuenta 1 cada 2,3; la evacuación (6,50 m), 1 cada 4,9 contra 30 de 117
años, 1 cada 3,9.

#### El registro son dos series, y por qué se pueden juntar

| | Serie del INA | Período | Días |
|---|---|---|---|
| Lecturas de la escala | 20 | 02/03/1906 a 31/12/1969 | 22.856 |
| Media diaria | 26262 | desde 01/01/1970 | 20.451 |
| Lecturas, en huecos de la media diaria | 20 | después de 1970 | 45 |

- **La regla es una sola: la media diaria donde existe, y si no el promedio de
  las lecturas de ese día.** Antes de 1970 eso es siempre una lectura única.
- **El reparo contra las lecturas sueltas no aplica acá.** El problema de la
  serie de lecturas es que trae una, dos o más por día según la época, y un
  máximo anual dependería de cuántas veces se leyó la escala. En Barranqueras
  hay **exactamente una por día hasta 2012**.
- **Donde existen las dos, coinciden**: sobre 20.451 días, sesgo 0,00 cm y
  error medio 0,02 cm, con un solo día a más de 10 cm. La media diaria del INA
  *es* el promedio de esas lecturas. Con las fechas corridas un día eso no
  daría cero, así que también es la comprobación de las fechas.
- **El script vuelve a medir la coincidencia en cada corrida y no escribe si se
  perdió** (`MAE_MAX_CM` = 0,5). Si el INA recarga una de las dos series,
  juntarlas deja de estar justificado.
- **El archivo dice de dónde salió cada parte** (`origen`) y la pantalla lo
  informa: hasta cuándo son lecturas, cuántos días de cada una y cuánto
  difieren. Un número que se va a citar tiene que poder decir de dónde sale.
- **No hay escalón el 01/01/1970**: 2,08 m el día anterior y 2,00 ese día, con
  el río moviéndose de 0 a 8 cm por día esa semana. El test lo afirma.
- **Completar los huecos posteriores a 1970 no rescató lo que se esperaba.**
  Sumó 45 días; 1989/90 y 1990/91 siguen incompletos (327 y 319 días) porque
  ahí tampoco hay lecturas.

Cosas que no son obvias:

- **Está congelado en `public/rio/barranqueras_diario.json`** (175 KB,
  centímetros enteros, `null` donde no hay dato; falta el 1,6 % de los días) y
  se regenera con `node scripts/build_rio_barranqueras.mjs`. Son 120 años que
  no cambian: pedirlos en vivo serían 18 MB contra el INA en cada visita, y la
  recurrencia —que se cita— dependería de que el INA conteste ese día. **El año
  en curso no entra hasta regenerar**; conviene hacerlo una vez por año, pasado
  agosto.
- **Va aparte de `build_rio_historico.mjs`**, que ahora genera sólo el archivo
  del tramo: para no volver a bajar ni mover `tramo_diario.json`, sobre el que
  hay tests. `corrientes_diario.json` se borró —ninguna pantalla lo leía más—;
  si hace falta, es la serie 26261 entera y está en el historial de git.
- **El año hidrológico va de septiembre a agosto.** Con el año calendario la
  crecida de 1982/83 aporta dos máximos —7,56 m en diciembre y 8,59 en 1983—
  siendo un solo evento. Agosto tiene un solo pico en 117 años y septiembre
  ninguno.
- **En 1983 la mayor es la cresta de junio, por un centímetro**: 8,59 m el
  22/06 y 8,58 el 18/07, que es el día del máximo en Corrientes. No es un
  corrimiento de fechas; el test afirma las dos.
- **1989/90 es una crecida grande que no entra en el ajuste.** Lo que hay de
  ese año llega a 7,66 m, pero tiene 327 días con dato y el corte es 330
  (`DIAS_MINIMOS`). La pantalla lo lista entre los incompletos. No se bajó el
  corte para hacerlo entrar: sería elegir la regla mirando el resultado.
- **El régimen cambió hacia 1971 y por eso hay dos períodos.** El mínimo anual
  promedia 0,79 m antes y 1,96 después. En los máximos es menos claro: 5,61 m
  antes, 6,35 entre 1971 y 2000, y 5,69 desde 2001. La pantalla calcula con la
  serie completa o desde 1970/71 y dice cuál; los números del cambio salen del
  archivo, no están escritos a mano. **Al citar una recurrencia hay que decir
  con qué período.** Desde 1970/71 (54 años) la de 100 años sube a 9,50 ± 1,16
  m, y el alerta se superó en 28 de 54 años.
- **El corte del régimen coincide casi con el cambio de serie** (1970/71 y
  01/01/1970). Es coincidencia, y conviene saberlo antes de sospechar: el mismo
  cambio en los mínimos se medía en Corrientes —0,85 a 2,02 m—, sobre una sola
  serie.
- **La fecha es el día de `timestart` leído en UTC, sin convertir.** La media
  diaria va marcada a la medianoche local y las lecturas entre las 03:00 y las
  19:00 UTC: caen siempre en el mismo día. Convertir con el huso de hoy
  correría un día las fechas viejas.
- **Los ceros exactos de la serie son reales.** Hay 17, en 1916, 1917, 1925,
  1934, 1944, 1949 y 1969, y 142 días bajo el cero de escala: son bajantes. Es
  el caso que `depurar()` ya contemplaba.
- **El río sí puede subir más de 30 cm en un día.** La serie tiene 56 días con
  un cambio de más de 60 cm. Algunos son errores de carga, pero no todos: en
  octubre de 1915 subió 80 y 67 cm en dos días seguidos, dentro de una crecida
  sostenida —la misma que se ve en Corrientes—. `SALTO_MAX_M` = 2 sigue
  holgado.
- **Las alturas son de la escala de Barranqueras** y no se trasladan a otra
  escala del tramo. Los máximos anuales de Corrientes van de 23 cm por debajo a
  43 por encima, 11 en promedio.
- **Los rótulos de los umbrales van en un margen a la derecha del gráfico.** La
  primera versión los ponía encima, a la izquierda, y tapaban las barras de los
  primeros años y el tramo empinado de la curva de permanencia. Se vio en la
  pantalla.
- **Las barras fuera del período se atenúan, no desaparecen**: el gráfico no se
  reacomoda al cambiar y se ve qué se deja afuera.

`scripts/verificar-rio-historico.ts` corre sobre el archivo real, sin red. **Acá
sí hay contra qué comparar, y son dos controles que no se conocen entre sí:**

- **La Resolución 1111/98 de la APA** da el pico del 04/05/1998 como «8,17 m en
  el hidrómetro de Puerto Barranqueras». El archivo da 8,17 m ese día. Con las
  fechas corridas o las unidades cruzadas eso no cierra.
- **Corrientes, que está enfrente**, con su propia media diaria
  (`tramo_diario.json`): sobre 54 años en común los máximos anuales
  correlacionan 0,995.

Además afirma el orden de las crecidas —1982/83, 1991/92, 1997/98 y 1965/66—,
que el mínimo es el de 1944, la costura de 1970 y cuánto salió de cada serie.
Gumbel se afirma por propiedades —la altura de 2 años es la mediana, ida y
vuelta devuelve lo mismo— porque nadie publicó la recurrencia con esta serie y
este método.

**La serie no se depuró.** Tiene saltos de un día que son errores de carga —el
14/09/1990 baja tres metros y vuelve—, y filtrarlos sería afirmar algo distinto
de la fuente. **Uno toca un máximo anual**: el 09/02/1981 la serie da 6,16 ·
6,36 · 6,16 sobre un río quieto, y ese 6,36 es el máximo de 1980/81. Con o sin
él el año pasó el alerta y no llegó a evacuación, así que no cambia nada de lo
contado; el test lo deja escrito. También hay un mínimo anual que es un día
suelto (2,03 m el 24/08/1993), y no es el del registro.

### Traslado de la crecida en el tramo

`lib/rioTraslado.ts` + `components/rio/TrasladoCrecida.tsx` — cuántos días antes
o después que en **Barranqueras** se mueve el río en cada una de las otras nueve
escalas del Paraná, de Posadas a Goya. Es anticipación que no depende de ningún
pronóstico.

**La referencia es Barranqueras desde el 08/10/2026** (`ESTACION_REFERENCIA` =
20). Antes era Corrientes, por tener la media diaria más larga; se cambió porque
la escala que decide en el Gran Resistencia es la de Barranqueras y la pregunta
es «cuántos días antes que acá». Las dos series arrancan en 1970, así que no se
perdió período. **Corrientes queda como control** (`ESTACION_CONTROL`): está
enfrente y su desfase tiene que dar cero. Ese mismo día entraron Posadas,
Ituzaingó, Itatí y Paso de la Patria, y el rango probado pasó de −6 a −12 días
(`DESFASE_MIN`) para que Posadas no quedara en el borde.

**Se mide de dos maneras que no comparten cálculo, y contestan cosas
distintas:**

| Escala | Pico anual (mediana) | Mitad de los años | Variaciones diarias | r |
|---|---|---|---|---|
| Posadas | 6 días antes | −7 y −5 | −4,0 d | 0,24 |
| Ituzaingó | 4 días antes | −5 y −3 | −2,3 d | 0,43 |
| Itá Ibaté | 3 días antes | −4 y −2 | −1,9 d | 0,60 |
| Itatí | 2 días antes | −2 y −1 | −0,8 d | 0,73 |
| Paso de la Patria | 1 día antes | −1 y 0 | −0,4 d | 0,67 |
| Corrientes (control) | el mismo día | 0 y +1 | 0,0 d | 0,82 |
| Empedrado | 1 después | 0 y +1 | +0,5 d | 0,66 |
| Bella Vista | 2 después | +1 y +3 | +1,3 d | 0,63 |
| Goya | 3 después | +2 y +6 | +1,9 d | 0,60 |

Del 01/01/1970 al 07/10/2026.

- **Pico anual**: diferencia entre las fechas del máximo de cada año
  hidrológico. **Es el que vale para una crecida.**
- **Variaciones diarias**: el desfase que mejor alinea lo que el río sube o baja
  cada día en las dos estaciones. Describe un cambio cualquiera.

**El pico tarda más que una variación común.** La cresta de una crecida es chata
y se demora. El test pedía al principio que los dos métodos difirieran menos de
dos días y falló en Goya (1,9 contra 4, con Corrientes de referencia): la
suposición estaba mal, no el cálculo. **Y cuanto más lejos, menos se parecen
las variaciones**: Posadas anticipa el pico seis días, pero sus cambios de un
día correlacionan 0,24 con los de Barranqueras.

Cosas que no son obvias:

- **Se correlacionan los cambios diarios, no las alturas.** La altura de hoy se
  parece tanto a la de ayer que dos series de alturas correlacionan arriba de
  0,9 con cualquier desfase de una semana, y el máximo queda en una meseta.
- **El desfase tiene decimales y la serie es diaria**: sale de ajustar una
  parábola por los tres puntos de la cima. Vale al medio día, no más.
- **Corrientes es la comprobación externa.** Está enfrente de Barranqueras: su
  desfase tiene que ser cero. Si no da cero, alguna serie tiene las fechas
  corridas un día. El test lo afirma.
- **Es estable.** Partida la serie en dos mitades, el desfase cambia menos de
  medio día en Itá Ibaté, Corrientes, Bella Vista y Goya, y menos de un día en
  Posadas e Ituzaingó: Yacyretá se llenó entre 1994 y 2011, en el medio de la
  serie, y regula lo que pasa por ahí.
- **Entre Itá Ibaté y Barranqueras entra el río Paraguay.** Barranqueras recibe
  dos ríos e Itá Ibaté mide uno: el desfase se mide bien, pero una crecida que
  venga por el Paraguay no se anuncia en el Paraná. El Paraguay y el Bermejo van
  medidos aparte, más abajo.
- **Picos a más de 15 días no son el mismo evento** (`VENTANA_PICO_DIAS`): hay
  años con dos crecidas parecidas y el máximo de cada estación cae en una
  distinta. Se dejan afuera y se dice cuántos años entraron.
- **Un máximo en el borde del rango probado no da número**: ahí no hay cima.
- **Con el río alto, las variaciones diarias no sirven para Goya**: filtrando
  los días con Corrientes sobre 5 m el desfase da cero con correlación 0,53. No
  se investigó por qué. Para aguas altas, el pico.
- **El archivo es `public/rio/tramo_diario.json`** (las diez escalas del
  Paraná desde 1970, tres del Paraguay en `paraguay` y El Colorado en
  `bermejo`) y lo genera `build_rio_historico.mjs`. Arranca en 1970 porque
  Barranqueras y Bella Vista no tienen media diaria anterior. Empedrado no tiene
  datos entre 1970 y 1989. **El Bermejo no entra en la cuenta de hasta dónde
  llega el archivo**: se carga con meses de atraso y lo recortaría entero.
- **Desde la nube no se llega al INA** (el proxy lo rechaza), y el 08/10/2026 se
  regeneró con un workflow temporal de GitHub Actions en una rama aparte
  (`datos-rio-tmp`), que corrió el script y subió el JSON a esa rama. Los
  artefactos de Actions tampoco se pueden bajar desde la nube: el workflow
  tiene que commitear el archivo. Desde la PC de casa, correr el script
  directo.

`scripts/verificar-rio-traslado.ts` tiene dos partes: series armadas a mano
donde el desfase se sabe sin calcular —una serie y la misma corrida tres días;
mitad a dos días y mitad a tres tiene que dar 2,5—, y la serie real, donde afirma
el orden aguas abajo y el cero de Barranqueras.

### El aporte del río Paraguay

`trasladoDelParaguay()`, `trasladoDelBermejo()` y `aporteNoExplicado()` en
`lib/rioTraslado.ts`, y la tabla «Afluentes» en `TrasladoCrecida.tsx`. Son
**Puerto Pilcomayo** (id 55, frente a Asunción, ~390 km aguas arriba de la
confluencia), **Puerto Formosa** (57, desde 2006, sumada el 08/10/2026),
**Puerto Bermejo** (58, en Chaco, a ~60 km) y, en la clave `bermejo` del
archivo, **El Colorado** (2046), sobre el Bermejo. Van en `ESTACIONES_PARAGUAY`
y `ESTACION_BERMEJO`, **no** en `ESTACIONES`. **Todo se mide contra
Barranqueras** desde el 08/10/2026; los números de abajo son los nuevos.

**Se sumaron esperando que anunciaran a Corrientes como Itá Ibaté, y no lo
hacen.** Con los dos métodos del tramo:

| | Variaciones diarias | Mismo pico anual |
|---|---|---|
| Puerto Pilcomayo | r 0,15 | 22 de 50 años |
| Puerto Formosa | r 0,22 | menos de diez años usables |
| Puerto Bermejo | r 0,29 | 19 de 33 años |
| El Colorado (Bermejo) | r 0,01 | menos de diez años usables |

El Paraguay crece en invierno, con el agua del Pantanal, y el Paraná en verano:
en la mitad de los años o más, el máximo de cada uno es otra crecida. No hay un
traslado que informar, y la pantalla lo dice en vez de mostrar un desfase.

**Lo que sí se mide es el aporte**: cuánto de lo que Barranqueras hace, y que
Itá Ibaté no explica, se parece a lo que hizo el afluente. Sobre cambios de 15
días (`VENTANA_APORTE_DIAS`): se ajusta Barranqueras contra Itá Ibaté, y el
resto se correlaciona con la escala del afluente desfase por desfase.

| | Correlación | Desfase | Rango | R² sin → con |
|---|---|---|---|---|
| Puerto Pilcomayo | 0,51 | 5 días antes | −10 a 0 | 0,915 → 0,939 |
| Puerto Formosa | 0,68 | el mismo día | −4 a +4 | 0,899 → 0,949 |
| Puerto Bermejo | 0,48 | el mismo día | −4 a +3 | 0,919 → 0,958 |
| El Colorado (Bermejo) | 0,11 | — | — | 0,907 → 0,908 |

- **El Bermejo en El Colorado no se distingue en la altura de Barranqueras.**
  Su agua llega mezclada con la del Paraguay, que pesa siete veces más, y la
  escala mide un río de cauce móvil. Se muestra igual, con el número: se miró.
  `APORTE_MIN_R` = 0,3 en `lib/rioArriba.ts` es el corte entre «aporta» y «no
  se distingue».

- **Pilcomayo adelanta, pero la cima es ancha.** Dice alrededor de cuándo, no qué
  día, y por eso se informa el rango en que la correlación queda a menos de un
  décimo de la máxima. Las ventanas de quince días se pisan entre sí.
- **Bermejo explica más y no adelanta**: se mueve a la vez que Corrientes.
- **Quince días y no uno**: de un día para el otro el Paraguay se mueve un par de
  centímetros. La correlación crece con la ventana —0,39 con siete, 0,54 con
  quince— sin que el desfase se corra.
- **Itá Ibaté entra con seis desfases, y con uno solo el resultado estaba mal**
  (`DESFASES_ARRIBA`). Ajustando sólo contra Itá Ibaté dos días antes, el resto
  correlaciona 0,42 con la propia Itá Ibaté de diez días antes: la onda se
  aplasta al viajar. Ese resto se parecía a cualquier cosa lenta, y le daba a
  Bermejo cuatro días de adelanto que no tiene. **Se encontró con un control, no
  mirando el número**: Barranqueras, que está enfrente de Corrientes, aparecía
  "aportando" seis días antes. Con los seis desfases da cero, y Goya da después.
  Los dos controles están en el test.
- **Es cuánto se parecen, no cuántos centímetros aporta.** No es un modelo. El
  balance con caudales va aparte, en la sección que sigue.
- **Formosa entró el 08/10/2026** pese a tener media diaria recién desde 2006:
  con veinte años alcanza para el aporte, no para el pico anual. Es la que más
  explica de las tres. Isla del Cerrito sigue afuera. Paso de la Patria (id
  18), sobre el Paraná en la confluencia, ahora está en el tramo: 1 día antes
  que Barranqueras.
- **El año hidrológico de septiembre a agosto está elegido para el Paraná.** El
  Paraguay culmina en invierno y baja despacio, así que en Pilcomayo septiembre
  es el mes en que más veces cae el máximo "anual" —13 años—, y eso es la cola
  de la crecida anterior. Otro motivo por el que el pico anual no sirve para
  este río.

### De dónde viene el agua que pasa frente a Barranqueras

`lib/rioCaudales.ts` + `components/rio/BalanceConfluencia.tsx`, debajo del
traslado. Una altura no se suma; un caudal sí:

```
Barranqueras(t) = Yacyretá(t − 4) + Paraguay(t − 11) + Bermejo(t − 3) + resto
```

**El total es Barranqueras desde el 08/10/2026** (`DESTINO`), con Corrientes de
control. Se creía que Barranqueras no tenía caudal y no es así: el INA publica
su caudal medio diario (serie 26617, curva de gasto, desde 1985). Es la misma
sección que Corrientes, medida con otra curva: sobre 9.721 días en común los
promedios difieren 0,4 % y día por día 1,7 %. `Partes.total` es lo que antes se
llamaba `corrientes`.

Sobre 6.612 días entre 2001 y 2025, con caudal medio diario del INA:

| | m³/s | Parte |
|---|---|---|
| Barranqueras | 17.953 | |
| Paraná, efluente de Yacyretá | 13.904 | 77,4 % |
| Paraguay, en Puerto Pilcomayo | 3.248 | 18,1 % |
| Bermejo, en El Colorado | 428 | 2,4 % |
| Resto | 374 | 2,1 % |

**Dos controles que no se conocen entre sí**: con Corrientes de total, el
Paraguay da 18,2 % y el resto 1,5 %; con el Paraguay medido en Formosa, 18,9 %.
Antes del cambio, con Corrientes, la tabla daba 77,9 / 18,2 / 2,4 / 1,5 % sobre
6.811 días: la diferencia es el período, que ahora sale de los días en que
Barranqueras tiene dato.

- **Que cierre es la verificación.** Son lo que larga una represa y tres curvas
  de gasto de tres escalas: nada obliga a que tres sumen la cuarta. El resto es
  una resta, no un ajuste. R² 0,92 día por día.
- **El Paraguay pesa 14,5 % en febrero y 22,3 % en julio**; el Bermejo llega al
  6 % en marzo y no es nada en primavera. Día por día, lo que entra por el
  Paraguay con el Bermejo va del 11 al 30 % en nueve de cada diez días, y llegó
  al 48 % el 24/04/2019.
- **Las estaciones más cercanas a la confluencia no tienen caudal.** Itá Ibaté,
  Paso de la Patria y Puerto Bermejo tienen la serie listada y vacía. Por eso el
  Paraná se toma en Yacyretá y el Paraguay frente a Asunción. Barranqueras y
  Corrientes sí tienen, las dos.
- **El Bermejo no está contado dos veces**: desemboca en el Paraguay aguas abajo
  de Puerto Pilcomayo y de Formosa.
- **El resto no se reparte.** Es el Tebicuary y los demás afluentes sin medir,
  más el error de las curvas.
- **Las demoras se eligen por la variación del resto, no por su tamaño.** Correr
  una serie unos días no le cambia el promedio; lo que cambia es cuánto sube y
  baja el resto. La de Yacyretá queda bien determinada —4 días con las dos
  estaciones del Paraguay—; **la del Paraguay no**: 10 con Pilcomayo y 6 con
  Formosa, sobre un río tan lento que una semana de diferencia casi no mueve la
  cuenta. No es una medida de cuánto tarda, y la pantalla lo dice. La del
  Bermejo es fija en 3 y **supuesta**: con el 2 % del caudal no hay con qué
  medirla.
- **Son caudales de curva de gasto, no aforos**, salvo Yacyretá. Los promedios
  son firmes; un día suelto, con el río fuera de cauce, no tanto.
- **La serie del Bermejo termina el 31/08/2025** y hay años con pocos días en
  común (2021 a 2023 no entran). El balance es del período, no de hoy.
- **El archivo es `public/rio/confluencia_caudal.json`** (m³/s enteros desde el
  24/07/1994, seis series con `barranqueras`) y lo genera
  `node scripts/build_rio_caudales.mjs`.
  **Va aparte de `build_rio_historico.mjs`** para no volver a bajar ni mover
  los dos archivos de alturas, sobre los que hay tests.

`scripts/verificar-rio-caudales.ts` arma tres ríos de mentira cuya suma es
exacta —el resto tiene que ser cero, y un afluente sin medir tiene que ir
entero al resto— y sobre la serie real afirma que cierra bajo el 5 %, el
control de Formosa, el régimen de cada río y que las dos mitades del período
dan el mismo reparto.

### Los ríos internos del Chaco también están en el INA

Relevado el 05/10/2026 buscando los caudales. **Las alturas al día ya están en
pantalla** (ver «Los ríos internos: qué hizo el agua después»); **las series de
caudal siguen sin usar**. Son
observaciones de cómo responde una cuenca a la lluvia, que es lo que el plan del
balance hídrico pide antes de cualquier modelo:

| Estación (id del INA) | Qué tiene | Período |
|---|---|---|
| Tapenagá, Florencia (1933) | caudal y altura media diaria | 2001 a 2022 / 2024 |
| Salado, RN 11 (2100) | caudal medio diario, 1.088 días | 2016 a 2025 |
| Riacho Palometa, RP 13 (2099) | caudal medio diario | 2016 a 2022 |
| Canal Línea Paraná, RP 3 (1945) | altura media diaria | 2010 a 2026 |
| Bermejo, El Colorado (2046) | caudal y altura | 2001 a 2025 |
| Negro: Laguna Blanca (6432), San Fernando (7296), Philipon (7295) | altura, y lluvia en la primera | desde 2023–2025, al día |
| Tapenagá, Estancia (7184); Canal Soberanía (7164) | altura | desde 09/2024, al día |

Las que están al día se superponen con el año de lluvia de la APA. Las de
caudal largas terminan antes de que empiece: para cruzarlas hace falta lluvia
histórica.

### El relevamiento no entra en `npm run verificar`

`scripts/relevar-ina.ts` **no es un test de lógica sino de contrato con un
tercero**: lo que puede romperse no es nuestro código sino la API del INA — que
cambie la forma de una respuesta, que una estación deje de ser pública, que
muevan un umbral. Nada de eso lo atrapa `tsc`.

Queda afuera de `verificar` a propósito: sale a la red y depende de que un
organismo esté en línea. **Un chequeo que falla por motivos ajenos al commit
enseña a ignorar los chequeos.** Se corre a mano, y tampoco desde el sandbox,
cuyo acceso a red está limitado a dominios permitidos:

```bash
npx tsx scripts/relevar-ina.ts
```

Por eso se llama `relevar-` y no `verificar-`: `verificar-todo.mjs` levanta por
prefijo, así que el nombre es lo que lo mantiene fuera.

### Sobre el modelo digital de elevaciones

Para cualquier simulación de mancha de inundación, lo relevado hasta ahora:

| | Resolución | Error vertical | Nota |
|---|---|---|---|
| **IGN MDE-Ar v2.1** | 30 m | ~2 m | Nacional, libre, el citable en Argentina |
| **FABDEM** | 30 m | ~1,5 m | El mejor de los globales en llanura; **le saca bosque y edificios** |
| Copernicus / NASADEM / SRTM | 30 m | peor | SRTM y NASADEM **sobreestiman bajo dosel** — el Impenetrable |

**El límite es real y está medido**: en la franja crítica de 0 a 6 m sobre el
cauce, los errores verticales de los MDE globales son comparables o mayores que
la profundidad real de la inundación. En terreno llano como el Chaco eso
descalifica cualquier delimitación a escala de barrio.

La salida publicada es **ICESat-2**: lidar satelital de precisión centimétrica
pero disperso, que no sirve como MDE pero sí como verdad de campo para corregir
uno. Hay trabajo que entrena una red sobre ICESat-2 para corregir y bajar FABDEM
a 10 m, mejorando hasta 15 % la habilidad para reproducir la mancha.

Antes de gastar en eso conviene averiguar si existe **lidar o fotogrametría
sobre el Gran Resistencia**: las áreas urbanas suelen tener relevamientos mucho
mejores que la grilla nacional.

### Lluvia histórica: CHIRPS por cuenca, desde 1981

`scripts/build_chirps.mjs` + `lib/chirps.ts` +
`public/lluvia/chirps_cuencas.json` + `components/cuencas/VistaHistorico.tsx`,
la séptima vista del panel de cuencas («Histórico»).

Los partes de la APA empiezan en 09/2025. Con un año no se puede decir qué tan
raro es un evento ni cruzar la lluvia con los caudales del INA, que terminan
antes. Esto da 45 años enteros por cuenca: 16.679 días, del 01/01/1981 al
31/08/2026, sin un día faltante.

CHIRPS es una estimación de la Universidad de California en Santa Bárbara:
infrarrojo de satélite calibrado y corregido con pluviómetros, a 0,05° (~5 km),
diaria.

- **Es una estimación y no se mezcla con la medida.** Ningún número que hoy
  sale de los pluviómetros pasa a salir de acá. Sirve para qué es normal para
  la época y cada cuánto se repite un evento.
- **Vale para el promedio de una cuenca**, que es lo único que hay en el
  archivo: una serie diaria por cada una de las trece, sin valor por punto.
- **El día de CHIRPS no es el día de la APA, y por eso se usa en ventanas de
  varios días.** Sobre Negro - Salado, la lluvia que la APA informa el
  03/08/2026 CHIRPS la pone el 04/08. Día por día correlaciona 0,64 con los
  pluviómetros; en ventanas de tres y de siete días, 0,85.
- **Sale de ClimateSERV**, de NASA SERVIR, sin cuenta ni clave: se le manda el
  contorno de la cuenca tal como está en `geo_cuencas.json` y devuelve el
  promedio diario adentro. El valle del Paraná va como multipolígono.
- **Hasta 20 años por pedido** —«Max date range is: 20 years»—: se pide de a
  15. **El contorno va por POST**: por GET la dirección pasa los 4.094
  caracteres que acepta el servidor. De a un pedido, con pausa.
- **Son 39 pedidos y media hora**, unos 150 s por cuenca. El 07/10/2026
  bajaron las trece a la primera.
- **Una cuenca se guarda entera o no se guarda**, y se la puede volver a pedir
  por número conservando las demás (`node scripts/build_chirps.mjs 6 8`).
- **Termina en el último día que tienen todas**: CHIRPS llega con algo más de
  un mes de atraso. Para sumar meses nuevos se vuelve a correr entero.
- Décimas de milímetro, un día por posición desde `desde`; `null` sin dato.
- `acumulado()` no da número si a la ventana le falta un día: una suma con
  huecos se leería como una ventana seca. `totalesAnuales()` informa el año
  incompleto, marcado.

Lo que dio, para tener la escala: de 705 mm por año en el Impenetrable a 1.359
en el valle del Paraná y 1.363 en Quiá. Los años más lluviosos son 1986 y 2002
en casi todas; 2022 es el más seco del registro en seis.

**Diciembre de 2025, el mes sin partes de la APA: CHIRPS ve el evento.** Del
20 al 26/12 da 152 mm en Negro - Salado, 130 en Tapenagá y 132 en Línea
Paraná, las tres cuencas cuyos ríos subieron esa semana.

`scripts/verificar-chirps.ts` no sale a la red: afirma el lector sobre un
archivo armado a mano, la forma del archivo real y lo que se sabe del Chaco sin
estos datos —más lluvia al este que al oeste, enero al menos el doble que
julio, 2020 a 2022 bajo la media en las trece— y la semana de diciembre de
2025. **No afirma que CHIRPS acierte.**

#### La vista «Histórico»

Qué es normal y qué es raro, por cuenca. En la tabla: la media anual, los
últimos doce meses contra los mismos doce meses de cada año, y la mayor lámina
acumulada en 3, 7 y 30 días con sus fechas. Al abrir una fila: el total de
cada año, lo normal de cada mes al lado del último, y cada cuánto la mayor
ventana de una temporada llega a cierta lámina.

- **No hay ventana de un día** (`VENTANAS_CHIRPS` = 3, 7 y 30), por lo del día
  de CHIRPS contra el de la APA.
- **La temporada va de julio a junio** (`MES_INICIO_TEMPORADA`). Julio es el
  mes más seco en nueve cuencas y agosto en las cuatro del norte —el test lo
  afirma—. Con el año calendario la temporada de lluvias queda partida y un
  evento de fin de diciembre aporta el máximo de dos años. Los totales anuales
  sí van por año calendario, que es como se cita un año.
- **Las frecuencias son cuentas, no un ajuste**: la mediana y los percentiles
  80 y 90 de las máximas de cada temporada entera, dichos como una de cada dos,
  cinco y diez. Con 45 temporadas no se informa nada más raro, y la pantalla lo
  dice. No hay Gumbel acá, a diferencia de Barranqueras, que tiene 117 años.
- **Los últimos doce meses se comparan contra la misma época**, no contra el
  año calendario: los 365 días que terminan el mismo día de cada año. Así el
  número no depende de en qué mes termina el archivo.
- **«Lo normal» de un mes es la mediana con el rango p10–p90** de todos los
  años del archivo, no una normal de 30 años. El último mes va marcado con ▲ o
  ▼ si cae fuera de ese rango.
- **Va en color arena** (`C_CHIRPS`), que no es el azul de lo medido ni el
  violeta del pronóstico, y la pantalla dice que estos números no se comparan
  con los de las otras vistas.
- **No se cruza con el período elegido ni con el pronóstico.** Poner el
  pronóstico por cuenca al lado de lo normal para la época sigue sin hacer.
- El calendario del archivo —año y mes de cada posición— se arma una vez
  (`calendarioDe`): son 16 mil fechas y todo lo recorre por cuenca.

Lo que se vio al armarla: **los doce meses a agosto de 2026 están entre los
más lluviosos del registro** —2.º de 45 en Tapenagá, La Rica - Sábalo y Línea
Paraná—, y en Negro - Salado la semana del 14 al 20/04/2026 dio 178 mm, a uno
del máximo desde 1981 (179, del 31/03 al 06/04/1986).

Mirándola en pantalla salieron dos cosas de alineación que el test no ve: el
rótulo «El último» quedaba al pie de su celda de dos renglones, y la tabla de
frecuencias tenía los encabezados pegados.

### Lluvia histórica: ERA5, de respaldo

`scripts/build_era5.ts` + `lib/era5.ts` + `public/lluvia/era5/`. **No alimenta
ninguna pantalla y no se sigue bajando.** Fue lo primero que se armó para la
lluvia histórica y quedó de respaldo cuando se sumó CHIRPS el 07/10/2026: lo
que acá llevaba dos semanas de correr un comando por día, allá es media hora.

Lo que tiene ERA5 —el reanálisis de ECMWF, desde 1940— y CHIRPS no: **un valor
por nodo**, no sólo el promedio de la cuenca, y los años anteriores a 1981. Si
alguna vez hace falta una de las dos cosas, la descarga está armada y probada.
**Contra eso, da la mitad de lo medido en los meses más lluviosos de
Resistencia** (290 mm contra 588 en enero de 2019).

- **Es lluvia modelada y no se mezcla con la medida.** Ningún número que hoy
  sale de los pluviómetros pasa a salir de acá. Sirve para frecuencias y
  promedios por cuenca, no para decir cuánto llovió un día en un lugar.
- **Se pide `models=era5`, no el pedido de siempre.** La ingesta diaria no fija
  modelo y Open-Meteo mezcla tres —IFS desde 2017, ERA5 y ERA5-Land—. Para ayer
  es lo mejor que hay; para una serie de décadas el producto cambia en el medio
  y un salto puede ser del modelo y no de la lluvia.
- **Los nodos son los 137 de la grilla del pronóstico por cuenca**
  (`grillaEn(CONTORNO_CHACO)`), así `asignarPuntos()` los reparte entre las
  cuencas igual, y el pronóstico se va a poder poner al lado de lo que es
  normal para la época. Si la grilla cambia, el script se niega a seguir.
- **El cupo es lo que manda.** Un nodo por un año son ~26 llamadas; un año
  entero, ~3.600, contra 600 por minuto, 5.000 por hora y 10.000 por día. El
  script va de a 8 nodos con 25 s de pausa —un año tarda ocho minutos— y espera
  una hora entre un año y el siguiente. Con dos años por día, la serie desde
  2001 lleva unas dos semanas.
- **El cupo es por dirección de red, no por proyecto**: lo que se baja desde la
  máquina de trabajo no le saca nada al cron de Vercel. Pero sí compite con lo
  que se haga ese día desde el panel en local.
- **Baja de lo más nuevo hacia atrás** y un año se escribe entero o no se
  escribe. Sin argumentos baja el año que sigue; `--anios 2` baja dos.
- **El año en curso queda incompleto** —ERA5 llega con una semana de atraso— y
  hay que volver a pedirlo por nombre (`npx tsx scripts/build_era5.ts 2026`).
- Un archivo por año, ~85 KB: décimas de mm, día por día y nodo por nodo.

Está bajado **sólo 2026**, hasta el 28/09, y así queda. Para diciembre de
2025, el mes sin partes de la APA, una consulta suelta a ERA5 dio 29 y 62 mm
el 22/12 en dos nodos: el modelo sí ve ese evento.

`scripts/verificar-era5.ts` no sale a la red: afirma la forma de cada archivo
y, en los años completos, lo que se sabe del Chaco sin estos datos —entre 500
y 1.800 mm, y más al este que al oeste—. **No afirma que ERA5 acierte.**

### Cuidado con las métricas condicionadas

Comparar sólo donde la APA informó da resultados que se dan vuelta según la
muestra: con 5 fechas de septiembre el modelo parecía sobreestimar 28 %, con las
162 parecía subestimar 26 %. Las dos lecturas son artefactos de mirar únicamente
los casos con lluvia reportada. Contando los ceros deducidos, el modelo
sobreestima alrededor del 15 %. **Cualquier métrica nueva sobre estos datos hay
que calcularla sobre las 11.502 combinaciones estación-fecha, no sobre las 3.334
mediciones.**

### Cómo se elige el período: `components/SelectorPeriodo.tsx`

**Había tres acciones que se veían parecidas y no lo son**: cambiar lo que se
mira (gratis, instantáneo), descargar la serie del modelo (gasta cupo, tarda
minutos) e interpolar los pluviómetros (gratis). Las fechas ya se aplicaban solas
al cambiarlas, así que el único botón visible del panel —*"↻ Actualizar rango"*—
parecía el "aplicar" y en realidad disparaba la ingesta. El que quería ver otro
rango lo apretaba siempre.

Ahora van en **dos bloques separados**: arriba lo que cambia la vista, abajo lo
que toca datos, con lo que cuesta al lado. Que estén separados importa más que
cómo se llamen. Los presets son un grupo único —Eventos / 7 / 30 / 90 / Fechas—
con el activo resaltado, y aplican al toque: en pantallas de reporte, un botón de
"aplicar" hace que la gente asuma que es eso y no lo que realmente hace.

**La confirmación va sólo en la acción cara.** Descargar tarda, gasta cupo y no
se puede cancelar a la mitad: abre un diálogo que dice esas tres cosas con
número. Interpolar es gratis e instantáneo; confirmarlo sería fricción sin
motivo.

**Descargar ya interpola** —la ingesta llama a `fusionar` internamente— así que
no son dos pasos en orden. Interpolar por separado sirve para cuando la APA
publicó el parte *después* de que se bajó la serie.

#### Los botones aparecen sólo si harían algo

Explicarlos en un pie no alcanzó, y el motivo es que **la explicación era
abstracta cuando la respuesta es concreta**: la pantalla ya sabe, por
`cobertura`, si descargar traería algún día que falta y si interpolar cambiaría
alguna fila. Ahora:

```
faltanDias    = dias - conSerie
porInterpolar = conSerie - interpolados - sinParte
alDia         = faltanDias === 0 && porInterpolar === 0
```

Cada botón se muestra sólo si su número es mayor que cero, y lo dice en su
propio texto: *"Descargar los 3 días que faltan…"*, *"Interpolar 2 días (IDW)"*.
Con todo al día no queda ningún botón, sólo el estado y una línea que dice que
la serie se descarga sola. Volver a descargar queda como enlace chico, que es lo
que es: la excepción para cuando se regeneran los puntos de muestreo.

**`sinParte` no entra en `porInterpolar`.** Son días que la APA nunca publicó y
que no se van a poder interpolar jamás; contarlos era exactamente el error del
cartel viejo — ofrecía arreglar algo sin arreglo y volvía a aparecer después de
apretarlo. Es la misma regla de siempre: **un botón que no puede cambiar nada es
peor que no tener botón.**

#### Dos crons, y por qué el segundo

`vercel.json` tiene dos, los dos sobre `/api/lluvia/ingesta`:

| Horario UTC | Hora local | Qué hace | Cupo |
|---|---|---|---|
| `30 9 * * *` | 06:30 | ingesta de los últimos 7 días, e interpola al final | ~453 llamadas |
| `0 15 * * *` | 12:00 | reinterpola los últimos 7 días, guarda el pronóstico e importa los partes nuevos | el modelo en las estaciones que informaron, sólo los días con parte nuevo |

**El segundo existe por un desfasaje real.** A las 06:30 la APA todavía no
publicó el parte del día —su período va de 17:00 a 07:00 y carga con retraso—,
así que la ingesta interpolaba sin él y quedaba un paso manual diario. Un paso
manual que hay que hacer todos los días es un paso que se olvida.

**Se distinguen por la cabecera `x-vercel-cron-schedule`**, que es lo que Vercel
documenta para dos crons que comparten ruta. **No se usa un query string en el
`path`**: la documentación describe el `path` como la ruta a invocar y no dice
nada de parámetros, así que apoyarse en eso sería construir sobre algo no
documentado.

**Verificado en producción** el 26/09/2026, disparando el de las 15:00 con el
botón «Run» del panel de Vercel. El log lo confirma por tres lados: user agent
`vercel-cron/1.0`, respuesta en **1,8 s** —la ingesta completa no puede terminar
en ese tiempo, son 453 llamadas con espera— y en «External APIs» aparecen sólo
Supabase y tres a `mapas.apachaco.gob.ar`, **ninguna a Open-Meteo**. O sea que
tomó la rama del recálculo y no gastó cupo. **Desde el 05/10/2026 esa rama sí
toca Open-Meteo los días en que hay un parte nuevo que importar** —unas decenas
de ubicaciones por un día—, así que ver una llamada ahí ya no es señal de que
tomó la rama equivocada.

**En Hobby la ventana es de ±1 hora**, como avisa la propia pantalla de Cron
Jobs: el de las 15:00 UTC puede caer hasta las 15:59. Sigue holgado sobre el
parte de la APA, que es lo que importa.

La ventana del recálculo del cron es de 7 días y no los 30 del default de
`recalcularFusion`: para una corrida diaria, 23 de esos días ya se recalcularon
ayer. No cuesta cupo, pero tampoco aporta.

**Que la serie se baje sola es la respuesta a "cada cuánto conviene
descargar": nunca, salvo excepción.** Las excepciones son tres — mirar un
período anterior a la ventana de 7 días, que el cron haya estado caído más de
una semana, o haber regenerado los puntos de muestreo desde QGIS.

Los 7 días de la ingesta tampoco son decorativos: **el modelo revisa sus propios
números.** La consulta va contra `archive-api.open-meteo.com`, que para fechas
recientes devuelve IFS operacional y no ERA5 definitivo. Bajar cada día una sola
vez dejaría guardada para siempre la primera pasada del modelo.

La **línea de tiempo** de 90 días es la mejora de fondo: una barra por día con la
lámina máxima de la provincia y el rango elegido resaltado. Convierte un rango de
fechas abstracto en algo que se ve. Sale de `/api/lluvia/serie`, que existe
aparte porque la línea muestra más días que el rango elegido y pedírselo al
endpoint grande sería traer el resumen de 103 consorcios para quedarse con un
número por fecha. Es el **máximo** entre consorcios, no el promedio: un temporal
sobre tres consorcios desaparece en un promedio de 103.

`/api/lluvia` devuelve además `cobertura` —días con serie, interpolados y sin
parte— para que el estado esté siempre a la vista en vez de aparecer en un cartel
cuando algo falta.

### Vocabulario

La pantalla usa el vocabulario estándar de hidrología, que ya estaba a mitad de
camino —isohietas, polígonos de Thiessen, IDW— mientras los botones hablaban
coloquial. La inconsistencia era el problema, no el nivel.

| Concepto | Cómo se nombra |
|---|---|
| Lo que se acumula en el período | **lámina acumulada** |
| El máximo de un día | **lámina máxima diaria** |
| El promedio sobre la red de un consorcio | **lámina areal** |
| Traer Open-Meteo | **descargar serie modelada** |
| Cruzar con la APA | **interpolar pluviómetros (IDW)** |

Lo que el sistema calcula por consorcio es **precipitación media areal**, el
concepto de manual; los tres métodos clásicos son media aritmética, polígonos de
Thiessen e isohietas. Están los tres: isohietas se dibujan, Thiessen se calcula
en `lib/thiessenAreal.ts` con los dos pesos, e IDW —que se agregó— es el que
manda porque midió mejor.

Se evita **"reanálisis"** en la UI a propósito: ERA5 lo es, pero para fechas
recientes Open-Meteo devuelve IFS operacional, que no. "Serie modelada" es
correcto para los dos casos.

**Los carteles de `sin_parte` y `sin_calcular` quedan en lenguaje llano.** No
hablan de hidrología sino del estado del dato, y ahí "la APA no publicó parte ese
día" es más claro que cualquier término.

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

El recálculo pagina la lectura de `precipitaciones` **con `order`**. Sin él
Postgres no garantiza el orden entre páginas y el `range()` se saltea o repite
filas, que es un bug silencioso: no falla, sólo deja filas sin recalcular.

**El recálculo escribe sólo las filas que cambian.** Lee `mm_fusion` y
`procedencia` junto con `mm` y compara antes de escribir. Sin eso, un rango de
90 días reescribía las ~9.300 filas **todas las veces** —incluidas las ~7.200 de
días sin parte de la APA, que van a tener siempre el mismo valor— y eso se
pasaba del tope de tiempo de la función: el botón fallaba con "Error en la
operación". Ahora la primera corrida escribe y la segunda no escribe nada.

`dbError()` recibe un tercer argumento `donde` y devuelve el **código de error de
Postgres**. "Error en la operación" a secas no se puede diagnosticar, que fue
justamente el problema acá: fallaba y no había forma de saber dónde. El código
(`57014` tiempo agotado, `23505` clave duplicada) es público y no dice nada del
esquema; el error completo va a `console.error`, que en Vercel queda en el log
del servidor.

**Los presets de rango usan `hace(d - 1)`, no `hace(d)`.** El rango se cuenta
inclusive, así que de hoy menos seis a hoy hay siete días. Con `hace(d)` los tres
botones pedían un día de más —"7 días" traía 8— y el de 90 daba 91, uno más que
`MAX_DIAS_FUSION`, así que ese botón fallaba siempre con *"El rango es de 91 días
y el máximo es 90"*. El techo estaba bien; el preset estaba mal. El test lo
afirma para los tres.

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

## El tiempo — pronóstico por consorcio y alertas del SMN

`lib/tiempo.ts` (puro) + `lib/tiempoFuente.ts` (servidor) + `components/tiempo/`.
Pestaña «Tiempo» de Hidrología (`PanelTiempo`) y una tarjeta en la fila de
arriba del Dashboard (`ResumenTiempo`): la peor alerta vigente, agrupada por
fenómeno y nivel (`agruparAlertas`), y la semana en miniatura. **Fue una
franja aparte y no gustó**: un día de tormentas listaba ocho avisos casi
iguales y le sacaba 70 px al mapa. Una línea, del alto de las otras tarjetas. Para cuatro usos: planificar obras, enterarse de un evento,
mirar el tiempo y preparar una salida de campo.

**Dos fuentes que no significan lo mismo, y van separadas en pantalla:**

| | Qué es | Quién la respalda | Ruta, caché |
|---|---|---|---|
| **Alertas** | avisos del SMN en CAP 1.2, con polígono | el SMN | `/api/tiempo/alertas`, 10 min |
| **Pronóstico** | Open-Meteo en la sede de cada uno de los 103 consorcios, 7 días | nadie: es un modelo | `/api/tiempo/pronostico`, 1 h |

- **Las alertas son sólo las del SMN; no se calcula ninguna con umbrales
  propios.** Mismo criterio que el río con los niveles del INA. Una "alerta"
  nuestra sobre el modelo podría contradecir el aviso oficial.
- **El SMN publica un índice HTML** (`ssl.smn.gob.ar/CAP/AR.php`) con un XML por
  aviso, ~170 en todo el país un día de tormentas. Se piden todos y se quedan
  los vigentes que tocan el Chaco. Un aviso viene partido en varios XML por
  región: se juntan por título y vigencia. **No está documentado como API**: si
  el índice deja de traer enlaces, la ruta lo informa como error.
- **Dos formatos el mismo día**: las alertas, con espacio de nombres por defecto
  y acentos en entidades numéricas (`&#xE1;`), y los avisos a muy corto plazo,
  con prefijo `cap:` y el color en el título («AVISO NARANJA…»). Las primeras
  traen sólo la severidad, que se lleva a color con la equivalencia estándar
  (Moderate amarillo, Severe naranja, Extreme rojo). El test cubre las dos.
- **Un consorcio está cubierto si su sede cae adentro del polígono.** Un aviso
  toca la provincia también si algún vértice cae adentro del contorno —uno chico
  entre sedes— o, sin polígono, si la descripción nombra al Chaco.
- **Un error no es "sin alertas".** Si el SMN no contesta, la ruta da 502 y la
  pantalla dice que no pudo consultar, nunca "no hay alertas". Los avisos sueltos
  que no se pudieron leer se cuentan en `fallaron` y se informan.
- **Planificación: días con y sin lluvia pronosticada, no "días aptos".** Si un
  camino está para trabajar depende de lo que llovió antes y del suelo: es el
  índice de transitabilidad que la pantalla descartó. El corte de 1 mm
  (`DIA_LLUVIA_MM`) es la convención climatológica para contar un día de lluvia.
- **El pronóstico es por sede, no por red.** Las celdas del modelo miden 10 a 25
  km y vecinos cercanos dan parecido; la pantalla lo dice. Ocho variables
  diarias: más de diez cuentan doble en el cupo de Open-Meteo.
- **La lluvia por cuenca y como rango sigue en Cuencas → Pronóstico**, con el
  pronóstico por conjuntos. Ésta es una sola corrida, para el tiempo general.
- **El SMN tiene también `pron5d`** (`ssl.smn.gob.ar/dpd/descarga_opendata.php`),
  pronóstico de 5 días cada 3 horas, pero sólo en estaciones —en el Chaco,
  Resistencia y pocas más— y el propio archivo aclara que es salida de modelo y
  puede diferir del pronóstico del SMN. No se usó.
- Íconos de cielo en SVG de trazo 1,2 px (`components/tiempo/piezas.tsx`): la
  convención prohíbe emojis, y los de clima son los que más tientan.

`scripts/verificar-tiempo.ts` no sale a la red. El 02/10/2026 el SMN tenía 169
avisos en el país y 16 tocaban el Chaco: tormentas, naranja y amarillo, para el
día siguiente.

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
- **`precipitaciones`, `mediciones_lluvia`, `estaciones_lluvia` y
  `pronostico_lluvia` tienen RLS y cero políticas, a propósito.** Sólo se acceden con la clave de servicio. No es
  un olvido: si algún día el navegador necesita leerlas, se agrega una política
  de select, **no** se desactiva RLS.
- **Siete tablas no tienen script de creación en el repo** — `profiles`,
  `obras`, `relevamientos`, `proyectos_ripio`, `ripios`, `obra_destinatarios` y
  `consorcios` se armaron a mano en el editor de Supabase. Sólo quedaron los
  `alter table` posteriores. Consecuencia: **no se puede reconstruir la base ni
  levantar un entorno de prueba.**

  Y no es sólo un problema de reconstrucción: **el código no puede saber qué
  garantiza el esquema.** El borrado de usuarios hacía a mano, y mal, algo que
  la base ya garantizaba — `profiles.id` es `references auth.users(id) on
  delete cascade`, verificado en el catálogo el 29/09/2026, así que borrar la
  cuenta borra el perfil en la misma transacción. El código borraba el perfil
  primero, dejando a la cascada sin nada que hacer y abriendo la ventana a una
  cuenta sin perfil.

  `docs/sql/11-extraer-ddl.sql` lo destraba: son siete consultas de sólo lectura
  que sacan el DDL real del catálogo de Postgres —columnas, restricciones,
  índices, RLS y políticas, funciones SECURITY DEFINER, triggers y grants—. Se
  corren en el editor de Supabase de a una y el resultado se pega en
  `docs/sql/12-tablas-base.sql`.

  **Sale del catálogo, no del código de la app**, que es la diferencia que
  importa: leer los `select` de la app te da los campos que se usan, no los que
  existen, ni los defaults, ni las políticas. Van como consultas separadas y no
  como un informe único para que una diferencia de versión de Postgres no se
  lleve puestas las otras seis.
- `precipitaciones.estaciones_usadas` guarda cuántas estaciones informaron ese
  día **en toda la provincia**, no cuántas se usaron para ese consorcio.

## Git y npm en Windows

- **NUNCA hacer git commit/push desde el sandbox Linux** (WSL/virtiofs). Usar
  siempre **Windows PowerShell**: el `index.lock` se corrompe en virtiofs.
- **Tampoco `npm install`.** Mismo motivo, distinto síntoma: npm renombra
  directorios para instalar y virtiofs devuelve `ENOTEMPTY: directory not empty,
  rename ...`. La instalación queda a medias —paquete sin sus `.d.ts`, symlinks
  de `.bin` sin crear— y el error aparece recién al correr `tsc`, lejos de la
  causa. Desde el sandbox se pueden **editar** `package.json` y regenerar el
  lockfile con `npm install --package-lock-only`, que no toca archivos; la
  instalación real va desde PowerShell.
- **`next build` tampoco corre desde el sandbox** una vez que se instaló desde
  Windows: el binario de SWC es por plataforma, y queda el de Windows. Desde el
  sandbox sirve `npx tsc --noEmit`, que es TypeScript puro y no usa binarios
  nativos. El build lo corre el usuario.
- **Los `verificar-*.ts` tampoco, por lo mismo**, desde que `tsx` es dependencia
  declarada: trae `esbuild`, que es nativo, y queda el de Windows —
  *"You installed esbuild for another platform"*. Antes andaban porque `npx` se
  bajaba una copia de Linux al vuelo. Para correrlos desde el sandbox hay que
  instalar `tsx` aparte fuera del repo y llamarlo por su ruta:

  ```bash
  mkdir -p /tmp/tsxlinux && cd /tmp/tsxlinux && npm init -y && npm i tsx
  cd <repo>/admin && node /tmp/tsxlinux/node_modules/tsx/dist/cli.mjs scripts/verificar-fusion.ts
  ```

  Los `.mjs` —la barrera de lint y la sintaxis SQL— sí corren, porque son Node
  puro.
- Si aparece `.git/index.lock`, borrarlo desde el Explorador de Windows.
- Cuando el usuario pide "el commit", responder **solo con el bloque de
  PowerShell**, sin explicación.

## Dependencias — cosas que costaron

**`jspdf` 2.5.2 → 4.2.1 y `jspdf-autotable` 3.8.3 → 5.0.8** (25/09/2026). Era la
última vulnerabilidad crítica que quedaba. Se probó antes: las trece llamadas que
usa `calculadoras/page.tsx` andan igual, `doc.lastAutoTable.finalY` sigue
existiendo aunque no esté en los tipos, y el default export de autotable sigue
siendo la función.

**`src/types/vendor.d.ts` se eliminó, y eso destapó un bug.** Declaraba
`module 'jspdf'` a mano —herencia de un `npm install` que quedó a medias— y como
tenía `[key: string]: any`, **apagaba el chequeo de tipos sobre todo el objeto
`doc`**. Los dos paquetes traen sus propios tipos. Al sacarlo apareció que el
presupuesto Ae-10 pasaba `fontFamily: 'monospace'` a autotable: esa opción no
existe —la clave es `font`, y sólo acepta 'helvetica' | 'times' | 'courier'— así
que **nunca hizo nada y el PDF se viene imprimiendo en helvetica**. Se sacó la
línea para que el código diga lo que hace. Si se quiere monoespaciado de verdad
es `font: 'courier'`, pero los `cellWidth` de esa tabla están calibrados contra
helvetica y hay que rehacerlos.

Moraleja: **un shim de tipos con índice `any` no es una molestia de tipado, es
un chequeo apagado.** Antes de escribir uno, revisar si el paquete trae tipos.

Quedan dos vulnerabilidades moderadas, las dos de `uuid` vía `exceljs`: el arreglo
que ofrece npm es bajar a `exceljs@3.4.0`, un cambio mayor, por un chequeo de
límites que sólo aplica cuando se le pasa un `buf` propio. No se toca.

## Documentación

- `docs/metodologia-lluvia.md` — **documento técnico de la pantalla de Lluvias**:
  de dónde sale cada número, cómo se procesa y por qué se eligió ese método
  sobre las alternativas. Es el que se le pasa a un tercero que pregunta cómo
  funciona, o el que se cita en un expediente. Está escrito para un lector
  humano externo; este CLAUDE.md, para trabajar sobre el código. **Si cambia un
  método o una constante, hay que tocar los dos.**
- `docs/inundaciones-gran-resistencia.md` — investigación del 06/10/2026 sobre
  las áreas inundables del Gran Resistencia: qué imágenes antiguas existen, la
  mancha de agua en Landsat (21 escenas elegidas de 1981 a 2023 y la serie
  entera, 337 desde 1984) y en Sentinel-2, a qué altura del río se moja cada
  lugar, la mancha urbana por época, y el cruce con Barranqueras, el Niño y la
  lluvia local. Desde el 07/10/2026 tiene una tercera pasada: la órbita
  227/079, el Canal 16 y la prueba de los modelos de elevación. Resultados en `docs/geo/inundaciones/`. Alimenta la pestaña
  «Gran Resistencia» de Hidrología. Cosas que conviene no volver a averiguar:
  - Landsat y Sentinel-2 se leen sin cuenta desde Planetary Computer. **De a
    una banda y con el permiso pedido una sola vez**: en paralelo las
    conexiones se cortan, y pedir el permiso en cada lectura da 429.
  - **ERA5 da la mitad de lo medido en los meses más lluviosos de Resistencia**
    (290 mm contra 588 en enero de 2019).
  - La ocurrencia de agua propia coincide 0,97 con el *Global Surface Water*
    del JRC, que se baja sin cuenta.
  - Los scripts están en `admin/scripts/inundaciones/` y usan paquetes que **no
    están en `package.json`** (geotiff, proj4, d3-contour, pngjs): se corren
    copiando la carpeta afuera del repo.
- `docs/lluvia-pendientes.md` — lo que falta probar (IMERG, radar, kriging) con
  el procedimiento para medirlo
- `docs/propuesta-ripio-presupuesto.md` — análisis de las planillas de cálculo y
  el plan de implementación
- `docs/sql/` — scripts SQL aplicados en Supabase
