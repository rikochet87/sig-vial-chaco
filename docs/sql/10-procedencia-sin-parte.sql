-- ─────────────────────────────────────────────────────────────────────────────
-- Agregar 'sin_parte' a los valores válidos de `precipitaciones.procedencia`
-- ─────────────────────────────────────────────────────────────────────────────
--
-- POR QUÉ
--
-- `09-seguridad.sql` creó este CHECK con los tres valores que existían entonces:
--
--     check (procedencia is null or procedencia in ('medido','interpolado','estimado'))
--
-- Después se agregó un cuarto estado, `sin_parte`, para distinguir dos cosas que
-- estaban mezcladas: una fila puede no tener `mm_fusion` porque todavía no se
-- interpoló —y eso se arregla interpolando— o porque **ese día la APA no publicó
-- parte**, y eso no se arregla nunca, porque el dato no existe.
--
-- El CHECK quedó sin actualizar, así que la interpolación fallaba al escribir
-- con `23514 check_violation`, que en pantalla salía como "Error en la
-- operación". Correr esto arregla el botón «Interpolar pluviómetros (IDW)».
--
-- `sin_calcular` **no** va en la lista a propósito: nunca se escribe en la base.
-- Es lo que deduce `api/lluvia/route.ts` cuando `mm_fusion` es null y no hay
-- marca de `sin_parte` — o sea, el estado de una fila que todavía no pasó por
-- acá. Meterlo en el CHECK invitaría a persistirlo, y entonces dejaría de
-- significar "no se hizo todavía".
--
-- Reejecutable: el `drop constraint if exists` permite volver a correrlo.

alter table public.precipitaciones drop constraint if exists precipitaciones_procedencia_valida;
alter table public.precipitaciones add  constraint precipitaciones_procedencia_valida
  check (procedencia is null or procedencia in ('medido', 'interpolado', 'estimado', 'sin_parte'));

comment on column public.precipitaciones.procedencia is
  'De dónde salió mm_fusion: medido (pluviómetro sobre la red), interpolado '
  '(IDW de los cercanos), estimado (sin pluviómetro a menos de 60 km, cae al '
  'modelo) o sin_parte (ese día la APA no publicó parte, no hay con qué cruzar). '
  'Null = la fila todavía no se interpoló.';

-- Control: tiene que devolver los cuatro valores permitidos
select pg_get_constraintdef(oid) as definicion
from pg_constraint
where conrelid = 'public.precipitaciones'::regclass
  and conname = 'precipitaciones_procedencia_valida';
