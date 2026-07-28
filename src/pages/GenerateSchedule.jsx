import React, { useState, useEffect, useMemo } from 'react'
import {
  doc, getDocs, setDoc, collection, Timestamp
} from 'firebase/firestore'
import { db } from '../firebase'
import { useCollection } from '../hooks/useCollection'
import {
  scheduleKey, buildMonthDays, MONTH_NAMES, HOSPITALS,
  formatMonthYear, hasFifthWeekend, getMonthWeekendGroups
} from '../utils/dateHelpers'
import {
  generateSchedule, computeStats, mergeStatsMaps, findDoubleBookedDates
} from '../utils/scheduleAlgorithm'
import { makeUnavailabilityChecker } from '../utils/restrictions'
import BalanceBars from '../components/BalanceBars'
import MonWedTable from '../components/MonWedTable'
import MonthCalendar from '../components/MonthCalendar'
import ScopeToggle from '../components/ScopeToggle'
import RestrictionsModal from '../components/RestrictionsModal'
import {
  Wand2, Save, CheckCircle, AlertTriangle, Calendar, Plus, CornerDownRight, Ban, X
} from 'lucide-react'
import { format } from 'date-fns'

const SCOPE_NOTE = {
  month: 'Apenas o mês em edição.',
  history: 'Todas as escalas publicadas, exceto este mês.',
  total: 'Histórico publicado + o mês em edição.',
}

