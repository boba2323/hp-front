import { Navigate, Route, Routes } from 'react-router-dom'

import Layout from './components/Layout'
import { useAuth } from './lib/auth'
import Appointments from './pages/Appointments'
import Billing from './pages/Billing'
import Dashboard from './pages/Dashboard'
import Laboratory from './pages/Laboratory'
import Login from './pages/Login'
import PatientDetail from './pages/PatientDetail'
import Patients from './pages/Patients'
import Pharmacy from './pages/Pharmacy'
import Records from './pages/Records'
import Staff from './pages/Staff'
import WardDetail from './pages/WardDetail'
import Wards from './pages/Wards'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const { isAuthenticated } = useAuth()

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" replace /> : <Login />}
      />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/patients" element={<Patients />} />
        <Route path="/patients/:id" element={<PatientDetail />} />
        <Route path="/appointments" element={<Appointments />} />
        <Route path="/records" element={<Records />} />
        <Route path="/pharmacy" element={<Pharmacy />} />
        <Route path="/wards" element={<Wards />} />
        <Route path="/wards/:id" element={<WardDetail />} />
        <Route path="/laboratory" element={<Laboratory />} />
        <Route path="/billing" element={<Billing />} />
        <Route path="/staff" element={<Staff />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
