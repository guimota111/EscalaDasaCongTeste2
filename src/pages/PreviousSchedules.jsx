import React, { useEffect, useState } from 'react'
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore'
import { db } from '../firebase'
import { Link } from 'react-router-dom'
import { formatMonthYear } from '../utils/dateHelpers'
import { Archive, ChevronRight, Trash2, X } from 'lucide-react'
import { format } from 'date-fns'

export default function PreviousSchedules() {
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    async function load() {
      const snap = await getDocs(collection(db, 'schedules'))
      const data = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => b.id.localeCompare(a.id))
      setSchedules(data)
      setLoading(false)
    }
    load()
  }, [])

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      // Remove both the schedule and its derived statistics document
      await deleteDoc(doc(db, 'schedules', deleteTarget.id))
      await deleteDoc(doc(db, 'statistics', deleteTarget.id))
      setSchedules((prev) => prev.filter((s) => s.id !== deleteTarget.id))
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Todas as Escalas</h1>
        <p className="text-gray-500 text-sm">Escalas publicadas (passadas e futuras)</p>
      </div>

      <div className="card">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-blue-600" />
          </div>
        ) : schedules.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <Archive size={40} className="text-gray-300 mb-3" />
            <p className="text-gray-500">Nenhuma escala publicada ainda.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {schedules.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2 hover:bg-gray-50 rounded-lg transition-colors group"
              >
                <Link
                  to={`/escalas-anteriores/${s.id}`}
                  className="flex-1 flex items-center justify-between py-3 px-2 min-w-0"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-800">
                      {formatMonthYear(s.year, s.month)}
                    </p>
                    {s.publishedAt && (
                      <p className="text-xs text-gray-400">
                        Publicado em{' '}
                        {format(s.publishedAt.toDate(), 'dd/MM/yyyy HH:mm')}
                      </p>
                    )}
                  </div>
                  <ChevronRight size={18} className="text-gray-400 group-hover:text-blue-600 transition-colors flex-shrink-0" />
                </Link>
                <button
                  onClick={() => setDeleteTarget(s)}
                  className="p-2 mr-1 text-gray-300 hover:text-red-600 rounded transition-colors flex-shrink-0"
                  title="Apagar escala"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Apagar Escala</h3>
              <button onClick={() => setDeleteTarget(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                Tem certeza que deseja apagar a escala de{' '}
                <strong>{formatMonthYear(deleteTarget.year, deleteTarget.month)}</strong>?
                As estatísticas desse mês também serão removidas. Esta ação não pode ser desfeita.
              </p>
              <div className="flex justify-end gap-2">
                <button className="btn-secondary" onClick={() => setDeleteTarget(null)}>Cancelar</button>
                <button className="btn-danger" onClick={confirmDelete} disabled={deleting}>
                  {deleting ? 'Apagando...' : 'Apagar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
