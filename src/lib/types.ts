/** Shapes returned by the Django Ninja API. */

export interface Page<T> {
  count: number
  page: number
  page_size: number
  total_pages: number
  results: T[]
}

export interface MessageOut {
  detail: string
}

export interface PatientRef {
  id: number
  mrn: string
  full_name: string
  age?: number | null
  gender?: string
  phone?: string
}

export interface DoctorRef {
  id: number
  full_name: string
  specialty?: string
}

export interface NamedRef {
  id: number
  name: string
  code?: string
}

export interface Patient {
  id: number
  mrn: string
  first_name: string
  last_name: string
  full_name: string
  age: number | null
  date_of_birth: string | null
  gender: string
  blood_group: string
  marital_status: string
  national_id: string | null
  phone: string
  alt_phone: string
  email: string
  address: string
  city: string
  state: string
  postal_code: string
  occupation: string
  allergies: string
  chronic_conditions: string
  emergency_contact_name: string
  emergency_contact_relationship: string
  emergency_contact_phone: string
  insurance_provider: string
  insurance_policy_number: string
  is_active: boolean
  created_at: string
}

export interface PatientDetail extends Patient {
  appointment_count: number
  encounter_count: number
  admission_count: number
  invoice_count: number
  outstanding_balance: string
}

export interface Appointment {
  id: number
  patient: PatientRef
  doctor: DoctorRef
  department: NamedRef | null
  scheduled_start: string
  scheduled_end: string
  duration_minutes: number
  status: string
  appointment_type: string
  reason: string
  notes: string
  cancellation_reason: string
  created_at: string
}

export interface Department {
  id: number
  name: string
  code: string
  description: string
  location: string
  phone: string
  is_active: boolean
}

export interface Staff {
  id: number
  employee_id: string
  user: {
    id: number
    username: string
    full_name: string
    email: string
    role: string
  }
  department: NamedRef | null
  job_title: string
  employment_type: string
  specialty: string
  license_number: string
  hire_date: string | null
  consultation_fee: string
  is_available: boolean
  full_name: string
  role: string
}

export interface DoctorOption {
  id: number
  full_name: string
  specialty: string
  department: string | null
  /** Raw FK - the booking payload needs the id, not the display name. */
  department_id?: number | null
  consultation_fee: string
}

export interface Encounter {
  id: number
  patient: PatientRef
  doctor: DoctorRef
  encounter_type: string
  encounter_date: string
  chief_complaint: string
  history_of_present_illness: string
  examination_notes: string
  treatment_plan: string
  follow_up_date: string | null
  temperature_c: string | null
  bp_systolic: number | null
  bp_diastolic: number | null
  blood_pressure: string | null
  pulse: number | null
  respiratory_rate: number | null
  spo2: number | null
  weight_kg: string | null
  height_cm: string | null
  bmi: number | null
  status: string
  diagnoses?: Diagnosis[]
  prescriptions?: Prescription[]
  created_at: string
}

export interface Diagnosis {
  id: number
  code: string
  description: string
  diagnosis_type: string
  notes: string
}

export interface Prescription {
  id: number
  medication: { id: number; name: string; strength: string }
  dosage: string
  frequency: string
  route: string
  duration_days: number
  quantity: number
  instructions: string
  status: string
  created_at: string
}

export interface Medication {
  id: number
  name: string
  generic_name: string
  brand_name: string
  form: string
  strength: string
  category: string
  unit_price: string
  cost_price: string
  reorder_level: number
  is_controlled: boolean
  is_active: boolean
  total_stock: number
  is_low_stock: boolean
}

export interface StockBatch {
  id: number
  medication: number
  batch_number: string
  quantity_received: number
  quantity_remaining: number
  unit_cost: string
  supplier: string
  received_date: string
  expiry_date: string | null
  is_expired: boolean
  is_depleted: boolean
}

/** A prescription on the dispensing worklist, carrying its patient context. */
export interface PendingPrescription extends Prescription {
  patient?: PatientRef | null
  prescription_number?: string
}

/** A row from `/pharmacy/expiring/`, where the medication may be expanded. */
export interface ExpiringBatch extends Omit<StockBatch, 'medication'> {
  medication: number | { id: number; name: string; strength?: string }
  medication_name?: string
  days_to_expiry?: number
}

