# SIG Vial Chaco

**Sistema de Información Geográfica para Gestión de Infraestructura Vial Rural — Provincia del Chaco, Argentina**

Aplicación móvil (Android & iOS) para el relevamiento y gestión de infraestructura vial rural. Permite a inspectores y técnicos de campo registrar, visualizar y exportar información geoespacial sobre puentes, alcantarillas, tubos, ripio y otros tipos de obra vial, trabajando sobre un mapa SIG offline con capas GeoJSON de elaboración propia.

---

## Características principales

- **Mapa SIG offline** basado en OpenStreetMap + Leaflet.js (sin API key, funciona sin internet)
- **103 consorcios viales** del Chaco con geometrías GeoJSON propias organizados en 5 zonas (ZI–ZV)
- **Capas de red vial provincial** — pavimentada, mejorada, en obra y de tierra
- **GPS en tiempo real** con punto azul animado y posicionamiento continuo
- **Sistema de relevamientos** con formularios especializados por tipo de obra:
  - Puente (palizadas, vanos, altura, estructura, guiarruedas, barandas)
  - Alcantarilla (dimensiones, materiales, estado estructural, situación hidráulica)
  - Tubos (dimensiones, cabezales, tapada, cantidad)
  - Ripio — tipo lineal, con dos modos de captura:
    - **Dibujar en mapa**: trazado interactivo sobre OSM desde gabinete o campo
    - **GPS Track**: grabación automática del recorrido en vehículo (cada 10 m)
    - Cálculo automático de toneladas (densidad 2,1 t/m³), empresa ejecutora y fecha
  - Otro (descripción libre)
- **Auto-detección** del consorcio más cercano a las coordenadas GPS
- **Fotografías** adjuntas desde la cámara del dispositivo
- **Exportación GeoJSON** (puntos y linestrings según tipo de obra)
- **Eliminación sincronizada** entre mapa y lista de relevamientos
- **Persistencia local** — los datos se guardan en el dispositivo, sin servidor

---

## Stack tecnológico

| | |
|---|---|
| Framework | React Native + Expo SDK 54 |
| Lenguaje | TypeScript |
| Navegación | expo-router v6 |
| Mapa | Leaflet.js 1.9 via WebView (offline) |
| GPS | expo-location |
| Almacenamiento | expo-file-system |
| Cámara | expo-image-picker |

---

## Requisitos previos

- [Node.js 18+](https://nodejs.org)
- Expo Go en el celular (Android o iOS) para desarrollo

```bash
npm install -g expo-cli
```

---

## Instalación y ejecución

```bash
# Clonar el repositorio
git clone https://github.com/rikochet87/sig-vial-chaco.git
cd sig-vial-chaco

# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm start
```

Escaneá el QR con **Expo Go** desde tu celular, o presioná `a` (Android) / `i` (iOS) para abrir en emulador.

---

## Estructura del proyecto

```
sig-vial-chaco/
├── app/
│   ├── (tabs)/
│   │   ├── index.tsx          # Dashboard / Inicio
│   │   ├── mapa.tsx           # Mapa SIG + relevamientos
│   │   ├── consorcios.tsx     # Lista de consorcios
│   │   └── reportes.tsx       # Lista de relevamientos
│   ├── red-vial.tsx           # Red vial por zona
│   ├── distribucion.tsx       # Distribución territorial
│   └── autoridades.tsx        # Autoridades de consorcios
├── components/
│   └── RelevamientoModal.tsx  # Formulario de relevamiento
├── hooks/
│   └── useRelevamientos.ts    # Persistencia de relevamientos
├── types/
│   └── relevamiento.ts        # Tipos e interfaces
├── constants/
│   ├── Colors.ts              # Paleta de colores
│   ├── realData.ts            # Datos de consorcios
│   ├── geoBundle.ts           # GeoJSON bundleado offline
│   ├── geoBundleCC.ts         # GeoJSON red CC por zona
│   └── geoBundleRP.ts         # GeoJSON rutas provinciales
└── assets/geojson/            # Capas GeoJSON originales (QGIS)
```

---

## Roadmap

- [ ] Autenticación de usuarios con roles (inspector / supervisor)
- [ ] Sincronización con backend / base de datos central
- [ ] Exportación a PDF de informes de relevamiento
- [ ] Notificaciones push para asignación de tareas
- [ ] Panel web de visualización y análisis

---

## Licencia y autoría

**© 2026 Matias Rosello. Todos los derechos reservados.**

Este proyecto está licenciado bajo [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/deed.es).

- ✅ Podés ver y compartir el código con atribución al autor.
- ❌ **No está permitido el uso comercial** sin autorización expresa del autor.
- ❌ No está permitida la distribución de versiones modificadas.

Para solicitar una licencia comercial: **rosellomatias87@gmail.com**

El incumplimiento puede dar lugar a acciones legales bajo la **Ley 11.723 de Propiedad Intelectual** (Argentina) y tratados internacionales aplicables.
