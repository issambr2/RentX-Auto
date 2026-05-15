import React, { useState } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { Client } from '../types';

interface BlockClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  client: Client;
}

export function BlockClientModal({ isOpen, onClose, onConfirm, client }: BlockClientModalProps) {
  const [reason, setReason] = useState('');

  if (!isOpen) return null;

  const isBlocking = !client.isBlocked;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in duration-200 resizable-modal">
        <div className="p-8">
          <div className="flex items-center justify-between mb-6">
            <div className={`p-3 rounded-2xl ${isBlocking ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
              <AlertCircle className="w-6 h-6" />
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-stone-100 rounded-full text-stone-400 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <h3 className="text-2xl font-bold text-stone-900 mb-2">
            {isBlocking ? 'Bloquer le client' : 'Débloquer le client'}
          </h3>
          <p className="text-stone-500 leading-relaxed mb-6">
            {isBlocking 
              ? `Voulez-vous vraiment bloquer ${client.name} ? Il ne pourra plus effectuer de nouvelles locations.`
              : `Voulez-vous vraiment débloquer ${client.name} ?`}
          </p>

          {isBlocking && (
            <div className="space-y-2 mb-8">
              <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Raison du blocage</label>
              <textarea
                autoFocus
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-4 py-3 bg-stone-50 border-none rounded-xl focus:ring-2 focus:ring-red-500 h-24 resize-none"
                placeholder="Expliquez pourquoi ce client est bloqué..."
              />
            </div>
          )}
          
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-6 py-3.5 rounded-2xl font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition-all"
            >
              Annuler
            </button>
            <button
              onClick={() => {
                onConfirm(reason);
                onClose();
              }}
              className={`flex-1 px-6 py-3.5 rounded-2xl font-bold text-white transition-all shadow-lg ${
                isBlocking ? 'bg-red-600 hover:bg-red-500 shadow-red-600/20' : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20'
              }`}
            >
              {isBlocking ? 'Bloquer' : 'Débloquer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
