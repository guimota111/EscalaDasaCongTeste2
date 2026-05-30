import React from 'react'

/**
 * Horizontal balance bars showing HAC (blue) and HOBRA (green) shifts per pathologist.
 * stats: { [pathId]: { HAC: { weekday, holiday }, HOBRA: { weekday, holiday } } }
 * pathMap: { [pathId]: any }
 */
export default function BalanceBars({ stats = {}, pathMap = {} }) {
  const paths = Object.entries(pathMap)
    .filter(([id, p]) => {
      if (p.regime !== 'normal') return false
      const s = stats[id] || {}
      const total = (s.HAC?.weekday || 0) + (s.HAC?.holiday || 0) + (s.HOBRA?.weekday || 0) + (s.HOBRA?.holiday || 0)
      return total > 0
    })
    .sort((a, b) => a[1].name.localeCompare(b[1].name))

  if (!paths.length) {
    return <p className="text-gray-400 text-sm">Nenhum patologista Normal.</p>
  }

  // Compute per-person totals
  const rows = paths.map(([id, p]) => {
    const s = stats[id] || {}
    const hac = (s.HAC?.weekday || 0) + (s.HAC?.holiday || 0)
    const hobra = (s.HOBRA?.weekday || 0) + (s.HOBRA?.holiday || 0)
    return { id, name: p.name, hac, hobra, total: hac + hobra }
  })

  const maxTotal = Math.max(...rows.map((r) => r.total), 1)

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4 mb-3">
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="inline-block w-3 h-3 rounded-sm bg-blue-500" />
          HAC
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="inline-block w-3 h-3 rounded-sm bg-amber-500" />
          HOBRA
        </span>
      </div>

      {rows.map(({ id, name, hac, hobra, total }) => {
        const hacPct = (hac / maxTotal) * 100
        const hobraPct = (hobra / maxTotal) * 100
        // Short name for display
        const parts = name.trim().split(' ')
        const shortName = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0]

        return (
          <div key={id} className="grid grid-cols-[90px_1fr_36px] items-center gap-2">
            <span className="text-xs text-gray-700 truncate text-right" title={name}>
              {shortName}
            </span>
            <div className="space-y-0.5">
              {/* HAC bar */}
              <div className="flex items-center gap-1">
                <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-300"
                    style={{ width: `${hacPct}%` }}
                  />
                </div>
                <span className="text-xs text-blue-700 w-5 text-right">{hac}</span>
              </div>
              {/* HOBRA bar */}
              <div className="flex items-center gap-1">
                <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all duration-300"
                    style={{ width: `${hobraPct}%` }}
                  />
                </div>
                <span className="text-xs text-amber-700 w-5 text-right">{hobra}</span>
              </div>
            </div>
            <span className="text-xs font-semibold text-gray-700 text-center">{total}</span>
          </div>
        )
      })}
    </div>
  )
}
