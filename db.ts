import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';

let dbPath = process.env.DB_PATH || path.join(process.cwd(), 'database', 'database.sqlite');

// Ensure directory exists for initial DB
const initialDir = path.dirname(dbPath);
if (!fs.existsSync(initialDir)) {
  fs.mkdirSync(initialDir, { recursive: true });
}

let db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

export function getDbPath() {
  return dbPath;
}

export function setDbPath(newPath: string) {
  try {
    const absolutePath = path.isAbsolute(newPath) ? newPath : path.join(process.cwd(), newPath);
    // Ensure directory exists
    const dir = path.dirname(absolutePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    db.close();
    dbPath = absolutePath;
    db = new Database(dbPath);
    db.pragma('foreign_keys = ON');
    initDb();
    return true;
  } catch (error) {
    console.error('Error changing database path:', error);
    // Try to revert to old path
    db = new Database(dbPath);
    db.pragma('foreign_keys = ON');
    return false;
  }
}

export function initDb() {
  // Helper for migrations
  const addColumnIfNotExists = (tableName: string, columnName: string, type: string) => {
    try {
      const info = db.prepare(`PRAGMA table_info(${tableName})`).all() as any[];
      if (!info.find(col => col.name === columnName)) {
        db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${type}`).run();
        console.log(`Added column ${columnName} to table ${tableName}`);
      }
    } catch (e) {
      // Silently ignore if table doesn't exist yet, it will be created below
    }
  };

  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      fullName TEXT,
      role TEXT DEFAULT 'staff',
      permissions TEXT,
      isActive INTEGER DEFAULT 1,
      lastLogin TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  addColumnIfNotExists('users', 'currentOfficeId', 'TEXT');
  addColumnIfNotExists('users', 'officeIds', 'TEXT');

  // Clients table
  db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      address TEXT,
      city TEXT,
      licenseNumber TEXT,
      licenseExpiry TEXT,
      customerType TEXT DEFAULT 'individual',
      category TEXT DEFAULT 'regular',
      loyaltyPoints INTEGER DEFAULT 0,
      loyaltyStatus TEXT DEFAULT 'bronze',
      source TEXT,
      officeId TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  ['cin', 'cinRecto', 'cinVerso', 'licenseRecto', 'licenseVerso', 'isBlocked', 'blockReason', 'passportNumber', 'postalCode', 'agentName', 'authUid'].forEach(col => {
    addColumnIfNotExists('clients', col, col === 'isBlocked' ? 'INTEGER DEFAULT 0' : 'TEXT');
  });

  // Vehicles table
  db.exec(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      plate TEXT UNIQUE NOT NULL,
      vin TEXT,
      year INTEGER, 
      color TEXT, 
      status TEXT DEFAULT 'available', 
      fuelType TEXT, 
      transmission TEXT,
      type TEXT,
      mileage INTEGER DEFAULT 0, 
      pricePerDay REAL, 
      fuelLevel INTEGER DEFAULT 100,
      lastMaintenance TEXT, 
      nextMaintenance TEXT,
      insuranceExpiry TEXT, 
      vignetteExpiry TEXT,
      technicalInspectionExpiry TEXT, 
      leasingExpiry TEXT,
      parkingLocation TEXT,
      notes TEXT,
      images TEXT, 
      features TEXT, 
      officeId TEXT, 
      lastOilChangeMileage INTEGER,
      nextOilChangeMileage INTEGER,
      oilChangeInterval INTEGER,
      isSubcontracted INTEGER DEFAULT 0,
      ownerName TEXT,
      washStatus TEXT,
      lastWashDate TEXT,
      agentName TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Handle migrations for vehicles
  try {
    const info = db.prepare(`PRAGMA table_info(vehicles)`).all() as any[];
    const cols = info.map(c => c.name);
    
    if (cols.includes('plateNumber') && !cols.includes('plate')) {
      db.prepare(`ALTER TABLE vehicles RENAME COLUMN plateNumber TO plate`).run();
      console.log('Renamed vehicles.plateNumber to plate');
    }
    
    if (cols.includes('dailyRate') && !cols.includes('pricePerDay')) {
      db.prepare(`ALTER TABLE vehicles RENAME COLUMN dailyRate TO pricePerDay`).run();
      console.log('Renamed vehicles.dailyRate to pricePerDay');
    }

    [
      { name: 'vin', type: 'TEXT' },
      { name: 'type', type: 'TEXT' },
      { name: 'fuelLevel', type: 'INTEGER DEFAULT 100' },
      { name: 'vignetteExpiry', type: 'TEXT' },
      { name: 'leasingExpiry', type: 'TEXT' },
      { name: 'parkingLocation', type: 'TEXT' },
      { name: 'notes', type: 'TEXT' },
      { name: 'lastOilChangeMileage', type: 'INTEGER' },
      { name: 'nextOilChangeMileage', type: 'INTEGER' },
      { name: 'oilChangeInterval', type: 'INTEGER' },
      { name: 'isSubcontracted', type: 'INTEGER DEFAULT 0' },
      { name: 'ownerName', type: 'TEXT' },
      { name: 'washStatus', type: 'TEXT' },
      { name: 'lastWashDate', type: 'TEXT' },
      { name: 'agentName', type: 'TEXT' }
    ].forEach(col => {
      if (!cols.includes(col.name)) {
        db.prepare(`ALTER TABLE vehicles ADD COLUMN ${col.name} ${col.type}`).run();
        console.log(`Added column ${col.name} to vehicles`);
      }
    });
  } catch (e: any) {
    console.error('Error migrating vehicles table:', e.message);
  }

  // Rentals table
  db.exec(`
    CREATE TABLE IF NOT EXISTS rentals (
      id TEXT PRIMARY KEY,
      clientId TEXT NOT NULL,
      vehicleId TEXT NOT NULL,
      startDate TEXT NOT NULL,
      endDate TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      totalAmount REAL,
      paidAmount REAL DEFAULT 0,
      paymentStatus TEXT DEFAULT 'unpaid',
      officeId TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  ['contractNumber', 'clientName', 'clientPhone', 'clientEmail', 'clientCIN', 'clientLicense', 'clientDocs', 
   'secondDriverId', 'userId', 'agentName', 'checkedOutBy', 'checkedInBy', 'pickupLocation', 'returnLocation', 
   'dailyRate', 'totalDays', 'subtotal', 'discountAmount', 'discountType', 'taxRate', 'taxAmount', 
   'depositAmount', 'depositReturned', 'documentType', 'paymentMethod', 'returnDate', 'returnMileage', 
   'fuelLevel', 'returnFuelLevel', 'vehiclePhotos', 'washStatus', 'washPrice', 'washPaid', 'isTransfer', 
   'airportName', 'transferType', 'vehicleSwaps', 'withChauffeur', 'chauffeurPrice', 'notes'
  ].forEach(col => {
    let type = 'TEXT';
    if (['totalDays', 'returnMileage', 'fuelLevel', 'returnFuelLevel'].includes(col)) type = 'INTEGER';
    if (['dailyRate', 'subtotal', 'discountAmount', 'taxRate', 'taxAmount', 'depositAmount', 'washPrice', 'chauffeurPrice'].includes(col)) type = 'REAL';
    if (['depositReturned', 'washPaid', 'isTransfer', 'withChauffeur'].includes(col)) type = 'INTEGER DEFAULT 0';
    addColumnIfNotExists('rentals', col, type);
  });

  // Maintenance table (name as maintenances for app compatibility)
  db.exec(`
    CREATE TABLE IF NOT EXISTS maintenances (
      id TEXT PRIMARY KEY,
      vehicleId TEXT NOT NULL,
      type TEXT,
      description TEXT,
      date TEXT NOT NULL,
      cost REAL,
      mileage INTEGER,
      status TEXT DEFAULT 'completed',
      officeId TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  addColumnIfNotExists('maintenances', 'agentName', 'TEXT');

  // Expenses table
  db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      category TEXT,
      type TEXT,
      description TEXT,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      paymentMethod TEXT,
      vehicleId TEXT,
      agentName TEXT,
      createdBy TEXT,
      officeId TEXT,
      washId TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  ['type', 'paymentMethod', 'vehicleId', 'agentName', 'createdBy'].forEach(col => {
    addColumnIfNotExists('expenses', col, 'TEXT');
  });

  // Offices table
  db.exec(`
    CREATE TABLE IF NOT EXISTS offices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      phone TEXT,
      isActive INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Notifications table
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      title TEXT,
      message TEXT,
      type TEXT,
      read INTEGER DEFAULT 0,
      userId TEXT,
      officeId TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Leasings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS leasings (
      id TEXT PRIMARY KEY,
      vehicleId TEXT NOT NULL,
      startDate TEXT,
      endDate TEXT,
      monthlyPayment REAL,
      provider TEXT,
      contractNumber TEXT,
      totalAmount REAL,
      deposit REAL,
      status TEXT DEFAULT 'active',
      isSubcontracted INTEGER DEFAULT 0,
      subcontractorName TEXT,
      subcontractorPhone TEXT,
      subcontractorEmail TEXT,
      commissionAmount REAL,
      commissionType TEXT,
      depositType TEXT,
      payments TEXT,
      documents TEXT,
      officeId TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // Ensure existing columns are present for migrations
  ['contractNumber', 'monthlyPayment', 'totalAmount', 'deposit', 'status', 'isSubcontracted', 
   'subcontractorName', 'subcontractorPhone', 'subcontractorEmail', 'commissionAmount', 
   'commissionType', 'depositType', 'payments', 'documents'].forEach(col => {
    let type = 'TEXT';
    if (['monthlyPayment', 'totalAmount', 'deposit', 'commissionAmount'].includes(col)) type = 'REAL';
    if (['isSubcontracted'].includes(col)) type = 'INTEGER DEFAULT 0';
    addColumnIfNotExists('leasings', col, type);
  });

  // Stock table
  db.exec(`
    CREATE TABLE IF NOT EXISTS stock (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      quantity REAL DEFAULT 0,
      minQuantity REAL DEFAULT 0,
      unit TEXT,
      priceTTC REAL,
      category TEXT,
      officeId TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  ['priceTTC', 'category', 'updatedAt'].forEach(col => {
    addColumnIfNotExists('stock', col, col === 'priceTTC' ? 'REAL' : 'TEXT');
  });

  // Stock Movements table
  db.exec(`
    CREATE TABLE IF NOT EXISTS stockMovements (
      id TEXT PRIMARY KEY,
      itemId TEXT NOT NULL,
      itemName TEXT,
      type TEXT, -- in, out
      quantity REAL,
      priceTTC REAL,
      date TEXT,
      reason TEXT,
      vehicleId TEXT,
      vehiclePlate TEXT,
      userId TEXT,
      userName TEXT,
      officeId TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  ['itemName', 'priceTTC', 'vehicleId', 'vehiclePlate', 'userId', 'userName'].forEach(col => {
    addColumnIfNotExists('stockMovements', col, col === 'priceTTC' || col === 'quantity' ? 'REAL' : 'TEXT');
  });

  // Workers table
  db.exec(`
    CREATE TABLE IF NOT EXISTS workers (
      id TEXT PRIMARY KEY,
      fullName TEXT NOT NULL,
      role TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      cin TEXT,
      startDate TEXT,
      baseSalary REAL,
      salaryType TEXT,
      bankDetails TEXT,
      notes TEXT,
      status TEXT DEFAULT 'active',
      officeId TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  ['phone', 'email', 'address', 'cin', 'startDate', 'baseSalary', 'salaryType', 'bankDetails', 'notes', 'status'].forEach(col => {
    let type = 'TEXT';
    if (col === 'baseSalary') type = 'REAL';
    addColumnIfNotExists('workers', col, type);
  });
  // Handle migration from 'name' to 'fullName' if needed
  try {
    const info = db.prepare(`PRAGMA table_info(workers)`).all() as any[];
    const hasName = info.find(col => col.name === 'name');
    const hasFullName = info.find(col => col.name === 'fullName');

    if (hasName && !hasFullName) {
      db.prepare(`ALTER TABLE workers RENAME COLUMN name TO fullName`).run();
      console.log('Renamed workers.name to fullName');
    } else if (hasName && hasFullName) {
      // Both exist, maybe failed previous mig. Copy data and drop name
      db.prepare(`UPDATE workers SET fullName = name WHERE fullName IS NULL OR fullName = ''`).run();
      db.prepare(`ALTER TABLE workers DROP COLUMN name`).run();
      console.log('Dropped legacy workers.name column');
    }
  } catch (e) {
    console.error('Error migrating workers table:', e);
  }

  // Attendance table
  db.exec(`
    CREATE TABLE IF NOT EXISTS attendance (
      id TEXT PRIMARY KEY,
      workerId TEXT NOT NULL,
      date TEXT,
      status TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  ['isPaid', 'updatedAt', 'notes', 'checkIn', 'checkOut', 'latenessMinutes'].forEach(col => {
    addColumnIfNotExists('attendance', col, col === 'isPaid' ? 'INTEGER DEFAULT 1' : (col === 'latenessMinutes' ? 'INTEGER' : 'TEXT'));
  });

  // Salary Transactions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS salaryTransactions (
      id TEXT PRIMARY KEY,
      workerId TEXT NOT NULL,
      amount REAL,
      type TEXT,
      date TEXT,
      officeId TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  ['month', 'note'].forEach(col => addColumnIfNotExists('salaryTransactions', col, 'TEXT'));

  // Washes table
  db.exec(`
    CREATE TABLE IF NOT EXISTS washes (
      id TEXT PRIMARY KEY,
      vehicleId TEXT NOT NULL,
      cost REAL,
      date TEXT,
      officeId TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  ['vehiclePlate', 'price', 'isPaid', 'paymentMethod', 'notes', 'createdBy', 'agentName'].forEach(col => {
    let type = 'TEXT';
    if (col === 'price') type = 'REAL';
    if (col === 'isPaid') type = 'INTEGER DEFAULT 0';
    addColumnIfNotExists('washes', col, type);
  });

  // Activity Logs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      userId TEXT,
      action TEXT,
      details TEXT,
      officeId TEXT,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  addColumnIfNotExists('activity_logs', 'officeId', 'TEXT');
  addColumnIfNotExists('activity_logs', 'userName', 'TEXT');

  // GPS Integrations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS gps_integrations (
      id TEXT PRIMARY KEY,
      vehicleId TEXT,
      provider TEXT,
      officeId TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      value TEXT, -- JSON string
      officeId TEXT
    )
  `);
  addColumnIfNotExists('settings', 'officeId', 'TEXT');

  // Salary Payments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS salaryPayments (
      id TEXT PRIMARY KEY,
      workerId TEXT NOT NULL,
      amount REAL,
      date TEXT,
      status TEXT,
      officeId TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('Database tables initialized.');
}

export default db;
