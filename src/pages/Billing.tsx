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
  StatusBadge,
  Table,
  Td,
  Textarea,
  Th,
  cx,
} from '../components/ui'
import { api, errorMessage } from '../lib/api'
import { formatDate, formatDateTime, formatMoney, titleCase } from '../lib/format'
import type {
  BillingSummary,
  Invoice,
  InvoiceDetail as InvoiceDetailType,
  Page,
  PatientRef,
  Payment,
} from '../lib/types'

const TABS = ['invoices', 'payments'] as const
type Tab = (typeof TABS)[number]

const INVOICE_STATUSES = ['draft', 'unpaid', 'partial', 'paid', 'cancelled', 'refunded']
const ITEM_TYPES = ['consultation', 'laboratory', 'pharmacy', 'bed', 'procedure', 'other']
const PAYMENT_METHODS = ['cash', 'card', 'transfer', 'insurance', 'mobile']

/** `/patients/lookup/` answers with either an array or a page. */
type ListResponse<T> = T[] | Page<T>

function listResults<T>(data: ListResponse<T> | undefined): T[] {
  if (!data) return []
  if (Array.isArray(data)) return data
  return data.results ?? []
}

/** Read the first present key so a renamed summary field degrades to a dash. */
function pickMoney(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value
  }
  return null
}

interface DraftItem {
  key: string
  item_type: string
  description: string
  quantity: string
  unit_price: string
}

let draftKey = 0

function newDraftItem(): DraftItem {
  draftKey += 1
  return {
    key: `item-${draftKey}`,
    item_type: 'consultation',
    description: '',
    quantity: '1',
    unit_price: '',
  }
}

