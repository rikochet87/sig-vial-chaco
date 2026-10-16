# Crecida en Barranqueras a partir de la lluvia en el Paraná brasileño

Investigación del 16/10/2026, con el Paraná en 6,05 m en Barranqueras y
subiendo. Pregunta: **con la lluvia medida y pronosticada en Brasil, y con lo
que miden allá en el río, ¿cuánto crecería Barranqueras?**

La respuesta es una cadena de cálculo de tres eslabones, cada uno calibrado
contra mediciones:

```
lluvia sobre la cuenca  ──GR4J──▶  caudal del Iguazú y aporte propio de Itaipú
caudal del Paraná alto  ──medido (ONS)──┘                │
                                                         ▼
           Itaipú + Iguazú  ──función de respuesta──▶  caudal en Barranqueras
                                                         │
                                       curva altura–caudal ▼
                                                altura en la escala
```

Los cálculos se corrieron en el navegador de la PC, porque desde la nube no se
llega a ninguna de las fuentes, y **no quedaron como script**. Todo número de
este documento tiene que poder rehacerse con un `scripts/build_*` y un
`verificar-*` antes de ir a una pantalla.

---

## Qué parte de Brasil importa

El Paraná brasileño **de arriba** —Paranaíba, Grande, Tietê— está escalonado en
decenas de represas que lo regulan: lo que llueve ahí sale de Porto Primavera
días o semanas después, y como decide el operador. **Lo que mueve una crecida
en Barranqueras es la parte de abajo, entre esas represas y la frontera**:

| Cuenca | Qué es | Área usada | Lluvia anual (ERA5) |
|---|---|---|---|
| **Iguazú** | todo el río, de Curitiba a Foz | 57.000 km² hasta Salto Caxias | 1.776 mm |
| **Incremental de Itaipú** | lo que entra entre Porto Primavera / Rosana e Itaipú: Ivaí, Piquiri, Ivinhema, Amambaí, Iguatemi | 150.000 km² | 1.539 mm |

Del 1 al 15/10/2026 llovieron **174 mm sobre el Iguazú** (1,5 veces lo normal
para esa quincena) y **192 mm sobre la incremental de Itaipú** (2,2 veces).
Esa es la crecida de ahora.

Las dos cuencas están dibujadas a mano como polígonos aproximados (`POL` en el
código de la sesión). Para producción conviene usar los contornos de cuenca
que publica el propio ONS.

### Ilha Solteira: el volumen sí, el aviso no

Propuesta del usuario del 16/10/2026: tomar como punto de control la represa
de **Ilha Solteira** (`PNISOL` en el ONS; −20,385, −51,370), justo aguas abajo
de la unión del Paranaíba y el Grande. Se midió con el ONS 2000–2026 y la
respuesta tiene dos caras.

**En volumen es la mitad del Paraná que llega a Itaipú.** Ilha Solteira suelta
4.456 m³/s de promedio y Três Irmãos, sobre el Tietê, 682. Juntos son 5.138
contra 10.261 de Itaipú, y unos 9 días antes de Barranqueras:

| Tramo | Demora |
|---|---|
| Ilha Solteira + Três Irmãos → Jupiá | 0 a 1 día |
| Jupiá → Porto Primavera | 0 a 1 día |
| Porto Primavera → Itaipú | 2 días |
| Itaipú → Barranqueras | 4 a 6 días |

**En una crecida pesa poco, porque las represas de arriba la frenan.** En los
183 días de 2000 a 2026 en que Itaipú + Iguazú subieron más de 5.000 m³/s en
una semana, la suba promedio fue de 7.524 m³/s y se repartió así:

| Componente | Suba promedio (m³/s) | Parte |
|---|---|---|
| Ilha Solteira + Três Irmãos | 558 | 7 % |
| Resto de Porto Primavera + Rosana (Paranapanema) | 1.475 | 20 % |
| Incremental de Itaipú | 3.111 | 41 % |
| Iguazú | 2.945 | 39 % |

Las partes no suman 100 % porque cada componente va con su propia demora.

