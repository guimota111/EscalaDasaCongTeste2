import React, { useMemo, useState } from 'react'
import {
  collection, addDoc, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc, Timestamp
} from 'firebase/firestore'
import { db } from '../firebase'
import { useCollection } from '../hooks/useCollection'
import { scheduleKey, HOSPITALS } from '../utils/dateHelpers'
import { computeMonthStats, getHolidayShifts } from '../utils/scheduleAlgorithm'
import { pathColor, getContrastText } from '../utils/colors'
import { format } from 'date-fns'
import { CalendarDays, Plus, Trash2, RefreshCw, X, Users, Info } from 'lucide-react'

/**
 * Após qualquer mudança em um feriado (data, remoção ou plantões manuais),
 * recalcula as estatísticas do mês afetado: a escala do dia de feriado sai da
 * conta e os plantões de feriado cadastrados aqui entram no lugar.
 */
async function recomputeStatsForMonth(dateStr) {
  const [yearStr, monthStr] = dateStr.split('-')
  const key = scheduleKey(Number(yearStr), Number(monthStr))

  const [schedSnap, pathSnap, holSnap] = await Promise.all([
    getDoc(doc(db, 'schedules', key)),
    getDocs(collection(db, 'pathologists')),
    getDocs(collection(db, 'holidays')),
  ])

  if (!schedSnap.exists()) return // no published schedule for this month, nothing to do

  const schedData = schedSnap.data()
  const paths = pathSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
  const holidays = holSnap.docs.map((d) => ({ id: d.id, ...d.data() }))

  const newStats = computeMonthStats(schedData.days || {}, paths, holidays, key)

  await setDoc(doc(db, 'statistics', key), {
    year: schedData.year,
    month: schedData.month,
    shifts: newStats,
  })
}

