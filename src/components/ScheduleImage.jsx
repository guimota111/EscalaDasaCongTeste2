import React from 'react'
import { MONTH_NAMES, WEEKDAY_NAMES, HOSPITALS } from '../utils/dateHelpers'
import { pathColor, getContrastText } from '../utils/colors'

/** Lista inclusiva de 'YYYY-MM-DD' entre start e end. */
function eachDay(startStr, endStr) {
  if (!startStr || !endStr || startStr > endStr) return []
  const [sy, sm, sd] = startStr.split('-').map(Number)
  const [ey, em, ed] = endStr.split('-').map(Number)
  const cur = new Date(sy, sm - 1, sd)
  const end = new Date(ey, em - 1, ed)
  const out = []
  while (cur <= end) {
    const y = cur.getFullYear()
    const m = String(cur.getMonth() + 1).padStart(2, '0')
    const d = String(cur.getDate()).padStart(2, '0')
    out.push(`${y}-${m}-${d}`)
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

function shortName(name) {
  if (!name) return ''
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${parts[parts.length - 1][0]}.`
}

/**
 * Renderiza a escala em formato de calendário (largura fixa) para exportar como imagem.
 * Bastante destaque para o nome do patologista, com a cor do card por pessoa.
 */
export default function ScheduleImage({ startStr, endStr, scheduleDays = {}, pathMap = {} }) {
  const days = eachDay(startStr, endStr)

  if (!days.length) {
    return (
      <div style={{ width: 1120, padding: 32, background: '#fff', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <p style={{ color: '#9ca3af' }}>Intervalo inválido.</p>
      </div>
    )
  }

  // Cabeçalho com o intervalo
  const [sy, sm, sd] = startStr.split('-').map(Number)
  const [ey, em, ed] = endStr.split('-').map(Number)
  const sameMonth = sy === ey && sm === em
  const header = sameMonth
    ? `${MONTH_NAMES[sm - 1]} ${sy}`
    : `${sd} de ${MONTH_NAMES[sm - 1]} – ${ed} de ${MONTH_NAMES[em - 1]} de ${ey}`

  // Monta a grade em semanas (Dom→Sáb)
  const firstDow = new Date(sy, sm - 1, sd).getDay()
  const cells = [...Array(firstDow).fill(null), ...days]
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

  const HOSP_COLORS = { HAC: '#1d4ed8', HOBRA: '#047857' }

  function renderPill(dateStr, hospital) {
    const slot = scheduleDays[dateStr] || {}
    const pathId = slot[hospital]
    const p = pathId ? pathMap[pathId] : null

    if (!p) {
      return (
        <div style={{
          borderRadius: 8, padding: '6px 8px', marginTop: 4,
          background: '#f9fafb', border: '1px dashed #e5e7eb', minHeight: 44,
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: HOSP_COLORS[hospital], letterSpacing: 0.5 }}>{hospital}</div>
          <div style={{ fontSize: 13, color: '#d1d5db' }}>—</div>
        </div>
      )
    }

    const bg = pathColor(p)
    const fg = getContrastText(bg)
    return (
      <div style={{
        borderRadius: 8, padding: '6px 8px', marginTop: 4, background: bg, minHeight: 44,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: fg, opacity: 0.85, letterSpacing: 0.5 }}>{hospital}</div>
        <div style={{ fontSize: 17, fontWeight: 800, color: fg, lineHeight: 1.1 }}>{shortName(p.name)}</div>
      </div>
    )
  }

  return (
    <div style={{
      width: 1120, padding: 28, background: '#ffffff',
      fontFamily: 'Inter, system-ui, sans-serif', color: '#111827',
    }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8', letterSpacing: 1, textTransform: 'uppercase' }}>
            DASA Brasília — Escala de Congelação
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, marginTop: 2 }}>{header}</div>
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          {HOSPITALS.map((h) => (
            <div key={h} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: HOSP_COLORS[h], display: 'inline-block' }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{h}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Cabeçalho de dias da semana */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 6 }}>
        {WEEKDAY_NAMES.map((d, i) => (
          <div key={d} style={{
            textAlign: 'center', fontSize: 12, fontWeight: 700,
            color: i === 0 || i === 6 ? '#1d4ed8' : '#6b7280', padding: '2px 0',
          }}>{d}</div>
        ))}
      </div>

      {/* Semanas */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
            {week.map((dateStr, di) => {
              if (!dateStr) return <div key={di} />
              const [, m, d] = dateStr.split('-').map(Number)
              const dow = new Date(dateStr + 'T12:00:00').getDay()
              const isWeekend = dow === 0 || dow === 6
              const isFirst = d === 1
              return (
                <div key={di} style={{
                  border: '1px solid #e5e7eb', borderRadius: 10, padding: 8,
                  background: isWeekend ? '#eff6ff' : '#ffffff', minHeight: 118,
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 2,
                  }}>
                    <span style={{ fontSize: 18, fontWeight: 800, color: isWeekend ? '#1d4ed8' : '#374151' }}>{d}</span>
                    {isFirst && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>
                        {MONTH_NAMES[m - 1].slice(0, 3)}
                      </span>
                    )}
                  </div>
                  {renderPill(dateStr, 'HAC')}
                  {renderPill(dateStr, 'HOBRA')}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
