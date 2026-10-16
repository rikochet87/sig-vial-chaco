# Pronóstico de crecida en Barranqueras desde la cuenca alta

Investigación del 16/10/2026, con el Paraná en 6,05 m en Barranqueras y
subiendo. Pregunta: **¿cómo anticipar la altura en Barranqueras a partir de lo
que llueve y escurre en la cuenca alta y en Brasil?**

Todo lo medido acá sale de tres fuentes, cruzadas día por día:

- `public/rio/confluencia_caudal.json` y `barranqueras_diario.json` (INA, ya en el repo)
- **ONS** (Operador Nacional do Sistema Elétrico, Brasil): datos hidrológicos
  diarios de cada represa, abiertos y sin clave
- **GloFAS v4** (Copernicus) por la API de crecidas de Open-Meteo

Los cálculos se corrieron en el navegador de la PC (desde la nube no se llega a
ninguna de las tres) y **no quedaron como script**. Antes de llevar algo a
producción hay que rehacerlos en `admin/scripts/`.

---

## Resumen

El agua que llega a Barranqueras tiene dos plazos, y cada uno pide otra fuente:

| Plazo | Qué lo determina | Fuente | Qué se puede decir |
|---|---|---|---|
| **0 a 5 días** | agua que ya salió de Itaipú y del Iguazú | ONS (medido) | cuánto viene y cuándo llega, con análogos y regresión |
| **5 a 30 días** | lluvia sobre la cuenca alta que todavía no escurrió | GloFAS (modelo) | si sigue creciendo o afloja, como tendencia con banda |
| meses | régimen (El Niño, estación) | INA semanal (`cal_id` 499) | ya está |

**La propuesta es sumar el primer plazo ya, y el segundo como tendencia, nunca
como altura.** Lo que el INA pronostica a ~11 días sigue siendo la referencia
oficial; esto agrega de dónde viene el agua y con cuántos días de anticipo.

---

## 1. Lo que ya está en tránsito: Itaipú + Iguazú

### Por qué esas dos

`lib/rioCaudales.ts` ya mide que el 77 % de lo que pasa por Barranqueras sale
de Yacyretá. Aguas arriba de Yacyretá, casi todo es **Itaipú** (el Paraná que
viene de Brasil) más el **Iguazú**, que entra justo abajo de Itaipú. Las dos
son represas del ONS y publican su caudal defluente diario.

Sobre 2000–2026 (9.627 días), con cambios de 3 días:

| | Desfase con mejor correlación | r |
|---|---|---|
| Itaipú + Iguazú → Yacyretá | 1 día | 0,57 |
| Itaipú + Iguazú → Barranqueras | **5 días** | 0,48 |

Itaipú + Iguazú promedian 11.705 m³/s contra 13.151 de Yacyretá: la diferencia
(~1.450 m³/s) es lo que entra entre las dos (Misiones y Paraguay oriental).

### Los análogos: cada vez que esa suma pasó los 26.000 m³/s

Picos del promedio de 3 días de Itaipú + Iguazú sobre 26.000 m³/s, separados al
menos 30 días, 2000–2026:

| Pico Itaipú+Iguazú | m³/s (3 días) | Máx. Yacyretá | Máx. Barranqueras | Días después | Paraguay (Pilcomayo) |
|---|---|---|---|---|---|
| 22/10/2009 | 28.145 | 34.100 | **6,74 m** | 8 | 2.004 |
| 03/02/2010 | 26.683 | 28.300 | **6,75 m** | 4 | 3.471 |
| 27/06/2013 | 33.481 | 38.600 | **7,09 m** | 7 | 3.694 |
| 10/06/2014 | 32.206 | 38.700 | **7,00 m** | 8 | 6.238 |
| 05/03/2016 | 28.415 | 31.000 | **7,17 m** | 6 | 6.241 |
| 04/11/2023 | 28.044 | 36.500 | **7,05 m** | 6 | 1.839 |

- **Los seis pasaron la evacuación (6,50 m) y ninguno llegó a 7,20 m.** El pico
  se aplasta: con 28.000 a 39.000 m³/s en Yacyretá, Barranqueras tuvo entre
  31.000 y 34.000.
- **El Paraguay pesa poco en la altura máxima**: 2014 con 6.238 m³/s y 2023 con
  1.839 dieron casi lo mismo.
- Son seis casos. Sirven para decir «la última vez que pasó esto, el río llegó
  a tanto», no para dar un número con decimales.

### Octubre de 2026

Defluente diario del ONS (m³/s), con dos días de atraso:

| Fecha | Itaipú | Iguazú (Baixo Iguaçu) | Suma |
|---|---|---|---|
| 08/10 | 13.343 | 5.118 | 18.461 |
| 10/10 | 15.678 | 5.738 | 21.416 |
| 11/10 | 13.881 | 9.954 | 23.835 |
| 12/10 | 18.727 | 7.867 | 26.594 |
| 13/10 | 21.040 | 13.228 | **34.268** |
| 14/10 | 20.968 | 11.629 | 32.597 |

