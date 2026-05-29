import React, { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from '../firebase'
import {
  LayoutDashboard,
  Users,
  BarChart2,
  CalendarDays,
  Wand2,
  Archive,
  LogOut,
  Menu,
  X,
  Microscope,
} from 'lucide-react'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/patologistas', label: 'Patologistas', icon: Users },
  { to: '/estatisticas', label: 'Estatísticas', icon: BarChart2 },
  { to: '/feriados', label: 'Feriados', icon: CalendarDays },
  { to: '/gerar-escala', label: 'Gerar Escala', icon: Wand2 },
  { to: '/escalas-anteriores', label: 'Escalas Anteriores', icon: Archive },
]

export default function Layout({ user }) {
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  async function handleLogout() {
    await signOut(auth)
    navigate('/login')
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-5 border-b border-blue-700">
        <Microscope className="text-white" size={28} />
        <div>
          <p className="text-white font-bold text-sm leading-tight">DASA Brasília</p>
          <p className="text-blue-200 text-xs">Escala de Congelação</p>
        </div>
      </div>

      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-700 text-white'
                  : 'text-blue-100 hover:bg-blue-700/60 hover:text-white'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-blue-700">
        <p className="text-blue-200 text-xs truncate mb-2">{user?.email}</p>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-blue-100 hover:text-white text-sm transition-colors"
        >
          <LogOut size={16} />
          Sair
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-shrink-0 w-56 bg-blue-800 flex-col">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div
            className="fixed inset-0 bg-gray-600 bg-opacity-75"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="relative flex flex-col w-56 bg-blue-800 z-50">
            <button
              className="absolute top-3 right-3 text-white"
              onClick={() => setSidebarOpen(false)}
            >
              <X size={20} />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center px-4 h-14 bg-blue-800 shadow">
          <button onClick={() => setSidebarOpen(true)} className="text-white mr-3">
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2">
            <Microscope className="text-white" size={20} />
            <span className="text-white font-semibold text-sm">DASA — Escala de Congelação</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
