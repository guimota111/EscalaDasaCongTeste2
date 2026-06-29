import React from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
} from 'recharts'
import { MONTH_NAMES } from '../utils/dateHelpers'
import { pathColor } from '../utils/colors'

const CHART_W = 940
const CHART_H = 280

function firstName(name = '') {
  return name.trim().split(/\s+/)[0]
}

/**
 * Relatório de uma página (mensal ou anual) com gráficos, para exportar como imagem.
 *
 * mode: 'monthly' | 'annual'
 * perPath: [{ id, name, color, segQuiHAC, segQuiHOBRA, feriados, mon, wed, total }]
 * monthly: [{ month, name, total }] (somente anual)
 * summary: { totalShifts, numPaths }
 */
export default function ReportImage({ mode, year, month, perPath = [], monthly = [], summary = {} }) {
  const title = mode === 'monthly'
    ? `Relatório Mensal — ${MONTH_NAMES[month - 1]} ${year}`
    : `Relatório Anual — ${year}`

  const byTotal = [...perPath].sort((a, b) => b.total - a.total)
  const totalData = byTotal.map((p) => ({ name: firstName(p.name), total: p.total, color: pathColor(p) }))
  const hospData = byTotal.map((p) => ({
    name: firstName(p.name),
    'HAC Seg-Qui': p.segQuiHAC,
    'HOBRA Seg-Qui': p.segQuiHOBRA,
    'Feriados': p.feriados,
  }))
  const segWedData = byTotal.map((p) => ({
    name: firstName(p.name),
    'Segundas': p.mon,
    'Quartas': p.wed,
  }))

  const axisProps = { tick: { fontSize: 12 }, interval: 0 }

  function ChartCard({ heading, children }) {
    return (
      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#374151', marginBottom: 6 }}>{heading}</div>
        {children}
      </div>
    )
  }

  return (
    <div style={{
      width: 1000, padding: 28, background: '#ffffff',
      fontFamily: 'Inter, system-ui, sans-serif', color: '#111827',
    }}>
      {/* Cabeçalho */}
      <div style={{ borderBottom: '2px solid #e5e7eb', paddingBottom: 12, marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#1d4ed8', letterSpacing: 1, textTransform: 'uppercase' }}>
          DASA Brasília — Escala de Congelação
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, marginTop: 2 }}>{title}</div>
      </div>

      {/* Resumo */}
      <div style={{ display: 'flex', gap: 12 }}>
        <Stat label="Total de plantões" value={summary.totalShifts ?? 0} />
        <Stat label="Patologistas escalados" value={summary.numPaths ?? 0} />
        {mode === 'annual' && (
          <Stat label="Média por mês" value={summary.avgPerMonth ?? 0} />
        )}
      </div>

      {perPath.length === 0 ? (
        <p style={{ color: '#9ca3af', marginTop: 24 }}>Sem dados para o período selecionado.</p>
      ) : (
        <>
          <ChartCard heading="Total de plantões por patologista">
            <BarChart width={CHART_W} height={CHART_H} data={totalData} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" {...axisProps} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="total" isAnimationActive={false} radius={[4, 4, 0, 0]}>
                {totalData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ChartCard>

          {mode === 'annual' && (
            <ChartCard heading="Plantões por mês">
              <BarChart width={CHART_W} height={CHART_H} data={monthly} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" {...axisProps} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="total" fill="#3b82f6" isAnimationActive={false} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartCard>
          )}

          <ChartCard heading="HAC × HOBRA (Seg-Qui) e Feriados por patologista">
            <BarChart width={CHART_W} height={CHART_H} data={hospData} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" {...axisProps} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="HAC Seg-Qui" fill="#3b82f6" isAnimationActive={false} />
              <Bar dataKey="HOBRA Seg-Qui" fill="#10b981" isAnimationActive={false} />
              <Bar dataKey="Feriados" fill="#f59e0b" isAnimationActive={false} />
            </BarChart>
          </ChartCard>

          <ChartCard heading="Segundas × Quartas por patologista">
            <BarChart width={CHART_W} height={CHART_H} data={segWedData} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" {...axisProps} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Segundas" fill="#6366f1" isAnimationActive={false} />
              <Bar dataKey="Quartas" fill="#ec4899" isAnimationActive={false} />
            </BarChart>
          </ChartCard>
        </>
      )}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div style={{
      flex: 1, background: '#f8fafc', border: '1px solid #e5e7eb',
      borderRadius: 10, padding: '12px 16px',
    }}>
      <div style={{ fontSize: 26, fontWeight: 800, color: '#1d4ed8' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{label}</div>
    </div>
  )
}
