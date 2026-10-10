# Hidrología — metodología

Documento técnico de la sección Hidrología del panel web, que hasta el
02/10/2026 se llamó «Lluvias»: precipitación, cuencas, cursos de agua y río
Paraná.
Describe **de dónde sale cada número, cómo se procesa y por qué se eligió ese
método** sobre las alternativas.

Actualizado al 08/10/2026. La implementación vive en `admin/src/lib/`; los
scripts de verificación citados están en `admin/scripts/`.

---

## 1. Para qué existe la pantalla, y qué deliberadamente no hace

**Para ver cómo impacta la lluvia sobre la red vial de la provincia y decidir en
base a eso.** El que mira es quien decide; la herramienta muestra el dato y de
dónde salió.

Ese encuadre fija un límite que se respeta en todo el diseño: **no se calculan
índices de estado ni de transitabilidad de caminos.**

Se evaluó un índice de humedad antecedente y se descartó por una razón de fondo,
no por dificultad técnica: **no existe ni una sola observación registrada de cómo
quedó un camino después de una lluvia.** Sin esa variable no hay con qué
calibrar ni contra qué validar, así que cualquier índice sería una hipótesis
presentada con apariencia de resultado. Si la aplicación móvil incorpora
relevamiento de transitabilidad, la discusión se reabre con datos.

Dato que enmarca todo lo demás: **el 98 % de la red de consorcios es de tierra**
— 9.595 de 9.772 tramos en `geo_cc.json`; sólo 16 son pavimento.

### La variable que importa no es el acumulado estacional

Un pronóstico estacional habla de totales trimestrales. **Los caminos no se
cortan por el total del trimestre: se cortan por un evento.** Un trimestre con
acumulado normal puede contener dos tormentas de 120 mm que dejan media red
intransitable.

Por eso la pantalla mide **lámina máxima diaria** y muestra una línea de tiempo
día por día, no un acumulado estacional.

---

## 2. Fuentes de datos

Hay tres, y no significan lo mismo.

| | Qué es | Cobertura | Acceso | Módulo |
|---|---|---|---|---|
| **APA** | pluviómetro, medición real | 71 estaciones que informan, sólo días con parte | JSON público, sin clave | `lib/apa.ts` |
| **Open-Meteo** | modelo, estimación | toda la provincia, cualquier fecha | API pública con cupo | `lib/lluvia.ts` |
| **INA** | pronóstico del río Paraná, y altura donde Prefectura no tiene | 6 estaciones del tramo | JSON público, sin token | `lib/ina.ts` |
| **Prefectura** | altura del río, dos lecturas por día, y niveles de alerta | las mismas escalas salvo El Colorado, más Las Palmas e Isla del Cerrito | JSON y página públicos, sin clave | `lib/prefectura.ts` |

### 2.1 Administración Provincial del Agua (APA)

`mapas.apachaco.gob.ar` publica las mediciones en JSON:

```
GET /public/localidades                → 111 estaciones con coordenadas
GET /public/precipitaciones/fechas     → fechas con parte cargado
GET /public/precipitaciones?fecha=…    → FeatureCollection con los mm
```

**Cuatro características que cambian la interpretación** si se pierden de vista:

1. **Sólo vienen las estaciones que informaron.** Un día con lluvia generalizada
   devuelve 56 de 111; uno menor, una sola. Una estación ausente puede
   significar "no llovió" o "no informó", y desde afuera no se distingue.
   **Nunca se completan ceros**: medir contra un cero inventado produce un 36 %
   de falsas alarmas que no existen.
2. **El período no es el día calendario.** `meta.periodo` viene como `17-07`: de
   las 17:00 a las 07:00. Se probó comparar contra esa misma ventana horaria del
   modelo y **el resultado empeora** (r 0,23 contra 0,30; sesgo −48 % contra
   +28 %), así que la comparación se hace por día calendario. Está medido, no
   supuesto.
3. **`meta.periodo` es global**, idéntico para todas las fechas: no sirve para
   saber bajo qué ventana se tomó un parte antiguo.
4. **No hay endpoint de rango**: una llamada por fecha; `desde`/`hasta`
   devuelve 400.

Dos inconsistencias del origen que se corrigen en el cliente: **La Vicuña** y
**Paraje Kolbacks** comparten una coordenada de relleno, y **Sáenz Peña** (id 2)
y **Presidencia Roque Sáenz Peña** (id 189) son la misma ciudad cargada dos
veces — la APA informa siempre en la segunda, por lo que en `buscarEstacion()`
el alias tiene prioridad sobre el nombre literal.

### 2.2 Open-Meteo

Se consulta contra `archive-api.open-meteo.com`. Para fechas antiguas devuelve
reanálisis ERA5; **para fechas recientes devuelve IFS operacional**, que no es
reanálisis. Por eso en la interfaz se lo llama *"serie modelada"* y se evita el
término "reanálisis", que sería correcto sólo para una parte del rango.

Consecuencia operativa: **el modelo revisa sus propios números.** La ingesta
diaria reescribe una ventana de 7 días hacia atrás en vez de sólo el día
anterior, porque bajar cada fecha una única vez dejaría guardada para siempre la
primera pasada del modelo.

`consultarPuntos()` en `lib/lluvia.ts` es el **único** punto del sistema que
habla con Open-Meteo. Que sea uno solo no es estética: el cupo se factura **por
ubicación consultada**, no por pedido HTTP, así que la deduplicación de
coordenadas y la espera ante un 429 tienen que valer tanto para la ingesta por
consorcio como para la comparación por estación.

### 2.3 Instituto Nacional del Agua (INA)

`alerta.ina.gob.ar/a5`, lectura abierta sin token. Provee altura hidrométrica
observada, pronosticada y un histórico profundo. Se trata en la sección 8.

### 2.4 Prefectura Naval Argentina

`contenidosweb.prefecturanaval.gob.ar/alturas/`. Prefectura lee las escalas del
Paraná y del Paraguay a las 00:00 y a las 12:00 y publica al momento: la última
lectura de cada puerto en un JSON y un año de lecturas por puerto en una página.

**Es la fuente principal de las alturas y de los niveles de alerta y
evacuación.** El INA copia la lectura de las 00:00 unas once horas después y no
carga la de las 12:00; y sobre un año de Barranqueras, 54 de 365 lecturas del
INA difieren de las de Prefectura en más de un centímetro, casi todas de fin de
semana, cuando el INA carga con un día de atraso.

Una lectura del INA se usa sólo donde Prefectura no tiene ninguna. El
pronóstico y el registro histórico siguen saliendo del INA. La pantalla indica
de quién es la última lectura y de qué hora, y avisa si alguna de las dos
fuentes no se pudo leer.

---

## 3. El método de interpolación: IDW

### 3.1 Qué se resuelve

Hay mediciones en un conjunto disperso de puntos —los pluviómetros— y hace falta
estimar la lámina en cualquier otra ubicación, concretamente sobre la traza de
los caminos.

### 3.2 La fórmula

Ponderación por inverso de la distancia (*inverse distance weighting*):

$$P = \frac{\sum_i P_i / d_i^{\,p}}{\sum_i 1 / d_i^{\,p}}$$

con los parámetros adoptados:

| Parámetro | Valor | Constante |
|---|---|---|
| Potencia `p` | **2** | `POTENCIA` en `lib/fusion.ts` |
| Radio de búsqueda | **60 km** | `RADIO_KM` |
| Umbral de coincidencia | 1,5 km | `PEGADO_KM` |

La potencia gobierna cuán rápido decae la influencia. Con `p = 1` el campo sale
excesivamente suavizado; con `p = 4` manda casi exclusivamente la estación más
cercana. **Con `p = 2` el peso decae con el cuadrado de la distancia**, que es el
valor estándar en hidrología y el que mejor midió sobre estos datos.

