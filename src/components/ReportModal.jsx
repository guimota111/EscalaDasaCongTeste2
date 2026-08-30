import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as htmlToImage from 'html-to-image'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { computeStats, computeHolidayStats, mergeStatsMaps } from '../utils/scheduleAlgorithm'
import { MONTH_NAMES } from '../utils/dateHelpers'
import { X, Copy, Download, Check, AlertTriangle } from 'lucide-react'
import ReportImage from './ReportImage'

/**
 * Modal que gera um relatório (mensal ou anual) com gráficos e exporta como imagem.
 * mode: 'monthly' | 'annual'. O período (mês/ano) é escolhido dentro do modal.
 */
export default function ReportModal({ mode, onClose }) {
  const now = new Date()
  const [loading, setLoading] = useState(true)
  const [schedules, setSchedules] = useState([])
  const [pathologists, setPathologists] = useState([])
  const [holidays, setHolidays] = useState([])
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [includeInactive, setIncludeInactive] = useState(false)
  const [allRegimes, setAllRegimes] = useState(false)
  const [status, setStatus] = useState('idle')
  const [busy, setBusy] = useState(false)
  const nodeRef = useRef(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [schedSnap, pathSnap, holSnap] = await Promise.all([
          getDocs(collection(db, 'schedules')),
          getDocs(collection(db, 'pathologists')),
          getDocs(collection(db, 'holidays')),
        ])
        setSchedules(schedSnap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setPathologists(pathSnap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setHolidays(holSnap.docs.map((d) => ({ id: d.id, ...d.data() })))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const pathById = useMemo(() => {
    const m = {}
    pathologists.forEach((p) => (m[p.id] = p))
    return m
  }, [pathologists])

  const years = useMemo(() => {
    const set = new Set([now.getFullYear()])
    schedules.forEach((s) => set.add(s.year ?? Number(String(s.id).slice(0, 4))))
    return [...set].filter(Boolean).sort((a, b) => b - a)
  }, [schedules, now])

  const report = useMemo(() => {
    // Filtro de quais patologistas entram no relatório
    const includePath = (p) => {
      if (!p) return false
      if (!allRegimes && p.regime !== 'normal') return false
      if (!includeInactive && p.active === false) return false
      return true
    }

    const inPeriod = (y, m) => y === year && (mode !== 'monthly' || m === month)

    // Estatísticas por mês do período: a escala (já sem os dias de feriado)
    // somada aos plantões de feriado cadastrados manualmente naquele mês.
    const statsByMonth = {}
    for (const s of schedules) {
      if (!s.days) continue
      const y = s.year ?? Number(String(s.id).slice(0, 4))
      const m = s.month ?? Number(String(s.id).slice(5, 7))
      if (!inPeriod(y, m)) continue
      const key = String(s.id).slice(0, 7)
      statsByMonth[key] = mergeStatsMaps(
        statsByMonth[key] || {},
        computeStats(s.days, pathologists, holidays)
      )
    }
    // Feriados contam mesmo em meses sem escala publicada.
    for (const h of holidays) {
      const dateStr = typeof h?.date === 'string' ? h.date : ''
      if (!dateStr) continue
      const [y, m] = dateStr.split('-').map(Number)
      if (!inPeriod(y, m)) continue
      const key = dateStr.slice(0, 7)
      if (!statsByMonth[key]) statsByMonth[key] = {}
    }
    for (const key of Object.keys(statsByMonth)) {
      statsByMonth[key] = mergeStatsMaps(
        statsByMonth[key],
        computeHolidayStats(holidays, key)
      )
    }

    const agg = {}
    const monthAgg = {} // m -> { total, paths: Set }
    for (const [key, stats] of Object.entries(statsByMonth)) {
      const m = Number(key.slice(5, 7))
      for (const [pid, st] of Object.entries(stats)) {
        if (!includePath(pathById[pid])) continue
        const segQuiHAC = st.HAC?.weekday || 0
        const segQuiHOBRA = st.HOBRA?.weekday || 0
        const feriados = (st.HAC?.holiday || 0) + (st.HOBRA?.holiday || 0)
        const mon = (st.HAC?.mon || 0) + (st.HOBRA?.mon || 0)
        const wed = (st.HAC?.wed || 0) + (st.HOBRA?.wed || 0)
        // Total de balanceamento — feriados ficam de fora.
        const total = segQuiHAC + segQuiHOBRA
        if (!agg[pid]) agg[pid] = { segQuiHAC: 0, segQuiHOBRA: 0, feriados: 0, mon: 0, wed: 0, total: 0 }
        agg[pid].segQuiHAC += segQuiHAC
        agg[pid].segQuiHOBRA += segQuiHOBRA
        agg[pid].feriados += feriados
        agg[pid].mon += mon
        agg[pid].wed += wed
        agg[pid].total += total
        if (total > 0) {
          if (!monthAgg[m]) monthAgg[m] = { total: 0, paths: new Set() }
          monthAgg[m].total += total
          monthAgg[m].paths.add(pid)
        }
      }
    }

    const perPath = Object.entries(agg)
      .filter(([, v]) => v.total > 0 || v.feriados > 0)
      .map(([pid, v]) => ({
        id: pid,
        name: pathById[pid]?.name || '—',
        color: pathById[pid]?.color || '',
        ...v,
      }))

    const totalShifts = perPath.reduce((s, p) => s + p.total, 0)
    const monthsWithData = Object.keys(monthAgg).length
    // Média de plantões por patologista, em cada mês
    const monthly = MONTH_NAMES.map((nm, i) => {
      const ma = monthAgg[i + 1]
      const avg = ma && ma.paths.size ? Math.round((ma.total / ma.paths.size) * 10) / 10 : 0
      return { month: i + 1, name: nm.slice(0, 3), avg }
    })
    // Média geral de plantões por patologista por mês (para o resumo)
    const avgPerPathMonth = (monthsWithData && perPath.length)
      ? Math.round((totalShifts / perPath.length / monthsWithData) * 10) / 10
      : 0

    return {
      perPath,
      monthly,
      summary: {
        totalShifts,
        numPaths: perPath.length,
        avgPerPathMonth,
      },
    }
  }, [schedules, pathologists, holidays, year, month, mode, pathById, includeInactive, allRegimes])

  async function handleCopy() {
    if (busy) return
    setBusy(true); setStatus('idle')
    try {
      const blob = await htmlToImage.toBlob(nodeRef.current, { pixelRatio: 2, backgroundColor: '#ffffff' })
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })])
      setStatus('copied')
    } catch {
      try { await handleDownload() } catch { setStatus('error') }
    } finally {
      setBusy(false)
    }
  }

  async function handleDownload() {
    setBusy(true)
    try {
      const dataUrl = await htmlToImage.toPng(nodeRef.current, { pixelRatio: 2, backgroundColor: '#ffffff' })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = mode === 'monthly'
        ? `relatorio_${year}-${String(month).padStart(2, '0')}.png`
        : `relatorio_${year}.png`
      a.click()
      setStatus('downloaded')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">
            {mode === 'monthly' ? 'Exportar dados mensais' : 'Exportar dados anuais'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : (
          <>
            <div className="px-6 py-4 border-b border-gray-100">
              <div className="flex flex-wrap items-end gap-4">
                {mode === 'monthly' && (
                  <div>
                    <label className="label">Mês</label>
                    <select className="input w-auto" value={month} onChange={(e) => { setMonth(Number(e.target.value)); setStatus('idle') }}>
                      {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className="label">Ano</label>
                  <select className="input w-auto" value={year} onChange={(e) => { setYear(Number(e.target.value)); setStatus('idle') }}>
                    {years.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5 pb-1">
                  <Toggle
                    checked={includeInactive}
                    onChange={() => { setIncludeInactive((v) => !v); setStatus('idle') }}
                    label="Incluir desligados"
                  />
                  <Toggle
                    checked={allRegimes}
                    onChange={() => { setAllRegimes((v) => !v); setStatus('idle') }}
                    label="Incluir todos os regimes"
                  />
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <button className="btn-secondary" onClick={handleDownload} disabled={busy}>
                    <Download size={16} />
                    Baixar PNG
                  </button>
                  <button className="btn-primary" onClick={handleCopy} disabled={busy}>
                    <Copy size={16} />
                    {busy ? 'Gerando...' : 'Copiar imagem'}
                  </button>
                </div>
              </div>
              {status === 'copied' && (
                <p className="text-xs text-green-600 mt-2 flex items-center gap-1"><Check size={14} /> Imagem copiada para a área de transferência.</p>
              )}
              {status === 'downloaded' && (
                <p className="text-xs text-green-600 mt-2 flex items-center gap-1"><Check size={14} /> Imagem baixada.</p>
              )}
              {status === 'error' && (
                <p className="text-xs text-red-500 mt-2 flex items-center gap-1"><AlertTriangle size={14} /> Não foi possível gerar a imagem.</p>
              )}
            </div>

            <div className="flex-1 overflow-auto bg-gray-100 p-4">
              <div className="inline-block shadow-lg">
                <div ref={nodeRef}>
                  <ReportImage
                    mode={mode}
                    year={year}
                    month={month}
                    perPath={report.perPath}
                    monthly={report.monthly}
                    summary={report.summary}
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <button
        type="button" role="switch" aria-checked={checked} onClick={onChange}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-300'}`}
      >
        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-1'}`} />
      </button>
      <span className="text-xs text-gray-600">{label}</span>
    </label>
  )
}
