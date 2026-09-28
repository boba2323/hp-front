import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

import {
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
  StatusBadge,
  Table,
  Td,
  Textarea,
  Th,
  cx,
} from '../components/ui'
import { api, errorMessage } from '../lib/api'
import { formatDate, formatMoney, formatTime, titleCase, toDateInput } from '../lib/format'
import type { Appointment, DoctorOption, Page, PatientRef } from '../lib/types'

const STATUSES = [
  'scheduled',
  'confirmed',
  'checked_in',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
]

const TYPES = ['scheduled', 'walk_in', 'follow_up', 'emergency', 'telemedicine']

const DURATIONS = [15, 30, 45, 60]

type QuickFilter = 'today' | 'upcoming' | 'all'

const QUICK_FILTERS: Array<{ key: QuickFilter; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'all', label: 'All' },
]

/** A lifecycle move that is legal for the appointment's current status. */
interface RowAction {
  label: string
  path: string
  variant: 'primary' | 'secondary' | 'success'
}

/** Mirror of the backend's TRANSITIONS map - terminal states expose nothing. */
function nextActions(status: string): RowAction[] {
  switch (status) {
    case 'scheduled':
      return [
        { label: 'Confirm', path: 'confirm', variant: 'primary' },
        { label: 'No-show', path: 'no-show', variant: 'secondary' },
      ]
    case 'confirmed':
      return [
        { label: 'Check in', path: 'check-in', variant: 'primary' },
        { label: 'No-show', path: 'no-show', variant: 'secondary' },
      ]
    case 'checked_in':
      return [
        { label: 'Start', path: 'start', variant: 'primary' },
        { label: 'No-show', path: 'no-show', variant: 'secondary' },
      ]
    case 'in_progress':
      return [{ label: 'Complete', path: 'complete', variant: 'success' }]
    default:
      return []
  }
}

const CAN_CANCEL = ['scheduled', 'confirmed', 'checked_in']

function emptyForm() {
  return {
    date: toDateInput(),
    time: '09:00',
    duration: '30',
    doctor: '',
    appointment_type: 'scheduled',
    reason: '',
  }
}

/** How many patients the panel lists when browsing with no search term. */
const BROWSE_LIMIT = 20

/** `/patients/lookup/` answers with either a bare array or a page. */
type ListResponse<T> = T[] | Page<T>

function listResults<T>(data: ListResponse<T> | undefined): T[] {
  if (!data) return []
  if (Array.isArray(data)) return data
  return data.results ?? []
}

/**
 * Patient combobox for the booking modal. Opening it lists the register
 * straight away so staff can pick without typing; typing narrows the list.
 */
