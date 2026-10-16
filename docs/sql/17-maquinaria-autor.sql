-- Maquinaria: quién cargó cada equipo y quién lo modificó por última vez.
--
-- Va después de 16-maquinaria.sql. `creado_por` y `created_at` ya estaban;
-- esto suma el nombre de quien cargó y quién modificó por última vez.
--
-- El nombre se guarda en la fila, no sólo el id: `creado_por` se pone en null
-- si se borra el usuario (on delete set null), y lo que se quiere saber es
-- quién lo cargó, aunque esa cuenta ya no exista.
--
-- Cargan el administrador y los técnicos de la zona del consorcio; lo decide
-- la ruta del panel (`lib/maquinariaAcceso.ts`), no la base.
--
-- Se puede volver a correr.

alter table maquinaria add column if not exists creado_por_nombre      text;
alter table maquinaria add column if not exists actualizado_por        uuid references auth.users(id) on delete set null;
alter table maquinaria add column if not exists actualizado_por_nombre text;
