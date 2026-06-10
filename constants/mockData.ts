// @ts-nocheck — legacy mock data, replaced by realData.ts
import { Consorcio, Tramo, Reporte, Gasto } from '../types';

export const CONSORCIOS: Consorcio[] = [
  {
    id: '1',
    nombre: 'Consorcio Caminero Nº 1 - Córdoba Norte',
    provincia: 'Córdoba',
    kmTotales: 145,
    kmPavimentados: 62,
    kmConTierra: 83,
    estado: 'activo',
    presupuestoAnual: 12500000,
    ejecutado: 7800000,
    coordenadas: { latitud: -31.1, longitud: -64.1 },
  },
  {
    id: '2',
    nombre: 'Consorcio Caminero Nº 5 - Santa Fe',
    provincia: 'Santa Fe',
    kmTotales: 98,
    kmPavimentados: 45,
    kmConTierra: 53,
    estado: 'mantenimiento',
    presupuestoAnual: 8900000,
    ejecutado: 5100000,
    coordenadas: { latitud: -31.6, longitud: -60.7 },
  },
  {
    id: '3',
    nombre: 'Consorcio Caminero Nº 12 - Buenos Aires',
    provincia: 'Buenos Aires',
    kmTotales: 210,
    kmPavimentados: 95,
    kmConTierra: 115,
    estado: 'activo',
    presupuestoAnual: 18000000,
    ejecutado: 11200000,
    coordenadas: { latitud: -36.5, longitud: -60.0 },
  },
  {
    id: '4',
    nombre: 'Consorcio Caminero Nº 7 - Mendoza',
    provincia: 'Mendoza',
    kmTotales: 76,
    kmPavimentados: 30,
    kmConTierra: 46,
    estado: 'inactivo',
    presupuestoAnual: 6500000,
    ejecutado: 2100000,
    coordenadas: { latitud: -33.0, longitud: -68.8 },
  },
];

export const TRAMOS: Tramo[] = [
  {
    id: 't1',
    consorcioId: '1',
    nombre: 'Ruta Provincial 17 - Tramo A',
    tipo: 'pavimento',
    estado: 'bueno',
    longitud: 32,
    coordenadas: [
      { latitud: -31.05, longitud: -64.05 },
      { latitud: -31.15, longitud: -64.15 },
    ],
  },
  {
    id: 't2',
    consorcioId: '1',
    nombre: 'Camino Vecinal - Tramo B',
    tipo: 'tierra',
    estado: 'malo',
    longitud: 18,
    coordenadas: [
      { latitud: -31.2, longitud: -64.2 },
      { latitud: -31.3, longitud: -64.3 },
    ],
  },
];

export const REPORTES: Reporte[] = [
  {
    id: 'r1',
    consorcioId: '1',
    fecha: '2024-06-01',
    tipo: 'mensual',
    titulo: 'Informe Mensual - Mayo 2024',
    descripcion: 'Resumen de actividades y gastos del mes de mayo.',
    monto: 920000,
  },
  {
    id: 'r2',
    consorcioId: '1',
    fecha: '2024-05-15',
    tipo: 'incidente',
    titulo: 'Daño por lluvias - Tramo B',
    descripcion: 'Erosión severa en 3km del camino vecinal por precipitaciones.',
    monto: 250000,
  },
  {
    id: 'r3',
    consorcioId: '2',
    fecha: '2024-06-02',
    tipo: 'mensual',
    titulo: 'Informe Mensual - Mayo 2024',
    descripcion: 'Avance del plan de mantenimiento preventivo.',
    monto: 640000,
  },
];

export const GASTOS: Gasto[] = [
  { id: 'g1', consorcioId: '1', fecha: '2024-06-03', categoria: 'materiales', descripcion: 'Compra de granza para ripio', monto: 180000 },
  { id: 'g2', consorcioId: '1', fecha: '2024-06-05', categoria: 'personal', descripcion: 'Jornales cuadrilla mantenimiento', monto: 240000 },
  { id: 'g3', consorcioId: '1', fecha: '2024-06-07', categoria: 'equipos', descripcion: 'Alquiler motoniveladora', monto: 320000 },
  { id: 'g4', consorcioId: '2', fecha: '2024-06-04', categoria: 'mantenimiento', descripcion: 'Bacheo en RP-9', monto: 95000 },
];