export default function Holidays() {
  const { data: holidays, loading } = useCollection('holidays', 'date')
  const { data: pathologists } = useCollection('pathologists', 'name')
  const [date, setDate] = useState('')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [working, setWorking] = useState(false)
  const [recomputing, setRecomputing] = useState(false)
  const [lastMsg, setLastMsg] = useState('')

  const pathMap = useMemo(() => {
    const m = {}
    pathologists.forEach((p) => (m[p.id] = p))
    return m
  }, [pathologists])

  // Contagem manual de plantões de feriado, por patologista e hospital.
  const holidayCounts = useMemo(() => {
    const out = {}
    for (const h of holidays) {
      for (const { pathId, hospital } of getHolidayShifts(h)) {
        if (!out[pathId]) out[pathId] = { HAC: 0, HOBRA: 0 }
        out[pathId][hospital]++
      }
    }
    return out
  }, [holidays])

  // Grava a mudança e, em seguida, recalcula as estatísticas do mês afetado.
  // `working` cobre a gravação inteira para não haver dois escritores no mesmo
  // documento ao mesmo tempo (a lista de plantões é reescrita por completo).
  async function withRecompute(dateStr, action) {
    if (working) return
    setWorking(true)
    setLastMsg('')
    try {
      await action()
      if (!dateStr) return
      setRecomputing(true)
      try {
        await recomputeStatsForMonth(dateStr)
        setLastMsg(`Estatísticas de ${format(new Date(dateStr + 'T12:00:00'), 'MM/yyyy')} atualizadas.`)
      } finally {
        setRecomputing(false)
      }
    } finally {
      setWorking(false)
    }
  }

  async function handleAdd(e) {
    e.preventDefault()
    if (!date || !name.trim()) return
    setSaving(true)
    try {
      await withRecompute(date, async () => {
        await addDoc(collection(db, 'holidays'), {
          date,
          name: name.trim(),
          shifts: [],
          createdAt: Timestamp.now(),
        })
        setDate('')
        setName('')
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(holiday) {
    await withRecompute(holiday.date, () =>
      deleteDoc(doc(db, 'holidays', holiday.id))
    )
  }

  async function handleAddShift(holiday, hospital, pathId) {
    if (!pathId) return
    const shifts = getHolidayShifts(holiday)
    if (shifts.some((s) => s.pathId === pathId && s.hospital === hospital)) return
    await withRecompute(holiday.date, () =>
      updateDoc(doc(db, 'holidays', holiday.id), {
        shifts: [...shifts, { pathId, hospital }],
      })
    )
  }

  async function handleRemoveShift(holiday, hospital, pathId) {
    const shifts = getHolidayShifts(holiday).filter(
      (s) => !(s.pathId === pathId && s.hospital === hospital)
    )
    await withRecompute(holiday.date, () =>
      updateDoc(doc(db, 'holidays', holiday.id), { shifts })
    )
  }

  const activePaths = pathologists.filter((p) => p.active !== false)
  const countedPaths = pathologists
    .filter((p) => p.active !== false || holidayCounts[p.id])
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Feriados</h1>
        <p className="text-gray-500 text-sm">
          Cadastro manual de feriados e dos plantões de feriado de cada patologista, por hospital.
        </p>
      </div>

      <div className="flex items-start gap-2 text-sm text-blue-800 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
        <Info size={16} className="mt-0.5 flex-shrink-0" />
        <span>
          O dia marcado como feriado <strong>sai de todo balanceamento</strong> — o plantão
          que estiver na escala nesse dia não conta como Seg-Qui, Seg/Qua nem 5º FDS.
          A contagem de feriados é a que você cadastrar aqui.
        </span>
      </div>

      <div className="card">
        <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Plus size={18} className="text-blue-600" />
          Adicionar Feriado
        </h2>
        <form onSubmit={handleAdd} className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[150px]">
            <label className="label">Data</label>
            <input
              type="date"
              className="input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div className="flex-[2] min-w-[200px]">
            <label className="label">Nome do Feriado</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Natal"
              required
            />
          </div>
          <button type="submit" className="btn-primary" disabled={saving || working}>
            <Plus size={16} />
            {saving ? 'Salvando...' : recomputing ? 'Atualizando...' : 'Adicionar'}
          </button>
        </form>

        {recomputing && (
          <p className="mt-3 text-xs text-blue-600 flex items-center gap-1.5">
            <RefreshCw size={13} className="animate-spin" />
            Recalculando estatísticas...
          </p>
        )}
        {lastMsg && !recomputing && (
          <p className="mt-3 text-xs text-green-600">{lastMsg}</p>
        )}
      </div>

      <div className="card">
        <h2 className="font-semibold text-gray-800 mb-1 flex items-center gap-2">
          <CalendarDays size={18} className="text-blue-600" />
          Feriados Cadastrados
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Em cada feriado, adicione quem plantonou em cada hospital.
        </p>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-blue-600" />
          </div>
        ) : holidays.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-6">Nenhum feriado cadastrado.</p>
        ) : (
          <div className="space-y-3">
            {holidays.map((h) => (
              <HolidayCard
                key={h.id}
                holiday={h}
                pathMap={pathMap}
                activePaths={activePaths}
                busy={working}
                onDelete={() => handleDelete(h)}
                onAddShift={(hospital, pathId) => handleAddShift(h, hospital, pathId)}
                onRemoveShift={(hospital, pathId) => handleRemoveShift(h, hospital, pathId)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="font-semibold text-gray-800 mb-1 flex items-center gap-2">
          <Users size={18} className="text-blue-600" />
          Plantões de Feriado por Patologista
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Soma de todos os feriados cadastrados. Esta contagem é informativa e não entra
          no balanceamento da rotina.
        </p>
        {countedPaths.length === 0 ? (
          <p className="text-gray-400 text-sm">Nenhum patologista cadastrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 pr-4 font-semibold text-gray-700">Patologista</th>
                  <th className="text-center py-2 px-2 font-semibold text-blue-700">HAC</th>
                  <th className="text-center py-2 px-2 font-semibold text-emerald-700">HOBRA</th>
                  <th className="text-center py-2 px-2 font-semibold text-gray-700">Total</th>
                </tr>
              </thead>
              <tbody>
                {countedPaths.map((p) => {
                  const c = holidayCounts[p.id] || { HAC: 0, HOBRA: 0 }
                  return (
                    <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-1.5 pr-4 text-gray-800">
                        {p.name}
                        {p.active === false && (
                          <span className="ml-2 text-xs text-red-400">(desligado)</span>
                        )}
                      </td>
                      <td className="text-center py-1.5 px-2 text-gray-700">{c.HAC}</td>
                      <td className="text-center py-1.5 px-2 text-gray-700">{c.HOBRA}</td>
                      <td className="text-center py-1.5 px-2 font-semibold text-gray-800">
                        {c.HAC + c.HOBRA}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/** Um feriado: data, nome e os plantões manuais de cada hospital. */
function HolidayCard({ holiday, pathMap, activePaths, busy, onDelete, onAddShift, onRemoveShift }) {
  const shifts = getHolidayShifts(holiday)

  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="font-semibold text-gray-800">{holiday.name}</p>
          <p className="text-xs text-gray-500 font-mono">
            {holiday.date
              ? format(new Date(holiday.date + 'T12:00:00'), 'dd/MM/yyyy')
              : '—'}
          </p>
        </div>
        <button
          onClick={onDelete}
          className="text-gray-400 hover:text-red-600 transition-colors disabled:opacity-40"
          title="Remover feriado"
          disabled={busy}
        >
          <Trash2 size={15} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {HOSPITALS.map((hospital) => {
          const assigned = shifts.filter((s) => s.hospital === hospital)
          const assignedIds = new Set(assigned.map((s) => s.pathId))
          const options = activePaths.filter((p) => !assignedIds.has(p.id))
          return (
            <div key={hospital} className="border border-gray-100 rounded-lg p-2.5 bg-gray-50/60">
              <p className={`text-xs font-semibold mb-2 ${
                hospital === 'HAC' ? 'text-blue-600' : 'text-emerald-600'
              }`}>
                {hospital}
              </p>

              {assigned.length === 0 ? (
                <p className="text-xs text-gray-400 mb-2">Nenhum plantão cadastrado.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {assigned.map(({ pathId }) => {
                    const p = pathMap[pathId]
                    const bg = p ? pathColor(p) : '#e5e7eb'
                    const fg = getContrastText(bg)
                    return (
                      <span
                        key={pathId}
                        style={{ backgroundColor: bg, color: fg }}
                        className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs"
                      >
                        {p?.name || 'Patologista removido'}
                        <button
                          onClick={() => onRemoveShift(hospital, pathId)}
                          disabled={busy}
                          title="Remover plantão"
                          className="opacity-70 hover:opacity-100 disabled:opacity-30"
                        >
                          <X size={11} />
                        </button>
                      </span>
                    )
                  })}
                </div>
              )}

              <select
                className="text-xs border border-gray-200 rounded px-2 py-1 bg-white w-full disabled:opacity-50"
                value=""
                disabled={busy || options.length === 0}
                onChange={(e) => {
                  const pathId = e.target.value
                  e.target.value = ''
                  onAddShift(hospital, pathId)
                }}
              >
                <option value="">
                  {options.length === 0 ? '— todos já escalados —' : '+ adicionar plantão'}
                </option>
                {options.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )
        })}
      </div>
    </div>
  )
}
