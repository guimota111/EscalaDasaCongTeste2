import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { doc, getDoc, collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { formatMonthYear } from '../utils/dateHelpers'
import { computeMonthStats, holidayDateSet } from '../utils/scheduleAlgorithm'
import MonthCalendar from '../components/MonthCalendar'
import BalanceTable from '../components/BalanceTable'
import ExportScheduleModal from '../components/ExportScheduleModal'
import { ArrowLeft, CalendarDays, TrendingUp, Image as ImageIcon } from 'lucide-react'

export default function ScheduleDetail() {
  const { yearMonth } = useParams()
  const [schedule, setSchedule] = useState(null)
  const [stats, setStats] = useState(null)
  const [pathMap, setPathMap] = useState({})
  const [holidayDates, setHolidayDates] = useState(() => new Set())
  const [loading, setLoading] = useState(true)
  const [showExport, setShowExport] = useState(false)

  useEffect(() => {
    async function load() {
      const [schedSnap, pathSnap, holSnap] = await Promise.all([
        getDoc(doc(db, 'schedules', yearMonth)),
        getDocs(collection(db, 'pathologists')),
        getDocs(collection(db, 'holidays')),
      ])

      const paths = pathSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
      const map = {}
      paths.forEach((p) => (map[p.id] = p))
      setPathMap(map)

      const holidays = holSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
      setHolidayDates(holidayDateSet(holidays))

      if (schedSnap.exists()) {
        const sched = schedSnap.data()
        setSchedule(sched)
        // Recalculado na hora: os feriados saem do balanceamento e os plantões
        // de feriado cadastrados manualmente entram.
        setStats(computeMonthStats(sched.days || {}, paths, holidays, yearMonth))
      }
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
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">
            {year && month ? formatMonthYear(year, month) : yearMonth}
          </h1>
          <p className="text-gray-500 text-sm">Escala publicada</p>
        </div>
        {schedule && (
          <button className="btn-primary" onClick={() => setShowExport(true)}>
            <ImageIcon size={16} />
            Exportar imagem
          </button>
        )}
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
              holidayDates={holidayDates}
            />
          </div>

          <div className="card">
            <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <TrendingUp size={18} className="text-blue-600" />
              Balanceamento
            </h2>
            <p className="text-xs text-gray-500 -mt-3 mb-4">
              Dias de feriado ficam fora do total; a coluna Feriados vem do cadastro manual.
            </p>
            <BalanceTable stats={stats || {}} pathMap={pathMap} />
          </div>
        </div>
      )}

      {showExport && schedule && (() => {
        const lastDom = new Date(year, month, 0).getDate()
        return (
          <ExportScheduleModal
            pathMap={pathMap}
            defaultStart={`${yearMonth}-01`}
            defaultEnd={`${yearMonth}-${String(lastDom).padStart(2, '0')}`}
            onClose={() => setShowExport(false)}
          />
        )
      })()}
    </div>
  )
}