Lo mismo en los picos de la tabla de análogos: Ilha Solteira aportó entre el
11 y el 28 % de lo que soltaban Itaipú y el Iguazú. La excepción es febrero de
2010, con el 53 %: una crecida de verano del Grande y el Paranaíba. Ilha
Solteira tiene su máximo de enero a marzo (~6.100 m³/s de media mensual) y
anda en ~4.900 en octubre.

**Hoy (14/10/2026) suelta 3.433 m³/s, por debajo de su promedio**, y aporta el
14 % de lo que viene. Esta crecida no viene de ahí.

**Como dato para anticipar no mejoró nada.** Se probó pronosticar Porto
Primavera + Rosana a 1–8 días con el cambio de Ilha Solteira + Três Irmãos,
crudo o en medias de 7 días, ajustado en 2000–2014 y probado en 2015–2026.
Mejora contra la persistencia: **0 %**, y con el cambio diario crudo, peor. Jupiá
y Porto Primavera vuelven a regular lo que les llega, así que lo que sale de
Ilha Solteira no se traslada tal cual.

Dónde sí sirve:
- **Para mostrar de dónde viene el agua.** Es un buen punto de control del
  Paraná alto en la pantalla «Aguas arriba».
- **En crecidas de verano del Grande y el Paranaíba**, como 2010, donde pasa a
  ser la mitad.
- **No como entrada del modelo lluvia–caudal.** Lo que llueve sobre el Grande y
  el Paranaíba lo guardan Furnas, Emborcação y las demás represas, y cuándo lo
  sueltan lo decide el operador, no la lluvia.

---

## Eslabón 1 — Lluvia → caudal: modelo GR4J

### Por qué GR4J

Es el modelo lluvia–caudal diario más usado en hidrología operativa (Perrin,
Michel y Andréassian, 2003): cuatro parámetros, un almacenamiento de suelo, un
almacenamiento de tránsito y dos hidrogramas unitarios. Se calibra con
lluvia, evapotranspiración y caudal observado, y no necesita datos de suelo ni
de cobertura, que no tenemos.

### Datos

- **Lluvia y evapotranspiración (ET0 FAO)**: ERA5 por Open-Meteo, diaria desde
  2008, en 45 puntos de grilla dentro de las dos cuencas (cada ~0,7°),
  promediados por cuenca.
- **Caudal observado**: el que publica el ONS en `DADOS_HIDROLOGICOS_RES`.
  - Para el Iguazú, el **caudal natural** en Salto Caxias (`val_vazaonatural`):
    el río sin el efecto de las represas de aguas arriba.
  - Para Itaipú, el **caudal incremental** (`val_vazaoincremental`): lo que
    escurre de la cuenca propia, descontado lo que llega de Porto Primavera y
    Rosana.
  - **Control**: el natural de Itaipú es el de Porto Primavera más el de Rosana
    más el incremental. Sobre 6.862 días el desvío medio es de −2 m³/s.

### Calibración y validación

Optimización Nelder–Mead del KGE (Kling–Gupta). Calibración 2009–2018 y
validación 2019–2026, con el año 2008 de calentamiento.

| Cuenca | X1 (mm) | X2 (mm/d) | X3 (mm) | X4 (d) | NSE cal. | NSE val. | KGE val. |
|---|---|---|---|---|---|---|---|
| Iguazú | 56 | 1,36 | 419 | 2,4 | 0,73 | **0,78** | 0,87 |
| Incremental de Itaipú | 1.925 | 2,00 | 103 | 3,5 | 0,63 | **0,65** | 0,75 |

- **Valida igual o mejor de lo que calibra**: no está sobreajustado.
- El Iguazú responde rápido (suelo chico, X1 = 56 mm): es basalto con
  pendiente. La incremental de Itaipú es lenta y de suelo profundo, por la
  llanura de Mato Grosso do Sul.
- El incremental de Itaipú es una resta que hace el ONS, y trae ruido de día a
  día. Por eso su NSE es menor.
