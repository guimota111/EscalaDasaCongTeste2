import {
  buildMonthDays,
  getMonthWeekendGroups,
  getWeekendSlotOfDate,
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
  prevMonthWeekendAssignments = {}, lockedDays = {}
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
  // STEP 0: Pre-divided days carried over from the previous month's generation.
  // These belong to THIS month (e.g. the user added the first days of this
  // month while dividing the previous one) and must be honored exactly.
  // Seeded first so all later steps skip them via the `if (result[...]) continue`
  // guards, and so fixed/weekend assignments never overwrite a manual division.
  // --------------------------------------------------------------------------
  const lockedSet = new Set()
  for (const [dateStr, slot] of Object.entries(lockedDays || {})) {
    if (!result[dateStr]) continue // only days that fall inside this month
    let any = false
    for (const hospital of HOSPITALS) {
      const pathId = slot?.[hospital]
      if (pathId) { assign(dateStr, hospital, pathId); any = true }
    }
    if (any) lockedSet.add(dateStr)
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
  // STEP 3: Weekdays Mon-Thu — Normal regime, score-based fair distribution
  //
  // Goals (in priority order):
  //   1. Every available pathologist gets at least 1 shift
  //   2. Total shifts (HAC+HOBRA) as equal as possible across pathologists
  //   3. HAC and HOBRA counts balanced per pathologist
  //   4. Avoid consecutive days
  // --------------------------------------------------------------------------
  const normalPaths = active.filter((p) => p.regime === 'normal')
  const weekdayDates = days.filter((d) => d.isWeekday)

  // Per-month shift counters (separate from historical, for within-month balance)
  const monthCount = {} // { pathId: { HAC: n, HOBRA: n } }
  for (const p of normalPaths) monthCount[p.id] = { HAC: 0, HOBRA: 0 }

  // Account for pre-divided (locked) weekday assignments already placed in STEP 0
  // so within-month balance treats them as real shifts already taken.
  for (const { dateStr, isWeekday } of days) {
    if (!isWeekday) continue
    for (const hospital of HOSPITALS) {
      const pid = result[dateStr][hospital]
      if (pid && monthCount[pid]) monthCount[pid][hospital]++
    }
  }

  function monthTotal(pathId) {
    return (monthCount[pathId]?.HAC || 0) + (monthCount[pathId]?.HOBRA || 0)
  }

  // Count how many weekdays each pathologist is available this month
  const availableDays = {}
  for (const p of normalPaths) {
    availableDays[p.id] = weekdayDates.filter((d) => isAvailable(p, d.dateStr)).length
  }

  // Target shifts per pathologist this month, proportional to availability.
  // Total slots = weekdayDates.length * 2 (one HAC + one HOBRA per day).
  const totalSlots = weekdayDates.length * 2
  const totalAvailDays = normalPaths.reduce((s, p) => s + availableDays[p.id], 0)

  function targetTotal(pathId) {
    if (!totalAvailDays) return 0
    return (totalSlots * availableDays[pathId]) / totalAvailDays
  }

  function targetPerHospital(pathId) {
    return targetTotal(pathId) / 2
  }

  // Score: higher = more urgently needs a shift at this hospital.
  // Uses monthly counts as primary signal; consecutive-day penalty.
  function score(p, hospital, dateStr) {
    const totalNeed = targetTotal(p.id) - monthTotal(p.id)        // main fairness
    const hospNeed = targetPerHospital(p.id) - (monthCount[p.id]?.[hospital] || 0) // HAC/HOBRA balance
    const histPenalty = totalShifts(p.id) * 0.1                   // slight penalty for historical surplus
    const consecPenalty = wasAssignedYesterday(p.id, dateStr) ? 15 : 0 // avoid back-to-back
    return totalNeed * 10 + hospNeed * 5 - histPenalty - consecPenalty
  }

  function assignWeekday(dateStr, hospital, pathId) {
    assign(dateStr, hospital, pathId)
    monthCount[pathId][hospital]++
  }

  for (const { dateStr, isWeekday } of days) {
    if (!isWeekday) continue

    const todayAssigned = new Set(
      HOSPITALS.map((h) => result[dateStr][h]).filter(Boolean)
    )

    for (const hospital of HOSPITALS) {
      if (result[dateStr][hospital]) continue

      const pool = normalPaths.filter(
        (p) => isAvailable(p, dateStr) && !todayAssigned.has(p.id)
      )
      if (!pool.length) continue

      // Pick highest-score candidate (soft constraint on consecutive days via penalty)
      pool.sort((a, b) => score(b, hospital, dateStr) - score(a, hospital, dateStr))

      const chosen = pool[0]
      assignWeekday(dateStr, hospital, chosen.id)
      todayAssigned.add(chosen.id)
    }
  }

  // --------------------------------------------------------------------------
  // STEP 4: Guarantee no zeros — if an available pathologist has 0 shifts,
  // swap them in on a day where the most-loaded pathologist has ≥ 2 shifts.
  // --------------------------------------------------------------------------
  for (const p of normalPaths) {
    if (monthTotal(p.id) > 0) continue
    // Find days this pathologist is available
    const candidateDays = weekdayDates.filter((d) => isAvailable(p, d.dateStr))
    if (!candidateDays.length) continue

    for (const hospital of HOSPITALS) {
      // Find a day where someone else has many shifts and p is free
      let bestDay = null
      let bestScore = -Infinity
      for (const { dateStr } of candidateDays) {
        if (lockedSet.has(dateStr)) continue // never displace a pre-divided day
        const current = result[dateStr][hospital]
        if (!current || current === p.id) continue
        const currentLoad = monthTotal(current)
        if (currentLoad > 1 && currentLoad > bestScore) {
          bestScore = currentLoad
          bestDay = { dateStr, displaced: current }
        }
      }
      if (bestDay) {
        // Swap: remove displaced from this slot, put p in
        monthCount[bestDay.displaced][hospital]--
        result[bestDay.dateStr][hospital] = p.id
        shiftCount[p.id] = shiftCount[p.id] || { HAC: 0, HOBRA: 0 }
        shiftCount[p.id][hospital]++
        monthCount[p.id][hospital]++
        break
      }
    }
  }

  return { schedule: result, weekendAssignments }
}

/**
 * Compute statistics from a published schedule.
 * 5th weekend is derived directly from the schedule days (not from weekendAssignments)
 * so manual edits to those cells are always reflected correctly.
 */
export function computeStats(scheduleDays, pathologists, holidays) {
  const holidaySet = new Set(
    holidays.map((h) => (typeof h.date === 'string' ? h.date : ''))
  )

  const stats = {}

  function ensure(pathId) {
    if (!stats[pathId]) {
      stats[pathId] = {
        HAC: { weekday: 0, holiday: 0, mon: 0, wed: 0 },
        HOBRA: { weekday: 0, holiday: 0, mon: 0, wed: 0 },
        fifthWeekend: 0,
      }
    }
  }

  // Find which dates belong to the 5th weekend of their month
  const fifthWeekendDates = new Set()
  for (const dateStr of Object.keys(scheduleDays)) {
    const date = new Date(dateStr + 'T12:00:00')
    const slot = getWeekendSlotOfDate(date)
    if (slot === 5) fifthWeekendDates.add(dateStr)
  }

  // Track which pathologists already counted for 5th weekend (count once per weekend, not per day)
  const fifthWeekendCounted = new Set() // `${pathId}-${hospital}`

  for (const [dateStr, day] of Object.entries(scheduleDays)) {
    const isHoliday = holidaySet.has(dateStr)
    const dow = new Date(dateStr + 'T12:00:00').getDay()
    const isWeekday = dow >= 1 && dow <= 4
    const isFifthWeekend = fifthWeekendDates.has(dateStr)

    for (const hospital of HOSPITALS) {
      const pathId = day[hospital]
      if (!pathId) continue
      ensure(pathId)

      if (isHoliday) {
        stats[pathId][hospital].holiday++
      } else if (isWeekday) {
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
