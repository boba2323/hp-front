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
  StatTile,
  Table,
  Td,
  Textarea,
  Th,
  cx,
} from '../components/ui'
import { api, errorMessage } from '../lib/api'
import { formatDate, formatDateTime, formatMoney, titleCase } from '../lib/format'
import type {
  Dispense,
  ExpiringBatch,
  Medication,
  Page,
  PendingPrescription,
  StockBatch,
} from '../lib/types'

const TABS = ['catalogue', 'dispensing', 'alerts'] as const
type Tab = (typeof TABS)[number]

/** Matches `Medication.Form` on the backend exactly. */
const DOSAGE_FORMS = [
  'tablet',
  'capsule',
  'syrup',
  'injection',
  'cream',
  'drops',
  'inhaler',
  'suppository',
  'other',
]

const EXPIRY_WINDOWS = [30, 60, 90, 180]

/** Endpoints in this module answer with either a bare array or a page. */
type ListResponse<T> = T[] | Page<T>

function listResults<T>(data: ListResponse<T> | undefined): T[] {
  if (!data) return []
  if (Array.isArray(data)) return data
  return data.results ?? []
}

function daysUntil(value: string | null): number | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000)
}

function medicationNameOf(batch: ExpiringBatch): string {
  if (typeof batch.medication === 'object' && batch.medication !== null) {
    return batch.medication.name
  }
  return batch.medication_name ?? `Medication #${batch.medication}`
}

const EMPTY_MED_FORM = {
  name: '',
  generic_name: '',
  brand_name: '',
  form: '',
  strength: '',
  category: '',
  unit_price: '',
  cost_price: '',
  reorder_level: '',
  is_controlled: false,
  is_active: true,
}

const EMPTY_BATCH_FORM = {
  batch_number: '',
  quantity_received: '',
  quantity_remaining: '',
  unit_cost: '',
  supplier: '',
  received_date: '',
  expiry_date: '',
}

