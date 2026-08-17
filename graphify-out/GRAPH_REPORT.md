# Graph Report - C:\Users\Noxi-PC\Desktop\BD\04_Proyectos\02_SIG_Vial  (2026-08-12)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 967 nodes · 1419 edges · 64 communities (51 shown, 13 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.6)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `95952bb8`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- MapInner.tsx
- createServiceClient
- dependencies
- planta/page.tsx
- compilerOptions
- expo
- calculadoras/page.tsx
- RelevamientoModal.tsx
- dependencies
- devDependencies
- obras/page.tsx
- exportSHP.ts
- mapa.tsx
- RelevamientoEditForm.tsx
- revision/page.tsx
- createClient
- Relevamiento
- InlineMapDraw.tsx
- reportes.tsx
- realData.ts
- relevamiento.ts
- GuardarObraModal.tsx
- jsPDF
- useConsorcios.ts
- distribucion.tsx
- InlineLineDraw.tsx
- obras.tsx
- Colors.ts
- geojson.d.ts
- app/_layout.tsx
- expo-router
- red-vial.tsx
- exportKMZ.ts
- geoLoader.ts
- useColors
- confirmSave
- AuthContext.tsx
- useRelevamientos.ts
- RelevamientoActions.tsx
- autoridades.tsx
- src/types/index.ts
- build_geo_bundle.py
- seed_consorcios.js
- CalculadorasPage
- onToggleZone
- RelevamientoModal
- build_geo_bundle_cc.py
- middleware.ts
- nuevo/page.tsx
- app/layout.tsx
- metro.config.js
- eslint.config.mjs
- next.config.ts
- postcss.config.mjs
- ccPopupHtml
- onToolbarDragStart
- onToolPanelDragStart
- tailwind.config.ts
- expo-file-system-legacy.d.ts

## God Nodes (most connected - your core abstractions)
1. `createServiceClient()` - 26 edges
2. `useColors()` - 24 edges
3. `createClient()` - 17 edges
4. `expo` - 17 edges
5. `expo-router` - 16 edges
6. `compilerOptions` - 16 edges
7. `useS()` - 15 edges
8. `Relevamiento` - 14 edges
9. `useConsorcios()` - 14 edges
10. `jsPDF` - 13 edges

## Surprising Connections (you probably didn't know these)
- `ThemeCtx` --references--> `ColorPalette`  [EXTRACTED]
  context/ThemeContext.tsx → constants/Colors.ts
- `Props` --references--> `Relevamiento`  [EXTRACTED]
  components/RelevamientoModal.tsx → types/relevamiento.ts
- `RelevamientoCard()` --calls--> `exportarSHP()`  [EXTRACTED]
  app/(tabs)/reportes.tsx → utils/exportSHP.ts
- `MapaScreen()` --calls--> `useAuth()`  [EXTRACTED]
  app/(tabs)/mapa.tsx → context/AuthContext.tsx
- `MapaScreen()` --calls--> `useColors()`  [EXTRACTED]
  app/(tabs)/mapa.tsx → context/ThemeContext.tsx

## Import Cycles
- None detected.

## Communities (64 total, 13 thin omitted)

### Community 0 - "MapInner.tsx"
Cohesion: 0.02
Nodes (66): aClickRef, [activeZones, setActiveZones], aPtsMutable, [areaPts, setAreaPts], CC_COLORS, [cc,  setCc], CC_WEIGHT, cClickRef (+58 more)

### Community 1 - "createServiceClient"
Cohesion: 0.07
Nodes (44): PATCH(), PATCH(), DELETE(), GET(), PATCH(), POST(), PATCH(), DELETE() (+36 more)

### Community 2 - "dependencies"
Cohesion: 0.04
Nodes (47): babel-preset-expo, expo, expo-build-properties, expo-file-system, expo-image-picker, expo-linking, expo-location, expo-sensors (+39 more)

### Community 3 - "planta/page.tsx"
Cohesion: 0.06
Nodes (36): BASE_LAYER_DEFAULTS, BASE_LAYER_KEYS, BaseLayerKey, calcResults(), CC_COLORS, DEFAULTS, fmtArea(), getHalfWidth() (+28 more)

### Community 4 - "compilerOptions"
Cohesion: 0.05
Nodes (40): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+32 more)

### Community 5 - "expo"
Cohesion: 0.05
Nodes (41): backgroundColor, foregroundImage, monochromeImage, adaptiveIcon, package, permissions, versionCode, projectId (+33 more)

### Community 6 - "calculadoras/page.tsx"
Cohesion: 0.06
Nodes (26): CalcDesmalezado(), CalcTerraplen(), CLR, DesmEntry, EQ_DEFAULTS, EqRow, EquipoAP, HATCH() (+18 more)

### Community 7 - "RelevamientoModal.tsx"
Cohesion: 0.10
Nodes (32): AlcantarillaForm(), buildNomenclatura(), CanalSubForm(), CCtx, EstadoEstructuralBtns(), ESTADOS, FGroup(), FInput() (+24 more)

