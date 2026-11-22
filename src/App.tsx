import { useCallback, useEffect, useState } from 'react';
import { LibraryPage } from './pages/LibraryPage';

export function App() {
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <>
      <LibraryPage onNotify={showToast} />

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-24 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl bg-stone-900 px-4 py-3 text-center text-sm font-medium text-white shadow-xl sm:bottom-6"
        >
          {toast}
        </div>
      )}
    </>
  );
}

export default App;
