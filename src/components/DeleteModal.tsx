import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface DeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
}

export function DeleteModal({ isOpen, onClose, onConfirm, title, message }: DeleteModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 resizable-modal" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-red-50">
          <div className="flex items-center gap-3 text-red-600">
            <AlertTriangle className="w-6 h-6" />
            <h3 className="text-xl font-bold">{title}</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-red-100 rounded-full text-red-400 transition-all">
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="p-8">
          <p className="text-stone-600 leading-relaxed">{message}</p>
        </div>
        <div className="p-6 bg-stone-50 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 px-6 bg-white border border-stone-200 text-stone-700 rounded-2xl font-bold hover:bg-stone-50 transition-all"
          >
            Annuler
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="flex-1 py-3 px-6 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-500 transition-all shadow-lg shadow-red-600/20"
          >
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}
