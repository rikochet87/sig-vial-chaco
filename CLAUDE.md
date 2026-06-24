# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

App móvil React Native + Expo para relevamiento y gestión de infraestructura vial rural en la Provincia del Chaco, Argentina. Licencia CC BY-NC-ND 4.0.

## Comandos

```bash
# Desarrollo
npm start                    # Expo dev server (QR code / tunnel)
npm run android              # Build y correr en emulador/dispositivo Android
npm run ios                  # Build y correr en iOS simulator
npm run web                  # Correr en web (experimental)

# EAS Build (cloud)
eas build --platform android --profile preview --non-interactive   # APK
eas build --platform android --profile production --non-interactive # AAB

# Type checking
npx tsc --noEmit
```

No hay scripts de lint ni tests configurados.

## Stack

- **Expo SDK 54** + React Native 0.81.5
- **expo-router v6** — navegación file-based con tabs
- **TypeScript** — modo estricto (`strict: true`)
- **Leaflet.js 1.9** via `react-native-webview` — mapa OSM offline, sin API key
- **expo-location** — GPS
- **expo-file-system/legacy** — persistencia local de relevamientos
- **expo-image-picker** — fotos adjuntas a relevamientos
- **EAS Build** — APK/AAB para Android

## Arquitectura

### Mapa (WebView + Leaflet)

`app/(tabs)/mapa.tsx` es el archivo principal (~1820 líneas). El mapa corre en una WebView separada de React Native:

- **RN → Leaflet**: `injectJavaScript()` para agregar capas, marcadores, controles
- **Leaflet → RN**: `window.ReactNativeWebView.postMessage()` para eventos (tap, posición, dibujo de línea)
- No usa `react-native-maps` ni Google Maps API

### Formulario de relevamiento

`components/RelevamientoModal.tsx` (~1116 líneas) maneja los 5 tipos de infraestructura:

| Tipo | GeoJSON | Descripción |
|------|---------|-------------|
| **Puente** | Point | Datos de vano, palcos, altura, estructura, barandas |
| **Alcantarilla** | Point | Dimensiones, materiales, estado de drenaje |
| **Tubos** | Point | Diámetro, cabezales, profundidad, cantidad |
| **Ripio** | **LineString** | Ancho, espesor, longitud, cálculo automático de tonelaje (2.1 t/m³) |
| **Otro** | Point | Descripción libre |

El Ripio tiene dos modos de captura de línea:
1. **GPS Track** — dentro del formulario; graba puntos GPS mientras el inspector camina
2. **Dibujar en mapa** — cierra el modal, entra en modo draw de Leaflet, reabre el modal con coordenadas

### Persistencia

`hooks/useRelevamientos.ts` gestiona relevamientos locales:
- Archivo: `${documentsDirectory}/relevamientos.json`
- Sin backend ni sincronización en la nube

### GeoJSON estático

Todos los datos geoespaciales están bundleados offline:

- `constants/geoBundle.ts` — límites provinciales/zonales, sedes, campamentos (~1.2 MB, generado por script Python)
- `constants/geoBundleCC.ts` — red vial por consorcio por zona
- `constants/geoBundleRP.ts` — rutas provinciales (pavimentada/mejorada/en obra/tierra)
- `constants/realData.ts` — datos de 103 consorcios (coords, km de red, autoridades) — **no editar manualmente**

Para regenerar bundles GeoJSON desde archivos QGIS:
```bash
python scripts/build_geo_bundle.py
python scripts/build_geo_bundle_cc.py
```

## Convenciones importantes

- **NO mencionar** DVP, Dirección de Conservación Vial ni Dirección de Vialidad Provincial en la UI. La app es independiente.
- Colores oficiales: negro DVP `#2C2C2C` (primario), amarillo DVP `#F5C300` (acento). Ver `constants/Colors.ts`.
- Los relevamientos Ripio usan `coordsLinea: LatLngPunto[]`; todos los demás usan coordenadas únicas (Point).
- Auto-detección del consorcio más cercano: distancia euclidiana sobre lat/lng de `realData.ts`.
- `metro.config.js` configura soporte para importar `.geojson` como JSON.
- `babel.config.js` requiere el plugin `react-native-reanimated` al final.

## EAS Build — notas críticas

- Package: `com.rosello.sigvialchaco`
- `kotlinVersion` debe ser **2.1.0** (KSP requiere Kotlin 2.x con Expo SDK 54; la 1.9.x falla)
- `newArchEnabled: true` (New Architecture habilitada)
- `compileSdkVersion: 35`

## Git en Windows

- **NUNCA hacer git commit/push desde sandbox Linux** (WSL/virtiofs). Usar siempre **Windows PowerShell**. El `index.lock` se corrompe en virtiofs.
- Si aparece `.git/index.lock`, borrarlo desde el Explorador de Windows.
