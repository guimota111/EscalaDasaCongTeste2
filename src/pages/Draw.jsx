import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useCollection } from '../hooks/useCollection'
import { pathColor, getContrastText } from '../utils/colors'
import { Dices, Users, Trophy, RotateCcw, CheckSquare, Square, History } from 'lucide-react'

const ROLL_MS = 1600
const ROLL_TICK = 70

/** Índice aleatório sem viés, usando o CSPRNG do navegador quando disponível. */
function randomInt(maxExclusive) {
  if (maxExclusive <= 1) return 0
  const crypto = globalThis.crypto
  if (crypto?.getRandomValues) {
    const limit = Math.floor(0xffffffff / maxExclusive) * maxExclusive
    const buf = new Uint32Array(1)
    let v
    do {
      crypto.getRandomValues(buf)
      v = buf[0]
    } while (v >= limit) // descarta o excedente para não enviesar
    return v % maxExclusive
  }
  return Math.floor(Math.random() * maxExclusive)
}

/** Fisher-Yates. */
function shuffle(list) {
  const arr = [...list]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export default function Draw() {
  const { data: pathologists, loading } = useCollection('pathologists', 'name')

  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [winnersCount, setWinnersCount] = useState(1)
  const [rolling, setRolling] = useState(false)
  const [rollName, setRollName] = useState('')
  const [result, setResult] = useState(null)
  const [history, setHistory] = useState([])

  const timers = useRef([])

  useEffect(() => () => timers.current.forEach(clearInterval), [])

  const available = useMemo(
    () => pathologists.filter((p) => p.active !== false),
    [pathologists]
  )

  const participants = useMemo(
    () => available.filter((p) => selectedIds.has(p.id)),
    [available, selectedIds]
  )

  const maxWinners = Math.max(1, participants.length)
  const effectiveWinners = Math.min(winnersCount, maxWinners)
  const canDraw = participants.length >= 2 && !rolling

  function toggle(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setResult(null)
  }

  function selectAll() {
    setSelectedIds(new Set(available.map((p) => p.id)))
    setResult(null)
  }

  function clearAll() {
    setSelectedIds(new Set())
    setResult(null)
  }

  function handleDraw() {
    if (!canDraw) return
    setResult(null)
    setRolling(true)

    const interval = setInterval(() => {
      setRollName(participants[randomInt(participants.length)]?.name || '')
    }, ROLL_TICK)
    timers.current.push(interval)

    const timeout = setTimeout(() => {
      clearInterval(interval)
      // O resultado é sorteado agora — a animação é só visual.
      const order = shuffle(participants)
      const winners = order.slice(0, effectiveWinners)
      const entry = { winners, order, at: new Date() }
      setResult(entry)
      setHistory((h) => [entry, ...h].slice(0, 10))
      setRolling(false)
      setRollName('')
    }, ROLL_MS)
    timers.current.push(timeout)
  }

  function Chip({ p, selected }) {
    const color = pathColor(p)
    return (
      <button
        onClick={() => toggle(p.id)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors text-left ${
          selected
            ? 'border-blue-500 bg-blue-50 text-blue-800 font-medium'
            : 'border-gray-200 text-gray-600 hover:border-gray-300 bg-white'
        }`}
      >
        {selected ? <CheckSquare size={15} className="flex-shrink-0" /> : <Square size={15} className="flex-shrink-0 text-gray-300" />}
        <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <span className="truncate">{p.name}</span>
      </button>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Sorteios</h1>
        <p className="text-gray-500 text-sm">
          Sorteio entre patologistas para resolver disputas. Nada é salvo — o resultado
          vale só nesta tela.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Seleção de participantes */}
          <div className="xl:col-span-2 card">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <Users size={18} className="text-blue-600" />
                Participantes
                <span className="text-sm font-normal text-gray-400">
                  ({participants.length} de {available.length})
                </span>
              </h2>
              <div className="flex gap-2">
                <button className="btn-secondary text-xs py-1.5 px-3" onClick={selectAll}>
                  Selecionar todos
                </button>
                <button className="btn-secondary text-xs py-1.5 px-3" onClick={clearAll}>
                  Limpar
                </button>
              </div>
            </div>

            {available.length === 0 ? (
              <p className="text-gray-400 text-sm">Nenhum patologista ativo cadastrado.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {available.map((p) => (
                  <Chip key={p.id} p={p} selected={selectedIds.has(p.id)} />
                ))}
              </div>
            )}
          </div>

          {/* Sorteio */}
          <div className="space-y-6">
            <div className="card">
              <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Dices size={18} className="text-blue-600" />
                Sortear
              </h2>

              <div className="mb-4">
                <label className="label">Quantos serão sorteados</label>
                <input
                  type="number"
                  className="input"
                  min={1}
                  max={maxWinners}
                  value={winnersCount}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setWinnersCount(Number.isFinite(v) && v >= 1 ? v : 1)
                    setResult(null)
                  }}
                />
                {winnersCount > maxWinners && (
                  <p className="text-[11px] text-amber-600 mt-1">
                    Só há {maxWinners} participante{maxWinners > 1 ? 's' : ''} selecionado{maxWinners > 1 ? 's' : ''}.
                  </p>
                )}
              </div>

              <button
                className="btn-primary w-full justify-center"
                onClick={handleDraw}
                disabled={!canDraw}
              >
                <Dices size={16} />
                {rolling ? 'Sorteando...' : 'Sortear'}
              </button>
              {participants.length < 2 && (
                <p className="text-xs text-gray-400 mt-2 text-center">
                  Selecione ao menos 2 participantes.
                </p>
              )}

              {/* Resultado */}
              {(rolling || result) && (
                <div className="mt-5 pt-5 border-t border-gray-100">
                  {rolling ? (
                    <div className="text-center py-6">
                      <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Sorteando</p>
                      <p className="text-xl font-bold text-gray-400 animate-pulse truncate">
                        {rollName || '…'}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <Trophy size={13} className="text-amber-500" />
                        {result.winners.length > 1 ? 'Sorteados' : 'Sorteado'}
                      </p>
                      <div className="space-y-1.5">
                        {result.winners.map((p, i) => {
                          const bg = pathColor(p)
                          return (
                            <div
                              key={p.id}
                              className="rounded-lg px-3 py-2 font-bold flex items-center gap-2"
                              style={{ backgroundColor: bg, color: getContrastText(bg) }}
                            >
                              {result.winners.length > 1 && (
                                <span className="text-xs opacity-70">{i + 1}º</span>
                              )}
                              <span className="truncate">{p.name}</span>
                            </div>
                          )
                        })}
                      </div>

                      <details className="mt-3">
                        <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                          Ver ordem completa do sorteio
                        </summary>
                        <ol className="mt-2 space-y-0.5 text-xs text-gray-600 list-decimal list-inside">
                          {result.order.map((p) => <li key={p.id} className="truncate">{p.name}</li>)}
                        </ol>
                      </details>

                      <button
                        className="btn-secondary w-full justify-center mt-3 text-xs"
                        onClick={handleDraw}
                      >
                        <RotateCcw size={14} />
                        Sortear de novo
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Histórico da sessão */}
            {history.length > 0 && (
              <div className="card">
                <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2 text-sm">
                  <History size={16} className="text-gray-400" />
                  Sorteios desta sessão
                </h2>
                <div className="space-y-2">
                  {history.map((h, i) => (
                    <div key={i} className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="text-gray-700 truncate">
                        {h.winners.map((p) => p.name).join(', ')}
                      </span>
                      <span className="text-gray-400 flex-shrink-0">
                        {h.at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
