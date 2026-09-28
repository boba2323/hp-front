import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

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
import { formatDateTime, formatMoney, titleCase } from '../lib/format'
import type {
  DoctorOption,
  LabOrder,
  LabOrderDetail,
  LabTest,
  Page,
  PatientRef,
} from '../lib/types'

const TABS = ['worklist', 'orders', 'tests'] as const
type Tab = (typeof TABS)[number]

const PRIORITIES = ['routine', 'urgent', 'stat']
const ORDER_STATUSES = ['pending', 'collected', 'in_progress', 'completed', 'cancelled']

/** Matches `LabTest.Category` on the backend exactly. */
const TEST_CATEGORIES = [
  'hematology',
  'chemistry',
  'microbiology',
  'urinalysis',
  'imaging',
  'pathology',
  'other',
]

const SAMPLE_TYPES = ['blood', 'urine', 'stool', 'sputum', 'swab', 'tissue', 'other']

/** `/patients/lookup/` and `/staff/doctors/` answer with either an array or a page. */
type ListResponse<T> = T[] | Page<T>

function listResults<T>(data: ListResponse<T> | undefined): T[] {
  if (!data) return []
  if (Array.isArray(data)) return data
  return data.results ?? []
}

interface ResultRow {
  item: number
  result_value: string
  result_unit: string
  is_abnormal: boolean
  remarks: string
}

const EMPTY_TEST_FORM = {
  name: '',
  code: '',
  category: 'other',
  sample_type: '',
  price: '',
  turnaround_hours: '',
  normal_range: '',
  unit: '',
  is_active: true,
}

