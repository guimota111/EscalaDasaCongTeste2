import { isOnVacation } from './dateHelpers'

/**
 * Restrições de escala — dias em que um patologista não pode ser escalado.
 *
 * Documento da coleção `restrictions`:
 *   { pathologistId, start: 'YYYY-MM-DD', end: 'YYYY-MM-DD', reason?: string }
 *
 * Data específica = start e end iguais. Como as chaves da escala também são
 * 'YYYY-MM-DD', a comparação é feita como string (evita fuso horário).
 */

/** Restrições que cobrem uma data, para um patologista. */
export function restrictionsFor(restrictions, pathId, dateStr) {
  if (!restrictions?.length || !pathId || !dateStr) return []
  return restrictions.filter(
    (r) => r.pathologistId === pathId && r.start <= dateStr && dateStr <= r.end
  )
}

export function isRestricted(restrictions, pathId, dateStr) {
  return restrictionsFor(restrictions, pathId, dateStr).length > 0
}

/** Texto legível de uma restrição: "05/08/2026" ou "05/08/2026 → 12/08/2026". */
export function formatRestrictionPeriod(r) {
  const br = (s) => {
    if (!s) return '—'
    const [y, m, d] = s.split('-')
    return `${d}/${m}/${y}`
  }
  return r.start === r.end ? br(r.start) : `${br(r.start)} → ${br(r.end)}`
}

/**
 * Cria a função que decide se um patologista pode entrar na escala num dia.
 * Retorna o motivo do bloqueio (string) ou null quando está liberado.
 *
 * Usada tanto pelo gerador quanto pelos seletores do calendário, para que a
 * regra de disponibilidade seja idêntica nos dois lugares.
 */
export function makeUnavailabilityChecker(pathologists = [], restrictions = []) {
  const byId = {}
  for (const p of pathologists) byId[p.id] = p

  return function unavailableReason(pathId, dateStr) {
    const p = byId[pathId]
    if (!p) return null
    if (p.active === false) return 'Desligado'
    if (isOnVacation(p, dateStr)) return 'Em férias'
    const [r] = restrictionsFor(restrictions, pathId, dateStr)
    if (r) return r.reason?.trim() ? `Restrição: ${r.reason.trim()}` : 'Restrição cadastrada'
    return null
  }
}
