-- ═══════════════════════════════════════════════════════════════════════════
-- Registro diario del pronóstico de lluvia
--
-- La pantalla de Hidrología muestra el pronóstico por conjuntos de ECMWF por
-- cuenca, pero no se sabe cuánto acierta en el Chaco. Para saberlo hay que
-- guardar cada día lo que se pronosticó y, cuando llega el parte de la APA,
-- compararlo. Un pronóstico que no se guarda no se puede verificar nunca: el
-- servicio no ofrece pronósticos pasados.
--
-- Se guarda por NODO de la grilla de 0,25° y con las 51 corridas, no ya
-- promediado por cuenca, por el mismo motivo que `mediciones_lluvia` guarda por
-- estación: cómo se lleva eso a una cuenca es una decisión de cálculo que puede
-- cambiar, y no queremos haberla horneado en el dato crudo. Con las corridas
-- enteras se puede calcular después cualquier medida de acierto, no sólo las
-- que hoy se nos ocurren.
--
-- Una fila por día de emisión y por nodo: 137 filas por día. Los milímetros van
-- en un arreglo plano de `dias × corridas` en décimas enteras; Postgres lo
-- comprime (TOAST) y la lluvia tiene muchos ceros.
--
-- Lo escribe el cron de las 12:00 (`/api/lluvia/ingesta`, rama de las 15:00
-- UTC) con la clave de servicio. RLS activado y sin políticas, igual que
-- `precipitaciones`: si algún día el navegador necesita leerla, se agrega una
-- política de select, no se desactiva RLS.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.pronostico_lluvia (
  -- Día en que se guardó, hora local. El primer día pronosticado es el siguiente.
  emitido     date not null,
  lat         real not null,
  lng         real not null,
  -- Primer día pronosticado (emitido + 1) y cuántos hay
  dia0        date not null,
  dias        smallint not null,
  corridas    smallint not null,
  -- mm en décimas: el valor del día d y la corrida m está en [d * corridas + m + 1]
  mm          smallint[] not null,
  -- ET₀ FAO-56 media de las corridas, por día, en décimas de mm
  et0         smallint[] not null,
  modelo      text not null,
  consultado  timestamptz not null default now(),
  primary key (emitido, lat, lng),
  check (array_length(mm, 1) = dias * corridas),
  check (array_length(et0, 1) = dias)
);

comment on table public.pronostico_lluvia is
  'Pronóstico de lluvia por conjuntos guardado cada día, por nodo de la grilla '
  'de 0,25°, para medir después cuánto acierta contra los pluviómetros de la APA.';

create index if not exists pronostico_lluvia_dia0 on public.pronostico_lluvia (dia0);

alter table public.pronostico_lluvia enable row level security;
