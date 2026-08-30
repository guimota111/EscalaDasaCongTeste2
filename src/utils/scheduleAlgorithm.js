import {
  buildMonthDays,
  getMonthWeekendGroups,
  getWeekendSlotOfDate,
  isOnVacation,
  getWeekendSlots,
  HOSPITALS,
} from './dateHelpers'
import { isRestricted } from './restrictions'

/**
 * Monta o esqueleto da escala de um mês.
 *
 * A divisão da rotina (Seg-Qui) NÃO é feita automaticamente: esses dias saem
 * em branco para o usuário preencher manualmente no calendário. O gerador
 * preenche apenas o que é determinado por regra:
 *
 *   - dias já divididos na antecipação do mês anterior (lockedDays);
 *   - patologistas de Plantão Fixo nos seus dias fixos;
 *   - blocos de final de semana (Sex+Sáb+Dom) conforme o slot de cada um.
 */
export function generateSchedule({
  year,
  month,
  pathologists = [],
  existingStats = {},
  prevWeekendAssignments = {},
  lockedDays = {},
  restrictions = [],
}) {
  const days = buildMonthDays(year, month)
  const weekendGroups = getMonthWeekendGroups(year, month)

  const active = pathologists.filter((p) => p.active !== false)

  function isAvailable(p, dateStr) {
    if (p.active === false) return false
    if (isOnVacation(p, dateStr)) return false
    if (isRestricted(restrictions, p.id, dateStr)) return false
    return true
  }

  // Contadores por hospital, semeados com o histórico (desempate dos FDS).
  // Feriados não entram: eles têm contabilidade manual e ficam fora do balanceamento.
  const shiftCount = {} // { pathId: { HAC: n, HOBRA: n } }
  for (const p of active) {
    const s = existingStats?.[p.id] || {}
    shiftCount[p.id] = {
      HAC: s.HAC?.weekday || 0,
      HOBRA: s.HOBRA?.weekday || 0,
    }
  }

  const result = {}
  for (const { dateStr } of days) result[dateStr] = { HAC: null, HOBRA: null }

  function assign(dateStr, hospital, pathId) {
    result[dateStr][hospital] = pathId
    if (!shiftCount[pathId]) shiftCount[pathId] = { HAC: 0, HOBRA: 0 }
    shiftCount[pathId][hospital]++
  }

  // --------------------------------------------------------------------------
  // ETAPA 0: dias já divididos durante a geração do mês anterior.
  // Pertencem a ESTE mês e devem ser honrados exatamente como ficaram.
  // Semeados primeiro para que nada os sobrescreva.
  // --------------------------------------------------------------------------
  for (const [dateStr, slot] of Object.entries(lockedDays || {})) {
    if (!result[dateStr]) continue // só dias que caem dentro deste mês
    for (const hospital of HOSPITALS) {
      const pathId = slot?.[hospital]
      if (pathId) assign(dateStr, hospital, pathId)
    }
  }

  // --------------------------------------------------------------------------
  // ETAPA 1: patologistas de Plantão Fixo
  // --------------------------------------------------------------------------
  const fixedPaths = active.filter((p) => p.regime === 'fixed')
  for (const { dateStr, dow } of days) {
    for (const p of fixedPaths) {
      if (!isAvailable(p, dateStr)) continue
      for (const fd of (p.fixedDays || [])) {
        if (fd.day === dow && fd.hospital && !result[dateStr][fd.hospital]) {
          assign(dateStr, fd.hospital, p.id)
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // ETAPA 2: blocos de final de semana (Sex+Sáb+Dom → mesma pessoa por hospital)
  // --------------------------------------------------------------------------
  const slotGroups = {}
  for (const p of active) {
    for (const slot of getWeekendSlots(p)) {
      if (!slotGroups[slot]) slotGroups[slot] = []
      slotGroups[slot].push(p)
    }
  }

  const weekendAssignments = {}

  for (const [slotStr, slotDays] of Object.entries(weekendGroups)) {
    const slot = Number(slotStr)
    const group = slotGroups[slot] || []
    const friday = slotDays.find((d) => d.dow === 5)
    const refDate = friday ? friday.dateStr : slotDays[0]?.dateStr
    const available = group.filter((p) => isAvailable(p, refDate))

    const prev = prevWeekendAssignments?.[slot] || {}
    const ordered = [...available].sort((a, b) => a.name.localeCompare(b.name))

    let hacPerson = null
    let hobraPerson = null

    if (ordered.length === 0) {
      // nothing
    } else if (ordered.length === 1) {
      hacPerson = ordered[0]
      hobraPerson = ordered[0]
    } else if (ordered.length === 2) {
      if (prev.HAC && prev.HAC === ordered[0]?.id) {
        hacPerson = ordered[1]; hobraPerson = ordered[0]
      } else {
        hacPerson = ordered[0]; hobraPerson = ordered[1]
      }
    } else {
      // 3+ pessoas: rotaciona HOBRA→HAC→folga
      const prevHOBRAIdx = ordered.findIndex((p) => p.id === prev.HOBRA)
      const prevHACIdx = ordered.findIndex((p) => p.id === prev.HAC)
      if (prevHOBRAIdx >= 0) {
        const hacIdx = prevHOBRAIdx
        const usedIdxs = new Set([hacIdx, prevHACIdx >= 0 ? prevHACIdx : -1])
        const hobraIdx = ordered.findIndex((_, i) => !usedIdxs.has(i))
        hacPerson = ordered[hacIdx]
        hobraPerson = hobraIdx >= 0 ? ordered[hobraIdx] : ordered[(hacIdx + 1) % ordered.length]
      } else {
        // Sem histórico — atribui por menor número de plantões no hospital
        const sortedByHAC = [...ordered].sort((a, b) =>
          (shiftCount[a.id]?.HAC || 0) - (shiftCount[b.id]?.HAC || 0)
        )
        hacPerson = sortedByHAC[0]
        const sortedByHOBRA = [...ordered]
          .filter((p) => p.id !== hacPerson.id)
          .sort((a, b) => (shiftCount[a.id]?.HOBRA || 0) - (shiftCount[b.id]?.HOBRA || 0))
        hobraPerson = sortedByHOBRA[0] || null
      }
    }

    weekendAssignments[slot] = {
      HAC: hacPerson?.id || null,
      HOBRA: hobraPerson?.id || null,
    }

    for (const { dateStr } of slotDays) {
      for (const hospital of HOSPITALS) {
        if (result[dateStr][hospital]) continue
        const person = hospital === 'HAC' ? hacPerson : hobraPerson
        if (person && isAvailable(person, dateStr)) {
          assign(dateStr, hospital, person.id)
        }
      }
    }
  }

  return { schedule: result, weekendAssignments }
}

/** Entrada zerada de estatística, com a mesma forma usada em todo o app. */
export function emptyStatEntry() {
  return {
    HAC: { weekday: 0, holiday: 0, mon: 0, wed: 0 },
    HOBRA: { weekday: 0, holiday: 0, mon: 0, wed: 0 },
    fifthWeekend: 0,
  }
}

/**
 * Soma vários mapas de estatísticas ({ [pathId]: statEntry }) em um só.
 * Usado pelo balanceamento "Total" (mês em edição + histórico publicado).
 */
export function mergeStatsMaps(...maps) {
  const out = {}
  for (const map of maps) {
    for (const [pathId, s] of Object.entries(map || {})) {
      if (!out[pathId]) out[pathId] = emptyStatEntry()
      for (const h of HOSPITALS) {
        out[pathId][h].weekday += s?.[h]?.weekday || 0
        out[pathId][h].holiday += s?.[h]?.holiday || 0
        out[pathId][h].mon += s?.[h]?.mon || 0
        out[pathId][h].wed += s?.[h]?.wed || 0
      }
      out[pathId].fifthWeekend += s?.fifthWeekend || 0
    }
  }
  return out
}

/**
 * Dias em que a mesma pessoa aparece nos dois hospitais.
 * Retorna um Set de 'YYYY-MM-DD'.
 */
export function findDoubleBookedDates(scheduleDays = {}) {
  const conflicts = new Set()
  for (const [dateStr, slot] of Object.entries(scheduleDays)) {
    if (slot?.HAC && slot.HAC === slot.HOBRA) conflicts.add(dateStr)
  }
  return conflicts
}

/** Normaliza a lista de plantões manuais de um feriado. */
export function getHolidayShifts(holiday) {
  if (!Array.isArray(holiday?.shifts)) return []
  return holiday.shifts
    .filter((sh) => sh && sh.pathId && HOSPITALS.includes(sh.hospital))
    .map((sh) => ({ pathId: sh.pathId, hospital: sh.hospital }))
}

/** Set com as datas ('YYYY-MM-DD') marcadas como feriado. */
export function holidayDateSet(holidays = []) {
  return new Set(
    (holidays || [])
      .map((h) => (typeof h?.date === 'string' ? h.date : ''))
      .filter(Boolean)
  )
}

/**
 * Contabilidade MANUAL dos feriados.
 *
 * Cada feriado guarda seus próprios plantões (`shifts`), cadastrados na aba
 * Feriados — um por patologista/hospital. Nada aqui vem da escala.
 *
 * `filter` restringe quais feriados entram:
 *   - string 'YYYY-MM' → só os feriados daquele mês;
 *   - função (dateStr, holiday) => boolean;
 *   - ausente → todos.
 */
export function computeHolidayStats(holidays = [], filter) {
  const match = (dateStr, h) => {
    if (!dateStr) return false
    if (typeof filter === 'string') return dateStr.slice(0, 7) === filter
    if (typeof filter === 'function') return !!filter(dateStr, h)
    return true
  }

  const stats = {}
  for (const h of holidays || []) {
    const dateStr = typeof h?.date === 'string' ? h.date : ''
    if (!match(dateStr, h)) continue
    for (const { pathId, hospital } of getHolidayShifts(h)) {
      if (!stats[pathId]) stats[pathId] = emptyStatEntry()
      stats[pathId][hospital].holiday++
    }
  }
  return stats
}

/**
 * Estatísticas de uma escala publicada.
 *
 * Dias marcados como feriado ficam de fora por completo: eles não entram em
 * nenhum balanceamento (nem Seg-Qui, nem Seg/Qua, nem 5º FDS). A contagem de
 * feriados é manual e vem de `computeHolidayStats`.
 *
 * O 5º final de semana é derivado dos dias da escala (e não de
 * `weekendAssignments`) para refletir edições manuais nessas células.
 */
export function computeStats(scheduleDays, pathologists, holidays) {
  const holidaySet = holidayDateSet(holidays)

  const stats = {}

  function ensure(pathId) {
    if (!stats[pathId]) stats[pathId] = emptyStatEntry()
  }

  // Find which dates belong to the 5th weekend of their month
  const fifthWeekendDates = new Set()
  for (const dateStr of Object.keys(scheduleDays)) {
    if (holidaySet.has(dateStr)) continue
    const date = new Date(dateStr + 'T12:00:00')
    const slot = getWeekendSlotOfDate(date)
    if (slot === 5) fifthWeekendDates.add(dateStr)
  }

  // Track which pathologists already counted for 5th weekend (count once per weekend, not per day)
  const fifthWeekendCounted = new Set() // `${pathId}-${hospital}`

  for (const [dateStr, day] of Object.entries(scheduleDays)) {
    // Feriado: o dia inteiro sai da contabilidade automática.
    if (holidaySet.has(dateStr)) continue

    const dow = new Date(dateStr + 'T12:00:00').getDay()
    const isWeekday = dow >= 1 && dow <= 4
    const isFifthWeekend = fifthWeekendDates.has(dateStr)

    for (const hospital of HOSPITALS) {
      const pathId = day[hospital]
      if (!pathId) continue
      ensure(pathId)

      if (isWeekday) {
        stats[pathId][hospital].weekday++
        // Segmentação Seg-Qui: contar segundas (dow 1) e quartas (dow 3) separadamente
        if (dow === 1) stats[pathId][hospital].mon++
        else if (dow === 3) stats[pathId][hospital].wed++
      }

      // Count 5th weekend once per pathologist per hospital (not once per day)
      if (isFifthWeekend) {
        const key = `${pathId}-${hospital}`
        if (!fifthWeekendCounted.has(key)) {
          stats[pathId].fifthWeekend++
          fifthWeekendCounted.add(key)
        }
      }
    }
  }

  return stats
}

/**
 * Estatísticas completas de um mês: escala (sem os feriados) + os plantões de
 * feriado cadastrados manualmente para aquele mês.
 * `monthKey` é 'YYYY-MM'.
 */
export function computeMonthStats(scheduleDays, pathologists, holidays, monthKey) {
  return mergeStatsMaps(
    computeStats(scheduleDays, pathologists, holidays),
    computeHolidayStats(holidays, monthKey)
  )
}

/** Soma usada em todo balanceamento — feriados ficam de fora. */
export function balanceTotal(statEntry, hospitals = HOSPITALS) {
  return hospitals.reduce((sum, h) => sum + (statEntry?.[h]?.weekday || 0), 0)
}
