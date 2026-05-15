import React from 'react';
import { X, AlertCircle, CheckCircle, Info } from 'lucide-react';
import { clsx } from 'clsx';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'info' | 'success' | 'warning' | 'danger';
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirmer',
  cancelText = 'Annuler',
  type = 'info'
}: ConfirmationModalProps) {
  if (!isOpen) return null;

  const themes = {
    info: {
      icon: Info,
      iconBg: 'bg-emerald-50',
      iconColor: 'text-emerald-600',
      buttonBg: 'bg-emerald-600 hover:bg-emerald-500',
      ring: 'focus:ring-emerald-500'
    },
    success: {
      icon: CheckCircle,
      iconBg: 'bg-emerald-50',
      iconColor: 'text-emerald-600',
      buttonBg: 'bg-emerald-600 hover:bg-emerald-500',
      ring: 'focus:ring-emerald-500'
    },
    warning: {
      icon: AlertCircle,
      iconBg: 'bg-amber-50',
      iconColor: 'text-amber-600',
      buttonBg: 'bg-amber-600 hover:bg-amber-500',
      ring: 'focus:ring-amber-500'
    },
    danger: {
      icon: AlertCircle,
      iconBg: 'bg-red-50',
      iconColor: 'text-red-600',
      buttonBg: 'bg-red-600 hover:bg-red-500',
      ring: 'focus:ring-red-500'
    }
  };

  const theme = themes[type];
  const Icon = theme.icon;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in duration-200 resizable-modal">
        <div className="p-8">
          <div className="flex items-center justify-between mb-6">
            <div className={clsx("p-3 rounded-2xl", theme.iconBg, theme.iconColor)}>
              <Icon className="w-6 h-6" />
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-stone-100 rounded-full text-stone-400 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <h3 className="text-2xl font-bold text-stone-900 mb-2">{title}</h3>
          <p className="text-stone-500 leading-relaxed mb-8">
            {message}
          </p>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-6 py-3.5 rounded-2xl font-bold text-stone-600 bg-stone-100 hover:bg-stone-200 transition-all"
            >
              {cancelText}
            </button>
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={clsx(
                "flex-1 px-6 py-3.5 rounded-2xl font-bold text-white transition-all shadow-lg",
                theme.buttonBg,
                theme.ring
              )}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