Ejemplo numérico: un punto con tres pluviómetros a 10, 20 y 40 km que midieron
50, 20 y 0 mm. Los pesos crudos son 1/100, 1/400 y 1/1600 — el más cercano pesa
**16 veces** más que el más lejano. Normalizados dan 76 %, 19 % y 5 %, y el
resultado es **41,9 mm**. El promedio aritmético habría dado 23,3 mm.

### 3.3 Los dos casos especiales

- **A menos de 1,5 km de una estación** se devuelve su medición cruda, marcada
  como `medido`. Resuelve la singularidad de `d → 0` y es además lo correcto
  conceptualmente: si se tiene el dato, no se lo promedia.
- **Sin ninguna estación dentro de los 60 km** no hay nada que interpolar. Sólo
  entonces se recurre al modelo, marcado como `estimado`.

### 3.4 El corte del radio es duro, no gradual

Más allá de 60 km la estación no entra en el cálculo. **Se probó una transición
gradual hacia el modelo en función de la distancia y el resultado empeora**
(MAE 4,94 contra 3,98), porque contamina la estimación en la zona donde es
buena. El corte abrupto es una decisión medida.

### 3.5 Limitación conocida: IDW no extrapola

El resultado siempre queda acotado entre el mínimo y el máximo de las estaciones
del radio. **Si el núcleo de una tormenta cayó entre dos pluviómetros, el pico
real se pierde** — no hay forma de que el método lo reconstruya.

Esto importa especialmente acá, donde la precipitación es convectiva y cae en
núcleos pequeños e intensos, y donde la pregunta operativa suele ser si se superó
un umbral.

---

## 4. Validación de los métodos

### 4.1 Cómo se hizo

Validación cruzada **dejando cada estación afuera** (*leave-one-out*): se retira
una estación, se estima en su ubicación con las restantes y se compara contra lo
que efectivamente midió. Sobre **162 eventos** y **11.502 combinaciones
estación-fecha**.

### 4.2 Resultados

| Método | MAE | RMSE | r |
|---|---|---|---|
| Modelo crudo (Open-Meteo) | 6,82 | 15,17 | 0,47 |
| Modelo corregido con pluviómetros | 4,60 | 12,34 | 0,68 |
| Thiessen (estación más cercana) | 4,47 | 12,50 | 0,70 |
| **IDW² radio 60 km** | **3,98** | **10,47** | **0,77** |

### 4.3 Tres alternativas medidas y descartadas

No conviene rehacerlas: ya se probaron y salieron peor.

- **Anclar en el modelo y corregirlo con los pluviómetros** rinde peor que
  ignorar el modelo por completo: arrastra su patrón espacial, que correlaciona
  0,47.
- **Mezclar modelo e interpolación gradualmente por distancia** rinde peor
  todavía (MAE 4,94).
- **Corregir el sesgo del modelo con un factor único** empeora justamente los
  eventos que importan: el modelo subestima la lluvia liviana y aplasta los
  picos, con una relación aproximada `APA ≈ 2,3 · modelo^0,68`. Un factor
  multiplicativo único no puede corregir una relación no lineal.

### 4.4 Los límites de esta validación

Se declaran porque condicionan cuánto pesa la tabla anterior:

1. **Valida estimación puntual, no lámina areal.** Es el test correcto para lo
   que el sistema hace —estimar en miles de puntos sobre los caminos— pero **no
   demuestra que IDW sea superior para la media areal**, y no hay forma de
   demostrarlo: no existe un "valor areal medido" contra el cual comparar.
2. **Las estaciones no son una muestra representativa del territorio.** Están en
   los pueblos. Validar únicamente ahí evalúa el método justo donde la cobertura
   es mejor, que es lo contrario de donde más importa.
3. **El leave-one-out favorece a los métodos suavizadores.** Al retirar una
   estación, sus vecinas cubren el hueco; un promedio ponderado siempre hará eso
   mejor que "tomar el valor del más cercano".

La diferencia entre IDW y Thiessen es de **0,5 mm de MAE**. Es real y medida,
pero no es abrumadora, y por eso Thiessen se conserva calculado como control
cruzado (sección 6).

### 4.5 Advertencia sobre métricas condicionadas

Cualquier métrica nueva sobre estos datos **debe calcularse sobre las 11.502
combinaciones estación-fecha, no sobre las 3.334 mediciones efectivas.**

El motivo es concreto: comparando sólo donde la APA informó, los resultados se
invierten según la muestra. Con 5 fechas de septiembre el modelo *parecía*
sobreestimar un 28 %; con las 162 fechas *parecía* subestimar un 26 %. Las dos
lecturas son artefactos de mirar únicamente los casos con lluvia reportada.
Contando los ceros deducidos, el modelo sobreestima alrededor del 15 %.

---

## 5. De la estimación puntual a la red vial

### 5.1 Por qué no alcanza un número por consorcio

Un consorcio puede tener 250 km de red. Un número único por consorcio hace que
**una tormenta que moja una punta y no la otra desaparezca en el promedio.** Por
eso cada tramo lleva su propio valor.

### 5.2 Muestreo cada 2 km

La red tiene **249.209 vértices**. Evaluar IDW vértice por vértice contra 71
estaciones serían 17,7 millones de distancias en cada cambio de fecha.

Se muestrea cada **2 km** (`PASO_MUESTRA_KM`): **14.989 puntos y ~40 ms**.

No se pierde información relevante: **la longitud de decorrelación de la
precipitación en esta región es de unos 42 km**, muy superior al paso de
muestreo. Entre dos muestras a 2 km no ocurre nada que el campo de lluvia pueda
resolver.

### 5.3 El promedio del tramo, sólo sobre la parte cubierta

Cada muestra pesa el largo de traza que representa. **El promedio se toma
únicamente sobre las muestras que tienen pluviómetro dentro del radio**, y la
fracción cubierta se informa aparte.

La versión inicial promediaba la parte descubierta como 0 mm: eso diluía el
número hacia abajo e **inventaba sequía donde sólo faltaba una estación**.

### 5.4 `mm: null` no es cero

Un tramo sin ningún pluviómetro en el radio no tiene dato. Se dibuja punteado y
atenuado, **no seco**. Es el mismo criterio que se aplica en las isohietas y en
la media areal.

### 5.5 Resultado sobre la red real

| | Valor |
|---|---|
| Tramos | 9.743 |
| Largo geométrico total | 28.756 km |
| Sin cobertura de pluviómetro | 528,6 km (1,8 %) |
| Consorcios con red fuera de cobertura | **7** |

**Los siete consorcios son un hallazgo del análisis por tramo.** La tabla por
consorcio muestra sólo tres (80, 81 y 84) porque promedia toda la red; tramo por
tramo aparecen cuatro más que el promedio ocultaba:

| Consorcio | Sin cobertura | De | |
|---|---|---|---|
| CC 84 | 217,3 km | 292,1 km | 74 % |
| CC 80 | 115,7 km | 350,4 km | 33 % |
| CC 81 | 97,5 km | 480,9 km | 20 % |
| CC 69 | 51,0 km | 421,5 km | 12 % |
| CC 53 | 36,4 km | 552,4 km | 7 % |
| CC 55 | 8,9 km | 275,3 km | 3 % |
| CC 87 | 1,8 km | 225,4 km | 1 % |

Que los dos números no coincidan no es una contradicción: son dos preguntas
distintas y la del análisis por tramo es la más fina.

### 5.6 Advertencia sobre kilómetros

**Hay dos totales y miden cosas distintas:**

- **28.756 km** — largo geométrico de las trazas del GeoJSON (29.128 contando
  los 372,3 km de 26 tramos sin número de consorcio, que quedan afuera).
- **28.347,3 km** — suma de `red_km` declarado en la ficha de cada consorcio.

No es un error de ninguno de los dos: uno mide la traza dibujada y el otro lo que
declara el consorcio. **Al citar kilómetros hay que decir cuál de los dos es.**

---

## 6. Precipitación media areal

