export type VehicleType = 'economy' | 'compact' | 'sedan' | 'suv' | 'luxury' | 'van' | 'utility';
export type VehicleStatus = 'available' | 'rented' | 'maintenance' | 'reserved' | 'inactive' | 'occupied';
export type FuelType = 'essence' | 'diesel' | 'electric' | 'hybrid';
export type TransmissionType = 'manual' | 'automatic';
export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'check' | 'mobile_money';
export type UserRole = 'master_admin' | 'admin' | 'manager' | 'agent' | 'accountant' | 'customer';

export type AppTab = 'dashboard' | 'vehicles' | 'clients' | 'rentals' | 'maintenance' | 'settings' | 'accounting' | 'users' | 'expenses' | 'statistics' | 'planning' | 'administration' | 'gps' | 'stock' | 'website' | 'leasing' | 'workers' | 'finance' | 'payments' | 'washes' | 'insurances' | 'publicity';

export interface Office {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
  updatedAt?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  lastLogin?: string;
  permissions?: string[]; // Module-based permissions
  officeIds?: string[]; // IDs of offices the user has access to
  currentOfficeId?: string; // Last selected office
}

export interface Vehicle {
  id: string;
  officeId: string; // Linked to a specific office
  brand: string;
  model: string;
  year: number;
  plate: string;
  vin?: string;
  color?: string;
  fuelType: FuelType;
  transmission: TransmissionType;
  type: VehicleType;
  status: VehicleStatus;
  mileage: number;
  fuelLevel?: number; // 0-100
  pricePerDay: number;
  insuranceExpiry?: string;
  vignetteExpiry?: string;
  technicalInspectionExpiry?: string;
  leasingExpiry?: string;
  parkingLocation?: string;
  notes?: string;
  images?: string[];
  // Documents photos
  grayCardRecto?: string;
  grayCardVerso?: string;
  insurancePhoto?: string;
  vignettePhoto?: string;
  technicalInspectionPhoto?: string;
  leasingPhoto?: string;
  lastOilChangeMileage?: number;
  nextOilChangeMileage?: number;
  oilChangeInterval?: number;
  isSubcontracted?: boolean;
  ownerName?: string;
  washStatus?: 'clean' | 'dirty';
  lastWashDate?: string;
  agentName?: string;
  createdAt?: string;
}

export interface Client {
  id: string;
  customerType: 'individual' | 'company';
  name: string;
  cin?: string;
  passportNumber?: string;
  licenseNumber: string;
  licenseExpiry: string;
  phone: string;
  email?: string;
  address: string;
  city: string;
  postalCode?: string;
  category: 'regular' | 'vip' | 'company';
  loyaltyPoints: number;
  loyaltyStatus: 'bronze' | 'silver' | 'gold' | 'platinum';
  birthDate?: string;
  nationality?: string;
  authUid?: string;
  cinRecto?: string;
  cinVerso?: string;
  licenseRecto?: string;
  licenseVerso?: string;
  passportPhoto?: string;
  isBlocked?: boolean;
  blockReason?: string;
  status?: 'active' | 'blocked';
  source?: 'website' | 'admin';
  officeId: string; // Linked to a specific office
  agentName?: string;
  createdAt?: string;
}

export interface Promotion {
  id: string;
  name: string;
  code: string;
  description: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
  targetCategory?: 'all' | 'regular' | 'vip' | 'company';
}

