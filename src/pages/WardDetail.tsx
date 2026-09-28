import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

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
import { formatDate, formatDateTime, formatMoney, titleCase } from '../lib/format'
import type { Admission, Bed, DoctorOption, Page, PatientRef, Ward } from '../lib/types'

const BED_STATUSES = ['available', 'cleaning', 'maintenance']

const BED_TONES: Record<string, string> = {
  available: 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:border-emerald-400',
  occupied: 'border-rose-300 bg-rose-50 text-rose-800 hover:border-rose-400',
  cleaning: 'border-sky-300 bg-sky-50 text-sky-800 hover:border-sky-400',
  maintenance: 'border-slate-300 bg-slate-100 text-slate-700 hover:border-slate-400',
}

/** `/patients/lookup/` and `/staff/doctors/` answer with either a bare array or a page. */
type ListResponse<T> = T[] | { results?: T[] }

function listResults<T>(data: ListResponse<T> | undefined): T[] {
  if (!data) return []
  if (Array.isArray(data)) return data
  return data.results ?? []
}

function bedIdOf(bed: Bed | Admission['bed']): number | null {
  if (bed === null || bed === undefined) return null
  if (typeof bed === 'number') return bed
  return bed.id
}

function bedNumberOf(bed: Admission['bed']): string {
  if (bed === null || bed === undefined) return '—'
  if (typeof bed === 'number') return `Bed #${bed}`
  return bed.number
}