Lo que se calcula por consorcio es **precipitación media areal**. Los tres
métodos clásicos son media aritmética, polígonos de Thiessen e isohietas. El
sistema implementa los tres caminos relevantes y agrega IDW.

### 6.1 Thiessen — el método de manual

`lib/thiessenAreal.ts` implementa la fórmula clásica:

$$\bar{P} = \frac{\sum_i w_i P_i}{\sum_i w_i}$$

Se conserva por dos motivos:

- **Es el método citable.** «Precipitación media areal por polígonos de
  Thiessen», con la tabla de pesos, se defiende ante cualquier revisor. IDW
  requiere explicación.
- **Es control cruzado.** Si ambos coinciden, el número está firme. Si difieren
  mucho en un consorcio, eso mismo es información: cobertura pobre, o traza
  repartida entre zonas con láminas muy distintas.

**El número principal de la pantalla sigue siendo el de IDW.**

### 6.2 Dos ponderaciones, y la diferencia no es cosmética

En hidrología clásica `wᵢ` es el **área**, porque el objeto que recibe la lluvia
es la cuenca. Acá el objeto de interés es la red vial:

| Función | Peso | Dónde aplica |
|---|---|---|
| `arealPorSuperficie` | km² de zona dentro de la región | provincia, zona ZI–ZV, departamento |
| `arealPorLongitud` | km de camino dentro de la zona | cualquier recorte, incluido consorcio |

**Los 103 consorcios no tienen polígono de límites.** En `geo_cc.json` son 9.772
MultiLineString; lo único poligonal del proyecto es el límite provincial, los 25
departamentos y las 5 zonas. Por eso a nivel consorcio la ponderación es por
longitud.

Ponderar un consorcio por superficie tampoco sería lo deseable: asignaría peso a
territorio sin caminos.

### 6.3 Construcción de los polígonos

Por **recorte sucesivo de semiplanos** (Sutherland–Hodgman), exacto y vectorial:

1. Se parte del contorno provincial (`data/contornoChaco.ts`, 286 vértices,
   generado desde el bundle con `scripts/build_contorno.py`).
2. Contra cada otra estación se traza el bisector perpendicular y se conserva el
   semiplano propio. Lo que sobrevive es, por definición, el conjunto de puntos
   más cercanos a esa estación que a cualquier otra.
3. Un último recorte contra un polígono de 64 lados en el radio de 60 km.

Todo sobre un plano equirrectangular local en km. Sobre 500 km de ancho el error
es despreciable para el dibujo, y a cambio **los bisectores son rectas**.

Se reemplazó una implementación anterior por fuerza bruta sobre grilla de 2 km
dibujada como imagen: al ampliar, el navegador escalaba el ráster y una línea de
un píxel quedaba como una banda gris difusa. Con vectores el borde queda nítido a
cualquier escala y además se calcula más rápido — 70 recortes contra 70
bisectores en vez de ochocientas mil distancias.

**Dos recortes que no son decorativos:** el contorno provincial, sin el cual las
zonas del borde se extienden hacia Santiago del Estero y Formosa; y el radio de
60 km, porque más allá no hay estación asignable y **ese hueco es el dato** — es
exactamente donde la fusión cae al modelo.

### 6.4 Detalles verificados que parecen errores y no lo son

- **70 zonas para 71 estaciones activas.** La Vicuña y Paraje Kolbacks comparten
  coordenada en el origen, así que una gana el desempate y la otra queda con
  celda de área cero. El test lo afirma explícitamente.
- **El recorte del radio es por rectas tangentes**, de modo que el polígono queda
  *circunscripto* al círculo, no inscripto: excede los 60 km un 0,05 % en las
  esquinas y el área un 0,08 %. Medido y asumido.
- **`areaKm2()` exige latitud de referencia.** El factor que convierte grados de
  longitud a km depende de la latitud, así que dos anillos medidos cada uno con
  *su propia* latitud media quedan en planos distintos y **sus áreas no son
  comparables**. Todas las zonas de una región se miden con la misma referencia,
  y debe ser la que usó el recorte, o el área no correspondería al polígono
  dibujado.

### 6.5 La media se toma sólo sobre la parte cubierta

Igual que en los tramos. Repartir el hueco entre las estaciones existentes sería
inventar un dato; promediarlo como 0 mm sería inventar sequía.

### 6.6 Precipitación media areal por cuenca hídrica

La provincia se divide en 13 cuencas, que cubren 99.580 km². A diferencia de los
consorcios, una cuenca **sí es un polígono**, y es el objeto para el que se
definió la precipitación media areal: toda su superficie recibe la lluvia y toda
cuenta por igual.

Para cada cuenca se informan, sobre el período elegido:

| Dato | Cómo se obtiene |
|---|---|
| **Lámina areal** (mm) | promedio del IDW de la sección 3 —potencia 2, radio 60 km— evaluado en una grilla de 2,5 km adentro de la cuenca |
| **Thiessen** (mm) | la fórmula de 6.1 con peso por superficie: cada pluviómetro pesa los km² de su polígono dentro de la cuenca |
| **Lámina máxima** (mm) | el punto de la grilla que más recibió |
| **Cobertura** (%) | parte de la cuenca con un pluviómetro a menos de 60 km |
| **Volumen precipitado** (hm³) | lámina areal × superficie cubierta; 1 mm sobre 1 km² = 1.000 m³ |

El número que se muestra como principal es el de IDW, por el mismo motivo que en
el resto de la pantalla (sección 4.2). El de Thiessen acompaña como método de
manual y lleva su tabla de pesos.

**Los dos caminos se controlan entre sí.** Uno muestrea puntos y el otro recorta
polígonos, sin geometría en común. Con las 71 estaciones activas coinciden en la
cobertura de las trece cuencas a menos de 0,13 puntos porcentuales.

Tres límites que hay que tener presentes al citar estos números:

- **Sólo usa pluviómetros.** No hay respaldo del modelo: sin mediciones de la
  APA en el período no hay lámina por cuenca.
- **Donde la cobertura es menor al 100 %, la lámina y el volumen describen sólo
  la parte cubierta.** Con todas las estaciones activas es el caso de una sola
  cuenca, el Impenetrable, con el 80 %.
- **El volumen es agua caída, no escurrida.** No descuenta infiltración ni
  evaporación y no dice cuánta llega a un cauce.

**Lámina máxima en varios días.** Además del acumulado del período, para cada
cuenca se informa la mayor lámina areal acumulada en 1, 3, 5 y 7 días corridos
dentro de los últimos 90 días, con las fechas en que ocurrió. Se informan varias
duraciones porque en una llanura con pendientes menores al 0,1 % el agua se
almacena en vez de escurrir: lo que produce anegamiento es el acumulado de
varios días, no la intensidad de uno.

La lámina de cada día se obtiene con el mismo IDW. Como el método es lineal en
las mediciones, el peso de cada pluviómetro sobre cada cuenca se calcula una
sola vez y se aplica a todos los días; el resultado coincide con evaluar el IDW
punto por punto a menos de 0,01 mm, y la suma de los días coincide con la lámina
del período.

Una salvedad al citar estos números: **los días en que la APA no publicó parte
se toman como cero**. La APA publica sólo los días con lluvia, de modo que la
suposición se cumple casi siempre, pero si en un día con lluvia no hubo parte la
máxima informada queda por debajo de la real. No se aplica ningún coeficiente de
decaimiento: son sumas de lluvia medida, no un índice de humedad del suelo.

**Red vial y obras de arte por cuenca.** La misma tabla informa, para cada
cuenca, los kilómetros de red de consorcios que contiene, qué parte es de
tierra, y cuántos kilómetros recibieron 10, 25, 50 y 100 mm o más en el período.

- Los kilómetros son de **traza** medida sobre la cartografía (28.756 km en
  total), no los declarados por cada consorcio (ver 5.6).
- La red se reparte por puntos de muestreo cada 2 km, de modo que un tramo que
  cruza dos cuencas aporta a cada una su parte.