function PatientPicker({
  id,
  selected,
  onSelect,
}: {
  id?: string
  selected: PatientRef | null
  onSelect: (patient: PatientRef | null) => void
}) {
  const [term, setTerm] = useState('')
  const [debounced, setDebounced] = useState('')
  const [open, setOpen] = useState(false)
  const [refocus, setRefocus] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // The search input only exists while no patient is picked, so "Change" cannot
  // focus it directly - the card is still on screen at that moment. Focus once
  // the search branch has rendered, so the panel's blur handler governs it.
  useEffect(() => {
    if (!refocus) return
    inputRef.current?.focus()
    setRefocus(false)
  }, [refocus])

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term), 300)
    return () => clearTimeout(timer)
  }, [term])

  const query = debounced.trim()

  const { data, isFetching } = useQuery({
    queryKey: ['patient-lookup', query],
    queryFn: async () =>
      (
        await api.get<ListResponse<PatientRef>>('/patients/lookup/', {
          params: { search: query || undefined, limit: query ? 8 : BROWSE_LIMIT },
        })
      ).data,
    // Populate as soon as the panel opens. An empty term browses the register
    // so staff can pick without typing; a typed term narrows it.
    enabled: selected === null && open,
  })

  const results = listResults(data)

  // `debounced` trails `term` by the debounce window. Until the two agree the
  // list on screen belongs to the previous search term, so hold it back rather
  // than let a click land on a patient the user is no longer looking at.
  const settled = term.trim() === query
  const ready = settled && !isFetching

  const reset = () => {
    setTerm('')
    setDebounced('')
  }

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-800">{selected.full_name}</p>
          <p className="font-mono text-xs text-slate-500">
            {selected.mrn}
            {selected.age != null && ` · ${selected.age}y`}
            {selected.gender && ` · ${titleCase(selected.gender)}`}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            onSelect(null)
            reset()
            setOpen(true)
            setRefocus(true)
          }}
        >
          Change
        </Button>
      </div>
    )
  }

  return (
    <div
      className="relative"
      onBlur={(event) => {
        // Focus moving to another control inside the wrapper (a result row)
        // keeps the panel open; focus leaving it closes the panel.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOpen(false)
        }
      }}
    >
      <Input
        id={id}
        ref={inputRef}
        value={term}
        onChange={(event) => {
          setTerm(event.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search by name, MRN or phone…"
        autoComplete="off"
      />

      {open && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          {!ready && <p className="px-3 py-2 text-xs text-slate-400">Searching…</p>}

          {ready && results.length === 0 && (
            <p className="px-3 py-2 text-xs text-slate-400">
              {query ? 'No matching patients.' : 'No patients registered yet.'}
            </p>
          )}

          {ready && results.length > 0 && (
            <>
              <ul className="max-h-52 divide-y divide-slate-100 overflow-y-auto">
                {results.map((patient) => (
                  <li key={patient.id}>
                    <button
                      type="button"
                      // Hold focus on the input so the panel's onBlur does not
                      // close it before the click lands.
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        onSelect(patient)
                        reset()
                        setOpen(false)
                      }}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-slate-50"
                    >
                      <span className="text-sm text-slate-800">{patient.full_name}</span>
                      <span className="font-mono text-xs text-slate-500">{patient.mrn}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {query.length === 0 && (
                <p className="border-t border-slate-100 px-3 py-1.5 text-xs text-slate-400">
                  First {results.length} patients — type to narrow.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function Appointments() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [status, setStatus] = useState('')
  const [appointmentType, setAppointmentType] = useState('')
  const [doctorId, setDoctorId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [quick, setQuick] = useState<QuickFilter>('all')
  const [page, setPage] = useState(1)
  const [rowError, setRowError] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [patient, setPatient] = useState<PatientRef | null>(null)
  const [formError, setFormError] = useState('')

  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelError, setCancelError] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search)
      setPage(1)
    }, 350)
    return () => clearTimeout(timer)
  }, [search])

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['appointments', { debounced, status, appointmentType, doctorId, dateFrom, dateTo, page }],
    queryFn: async () =>
      (
        await api.get<Page<Appointment>>('/appointments/', {
          params: {
            search: debounced || undefined,
            status: status || undefined,
            appointment_type: appointmentType || undefined,
            doctor: doctorId || undefined,
            date_from: dateFrom || undefined,
            date_to: dateTo || undefined,
            page,
            page_size: 20,
          },
        })
      ).data,
  })

  const doctors = useQuery({
    queryKey: ['doctors'],
    queryFn: async () => (await api.get<DoctorOption[]>('/staff/doctors/')).data,
  })

  const applyQuick = (key: QuickFilter) => {
    setQuick(key)
    setPage(1)
    if (key === 'today') {
      const today = toDateInput()
      setDateFrom(today)
      setDateTo(today)
      return
    }
    if (key === 'upcoming') {
      setDateFrom(toDateInput())
      setDateTo('')
      return
    }
    setDateFrom('')
    setDateTo('')
  }

  const lifecycle = useMutation({
    mutationFn: async ({ id, path }: { id: number; path: string }) =>
      (await api.post<Appointment>(`/appointments/${id}/${path}`)).data,
    onSuccess: () => {
      setRowError('')
      queryClient.invalidateQueries({ queryKey: ['appointments'] })
    },
    onError: (caught) => setRowError(errorMessage(caught)),
  })

  const cancelAppointment = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) =>
      (await api.post<Appointment>(`/appointments/${id}/cancel`, { reason })).data,
    onSuccess: () => {
      setCancelTarget(null)
      setCancelReason('')
      setCancelError('')
      queryClient.invalidateQueries({ queryKey: ['appointments'] })
    },
    onError: (caught) => setCancelError(errorMessage(caught)),
  })

  const bookAppointment = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      (await api.post<Appointment>('/appointments/', payload)).data,
    onSuccess: () => {
      setFormOpen(false)
      setForm(emptyForm())
      setPatient(null)
      setFormError('')
      queryClient.invalidateQueries({ queryKey: ['appointments'] })
    },
    onError: (caught) => setFormError(errorMessage(caught)),
  })

  const selectedDoctor = doctors.data?.find((option) => String(option.id) === form.doctor)

  const submit = () => {
    setFormError('')
    if (!patient) {
      setFormError('Pick a patient for this appointment')
      return
    }
    if (!form.doctor) {
      setFormError('Pick the doctor who will see the patient')
      return
    }
    if (!form.date || !form.time) {
      setFormError('A date and a start time are required')
      return
    }
    const start = new Date(`${form.date}T${form.time}:00`)
    if (Number.isNaN(start.getTime())) {
      setFormError('That date and time could not be understood')
      return
    }
    const end = new Date(start.getTime() + Number(form.duration) * 60_000)

    const payload: Record<string, unknown> = {
      patient: patient.id,
      doctor: Number(form.doctor),
      scheduled_start: start.toISOString(),
      scheduled_end: end.toISOString(),
      appointment_type: form.appointment_type,
      reason: form.reason,
    }
    if (selectedDoctor?.department_id) payload.department = selectedDoctor.department_id

    bookAppointment.mutate(payload)
  }

  const set = (key: keyof ReturnType<typeof emptyForm>) => (value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }))

  return (
    <>
      <PageHeader
        title="Appointments"
        subtitle="Book visits, check patients in and run the clinic day"
        actions={
          <Button
            onClick={() => {
              setForm(emptyForm())
              setPatient(null)
              setFormError('')
              setFormOpen(true)
            }}
          >
            + Book appointment
          </Button>
        }
      />

      <Card bodyClassName="p-4">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {QUICK_FILTERS.map((option) => (
            <button
              key={option.key}
              onClick={() => applyQuick(option.key)}
              className={cx(
                'rounded-full px-3 py-1 text-xs font-medium transition',
                quick === option.key
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <Field label="Search">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Patient, MRN or doctor…"
              />
            </Field>
          </div>
          <Field label="Status" className="w-40">
            <Select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value)
                setPage(1)
              }}
            >
              <option value="">All</option>
              {STATUSES.map((option) => (
                <option key={option} value={option}>
                  {titleCase(option)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Type" className="w-40">
            <Select
              value={appointmentType}
              onChange={(event) => {
                setAppointmentType(event.target.value)
                setPage(1)
              }}
            >
              <option value="">All</option>
              {TYPES.map((option) => (
                <option key={option} value={option}>
                  {titleCase(option)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Doctor" className="w-56">
            <Select
              value={doctorId}
              onChange={(event) => {
                setDoctorId(event.target.value)
                setPage(1)
              }}
            >
              <option value="">All</option>
              {(doctors.data ?? []).map((option) => (
                <option key={option.id} value={option.id}>
                  {option.full_name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="From" className="w-40">
            <Input
              type="date"
              value={dateFrom}
              onChange={(event) => {
                setDateFrom(event.target.value)
                setQuick('all')
                setPage(1)
              }}
            />
          </Field>
          <Field label="To" className="w-40">
            <Input
              type="date"
              value={dateTo}
              onChange={(event) => {
                setDateTo(event.target.value)
                setQuick('all')
                setPage(1)
              }}
            />
          </Field>
        </div>
      </Card>

      <Card className="mt-5">
        {rowError && (
          <div className="mb-4">
            <ErrorBanner message={rowError} />
          </div>
        )}
        {isLoading && <Loading label="Loading appointments…" />}
        {isError && <ErrorBanner message={errorMessage(error)} onRetry={() => refetch()} />}
        {data && data.results.length === 0 && (
          <EmptyState
            title="No appointments found"
            description={
              debounced
                ? 'Try a different search term or widen the date range.'
                : 'Book the first appointment to fill the diary.'
            }
          />
        )}
        {data && data.results.length > 0 && (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Patient</Th>
                  <Th>Doctor</Th>
                  <Th>Type</Th>
                  <Th>Reason</Th>
                  <Th>Status</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {data.results.map((appointment) => (
                  <tr key={appointment.id} className="hover:bg-slate-50/70">
                    <Td className="whitespace-nowrap">
                      <div className="font-medium text-slate-800">
                        {formatDate(appointment.scheduled_start)}
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatTime(appointment.scheduled_start)} ·{' '}
                        {appointment.duration_minutes} min
                      </div>
                    </Td>
                    <Td>
                      <div className="font-medium text-slate-800">
                        {appointment.patient.full_name}
                      </div>
                      <div className="font-mono text-xs text-slate-500">
                        {appointment.patient.mrn}
                      </div>
                    </Td>
                    <Td>
                      <div>{appointment.doctor.full_name}</div>
                      <div className="text-xs text-slate-500">
                        {appointment.department?.name ??
                          appointment.doctor.specialty ??
                          '—'}
                      </div>
                    </Td>
                    <Td>{titleCase(appointment.appointment_type)}</Td>
                    <Td className="max-w-md truncate text-slate-500">
                      {appointment.reason || '—'}
                    </Td>
                    <Td>
                      <StatusBadge status={appointment.status} />
                      {appointment.cancellation_reason && (
                        <div className="mt-1 max-w-40 truncate text-xs text-slate-400">
                          {appointment.cancellation_reason}
                        </div>
                      )}
                    </Td>
                    <Td align="right">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {nextActions(appointment.status).map((action) => (
                          <Button
                            key={action.path}
                            size="sm"
                            variant={action.variant}
                            loading={
                              lifecycle.isPending &&
                              lifecycle.variables?.id === appointment.id &&
                              lifecycle.variables?.path === action.path
                            }
                            onClick={() =>
                              lifecycle.mutate({ id: appointment.id, path: action.path })
                            }
                          >
                            {action.label}
                          </Button>
                        ))}
                        {CAN_CANCEL.includes(appointment.status) && (
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => {
                              setCancelReason('')
                              setCancelError('')
                              setCancelTarget(appointment)
                            }}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination
              page={data.page}
              totalPages={data.total_pages}
              count={data.count}
              onChange={setPage}
            />
          </>
        )}
      </Card>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Book an appointment"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={bookAppointment.isPending}>
              Book appointment
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
          {/* Deliberately not <Field>: that wraps its children in a <label>, and
              a label forwards clicks to its control. The first focusable
              descendant here is the search input, so clicking a patient row
              would re-focus the input, fire onFocus and re-open the panel the
              click had just closed. A sibling <label htmlFor> gives the same
              caption without wrapping the results. */}
          <div className="sm:col-span-2">
            <label
              htmlFor="appointment-patient"
              className="mb-1 block text-xs font-medium text-slate-600"
            >
              Patient<span className="ml-0.5 text-rose-500">*</span>
            </label>
            <PatientPicker
              id="appointment-patient"
              selected={patient}
              onSelect={setPatient}
            />
          </div>

          <Field label="Doctor" required>
            <Select value={form.doctor} onChange={(e) => set('doctor')(e.target.value)}>
              <option value="">Select a doctor…</option>
              {(doctors.data ?? []).map((option) => (
                <option key={option.id} value={option.id}>
                  {option.full_name}
                  {option.specialty ? ` — ${option.specialty}` : ''}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Consultation fee"
            hint={
              selectedDoctor
                ? `${formatMoney(selectedDoctor.consultation_fee)}${
                    selectedDoctor.department ? ` · ${selectedDoctor.department}` : ''
                  }`
                : 'Choose a doctor to see the fee'
            }
          >
            <Input
              value={selectedDoctor ? formatMoney(selectedDoctor.consultation_fee) : ''}
              readOnly
              disabled
              placeholder="—"
            />
          </Field>

          <Field label="Date" required>
            <Input type="date" value={form.date} onChange={(e) => set('date')(e.target.value)} />
          </Field>

          <Field label="Start time" required>
            <Input type="time" value={form.time} onChange={(e) => set('time')(e.target.value)} />
          </Field>

          <Field label="Duration" hint="Scheduled end is derived from this">
            <Select value={form.duration} onChange={(e) => set('duration')(e.target.value)}>
              {DURATIONS.map((option) => (
                <option key={option} value={option}>
                  {option} minutes
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Type">
            <Select
              value={form.appointment_type}
              onChange={(e) => set('appointment_type')(e.target.value)}
            >
              {TYPES.map((option) => (
                <option key={option} value={option}>
                  {titleCase(option)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Reason" className="sm:col-span-2">
            <Textarea
              value={form.reason}
              onChange={(e) => set('reason')(e.target.value)}
              placeholder="Why is the patient being seen?"
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        title="Cancel appointment"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelTarget(null)}>
              Keep appointment
            </Button>
            <Button
              variant="danger"
              loading={cancelAppointment.isPending}
              onClick={() => {
                if (!cancelTarget) return
                setCancelError('')
                cancelAppointment.mutate({ id: cancelTarget.id, reason: cancelReason })
              }}
            >
              Cancel appointment
            </Button>
          </>
        }
      >
        {cancelError && (
          <div className="mb-4">
            <ErrorBanner message={cancelError} />
          </div>
        )}
        {cancelTarget && (
          <p className="mb-4 text-sm text-slate-600">
            Cancelling{' '}
            <span className="font-medium text-slate-800">
              {cancelTarget.patient.full_name}
            </span>
            's appointment with {cancelTarget.doctor.full_name} on{' '}
            {formatDate(cancelTarget.scheduled_start)} at{' '}
            {formatTime(cancelTarget.scheduled_start)}. This frees the slot.
          </p>
        )}
        <Field label="Reason">
          <Textarea
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            placeholder="Cancelled by patient, rescheduling, …"
          />
        </Field>
      </Modal>
    </>
  )
}
