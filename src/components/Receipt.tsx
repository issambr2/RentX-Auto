import React from 'react';
import { Rental, Vehicle, Client } from '../types';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Printer, X, FileText, Download } from 'lucide-react';
import { generateContractPDF, generateInvoicePDF } from '../services/pdfService';
import { doc, getDoc, db } from '../lib/api';
import { Logo } from './Logo';

interface ReceiptProps {
  rental: Rental;
  vehicle?: Vehicle;
  client: Client;
  secondDriver?: Client;
  onClose: () => void;
}

export function Receipt({ rental, vehicle, client, secondDriver, onClose }: ReceiptProps) {
  const [settings, setSettings] = React.useState<any>(null);

  React.useEffect(() => {
    const fetchSettings = async () => {
      const settingsDoc = await getDoc(doc(db, 'settings', 'system'));
      if (settingsDoc.exists()) {
        setSettings(settingsDoc.data());
      }
    };
    fetchSettings();
  }, []);

  const handlePrint = () => {
    window.print();
  };

  const downloadPDF = async (type: 'contract' | 'invoice') => {
    if (type === 'contract') {
      generateContractPDF(rental, vehicle, client, settings, secondDriver);
    } else {
      generateInvoicePDF(rental, vehicle, client, settings);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const documentLabels = {
    quote: 'Devis',
    invoice: 'Facture',
    reservation: 'Réservation',
    credit_note: 'Avoir'
  };

  return (
    <div 
      className="fixed inset-0 z-[100] bg-stone-900/60 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto print:p-0 print:bg-white print:static print:block print:inset-auto print:z-auto"
      onClick={handleBackdropClick}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            margin: 10mm;
            size: auto;
          }
          body {
            background: white !important;
          }
          .print-content {
            visibility: visible !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print {
            display: none !important;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}} />
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] print:shadow-none print:rounded-none print:w-full print:max-w-none print:max-h-none print-content">
        {/* Header - Hidden on print */}
        <div className="p-6 border-b border-stone-100 flex items-center justify-between shrink-0 print:hidden no-print">
          <h3 className="text-xl font-bold text-stone-900">{documentLabels[rental.documentType || 'invoice']} de Location</h3>
          <div className="flex gap-3">
            <button
              onClick={() => downloadPDF('contract')}
              className="flex items-center gap-2 bg-stone-900 text-white px-4 py-2 rounded-xl font-semibold hover:bg-stone-800 transition-all text-xs"
              title="Télécharger le contrat PDF"
            >
              <FileText className="w-4 h-4" />
              Contrat
            </button>
            <button
              onClick={() => downloadPDF('invoice')}
              className="flex items-center gap-2 bg-stone-900 text-white px-4 py-2 rounded-xl font-semibold hover:bg-stone-800 transition-all text-xs"
              title="Télécharger la facture PDF"
            >
              <Download className="w-4 h-4" />
              Facture
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl font-semibold hover:bg-emerald-500 transition-all text-xs"
            >
              <Printer className="w-4 h-4" />
              Imprimer
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-stone-100 rounded-full text-stone-400"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Receipt Content */}
        <div className="p-12 space-y-12 overflow-y-auto print:p-8 print:overflow-visible">
          {/* Company Branding */}
          <div className="flex justify-between items-start">
            <div className="flex items-start gap-6">
              <div className="no-print">
                <Logo className="w-24 h-24" isCircular={true} showText={false} />
              </div>
              <div className="hidden print:block">
                <Logo className="w-32 h-32" isCircular={true} showText={false} />
              </div>
              <div>
                <h1 className="text-4xl font-bold text-stone-900 tracking-tighter">
                  {settings?.agencyName || 'RentX Auto'}
                </h1>
                <p className="text-stone-500 text-sm mt-1">Location de voitures professionnelle</p>
                <p className="text-stone-400 text-xs mt-4">{settings?.agencyAddress || 'Rue Taieb Hachicha M\'saken A côté café Vegas'}</p>
                <p className="text-stone-400 text-xs">Tél: {settings?.agencyPhone || '24621605 | 53666895'}</p>
                <p className="text-stone-400 text-xs">Email: {settings?.agencyEmail || 'dhokkarlocation2016@gmail.com'}</p>
                <p className="text-stone-400 text-xs font-bold mt-1">MF: {settings?.agencyMF || '114739OR/A/M 000'}</p>
              </div>
            </div>
            <div className="text-right">
              <h2 className="text-lg font-bold text-stone-900 uppercase tracking-widest">
                {documentLabels[rental.documentType || 'invoice'].toUpperCase()} N° {rental.contractNumber || rental.id.slice(-6).toUpperCase()}
              </h2>
              <p className="text-stone-500 text-sm mt-1">Date: {format(new Date(), 'dd/MM/yyyy')}</p>
              <div className="mt-2">
                <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border ${
                  rental.paymentStatus === 'paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                  rental.paymentStatus === 'partial' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                  'bg-red-50 text-red-700 border-red-100'
                }`}>
                  {rental.paymentStatus === 'paid' ? 'Payé' : 
                   rental.paymentStatus === 'partial' ? 'Partiel' : 'Impayé'}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-12">
            {/* Client Info */}
            <div className="space-y-6">
              <div>
                <h4 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-4 border-b border-stone-100 pb-2">Conducteur Principal</h4>
                <p className="font-bold text-stone-900 text-lg">{client.name}</p>
                {client.customerType === 'company' ? (
                  <p className="text-stone-500 text-sm mt-1">MF: {client.cin || 'N/A'}</p>
                ) : (
                  <p className="text-stone-500 text-sm mt-1">CIN: {client.cin}</p>
                )}
                <p className="text-stone-500 text-sm">Tél: {client.phone}</p>
                <p className="text-stone-500 text-sm truncate">{client.address}, {client.city}</p>
              </div>

              {secondDriver && (
                <div>
                  <h4 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-4 border-b border-stone-100 pb-2">2ème Conducteur</h4>
                  <p className="font-bold text-stone-900 text-lg">{secondDriver.name}</p>
                  <p className="text-stone-500 text-sm mt-1">CIN: {secondDriver.cin}</p>
                  <p className="text-stone-500 text-sm">Tél: {secondDriver.phone}</p>
                </div>
              )}
            </div>

            {/* Vehicle Info */}
            <div>
              <h4 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-4 border-b border-stone-100 pb-2">Véhicule</h4>
              {vehicle ? (
                <>
                  <p className="font-bold text-stone-900 text-lg">{vehicle.brand} {vehicle.model}</p>
                  <p className="text-stone-500 text-sm mt-1">Plaque: {vehicle.plate}</p>
                  <p className="text-stone-500 text-sm capitalize">Catégorie: {vehicle.type}</p>
                  <p className="text-stone-500 text-sm">Kilométrage: {vehicle.mileage} km</p>
                </>
              ) : (
                <p className="text-stone-500 italic">Aucun véhicule assigné</p>
              )}
            </div>
          </div>

          {/* Rental Details */}
          <div className="bg-stone-50 p-8 rounded-3xl border border-stone-100">
            <div className="grid grid-cols-2 gap-8">
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Date de début</p>
                <p className="font-medium text-stone-900">{format(new Date(rental.startDate), 'dd MMMM yyyy', { locale: fr })}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Date de fin</p>
                <p className="font-medium text-stone-900">{format(new Date(rental.endDate), 'dd MMMM yyyy', { locale: fr })}</p>
              </div>
            </div>
          </div>

          {/* Financials */}
          <div className="space-y-4 border-t-2 border-stone-900 pt-8">
            <div className="flex justify-between text-stone-600">
              <span>Mode de paiement</span>
              <span className="font-bold uppercase">{rental.paymentMethod}</span>
            </div>
            <div className="flex justify-between text-stone-600">
              <span>Dépôt de garantie</span>
              <span className="font-bold">{rental.depositAmount} TND</span>
            </div>
            {rental.discountAmount && rental.discountAmount > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Remise ({rental.discountType === 'percentage' ? `${rental.discountAmount}%` : 'Fixe'})</span>
                <span className="font-bold">-{rental.discountType === 'percentage' ? ((rental.subtotal * rental.discountAmount) / 100).toLocaleString() : rental.discountAmount.toLocaleString()} TND</span>
              </div>
            )}
            
            <div className="pt-4 space-y-2 border-t border-stone-100">
              <div className="flex justify-between text-stone-500 text-sm">
                <span>Total H.T</span>
                <span>{(rental.totalAmountHT || (rental.totalAmount / 1.19)).toLocaleString(undefined, {minimumFractionDigits: 3})} TND</span>
              </div>
              <div className="flex justify-between text-stone-500 text-sm">
                <span>TVA (19%)</span>
                <span>{(rental.vatAmount || (rental.totalAmount - (rental.totalAmount / 1.19))).toLocaleString(undefined, {minimumFractionDigits: 3})} TND</span>
              </div>
              <div className="flex justify-between items-center pt-2">
                <span className="text-xl font-bold text-stone-900">Total TTC</span>
                <div className="text-right">
                  <span className="text-4xl font-black text-stone-900">{(rental.totalAmount || 0).toLocaleString()} TND</span>
                </div>
              </div>
            </div>
          </div>

          {/* Vehicle Photos - Condition */}
          {rental.vehiclePhotos && (Object.values(rental.vehiclePhotos).some(p => p)) && (
            <div className="space-y-6 pt-8 border-t border-stone-100">
              <h4 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-4 border-b border-stone-100 pb-2">État des lieux (Photos du véhicule)</h4>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {rental.vehiclePhotos.front && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <p className="text-[8px] font-bold text-stone-400 uppercase tracking-widest">Vue Avant</p>
                    </div>
                    <img src={rental.vehiclePhotos.front} alt="Avant" className="w-full aspect-video object-cover rounded-xl border border-stone-200 shadow-sm" referrerPolicy="no-referrer" />
                  </div>
                )}
                {rental.vehiclePhotos.back && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <p className="text-[8px] font-bold text-stone-400 uppercase tracking-widest">Vue Arrière</p>
                    </div>
                    <img src={rental.vehiclePhotos.back} alt="Arrière" className="w-full aspect-video object-cover rounded-xl border border-stone-200 shadow-sm" referrerPolicy="no-referrer" />
                  </div>
                )}
                {rental.vehiclePhotos.left && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      <p className="text-[8px] font-bold text-stone-400 uppercase tracking-widest">Côté Gauche</p>
                    </div>
                    <img src={rental.vehiclePhotos.left} alt="Gauche" className="w-full aspect-video object-cover rounded-xl border border-stone-200 shadow-sm" referrerPolicy="no-referrer" />
                  </div>
                )}
                {rental.vehiclePhotos.right && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                      <p className="text-[8px] font-bold text-stone-400 uppercase tracking-widest">Côté Droit</p>
                    </div>
                    <img src={rental.vehiclePhotos.right} alt="Droite" className="w-full aspect-video object-cover rounded-xl border border-stone-200 shadow-sm" referrerPolicy="no-referrer" />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Terms and Conditions Summary */}
          <div className="pt-8 border-t border-stone-100">
            <h4 className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-4">Conditions Générales (Extrait)</h4>
            <div className="grid grid-cols-2 gap-8 text-[9px] text-stone-500 leading-relaxed">
              <ul className="list-disc pl-4 space-y-1">
                <li>Le véhicule doit être restitué avec le même niveau de carburant qu'au départ.</li>
                <li>Le locataire est responsable des infractions au code de la route.</li>
                <li>Toute prolongation doit être signalée 24h à l'avance.</li>
              </ul>
              <ul className="list-disc pl-4 space-y-1">
                <li>En cas d'accident, un constat amiable est obligatoire.</li>
                <li>Le véhicule est strictement interdit de circuler sur les pistes non goudronnées.</li>
                <li>Fumer à l'intérieur du véhicule est strictement interdit.</li>
              </ul>
            </div>
          </div>

          {/* Signatures Section */}
          <div className="pt-12 grid grid-cols-2 gap-12">
            <div className="space-y-16 text-center border border-stone-100 p-6 rounded-2xl">
              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Signature Client (Lu et approuvé)</p>
              <div className="w-32 h-px bg-stone-200 mx-auto" />
            </div>
            <div className="space-y-16 text-center border border-stone-100 p-6 rounded-2xl bg-stone-50/50">
              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Cachet & Signature Agence</p>
              <div className="w-32 h-px bg-stone-200 mx-auto" />
            </div>
          </div>

          {/* Footer Branding */}
          <div className="pt-12 text-center border-t border-dashed border-stone-200">
            <p className="text-stone-400 text-xs italic serif mb-4">Merci de votre confiance. Bonne route avec RentX Auto !</p>
            <div className="flex flex-col items-center gap-1 text-[9px] text-stone-400 uppercase tracking-widest font-medium">
              <span>RentX Auto - MF: 114739OR/A/M 000</span>
              <span>Rue Taieb Hachicha M'saken A côté café Vegas</span>
              <span>Email: dhokkarlocation2016@gmail.com</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