- Los caminos que corren sobre el límite provincial quedan unos cientos de
  metros por fuera del contorno de las cuencas; se asignan a la cuenca más
  cercana cuando están a menos de 1 km. Son 483 km.
- La lámina de cada tramo es la de la sección 5, por lo que la suma por cuencas
  coincide con el total de la red.

Se informan también las **obras de arte relevadas** —puentes, alcantarillas y
tubos— que caen en cada cuenca, con la lámina estimada en el punto de cada una.
Dos salvedades: son las obras relevadas en campo, **no un inventario**; y la
lámina es la lluvia caída sobre la obra, **no el caudal que le llega**, que
depende de una cuenca de aporte que no se puede delimitar sin un modelo de
elevación adecuado.

**Sobre la geometría de las cuencas.** Provienen de un shapefile en Gauss-Krüger
faja 5 que no trae archivo de proyección. La proyección se deduce de las
coordenadas; el datum se supuso POSGAR tras comparar contra el límite
provincial, con evidencia débil. La alternativa —Campo Inchauspe— desplazaría
los bordes unos 200 m, lo que no altera las láminas: los pluviómetros están a
decenas de kilómetros. El área de cada polígono reproyectado coincide con la que
declara el origen a menos del 0,6 %. Un indicio posterior va en contra de la
suposición: en otra carpeta de shapefiles de la provincia —la de canales, ver
6.7— las capas sin archivo de proyección resultaron estar en Campo Inchauspe. No
se sabe si comparten origen con las cuencas y no se modificó nada.

### 6.6 bis Pronóstico de lluvia por cuenca

Además de lo medido, la pantalla muestra lo pronosticado para los próximos 14
días por cuenca.

**Fuente.** El pronóstico por conjuntos del Centro Europeo (ECMWF IFS, 0,25°):
51 corridas del mismo modelo con condiciones iniciales apenas distintas,
servidas por Open-Meteo. La dispersión entre corridas es la incertidumbre del
pronóstico, y por eso **se informa la mediana junto con el rango en que cae el
80 % de las corridas** (percentiles 10 y 90), nunca un valor solo.

**Cálculo.** Se consulta el modelo en los 137 nodos de una grilla de 0,25°
dentro de la provincia, que es su resolución nativa. Para cada cuenca y cada
corrida se promedian los nodos que caen adentro; recién sobre esas 51 láminas
se calculan la mediana y el rango. Las láminas de 3 y 7 días se suman por
corrida antes de calcular el rango. Hacerlo al revés —promediar o sumar
percentiles— exageraría la incertidumbre, porque supone que todos los puntos y
todos los días tienen su peor caso en la misma corrida.

**Balance climático.** Lluvia pronosticada (mediana) menos evapotranspiración
de referencia FAO-56 (ET₀) de los próximos 7 días. Indica si el período viene
con exceso o con déficit de agua. **No estima cuánta agua queda en el terreno**:
eso depende del suelo, de su humedad previa y del relieve, que el sistema
todavía no incorpora.

**Límites.**

- Es un modelo, no una medición, y **todavía no se comparó contra los
  pluviómetros de la APA**: no hay una cifra de cuánto erra en la provincia.
- La celda del modelo mide unos 25 km: no distingue un consorcio de otro, y en
  las cuencas más chicas (Quiá, valle del Paraná) el pronóstico es el de un
  solo punto.
- El día en curso no se incluye: el pronóstico diario cubre desde la
  medianoche, horas que ya transcurrieron.

**Registro para la verificación.** Desde el 02/10/2026 se guarda cada día el
pronóstico emitido, en los 137 nodos y con las 51 corridas. Cuando haya
suficientes semanas se va a comparar contra las láminas medidas por los
pluviómetros, sobre todos los días del período y no sólo sobre los días con
lluvia, con el mismo cuidado descripto en 4.5.

### 6.6 ter Lluvia histórica por cuenca (CHIRPS)

Los partes de la APA empiezan en septiembre de 2025. Con un año de mediciones
no se puede decir qué es normal para una época ni cada cuánto se repite un
evento. Para eso la pantalla tiene una vista aparte, «Histórico», con otra
fuente.

**Fuente.** CHIRPS, del Climate Hazards Center de la Universidad de California
en Santa Bárbara: una estimación diaria de lluvia hecha con imágenes
infrarrojas de satélite y corregida con pluviómetros, a 0,05° (unos 5 km),
desde 1981. Se obtiene de ClimateSERV (NASA SERVIR) como promedio diario
dentro del contorno de cada cuenca. La serie cubre del 01/01/1981 al
31/08/2026 sin días faltantes, y se publica con algo más de un mes de atraso.

**Es una estimación, no una medición, y no se mezcla con los pluviómetros.**
Ningún número de las otras vistas sale de CHIRPS, y los de esta vista no se
comparan con aquéllos.

**Qué se informa, por cuenca.**

- La media de los años calendario enteros, y el total de cada año.
- Los últimos doce meses de la serie contra los mismos doce meses de cada año:
  el porcentaje sobre la mediana y el puesto que ocupan, del más lluvioso al
  más seco.
- Para cada mes, la mediana de la lámina mensual y el rango entre los
  percentiles 10 y 90, junto al último mes disponible.
- La mayor lámina acumulada en 3, 7 y 30 días corridos, con sus fechas.
- La lámina que la mayor ventana de una temporada alcanza una de cada dos,
  cinco y diez temporadas: la mediana y los percentiles 80 y 90 de las máximas
  de cada temporada.

**La temporada va de julio a junio.** Julio y agosto son los meses más secos en
las trece cuencas; con el año calendario la temporada de lluvias queda partida
y un evento de fin de diciembre aportaría el máximo de dos años.

**Las frecuencias son cuentas, no un ajuste.** Con 45 temporadas no se
extrapola: la vista no informa nada más raro que una de cada diez.

**Límites.**

- **No se usa para un día suelto.** El día de CHIRPS no coincide con el período
  del parte de la APA: sobre la cuenca Negro - Salado, día por día correlaciona
  0,64 con la lámina de los pluviómetros, y 0,85 en ventanas de tres y de siete
  días. Por eso la ventana más corta es de tres días.
- **Vale para el promedio de una cuenca**, no para un punto.
- No se validó contra pluviómetros más allá de esa comparación: los controles
  son de coherencia con el clima conocido de la provincia —más lluvia al este
  que al oeste, verano lluvioso e invierno seco, 2020 a 2022 por debajo de la
  media—.

### 6.7 Cursos de agua, canales y cruces con la red vial

`lib/hidrografia.ts`. Agrega a las cuencas por dónde corre el agua, y con eso
dónde la cruza la red de consorcios.

**Fuentes.** Dos, complementarias:

| | Fuente | Cobertura | Contenido |
|---|---|---|---|
| Cursos de agua | Instituto Geográfico Nacional, hidrografía a escala 1:250.000 | toda la provincia | 1.137 tramos, 12.383 km: ríos, arroyos, riachos, cañadas y zanjones, con nombre y régimen (permanente o no) |
| Canales | shapefiles del sistema de canales de la Línea Paraná | sudoeste | 110 canales, 1.752 km, con sistema (Módulo I a III, Río Muerto, Bajos de Chorotis, troncal) y clasificación (principal, secundario, interparcelario) |

De los cursos, 5.834 km son permanentes y 6.549 no permanentes. La carta casi no
registra cursos en el sudoeste, donde el drenaje es por canales.

**Tratamiento.** La traza se simplifica por Douglas-Peucker con tolerancia de
10 m (pierde el 0,2 % del largo). Los nombres se pasan a minúsculas y se
restituyen las tildes de los topónimos conocidos. Los canales se reproyectan de
Gauss-Krüger faja 5; las capas que vienen en Campo Inchauspe se llevan a POSGAR
con el corrimiento medido entre dos versiones de la misma capa (−59,9 m al este,
−214,0 m al norte, constante a 20 cm en 3.652 vértices). De las siete capas de
canales recibidas se usan las dos que no se superponen entre sí y un canal de
una tercera; las restantes son versiones de las mismas trazas.

