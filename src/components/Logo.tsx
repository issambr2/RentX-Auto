import React from 'react';

interface LogoProps {
  className?: string;
  variant?: 'light' | 'dark';
  showText?: boolean;
  isCircular?: boolean;
}

export function Logo({ className = '', variant = 'dark', showText = true, isCircular = false }: LogoProps) {
  const primaryColor = variant === 'dark' ? 'text-blue-600' : 'text-blue-400';
  const accentColor = 'text-blue-700';

  const logoContent = (
    <div className={`flex flex-col items-center justify-center ${isCircular ? 'p-4' : ''}`}>
      {/* Car Silhouette */}
      <svg
        viewBox="0 0 200 50"
        className="w-full h-auto mb-[-5px]"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M10 40C30 35 50 15 100 15C150 15 170 35 190 40"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          className={isCircular ? "text-blue-300" : "text-blue-100"}
        />
        <path
          d="M70 25C90 20 130 20 150 25C170 30 185 45 190 50"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          className="text-blue-600"
        />
      </svg>

      {showText && (
        <div className="flex flex-col items-center">
          <h1 className="text-2xl md:text-3xl font-black tracking-[0.2em] uppercase leading-none">
            <span className={isCircular ? 'text-blue-600' : primaryColor}>Rent</span>
            <span className="text-yellow-400">X</span>
          </h1>
          <div className="flex items-center gap-2 w-full mt-1">
            <div className="h-[1px] flex-1 bg-blue-600/30" />
            <span className={`text-sm md:text-base font-medium italic serif ${accentColor} whitespace-nowrap`}>
              Auto
            </span>
            <div className="h-[1px] flex-1 bg-blue-600/30" />
          </div>
        </div>
      )}
    </div>
  );

  if (isCircular) {
    return (
      <div className={`flex items-center justify-center bg-white rounded-full aspect-square border-4 border-blue-600 shadow-sm print:shadow-none ${className}`}>
        {logoContent}
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      {logoContent}
    </div>
  );
}
