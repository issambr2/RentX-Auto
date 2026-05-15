import React, { useState, useEffect } from 'react';
import { Megaphone, Save, Image as ImageIcon, Layout, Type, Globe, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { db, doc, getDoc, setDoc, onSnapshot } from '../lib/api';
import { ImageUpload } from './ImageUpload';
import { motion } from 'motion/react';

interface SiteSettings {
  heroImageUrl: string;
  heroTitle: string;
  heroSubtitle: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  facebookUrl?: string;
  instagramUrl?: string;
}

export function PublicityPanel() {
  const [settings, setSettings] = useState<SiteSettings>({
    heroImageUrl: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&q=80&w=1920',
    heroTitle: "Louez l'excellence pour vos trajets.",
    heroSubtitle: "Découvrez notre flotte de véhicules premium et profitez d'un service de location professionnel, flexible et sans compromis.",
    contactEmail: 'contact@rentx.tn',
    contactPhone: '+216 71 000 000',
    address: 'Tunis, Tunisie'
  });
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'siteSettings', 'homepage'), (snapshot) => {
      if (snapshot.exists()) {
        setSettings(snapshot.data() as SiteSettings);
      }
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setNotification(null);

    try {
      await setDoc(doc(db, 'siteSettings', 'homepage'), {
        ...settings,
        updatedAt: new Date().toISOString()
      });
      setNotification({ type: 'success', message: 'Paramètres mis à jour avec succès !' });
    } catch (error) {
      console.error("Error saving site settings:", error);
      setNotification({ type: 'error', message: 'Erreur lors de la mise à jour.' });
    } finally {
      setIsSaving(false);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Loader2 className="w-12 h-12 text-emerald-600 animate-spin" />
        <p className="text-stone-400 font-medium italic">Chargement des paramètres...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-bold text-stone-900 tracking-tight">Gestion <span className="text-emerald-600 italic serif">Publicité</span></h2>
          <p className="text-stone-500 mt-1 italic serif">Personnalisez l'apparence et le contenu de votre site web public.</p>
        </div>
        
        {notification && (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold shadow-sm ${
              notification.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'
            }`}
          >
            {notification.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {notification.message}
          </motion.div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <form onSubmit={handleSave} id="pub-form" className="bg-white p-8 rounded-[2.5rem] border border-stone-200 shadow-sm space-y-8">
            {/* Hero Image Section */}
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-emerald-50 rounded-xl">
                  <ImageIcon className="w-5 h-5 text-emerald-600" />
                </div>
                <h3 className="text-lg font-bold text-stone-900 uppercase tracking-widest text-xs">Image d'accueil (Hero)</h3>
              </div>
              
              <div className="space-y-4">
                <div className="relative aspect-[21/9] rounded-[2rem] overflow-hidden border-2 border-stone-100 group">
                  <img 
                    src={settings.heroImageUrl} 
                    alt="Hero Preview" 
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute bottom-4 left-4 right-4 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="bg-white/90 backdrop-blur-sm text-stone-900 px-4 py-2 rounded-full text-xs font-bold shadow-lg">Aperçu direct</span>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 gap-4">
                  <div className="flex flex-col gap-1 px-4 py-3 bg-stone-50 rounded-2xl border border-stone-100">
                    <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest flex items-center gap-2 italic serif">
                      URL de l'image (Unsplash ou direct)
                    </label>
                    <input 
                      type="url"
                      value={settings.heroImageUrl}
                      onChange={(e) => setSettings({ ...settings, heroImageUrl: e.target.value })}
                      placeholder="https://images.unsplash.com/..."
                      className="bg-transparent border-none p-0 text-sm font-bold text-stone-900 focus:ring-0 w-full"
                    />
                  </div>
                  <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                    <p className="text-xs text-amber-900 leading-relaxed font-medium">
                      Conseil : Utilisez des images haute résolution (min. 1920x1080) avec un sujet centré à droite pour un meilleur rendu visuel.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="h-px bg-stone-100" />

            {/* Content Section */}
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-stone-100 rounded-xl">
                  <Type className="w-5 h-5 text-stone-600" />
                </div>
                <h3 className="text-lg font-bold text-stone-900 uppercase tracking-widest text-xs">Textes de la page d'accueil</h3>
              </div>

              <div className="grid grid-cols-1 gap-6">
                <div className="flex flex-col gap-1 px-4 py-3 bg-stone-50 rounded-2xl border border-stone-100">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest flex items-center gap-2 italic serif">
                    Titre Principal
                  </label>
                  <input 
                    type="text"
                    value={settings.heroTitle}
                    onChange={(e) => setSettings({ ...settings, heroTitle: e.target.value })}
                    className="bg-transparent border-none p-0 text-lg font-bold text-stone-900 focus:ring-0 w-full"
                  />
                </div>
                <div className="flex flex-col gap-1 px-4 py-3 bg-stone-50 rounded-2xl border border-stone-100">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest flex items-center gap-2 italic serif">
                    Sous-titre / Description
                  </label>
                  <textarea 
                    value={settings.heroSubtitle}
                    onChange={(e) => setSettings({ ...settings, heroSubtitle: e.target.value })}
                    rows={3}
                    className="bg-transparent border-none p-0 text-sm font-medium text-stone-600 focus:ring-0 w-full resize-none leading-relaxed"
                  />
                </div>
              </div>
            </div>

            <div className="h-px bg-stone-100" />

            {/* Contact Info Section */}
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-stone-100 rounded-xl">
                  <Globe className="w-5 h-5 text-stone-600" />
                </div>
                <h3 className="text-lg font-bold text-stone-900 uppercase tracking-widest text-xs">Informations de contact public</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-1 px-4 py-3 bg-stone-50 rounded-2xl border border-stone-100">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest italic serif">Email de contact</label>
                  <input 
                    type="email"
                    value={settings.contactEmail}
                    onChange={(e) => setSettings({ ...settings, contactEmail: e.target.value })}
                    className="bg-transparent border-none p-0 text-sm font-bold text-stone-900 focus:ring-0 w-full"
                  />
                </div>
                <div className="flex flex-col gap-1 px-4 py-3 bg-stone-50 rounded-2xl border border-stone-100">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest italic serif">Téléphone public</label>
                  <input 
                    type="text"
                    value={settings.contactPhone}
                    onChange={(e) => setSettings({ ...settings, contactPhone: e.target.value })}
                    className="bg-transparent border-none p-0 text-sm font-bold text-stone-900 focus:ring-0 w-full"
                  />
                </div>
                <div className="flex flex-col gap-1 px-4 py-3 bg-stone-50 rounded-2xl border border-stone-100 md:col-span-2">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest italic serif">Adresse Affichée</label>
                  <input 
                    type="text"
                    value={settings.address}
                    onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                    className="bg-transparent border-none p-0 text-sm font-bold text-stone-900 focus:ring-0 w-full"
                  />
                </div>
                <div className="flex flex-col gap-1 px-4 py-3 bg-stone-50 rounded-2xl border border-stone-100">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest italic serif">Instagram URL</label>
                  <input 
                    type="url"
                    value={settings.instagramUrl || ''}
                    onChange={(e) => setSettings({ ...settings, instagramUrl: e.target.value })}
                    className="bg-transparent border-none p-0 text-sm font-bold text-stone-900 focus:ring-0 w-full"
                  />
                </div>
                <div className="flex flex-col gap-1 px-4 py-3 bg-stone-50 rounded-2xl border border-stone-100">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest italic serif">Facebook URL</label>
                  <input 
                    type="url"
                    value={settings.facebookUrl || ''}
                    onChange={(e) => setSettings({ ...settings, facebookUrl: e.target.value })}
                    className="bg-transparent border-none p-0 text-sm font-bold text-stone-900 focus:ring-0 w-full"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button
                type="submit"
                disabled={isSaving}
                className="bg-stone-900 text-white px-10 py-4 rounded-2xl font-bold hover:bg-stone-800 transition-all shadow-lg flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed group h-14"
              >
                {isSaving ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Save className="w-5 h-5 group-hover:scale-110 transition-transform" />
                )}
                <span>Enregistrer les modifications</span>
              </button>
            </div>
          </form>
        </div>

        <div className="space-y-6">
          <div className="bg-emerald-900 text-white p-8 rounded-[2.5rem] shadow-xl shadow-emerald-900/20 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 transition-transform duration-1000 group-hover:scale-150" />
            <Megaphone className="w-8 h-8 text-emerald-400 mb-4" />
            <h4 className="text-xl font-bold mb-2">Visibilité du site</h4>
            <p className="text-emerald-100/70 text-sm leading-relaxed mb-6 font-medium italic">
              Vos modifications sont appliquées instantanément sur le site web public une fois enregistrées.
            </p>
            <button 
              onClick={() => window.open('#customer', '_blank')}
              className="w-full py-3 bg-white text-emerald-900 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-emerald-50 transition-all flex items-center justify-center gap-2 shadow-lg"
            >
              <Globe className="w-4 h-4" />
              Voir le résultat
            </button>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] border border-stone-200 shadow-sm">
            <h4 className="text-sm font-bold text-stone-900 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Layout className="w-4 h-4 text-stone-400" />
              Structure du Site
            </h4>
            <ul className="space-y-3">
              {[
                "Bannière Principale (Hero)",
                "Flotte Automobile",
                "Nos Services",
                "Contact & Pied de page"
              ].map((item, idx) => (
                <li key={idx} className="flex items-center gap-3 text-sm text-stone-500 font-medium">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
