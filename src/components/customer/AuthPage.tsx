import React, { useState } from 'react';
import { Mail, Lock, User, ArrowRight, Car, LogIn, Loader2, AlertCircle, Phone, CreditCard, MapPin, FileText, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { loginWithEmail, registerWithEmail, resetPassword, db } from '../../lib/api';
import { ensureUserProfile } from '../../services/userService';
import { collection, query, where, getDocs, setDoc } from '../../lib/api';
import { ImageUpload } from '../ImageUpload';
import { Client } from '../../types';

import { Logo } from '../Logo';

interface AuthPageProps {
  onSuccess: () => void;
  onBack: () => void;
}

export function AuthPage({ onSuccess, onBack }: AuthPageProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [cin, setCin] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [address, setAddress] = useState('');
  const [cinRecto, setCinRecto] = useState('');
  const [cinVerso, setCinVerso] = useState('');
  const [licenseRecto, setLicenseRecto] = useState('');
  const [licenseVerso, setLicenseVerso] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleResetPassword = async () => {
    if (!email) {
      setError('Veuillez saisir votre adresse email.');
      return;
    }
    setLoading(true);
    try {
      await resetPassword(email);
      setSuccess('Un email de réinitialisation a été envoyé.');
      setError('');
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (mode === 'login') {
        let loginEmail = email;
        if (email.toLowerCase() === 'admin') {
          loginEmail = 'brahemdesign@gmail.com';
        }

        const isBootstrapAdmin = loginEmail.toLowerCase() === 'brahemdesign@gmail.com' || 
                                loginEmail.toLowerCase() === 'siwarbraham98@gmail.com' ||
                                loginEmail.toLowerCase() === 'admin@rentx.tn';

        await loginWithEmail(loginEmail, password);
      } else {
        const extraData = {
          fullName,
          email,
          phone,
          cin,
          licenseNumber,
          address,
          cinRecto,
          cinVerso,
          licenseRecto,
          licenseVerso,
          source: 'website'
        };

        const authData = await registerWithEmail(email, password, extraData);
        if (authData && authData.user) {
          await ensureUserProfile({ 
            uid: authData.user.id, 
            email: authData.user.email, 
            displayName: authData.user.fullName 
          }, {
            phone: phone,
            cin: cin,
            licenseNumber: licenseNumber,
            address: address,
            cinRecto: cinRecto,
            cinVerso: cinVerso,
            licenseRecto: licenseRecto,
            licenseVerso: licenseVerso,
            source: 'website'
          });
        }
        setSuccess('Inscription réussie ! Votre compte a été créé avec succès.');
        setTimeout(() => onSuccess(), 2000);
        return;
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
      {success && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/90 backdrop-blur-md animate-in fade-in duration-500">
          <div className="text-center space-y-6 max-w-md px-6 animate-in zoom-in slide-in-from-bottom-8 duration-700">
            <div className="w-24 h-24 bg-emerald-100 rounded-[2.5rem] flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/10">
              <CheckCircle className="w-12 h-12 text-emerald-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-bold text-stone-900 tracking-tight">Inscription Réussie !</h2>
              <p className="text-stone-500 italic serif">Votre compte a été créé avec succès. Bienvenue chez RentX Auto.</p>
            </div>
            <div className="flex items-center justify-center gap-2 text-emerald-600 font-bold text-sm uppercase tracking-widest">
              <div className="w-2 h-2 bg-emerald-600 rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-emerald-600 rounded-full animate-bounce [animation-delay:0.2s]" />
              <div className="w-2 h-2 bg-emerald-600 rounded-full animate-bounce [animation-delay:0.4s]" />
              <span className="ml-2">Redirection...</span>
            </div>
          </div>
        </div>
      )}
      <div className="max-w-5xl w-full bg-white rounded-[3rem] shadow-2xl shadow-stone-200/50 overflow-hidden flex flex-col md:flex-row border border-stone-100">
        
        {/* Left Side: Visual */}
        <div className="md:w-1/2 bg-stone-900 relative p-12 flex flex-col justify-between overflow-hidden">
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-12">
              <Logo variant="light" className="w-32" />
            </div>
            <h2 className="text-4xl font-bold text-white mb-6 leading-tight">
              Rejoignez la <span className="text-emerald-500 italic serif">communauté</span> RentX Auto.
            </h2>
            <p className="text-stone-400 max-w-xs italic serif">
              Créez votre compte pour gérer vos réservations, accéder à des offres exclusives et profiter d'un service personnalisé.
            </p>
          </div>

          <div className="relative z-10 mt-12">
            <div className="flex -space-x-3 mb-4">
              {[1,2,3,4].map(i => (
                <img 
                  key={i}
                  src={`https://picsum.photos/seed/${i+10}/100/100`} 
                  alt="User" 
                  className="w-10 h-10 rounded-full border-2 border-stone-900 object-cover"
                  referrerPolicy="no-referrer"
                />
              ))}
              <div className="w-10 h-10 rounded-full border-2 border-stone-900 bg-emerald-600 flex items-center justify-center text-[10px] font-bold text-white">
                +2k
              </div>
            </div>
            <p className="text-xs text-stone-500 font-medium uppercase tracking-widest">Plus de 2000 clients satisfaits</p>
          </div>

          {/* Abstract background elements */}
          <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-emerald-600/10 rounded-full blur-3xl" />
          <div className="absolute bottom-[-10%] left-[-10%] w-96 h-96 bg-emerald-600/5 rounded-full blur-3xl" />
        </div>

        {/* Right Side: Form */}
        <div className="md:w-1/2 p-12 md:p-16">
          <div className="flex justify-between items-center mb-12">
            <button 
              onClick={onBack}
              className="text-xs font-bold text-stone-400 hover:text-stone-900 uppercase tracking-widest flex items-center gap-2 transition-all"
            >
              <ArrowRight className="w-4 h-4 rotate-180" /> Retour au site
            </button>
            <button 
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
              className="text-xs font-bold text-emerald-600 hover:text-emerald-500 uppercase tracking-widest"
            >
              {mode === 'login' ? "S'inscrire" : "Se connecter"}
            </button>
          </div>

          <h3 className="text-3xl font-bold text-stone-900 mb-2">
            {mode === 'login' ? 'Bon retour !' : 'Créer un compte'}
          </h3>
          <p className="text-stone-500 mb-10 italic serif">
            {mode === 'login' ? 'Connectez-vous pour continuer.' : 'Remplissez les informations ci-dessous.'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-6 max-h-[60vh] overflow-y-auto pr-2 scrollbar-hide">
            {mode === 'register' && (
              <>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Nom et Prénom</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                    <input 
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 bg-stone-50 border-none rounded-2xl focus:ring-2 focus:ring-emerald-500 transition-all text-stone-900 font-medium"
                      placeholder="Jean Dupont"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Adresse Complète</label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                    <input 
                      type="text"
                      required
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 bg-stone-50 border-none rounded-2xl focus:ring-2 focus:ring-emerald-500 transition-all text-stone-900 font-medium"
                      placeholder="Rue, Ville, Code Postal"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Téléphone</label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                      <input 
                        type="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full pl-12 pr-4 py-4 bg-stone-50 border-none rounded-2xl focus:ring-2 focus:ring-emerald-500 transition-all text-stone-900 font-medium"
                        placeholder="+216 -- --- ---"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Numéro CIN / Passeport</label>
                    <div className="relative">
                      <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                      <input 
                        type="text"
                        required
                        value={cin}
                        onChange={(e) => setCin(e.target.value)}
                        className="w-full pl-12 pr-4 py-4 bg-stone-50 border-none rounded-2xl focus:ring-2 focus:ring-emerald-500 transition-all text-stone-900 font-medium"
                        placeholder="00000000"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Numéro de Permis</label>
                  <div className="relative">
                    <FileText className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                    <input 
                      type="text"
                      required
                      value={licenseNumber}
                      onChange={(e) => setLicenseNumber(e.target.value)}
                      className="w-full pl-12 pr-4 py-4 bg-stone-50 border-none rounded-2xl focus:ring-2 focus:ring-emerald-500 transition-all text-stone-900 font-medium"
                      placeholder="00/000000"
                    />
                  </div>
                </div>

                <div className="space-y-4 pt-4 border-t border-stone-100">
                  <h4 className="text-xs font-bold text-stone-900 uppercase tracking-widest">Documents (Photos)</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <ImageUpload 
                      label="CIN / Passeport (Recto)" 
                      value={cinRecto} 
                      onChange={setCinRecto} 
                    />
                    <ImageUpload 
                      label="CIN / Passeport (Verso)" 
                      value={cinVerso} 
                      onChange={setCinVerso} 
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <ImageUpload 
                      label="Permis de Conduire (Recto)" 
                      value={licenseRecto} 
                      onChange={setLicenseRecto} 
                    />
                    <ImageUpload 
                      label="Permis de Conduire (Verso)" 
                      value={licenseVerso} 
                      onChange={setLicenseVerso} 
                    />
                  </div>
                </div>
              </>
            )}

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                <input 
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-stone-50 border-none rounded-2xl focus:ring-2 focus:ring-emerald-500 transition-all text-stone-900 font-medium"
                  placeholder="exemple@email.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Mot de passe</label>
                {mode === 'login' && (
                  <button 
                    type="button"
                    onClick={handleResetPassword}
                    className="text-[10px] font-bold text-emerald-600 hover:text-emerald-500 uppercase tracking-widest"
                  >
                    Mot de passe oublié ?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
                <input 
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-12 py-4 bg-stone-50 border-none rounded-2xl focus:ring-2 focus:ring-emerald-500 transition-all text-stone-900 font-medium"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-3 p-4 bg-red-50 text-red-600 rounded-2xl border border-red-100 text-sm">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {success && (
              <div className="flex items-center gap-3 p-4 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100 text-sm">
                <CheckCircle className="w-5 h-5 shrink-0" />
                <p>{success}</p>
              </div>
            )}

            <button 
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-stone-900 text-white rounded-2xl font-bold hover:bg-stone-800 transition-all shadow-xl shadow-stone-900/20 flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
              {mode === 'login' ? 'Se connecter' : "Créer mon compte"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
