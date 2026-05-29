import React, { useState, useEffect } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { HOSPITALS } from '../utils/dateHelpers'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { BarChart2 } from 'lucide-react'

export default function Statistics() {
  const [pathologists, setPathologists] = useState([])
  const [allStats, setAllStats] = useState({})
  const [loading, setLoading] = useState(true)
  const [hideInactive, setHideInactive] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [pathSnap, statsSnap] = await Promise.all([
          getDocs(collection(db, 'pathologists')),
          getDocs(collection(db, 'statistics')),
        ])

        const paths = pathSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
        setPathologists(paths)

        const agg = {}
        for (const sd of statsSnap.docs) {
          const shifts = sd.data().shifts || {}
          for (const [pathId, data] of Object.entries(shifts)) {
            if (!agg[pathId]) {
              agg[pathId] = { HAC: { weekday: 0, holiday: 0 }, HOBRA: { weekday: 0, holiday: 0 }, fifthWeekend: 0 }
            }
            for (const h of HOSPITALS) {
              agg[pathId][h].weekday += data[h]?.weekday || 0
              agg[pathId][h].holiday += data[h]?.holiday || 0
            }
            agg[pathId].fifthWeekend += data.fifthWeekend || 0
          }
        }
        setAllStats(agg)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  function getTotal(pathId) {
    const s = allStats[pathId] || {}
    return (s.HAC?.weekday || 0) + (s.HAC?.holiday || 0) + (s.HOBRA?.weekday || 0) + (s.HOBRA?.holiday || 0)
  }

  const normalPaths = pathologists
    .filter((p) => p.regime === 'normal')
    .filter((p) => !hideInactive || p.active !== false)
    .sort((a, b) => getTotal(b.id) - getTotal(a.id))

  const chartData = normalPaths.map((p) => {
    const s = allStats[p.id] || {}
    return {
      name: p.name.split(' ')[0],
      'HAC Seg-Qui': s.HAC?.weekday || 0,
      'HAC Feriados': s.HAC?.holiday || 0,
      'HOBRA Seg-Qui': s.HOBRA?.weekday || 0,
      'HOBRA Feriados': s.HOBRA?.holiday || 0,
    }
  })

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Estatísticas</h1>
          <p className="text-gray-500 text-sm">Contagem acumulada de plantões (regime Normal)</p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <span className="text-sm text-gray-600">Ocultar desligados</span>
          <button
            role="switch"
            aria-checked={hideInactive}
            onClick={() => setHideInactive((v) => !v)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              hideInactive ? 'bg-blue-600' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                hideInactive ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </label>
      </div>

      <div className="card">
        <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <BarChart2 size={18} className="text-blue-600" />
          Plantões por Patologista
        </h2>
        {normalPaths.length === 0 ? (
          <p className="text-gray-400 text-sm">Nenhum patologista de regime Normal encontrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 pr-4 font-semibold text-gray-700">Patologista</th>
                  <th className="text-center py-2 px-2 font-semibold text-gray-700">HAC<br/><span className="font-normal text-xs text-gray-500">Seg-Qui</span></th>
                  <th className="text-center py-2 px-2 font-semibold text-gray-700">HAC<br/><span className="font-normal text-xs text-gray-500">Feriados</span></th>
                  <th className="text-center py-2 px-2 font-semibold text-gray-700">HOBRA<br/><span className="font-normal text-xs text-gray-500">Seg-Qui</span></th>
                  <th className="text-center py-2 px-2 font-semibold text-gray-700">HOBRA<br/><span className="font-normal text-xs text-gray-500">Feriados</span></th>
                  <th className="text-center py-2 px-2 font-semibold text-amber-700">5º FDS</th>
                  <th className="text-center py-2 px-2 font-semibold text-blue-700">Total</th>
                </tr>
              </thead>
              <tbody>
                {normalPaths.map((p) => {
                  const s = allStats[p.id] || {}
                  const hacWd = s.HAC?.weekday || 0
                  const hacHol = s.HAC?.holiday || 0
                  const hobraWd = s.HOBRA?.weekday || 0
                  const hobraHol = s.HOBRA?.holiday || 0
                  const fifth = s.fifthWeekend || 0
                  const total = hacWd + hacHol + hobraWd + hobraHol
                  return (
                    <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 pr-4 text-gray-800">
                        {p.name}
                        {!p.active && <span className="ml-2 text-xs text-red-400">(desligado)</span>}
                      </td>
                      <td className="text-center py-2 px-2 text-gray-700">{hacWd}</td>
                      <td className="text-center py-2 px-2 text-gray-700">{hacHol}</td>
                      <td className="text-center py-2 px-2 text-gray-700">{hobraWd}</td>
                      <td className="text-center py-2 px-2 text-gray-700">{hobraHol}</td>
                      <td className="text-center py-2 px-2 text-amber-600 font-medium">{fifth || '—'}</td>
                      <td className="text-center py-2 px-2 font-bold text-blue-700">{total}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {normalPaths.length > 0 && (
        <div className="card">
          <h2 className="font-semibold text-gray-800 mb-6">Gráfico de Plantões</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="HAC Seg-Qui" fill="#3b82f6" />
              <Bar dataKey="HAC Feriados" fill="#93c5fd" />
              <Bar dataKey="HOBRA Seg-Qui" fill="#10b981" />
              <Bar dataKey="HOBRA Feriados" fill="#6ee7b7" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