export default function WardDetail() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()

  const [patientSearch, setPatientSearch] = useState('')
  const [debouncedPatient, setDebouncedPatient] = useState('')
  const [selectedPatient, setSelectedPatient] = useState<PatientRef | null>(null)

  const [selectedBed, setSelectedBed] = useState<Bed | null>(null)
  const [transferMode, setTransferMode] = useState(false)
  const [panelError, setPanelError] = useState('')

  const [admitDoctor, setAdmitDoctor] = useState('')
  const [admitReason, setAdmitReason] = useState('')
  const [admitDiagnosis, setAdmitDiagnosis] = useState('')

  const [transferBed, setTransferBed] = useState('')
  const [transferNotes, setTransferNotes] = useState('')

  const [bedFormOpen, setBedFormOpen] = useState(false)
  const [bedNumber, setBedNumber] = useState('')
  const [bedStatus, setBedStatus] = useState('available')
  const [bedNotes, setBedNotes] = useState('')
  const [bedFormError, setBedFormError] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedPatient(patientSearch), 350)
    return () => clearTimeout(timer)
  }, [patientSearch])

  const ward = useQuery({
    queryKey: ['ward', id],
    queryFn: async () => (await api.get<Ward>(`/wards/${id}`)).data,
    enabled: Boolean(id),
  })

  const beds = useQuery({
    queryKey: ['ward', id, 'beds'],
    queryFn: async () =>
      (await api.get<Page<Bed>>('/wards/beds/', { params: { ward: id, page_size: 200 } })).data,
    enabled: Boolean(id),
  })

  const admissions = useQuery({
    queryKey: ['ward', id, 'admissions'],
    queryFn: async () =>
      (
        await api.get<Page<Admission>>('/wards/admissions/', {
          params: { ward: id, status: 'admitted', page_size: 100 },
        })
      ).data,
    enabled: Boolean(id),
  })

  const patients = useQuery({
    queryKey: ['patients', 'lookup', debouncedPatient],
    queryFn: async () =>
      (
        await api.get<ListResponse<PatientRef>>('/patients/lookup/', {
          params: { search: debouncedPatient },
        })
      ).data,
    enabled: debouncedPatient.trim().length > 0,
  })

  const doctors = useQuery({
    queryKey: ['staff', 'doctors'],
    queryFn: async () =>
      (await api.get<ListResponse<DoctorOption>>('/staff/doctors/')).data,
  })

  const invalidateWard = () => {
    queryClient.invalidateQueries({ queryKey: ['ward', id] })
    queryClient.invalidateQueries({ queryKey: ['wards'] })
  }

  const admit = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      (await api.post<Admission>('/wards/admissions/', payload)).data,
    onSuccess: () => {
      setPanelError('')
      setSelectedBed(null)
      setSelectedPatient(null)
      setPatientSearch('')
      setAdmitDoctor('')
      setAdmitReason('')
      setAdmitDiagnosis('')
      invalidateWard()
    },
    onError: (caught) => setPanelError(errorMessage(caught)),
  })

  const discharge = useMutation({
    mutationFn: async (admissionId: number) =>
      (await api.post<Admission>(`/wards/admissions/${admissionId}/discharge`, {})).data,
    onSuccess: () => {
      setPanelError('')
      setSelectedBed(null)
      invalidateWard()
    },
    onError: (caught) => setPanelError(errorMessage(caught)),
  })

  const transfer = useMutation({
    mutationFn: async ({ admissionId, bed }: { admissionId: number; bed: string }) =>
      (
        await api.post<Admission>(`/wards/admissions/${admissionId}/transfer`, {
          bed: Number(bed),
          notes: transferNotes || undefined,
        })
      ).data,
    onSuccess: () => {
      setPanelError('')
      setTransferMode(false)
      setTransferBed('')
      setTransferNotes('')
      setSelectedBed(null)
      invalidateWard()
    },
    onError: (caught) => setPanelError(errorMessage(caught)),
  })

  const updateBed = useMutation({
    mutationFn: async ({ bedId, status }: { bedId: number; status: string }) =>
      (await api.patch<Bed>(`/wards/beds/${bedId}`, { status })).data,
    onSuccess: (updated) => {
      setPanelError('')
      setSelectedBed(updated)
      invalidateWard()
    },
    onError: (caught) => setPanelError(errorMessage(caught)),
  })

  const createBed = useMutation({
    mutationFn: async () =>
      (
        await api.post<Bed>(`/wards/${id}/beds`, {
          number: bedNumber,
          status: bedStatus,
          notes: bedNotes || undefined,
        })
      ).data,
    onSuccess: () => {
      setBedFormOpen(false)
      setBedNumber('')
      setBedStatus('available')
      setBedNotes('')
      invalidateWard()
    },
    onError: (caught) => setBedFormError(errorMessage(caught)),
  })

  if (ward.isLoading) return <Loading label="Loading ward…" />
  if (ward.isError) return <ErrorBanner message={errorMessage(ward.error)} onRetry={() => ward.refetch()} />
  if (!ward.data) return <EmptyState title="Ward not found" />

  const record = ward.data
  const bedList = beds.data?.results ?? []
  const admissionList = admissions.data?.results ?? []
  const doctorList = listResults(doctors.data)
  const patientMatches = listResults(patients.data)

  const admissionForBed = (bed: Bed): Admission | undefined =>
    admissionList.find((admission) => bedIdOf(admission.bed) === bed.id)

  const availableBeds = bedList.filter((bed) => bed.status === 'available')

  const occupancyPercent = record.bed_count
    ? Math.round((record.occupied_beds / record.bed_count) * 100)
    : 0

  const openBed = (bed: Bed) => {
    setPanelError('')
    setTransferMode(false)
    setTransferBed('')
    setTransferNotes('')
    setSelectedPatient(null)
    setPatientSearch('')
    setSelectedBed(bed)
  }

  const activeAdmission = selectedBed ? admissionForBed(selectedBed) : undefined

  const submitAdmission = () => {
    if (!selectedBed) return
    setPanelError('')
    if (!selectedPatient) {
      setPanelError('Select a patient to admit')
      return
    }
    if (!admitDoctor) {
      setPanelError('Select the admitting doctor')
      return
    }
    admit.mutate({
      patient: selectedPatient.id,
      bed: selectedBed.id,
      admitting_doctor: Number(admitDoctor),
      reason: admitReason || undefined,
      diagnosis_summary: admitDiagnosis || undefined,
    })
  }

  const submitBed = () => {
    setBedFormError('')
    if (!bedNumber.trim()) {
      setBedFormError('A bed number is required')
      return
    }
    createBed.mutate()
  }

  return (
    <>
      <PageHeader
        title={record.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-slate-500">{record.code}</span>
            <Badge tone="brand">{titleCase(record.ward_type)}</Badge>
            {record.floor && <span className="text-xs text-slate-500">{record.floor}</span>}
            <Badge tone={record.is_active ? 'emerald' : 'slate'}>
              {record.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </span>
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => setBedFormOpen(true)}>
              + Add bed
            </Button>
            <Link to="/wards">
              <Button variant="ghost">Back to wards</Button>
            </Link>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Beds" value={record.bed_count} hint={`Capacity ${record.capacity}`} />
        <StatTile label="Occupied" value={record.occupied_beds} tone="warning" />
        <StatTile label="Available" value={record.available_beds} tone="positive" />
        <StatTile
          label="Occupancy"
          value={`${occupancyPercent}%`}
          tone={occupancyPercent > 85 ? 'critical' : 'default'}
          hint={`${formatMoney(record.charge_per_day)} per day`}
        />
      </div>

      <Card className="mt-5" title="Bed board">
        {beds.isLoading && <Loading label="Loading beds…" />}
        {beds.isError && <ErrorBanner message={errorMessage(beds.error)} onRetry={() => beds.refetch()} />}
        {beds.data && bedList.length === 0 && (
          <EmptyState
            title="No beds on this ward"
            description="Add beds to start admitting patients."
          />
        )}
        {bedList.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {bedList.map((bed) => {
                const admission = admissionForBed(bed)
                return (
                  <button
                    key={bed.id}
                    onClick={() => openBed(bed)}
                    className={cx(
                      'flex flex-col gap-1 rounded-xl border p-3 text-left transition',
                      BED_TONES[bed.status] ?? BED_TONES.maintenance,
                    )}
                  >
                    <span className="text-sm font-semibold">{bed.number}</span>
                    <span className="text-xs opacity-80">{titleCase(bed.status)}</span>
                    {admission && (
                      <span className="truncate text-xs font-medium">
                        {admission.patient.full_name}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded border border-emerald-300 bg-emerald-50" /> Available
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded border border-rose-300 bg-rose-50" /> Occupied
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded border border-sky-300 bg-sky-50" /> Cleaning
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded border border-slate-300 bg-slate-100" /> Maintenance
              </span>
            </div>
          </>
        )}
      </Card>

      <Card className="mt-5" title="Current inpatients">
        {admissions.isLoading && <Loading />}
        {admissions.isError && (
          <ErrorBanner message={errorMessage(admissions.error)} onRetry={() => admissions.refetch()} />
        )}
        {admissions.data && admissionList.length === 0 && (
          <EmptyState title="No inpatients" description="This ward has no admitted patients." />
        )}
        {admissionList.length > 0 && (
          <Table>
            <thead>
              <tr>
                <Th>Patient</Th>
                <Th>Bed</Th>
                <Th>Doctor</Th>
                <Th>Admitted</Th>
                <Th>Days</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {admissionList.map((admission) => (
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
                  <Td>{bedNumberOf(admission.bed)}</Td>
                  <Td>{admission.admitting_doctor?.full_name || '—'}</Td>
                  <Td className="whitespace-nowrap text-slate-500">
                    {formatDate(admission.admission_date)}
                  </Td>
                  <Td>{admission.length_of_stay_days}</Td>
                  <Td>
                    <StatusBadge status={admission.status} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* Bed panel: admit when free, act on the admission when occupied */}
      <Modal
        open={Boolean(selectedBed)}
        onClose={() => setSelectedBed(null)}
        title={selectedBed ? `Bed ${selectedBed.number}` : 'Bed'}
        size="md"
        footer={
          activeAdmission && !transferMode ? (
            <>
              <Button variant="secondary" onClick={() => setTransferMode(true)}>
                Transfer
              </Button>
              <Button
                variant="danger"
                loading={discharge.isPending}
                onClick={() => discharge.mutate(activeAdmission.id)}
              >
                Discharge
              </Button>
            </>
          ) : transferMode ? (
            <>
              <Button variant="secondary" onClick={() => setTransferMode(false)}>
                Back
              </Button>
              <Button
                loading={transfer.isPending}
                disabled={!transferBed}
                onClick={() =>
                  activeAdmission &&
                  transfer.mutate({ admissionId: activeAdmission.id, bed: transferBed })
                }
              >
                Transfer patient
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setSelectedBed(null)}>
                Close
              </Button>
              <Button onClick={submitAdmission} loading={admit.isPending}>
                Admit patient
              </Button>
            </>
          )
        }
      >
        {panelError && (
          <div className="mb-4">
            <ErrorBanner message={panelError} />
          </div>
        )}

        {selectedBed && activeAdmission && transferMode && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Moving <span className="font-medium">{activeAdmission.patient.full_name}</span> to
              another bed on {record.name}.
            </p>
            <Field label="Target bed" required>
              <Select value={transferBed} onChange={(e) => setTransferBed(e.target.value)}>
                <option value="">Select an available bed</option>
                {availableBeds.map((bed) => (
                  <option key={bed.id} value={bed.id}>
                    {bed.number}
                  </option>
                ))}
              </Select>
            </Field>
            {availableBeds.length === 0 && (
              <p className="text-xs text-amber-600">
                No available beds on this ward. Free a bed before transferring.
              </p>
            )}
            <Field label="Notes">
              <Textarea value={transferNotes} onChange={(e) => setTransferNotes(e.target.value)} />
            </Field>
          </div>
        )}

        {selectedBed && activeAdmission && !transferMode && (
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Link
                to={`/patients/${activeAdmission.patient.id}`}
                className="text-sm font-medium text-brand-700 hover:underline"
              >
                {activeAdmission.patient.full_name}
              </Link>
              <span className="font-mono text-xs text-slate-400">
                {activeAdmission.patient.mrn}
              </span>
              <StatusBadge status={activeAdmission.status} />
            </div>
            <dl className="divide-y divide-slate-100">
              <DetailRow label="Admitted" value={formatDateTime(activeAdmission.admission_date)} />
              <DetailRow
                label="Length of stay"
                value={`${activeAdmission.length_of_stay_days} day${
                  activeAdmission.length_of_stay_days === 1 ? '' : 's'
                }`}
              />
              <DetailRow
                label="Admitting doctor"
                value={activeAdmission.admitting_doctor?.full_name || '—'}
              />
              <DetailRow label="Reason" value={activeAdmission.reason || '—'} />
              <DetailRow
                label="Diagnosis"
                value={activeAdmission.diagnosis_summary || 'Not recorded'}
              />
              <DetailRow
                label="Patient age / sex"
                value={`${activeAdmission.patient.age ?? '—'} · ${titleCase(
                  activeAdmission.patient.gender,
                )}`}
              />
            </dl>
          </div>
        )}

        {selectedBed && !activeAdmission && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Patient" required hint="Search by name, MRN or phone">
                <Input
                  value={selectedPatient ? selectedPatient.full_name : patientSearch}
                  onChange={(e) => {
                    setSelectedPatient(null)
                    setPatientSearch(e.target.value)
                  }}
                  placeholder="Start typing a patient name…"
                />
              </Field>
              <Field label="Admitting doctor" required>
                <Select value={admitDoctor} onChange={(e) => setAdmitDoctor(e.target.value)}>
                  <option value="">Select a doctor</option>
                  {doctorList.map((doctor) => (
                    <option key={doctor.id} value={doctor.id}>
                      {doctor.full_name}
                      {doctor.specialty ? ` · ${doctor.specialty}` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {!selectedPatient && debouncedPatient.trim() && (
              <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200">
                {patients.isLoading && (
                  <p className="px-3 py-2 text-xs text-slate-500">Searching…</p>
                )}
                {patients.data && patientMatches.length === 0 && (
                  <p className="px-3 py-2 text-xs text-slate-500">No patients match that search.</p>
                )}
                {patientMatches.map((patient) => (
                  <button
                    key={patient.id}
                    onClick={() => {
                      setSelectedPatient(patient)
                      setPatientSearch('')
                    }}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition hover:bg-slate-50"
                  >
                    <span className="font-medium text-slate-700">{patient.full_name}</span>
                    <span className="font-mono text-xs text-slate-400">{patient.mrn}</span>
                  </button>
                ))}
              </div>
            )}

            <Field label="Reason for admission">
              <Input value={admitReason} onChange={(e) => setAdmitReason(e.target.value)} />
            </Field>
            <Field label="Diagnosis summary">
              <Textarea
                value={admitDiagnosis}
                onChange={(e) => setAdmitDiagnosis(e.target.value)}
              />
            </Field>

            <div className="rounded-lg border border-slate-200 p-3">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Bed status
              </p>
              <div className="flex flex-wrap gap-2">
                {BED_STATUSES.map((status) => (
                  <Button
                    key={status}
                    size="sm"
                    variant={selectedBed.status === status ? 'primary' : 'secondary'}
                    onClick={() => updateBed.mutate({ bedId: selectedBed.id, status })}
                    loading={updateBed.isPending && selectedBed.status !== status}
                  >
                    {titleCase(status)}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={bedFormOpen}
        onClose={() => setBedFormOpen(false)}
        title="Add a bed"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setBedFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitBed} loading={createBed.isPending}>
              Create bed
            </Button>
          </>
        }
      >
        {bedFormError && (
          <div className="mb-4">
            <ErrorBanner message={bedFormError} />
          </div>
        )}
        <div className="space-y-3">
          <Field label="Bed number" required>
            <Input value={bedNumber} onChange={(e) => setBedNumber(e.target.value)} />
          </Field>
          <Field label="Status">
            <Select value={bedStatus} onChange={(e) => setBedStatus(e.target.value)}>
              {['available', 'cleaning', 'maintenance'].map((status) => (
                <option key={status} value={status}>
                  {titleCase(status)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Notes">
            <Textarea value={bedNotes} onChange={(e) => setBedNotes(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </>
  )
}
