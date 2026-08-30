import React, { useState, useEffect } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import {
  computeStats, computeHolidayStats, mergeStatsMaps, balanceTotal
} from '../utils/scheduleAlgorithm'
import MonWedTable from '../components/MonWedTable'
import ReportModal from '../components/ReportModal'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { BarChart2, CalendarDays, FileBarChart, FileText } from 'lucide-react'

export default function Statistics() {
  const [pathologists, setPathologists] = useState([])
  const [allStats, setAllStats] = useState({})
  const [loading, setLoading] = useState(true)
  const [hideInactive, setHideInactive] = useState(true)
  const [hideFuture, setHideFuture] = useState(true)
  const [reportMode, setReportMode] = useState(null) // 'monthly' | 'annual' | null

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        // Recalcula a partir das escalas publicadas (não do cache em `statistics`),
        // para que a segmentação Seg/Qua apareça em todo o histórico sem republicar.
        const [pathSnap, schedSnap, holSnap] = await Promise.all([
          getDocs(collection(db, 'pathologists')),
          getDocs(collection(db, 'schedules')),
          getDocs(collection(db, 'holidays')),
        ])

        const paths = pathSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
        setPathologists(paths)

        const holidays = holSnap.docs.map((d) => ({ id: d.id, ...d.data() }))

        const now = new Date()
        const currentYear = now.getFullYear()
        const currentMonth = now.getMonth() + 1

        const inRange = (y, m) =>
          !hideFuture || !(y > currentYear || (y === currentYear && m > currentMonth))

        let agg = {}
        for (const sd of schedSnap.docs) {
          const data = sd.data()
          const days = data.days
          if (!days) continue
          // year/month do doc, com fallback para o id 'YYYY-MM'
          const [idY, idM] = sd.id.split('-').map(Number)
          const y = data.year ?? idY
          const m = data.month ?? idM
          if (!inRange(y, m)) continue

          agg = mergeStatsMaps(agg, computeStats(days, paths, holidays))
        }

        // Plantões de feriado: contabilidade manual, independente de haver
        // escala publicada no mês.
        agg = mergeStatsMaps(
          agg,
          computeHolidayStats(holidays, (dateStr) => {
            const [y, m] = dateStr.split('-').map(Number)
            return inRange(y, m)
          })
        )

        setAllStats(agg)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [hideFuture])

  // Total de balanceamento: feriados não entram (contabilidade manual).
  function getTotal(pathId) {
    return balanceTotal(allStats[pathId] || {})
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
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-primary" onClick={() => setReportMode('monthly')}>
            <FileBarChart size={16} />
            Exportar dados mensais
          </button>
          <button className="btn-primary" onClick={() => setReportMode('annual')}>
            <FileText size={16} />
            Exportar dados anuais
          </button>
        </div>
      </div>

      <div className="flex items-center justify-end flex-wrap gap-3">
        <div className="flex flex-wrap items-center gap-4">
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
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-sm text-gray-600">Ocultar meses futuros</span>
            <button
              role="switch"
              aria-checked={hideFuture}
              onClick={() => setHideFuture((v) => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                hideFuture ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  hideFuture ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </label>
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <BarChart2 size={18} className="text-blue-600" />
          Plantões por Patologista
        </h2>
        <p className="text-gray-500 text-xs mb-4">
          As colunas de feriado vêm do cadastro manual da aba Feriados e não entram no Total —
          dias marcados como feriado ficam fora do balanceamento.
        </p>
        {normalPaths.length === 0 ? (
          <p className="text-gray-400 text-sm">Nenhum patologista de regime Normal encontrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 pr-4 font-semibold text-gray-700">Patologista</th>
                  <th className="text-center py-2 px-2 font-semibold text-gray-700">HAC<br/><span className="font-normal text-xs text-gray-500">Seg-Qui</span></th>
                  <th className="text-center py-2 px-2 font-semibold text-gray-500">HAC<br/><span className="font-normal text-xs text-gray-400">Feriados</span></th>
                  <th className="text-center py-2 px-2 font-semibold text-gray-700">HOBRA<br/><span className="font-normal text-xs text-gray-500">Seg-Qui</span></th>
                  <th className="text-center py-2 px-2 font-semibold text-gray-500">HOBRA<br/><span className="font-normal text-xs text-gray-400">Feriados</span></th>
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
                  const total = hacWd + hobraWd
                  return (
                    <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 pr-4 text-gray-800">
                        {p.name}
                        {!p.active && <span className="ml-2 text-xs text-red-400">(desligado)</span>}
                      </td>
                      <td className="text-center py-2 px-2 text-gray-700">{hacWd}</td>
                      <td className="text-center py-2 px-2 text-gray-400">{hacHol}</td>
                      <td className="text-center py-2 px-2 text-gray-700">{hobraWd}</td>
                      <td className="text-center py-2 px-2 text-gray-400">{hobraHol}</td>
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

      <div className="card">
        <h2 className="font-semibold text-gray-800 mb-1 flex items-center gap-2">
          <CalendarDays size={18} className="text-blue-600" />
          Segundas e Quartas por Patologista
        </h2>
        <p className="text-gray-500 text-xs mb-4">
          Segmentação dos plantões Seg-Qui — quantas segundas e quartas cada um pegou, por hospital (não inclui feriados).
        </p>
        <MonWedTable stats={allStats} paths={normalPaths} />
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

      {reportMode && (
        <ReportModal mode={reportMode} onClose={() => setReportMode(null)} />
      )}
    </div>
  )
}
