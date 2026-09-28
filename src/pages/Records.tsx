import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import {
  Badge,
  Button,
  Card,
  DetailRow,
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
import { formatDate, formatDateTime, titleCase } from '../lib/format'
import type {
  Diagnosis,
  DoctorOption,
  Encounter,
  Medication,
  Page,
  PatientRef,
} from '../lib/types'

const ENCOUNTER_TYPES = ['outpatient', 'inpatient', 'emergency', 'follow_up']
const ENCOUNTER_STATUSES = ['open', 'closed']
const DIAGNOSIS_TYPES = ['primary', 'secondary', 'differential']
const ROUTES = [
  'oral',
  'sublingual',
  'iv',
  'im',
  'sc',
  'topical',
  'inhalation',
  'rectal',
  'ophthalmic',
  'nasal',
]

/** Vitals that the API expects as numbers rather than strings. */
const NUMERIC_VITALS = [
  'temperature_c',
  'bp_systolic',
  'bp_diastolic',
  'pulse',
  'respiratory_rate',
  'spo2',
  'weight_kg',
  'height_cm',
] as const

function nowForInput(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(
    now.getHours(),
  )}:${pad(now.getMinutes())}`
}

function emptyEncounter() {
  return {
    doctor: '',
    encounter_type: 'outpatient',
    encounter_date: nowForInput(),
    chief_complaint: '',
    temperature_c: '',
    bp_systolic: '',
    bp_diastolic: '',
    pulse: '',
    respiratory_rate: '',
    spo2: '',
    weight_kg: '',
    height_cm: '',
  }
}

function emptyDiagnosis() {
  return { code: '', description: '', diagnosis_type: 'primary', notes: '' }
}

function emptyPrescription() {
  return {
    dosage: '',
    frequency: '',
    route: 'oral',
    duration_days: '1',
    quantity: '1',
    instructions: '',
  }
}

function Note({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{value || '—'}</p>
    </div>
  )
}

/** Type-ahead over /patients/lookup/, used by the new-encounter modal. */
function PatientPicker({
  selected,
  onSelect,
}: {
  selected: PatientRef | null
  onSelect: (patient: PatientRef | null) => void
}) {
  const [term, setTerm] = useState('')
  const [debounced, setDebounced] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term), 300)
    return () => clearTimeout(timer)
  }, [term])

  const { data, isFetching } = useQuery({
    queryKey: ['patient-lookup', debounced],
    queryFn: async () =>
      (
        await api.get<PatientRef[]>('/patients/lookup/', {
          params: { search: debounced || undefined, limit: 8 },
        })
      ).data,
    enabled: selected === null,
  })

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
            setTerm('')
          }}
        >
          Change
        </Button>
      </div>
    )
  }

  return (
    <div>
      <Input
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder="Search by name, MRN or phone…"
        autoComplete="off"
      />
      {isFetching && <p className="mt-1 text-xs text-slate-400">Searching…</p>}
      {!isFetching && data && data.length === 0 && (
        <p className="mt-1 text-xs text-slate-400">No matching patients.</p>
      )}
      {data && data.length > 0 && (
        <ul className="mt-1 max-h-52 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
          {data.map((patient) => (
            <li key={patient.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(patient)
                  setTerm('')
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-slate-50"
              >
                <span className="text-sm text-slate-800">{patient.full_name}</span>
                <span className="font-mono text-xs text-slate-500">{patient.mrn}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Type-ahead over /pharmacy/medications/, used by the prescription form. */
function MedicationPicker({
  selected,
  onSelect,
}: {
  selected: Medication | null
  onSelect: (medication: Medication | null) => void
}) {
  const [term, setTerm] = useState('')
  const [debounced, setDebounced] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term), 300)
    return () => clearTimeout(timer)
  }, [term])

  const { data, isFetching } = useQuery({
    queryKey: ['medications', 'lookup', debounced],
    queryFn: async () =>
      (
        await api.get<Page<Medication>>('/pharmacy/medications/', {
          params: { search: debounced || undefined, page_size: 8 },
        })
      ).data,
    enabled: selected === null,
  })

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-800">
            {selected.name} {selected.strength}
          </p>
          <p className="text-xs text-slate-500">
            {[selected.form, selected.generic_name].filter(Boolean).join(' · ')}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            onSelect(null)
            setTerm('')
          }}
        >
          Change
        </Button>
      </div>
    )
  }

  return (
    <div>
      <Input
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder="Search the formulary…"
        autoComplete="off"
      />
      {isFetching && <p className="mt-1 text-xs text-slate-400">Searching…</p>}
      {!isFetching && data && data.results.length === 0 && (
        <p className="mt-1 text-xs text-slate-400">No matching medications.</p>
      )}
      {data && data.results.length > 0 && (
        <ul className="mt-1 max-h-52 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
          {data.results.map((medication) => (
            <li key={medication.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(medication)
                  setTerm('')
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-slate-50"
              >
                <span className="text-sm text-slate-800">
                  {medication.name} {medication.strength}
                </span>
                <span className="text-xs text-slate-500">
                  {medication.total_stock} in stock
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function Records() {
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('encounter')

  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [encounterType, setEncounterType] = useState('')
  const [status, setStatus] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [detailError, setDetailError] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(emptyEncounter)
  const [patient, setPatient] = useState<PatientRef | null>(null)
  const [formError, setFormError] = useState('')

  const [showDiagnosis, setShowDiagnosis] = useState(false)
  const [diagnosisForm, setDiagnosisForm] = useState(emptyDiagnosis)
  const [diagnosisError, setDiagnosisError] = useState('')

  const [showPrescription, setShowPrescription] = useState(false)
  const [prescriptionForm, setPrescriptionForm] = useState(emptyPrescription)
  const [medication, setMedication] = useState<Medication | null>(null)
  const [prescriptionError, setPrescriptionError] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search)
      setPage(1)
    }, 350)
    return () => clearTimeout(timer)
  }, [search])

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['encounters', { debounced, encounterType, status, dateFrom, dateTo, page }],
    queryFn: async () =>
      (
        await api.get<Page<Encounter>>('/records/', {
          params: {
            search: debounced || undefined,
            encounter_type: encounterType || undefined,
            status: status || undefined,
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

  const detail = useQuery({
    queryKey: ['encounter', selectedId],
    queryFn: async () => (await api.get<Encounter>(`/records/${selectedId}`)).data,
    enabled: Boolean(selectedId),
  })

  const patientId = detail.data?.patient.id

  const history = useQuery({
    queryKey: ['patient-history', patientId],
    queryFn: async () =>
      (await api.get<Encounter[]>(`/records/patient/${patientId}/history`)).data,
    enabled: Boolean(patientId),
  })

  // A deep link wins; otherwise the newest encounter opens automatically.
  useEffect(() => {
    if (selectedId) return
    const first = data?.results[0]
    if (!first) return
    setParams({ encounter: String(first.id) }, { replace: true })
  }, [data, selectedId, setParams])

  const select = (id: number) => setParams({ encounter: String(id) })

  const refreshDetail = () => {
    queryClient.invalidateQueries({ queryKey: ['encounter', selectedId] })
    queryClient.invalidateQueries({ queryKey: ['patient-history'] })
  }

  const createEncounter = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      (await api.post<Encounter>('/records/', payload)).data,
    onSuccess: (encounter) => {
      setFormOpen(false)
      setForm(emptyEncounter())
      setPatient(null)
      setFormError('')
      queryClient.invalidateQueries({ queryKey: ['encounters'] })
      setParams({ encounter: String(encounter.id) })
    },
    onError: (caught) => setFormError(errorMessage(caught)),
  })

  const closeEncounter = useMutation({
    mutationFn: async (id: number) => (await api.post<Encounter>(`/records/${id}/close`)).data,
    onSuccess: () => {
      setDetailError('')
      refreshDetail()
      queryClient.invalidateQueries({ queryKey: ['encounters'] })
    },
    onError: (caught) => setDetailError(errorMessage(caught)),
  })

  const addDiagnosis = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      (await api.post<Diagnosis>(`/records/${selectedId}/diagnoses`, payload)).data,
    onSuccess: () => {
      setShowDiagnosis(false)
      setDiagnosisForm(emptyDiagnosis())
      setDiagnosisError('')
      refreshDetail()
    },
    onError: (caught) => setDiagnosisError(errorMessage(caught)),
  })

  const removeDiagnosis = useMutation({
    mutationFn: async (id: number) => api.delete(`/records/diagnoses/${id}`),
    onSuccess: () => {
      setDetailError('')
      refreshDetail()
    },
    onError: (caught) => setDetailError(errorMessage(caught)),
  })

  const addPrescription = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      (await api.post(`/records/${selectedId}/prescriptions`, payload)).data,
    onSuccess: () => {
      setShowPrescription(false)
      setPrescriptionForm(emptyPrescription())
      setMedication(null)
      setPrescriptionError('')
      refreshDetail()
    },
    onError: (caught) => setPrescriptionError(errorMessage(caught)),
  })

  const removePrescription = useMutation({
    mutationFn: async (id: number) => api.delete(`/records/prescriptions/${id}`),
    onSuccess: () => {
      setDetailError('')
      refreshDetail()
    },
    onError: (caught) => setDetailError(errorMessage(caught)),
  })

  const submitEncounter = () => {
    setFormError('')
    if (!patient) {
      setFormError('Pick the patient this encounter belongs to')
      return
    }
    if (!form.doctor) {
      setFormError('Pick the doctor who saw the patient')
      return
    }
    const payload: Record<string, unknown> = {
      patient: patient.id,
      doctor: Number(form.doctor),
      encounter_type: form.encounter_type,
      chief_complaint: form.chief_complaint,
    }
    if (form.encounter_date) {
      const when = new Date(form.encounter_date)
      if (Number.isNaN(when.getTime())) {
        setFormError('That encounter date could not be understood')
        return
      }
      payload.encounter_date = when.toISOString()
    }
    for (const key of NUMERIC_VITALS) {
      const raw = form[key]
      if (raw === '') continue
      payload[key] = Number(raw)
    }
    createEncounter.mutate(payload)
  }

  const submitDiagnosis = () => {
    setDiagnosisError('')
    if (!diagnosisForm.description.trim()) {
      setDiagnosisError('A description is required')
      return
    }
    addDiagnosis.mutate({
      code: diagnosisForm.code,
      description: diagnosisForm.description,
      diagnosis_type: diagnosisForm.diagnosis_type,
      notes: diagnosisForm.notes,
    })
  }

  const submitPrescription = () => {
    setPrescriptionError('')
    if (!medication) {
      setPrescriptionError('Pick a medication from the formulary')
      return
    }
    if (!prescriptionForm.dosage.trim() || !prescriptionForm.frequency.trim()) {
      setPrescriptionError('Dosage and frequency are required')
      return
    }
    addPrescription.mutate({
      medication: medication.id,
      dosage: prescriptionForm.dosage,
      frequency: prescriptionForm.frequency,
      route: prescriptionForm.route,
      duration_days: Number(prescriptionForm.duration_days) || 1,
      quantity: Number(prescriptionForm.quantity) || 1,
      instructions: prescriptionForm.instructions,
    })
  }

  const set = (key: keyof ReturnType<typeof emptyEncounter>) => (value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }))

  const record = detail.data
  const timeline = (history.data ?? []).filter((row) => String(row.id) !== selectedId).slice(0, 5)

  return (
    <>
      <PageHeader
        title="Medical records"
        subtitle="Encounters, diagnoses and prescriptions"
        actions={
          <Button
            onClick={() => {
              setForm(emptyEncounter())
              setPatient(null)
              setFormError('')
              setFormOpen(true)
            }}
          >
            + New encounter
          </Button>
        }
      />

      <Card bodyClassName="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <Field label="Search">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Patient, MRN or chief complaint…"
              />
            </Field>
          </div>
          <Field label="Type" className="w-44">
            <Select
              value={encounterType}
              onChange={(event) => {
                setEncounterType(event.target.value)
                setPage(1)
              }}
            >
              <option value="">All</option>
              {ENCOUNTER_TYPES.map((option) => (
                <option key={option} value={option}>
                  {titleCase(option)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status" className="w-40">
            <Select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value)
                setPage(1)
              }}
            >
              <option value="">All</option>
              {ENCOUNTER_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {titleCase(option)}
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
                setPage(1)
              }}
            />
          </Field>
        </div>
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Card
            title="Encounters"
            actions={
              data ? <span className="text-xs text-slate-500">{data.count} total</span> : undefined
            }
          >
            {isLoading && <Loading label="Loading encounters…" />}
            {isError && <ErrorBanner message={errorMessage(error)} onRetry={() => refetch()} />}
            {data && data.results.length === 0 && (
              <EmptyState
                title="No encounters found"
                description={
                  debounced
                    ? 'Try a different search term.'
                    : 'Record the first encounter for a patient.'
                }
              />
            )}
            {data && data.results.length > 0 && (
              <>
                <div className="space-y-2">
                  {data.results.map((encounter) => (
                    <button
                      key={encounter.id}
                      onClick={() => select(encounter.id)}
                      className={cx(
                        'w-full rounded-lg border p-3 text-left transition',
                        String(encounter.id) === selectedId
                          ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-800">
                          {encounter.patient.full_name}
                        </span>
                        <StatusBadge status={encounter.status} />
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {formatDateTime(encounter.encounter_date)} ·{' '}
                        {titleCase(encounter.encounter_type)}
                      </p>
                      <p className="text-xs text-slate-500">{encounter.doctor.full_name}</p>
                      {encounter.chief_complaint && (
                        <p className="mt-1 truncate text-xs text-slate-600">
                          {encounter.chief_complaint}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
                <Pagination
                  page={data.page}
                  totalPages={data.total_pages}
                  count={data.count}
                  onChange={setPage}
                />
              </>
            )}
          </Card>
        </div>

        <div className="lg:col-span-3">
          {!selectedId && (
            <Card>
              <EmptyState
                title="No encounter selected"
                description="Pick an encounter on the left to read the full clinical record."
              />
            </Card>
          )}

          {selectedId && detail.isLoading && (
            <Card>
              <Loading label="Loading the record…" />
            </Card>
          )}

          {selectedId && detail.isError && (
            <Card>
              <ErrorBanner
                message={errorMessage(detail.error)}
                onRetry={() => detail.refetch()}
              />
            </Card>
          )}

          {record && (
            <div className="space-y-5">
              <Card>
                {detailError && (
                  <div className="mb-4">
                    <ErrorBanner message={detailError} />
                  </div>
                )}

                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">
                      {record.patient.full_name}
                    </h2>
                    <p className="font-mono text-xs text-slate-500">{record.patient.mrn}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={record.status} />
                    {record.status === 'open' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={closeEncounter.isPending}
                        onClick={() => {
                          setDetailError('')
                          closeEncounter.mutate(record.id)
                        }}
                      >
                        Close encounter
                      </Button>
                    )}
                  </div>
                </div>

                <dl className="mt-4 divide-y divide-slate-100">
                  <DetailRow label="Encounter" value={`#${record.id}`} />
                  <DetailRow label="Date" value={formatDateTime(record.encounter_date)} />
                  <DetailRow label="Type" value={titleCase(record.encounter_type)} />
                  <DetailRow
                    label="Doctor"
                    value={`${record.doctor.full_name}${
                      record.doctor.specialty ? ` · ${record.doctor.specialty}` : ''
                    }`}
                  />
                  <DetailRow
                    label="Follow-up"
                    value={record.follow_up_date ? formatDate(record.follow_up_date) : 'Not set'}
                  />
                </dl>
              </Card>

              <Card title="Vitals">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <StatTile
                    label="Temperature"
                    value={record.temperature_c ? `${record.temperature_c}°C` : '—'}
                  />
                  <StatTile
                    label="Blood pressure"
                    value={record.blood_pressure ?? '—'}
                    hint="mmHg"
                  />
                  <StatTile label="Pulse" value={record.pulse ?? '—'} hint="bpm" />
                  <StatTile
                    label="Respiratory rate"
                    value={record.respiratory_rate ?? '—'}
                    hint="breaths/min"
                  />
                  <StatTile label="SpO₂" value={record.spo2 ? `${record.spo2}%` : '—'} />
                  <StatTile
                    label="Weight"
                    value={record.weight_kg ? `${record.weight_kg} kg` : '—'}
                  />
                  <StatTile
                    label="Height"
                    value={record.height_cm ? `${record.height_cm} cm` : '—'}
                  />
                  <StatTile label="BMI" value={record.bmi ?? '—'} />
                </div>
              </Card>

              <Card title="Clinical notes">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Note label="Chief complaint" value={record.chief_complaint} />
                  <Note
                    label="History of present illness"
                    value={record.history_of_present_illness}
                  />
                  <Note label="Examination notes" value={record.examination_notes} />
                  <Note label="Treatment plan" value={record.treatment_plan} />
                </div>
              </Card>

              <Card
                title="Diagnoses"
                actions={
                  !showDiagnosis && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setDiagnosisForm(emptyDiagnosis())
                        setDiagnosisError('')
                        setShowDiagnosis(true)
                      }}
                    >
                      + Add diagnosis
                    </Button>
                  )
                }
              >
                {showDiagnosis && (
                  <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                    {diagnosisError && (
                      <div className="mb-3">
                        <ErrorBanner message={diagnosisError} />
                      </div>
                    )}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="ICD-10 code">
                        <Input
                          value={diagnosisForm.code}
                          onChange={(event) =>
                            setDiagnosisForm((previous) => ({
                              ...previous,
                              code: event.target.value,
                            }))
                          }
                          placeholder="e.g. J06.9"
                        />
                      </Field>
                      <Field label="Type">
                        <Select
                          value={diagnosisForm.diagnosis_type}
                          onChange={(event) =>
                            setDiagnosisForm((previous) => ({
                              ...previous,
                              diagnosis_type: event.target.value,
                            }))
                          }
                        >
                          {DIAGNOSIS_TYPES.map((option) => (
                            <option key={option} value={option}>
                              {titleCase(option)}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Description" required className="sm:col-span-2">
                        <Input
                          value={diagnosisForm.description}
                          onChange={(event) =>
                            setDiagnosisForm((previous) => ({
                              ...previous,
                              description: event.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field label="Notes" className="sm:col-span-2">
                        <Textarea
                          value={diagnosisForm.notes}
                          onChange={(event) =>
                            setDiagnosisForm((previous) => ({
                              ...previous,
                              notes: event.target.value,
                            }))
                          }
                        />
                      </Field>
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowDiagnosis(false)}
                      >
                        Cancel
                      </Button>
                      <Button size="sm" loading={addDiagnosis.isPending} onClick={submitDiagnosis}>
                        Add diagnosis
                      </Button>
                    </div>
                  </div>
                )}

                {!record.diagnoses || record.diagnoses.length === 0 ? (
                  <p className="py-2 text-sm text-slate-500">No diagnoses recorded yet.</p>
                ) : (
                  <Table>
                    <thead>
                      <tr>
                        <Th>Code</Th>
                        <Th>Description</Th>
                        <Th>Type</Th>
                        <Th>Notes</Th>
                        <Th />
                      </tr>
                    </thead>
                    <tbody>
                      {record.diagnoses.map((diagnosis) => (
                        <tr key={diagnosis.id}>
                          <Td className="font-mono text-xs text-slate-500">
                            {diagnosis.code || '—'}
                          </Td>
                          <Td className="font-medium text-slate-800">{diagnosis.description}</Td>
                          <Td>
                            <Badge
                              tone={diagnosis.diagnosis_type === 'primary' ? 'brand' : 'slate'}
                            >
                              {titleCase(diagnosis.diagnosis_type)}
                            </Badge>
                          </Td>
                          <Td className="max-w-xs truncate text-slate-500">
                            {diagnosis.notes || '—'}
                          </Td>
                          <Td align="right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-rose-600"
                              onClick={() => {
                                setDetailError('')
                                removeDiagnosis.mutate(diagnosis.id)
                              }}
                            >
                              Remove
                            </Button>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </Card>

              <Card
                title="Prescriptions"
                actions={
                  !showPrescription && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setPrescriptionForm(emptyPrescription())
                        setMedication(null)
                        setPrescriptionError('')
                        setShowPrescription(true)
                      }}
                    >
                      + Add prescription
                    </Button>
                  )
                }
              >
                {showPrescription && (
                  <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                    {prescriptionError && (
                      <div className="mb-3">
                        <ErrorBanner message={prescriptionError} />
                      </div>
                    )}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Medication" required className="sm:col-span-2">
                        <MedicationPicker selected={medication} onSelect={setMedication} />
                      </Field>
                      <Field label="Dosage" required hint="e.g. 500mg">
                        <Input
                          value={prescriptionForm.dosage}
                          onChange={(event) =>
                            setPrescriptionForm((previous) => ({
                              ...previous,
                              dosage: event.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field label="Frequency" required hint="e.g. twice daily">
                        <Input
                          value={prescriptionForm.frequency}
                          onChange={(event) =>
                            setPrescriptionForm((previous) => ({
                              ...previous,
                              frequency: event.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field label="Route">
                        <Select
                          value={prescriptionForm.route}
                          onChange={(event) =>
                            setPrescriptionForm((previous) => ({
                              ...previous,
                              route: event.target.value,
                            }))
                          }
                        >
                          {ROUTES.map((option) => (
                            <option key={option} value={option}>
                              {option.toUpperCase()}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Duration (days)">
                        <Input
                          type="number"
                          min={1}
                          value={prescriptionForm.duration_days}
                          onChange={(event) =>
                            setPrescriptionForm((previous) => ({
                              ...previous,
                              duration_days: event.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field label="Quantity">
                        <Input
                          type="number"
                          min={1}
                          value={prescriptionForm.quantity}
                          onChange={(event) =>
                            setPrescriptionForm((previous) => ({
                              ...previous,
                              quantity: event.target.value,
                            }))
                          }
                        />
                      </Field>
                      <Field label="Instructions" className="sm:col-span-2">
                        <Textarea
                          value={prescriptionForm.instructions}
                          onChange={(event) =>
                            setPrescriptionForm((previous) => ({
                              ...previous,
                              instructions: event.target.value,
                            }))
                          }
                          placeholder="Take with food, complete the course, …"
                        />
                      </Field>
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowPrescription(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        loading={addPrescription.isPending}
                        onClick={submitPrescription}
                      >
                        Add prescription
                      </Button>
                    </div>
                  </div>
                )}

                {!record.prescriptions || record.prescriptions.length === 0 ? (
                  <p className="py-2 text-sm text-slate-500">Nothing prescribed yet.</p>
                ) : (
                  <Table>
                    <thead>
                      <tr>
                        <Th>Medication</Th>
                        <Th>Dose</Th>
                        <Th>Route</Th>
                        <Th align="right">Duration</Th>
                        <Th align="right">Qty</Th>
                        <Th>Status</Th>
                        <Th />
                      </tr>
                    </thead>
                    <tbody>
                      {record.prescriptions.map((prescription) => (
                        <tr key={prescription.id}>
                          <Td className="font-medium text-slate-800">
                            {prescription.medication.name} {prescription.medication.strength}
                          </Td>
                          <Td>
                            {prescription.dosage}
                            <span className="text-slate-400"> · {prescription.frequency}</span>
                          </Td>
                          <Td>{prescription.route.toUpperCase()}</Td>
                          <Td align="right">{prescription.duration_days}d</Td>
                          <Td align="right">{prescription.quantity}</Td>
                          <Td>
                            <StatusBadge status={prescription.status} />
                          </Td>
                          <Td align="right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-rose-600"
                              onClick={() => {
                                setDetailError('')
                                removePrescription.mutate(prescription.id)
                              }}
                            >
                              Remove
                            </Button>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </Card>

              <Card title="Patient timeline">
                {history.isLoading && <Loading label="Loading history…" />}
                {history.data && timeline.length === 0 && (
                  <p className="py-2 text-sm text-slate-500">
                    This is the patient's only encounter.
                  </p>
                )}
                {timeline.length > 0 && (
                  <ol className="space-y-3">
                    {timeline.map((row) => (
                      <li key={row.id} className="flex gap-3">
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                        <div className="min-w-0">
                          <button
                            onClick={() => select(row.id)}
                            className="text-sm font-medium text-brand-700 hover:underline"
                          >
                            {formatDateTime(row.encounter_date)}
                          </button>
                          <p className="text-xs text-slate-500">
                            {titleCase(row.encounter_type)} · {row.doctor.full_name}
                          </p>
                          {row.chief_complaint && (
                            <p className="truncate text-xs text-slate-600">
                              {row.chief_complaint}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
            </div>
          )}
        </div>
      </div>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="New encounter"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitEncounter} loading={createEncounter.isPending}>
              Open encounter
            </Button>
          </>
        }
      >
        {formError && (
          <div className="mb-4">
            <ErrorBanner message={formError} />
          </div>
        )}

        <div className="space-y-5">
          <section>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Visit
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Patient" required className="sm:col-span-2">
                <PatientPicker selected={patient} onSelect={setPatient} />
              </Field>
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
              <Field label="Type">
                <Select
                  value={form.encounter_type}
                  onChange={(e) => set('encounter_type')(e.target.value)}
                >
                  {ENCOUNTER_TYPES.map((option) => (
                    <option key={option} value={option}>
                      {titleCase(option)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Encounter date" className="sm:col-span-2">
                <Input
                  type="datetime-local"
                  value={form.encounter_date}
                  onChange={(e) => set('encounter_date')(e.target.value)}
                />
              </Field>
              <Field label="Chief complaint" className="sm:col-span-2">
                <Textarea
                  value={form.chief_complaint}
                  onChange={(e) => set('chief_complaint')(e.target.value)}
                />
              </Field>
            </div>
          </section>

          <section>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Vitals
            </h4>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Temperature (°C)">
                <Input
                  type="number"
                  step="0.1"
                  value={form.temperature_c}
                  onChange={(e) => set('temperature_c')(e.target.value)}
                />
              </Field>
              <Field label="BP systolic">
                <Input
                  type="number"
                  value={form.bp_systolic}
                  onChange={(e) => set('bp_systolic')(e.target.value)}
                />
              </Field>
              <Field label="BP diastolic">
                <Input
                  type="number"
                  value={form.bp_diastolic}
                  onChange={(e) => set('bp_diastolic')(e.target.value)}
                />
              </Field>
              <Field label="Pulse (bpm)">
                <Input
                  type="number"
                  value={form.pulse}
                  onChange={(e) => set('pulse')(e.target.value)}
                />
              </Field>
              <Field label="Respiratory rate">
                <Input
                  type="number"
                  value={form.respiratory_rate}
                  onChange={(e) => set('respiratory_rate')(e.target.value)}
                />
              </Field>
              <Field label="SpO₂ (%)">
                <Input
                  type="number"
                  value={form.spo2}
                  onChange={(e) => set('spo2')(e.target.value)}
                />
              </Field>
              <Field label="Weight (kg)">
                <Input
                  type="number"
                  step="0.01"
                  value={form.weight_kg}
                  onChange={(e) => set('weight_kg')(e.target.value)}
                />
              </Field>
              <Field label="Height (cm)">
                <Input
                  type="number"
                  step="0.01"
                  value={form.height_cm}
                  onChange={(e) => set('height_cm')(e.target.value)}
                />
              </Field>
            </div>
          </section>
        </div>
      </Modal>
    </>
  )
}
