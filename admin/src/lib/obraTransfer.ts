// ── obraTransfer.ts ──────────────────────────────────────────────────────────
// Singleton en memoria que transfiere tipo + params + precio desde Calculadoras
// hacia Planta dentro de la misma sesión de navegación (sin Zustand).
// Se limpia después de ser leído para evitar stale data.

export type ObraType = 'terraplen' | 'excavacion' | 'ripio' | 'desmalezado' | 'desbosque' | 'canal'

export interface ObraTransferData {
  type: ObraType
  params: Record<string, number | string>
  precioUnitario: number
  unidad: string          // e.g. '$/t', '$/ha', '$/m³'
  pendingSide?: 'izq' | 'der'  // set when coming from CalcDesbosque per-side draw
}

let _data: ObraTransferData | null = null

export const setObraTransfer   = (d: ObraTransferData) => { _data = d }
export const getObraTransfer   = (): ObraTransferData | null => _data
export const clearObraTransfer = () => { _data = null }

// ── Return path: planta → calculadoras ───────────────────────────────────────
// Planta stores the polygon area (ha) here after the user draws and confirms
interface ReturnArea { side: 'izq' | 'der'; area_ha: number }
let _returnData: ReturnArea | null = null
export const setReturnedArea   = (side: 'izq' | 'der', area_ha: number) => { _returnData = { side, area_ha } }
export const getReturnedArea   = (): ReturnArea | null => _returnData
export const clearReturnedArea = () => { _returnData = null }

// ── Saved tab: calculadoras saves active tab before navigating to planta ─────
let _savedTab: string | null = null
export const saveReturnTab    = (tab: string) => { _savedTab = tab }
export const consumeReturnTab = (): string | null => { const t = _savedTab; _savedTab = null; return t }
