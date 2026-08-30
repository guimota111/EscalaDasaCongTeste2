import React from 'react'
import { HOSPITALS } from '../utils/dateHelpers'

/**
 * Shows shift count per pathologist per hospital.
 * stats: { [pathId]: { HAC: { weekday, holiday }, HOBRA: { weekday, holiday } } }
 * A coluna Feriados é informativa (cadastro manual) e não entra no Total.
 * pathMap: { [pathId]: { name, regime } }
 * scheduleDays: { [dateStr]: { HAC, HOBRA } }
 */
export default function BalanceTable({ stats = {}, pathMap = {}, hospital }) {
  const paths = Object.entries(pathMap)
    .filter(([, p]) => p.regime === 'normal')
    .sort((a, b) => a[1].name.localeCompare(b[1].name))

  if (!paths.length) return <p className="text-gray-400 text-sm">Nenhum patologista Normal cadastrado.</p>

  const hospitals = hospital ? [hospital] : HOSPITALS

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-2 pr-4 font-semibold text-gray-700">Patologista</th>
            {hospitals.map((h) => (
              <React.Fragment key={h}>
                <th className="text-center py-2 px-2 font-semibold text-gray-700">{h} Seg-Qui</th>
                <th className="text-center py-2 px-2 font-semibold text-gray-500">{h} Feriados</th>
              </React.Fragment>
            ))}
            <th className="text-center py-2 px-2 font-semibold text-gray-700">Total</th>
          </tr>
        </thead>
        <tbody>
          {paths.map(([id, p]) => {
            const s = stats[id] || {}
            // Feriados são contabilidade manual — ficam fora do total de balanceamento.
            const total = hospitals.reduce((sum, h) => sum + (s[h]?.weekday || 0), 0)
            return (
              <tr key={id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-1.5 pr-4 text-gray-800">{p.name}</td>
                {hospitals.map((h) => (
                  <React.Fragment key={h}>
                    <td className="text-center py-1.5 px-2 text-gray-700">{s[h]?.weekday || 0}</td>
                    <td className="text-center py-1.5 px-2 text-gray-400">{s[h]?.holiday || 0}</td>
                  </React.Fragment>
                ))}
                <td className="text-center py-1.5 px-2 font-semibold text-blue-700">{total}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
