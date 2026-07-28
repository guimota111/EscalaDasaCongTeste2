import React from 'react'

export const SCOPES = [
  { value: 'month', label: 'Mês', hint: 'Apenas o mês em edição' },
  { value: 'history', label: 'Histórico', hint: 'Todas as escalas publicadas, exceto este mês' },
  { value: 'total', label: 'Total', hint: 'Histórico + o mês em edição' },
]

/** Alternador entre as visões de balanceamento (mês / histórico / total). */
export default function ScopeToggle({ value, onChange }) {
  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
      {SCOPES.map((s) => (
        <button
          key={s.value}
          type="button"
          onClick={() => onChange(s.value)}
          title={s.hint}
          aria-pressed={value === s.value}
          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
            value === s.value
              ? 'bg-white text-blue-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  )
}