- **En la crecida actual el modelo se queda corto**: el 13/10 simula 5.400 m³/s
  en el Iguazú contra 10.100 medidos. La lluvia de ERA5 es un promedio de
  celdas de 25 km y aplasta las tormentas. Eso se corrige con el paso
  siguiente.

---

## Eslabón 2 — De las represas a Barranqueras

### El Paraná que llega a Itaipú

Ajuste sobre 2008–2026, R² = 0,98:

```
Itaipú afluente(t) = 0,96 · Porto Primavera(t−2) + 0,97 · Rosana(t−2) + 1,01 · incremental(t)
```

Los coeficientes dan 1: es un balance de masa, y **el agua de Porto Primavera
tarda 2 días en llegar a Itaipú**. Itaipú casi no guarda agua: el embalse se
movió entre 216,4 y 220,5 m en el 98 % de los días desde 2008. Lo que entra es
lo que sale: 10.150 contra 10.146 m³/s de promedio.

### De Itaipú + Iguazú a Barranqueras: función de respuesta

Caudal de Barranqueras como suma ponderada de lo que largaron Itaipú y el
Iguazú en los días anteriores, más el Paraguay en Puerto Pilcomayo. Es una
**convolución lineal** (la misma idea que un hidrograma unitario o un tránsito
de Muskingum) con los pesos ajustados por mínimos cuadrados sobre 2008–2018:

| Días antes | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 12 | 14 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Peso | 0,10 | 0,07 | 0,14 | 0,15 | **0,16** | 0,10 | 0,07 | 0,03 | 0,09 | 0,05 | 0,06 |

- **Los pesos suman 1,02**: lo que sale de Itaipú y del Iguazú llega entero a
  Barranqueras. No se impuso; salió del ajuste, y es el control físico.
- **El pico de la respuesta es a 4–6 días y la cola llega a dos semanas**: así
  se ve la atenuación en Yacyretá y en la llanura.
- El Paraguay entra con coeficiente 1,16 (promedio de 5 a 14 días antes), y hay
  un aporte fijo de 1.530 m³/s: Misiones, Paraguay oriental, el Bermejo y el
  resto.
- **NSE 0,88 en calibración y 0,83 en validación (2019–2026).** En aguas altas
  subestima unos 960 m³/s (~0,3 m). Por eso cada pronóstico arranca de la
  altura medida y no de lo que dice el modelo (paso siguiente).

### Curva altura–caudal en Barranqueras

Mediana del caudal del INA (serie 26617) por franja de 25 cm, 1994–2026:

| Altura | 5,0 | 5,5 | **6,0** | **6,5** | 7,0 | 7,5 | 8,0 | 8,5* | 9,0* |
|---|---|---|---|---|---|---|---|---|---|
| m³/s | 22.869 | 24.945 | **27.310** | **29.737** | 32.704 | 35.770 | 39.549 | 42.972 | 46.394 |

\* Sobre 8 m hay seis días medidos: la curva sigue la pendiente del último
metro y es una extrapolación.

---

## Eslabón 3 — Cómo se arma un pronóstico

Con fecha de emisión `t0`:

1. **Lo que ya salió de Brasil** se usa tal cual. El ONS publica con dos días
   de atraso, así que Itaipú + Iguazú son medidos hasta `t0 − 2`.
2. **Lo que todavía no salió** se calcula con GR4J, corriendo con la lluvia
   observada hasta ayer y la pronosticada después. Dos correcciones:
   - **Actualización de estado.** El modelo se escala para que coincida con lo
     medido el último día (`obs/sim`). La corrección se desvanece con una
     constante de 20 días.
   - **Mezcla con la persistencia.** La previsión es la última medida más una
     fracción α del cambio que da el modelo. α crece con la anticipación: 0,18
     a un día, 0,57 a cinco y ~0,7 desde diez. Se ajustó con 2009–2018. **A uno
     o dos días, lo medido es mejor que cualquier modelo**, y α lo dice.
3. **Barranqueras**: la función de respuesta da el **cambio** de caudal desde
   hoy, y se suma al caudal que corresponde a la altura medida hoy. El error
   del eslabón 2 se cancela en la resta.
