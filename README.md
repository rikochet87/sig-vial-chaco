# Consorcio Caminero — App Móvil (React Native + Expo)

App Android & iOS para gestión de consorcios viales: mapa SIG, administración de caminos, gastos y reportes.

---

## Requisitos previos

- [Node.js 18+](https://nodejs.org)
- [Expo CLI](https://docs.expo.dev/get-started/installation/)

```bash
npm install -g expo-cli
```

- Para Android: Android Studio + emulador, o celular físico con la app **Expo Go**
- Para iOS: Mac con Xcode, o celular físico con **Expo Go**

---

## Instalación

```bash
cd ConsorcioCaminero
npm install
```

---

## Correr la app

```bash
# Inicia el servidor de desarrollo
npm start

# O directamente para cada plataforma:
npm run android
npm run ios
npm run web
```

Escaneá el QR con **Expo Go** desde tu celular, o presioná `a` (Android) / `i` (iOS) en la terminal para abrir en emulador.

---

## Estructura del proyecto

```
ConsorcioCaminero/
├── app/                      # Pantallas (expo-router)
│   ├── _layout.tsx           # Layout raíz
│   ├── (tabs)/               # Navegación por tabs
│   │   ├── _layout.tsx       # Configuración de tabs
│   │   ├── index.tsx         # 🏠 Dashboard / Inicio
│   │   ├── mapa.tsx          # 🗺️  Mapa vial (SIG)
│   │   ├── consorcios.tsx    # 🏢 Lista de consorcios
│   │   └── reportes.tsx      # 📄 Reportes
│   ├── consorcio/[id].tsx    # Detalle de consorcio
│   └── reporte/[id].tsx      # Detalle de reporte
├── constants/
│   ├── Colors.ts             # Paleta de colores
│   └── mockData.ts           # Datos de ejemplo
├── types/
│   └── index.ts              # TypeScript types
├── app.json                  # Configuración Expo
├── package.json
└── tsconfig.json
```

---

## Pantallas incluidas

| Pantalla | Descripción |
|---|---|
| Dashboard | KPIs, ejecución presupuestaria, accesos rápidos |
| Mapa Vial | Mapa híbrido con marcadores y tramos coloreados por estado |
| Consorcios | Lista filtrable y buscable con cards de información |
| Reportes | Listado por tipo (mensual, incidente, etc.) con montos |
| Detalle Consorcio | Red vial, presupuesto, tramos, gastos y reportes |
| Detalle Reporte | Información completa del reporte |

---

## Configurar Google Maps (para producción)

1. Obtener una API Key en [Google Cloud Console](https://console.cloud.google.com)
2. Habilitar **Maps SDK for Android** y **Maps SDK for iOS**
3. Reemplazar `TU_API_KEY_AQUI` en `app.json`

---

## Próximos pasos sugeridos

- [ ] Conectar a backend/API real (reemplazar `mockData.ts`)
- [ ] Autenticación de usuarios
- [ ] Carga de fotos desde terreno
- [ ] Exportar reportes a PDF
- [ ] Modo offline con sincronización
- [ ] Notificaciones push para incidentes