Promedio del 12 al 14/10: **31.150 m³/s**, entre 2016 y 2013/2014 en la tabla
de análogos. **Lectura por análogos: alrededor de 7 m entre el 18 y el
22/10**, si no llega otro pulso. Coincide con lo que anunció el INA
(evacuación probable desde el 17/10).

**Control de cierre.** La suma del 11/10 (23.835) más lo que entra entre
represas, el Paraguay en Formosa, el Bermejo y el resto da ~28.000 m³/s cinco
días después, el 16/10. La curva de abajo da 6,0–6,2 m para ese caudal. La
escala marcó 6,05.

### Regresión: cuánto mejora a la persistencia

Modelo lineal del cambio de caudal en Barranqueras a `k` días, con tres
entradas: el cambio en Itaipú + Iguazú (desfasado 5 días y **con los dos días
de atraso del ONS**), el cambio en el Paraguay (10 días) y el desbalance entre
lo que entra y lo que pasa. Se ajustó con 2000–2014 y se probó con 2015–2026.
Mejora del error medio contra suponer que el río no cambia:

| k (días) | Todos los días | Con Barranqueras sobre ~24.000 m³/s (~5,2 m) |
|---|---|---|
| 1 | 9 % | 33 % |
| 3 | 4 % | 33 % |
| 5 | 1 % | 26 % |
| 8 | 4 % | 20 % |
| 10 | 2 % | 12 % |

- **Sirve en aguas altas, que es cuando importa.** En aguas bajas el río casi no
  se mueve y la persistencia ya es difícil de mejorar.
- Sumar Porto Primavera y Rosana (el Paraná brasileño antes de Itaipú, ~9 días)
  no mejora: Itaipú ya los regula.
- Con Yacyretá en vez del ONS, y **suponiendo que se tiene el dato del día**, la
  mejora llega al 39 % a 4 días (58 % en aguas altas). Ese dato llega con
  atraso en el INA.
- El conjunto de prueba es chico: la serie de caudal de Barranqueras tiene
  huecos largos y **termina el 10/07/2026**.

### De caudal a altura en Barranqueras

Mediana del caudal del INA (serie 26617) por franja de altura, 1994–2026:

| Altura | Caudal | Días |
|---|---|---|
| 5,00 m | 22.869 | 319 |
| 5,50 m | 24.945 | 233 |
| **6,00 m (alerta)** | **27.310** | 159 |
| **6,50 m (evacuación)** | **29.737** | 108 |
| 7,00 m | 32.704 | 67 |
| 7,50 m | 35.770 | 20 |
| 8,00 m | 39.549 | 6 |

Sobre 7,5 m hay pocos días: arriba de eso la curva es una extrapolación.

### Cómo se implementaría

- **`lib/ons.ts`**: baja `DADOS_HIDROLOGICOS_RES_{año}.csv` de
  `ons-aws-prod-opendata.s3.amazonaws.com/dataset/dados_hidrologicos_di/` y se
  queda con cinco represas (`id_reservatorio`): `PNITAI` Itaipú, `IGUHBI` Baixo
  Iguaçu (desde 2005), `IGSCAX` Salto Caxias, `PNPPRI` Porto Primavera,
  `PPROSA` Rosana.
  - El archivo del año en curso pesa **8,7 MB** y se actualiza a diario. Va en
    el **cron**, no en la pantalla, y se guarda en una tabla
    (`caudal_represas`).
  - **El formato cambió en 2022**: antes, el id de la represa es la última
    columna y no existe `id_reservatorio`. Hay que leer por encabezado, no por
    posición.
  - CORS cerrado: desde el navegador no se puede. Desde Vercel (gru1, San
    Pablo) no se probó.
- **En la pantalla** («Aguas arriba»): una franja con Itaipú + Iguazú y la fecha
  en que ese caudal pasa por Barranqueras (+5 días). Al lado, el análogo más
  parecido de la tabla. Y la regla del sistema: **la altura que sale de los
  análogos se muestra como «la última vez que pasó esto», nunca como
  pronóstico**.
- **Test** (`verificar-ons.ts`): filas reales del CSV en los dos formatos, el
  desfase de 5 días sobre el archivo, y el control de cierre del 16/10/2026.

---

## 2. La lluvia que todavía no escurrió: GloFAS

### Qué es

GloFAS (Copernicus/ECMWF) pasa el pronóstico de lluvia por un modelo
hidrológico de toda la cuenca, con represas incluidas. Pronóstico de 30 días,
51 miembros, celdas de 5 km. **Open-Meteo lo sirve sin clave**
(`flood-api.open-meteo.com/v1/flood`), y el panel ya usa Open-Meteo para la
lluvia.

