import React, { useEffect, useState } from 'react'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase'
import { Link } from 'react-router-dom'
import { formatMonthYear } from '../utils/dateHelpers'
import { Archive, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'

export default function PreviousSchedules() {
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(true)

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Escalas Anteriores</h1>
        <p className="text-gray-500 text-sm">Histórico de escalas publicadas</p>
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
              <Link
                key={s.id}
                to={`/escalas-anteriores/${s.id}`}
                className="flex items-center justify-between py-3 px-2 hover:bg-gray-50 rounded-lg transition-colors group"
              >
                <div>
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
                <ChevronRight size={18} className="text-gray-400 group-hover:text-blue-600 transition-colors" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
