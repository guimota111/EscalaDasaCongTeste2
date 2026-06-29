import React from 'react'

/**
 * Segmentação de plantões de Segunda e Quarta-feira por hospital, por patologista.
 * Conta apenas plantões Seg-Qui que não caem em feriado (subdivisão da coluna "Seg-Qui").
 *
 * stats: { [pathId]: { HAC: { mon, wed }, HOBRA: { mon, wed } } }
 * paths: [{ id, name, active }]  — ordem/filtro definidos pelo chamador
 * compact: usa fonte menor (para o painel estreito de balanceamento ao vivo)
 */
export default function MonWedTable({ stats = {}, paths = [], compact = false }) {
  if (!paths.length) {
    return <p className="text-gray-400 text-sm">Nenhum patologista de regime Normal.</p>
  }

  const textSize = compact ? 'text-xs' : 'text-sm'
  const cellPad = compact ? 'py-1 px-1.5' : 'py-1.5 px-2'

  const rows = paths.map((p) => {
    const s = stats[p.id] || {}
    const hacMon = s.HAC?.mon || 0
    const hacWed = s.HAC?.wed || 0
    const hobraMon = s.HOBRA?.mon || 0
    const hobraWed = s.HOBRA?.wed || 0
    return {
      id: p.id,
      name: p.name,
      active: p.active,
      hacMon,
      hacWed,
      hobraMon,
      hobraWed,
      totalMon: hacMon + hobraMon,
      totalWed: hacWed + hobraWed,
    }
  })

  return (
    <div className="overflow-x-auto">
      <table className={`w-full ${textSize}`}>
        <thead>
          <tr className="border-b border-gray-200">
            <th className={`text-left ${cellPad} font-semibold text-gray-700`}>Patologista</th>
            <th className={`text-center ${cellPad} font-semibold text-blue-700`}>HAC<br /><span className="font-normal text-[11px] text-gray-500">Seg</span></th>
            <th className={`text-center ${cellPad} font-semibold text-blue-700`}>HAC<br /><span className="font-normal text-[11px] text-gray-500">Qua</span></th>
            <th className={`text-center ${cellPad} font-semibold text-emerald-700`}>HOBRA<br /><span className="font-normal text-[11px] text-gray-500">Seg</span></th>
            <th className={`text-center ${cellPad} font-semibold text-emerald-700`}>HOBRA<br /><span className="font-normal text-[11px] text-gray-500">Qua</span></th>
            <th className={`text-center ${cellPad} font-semibold text-gray-700`}>Seg<br /><span className="font-normal text-[11px] text-gray-500">total</span></th>
            <th className={`text-center ${cellPad} font-semibold text-gray-700`}>Qua<br /><span className="font-normal text-[11px] text-gray-500">total</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className={`${cellPad} text-gray-800 whitespace-nowrap`}>
                {r.name}
                {r.active === false && <span className="ml-2 text-xs text-red-400">(desligado)</span>}
              </td>
              <td className={`text-center ${cellPad} text-gray-700`}>{r.hacMon}</td>
              <td className={`text-center ${cellPad} text-gray-700`}>{r.hacWed}</td>
              <td className={`text-center ${cellPad} text-gray-700`}>{r.hobraMon}</td>
              <td className={`text-center ${cellPad} text-gray-700`}>{r.hobraWed}</td>
              <td className={`text-center ${cellPad} font-semibold text-gray-800`}>{r.totalMon}</td>
              <td className={`text-center ${cellPad} font-semibold text-gray-800`}>{r.totalWed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
