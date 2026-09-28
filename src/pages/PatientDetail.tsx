import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import {
  Badge,
  Button,
  Card,
  DetailRow,
  EmptyState,
  ErrorBanner,
  Loading,
  PageHeader,
  StatusBadge,
  Table,
  Td,
  Th,
  cx,
} from '../components/ui'
import { api, errorMessage } from '../lib/api'
import { formatDate, formatDateTime, formatMoney, titleCase } from '../lib/format'
import type { Appointment, Encounter, Invoice, Page, PatientDetail as PatientDetailType } from '../lib/types'

const TABS = ['overview', 'appointments', 'encounters', 'invoices'] as const
type Tab = (typeof TABS)[number]

export default function PatientDetail() {
  const { id } = useParams<{ id: string }>()
  const [tab, setTab] = useState<Tab>('overview')

  const patient = useQuery({
    queryKey: ['patient', id],
    queryFn: async () => (await api.get<PatientDetailType>(`/patients/${id}`)).data,
    enabled: Boolean(id),
  })

  const appointments = useQuery({
    queryKey: ['patient', id, 'appointments'],
    queryFn: async () =>
      (await api.get<Page<Appointment>>('/appointments/', { params: { patient: id, page_size: 50 } }))
        .data,
    enabled: Boolean(id) && tab === 'appointments',
  })

  const encounters = useQuery({
    queryKey: ['patient', id, 'encounters'],
    queryFn: async () =>
      (await api.get<Page<Encounter>>('/records/', { params: { patient: id, page_size: 50 } })).data,
    enabled: Boolean(id) && tab === 'encounters',
  })

  const invoices = useQuery({
    queryKey: ['patient', id, 'invoices'],
    queryFn: async () =>
      (await api.get<Page<Invoice>>('/billing/invoices/', { params: { patient: id, page_size: 50 } }))
        .data,
    enabled: Boolean(id) && tab === 'invoices',
  })

  if (patient.isLoading) return <Loading label="Loading patient…" />
  if (patient.isError) return <ErrorBanner message={errorMessage(patient.error)} />
  if (!patient.data) return <EmptyState title="Patient not found" />

  const record = patient.data

  return (
    <>
      <PageHeader
        title={record.full_name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-slate-500">{record.mrn}</span>
            <Badge tone={record.is_active ? 'emerald' : 'slate'}>
              {record.is_active ? 'Active' : 'Inactive'}
            </Badge>
            {record.allergies && <Badge tone="rose">Allergies: {record.allergies}</Badge>}
          </span>
        }
        actions={
          <>
            <Link to="/appointments">
              <Button variant="secondary">Book appointment</Button>
            </Link>
            <Link to="/patients">
              <Button variant="ghost">Back to list</Button>
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Age / sex</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {record.age ?? '—'} · {titleCase(record.gender)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Outstanding balance
          </p>
          <p
            className={cx(
              'mt-1 text-lg font-semibold tabular-nums',
              Number(record.outstanding_balance) > 0 ? 'text-rose-600' : 'text-emerald-600',
            )}
          >
            {formatMoney(record.outstanding_balance)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Encounters</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{record.encounter_count}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Appointments</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">{record.appointment_count}</p>
        </div>
      </div>

      <div className="mt-6 flex gap-1 border-b border-slate-200">
        {TABS.map((option) => (
          <button
            key={option}
            onClick={() => setTab(option)}
            className={cx(
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition',
              tab === option
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
            )}
          >
            {titleCase(option)}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === 'overview' && (
          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="Demographics">
              <dl className="divide-y divide-slate-100">
                <DetailRow label="Date of birth" value={formatDate(record.date_of_birth)} />
                <DetailRow label="Blood group" value={record.blood_group || '—'} />
                <DetailRow label="Marital status" value={titleCase(record.marital_status)} />
                <DetailRow label="National ID" value={record.national_id || '—'} />
                <DetailRow label="Occupation" value={record.occupation || '—'} />
              </dl>
            </Card>

            <Card title="Contact">
              <dl className="divide-y divide-slate-100">
                <DetailRow label="Phone" value={record.phone || '—'} />
                <DetailRow label="Alternate phone" value={record.alt_phone || '—'} />
                <DetailRow label="Email" value={record.email || '—'} />
                <DetailRow label="Address" value={record.address || '—'} />
                <DetailRow
                  label="City / state"
                  value={[record.city, record.state].filter(Boolean).join(', ') || '—'}
                />
              </dl>
            </Card>

            <Card title="Clinical flags">
              <dl className="divide-y divide-slate-100">
                <DetailRow label="Allergies" value={record.allergies || 'None recorded'} />
                <DetailRow
                  label="Chronic conditions"
                  value={record.chronic_conditions || 'None recorded'}
                />
              </dl>
            </Card>

            <Card title="Emergency contact & insurance">
              <dl className="divide-y divide-slate-100">
                <DetailRow label="Contact" value={record.emergency_contact_name || '—'} />
                <DetailRow
                  label="Relationship"
                  value={record.emergency_contact_relationship || '—'}
                />
                <DetailRow label="Contact phone" value={record.emergency_contact_phone || '—'} />
                <DetailRow label="Insurance" value={record.insurance_provider || '—'} />
                <DetailRow label="Policy number" value={record.insurance_policy_number || '—'} />
              </dl>
            </Card>
          </div>
        )}

        {tab === 'appointments' && (
          <Card>
            {appointments.isLoading && <Loading />}
            {appointments.data && appointments.data.results.length === 0 && (
              <EmptyState title="No appointments" description="This patient has no bookings yet." />
            )}
            {appointments.data && appointments.data.results.length > 0 && (
              <Table>
                <thead>
                  <tr>
                    <Th>When</Th>
                    <Th>Doctor</Th>
                    <Th>Type</Th>
                    <Th>Reason</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {appointments.data.results.map((appointment) => (
                    <tr key={appointment.id}>
                      <Td className="whitespace-nowrap">
                        {formatDateTime(appointment.scheduled_start)}
                      </Td>
                      <Td>{appointment.doctor.full_name}</Td>
                      <Td>{titleCase(appointment.appointment_type)}</Td>
                      <Td className="max-w-md truncate text-slate-500">{appointment.reason || '—'}</Td>
                      <Td>
                        <StatusBadge status={appointment.status} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        )}

        {tab === 'encounters' && (
          <Card>
            {encounters.isLoading && <Loading />}
            {encounters.data && encounters.data.results.length === 0 && (
              <EmptyState title="No encounters" description="No clinical notes recorded yet." />
            )}
            {encounters.data && encounters.data.results.length > 0 && (
              <div className="space-y-3">
                {encounters.data.results.map((encounter) => (
                  <div key={encounter.id} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-800">
                          {formatDateTime(encounter.encounter_date)} · {encounter.doctor.full_name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {titleCase(encounter.encounter_type)} · Encounter #{encounter.id}
                        </p>
                      </div>
                      <StatusBadge status={encounter.status} />
                    </div>
                    {encounter.chief_complaint && (
                      <p className="mt-2 text-sm text-slate-600">{encounter.chief_complaint}</p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                      {encounter.blood_pressure && <span>BP {encounter.blood_pressure} mmHg</span>}
                      {encounter.pulse && <span>Pulse {encounter.pulse} bpm</span>}
                      {encounter.temperature_c && <span>Temp {encounter.temperature_c}°C</span>}
                      {encounter.spo2 && <span>SpO₂ {encounter.spo2}%</span>}
                      {encounter.bmi && <span>BMI {encounter.bmi}</span>}
                    </div>
                    <div className="mt-3">
                      <Link
                        to={`/records?encounter=${encounter.id}`}
                        className="text-xs font-medium text-brand-700 hover:underline"
                      >
                        Open full record →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {tab === 'invoices' && (
          <Card>
            {invoices.isLoading && <Loading />}
            {invoices.data && invoices.data.results.length === 0 && (
              <EmptyState title="No invoices" description="Nothing has been billed yet." />
            )}
            {invoices.data && invoices.data.results.length > 0 && (
              <Table>
                <thead>
                  <tr>
                    <Th>Invoice</Th>
                    <Th>Issued</Th>
                    <Th align="right">Total</Th>
                    <Th align="right">Paid</Th>
                    <Th align="right">Balance</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.data.results.map((invoice) => (
                    <tr key={invoice.id}>
                      <Td className="font-mono text-xs">{invoice.invoice_number}</Td>
                      <Td>{formatDate(invoice.issued_date)}</Td>
                      <Td align="right">{formatMoney(invoice.total)}</Td>
                      <Td align="right">{formatMoney(invoice.amount_paid)}</Td>
                      <Td align="right">{formatMoney(invoice.balance)}</Td>
                      <Td>
                        <StatusBadge status={invoice.status} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        )}
      </div>
    </>
  )
}
