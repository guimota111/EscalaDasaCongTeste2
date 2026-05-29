import React, { useState, useEffect } from 'react'
import { doc, getDoc, collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { scheduleKey, formatMonthYear, MONTH_NAMES } from '../utils/dateHelpers'
import MonthCalendar from '../components/MonthCalendar'
import BalanceTable from '../components/BalanceTable'
import { CalendarDays, TrendingUp } from 'lucide-react'

export default function Dashboard() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [schedule, setSchedule] = useState(null)
  const [stats, setStats] = useState(null)
  const [pathMap, setPathMap] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [schedSnap, pathSnap] = await Promise.all([
          getDoc(doc(db, 'schedules', scheduleKey(year, month))),
          getDocs(collection(db, 'pathologists')),
        ])

        const map = {}
        pathSnap.docs.forEach((d) => (map[d.id] = d.data()))
        setPathMap(map)

        if (schedSnap.exists()) {
          setSchedule(schedSnap.data())
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

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm">Escala do mês e balanceamento</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="input w-auto"
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {MONTH_NAMES.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            className="input w-auto"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
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
            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <CalendarDays size={20} className="text-blue-600" />
              {formatMonthYear(year, month)}
            </h2>
            <MonthCalendar
              year={year}
              month={month}
              scheduleDays={schedule.days || {}}
              pathMap={pathMap}
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
