import React, { useState } from 'react'
import {
  collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, Timestamp
} from 'firebase/firestore'
import { db } from '../firebase'
import { useCollection } from '../hooks/useCollection'
import {
  REGIME_LABELS, WEEKDAY_FULL, HOSPITALS, tsToDateStr
} from '../utils/dateHelpers'
import {
  UserPlus, Edit2, Trash2, PowerOff, CalendarPlus, X, Check, ChevronDown, ChevronUp
} from 'lucide-react'

const WEEKEND_SLOTS = [
  { value: 1, label: '1º Final de Semana' },
  { value: 2, label: '2º Final de Semana' },
  { value: 3, label: '3º Final de Semana' },
  { value: 4, label: '4º Final de Semana' },
]

function emptyForm() {
  return { name: '', regime: 'normal', weekendSlot: 1, fixedDays: [] }
}

export default function Pathologists() {
  const { data: pathologists, loading } = useCollection('pathologists', 'name')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [expandedId, setExpandedId] = useState(null)

  // Modal states
  const [deactivateModal, setDeactivateModal] = useState(null)
  const [deactivateDate, setDeactivateDate] = useState('')
  const [vacationModal, setVacationModal] = useState(null)
  const [vacStart, setVacStart] = useState('')
  const [vacEnd, setVacEnd] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [saving, setSaving] = useState(false)

  function openAdd() {
    setEditId(null)
    setForm(emptyForm())
    setShowForm(true)
  }

  function openEdit(p) {
    setEditId(p.id)
    setForm({
      name: p.name || '',
      regime: p.regime || 'normal',
      weekendSlot: p.weekendSlot || 1,
      fixedDays: p.fixedDays || [],
    })
    setShowForm(true)
  }

  async function saveForm() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const data = {
        name: form.name.trim(),
        regime: form.regime,
        weekendSlot: form.weekendSlot,
        fixedDays: form.regime === 'fixed' ? form.fixedDays : [],
        active: true,
      }
      if (editId) {
        await updateDoc(doc(db, 'pathologists', editId), data)
      } else {
        await addDoc(collection(db, 'pathologists'), { ...data, vacations: [], deactivationDate: null })
      }
      setShowForm(false)
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteConfirm) return
    await deleteDoc(doc(db, 'pathologists', deleteConfirm))
    setDeleteConfirm(null)
  }

  async function confirmDeactivate() {
    if (!deactivateModal || !deactivateDate) return
    await updateDoc(doc(db, 'pathologists', deactivateModal), {
      active: false,
      deactivationDate: Timestamp.fromDate(new Date(deactivateDate)),
    })
    setDeactivateModal(null)
    setDeactivateDate('')
  }

  async function reactivate(id) {
    await updateDoc(doc(db, 'pathologists', id), { active: true, deactivationDate: null })
  }

  async function addVacation() {
    if (!vacationModal || !vacStart || !vacEnd) return
    const p = pathologists.find((x) => x.id === vacationModal)
    if (!p) return
    const vacations = [...(p.vacations || []), {
      start: Timestamp.fromDate(new Date(vacStart)),
      end: Timestamp.fromDate(new Date(vacEnd)),
    }]
    await updateDoc(doc(db, 'pathologists', vacationModal), { vacations })
    setVacationModal(null)
    setVacStart('')
    setVacEnd('')
  }

  async function removeVacation(pathId, index) {
    const p = pathologists.find((x) => x.id === pathId)
    if (!p) return
    const vacations = (p.vacations || []).filter((_, i) => i !== index)
    await updateDoc(doc(db, 'pathologists', pathId), { vacations })
  }

  function toggleFixedDay(dow, hospital) {
    const existing = form.fixedDays.findIndex((fd) => fd.day === dow && fd.hospital === hospital)
    if (existing >= 0) {
      setForm((f) => ({ ...f, fixedDays: f.fixedDays.filter((_, i) => i !== existing) }))
    } else {
      setForm((f) => ({ ...f, fixedDays: [...f.fixedDays, { day: dow, hospital }] }))
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Patologistas</h1>
          <p className="text-gray-500 text-sm">Gerenciamento de patologistas</p>
        </div>
        <button className="btn-primary" onClick={openAdd}>
          <UserPlus size={16} />
          Adicionar
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : (
        <div className="space-y-3">
          {pathologists.length === 0 && (
            <div className="card text-center text-gray-400 py-10">
              Nenhum patologista cadastrado ainda.
            </div>
          )}
          {pathologists.map((p) => (
            <div key={p.id} className={`card p-0 overflow-hidden ${!p.active && 'opacity-70'}`}>
              <div className="flex items-center px-4 py-3 gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">{p.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      p.regime === 'normal' ? 'bg-blue-100 text-blue-700' :
                      p.regime === 'weekend' ? 'bg-purple-100 text-purple-700' :
                      'bg-orange-100 text-orange-700'
                    }`}>
                      {REGIME_LABELS[p.regime] || p.regime}
                    </span>
                    {p.weekendSlot && (
                      <span className="text-xs text-gray-500">
                        {WEEKEND_SLOTS.find(s => s.value === p.weekendSlot)?.label}
                      </span>
                    )}
                    {!p.active && (
                      <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                        Desligado {p.deactivationDate ? tsToDateStr(p.deactivationDate) : ''}
                      </span>
                    )}
                  </div>
                  {p.regime === 'fixed' && p.fixedDays?.length > 0 && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      Dias fixos: {p.fixedDays.map(fd => `${WEEKDAY_FULL[fd.day]} (${fd.hospital})`).join(', ')}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => openEdit(p)}
                    className="p-1.5 text-gray-400 hover:text-blue-600 rounded transition-colors"
                    title="Editar"
                  >
                    <Edit2 size={15} />
                  </button>
                  {p.active ? (
                    <button
                      onClick={() => { setDeactivateModal(p.id); setDeactivateDate('') }}
                      className="p-1.5 text-gray-400 hover:text-orange-500 rounded transition-colors"
                      title="Desligar"
                    >
                      <PowerOff size={15} />
                    </button>
                  ) : (
                    <button
                      onClick={() => reactivate(p.id)}
                      className="p-1.5 text-gray-400 hover:text-green-600 rounded transition-colors"
                      title="Reativar"
                    >
                      <Check size={15} />
                    </button>
                  )}
                  <button
                    onClick={() => { setVacationModal(p.id); setVacStart(''); setVacEnd('') }}
                    className="p-1.5 text-gray-400 hover:text-teal-600 rounded transition-colors"
                    title="Adicionar férias"
                  >
                    <CalendarPlus size={15} />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(p.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 rounded transition-colors"
                    title="Deletar"
                  >
                    <Trash2 size={15} />
                  </button>
                  <button
                    onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition-colors"
                  >
                    {expandedId === p.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                </div>
              </div>

              {expandedId === p.id && (
                <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
                  <h4 className="text-xs font-semibold text-gray-600 uppercase mb-2">Férias / Ausências</h4>
                  {(!p.vacations || p.vacations.length === 0) ? (
                    <p className="text-xs text-gray-400">Nenhuma férias cadastrada.</p>
                  ) : (
                    <div className="space-y-1">
                      {p.vacations.map((v, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-gray-600">
                          <span>{tsToDateStr(v.start)} → {tsToDateStr(v.end)}</span>
                          <button
                            onClick={() => removeVacation(p.id, i)}
                            className="text-red-400 hover:text-red-600"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showForm && (
        <Modal title={editId ? 'Editar Patologista' : 'Adicionar Patologista'} onClose={() => setShowForm(false)}>
          <div className="space-y-4">
            <div>
              <label className="label">Nome</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                autoFocus
              />
            </div>
            <div>
              <label className="label">Regime</label>
              <select
                className="input"
                value={form.regime}
                onChange={(e) => setForm((f) => ({ ...f, regime: e.target.value }))}
              >
                {Object.entries(REGIME_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Final de Semana</label>
              <select
                className="input"
                value={form.weekendSlot}
                onChange={(e) => setForm((f) => ({ ...f, weekendSlot: Number(e.target.value) }))}
              >
                {WEEKEND_SLOTS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            {form.regime === 'fixed' && (
              <div>
                <label className="label">Dias Fixos</label>
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((dow) => (
                    <div key={dow} className="flex items-center gap-3">
                      <span className="text-sm text-gray-600 w-16">{WEEKDAY_FULL[dow]}</span>
                      {HOSPITALS.map((h) => {
                        const checked = form.fixedDays.some(fd => fd.day === dow && fd.hospital === h)
                        return (
                          <label key={h} className="flex items-center gap-1 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleFixedDay(dow, h)}
                              className="rounded border-gray-300 text-blue-600"
                            />
                            {h}
                          </label>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
              <button className="btn-primary" onClick={saveForm} disabled={saving || !form.name.trim()}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Deactivate Modal */}
      {deactivateModal && (
        <Modal title="Desligar Patologista" onClose={() => setDeactivateModal(null)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Informe a data de desligamento. O patologista não entrará em novas escalas, mas permanecerá nas estatísticas históricas.
            </p>
            <div>
              <label className="label">Data de Desligamento</label>
              <input
                type="date"
                className="input"
                value={deactivateDate}
                onChange={(e) => setDeactivateDate(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setDeactivateModal(null)}>Cancelar</button>
              <button
                className="btn-danger"
                onClick={confirmDeactivate}
                disabled={!deactivateDate}
              >
                Desligar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Vacation Modal */}
      {vacationModal && (
        <Modal title="Adicionar Férias" onClose={() => setVacationModal(null)}>
          <div className="space-y-4">
            <div>
              <label className="label">Data de Início</label>
              <input type="date" className="input" value={vacStart} onChange={(e) => setVacStart(e.target.value)} />
            </div>
            <div>
              <label className="label">Data de Término</label>
              <input type="date" className="input" value={vacEnd} onChange={(e) => setVacEnd(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setVacationModal(null)}>Cancelar</button>
              <button
                className="btn-primary"
                onClick={addVacation}
                disabled={!vacStart || !vacEnd || vacEnd < vacStart}
              >
                Adicionar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <Modal title="Confirmar Exclusão" onClose={() => setDeleteConfirm(null)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Tem certeza que deseja excluir este patologista? Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancelar</button>
              <button className="btn-danger" onClick={confirmDelete}>Excluir</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}
