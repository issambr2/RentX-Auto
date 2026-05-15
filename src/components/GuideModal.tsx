import React from 'react';
import { X, Info, Car, Users, Calendar, DollarSign, PieChart, ShieldCheck, Wrench, Settings, Globe, Package } from 'lucide-react';

interface GuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: string;
}

export function GuideModal({ isOpen, onClose, activeTab }: GuideModalProps) {
  if (!isOpen) return null;

  const getGuideContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return {
          title: 'Tableau de Bord',
          steps: [
            'Consultez les statistiques clés de votre agence en un coup d\'œil.',
            'Suivez la disponibilité de votre flotte en temps réel.',
            'Visualisez les revenus récents et les activités des agents.'
          ]
        };
      case 'vehicles':
        return {
          title: 'Gestion des Véhicules',
          steps: [
            'Ajoutez vos voitures en cliquant sur "Ajouter un véhicule".',
            'Pour les voitures de partenaires, activez "Véhicule sous-traitance" et saisissez le nom du propriétaire.',
            'Suivez les échéances (Assurance, Vignette, Visite technique) et les vidanges.'
          ]
        };
      case 'rentals':
        return {
          title: 'Locations & Réservations',
          steps: [
            'Créez un nouveau contrat en sélectionnant un véhicule et un client.',
            'Gérez les réservations venant du site web (icône Globe bleue).',
            'Effectuez des échanges de véhicules ou clôturez les contrats avec photos.'
          ]
        };
      case 'leasing':
        return {
          title: 'Gestion Leasing & Sous-traitance',
          steps: [
            'Enregistrez vos contrats de leasing bancaire ou de sous-traitance.',
            'Spécifiez si la commission et l\'apport sont mensuels ou totaux.',
            'Gérez l\'échéancier de paiement et recevez des alertes 15 jours avant chaque échéance.'
          ]
        };
      case 'accounting':
        return {
          title: 'Comptabilité & Finance',
          steps: [
            'Suivez tous les encaissements des locations.',
            'Générez des rapports financiers détaillés (Entrées vs Sorties).',
            'Exportez vos données en PDF ou CSV pour votre comptable.'
          ]
        };
      case 'stock':
        return {
          title: 'Gestion du Stock',
          steps: [
            'Gérez vos consommables (Huile, Filtres, Pneus).',
            'Enregistrez les entrées et sorties de stock liées aux véhicules.',
            'Exportez l\'inventaire et l\'historique des mouvements en Excel.',
            'Recevez des alertes lorsque le niveau de stock est bas.'
          ]
        };
      case 'workers':
        return {
          title: 'Gestion des Travailleurs',
          steps: [
            'Créez des fiches détaillées pour chaque employé.',
            'Effectuez le pointage quotidien (Présent, Absent, Retard).',
            'Gérez les avances sur salaire et le calcul automatique de la paie nette.'
          ]
        };
      case 'finance':
        return {
          title: 'Statut Financier',
          steps: [
            'Analysez la rentabilité globale de votre agence par mois.',
            'Visualisez la répartition des dépenses (Maintenance, Leasing, Salaires).',
            'Suivez l\'évolution des revenus et bénéfices sur les 6 derniers mois.'
          ]
        };
      default:
        return {
          title: 'Guide d\'utilisation',
          steps: [
            'Utilisez le menu latéral pour naviguer entre les modules.',
            'Les administrateurs ont accès aux statistiques et à la configuration système.',
            'En cas de doute, cliquez sur cette icône (i) pour obtenir de l\'aide sur la page actuelle.'
          ]
        };
    }
  };

  const content = getGuideContent();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-md">
      <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300">
        <div className="p-8 border-b border-stone-100 flex items-center justify-between bg-emerald-600 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-xl">
              <Info className="w-6 h-6" />
            </div>
            <h3 className="text-2xl font-bold tracking-tight">Guide: {content.title}</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="p-8 space-y-6">
          <div className="space-y-4">
            {content.steps.map((step, index) => (
              <div key={index} className="flex gap-4 group">
                <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-sm shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition-all">
                  {index + 1}
                </div>
                <p className="text-stone-600 leading-relaxed pt-1">{step}</p>
              </div>
            ))}
          </div>

          <div className="pt-6 border-t border-stone-100">
            <button
              onClick={onClose}
              className="w-full py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all shadow-lg shadow-stone-900/20 flex items-center justify-center gap-2"
            >
              J'ai compris
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
