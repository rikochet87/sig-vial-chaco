-- Red vial: los cambios que se cargan desde el panel.
--
-- La red sigue saliendo de los dos archivos que se generan desde QGIS
-- (`admin/public/geo/geo_cc.json` y `geo_rp.json`). Esta tabla guarda lo que
-- se agrega, se edita o se quita desde Herramientas → «Editar red», y todas las
-- pantallas que dibujan la red aplican estos cambios encima del archivo
-- (`admin/src/lib/redVial.ts`, `aplicarCambios`).
--
-- Es el primer paso de la mudanza de la red al panel: cada fila tiene la forma
-- que tendría la tabla de la red completa (propiedades con los mismos nombres
-- que el archivo y la geometría en GeoJSON). Cuando se pase toda la red, es
-- cargar los tramos del archivo como filas.
--
-- Una fila por tramo:
--   - `alta`    tramo nuevo; `base_*` y `original` en null.
--   - `edicion` tramo del archivo modificado; `original` guarda cómo era.
--   - `baja`    tramo del archivo que se quita; `geometria` es la original.
-- Un tramo del archivo tiene a lo sumo una fila (índice único abajo): volver a
-- editarlo modifica esa fila, y descartarla lo devuelve al original.
--
-- `base_capa` + `base_indice` ubican el tramo en el archivo y `base_huella` lo
-- reconoce: si el archivo se regenera desde QGIS y el tramo cambió de lugar se
-- lo busca por la huella, y si ya no está la fila queda «huérfana» y no se
-- aplica (la pantalla la muestra para resolverla).
--
-- `ajuste` son los km que esta fila le sumó (o restó) a cada consorcio,
-- relativo al original: [{numero, total, primaria, secundaria, terciaria}].
-- Se guarda para poder deshacerlo exacto. Lo escriben sólo las funciones de
-- abajo, en la misma transacción que la fila.
--
-- Se puede volver a correr.

create table if not exists red_vial_cambios (
  id                     uuid primary key default gen_random_uuid(),
  red                    text not null check (red in ('cc', 'rp')),
  operacion              text not null check (operacion in ('alta', 'edicion', 'baja')),
  capa                   text not null,
  base_capa              text,
  base_indice            integer,
  base_huella            text,
  original               jsonb,
  propiedades            jsonb not null,
  geometria              jsonb not null,
  gestion                text not null check (gestion in ('consorcio', 'dvp')),
  consorcio_numero       smallint,
  zona                   text not null check (zona in ('ZI', 'ZII', 'ZIII', 'ZIV', 'ZV')),
  km                     numeric(10, 3) not null default 0,
  ajuste                 jsonb not null default '[]'::jsonb,
  creado_por             uuid references auth.users(id) on delete set null,
  creado_por_nombre      text,
  created_at             timestamptz not null default now(),
  actualizado_por        uuid references auth.users(id) on delete set null,
  actualizado_por_nombre text,
  updated_at             timestamptz not null default now(),
  check ((operacion = 'alta') = (base_indice is null)),
  check (gestion = 'dvp' or consorcio_numero is not null)
);

create unique index if not exists red_vial_cambios_base
  on red_vial_cambios (red, base_capa, base_indice)
  where base_indice is not null;

create index if not exists red_vial_cambios_consorcio
  on red_vial_cambios (consorcio_numero);

-- RLS sin políticas: sólo entra la clave de servicio. Las rutas del panel
-- autorizan (leer: cualquier sesión, como el archivo; escribir: permiso
-- `red_vial`). La app móvil no la lee todavía.
alter table red_vial_cambios enable row level security;


-- Suma (o resta, con p_signo = -1) un ajuste a los km de cada consorcio.
create or replace function red_vial_aplicar_ajuste(p_ajuste jsonb, p_signo integer)
returns void
language plpgsql
as $$
declare
  a jsonb;
begin
  for a in select * from jsonb_array_elements(coalesce(p_ajuste, '[]'::jsonb)) loop
    update consorcios set
      red_km         = round((coalesce(red_km, 0)         + p_signo * coalesce((a->>'total')::numeric, 0))::numeric, 2),
      red_primaria   = round((coalesce(red_primaria, 0)   + p_signo * coalesce((a->>'primaria')::numeric, 0))::numeric, 2),
      red_secundaria = round((coalesce(red_secundaria, 0) + p_signo * coalesce((a->>'secundaria')::numeric, 0))::numeric, 2),
      red_terciaria  = round((coalesce(red_terciaria, 0)  + p_signo * coalesce((a->>'terciaria')::numeric, 0))::numeric, 2),
      updated_at     = now()
    where numero = (a->>'numero')::integer;
  end loop;
