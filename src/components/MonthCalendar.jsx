import React, { useState } from 'react'
import { buildMonthDays, MONTH_NAMES } from '../utils/dateHelpers'
import { findDoubleBookedDates } from '../utils/scheduleAlgorithm'
import { pathColor, getContrastText } from '../utils/colors'
import { X, AlertTriangle, Ban } from 'lucide-react'

// Cor do anel ao editar, por hospital (o fundo do card usa a cor do patologista)
const RING = { HAC: 'ring-blue-400', HOBRA: 'ring-emerald-400' }

const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const HOSPITAL_LIST = ['HAC', 'HOBRA']

/** Metadados dos dias extras (do mês seguinte) adicionados na antecipação. */
function buildExtraDays(extraDates = []) {
  return [...extraDates].sort().map((dateStr) => {
    const [y, m, d] = dateStr.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    const dow = date.getDay()
    return {
      dateStr,
      day: d,
      dow,
      month: m,
      isWeekend: dow === 0 || dow === 5 || dow === 6,
      isExtra: true,
    }
  })
}

export default function MonthCalendar({
  year, month, scheduleDays = {}, pathMap = {}, onEdit,
  // Dias do mês seguinte já divididos por antecipação
  extraDates = [], onRemoveExtraDay,
  // Dias deste mês que vieram pré-divididos do mês anterior
  prefilledDates,
  // (pathId, dateStr) => motivo do bloqueio | null
  unavailableReason,
  // { [pathId]: n } — contagem exibida ao lado de cada nome no seletor
  pathCounts,
  // Set de 'YYYY-MM-DD' marcados como feriado (fora do balanceamento)
  holidayDates,
}) {
  const monthDays = buildMonthDays(year, month)
  const extraDays = buildExtraDays(extraDates)
  const allDays = [...monthDays, ...extraDays]
  const firstDow = monthDays[0].dow
  const editable = !!onEdit

  const [editing, setEditing] = useState(null)

  const conflictDates = findDoubleBookedDates(scheduleDays)

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

  const sortedPaths = Object.entries(pathMap)
    .filter(([, p]) => p.active !== false)
    .sort((a, b) => a[1].name.localeCompare(b[1].name))

  const editDropdown = editing && (
    <div className="fixed inset-0 z-40" onClick={() => setEditing(null)}>
      <div
        className="absolute z-50 bg-white rounded-xl shadow-xl border border-gray-200 py-2 w-64"
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
          {sortedPaths.map(([id, p]) => {
            const reason = unavailableReason?.(id, editing.dateStr) || null
            const count = pathCounts?.[id]
            return (
              <button
                key={id}
                onClick={() => !reason && handlePickPath(id)}
                disabled={!!reason}
                title={reason || ''}
                className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between gap-2 ${
                  reason
                    ? 'text-gray-300 cursor-not-allowed'
                    : 'text-gray-700 hover:bg-blue-50 hover:text-blue-800'
                }`}
              >
                <span className="truncate flex items-center gap-1.5">
                  {reason && <Ban size={11} className="flex-shrink-0" />}
                  {p.name}
                </span>
                {reason ? (
                  <span className="text-[10px] flex-shrink-0">{reason}</span>
                ) : count !== undefined ? (
                  <span className="text-[10px] font-semibold text-gray-400 flex-shrink-0">{count}</span>
                ) : null}
              </button>
            )
          })}
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
      {holidayDates?.size > 0 && (
        <span className="text-xs px-2 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">
          Feriado — fora do balanceamento
        </span>
      )}
      {conflictDates.size > 0 && (
        <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700 font-medium flex items-center gap-1">
          <AlertTriangle size={11} />
          Mesma pessoa nos dois hospitais
        </span>
      )}
    </div>
  )

  /** Um card de dia do grid (desktop). */
  function DayCell({ dateStr, day, month: extraMonth, isWeekend, isExtra }) {
    const slot = scheduleDays[dateStr] || {}
    const conflict = conflictDates.has(dateStr)
    const prefilled = prefilledDates?.has(dateStr)
    const isHoliday = holidayDates?.has(dateStr)

    const base = conflict
      ? 'bg-red-50 border-red-400 ring-1 ring-red-300'
      : isHoliday
      ? 'bg-purple-50 border-purple-200'
      : isExtra
      ? 'bg-amber-50/70 border-amber-200 border-dashed'
      : isWeekend
      ? 'bg-blue-50 border-blue-100'
      : 'bg-white border-gray-100'

    return (
      <div className={`rounded-lg border p-1 min-h-[90px] ${base}`}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="flex items-center gap-1">
            {conflict && (
              <AlertTriangle
                size={13}
                className="text-red-600"
                title="Mesma pessoa escalada nos dois hospitais neste dia"
              />
            )}
            {prefilled && (
              <span title="Pré-dividido no mês anterior" className="text-amber-500 text-xs leading-none">↩</span>
            )}
            {isHoliday && (
              <span
                title="Feriado — não conta no balanceamento (contabilidade manual na aba Feriados)"
                className="text-[9px] font-bold uppercase text-purple-700 bg-purple-100 rounded px-1 leading-tight"
              >
                Fer
              </span>
            )}
            {isExtra && onRemoveExtraDay && (
              <button
                onClick={() => onRemoveExtraDay(dateStr)}
                title="Remover este dia"
                className="text-amber-400 hover:text-red-500"
              >
                <X size={12} />
              </button>
            )}
          </span>
          <span className={`font-bold text-sm ${
            conflict ? 'text-red-700' : isExtra ? 'text-amber-700' : isWeekend ? 'text-blue-700' : 'text-gray-600'
          }`}>
            {isExtra ? `${day}/${MONTH_NAMES[extraMonth - 1].slice(0, 3)}` : day}
          </span>
        </div>

        {HOSPITAL_LIST.map((hospital) => {
          const pathId = slot[hospital]
          const isEditingThis = editing?.dateStr === dateStr && editing?.hospital === hospital
          const bg = pathId ? pathColor(pathMap[pathId]) : null
          const fg = bg ? getContrastText(bg) : null
          const blocked = pathId ? unavailableReason?.(pathId, dateStr) : null
          return (
            <div key={hospital} className="mb-0.5">
              {editable ? (
                <button
                  onClick={() => setEditing(isEditingThis ? null : { dateStr, hospital })}
                  style={pathId ? { backgroundColor: bg, color: fg } : undefined}
                  title={blocked ? `${blocked} — escalado mesmo assim` : ''}
                  className={`w-full text-left rounded px-1 py-0.5 text-xs truncate transition-colors ${
                    isEditingThis
                      ? `ring-2 ${RING[hospital]} ${pathId ? '' : 'bg-gray-50'}`
                      : pathId
                      ? `hover:opacity-80 ${blocked ? 'ring-1 ring-red-500' : ''}`
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
  }

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
          {allDays.map((d) => <DayCell key={d.dateStr} {...d} />)}
        </div>

        {legend}
      </div>

      {/* ── Mobile list (hidden on desktop) ── */}
      <div className="md:hidden divide-y divide-gray-100">
        {allDays.map(({ dateStr, day, dow, isWeekend, isExtra, month: extraMonth }) => {
          const slot = scheduleDays[dateStr] || {}
          const conflict = conflictDates.has(dateStr)
          const isHoliday = holidayDates?.has(dateStr)

          return (
            <div
              key={dateStr}
              className={`flex items-start gap-3 py-2 px-1 ${
                conflict ? 'bg-red-50'
                  : isHoliday ? 'bg-purple-50'
                  : isExtra ? 'bg-amber-50/70'
                  : isWeekend ? 'bg-blue-50' : ''
              }`}
            >
              {/* Date badge */}
              <div className="flex-shrink-0 w-12 text-center">
                <div className="text-[10px] font-medium text-gray-400 uppercase leading-none mb-0.5">
                  {WEEKDAY_SHORT[dow]}
                </div>
                <div className={`text-lg font-bold leading-none ${
                  conflict ? 'text-red-700' : isExtra ? 'text-amber-700' : isWeekend ? 'text-blue-700' : 'text-gray-700'
                }`}>
                  {day}
                </div>
                {isExtra && (
                  <div className="text-[9px] text-amber-600 uppercase mt-0.5">
                    {MONTH_NAMES[extraMonth - 1].slice(0, 3)}
                  </div>
                )}
              </div>

              {/* Assignments */}
              <div className="flex-1 flex flex-col gap-1 pt-0.5">
                {conflict && (
                  <span className="text-[11px] text-red-700 font-medium flex items-center gap-1">
                    <AlertTriangle size={12} />
                    Mesma pessoa nos dois hospitais
                  </span>
                )}
                {isHoliday && (
                  <span className="text-[11px] text-purple-700 font-medium">
                    Feriado — fora do balanceamento
                  </span>
                )}
                {HOSPITAL_LIST.map((hospital) => {
                  const pathId = slot[hospital]
                  const isEditingThis = editing?.dateStr === dateStr && editing?.hospital === hospital
                  const bg = pathId ? pathColor(pathMap[pathId]) : null
                  const fg = bg ? getContrastText(bg) : null
                  const blocked = pathId ? unavailableReason?.(pathId, dateStr) : null
                  return editable ? (
                    <button
                      key={hospital}
                      onClick={() => setEditing(isEditingThis ? null : { dateStr, hospital })}
                      style={pathId ? { backgroundColor: bg, color: fg } : undefined}
                      title={blocked ? `${blocked} — escalado mesmo assim` : ''}
                      className={`text-left rounded px-2 py-1 text-sm transition-colors ${
                        isEditingThis
                          ? `ring-2 ${RING[hospital]} ${pathId ? '' : 'bg-gray-50'}`
                          : pathId
                          ? `hover:opacity-80 ${blocked ? 'ring-1 ring-red-500' : ''}`
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
                {isExtra && onRemoveExtraDay && (
                  <button
                    onClick={() => onRemoveExtraDay(dateStr)}
                    className="self-start text-[11px] text-amber-600 hover:text-red-600 flex items-center gap-1"
                  >
                    <X size={11} /> Remover dia
                  </button>
                )}
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