export interface Rental {
  id: string;
  officeId: string;
  contractNumber: string;
  vehicleId?: string;
  clientId: string;
  clientName?: string;
  clientPhone?: string;
  clientEmail?: string;
  clientCIN?: string;
  clientLicense?: string;
  clientDocs?: {
    cinRecto?: string;
    cinVerso?: string;
    licenseRecto?: string;
    licenseVerso?: string;
    passportPhoto?: string;
  };
  signature?: string;
  contractPhotos?: string[];
  secondDriverId?: string;
  userId: string; // Agent who created the rental
  agentName?: string; // Name of the agent who created the rental
  checkedOutBy?: string; // Name of the person who checked the car out
  checkedInBy?: string; // Name of the person who checked the car in
  startDate: string;
  startTime?: string;
  endDate: string;
  endTime?: string;
  actualEndDate?: string;
  actualEndTime?: string;
  lateHours?: number;
  lateFee?: number;
  pickupLocation: string;
  returnLocation?: string;
  dailyRate: number;
  totalDays: number;
  subtotalHT?: number;
  totalAmountHT?: number;
  vatRate?: number; // 19
  vatAmount?: number;
  totalAmountTTC?: number;
  totalAmount: number; // For backward compatibility or combined
  depositAmount: number;
  depositReturned: boolean;
  contractPhoto?: string;
  status: 'pending_confirmation' | 'reserved' | 'active' | 'completed' | 'cancelled';
  documentType: 'quote' | 'invoice' | 'credit_note' | 'reservation';
  paymentStatus: 'pending' | 'partial' | 'paid';
  paymentMethod: PaymentMethod;
  paidAmount: number;
  departureMileage?: number;
  returnDate?: string;
  returnMileage?: number;
  fuelLevel?: number;
  returnFuelLevel?: number;
  washStatus?: 'clean' | 'dirty';
  washPrice?: number;
  washPaid?: boolean;
  discountAmount?: number;
  discountType?: 'percentage' | 'fixed';
  taxRate?: number;
  taxAmount?: number;
  vehiclePlate?: string;
  subtotal?: number;
  vehiclePhotos?: {
    front?: string;
    back?: string;
    left?: string;
    right?: string;
  };
  isTransfer?: boolean;
  airportName?: string;
  transferType?: 'one_way' | 'round_trip';
  vehicleSwaps?: {
    oldVehicleId: string;
    newVehicleId: string;
    date: string;
    reason: string;
    mileageAtSwap: number;
  }[];
  withChauffeur?: boolean;
  chauffeurPrice?: number;
  notes?: string;
  extensions?: {
    id: string;
    previousEndDate: string;
    newEndDate: string;
    newEndTime?: string;
    extensionDays: number;
    pricePerDay: number;
    totalExtensionAmount: number;
    paidAmount: number;
    paymentMethod: PaymentMethod;
    date: string;
    agentName?: string;
  }[];
  createdAt?: string;
}

export interface SystemSettings {
  agencyName: string;
  agencyAddress: string;
  agencyPhone: string;
  agencyEmail: string;
  agencyMF?: string;
  agencyLogo?: string;
  currency: string;
  taxRate: number;
  warningPeriod: number;
  rentalTerms: string;
  chauffeurPrice: number;
}

export interface Maintenance {
  id: string;
  officeId: string;
  vehicleId: string;
  clientId?: string;
  clientName?: string;
  clientEmail?: string;
  date: string;
  type: 'oil_change' | 'tire_change' | 'brake_service' | 'inspection' | 'repair' | 'other';
  description: string;
  cost: number;
  status: 'scheduled' | 'completed' | 'cancelled';
  mileageAtService?: number;
  oilLiters?: number;
  oilItemId?: string;
  hasFilter?: boolean;
  filterItemId?: string;
  stockItemId?: string;
  stockItemQuantity?: number;
  stockItemPrice?: number;
  nextMaintenanceDate?: string;
  garageName?: string;
  paymentStatus: 'pending' | 'paid';
  paidAmount: number;
  paymentMethod?: PaymentMethod;
  isPaid?: boolean;
  parts?: {
    itemId: string;
    itemName: string;
    quantity: number;
    price: number;
  }[];
  createdBy?: string;
  agentName?: string;
  createdAt?: string;
}

export interface Expense {
  id: string;
  officeId: string;
  date: string;
  type: 'gas' | 'leasing' | 'insurance' | 'tax' | 'maintenance' | 'wash' | 'salary' | 'other';
  description: string;
  amountHT?: number;
  vatAmount?: number;
  amountTTC?: number;
  amount: number;
  paymentMethod: PaymentMethod;
  vehicleId?: string;
  washId?: string;
  createdBy: string;
  agentName?: string;
  createdAt: string;
}

export interface Insurance {
  id: string;
  officeId: string;
  vehicleId: string;
  vehiclePlate?: string;
  provider: string;
  policyNumber: string;
  startDate: string;
  endDate: string;
  amountHT: number;
  vatAmount: number;
  amountTTC: number;
  paymentMethod?: PaymentMethod;
  status: 'active' | 'expired' | 'cancelled';
  notes?: string;
  createdAt: string;
}

export interface Wash {
  id: string;
  officeId: string;
  vehicleId: string;
  clientId?: string;
  clientName?: string;
  rentalId?: string;
  date: string;
  time: string;
  amountHT: number;
  vatAmount: number;
  amountTTC: number;
  notes?: string;
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  officeId?: string; // Optional for global actions like login
  userId: string;
  userName?: string;
  action: string;
  description: string;
  ipAddress?: string;
  timestamp: string;
}

export interface AppNotification {
  id: string;
  officeId?: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'maintenance' | 'website_reservation';
  title: string;
  message: string;
  timestamp: string;
  createdAt?: string;
  read: boolean;
  isManual?: boolean;
  isWebsite?: boolean;
  userId?: string;
  vehicleId?: string;
  docName?: string;
  date?: string;
}

