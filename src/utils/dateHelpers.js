import {
  format,
  getDaysInMonth,
  getDay,
  startOfMonth,
  addDays,
  isWithinInterval,
  parseISO,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'

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
    const dow = getDay(date) // 0=Sun … 6=Sat
    const dateStr = format(date, 'yyyy-MM-dd')
    const isWeekend = dow === 0 || dow === 5 || dow === 6 // Fri/Sat/Sun
    const isWeekday = dow >= 1 && dow <= 4 // Mon-Thu
    days.push({ date, dateStr, dow, isWeekend, isWeekday, day: d })
  }
  return days
}

/** Returns which weekend number (1-4) a date belongs to (Fri/Sat/Sun grouping) */
export function getWeekendSlotOfDate(date) {
  const dow = getDay(date)
  if (dow === 5) {
    // Friday — weekend slot based on which Friday it is
    const firstDay = startOfMonth(date)
    let count = 0
    for (let d = new Date(firstDay); d <= date; d = addDays(d, 1)) {
      if (getDay(d) === 5) count++
    }
    return count
  }
  if (dow === 6) {
    // Saturday — same weekend as preceding Friday
    return getWeekendSlotOfDate(addDays(date, -1))
  }
  if (dow === 0) {
    // Sunday — same weekend as preceding Friday
    return getWeekendSlotOfDate(addDays(date, -2))
  }
  return null
}

/** Check if a pathologist is on vacation for a given date */
export function isOnVacation(pathologist, dateStr) {
  if (!pathologist.vacations?.length) return false
  const d = parseISO(dateStr)
  return pathologist.vacations.some((v) => {
    try {
      const start = v.start?.toDate ? v.start.toDate() : parseISO(v.start)
      const end = v.end?.toDate ? v.end.toDate() : parseISO(v.end)
      return isWithinInterval(d, { start, end })
    } catch {
      return false
    }
  })
}

export function formatMonthYear(year, month) {
  return `${MONTH_NAMES[month - 1]} ${year}`
}

export function tsToDateStr(ts) {
  if (!ts) return ''
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  return format(d, 'dd/MM/yyyy')
}
