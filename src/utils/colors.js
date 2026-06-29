// Paleta de cores para os cards de patologistas (boa legibilidade e distinção)
export const PATHOLOGIST_COLORS = [
  '#ef4444', // vermelho
  '#f97316', // laranja
  '#f59e0b', // âmbar
  '#eab308', // amarelo
  '#84cc16', // lima
  '#22c55e', // verde
  '#10b981', // esmeralda
  '#14b8a6', // teal
  '#06b6d4', // ciano
  '#0ea5e9', // azul-céu
  '#3b82f6', // azul
  '#6366f1', // índigo
  '#8b5cf6', // violeta
  '#a855f7', // roxo
  '#d946ef', // fúcsia
  '#ec4899', // rosa
  '#f43f5e', // rosa-vermelho
  '#64748b', // cinza-azulado
  '#78716c', // pedra
  '#0f766e', // teal escuro
]

/** Retorna preto ou branco conforme a luminância da cor de fundo, para contraste do texto. */
export function getContrastText(hex) {
  if (!hex) return '#111827'
  const c = hex.replace('#', '')
  const full = c.length === 3 ? c.split('').map((x) => x + x).join('') : c
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  // Luminância relativa (sRGB)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.6 ? '#111827' : '#ffffff'
}

/** Cor estável derivada do id/nome, usada quando o patologista não tem cor definida. */
export function fallbackColor(seed = '') {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) & 0xffffffff
  }
  const idx = Math.abs(hash) % PATHOLOGIST_COLORS.length
  return PATHOLOGIST_COLORS[idx]
}

/** Cor efetiva de um patologista (definida ou fallback estável). */
export function pathColor(p) {
  if (!p) return '#e5e7eb'
  return p.color || fallbackColor(p.id || p.name || '')
}
