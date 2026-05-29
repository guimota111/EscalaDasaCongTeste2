import React, { useState, useEffect, useCallback } from 'react'
import {
  doc, getDoc, getDocs, setDoc, collection, Timestamp
} from 'firebase/firestore'
import { db } from '../firebase'
import {
  scheduleKey, buildMonthDays, MONTH_NAMES, HOSPITALS, WEEKDAY_NAMES, formatMonthYear
} from '../utils/dateHelpers'
import { generateSchedule, computeStats } from '../utils/scheduleAlgorithm'
import BalanceTable from '../components/BalanceTable'
import { Wand2, Save, AlertCircle } from 'lucide-react'

export default function GenerateSchedule() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const [pathologists, setPathologists] = useState([])
  const [holidays, setHolidays] = useState([])
  const [existingStats, setExistingStats] = useState({})
  const [schedule, setSchedule] = useState(null) // { [dateStr]: { HAC, HOBRA } }
  const [liveStats, setLiveStats] = useState({})
  const [pathMap, setPathMap] = useState({})
  const [generating, setGenerating] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished] = useState(false)

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]

  useEffect(() => {
    async function load() {
      const [pathSnap, holSnap, statsSnap] = await Promise.all([
        getDocs(collection(db, 'pathologists')),
        getDocs(collection(db, 'holidays')),
        getDocs(collection(db, 'statistics')),
      ])

      const paths = pathSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
      setPathologists(paths)

      const map = {}
      paths.forEach((p) => (map[p.id] = p))
      setPathMap(map)

      setHolidays(holSnap.docs.map((d) => ({ id: d.id, ...d.data() })))

      // Aggregate all historical stats (excluding current month to regenerate)
      const agg = {}
      for (const sd of statsSnap.docs) {
        if (sd.id === scheduleKey(year, month)) continue
        const shifts = sd.data().shifts || {}
        for (const [pathId, data] of Object.entries(shifts)) {
          if (!agg[pathId]) agg[pathId] = { HAC: { weekday: 0, holiday: 0 }, HOBRA: { weekday: 0, holiday: 0 } }
          for (const h of HOSPITALS) {
            agg[pathId][h].weekday += data[h]?.weekday || 0
            agg[pathId][h].holiday += data[h]?.holiday || 0
          }
        }
      }
      setExistingStats(agg)
    }
    load()
  }, [year, month])

  // Recalculate live stats when schedule changes
  useEffect(() => {
    if (!schedule) return
    const stats = computeStats(schedule, pathologists, holidays)
    setLiveStats(stats)
  }, [schedule, pathologists, holidays])

  function handleGenerate() {
    setGenerating(true)
    setPublished(false)
    try {
      const result = generateSchedule(year, month, pathologists, existingStats, holidays)
      setSchedule(result)
    } finally {
      setGenerating(false)
    }
  }

  function handleCellChange(dateStr, hospital, pathId) {
    setSchedule((prev) => ({
      ...prev,
      [dateStr]: { ...prev[dateStr], [hospital]: pathId || null },
    }))
  }

  async function handlePublish() {
    if (!schedule) return
    setPublishing(true)
    try {
      const key = scheduleKey(year, month)
      const stats = computeStats(schedule, pathologists, holidays)

      await setDoc(doc(db, 'schedules', key), {
        year,
        month,
        publishedAt: Timestamp.now(),
        days: schedule,
      })

      await setDoc(doc(db, 'statistics', key), {
        year,
        month,
        shifts: stats,
      })

      setPublished(true)
    } finally {
      setPublishing(false)
    }
  }

  const days = buildMonthDays(year, month)
  const activePaths = pathologists.filter((p) => p.active !== false)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Gerar Escala</h1>
        <p className="text-gray-500 text-sm">Gere e publique a escala mensal</p>
      </div>

      {/* Controls */}
      <div className="card">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Mês</label>
            <select className="input w-auto" value={month} onChange={(e) => { setMonth(Number(e.target.value)); setSchedule(null); setPublished(false) }}>
              {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Ano</label>
            <select className="input w-auto" value={year} onChange={(e) => { setYear(Number(e.target.value)); setSchedule(null); setPublished(false) }}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button className="btn-primary" onClick={handleGenerate} disabled={generating}>
            <Wand2 size={16} />
            {generating ? 'Gerando...' : 'Gerar Escala'}
          </button>
          {schedule && (
            <button className="btn-primary bg-green-600 hover:bg-green-700" onClick={handlePublish} disabled={publishing}>
              <Save size={16} />
              {publishing ? 'Publicando...' : 'Publicar Escala'}
            </button>
          )}
        </div>
        {published && (
          <div className="mt-3 flex items-center gap-2 text-green-700 bg-green-50 rounded-lg px-3 py-2 text-sm">
            <AlertCircle size={16} />
            Escala de {formatMonthYear(year, month)} publicada com sucesso!
          </div>
        )}
      </div>

      {schedule && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Editable schedule grid */}
          <div className="xl:col-span-2 card overflow-x-auto">
            <h2 className="font-semibold text-gray-800 mb-4">{formatMonthYear(year, month)} — Escala Editável</h2>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-1 pr-2 font-semibold text-gray-600">Dia</th>
                  <th className="text-left py-1 pr-2 font-semibold text-gray-600">Sem.</th>
                  {HOSPITALS.map((h) => (
                    <th key={h} className="text-left py-1 font-semibold text-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map(({ dateStr, day, dow, isWeekend }) => {
                  const slot = schedule[dateStr] || {}
                  return (
                    <tr
                      key={dateStr}
                      className={`border-b border-gray-100 ${isWeekend ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                    >
                      <td className="py-1 pr-2 font-medium text-gray-700">{day}</td>
                      <td className="py-1 pr-2 text-gray-500">{WEEKDAY_NAMES[dow]}</td>
                      {HOSPITALS.map((h) => (
                        <td key={h} className="py-0.5 pr-2">
                          <select
                            className="text-xs border border-gray-200 rounded px-1 py-0.5 bg-white w-full max-w-[160px]"
                            value={slot[h] || ''}
                            onChange={(e) => handleCellChange(dateStr, h, e.target.value)}
                          >
                            <option value="">— vazio —</option>
                            {activePaths.map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Live balance */}
          <div className="card">
            <h2 className="font-semibold text-gray-800 mb-4">Balanceamento ao Vivo</h2>
            <BalanceTable stats={liveStats} pathMap={pathMap} />
          </div>
        </div>
      )}
    </div>
  )
}
