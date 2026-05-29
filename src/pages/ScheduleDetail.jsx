import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { doc, getDoc, collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { formatMonthYear } from '../utils/dateHelpers'
import MonthCalendar from '../components/MonthCalendar'
import BalanceTable from '../components/BalanceTable'
import { ArrowLeft, CalendarDays, TrendingUp } from 'lucide-react'

export default function ScheduleDetail() {
  const { yearMonth } = useParams()
  const [schedule, setSchedule] = useState(null)
  const [stats, setStats] = useState(null)
  const [pathMap, setPathMap] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [schedSnap, statsSnap, pathSnap] = await Promise.all([
        getDoc(doc(db, 'schedules', yearMonth)),
        getDoc(doc(db, 'statistics', yearMonth)),
        getDocs(collection(db, 'pathologists')),
      ])

      const map = {}
      pathSnap.docs.forEach((d) => (map[d.id] = d.data()))
      setPathMap(map)

      if (schedSnap.exists()) setSchedule(schedSnap.data())
      if (statsSnap.exists()) setStats(statsSnap.data().shifts)
      setLoading(false)
    }
    load()
  }, [yearMonth])

  const [year, month] = yearMonth ? yearMonth.split('-').map(Number) : [0, 0]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/escalas-anteriores" className="text-gray-400 hover:text-blue-600 transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {year && month ? formatMonthYear(year, month) : yearMonth}
          </h1>
          <p className="text-gray-500 text-sm">Escala publicada</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : !schedule ? (
        <div className="card text-center text-gray-400 py-10">Escala não encontrada.</div>
      ) : (
        <div className="space-y-6">
          <div className="card">
            <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <CalendarDays size={18} className="text-blue-600" />
              Calendário
            </h2>
            <MonthCalendar
              year={year}
              month={month}
              scheduleDays={schedule.days || {}}
              pathMap={pathMap}
            />
          </div>

          <div className="card">
            <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <TrendingUp size={18} className="text-blue-600" />
              Balanceamento
            </h2>
            <BalanceTable stats={stats || {}} pathMap={pathMap} />
          </div>
        </div>
      )}
    </div>
  )
}
