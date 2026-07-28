import React, { useMemo, useState } from 'react'
import { collection, addDoc, deleteDoc, doc, Timestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { formatRestrictionPeriod } from '../utils/restrictions'
import { X, Plus, Trash2, Ban, CalendarRange, CalendarDays } from 'lucide-react'
import { format } from 'date-fns'

/**
 * Cadastro de restrições: dias em que um patologista não pode ser escalado.
 * O patologista deixa de ser opção no seletor do calendário nesses dias.
 */
export default function RestrictionsModal({ pathologists = [], restrictions = [], onClose }) {
  const [pathologistId, setPathologistId] = useState('')
  const [mode, setMode] = useState('single') // 'single' | 'range'
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [hidePast, setHidePast] = useState(true)

  const today = format(new Date(), 'yyyy-MM-dd')

  const activePaths = useMemo(
    () => pathologists.filter((p) => p.active !== false).sort((a, b) => a.name.localeCompare(b.name)),
    [pathologists]
  )

  const nameById = useMemo(() => {
    const m = {}
    for (const p of pathologists) m[p.id] = p.name
    return m
  }, [pathologists])

  const visible = useMemo(() => {
    const list = hidePast ? restrictions.filter((r) => r.end >= today) : restrictions
    return [...list].sort((a, b) => {
      if (a.start !== b.start) return a.start < b.start ? 1 : -1
      return (nameById[a.pathologistId] || '').localeCompare(nameById[b.pathologistId] || '')
    })
  }, [restrictions, hidePast, today, nameById])

  const effectiveEnd = mode === 'single' ? start : end

  async function handleAdd() {
    setError('')
    if (!pathologistId) return setError('Selecione o patologista.')
    if (!start) return setError('Informe a data.')
    if (mode === 'range' && !end) return setError('Informe a data final do período.')
    if (effectiveEnd < start) return setError('A data final não pode ser anterior à inicial.')

    setSaving(true)
    try {
      await addDoc(collection(db, 'restrictions'), {
        pathologistId,
        start,
        end: effectiveEnd,
        reason: reason.trim(),
        createdAt: Timestamp.now(),
      })
      setStart('')
      setEnd('')
      setReason('')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    await deleteDoc(doc(db, 'restrictions', id))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Ban size={18} className="text-red-500" />
            Restrições
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <p className="text-sm text-gray-500">
            Dias em que o patologista não pode entrar na escala. Nesses dias ele deixa
            de aparecer como opção no calendário.
          </p>

          {/* Formulário */}
          <div className="space-y-3 bg-gray-50 rounded-lg p-4 border border-gray-200">
            <div>
              <label className="label">Patologista</label>
              <select
                className="input"
                value={pathologistId}
                onChange={(e) => setPathologistId(e.target.value)}
              >
                <option value="">— selecione —</option>
                {activePaths.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Tipo</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'single', label: 'Data específica', icon: CalendarDays },
                  { value: 'range', label: 'Período', icon: CalendarRange },
                ].map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMode(value)}
                    className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                      mode === value
                        ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <Icon size={15} />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className={mode === 'range' ? 'grid grid-cols-2 gap-3' : ''}>
              <div>
                <label className="label">{mode === 'range' ? 'Início' : 'Data'}</label>
                <input
                  type="date"
                  className="input"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </div>
              {mode === 'range' && (
                <div>
                  <label className="label">Fim</label>
                  <input
                    type="date"
                    className="input"
                    value={end}
                    min={start || undefined}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div>
              <label className="label">Motivo (opcional)</label>
              <input
                className="input"
                placeholder="Ex.: congresso, compromisso pessoal…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <button
              className="btn-primary w-full justify-center"
              onClick={handleAdd}
              disabled={saving}
            >
              <Plus size={16} />
              {saving ? 'Adicionando...' : 'Adicionar restrição'}
            </button>
          </div>

          {/* Lista */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-gray-600 uppercase">
                Cadastradas ({visible.length})
              </h4>
              <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hidePast}
                  onChange={() => setHidePast((v) => !v)}
                  className="rounded border-gray-300 text-blue-600"
                />
                Ocultar passadas
              </label>
            </div>

            {visible.length === 0 ? (
              <p className="text-sm text-gray-400 py-3">Nenhuma restrição cadastrada.</p>
            ) : (
              <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
                {visible.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 truncate">
                        {nameById[r.pathologistId] || 'Patologista removido'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatRestrictionPeriod(r)}
                        {r.reason ? ` — ${r.reason}` : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 rounded transition-colors flex-shrink-0"
                      title="Remover restrição"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