**Por cuenca.** Kilómetros de cursos permanentes, no permanentes y canales, y
densidad de drenaje (km de cursos y canales por km² de cuenca). La traza se
reparte por tramos de hasta 1 km, cada uno asignado a la cuenca que contiene su
punto medio. Quedan fuera de las cuencas los ríos limítrofes (976 km) y el tramo
del canal troncal que sale de la provincia (231 km).

**Cruces.** Un cruce es la intersección de la traza de un camino de consorcio
con la de un curso o un canal. Dos reglas:

- No se cuenta si el ángulo entre ambos es menor de 30°: un camino que corre al
  costado de un canal no lo cruza, aunque las dos líneas, dibujadas por
  separado, se superpongan.
- Varias intersecciones del mismo camino con el mismo curso a menos de 300 m
  cuentan como una.

Resultan **1.208 cruces**: 195 sobre cursos permanentes, 610 sobre no
permanentes y 403 sobre canales. Para cada uno se indica si hay una obra de arte
relevada a menos de 500 m; al 02/10/2026 son 9, sobre 46 obras relevadas.

**Límites.**

- **No es un inventario de obras de arte.** Un cruce indica dónde un camino pasa
  sobre un curso que figura en la carta, no qué hay construido.
- A escala 1:250.000 faltan los cursos menores: la ausencia de cruces en un
  tramo no implica ausencia de alcantarillas.
- La posición vale al centenar de metros.
- Los canales son sólo los del sistema de la Línea Paraná. No están los del área
  metropolitana, las defensas, ni los esteros y lagunas.
- La densidad de drenaje depende de la escala de la carta: sirve para comparar
  cuencas entre sí, no contra valores de otra fuente.

Verificación: `scripts/verificar-hidrografia.ts` compara el archivo contra su
origen, la grilla de búsqueda contra fuerza bruta, y afirma que cada cruce está
sobre su camino y sobre su curso a menos de 2 m.

---

## 7. Isohietas

`lib/isohietas.ts` evalúa **el mismo IDW** sobre una grilla de 5 km y extrae los
contornos con *marching squares*, íntegramente en el navegador.

Usa el mismo motor a propósito. **Si las curvas se trazaran con otro método, el
mapa y la tabla se contradirían**, y de los dos el que termina en un expediente
es el número de la tabla.

El mapa tiene **tres estados que deben poder distinguirse**: color = llovió; gris
tenue = midió cero; **sin pintar = no hay pluviómetro a menos de 60 km**. Los
nodos fuera de radio quedan en `NaN` y ninguna curva los cruza. Pintar la zona
sin cobertura igual que la zona seca fue un error detectado observando el
render, no el código.

Los **"ojos de buey"** —curvas cerradas pequeñas alrededor de cada pluviómetro—
son el artefacto característico de IDW, no un patrón meteorológico. Aparecen
porque IDW es un **interpolador exacto**: devuelve el valor medido en la
ubicación de cada estación, de modo que cada una queda como extremo local. Un
método suavizador no los tendría, pero tampoco respetaría el valor medido.

---

## 8. El río Paraná

### 8.1 Por qué es una amenaza distinta y no la misma

| | Lluvia local | Crecida del Paraná |
|---|---|---|
| Causa | convección local, horas | lluvia en cuencas altas: Paranaíba, Grande, Iguazú, Paraguay vía el Pantanal |
| Dónde | acá | a miles de km |
| Retardo | ninguno | días a semanas |
| Pronosticable | mal y a corto plazo | **bien, a ~11 días** |

**La lluvia que cae en Chaco no mueve la altura en Barranqueras.** Por eso el
módulo no se combina con `lib/fusion.ts`: se traen ambas series, comparten el eje
de tiempo y la coincidencia la interpreta quien mira.

Que sean independientes en causa es precisamente lo que las vuelve peligrosas en
conjunto: **con el río en cota alta, el escurrimiento de una tormenta local no
tiene descarga**, porque el río impone condición de borde al drenaje. No se
suman, se condicionan. Modelar eso requiere cotas y un modelo hidráulico, que hoy
no existen en el sistema; hasta entonces se muestran las dos series y no se
afirma nada sobre su combinación.

### 8.2 Inversión de la intuición

**El río se pronostica mejor que la lluvia.** El INA emite a 11 días porque el
agua ya está en tránsito y se la ve venir; la tormenta de mañana por la tarde,
no. Para anticipación, la serie del río es el dato más fuerte disponible.

### 8.3 La API y sus características

```
GET /a5/obs/puntual/estaciones?format=json              → 4.683 estaciones
GET /a5/obs/puntual/series?estacion_id=N&format=json    → series de una estación
GET /a5/obs/puntual/series/{id}/observaciones
      ?timestart=…&timeend=…&format=json                → [{timestart, valor}]
GET /a5/sim/calibrados/{cal_id}/corridas/last
      ?series_id=N&includeProno=true&format=json        → el pronóstico
```

- **Los umbrales los publica el organismo.** Cada estación trae `nivel_alerta` y
  `nivel_evacuacion`, y son **por estación**: Goya evacúa a 5,7 m y Corrientes a
  7. No se define ningún umbral propio; `estadoDe()` exige la estación y no
  acepta una altura suelta.
- **El pronóstico es una banda.** Cada punto trae
  `qualifier: inferior | medio | superior`. Se dibuja como banda: mostrar sólo el
  valor medio presentaría como certeza algo que la fuente entrega como rango.
- **Se usa la serie de medición directa, no la simulada.** El valor mostrado debe
  ser el que alguien leyó en la escala — mismo criterio que pluviómetros frente a
  modelo.
- **Corrientes tiene altura medida desde 1901** (47.954 registros) y caudal desde
  1910. Aquí el histórico profundo **ya existe**, a diferencia de la lluvia.

### 8.4 El cero de cada escala

Una altura hidrométrica es una distancia sobre el cero de la escala. Para
compararla contra una cota de terreno hay que saber a qué cota está ese cero, **y
en qué sistema vertical**. En este tramo conviven dos: el del Ministerio de Obras
Públicas (MOP), en el que están los planos de defensas y la línea de ribera de la
provincia, y el del IGN (antes IGM), en el que están los modelos de elevación.
La cota MOP está unos 0,55 m por encima de la IGN.

| Estación | Cero MOP | Cero IGN |
|---|---|---|
| Itá Ibaté | 52,42 | 51,89 |
| Corrientes | 42,39 | 41,84 |
| Barranqueras | 41,80 | 41,25 |
| Empedrado | 39,68 | 39,13 |
| Bella Vista | 34,74 | 34,18 |
| Goya | 29,67 | 29,12 |

**El campo `cero_ign` del Alerta Hidrológico trae, en este tramo, la cota MOP.**
Sus valores coinciden al centímetro con la columna MOP de la tabla de estaciones
hidrométricas de un estudio del Consejo Federal de Inversiones de 1999
(*Prefactibilidad de la interconexión vial Goya–Reconquista…*, tabla 3.1), que
trae al lado la cota IGM. Aguas abajo de La Paz el mismo campo sí tiene los
valores que el IGN midió en 2016.

De dónde sale cada valor:

- **Cero IGN de Corrientes, Barranqueras, Empedrado, Bella Vista y Goya**: la
  tabla del CFI. Son cotas IGM de 1999, **no una vinculación al marco actual
  (SRVN16)**: el IGN no midió Corrientes ni Barranqueras en sus campañas de 2016
  y 2017. Valen al decímetro. Una nota periodística de 2021 cita 41,42 m para
  Corrientes; no se pudo conciliar con las otras fuentes.
