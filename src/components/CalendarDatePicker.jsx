import React, { useState } from 'react'
import { buildMonthDays, WEEKDAY_NAMES, MONTH_NAMES } from '../utils/dateHelpers'
import { ChevronLeft, ChevronRight, Calendar as CalIcon } from 'lucide-react'

function pad2(n) { return String(n).padStart(2, '0') }
function monthKey(y, m) { return `${y}-${pad2(m)}` }
function fmtBR(dateStr) {
  if (!dateStr) return '—'
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

/**
 * Seletor de data em formato de calendário, que só permite escolher dias
 * habilitados (enabledSet). Dias sem ninguém escalado ficam desabilitados.
 *
 * value/onChange: 'YYYY-MM-DD'
 * enabledSet: Set de 'YYYY-MM-DD' selecionáveis
 * minDate/maxDate: limites de navegação ('YYYY-MM-DD')
 */
export default function CalendarDatePicker({
  value, onChange, enabledSet, minDate, maxDate, label,
}) {
  const [open, setOpen] = useState(false)

  const initial = (value || minDate || '').split('-').map(Number)
  const [viewY, setViewY] = useState(initial[0] || new Date().getFullYear())
  const [viewM, setViewM] = useState(initial[1] || 1)

  const minKey = minDate ? minDate.slice(0, 7) : null
  const maxKey = maxDate ? maxDate.slice(0, 7) : null
  const viewKey = monthKey(viewY, viewM)
  const prevDisabled = minKey && viewKey <= minKey
  const nextDisabled = maxKey && viewKey >= maxKey

  function goPrev() {
    if (prevDisabled) return
    if (viewM === 1) { setViewY(viewY - 1); setViewM(12) } else setViewM(viewM - 1)
  }
  function goNext() {
    if (nextDisabled) return
    if (viewM === 12) { setViewY(viewY + 1); setViewM(1) } else setViewM(viewM + 1)
  }

  function openPicker() {
    const v = (value || minDate || '').split('-').map(Number)
    if (v[0]) { setViewY(v[0]); setViewM(v[1]) }
    setOpen(true)
  }

  const days = buildMonthDays(viewY, viewM)
  const firstDow = days[0].dow

  return (
    <div className="relative inline-block">
      {label && <label className="label">{label}</label>}
      <button
        type="button"
        onClick={openPicker}
        className="input w-auto flex items-center gap-2 min-w-[150px]"
      >
        <CalIcon size={15} className="text-gray-400" />
        <span className={value ? 'text-gray-800' : 'text-gray-400'}>{fmtBR(value)}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 bg-white rounded-xl shadow-xl border border-gray-200 p-3 w-72">
            <div className="flex items-center justify-between mb-2">
              <button
                type="button" onClick={goPrev} disabled={prevDisabled}
                className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-sm font-semibold text-gray-800">
                {MONTH_NAMES[viewM - 1]} {viewY}
              </span>
              <button
                type="button" onClick={goNext} disabled={nextDisabled}
                className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAY_NAMES.map((d, i) => (
                <div key={d} className={`text-center text-[11px] font-semibold ${i === 0 || i === 6 ? 'text-blue-500' : 'text-gray-400'}`}>
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDow }).map((_, i) => <div key={`e-${i}`} />)}
              {days.map(({ dateStr, day }) => {
                const enabled = enabledSet.has(dateStr)
                const selected = dateStr === value
                return (
                  <button
                    key={dateStr}
                    type="button"
                    disabled={!enabled}
                    onClick={() => { onChange(dateStr); setOpen(false) }}
                    className={`h-8 rounded text-sm transition-colors ${
                      selected
                        ? 'bg-blue-600 text-white font-semibold'
                        : enabled
                        ? 'text-gray-700 hover:bg-blue-50'
                        : 'text-gray-300 cursor-not-allowed'
                    }`}
                    title={enabled ? '' : 'Sem ninguém escalado neste dia'}
                  >
                    {day}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
