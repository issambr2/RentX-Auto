import React, { useRef, useState } from 'react';
import { Camera, Upload, X, Check } from 'lucide-react';
import { compressImage } from '../utils/imageCompression';

interface ImageUploadProps {
  label: string;
  value?: string;
  onChange: (base64: string) => void;
}

export function ImageUpload({ label, value, onChange }: ImageUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsProcessing(true);
      try {
        const compressed = await compressImage(file, 800, 800, 0.6);
        onChange(compressed);
      } catch (err) {
        console.error("Error compressing image:", err);
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const startCamera = async () => {
    setIsCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      setIsCameraActive(false);
    }
  };

  const capturePhoto = async () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      if (context) {
        setIsProcessing(true);
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        context.drawImage(videoRef.current, 0, 0);
        const dataUrl = canvasRef.current.toDataURL('image/jpeg');
        
        try {
          const compressed = await compressImage(dataUrl, 800, 800, 0.6);
          onChange(compressed);
        } catch (err) {
          console.error("Error compressing captured photo:", err);
          onChange(dataUrl); // Fallback to original if compression fails
        } finally {
          setIsProcessing(false);
          stopCamera();
        }
      }
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
    setIsCameraActive(false);
  };

  return (
    <div className="space-y-2">
      <label className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">{label}</label>
      <div className="relative group">
        {value ? (
          <div className="relative aspect-video rounded-xl overflow-hidden border border-stone-200 bg-stone-100">
            <img src={value} alt={label} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            {isProcessing && (
              <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
              </div>
            )}
            <button 
              type="button"
              disabled={isProcessing}
              onClick={() => onChange('')}
              className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600 transition-all disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="absolute bottom-2 left-2 bg-emerald-500 text-white p-1 rounded-full shadow-lg">
              <Check className="w-3 h-3" />
            </div>
          </div>
        ) : (
          <div className="relative aspect-video rounded-xl border-2 border-dashed border-stone-200 bg-stone-50 flex flex-col items-center justify-center gap-3 transition-all hover:bg-stone-100 hover:border-emerald-300">
            {isProcessing && (
              <div className="absolute inset-0 bg-stone-50/80 backdrop-blur-[2px] flex flex-col items-center justify-center z-10 rounded-[inherit]">
                <div className="w-8 h-8 border-4 border-emerald-100 border-t-emerald-600 rounded-full animate-spin mb-2" />
                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Traitement...</span>
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => fileInputRef.current?.click()}
                className="p-3 bg-white rounded-2xl shadow-sm text-stone-600 hover:text-emerald-600 transition-all disabled:opacity-50"
              >
                <Upload className="w-5 h-5" />
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={startCamera}
                className="p-3 bg-white rounded-2xl shadow-sm text-stone-600 hover:text-emerald-600 transition-all disabled:opacity-50"
              >
                <Camera className="w-5 h-5" />
              </button>
            </div>
            <span className="text-[10px] text-stone-400 font-medium uppercase tracking-tighter">Ajouter ou Capturer</span>
          </div>
        )}
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept="image/*" 
          onChange={handleFileChange} 
        />
      </div>

      {isCameraActive && (
        <div className="fixed inset-0 z-[60] bg-black flex flex-col items-center justify-center p-4">
          <video ref={videoRef} autoPlay playsInline className="w-full max-w-lg rounded-3xl shadow-2xl" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="flex gap-6 mt-8">
            <button
              type="button"
              onClick={stopCamera}
              className="w-16 h-16 bg-white/10 text-white rounded-full flex items-center justify-center backdrop-blur-md hover:bg-white/20 transition-all"
            >
              <X className="w-8 h-8" />
            </button>
            <button
              type="button"
              onClick={capturePhoto}
              className="w-20 h-20 bg-white text-stone-900 rounded-full flex items-center justify-center shadow-2xl hover:scale-110 transition-all"
            >
              <Camera className="w-10 h-10" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
