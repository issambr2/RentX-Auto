import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'fr' | 'ar' | 'en';

interface Translations {
  [key: string]: {
    [lang in Language]: string;
  };
}

const translations: Translations = {
  dashboard: { fr: 'Tableau de bord', ar: 'لوحة القيادة', en: 'Dashboard' },
  vehicles: { fr: 'Véhicules', ar: 'المركبات', en: 'Vehicles' },
  clients: { fr: 'Clients', ar: 'العملاء', en: 'Clients' },
  rentals: { fr: 'Locations', ar: 'الإيجارات', en: 'Rentals' },
  maintenance: { fr: 'Maintenance', ar: 'الصيانة', en: 'Maintenance' },
  expenses: { fr: 'Dépenses', ar: 'المصاريف', en: 'Expenses' },
  accounting: { fr: 'Comptabilité', ar: 'المحاسبة', en: 'Accounting' },
  statistics: { fr: 'Statistiques', ar: 'الإحصائيات', en: 'Statistics' },
  stock: { fr: 'Stock', ar: 'المخزون', en: 'Stock' },
  planning: { fr: 'Planning', ar: 'التخطيط', en: 'Planning' },
  users: { fr: 'Utilisateurs', ar: 'المستخدمين', en: 'Users' },
  settings: { fr: 'Paramètres', ar: 'الإعدادات', en: 'Settings' },
  logout: { fr: 'Déconnexion', ar: 'تسجيل الخروج', en: 'Logout' },
  add_vehicle: { fr: 'Ajouter un véhicule', ar: 'إضافة مركبة', en: 'Add Vehicle' },
  new_client: { fr: 'Nouveau client', ar: 'عميل جديد', en: 'New Client' },
  edit_client: { fr: 'Modifier le client', ar: 'تعديل العميل', en: 'Edit Client' },
  manage_clients_desc: { fr: 'Gérez votre base de données clients.', ar: 'إدارة قاعدة بيانات العملاء الخاصة بك.', en: 'Manage your customer database.' },
  search_clients_placeholder: { fr: 'Rechercher par nom, CIN ou téléphone...', ar: 'البحث بالاسم، بطاقة التعريف أو الهاتف...', en: 'Search by name, ID or phone...' },
  blocked: { fr: 'Bloqué', ar: 'محظور', en: 'Blocked' },
  block: { fr: 'Bloquer', ar: 'حظر', en: 'Block' },
  unblock: { fr: 'Débloquer', ar: 'إلغاء الحظر', en: 'Unblock' },
  reason: { fr: 'Raison', ar: 'السبب', en: 'Reason' },
  docs_ok: { fr: 'Documents OK', ar: 'الوثائق جاهزة', en: 'Docs OK' },
  loyalty_points: { fr: 'Points de fidélité', ar: 'نقاط الولاء', en: 'Loyalty Points' },
  loyalty_status: { fr: 'Statut de fidélité', ar: 'حالة الولاء', en: 'Loyalty Status' },
  general_info: { fr: 'Informations Générales', ar: 'معلومات عامة', en: 'General Information' },
  full_name: { fr: 'Nom Complet', ar: 'الاسم الكامل', en: 'Full Name' },
  license_number: { fr: 'N° Permis', ar: 'رقم الرخصة', en: 'License Number' },
  phone: { fr: 'Téléphone', ar: 'الهاتف', en: 'Phone' },
  regular: { fr: 'Régulier', ar: 'عادي', en: 'Regular' },
  duplicate_detected: { fr: 'Doublon détecté', ar: 'تم اكتشاف تكرار', en: 'Duplicate Detected' },
  duplicate_client_desc: { fr: 'Un client avec les mêmes informations existe déjà.', ar: 'يوجد عميل بنفس المعلومات بالفعل.', en: 'A client with the same information already exists.' },
  new_rental: { fr: 'Nouvelle location', ar: 'إيجار جديد', en: 'New Rental' },
  search: { fr: 'Rechercher', ar: 'بحث', en: 'Search' },
  status: { fr: 'Statut', ar: 'الحالة', en: 'Status' },
  available: { fr: 'Disponible', ar: 'متاح', en: 'Available' },
  rented: { fr: 'Loué', ar: 'مؤجر', en: 'Rented' },
  reserved: { fr: 'Réservé', ar: 'محجوز', en: 'Reserved' },
  total_revenue: { fr: 'Revenu Total', ar: 'إجمالي الإيرادات', en: 'Total Revenue' },
  active_rentals: { fr: 'Locations Actives', ar: 'الإيجارات النشطة', en: 'Active Rentals' },
  fleet_utilization: { fr: 'Utilisation de la flotte', ar: 'استخدام الأسطول', en: 'Fleet Utilization' },
  pending_maintenance: { fr: 'Maintenance en attente', ar: 'صيانة معلقة', en: 'Pending Maintenance' },
  language: { fr: 'Langue', ar: 'اللغة', en: 'Language' },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('dhokkar_lang');
    return (saved as Language) || 'fr';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('dhokkar_lang', lang);
  };

  const t = (key: string) => {
    return translations[key]?.[language] || key;
  };

  const isRTL = language === 'ar';

  useEffect(() => {
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
  }, [language, isRTL]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, isRTL }}>
      <div className={isRTL ? 'font-arabic' : ''}>
        {children}
      </div>
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