export default function Billing() {
  const queryClient = useQueryClient()

  const [tab, setTab] = useState<Tab>('invoices')
  const [actionError, setActionError] = useState('')

  /* Invoice list */
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [status, setStatus] = useState('')
  const [unpaidOnly, setUnpaidOnly] = useState(false)
  const [page, setPage] = useState(1)

  /* Payment list */
  const [payMethod, setPayMethod] = useState('')
  const [payFrom, setPayFrom] = useState('')
  const [payTo, setPayTo] = useState('')
  const [payPage, setPayPage] = useState(1)

  /* Invoice detail */
  const [detailId, setDetailId] = useState<number | null>(null)
  const [confirmCancel, setConfirmCancel] = useState(false)

  /* Add line item */
  const [itemType, setItemType] = useState('consultation')
  const [itemDescription, setItemDescription] = useState('')
  const [itemQuantity, setItemQuantity] = useState('1')
  const [itemUnitPrice, setItemUnitPrice] = useState('')
  const [itemError, setItemError] = useState('')

  /* Record payment */
  const [payAmount, setPayAmount] = useState('')
  const [payMethodValue, setPayMethodValue] = useState('cash')
  const [payReference, setPayReference] = useState('')
  const [payNotes, setPayNotes] = useState('')
  const [paymentError, setPaymentError] = useState('')

  /* New invoice */
  const [invoiceFormOpen, setInvoiceFormOpen] = useState(false)
  const [invoicePatientSearch, setInvoicePatientSearch] = useState('')
  const [invoicePatientDebounced, setInvoicePatientDebounced] = useState('')
  const [invoicePatient, setInvoicePatient] = useState<PatientRef | null>(null)
  const [invoiceDueDate, setInvoiceDueDate] = useState('')
  const [invoiceTaxRate, setInvoiceTaxRate] = useState('')
  const [invoiceDiscount, setInvoiceDiscount] = useState('')
  const [invoiceNotes, setInvoiceNotes] = useState('')
  const [draftItems, setDraftItems] = useState<DraftItem[]>([newDraftItem()])
  const [invoiceFormError, setInvoiceFormError] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search)
      setPage(1)
    }, 350)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    const timer = setTimeout(() => setInvoicePatientDebounced(invoicePatientSearch), 350)
    return () => clearTimeout(timer)
  }, [invoicePatientSearch])

  /* --- Queries ---------------------------------------------------------- */

  const summary = useQuery({
    queryKey: ['billing', 'summary'],
    queryFn: async () => (await api.get<BillingSummary>('/billing/summary/')).data,
  })

  const invoices = useQuery({
    queryKey: ['billing', 'invoices', { debounced, status, unpaidOnly, page }],
    queryFn: async () =>
      (
        await api.get<Page<Invoice>>('/billing/invoices/', {
          params: {
            search: debounced || undefined,
            status: status || undefined,
            unpaid: unpaidOnly ? true : undefined,
            page,
            page_size: 20,
            ordering: '-issued_date',
          },
        })
      ).data,
  })

  const invoiceDetail = useQuery({
    queryKey: ['billing', 'invoice', detailId],
    queryFn: async () =>
      (await api.get<InvoiceDetailType>(`/billing/invoices/${detailId}`)).data,
    enabled: detailId !== null,
  })

  const payments = useQuery({
    queryKey: ['billing', 'payments', { payMethod, payFrom, payTo, payPage }],
    queryFn: async () =>
      (
        await api.get<Page<Payment>>('/billing/payments', {
          params: {
            method: payMethod || undefined,
            date_from: payFrom || undefined,
            date_to: payTo || undefined,
            page: payPage,
            page_size: 20,
            ordering: '-paid_at',
          },
        })
      ).data,
    enabled: tab === 'payments',
  })

  const patients = useQuery({
    queryKey: ['patients', 'lookup', invoicePatientDebounced],
    queryFn: async () =>
      (
        await api.get<ListResponse<PatientRef>>('/patients/lookup/', {
          params: { search: invoicePatientDebounced },
        })
      ).data,
    enabled: invoicePatientDebounced.trim().length > 0,
  })

  /* --- Mutations -------------------------------------------------------- */

  const createInvoice = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      (await api.post<InvoiceDetailType>('/billing/invoices/', payload)).data,
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['billing'] })
      setInvoiceFormOpen(false)
      setInvoicePatient(null)
      setInvoicePatientSearch('')
      setInvoiceDueDate('')
      setInvoiceTaxRate('')
      setInvoiceDiscount('')
      setInvoiceNotes('')
      setDraftItems([newDraftItem()])
      setInvoiceFormError('')
      setDetailId(created.id)
    },
    onError: (caught) => setInvoiceFormError(errorMessage(caught)),
  })

  const patchInvoice = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: Record<string, unknown> }) =>
      (await api.patch<InvoiceDetailType>(`/billing/invoices/${id}`, payload)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing'] })
      setConfirmCancel(false)
    },
    onError: (caught) => setActionError(errorMessage(caught)),
  })

  const deleteInvoice = useMutation({
    mutationFn: async (id: number) => (await api.delete(`/billing/invoices/${id}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing'] })
      setDetailId(null)
      setActionError('')
    },
    onError: (caught) => setActionError(errorMessage(caught)),
  })

  const addItem = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      (await api.post(`/billing/invoices/${detailId}/items`, payload)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing'] })
      setItemDescription('')
      setItemQuantity('1')
      setItemUnitPrice('')
      setItemError('')
    },
    onError: (caught) => setItemError(errorMessage(caught)),
  })

  const removeItem = useMutation({
    mutationFn: async (itemId: number) => (await api.delete(`/billing/items/${itemId}`)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing'] })
      setActionError('')
    },
    onError: (caught) => setActionError(errorMessage(caught)),
  })

  const recordPayment = useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      (await api.post<Payment>(`/billing/invoices/${detailId}/payments`, payload)).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['billing'] })
      setPayAmount('')
      setPayReference('')
      setPayNotes('')
      setPayMethodValue('cash')
      setPaymentError('')
    },
    onError: (caught) => setPaymentError(errorMessage(caught)),
  })

  /* --- Handlers --------------------------------------------------------- */

  const submitInvoice = () => {
    setInvoiceFormError('')
    if (!invoicePatient) {
      setInvoiceFormError('Select a patient to invoice')
      return
    }
    const items = draftItems.filter((item) => item.description.trim() !== '')
    if (items.length === 0) {
      setInvoiceFormError('Add at least one line item with a description')
      return
    }
    const payload: Record<string, unknown> = {
      patient: invoicePatient.id,
      notes: invoiceNotes,
      items: items.map((item) => ({
        item_type: item.item_type,
        description: item.description,
        quantity: Number(item.quantity) || 1,
        unit_price: Number(item.unit_price) || 0,
      })),
    }
    if (invoiceDueDate) payload.due_date = invoiceDueDate
    if (invoiceTaxRate) payload.tax_rate = invoiceTaxRate
    if (invoiceDiscount) payload.discount_amount = invoiceDiscount
    createInvoice.mutate(payload)
  }

  const submitItem = () => {
    setItemError('')
    if (!itemDescription.trim()) {
      setItemError('A description is required')
      return
    }
    addItem.mutate({
      item_type: itemType,
      description: itemDescription,
      quantity: Number(itemQuantity) || 1,
      unit_price: Number(itemUnitPrice) || 0,
    })
  }

  const submitPayment = () => {
    setPaymentError('')
    const amount = Number(payAmount)
    if (!amount || amount <= 0) {
      setPaymentError('Enter an amount greater than zero')
      return
    }
    const payload: Record<string, unknown> = {
      amount,
      method: payMethodValue,
    }
    if (payReference) payload.reference = payReference
    if (payNotes) payload.notes = payNotes
    recordPayment.mutate(payload)
  }

  const updateDraft = (key: string, patch: Partial<DraftItem>) =>
    setDraftItems((previous) =>
      previous.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    )

  const removeDraft = (key: string) =>
    setDraftItems((previous) =>
      previous.length === 1 ? previous : previous.filter((item) => item.key !== key),
    )

  /* --- Derived ---------------------------------------------------------- */

  const summaryData = summary.data
  const totalInvoiced = pickMoney(summaryData?.total_invoiced, summaryData?.totalInvoiced)
  const totalCollected = pickMoney(summaryData?.total_collected, summaryData?.totalCollected)
  const totalOutstanding = pickMoney(summaryData?.total_outstanding, summaryData?.totalOutstanding)
  const collectionsThisMonth = pickMoney(
    summaryData?.collections_this_month,
    summaryData?.collectionsThisMonth,
  )
  const countsByStatus = summaryData?.counts_by_status ?? {}

  const draftSubtotal = draftItems.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0),
    0,
  )
  const draftTaxRate = Number(invoiceTaxRate) || 0
  const draftTax = (draftSubtotal * draftTaxRate) / 100
  const draftDiscount = Number(invoiceDiscount) || 0
  const draftTotal = draftSubtotal + draftTax - draftDiscount

  const patientMatches = listResults(patients.data)
  const detail = invoiceDetail.data

  return (
    <>
      <PageHeader
        title="Billing"
        subtitle="Invoices, payments and revenue"
        actions={<Button onClick={() => setInvoiceFormOpen(true)}>+ New invoice</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Total invoiced"
          value={totalInvoiced ? formatMoney(totalInvoiced) : '—'}
          hint={summaryData?.month ? `Period ${summaryData.month}` : undefined}
        />
        <StatTile
          label="Collected"
          value={totalCollected ? formatMoney(totalCollected) : '—'}
          tone="positive"
        />
        <StatTile
          label="Outstanding"
          value={totalOutstanding ? formatMoney(totalOutstanding) : '—'}
          tone={totalOutstanding && Number(totalOutstanding) > 0 ? 'critical' : 'default'}
        />
        <StatTile
          label="Collected this month"
          value={collectionsThisMonth ? formatMoney(collectionsThisMonth) : '—'}
        />
      </div>

      {summary.isError && (
        <div className="mt-4">
          <ErrorBanner message={errorMessage(summary.error)} onRetry={() => summary.refetch()} />
        </div>
      )}

      {Object.keys(countsByStatus).length > 0 && (
        <Card className="mt-4" bodyClassName="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Invoices by status
            </span>
            {INVOICE_STATUSES.filter((option) => countsByStatus[option] !== undefined).map(
              (option) => (
                <span key={option} className="flex items-center gap-1.5">
                  <StatusBadge status={option} />
                  <span className="text-sm font-medium tabular-nums text-slate-700">
                    {countsByStatus[option]}
                  </span>
                </span>
              ),
            )}
          </div>
        </Card>
      )}

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

      {actionError && (
        <div className="mt-5">
          <ErrorBanner message={actionError} />
        </div>
      )}

      {tab === 'invoices' && (
        <>
          <Card className="mt-5" bodyClassName="p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-56 flex-1">
                <Field label="Search">
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Invoice number, patient or MRN…"
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
                  {INVOICE_STATUSES.map((option) => (
                    <option key={option} value={option}>
                      {titleCase(option)}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="pb-1">
                <Button
                  variant={unpaidOnly ? 'primary' : 'secondary'}
                  onClick={() => {
                    setUnpaidOnly((previous) => !previous)
                    setPage(1)
                  }}
                >
                  Show unpaid only
                </Button>
              </div>
            </div>
          </Card>

          <Card className="mt-5">
            {invoices.isLoading && <Loading label="Loading invoices…" />}
            {invoices.isError && (
              <ErrorBanner
                message={errorMessage(invoices.error)}
                onRetry={() => invoices.refetch()}
              />
            )}
            {invoices.data && invoices.data.results.length === 0 && (
              <EmptyState
                title="No invoices found"
                description={
                  debounced || unpaidOnly
                    ? 'Try different filters.'
                    : 'Raise the first invoice to start billing.'
                }
                action={<Button onClick={() => setInvoiceFormOpen(true)}>+ New invoice</Button>}
              />
            )}
            {invoices.data && invoices.data.results.length > 0 && (
              <>
                <Table>
                  <thead>
                    <tr>
                      <Th>Invoice</Th>
                      <Th>Patient</Th>
                      <Th>Issued</Th>
                      <Th>Due</Th>
                      <Th align="right">Total</Th>
                      <Th align="right">Paid</Th>
                      <Th align="right">Balance</Th>
                      <Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.data.results.map((invoice) => (
                      <tr
                        key={invoice.id}
                        onClick={() => {
                          setConfirmCancel(false)
                          setActionError('')
                          setDetailId(invoice.id)
                        }}
                        className="cursor-pointer hover:bg-slate-50/70"
                      >
                        <Td className="font-mono text-xs text-slate-600">
                          {invoice.invoice_number}
                        </Td>
                        <Td>
                          <span className="font-medium text-slate-800">
                            {invoice.patient.full_name}
                          </span>
                          <span className="ml-2 font-mono text-xs text-slate-400">
                            {invoice.patient.mrn}
                          </span>
                        </Td>
                        <Td className="whitespace-nowrap text-slate-500">
                          {formatDate(invoice.issued_date)}
                        </Td>
                        <Td className="whitespace-nowrap text-slate-500">
                          {formatDate(invoice.due_date)}
                        </Td>
                        <Td align="right">{formatMoney(invoice.total)}</Td>
                        <Td align="right">{formatMoney(invoice.amount_paid)}</Td>
                        <Td align="right">
                          <span
                            className={cx(
                              'font-medium',
                              Number(invoice.balance) > 0 ? 'text-rose-600' : 'text-emerald-600',
                            )}
                          >
                            {formatMoney(invoice.balance)}
                          </span>
                        </Td>
                        <Td>
                          <StatusBadge status={invoice.status} />
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
                <Pagination
                  page={invoices.data.page}
                  totalPages={invoices.data.total_pages}
                  count={invoices.data.count}
                  onChange={setPage}
                />
              </>
            )}
          </Card>
        </>
      )}

      {tab === 'payments' && (
        <>
          <Card className="mt-5" bodyClassName="p-4">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Method" className="w-44">
                <Select
                  value={payMethod}
                  onChange={(event) => {
                    setPayMethod(event.target.value)
                    setPayPage(1)
                  }}
                >
                  <option value="">All</option>
                  {PAYMENT_METHODS.map((option) => (
                    <option key={option} value={option}>
                      {titleCase(option)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="From" className="w-40">
                <Input
                  type="date"
                  value={payFrom}
                  onChange={(event) => {
                    setPayFrom(event.target.value)
                    setPayPage(1)
                  }}
                />
              </Field>
              <Field label="To" className="w-40">
                <Input
                  type="date"
                  value={payTo}
                  onChange={(event) => {
                    setPayTo(event.target.value)
                    setPayPage(1)
                  }}
                />
              </Field>
            </div>
          </Card>

          <Card className="mt-5">
            {payments.isLoading && <Loading label="Loading payments…" />}
            {payments.isError && (
              <ErrorBanner
                message={errorMessage(payments.error)}
                onRetry={() => payments.refetch()}
              />
            )}
            {payments.data && payments.data.results.length === 0 && (
              <EmptyState title="No payments found" description="Recorded payments appear here." />
            )}
            {payments.data && payments.data.results.length > 0 && (
              <>
                <Table>
                  <thead>
                    <tr>
                      <Th>Invoice</Th>
                      <Th align="right">Amount</Th>
                      <Th>Method</Th>
                      <Th>Reference</Th>
                      <Th>Received by</Th>
                      <Th>Paid at</Th>
                      <Th>Notes</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.data.results.map((payment) => (
                      <tr key={payment.id} className="hover:bg-slate-50/70">
                        <Td className="font-mono text-xs text-slate-600">
                          {payment.invoice?.invoice_number ?? '—'}
                        </Td>
                        <Td align="right" className="font-medium">
                          {formatMoney(payment.amount)}
                        </Td>
                        <Td>
                          <Badge tone="brand">{titleCase(payment.method)}</Badge>
                        </Td>
                        <Td className="text-slate-500">{payment.reference || '—'}</Td>
                        <Td>{payment.received_by?.full_name ?? '—'}</Td>
                        <Td className="whitespace-nowrap text-slate-500">
                          {formatDateTime(payment.paid_at)}
                        </Td>
                        <Td className="max-w-xs truncate text-slate-500">{payment.notes || '—'}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
                <Pagination
                  page={payments.data.page}
                  totalPages={payments.data.total_pages}
                  count={payments.data.count}
                  onChange={setPayPage}
                />
              </>
            )}
          </Card>
        </>
      )}

      {/* Invoice detail */}
      <Modal
        open={detailId !== null}
        onClose={() => {
          setDetailId(null)
          setConfirmCancel(false)
        }}
        title={detail ? `Invoice ${detail.invoice_number}` : 'Invoice'}
        size="xl"
        footer={
          <>
            {detail && detail.status !== 'cancelled' && detail.status !== 'refunded' && (
              <>
                {confirmCancel ? (
                  <>
                    <Button variant="secondary" onClick={() => setConfirmCancel(false)}>
                      Keep invoice
                    </Button>
                    <Button
                      variant="danger"
                      loading={patchInvoice.isPending}
                      onClick={() =>
                        patchInvoice.mutate({ id: detail.id, payload: { status: 'cancelled' } })
                      }
                    >
                      Confirm cancellation
                    </Button>
                  </>
                ) : (
                  <Button variant="danger" onClick={() => setConfirmCancel(true)}>
                    Cancel invoice
                  </Button>
                )}
              </>
            )}
            {detail && detail.payments?.length === 0 && detail.status !== 'paid' && (
              <Button
                variant="secondary"
                loading={deleteInvoice.isPending}
                onClick={() => deleteInvoice.mutate(detail.id)}
              >
                Delete invoice
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => {
                setDetailId(null)
                setConfirmCancel(false)
              }}
            >
              Close
            </Button>
          </>
        }
      >
        {invoiceDetail.isLoading && <Loading label="Loading invoice…" />}
        {invoiceDetail.isError && <ErrorBanner message={errorMessage(invoiceDetail.error)} />}
        {detail && (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <span className="font-medium text-slate-800">{detail.patient.full_name}</span>
              <span className="font-mono text-xs text-slate-400">{detail.patient.mrn}</span>
              <StatusBadge status={detail.status} />
              <span className="text-xs text-slate-500">
                Issued {formatDate(detail.issued_date)} · Due {formatDate(detail.due_date)}
              </span>
            </div>

            <div className="grid gap-5 lg:grid-cols-5">
              <div className="lg:col-span-3">
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Line items
                </h4>
                {detail.items && detail.items.length > 0 ? (
                  <Table>
                    <thead>
                      <tr>
                        <Th>Type</Th>
                        <Th>Description</Th>
                        <Th align="right">Qty</Th>
                        <Th align="right">Unit</Th>
                        <Th align="right">Amount</Th>
                        <Th />
                      </tr>
                    </thead>
                    <tbody>
                      {detail.items.map((item) => (
                        <tr key={item.id}>
                          <Td>
                            <Badge tone="slate">{titleCase(item.item_type)}</Badge>
                          </Td>
                          <Td className="text-slate-700">{item.description}</Td>
                          <Td align="right">{item.quantity}</Td>
                          <Td align="right">{formatMoney(item.unit_price)}</Td>
                          <Td align="right">{formatMoney(item.amount)}</Td>
                          <Td align="right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeItem.mutate(item.id)}
                            >
                              Remove
                            </Button>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                ) : (
                  <EmptyState
                    title="No line items"
                    description="Add the first charge using the form below."
                  />
                )}

                <div className="mt-5 rounded-lg border border-slate-200 p-4">
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Add a line item
                  </h4>
                  {itemError && (
                    <div className="mb-3">
                      <ErrorBanner message={itemError} />
                    </div>
                  )}
                  <div className="grid gap-3 sm:grid-cols-4">
                    <Field label="Type">
                      <Select
                        value={itemType}
                        onChange={(event) => setItemType(event.target.value)}
                      >
                        {ITEM_TYPES.map((option) => (
                          <option key={option} value={option}>
                            {titleCase(option)}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Description" required className="sm:col-span-2">
                      <Input
                        value={itemDescription}
                        onChange={(event) => setItemDescription(event.target.value)}
                      />
                    </Field>
                    <Field label="Quantity">
                      <Input
                        type="number"
                        min={1}
                        step="0.01"
                        value={itemQuantity}
                        onChange={(event) => setItemQuantity(event.target.value)}
                      />
                    </Field>
                    <Field label="Unit price">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={itemUnitPrice}
                        onChange={(event) => setItemUnitPrice(event.target.value)}
                      />
                    </Field>
                    <div className="flex items-end sm:col-span-3">
                      <Button onClick={submitItem} loading={addItem.isPending}>
                        Add item
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-2">
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Totals
                </h4>
                <dl className="divide-y divide-slate-100 rounded-lg bg-slate-50 px-3">
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-sm text-slate-600">Subtotal</dt>
                    <dd className="text-sm tabular-nums text-slate-800">
                      {formatMoney(detail.subtotal)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-sm text-slate-600">
                      Tax ({Number(detail.tax_rate) || 0}%)
                    </dt>
                    <dd className="text-sm tabular-nums text-slate-800">
                      {formatMoney(detail.tax_amount)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-sm text-slate-600">Discount</dt>
                    <dd className="text-sm tabular-nums text-slate-800">
                      −{formatMoney(detail.discount_amount)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-sm font-semibold text-slate-700">Total</dt>
                    <dd className="text-sm font-semibold tabular-nums text-slate-900">
                      {formatMoney(detail.total)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-sm text-slate-600">Paid</dt>
                    <dd className="text-sm tabular-nums text-emerald-700">
                      {formatMoney(detail.amount_paid)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-sm font-semibold text-slate-700">Balance</dt>
                    <dd
                      className={cx(
                        'text-sm font-semibold tabular-nums',
                        Number(detail.balance) > 0 ? 'text-rose-600' : 'text-emerald-600',
                      )}
                    >
                      {formatMoney(detail.balance)}
                    </dd>
                  </div>
                </dl>

                {detail.notes && (
                  <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    {detail.notes}
                  </p>
                )}

                <h4 className="mb-3 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Payment history
                </h4>
                {detail.payments && detail.payments.length > 0 ? (
                  <ul className="divide-y divide-slate-100">
                    {detail.payments.map((payment) => (
                      <li key={payment.id} className="flex items-center justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800">
                            {formatMoney(payment.amount)}
                            <span className="ml-2 text-xs font-normal text-slate-500">
                              {titleCase(payment.method)}
                            </span>
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatDateTime(payment.paid_at)}
                            {payment.reference ? ` · ${payment.reference}` : ''}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">No payments recorded yet.</p>
                )}

                {detail.status !== 'cancelled' && detail.status !== 'refunded' && (
                  <div className="mt-4 rounded-lg border border-slate-200 p-4">
                    <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Record a payment
                    </h4>
                    {paymentError && (
                      <div className="mb-3">
                        <ErrorBanner message={paymentError} />
                      </div>
                    )}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Amount" required>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={payAmount}
                          onChange={(event) => setPayAmount(event.target.value)}
                          placeholder={detail.balance}
                        />
                      </Field>
                      <Field label="Method">
                        <Select
                          value={payMethodValue}
                          onChange={(event) => setPayMethodValue(event.target.value)}
                        >
                          {PAYMENT_METHODS.map((option) => (
                            <option key={option} value={option}>
                              {titleCase(option)}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Reference">
                        <Input
                          value={payReference}
                          onChange={(event) => setPayReference(event.target.value)}
                        />
                      </Field>
                      <Field label="Notes">
                        <Input
                          value={payNotes}
                          onChange={(event) => setPayNotes(event.target.value)}
                        />
                      </Field>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button onClick={submitPayment} loading={recordPayment.isPending}>
                        Record payment
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => setPayAmount(detail.balance)}
                      >
                        Pay full balance
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </Modal>

      {/* New invoice */}
      <Modal
        open={invoiceFormOpen}
        onClose={() => setInvoiceFormOpen(false)}
        title="Raise a new invoice"
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setInvoiceFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitInvoice} loading={createInvoice.isPending}>
              Create invoice · {formatMoney(draftTotal)}
            </Button>
          </>
        }
      >
        {invoiceFormError && (
          <div className="mb-4">
            <ErrorBanner message={invoiceFormError} />
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Patient" required hint="Search by name, MRN or phone" className="sm:col-span-2">
            <Input
              value={invoicePatient ? invoicePatient.full_name : invoicePatientSearch}
              onChange={(event) => {
                setInvoicePatient(null)
                setInvoicePatientSearch(event.target.value)
              }}
              placeholder="Start typing a patient name…"
            />
          </Field>
          <Field label="Due date">
            <Input
              type="date"
              value={invoiceDueDate}
              onChange={(event) => setInvoiceDueDate(event.target.value)}
            />
          </Field>
          <Field label="Tax rate (%)">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={invoiceTaxRate}
              onChange={(event) => setInvoiceTaxRate(event.target.value)}
            />
          </Field>
        </div>

        {!invoicePatient && invoicePatientDebounced.trim() && (
          <div className="mt-3 max-h-40 overflow-y-auto rounded-lg border border-slate-200">
            {patients.isLoading && <p className="px-3 py-2 text-xs text-slate-500">Searching…</p>}
            {patients.data && patientMatches.length === 0 && (
              <p className="px-3 py-2 text-xs text-slate-500">No patients match that search.</p>
            )}
            {patientMatches.map((patient) => (
              <button
                key={patient.id}
                onClick={() => {
                  setInvoicePatient(patient)
                  setInvoicePatientSearch('')
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition hover:bg-slate-50"
              >
                <span className="font-medium text-slate-700">{patient.full_name}</span>
                <span className="font-mono text-xs text-slate-400">{patient.mrn}</span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Line items
            </h4>
            <Button variant="secondary" size="sm" onClick={() => setDraftItems((p) => [...p, newDraftItem()])}>
              + Add row
            </Button>
          </div>

          <div className="space-y-2">
            {draftItems.map((item) => (
              <div key={item.key} className="grid gap-2 sm:grid-cols-12">
                <div className="sm:col-span-3">
                  <Select
                    value={item.item_type}
                    onChange={(event) => updateDraft(item.key, { item_type: event.target.value })}
                  >
                    {ITEM_TYPES.map((option) => (
                      <option key={option} value={option}>
                        {titleCase(option)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="sm:col-span-5">
                  <Input
                    value={item.description}
                    onChange={(event) =>
                      updateDraft(item.key, { description: event.target.value })
                    }
                    placeholder="Description"
                  />
                </div>
                <div className="sm:col-span-1">
                  <Input
                    type="number"
                    min={1}
                    step="0.01"
                    value={item.quantity}
                    onChange={(event) => updateDraft(item.key, { quantity: event.target.value })}
                    placeholder="Qty"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={item.unit_price}
                    onChange={(event) => updateDraft(item.key, { unit_price: event.target.value })}
                    placeholder="Unit price"
                  />
                </div>
                <div className="flex items-center justify-end sm:col-span-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={draftItems.length === 1}
                    onClick={() => removeDraft(item.key)}
                  >
                    ✕
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Field label="Discount amount">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={invoiceDiscount}
              onChange={(event) => setInvoiceDiscount(event.target.value)}
            />
          </Field>
          <Field label="Notes">
            <Textarea
              value={invoiceNotes}
              onChange={(event) => setInvoiceNotes(event.target.value)}
            />
          </Field>
        </div>

        <dl className="mt-5 divide-y divide-slate-100 rounded-lg bg-slate-50 px-4">
          <div className="flex items-center justify-between py-2">
            <dt className="text-sm text-slate-600">Subtotal</dt>
            <dd className="text-sm tabular-nums text-slate-800">{formatMoney(draftSubtotal)}</dd>
          </div>
          <div className="flex items-center justify-between py-2">
            <dt className="text-sm text-slate-600">Tax ({draftTaxRate}%)</dt>
            <dd className="text-sm tabular-nums text-slate-800">{formatMoney(draftTax)}</dd>
          </div>
          <div className="flex items-center justify-between py-2">
            <dt className="text-sm text-slate-600">Discount</dt>
            <dd className="text-sm tabular-nums text-slate-800">
              −{formatMoney(draftDiscount)}
            </dd>
          </div>
          <div className="flex items-center justify-between py-2">
            <dt className="text-sm font-semibold text-slate-700">Total</dt>
            <dd className="text-sm font-semibold tabular-nums text-slate-900">
              {formatMoney(draftTotal)}
            </dd>
          </div>
        </dl>
      </Modal>
    </>
  )
}