- **Empedrado tiene control independiente.** El IGN vinculó en 2017 dos tramos
  de esa escala (45,11 y 46,14 m); descontando los metros a los que arranca cada
  tramo, el cero da 39,11 y 39,14 m.
- **Itá Ibaté** no figura en la tabla del CFI. El valor es el de la escala del
  muelle que el IGN vinculó en 2017, y coincide a 3 cm con el MOP menos 0,556.
- **Barranqueras no tiene `cero_ign` en el Alerta Hidrológico.** Su cero MOP sale
  de dos fuentes independientes: la tabla del CFI, y la Resolución 1111/98 de la
  Administración Provincial del Agua, que da el pico del 04/05/1998 como
  «8,17 m en el hidrómetro de Puerto Barranqueras, equivalente a cota MOP
  49,97 m» (49,97 − 8,17 = 41,80).

Para cruzar altura de río contra un modelo de elevación se usa el cero IGN. Una
vinculación moderna de las escalas de Barranqueras y Corrientes sigue siendo un
pedido al IGN o a Prefectura, no un desarrollo.

### 8.5 Recurrencia y permanencia en Barranqueras

`lib/rioHistorico.ts`. Contesta qué tan frecuente es una altura dada, sobre el
único registro largo del sistema. Las alturas y los umbrales son los de la
escala de Barranqueras, que es la del área metropolitana del Gran Resistencia.

**Serie.** Altura hidrométrica diaria de Barranqueras, del 02/03/1906 al
05/10/2026: 44.048 días, 43.352 con dato (falta el 1,6 %). El Alerta
Hidrológico la publica en dos series de la misma escala, y el registro las
junta:

| | Serie | Período | Días |
|---|---|---|---|
| Lecturas de la escala | 20 | 02/03/1906 a 31/12/1969 | 22.856 |
| Altura media diaria | 26262 | desde 01/01/1970 | 20.451 |
| Lecturas, donde falta la media diaria | 20 | después de 1970 | 45 |

La regla es una sola: la media diaria donde existe y, si no, el promedio de las
lecturas de ese día. Se justifica por dos hechos medidos. Hasta 2012 la escala
tiene **exactamente una lectura por día**, de modo que antes de 1970 la lectura
es el dato diario. Y en los 20.451 días en que existen las dos series, el
promedio de las lecturas y la media diaria difieren 0,02 cm en promedio (sesgo
0,00 cm; un solo día a más de 10 cm): la media diaria publicada es el promedio
de esas lecturas. No hay escalón en el cambio de serie: 2,08 m el 31/12/1969 y
2,00 m el 01/01/1970.

La serie está congelada en `public/rio/barranqueras_diario.json` y se regenera
con `scripts/build_rio_barranqueras.mjs`, que vuelve a medir la coincidencia
entre las dos series y no escribe si dejó de cumplirse; el año en curso no
entra hasta regenerarla. Los días sin dato no se rellenan ni se interpolan.

Hasta el 06/10/2026 este apartado se calculaba con la escala de Corrientes
(serie 26261, desde 1901). Se cambió porque los umbrales que deciden de este
lado del río son los de Barranqueras, y las frecuencias no coinciden: el alerta
de Corrientes se superó 1 año de cada 3,4 y el de Barranqueras 1 de cada 2,3.

**Año hidrológico.** De septiembre a agosto, nombrado por el año en que termina.
Con el año calendario, la crecida de 1982/83 aportaría dos máximos (7,56 m en
diciembre de 1982 y 8,59 m en junio de 1983) siendo un solo evento. Un año
entra en el ajuste con 330 días con dato o más: quedan 117 años, de 1906/07 a
2025/26. Quedan afuera 1905/06, 1911/12, 1989/90 y 1990/91. **1989/90 fue una
crecida grande** —7,66 m en los 327 días que hay— y no entra en el ajuste.

**Lo contado.** No supone ninguna distribución:

| Umbral de Barranqueras | Años en que se superó | Del tiempo |
|---|---|---|
| Alerta, 6,00 m | 51 de 117 (1 cada 2,3) | 4,61 % de los días |
| Evacuación, 6,50 m | 30 de 117 (1 cada 3,9) | 2,17 % de los días |

Los mayores máximos: 8,59 m (22/06/1983), 8,25 m (08/06/1992), 8,17 m
(04/05/1998), 7,68 m (02/03/1966). El mínimo, −0,15 m (06/10/1944). En 1983
hubo dos crestas casi iguales: 8,59 m en junio y 8,58 m el 18 de julio.

**Lo ajustado.** Distribución de Gumbel sobre los 117 máximos anuales, por el
método de los momentos (media 5,80 m, desvío 1,01 m):

| Recurrencia | Altura | ± 95 % |
|---|---|---|
| 2 años | 5,64 m | 0,17 |
| 5 años | 6,53 m | 0,28 |
| 10 años | 7,11 m | 0,38 |
| 25 años | 7,86 m | 0,51 |
| 50 años | 8,41 m | 0,61 |
| 100 años | 8,96 m | 0,72 |

El intervalo sale del error estándar del ajuste por momentos, con el factor de
frecuencia de Chow. Kolmogorov-Smirnov: D = 0,090 contra un crítico de 0,126
(5 %); el crítico es indicativo, porque los parámetros salen de la misma
muestra. Por momentos L la altura de 100 años da 9,10 m, dentro del intervalo.
El ajuste da el alerta 1 cada 2,8 años y la evacuación 1 cada 4,9, contra 2,3
y 3,9 contados. **Donde lo contado y lo ajustado difieren, lo contado es lo que
pasó.**

**Curva de permanencia.** Fracción de los días medidos en que la altura igualó o
superó cada valor. La mediana es 3,30 m; el 10 % de los días el río estuvo en
5,32 m o más y el 90 % en 1,40 m o más.

**El régimen cambió hacia 1971, y hay dos respuestas.** Medido sobre la serie:

| | Hasta 1969/70 | Desde 1970/71 |
|---|---|---|
| Mínimo anual medio | 0,79 m | 1,96 m |
| Máximo anual medio | 5,61 m | 6,03 m |

El cambio en los mínimos es inequívoco. En los máximos es menos claro: 6,35 m
entre 1971 y 2000, y 5,69 m desde 2001, casi igual que antes de 1970. El corte
coincide con el cambio de serie, pero no sale de él: el mismo salto en los
mínimos se mide en la escala de Corrientes, que es una sola serie. La pantalla
permite calcular con la serie completa o sólo desde 1970/71 (54 años), y dice
cuál se está mirando. Con el período reciente: alerta en 28 de 54 años (1 cada
1,9), evacuación en 18 de 54 (1 cada 3,0), altura de 100 años 9,50 ± 1,16 m,
mediana 3,62 m. **Al citar una recurrencia hay que decir con qué período se
calculó.**

**Límites.** Las alturas son de la escala de Barranqueras y no se trasladan a
otra escala del tramo. Gumbel supone años independientes y un régimen estable,
y lo segundo no se cumple del todo. Más allá de 50 años el ajuste extrapola. La
serie no se depuró: tiene saltos de un día que son errores de carga
(14/09/1990, tres metros). Uno alcanza a un máximo anual —el 09/02/1981 la
serie da 6,16, 6,36 y 6,16 m en tres días seguidos, y 6,36 es el máximo de
1980/81—; con o sin él ese año pasó el alerta y no llegó a evacuación.

Verificación: `scripts/verificar-rio-historico.ts` corre sobre la serie real y
la afirma contra dos fuentes que no dependen de este sistema: la Resolución
1111/98 de la Administración Provincial del Agua, que da 8,17 m en el
hidrómetro de Puerto Barranqueras el 04/05/1998, y la media diaria de
Corrientes, cuyos máximos anuales correlacionan 0,995 con los de Barranqueras
en los 54 años en común.

### 8.6 Tiempo de traslado de la crecida hasta Barranqueras

`lib/rioTraslado.ts`. Cuántos días antes o después que en **Barranqueras** se
mueve el río en las otras nueve escalas del Paraná, de Posadas a Goya.

