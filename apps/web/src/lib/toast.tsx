import React, { createContext, useContext, useState, useCallback } from 'react';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ToastContextType {
  toasts: Toast[];
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    const duration = type === 'error' ? 8000 : 4000;
    setTimeout(() => {
      removeToast(id);
    }, duration);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast }}>
      {children}
      <div 
        aria-live="polite" 
        className="fixed bottom-4 left-1/2 -translate-x-1/2 md:bottom-auto md:top-4 md:right-4 md:left-auto md:translate-x-0 z-50 flex flex-col gap-2 pointer-events-none w-[90%] max-w-sm"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.type === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto p-3 rounded-md text-sm border shadow-md flex items-center justify-between transition-all duration-normal ${
              t.type === 'error'
                ? 'bg-danger-subtle text-danger border-danger/30'
                : t.type === 'success'
                ? 'bg-success-subtle text-success border-success/30'
                : 'bg-surface-elevated text-primary border-default'
            }`}
          >
            <span>{t.message}</span>
            <button
              onClick={() => removeToast(t.id)}
              className="ml-3 text-secondary hover:text-primary p-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded"
              aria-label="Close notification"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
