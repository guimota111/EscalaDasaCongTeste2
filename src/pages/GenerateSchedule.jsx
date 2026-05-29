import React, { useState, useEffect } from 'react'
import {
  doc, getDoc, getDocs, setDoc, collection, Timestamp
} from 'firebase/firestore'
import { db } from '../firebase'
import {
  scheduleKey, buildMonthDays, MONTH_NAMES, HOSPITALS, WEEKDAY_NAMES,
  formatMonthYear, hasFifthWeekend, getMonthWeekendGroups
} from '../utils/dateHelpers'
import { generateSchedule, computeStats } from '../utils/scheduleAlgorithm'
import BalanceBars from '../components/BalanceBars'
import { Wand2, Save, CheckCircle, AlertTriangle, Calendar } from 'lucide-react'

export default function GenerateSchedule() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const [pathologists, setPathologists] = useState([])
  const [holidays, setHolidays] = useState([])
  const [existingStats, setExistingStats] = useState({})
  const [prevWeekendAssignments, setPrevWeekendAssignments] = useState({})
  const [schedule, setSchedule] = useState(null)
  const [weekendAssignments, setWeekendAssignments] = useState({})
  const [liveStats, setLiveStats] = useState({})
  const [pathMap, setPathMap] = useState({})
  const [generating, setGenerating] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished] = useState(false)

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]

  useEffect(() => {
    async function load() {
      // Previous month for rotation reference
      const prevDate = new Date(year, month - 2, 1)
      const prevKey = scheduleKey(prevDate.getFullYear(), prevDate.getMonth() + 1)

      const [pathSnap, holSnap, statsSnap, prevSchedSnap] = await Promise.all([
        getDocs(collection(db, 'pathologists')),
        getDocs(collection(db, 'holidays')),
        getDocs(collection(db, 'statistics')),
        getDoc(doc(db, 'schedules', prevKey)),
      ])

      const paths = pathSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
      setPathologists(paths)
      const map = {}
      paths.forEach((p) => (map[p.id] = p))
      setPathMap(map)

      setHolidays(holSnap.docs.map((d) => ({ id: d.id, ...d.data() })))

      // Aggregate historical stats excluding current month
      const currentKey = scheduleKey(year, month)
      const agg = {}
      for (const sd of statsSnap.docs) {
        if (sd.id === currentKey) continue
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

      // Previous month weekend assignments for rotation
      if (prevSchedSnap.exists()) {
        setPrevWeekendAssignments(prevSchedSnap.data().weekendAssignments || {})
      } else {
        setPrevWeekendAssignments({})
      }
    }
    load()
  }, [year, month])

  useEffect(() => {
    if (!schedule) return
    const stats = computeStats(schedule, pathologists, holidays)
    setLiveStats(stats)
  }, [schedule, pathologists, holidays, weekendAssignments])

  function handleGenerate() {
    setGenerating(true)
    setPublished(false)
    try {
      const { schedule: sched, weekendAssignments: wa } = generateSchedule(
        year, month, pathologists, existingStats, holidays, prevWeekendAssignments
      )
      setSchedule(sched)
      setWeekendAssignments(wa)
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

  // When a weekend slot dropdown changes, fill all 3 days of that slot automatically
  function handleWeekendAssignmentChange(slot, hospital, pathId) {
    const weekendGroups = getMonthWeekendGroups(year, month)
    const slotDays = weekendGroups[slot] || []

    setWeekendAssignments((prev) => ({
      ...prev,
      [slot]: { ...(prev[slot] || {}), [hospital]: pathId || null },
    }))

    setSchedule((prev) => {
      const next = { ...prev }
      for (const { dateStr } of slotDays) {
        next[dateStr] = { ...(next[dateStr] || {}), [hospital]: pathId || null }
      }
      return next
    })
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
        weekendAssignments,
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
  const fifthWeekend = schedule ? hasFifthWeekend(year, month) : false

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
            <button
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
              onClick={handlePublish}
              disabled={publishing}
            >
              <Save size={16} />
              {publishing ? 'Publicando...' : 'Publicar Escala'}
            </button>
          )}
        </div>

        {published && (
          <div className="mt-3 flex items-center gap-2 text-green-700 bg-green-50 rounded-lg px-3 py-2 text-sm">
            <CheckCircle size={16} />
            Escala de {formatMonthYear(year, month)} publicada com sucesso!
          </div>
        )}

        {fifthWeekend && schedule && (
          <div className="mt-3 flex items-center gap-2 text-amber-700 bg-amber-50 rounded-lg px-3 py-2 text-sm">
            <AlertTriangle size={16} />
            Este mês tem <strong>5º final de semana</strong> — verifique a atribuição e ajuste se necessário.
          </div>
        )}
      </div>

      {schedule && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Editable schedule */}
          <div className="xl:col-span-2 card overflow-x-auto">
            <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Calendar size={16} className="text-blue-600" />
              {formatMonthYear(year, month)} — Editar Escala
            </h2>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-1 pr-2 font-semibold text-gray-600 w-8">Dia</th>
                  <th className="text-left py-1 pr-2 font-semibold text-gray-600 w-10">Sem.</th>
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

          {/* Live balance + weekend controls */}
          <div className="space-y-4">
            <div className="card">
              <h2 className="font-semibold text-gray-800 mb-4">Balanceamento ao Vivo</h2>
              <BalanceBars stats={liveStats} pathMap={pathMap} />
            </div>

            {Object.keys(weekendAssignments).length > 0 && (
              <div className="card">
                <h2 className="font-semibold text-gray-800 mb-3">Finais de Semana</h2>
                <p className="text-xs text-gray-500 mb-4">
                  Selecione o plantonista de cada hospital. Os 3 dias (Sex/Sáb/Dom) são preenchidos automaticamente.
                </p>
                <div className="space-y-4">
                  {Object.entries(weekendAssignments)
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([slotStr, wa]) => {
                      const slot = Number(slotStr)
                      return (
                        <div key={slot}>
                          <p className="text-xs font-semibold text-gray-600 mb-1.5">{slot}º Final de Semana</p>
                          <div className="grid grid-cols-2 gap-2">
                            {HOSPITALS.map((hospital) => (
                              <div key={hospital}>
                                <label className="text-[11px] font-medium text-gray-500 mb-0.5 block">
                                  <span className={hospital === 'HAC' ? 'text-blue-600' : 'text-emerald-600'}>
                                    {hospital}
                                  </span>
                                </label>
                                <select
                                  className="text-xs border border-gray-200 rounded px-2 py-1 bg-white w-full"
                                  value={wa[hospital] || ''}
                                  onChange={(e) =>
                                    handleWeekendAssignmentChange(slot, hospital, e.target.value)
                                  }
                                >
                                  <option value="">— vazio —</option>
                                  {activePaths.map((p) => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                  ))}
                                </select>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
