import { buildMonthDays, getWeekendSlotOfDate, isOnVacation, HOSPITALS } from './dateHelpers'

/**
 * Generate a schedule for a given month.
 *
 * Returns: { [dateStr]: { HAC: pathId|null, HOBRA: pathId|null } }
 *
 * Rules:
 * 1. Fixed-regime pathologists are placed on their designated days/hospital.
 * 2. Weekend-regime pathologists cover only their assigned weekend slot (Fri/Sat/Sun).
 * 3. Normal-regime pathologists cover Mon-Thu and also rotate weekends.
 * 4. Balancing: prefer the pathologist with the fewest shifts so far.
 * 5. Avoid consecutive days for the same pathologist.
 * 6. Vacationing and deactivated pathologists are excluded.
 */
export function generateSchedule(year, month, pathologists, existingStats, holidays) {
  const days = buildMonthDays(year, month)
  const holidaySet = new Set(holidays.map((h) => h.dateStr || h.date))

  // Active pathologists only
  const active = pathologists.filter((p) => p.active !== false)

  // Exclude those on full-month vacation or deactivated before month start
  const monthStart = new Date(year, month - 1, 1)

  function isAvailable(p, dateStr) {
    if (p.active === false) return false
    if (isOnVacation(p, dateStr)) return false
    return true
  }

  // Shift count tracker (starts from existing stats for balance)
  const shiftCount = {} // { pathId: { HAC: n, HOBRA: n } }
  for (const p of active) {
    shiftCount[p.id] = {
      HAC: existingStats?.[p.id]?.HAC?.weekday + existingStats?.[p.id]?.HAC?.holiday || 0,
      HOBRA: existingStats?.[p.id]?.HOBRA?.weekday + existingStats?.[p.id]?.HOBRA?.holiday || 0,
    }
  }

  function totalShifts(pathId) {
    return (shiftCount[pathId]?.HAC || 0) + (shiftCount[pathId]?.HOBRA || 0)
  }

  // Result
  const schedule = {}
  for (const { dateStr } of days) {
    schedule[dateStr] = { HAC: null, HOBRA: null }
  }

  // Track last assigned date per pathologist to avoid consecutive days
  const lastAssigned = {}

  function assign(dateStr, hospital, pathId) {
    schedule[dateStr][hospital] = pathId
    if (!shiftCount[pathId]) shiftCount[pathId] = { HAC: 0, HOBRA: 0 }
    shiftCount[pathId][hospital] = (shiftCount[pathId][hospital] || 0) + 1
    lastAssigned[pathId] = dateStr
  }

  function wasAssignedYesterday(pathId, dateStr) {
    if (!lastAssigned[pathId]) return false
    const prev = lastAssigned[pathId]
    // simple date comparison
    const d1 = new Date(prev)
    const d2 = new Date(dateStr)
    return (d2 - d1) <= 86400000
  }

  // Pick best candidate from pool for a hospital slot on a given date
  function pickBest(pool, dateStr, hospital) {
    if (!pool.length) return null
    // Filter available
    let candidates = pool.filter((p) => isAvailable(p, dateStr))
    if (!candidates.length) return null

    // Prefer not yesterday
    const notYesterday = candidates.filter((p) => !wasAssignedYesterday(p.id, dateStr))
    if (notYesterday.length) candidates = notYesterday

    // Sort by fewest total shifts, then fewest on this specific hospital
    candidates.sort((a, b) => {
      const totalDiff = totalShifts(a.id) - totalShifts(b.id)
      if (totalDiff !== 0) return totalDiff
      return (shiftCount[a.id]?.[hospital] || 0) - (shiftCount[b.id]?.[hospital] || 0)
    })

    return candidates[0]
  }

  // --- Step 1: Place fixed-regime pathologists ---
  const fixedPaths = active.filter((p) => p.regime === 'fixed')
  for (const { dateStr, dow } of days) {
    for (const p of fixedPaths) {
      if (!isAvailable(p, dateStr)) continue
      if (!p.fixedDays?.length) continue
      for (const fd of p.fixedDays) {
        if (fd.day === dow && fd.hospital) {
          // Only assign if slot not already taken
          if (!schedule[dateStr][fd.hospital]) {
            assign(dateStr, fd.hospital, p.id)
          }
        }
      }
    }
  }

  // --- Step 2: Weekend slots ---
  // Group pathologists by weekendSlot (1-4)
  const weekendGroups = { 1: [], 2: [], 3: [], 4: [] }
  for (const p of active) {
    const slot = p.weekendSlot
    if (slot >= 1 && slot <= 4) {
      weekendGroups[slot].push(p)
    }
  }

  const weekendDays = days.filter((d) => d.isWeekend)
  for (const { dateStr, date } of weekendDays) {
    const slot = getWeekendSlotOfDate(date)
    if (!slot) continue
    const pool = weekendGroups[slot] || []

    for (const hospital of HOSPITALS) {
      if (schedule[dateStr][hospital]) continue // already assigned (fixed)
      const best = pickBest(pool, dateStr, hospital)
      if (best) assign(dateStr, hospital, best.id)
    }
  }

  // --- Step 3: Weekdays (Mon-Thu) — Normal regime only ---
  const normalPaths = active.filter((p) => p.regime === 'normal')
  const weekdays = days.filter((d) => d.isWeekday)

  for (const { dateStr } of weekdays) {
    for (const hospital of HOSPITALS) {
      if (schedule[dateStr][hospital]) continue
      const best = pickBest(normalPaths, dateStr, hospital)
      if (best) assign(dateStr, hospital, best.id)
    }
  }

  return schedule
}

/** Compute statistics from a schedule object */
export function computeStats(scheduleDays, pathologists, holidays) {
  const holidaySet = new Set(
    holidays.map((h) => {
      if (typeof h.date === 'string') return h.date
      if (h.date?.toDate) return h.date.toDate().toISOString().slice(0, 10)
      return ''
    })
  )

  const stats = {}
  for (const pathId of Object.keys(
    Object.values(scheduleDays).reduce((acc, day) => {
      if (day.HAC) acc[day.HAC] = true
      if (day.HOBRA) acc[day.HOBRA] = true
      return acc
    }, {})
  )) {
    stats[pathId] = {
      HAC: { weekday: 0, holiday: 0 },
      HOBRA: { weekday: 0, holiday: 0 },
    }
  }

  for (const [dateStr, day] of Object.entries(scheduleDays)) {
    const isHoliday = holidaySet.has(dateStr)
    const dow = new Date(dateStr + 'T12:00:00').getDay()
    const isWeekday = dow >= 1 && dow <= 4

    for (const hospital of HOSPITALS) {
      const pathId = day[hospital]
      if (!pathId) continue
      if (!stats[pathId]) stats[pathId] = { HAC: { weekday: 0, holiday: 0 }, HOBRA: { weekday: 0, holiday: 0 } }
      if (isHoliday) {
        stats[pathId][hospital].holiday++
      } else if (isWeekday) {
        stats[pathId][hospital].weekday++
      }
    }
  }

  return stats
}