### Community 8 - "dependencies"
Cohesion: 0.06
Nodes (32): dependencies, jspdf, jspdf-autotable, leaflet, @mapbox/shp-write, next, react, react-dom (+24 more)

### Community 9 - "devDependencies"
Cohesion: 0.06
Nodes (31): devDependencies, eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/node, @types/react, @types/react-dom (+23 more)

### Community 10 - "obras/page.tsx"
Cohesion: 0.08
Nodes (23): EditModalProps, ESTADO_COLORS, ESTADO_LABELS, ESTADOS, ESTADOS_EDIT, fmt(), inpStyle, JURIS_EDIT (+15 more)

### Community 11 - "exportSHP.ts"
Cohesion: 0.15
Nodes (22): App(), plugins, styles, expo-font, expo-sharing, expo-status-bar, expo-font, expo-sharing (+14 more)

### Community 12 - "mapa.tsx"
Cohesion: 0.10
Nodes (21): buildMapHtml(), buildObraPopup(), CC_PER_ZONA, CCZonaState, Layers, makeStyles(), MapaScreen(), OBRA_COLOR (+13 more)

### Community 13 - "RelevamientoEditForm.tsx"
Cohesion: 0.10
Nodes (12): ESTADOS, field, fmtFecha(), grid2, input, label, RelevamientoEditForm(), sectionCard (+4 more)

### Community 14 - "revision/page.tsx"
Cohesion: 0.17
Nodes (19): accColor(), efectiveTipo(), fmtDist(), fmtPK(), fmtTs(), haversine(), LeafletRevisionMap(), MapProps (+11 more)

### Community 15 - "createClient"
Cohesion: 0.16
Nodes (11): ConsorciosPage(), HerramientasInner(), RelevamientosMap, RelevamientosPage(), ROLES, TIPOS, ZONAS, LoginPage() (+3 more)

### Community 16 - "Relevamiento"
Cohesion: 0.17
Nodes (11): TIPO_COLORS, TIPOS, DashboardMap(), RelevamientosMap, Props, Map, RelevamientoDetailMap(), Props (+3 more)

### Community 17 - "InlineMapDraw.tsx"
Cohesion: 0.15
Nodes (17): ConfirmedPoly, InlineMapDraw(), LatLng, LAYER_COLORS, LAYER_DEFAULTS, LAYER_KEYS, LAYER_LABELS, LayerKey (+9 more)

### Community 18 - "reportes.tsx"
Cohesion: 0.15
Nodes (13): FieldList(), FILTROS, makeExportName(), makeStyles(), RelevamientoCard(), RelevamientosScreen(), StylesCtx, StylesType (+5 more)

### Community 19 - "realData.ts"
Cohesion: 0.16
Nodes (12): CONSORCIOS, GASTOS, REPORTES, TRAMOS, CHACO_BOUNDARY, CONSORCIOS, supabase, ConsorcioDato (+4 more)

### Community 20 - "relevamiento.ts"
Cohesion: 0.12
Nodes (16): AutoDeteccion, DatosAlcantarilla, DatosLineal, DatosOtro, DatosPuente, DatosTubos, DEFAULT_ALCANTARILLA, DEFAULT_LINEAL (+8 more)

### Community 21 - "GuardarObraModal.tsx"
Cohesion: 0.13
Nodes (14): ConsorcioOpt, Estado, GeoTipo, GuardarObraData, GuardarObraModal(), inp, JURIS_LABELS, Jurisdiccion (+6 more)

### Community 23 - "useConsorcios.ts"
Cohesion: 0.21
Nodes (11): ConsorcioDetailScreen(), styles, HomeScreen(), makeStyles(), ZONAS_CONFIG, ConsorcionSource, CONSORCIOS_INIT, geoKmMap (+3 more)

### Community 24 - "distribucion.tsx"
Cohesion: 0.19
Nodes (13): buildChartHtml(), CHART_OPTS, ChartType, DistribucionScreen(), fmt(), makeStyles(), pct(), SEDES (+5 more)

### Community 25 - "InlineLineDraw.tsx"
Cohesion: 0.20
Nodes (13): InlineLineDraw(), LatLng, LAYER_COLORS, LAYER_DEFAULTS, LAYER_KEYS, LAYER_LABELS, LayerKey, parseGeoJSONLines() (+5 more)

### Community 26 - "obras.tsx"
Cohesion: 0.18
Nodes (12): ESTADO_COLOR, ESTADO_LABEL, fmtFecha(), fmtPesos(), getConsorcio(), Obra, OBRA_HIGHLIGHT_KEY, ObraCard() (+4 more)

### Community 27 - "Colors.ts"
Cohesion: 0.18
Nodes (11): CAD, ColorPalette, DARK, LIGHT, ORIGINAL, THEME_LABELS, ThemeName, THEMES (+3 more)

### Community 28 - "geojson.d.ts"
Cohesion: 0.17
Nodes (11): Feature, FeatureCollection, *.geojson, Geometry, LineString, MultiLineString, MultiPoint, MultiPolygon (+3 more)

