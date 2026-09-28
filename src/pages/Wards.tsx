import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  Loading,
  Modal,
  PageHeader,
  Pagination,
  Select,
  StatTile,
  StatusBadge,
  Table,
  Td,
  Textarea,
  Th,
  cx,
} from '../components/ui'
import { api, errorMessage } from '../lib/api'
import { formatDate, formatMoney, titleCase } from '../lib/format'
import type { Admission, Page, Ward } from '../lib/types'

/** Matches `Ward.Type` on the backend exactly. */
const WARD_TYPES = [
  'general',
  'private',
  'icu',
  'maternity',
  'pediatric',
  'surgical',
  'isolation',
]

const EMPTY_FORM = {
  name: '',
  code: '',
  ward_type: '',
  floor: '',
  capacity: '',
  charge_per_day: '',
  description: '',
}

/**
 * `/wards/occupancy` is a roll-up whose exact keys have shifted between
 * releases, so read every plausible spelling and fall back to counting the
 * wards list when a value is missing.
 */
interface OccupancyRow {
  ward?: number
  ward_id?: number
  id?: number
  ward__name?: string
  ward__code?: string
  name?: string
  code?: string
  total?: number
  total_beds?: number
  bed_count?: number
  capacity?: number
  occupied?: number
  occupied_beds?: number
  available?: number
  available_beds?: number
}

/**
 * The roll-up answers with `wards` plus top-level totals, but older builds used
 * `results` and left the totals out — accept either and recompute when needed.
 */
interface OccupancyResponse {
  wards?: OccupancyRow[]
  results?: OccupancyRow[]
  total_beds?: number
  occupied_beds?: number
  available_beds?: number
  occupancy_percentage?: number
}

function pickNumber(...values: Array<unknown>): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
      return Number(value)
    }
  }
  return undefined
}

function pickString(...values: Array<unknown>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value
  }
  return ''
}

/** A ward's occupancy, whichever source it came from. */
interface OccupancyEntry {
  key: string
  wardId: number | null
  name: string
  code: string
  total: number
  occupied: number
  available: number
  percent: number
}

function fromWard(ward: Ward): OccupancyEntry {
  const total = pickNumber(ward.bed_count, ward.capacity) ?? 0
  const occupied = pickNumber(ward.occupied_beds) ?? 0
  const available = pickNumber(ward.available_beds) ?? Math.max(total - occupied, 0)
  return {
    key: String(ward.id),
    wardId: ward.id,
    name: ward.name,
    code: ward.code,
    total,
    occupied,
    available,
    percent: total ? Math.round((occupied / total) * 100) : 0,
  }
}

function fromOccupancyRow(row: OccupancyRow, index: number, wards: Ward[]): OccupancyEntry {
  const wardId = pickNumber(row.ward_id, row.ward, row.id) ?? null
  const match = wardId === null ? undefined : wards.find((ward) => ward.id === wardId)
  const total = pickNumber(row.total, row.total_beds, row.bed_count, row.capacity) ?? 0
  const occupied = pickNumber(row.occupied, row.occupied_beds) ?? 0
  const name = pickString(row.ward__name, row.name) || match?.name || 'Unknown ward'
  const code = pickString(row.ward__code, row.code) || match?.code || ''
  const availablePick = pickNumber(row.available, row.available_beds)
  const available = availablePick ?? Math.max(total - occupied, 0)
  return {
    key: code || String(wardId ?? index),
    wardId,
    name,
    code,
    total,
    occupied,
    available,
    percent: total ? Math.round((occupied / total) * 100) : 0,
  }
}

function bedLabel(bed: Admission['bed']): string {
  if (bed === null || bed === undefined) return '—'
  if (typeof bed === 'number') return `Bed #${bed}`
  return bed.number
}

