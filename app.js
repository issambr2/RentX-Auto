// app.js - Point d'entrée optimisé pour o2switch
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database path - Utilise le dossier de l'app sur o2switch
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

const app = express();
// o2switch gère le port automatiquement via Passenger, mais on garde 3000 par défaut
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dhokkar-rent-a-car-secret-2025-stable';

app.use(cors());
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Diagnostic pour l'hébergeur
app.get('/api/health', (req, res) => {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'] || req.headers['x-authorization'];
  res.json({ 
    status: 'ok', 
    hosting: 'o2switch',
    database: 'sqlite',
    time: new Date().toISOString(),
    env: process.env.NODE_ENV,
    diag: {
      hasAuthHeader: !!authHeader,
      hasCookie: !!req.cookies?.auth_token,
      userAgent: req.headers['user-agent']
    }
  });
});

// --- DATABASE INIT ---
function initDb() {
  console.log('Initializing SQLite Database for o2switch...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      fullName TEXT,
      role TEXT DEFAULT 'customer',
      permissions TEXT,
      isActive INTEGER DEFAULT 1,
      officeId TEXT,
      officeIds TEXT,
      lastLogin TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT, phone TEXT, address TEXT, city TEXT,
      licenseNumber TEXT, licenseExpiry TEXT, customerType TEXT DEFAULT 'individual',
      category TEXT DEFAULT 'regular', loyaltyPoints INTEGER DEFAULT 0,
      loyaltyStatus TEXT DEFAULT 'bronze', source TEXT, officeId TEXT, createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    );
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
    );
    CREATE TABLE IF NOT EXISTS rentals (
      id TEXT PRIMARY KEY, clientId TEXT NOT NULL, vehicleId TEXT NOT NULL, startDate TEXT NOT NULL,
      endDate TEXT NOT NULL, status TEXT DEFAULT 'pending', totalAmount REAL, paidAmount REAL DEFAULT 0,
      paymentStatus TEXT DEFAULT 'unpaid', notes TEXT, officeId TEXT, createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (clientId) REFERENCES clients(id), FOREIGN KEY (vehicleId) REFERENCES vehicles(id)
    );
    CREATE TABLE IF NOT EXISTS maintenances (
      id TEXT PRIMARY KEY, vehicleId TEXT NOT NULL, type TEXT, description TEXT, date TEXT NOT NULL,
      cost REAL, mileage INTEGER, status TEXT DEFAULT 'completed', officeId TEXT, agentName TEXT, createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (vehicleId) REFERENCES vehicles(id)
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY, officeId TEXT, category TEXT, subCategory TEXT, type TEXT, description TEXT, 
      amount REAL NOT NULL, date TEXT NOT NULL, isPaid INTEGER DEFAULT 1, paymentMethod TEXT, 
      vehicleId TEXT, createdBy TEXT, agentName TEXT, washId TEXT, createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS siteSettings (
      id TEXT PRIMARY KEY, contactEmail TEXT, contactPhone TEXT, address TEXT, facebookUrl TEXT, instagramUrl TEXT, value TEXT
    );
    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY, chauffeurPrice REAL, value TEXT
    );
    CREATE TABLE IF NOT EXISTS offices (
      id TEXT PRIMARY KEY, name TEXT, address TEXT, phone TEXT, email TEXT, isActive INTEGER DEFAULT 1, createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY, userId TEXT, title TEXT, message TEXT, type TEXT, read INTEGER DEFAULT 0, createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    );
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
    );
    CREATE TABLE IF NOT EXISTS insurances (
      id TEXT PRIMARY KEY, vehicleId TEXT, provider TEXT, policyNumber TEXT, startDate TEXT, endDate TEXT, amountHT REAL, vatAmount REAL, amountTTC REAL, status TEXT, notes TEXT, officeId TEXT, createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS washes (
      id TEXT PRIMARY KEY, rentalId TEXT, vehicleId TEXT, clientId TEXT, date TEXT, time TEXT, amountHT REAL, vatAmount REAL, amountTTC REAL, notes TEXT, officeId TEXT, createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    );
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
    );
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
    );
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
    );
    CREATE TABLE IF NOT EXISTS attendance (
      id TEXT PRIMARY KEY, 
      workerId TEXT NOT NULL, 
      date TEXT NOT NULL, 
      status TEXT, 
      isPaid INTEGER DEFAULT 0,
      checkIn TEXT, 
      checkOut TEXT, 
      notes TEXT,
      updatedAt TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS salaryTransactions (
      id TEXT PRIMARY KEY, 
      workerId TEXT NOT NULL, 
      officeId TEXT,
      type TEXT, 
      amount REAL, 
      date TEXT, 
      month TEXT,
      note TEXT, 
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS salaryPayments (
      id TEXT PRIMARY KEY, workerId TEXT, month TEXT, year INTEGER, amount REAL, date TEXT, status TEXT, createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS washes (
      id TEXT PRIMARY KEY, officeId TEXT, vehicleId TEXT, vehiclePlate TEXT, type TEXT, date TEXT, 
      price REAL, cost REAL, isPaid INTEGER DEFAULT 0, paymentMethod TEXT, notes TEXT, 
      createdBy TEXT, agentName TEXT, createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY, officeId TEXT, type TEXT, category TEXT, amount REAL, 
      date TEXT, description TEXT, paymentMethod TEXT, createdBy TEXT, agentName TEXT, 
      rentalId TEXT, washId TEXT, maintenanceId TEXT, createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY, userId TEXT, action TEXT, entity TEXT, entityId TEXT, details TEXT, timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS gps_integrations (
      id TEXT PRIMARY KEY, vehicleId TEXT, provider TEXT, deviceId TEXT, apiKey TEXT, settings TEXT, lastUpdate TEXT, createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Bootstrap admin
  try {
    const adminEmail = 'siwarbraham98@gmail.com';
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
    if (!existing) {
      const hashedPassword = bcrypt.hashSync('admin123', 10);
      db.prepare('INSERT INTO users (id, email, password, fullName, role, permissions) VALUES (?, ?, ?, ?, ?, ?)')
        .run('admin-id', adminEmail, hashedPassword, 'Master Admin', 'master_admin', JSON.stringify(['dashboard', 'vehicles', 'clients', 'rentals', 'maintenance', 'expenses', 'planning', 'accounting', 'statistics', 'administration', 'settings', 'stock', 'gps', 'website']));
      console.log('Admin user created');
    }
  } catch (e) {}
}
initDb();

// Migration for adding officeId if missing
const structuralCheck = [
  'washes', 'expenses', 'rentals', 'vehicles', 'clients', 'users', 
  'leasings', 'maintenances', 'stock', 'stockMovements', 'workers', 
  'attendance', 'salaryTransactions', 'salaryPayments', 'transactions'
];
structuralCheck.forEach(table => {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
    if (!cols.includes('officeId')) {
      db.prepare(`ALTER TABLE ${table} ADD COLUMN officeId TEXT`).run();
    }
  } catch (e) {}
});

// --- MIGRATION ---
function migrateDb() {
  const table = 'vehicles';
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  
  // Migration: plateNumber -> plate
  if (cols.includes('plateNumber') && !cols.includes('plate')) {
    try {
      db.prepare(`ALTER TABLE ${table} RENAME COLUMN plateNumber TO plate`).run();
      console.log('Migrated plateNumber to plate');
    } catch (e) { console.error('Migration failed (plate):', e.message); }
  }
  
  // Migration: dailyRate -> pricePerDay
  if (cols.includes('dailyRate') && !cols.includes('pricePerDay')) {
    try {
      db.prepare(`ALTER TABLE ${table} RENAME COLUMN dailyRate TO pricePerDay`).run();
      console.log('Migrated dailyRate to pricePerDay');
    } catch (e) { console.error('Migration failed (pricePerDay):', e.message); }
  }

  // Add missing columns
  const expectedCols = [
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
  ];

  expectedCols.forEach(col => {
    if (!cols.includes(col.name)) {
      try {
        db.prepare(`ALTER TABLE ${table} ADD COLUMN ${col.name} ${col.type}`).run();
        console.log(`Added column ${col.name} to ${table}`);
      } catch (e) { console.error(`Failed to add column ${col.name}:`, e.message); }
    }
  });

  // Migration for workers
  try {
    const table = 'workers';
    const info = db.prepare(`PRAGMA table_info(${table})`).all();
    const cols = info.map(c => c.name);
    
    if (cols.includes('position') && !cols.includes('role')) {
      db.prepare(`ALTER TABLE ${table} RENAME COLUMN position TO role`).run();
      console.log('Migrated workers.position to role');
    }
    if (cols.includes('salary') && !cols.includes('baseSalary')) {
      db.prepare(`ALTER TABLE ${table} RENAME COLUMN salary TO baseSalary`).run();
      console.log('Migrated workers.salary to baseSalary');
    }
    if (cols.includes('hireDate') && !cols.includes('startDate')) {
      db.prepare(`ALTER TABLE ${table} RENAME COLUMN hireDate TO startDate`).run();
      console.log('Migrated workers.hireDate to startDate');
    }
    if (cols.includes('isActive') && !cols.includes('status')) {
      db.prepare(`ALTER TABLE ${table} ADD COLUMN status TEXT DEFAULT 'active'`).run();
      db.prepare(`UPDATE ${table} SET status = CASE WHEN isActive = 1 THEN 'active' ELSE 'inactive' END`).run();
      console.log('Migrated workers.isActive to status');
    }

    const expectedCols = [
      { name: 'address', type: 'TEXT' },
      { name: 'cin', type: 'TEXT' },
      { name: 'salaryType', type: 'TEXT DEFAULT "fixed"' },
      { name: 'bankDetails', type: 'TEXT' },
      { name: 'notes', type: 'TEXT' },
      { name: 'officeId', type: 'TEXT' }
    ];

    expectedCols.forEach(col => {
      if (!cols.includes(col.name)) {
        db.prepare(`ALTER TABLE ${table} ADD COLUMN ${col.name} ${col.type}`).run();
        console.log(`Added column ${col.name} to ${table}`);
      }
    });

  } catch (e) {
    console.error('Workers migration check failed:', e.message);
  }

  // Maintenances migration
  try {
    const table = 'maintenances';
    const info = db.prepare(`PRAGMA table_info(${table})`).all();
    const cols = info.map(c => c.name);
    if (!cols.includes('agentName')) db.prepare(`ALTER TABLE ${table} ADD COLUMN agentName TEXT`).run();
    if (!cols.includes('isPaid')) db.prepare(`ALTER TABLE ${table} ADD COLUMN isPaid INTEGER DEFAULT 0`).run();
    if (!cols.includes('parts')) db.prepare(`ALTER TABLE ${table} ADD COLUMN parts TEXT`).run();
  } catch (e) { console.error('Maintenances migration failed:', e.message); }

  // Attendance migration
  try {
    const table = 'attendance';
    const info = db.prepare(`PRAGMA table_info(${table})`).all();
    const cols = info.map(c => c.name);
    if (!cols.includes('isPaid')) db.prepare(`ALTER TABLE ${table} ADD COLUMN isPaid INTEGER DEFAULT 0`).run();
    if (!cols.includes('notes')) db.prepare(`ALTER TABLE ${table} ADD COLUMN notes TEXT`).run();
    if (!cols.includes('updatedAt')) db.prepare(`ALTER TABLE ${table} ADD COLUMN updatedAt TEXT`).run();
  } catch (e) { console.error('Attendance migration failed:', e.message); }

  // SalaryTransactions migration
  try {
    const table = 'salaryTransactions';
    const info = db.prepare(`PRAGMA table_info(${table})`).all();
    const cols = info.map(c => c.name);
    if (!cols.includes('officeId')) db.prepare(`ALTER TABLE ${table} ADD COLUMN officeId TEXT`).run();
    if (!cols.includes('month')) db.prepare(`ALTER TABLE ${table} ADD COLUMN month TEXT`).run();
    if (cols.includes('description') && !cols.includes('note')) {
      db.prepare(`ALTER TABLE ${table} RENAME COLUMN description TO note`).run();
    } else if (!cols.includes('note')) {
      db.prepare(`ALTER TABLE ${table} ADD COLUMN note TEXT`).run();
    }
  } catch (e) { console.error('SalaryTransactions migration failed:', e.message); }

  // Rentals migration
  try {
    const table = 'rentals';
    const info = db.prepare(`PRAGMA table_info(${table})`).all();
    const cols = info.map(c => c.name);
    if (!cols.includes('startTime')) db.prepare(`ALTER TABLE ${table} ADD COLUMN startTime TEXT`).run();
    if (!cols.includes('endTime')) db.prepare(`ALTER TABLE ${table} ADD COLUMN endTime TEXT`).run();
    if (!cols.includes('actualEndDate')) db.prepare(`ALTER TABLE ${table} ADD COLUMN actualEndDate TEXT`).run();
    if (!cols.includes('actualEndTime')) db.prepare(`ALTER TABLE ${table} ADD COLUMN actualEndTime TEXT`).run();
    if (!cols.includes('lateHours')) db.prepare(`ALTER TABLE ${table} ADD COLUMN lateHours INTEGER DEFAULT 0`).run();
    if (!cols.includes('totalAmountHT')) db.prepare(`ALTER TABLE ${table} ADD COLUMN totalAmountHT REAL`).run();
    if (!cols.includes('vatAmount')) db.prepare(`ALTER TABLE ${table} ADD COLUMN vatAmount REAL`).run();
    if (!cols.includes('totalAmountTTC')) db.prepare(`ALTER TABLE ${table} ADD COLUMN totalAmountTTC REAL`).run();
    if (!cols.includes('washPrice')) db.prepare(`ALTER TABLE ${table} ADD COLUMN washPrice REAL DEFAULT 0`).run();
  } catch (e) { console.error('Rentals migration failed:', e.message); }

  // Leasings migration
  try {
    const table = 'leasings';
    const info = db.prepare(`PRAGMA table_info(${table})`).all();
    const cols = info.map(c => c.name);
    if (!cols.includes('monthlyPayment')) db.prepare(`ALTER TABLE ${table} ADD COLUMN monthlyPayment REAL`).run();
    if (!cols.includes('contractNumber')) db.prepare(`ALTER TABLE ${table} ADD COLUMN contractNumber TEXT`).run();
    if (!cols.includes('payments')) db.prepare(`ALTER TABLE ${table} ADD COLUMN payments TEXT`).run();
    if (!cols.includes('documents')) db.prepare(`ALTER TABLE ${table} ADD COLUMN documents TEXT`).run();
    if (!cols.includes('provider')) db.prepare(`ALTER TABLE ${table} ADD COLUMN provider TEXT`).run();
    if (!cols.includes('deposit')) db.prepare(`ALTER TABLE ${table} ADD COLUMN deposit REAL`).run();
    if (!cols.includes('isSubcontracted')) db.prepare(`ALTER TABLE ${table} ADD COLUMN isSubcontracted INTEGER DEFAULT 0`).run();
    if (!cols.includes('subcontractorName')) db.prepare(`ALTER TABLE ${table} ADD COLUMN subcontractorName TEXT`).run();
    if (!cols.includes('subcontractorPhone')) db.prepare(`ALTER TABLE ${table} ADD COLUMN subcontractorPhone TEXT`).run();
    if (!cols.includes('subcontractorEmail')) db.prepare(`ALTER TABLE ${table} ADD COLUMN subcontractorEmail TEXT`).run();
    if (!cols.includes('commissionAmount')) db.prepare(`ALTER TABLE ${table} ADD COLUMN commissionAmount REAL`).run();
    if (!cols.includes('commissionType')) db.prepare(`ALTER TABLE ${table} ADD COLUMN commissionType TEXT`).run();
    if (!cols.includes('depositType')) db.prepare(`ALTER TABLE ${table} ADD COLUMN depositType TEXT`).run();
  } catch (e) { console.error('Leasings migration failed:', e.message); }

  // Stock migration
  try {
    const table = 'stock';
    const info = db.prepare(`PRAGMA table_info(${table})`).all();
    const cols = info.map(c => c.name);
    if (!cols.includes('priceTTC')) db.prepare(`ALTER TABLE ${table} ADD COLUMN priceTTC REAL`).run();
    if (!cols.includes('purchasePrice')) db.prepare(`ALTER TABLE ${table} ADD COLUMN purchasePrice REAL`).run();
    if (!cols.includes('unit')) db.prepare(`ALTER TABLE ${table} ADD COLUMN unit TEXT DEFAULT 'piece'`).run();
  } catch (e) { console.error('Stock migration failed:', e.message); }

  // StockMovements migration
  try {
    const table = 'stockMovements';
    const info = db.prepare(`PRAGMA table_info(${table})`).all();
    const cols = info.map(c => c.name);
    if (!cols.includes('itemName')) db.prepare(`ALTER TABLE ${table} ADD COLUMN itemName TEXT`).run();
    if (!cols.includes('priceTTC')) db.prepare(`ALTER TABLE ${table} ADD COLUMN priceTTC REAL`).run();
    if (!cols.includes('reason')) db.prepare(`ALTER TABLE ${table} ADD COLUMN reason TEXT`).run();
    if (!cols.includes('vehicleId')) db.prepare(`ALTER TABLE ${table} ADD COLUMN vehicleId TEXT`).run();
    if (!cols.includes('vehiclePlate')) db.prepare(`ALTER TABLE ${table} ADD COLUMN vehiclePlate TEXT`).run();
    if (!cols.includes('userId')) db.prepare(`ALTER TABLE ${table} ADD COLUMN userId TEXT`).run();
    if (!cols.includes('userName')) db.prepare(`ALTER TABLE ${table} ADD COLUMN userName TEXT`).run();
  } catch (e) { console.error('StockMovements migration failed:', e.message); }

  // Expenses migration
  try {
    const table = 'expenses';
    const info = db.prepare(`PRAGMA table_info(${table})`).all();
    const cols = info.map(c => c.name);
    if (!cols.includes('amountHT')) db.prepare(`ALTER TABLE ${table} ADD COLUMN amountHT REAL`).run();
    if (!cols.includes('vatAmount')) db.prepare(`ALTER TABLE ${table} ADD COLUMN vatAmount REAL`).run();
    if (!cols.includes('amountTTC')) db.prepare(`ALTER TABLE ${table} ADD COLUMN amountTTC REAL`).run();
  } catch (e) { console.error('Expenses migration failed:', e.message); }
}
migrateDb();

// --- Auth Middleware ---
const auth = (req, res, next) => {
  const { collection } = req.params;
  const isPublicGet = req.method === 'GET' && ['vehicles', 'siteSettings', 'offices', 'site_settings'].includes(collection);
  
  if (isPublicGet) return next();
  
  // High resilience token lookup for o2switch
  const authHeader = req.headers['authorization'] || req.headers['Authorization'] || req.headers['x-authorization'];
  let token = authHeader && authHeader.split(' ')[1];
  
  // Fallback to cookies
  if (!token && req.cookies && req.cookies.auth_token) {
    token = req.cookies.auth_token;
  }
  
  // Fallback to query param (for extreme debug cases)
  if (!token && req.query && req.query.token) {
    token = req.query.token;
  }
  
  if (!token || token === 'null' || token === 'undefined' || token === '[object Object]') {
    console.log(`[AUTH] Rejected ${req.method} ${req.url} - Token missing. Headers: ${JSON.stringify(req.headers)}`);
    return res.status(401).json({ error: 'Non authentifié. Veuillez vous reconnecter.' });
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.log(`[AUTH] Token verification failed: ${err.message}`);
      return res.status(401).json({ error: 'Session expirée ou invalide. Veuillez vous reconnecter.' });
    }
    req.user = user;
    next();
  });
};

// Helper to prepare values for SQLite
const prepareSqlValue = (v) => {
  if (v === undefined) return null;
  if (v !== null && typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
};

// --- API ---
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, fullName } = req.body;
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(400).json({ error: 'Email déjà utilisé' });

    const id = randomUUID();
    const hashedPassword = await bcrypt.hash(password, 10);
    db.prepare('INSERT INTO users (id, email, password, fullName, role, permissions) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, email, hashedPassword, fullName || email.split('@')[0], 'customer', JSON.stringify(['website']));
    
    const token = jwt.sign({ id, email, role: 'customer' }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { id, email, fullName, role: 'customer' } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !user.isActive || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }
    
    const now = new Date().toISOString();
    db.prepare('UPDATE users SET lastLogin = ? WHERE id = ?').run(now, user.id);
    
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    const { password: _, ...rest } = user;
    rest.lastLogin = now;
    if (rest.permissions) rest.permissions = JSON.parse(rest.permissions);
    res.json({ token, user: rest });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/create-user', (req, res, next) => { req.params.collection = 'users'; auth(req, res, next); }, async (req, res) => {
  try {
    const { email, password, fullName, role, permissions } = req.body;
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(400).json({ error: 'Email déjà utilisé' });
    const id = randomUUID();
    const hashedPassword = await bcrypt.hash(password, 10);
    db.prepare('INSERT INTO users (id, email, password, fullName, role, permissions, isActive) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, email, hashedPassword, fullName || email.split('@')[0], role || 'agent', JSON.stringify(permissions || []), 1);
    res.status(201).json({ id, email, fullName, role, permissions });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/update-user', (req, res, next) => { req.params.collection = 'users'; auth(req, res, next); }, async (req, res) => {
  try {
    const { uid, email, displayName, disabled } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(uid);
    if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
    if (email) db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email, uid);
    if (displayName) db.prepare('UPDATE users SET fullName = ? WHERE id = ?').run(displayName, uid);
    if (disabled !== undefined) db.prepare('UPDATE users SET isActive = ? WHERE id = ?').run(disabled ? 0 : 1, uid);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/update-password', (req, res, next) => { req.params.collection = 'users'; auth(req, res, next); }, async (req, res) => {
  try {
    const { uid, newPassword } = req.body;
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, uid);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/delete-user', (req, res, next) => { req.params.collection = 'users'; auth(req, res, next); }, async (req, res) => {
  try {
    const { uid } = req.body;
    db.prepare('DELETE FROM users WHERE id = ?').run(uid);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/me', (req, res, next) => { req.params.collection = 'users'; auth(req, res, next); }, (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'Non trouvé' });
    const { password: _, ...rest } = user;
    if (rest.permissions) rest.permissions = JSON.parse(rest.permissions);
    res.json(rest);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// CRUD Helper
const collections = [
  'users', 'clients', 'vehicles', 'rentals', 'maintenances', 'expenses', 
  'offices', 'notifications', 'leasings', 'stock', 'stockMovements', 
  'workers', 'attendance', 'salaryTransactions', 'salaryPayments', 'washes', 'transactions', 'activity_logs', 
  'gps_integrations', 'settings', 'siteSettings'
];

collections.forEach(table => {
  app.get(`/api/${table}`, (req, res, next) => { req.params.collection = table; auth(req, res, next); }, (req, res) => {
    try {
      const items = db.prepare(`SELECT * FROM ${table}`).all();
      res.json(items.map(item => {
        const parsed = { ...item };
        ['permissions', 'images', 'features', 'settings', 'officeIds', 'data', 'payments', 'documents', 'parts'].forEach(col => {
          if (parsed[col] && typeof parsed[col] === 'string') {
             try { parsed[col] = JSON.parse(parsed[col]); } catch(e) {}
          }
        });
        return parsed;
      }));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get(`/api/${table}/:id`, (req, res, next) => { req.params.collection = table; auth(req, res, next); }, (req, res) => {
    try {
      const item = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(req.params.id);
      if (!item) return res.status(404).json({ error: 'Non trouvé' });
      const parsed = { ...item };
      ['permissions', 'images', 'features', 'settings', 'officeIds', 'data', 'payments', 'documents', 'parts'].forEach(col => {
         if (parsed[col] && typeof parsed[col] === 'string') {
            try { parsed[col] = JSON.parse(parsed[col]); } catch(e) {}
         }
      });
      res.json(parsed);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post(`/api/${table}`, (req, res, next) => { req.params.collection = table; auth(req, res, next); }, async (req, res) => {
    try {
      const id = req.body.id || randomUUID();
      const rawData = { ...req.body, id };
      if (table === 'users' && rawData.password) rawData.password = await bcrypt.hash(rawData.password, 10);
      const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
      const data = {};
      Object.keys(rawData).forEach(k => { if (cols.includes(k)) data[k] = rawData[k]; });
      
      const keys = Object.keys(data);
      const vals = keys.map(k => prepareSqlValue(data[k]));
      db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...vals);
      res.status(201).json(data);
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.put(`/api/${table}/:id`, (req, res, next) => { req.params.collection = table; auth(req, res, next); }, async (req, res) => {
    try {
      const id = req.params.id;
      const rawData = { ...req.body, id };
      if (table === 'users' && rawData.password && rawData.password.length < 50) rawData.password = await bcrypt.hash(rawData.password, 10);
      const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
      const data = {};
      Object.keys(rawData).forEach(k => { if (cols.includes(k)) data[k] = rawData[k]; });
      
      const exists = db.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(id);
      if (exists) {
        const up = { ...data }; delete up.id;
        const uKeys = Object.keys(up);
        if (uKeys.length > 0) {
          const uVals = uKeys.map(k => prepareSqlValue(up[k]));
          db.prepare(`UPDATE ${table} SET ${uKeys.map(k => `${k}=?`).join(',')} WHERE id = ?`).run(...uVals, id);
        }
      } else {
        const keys = Object.keys(data);
        const vals = keys.map(k => prepareSqlValue(data[k]));
        db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...vals);
      }
      res.json(data);
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.delete(`/api/${table}/:id`, (req, res, next) => { req.params.collection = table; auth(req, res, next); }, (req, res) => {
    try { db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(req.params.id); res.json({ success: true }); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });
});

// Serve frontend
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

app.listen(PORT, () => console.log(`Listening on ${PORT}`));