export interface DispenseBatchRef {
  id: number
  batch_number: string
  expiry_date: string | null
}

export interface DispensePrescriptionRef {
  id: number
  status?: string
  dosage?: string
  frequency?: string
  quantity?: number
  medication?: { id: number; name: string; strength?: string; form?: string }
}

/** A historical dispensing record. */
export interface Dispense {
  id: number
  quantity_dispensed: number
  notes: string
  dispensed_at: string
  prescription: DispensePrescriptionRef | null
  patient: PatientRef | null
  batch: DispenseBatchRef | null
  dispensed_by: DoctorRef | null
}

export interface Ward {
  id: number
  name: string
  code: string
  ward_type: string
  floor: string
  capacity: number
  charge_per_day: string
  is_active: boolean
  bed_count: number
  occupied_beds: number
  available_beds: number
}

export interface Bed {
  id: number
  ward: { id: number; name: string; code: string } | number
  number: string
  status: string
  notes: string
  current_patient?: PatientRef | null
}

export interface Admission {
  id: number
  patient: PatientRef
  bed: { id: number; number: string; ward?: { id: number; name: string; code: string } } | number
  admitting_doctor: DoctorRef
  admission_date: string
  discharge_date: string | null
  status: string
  reason: string
  diagnosis_summary: string
  length_of_stay_days: number
}

export interface LabTest {
  id: number
  name: string
  code: string
  category: string
  sample_type: string
  price: string
  turnaround_hours: number
  normal_range: string
  unit: string
  is_active: boolean
}

export interface LabOrderItem {
  id: number
  test: { id: number; name: string; code: string } | number
  price: string
  result_value: string
  result_unit: string
  is_abnormal: boolean
  remarks: string
  status: string
  completed_at: string | null
}

export interface LabOrder {
  id: number
  patient: PatientRef
  ordered_by: DoctorRef
  status: string
  priority: string
  ordered_at: string
  completed_at: string | null
  notes: string
  total: string
  has_results: boolean
  items?: LabOrderItem[]
}

/** The expanded test reference carried on an order's line items. */
export interface LabTestRef {
  id: number
  name: string
  code: string
  category?: string
  unit?: string
  normal_range?: string
  price?: string
}

export interface LabOrderItemDetail extends Omit<LabOrderItem, 'test'> {
  test: LabTestRef
}

/** `GET /laboratory/orders/{id}` — an order with its line items expanded. */
export interface LabOrderDetail extends Omit<LabOrder, 'items'> {
  items: LabOrderItemDetail[]
}

/** A revenue roll-up from `GET /billing/summary/`; keys are read defensively. */
export interface BillingSummary {
  total_invoiced?: string
  total_collected?: string
  total_outstanding?: string
  counts_by_status?: Record<string, number>
  collections_this_month?: string
  month?: string
  totalInvoiced?: string
  totalCollected?: string
  totalOutstanding?: string
  collectionsThisMonth?: string
}

export interface InvoiceItem {
  id: number
  item_type: string
  description: string
  quantity: string
  unit_price: string
  amount: string
}

export interface Payment {
  id: number
  amount: string
  method: string
  reference: string
  paid_at: string
  notes: string
  invoice?: { id: number; invoice_number: string; total: string; balance: string }
  received_by?: DoctorRef | null
}

export interface Invoice {
  id: number
  invoice_number: string
  patient: PatientRef
  status: string
  issued_date: string
  due_date: string | null
  subtotal: string
  tax_rate: string
  tax_amount: string
  discount_amount: string
  total: string
  amount_paid: string
  balance: string
  notes: string
  created_at: string
  items?: InvoiceItem[]
  payments?: Payment[]
}

/** `GET /billing/invoices/{id}` — an invoice with its items and payments expanded. */
export interface InvoiceDetail extends Invoice {
  items: InvoiceItem[]
  payments: Payment[]
}

export interface Dashboard {
  patients_total: number
  patients_active: number
  patients_new_this_month: number
  appointments_today: number
  appointments_upcoming: number
  appointments_completed_today: number
  current_inpatients: number
  beds_total: number
  beds_available: number
  lab_orders_pending: number
  low_stock_medications: number
  expiring_batches: number
  revenue_this_month: string
  outstanding_balance: string
  staff_total: number
}