export default function Wards() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [actionError, setActionError] = useState('')

  const wards = useQuery({
    queryKey: ['wards', { page_size: 100 }],
    queryFn: async () =>
      (await api.get<Page<Ward>>('/wards/', { params: { page_size: 100 } })).data,
  })

  const occupancy = useQuery({
    queryKey: ['wards', 'occupancy'],
    queryFn: async () => (await api.get<OccupancyResponse>('/wards/occupancy')).data,
  })

  const admissions = useQuery({
    queryKey: ['wards', 'admissions', { status: 'admitted', page }],
    queryFn: async () =>
      (
        await api.get<Page<Admission>>('/wards/admissions/', {
          params: { status: 'admitted', page, page_size: 20 },
        })
      ).data,
  })

  const createWard = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      (await api.post<Ward>('/wards/', payload)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wards'] })
      setFormOpen(false)
      setForm(EMPTY_FORM)
    },
    onError: (caught) => setFormError(errorMessage(caught)),
  })

  const discharge = useMutation({
    mutationFn: async (admissionId: number) =>
      (await api.post<Admission>(`/wards/admissions/${admissionId}/discharge`, {})).data,
    onSuccess: () => {
      setActionError('')
      queryClient.invalidateQueries({ queryKey: ['wards'] })
    },
    onError: (caught) => setActionError(errorMessage(caught)),
  })

  const wardList = wards.data?.results ?? []

  // Prefer the server roll-up; fall back to the wards list when it is empty or
  // the endpoint is unavailable.
  const occupancyRows = occupancy.data?.wards ?? occupancy.data?.results ?? []
  const occupancyEntries: OccupancyEntry[] =
    occupancyRows.length > 0
      ? occupancyRows.map((row, index) => fromOccupancyRow(row, index, wardList))
      : wardList.map(fromWard)

  const summedBeds = occupancyEntries.reduce((sum, entry) => sum + entry.total, 0)
  const summedOccupied = occupancyEntries.reduce((sum, entry) => sum + entry.occupied, 0)
  const summedAvailable = occupancyEntries.reduce((sum, entry) => sum + entry.available, 0)

  const totalBeds = pickNumber(occupancy.data?.total_beds) ?? summedBeds
  const occupiedBeds = pickNumber(occupancy.data?.occupied_beds) ?? summedOccupied
  const availableBeds = pickNumber(occupancy.data?.available_beds) ?? summedAvailable
  const occupancyPercent =
    pickNumber(occupancy.data?.occupancy_percentage) ??
    (totalBeds ? Math.round((occupiedBeds / totalBeds) * 100) : 0)

  const submit = () => {
    setFormError('')
    if (!form.name.trim()) {
      setFormError('Ward name is required')
      return
    }
    if (!form.code.trim()) {
      setFormError('Ward code is required')
      return
    }
    const payload: Record<string, unknown> = { name: form.name, code: form.code }
    for (const [key, value] of Object.entries(form)) {
      if (value === '' || key === 'name' || key === 'code') continue
      if (key === 'capacity') {
        payload[key] = Number(value)
        continue
      }
      payload[key] = value
    }
    createWard.mutate(payload)
  }

  const set = (key: keyof typeof EMPTY_FORM) => (value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }))

  return (
    <>
      <PageHeader
        title="Wards & beds"
        subtitle="Bed occupancy, ward configuration and current inpatients"
        actions={
          <Button
            onClick={() => {
              setFormError('')
              setFormOpen(true)
            }}
          >
            + Add ward
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Total beds" value={totalBeds} hint={`${wardList.length} wards`} />
        <StatTile
          label="Occupied"
          value={occupiedBeds}
          tone={occupancyPercent > 85 ? 'warning' : 'default'}
        />
        <StatTile label="Available" value={availableBeds} tone="positive" />
        <StatTile
          label="Occupancy"
          value={`${Math.round(occupancyPercent)}%`}
          hint={occupancyPercent > 85 ? 'Wards are close to capacity' : 'Within capacity'}
          tone={occupancyPercent > 85 ? 'critical' : 'default'}
        />
      </div>

      <Card className="mt-5" title="Wards">
        {wards.isLoading && <Loading label="Loading wards…" />}
        {wards.isError && (
          <ErrorBanner message={errorMessage(wards.error)} onRetry={() => wards.refetch()} />
        )}
        {wards.data && wardList.length === 0 && (
          <EmptyState
            title="No wards configured"
            description="Add the first ward to start tracking beds and admissions."
          />
        )}
        {wardList.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {wardList.map((ward) => {
              const entry = occupancyEntries.find((item) => item.wardId === ward.id) ?? fromWard(ward)
              return (
                <Link
                  key={ward.id}
                  to={`/wards/${ward.id}`}
                  className="block rounded-xl border border-slate-200 p-4 transition hover:border-brand-300 hover:bg-brand-50/30"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{ward.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        <span className="font-mono">{ward.code}</span> ·{' '}
                        {titleCase(ward.ward_type)}
                        {ward.floor ? ` · ${ward.floor}` : ''}
                      </p>
                    </div>
                    <Badge tone={ward.is_active ? 'emerald' : 'slate'}>
                      {ward.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>

                  <div className="mt-3">
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-slate-500">
                        {entry.occupied}/{entry.total} beds occupied
                      </span>
                      <span className="font-medium tabular-nums text-slate-700">
                        {entry.percent}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={cx(
                          'h-full rounded-full',
                          entry.percent > 85
                            ? 'bg-rose-500'
                            : entry.percent > 60
                              ? 'bg-amber-500'
                              : 'bg-brand-500',
                        )}
                        style={{ width: `${entry.percent}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                    <span>{entry.available} available</span>
                    <span>{formatMoney(ward.charge_per_day)} / day</span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </Card>

      <Card className="mt-5" title="Current inpatients">
        {actionError && (
          <div className="mb-4">
            <ErrorBanner message={actionError} />
          </div>
        )}
        {admissions.isLoading && <Loading label="Loading admissions…" />}
        {admissions.isError && (
          <ErrorBanner
            message={errorMessage(admissions.error)}
            onRetry={() => admissions.refetch()}
          />
        )}
        {admissions.data && admissions.data.results.length === 0 && (
          <EmptyState title="No inpatients" description="Nobody is currently admitted." />
        )}
        {admissions.data && admissions.data.results.length > 0 && (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Patient</Th>
                  <Th>Bed</Th>
                  <Th>Admitting doctor</Th>
                  <Th>Admitted</Th>
                  <Th>Days</Th>
                  <Th>Status</Th>
                  <Th>Reason</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {admissions.data.results.map((admission) => (
                  <tr key={admission.id} className="hover:bg-slate-50/70">
                    <Td>
                      <Link
                        to={`/patients/${admission.patient.id}`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {admission.patient.full_name}
                      </Link>
                      <span className="ml-2 font-mono text-xs text-slate-400">
                        {admission.patient.mrn}
                      </span>
                    </Td>
                    <Td>{bedLabel(admission.bed)}</Td>
                    <Td>{admission.admitting_doctor?.full_name || '—'}</Td>
                    <Td className="whitespace-nowrap text-slate-500">
                      {formatDate(admission.admission_date)}
                    </Td>
                    <Td>{admission.length_of_stay_days}</Td>
                    <Td>
                      <StatusBadge status={admission.status} />
                    </Td>
                    <Td className="max-w-md truncate text-slate-500">{admission.reason || '—'}</Td>
                    <Td align="right">
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={discharge.isPending && discharge.variables === admission.id}
                        onClick={() => discharge.mutate(admission.id)}
                      >
                        Discharge
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination
              page={admissions.data.page}
              totalPages={admissions.data.total_pages}
              count={admissions.data.count}
              onChange={setPage}
            />
          </>
        )}
      </Card>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Add a ward"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={createWard.isPending}>
              Create ward
            </Button>
          </>
        }
      >
        {formError && (
          <div className="mb-4">
            <ErrorBanner message={formError} />
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" required>
            <Input value={form.name} onChange={(e) => set('name')(e.target.value)} />
          </Field>
          <Field label="Code" required hint="Short identifier, e.g. GW-1">
            <Input value={form.code} onChange={(e) => set('code')(e.target.value)} />
          </Field>
          <Field label="Ward type">
            <Select value={form.ward_type} onChange={(e) => set('ward_type')(e.target.value)}>
              <option value="">Not recorded</option>
              {WARD_TYPES.map((option) => (
                <option key={option} value={option}>
                  {titleCase(option)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Floor">
            <Input value={form.floor} onChange={(e) => set('floor')(e.target.value)} />
          </Field>
          <Field label="Capacity" hint="Number of beds">
            <Input
              type="number"
              min={0}
              value={form.capacity}
              onChange={(e) => set('capacity')(e.target.value)}
            />
          </Field>
          <Field label="Charge per day">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.charge_per_day}
              onChange={(e) => set('charge_per_day')(e.target.value)}
            />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea
              value={form.description}
              onChange={(e) => set('description')(e.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </>
  )
}
