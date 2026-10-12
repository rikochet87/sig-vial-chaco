# Lluvia — lo que queda por probar

Estado al 22/09/2026; IMERG se midió el 11/10/2026 (punto 1). Cualquier fuente
nueva se mide con la misma vara en una tarde, pero **el banco de pruebas no
está en el repo**: hubo que rehacerlo para IMERG y quedó en la máquina de
trabajo.

## Cómo se mide cualquier candidato

Validación **dejando cada estación afuera**, sobre las 162 fechas con parte y
las 11.502 combinaciones estación-fecha. Se predice en la estación excluida
usando sólo las demás, y se compara contra su medición real.

Resultados actuales, para tener contra qué comparar:

| Método | MAE | RMSE | r |
|---|---|---|---|
| Modelo crudo (Open-Meteo) | 6,82 | 15,17 | 0,47 |
| Modelo corregido + pluviómetros | 4,60 | 12,34 | 0,68 |
| Thiessen | 4,47 | 12,50 | 0,70 |
| **IDW² radio 60 km — en producción** | **3,98** | **10,47** | **0,77** |

Una fuente nueva vale la pena si mejora esos números, y particularmente si
mejora **donde el IDW es débil**: lejos de toda estación, y cuando el núcleo de
la tormenta cae entre pluviómetros.

## 1. GPM IMERG (satélite de verdad) — medido el 11/10/2026

**Resultado: le gana por poco al modelo y no le gana al IDW. No se usa.**

IMERG estima la lluvia desde microondas e infrarrojo de satélite, a 0,1° cada
media hora. A diferencia de Open-Meteo, que la calcula con un modelo físico, la
observa. Se esperaba que viera la celda convectiva que revienta entre dos
estaciones.

**De dónde se sacó.** De Google Earth Engine (`NASA/GPM_L3/IMERG_V07`), sin
cuenta de Earthdata. Se bajó en la coordenada de las 71 estaciones para las 173
fechas con parte (01/09/2025 a 11/10/2026), en bloques de tres horas, para
poder armar después cualquier definición de «día».

Dejando cada estación afuera, sobre 12.141 combinaciones estación-fecha:

| Método | MAE | RMSE | r | Sesgo |
|---|---|---|---|---|
| Modelo de Open-Meteo solo | 6,77 | 14,96 | 0,47 | +17 % |
| **IMERG solo** | **5,82** | **14,46** | **0,54** | **−2 %** |
| IDW con el modelo de respaldo (producción) | 3,87 | 10,26 | 0,77 | −1 % |
| IDW con IMERG de respaldo | 3,87 | 10,24 | 0,77 | −1 % |
| IMERG más IDW de los residuos | 4,03 | 10,48 | 0,76 | +3 % |

- **Como respaldo es algo mejor que el modelo**: 14 % menos de error, mejor
  correlación y casi sin sesgo. Acierta menos días de lluvia (68 % contra
  79 %) y da menos falsas alarmas (47 % contra 54 %).
- **Cambiar el respaldo no mueve la tabla**: sólo 171 de las 12.141
  combinaciones no tienen ninguna otra estación a menos de 60 km.
- **Como base del método sale peor que el IDW.** También cuando el pluviómetro
  más cercano está a más de 30 km: 4,55 contra 4,34. Es el mismo resultado que
  dio anclar en el modelo.
- **En las lluvias fuertes no arregla nada.** Donde llovió 20 mm o más, IMERG
  subestima un 43 % y el modelo un 51 %; el IDW, un 30 %.
- **La ventana del parte da mucho peor que el día calendario**, igual que con
  Open-Meteo. De siete definiciones de «día», la mejor es el día calendario
  local (r 0,54); la de las 18 a las 06, r 0,17 y −58 % de sesgo; el día
  anterior, r −0,01.

**Por qué no se lleva a producción.** Donde importaría es en los 528 km de red
sin pluviómetro a menos de 60 km y en el 20 % del Impenetrable. La mejora ahí es
chica, y traerla obliga a cargar la clave de Earth Engine en Vercel y a sumar
una dependencia al cron diario, que es la parte del sistema que tiene que andar
sola.

**Reservas.**

