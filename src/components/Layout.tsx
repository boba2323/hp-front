import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'

import { useAuth } from '../lib/auth'
import { initials, titleCase } from '../lib/format'
import { cx } from './ui'

interface NavItem {
  to: string
  /** Shown in the horizontal bar, where space is tight. */
  label: string
  /** Fuller name, used as the tooltip and in the mobile menu. */
  title?: string
  icon: string
  roles?: string[]
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: 'M3 10.5 12 3l9 7.5M5.25 9.75V21h13.5V9.75' },
  {
    to: '/patients',
    label: 'Patients',
    icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4.42 0-8 2.24-8 5v2h16v-2c0-2.76-3.58-5-8-5Z',
  },
  {
    to: '/appointments',
    label: 'Appointments',
    icon: 'M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z',
  },
  {
    to: '/records',
    label: 'Records',
    title: 'Medical records',
    icon: 'M9 3h6a1 1 0 0 1 1 1v1h2a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2V4a1 1 0 0 1 1-1Zm0 9h6m-3-3v6',
  },
  {
    to: '/pharmacy',
    label: 'Pharmacy',
    icon: 'M8 3h8v4l3 9a3 3 0 0 1-2.8 4H7.8A3 3 0 0 1 5 16l3-9V3Zm-1 8h10',
  },
  {
    to: '/wards',
    label: 'Wards',
    title: 'Wards & beds',
    icon: 'M3 20V9m0 4h18m0 7v-6a2 2 0 0 0-2-2H3m4-4h4a2 2 0 0 1 2 2v2H5V7a2 2 0 0 1 2-2Z',
  },
  {
    to: '/laboratory',
    label: 'Laboratory',
    icon: 'M9 3v6.5L5.2 16A2 2 0 0 0 7 19h10a2 2 0 0 0 1.8-3L15 9.5V3M8 3h8',
  },
  {
    to: '/billing',
    label: 'Billing',
    icon: 'M3 7h18v10H3V7Zm0 4h18M7 15h3',
  },
  {
    to: '/staff',
    label: 'Staff',
    icon: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 20v-1.5A3.5 3.5 0 0 1 6.5 15h5a3.5 3.5 0 0 1 3.5 3.5V20m1-5h1.5A3.5 3.5 0 0 1 21 18.5V20',
    roles: ['admin'],
  },
]

/**
 * The things staff do constantly. These sit in the header rather than on a
 * card, so they are one click away from every page.
 */
const QUICK_ACTIONS: NavItem[] = [
  {
    to: '/patients?new=1',
    label: 'Register a patient',
    icon: 'M15 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M8.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M19 8v6M22 11h-6',
  },
  {
    to: '/appointments?new=1',
    label: 'Book an appointment',
    icon: 'M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z',
  },
  {
    to: '/laboratory',
    label: 'Laboratory worklist',
    icon: 'M9 3v6.5L5.2 16A2 2 0 0 0 7 19h10a2 2 0 0 0 1.8-3L15 9.5V3M8 3h8',
  },
  {
    to: '/pharmacy',
    label: 'Dispense medication',
    icon: 'M8 3h8v4l3 9a3 3 0 0 1-2.8 4H7.8A3 3 0 0 1 5 16l3-9V3Zm-1 8h10',
  },
  {
    to: '/billing',
    label: 'Raise an invoice',
    icon: 'M3 7h18v10H3V7Zm0 4h18M7 15h3',
  },
]

function NavIcon({ path, className }: { path: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cx('shrink-0', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  )
}

function NavItemLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      title={item.title ?? item.label}
      className={({ isActive }) =>
        cx(
          'flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium transition',
          isActive
            ? 'bg-brand-600/20 text-white ring-1 ring-brand-500/40'
            : 'text-slate-300 hover:bg-white/5 hover:text-white',
        )
      }
    >
      <NavIcon path={item.icon} className="h-4.5 w-4.5" />
      {item.label}
    </NavLink>
  )
}

export default function Layout() {
  const { user, logout, hasRole } = useAuth()
  const navigate = useNavigate()

  const visible = NAV.filter((item) => !item.roles || hasRole(...item.roles))

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-30 bg-slate-900">
        <div className="flex h-14 items-center gap-3 px-3 sm:px-4">
          <Link to="/" className="flex shrink-0 items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
              <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="currentColor">
                <path d="M10.5 3h3v7.5H21v3h-7.5V21h-3v-7.5H3v-3h7.5V3Z" />
              </svg>
            </span>
            <span className="hidden text-sm font-semibold text-white sm:block">Hospital ERP</span>
          </Link>

          {/* Wide enough for the whole row inline. */}
          <nav className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-2 lg:flex">
            {visible.map((item) => (
              <NavItemLink key={item.to} item={item} />
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0">
            <div className="hidden items-center gap-2.5 sm:flex">
              <div className="text-right leading-tight">
                <p className="max-w-40 truncate text-sm font-medium text-white">
                  {user?.full_name}
                </p>
                <p className="text-xs text-slate-400">{titleCase(user?.role)}</p>
              </div>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-white">
                {initials(user?.full_name)}
              </span>
            </div>
            <button
              onClick={handleLogout}
              title="Sign out"
              aria-label="Sign out"
              className="rounded-md p-2 text-slate-400 transition hover:bg-white/10 hover:text-white"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4.5 w-4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 17l5-5-5-5M20 12H9m3 8H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6" />
              </svg>
            </button>
          </div>
        </div>

        {/* Second row below lg, so the nav is on screen at every width. The row
            scrolls sideways when nine items will not fit. */}
        <nav className="flex items-center gap-0.5 overflow-x-auto border-t border-white/10 px-2 py-1.5 lg:hidden">
          {visible.map((item) => (
            <NavItemLink key={item.to} item={item} />
          ))}
        </nav>

        {/* Quick actions - always visible, at every width. Styled as buttons
            rather than links so they read as actions, not destinations. */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-t border-white/10 bg-slate-950/40 px-3 py-2 sm:px-4">
          {QUICK_ACTIONS.map((action) => (
            <Link
              key={action.label}
              to={action.to}
              className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-500"
            >
              <NavIcon path={action.icon} className="h-4 w-4" />
              {action.label}
            </Link>
          ))}
        </div>
      </header>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  )
}