end;
$$;


-- Guarda una fila (nueva o existente) y mueve los km de los consorcios por la
-- diferencia entre el ajuste nuevo y el que la fila tenía. Todo o nada.
create or replace function red_vial_guardar(p_id uuid, p_fila jsonb)
returns red_vial_cambios
language plpgsql
as $$
declare
  previo jsonb := '[]'::jsonb;
  fila   red_vial_cambios;
begin
  if p_id is not null then
    select ajuste into previo from red_vial_cambios where id = p_id for update;
    if not found then
      raise exception 'El cambio % no existe', p_id using errcode = 'P0002';
    end if;
    update red_vial_cambios set
      operacion              = p_fila->>'operacion',
      capa                   = p_fila->>'capa',
      propiedades            = p_fila->'propiedades',
      geometria              = p_fila->'geometria',
      gestion                = p_fila->>'gestion',
      consorcio_numero       = (p_fila->>'consorcio_numero')::smallint,
      zona                   = p_fila->>'zona',
      km                     = (p_fila->>'km')::numeric,
      ajuste                 = p_fila->'ajuste',
      actualizado_por        = (p_fila->>'actualizado_por')::uuid,
      actualizado_por_nombre = p_fila->>'actualizado_por_nombre',
      updated_at             = now()
    where id = p_id
    returning * into fila;
  else
    insert into red_vial_cambios (
      red, operacion, capa, base_capa, base_indice, base_huella, original,
      propiedades, geometria, gestion, consorcio_numero, zona, km, ajuste,
      creado_por, creado_por_nombre, actualizado_por, actualizado_por_nombre
    ) values (
      p_fila->>'red', p_fila->>'operacion', p_fila->>'capa',
      p_fila->>'base_capa', (p_fila->>'base_indice')::integer, p_fila->>'base_huella',
      nullif(p_fila->'original', 'null'::jsonb),
      p_fila->'propiedades', p_fila->'geometria', p_fila->>'gestion',
      (p_fila->>'consorcio_numero')::smallint, p_fila->>'zona',
      (p_fila->>'km')::numeric, p_fila->'ajuste',
      (p_fila->>'actualizado_por')::uuid, p_fila->>'actualizado_por_nombre',
      (p_fila->>'actualizado_por')::uuid, p_fila->>'actualizado_por_nombre'
    )
    returning * into fila;
  end if;

  perform red_vial_aplicar_ajuste(previo, -1);
  perform red_vial_aplicar_ajuste(fila.ajuste, 1);
  return fila;
end;
$$;


-- Borra una fila y le devuelve a cada consorcio los km que esa fila le había
-- movido. Para un alta es quitar el tramo nuevo; para una edición o una baja es
-- volver al tramo del archivo tal como estaba.
create or replace function red_vial_descartar(p_id uuid)
returns red_vial_cambios
language plpgsql
as $$
declare
  fila red_vial_cambios;
begin
  delete from red_vial_cambios where id = p_id returning * into fila;
  if not found then
    raise exception 'El cambio % no existe', p_id using errcode = 'P0002';
  end if;
  perform red_vial_aplicar_ajuste(fila.ajuste, -1);
  return fila;
end;
$$;

-- Sólo la clave de servicio: una sesión del navegador no puede mover km.
revoke execute on function red_vial_aplicar_ajuste(jsonb, integer) from public, anon, authenticated;
revoke execute on function red_vial_guardar(uuid, jsonb)           from public, anon, authenticated;
revoke execute on function red_vial_descartar(uuid)                 from public, anon, authenticated;

-- La clave de servicio las tiene que poder correr: Supabase le da permiso por
-- defecto, pero se deja explícito para no depender de eso.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function red_vial_aplicar_ajuste(jsonb, integer) to service_role;
    grant execute on function red_vial_guardar(uuid, jsonb)           to service_role;
    grant execute on function red_vial_descartar(uuid)                 to service_role;
  end if;
end $$;
