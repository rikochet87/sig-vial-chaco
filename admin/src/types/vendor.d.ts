// Minimal shims for packages whose type declarations didn't install correctly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module 'jspdf' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export class jsPDF {
    constructor(options?: {
      orientation?: 'portrait' | 'landscape'
      unit?: 'mm' | 'pt' | 'cm' | 'in'
      format?: string | [number, number]
    })
    setFont(fontName: string, fontStyle?: string): this
    setFontSize(size: number): this
    setTextColor(r: number, g: number, b: number): this
    setDrawColor(r: number, g: number, b: number): this
    setFillColor(r: number, g: number, b: number): this
    text(text: string, x: number, y: number, options?: Record<string, unknown>): this
    line(x1: number, y1: number, x2: number, y2: number): this
    rect(x: number, y: number, w: number, h: number, style?: string): this
    addPage(format?: string | [number, number], orientation?: string): this
    addImage(
      imageData: string,
      format: string,
      x: number,
      y: number,
      w: number,
      h: number,
      alias?: string,
      compression?: string,
      rotation?: number
    ): this
    save(filename: string): void
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any
  }
}

declare module 'jspdf-autotable' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const autoTable: (doc: any, options: Record<string, any>) => void
  export default autoTable
}
