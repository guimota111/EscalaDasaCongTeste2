import React, { useEffect, useRef, useState } from 'react'
import * as htmlToImage from 'html-to-image'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../firebase'
import { X, Copy, Download, Check, AlertTriangle } from 'lucide-react'
import ScheduleImage from './ScheduleImage'
import CalendarDatePicker from './CalendarDatePicker'

/**
 * Modal para exportar a escala como imagem (calendário) e copiar para a área
 * de transferência. Carrega TODAS as escalas publicadas e só permite escolher
 * dias que tenham alguém escalado (HAC ou HOBRA).
 *
 * defaultStart/defaultEnd: intervalo inicial sugerido (mês aberto pelo usuário).
 */
export default function ExportScheduleModal({ pathMap = {}, defaultStart, defaultEnd, onClose }) {
  const [loading, setLoading] = useState(true)
  const [allDays, setAllDays] = useState({}) // { 'YYYY-MM-DD': { HAC, HOBRA } } global
  const [validList, setValidList] = useState([]) // dias com alguém escalado, ordenados
  const [validSet, setValidSet] = useState(() => new Set())
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [status, setStatus] = useState('idle') // idle | copied | downloaded | error
  const [busy, setBusy] = useState(false)
  const nodeRef = useRef(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const snap = await getDocs(collection(db, 'schedules'))
        const merged = {}
        // Passo 1: pré-divisões (extraDays) — preenchem dias ainda não publicados
        for (const d of snap.docs) {
          const extra = d.data().extraDays
          if (!extra) continue
          for (const [dateStr, slot] of Object.entries(extra)) {
            if (!slot) continue
            merged[dateStr] = { HAC: slot.HAC || null, HOBRA: slot.HOBRA || null }
          }
        }
        // Passo 2: dias oficiais do próprio mês (campo days) — sempre prevalecem
        for (const d of snap.docs) {
          const days = d.data().days
          if (!days) continue
          for (const [dateStr, slot] of Object.entries(days)) {
            if (!slot) continue
            merged[dateStr] = { HAC: slot.HAC || null, HOBRA: slot.HOBRA || null }
          }
        }
        const valid = Object.keys(merged)
          .filter((dateStr) => merged[dateStr].HAC || merged[dateStr].HOBRA)
          .sort()
        setAllDays(merged)
        setValidList(valid)
        setValidSet(new Set(valid))

        // Intervalo inicial: aproxima o mês sugerido para dias válidos
        const firstAfter = valid.find((d) => d >= defaultStart)
        const lastBefore = [...valid].reverse().find((d) => d <= defaultEnd)
        setStart(firstAfter || lastBefore || valid[0] || '')
        setEnd(lastBefore || firstAfter || valid[valid.length - 1] || '')
      } finally {
        setLoading(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const invalid = !start || !end || start > end

  async function handleCopy() {
    if (invalid || busy) return
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
    if (invalid) return
    setBusy(true)
    try {
      const dataUrl = await htmlToImage.toPng(nodeRef.current, { pixelRatio: 2, backgroundColor: '#ffffff' })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `escala_${start}_a_${end}.png`
      a.click()
      setStatus('downloaded')
    } finally {
      setBusy(false)
    }
  }

  const minDate = validList[0]
  const maxDate = validList[validList.length - 1]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Exportar escala como imagem</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : validList.length === 0 ? (
          <div className="px-6 py-16 text-center text-gray-400">
            Nenhuma escala publicada com plantonistas para exportar.
          </div>
        ) : (
          <>
            <div className="px-6 py-4 border-b border-gray-100">
              <div className="flex flex-wrap items-end gap-4">
                <CalendarDatePicker
                  label="Primeiro dia"
                  value={start}
                  onChange={(v) => { setStart(v); setStatus('idle') }}
                  enabledSet={validSet}
                  minDate={minDate}
                  maxDate={maxDate}
                />
                <CalendarDatePicker
                  label="Último dia"
                  value={end}
                  onChange={(v) => { setEnd(v); setStatus('idle') }}
                  enabledSet={validSet}
                  minDate={minDate}
                  maxDate={maxDate}
                />
                <div className="flex items-center gap-2 ml-auto">
                  <button className="btn-secondary" onClick={handleDownload} disabled={invalid || busy}>
                    <Download size={16} />
                    Baixar PNG
                  </button>
                  <button className="btn-primary" onClick={handleCopy} disabled={invalid || busy}>
                    <Copy size={16} />
                    {busy ? 'Gerando...' : 'Copiar imagem'}
                  </button>
                </div>
              </div>

              {invalid && (
                <p className="text-xs text-red-500 mt-2">O primeiro dia deve ser anterior ou igual ao último.</p>
              )}
              {status === 'copied' && (
                <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                  <Check size={14} /> Imagem copiada para a área de transferência.
                </p>
              )}
              {status === 'downloaded' && (
                <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                  <Check size={14} /> Imagem baixada.
                </p>
              )}
              {status === 'error' && (
                <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
                  <AlertTriangle size={14} /> Não foi possível gerar a imagem.
                </p>
              )}
              <p className="text-[11px] text-gray-400 mt-2">
                Só é possível escolher dias com alguém escalado em alguma escala publicada.
              </p>
            </div>

            {/* Pré-visualização (é exatamente o que será exportado) */}
            <div className="flex-1 overflow-auto bg-gray-100 p-4">
              <div className="inline-block shadow-lg">
                <div ref={nodeRef}>
                  <ScheduleImage
                    startStr={start} endStr={end}
                    scheduleDays={allDays} pathMap={pathMap}
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
