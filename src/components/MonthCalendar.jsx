import React, { useState } from 'react'
import { buildMonthDays } from '../utils/dateHelpers'
import { pathColor, getContrastText } from '../utils/colors'
import { X } from 'lucide-react'

// Cor do anel ao editar, por hospital (o fundo do card usa a cor do patologista)
const RING = { HAC: 'ring-blue-400', HOBRA: 'ring-emerald-400' }

const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export default function MonthCalendar({
  year, month, scheduleDays = {}, pathMap = {}, onEdit,
}) {
  const days = buildMonthDays(year, month)
  const firstDow = days[0].dow
  const editable = !!onEdit

  const [editing, setEditing] = useState(null)

  function getShortName(pathId) {
    if (!pathId) return null
    const name = pathMap[pathId]?.name
    if (!name) return '?'
    const parts = name.trim().split(' ')
    return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0]
  }

  function getFullName(pathId) {
    return pathMap[pathId]?.name || null
  }

  function handlePickPath(pathId) {
    if (!editing) return
    onEdit(editing.dateStr, editing.hospital, pathId || null)
    setEditing(null)
  }

  const sortedPaths = Object.entries(pathMap).sort((a, b) =>
    a[1].name.localeCompare(b[1].name)
  )

  const editDropdown = editing && (
    <div className="fixed inset-0 z-40" onClick={() => setEditing(null)}>
      <div
        className="absolute z-50 bg-white rounded-xl shadow-xl border border-gray-200 py-2 w-52"
        style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3 pb-1.5 border-b border-gray-100">
          <span className="text-xs font-semibold text-gray-700">
            {editing.hospital} — dia {editing.dateStr.slice(8)}
          </span>
          <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600">
            <X size={14} />
          </button>
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          <button
            onClick={() => handlePickPath(null)}
            className="w-full text-left px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
          >
            — Nenhum —
          </button>
          {sortedPaths.map(([id, p]) => (
            <button
              key={id}
              onClick={() => handlePickPath(id)}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-blue-50 hover:text-blue-800"
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )

  const legend = (
    <div className="mt-3 flex gap-2 items-center flex-wrap">
      <span className="text-xs text-gray-400 font-medium">Cada cor representa um patologista.</span>
      <span className="text-xs text-gray-400">Cada card indica o hospital:</span>
      <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">HAC</span>
      <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">HOBRA</span>
    </div>
  )

  return (
    <div className="relative">
      {/* ── Desktop grid (hidden on mobile) ── */}
      <div className="hidden md:block">
        <div className="grid grid-cols-7 mb-1">
          {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => (
            <div key={d} className="text-center text-xs font-semibold text-gray-500 py-1">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: (firstDow + 6) % 7 }).map((_, i) => <div key={`e-${i}`} />)}

          {days.map(({ dateStr, day, isWeekend }) => {
            const slot = scheduleDays[dateStr] || {}
            return (
              <div
                key={dateStr}
                className={`rounded-lg border p-1 min-h-[90px] ${
                  isWeekend ? 'bg-blue-50 border-blue-100' : 'bg-white border-gray-100'
                }`}
              >
                <div className={`text-right font-bold text-sm mb-1.5 ${
                  isWeekend ? 'text-blue-700' : 'text-gray-600'
                }`}>
                  {day}
                </div>
                {(['HAC', 'HOBRA']).map((hospital) => {
                  const pathId = slot[hospital]
                  const isEditingThis = editing?.dateStr === dateStr && editing?.hospital === hospital
                  const bg = pathId ? pathColor(pathMap[pathId]) : null
                  const fg = bg ? getContrastText(bg) : null
                  return (
                    <div key={hospital} className="mb-0.5">
                      {editable ? (
                        <button
                          onClick={() => setEditing(isEditingThis ? null : { dateStr, hospital })}
                          style={pathId ? { backgroundColor: bg, color: fg } : undefined}
                          className={`w-full text-left rounded px-1 py-0.5 text-xs truncate transition-colors ${
                            isEditingThis
                              ? `ring-2 ${RING[hospital]} ${pathId ? '' : 'bg-gray-50'}`
                              : pathId
                              ? 'hover:opacity-80'
                              : 'bg-gray-50 text-gray-400 border border-dashed border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <span className="font-semibold text-[10px] opacity-60">{hospital} </span>
                          {pathId ? getShortName(pathId) : '—'}
                        </button>
                      ) : (
                        <div
                          style={pathId ? { backgroundColor: bg, color: fg } : undefined}
                          className={`rounded px-1 py-0.5 text-xs truncate ${pathId ? '' : 'text-gray-300'}`}
                        >
                          {pathId ? (
                            <><span className="font-semibold opacity-60">{hospital} </span>{getShortName(pathId)}</>
                          ) : (
                            <span className="font-semibold text-[10px] opacity-40">{hospital}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        {legend}
      </div>

      {/* ── Mobile list (hidden on desktop) ── */}
      <div className="md:hidden divide-y divide-gray-100">
        {days.map(({ dateStr, day, dow, isWeekend }) => {
          const slot = scheduleDays[dateStr] || {}
          const hacId = slot.HAC
          const hobraId = slot.HOBRA
          const hasAny = hacId || hobraId

          return (
            <div
              key={dateStr}
              className={`flex items-start gap-3 py-2 px-1 ${
                isWeekend ? 'bg-blue-50' : ''
              }`}
            >
              {/* Date badge */}
              <div className="flex-shrink-0 w-10 text-center">
                <div className="text-[10px] font-medium text-gray-400 uppercase leading-none mb-0.5">
                  {WEEKDAY_SHORT[dow]}
                </div>
                <div className={`text-lg font-bold leading-none ${
                  isWeekend ? 'text-blue-700' : 'text-gray-700'
                }`}>
                  {day}
                </div>
              </div>

              {/* Assignments */}
              <div className="flex-1 flex flex-col gap-1 pt-0.5">
                {(['HAC', 'HOBRA']).map((hospital) => {
                  const pathId = slot[hospital]
                  const isEditingThis = editing?.dateStr === dateStr && editing?.hospital === hospital
                  const bg = pathId ? pathColor(pathMap[pathId]) : null
                  const fg = bg ? getContrastText(bg) : null
                  return editable ? (
                    <button
                      key={hospital}
                      onClick={() => setEditing(isEditingThis ? null : { dateStr, hospital })}
                      style={pathId ? { backgroundColor: bg, color: fg } : undefined}
                      className={`text-left rounded px-2 py-1 text-sm transition-colors ${
                        isEditingThis
                          ? `ring-2 ${RING[hospital]} ${pathId ? '' : 'bg-gray-50'}`
                          : pathId
                          ? 'hover:opacity-80'
                          : 'bg-gray-50 text-gray-400 border border-dashed border-gray-200'
                      }`}
                    >
                      <span className="font-semibold text-xs opacity-60 mr-1">{hospital}</span>
                      {pathId ? getFullName(pathId) : '—'}
                    </button>
                  ) : (
                    <div
                      key={hospital}
                      style={pathId ? { backgroundColor: bg, color: fg } : undefined}
                      className={`rounded px-2 py-1 text-sm ${pathId ? '' : 'text-gray-300'}`}
                    >
                      {pathId ? (
                        <><span className="font-semibold text-xs mr-1 opacity-60">{hospital}</span>{getFullName(pathId)}</>
                      ) : (
                        <span className="text-xs opacity-40">{hospital} —</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {legend}
      </div>

      {editDropdown}
    </div>
  )
}