**La referencia es Barranqueras.** Hasta el 08/10/2026 se medía contra
Corrientes, que tiene la media diaria más larga. Se cambió porque la escala que
decide en el Gran Resistencia es la de Barranqueras —la de sus umbrales y la del
registro histórico de 8.5—, y la pregunta es cuántos días antes que acá.
Corrientes, enfrente, queda como control.

**Serie.** Altura media diaria de las diez escalas, del 01/01/1970 al
07/10/2026 (`public/rio/tramo_diario.json`). Se usa el período común:
Barranqueras y Bella Vista no tienen media diaria anterior. Empedrado no tiene
datos entre 1970 y 1989.

**Dos métodos independientes.**

1. *Pico anual.* Para cada año hidrológico completo en las dos escalas, la
   diferencia entre las fechas del máximo. Se informa la mediana y los cuartiles.
   Se excluyen los años en que los picos difieren más de 15 días, porque
   corresponden a crecidas distintas.
2. *Variaciones diarias.* Correlación de Pearson entre el cambio diario de
   altura en Barranqueras y el de la otra escala desplazado de −12 a +10 días.
   El desfase es el de máxima correlación, afinado con el vértice de la parábola
   por los tres puntos de la cima. Se correlacionan cambios y no alturas porque
   las alturas, por su persistencia, correlacionan por encima de 0,9 con
   cualquier desfase y no definen un máximo.

| Escala | Pico anual | Cuartiles | Años | Variaciones diarias | r |
|---|---|---|---|---|---|
| Posadas | 6 días antes | −7 a −5 | 31 de 54 | −4,0 d | 0,24 |
| Ituzaingó | 4 días antes | −5 a −3 | 37 de 53 | −2,3 d | 0,43 |
| Itá Ibaté | 3 días antes | −4 a −2 | 40 de 50 | −1,9 d | 0,60 |
| Itatí | 2 días antes | −2 a −1 | 41 de 50 | −0,8 d | 0,73 |
| Paso de la Patria | 1 día antes | −1 a 0 | 46 de 53 | −0,4 d | 0,67 |
| Corrientes | el mismo día | 0 a +1 | 49 de 54 | 0,0 d | 0,82 |
| Empedrado | 1 día después | 0 a +1 | 28 de 31 | +0,5 d | 0,66 |
| Bella Vista | 2 días después | +1 a +3 | 46 de 52 | +1,3 d | 0,63 |
| Goya | 3 días después | +2 a +6 | 47 de 54 | +1,9 d | 0,60 |

**Lectura.** El máximo de una crecida pasa por Posadas unos seis días antes que
por Barranqueras, por Itá Ibaté unos tres, y llega a Goya unos tres días
después. El pico tarda más que una variación común porque la cresta es chata.
Para una crecida vale el del pico. Cuanto más lejos, más baja la correlación de
las variaciones diarias: Posadas anticipa el pico, pero sus variaciones de un
día casi no se parecen a las de Barranqueras.

**Controles.** Corrientes está enfrente de Barranqueras y da cero por los dos
métodos. Partida la serie en dos mitades, el desfase por variaciones cambia
menos de medio día en Itá Ibaté, Corrientes, Bella Vista y Goya, y menos de un
día en Posadas e Ituzaingó: Yacyretá, que se llenó entre 1994 y 2011, regula lo
que pasa por ahí. Los dos métodos coinciden en signo y en orden.

**Límites.** La serie es diaria: el desfase se conoce al medio día. Entre Itá
Ibaté y Barranqueras entra el río Paraguay, así que las escalas del Paraná no
anuncian una crecida que venga por el Paraguay (ver 8.7). Ituzaingó está al pie
de la represa y su altura depende de la operación. Es el traslado típico: dice
cuándo llega, no a qué altura.

Verificación: `scripts/verificar-rio-traslado.ts`.

### 8.7 El aporte del río Paraguay y del Bermejo

El Paraguay entra al Paraná entre Itá Ibaté y Barranqueras, y el Bermejo entra
al Paraguay aguas abajo de Puerto Formosa. Están en el registro **Puerto
Pilcomayo**, frente a Asunción, unos 390 km aguas arriba de la confluencia;
**Puerto Formosa**; **Puerto Bermejo**, en Chaco, a unos 60 km; y **El
Colorado**, sobre el Bermejo en Formosa. Pilcomayo y Puerto Bermejo tienen
altura media diaria desde 1970; Formosa, desde 2006; El Colorado, desde 2001
y cargada con meses de atraso.

**No se comportan como una escala más del tramo.** Con los dos métodos de 8.6:

| Escala | Variaciones diarias | Mismo pico anual que Barranqueras |
|---|---|---|
| Puerto Pilcomayo | r 0,15 | 22 de 50 años |
| Puerto Formosa | r 0,22 | menos de diez años usables |
| Puerto Bermejo | r 0,29 | 19 de 33 años |
| El Colorado (Bermejo) | r 0,01 | menos de diez años usables |

De un día para el otro el Paraguay casi no se mueve con Barranqueras, y en la
mitad de los años o más su máximo anual es otra crecida, a meses de la del
Paraná: el Paraguay crece en invierno, con el agua del Pantanal. No hay un
traslado que informar.

**Lo que sí se mide es el aporte**: cuánto de lo que Barranqueras hace, y que
Itá Ibaté no explica, se parece a lo que hizo el afluente. Sobre cambios de
altura en 15 días:

1. Se ajusta por mínimos cuadrados el cambio de Barranqueras contra el de Itá
   Ibaté 1, 2, 3, 4, 6 y 8 días antes.
2. Lo que el ajuste no explica es el resto.
3. Se correlaciona el resto con el cambio de la escala del afluente, con
   desfases de −25 a +10 días.

| Escala | Máxima correlación | Desfase | Rango | R² sin → con |
|---|---|---|---|---|
| Puerto Pilcomayo | 0,51 | 5 días antes | de 10 antes al mismo día | 0,915 → 0,939 |
| Puerto Formosa | 0,68 | el mismo día | de 4 antes a 4 después | 0,899 → 0,949 |
| Puerto Bermejo | 0,48 | el mismo día | de 4 antes a 3 después | 0,919 → 0,958 |
| El Colorado (Bermejo) | 0,11 | — | — | 0,907 → 0,908 |

El rango es el de desfases cuya correlación queda a menos de un décimo de la
máxima. El R² es el del ajuste de Barranqueras con Itá Ibaté sola y sumando la
escala en su mejor desfase, sobre los mismos días.

**Lectura.** Puerto Pilcomayo explica parte de lo que Itá Ibaté deja sin
explicar, y lo hace con días de adelanto, pero **la cima es ancha: dice
alrededor de cuándo, no qué día**. Puerto Formosa y Puerto Bermejo explican más
y no adelantan: se mueven a la vez que Barranqueras. **El Bermejo en El Colorado
no se distingue en la altura de Barranqueras**: su agua llega mezclada con la
del Paraguay, que pesa siete veces más (ver 8.8), y la escala mide un río de
cauce móvil.

**Por qué quince días y seis desfases.** Con cambios de un día el Paraguay no se
distingue del ruido; la correlación crece con la ventana sin que el desfase se
corra. Y con Itá Ibaté en un solo desfase el resto correlaciona con la propia
Itá Ibaté de diez días antes —la onda se aplasta al viajar—, lo que le
atribuía a Puerto Bermejo días de adelanto que no tiene. Se midió con
Corrientes de referencia, antes del cambio; los controles dan lo mismo con
Barranqueras.

**Controles.** Corrientes, enfrente de Barranqueras, medida con el mismo
procedimiento da desfase cero; Goya, aguas abajo, da después. Partida la serie
en dos mitades, el desfase de Pilcomayo y de Puerto Bermejo cambia un día o
menos.

