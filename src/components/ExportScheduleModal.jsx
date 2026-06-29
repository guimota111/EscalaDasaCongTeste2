import React, { useRef, useState } from 'react'
import * as htmlToImage from 'html-to-image'
import { X, Copy, Download, Check, AlertTriangle } from 'lucide-react'
import ScheduleImage from './ScheduleImage'

/**
 * Modal para exportar a escala como imagem (calendário) e copiar para a área de transferência.
 * scheduleDays: mapa combinado { 'YYYY-MM-DD': { HAC, HOBRA } } (dias do mês + extras)
 * minDate/maxDate: limites selecionáveis; defaultStart/defaultEnd: intervalo inicial.
 */
export default function ExportScheduleModal({
  scheduleDays = {}, pathMap = {},
  minDate, maxDate, defaultStart, defaultEnd, onClose,
}) {
  const [start, setStart] = useState(defaultStart || minDate)
  const [end, setEnd] = useState(defaultEnd || maxDate)
  const [status, setStatus] = useState('idle') // idle | copied | downloaded | error
  const [busy, setBusy] = useState(false)
  const nodeRef = useRef(null)

  const invalid = !start || !end || start > end

  async function buildBlob() {
    return htmlToImage.toBlob(nodeRef.current, { pixelRatio: 2, backgroundColor: '#ffffff' })
  }

  async function handleCopy() {
    if (invalid || busy) return
    setBusy(true)
    setStatus('idle')
    try {
      const blob = await buildBlob()
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })])
      setStatus('copied')
    } catch (e) {
      // Navegador sem suporte a copiar imagem → cai para download
      try {
        await handleDownload()
      } catch {
        setStatus('error')
      }
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Exportar escala como imagem</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="label">Primeiro dia</label>
              <input
                type="date" className="input w-auto"
                value={start} min={minDate} max={maxDate}
                onChange={(e) => { setStart(e.target.value); setStatus('idle') }}
              />
            </div>
            <div>
              <label className="label">Último dia</label>
              <input
                type="date" className="input w-auto"
                value={end} min={minDate} max={maxDate}
                onChange={(e) => { setEnd(e.target.value); setStatus('idle') }}
              />
            </div>
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
        </div>

        {/* Pré-visualização (é exatamente o que será exportado) */}
        <div className="flex-1 overflow-auto bg-gray-100 p-4">
          <div className="inline-block shadow-lg">
            <div ref={nodeRef}>
              <ScheduleImage
                startStr={start} endStr={end}
                scheduleDays={scheduleDays} pathMap={pathMap}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
