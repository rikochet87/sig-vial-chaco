# Ripio: del cómputo al presupuesto oficial

Propuesta de implementación basada en el análisis de `Planillas para computos y presupuesto ripio.xlsx`.

---

## 1. Qué hace hoy la planilla

Doce hojas encadenadas. Ninguna es independiente: todas leen de `ID` y se alimentan entre sí.

```
ID ──► Cpto ──► Coef ──┬──► PuMat    ($/tn)     ──┐
 │                     ├──► Pu-NoPav ($/tn·km)    │
 └──► Equipos, MdeO ───┼──► Pu-Pav   ($/tn·km)    ├──► PptoOf ──► Foja01
                       └──► Pu-Const ($/m)      ──┘
```

### ID — datos base
Identificación de la obra (actuación, obra, tramo, objeto), origen (cantera) y destino,
distancias discriminadas en pavimentado / no pavimentado, y los **precios del mes**:
gasoil, neumático, dólar, los cuatro jornales (Of. Especializado, Oficial, Medio Oficial,
Ayudante) y el ripio en cantera.

Todo el resto del libro deriva de estos valores. Cambiar el dólar recalcula las 41 máquinas
del catálogo, y de ahí los cuatro análisis de precio y el presupuesto.

### Cpto — cómputos métricos
Tres ítems:

| Ítem | Concepto | Unidad | Fórmula |
|---|---|---|---|
| I | Provisión | tn | `L × Ancho × Espesor × Densidad` + redondeo |
| II | Transporte y descarga | tn | igual a I, discriminado pavimentado / no pavimentado |
| III | Ejecución | m | `L` |

En el ejemplo: `13.100 × 6 × 0,08 × 2 = 12.576 tn`, redondeo −6 → **12.570 tn**.

### Coef — coeficientes
Derivados de `ID`, se aplican a todos los análisis de precio:

| Concepto | Fórmula | Valor ejemplo |
|---|---|---|
| Amortización | `hs/día ÷ vida útil` | 8 / 10.000 = 0,0008 1/día |
| Intereses | `(i × hs/día) ÷ (años × hs/año)` | (0,15×8)/(2×2000) = 0,0003 |
| Amort. + Int. | suma redondeada | **0,0011 1/día** |
| Reparación y repuestos | `0,75 × amortización` | 0,0006 1/día |
| Combustible vuelta (cargado) | `0,45 l/km × gasoil sin IVA × 1,3` | 1.208,68 $/km |
| Combustible ida (vacío) | `0,30 l/km × gasoil sin IVA` | 619,83 $/km |
| Combustible equipos | `0,15 l/HP·h × hs/día × gasoil × 1,3` | 3.223,14 |
| Cámaras y cubiertas | `18 cub × precio sin IVA ÷ 70.000 km` | 127,509 $/km |
| Seguros y patentes | `0,10/año × hs/día ÷ hs/año` | 0,0004 1/día |

**Coeficiente resumen** — el markup que convierte costo en precio:

```
Costo                          1,0000
+ Gastos generales    20 %     0,2000
+ Beneficio           13 %     0,1300
                             ─────────
                               1,3300
+ Gastos financieros   2 %     0,0266
                             ─────────
                               1,3566
+ IVA e Ingresos Brutos 23,9 % 0,3242
                             ─────────
COEFICIENTE RESUMEN            1,68
```

El gasoil y el neumático entran **sin IVA** (`precio ÷ 1,21`) porque el IVA se agrega
recién acá. Es un detalle fácil de perder y cambia el resultado un 21 %.

### Equipos — catálogo
41 máquinas con potencia (HP) y costo en dólares. El costo en pesos se recalcula solo:
`costo U$S × cotización`. Motoniveladora, autocompactador, camión regador, camión de
transporte de larga distancia, cargador frontal, etc.

### MdeO — mano de obra
Del jornal básico al costo real por hora:

```
180 hs × jornal básico
+ presentismo 20 %                    = BRUTO
− retenciones (SIPA 11, INSSJP 3, OS 3, sindical 1,8, ISTIC 0,5)  = NETO
+ cargas sociales 75,5 %
    contribuciones      53,79 %  (SIPA, ART, fondo cese, UOCRA…)
    otros               21,71 %  (vacaciones, SAC, vestimenta…)
                                      = COSTO TOTAL LABORAL
÷ 180 hs + suma no remunerativa       = COSTO REAL $/hs
```

La incidencia final es ~1,97: **cada peso de jornal cuesta casi dos**.

### Pu-* — análisis de precio unitario
Cuatro planillas con la misma estructura:

```
1. EJECUCIÓN
   1.a EQUIPOS     → equipos elegidos × cantidad → Σ costo
                     × coeficientes (amort, reparación, combustible,
                       cubiertas, seguros)        = subtotal $/día
   1.b MANO DE OBRA → 4 categorías × cantidad × hs/día × costo real
                                                 = subtotal $/día
   COSTO DIARIO DE EJECUCIÓN = 1.a + 1.b
   RENDIMIENTO               (carga tn y recorrido km/día, ó m/día)
   COSTO UNITARIO            = costo diario ÷ rendimiento
2. MATERIALES
3. HERRAMIENTAS MENORES Y TRANSPORTE INTERNO

COSTO-COSTO = 1 + 2 + 3
PRECIO      = COSTO-COSTO × 1,68
[PRECIO ADOPTADO — redondeo manual a criterio del proyectista]
```

| Planilla | Concepto | Unidad | Ejemplo |
|---|---|---|---|
| `PuMat` | Provisión de material | $/tn | material en cantera |
| `Pu-NoPav` | Transporte calzada no pavimentada | $/tn·km → × km = $/tn | 221,28 × 13 = 2.876,64 $/tn |
| `Pu-Pav` | Transporte calzada pavimentada | $/tn·km | (sin uso en el ejemplo) |
| `Pu-Const` | Construcción de enripiado | $/m | 16.923,48 → adoptado **16.900** |

El transporte se calcula por tonelada-kilómetro y recién después se multiplica por la
distancia. Eso permite cambiar el recorrido sin rehacer el análisis.

### PptoOf — presupuesto oficial

| Ítem | Designación | Un. | Cantidad | P. unitario | Parcial |
|---|---|---|---|---|---|
| I | Provisión | tn | 12.570 | `PuMat` | |
| II | Transporte y descarga | tn | 12.576 | `Pu-NoPav` 2.876,64 | 36.176.624,64 |
| III | Ejecución | m | 13.100 | `Pu-Const` 16.900 | 221.390.000 |
| IV | Movilización de obra | gl | 1 | 5.000.000 | 5.000.000 |
| | | | | **TOTAL** | **262.566.624,64** |

Cierra con el monto escrito en letras.

### Foja01 — liquidación / certificación
Certificación por avance: cantidades de contrato, anterior, presente y acumulado, con
tope en lo contratado. Sirve para pagar por avance de obra.

---

## 2. Qué hay hoy en la app

`CalcRipio.tsx` cubre el paso `Cpto`, y en un aspecto lo supera:

```ts
V = l_m × an × e
W = V × rho
presupuesto = W × precio_unitario   // ← un número tipeado a mano
```

**Ventaja real sobre la planilla:** el largo no se tipea, sale de la línea dibujada sobre
el mapa. En Excel `L = 13.100` es un dato cargado a dedo; acá es la longitud medida del
trazado. Además la app maneja **varios tramos por proyecto**, mientras que la planilla
tiene un único juego de largo/ancho/espesor para toda la obra.

**Lo que falta:** todo lo que va de `Coef` en adelante. El `precio_unitario` que hoy se
tipea es justamente el resultado de los cuatro análisis de precio.

---

## 3. Propuesta

### 3.1 Estructura de datos

Tres piezas nuevas, con criterios distintos según cómo se usa cada dato.

**`equipos`** — tabla propia.
Catálogo compartido entre obras y calculadoras: nombre, modelo, marca, HP, costo U$S.
Se consulta y se elige; no tiene sentido duplicarlo por proyecto.

**Los precios son por proyecto.**
Gasoil, neumático, dólar, los cuatro jornales y el ripio en cantera viven dentro del
proyecto, no en un catálogo global. Cada obra se cotiza en un momento y se aprueba con
esos números: si fueran globales, actualizar el dólar cambiaría retroactivamente todos
los presupuestos ya presentados.

**`precios_base`** — plantillas, no fuente de verdad.
Juegos de precios de referencia para no retipear ocho valores en cada proyecto nuevo. El
proyecto se los copia al crearse y a partir de ahí son suyos; si después cambia la
plantilla, el proyecto no se mueve.

**`proyectos_ripio.analisis`** — JSONB.
Los precios del proyecto y el resto del análisis: coeficientes (con sus defaults
editables), los cuatro APU con sus equipos elegidos, nómina, rendimientos y precios
adoptados, y los datos de la obra (actuación, tramo, objeto, origen, destino, distancias,
movilización).

Va en JSONB y no normalizado porque sigue el patrón que ya usa `obras.datos_calculadora`,
y porque es un documento que se lee entero o no se lee. La contra: no se puede consultar
"todas las obras con motoniveladora" sin recorrer el JSON. Si eso hiciera falta después,
se normaliza.

