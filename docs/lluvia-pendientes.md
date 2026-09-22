# Lluvia — lo que queda por probar

Estado al 22/09/2026. El banco de pruebas está armado: cualquier fuente nueva se
mide con la misma vara en una tarde.

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

## 1. GPM IMERG (satélite de verdad)

**Por qué.** Open-Meteo no es satélite: es reanálisis, un modelo físico que
calcula la lluvia en vez de mirarla. IMERG la estima desde microondas e
infrarrojo, a 0,1° cada media hora. Falla de otra manera que un pluviómetro, que
es exactamente lo que se necesita: ve la celda convectiva que revienta entre dos
estaciones y que el IDW no puede inventar.

**Dónde mira más.** El 15 % de los casos donde el modelo no vio nada y llovió de
verdad, y los tres consorcios con red fuera de radio (80, 81 y el 84, que tiene
el 82 % de su red a más de 60 km de toda estación).

**El obstáculo.** IMERG se sirve desde NASA GES DISC y suele pedir cuenta de
Earthdata. Hay que averiguar si existe una vía sin registro, o si conviene que
alguien de la repartición saque la cuenta. El producto útil es el diario
(`GPM_3IMERGDF`), versión final con unos meses de atraso y `late run` con ~14 h.

**Cómo se probaría.** Traer IMERG en las coordenadas de las 71 estaciones para
las 162 fechas, y correr la misma validación: primero IMERG solo, después IDW
sobre pluviómetros con IMERG de respaldo en vez del reanálisis, y después IDW
sobre los residuos de IMERG.

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
- ¿El período `17-07` fue siempre ese? El campo `meta.periodo` es global, así que
  desde afuera no hay manera de saber bajo qué ventana se tomó un parte viejo.