**Límites.** Es una descripción de cómo se movieron los ríos, no un modelo: no
dice cuántos centímetros sube Barranqueras por una crecida del Paraguay. Las
ventanas de quince días se superponen, así que los días que entran no son
observaciones independientes.

### 8.8 De dónde viene el agua que pasa frente a Barranqueras

`lib/rioCaudales.ts`. Una altura no se suma; un caudal sí:

    Barranqueras(t) = Yacyretá(t − a) + Paraguay(t − b) + Bermejo(t − c) + resto

Caudal medio diario del Alerta Hidrológico: Barranqueras (serie 26617, curva de
gasto, desde 1985), el efluente de Yacyretá, Puerto Pilcomayo y El Colorado.
Sobre 6.612 días entre 2001 y 2025:

| | m³/s | Parte |
|---|---|---|
| Barranqueras | 17.953 | |
| Paraná, efluente de Yacyretá (4 días antes) | 13.904 | 77,4 % |
| Paraguay, en Puerto Pilcomayo (11 días antes) | 3.248 | 18,1 % |
| Bermejo, en El Colorado (3 días antes, supuesto) | 428 | 2,4 % |
| Resto | 374 | 2,1 % |

**Que cierre es la verificación**: son lo que larga una represa y tres curvas de
gasto, y nada obliga a que tres sumen la cuarta. R² 0,91 día por día. El
Paraguay pesa 14,5 % en febrero y 22,3 % en julio; el Bermejo llega al 6 % en marzo
y no es nada en primavera.

**Dos controles independientes.** Con el total medido en **Corrientes**, enfrente
y con otra curva de gasto, la parte del Paraguay da 18,2 % y el resto 1,5 %:
las dos escalas miden la misma sección (sobre 9.721 días en común sus caudales
medios difieren 0,4 %). Con el Paraguay medido en **Puerto Formosa**, más abajo y
con otra escala, su parte da 18,9 %.

**Límites.** Son caudales de curva de gasto y no aforos, salvo Yacyretá: los
promedios son firmes, un día suelto con el río fuera de cauce no tanto. La
demora del Paraguay es la que mejor cierra la cuenta, no una medida de cuánto
tarda. La del Bermejo es supuesta. Es de dónde vino el agua, no a cuánto va a
llegar el río.

Verificación: `scripts/verificar-rio-caudales.ts`.

---

## 9. Procedencia: cada número declara su origen

Un número destinado a ser citado tiene que poder decir de dónde sale. Se
distinguen **cinco estados**, y los cinco llegan a pantalla:

| Estado | Significado | ¿Lo corrige recalcular? |
|---|---|---|
| `medido` | a menos de 1,5 km de un pluviómetro | — |
| `interpolado` | IDW con al menos una estación en el radio | — |
| `estimado` | sin estación en 60 km: proviene del modelo | no |
| `sin_calcular` | hay parte de la APA, pero esta fila no se cruzó aún | **sí** |
| `sin_parte` | la APA no publicó parte ese día | **nunca**: el dato no existe |

**La separación entre los dos últimos no es un detalle.** La APA publica parte
sólo los días con lluvia, de modo que la mayoría de los días no tiene ninguno —
en agosto-septiembre de 2026, 6 días de 31. Con ambos estados unificados, la
pantalla ofrecía «Recalcular» sobre días que nunca iban a poder interpolarse: el
usuario lo presionaba, el recálculo hacía correctamente su trabajo sobre los días
que sí tenían parte, y el cartel reaparecía idéntico.

**Un botón que no puede cambiar nada es peor que no tener botón.**

`sin_calcular` deliberadamente **no** está en el CHECK de la columna: nunca se
escribe. Es lo que deduce la API cuando `mm_fusion` es nulo y no hay marca de
`sin_parte`. Si pudiera persistirse, dejaría de significar "todavía no se hizo".

**"Sin parte" es provisorio mientras la APA no haya publicado.** La APA carga
los partes con atraso: el del 07/10/2026 apareció después del recálculo diario
del mediodía. Por eso, al leer, la marca `sin_parte` de una fecha que la APA ya
publicó se trata como `sin_calcular` —se puede y se debe interpolar—, y el
recálculo importa los partes faltantes antes de interpolar. Cuando la mayoría
de los consorcios del período no tiene lluvia medida ni interpolada, la
pantalla no afirma que llovió: informa que los valores son la estimación del
modelo. Ese día el modelo daba hasta 50 mm y los pluviómetros, 13.

**La procedencia de un período se pondera por milímetros, no por días.** Una
semana con dos días de lluvia y cinco secos: los cinco secos no tienen parte y
marcaban los 103 consorcios como "sin recalcular", ocultando que el 100 % de los
milímetros provenía de pluviómetros. El valor mostrado es una suma; un día que
aportó 0 mm no debería decidir su etiqueta.

---

## 10. Reproducibilidad

El comportamiento descrito está verificado por scripts ejecutables, no sólo
documentado. Desde `admin/`:

```bash
npm run verificar        # tsc, lint, sintaxis SQL y los scripts de verificación
npx tsx scripts/relevar-ina.ts   # contrato con la API del INA (sale a la red)
```

| Script | Qué afirma |
|---|---|
| `verificar-fusion.ts` | el motor IDW y los casos especiales |
| `verificar-thiessen.ts` | los polígonos contra casos de respuesta conocida |
| `verificar-thiessen-areal.ts` | áreas, pesos e invariantes de la media areal |
| `verificar-isohietas.ts` | los contornos |
| `verificar-red-lluvia.ts` | muestreo, promedio por tramo y cobertura |
| `verificar-indice-tramos.ts` | el índice espacial contra fuerza bruta |
| `verificar-calibracion.ts` | las métricas de validación |
| `verificar-lluvia.ts` | rangos, presets y el cliente de Open-Meteo |

El relevamiento del INA queda **fuera** de `npm run verificar` a propósito: es un
test de contrato con un tercero, sale a la red y depende de que un organismo esté
en línea. Un chequeo que falla por motivos ajenos al commit enseña a ignorar los
chequeos. Compara además los umbrales almacenados contra los publicados y avisa
si el organismo los movió.

---

## 11. Limitaciones declaradas

Se enumeran porque condicionan el uso legítimo de la herramienta.

1. **No se calcula transitabilidad ni estado de camino.** No existe la
   observación que permitiría calibrarlo (sección 1).
2. **IDW no extrapola**: el pico de una tormenta caída entre dos pluviómetros se
   pierde (3.5).
3. **528,6 km de red —1,8 %— no tienen pluviómetro a menos de 60 km**, en siete
   consorcios. Ahí el valor proviene del modelo o no existe (5.5).
4. **La validación es de estimación puntual**, sesgada hacia las ubicaciones de
   las estaciones y favorable a métodos suavizadores (4.4).
5. **Profundidad histórica de lluvia: un año.** No se puede afirmar todavía "es
   el mayor evento en N años" para precipitación. Para el río sí, desde 1906.
6. **CC 96 no tiene traza en el bundle** (138,8 km declarados, 0 trazados): su
   lámina sale de un único punto, el centroide de QGIS, y la pantalla lo marca.
7. **Los campos descriptivos del bundle vial vienen con erratas** de carga manual
   y se normalizan para pantalla; lo que no se entiende se omite en vez de
   interpretarse.

---

## 12. Fuentes

- **Administración Provincial del Agua (Chaco)** — `mapas.apachaco.gob.ar`
- **Open-Meteo** — `archive-api.open-meteo.com` (ERA5 / IFS operacional)
- **CHIRPS** — Climate Hazards Center, UC Santa Barbara, vía ClimateSERV de
  NASA SERVIR (`climateserv.servirglobal.net`)
- **Instituto Nacional del Agua — Alerta Hidrológico de la Cuenca del Plata** —
  `alerta.ina.gob.ar/a5`
- Umbrales de alerta y evacuación: publicados por el INA por estación, sobre
  escalas de Prefectura Naval Argentina.
