import {
  format,
  getDaysInMonth,
  getDay,
  startOfMonth,
  addDays,
  isWithinInterval,
  parseISO,
  addMonths,
  subMonths,
} from 'date-fns'

export const HOSPITALS = ['HAC', 'HOBRA']

export const REGIME_LABELS = {
  normal: 'Normal',
  weekend: 'Final de Semana',
  fixed: 'Plantão Fixo',
}

export const WEEKDAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
export const WEEKDAY_FULL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

export const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

export const WEEKEND_SLOT_LABELS = {
  1: '1º FDS',
  2: '2º FDS',
  3: '3º FDS',
  4: '4º FDS',
  5: '5º FDS',
}

/** Returns 'YYYY-MM' key for a schedule document */
export function scheduleKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`
}

/** Build a list of all days in a month with metadata */
export function buildMonthDays(year, month) {
  const count = getDaysInMonth(new Date(year, month - 1, 1))
  const days = []
  for (let d = 1; d <= count; d++) {
    const date = new Date(year, month - 1, d)
    const dow = getDay(date)
    const dateStr = format(date, 'yyyy-MM-dd')
    const isWeekend = dow === 0 || dow === 5 || dow === 6
    const isWeekday = dow >= 1 && dow <= 4
    days.push({ date, dateStr, dow, isWeekend, isWeekday, day: d })
  }
  return days
}

/**
 * Returns which weekend number (1-5) a Fri/Sat/Sun belongs to.
 * Weekends are grouped as Fri+Sat+Sun, numbered by which Friday it is.
 * Returns null for Mon-Thu.
 */
export function getWeekendSlotOfDate(date) {
  const dow = getDay(date)
  if (dow === 5) {
    // Count which Friday this is within the month
    const firstDay = startOfMonth(date)
    let count = 0
    for (let d = new Date(firstDay); d <= date; d = addDays(d, 1)) {
      if (getDay(d) === 5) count++
    }
    return count
  }
  if (dow === 6) return getWeekendSlotOfDate(addDays(date, -1))
  if (dow === 0) return getWeekendSlotOfDate(addDays(date, -2))
  return null
}

/**
 * Group all weekend days by slot number.
 * Returns { [slot]: [dayObj, dayObj, dayObj] }
 * Handles months where Sat/Sun at start belong to prev month's Friday (slot stays correct).
 */
export function getMonthWeekendGroups(year, month) {
  const days = buildMonthDays(year, month)
  const groups = {}
  for (const d of days) {
    if (!d.isWeekend) continue
    const slot = getWeekendSlotOfDate(d.date)
    if (!slot) continue
    if (!groups[slot]) groups[slot] = []
    groups[slot].push(d)
  }
  return groups
}

/** Check if a month has a 5th weekend */
export function hasFifthWeekend(year, month) {
  const groups = getMonthWeekendGroups(year, month)
  return !!groups[5]
}

/** Check if a pathologist is on vacation for a given date */
function toLocalNoon(raw) {
  const dt = raw?.toDate ? raw.toDate() : (typeof raw === 'string' ? parseISO(raw) : raw)
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 12)
}

export function isOnVacation(pathologist, dateStr) {
  if (!pathologist.vacations?.length) return false
  // Parse dateStr as local noon to avoid UTC midnight shifting the day
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d, 12)
  return pathologist.vacations.some((v) => {
    try {
      return isWithinInterval(date, { start: toLocalNoon(v.start), end: toLocalNoon(v.end) })
    } catch {
      return false
    }
  })
}

/** Get the weekendSlots array for a pathologist (supports both old single value and new array) */
export function getWeekendSlots(pathologist) {
  if (Array.isArray(pathologist.weekendSlots)) return pathologist.weekendSlots
  if (pathologist.weekendSlot) return [pathologist.weekendSlot]
  return []
}

export function formatMonthYear(year, month) {
  return `${MONTH_NAMES[month - 1]} ${year}`
}

export function tsToDateStr(ts) {
  if (!ts) return ''
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  return format(d, 'dd/MM/yyyy')
}
