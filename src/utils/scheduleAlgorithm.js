import {
  buildMonthDays,
  getMonthWeekendGroups,
  isOnVacation,
  getWeekendSlots,
  HOSPITALS,
  scheduleKey,
} from './dateHelpers'

/**
 * Generate a schedule for a given month.
 *
 * Weekend logic:
 * - Each slot (1-4, possibly 5) groups pathologists together.
 * - The entire Fri+Sat+Sun block is covered by the SAME person per hospital.
 * - With 3 pathologists per slot: one→HAC, one→HOBRA, one→folga (rotates monthly).
 * - With 2 pathologists: one→HAC, one→HOBRA.
 * - 5th weekend: handled separately with its own rotation tracked in stats.
 *
 * Weekday logic (Mon-Thu):
 * - Only Normal-regime pathologists.
 * - Balance shifts across BOTH hospitals (track per-hospital count separately).
 * - Avoid consecutive days.
 *
 * Returns: { [dateStr]: { HAC: pathId|null, HOBRA: pathId|null } }
 *          weekendAssignments: { [slot]: { HAC: pathId|null, HOBRA: pathId|null } }
 */
export function generateSchedule(year, month, pathologists, existingStats, holidays, prevMonthWeekendAssignments = {}) {
  const days = buildMonthDays(year, month)
  const weekendGroups = getMonthWeekendGroups(year, month)

  const holidaySet = new Set(
    holidays.map((h) => (typeof h.date === 'string' ? h.date : ''))
  )

  const active = pathologists.filter((p) => p.active !== false)

  function isAvailable(p, dateStr) {
    if (p.active === false) return false
    if (isOnVacation(p, dateStr)) return false
    return true
  }

  // Per-hospital shift counters, seeded from ALL existing stats for balance
  // { pathId: { HAC: n, HOBRA: n } }
  const shiftCount = {}
  for (const p of active) {
    const s = existingStats?.[p.id] || {}
    shiftCount[p.id] = {
      HAC: (s.HAC?.weekday || 0) + (s.HAC?.holiday || 0),
      HOBRA: (s.HOBRA?.weekday || 0) + (s.HOBRA?.holiday || 0),
    }
  }

  const result = {}
  for (const { dateStr } of days) result[dateStr] = { HAC: null, HOBRA: null }

  const lastAssigned = {} // pathId → last dateStr assigned

  function assign(dateStr, hospital, pathId) {
    result[dateStr][hospital] = pathId
    if (!shiftCount[pathId]) shiftCount[pathId] = { HAC: 0, HOBRA: 0 }
    shiftCount[pathId][hospital]++
    lastAssigned[pathId] = dateStr
  }

  function wasAssignedYesterday(pathId, dateStr) {
    if (!lastAssigned[pathId]) return false
    const d1 = new Date(lastAssigned[pathId])
    const d2 = new Date(dateStr)
    return (d2 - d1) <= 86400000
  }

  // --------------------------------------------------------------------------
  // STEP 1: Fixed-regime pathologists on their fixed days
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
  // STEP 2: Weekend assignments (entire Fri+Sat+Sun block per hospital)
  // --------------------------------------------------------------------------
  // Build pathologist groups per slot (supports multiple slots per pathologist)
  const slotGroups = {} // { slotNum: Set<pathologist> }
  for (const p of active) {
    for (const slot of getWeekendSlots(p)) {
      if (!slotGroups[slot]) slotGroups[slot] = []
      slotGroups[slot].push(p)
    }
  }

  // weekendAssignments tracks who got which hospital per slot this month
  // { [slot]: { HAC: pathId|null, HOBRA: pathId|null } }
  const weekendAssignments = {}

  for (const [slotStr, slotDays] of Object.entries(weekendGroups)) {
    const slot = Number(slotStr)
    const group = slotGroups[slot] || []

    // Filter to available (check availability on the Friday of this weekend)
    const friday = slotDays.find((d) => d.dow === 5)
    const refDate = friday ? friday.dateStr : slotDays[0]?.dateStr
    const available = group.filter((p) => isAvailable(p, refDate))

    // Determine rotation using previous month's assignments for this slot
    const prev = prevMonthWeekendAssignments?.[slot] || {}
    const { HAC: prevHAC, HOBRA: prevHOBRA } = prev

    // Build ordered list for this slot (consistent ordering = by name)
    const ordered = [...available].sort((a, b) => a.name.localeCompare(b.name))

    let hacPerson = null
    let hobraPerson = null

    if (ordered.length === 0) {
      // no one available
    } else if (ordered.length === 1) {
      // Single person covers both hospitals
      hacPerson = ordered[0]
      hobraPerson = ordered[0]
    } else if (ordered.length === 2) {
      // Two people: rotate HAC/HOBRA each month
      // If prev month had p[0]→HAC, now p[0]→HOBRA
      if (prevHAC && prevHAC === ordered[0]?.id) {
        hacPerson = ordered[1]
        hobraPerson = ordered[0]
      } else {
        hacPerson = ordered[0]
        hobraPerson = ordered[1]
      }
    } else {
      // 3+ people: HOBRA→HAC→folga rotation
      // Find who was at HOBRA last month
      const prevHOBRAIdx = ordered.findIndex((p) => p.id === prevHOBRA)
      const prevHACIdx = ordered.findIndex((p) => p.id === prevHAC)

      if (prevHOBRAIdx >= 0) {
        // Advance: previous HOBRA → now HAC
        const hacIdx = prevHOBRAIdx
        // Previous HAC → now folga, so HOBRA is whoever is left
        const used = new Set([hacIdx, prevHACIdx >= 0 ? prevHACIdx : -1])
        const hobraIdx = ordered.findIndex((_, i) => !used.has(i))
        hacPerson = ordered[hacIdx]
        hobraPerson = hobraIdx >= 0 ? ordered[hobraIdx] : ordered[(hacIdx + 1) % ordered.length]
      } else {
        // No history — assign by fewest hospital-specific shifts
        const byHAC = [...ordered].sort((a, b) =>
          (shiftCount[a.id]?.HAC || 0) - (shiftCount[b.id]?.HAC || 0)
        )
        hacPerson = byHAC[0]
        const byHOBRA = [...ordered].filter((p) => p.id !== hacPerson.id).sort((a, b) =>
          (shiftCount[a.id]?.HOBRA || 0) - (shiftCount[b.id]?.HOBRA || 0)
        )
        hobraPerson = byHOBRA[0] || null
      }
    }

    weekendAssignments[slot] = {
      HAC: hacPerson?.id || null,
      HOBRA: hobraPerson?.id || null,
    }

    // Apply to all days of this weekend slot
    for (const { dateStr, dow } of slotDays) {
      for (const hospital of HOSPITALS) {
        if (result[dateStr][hospital]) continue // already assigned (fixed regime)
        const person = hospital === 'HAC' ? hacPerson : hobraPerson
        if (person && isAvailable(person, dateStr)) {
          assign(dateStr, hospital, person.id)
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // STEP 3: Weekdays (Mon-Thu) — Normal regime
  // --------------------------------------------------------------------------
  const normalPaths = active.filter((p) => p.regime === 'normal')

  for (const { dateStr, isWeekday } of days) {
    if (!isWeekday) continue

    for (const hospital of HOSPITALS) {
      if (result[dateStr][hospital]) continue

      // Find best candidate: fewest shifts at THIS hospital first, then fewest total, then not yesterday
      const candidates = normalPaths
        .filter((p) => isAvailable(p, dateStr))
        .filter((p) => !wasAssignedYesterday(p.id, dateStr))

      const fallback = normalPaths.filter((p) => isAvailable(p, dateStr))
      const pool = candidates.length > 0 ? candidates : fallback

      if (!pool.length) continue

      // Sort: primary = fewest shifts at this specific hospital; secondary = fewest total
      pool.sort((a, b) => {
        const hDiff = (shiftCount[a.id]?.[hospital] || 0) - (shiftCount[b.id]?.[hospital] || 0)
        if (hDiff !== 0) return hDiff
        const tA = (shiftCount[a.id]?.HAC || 0) + (shiftCount[a.id]?.HOBRA || 0)
        const tB = (shiftCount[b.id]?.HAC || 0) + (shiftCount[b.id]?.HOBRA || 0)
        return tA - tB
      })

      assign(dateStr, hospital, pool[0].id)
    }
  }

  return { schedule: result, weekendAssignments }
}

/**
 * Compute statistics from a schedule object.
 * Returns { [pathId]: { HAC: { weekday, holiday }, HOBRA: { weekday, holiday } } }
 * Also tracks fifthWeekendCount per pathologist.
 */
export function computeStats(scheduleDays, pathologists, holidays, weekendAssignments = {}) {
  const holidaySet = new Set(
    holidays.map((h) => (typeof h.date === 'string' ? h.date : ''))
  )

  const stats = {}

  function ensurePath(pathId) {
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
      ensurePath(pathId)
      if (isHoliday) {
        stats[pathId][hospital].holiday++
      } else if (isWeekday) {
        stats[pathId][hospital].weekday++
      }
      // Weekend (non-holiday) shifts not tracked in weekday/holiday counts
    }
  }

  // Track 5th weekend usage
  const fifth = weekendAssignments?.[5]
  if (fifth) {
    for (const hospital of HOSPITALS) {
      if (fifth[hospital]) {
        ensurePath(fifth[hospital])
        stats[fifth[hospital]].fifthWeekend++
      }
    }
  }

  return stats
}
