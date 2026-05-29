import React from 'react'
import { buildMonthDays, WEEKDAY_NAMES, formatMonthYear } from '../utils/dateHelpers'

/**
 * Read-only calendar grid showing HAC/HOBRA assignments per day.
 * pathMap: { [pathId]: { name, color } }
 * scheduleDays: { [dateStr]: { HAC: pathId|null, HOBRA: pathId|null } }
 */
export default function MonthCalendar({ year, month, scheduleDays = {}, pathMap = {}, compact = false }) {
  const days = buildMonthDays(year, month)
  const firstDow = days[0].dow // 0=Sun

  // Color palette for pathologists
  const COLORS = [
    'bg-blue-100 text-blue-800',
    'bg-green-100 text-green-800',
    'bg-purple-100 text-purple-800',
    'bg-orange-100 text-orange-800',
    'bg-pink-100 text-pink-800',
    'bg-teal-100 text-teal-800',
    'bg-yellow-100 text-yellow-800',
    'bg-red-100 text-red-800',
    'bg-indigo-100 text-indigo-800',
    'bg-cyan-100 text-cyan-800',
  ]

  const pathColorMap = {}
  let colorIdx = 0
  for (const id of Object.keys(pathMap)) {
    pathColorMap[id] = COLORS[colorIdx % COLORS.length]
    colorIdx++
  }

  function getName(pathId) {
    if (!pathId) return null
    const p = pathMap[pathId]
    return p ? p.name : '?'
  }

  function getShortName(pathId) {
    const name = getName(pathId)
    if (!name) return null
    const parts = name.trim().split(' ')
    return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0]
  }

  const emptyCells = firstDow // cells before day 1

  return (
    <div>
      {/* Day of week headers */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAY_NAMES.map((d) => (
          <div key={d} className="text-center text-xs font-semibold text-gray-500 py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {/* Empty leading cells */}
        {Array.from({ length: emptyCells }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}

        {days.map(({ dateStr, day, dow, isWeekend }) => {
          const slot = scheduleDays[dateStr] || {}
          const hacId = slot.HAC
          const hobraId = slot.HOBRA

          return (
            <div
              key={dateStr}
              className={`rounded-lg border ${isWeekend ? 'bg-blue-50 border-blue-100' : 'bg-white border-gray-100'} ${compact ? 'p-1 min-h-[52px]' : 'p-1.5 min-h-[70px]'}`}
            >
              <div className={`text-right font-semibold mb-1 ${isWeekend ? 'text-blue-700' : 'text-gray-700'} ${compact ? 'text-xs' : 'text-sm'}`}>
                {day}
              </div>
              <div className="space-y-0.5">
                {hacId && (
                  <div className={`rounded px-1 py-0.5 text-xs truncate ${pathColorMap[hacId] || 'bg-gray-100 text-gray-700'}`}>
                    <span className="font-semibold">H</span> {getShortName(hacId)}
                  </div>
                )}
                {hobraId && (
                  <div className={`rounded px-1 py-0.5 text-xs truncate ${pathColorMap[hobraId] || 'bg-gray-100 text-gray-700'}`}>
                    <span className="font-semibold">B</span> {getShortName(hobraId)}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="text-xs text-gray-500 font-medium">Legenda:</span>
        <span className="text-xs text-gray-500"><span className="font-semibold">H</span> = HAC</span>
        <span className="text-xs text-gray-500"><span className="font-semibold">B</span> = HOBRA</span>
        {Object.entries(pathMap).map(([id, p]) => (
          <span key={id} className={`text-xs px-2 py-0.5 rounded ${pathColorMap[id]}`}>
            {p.name}
          </span>
        ))}
      </div>
    </div>
  )
}