- **154 de las 173 fechas son de la corrida rápida** («provisional»). En Earth
  Engine la definitiva sólo llegaba a 10/2025; no se pudo medir cuánto mejor es.
  La rápida tenía datos hasta un día antes.
- **La ventana se eligió mirando el resultado.** El día calendario era la
  candidata natural —es la que usa el modelo—, pero es una elección por ajuste.
- **La prueba es en las estaciones**, que están donde hay pluviómetro. En el
  Impenetrable no hay contra qué comprobar.

**El banco de pruebas se rehízo para esto y no está en el repo.** Los scripts
quedaron en la máquina de trabajo, fuera del repositorio. Reproduce lo de
arriba: modelo 6,79 / 15,13 / 0,47 e IDW 3,95 / 10,46 / 0,77 sobre el período
original, contra 6,82 / 15,17 / 0,47 y 3,98 / 10,47 / 0,77.

## 2. Radar

**Por qué.** Es la mejor herramienta que existe para la estructura espacial de
una tormenta. Resuelve celdas de un kilómetro y ve exactamente lo que ni el
pluviómetro ni el reanálisis ven.

**La pista.** El mapa de la APA (`mapas.apachaco.gob.ar`) tiene una capa de
radar en su panel de capas. Hay que ver si hay detrás un endpoint consultable o
si es sólo una imagen superpuesta. La misma exploración que se hizo con
`/public/precipitaciones`: abrir la página, mirar las llamadas de red.

Si sólo hay imágenes, no sirve para calcular. Si hay grilla, es el mejor
candidato de los dos.

## 3. Kriging

Usa el correlograma medido para derivar los pesos óptimos en vez de fijar
`1/d²`, y devuelve una incertidumbre por punto, que sería útil para la pantalla.
En teoría le gana al IDW.

En la práctica hay que ajustar un variograma por evento y la mediana es de **14
estaciones informando por fecha**. Con tan pocos puntos el ajuste es frágil y
puede salir peor que la fórmula fija. Vale medirlo, pero es el último de los
tres.

## Lo medido que conviene no volver a discutir

- **Distancia de decorrelación de la lluvia en el Chaco: 42 km.** La correlación
  entre dos pluviómetros cae de 0,76 a 15 km hasta una meseta de 0,39 pasados
  los 130 km. La meseta es el sistema sinóptico que moja toda la provincia.
- **El radio óptimo de ponderación (60 km) es más largo que el de decorrelación
  y la potencia óptima es 2.** Se barrieron potencias 1, 1,5, 2 y 3 y radios 60,
  120 y 250.
- **Mezclar modelo e interpolación de forma gradual empeora** (MAE 4,94 contra
  3,98). El cambio al modelo tiene que ser tardío y duro.
- **Anclar en IMERG y corregirlo con los pluviómetros también empeora** (4,03
  contra 3,87; ver punto 1).
- **El silencio de una estación es un cero.** La tasa de reporte sube del 11 %
  al 86 % según cuánta lluvia vio el modelo. Falla en el 14 % de los casos de
  lluvia fuerte.
- **El sesgo del modelo no es un factor constante**: subestima la lluvia liviana
  y aplasta los picos. `APA ≈ 2,3 · modelo^0,68`. Corregirlo con un factor único
  habría empeorado justo los eventos que importan.

## Preguntas abiertas para la APA

- ¿Publican parte **sólo** los días que llueve? Si es así, los ~220 días del año
  sin parte fueron secos en toda la provincia y la APA cubre el año entero sola.
- ¿Qué pasa con las 40 localidades del catálogo que nunca informan? ¿Pluviómetro
  fuera de servicio, o nunca lo hubo?
- **La Vicuña** y **Paraje Kolbacks** comparten una coordenada de relleno
  (−25,9614 / −60,1983). ¿Dónde están en realidad?
- El 11/10/2026 `meta.periodo` decía `07-17`, no `17-07`. No se sabe si cambió
  la ventana o cómo se escribe.
- ¿El período `17-07` fue siempre ese? El campo `meta.periodo` es global, así que
  desde afuera no hay manera de saber bajo qué ventana se tomó un parte viejo.
