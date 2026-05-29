import React, { useState } from 'react'
import { collection, addDoc, deleteDoc, doc, Timestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { useCollection } from '../hooks/useCollection'
import { format } from 'date-fns'
import { CalendarDays, Plus, Trash2 } from 'lucide-react'

export default function Holidays() {
  const { data: holidays, loading } = useCollection('holidays', 'date')
  const [date, setDate] = useState('')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleAdd(e) {
    e.preventDefault()
    if (!date || !name.trim()) return
    setSaving(true)
    try {
      await addDoc(collection(db, 'holidays'), {
        date: date, // store as 'yyyy-MM-dd' string for easy lookup
        name: name.trim(),
        createdAt: Timestamp.now(),
      })
      setDate('')
      setName('')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    await deleteDoc(doc(db, 'holidays', id))
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Feriados</h1>
        <p className="text-gray-500 text-sm">Cadastro manual de feriados</p>
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
          <button type="submit" className="btn-primary" disabled={saving}>
            <Plus size={16} />
            {saving ? 'Adicionando...' : 'Adicionar'}
          </button>
        </form>
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
                        onClick={() => handleDelete(h.id)}
                        className="text-gray-400 hover:text-red-600 transition-colors"
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