export default function Pharmacy() {
  const queryClient = useQueryClient()

  const [tab, setTab] = useState<Tab>('catalogue')

  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [form, setForm] = useState('')
  const [category, setCategory] = useState('')
  const [controlled, setControlled] = useState('')
  const [activeStatus, setActiveStatus] = useState('')
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [page, setPage] = useState(1)

  const [medFormOpen, setMedFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [medForm, setMedForm] = useState(EMPTY_MED_FORM)
  const [medFormError, setMedFormError] = useState('')

  const [batchTarget, setBatchTarget] = useState<Medication | null>(null)
  const [batchForm, setBatchForm] = useState(EMPTY_BATCH_FORM)
  const [batchError, setBatchError] = useState('')

  const [worklistSearch, setWorklistSearch] = useState('')
  const [worklistDebounced, setWorklistDebounced] = useState('')
  const [worklistPage, setWorklistPage] = useState(1)

  const [dispenseTarget, setDispenseTarget] = useState<PendingPrescription | null>(null)
  const [dispenseBatch, setDispenseBatch] = useState('')
  const [dispenseQty, setDispenseQty] = useState('')
  const [dispenseNotes, setDispenseNotes] = useState('')
  const [dispenseError, setDispenseError] = useState('')

  const [dispenseFrom, setDispenseFrom] = useState('')
  const [dispenseTo, setDispenseTo] = useState('')
  const [dispensePage, setDispensePage] = useState(1)
  const [expiryDays, setExpiryDays] = useState(90)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search)
      setPage(1)
    }, 350)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    const timer = setTimeout(() => {
      setWorklistDebounced(worklistSearch)
      setWorklistPage(1)
    }, 350)
    return () => clearTimeout(timer)
  }, [worklistSearch])

  /* --- Queries ---------------------------------------------------------- */

  const medications = useQuery({
    queryKey: [
      'pharmacy',
      'medications',
      { debounced, form, category, controlled, activeStatus, lowStockOnly, page },
    ],
    queryFn: async () =>
      (
        await api.get<Page<Medication>>('/pharmacy/medications/', {
          params: {
            search: debounced || undefined,
            form: form || undefined,
            category: category || undefined,
            is_controlled: controlled === '' ? undefined : controlled === 'yes',
            is_active: activeStatus === '' ? undefined : activeStatus === 'yes',
            low_stock: lowStockOnly ? true : undefined,
            page,
            page_size: 20,
          },
        })
      ).data,
  })

  const batches = useQuery({
    queryKey: ['pharmacy', 'batches', batchTarget?.id],
    queryFn: async () =>
      (
        await api.get<ListResponse<StockBatch>>(`/pharmacy/medications/${batchTarget?.id}/batches`)
      ).data,
    enabled: Boolean(batchTarget),
  })

  const pending = useQuery({
    queryKey: ['pharmacy', 'pending', { worklistDebounced, worklistPage }],
    queryFn: async () =>
      (
        await api.get<Page<PendingPrescription>>('/pharmacy/prescriptions/pending', {
          params: {
            search: worklistDebounced || undefined,
            page: worklistPage,
            page_size: 20,
          },
        })
      ).data,
    enabled: tab === 'dispensing',
  })

  const dispenseBatches = useQuery({
    queryKey: ['pharmacy', 'batches', dispenseTarget?.medication.id],
    queryFn: async () =>
      (
        await api.get<ListResponse<StockBatch>>(
          `/pharmacy/medications/${dispenseTarget?.medication.id}/batches`,
        )
      ).data,
    enabled: Boolean(dispenseTarget),
  })

  const dispenses = useQuery({
    queryKey: ['pharmacy', 'dispenses', { dispenseFrom, dispenseTo, dispensePage }],
    queryFn: async () =>
      (
        await api.get<Page<Dispense>>('/pharmacy/dispenses', {
          params: {
            date_from: dispenseFrom || undefined,
            date_to: dispenseTo || undefined,
            page: dispensePage,
            page_size: 15,
          },
        })
      ).data,
    enabled: tab === 'dispensing',
  })

  const lowStock = useQuery({
    queryKey: ['pharmacy', 'low-stock'],
    queryFn: async () => (await api.get<ListResponse<Medication>>('/pharmacy/low-stock/')).data,
    enabled: tab === 'alerts',
  })

  const expiring = useQuery({
    queryKey: ['pharmacy', 'expiring', expiryDays],
    queryFn: async () =>
      (
        await api.get<ListResponse<ExpiringBatch>>('/pharmacy/expiring/', {
          params: { days: expiryDays },
        })
      ).data,
    enabled: tab === 'alerts',
  })

  /* --- Mutations -------------------------------------------------------- */

  const saveMedication = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      editingId === null
        ? (await api.post<Medication>('/pharmacy/medications/', payload)).data
        : (await api.patch<Medication>(`/pharmacy/medications/${editingId}`, payload)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pharmacy'] })
      setMedFormOpen(false)
      setMedForm(EMPTY_MED_FORM)
      setEditingId(null)
    },
    onError: (caught) => setMedFormError(errorMessage(caught)),
  })

  const saveBatch = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      (
        await api.post<StockBatch>(
          `/pharmacy/medications/${batchTarget?.id}/batches`,
          payload,
        )
      ).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pharmacy'] })
      setBatchForm(EMPTY_BATCH_FORM)
      setBatchError('')
      setBatchTarget(null)
    },
    onError: (caught) => setBatchError(errorMessage(caught)),
  })

  const dispense = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      (await api.post<Dispense>('/pharmacy/dispense', payload)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pharmacy'] })
      setDispenseTarget(null)
      setDispenseBatch('')
      setDispenseQty('')
      setDispenseNotes('')
      setDispenseError('')
    },
    onError: (caught) => setDispenseError(errorMessage(caught)),
  })

  /* --- Handlers --------------------------------------------------------- */

  const openMedicationForm = (medication?: Medication) => {
    setMedFormError('')
    if (medication) {
      setEditingId(medication.id)
      setMedForm({
        name: medication.name,
        generic_name: medication.generic_name,
        brand_name: medication.brand_name,
        form: medication.form,
        strength: medication.strength,
        category: medication.category,
        unit_price: medication.unit_price,
        cost_price: medication.cost_price,
        reorder_level: String(medication.reorder_level),
        is_controlled: medication.is_controlled,
        is_active: medication.is_active,
      })
    } else {
      setEditingId(null)
      setMedForm(EMPTY_MED_FORM)
    }
    setMedFormOpen(true)
  }

  const submitMedication = () => {
    setMedFormError('')
    if (!medForm.name.trim()) {
      setMedFormError('A medication name is required')
      return
    }
    if (!medForm.form) {
      setMedFormError('Select the dosage form')
      return
    }
    const payload: Record<string, unknown> = {
      name: medForm.name,
      form: medForm.form,
      is_controlled: medForm.is_controlled,
      is_active: medForm.is_active,
    }
    if (medForm.generic_name) payload.generic_name = medForm.generic_name
    if (medForm.brand_name) payload.brand_name = medForm.brand_name
    if (medForm.strength) payload.strength = medForm.strength
    if (medForm.category) payload.category = medForm.category
    if (medForm.unit_price) payload.unit_price = medForm.unit_price
    if (medForm.cost_price) payload.cost_price = medForm.cost_price
    if (medForm.reorder_level) payload.reorder_level = Number(medForm.reorder_level)
    saveMedication.mutate(payload)
  }

  const submitBatch = () => {
    setBatchError('')
    if (!batchForm.batch_number.trim()) {
      setBatchError('A batch number is required')
      return
    }
    const quantity = Number(batchForm.quantity_received)
    if (!quantity || quantity <= 0) {
      setBatchError('Quantity received must be greater than zero')
      return
    }
    const payload: Record<string, unknown> = {
      batch_number: batchForm.batch_number,
      quantity_received: quantity,
    }
    if (batchForm.quantity_remaining) {
      payload.quantity_remaining = Number(batchForm.quantity_remaining)
    }
    if (batchForm.unit_cost) payload.unit_cost = batchForm.unit_cost
    if (batchForm.supplier) payload.supplier = batchForm.supplier
    if (batchForm.received_date) payload.received_date = batchForm.received_date
    if (batchForm.expiry_date) payload.expiry_date = batchForm.expiry_date
    saveBatch.mutate(payload)
  }

  const openDispense = (prescription: PendingPrescription) => {
    setDispenseError('')
    setDispenseBatch('')
    setDispenseQty(String(prescription.quantity ?? ''))
    setDispenseNotes('')
    setDispenseTarget(prescription)
  }

  const submitDispense = () => {
    if (!dispenseTarget) return
    setDispenseError('')
    const quantity = Number(dispenseQty)
    if (!quantity || quantity <= 0) {
      setDispenseError('Enter a quantity greater than zero')
      return
    }
    const payload: Record<string, unknown> = {
      prescription: dispenseTarget.id,
      quantity_dispensed: quantity,
    }
    if (dispenseBatch) payload.batch = Number(dispenseBatch)
    if (dispenseNotes) payload.notes = dispenseNotes
    dispense.mutate(payload)
  }

  const med = (key: keyof typeof EMPTY_MED_FORM) => (value: string | boolean) =>
    setMedForm((previous) => ({ ...previous, [key]: value }))

  const batch = (key: keyof typeof EMPTY_BATCH_FORM) => (value: string) =>
    setBatchForm((previous) => ({ ...previous, [key]: value }))

  const lowStockList = listResults(lowStock.data)
  const expiringList = listResults(expiring.data)

  return (
    <>
      <PageHeader
        title="Pharmacy"
        subtitle="Medication catalogue, dispensing worklist and stock alerts"
        actions={
          <Button onClick={() => openMedicationForm()}>+ Add medication</Button>
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
            {titleCase(option)}
            {option === 'dispensing' && pending.data && pending.data.count > 0 && (
              <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700">
                {pending.data.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'catalogue' && (
        <>
          <Card className="mt-5" bodyClassName="p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-56 flex-1">
                <Field label="Search">
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Name, generic or brand…"
                  />
                </Field>
              </div>
              <Field label="Form" className="w-40">
                <Select
                  value={form}
                  onChange={(event) => {
                    setForm(event.target.value)
                    setPage(1)
                  }}
                >
                  <option value="">All</option>
                  {DOSAGE_FORMS.map((option) => (
                    <option key={option} value={option}>
                      {titleCase(option)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Category" className="w-40">
                <Input
                  value={category}
                  onChange={(event) => {
                    setCategory(event.target.value)
                    setPage(1)
                  }}
                  placeholder="Any"
                />
              </Field>
              <Field label="Controlled" className="w-36">
                <Select
                  value={controlled}
                  onChange={(event) => {
                    setControlled(event.target.value)
                    setPage(1)
                  }}
                >
                  <option value="">All</option>
                  <option value="yes">Controlled</option>
                  <option value="no">Not controlled</option>
                </Select>
              </Field>
              <Field label="Status" className="w-36">
                <Select
                  value={activeStatus}
                  onChange={(event) => {
                    setActiveStatus(event.target.value)
                    setPage(1)
                  }}
                >
                  <option value="">All</option>
                  <option value="yes">Active</option>
                  <option value="no">Inactive</option>
                </Select>
              </Field>
              <div className="pb-1">
                <Button
                  variant={lowStockOnly ? 'primary' : 'secondary'}
                  onClick={() => {
                    setLowStockOnly((previous) => !previous)
                    setPage(1)
                  }}
                >
                  Low stock only
                </Button>
              </div>
            </div>
          </Card>

          <Card className="mt-5">
            {medications.isLoading && <Loading label="Loading medications…" />}
            {medications.isError && (
              <ErrorBanner
                message={errorMessage(medications.error)}
                onRetry={() => medications.refetch()}
              />
            )}
            {medications.data && medications.data.results.length === 0 && (
              <EmptyState
                title="No medications found"
                description={
                  debounced || lowStockOnly
                    ? 'Try different filters.'
                    : 'Add the first medication to build the catalogue.'
                }
                action={<Button onClick={() => openMedicationForm()}>+ Add medication</Button>}
              />
            )}
            {medications.data && medications.data.results.length > 0 && (
              <>
                <Table>
                  <thead>
                    <tr>
                      <Th>Medication</Th>
                      <Th>Form / strength</Th>
                      <Th>Category</Th>
                      <Th align="right">Unit price</Th>
                      <Th align="right">In stock</Th>
                      <Th>Flags</Th>
                      <Th />
                    </tr>
                  </thead>
                  <tbody>
                    {medications.data.results.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/70">
                        <Td>
                          <span className="font-medium text-slate-800">{item.name}</span>
                          {item.generic_name && (
                            <span className="block text-xs text-slate-500">
                              {item.generic_name}
                            </span>
                          )}
                        </Td>
                        <Td>
                          {titleCase(item.form)}
                          {item.strength ? ` · ${item.strength}` : ''}
                        </Td>
                        <Td>{item.category ? titleCase(item.category) : '—'}</Td>
                        <Td align="right">{formatMoney(item.unit_price)}</Td>
                        <Td align="right">
                          <span
                            className={cx(
                              'font-medium',
                              item.is_low_stock ? 'text-rose-600' : 'text-slate-700',
                            )}
                          >
                            {item.total_stock}
                          </span>
                          <span className="block text-xs text-slate-400">
                            reorder at {item.reorder_level}
                          </span>
                        </Td>
                        <Td>
                          <span className="flex flex-wrap gap-1">
                            {item.is_low_stock && <Badge tone="rose">Low stock</Badge>}
                            {item.is_controlled && <Badge tone="amber">Controlled</Badge>}
                            <Badge tone={item.is_active ? 'emerald' : 'slate'}>
                              {item.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                          </span>
                        </Td>
                        <Td align="right">
                          <span className="flex justify-end gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setBatchError('')
                                setBatchForm(EMPTY_BATCH_FORM)
                                setBatchTarget(item)
                              }}
                            >
                              Batches
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openMedicationForm(item)}
                            >
                              Edit
                            </Button>
                          </span>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
                <Pagination
                  page={medications.data.page}
                  totalPages={medications.data.total_pages}
                  count={medications.data.count}
                  onChange={setPage}
                />
              </>
            )}
          </Card>
        </>
      )}

      {tab === 'dispensing' && (
        <>
          <Card className="mt-5" bodyClassName="p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-56 flex-1">
                <Field label="Search worklist">
                  <Input
                    value={worklistSearch}
                    onChange={(event) => setWorklistSearch(event.target.value)}
                    placeholder="Patient, medication or prescription number…"
                  />
                </Field>
              </div>
            </div>
          </Card>

          <Card className="mt-5" title="Pending prescriptions">
            {pending.isLoading && <Loading label="Loading worklist…" />}
            {pending.isError && (
              <ErrorBanner
                message={errorMessage(pending.error)}
                onRetry={() => pending.refetch()}
              />
            )}
            {pending.data && pending.data.results.length === 0 && (
              <EmptyState
                title="Worklist is clear"
                description="Every prescription has been dispensed."
              />
            )}
            {pending.data && pending.data.results.length > 0 && (
              <>
                <Table>
                  <thead>
                    <tr>
                      <Th>Patient</Th>
                      <Th>Medication</Th>
                      <Th>Dosage</Th>
                      <Th>Route</Th>
                      <Th align="right">Quantity</Th>
                      <Th>Written</Th>
                      <Th />
                    </tr>
                  </thead>
                  <tbody>
                    {pending.data.results.map((prescription) => (
                      <tr key={prescription.id} className="hover:bg-slate-50/70">
                        <Td>
                          {prescription.patient ? (
                            <>
                              <span className="font-medium text-slate-800">
                                {prescription.patient.full_name}
                              </span>
                              <span className="ml-2 font-mono text-xs text-slate-400">
                                {prescription.patient.mrn}
                              </span>
                            </>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </Td>
                        <Td>
                          <span className="font-medium text-slate-800">
                            {prescription.medication.name}
                          </span>
                          {prescription.medication.strength && (
                            <span className="ml-1 text-xs text-slate-500">
                              {prescription.medication.strength}
                            </span>
                          )}
                        </Td>
                        <Td>
                          {prescription.dosage || '—'}
                          <span className="block text-xs text-slate-500">
                            {titleCase(prescription.frequency)}
                            {prescription.duration_days
                              ? ` · ${prescription.duration_days} days`
                              : ''}
                          </span>
                        </Td>
                        <Td>{titleCase(prescription.route)}</Td>
                        <Td align="right">{prescription.quantity}</Td>
                        <Td className="whitespace-nowrap text-slate-500">
                          {formatDateTime(prescription.created_at)}
                        </Td>
                        <Td align="right">
                          <Button size="sm" onClick={() => openDispense(prescription)}>
                            Dispense
                          </Button>
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

          <Card
            className="mt-5"
            title="Dispensing history"
            actions={
              <div className="flex flex-wrap items-end gap-2">
                <Field label="From" className="w-36">
                  <Input
                    type="date"
                    value={dispenseFrom}
                    onChange={(event) => {
                      setDispenseFrom(event.target.value)
                      setDispensePage(1)
                    }}
                  />
                </Field>
                <Field label="To" className="w-36">
                  <Input
                    type="date"
                    value={dispenseTo}
                    onChange={(event) => {
                      setDispenseTo(event.target.value)
                      setDispensePage(1)
                    }}
                  />
                </Field>
              </div>
            }
          >
            {dispenses.isLoading && <Loading />}
            {dispenses.isError && <ErrorBanner message={errorMessage(dispenses.error)} />}
            {dispenses.data && dispenses.data.results.length === 0 && (
              <EmptyState
                title="Nothing dispensed yet"
                description="Dispensed prescriptions will be listed here."
              />
            )}
            {dispenses.data && dispenses.data.results.length > 0 && (
              <>
                <Table>
                  <thead>
                    <tr>
                      <Th>Patient</Th>
                      <Th>Medication</Th>
                      <Th align="right">Quantity</Th>
                      <Th>Batch</Th>
                      <Th>Dispensed by</Th>
                      <Th>When</Th>
                      <Th>Notes</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {dispenses.data.results.map((record) => (
                      <tr key={record.id}>
                        <Td>
                          {record.patient?.full_name ?? '—'}
                          {record.patient?.mrn && (
                            <span className="ml-2 font-mono text-xs text-slate-400">
                              {record.patient.mrn}
                            </span>
                          )}
                        </Td>
                        <Td>
                          {record.prescription?.medication?.name ??
                            `Prescription #${record.prescription?.id ?? '—'}`}
                        </Td>
                        <Td align="right">{record.quantity_dispensed}</Td>
                        <Td className="font-mono text-xs text-slate-500">
                          {record.batch?.batch_number ?? '—'}
                        </Td>
                        <Td>{record.dispensed_by?.full_name ?? '—'}</Td>
                        <Td className="whitespace-nowrap text-slate-500">
                          {formatDateTime(record.dispensed_at)}
                        </Td>
                        <Td className="max-w-xs truncate text-slate-500">{record.notes || '—'}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
                <Pagination
                  page={dispenses.data.page}
                  totalPages={dispenses.data.total_pages}
                  count={dispenses.data.count}
                  onChange={setDispensePage}
                />
              </>
            )}
          </Card>
        </>
      )}

      {tab === 'alerts' && (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <Card title="Low stock">
            {lowStock.isLoading && <Loading label="Loading low stock…" />}
            {lowStock.isError && (
              <ErrorBanner
                message={errorMessage(lowStock.error)}
                onRetry={() => lowStock.refetch()}
              />
            )}
            {lowStock.data && lowStockList.length === 0 && (
              <EmptyState title="Stock levels are healthy" description="Nothing needs reordering." />
            )}
            {lowStockList.length > 0 && (
              <ul className="divide-y divide-slate-100">
                {lowStockList.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{item.name}</p>
                      <p className="text-xs text-slate-500">
                        {titleCase(item.form)}
                        {item.strength ? ` · ${item.strength}` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge tone="rose">{item.total_stock} left</Badge>
                      <p className="mt-1 text-xs text-slate-400">reorder at {item.reorder_level}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="Expiring batches"
            actions={
              <Select
                value={String(expiryDays)}
                onChange={(event) => setExpiryDays(Number(event.target.value))}
                className="w-32 py-1 text-xs"
              >
                {EXPIRY_WINDOWS.map((days) => (
                  <option key={days} value={days}>
                    Next {days} days
                  </option>
                ))}
              </Select>
            }
          >
            {expiring.isLoading && <Loading label="Loading batches…" />}
            {expiring.isError && (
              <ErrorBanner
                message={errorMessage(expiring.error)}
                onRetry={() => expiring.refetch()}
              />
            )}
            {expiring.data && expiringList.length === 0 && (
              <EmptyState
                title="No batches expiring"
                description={`Nothing expires within the next ${expiryDays} days.`}
              />
            )}
            {expiringList.length > 0 && (
              <ul className="divide-y divide-slate-100">
                {expiringList.map((item) => {
                  const remaining = daysUntil(item.expiry_date)
                  const expired = item.is_expired || (remaining !== null && remaining < 0)
                  const soon = !expired && remaining !== null && remaining <= 30
                  return (
                    <li
                      key={item.id}
                      className={cx(
                        'flex items-center justify-between gap-3 rounded-lg px-2 py-2.5',
                        expired ? 'bg-rose-50' : soon ? 'bg-amber-50' : '',
                      )}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {medicationNameOf(item)}
                        </p>
                        <p className="font-mono text-xs text-slate-500">
                          {item.batch_number} · {item.quantity_remaining} remaining
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p
                          className={cx(
                            'text-sm font-medium tabular-nums',
                            expired ? 'text-rose-700' : soon ? 'text-amber-700' : 'text-slate-700',
                          )}
                        >
                          {formatDate(item.expiry_date)}
                        </p>
                        <p className="text-xs text-slate-500">
                          {remaining === null
                            ? 'No expiry recorded'
                            : expired
                              ? `Expired ${Math.abs(remaining)} days ago`
                              : `${remaining} days left`}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>
      )}

      {/* Medication create / edit */}
      <Modal
        open={medFormOpen}
        onClose={() => setMedFormOpen(false)}
        title={editingId === null ? 'Add a medication' : 'Edit medication'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setMedFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitMedication} loading={saveMedication.isPending}>
              {editingId === null ? 'Add medication' : 'Save changes'}
            </Button>
          </>
        }
      >
        {medFormError && (
          <div className="mb-4">
            <ErrorBanner message={medFormError} />
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Name" required>
            <Input value={medForm.name} onChange={(e) => med('name')(e.target.value)} />
          </Field>
          <Field label="Generic name">
            <Input
              value={medForm.generic_name}
              onChange={(e) => med('generic_name')(e.target.value)}
            />
          </Field>
          <Field label="Brand name">
            <Input
              value={medForm.brand_name}
              onChange={(e) => med('brand_name')(e.target.value)}
            />
          </Field>
          <Field label="Form" required>
            <Select value={medForm.form} onChange={(e) => med('form')(e.target.value)}>
              <option value="">Not recorded</option>
              {DOSAGE_FORMS.map((option) => (
                <option key={option} value={option}>
                  {titleCase(option)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Strength" hint="e.g. 500 mg">
            <Input value={medForm.strength} onChange={(e) => med('strength')(e.target.value)} />
          </Field>
          <Field label="Category">
            <Input value={medForm.category} onChange={(e) => med('category')(e.target.value)} />
          </Field>
          <Field label="Unit price">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={medForm.unit_price}
              onChange={(e) => med('unit_price')(e.target.value)}
            />
          </Field>
          <Field label="Cost price">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={medForm.cost_price}
              onChange={(e) => med('cost_price')(e.target.value)}
            />
          </Field>
          <Field label="Reorder level">
            <Input
              type="number"
              min={0}
              value={medForm.reorder_level}
              onChange={(e) => med('reorder_level')(e.target.value)}
            />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-5">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={medForm.is_controlled}
              onChange={(e) => med('is_controlled')(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            Controlled substance
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={medForm.is_active}
              onChange={(e) => med('is_active')(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            Active in catalogue
          </label>
        </div>
      </Modal>

      {/* Batches for a medication */}
      <Modal
        open={Boolean(batchTarget)}
        onClose={() => setBatchTarget(null)}
        title={batchTarget ? `Batches — ${batchTarget.name}` : 'Batches'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setBatchTarget(null)}>
              Close
            </Button>
            <Button onClick={submitBatch} loading={saveBatch.isPending}>
              Add batch
            </Button>
          </>
        }
      >
        {batchError && (
          <div className="mb-4">
            <ErrorBanner message={batchError} />
          </div>
        )}

        {batches.isLoading && <Loading label="Loading batches…" />}
        {batches.isError && <ErrorBanner message={errorMessage(batches.error)} />}
        {batches.data && listResults(batches.data).length === 0 && (
          <div className="mb-4">
            <EmptyState title="No batches recorded" description="Receive the first batch below." />
          </div>
        )}
        {batches.data && listResults(batches.data).length > 0 && (
          <div className="mb-5">
            <Table>
              <thead>
                <tr>
                  <Th>Batch</Th>
                  <Th>Supplier</Th>
                  <Th align="right">Remaining</Th>
                  <Th align="right">Unit cost</Th>
                  <Th>Received</Th>
                  <Th>Expires</Th>
                </tr>
              </thead>
              <tbody>
                {listResults(batches.data).map((item) => {
                  const remaining = daysUntil(item.expiry_date)
                  const soon = !item.is_expired && remaining !== null && remaining <= 90
                  return (
                    <tr
                      key={item.id}
                      className={cx(item.is_expired ? 'bg-rose-50' : soon ? 'bg-amber-50' : '')}
                    >
                      <Td className="font-mono text-xs">{item.batch_number}</Td>
                      <Td>{item.supplier || '—'}</Td>
                      <Td align="right">
                        {item.quantity_remaining}
                        <span className="text-slate-400"> / {item.quantity_received}</span>
                      </Td>
                      <Td align="right">{formatMoney(item.unit_cost)}</Td>
                      <Td className="whitespace-nowrap">{formatDate(item.received_date)}</Td>
                      <Td className="whitespace-nowrap">
                        <span
                          className={cx(
                            item.is_expired
                              ? 'font-medium text-rose-700'
                              : soon
                                ? 'font-medium text-amber-700'
                                : 'text-slate-700',
                          )}
                        >
                          {formatDate(item.expiry_date)}
                        </span>
                        {item.is_expired && (
                          <span className="ml-2">
                            <Badge tone="rose">Expired</Badge>
                          </span>
                        )}
                        {soon && <span className="ml-2">
                          <Badge tone="amber">Soon</Badge>
                        </span>}
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          </div>
        )}

        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Receive a new batch
        </h4>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Batch number" required>
            <Input
              value={batchForm.batch_number}
              onChange={(e) => batch('batch_number')(e.target.value)}
            />
          </Field>
          <Field label="Quantity received" required>
            <Input
              type="number"
              min={1}
              value={batchForm.quantity_received}
              onChange={(e) => batch('quantity_received')(e.target.value)}
            />
          </Field>
          <Field label="Quantity remaining" hint="Defaults to received">
            <Input
              type="number"
              min={0}
              value={batchForm.quantity_remaining}
              onChange={(e) => batch('quantity_remaining')(e.target.value)}
            />
          </Field>
          <Field label="Unit cost">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={batchForm.unit_cost}
              onChange={(e) => batch('unit_cost')(e.target.value)}
            />
          </Field>
          <Field label="Supplier">
            <Input value={batchForm.supplier} onChange={(e) => batch('supplier')(e.target.value)} />
          </Field>
          <Field label="Received date">
            <Input
              type="date"
              value={batchForm.received_date}
              onChange={(e) => batch('received_date')(e.target.value)}
            />
          </Field>
          <Field label="Expiry date">
            <Input
              type="date"
              value={batchForm.expiry_date}
              onChange={(e) => batch('expiry_date')(e.target.value)}
            />
          </Field>
        </div>
      </Modal>

      {/* Dispense */}
      <Modal
        open={Boolean(dispenseTarget)}
        onClose={() => setDispenseTarget(null)}
        title="Dispense medication"
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDispenseTarget(null)}>
              Cancel
            </Button>
            <Button onClick={submitDispense} loading={dispense.isPending}>
              Dispense
            </Button>
          </>
        }
      >
        {dispenseError && (
          <div className="mb-4">
            <ErrorBanner message={dispenseError} />
          </div>
        )}

        {dispenseTarget && (
          <>
            <dl className="mb-4 divide-y divide-slate-100 rounded-lg bg-slate-50 px-3">
              <div className="flex items-center justify-between py-2">
                <dt className="text-xs uppercase tracking-wide text-slate-500">Medication</dt>
                <dd className="text-sm font-medium text-slate-800">
                  {dispenseTarget.medication.name}
                  {dispenseTarget.medication.strength
                    ? ` · ${dispenseTarget.medication.strength}`
                    : ''}
                </dd>
              </div>
              <div className="flex items-center justify-between py-2">
                <dt className="text-xs uppercase tracking-wide text-slate-500">Prescribed</dt>
                <dd className="text-sm text-slate-800">
                  {dispenseTarget.quantity} · {titleCase(dispenseTarget.frequency)}
                  {dispenseTarget.duration_days
                    ? ` for ${dispenseTarget.duration_days} days`
                    : ''}
                </dd>
              </div>
              <div className="flex items-center justify-between py-2">
                <dt className="text-xs uppercase tracking-wide text-slate-500">Patient</dt>
                <dd className="text-sm text-slate-800">
                  {dispenseTarget.patient?.full_name ?? '—'}
                </dd>
              </div>
              {dispenseTarget.instructions && (
                <div className="flex items-center justify-between py-2">
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Instructions</dt>
                  <dd className="max-w-xs text-right text-sm text-slate-800">
                    {dispenseTarget.instructions}
                  </dd>
                </div>
              )}
            </dl>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Batch" hint="Optional — oldest stock first">
                <Select
                  value={dispenseBatch}
                  onChange={(event) => setDispenseBatch(event.target.value)}
                >
                  <option value="">No specific batch</option>
                  {listResults(dispenseBatches.data)
                    .filter((item) => !item.is_depleted)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.batch_number} · {item.quantity_remaining} left
                        {item.expiry_date ? ` · exp ${formatDate(item.expiry_date)}` : ''}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="Quantity dispensed" required>
                <Input
                  type="number"
                  min={1}
                  value={dispenseQty}
                  onChange={(event) => setDispenseQty(event.target.value)}
                />
              </Field>
            </div>

            <div className="mt-3">
              <Field label="Notes">
                <Textarea
                  value={dispenseNotes}
                  onChange={(event) => setDispenseNotes(event.target.value)}
                />
              </Field>
            </div>

            {dispenseBatches.data && listResults(dispenseBatches.data).length === 0 && (
              <p className="mt-3 text-xs text-amber-600">
                This medication has no stock batches recorded.
              </p>
            )}
          </>
        )}
      </Modal>

      {tab === 'dispensing' && (
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <StatTile
            label="Awaiting dispensing"
            value={pending.data?.count ?? 0}
            tone={pending.data && pending.data.count > 0 ? 'warning' : 'positive'}
          />
          <StatTile label="Dispensed (recent)" value={dispenses.data?.count ?? 0} />
          <StatTile
            label="Low stock items"
            value={medications.data?.results.filter((item) => item.is_low_stock).length ?? 0}
            tone="critical"
          />
        </div>
      )}

    </>
  )
}