export interface GPSIntegration {
  id?: string;
  officeId: string;
  vehicleId: string;
  providerName: string;
  model?: string;
  deviceId: string;
  apiKey?: string;
  apiSecret?: string;
  trackingUrl?: string;
  status: 'active' | 'inactive' | 'error';
  lastUpdate?: any;
}

export interface StockItem {
  id: string;
  officeId: string;
  name: string;
  description?: string;
  category: string;
  quantity: number;
  unit: 'L' | 'psc';
  priceHT: number;
  priceTTC: number;
  purchasePrice?: number;
  purchasePriceTTC?: number;
  totalReceived?: number;
  totalUsed?: number;
  supplierName?: string;
  minQuantity?: number;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: string;
  officeId: string;
  itemId: string;
  itemName: string;
  type: 'in' | 'out';
  quantity: number;
  priceHT?: number;
  vatAmount?: number;
  priceTTC?: number; // Price at the time of movement
  supplierName?: string;
  date: string;
  reason: string;
  vehicleId?: string;
  vehiclePlate?: string;
  userId: string;
  userName?: string;
  createdAt: string;
  documents?: { name: string; url: string }[];
}

export interface Leasing {
  id?: string;
  officeId: string;
  vehicleId: string;
  vehicleModel?: string;
  vehiclePlate?: string;
  provider: string;
  contractNumber: string;
  startDate: string;
  endDate: string;
  monthlyPayment: number;
  totalAmount: number;
  deposit?: number;
  status: 'active' | 'completed' | 'terminated';
  isSubcontracted?: boolean;
  subcontractorName?: string;
  subcontractorPhone?: string;
  subcontractorEmail?: string;
  commissionAmount?: number;
  commissionType?: 'monthly' | 'total';
  depositType?: 'monthly' | 'total';
  payments: {
    id: string;
    dueDate: string;
    amount: number;
    status: 'pending' | 'paid' | 'late';
    paidDate?: string;
    paymentMethod?: PaymentMethod;
    isNotified?: boolean;
  }[];
  createdAt?: string;
  documents?: { name: string; url: string; type: string }[];
}

export interface Worker {
  id: string;
  officeId: string;
  fullName: string;
  role: string;
  phone: string;
  email?: string;
  address?: string;
  cin: string;
  startDate: string;
  baseSalary: number;
  salaryType: 'hourly' | 'daily' | 'fixed';
  status: 'active' | 'inactive';
  bankDetails?: string;
  notes?: string;
  createdAt: string;
  totalLeaveDays?: number;
  usedLeaveDays?: number;
}

export interface Attendance {
  id: string;
  workerId: string;
  date: string;
  status: 'present' | 'absent' | 'late' | 'half_day' | 'leave' | 'holiday' | 'sick';
  isPaid?: boolean;
  latenessMinutes?: number;
  checkIn?: string;
  checkOut?: string;
  breaks?: { start: string; end: string }[];
  notes?: string;
}

export interface WorkerTask {
  id: string;
  workerId: string;
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  dueDate?: string;
  createdAt: string;
}

export interface LeaveRequest {
  id: string;
  workerId: string;
  workerName: string;
  startDate: string;
  endDate: string;
  type: 'vacation' | 'sick' | 'personal' | 'other';
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export interface WorkerSchedule {
  id: string;
  workerId: string;
  dayOfWeek: number; // 0-6
  startTime: string;
  endTime: string;
  isActive: boolean;
}

export interface SalaryAdvance {
  id: string;
  workerId: string;
  date: string;
  amount: number;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface SalaryTransaction {
  id: string;
  workerId: string;
  type: 'advance' | 'payment' | 'bonus' | 'deduction' | 'return';
  amount: number;
  paymentMethod?: PaymentMethod;
  date: string; // ISO string with time
  month: string; // YYYY-MM
  note?: string;
  officeId: string;
}

export interface SalaryPayment {
  id: string;
  workerId: string;
  month: string; // YYYY-MM
  baseSalary: number;
  advances: number;
  bonuses: number;
  deductions: number;
  netSalary: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  status: 'paid' | 'pending';
}

export interface VehicleWash {
  id: string;
  officeId: string;
  vehicleId: string;
  vehiclePlate: string;
  clientId?: string;
  clientName?: string;
  rentalId?: string;
  date: string;
  time?: string;
  priceHT?: number;
  vatAmount?: number;
  priceTTC?: number;
  price: number; // For compatibility
  isPaid: boolean;
  paymentMethod?: PaymentMethod | null;
  notes?: string;
  createdBy: string;
  agentName?: string;
  createdAt: string;
}

export interface FinanceStatus {
  id: string;
  officeId: string;
  month: string;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  breakdown: {
    rentals: number;
    maintenance: number;
    leasing: number;
    salaries: number;
    other: number;
  };
  updatedAt: string;
}
