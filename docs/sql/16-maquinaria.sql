-- Maquinaria vial de cada consorcio.
--
-- El inventario de equipos de cada consorcio y en qué condición está. Se carga
-- desde Consorcios → la ficha de cada uno → «Maquinaria vial».
--
-- La organización viene de la app «Equipos Viales», que tenía su propia base.
-- El catálogo de tipos (31, en cuatro categorías) no es una tabla: está en
-- `admin/src/lib/maquinaria.ts` y la ruta rechaza un `tipo_id` que no esté ahí.
--
-- La tabla se llama `maquinaria` y no `equipos` porque `equipos` ya existe: es
-- el costo de los equipos del análisis de precios de Ripio, que es otra cosa.
--
-- `consorcio_numero` es el número del consorcio (el de `consorcios.numero`),
-- que es como se lo busca en todo el panel. No lleva clave foránea porque no
-- hay script de creación de `consorcios` en el repo y no consta que `numero`
-- tenga restricción única; la ruta comprueba que el consorcio exista.
--
-- Se puede volver a correr.

create table if not exists maquinaria (
  id                 uuid primary key default gen_random_uuid(),
  consorcio_numero   smallint not null,
  tipo_id            smallint not null,
  marca              text,
  modelo             text,
  anio               smallint check (anio is null or anio between 1950 and 2100),
  dominio            text,
  n_chasis           text,
  n_motor            text,
  condicion          text not null default 'Bueno'
    check (condicion in ('Bueno', 'Regular', 'Malo', 'En reparación', 'Desuso', 'Baja')),
  poliza_numero      text,
  poliza_vencimiento date,
  observaciones      text,
  creado_por         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists maquinaria_consorcio on maquinaria (consorcio_numero);

-- RLS sin políticas, como `precipitaciones`: sólo entra la clave de servicio.
-- Las rutas del panel autorizan con el permiso `consorcios`. La app móvil no
-- la lee; si algún día la necesita, se agrega una política, no se apaga RLS.
alter table maquinaria enable row level security;
