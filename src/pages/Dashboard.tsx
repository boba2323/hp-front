import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import {
  Card,
  EmptyState,
  ErrorBanner,
  Loading,
  PageHeader,
  StatTile,
  StatusBadge,
  Table,
  Td,
  Th,
} from '../components/ui'
import { api, errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatMoney, formatTime, titleCase, toDateInput } from '../lib/format'
import type { Appointment, Dashboard as DashboardData, Page } from '../lib/types'

export default function Dashboard() {
  const { user } = useAuth()

  const stats = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await api.get<DashboardData>('/core/dashboard')).data,
  })

  // Filter the list endpoint rather than /appointments/today: both work, but the
  // list endpoint returns the paginated envelope this page renders.
  const today = useQuery({
    queryKey: ['appointments', 'today'],
    queryFn: async () =>
      (
        await api.get<Page<Appointment>>('/appointments/', {
          params: { date_from: toDateInput(), date_to: toDateInput(), page_size: 50 },
        })
      ).data,
  })

  const byStatus = useQuery({
    queryKey: ['appointments', 'by-status'],
    queryFn: async () =>
      (
        await api.get<{ since: string; results: Array<{ status: string; count: number }> }>(
          '/core/appointments-by-status',
        )
      ).data,
  })

  const occupancy = useQuery({
    queryKey: ['bed-occupancy'],
    queryFn: async () =>
      (
        await api.get<{
          results: Array<{ ward__name: string; ward__code: string; total: number; occupied: number; available: number }>
        }>('/core/bed-occupancy-by-ward')
      ).data,
  })

  if (stats.isLoading) return <Loading label="Loading dashboard…" />
  if (stats.isError) {
    return <ErrorBanner message={errorMessage(stats.error)} onRetry={() => stats.refetch()} />
  }

  const data = stats.data!
  const occupancyPercent = data.beds_total
    ? Math.round(((data.beds_total - data.beds_available) / data.beds_total) * 100)
    : 0
  const chartMax = Math.max(1, ...(byStatus.data?.results ?? []).map((row) => row.count))

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user?.first_name || user?.username}`}
        subtitle={new Date().toLocaleDateString(undefined, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Patients"
          value={data.patients_total.toLocaleString()}
          hint={`${data.patients_new_this_month} new this month`}
        />
        <StatTile
          label="Today's appointments"
          value={data.appointments_today}
          hint={`${data.appointments_completed_today} completed · ${data.appointments_upcoming} upcoming`}
        />
        <StatTile
          label="Inpatients"
          value={data.current_inpatients}
          hint={`${data.beds_available} of ${data.beds_total} beds free`}
          tone={occupancyPercent > 85 ? 'warning' : 'default'}
        />
        <StatTile
          label="Revenue this month"
          value={formatMoney(data.revenue_this_month)}
          hint={`${formatMoney(data.outstanding_balance)} outstanding`}
          tone="positive"
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Lab orders pending"
          value={data.lab_orders_pending}
          tone={data.lab_orders_pending > 10 ? 'warning' : 'default'}
        />
        <StatTile
          label="Low stock medications"
          value={data.low_stock_medications}
          tone={data.low_stock_medications > 0 ? 'critical' : 'positive'}
        />
        <StatTile
          label="Batches expiring (90d)"
          value={data.expiring_batches}
          tone={data.expiring_batches > 0 ? 'warning' : 'default'}
        />
        <StatTile label="Active staff" value={data.staff_total} />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title="Today's schedule"
          actions={
            <Link to="/appointments" className="text-xs font-medium text-brand-700 hover:underline">
              View all →
            </Link>
          }
        >
          {today.isLoading && <Loading />}
          {today.isError && <ErrorBanner message={errorMessage(today.error)} />}
          {today.data && today.data.results.length === 0 && (
            <EmptyState
              title="No appointments today"
              description="Appointments booked for today will appear here."
            />
          )}
          {today.data && today.data.results.length > 0 && (
            <Table>
              <thead>
                <tr>
                  <Th>Time</Th>
                  <Th>Patient</Th>
                  <Th>Doctor</Th>
                  <Th>Type</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {today.data.results.slice(0, 8).map((appointment) => (
                  <tr key={appointment.id} className="hover:bg-slate-50/70">
                    <Td className="whitespace-nowrap font-medium">
                      {formatTime(appointment.scheduled_start)}
                    </Td>
                    <Td>
                      <Link
                        to={`/patients/${appointment.patient.id}`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {appointment.patient.full_name}
                      </Link>
                      <span className="ml-2 text-xs text-slate-400">{appointment.patient.mrn}</span>
                    </Td>
                    <Td>{appointment.doctor.full_name}</Td>
                    <Td>{titleCase(appointment.appointment_type)}</Td>
                    <Td>
                      <StatusBadge status={appointment.status} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card title="Ward occupancy">
          {occupancy.isLoading && <Loading />}
          {occupancy.data && occupancy.data.results.length === 0 && (
            <EmptyState title="No wards configured" />
          )}
          {occupancy.data && occupancy.data.results.length > 0 && (
            <ul className="space-y-3">
              {occupancy.data.results.map((ward) => {
                const percent = ward.total ? Math.round((ward.occupied / ward.total) * 100) : 0
                return (
                  <li key={ward.ward__code}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700">{ward.ward__name}</span>
                      <span className="tabular-nums text-slate-500">
                        {ward.occupied}/{ward.total}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={
                          percent > 85
                            ? 'h-full rounded-full bg-rose-500'
                            : percent > 60
                              ? 'h-full rounded-full bg-amber-500'
                              : 'h-full rounded-full bg-brand-500'
                        }
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>

      {byStatus.data && byStatus.data.results.length > 0 && (
        <Card className="mt-5" title={`Appointments by status — last 30 days`}>
          <ul className="space-y-3">
            {byStatus.data.results.map((row) => (
              <li key={row.status} className="flex items-center gap-3">
                <span className="w-32 shrink-0">
                  <StatusBadge status={row.status} />
                </span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-brand-500"
                    style={{ width: `${(row.count / chartMax) * 100}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-sm tabular-nums text-slate-600">
                  {row.count}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

    </>
  )
}
