-- ============================================================
-- Obras: Desmalezado de Banquinas
-- Basado en actuación electrónica SGT E13-04/03/2026-4.388-Ae
-- ============================================================

-- Tabla principal de convenios / obras de desmalezado
CREATE TABLE IF NOT EXISTS obras_desmalezado (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  numero_actuacion      TEXT,                                         -- ej. E13-04/03/2026-4.388-Ae
  consorcio_id          INT         NOT NULL,
  consorcio_nombre      TEXT        NOT NULL,
  delegacion_zona       TEXT        NOT NULL,                        -- ej. "Zona V - Gral. San Martín"
  fecha_inicio          DATE        NOT NULL,
  fecha_fin             DATE        NOT NULL,
  plazo_meses           INT         DEFAULT 6,
  altura_max_corte_m    DECIMAL(4,2) DEFAULT 0.15,                  -- Art. 1° pliego: ≤0,15 m
  precio_unitario_ha    DECIMAL(14,2) NOT NULL,                     -- $/ha adoptado
  rendimiento_ha_dia    DECIMAL(6,2)  DEFAULT 18.00,                -- ha/día del equipo
  total_superficie_ha   DECIMAL(8,2)  NOT NULL,                     -- suma de todos los tramos
  presupuesto_total     DECIMAL(16,2) NOT NULL,
  aporte_dvp_pct        DECIMAL(5,2)  DEFAULT 80,
  aporte_cc_pct         DECIMAL(5,2)  DEFAULT 20,
  estado                TEXT        DEFAULT 'borrador'
                        CHECK (estado IN ('borrador','aprobado','en_ejecucion','finalizado','rescindido')),
  observaciones         TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Tramos por ruta y margen (cómputos métricos)
-- Fórmula: longitud_m × ancho_banquina_m / 10000 = superficie_ha
CREATE TABLE IF NOT EXISTS tramos_desmalezado (
  id                   UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  obra_id              UUID        REFERENCES obras_desmalezado(id) ON DELETE CASCADE,
  ruta                 TEXT        NOT NULL,                        -- 'RP1', 'RP3', 'RP7', etc.
  margen               TEXT        NOT NULL
                       CHECK (margen IN ('izquierdo','derecho','ambos')),
  prog_inicio_km       DECIMAL(8,3) NOT NULL,
  prog_fin_km          DECIMAL(8,3) NOT NULL,
  ancho_banquina_m     DECIMAL(5,2)  DEFAULT 15.00,
  superficie_ha        DECIMAL(8,2)  NOT NULL,
  -- coords opcionales para visualizar en Planta
  coords_inicio        JSONB,                                       -- { lat, lng }
  coords_fin           JSONB,                                       -- { lat, lng }
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Certificados mensuales de avance de obra
-- Art. 6°-7° pliego: medición entre días 20-30 de cada mes, en hectáreas
CREATE TABLE IF NOT EXISTS certificados_desmalezado (
  id                        UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  obra_id                   UUID        REFERENCES obras_desmalezado(id) ON DELETE CASCADE,
  numero_certificado        INT         NOT NULL,
  mes                       INT         NOT NULL CHECK (mes BETWEEN 1 AND 12),
  anio                      INT         NOT NULL,
  fecha_medicion            DATE,
  superficie_ha_certificada DECIMAL(8,2) NOT NULL,
  precio_unitario_ha        DECIMAL(14,2) NOT NULL,
  monto_total               DECIMAL(16,2) NOT NULL,                -- superficie × precio
  monto_dvp                 DECIMAL(16,2) NOT NULL,                -- monto_total × aporte_dvp_pct/100
  monto_cc                  DECIMAL(16,2) NOT NULL,                -- monto_total × aporte_cc_pct/100
  estado                    TEXT        DEFAULT 'pendiente'
                            CHECK (estado IN ('pendiente','aprobado','pagado')),
  fecha_aprobacion          DATE,
  fecha_pago                DATE,
  observaciones             TEXT,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (obra_id, numero_certificado)
);

-- RLS: acceso autenticado
ALTER TABLE obras_desmalezado     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tramos_desmalezado    ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificados_desmalezado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all_obras_desmalezado"
  ON obras_desmalezado FOR ALL TO authenticated USING (true);
CREATE POLICY "auth_all_tramos_desmalezado"
  ON tramos_desmalezado FOR ALL TO authenticated USING (true);
CREATE POLICY "auth_all_certificados_desmalezado"
  ON certificados_desmalezado FOR ALL TO authenticated USING (true);

-- Índices
CREATE INDEX ON tramos_desmalezado (obra_id);
CREATE INDEX ON certificados_desmalezado (obra_id);
CREATE INDEX ON obras_desmalezado (consorcio_id);
CREATE INDEX ON obras_desmalezado (estado);
