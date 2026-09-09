-- ═══════════════════════════════════════════════════════════════════════════
-- Ripio: cómputos y presupuesto
-- Ejecutar en el SQL Editor de Supabase.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Catálogo de equipos ────────────────────────────────────────────────
-- Compartido entre obras y calculadoras. El costo se guarda en dólares:
-- el valor en pesos se recalcula con la cotización vigente de cada análisis,
-- así un presupuesto viejo no se distorsiona cuando cambia el dólar.

create table if not exists public.equipos (
  id          uuid primary key default gen_random_uuid(),
  numero      int,
  nombre      text not null,
  modelo      text,
  marca       text,
  hp          numeric not null default 0,
  costo_usd   numeric not null default 0,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists equipos_nombre_idx on public.equipos (nombre);

alter table public.equipos enable row level security;

-- Lectura: cualquier usuario autenticado. Escritura: solo admin.
drop policy if exists equipos_select on public.equipos;
create policy equipos_select on public.equipos
  for select to authenticated using (true);

drop policy if exists equipos_admin on public.equipos;
create policy equipos_admin on public.equipos
  for all to authenticated
  using      (exists (select 1 from public.profiles p where p.id = auth.uid() and p.rol = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.rol = 'admin'));


-- ── 2. Precios base, versionados por fecha ────────────────────────────────
-- Versionar es el punto importante: un presupuesto de abril tiene que poder
-- recalcularse con los precios de abril. Sin esto, abrir una obra vieja daría
-- un número distinto al que se aprobó.

create table if not exists public.precios_base (
  id                    uuid primary key default gen_random_uuid(),
  vigencia_desde        date not null,
  etiqueta              text,                       -- 'Abril/26'
  gasoil                numeric not null default 0, -- $/lt con IVA
  neumatico             numeric not null default 0, -- $/un con IVA
  dolar                 numeric not null default 0,
  jornal_oficial_esp    numeric not null default 0, -- $/hs
  jornal_oficial        numeric not null default 0,
  jornal_medio_oficial  numeric not null default 0,
  jornal_ayudante       numeric not null default 0,
  ripio                 numeric not null default 0, -- $/tn en cantera
  notas                 text,
  created_by            uuid references auth.users (id),
  created_at            timestamptz not null default now()
);

create unique index if not exists precios_base_vigencia_idx
  on public.precios_base (vigencia_desde);

alter table public.precios_base enable row level security;

drop policy if exists precios_base_select on public.precios_base;
create policy precios_base_select on public.precios_base
  for select to authenticated using (true);

drop policy if exists precios_base_admin on public.precios_base;
create policy precios_base_admin on public.precios_base
  for all to authenticated
  using      (exists (select 1 from public.profiles p where p.id = auth.uid() and p.rol = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.rol = 'admin'));


-- ── 3. Análisis del proyecto ──────────────────────────────────────────────
-- Coeficientes, los cuatro análisis de precio, datos de la obra y valores
-- adoptados. Va en JSONB siguiendo el patrón de obras.datos_calculadora:
-- es un documento que se lee entero o no se lee.
--
-- precios_base_id fija con qué precios se hizo el análisis. Se guarda además
-- una copia de los valores dentro del JSON, para que el presupuesto siga
-- siendo reproducible aunque después se edite o borre la fila de precios.

alter table public.proyectos_ripio
  add column if not exists analisis         jsonb,
  add column if not exists precios_base_id  uuid references public.precios_base (id),
  add column if not exists actualizado_en   timestamptz;


-- ── 4. Seed del catálogo de equipos ───────────────────────────────────────

insert into public.equipos (numero, nombre, modelo, marca, hp, costo_usd)
values
  (1, 'ACOPLADO PLAYO', NULL, NULL, 0, 2542),
  (2, 'ACOPLADO TANQUE', NULL, NULL, 0, 3813),
  (3, 'ACOPLADO TANQUE Regador', NULL, NULL, 0, 20000),
  (4, 'APLANADORA', NULL, NULL, 125, 90678),
  (5, 'APLICADORA P/ PULVERIZAR', NULL, NULL, 15, 15000),
  (6, 'AUTOCOMPACTADOR', '815', 'CAT.', 170, 239830),
  (7, 'AUTOCOMPACTADOR', NULL, 'DINAPAC', 114, 105000),
  (8, 'AUTOCOMPACTADOR', NULL, NULL, 150, 110000),
  (9, 'BARREDORA SOPLADORA', NULL, NULL, 40, 11440),
  (10, 'CAMION CON ACOPLADO', NULL, NULL, 350, 75000),
  (11, 'CAMION MIXER', NULL, NULL, 280, 97457),
  (12, 'CAMION REGADOR ASFALTO', NULL, NULL, 140, 90000),
  (13, 'CAMION REGADOR DE AGUA', NULL, NULL, 145, 55000),
  (14, 'CAMIÓN TPTE. LARGA DISTANCIA', '114 H', NULL, 300, 160000),
  (15, 'CAMION VOLCADOR', NULL, NULL, 145, 93350),
  (16, 'CAMION VOLCADOR', NULL, 'MERCEDES BENZ', 211, 85000),
  (17, 'CAMION VOLCADOR', NULL, 'MACK', 350, 114830),
  (18, 'CARGADOR FRONTAL', '938-F', NULL, 140, 127966),
  (19, 'COMPRESOR', NULL, 'CETEC', 180, 40000),
  (20, 'DOSIFICADORA DE HORMIGÓN', NULL, NULL, 60, 50000),
  (21, 'ELECTROBOMBA', NULL, NULL, 40, 12711),
  (22, 'EQUIPO Y HERRAMIENTAS MENORES', NULL, NULL, 15, 2966),
  (23, 'GRUPO ELECTROGENO', '3408', NULL, 444, 95169),
  (24, 'MOTOBOMBA', NULL, NULL, 40, 5000),
  (25, 'MOTONIVELADORA', '14-G', 'CAT.', 203, 291822),
  (26, 'MOTONIVELADORA', '140', 'CAT.', 170, 225000),
  (27, 'MOTOTRAILLA', '613', 'CAT.', 150, 231889),
  (28, 'PALA DE ARRASTRE', 'J.D', NULL, 0, 8500),
  (29, 'PLANTA ASFALTICA COMP.', 'T.D.', NULL, 0, 500000),
  (30, 'PLANTA DOSIFICADORA DE HORMIGON', NULL, NULL, 0, 84750),
  (31, 'RASTRA', NULL, 'GENOVESE', 0, 7627),
  (32, 'RETROEXCAVADORA', '320-L', 'CAT.', 220, 126101),
  (33, 'RETROEXCAVADORA', '416', 'CAT', 74, 65000),
  (34, 'RODILLO NEUMATICO AUTOPROPULSADO', 'CP-30', NULL, 125, 81500),
  (35, 'RODILLO NEUMATICO DE ARRASTRE', NULL, NULL, 82, 15000),
  (36, 'TERMINADORA', NULL, 'BLAK NOW', 120, 81186),
  (37, 'TOPADORA', 'D-7', 'CAT.', 215, 239067),
  (38, 'TRACTOR', NULL, 'DEUTZ- FHAR', 120, 38000),
  (39, 'TRACTOR', NULL, 'DEUTZ- FHAR', 157, 45000),
  (40, 'TRACTOR', NULL, 'DEUTZ- FHAR', 180, 52033),
  (41, 'RETROEXCAVADORA', NULL, NULL, 200, 165000)
on conflict do nothing;


-- ── 5. Precios base iniciales ─────────────────────────────────────────────
-- Valores de la planilla de referencia. Ajustar al mes en curso.

insert into public.precios_base
  (vigencia_desde, etiqueta, gasoil, neumatico, dolar,
   jornal_oficial_esp, jornal_oficial, jornal_medio_oficial, jornal_ayudante, ripio)
values
  ('2026-04-01', 'Abril/26', 2500, 600000, 1500, 6011, 5142, 4752, 4374, 0)
on conflict (vigencia_desde) do nothing;