### 3.2 Interfaz

La pestaña Ripio pasa de dos vistas (`cómputo` / `mapa`) a un flujo de seis pasos, con el
mapa siempre disponible:

| Paso | Contenido | Estado |
|---|---|---|
| **1. Datos** | Obra, tramo, objeto, origen/destino, distancias, precios base del mes | nuevo |
| **2. Cómputo** | Tramos, los tres ítems (provisión / transporte / ejecución), redondeo | **existe**, se completa |
| **3. Coeficientes** | Derivados de los precios base + coeficiente resumen | nuevo |
| **4. Análisis de precios** | Cuatro sub-pestañas: material, transporte no pav., transporte pav., construcción | nuevo |
| **5. Presupuesto** | Tabla de ítems, total, monto en letras | nuevo |
| **6. Mapa** | Trazado de tramos | **existe** |

Todo recalcula en vivo: tocar el dólar en el paso 1 mueve el total del paso 5.

### 3.3 Integraciones con lo que ya existe

- **El cómputo sale del mapa.** La longitud de cada tramo alimenta el ítem III (ejecución,
  m) y, con ancho y espesor, el ítem I (provisión, tn). Ya funciona; hay que conectarlo.

- **La distancia de acarreo puede salir del mapa también.** Hoy en la planilla los 13 km
  se cargan a mano. Teniendo la cantera y el trazado, se puede calcular el recorrido real
  en vez de estimarlo. Esto no existe en Excel y es la mejora más grande del conjunto.

- **"Guardar obra" ya existe.** El presupuesto oficial pasa a alimentar
  `obras.presupuesto_total` y el snapshot completo va a `datos_calculadora`, igual que ya
  hacen Desmalezado y Desbosque.

- **La composición A4 ya existe.** `MapComposicionRipio` imprime el plano; se le suma la
  impresión del presupuesto con el mismo criterio.

---

## 4. Decisiones tomadas

**Densidad: editable, sin default impuesto.**
Ya está resuelto en el código: `CalcRipio.tsx:462` tiene el campo por tramo con paso
0,05 t/m³. La planilla usa 2 y la app móvil 2,1, pero ninguno de los dos se impone —
el proyectista carga el que corresponda al material. Lo único a cuidar es no hardcodear
la densidad en ningún punto nuevo de la cadena.

**Redondeo manual en cascada.**
En cada punto donde la planilla redondea, van **dos valores**: el calculado (solo lectura)
y el adoptado (editable). **El adoptado es el que alimenta el paso siguiente.**

| Paso | Calculado | Adoptado | Alimenta |
|---|---|---|---|
| Cómputo — provisión | 12.576 tn | **12.570 tn** | ítems I y II del presupuesto |
| Cómputo — ejecución | 13.100 m | **13.100 m** | ítem III del presupuesto |
| Análisis de precio | 16.923,48 $/m | **16.900 $/m** | ítem III del presupuesto |

No es una corrección de errores: es una decisión profesional que queda registrada y
justificada. Mostrar los dos lado a lado deja ver cuánto se apartó del cálculo.

El adoptado arranca igual al calculado, y si el proyectista no lo toca la cadena funciona
sola. Si lo toca, queda fijo aunque cambien los insumos aguas arriba — con un aviso visible
cuando el calculado se movió y el adoptado quedó viejo, para que nadie presupueste con un
número congelado sin darse cuenta.

---

## 5. Decisiones pendientes

**Sin marca institucional.** El libro está encabezado por la Dirección de Vialidad
Provincial y la Dirección de Conservación Vial. Por la convención del proyecto eso **no
va** en la interfaz ni en los impresos. La estructura de cálculo se toma; la marca no.

**Un análisis por proyecto o plantillas reutilizables.** Los cuatro APU se repiten casi
igual entre obras del mismo tipo. Conviene poder guardar un análisis como plantilla y
partir de ahí, en vez de rearmarlo cada vez.

**Alcance de Foja01.** La certificación por avance es otro flujo (obra en ejecución, no en
proyecto). Se puede dejar para una segunda etapa.

---

## 6. Orden sugerido

1. Catálogo de equipos + precios base versionados
2. Coeficientes (derivados, editables)
3. Mano de obra (cálculo de costo real por hora)
4. El componente de análisis de precio unitario, genérico — los cuatro comparten estructura
5. Los cuatro análisis concretos
6. Presupuesto oficial + impresión
7. Distancia de acarreo desde el mapa
8. Certificación por avance (Foja01)

Los pasos 1 a 3 no tienen interfaz propia visible y habilitan todo lo demás; conviene
hacerlos primero aunque no se vea nada.
