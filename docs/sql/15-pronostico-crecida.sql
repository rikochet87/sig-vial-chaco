-- ═══════════════════════════════════════════════════════════════════════════
-- Registro diario de la crecida en Barranqueras desde la lluvia en Brasil
--
-- La pestaña Río Paraná muestra cada día una banda de alturas para los
-- próximos ~16 días, calculada con la lluvia pronosticada en el Paraná
-- brasileño (`lib/crecida.ts`). Su validación está hecha con la lluvia que
-- cayó, que es un techo: cuánto acierta de verdad, con la lluvia
-- pronosticada, sólo se sabe guardando cada emisión y comparándola después
-- con lo que midió la escala. Open-Meteo no ofrece el ensamble de días
-- pasados: lo que no se guarda no se puede verificar nunca.
--
-- Una fila por día de emisión. Se guardan:
--   · las 51 corridas enteras, no la banda: con las corridas se puede calcular
--     cualquier medida de acierto, no sólo las de hoy;
--   · la lluvia de cada corrida por cuenca, para separar cuánto del error
--     vino del pronóstico de lluvia y cuánto de la cadena;
--   · la altura con la que arrancó, con su fecha y fuente: es también la
--     medida contra la que se verifican las emisiones anteriores.
--
-- Arreglos planos `dias × corridas`: el día d y la corrida m van en la
-- posición d * corridas + m + 1 (Postgres cuenta desde 1). Alturas en cm,
-- lluvia en décimas de mm. Unos 20 KB por día.
--
-- Lo escribe el cron de las 09:00 (`/api/rio/crecida/registro`) con la clave
-- de servicio. RLS activado y sin políticas, igual que `pronostico_lluvia`:
-- si algún día el navegador necesita leerla, se agrega una política de
-- select, no se desactiva RLS.
--
-- Ejecutar en el SQL Editor de Supabase. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.pronostico_crecida (
  -- Día de emisión, hora local
  emitido               date primary key,
  -- La altura de Barranqueras con la que arrancó la cadena
  altura_hoy            real not null,
  altura_fecha          timestamptz not null,
  altura_fuente         text not null,
  -- Primer día de `alturas` (el de emisión) y cuántos hay
  dia0                  date not null,
  dias                  smallint not null,
  corridas              smallint not null,
  -- cm; puede tener null en un día sin cálculo
  alturas               smallint[] not null,
  -- cm, uno por día: sin más lluvia desde hoy
  sin_lluvia            smallint[] not null,
  -- Último día en que la banda no se abre: hasta ahí decide el agua en camino
  determinado_hasta     date,
  -- Último dato del ONS (Itaipú + Iguazú) que entró
  ultimo_ons            date not null,
  -- Lluvia de cada corrida por cuenca, décimas de mm, desde el día de emisión
  dias_lluvia           smallint not null,
  lluvia_iguacu         smallint[] not null,
  lluvia_itaipu_inc     smallint[] not null,
  -- Itaipú + Iguazú, m³/s: los primeros `itaipu_iguazu_medidos` son del ONS,
  -- el resto la mediana del ensamble
  itaipu_iguazu_desde   date not null,
  itaipu_iguazu         integer[] not null,
  itaipu_iguazu_medidos smallint not null,
  -- Con qué parámetros se calculó (`crecida_parametros.json`, campo generado)
  calibracion           text not null,
  modelo                text not null,
  avisos                text[] not null default '{}',
  consultado            timestamptz not null default now(),
  check (array_length(alturas, 1) = dias * corridas),
  check (array_length(sin_lluvia, 1) = dias),
  check (array_length(lluvia_iguacu, 1) = dias_lluvia * corridas),
  check (array_length(lluvia_itaipu_inc, 1) = dias_lluvia * corridas)
);

comment on table public.pronostico_crecida is
  'Pronóstico propio de la altura en Barranqueras desde la lluvia en Brasil, '
  'guardado cada día con las 51 corridas, para medir después cuánto acierta.';

alter table public.pronostico_crecida enable row level security;
