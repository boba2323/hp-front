import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button, ErrorBanner, Field, Input } from '../components/ui'
import { errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'

const DEMO_ACCOUNTS = [
  { username: 'admin', label: 'Administrator' },
  { username: 'dr.baruah', label: 'Doctor' },
  { username: 'nurse.bornali', label: 'Nurse' },
  { username: 'pharm.pallabi', label: 'Pharmacist' },
  { username: 'lab.nayan', label: 'Lab technician' },
  { username: 'acct.tarali', label: 'Accountant' },
]

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await login(username.trim(), password)
      navigate('/', { replace: true })
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const useDemo = (demoUsername: string) => {
    setUsername(demoUsername)
    setPassword('Hospital123!')
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-slate-900 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
              <path d="M10.5 3h3v7.5H21v3h-7.5V21h-3v-7.5H3v-3h7.5V3Z" />
            </svg>
          </span>
          <div>
            <h1 className="text-lg font-semibold text-white">Hospital ERP</h1>
            <p className="text-xs text-slate-400">Sign in to continue</p>
          </div>
        </div>

        <form
          onSubmit={submit}
          className="space-y-4 rounded-xl bg-white p-6 shadow-xl ring-1 ring-slate-200"
        >
          {error && <ErrorBanner message={error} />}

          <Field label="Username" required>
            <Input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              autoFocus
              required
              placeholder="admin"
            />
          </Field>

          <Field label="Password" required>
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              placeholder="••••••••"
            />
          </Field>

          <Button type="submit" loading={busy} className="w-full">
            Sign in
          </Button>
        </form>

        <div className="mt-5 rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
          <p className="mb-2 text-xs font-medium text-slate-300">
            Demo accounts — password <code className="text-brand-300">Hospital123!</code>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.username}
                type="button"
                onClick={() => useDemo(account.username)}
                className="rounded-md bg-white/10 px-2 py-1 text-xs text-slate-200 transition hover:bg-white/20"
              >
                {account.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
