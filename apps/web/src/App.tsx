import React, { useState, useEffect } from 'react';
import { PCScreen } from './screens/PCScreen';
import { IPhoneScreen } from './screens/IPhoneScreen';
import { Laptop, Smartphone } from 'lucide-react';

export function App() {
  const [mode, setMode] = useState<'pc' | 'phone'>('pc');

  // Detect iOS or mobile view, or pairing fragment
  useEffect(() => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const hasPairHash = window.location.hash.startsWith('#pair=');
    if (isMobile || hasPairHash) {
      setMode('phone');
    }
  }, []);

  return (
    <div className="relative min-h-screen">
      {/* Floating Device Mode Switcher for Development / Testing */}
      <aside aria-label="Device view toggle" className="fixed bottom-3 right-3 z-40 bg-surface-elevated/90 backdrop-blur border border-default p-1 rounded-full shadow-lg flex items-center gap-1">
        <button
          onClick={() => setMode('pc')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
            mode === 'pc'
              ? 'bg-accent text-text-inverse'
              : 'text-secondary hover:text-primary'
          }`}
        >
          <Laptop className="w-3.5 h-3.5" />
          <span>PC View</span>
        </button>

        <button
          onClick={() => setMode('phone')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all ${
            mode === 'phone'
              ? 'bg-accent text-text-inverse'
              : 'text-secondary hover:text-primary'
          }`}
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>iPhone View</span>
        </button>
      </aside>

      {mode === 'pc' ? <PCScreen /> : <IPhoneScreen />}
    </div>
  );
}