La celda de Barranqueras es `-27.475, -58.925` (aguas abajo de la confluencia).
La de enfrente, `-27.475, -58.875`, da un 4 % menos: es el Paraná solo.

### Cuánto acierta, medido

**El caudal absoluto no sirve.** Contra el caudal medido en Barranqueras:

| Período | Sesgo | r |
|---|---|---|
| Reanálisis 1994–2022 | **+24 %** | 0,78 |
| Operativo 2022–2026 (81 días con dato) | **−25 %** | 0,82 |

El sesgo cambia de signo. El 16/10/2026 GloFAS da 22.541 m³/s, y la escala
(6,05 m) indica ~27.500.

**La variación relativa sí aporta.** Método: caudal medido hoy × (GloFAS en
`t+k` / GloFAS hoy). Sobre el reanálisis 1994–2022, mejora contra la
persistencia:

| k | 3 | 5 | 7 | 10 | 15 | 20 | 30 días |
|---|---|---|---|---|---|---|---|
| Mejora | 2 % | 7 % | 12 % | 17 % | 22 % | 24 % | 27 % |

- **Esto es un techo, no lo que se va a lograr.** El reanálisis corre con la
  lluvia que cayó; el pronóstico, con la que se prevé. Open-Meteo no guarda los
  pronósticos viejos, así que el acierto real no se puede medir desde acá.
- **A menos de 5 días no aporta**: ahí manda lo que ya está en tránsito
  (sección 1).
- **GloFAS se adelanta unos 2 días**: la correlación de cambios de 15 días es
  máxima con un desfase de +2.

### Lo que dice hoy

La corrida del 16/10 (sin bias) sube de 22.541 a 25.176 m³/s el 19/10,
afloja hasta el 24 y vuelve a subir hasta **40.550 el 14/11**. Aplicado como
razón al caudal de hoy da un número fuera de la curva, así que la lectura
honesta es sólo la forma: **el modelo ve una segunda onda a fines de octubre y
crecida sostenida en noviembre**. No se pudo bajar la banda del ensamble: la PC
se desconectó antes.

### Cómo se implementaría

- Pedir `river_discharge_median`, `_p25` y `_p75` con `forecast_days=30` en la
  celda de Barranqueras y en Itaipú e Iguazú. Un pedido por día, en el cron.
- Mostrar **una flecha de tendencia por semana** (sube / estable / baja) con la
  banda, y la frase «modelo global, no calibrado en el Chaco». Nunca metros.
- **Guardar cada corrida** en una tabla. Es la única forma de medir el acierto
  real dentro de un año.

---

## 3. La lluvia en sí: lo que pidió el usuario

Hoy el panel muestra la lluvia del Chaco, y el río se mueve con la de Brasil.
Para ver la causa:

- **Lluvia areal por subcuenca de la cuenca alta**: Paranaíba, Grande, Tietê,
  Paranapanema, Iguazú e incremental de Itaipú. Acumulado de 7 días y
  pronóstico de 7 días, con Open-Meteo (el mismo motor del panel).
  - Los polígonos están en el ONS («contorno de bacias»).
  - **La que más pesa en lo inmediato es la incremental de Itaipú y el
    Iguazú**: el 14/10 el ONS daba 10.700 m³/s de caudal incremental en Itaipú,
    agua de lluvia caída entre Porto Primavera e Itaipú en los días anteriores.
    Lo que llueve en el Paranaíba o el Grande lo frenan las represas de arriba.
- **Caudal natural e incremental del ONS** (`val_vazaonatural`,
  `val_vazaoincremental`): ya vienen en el mismo CSV y miden el escurrimiento
  de la lluvia sin el efecto de las represas. Es el puente entre «llovió en
  Brasil» y «sale de Itaipú».

**No se propone un modelo lluvia → altura propio.** Con represas que deciden
cuánto largan, una regresión sobre la lluvia mediría la operación de Itaipú,
no la cuenca. Para el plazo largo, GloFAS ya modela eso. Para el corto, el
ONS dice lo que salió de verdad.

---

## Orden sugerido

1. **ONS en el cron y la franja de Itaipú + Iguazú con su +5 días.** Es medido,
   abierto, y es lo que habría avisado de esta crecida el 13/10.
2. **La tabla de análogos** en pantalla, con la regla de «la última vez».
3. **GloFAS como tendencia**, guardando las corridas para medirlo.
4. **Lluvia por subcuenca brasileña**, como contexto de las dos anteriores.

## Pendiente de verificar

- Que Vercel (gru1) llegue a S3 del ONS y a la API de crecidas de Open-Meteo.
- Rehacer las mediciones como script en el repo (`build_rio_ons.mjs` y un
  `verificar-`), igual que el banco de pruebas de la lluvia.
- La banda del ensamble de GloFAS para la corrida de hoy.
- Si la entidad de Yacyretá (EBY) publica su pronóstico de caudal afluente en
  algún formato consultable: la prensa del 14/10 citaba 29.000–32.000 m³/s.
