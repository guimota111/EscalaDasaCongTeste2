import React, { useState, useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './firebase'

import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Pathologists from './pages/Pathologists'
import Statistics from './pages/Statistics'
import Holidays from './pages/Holidays'
import GenerateSchedule from './pages/GenerateSchedule'
import PreviousSchedules from './pages/PreviousSchedules'
import ScheduleDetail from './pages/ScheduleDetail'
import VacationCalendar from './pages/VacationCalendar'
import Draw from './pages/Draw'

function ProtectedRoute({ user, children }) {
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const [user, setUser] = useState(undefined)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u))
    return unsub
  }, [])

  if (user === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute user={user}>
              <Layout user={user} />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="patologistas" element={<Pathologists />} />
          <Route path="estatisticas" element={<Statistics />} />
          <Route path="feriados" element={<Holidays />} />
          <Route path="gerar-escala" element={<GenerateSchedule />} />
          <Route path="escalas-anteriores" element={<PreviousSchedules />} />
          <Route path="escalas-anteriores/:yearMonth" element={<ScheduleDetail />} />
          <Route path="ferias" element={<VacationCalendar />} />
          <Route path="sorteios" element={<Draw />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}