4. **Altura**: por la curva.
5. **Incertidumbre**: se repite con cada uno de los 51 miembros del pronóstico
   por ensamble del ECMWF (15 días) y se informa la banda.

### Validación: cuánto mejora a no hacer nada

Contra suponer que Barranqueras se queda en la altura de hoy (persistencia),
2009–2026, **días con Barranqueras sobre 24.000 m³/s (~5,2 m)**. Error medio en
m³/s y mejora porcentual:

| Anticipación | Persistencia | Sólo lo que ya salió de Brasil | **Cadena con lluvia** | Si se supiera el futuro de Itaipú+Iguazú |
|---|---|---|---|---|
| 3 días | 1.210 | 626 (48 %) | **636 (47 %)** | 650 (46 %) |
| 5 días | 1.860 | 1.044 (44 %) | **937 (50 %)** | 920 (51 %) |
| 7 días | 2.480 | 1.720 (31 %) | **1.312 (47 %)** | 1.219 (51 %) |
| 10 días | 3.137 | 2.602 (17 %) | **1.620 (48 %)** | 1.475 (53 %) |
| 15 días | 3.805 | 3.478 (9 %) | **2.016 (47 %)** | 1.733 (54 %) |

- **La lluvia es lo que sostiene el pronóstico más allá de 5 días.** Sin ella,
  la mejora cae del 44 % al 9 % a quince días. Con ella, se queda cerca del
  techo (la última columna).
- 1.600 m³/s a diez días son **~0,3 m** en aguas altas; 2.000 a quince, ~0,35 m.
- **Reserva importante: esta validación usa la lluvia que cayó (ERA5), no la
  pronosticada.** Es el acierto con un pronóstico de lluvia perfecto. Con el
  real va a ser peor, y cuánto no se puede medir sin guardar pronósticos.
- El período 2019–2026 sirve poco para validar aguas altas: sequía de 2019 a
  2022 y huecos en el caudal de Barranqueras. Hay 17 días utilizables.

### Crecidas pasadas, con la lluvia que cayó

Altura máxima observada contra la que daba la cadena, emitida N días antes:

| Pico | Observado | 15 d antes | 10 d | 7 d | 5 d | 3 d |
|---|---|---|---|---|---|---|
| 30/10/2009 | 6,74 | 6,38 | 6,62 | 6,53 | 6,40 | 6,63 |
| 04/07/2013 | 7,09 | 6,56 | 7,17 | **8,05** | 7,54 | 7,24 |
| 18/06/2014 | 7,00 | 5,95 | 6,25 | 7,56 | 6,94 | 6,92 |
| 10/03/2016 | 7,17 | 7,16 | 7,47 | 7,14 | 7,26 | 7,30 |
| 10/11/2023 | 7,05 | 6,19 | 7,54 | 6,85 | 7,31 | 6,91 |

- **A 15 días anticipa la crecida en los cinco casos**, aunque se queda corta:
  0,4 a 1 m de menos. Con la altura de ese día, quedarse quieto decía entre
  4,0 y 5,6 m.
- **Entre 3 y 10 días el error suele estar dentro de ±0,5 m.** La excepción es
  2013 a 7 días: se pasó casi un metro.
- **Con subidas muy rápidas tiende a pasarse.** La respuesta es lineal y no
  representa que, con el río fuera de cauce, la llanura guarda más agua.

---

## Lo que da hoy (emisión 16/10/2026)

Datos de partida:
- Barranqueras 6,05 m (~27.550 m³/s por la curva)
- ONS hasta el 14/10: Itaipú 20.968 + Iguazú 11.629 = 32.597 m³/s (el 13/10 fue 34.268)
- lluvia observada hasta el 15/10
- ensamble ECMWF del 16 al 30/10

Lluvia pronosticada para los próximos 15 días (mediana del ensamble; entre
paréntesis, del 10 % al 90 %):
- **Iguazú: 104 mm (73–172)**
- **Incremental de Itaipú: 141 mm (104–193)**

Del 16 al 20/10 casi no llueve. **Del 21 al 25/10 vuelve a llover fuerte**:
~100 mm en la incremental de Itaipú.

