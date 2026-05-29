import {
  buildMonthDays,
  getMonthWeekendGroups,
  isOnVacation,
  getWeekendSlots,
  HOSPITALS,
} from './dateHelpers'

/**
 * Generate a schedule for a given month.
 *
 * Weekend: entire Fri+Sat+Sun block → same person per hospital.
 * Weekdays (Mon-Thu): Normal-regime only. Each day HAC and HOBRA get
 * different people. Balance by fewest-at-that-hospital first, then fewest-total.
 * Avoid consecutive days when possible.
 */
export function generateSchedule(
  year, month, pathologists, existingStats, holidays,
  prevMonthWeekendAssignments = {}
) {
  const days = buildMonthDays(year, month)
  const weekendGroups = getMonthWeekendGroups(year, month)

  const active = pathologists.filter((p) => p.active !== false)

  function isAvailable(p, dateStr) {
    if (p.active === false) return false
    if (isOnVacation(p, dateStr)) return false
    return true
  }

  // Per-hospital shift counters seeded from historical stats
  const shiftCount = {} // { pathId: { HAC: n, HOBRA: n } }
  for (const p of active) {
    const s = existingStats?.[p.id] || {}
    shiftCount[p.id] = {
      HAC: (s.HAC?.weekday || 0) + (s.HAC?.holiday || 0),
      HOBRA: (s.HOBRA?.weekday || 0) + (s.HOBRA?.holiday || 0),
    }
  }

  function totalShifts(pathId) {
    return (shiftCount[pathId]?.HAC || 0) + (shiftCount[pathId]?.HOBRA || 0)
  }

  const result = {}
  for (const { dateStr } of days) result[dateStr] = { HAC: null, HOBRA: null }

  // Last date each pathologist was assigned (to avoid back-to-back days)
  const lastAssigned = {} // pathId → 'YYYY-MM-DD'

  function wasAssignedOnDate(pathId, dateStr) {
    return lastAssigned[pathId] === dateStr
  }

  function wasAssignedYesterday(pathId, dateStr) {
    if (!lastAssigned[pathId]) return false
    const d1 = new Date(lastAssigned[pathId] + 'T00:00:00Z')
    const d2 = new Date(dateStr + 'T00:00:00Z')
    return (d2 - d1) === 86400000
  }

  function assign(dateStr, hospital, pathId) {
    result[dateStr][hospital] = pathId
    if (!shiftCount[pathId]) shiftCount[pathId] = { HAC: 0, HOBRA: 0 }
    shiftCount[pathId][hospital]++
    lastAssigned[pathId] = dateStr
  }

  // --------------------------------------------------------------------------
  // STEP 1: Fixed-regime pathologists
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
  // STEP 2: Weekend blocks (Fri+Sat+Sun → same person per hospital per slot)
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

    const prev = prevMonthWeekendAssignments?.[slot] || {}
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
      // 3+ people: rotate HOBRA→HAC→folga
      const prevHOBRAIdx = ordered.findIndex((p) => p.id === prev.HOBRA)
      const prevHACIdx = ordered.findIndex((p) => p.id === prev.HAC)
      if (prevHOBRAIdx >= 0) {
        const hacIdx = prevHOBRAIdx
        const usedIdxs = new Set([hacIdx, prevHACIdx >= 0 ? prevHACIdx : -1])
        const hobraIdx = ordered.findIndex((_, i) => !usedIdxs.has(i))
        hacPerson = ordered[hacIdx]
        hobraPerson = hobraIdx >= 0 ? ordered[hobraIdx] : ordered[(hacIdx + 1) % ordered.length]
      } else {
        // No history — assign by fewest hospital shifts
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

  // --------------------------------------------------------------------------
  // STEP 3: Weekdays Mon-Thu — Normal regime only, balanced HAC/HOBRA
  // --------------------------------------------------------------------------
  const normalPaths = active.filter((p) => p.regime === 'normal')

  for (const { dateStr, isWeekday } of days) {
    if (!isWeekday) continue

    // Track who already has a slot today (can't be at two hospitals)
    const todayAssigned = new Set(
      HOSPITALS.map((h) => result[dateStr][h]).filter(Boolean)
    )

    for (const hospital of HOSPITALS) {
      if (result[dateStr][hospital]) continue

      // Pool: available AND not already at the other hospital today
      const available = normalPaths.filter(
        (p) => isAvailable(p, dateStr) && !todayAssigned.has(p.id)
      )
      if (!available.length) continue

      // Prefer not-yesterday; fall back to all available if everyone was yesterday
      const notYesterday = available.filter((p) => !wasAssignedYesterday(p.id, dateStr))
      const pool = notYesterday.length > 0 ? notYesterday : available

      // Sort: 1) fewest shifts at THIS hospital, 2) fewest total shifts
      pool.sort((a, b) => {
        const hDiff = (shiftCount[a.id]?.[hospital] || 0) - (shiftCount[b.id]?.[hospital] || 0)
        if (hDiff !== 0) return hDiff
        return totalShifts(a.id) - totalShifts(b.id)
      })

      const chosen = pool[0]
      assign(dateStr, hospital, chosen.id)
      todayAssigned.add(chosen.id)
    }
  }

  return { schedule: result, weekendAssignments }
}

/**
 * Compute statistics from a published schedule.
 */
export function computeStats(scheduleDays, pathologists, holidays, weekendAssignments = {}) {
  const holidaySet = new Set(
    holidays.map((h) => (typeof h.date === 'string' ? h.date : ''))
  )

  const stats = {}

  function ensure(pathId) {
    if (!stats[pathId]) {
      stats[pathId] = {
        HAC: { weekday: 0, holiday: 0 },
        HOBRA: { weekday: 0, holiday: 0 },
        fifthWeekend: 0,
      }
    }
  }

  for (const [dateStr, day] of Object.entries(scheduleDays)) {
    const isHoliday = holidaySet.has(dateStr)
    const dow = new Date(dateStr + 'T12:00:00').getDay()
    const isWeekday = dow >= 1 && dow <= 4

    for (const hospital of HOSPITALS) {
      const pathId = day[hospital]
      if (!pathId) continue
      ensure(pathId)
      if (isHoliday) {
        stats[pathId][hospital].holiday++
      } else if (isWeekday) {
        stats[pathId][hospital].weekday++
      }
    }
  }

  // 5th weekend tracking
  const fifth = weekendAssignments?.[5]
  if (fifth) {
    for (const hospital of HOSPITALS) {
      if (fifth[hospital]) {
        ensure(fifth[hospital])
        stats[fifth[hospital]].fifthWeekend++
      }
    }
  }

  return stats
}
