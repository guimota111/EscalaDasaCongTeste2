import React, { useState } from 'react'
import {
  collection, addDoc, deleteDoc, doc, getDoc, getDocs, setDoc, Timestamp
} from 'firebase/firestore'
import { db } from '../firebase'
import { useCollection } from '../hooks/useCollection'
import { scheduleKey } from '../utils/dateHelpers'
import { computeStats } from '../utils/scheduleAlgorithm'
import { format } from 'date-fns'
import { CalendarDays, Plus, Trash2, RefreshCw } from 'lucide-react'

/**
 * After any holiday change, recompute statistics for the affected month
 * so feriado shifts are correctly categorised.
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

  const newStats = computeStats(schedData.days || {}, paths, holidays)

  await setDoc(doc(db, 'statistics', key), {
    year: schedData.year,
    month: schedData.month,
    shifts: newStats,
  })
}

export default function Holidays() {
  const { data: holidays, loading } = useCollection('holidays', 'date')
  const [date, setDate] = useState('')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [recomputing, setRecomputing] = useState(false)
  const [lastMsg, setLastMsg] = useState('')

  async function handleAdd(e) {
    e.preventDefault()
    if (!date || !name.trim()) return
    setSaving(true)
    setLastMsg('')
    try {
      await addDoc(collection(db, 'holidays'), {
        date,
        name: name.trim(),
        createdAt: Timestamp.now(),
      })
      setDate('')
      setName('')

      // Recompute stats for the month of this holiday
      setRecomputing(true)
      await recomputeStatsForMonth(date)
      setLastMsg(`Estatísticas de ${format(new Date(date + 'T12:00:00'), 'MM/yyyy')} atualizadas.`)
    } finally {
      setSaving(false)
      setRecomputing(false)
    }
  }

  async function handleDelete(holidayId, holidayDate) {
    await deleteDoc(doc(db, 'holidays', holidayId))

    if (holidayDate) {
      setRecomputing(true)
      setLastMsg('')
      try {
        await recomputeStatsForMonth(holidayDate)
        setLastMsg(`Estatísticas de ${format(new Date(holidayDate + 'T12:00:00'), 'MM/yyyy')} atualizadas.`)
      } finally {
        setRecomputing(false)
      }
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Feriados</h1>
        <p className="text-gray-500 text-sm">
          Cadastro manual de feriados — as estatísticas são recalculadas automaticamente ao salvar ou remover.
        </p>
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
          <button type="submit" className="btn-primary" disabled={saving || recomputing}>
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
        <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <CalendarDays size={18} className="text-blue-600" />
          Feriados Cadastrados
        </h2>
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-blue-600" />
          </div>
        ) : holidays.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-6">Nenhum feriado cadastrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 pr-4 font-semibold text-gray-700">Data</th>
                  <th className="text-left py-2 font-semibold text-gray-700">Feriado</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {holidays.map((h) => (
                  <tr key={h.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 pr-4 text-gray-700 font-mono">
                      {h.date ? format(new Date(h.date + 'T12:00:00'), 'dd/MM/yyyy') : '—'}
                    </td>
                    <td className="py-2 text-gray-800">{h.name}</td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => handleDelete(h.id, h.date)}
                        className="text-gray-400 hover:text-red-600 transition-colors"
                        disabled={recomputing}
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