| Fecha | 10 % | **Mediana** | 90 % | Máx. del ensamble | Sin más lluvia |
|---|---|---|---|---|---|
| 17/10 | 6,53 | **6,53** | 6,53 | 6,53 | 6,53 |
| 19/10 | 7,12 | **7,12** | 7,12 | 7,13 | 7,12 |
| 21/10 | 7,34 | **7,34** | 7,34 | 7,34 | 7,34 |
| 23/10 | 7,31 | **7,31** | 7,31 | 7,33 | 7,30 |
| 25/10 | 7,11 | **7,17** | 7,23 | 7,30 | 7,06 |
| 27/10 | 7,00 | **7,16** | 7,39 | 7,57 | 6,81 |
| 29/10 | 6,97 | **7,22** | 7,59 | 7,99 | 6,47 |
| 01/11 | 6,81 | **7,21** | 7,78 | 8,94 | 6,05 |

Cómo leerlo:

- **Hasta el 23/10 la banda no se abre**: esa altura la determina agua que ya
  salió de Itaipú y del Iguazú, y no depende de lo que llueva. **Pico de unos
  7,3 m entre el 20 y el 23/10.** Por lo visto en los casos pasados, puede
  pasarse hasta ~0,5 m; un rango razonable es 6,9 a 7,4 m.
- **Evacuación (6,50 m) el 17/10**: coincide con lo que anunció el INA.
- **Después del 25/10 decide la lluvia de la semana que viene.**
  - Sin más lluvia, el río bajaría a ~6 m el 1/11.
  - Con la mediana del pronóstico se sostiene en ~7,2 m.
  - El 10 % más lluvioso lo lleva a 7,8 m.
  - Un miembro extremo llega a 8,9 m.
- **Esto no es un pronóstico oficial.** El del INA lo es. Esto agrega de dónde
  viene el agua y con qué anticipación.

---

## Para llevarlo al panel

1. **Ingesta diaria (cron)**:
   - **ONS**: el CSV del año en curso (8,7 MB), filtrado a Itaipú, Baixo
     Iguaçu, Salto Caxias, Porto Primavera y Rosana. El formato cambió en 2022:
     hay que leer por encabezado, no por posición.
   - **Open-Meteo**: lluvia y ET0 de ERA5 en los 45 puntos, y el ensamble
     ECMWF.
   - Guardar cada pronóstico emitido, para medir el acierto real dentro de un
     año.
2. **Motor en `lib/`**: GR4J, la función de respuesta, la mezcla α y la curva,
   con los parámetros de este documento congelados en un JSON. Igual que con
   la lluvia: el número y de dónde sale.
3. **Pantalla** en la pestaña Río: la banda de altura de 15 días con los
   umbrales.
   - **Una línea vertical marca hasta dónde la altura está determinada por
     agua ya en camino (~5 días) y desde dónde depende de la lluvia.** Es la
     lectura más útil y la más honesta.
   - Al lado, la lluvia observada y pronosticada sobre las dos cuencas.
4. **Tests**:
   - el balance Primavera + Rosana + incremental
   - que los pesos de la respuesta sumen ~1
   - GR4J contra una implementación de referencia (el paquete `airGR` de R)
   - los cinco casos de la tabla de crecidas pasadas

## Pendiente

- Rehacer todo como script en el repo. La sesión del navegador no se guarda.
- Comparar GR4J contra `airGR` con los mismos datos.
- Los polígonos de cuenca del ONS en lugar de los dibujados a mano.
- Verificar que Vercel (gru1) llegue al S3 del ONS y a Open-Meteo. **Open-Meteo
  limita las llamadas por minuto**, y 18 años son muchas llamadas por punto:
  bajar los 45 puntos llevó ~15 minutos. El histórico se baja una vez y después sólo el día.
- Medir el acierto con pronósticos de lluvia reales, que es lo único que dice
  cuánto vale de verdad.
- Representar la llanura de inundación en aguas altas. Es lo que hace que se
  pase en las subidas rápidas.