### Community 29 - "app/_layout.tsx"
Cohesion: 0.20
Nodes (6): ErrorBoundary, RouteGuard(), styles, ObrasScreen(), AuthProvider(), useAuth()

### Community 30 - "expo-router"
Cohesion: 0.20
Nodes (7): styles, REPORTES, styles, TIPO_CONFIG, Colors, expo-router, expo-router

### Community 31 - "red-vial.tsx"
Cohesion: 0.25
Nodes (9): fmt(), KmChip(), makeStyles(), RedVialScreen(), Styles, ZONA_COLORS, ZONA_LABELS, ZonaHeader() (+1 more)

### Community 32 - "exportKMZ.ts"
Cohesion: 0.31
Nodes (10): Props, Relevamiento, buildDescription(), buildGeometry(), buildKML(), buildStyles(), escXml(), exportarKMZ() (+2 more)

### Community 33 - "geoLoader.ts"
Cohesion: 0.24
Nodes (9): ConsorcioFeature, LatLng, parseLimiteChaco(), parseRedVial(), polygonToLatLng(), posToLatLng(), RED_VIAL_COLORS, RedVialFeature (+1 more)

### Community 34 - "useColors"
Cohesion: 0.29
Nodes (7): ConsorciosScreen(), makeStyles(), IoniconsName, TabIcon(), TabsLayout(), FotoStrip(), useColors()

### Community 35 - "confirmSave"
Cohesion: 0.28
Nodes (9): circleAreaM2(), circleToPolygonPts(), confirmSave(), downloadFile(), exportKML(), exportSHP(), haversine(), polygonAreaM2() (+1 more)

### Community 36 - "AuthContext.tsx"
Cohesion: 0.31
Nodes (5): s, AuthContext, AuthContextType, supabase, UserProfile

### Community 37 - "useRelevamientos.ts"
Cohesion: 0.47
Nodes (7): getUserId(), useRelevamientos(), writeFile(), syncOne(), syncPendientes(), toSupabaseRow(), uploadFotoIfLocal()

### Community 38 - "RelevamientoActions.tsx"
Cohesion: 0.39
Nodes (6): baseName(), buildGeoJSON(), downloadBlob(), GHOST, RelevamientoActions(), toKML()

### Community 39 - "autoridades.tsx"
Cohesion: 0.29
Nodes (6): AutoridadesScreen(), makeStyles(), ROLES, ZONA_COLORS, ZONA_LABELS, ZONAS

### Community 40 - "src/types/index.ts"
Cohesion: 0.52
Nodes (4): EditConsorcioForm(), Props, ConsorcioDetailPage(), Consorcio

### Community 41 - "build_geo_bundle.py"
Cohesion: 0.70
Nodes (4): build_bundle(), load(), simplify_geojson(), simplify_polygon()

### Community 42 - "seed_consorcios.js"
Cohesion: 0.50
Nodes (4): AUTHORITY_FIELDS, CONSORCIOS, post(), seed()

### Community 43 - "CalculadorasPage"
Cohesion: 0.50
Nodes (4): CalculadorasPage(), consumeReturnTab(), saveReturnTab(), setObraTransfer()

### Community 44 - "onToggleZone"
Cohesion: 0.50
Nodes (4): onToggleZone(), RightPanel(), toggle(), ZoneRow()

### Community 45 - "RelevamientoModal"
Cohesion: 0.50
Nodes (4): calcPolylineM(), haversineM(), makeStyles(), RelevamientoModal()

### Community 46 - "build_geo_bundle_cc.py"
Cohesion: 0.67
Nodes (3): Genera constants/geoBundleCC.ts con la red bajo convenio de cada consorcio.…, simplify(), simplify_geojson()

## Knowledge Gaps
- **437 isolated node(s):** `CK`, `LayerKey`, `LayerState`, `RCK`, `RSK` (+432 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Consorcio` connect `src/types/index.ts` to `realData.ts`, `createClient`?**
  _High betweenness centrality (0.358) - this node is a cross-community bridge._
- **Why does `expo-router` connect `expo-router` to `useColors`, `AuthContext.tsx`, `autoridades.tsx`, `exportSHP.ts`, `mapa.tsx`, `reportes.tsx`, `useConsorcios.ts`, `distribucion.tsx`, `obras.tsx`, `app/_layout.tsx`, `red-vial.tsx`?**
  _High betweenness centrality (0.224) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `dependencies`, `devDependencies`, `exportSHP.ts`, `expo-router`?**
  _High betweenness centrality (0.179) - this node is a cross-community bridge._
- **What connects `CK`, `LayerKey`, `LayerState` to the rest of the system?**
  _437 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `MapInner.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.022988505747126436 - nodes in this community are weakly interconnected._
- **Should `createServiceClient` be split into smaller, more focused modules?**
  _Cohesion score 0.06715063520871144 - nodes in this community are weakly interconnected._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.0425531914893617 - nodes in this community are weakly interconnected._