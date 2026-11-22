import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import {
  AlertCircle,
  CameraOff,
  CheckCircle2,
  Flashlight,
  Keyboard,
  Layers,
  Loader2,
  MapPin,
  RefreshCw,
  ScanBarcode,
  SwitchCamera,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { triggerScanFeedback } from '../../utils/feedback';
import { formatIsbn13, normalizeIsbn } from '../../utils/isbn';

export interface BatchScanResult {
  status: 'added' | 'duplicate' | 'error';
  isbn13: string;
  title: string;
  message: string;
}

interface BarcodeScannerProps {
  open: boolean;
  existingLocations: string[];
  onClose: () => void;
  onSwitchToManual: () => void;
  onStandardScan: (isbn13: string) => void;
  onBatchScan: (isbn13: string, defaultLocation?: string) => Promise<BatchScanResult>;
}

type CameraErrorKind = 'permission' | 'not_found' | 'insecure' | 'generic' | null;

export function BarcodeScanner({
  open,
  existingLocations,
  onClose,
  onSwitchToManual,
  onStandardScan,
  onBatchScan,
}: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const isLockedRef = useRef(false);
  const nonIsbnTimerRef = useRef<number | null>(null);
  const batchTimerRef = useRef<number | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [errorKind, setErrorKind] = useState<CameraErrorKind>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(
    undefined
  );

  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const [batchMode, setBatchMode] = useState(false);
  const [batchLocation, setBatchLocation] = useState('');
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchBanner, setBatchBanner] = useState<BatchScanResult | null>(null);
  const [batchCount, setBatchCount] = useState(0);

  const [nonIsbnNotice, setNonIsbnNotice] = useState<string | null>(null);
  const [manualBarcodeInput, setManualBarcodeInput] = useState('');

  const stopCamera = useCallback(() => {
    if (nonIsbnTimerRef.current) {
      window.clearTimeout(nonIsbnTimerRef.current);
      nonIsbnTimerRef.current = null;
    }
    if (batchTimerRef.current) {
      window.clearTimeout(batchTimerRef.current);
      batchTimerRef.current = null;
    }

    try {
      controlsRef.current?.stop();
    } catch {
      // Ignorovat
    }
    controlsRef.current = null;

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        try {
          track.stop();
        } catch {
          // Ignorovat
        }
      }
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraReady(false);
    setTorchSupported(false);
    setTorchOn(false);
  }, []);

  const handleDetectedCode = useCallback(
    async (rawText: string) => {
      const cleaned = rawText.trim();
      if (!cleaned || isLockedRef.current) {
        return;
      }

      const validation = normalizeIsbn(cleaned);
      if (!validation.valid) {
        setNonIsbnNotice(
          `Přečtený kód (${cleaned.slice(0, 16)}) není knižní ISBN (musí začínat 978 nebo 979).`
        );
        if (nonIsbnTimerRef.current) {
          window.clearTimeout(nonIsbnTimerRef.current);
        }
        nonIsbnTimerRef.current = window.setTimeout(() => {
          setNonIsbnNotice(null);
        }, 2600);
        return;
      }

      // Platné ISBN -> aktivovat anti-bounce zámek a přehrát odezvu
      isLockedRef.current = true;
      setNonIsbnNotice(null);
      triggerScanFeedback();

      if (!batchMode) {
        stopCamera();
        onStandardScan(validation.isbn13);
        return;
      }

      // Rychlý dávkový režim (Batch scan)
      setBatchProcessing(true);
      try {
        const result = await onBatchScan(
          validation.isbn13,
          batchLocation.trim() || undefined
        );
        setBatchBanner(result);
        if (result.status === 'added') {
          setBatchCount((prev) => prev + 1);
        }
      } catch (err) {
        setBatchBanner({
          status: 'error',
          isbn13: validation.isbn13,
          title: formatIsbn13(validation.isbn13),
          message:
            err instanceof Error
              ? err.message
              : 'Nepodařilo se uložit naskenovanou knihu.',
        });
      } finally {
        setBatchProcessing(false);
        batchTimerRef.current = window.setTimeout(() => {
          isLockedRef.current = false;
        }, 1500);
      }
    },
    [batchLocation, batchMode, onBatchScan, onStandardScan, stopCamera]
  );

  // Vždy držíme aktuální referenci na handleDetectedCode pro ZXing callback i testovací události
  const detectedHandlerRef = useRef(handleDetectedCode);
  useEffect(() => {
    detectedHandlerRef.current = handleDetectedCode;
  }, [handleDetectedCode]);

  const startCamera = useCallback(
    async (preferredDeviceId?: string) => {
      stopCamera();
      isLockedRef.current = false;
      setErrorKind(null);
      setErrorMessage(null);
      setNonIsbnNotice(null);

      if (
        typeof window !== 'undefined' &&
        (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
      ) {
        setErrorKind('insecure');
        setErrorMessage(
          'Přístup ke kameře vyžaduje zabezpečené připojení (HTTPS nebo localhost) a moderní prohlížeč.'
        );
        return;
      }

      setCameraStarting(true);

      try {
        const videoConstraints: MediaTrackConstraints = preferredDeviceId
          ? {
              deviceId: { exact: preferredDeviceId },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            }
          : {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            };

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: videoConstraints,
        });

        streamRef.current = stream;

        // Zjistit dostupné kamery pro případné přepínání
        try {
          const allDevices = await navigator.mediaDevices.enumerateDevices();
          const cameras = allDevices.filter((d) => d.kind === 'videoinput');
          setVideoDevices(cameras);
        } catch {
          // Ignorovat
        }

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          const settings = videoTrack.getSettings?.();
          if (settings?.deviceId && !preferredDeviceId) {
            setSelectedDeviceId(settings.deviceId);
          }

          // Kontrola schopností kamery (kontinuální autofokus + přisvícení torch)
          const capabilities = videoTrack.getCapabilities?.() as
            | Record<string, unknown>
            | undefined;

          if (capabilities) {
            const focusModes = capabilities.focusMode;
            if (Array.isArray(focusModes) && focusModes.includes('continuous')) {
              try {
                await videoTrack.applyConstraints({
                  advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
                });
              } catch {
                // Ignorovat, pokud prohlížeč constraint odmítne
              }
            }

            if (Boolean(capabilities.torch)) {
              setTorchSupported(true);
            }
          }
        }

        const videoElement = videoRef.current;
        if (!videoElement) {
          stopCamera();
          return;
        }

        videoElement.srcObject = stream;
        await videoElement.play().catch(() => {
          // Autoplay může být vyřešen samotným ZXing readerem
        });

        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 150,
        });

        const controls = await reader.decodeFromStream(
          stream,
          videoElement,
          (result) => {
            if (result) {
              void detectedHandlerRef.current(result.getText());
            }
          }
        );

        controlsRef.current = controls;
        setCameraReady(true);
      } catch (err) {
        stopCamera();
        const domErr = err as { name?: string; message?: string };
        const errName = domErr?.name ?? '';

        if (
          errName === 'NotAllowedError' ||
          errName === 'PermissionDeniedError'
        ) {
          setErrorKind('permission');
          setErrorMessage(
            'Přístup ke kameře byl zamítnut. Povolte prosím kameru v nastavení prohlížeče (ikona zámku nebo kamery v adresním řádku) nebo zadejte ISBN ručně.'
          );
        } else if (
          errName === 'NotFoundError' ||
          errName === 'DevicesNotFoundError' ||
          errName === 'OverconstrainedError'
        ) {
          setErrorKind('not_found');
          setErrorMessage(
            'Na tomto zařízení nebyla nalezena vhodná kamera pro skenování čárových kódů.'
          );
        } else {
          setErrorKind('generic');
          setErrorMessage(
            domErr?.message ||
              'Kameru se nepodařilo spustit. Zkontrolujte prosím, zda ji nepoužívá jiná aplikace.'
          );
        }
      } finally {
        setCameraStarting(false);
      }
    },
    [stopCamera]
  );

  useEffect(() => {
    if (!open) {
      stopCamera();
      return;
    }

    setBatchBanner(null);
    setBatchCount(0);
    void startCamera(selectedDeviceId);

    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Podpora pro simulaci čárového kódu při automatizovaném testování v prohlížeči
  useEffect(() => {
    if (!open) return;

    const handleSimulateEvent = (e: Event) => {
      const custom = e as CustomEvent<string>;
      if (typeof custom.detail === 'string') {
        void detectedHandlerRef.current(custom.detail);
      }
    };

    const win = window as unknown as {
      __simulateBarcodeScan?: (code: string) => void;
    };
    win.__simulateBarcodeScan = (code: string) => {
      void detectedHandlerRef.current(code);
    };

    window.addEventListener('barcode-scan-simulate', handleSimulateEvent);
    return () => {
      delete win.__simulateBarcodeScan;
      window.removeEventListener('barcode-scan-simulate', handleSimulateEvent);
    };
  }, [open]);

  if (!open) return null;

  const handleToggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;

    const nextTorch = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: nextTorch } as MediaTrackConstraintSet],
      });
      setTorchOn(nextTorch);
    } catch {
      // Ignorovat, pokud zařízení svítilnu nepodporuje
    }
  };

  const handleSwitchCamera = () => {
    if (videoDevices.length <= 1) return;
    const currentIndex = videoDevices.findIndex(
      (d) => d.deviceId === selectedDeviceId
    );
    const nextIndex = (currentIndex + 1) % videoDevices.length;
    const nextDeviceId = videoDevices[nextIndex].deviceId;
    setSelectedDeviceId(nextDeviceId);
    void startCamera(nextDeviceId);
  };

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  const handleManualFallback = () => {
    stopCamera();
    onSwitchToManual();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-stone-950 text-white"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scanner-title"
    >
      {/* Horní lišta skeneru */}
      <div className="flex items-center justify-between border-b border-white/10 bg-stone-950/90 px-4 py-3.5 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-700 text-white">
            <ScanBarcode className="h-5 w-5" />
          </div>
          <div>
            <h2 id="scanner-title" className="text-base font-bold leading-tight">
              Skenovat ISBN / EAN-13
            </h2>
            <p className="text-xs text-stone-400">
              {batchMode
                ? `Dávkový režim (${batchCount} přidáno)`
                : 'Namiřte kameru na čárový kód knihy'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {torchSupported && (
            <button
              type="button"
              onClick={() => void handleToggleTorch()}
              aria-label={torchOn ? 'Vypnout svítilnu' : 'Zapnout svítilnu'}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                torchOn
                  ? 'bg-amber-400 text-stone-950 shadow-md shadow-amber-400/20'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              <Flashlight className="h-4 w-4" />
              <span className="hidden sm:inline">
                {torchOn ? 'Svítilna zap.' : 'Přisvítit'}
              </span>
            </button>
          )}

          {videoDevices.length > 1 && (
            <button
              type="button"
              onClick={handleSwitchCamera}
              aria-label="Přepnout kameru"
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
            >
              <SwitchCamera className="h-4 w-4" />
              <span className="hidden sm:inline">Kamera</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleClose}
            aria-label="Zavřít skener"
            className="rounded-xl bg-white/10 p-2 text-stone-200 transition hover:bg-white/20 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Hlavní prostor kamery a vizuální zaměřovač */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`h-full w-full object-cover transition-opacity duration-300 ${
            cameraReady && !errorKind ? 'opacity-100' : 'opacity-20'
          }`}
        />

        {/* Vizuální zaměřovací rámeček (pokud kamera běží) */}
        {!errorKind && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-6">
            <div className="relative aspect-[16/10] w-full max-w-sm rounded-3xl border-2 border-white/40 shadow-[0_0_0_9999px_rgba(12,10,9,0.58)]">
              {/* Zvýrazněné rohy */}
              <div className="absolute -left-0.5 -top-0.5 h-7 w-7 rounded-tl-3xl border-l-4 border-t-4 border-amber-400" />
              <div className="absolute -right-0.5 -top-0.5 h-7 w-7 rounded-tr-3xl border-r-4 border-t-4 border-amber-400" />
              <div className="absolute -bottom-0.5 -left-0.5 h-7 w-7 rounded-bl-3xl border-b-4 border-l-4 border-amber-400" />
              <div className="absolute -bottom-0.5 -right-0.5 h-7 w-7 rounded-br-3xl border-b-4 border-r-4 border-amber-400" />

              {/* Středová zaměřovací linka */}
              <div className="absolute inset-x-4 top-1/2 h-0.5 -translate-y-1/2 bg-amber-400/90 shadow-[0_0_10px_#fbbf24]" />
            </div>

            <p className="mt-4 rounded-full bg-stone-950/75 px-4 py-1.5 text-center text-xs font-medium text-stone-200 backdrop-blur-xs">
              Umístěte čárový kód EAN-13 (978 / 979) vodorovně do rámečku
            </p>
          </div>
        )}

        {/* Indikátor spouštění kamery */}
        {cameraStarting && !errorKind && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-stone-950/70 backdrop-blur-xs">
            <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
            <p className="mt-2.5 text-sm font-medium text-stone-200">
              Spouštím kameru…
            </p>
          </div>
        )}

        {/* Upozornění na ne-ISBN čárový kód */}
        {nonIsbnNotice && (
          <div
            role="status"
            className="absolute top-4 left-1/2 z-20 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-2xl border border-amber-400/40 bg-stone-900/95 px-4 py-2.5 text-center text-xs font-medium text-amber-200 shadow-xl backdrop-blur-md"
          >
            {nonIsbnNotice}
          </div>
        )}

        {/* Banner výsledku v dávkovém režimu */}
        {batchMode && (batchProcessing || batchBanner) && (
          <div
            role="status"
            aria-live="polite"
            className="absolute bottom-4 left-1/2 z-20 w-[calc(100%-2rem)] max-w-md -translate-x-1/2"
          >
            {batchProcessing ? (
              <div className="flex items-center gap-2.5 rounded-2xl border border-white/15 bg-stone-900/95 px-4 py-3 text-sm text-white shadow-xl backdrop-blur-md">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-400" />
                <span>Vyhledávám metadata a ukládám knihu…</span>
              </div>
            ) : batchBanner ? (
              <div
                className={`flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-xs shadow-xl backdrop-blur-md ${
                  batchBanner.status === 'added'
                    ? 'border-emerald-500/40 bg-emerald-950/90 text-emerald-100'
                    : batchBanner.status === 'duplicate'
                      ? 'border-amber-500/40 bg-amber-950/90 text-amber-100'
                      : 'border-red-500/40 bg-red-950/90 text-red-100'
                }`}
              >
                {batchBanner.status === 'added' ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                ) : (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{batchBanner.message}</p>
                  <p className="mt-0.5 font-mono text-[11px] opacity-80">
                    ISBN {formatIsbn13(batchBanner.isbn13)} • připraveno na další knihu
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {/* Chybové stavy kamery */}
        {errorKind && (
          <div className="z-20 mx-4 max-w-md rounded-3xl border border-white/15 bg-stone-900/95 p-6 text-center shadow-2xl backdrop-blur-md">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/15 text-red-400">
              <CameraOff className="h-6 w-6" />
            </div>
            <h3 className="text-base font-bold text-white">
              {errorKind === 'permission'
                ? 'Kamera není povolena'
                : errorKind === 'not_found'
                  ? 'Kamera nebyla nalezena'
                  : errorKind === 'insecure'
                    ? 'Nezabezpečený kontext'
                    : 'Chyba při spouštění kamery'}
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-stone-300">
              {errorMessage}
            </p>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => void startCamera(selectedDeviceId)}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-white/20"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Zkusit znovu</span>
              </button>
              <button
                type="button"
                onClick={handleManualFallback}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-700 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-amber-600"
              >
                <Keyboard className="h-3.5 w-3.5" />
                <span>Zadat ISBN ručně</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Spodní ovládací panel: přepínač Dávkového režimu a ruční zadání */}
      <div className="border-t border-white/10 bg-stone-950 px-4 py-4">
        <div className="mx-auto max-w-md space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-stone-900/90 px-3.5 py-2.5">
            <div className="flex items-center gap-2.5">
              <Layers className="h-4 w-4 text-amber-400" />
              <div>
                <label
                  htmlFor="batch-mode-toggle"
                  className="block text-xs font-semibold text-white cursor-pointer"
                >
                  Rychlý dávkový režim (Batch scan)
                </label>
                <p className="text-[11px] text-stone-400">
                  Automaticky ukládá knihy na pozadí bez zavírání skeneru
                </p>
              </div>
            </div>

            <input
              id="batch-mode-toggle"
              type="checkbox"
              checked={batchMode}
              onChange={(e) => {
                setBatchMode(e.target.checked);
                setBatchBanner(null);
                isLockedRef.current = false;
              }}
              className="h-5 w-5 rounded accent-amber-600 cursor-pointer"
            />
          </div>

          {batchMode && (
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                list="scanner-locations"
                value={batchLocation}
                onChange={(e) => setBatchLocation(e.target.value)}
                placeholder="Výchozí umístění pro dávku (např. Obývák - horní police)"
                aria-label="Výchozí umístění pro dávkový režim"
                className="w-full rounded-xl border border-white/15 bg-stone-900 py-2 pl-9 pr-3 text-xs text-white placeholder:text-stone-500 focus:border-amber-500 focus:outline-none"
              />
              <datalist id="scanner-locations">
                {existingLocations.map((loc) => (
                  <option key={loc} value={loc} />
                ))}
              </datalist>
            </div>
          )}

          {/* Vstup pro hardwarovou USB/Bluetooth čtečku nebo simulaci čárového kódu */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={manualBarcodeInput}
              onChange={(e) => setManualBarcodeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && manualBarcodeInput.trim()) {
                  e.preventDefault();
                  const code = manualBarcodeInput.trim();
                  setManualBarcodeInput('');
                  void handleDetectedCode(code);
                }
              }}
              placeholder="Externí čtečka / simulace kódu (EAN-13)…"
              aria-label="Testovací čárový kód"
              className="flex-1 rounded-xl border border-white/15 bg-stone-900 px-3 py-2 font-mono text-xs text-white placeholder:font-sans placeholder:text-stone-500 focus:border-amber-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                if (!manualBarcodeInput.trim()) return;
                const code = manualBarcodeInput.trim();
                setManualBarcodeInput('');
                void handleDetectedCode(code);
              }}
              className="shrink-0 rounded-xl border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/25"
            >
              Načíst kód
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={handleManualFallback}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-stone-900 px-3.5 py-2.5 text-xs font-semibold text-stone-200 transition hover:bg-stone-800"
            >
              <Keyboard className="h-4 w-4" />
              <span>Zadat ISBN ručně</span>
            </button>

            <button
              type="button"
              onClick={handleClose}
              className="inline-flex items-center justify-center rounded-xl bg-white/10 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-white/20"
            >
              Hotovo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
