-- Enlaces públicos de Hidrología.
--
-- Un enlace deja ver la sección Hidrología, sólo lectura y sin la pestaña
-- Precisión, a quien lo tenga: sin cuenta ni registro. Se crean y se revocan
-- desde Usuarios → Enlaces públicos.
--
-- La clave va en claro a propósito: el administrador tiene que poder volver a
-- copiar el enlace desde la lista. Lo que abre es lectura de datos de fuentes
-- públicas, y la tabla sólo se lee con la clave de servicio.
--
-- Revocar no borra la fila: le pone fecha, para que quede a quién se le dio.

create table if not exists enlaces_publicos (
  id          uuid primary key default gen_random_uuid(),
  token       text not null unique,
  nombre      text not null,
  creado_por  uuid references auth.users(id) on delete set null,
  creado_en   timestamptz not null default now(),
  revocado_en timestamptz
);

-- RLS sin políticas, como `precipitaciones`: sólo entra la clave de servicio.
alter table enlaces_publicos enable row level security;
