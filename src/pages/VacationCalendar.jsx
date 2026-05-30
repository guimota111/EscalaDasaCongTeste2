import React, { useState, useEffect } from 'react'
import { getDocs, collection } from 'firebase/firestore'
import { db } from '../firebase'
import { buildMonthDays, MONTH_NAMES, WEEKDAY_NAMES, isOnVacation } from '../utils/dateHelpers'
import { Palmtree } from 'lucide-react'

const PALETTE = [
  'bg-blue-400',
  'bg-emerald-400',
  'bg-purple-400',
  'bg-orange-400',
  'bg-pink-400',
  'bg-teal-400',
  'bg-yellow-400',
  'bg-red-400',
  'bg-indigo-400',
  'bg-cyan-400',
  'bg-lime-400',
  'bg-rose-400',
]

export default function VacationCalendar() {
  const [pathologists, setPathologists] = useState([])
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(new Date().getFullYear())

  useEffect(() => {
    async function load() {
      setLoading(true)
      const snap = await getDocs(collection(db, 'pathologists'))
      setPathologists(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }
    load()
  }, [])

  // Assign a stable color to each pathologist
  const colorMap = {}
  pathologists
    .filter((p) => p.vacations?.length)
    .forEach((p, i) => {
      colorMap[p.id] = PALETTE[i % PALETTE.length]
    })

  // Pathologists that have at least one vacation ever (for legend)
  const pathsWithVacation = pathologists.filter((p) => p.vacations?.length)

  // For a given dateStr, return the list of pathologist ids on vacation
  function whoIsOnVacation(dateStr) {
    return pathologists.filter((p) => isOnVacation(p, dateStr)).map((p) => p.id)
  }

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Férias</h1>
          <p className="text-gray-500 text-sm">Visão anual dos períodos de férias</p>
        </div>
        <select
          className="input w-auto"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
        >
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Legend */}
      {pathsWithVacation.length > 0 && (
        <div className="card py-3">
          <div className="flex flex-wrap gap-3 items-center">
            <span className="text-xs font-semibold text-gray-500 uppercase">Legenda</span>
            {pathologists.map((p) => {
              if (!p.vacations?.length) return null
              return (
                <span key={p.id} className="flex items-center gap-1.5 text-xs text-gray-700">
                  <span className={`inline-block w-3 h-3 rounded-sm ${colorMap[p.id]}`} />
                  {p.name}
                  {!p.active && <span className="text-red-400">(desligado)</span>}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : pathsWithVacation.length === 0 ? (
        <div className="card flex flex-col items-center py-16 text-center">
          <Palmtree size={40} className="text-gray-300 mb-3" />
          <p className="text-gray-500">Nenhuma férias cadastrada ainda.</p>
          <p className="text-gray-400 text-sm mt-1">Adicione férias na página Patologistas.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {MONTH_NAMES.map((monthName, mi) => {
            const month = mi + 1
            const days = buildMonthDays(year, month)
            const firstDow = days[0].dow

            return (
              <div key={month} className="card p-3">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">{monthName}</h3>

                {/* Day-of-week headers */}
                <div className="grid grid-cols-7 mb-1">
                  {WEEKDAY_NAMES.map((d) => (
                    <div key={d} className="text-center text-[9px] font-medium text-gray-400">
                      {d[0]}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-0.5">
                  {/* Leading empty cells */}
                  {Array.from({ length: firstDow }).map((_, i) => (
                    <div key={`e-${i}`} />
                  ))}

                  {days.map(({ dateStr, day, isWeekend }) => {
                    const onVac = whoIsOnVacation(dateStr)
                    const hasVac = onVac.length > 0
                    const multipleVac = onVac.length > 1
                    const color = hasVac ? colorMap[onVac[0]] : null

                    return (
                      <div
                        key={dateStr}
                        title={
                          hasVac
                            ? onVac
                                .map((id) => pathologists.find((p) => p.id === id)?.name)
                                .filter(Boolean)
                                .join(', ')
                            : undefined
                        }
                        className={`
                          relative flex items-center justify-center rounded
                          h-6 text-[10px] font-medium select-none
                          ${hasVac
                            ? `${color} text-white`
                            : isWeekend
                            ? 'bg-gray-100 text-gray-400'
                            : 'bg-gray-50 text-gray-400'}
                        `}
                      >
                        {day}
                        {multipleVac && (
                          <span className="absolute top-0 right-0 w-1.5 h-1.5 rounded-full bg-white opacity-80" />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
