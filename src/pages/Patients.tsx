import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

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
  Table,
  Td,
  Textarea,
  Th,
} from '../components/ui'
import { api, errorMessage } from '../lib/api'
import { formatDate, titleCase } from '../lib/format'
import type { Page, Patient } from '../lib/types'

const GENDERS = ['male', 'female', 'other']
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
const MARITAL = ['single', 'married', 'divorced', 'widowed']

const EMPTY_FORM = {
  first_name: '',
  last_name: '',
  date_of_birth: '',
  gender: '',
  blood_group: '',
  marital_status: '',
  phone: '',
  alt_phone: '',
  email: '',
  address: '',
  city: '',
  state: '',
  national_id: '',
  occupation: '',
  allergies: '',
  chronic_conditions: '',
  emergency_contact_name: '',
  emergency_contact_relationship: '',
  emergency_contact_phone: '',
  insurance_provider: '',
  insurance_policy_number: '',
}

export default function Patients() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [gender, setGender] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(params.get('new') === '1')
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search)
      setPage(1)
    }, 350)
    return () => clearTimeout(timer)
  }, [search])

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['patients', { debounced, gender, status, page }],
    queryFn: async () =>
      (
        await api.get<Page<Patient>>('/patients/', {
          params: {
            search: debounced || undefined,
            gender: gender || undefined,
            is_active: status === '' ? undefined : status === 'active',
            page,
            page_size: 20,
          },
        })
      ).data,
  })

  const createPatient = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      (await api.post<Patient>('/patients/', payload)).data,
    onSuccess: (patient) => {
      queryClient.invalidateQueries({ queryKey: ['patients'] })
      setFormOpen(false)
      setForm(EMPTY_FORM)
      setParams({})
      navigate(`/patients/${patient.id}`)
    },
    onError: (caught) => setFormError(errorMessage(caught)),
  })

  const submit = () => {
    setFormError('')
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setFormError('First and last name are required')
      return
    }
    const payload: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(form)) {
      if (value === '') continue
      payload[key] = value
    }
    createPatient.mutate(payload)
  }

  const set = (key: keyof typeof EMPTY_FORM) => (value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }))

  return (
    <>
      <PageHeader
        title="Patients"
        subtitle="Register patients and open their clinical record"
        actions={
          <Button
            onClick={() => {
              setFormError('')
              setFormOpen(true)
            }}
          >
            + Register patient
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
                placeholder="Name, MRN, phone, national ID…"
              />
            </Field>
          </div>
          <Field label="Gender" className="w-40">
            <Select
              value={gender}
              onChange={(event) => {
                setGender(event.target.value)
                setPage(1)
              }}
            >
              <option value="">All</option>
              {GENDERS.map((option) => (
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
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
        </div>
      </Card>

      <Card className="mt-5">
        {isLoading && <Loading label="Loading patients…" />}
        {isError && <ErrorBanner message={errorMessage(error)} onRetry={() => refetch()} />}
        {data && data.results.length === 0 && (
          <EmptyState
            title="No patients found"
            description={
              debounced ? 'Try a different search term.' : 'Register the first patient to begin.'
            }
          />
        )}
        {data && data.results.length > 0 && (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>MRN</Th>
                  <Th>Name</Th>
                  <Th>Age / sex</Th>
                  <Th>Phone</Th>
                  <Th>Blood</Th>
                  <Th>Registered</Th>
                  <Th>Status</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {data.results.map((patient) => (
                  <tr key={patient.id} className="hover:bg-slate-50/70">
                    <Td className="font-mono text-xs text-slate-500">{patient.mrn}</Td>
                    <Td>
                      <Link
                        to={`/patients/${patient.id}`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {patient.full_name}
                      </Link>
                      {patient.allergies && (
                        <span className="ml-2">
                          <Badge tone="rose">Allergies</Badge>
                        </span>
                      )}
                    </Td>
                    <Td>
                      {patient.age ?? '—'}
                      <span className="text-slate-400"> · {titleCase(patient.gender)}</span>
                    </Td>
                    <Td>{patient.phone || '—'}</Td>
                    <Td>{patient.blood_group || '—'}</Td>
                    <Td className="whitespace-nowrap text-slate-500">
                      {formatDate(patient.created_at)}
                    </Td>
                    <Td>
                      <Badge tone={patient.is_active ? 'emerald' : 'slate'}>
                        {patient.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </Td>
                    <Td align="right">
                      <Link to={`/patients/${patient.id}`}>
                        <Button variant="secondary" size="sm">
                          Open
                        </Button>
                      </Link>
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
        onClose={() => {
          setFormOpen(false)
          setParams({})
        }}
        title="Register a new patient"
        size="lg"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setFormOpen(false)
                setParams({})
              }}
            >
              Cancel
            </Button>
            <Button onClick={submit} loading={createPatient.isPending}>
              Register patient
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
              Identity
            </h4>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="First name" required>
                <Input value={form.first_name} onChange={(e) => set('first_name')(e.target.value)} />
              </Field>
              <Field label="Last name" required>
                <Input value={form.last_name} onChange={(e) => set('last_name')(e.target.value)} />
              </Field>
              <Field label="Date of birth">
                <Input
                  type="date"
                  value={form.date_of_birth}
                  onChange={(e) => set('date_of_birth')(e.target.value)}
                />
              </Field>
              <Field label="Gender">
                <Select value={form.gender} onChange={(e) => set('gender')(e.target.value)}>
                  <option value="">Not recorded</option>
                  {GENDERS.map((option) => (
                    <option key={option} value={option}>
                      {titleCase(option)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Blood group">
                <Select
                  value={form.blood_group}
                  onChange={(e) => set('blood_group')(e.target.value)}
                >
                  <option value="">Unknown</option>
                  {BLOOD_GROUPS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Marital status">
                <Select
                  value={form.marital_status}
                  onChange={(e) => set('marital_status')(e.target.value)}
                >
                  <option value="">Not recorded</option>
                  {MARITAL.map((option) => (
                    <option key={option} value={option}>
                      {titleCase(option)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="National ID">
                <Input value={form.national_id} onChange={(e) => set('national_id')(e.target.value)} />
              </Field>
              <Field label="Occupation">
                <Input value={form.occupation} onChange={(e) => set('occupation')(e.target.value)} />
              </Field>
            </div>
          </section>

          <section>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Contact
            </h4>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Phone">
                <Input value={form.phone} onChange={(e) => set('phone')(e.target.value)} />
              </Field>
              <Field label="Alternate phone">
                <Input value={form.alt_phone} onChange={(e) => set('alt_phone')(e.target.value)} />
              </Field>
              <Field label="Email">
                <Input type="email" value={form.email} onChange={(e) => set('email')(e.target.value)} />
              </Field>
              <Field label="City">
                <Input value={form.city} onChange={(e) => set('city')(e.target.value)} />
              </Field>
              <Field label="State">
                <Input value={form.state} onChange={(e) => set('state')(e.target.value)} />
              </Field>
              <Field label="Address" className="sm:col-span-2 lg:col-span-3">
                <Textarea value={form.address} onChange={(e) => set('address')(e.target.value)} />
              </Field>
            </div>
          </section>

          <section>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Clinical
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Allergies" hint="Comma separated">
                <Input value={form.allergies} onChange={(e) => set('allergies')(e.target.value)} />
              </Field>
              <Field label="Chronic conditions">
                <Input
                  value={form.chronic_conditions}
                  onChange={(e) => set('chronic_conditions')(e.target.value)}
                />
              </Field>
            </div>
          </section>

          <section>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Emergency contact & insurance
            </h4>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Contact name">
                <Input
                  value={form.emergency_contact_name}
                  onChange={(e) => set('emergency_contact_name')(e.target.value)}
                />
              </Field>
              <Field label="Relationship">
                <Input
                  value={form.emergency_contact_relationship}
                  onChange={(e) => set('emergency_contact_relationship')(e.target.value)}
                />
              </Field>
              <Field label="Contact phone">
                <Input
                  value={form.emergency_contact_phone}
                  onChange={(e) => set('emergency_contact_phone')(e.target.value)}
                />
              </Field>
              <Field label="Insurance provider">
                <Input
                  value={form.insurance_provider}
                  onChange={(e) => set('insurance_provider')(e.target.value)}
                />
              </Field>
              <Field label="Policy number">
                <Input
                  value={form.insurance_policy_number}
                  onChange={(e) => set('insurance_policy_number')(e.target.value)}
                />
              </Field>
            </div>
          </section>
        </div>
      </Modal>
    </>
  )
}
