import React, { useState, useEffect } from 'react'
import { doc, getDoc, setDoc, getDocs, collection, Timestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { scheduleKey, formatMonthYear, MONTH_NAMES } from '../utils/dateHelpers'
import { computeStats } from '../utils/scheduleAlgorithm'
import MonthCalendar from '../components/MonthCalendar'
import BalanceTable from '../components/BalanceTable'
import { CalendarDays, TrendingUp, Edit2, Save, X } from 'lucide-react'

export default function Dashboard() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [schedule, setSchedule] = useState(null)
  const [stats, setStats] = useState(null)
  const [pathMap, setPathMap] = useState({})
  const [holidays, setHolidays] = useState([])
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editedDays, setEditedDays] = useState(null) // local edits before save

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]

  useEffect(() => {
    setEditMode(false)
    setEditedDays(null)
    async function load() {
      setLoading(true)
      try {
        const [schedSnap, pathSnap, holSnap] = await Promise.all([
          getDoc(doc(db, 'schedules', scheduleKey(year, month))),
          getDocs(collection(db, 'pathologists')),
          getDocs(collection(db, 'holidays')),
        ])
        const map = {}
        pathSnap.docs.forEach((d) => (map[d.id] = d.data()))
        setPathMap(map)
        setHolidays(holSnap.docs.map((d) => ({ id: d.id, ...d.data() })))

        if (schedSnap.exists()) {
          const sched = schedSnap.data()
          setSchedule(sched)
          const statsSnap = await getDoc(doc(db, 'statistics', scheduleKey(year, month)))
          setStats(statsSnap.exists() ? statsSnap.data().shifts : {})
        } else {
          setSchedule(null)
          setStats(null)
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [year, month])

  function handleEdit(dateStr, hospital, pathId) {
    setEditedDays((prev) => {
      const base = prev || schedule?.days || {}
      return {
        ...base,
        [dateStr]: { ...base[dateStr], [hospital]: pathId },
      }
    })
  }

  async function handleSave() {
    if (!editedDays || !schedule) return
    setSaving(true)
    try {
      const key = scheduleKey(year, month)
      const pathsSnap = await getDocs(collection(db, 'pathologists'))
      const paths = pathsSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
      const newStats = computeStats(editedDays, paths, holidays, schedule.weekendAssignments)

      await setDoc(doc(db, 'schedules', key), {
        ...schedule,
        days: editedDays,
        updatedAt: Timestamp.now(),
      })
      await setDoc(doc(db, 'statistics', key), {
        year,
        month,
        shifts: newStats,
      })

      setSchedule((prev) => ({ ...prev, days: editedDays }))
      setStats(newStats)
      setEditMode(false)
      setEditedDays(null)
    } finally {
      setSaving(false)
    }
  }

  function handleCancelEdit() {
    setEditMode(false)
    setEditedDays(null)
  }

  const displayDays = editedDays || schedule?.days || {}

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm">Escala do mês e balanceamento</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="input w-auto" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select className="input w-auto" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : !schedule ? (
        <div className="card flex flex-col items-center py-16 text-center">
          <CalendarDays size={48} className="text-gray-300 mb-4" />
          <h2 className="text-lg font-semibold text-gray-600">Nenhuma escala publicada</h2>
          <p className="text-gray-400 text-sm mt-1">
            Gere e publique a escala de {formatMonthYear(year, month)} na página "Gerar Escala".
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Calendar */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <CalendarDays size={20} className="text-blue-600" />
                {formatMonthYear(year, month)}
              </h2>
              {!editMode ? (
                <button
                  className="btn-secondary text-xs"
                  onClick={() => setEditMode(true)}
                >
                  <Edit2 size={14} />
                  Editar Escala
                </button>
              ) : (
                <div className="flex gap-2">
                  <button className="btn-secondary text-xs" onClick={handleCancelEdit}>
                    <X size={14} />
                    Cancelar
                  </button>
                  <button
                    className="btn-primary text-xs"
                    onClick={handleSave}
                    disabled={saving || !editedDays}
                  >
                    <Save size={14} />
                    {saving ? 'Salvando...' : 'Salvar Alterações'}
                  </button>
                </div>
              )}
            </div>

            {editMode && (
              <p className="text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2 mb-4">
                Clique em qualquer célula do calendário para alterar o patologista.
              </p>
            )}

            <MonthCalendar
              year={year}
              month={month}
              scheduleDays={displayDays}
              pathMap={pathMap}
              onEdit={editMode ? handleEdit : undefined}
            />
          </div>

          {/* Balance */}
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <TrendingUp size={20} className="text-blue-600" />
              Balanceamento do Mês
            </h2>
            <BalanceTable stats={stats || {}} pathMap={pathMap} />
          </div>
        </div>
      )}
    </div>
  )
}