export default function Laboratory() {
  const queryClient = useQueryClient()

  const [tab, setTab] = useState<Tab>('worklist')
  const [actionError, setActionError] = useState('')

  /* Worklist */
  const [worklistPage, setWorklistPage] = useState(1)

  /* All orders */
  const [orderSearch, setOrderSearch] = useState('')
  const [orderDebounced, setOrderDebounced] = useState('')
  const [orderStatus, setOrderStatus] = useState('')
  const [orderPriority, setOrderPriority] = useState('')
  const [orderFrom, setOrderFrom] = useState('')
  const [orderTo, setOrderTo] = useState('')
  const [orderPage, setOrderPage] = useState(1)
  const [detailId, setDetailId] = useState<number | null>(null)

  /* Test catalogue */
  const [testSearch, setTestSearch] = useState('')
  const [testDebounced, setTestDebounced] = useState('')
  const [testCategory, setTestCategory] = useState('')
  const [testFormOpen, setTestFormOpen] = useState(false)
  const [testForm, setTestForm] = useState(EMPTY_TEST_FORM)
  const [testFormError, setTestFormError] = useState('')

  /* New order */
  const [orderFormOpen, setOrderFormOpen] = useState(false)
  const [orderPatientSearch, setOrderPatientSearch] = useState('')
  const [orderPatientDebounced, setOrderPatientDebounced] = useState('')
  const [orderPatient, setOrderPatient] = useState<PatientRef | null>(null)
  const [orderDoctor, setOrderDoctor] = useState('')
  const [orderPriorityValue, setOrderPriorityValue] = useState('routine')
  const [orderNotes, setOrderNotes] = useState('')
  const [orderTestIds, setOrderTestIds] = useState<number[]>([])
  const [orderFormError, setOrderFormError] = useState('')

  /* Results entry */
  const [resultsId, setResultsId] = useState<number | null>(null)
  const [resultRows, setResultRows] = useState<ResultRow[]>([])
  const [resultsError, setResultsError] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      setOrderDebounced(orderSearch)
      setOrderPage(1)
    }, 350)
    return () => clearTimeout(timer)
  }, [orderSearch])

  useEffect(() => {
    const timer = setTimeout(() => setTestDebounced(testSearch), 350)
    return () => clearTimeout(timer)
  }, [testSearch])

  useEffect(() => {
    const timer = setTimeout(() => setOrderPatientDebounced(orderPatientSearch), 350)
    return () => clearTimeout(timer)
  }, [orderPatientSearch])

  /* --- Queries ---------------------------------------------------------- */

  const pending = useQuery({
    queryKey: ['laboratory', 'pending', worklistPage],
    queryFn: async () =>
      (
        await api.get<Page<LabOrder>>('/laboratory/orders/pending', {
          params: { page: worklistPage, page_size: 20 },
        })
      ).data,
    enabled: tab === 'worklist',
  })

  const orders = useQuery({
    queryKey: [
      'laboratory',
      'orders',
      { orderDebounced, orderStatus, orderPriority, orderFrom, orderTo, orderPage },
    ],
    queryFn: async () =>
      (
        await api.get<Page<LabOrder>>('/laboratory/orders/', {
          params: {
            search: orderDebounced || undefined,
            status: orderStatus || undefined,
            priority: orderPriority || undefined,
            date_from: orderFrom || undefined,
            date_to: orderTo || undefined,
            page: orderPage,
            page_size: 20,
          },
        })
      ).data,
    enabled: tab === 'orders',
  })

  const orderDetail = useQuery({
    queryKey: ['laboratory', 'order', detailId],
    queryFn: async () =>
      (await api.get<LabOrderDetail>(`/laboratory/orders/${detailId}`)).data,
    enabled: detailId !== null,
  })

  const resultsOrder = useQuery({
    queryKey: ['laboratory', 'order', resultsId],
    queryFn: async () =>
      (await api.get<LabOrderDetail>(`/laboratory/orders/${resultsId}`)).data,
    enabled: resultsId !== null,
  })

  const tests = useQuery({
    queryKey: ['laboratory', 'tests', { testDebounced, testCategory }],
    queryFn: async () =>
      (
        await api.get<Page<LabTest>>('/laboratory/tests/', {
          params: {
            search: testDebounced || undefined,
            category: testCategory || undefined,
            page_size: 100,
          },
        })
      ).data,
    enabled: tab === 'tests',
  })

  const activeTests = useQuery({
    queryKey: ['laboratory', 'tests', 'active'],
    queryFn: async () =>
      (await api.get<Page<LabTest>>('/laboratory/tests/', { params: { is_active: true, page_size: 200 } }))
        .data,
    enabled: orderFormOpen,
  })

  const patients = useQuery({
    queryKey: ['patients', 'lookup', orderPatientDebounced],
    queryFn: async () =>
      (
        await api.get<ListResponse<PatientRef>>('/patients/lookup/', {
          params: { search: orderPatientDebounced },
        })
      ).data,
    enabled: orderPatientDebounced.trim().length > 0,
  })

  const doctors = useQuery({
    queryKey: ['staff', 'doctors'],
    queryFn: async () => (await api.get<ListResponse<DoctorOption>>('/staff/doctors/')).data,
    enabled: orderFormOpen,
  })

  // Seed the results form whenever a freshly loaded order arrives.
  useEffect(() => {
    if (!resultsOrder.data) return
    setResultRows(
      resultsOrder.data.items.map((item) => ({
        item: item.id,
        result_value: item.result_value ?? '',
        result_unit: item.result_unit || item.test.unit || '',
        is_abnormal: item.is_abnormal ?? false,
        remarks: item.remarks ?? '',
      })),
    )
  }, [resultsOrder.data])

  /* --- Mutations -------------------------------------------------------- */

  const lifecycle = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: 'collect' | 'start' | 'cancel' }) =>
      (await api.post<LabOrderDetail>(`/laboratory/orders/${id}/${action}`, {})).data,
    onSuccess: () => {
      setActionError('')
      queryClient.invalidateQueries({ queryKey: ['laboratory'] })
    },
    onError: (caught) => setActionError(errorMessage(caught)),
  })

  const createOrder = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      (await api.post<LabOrderDetail>('/laboratory/orders/', payload)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['laboratory'] })
      setOrderFormOpen(false)
      setOrderPatient(null)
      setOrderPatientSearch('')
      setOrderDoctor('')
      setOrderPriorityValue('routine')
      setOrderNotes('')
      setOrderTestIds([])
      setOrderFormError('')
    },
    onError: (caught) => setOrderFormError(errorMessage(caught)),
  })

  const saveResults = useMutation({
    mutationFn: async (rows: ResultRow[]) =>
      (
        await api.post<LabOrderDetail>(`/laboratory/orders/${resultsId}/results`, rows)
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['laboratory'] })
      setResultsId(null)
      setResultRows([])
      setResultsError('')
    },
    onError: (caught) => setResultsError(errorMessage(caught)),
  })

  const createTest = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      (await api.post<LabTest>('/laboratory/tests/', payload)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['laboratory'] })
      setTestFormOpen(false)
      setTestForm(EMPTY_TEST_FORM)
      setTestFormError('')
    },
    onError: (caught) => setTestFormError(errorMessage(caught)),
  })

  /* --- Handlers --------------------------------------------------------- */

  const submitOrder = () => {
    setOrderFormError('')
    if (!orderPatient) {
      setOrderFormError('Select a patient')
      return
    }
    if (orderTestIds.length === 0) {
      setOrderFormError('Select at least one test')
      return
    }
    const payload: Record<string, unknown> = {
      patient: orderPatient.id,
      priority: orderPriorityValue,
      notes: orderNotes,
      test_ids: orderTestIds,
    }
    if (orderDoctor) payload.ordered_by = Number(orderDoctor)
    createOrder.mutate(payload)
  }

  const submitResults = () => {
    setResultsError('')
    if (resultRows.length === 0) {
      setResultsError('This order has no items to report on')
      return
    }
    const missing = resultRows.filter((row) => !row.result_value.trim())
    if (missing.length > 0) {
      setResultsError('Enter a result value for every item')
      return
    }
    saveResults.mutate(resultRows)
  }

  const submitTest = () => {
    setTestFormError('')
    if (!testForm.name.trim() || !testForm.code.trim()) {
      setTestFormError('Name and code are both required')
      return
    }
    const payload: Record<string, unknown> = {
      name: testForm.name,
      code: testForm.code,
      category: testForm.category,
      is_active: testForm.is_active,
    }
    if (testForm.sample_type) payload.sample_type = testForm.sample_type
    if (testForm.price) payload.price = testForm.price
    if (testForm.turnaround_hours) payload.turnaround_hours = Number(testForm.turnaround_hours)
    if (testForm.normal_range) payload.normal_range = testForm.normal_range
    if (testForm.unit) payload.unit = testForm.unit
    createTest.mutate(payload)
  }

  const toggleTest = (testId: number) =>
    setOrderTestIds((previous) =>
      previous.includes(testId)
        ? previous.filter((value) => value !== testId)
        : [...previous, testId],
    )

  const testField = (key: keyof typeof EMPTY_TEST_FORM) => (value: string | boolean) =>
    setTestForm((previous) => ({ ...previous, [key]: value }))

  const patientMatches = listResults(patients.data)
  const doctorList = listResults(doctors.data)
  const availableTests = activeTests.data?.results ?? []

  const selectedTests = availableTests.filter((test) => orderTestIds.includes(test.id))
  const runningTotal = selectedTests.reduce((sum, test) => sum + (Number(test.price) || 0), 0)

  return (
    <>
      <PageHeader
        title="Laboratory"
        subtitle="Order worklist, results reporting and the test catalogue"
        actions={
          <>
            {tab === 'tests' && (
              <Button onClick={() => setTestFormOpen(true)}>+ Add test</Button>
            )}
            <Button onClick={() => setOrderFormOpen(true)}>+ New order</Button>
          </>
        }
      />

      <div className="flex gap-1 border-b border-slate-200">
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
            {option === 'worklist' ? 'Worklist' : option === 'orders' ? 'All orders' : 'Test catalogue'}
            {option === 'worklist' && pending.data && pending.data.count > 0 && (
              <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700">
                {pending.data.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Pending orders"
          value={pending.data?.count ?? 0}
          tone={pending.data && pending.data.count > 0 ? 'warning' : 'positive'}
          hint="Awaiting collection or results"
        />
        <StatTile label="Tests offered" value={activeTests.data?.count ?? '—'} />
        <StatTile
          label="Selected basket"
          value={formatMoney(runningTotal)}
          hint={`${orderTestIds.length} test${orderTestIds.length === 1 ? '' : 's'} chosen`}
        />
      </div>

      {actionError && (
        <div className="mt-5">
          <ErrorBanner message={actionError} />
        </div>
      )}

      {tab === 'worklist' && (
        <Card className="mt-5" title="Pending orders">
          {pending.isLoading && <Loading label="Loading worklist…" />}
          {pending.isError && (
            <ErrorBanner message={errorMessage(pending.error)} onRetry={() => pending.refetch()} />
          )}
          {pending.data && pending.data.results.length === 0 && (
            <EmptyState
              title="Worklist is clear"
              description="There are no laboratory orders awaiting action."
            />
          )}
          {pending.data && pending.data.results.length > 0 && (
            <>
              <Table>
                <thead>
                  <tr>
                    <Th>Patient</Th>
                    <Th>Order</Th>
                    <Th align="right">Total</Th>
                    <Th>Priority</Th>
                    <Th>Status</Th>
                    <Th>Ordered</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {pending.data.results.map((order) => (
                    <tr key={order.id} className="hover:bg-slate-50/70">
                      <Td>
                        <span className="font-medium text-slate-800">
                          {order.patient.full_name}
                        </span>
                        <span className="ml-2 font-mono text-xs text-slate-400">
                          {order.patient.mrn}
                        </span>
                      </Td>
                      <Td className="font-mono text-xs text-slate-500">#{order.id}</Td>
                      <Td align="right">{formatMoney(order.total)}</Td>
                      <Td>
                        <StatusBadge status={order.priority} />
                      </Td>
                      <Td>
                        <StatusBadge status={order.status} />
                      </Td>
                      <Td className="whitespace-nowrap text-slate-500">
                        {formatDateTime(order.ordered_at)}
                      </Td>
                      <Td align="right">
                        <span className="flex flex-wrap justify-end gap-1.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setDetailId(order.id)}
                          >
                            View
                          </Button>
                          {order.status === 'pending' && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => lifecycle.mutate({ id: order.id, action: 'collect' })}
                            >
                              Collect
                            </Button>
                          )}
                          {(order.status === 'pending' || order.status === 'collected') && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => lifecycle.mutate({ id: order.id, action: 'start' })}
                            >
                              Start
                            </Button>
                          )}
                          <Button
                            size="sm"
                            onClick={() => {
                              setResultsError('')
                              setResultRows([])
                              setResultsId(order.id)
                            }}
                          >
                            Enter results
                          </Button>
                          {order.status !== 'cancelled' && order.status !== 'completed' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => lifecycle.mutate({ id: order.id, action: 'cancel' })}
                            >
                              Cancel
                            </Button>
                          )}
                        </span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <Pagination
                page={pending.data.page}
                totalPages={pending.data.total_pages}
                count={pending.data.count}
                onChange={setWorklistPage}
              />
            </>
          )}
        </Card>
      )}

      {tab === 'orders' && (
        <>
          <Card className="mt-5" bodyClassName="p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-56 flex-1">
                <Field label="Search">
                  <Input
                    value={orderSearch}
                    onChange={(event) => setOrderSearch(event.target.value)}
                    placeholder="Patient, MRN or test…"
                  />
                </Field>
              </div>
              <Field label="Status" className="w-40">
                <Select
                  value={orderStatus}
                  onChange={(event) => {
                    setOrderStatus(event.target.value)
                    setOrderPage(1)
                  }}
                >
                  <option value="">All</option>
                  {ORDER_STATUSES.map((option) => (
                    <option key={option} value={option}>
                      {titleCase(option)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Priority" className="w-36">
                <Select
                  value={orderPriority}
                  onChange={(event) => {
                    setOrderPriority(event.target.value)
                    setOrderPage(1)
                  }}
                >
                  <option value="">All</option>
                  {PRIORITIES.map((option) => (
                    <option key={option} value={option}>
                      {titleCase(option)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="From" className="w-36">
                <Input
                  type="date"
                  value={orderFrom}
                  onChange={(event) => {
                    setOrderFrom(event.target.value)
                    setOrderPage(1)
                  }}
                />
              </Field>
              <Field label="To" className="w-36">
                <Input
                  type="date"
                  value={orderTo}
                  onChange={(event) => {
                    setOrderTo(event.target.value)
                    setOrderPage(1)
                  }}
                />
              </Field>
            </div>
          </Card>

          <Card className="mt-5">
            {orders.isLoading && <Loading label="Loading orders…" />}
            {orders.isError && (
              <ErrorBanner message={errorMessage(orders.error)} onRetry={() => orders.refetch()} />
            )}
            {orders.data && orders.data.results.length === 0 && (
              <EmptyState
                title="No orders found"
                description={
                  orderDebounced ? 'Try a different search term.' : 'Raise the first laboratory order.'
                }
                action={<Button onClick={() => setOrderFormOpen(true)}>+ New order</Button>}
              />
            )}
            {orders.data && orders.data.results.length > 0 && (
              <>
                <Table>
                  <thead>
                    <tr>
                      <Th>Order</Th>
                      <Th>Patient</Th>
                      <Th>Ordered by</Th>
                      <Th>Priority</Th>
                      <Th>Status</Th>
                      <Th align="right">Total</Th>
                      <Th>Ordered</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.data.results.map((order) => (
                      <tr
                        key={order.id}
                        onClick={() => setDetailId(order.id)}
                        className="cursor-pointer hover:bg-slate-50/70"
                      >
                        <Td className="font-mono text-xs text-slate-500">#{order.id}</Td>
                        <Td>
                          <span className="font-medium text-slate-800">
                            {order.patient.full_name}
                          </span>
                          <span className="ml-2 font-mono text-xs text-slate-400">
                            {order.patient.mrn}
                          </span>
                        </Td>
                        <Td>{order.ordered_by?.full_name || '—'}</Td>
                        <Td>
                          <StatusBadge status={order.priority} />
                        </Td>
                        <Td>
                          <StatusBadge status={order.status} />
                        </Td>
                        <Td align="right">{formatMoney(order.total)}</Td>
                        <Td className="whitespace-nowrap text-slate-500">
                          {formatDateTime(order.ordered_at)}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
                <Pagination
                  page={orders.data.page}
                  totalPages={orders.data.total_pages}
                  count={orders.data.count}
                  onChange={setOrderPage}
                />
              </>
            )}
          </Card>
        </>
      )}

      {tab === 'tests' && (
        <>
          <Card className="mt-5" bodyClassName="p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-56 flex-1">
                <Field label="Search">
                  <Input
                    value={testSearch}
                    onChange={(event) => setTestSearch(event.target.value)}
                    placeholder="Test name or code…"
                  />
                </Field>
              </div>
              <Field label="Category" className="w-48">
                <Select
                  value={testCategory}
                  onChange={(event) => setTestCategory(event.target.value)}
                >
                  <option value="">All</option>
                  {TEST_CATEGORIES.map((option) => (
                    <option key={option} value={option}>
                      {titleCase(option)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Card>

          <Card className="mt-5">
            {tests.isLoading && <Loading label="Loading tests…" />}
            {tests.isError && (
              <ErrorBanner message={errorMessage(tests.error)} onRetry={() => tests.refetch()} />
            )}
            {tests.data && tests.data.results.length === 0 && (
              <EmptyState
                title="No tests found"
                description="Add a test to the catalogue to start ordering it."
                action={<Button onClick={() => setTestFormOpen(true)}>+ Add test</Button>}
              />
            )}
            {tests.data && tests.data.results.length > 0 && (
              <Table>
                <thead>
                  <tr>
                    <Th>Test</Th>
                    <Th>Category</Th>
                    <Th>Sample</Th>
                    <Th>Normal range</Th>
                    <Th align="right">Turnaround</Th>
                    <Th align="right">Price</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {tests.data.results.map((test) => (
                    <tr key={test.id} className="hover:bg-slate-50/70">
                      <Td>
                        <span className="font-medium text-slate-800">{test.name}</span>
                        <span className="ml-2 font-mono text-xs text-slate-400">{test.code}</span>
                      </Td>
                      <Td>{titleCase(test.category)}</Td>
                      <Td>{titleCase(test.sample_type)}</Td>
                      <Td className="text-slate-500">
                        {test.normal_range || '—'}
                        {test.unit ? ` ${test.unit}` : ''}
                      </Td>
                      <Td align="right">{test.turnaround_hours} h</Td>
                      <Td align="right">{formatMoney(test.price)}</Td>
                      <Td>
                        <Badge tone={test.is_active ? 'emerald' : 'slate'}>
                          {test.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </>
      )}

      {/* Order detail */}
      <Modal
        open={detailId !== null}
        onClose={() => setDetailId(null)}
        title={orderDetail.data ? `Order #${orderDetail.data.id}` : 'Order'}
        size="lg"
        footer={
          <Button variant="secondary" onClick={() => setDetailId(null)}>
            Close
          </Button>
        }
      >
        {orderDetail.isLoading && <Loading label="Loading order…" />}
        {orderDetail.isError && <ErrorBanner message={errorMessage(orderDetail.error)} />}
        {orderDetail.data && (
          <>
            <dl className="mb-4 divide-y divide-slate-100">
              <DetailRow label="Patient" value={orderDetail.data.patient.full_name} />
              <DetailRow label="MRN" value={orderDetail.data.patient.mrn} />
              <DetailRow label="Ordered by" value={orderDetail.data.ordered_by?.full_name || '—'} />
              <DetailRow label="Ordered at" value={formatDateTime(orderDetail.data.ordered_at)} />
              <DetailRow
                label="Priority"
                value={<StatusBadge status={orderDetail.data.priority} />}
              />
              <DetailRow label="Status" value={<StatusBadge status={orderDetail.data.status} />} />
              <DetailRow label="Notes" value={orderDetail.data.notes || '—'} />
              <DetailRow label="Total" value={formatMoney(orderDetail.data.total)} />
            </dl>

            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Items
            </h4>
            <Table>
              <thead>
                <tr>
                  <Th>Test</Th>
                  <Th>Result</Th>
                  <Th>Reference</Th>
                  <Th>Status</Th>
                  <Th>Remarks</Th>
                </tr>
              </thead>
              <tbody>
                {orderDetail.data.items.map((item) => (
                  <tr key={item.id}>
                    <Td>
                      <span className="font-medium text-slate-800">{item.test.name}</span>
                      <span className="ml-2 font-mono text-xs text-slate-400">
                        {item.test.code}
                      </span>
                    </Td>
                    <Td>
                      {item.result_value ? (
                        <span
                          className={cx(
                            'font-medium',
                            item.is_abnormal ? 'text-rose-700' : 'text-slate-800',
                          )}
                        >
                          {item.result_value}
                          {item.result_unit ? ` ${item.result_unit}` : ''}
                        </span>
                      ) : (
                        <span className="text-slate-400">Not reported</span>
                      )}
                      {item.is_abnormal && (
                        <span className="ml-2">
                          <Badge tone="rose">Abnormal</Badge>
                        </span>
                      )}
                    </Td>
                    <Td className="text-slate-500">
                      {item.test.normal_range || '—'}
                      {item.test.unit ? ` ${item.test.unit}` : ''}
                    </Td>
                    <Td>
                      <StatusBadge status={item.status} />
                    </Td>
                    <Td className="max-w-xs truncate text-slate-500">{item.remarks || '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </>
        )}
      </Modal>

      {/* Results entry */}
      <Modal
        open={resultsId !== null}
        onClose={() => setResultsId(null)}
        title="Enter results"
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setResultsId(null)}>
              Cancel
            </Button>
            <Button onClick={submitResults} loading={saveResults.isPending}>
              Save results
            </Button>
          </>
        }
      >
        {resultsError && (
          <div className="mb-4">
            <ErrorBanner message={resultsError} />
          </div>
        )}
        {resultsOrder.isLoading && <Loading label="Loading order items…" />}
        {resultsOrder.isError && <ErrorBanner message={errorMessage(resultsOrder.error)} />}
        {resultsOrder.data && (
          <>
            <p className="mb-4 text-sm text-slate-600">
              Reporting on <span className="font-medium">{resultsOrder.data.patient.full_name}</span>{' '}
              · order #{resultsOrder.data.id} ·{' '}
              <StatusBadge status={resultsOrder.data.priority} />
            </p>

            <div className="space-y-4">
              {resultsOrder.data.items.map((item, index) => {
                const row = resultRows[index]
                if (!row) return null
                const update = (patch: Partial<ResultRow>) =>
                  setResultRows((previous) =>
                    previous.map((entry, position) =>
                      position === index ? { ...entry, ...patch } : entry,
                    ),
                  )
                return (
                  <div key={item.id} className="rounded-lg border border-slate-200 p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{item.test.name}</p>
                        <p className="text-xs text-slate-500">
                          <span className="font-mono">{item.test.code}</span>
                          {item.test.normal_range
                            ? ` · reference ${item.test.normal_range}${
                                item.test.unit ? ` ${item.test.unit}` : ''
                              }`
                            : ''}
                        </p>
                      </div>
                      <StatusBadge status={item.status} />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-4">
                      <Field label="Result value" required className="sm:col-span-2">
                        <Input
                          value={row.result_value}
                          onChange={(event) => update({ result_value: event.target.value })}
                          placeholder={item.test.normal_range || 'Result'}
                        />
                      </Field>
                      <Field label="Unit">
                        <Input
                          value={row.result_unit}
                          onChange={(event) => update({ result_unit: event.target.value })}
                        />
                      </Field>
                      <div className="flex items-end pb-2">
                        <label className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={row.is_abnormal}
                            onChange={(event) => update({ is_abnormal: event.target.checked })}
                            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          />
                          Abnormal
                        </label>
                      </div>
                      <Field label="Remarks" className="sm:col-span-4">
                        <Input
                          value={row.remarks}
                          onChange={(event) => update({ remarks: event.target.value })}
                        />
                      </Field>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </Modal>

      {/* New order */}
      <Modal
        open={orderFormOpen}
        onClose={() => setOrderFormOpen(false)}
        title="Raise a laboratory order"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOrderFormOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitOrder}
              loading={createOrder.isPending}
              disabled={orderTestIds.length === 0 || !orderPatient}
            >
              Create order · {formatMoney(runningTotal)}
            </Button>
          </>
        }
      >
        {orderFormError && (
          <div className="mb-4">
            <ErrorBanner message={orderFormError} />
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Patient" required hint="Search by name, MRN or phone">
            <Input
              value={orderPatient ? orderPatient.full_name : orderPatientSearch}
              onChange={(event) => {
                setOrderPatient(null)
                setOrderPatientSearch(event.target.value)
              }}
              placeholder="Start typing a patient name…"
            />
          </Field>
          <Field label="Ordering doctor">
            <Select value={orderDoctor} onChange={(event) => setOrderDoctor(event.target.value)}>
              <option value="">Not recorded</option>
              {doctorList.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctor.full_name}
                  {doctor.specialty ? ` · ${doctor.specialty}` : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priority">
            <Select
              value={orderPriorityValue}
              onChange={(event) => setOrderPriorityValue(event.target.value)}
            >
              {PRIORITIES.map((option) => (
                <option key={option} value={option}>
                  {titleCase(option)}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {!orderPatient && orderPatientDebounced.trim() && (
          <div className="mt-3 max-h-44 overflow-y-auto rounded-lg border border-slate-200">
            {patients.isLoading && <p className="px-3 py-2 text-xs text-slate-500">Searching…</p>}
            {patients.data && patientMatches.length === 0 && (
              <p className="px-3 py-2 text-xs text-slate-500">No patients match that search.</p>
            )}
            {patientMatches.map((patient) => (
              <button
                key={patient.id}
                onClick={() => {
                  setOrderPatient(patient)
                  setOrderPatientSearch('')
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition hover:bg-slate-50"
              >
                <span className="font-medium text-slate-700">{patient.full_name}</span>
                <span className="font-mono text-xs text-slate-400">{patient.mrn}</span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Tests
            </h4>
            <span className="text-xs text-slate-500">
              {orderTestIds.length} selected ·{' '}
              <span className="font-medium tabular-nums text-slate-700">
                {formatMoney(runningTotal)}
              </span>
            </span>
          </div>

          {activeTests.isLoading && <Loading label="Loading tests…" />}
          {activeTests.data && availableTests.length === 0 && (
            <EmptyState
              title="No active tests"
              description="Add tests to the catalogue before ordering."
            />
          )}
          <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
            {availableTests.map((test) => (
              <label
                key={test.id}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm transition hover:bg-slate-50"
              >
                <span className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={orderTestIds.includes(test.id)}
                    onChange={() => toggleTest(test.id)}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span>
                    <span className="font-medium text-slate-800">{test.name}</span>
                    <span className="ml-2 font-mono text-xs text-slate-400">{test.code}</span>
                    <span className="ml-2 text-xs text-slate-500">{titleCase(test.category)}</span>
                  </span>
                </span>
                <span className="shrink-0 tabular-nums text-slate-700">
                  {formatMoney(test.price)}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="mt-3">
          <Field label="Notes">
            <Textarea value={orderNotes} onChange={(event) => setOrderNotes(event.target.value)} />
          </Field>
        </div>
      </Modal>

      {/* New test */}
      <Modal
        open={testFormOpen}
        onClose={() => setTestFormOpen(false)}
        title="Add a laboratory test"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setTestFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitTest} loading={createTest.isPending}>
              Add test
            </Button>
          </>
        }
      >
        {testFormError && (
          <div className="mb-4">
            <ErrorBanner message={testFormError} />
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Name" required>
            <Input
              value={testForm.name}
              onChange={(event) => testField('name')(event.target.value)}
            />
          </Field>
          <Field label="Code" required>
            <Input
              value={testForm.code}
              onChange={(event) => testField('code')(event.target.value)}
            />
          </Field>
          <Field label="Category">
            <Select
              value={testForm.category}
              onChange={(event) => testField('category')(event.target.value)}
            >
              {TEST_CATEGORIES.map((option) => (
                <option key={option} value={option}>
                  {titleCase(option)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Sample type">
            <Select
              value={testForm.sample_type}
              onChange={(event) => testField('sample_type')(event.target.value)}
            >
              <option value="">Not recorded</option>
              {SAMPLE_TYPES.map((option) => (
                <option key={option} value={option}>
                  {titleCase(option)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Price">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={testForm.price}
              onChange={(event) => testField('price')(event.target.value)}
            />
          </Field>
          <Field label="Turnaround (hours)">
            <Input
              type="number"
              min={0}
              value={testForm.turnaround_hours}
              onChange={(event) => testField('turnaround_hours')(event.target.value)}
            />
          </Field>
          <Field label="Unit" hint="e.g. mg/dL">
            <Input
              value={testForm.unit}
              onChange={(event) => testField('unit')(event.target.value)}
            />
          </Field>
          <Field label="Normal range" className="sm:col-span-2">
            <Input
              value={testForm.normal_range}
              onChange={(event) => testField('normal_range')(event.target.value)}
            />
          </Field>
        </div>
        <div className="mt-4">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={testForm.is_active}
              onChange={(event) => testField('is_active')(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            Active and orderable
          </label>
        </div>
      </Modal>
    </>
  )
}