export default function GenerateSchedule() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  const [pathologists, setPathologists] = useState([])
  const [holidays, setHolidays] = useState([])
  const [historyStats, setHistoryStats] = useState({})
  const [prevWeekendAssignments, setPrevWeekendAssignments] = useState({})
  const [prevExtraDays, setPrevExtraDays] = useState({})
  const [prefilledDates, setPrefilledDates] = useState(() => new Set())
  const [schedule, setSchedule] = useState(null)
  const [weekendAssignments, setWeekendAssignments] = useState({})
  const [liveStats, setLiveStats] = useState({})
  const [pathMap, setPathMap] = useState({})
  const [alreadyPublished, setAlreadyPublished] = useState(false)
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [published, setPublished] = useState(false)
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)
  const [showRestrictions, setShowRestrictions] = useState(false)

  const [balanceScope, setBalanceScope] = useState('month')
  const [monWedScope, setMonWedScope] = useState('month')

  // Restrições ficam em tempo real: cadastrar uma já reflete no calendário.
  const { data: restrictions } = useCollection('restrictions')

  const years = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const prevDate = new Date(year, month - 2, 1)
        const prevKey = scheduleKey(prevDate.getFullYear(), prevDate.getMonth() + 1)
        const currentKey = scheduleKey(year, month)

        const [pathSnap, holSnap, schedSnap] = await Promise.all([
          getDocs(collection(db, 'pathologists')),
          getDocs(collection(db, 'holidays')),
          getDocs(collection(db, 'schedules')),
        ])

        const paths = pathSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
        setPathologists(paths)
        const map = {}
        paths.forEach((p) => (map[p.id] = p))
        setPathMap(map)

        const hols = holSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
        setHolidays(hols)

        // Histórico = todas as escalas publicadas menos a que está sendo montada.
        // Recalculado a partir das escalas (e não do cache em `statistics`) para
        // que a segmentação Seg/Qua exista mesmo em meses antigos.
        let agg = {}
        for (const sd of schedSnap.docs) {
          if (sd.id === currentKey) continue
          const days = sd.data().days
          if (!days) continue
          agg = mergeStatsMaps(agg, computeStats(days, paths, hols))
        }
        setHistoryStats(agg)

        // Mês anterior: rotação dos FDS e dias deste mês já divididos por antecipação
        const prevDoc = schedSnap.docs.find((d) => d.id === prevKey)
        setPrevWeekendAssignments(prevDoc?.data().weekendAssignments || {})
        setPrevExtraDays(prevDoc?.data().extraDays || {})

        // Se o mês já foi publicado, abre a escala existente para continuar a edição
        const currentDoc = schedSnap.docs.find((d) => d.id === currentKey)
        if (currentDoc) {
          const data = currentDoc.data()
          setSchedule({ ...(data.days || {}), ...(data.extraDays || {}) })
          setWeekendAssignments(data.weekendAssignments || {})
          setAlreadyPublished(true)
        } else {
          setSchedule(null)
          setWeekendAssignments({})
          setAlreadyPublished(false)
        }
        setPrefilledDates(new Set())
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [year, month])

  useEffect(() => {
    if (!schedule) { setLiveStats({}); return }
    // O balanço do mês reflete apenas os dias que pertencem a ele — os dias
    // antecipados do mês seguinte contam quando aquele mês for gerado.
    const prefix = scheduleKey(year, month)
    const monthDays = {}
    for (const [dateStr, slot] of Object.entries(schedule)) {
      if (dateStr.slice(0, 7) === prefix) monthDays[dateStr] = slot
    }
    setLiveStats(computeStats(monthDays, pathologists, holidays))
  }, [schedule, pathologists, holidays, year, month])

  const totalStats = useMemo(
    () => mergeStatsMaps(historyStats, liveStats),
    [historyStats, liveStats]
  )

  function statsForScope(scope) {
    if (scope === 'history') return historyStats
    if (scope === 'total') return totalStats
    return liveStats
  }

  const unavailableReason = useMemo(
    () => makeUnavailabilityChecker(pathologists, restrictions),
    [pathologists, restrictions]
  )

  // Contagem exibida ao lado de cada nome no seletor do calendário —
  // acompanha a visão escolhida no balanceamento.
  const pathCounts = useMemo(() => {
    const s = statsForScope(balanceScope)
    const out = {}
    for (const [id, v] of Object.entries(s)) {
      out[id] = (v.HAC?.weekday || 0) + (v.HAC?.holiday || 0)
        + (v.HOBRA?.weekday || 0) + (v.HOBRA?.holiday || 0)
    }
    return out
  }, [balanceScope, liveStats, historyStats, totalStats])

  const conflictDates = useMemo(
    () => (schedule ? findDoubleBookedDates(schedule) : new Set()),
    [schedule]
  )

  function runGenerate() {
    setPublished(false)
    // Dias deste mês que já foram divididos durante a geração do mês anterior
    const prefix = scheduleKey(year, month)
    const lockedDays = {}
    for (const [dateStr, slot] of Object.entries(prevExtraDays)) {
      if (dateStr.slice(0, 7) === prefix) lockedDays[dateStr] = slot
    }

    const { schedule: sched, weekendAssignments: wa } = generateSchedule({
      year,
      month,
      pathologists,
      existingStats: historyStats,
      prevWeekendAssignments,
      lockedDays,
      restrictions,
    })
    setSchedule(sched)
    setWeekendAssignments(wa)
    setPrefilledDates(new Set(Object.keys(lockedDays)))
  }

  function handleGenerate() {
    // Gerar zera a rotina: confirma antes de descartar uma divisão já feita.
    const hasContent = schedule && Object.values(schedule).some((s) => s.HAC || s.HOBRA)
    if (hasContent) {
      setConfirmRegenerate(true)
      return
    }
    runGenerate()
  }

  // Acrescenta o próximo dia do calendário (já do mês seguinte) para o usuário
  // antecipar a divisão. Cada clique adiciona mais um dia ao final.
  function handleAddDay() {
    setSchedule((prev) => {
      if (!prev) return prev
      const lastDayOfMonth = buildMonthDays(year, month).slice(-1)[0].dateStr
      const maxStr = Object.keys(prev).reduce((a, b) => (b > a ? b : a), lastDayOfMonth)
      const [y, m, d] = maxStr.split('-').map(Number)
      const next = new Date(y, m - 1, d + 1)
      const nextStr = format(next, 'yyyy-MM-dd')
      if (prev[nextStr]) return prev
      return { ...prev, [nextStr]: { HAC: null, HOBRA: null } }
    })
  }

  function handleRemoveExtraDay(dateStr) {
    setSchedule((prev) => {
      const next = { ...prev }
      delete next[dateStr]
      return next
    })
  }

  function handleCellChange(dateStr, hospital, pathId) {
    setSchedule((prev) => ({
      ...prev,
      [dateStr]: { ...prev[dateStr], [hospital]: pathId || null },
    }))
  }

  // Ao trocar o plantonista de um slot de FDS, preenche os 3 dias do bloco
  function handleWeekendAssignmentChange(slot, hospital, pathId) {
    const weekendGroups = getMonthWeekendGroups(year, month)
    const slotDays = weekendGroups[slot] || []

    setWeekendAssignments((prev) => ({
      ...prev,
      [slot]: { ...(prev[slot] || {}), [hospital]: pathId || null },
    }))

    setSchedule((prev) => {
      const next = { ...prev }
      for (const { dateStr } of slotDays) {
        next[dateStr] = { ...(next[dateStr] || {}), [hospital]: pathId || null }
      }
      return next
    })
  }

  async function handlePublish() {
    if (!schedule) return
    setPublishing(true)
    try {
      const key = scheduleKey(year, month)

      // Separa os dias do mês dos dias antecipados do mês seguinte. As
      // estatísticas contam só os dias do mês; os antecipados são absorvidos
      // (e contados) quando a escala do mês seguinte for gerada.
      const days = {}
      const extraDays = {}
      for (const [dateStr, slot] of Object.entries(schedule)) {
        if (dateStr.slice(0, 7) === key) days[dateStr] = slot
        else extraDays[dateStr] = slot
      }

      const stats = computeStats(days, pathologists, holidays)

      await setDoc(doc(db, 'schedules', key), {
        year,
        month,
        publishedAt: Timestamp.now(),
        days,
        weekendAssignments,
        extraDays,
      })

      await setDoc(doc(db, 'statistics', key), {
        year,
        month,
        shifts: stats,
      })

      setAlreadyPublished(true)
      setPublished(true)
    } finally {
      setPublishing(false)
    }
  }

  const activePaths = pathologists.filter((p) => p.active !== false)
  const fifthWeekend = schedule ? hasFifthWeekend(year, month) : false

  // Dias antecipados (do mês seguinte) adicionados pelo usuário
  const monthPrefix = scheduleKey(year, month)
  const extraDates = schedule
    ? Object.keys(schedule).filter((d) => d.slice(0, 7) !== monthPrefix).sort()
    : []

  function resetMonthState(updater) {
    updater()
    setPublished(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gerar Escala</h1>
          <p className="text-gray-500 text-sm">Monte e publique a escala mensal</p>
        </div>
        <button className="btn-secondary" onClick={() => setShowRestrictions(true)}>
          <Ban size={16} className="text-red-500" />
          Adicionar restrições
        </button>
      </div>

      {/* Controls */}
      <div className="card">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Mês</label>
            <select
              className="input w-auto"
              value={month}
              onChange={(e) => resetMonthState(() => setMonth(Number(e.target.value)))}
            >
              {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Ano</label>
            <select
              className="input w-auto"
              value={year}
              onChange={(e) => resetMonthState(() => setYear(Number(e.target.value)))}
            >
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button className="btn-primary" onClick={handleGenerate} disabled={loading}>
            <Wand2 size={16} />
            {loading ? 'Carregando...' : 'Gerar Escala'}
          </button>
          {schedule && (
            <button
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              onClick={handlePublish}
              disabled={publishing}
            >
              <Save size={16} />
              {publishing ? 'Publicando...' : alreadyPublished ? 'Salvar Alterações' : 'Publicar Escala'}
            </button>
          )}
        </div>

        <p className="text-xs text-gray-400 mt-3 flex items-start gap-1.5">
          <CornerDownRight size={12} className="mt-0.5 flex-shrink-0" />
          Gerar preenche apenas os plantões fixos, os finais de semana e os dias
          antecipados do mês anterior. A rotina (Seg-Qui) fica em branco para
          divisão manual — clique nas células do calendário.
        </p>

        {published && (
          <div className="mt-3 flex items-center gap-2 text-green-700 bg-green-50 rounded-lg px-3 py-2 text-sm">
            <CheckCircle size={16} />
            Escala de {formatMonthYear(year, month)} publicada com sucesso!
          </div>
        )}

        {alreadyPublished && !published && schedule && (
          <div className="mt-3 flex items-center gap-2 text-blue-700 bg-blue-50 rounded-lg px-3 py-2 text-sm">
            <Calendar size={16} />
            Esta escala já está publicada — as alterações feitas aqui a atualizam.
          </div>
        )}

        {fifthWeekend && schedule && (
          <div className="mt-3 flex items-center gap-2 text-amber-700 bg-amber-50 rounded-lg px-3 py-2 text-sm">
            <AlertTriangle size={16} />
            Este mês tem <strong>5º final de semana</strong> — verifique a atribuição e ajuste se necessário.
          </div>
        )}

        {conflictDates.size > 0 && (
          <div className="mt-3 flex items-start gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
            <span>
              <strong>Mesma pessoa nos dois hospitais</strong> em{' '}
              {[...conflictDates].sort().map((d) => d.slice(8)).join(', ')} — corrija antes de publicar.
            </span>
          </div>
        )}
      </div>

      {schedule && (
        <>
          {/* Calendário editável */}
          <div className="card">
            <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Calendar size={16} className="text-blue-600" />
              {formatMonthYear(year, month)} — Editar Escala
            </h2>

            <MonthCalendar
              year={year}
              month={month}
              scheduleDays={schedule}
              pathMap={pathMap}
              onEdit={handleCellChange}
              extraDates={extraDates}
              onRemoveExtraDay={handleRemoveExtraDay}
              prefilledDates={prefilledDates}
              unavailableReason={unavailableReason}
              pathCounts={pathCounts}
            />

            <div className="mt-4">
              <button
                onClick={handleAddDay}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
              >
                <Plus size={14} />
                Adicionar dias
              </button>
              <p className="text-[11px] text-gray-400 mt-1.5 flex items-start gap-1">
                <CornerDownRight size={12} className="mt-0.5 flex-shrink-0" />
                Adicione dias do próximo mês para já dividi-los. Eles contam no mês
                correto e aparecem pré-preenchidos ao gerar a escala seguinte.
              </p>
            </div>
          </div>

          {/* Finais de semana */}
          {Object.keys(weekendAssignments).length > 0 && (
            <div className="card">
              <h2 className="font-semibold text-gray-800 mb-1">Finais de Semana</h2>
              <p className="text-xs text-gray-500 mb-4">
                Selecione o plantonista de cada hospital. Os 3 dias (Sex/Sáb/Dom) são preenchidos automaticamente.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {Object.entries(weekendAssignments)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([slotStr, wa]) => {
                    const slot = Number(slotStr)
                    return (
                      <div key={slot} className="border border-gray-100 rounded-lg p-3">
                        <p className="text-xs font-semibold text-gray-600 mb-2">{slot}º Final de Semana</p>
                        <div className="space-y-2">
                          {HOSPITALS.map((hospital) => (
                            <div key={hospital}>
                              <label className="text-[11px] font-medium mb-0.5 block">
                                <span className={hospital === 'HAC' ? 'text-blue-600' : 'text-emerald-600'}>
                                  {hospital}
                                </span>
                              </label>
                              <select
                                className="text-xs border border-gray-200 rounded px-2 py-1 bg-white w-full"
                                value={wa[hospital] || ''}
                                onChange={(e) =>
                                  handleWeekendAssignmentChange(slot, hospital, e.target.value)
                                }
                              >
                                <option value="">— vazio —</option>
                                {activePaths.map((p) => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          {/* Balanceamento */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="card">
              <div className="flex items-start justify-between gap-3 mb-1">
                <h2 className="font-semibold text-gray-800">Balanceamento ao Vivo</h2>
                <ScopeToggle value={balanceScope} onChange={setBalanceScope} />
              </div>
              <p className="text-xs text-gray-500 mb-4">{SCOPE_NOTE[balanceScope]}</p>
              <BalanceBars stats={statsForScope(balanceScope)} pathMap={pathMap} />
            </div>

            <div className="card">
              <div className="flex items-start justify-between gap-3 mb-1">
                <h2 className="font-semibold text-gray-800">Segundas e Quartas</h2>
                <ScopeToggle value={monWedScope} onChange={setMonWedScope} />
              </div>
              <p className="text-xs text-gray-500 mb-4">
                Seg e Qua por hospital. {SCOPE_NOTE[monWedScope]}
              </p>
              <MonWedTable
                stats={statsForScope(monWedScope)}
                paths={pathologists
                  .filter((p) => p.regime === 'normal' && p.active !== false)
                  .sort((a, b) => a.name.localeCompare(b.name))}
                compact
              />
            </div>
          </div>
        </>
      )}

      {showRestrictions && (
        <RestrictionsModal
          pathologists={pathologists}
          restrictions={restrictions}
          onClose={() => setShowRestrictions(false)}
        />
      )}

      {confirmRegenerate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Gerar escala novamente?</h3>
              <button onClick={() => setConfirmRegenerate(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                A divisão da rotina feita até agora será apagada. Só voltam preenchidos
                os plantões fixos, os finais de semana e os dias antecipados do mês anterior.
              </p>
              <div className="flex justify-end gap-2">
                <button className="btn-secondary" onClick={() => setConfirmRegenerate(false)}>
                  Cancelar
                </button>
                <button
                  className="btn-danger"
                  onClick={() => { setConfirmRegenerate(false); runGenerate() }}
                >
                  Gerar novamente
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
