/**
 * Seed script — pobla la tabla `consorcios` en Supabase desde realData.ts.
 * Ejecutar una sola vez: npx ts-node scripts/seed_consorcios.ts
 *
 * Requiere variable de entorno SUPABASE_SERVICE_ROLE_KEY (no la anon key).
 */

import { createClient } from '@supabase/supabase-js';
import { CONSORCIOS } from '../constants/realData';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Faltan EXPO_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

async function main() {
  const rows = CONSORCIOS.map(c => ({
    numero: Number(c.numero),
    nombre: c.nombre,
    zona: c.zona,
    localidad: c.localidad ?? '',
    coords_lat: c.latitude,
    coords_lng: c.longitude,
    red_km: c.redKm,
    presidente: c.presidente,
    vicepresidente: c.vicepresidente,
    secretario: c.secretario,
    tesorero: c.tesorero,
  }));

  console.log(`Insertando ${rows.length} consorcios...`);
  const { error } = await supabase
    .from('consorcios')
    .upsert(rows, { onConflict: 'numero' });

  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
  console.log('OK — consorcios cargados en Supabase.');
}

main();
