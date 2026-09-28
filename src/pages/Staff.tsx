import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

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
import { useAuth } from '../lib/auth'
import { formatDate, formatMoney, titleCase } from '../lib/format'
import type { Department, Page, Staff } from '../lib/types'

const ROLES = ['admin', 'doctor', 'nurse', 'pharmacist', 'lab_tech', 'receptionist', 'accountant']

const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'intern', 'consultant']

const EMPTY_STAFF = {
  username: '',
  email: '',
  first_name: '',
  last_name: '',
  role: 'receptionist',
  phone: '',
  employee_id: '',
  department: '',
  job_title: '',
  employment_type: 'full_time',
  specialty: '',
  license_number: '',
  hire_date: '',
  consultation_fee: '',
}

/** Free-text staff fields forwarded verbatim when they are filled in. */
const STAFF_TEXT_FIELDS = [
  'email',
  'first_name',
  'last_name',
  'phone',
  'employee_id',
  'job_title',
  'specialty',
  'license_number',
  'hire_date',
  'consultation_fee',
] as const

const EMPTY_DEPARTMENT = {
  name: '',
  code: '',
  description: '',
  location: '',
  phone: '',
}

export default function Staff() {
  const queryClient = useQueryClient()
  const { isAdmin } = useAuth()

  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [department, setDepartment] = useState('')
  const [role, setRole] = useState('')
  const [availability, setAvailability] = useState('')
  const [page, setPage] = useState(1)

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_STAFF)
  const [formError, setFormError] = useState('')

  const [deactivateTarget, setDeactivateTarget] = useState<Staff | null>(null)
  const [deactivateError, setDeactivateError] = useState('')

  const [departmentForm, setDepartmentForm] = useState(EMPTY_DEPARTMENT)
  const [departmentError, setDepartmentError] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search)
      setPage(1)
    }, 350)
    return () => clearTimeout(timer)
  }, [search])

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['staff', { debounced, department, role, availability, page }],
    queryFn: async () =>
      (
        await api.get<Page<Staff>>('/staff/', {
          params: {
            search: debounced || undefined,
            department: department || undefined,
            role: role || undefined,
            is_available: availability === '' ? undefined : availability === 'available',
            page,
            page_size: 20,
          },
        })
      ).data,
  })

  const departments = useQuery({
    queryKey: ['departments'],
    queryFn: async () =>
      (await api.get<Page<Department>>('/staff/departments/', { params: { page_size: 100 } }))
        .data,
  })

  const createStaff = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      (await api.post<Staff>('/staff/', payload)).data,
    onSuccess: () => {
      setFormOpen(false)
      setForm(EMPTY_STAFF)
      setFormError('')
      queryClient.invalidateQueries({ queryKey: ['staff'] })
      queryClient.invalidateQueries({ queryKey: ['doctors'] })
    },
    onError: (caught) => setFormError(errorMessage(caught)),
  })

  const deactivateStaff = useMutation({
    mutationFn: async (id: number) => api.delete(`/staff/${id}`),
    onSuccess: () => {
      setDeactivateTarget(null)
      setDeactivateError('')
      queryClient.invalidateQueries({ queryKey: ['staff'] })
      queryClient.invalidateQueries({ queryKey: ['doctors'] })
    },
    onError: (caught) => setDeactivateError(errorMessage(caught)),
  })

  const createDepartment = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      (await api.post<Department>('/staff/departments/', payload)).data,
    onSuccess: () => {
      setDepartmentForm(EMPTY_DEPARTMENT)
      setDepartmentError('')
      queryClient.invalidateQueries({ queryKey: ['departments'] })
    },
    onError: (caught) => setDepartmentError(errorMessage(caught)),
  })

  const submitStaff = () => {
    setFormError('')
    if (!form.username.trim()) {
      setFormError('A username is required - it becomes the login name')
      return
    }
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setFormError('First and last name are required')
      return
    }
    const payload: Record<string, unknown> = {
      username: form.username.trim(),
      role: form.role,
      employment_type: form.employment_type,
    }
    for (const key of STAFF_TEXT_FIELDS) {
      if (form[key] !== '') payload[key] = form[key]
    }
    if (form.department) payload.department_id = Number(form.department)

    createStaff.mutate(payload)
  }

  const submitDepartment = () => {
    setDepartmentError('')
    if (!departmentForm.name.trim() || !departmentForm.code.trim()) {
      setDepartmentError('Name and code are required')
      return
    }
    createDepartment.mutate({
      name: departmentForm.name.trim(),
      code: departmentForm.code.trim(),
      description: departmentForm.description,
      location: departmentForm.location,
      phone: departmentForm.phone,
    })
  }

  const set = (key: keyof typeof EMPTY_STAFF) => (value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }))

  const setDepartmentField = (key: keyof typeof EMPTY_DEPARTMENT) => (value: string) =>
    setDepartmentForm((previous) => ({ ...previous, [key]: value }))

  const departmentOptions = departments.data?.results ?? []

  return (
    <>
      <PageHeader
        title="Staff"
        subtitle="Directory of everyone who works here, and the departments they sit in"
        actions={
          isAdmin && (
            <Button
              onClick={() => {
                setForm(EMPTY_STAFF)
                setFormError('')
                setFormOpen(true)
              }}
            >
              + Add staff member
            </Button>
          )
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Staff directory">
            <div className="mb-4 flex flex-wrap items-end gap-3">
              <div className="min-w-48 flex-1">
                <Field label="Search">
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Name, employee id, licence…"
                  />
                </Field>
              </div>
              <Field label="Department" className="w-44">
                <Select
                  value={department}
                  onChange={(event) => {
                    setDepartment(event.target.value)
                    setPage(1)
                  }}
                >
                  <option value="">All</option>
                  {departmentOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Role" className="w-40">
                <Select
                  value={role}
                  onChange={(event) => {
                    setRole(event.target.value)
                    setPage(1)
                  }}
                >
                  <option value="">All</option>
                  {ROLES.map((option) => (
                    <option key={option} value={option}>
                      {titleCase(option)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Availability" className="w-40">
                <Select
                  value={availability}
                  onChange={(event) => {
                    setAvailability(event.target.value)
                    setPage(1)
                  }}
                >
                  <option value="">All</option>
                  <option value="available">Available</option>
                  <option value="unavailable">Unavailable</option>
                </Select>
              </Field>
            </div>

            {isLoading && <Loading label="Loading staff…" />}
            {isError && <ErrorBanner message={errorMessage(error)} onRetry={() => refetch()} />}
            {data && data.results.length === 0 && (
              <EmptyState
                title="No staff found"
                description={
                  debounced
                    ? 'Try a different search term.'
                    : 'Add the first staff member to build the directory.'
                }
              />
            )}
            {data && data.results.length > 0 && (
              <>
                <Table>
                  <thead>
                    <tr>
                      <Th>Employee</Th>
                      <Th>Name</Th>
                      <Th>Role</Th>
                      <Th>Department</Th>
                      <Th>Job title</Th>
                      <Th>Specialty</Th>
                      <Th>Available</Th>
                      <Th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.results.map((member) => (
                      <tr key={member.id} className="hover:bg-slate-50/70">
                        <Td className="font-mono text-xs text-slate-500">{member.employee_id}</Td>
                        <Td>
                          <div className="font-medium text-slate-800">{member.full_name}</div>
                          <div className="text-xs text-slate-500">
                            {member.user?.email || member.user?.username || '—'}
                          </div>
                        </Td>
                        <Td>
                          <Badge tone={member.role === 'doctor' ? 'brand' : 'slate'}>
                            {titleCase(member.role)}
                          </Badge>
                        </Td>
                        <Td>{member.department?.name ?? '—'}</Td>
                        <Td>
                          <div>{member.job_title || '—'}</div>
                          <div className="text-xs text-slate-500">
                            {titleCase(member.employment_type)}
                            {member.hire_date ? ` · since ${formatDate(member.hire_date)}` : ''}
                          </div>
                        </Td>
                        <Td>
                          <div>{member.specialty || '—'}</div>
                          {member.role === 'doctor' && member.consultation_fee && (
                            <div className="text-xs text-slate-500">
                              {formatMoney(member.consultation_fee)}
                            </div>
                          )}
                        </Td>
                        <Td>
                          <Badge tone={member.is_available ? 'emerald' : 'slate'}>
                            {member.is_available ? 'Available' : 'Unavailable'}
                          </Badge>
                        </Td>
                        <Td align="right">
                          {isAdmin && member.is_available && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setDeactivateError('')
                                setDeactivateTarget(member)
                              }}
                            >
                              Deactivate
                            </Button>
                          )}
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
        </div>

        <div>
          <Card title="Departments">
            {isAdmin && (
              <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                {departmentError && (
                  <div className="mb-3">
                    <ErrorBanner message={departmentError} />
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Name" required>
                    <Input
                      value={departmentForm.name}
                      onChange={(event) => setDepartmentField('name')(event.target.value)}
                      placeholder="Cardiology"
                    />
                  </Field>
                  <Field label="Code" required>
                    <Input
                      value={departmentForm.code}
                      onChange={(event) => setDepartmentField('code')(event.target.value)}
                      placeholder="CARD"
                    />
                  </Field>
                  <Field label="Location">
                    <Input
                      value={departmentForm.location}
                      onChange={(event) => setDepartmentField('location')(event.target.value)}
                    />
                  </Field>
                  <Field label="Phone">
                    <Input
                      value={departmentForm.phone}
                      onChange={(event) => setDepartmentField('phone')(event.target.value)}
                    />
                  </Field>
                  <Field label="Description" className="sm:col-span-2">
                    <Textarea
                      value={departmentForm.description}
                      onChange={(event) => setDepartmentField('description')(event.target.value)}
                    />
                  </Field>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button
                    size="sm"
                    loading={createDepartment.isPending}
                    onClick={submitDepartment}
                  >
                    Add department
                  </Button>
                </div>
              </div>
            )}

            {departments.isLoading && <Loading label="Loading departments…" />}
            {departments.isError && (
              <ErrorBanner
                message={errorMessage(departments.error)}
                onRetry={() => departments.refetch()}
              />
            )}
            {departments.data && departmentOptions.length === 0 && (
              <EmptyState title="No departments" description="Add the first unit above." />
            )}
            {departmentOptions.length > 0 && (
              <ul className="divide-y divide-slate-100">
                {departmentOptions.map((option) => (
                  <li key={option.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{option.name}</p>
                      <p className="text-xs text-slate-500">
                        <span className="font-mono">{option.code}</span>
                        {option.location ? ` · ${option.location}` : ''}
                        {option.phone ? ` · ${option.phone}` : ''}
                      </p>
                    </div>
                    {!option.is_active && <Badge tone="slate">Inactive</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Add a staff member"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitStaff} loading={createStaff.isPending}>
              Create staff member
            </Button>
          </>
        }
      >
        {formError && (
          <div className="mb-4">
            <ErrorBanner message={formError} />
          </div>
        )}

        <div className="mb-4 rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-700 ring-1 ring-brand-200">
          This creates a <span className="font-medium">login account</span> for this person as well
          as their staff profile. No password is set here: a temporary one is generated and they are
          asked to change it the first time they sign in.
        </div>

        <div className="space-y-5">
          <section>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Login account
            </h4>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Username" required hint="Used to sign in">
                <Input
                  value={form.username}
                  onChange={(e) => set('username')(e.target.value)}
                  autoComplete="off"
                />
              </Field>
              <Field label="Email">
                <Input type="email" value={form.email} onChange={(e) => set('email')(e.target.value)} />
              </Field>
              <Field label="Phone">
                <Input value={form.phone} onChange={(e) => set('phone')(e.target.value)} />
              </Field>
              <Field label="First name" required>
                <Input value={form.first_name} onChange={(e) => set('first_name')(e.target.value)} />
              </Field>
              <Field label="Last name" required>
                <Input value={form.last_name} onChange={(e) => set('last_name')(e.target.value)} />
              </Field>
              <Field label="Role">
                <Select value={form.role} onChange={(e) => set('role')(e.target.value)}>
                  {ROLES.map((option) => (
                    <option key={option} value={option}>
                      {titleCase(option)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </section>

          <section>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Employment
            </h4>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Employee ID" hint="Generated when left blank">
                <Input
                  value={form.employee_id}
                  onChange={(e) => set('employee_id')(e.target.value)}
                />
              </Field>
              <Field label="Department">
                <Select value={form.department} onChange={(e) => set('department')(e.target.value)}>
                  <option value="">Unassigned</option>
                  {departmentOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Job title">
                <Input value={form.job_title} onChange={(e) => set('job_title')(e.target.value)} />
              </Field>
              <Field label="Employment type">
                <Select
                  value={form.employment_type}
                  onChange={(e) => set('employment_type')(e.target.value)}
                >
                  {EMPLOYMENT_TYPES.map((option) => (
                    <option key={option} value={option}>
                      {titleCase(option)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Specialty">
                <Input value={form.specialty} onChange={(e) => set('specialty')(e.target.value)} />
              </Field>
              <Field label="Licence number">
                <Input
                  value={form.license_number}
                  onChange={(e) => set('license_number')(e.target.value)}
                />
              </Field>
              <Field label="Hire date">
                <Input
                  type="date"
                  value={form.hire_date}
                  onChange={(e) => set('hire_date')(e.target.value)}
                />
              </Field>
              <Field label="Consultation fee">
                <Input
                  type="number"
                  step="0.01"
                  value={form.consultation_fee}
                  onChange={(e) => set('consultation_fee')(e.target.value)}
                />
              </Field>
            </div>
          </section>
        </div>
      </Modal>

      <Modal
        open={deactivateTarget !== null}
        onClose={() => setDeactivateTarget(null)}
        title="Deactivate staff member"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeactivateTarget(null)}>
              Keep active
            </Button>
            <Button
              variant="danger"
              loading={deactivateStaff.isPending}
              onClick={() => {
                if (!deactivateTarget) return
                setDeactivateError('')
                deactivateStaff.mutate(deactivateTarget.id)
              }}
            >
              Deactivate
            </Button>
          </>
        }
      >
        {deactivateError && (
          <div className="mb-4">
            <ErrorBanner message={deactivateError} />
          </div>
        )}
        {deactivateTarget && (
          <p className="text-sm text-slate-600">
            <span className="font-medium text-slate-800">{deactivateTarget.full_name}</span> loses
            access immediately: their login stops working and they drop out of booking selectors.
            Historic appointments, encounters and admissions keep their author, so nothing is lost -
            the profile is never deleted.
          </p>
        )}
      </Modal>
    </>
  )
}
