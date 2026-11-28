"use client";

import { useEffect, useId, useRef, useState } from "react";

type BarcodeScannerModalProps = {
  open: boolean;
  title?: string;
  continuous?: boolean;
  onScan: (code: string) => string | void;
  onClose: () => void;
};

function playScanBeep() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const context = new AudioCtx();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(1180, context.currentTime);
    gain.gain.setValueAtTime(0.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.12);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.12);
    window.setTimeout(() => void context.close().catch(() => undefined), 200);
  } catch {
    // تجاهل أخطاء الصوت في حال عدم توفر دعم المتصفح
  }
}

function cameraErrorMessage(err: unknown) {
  const message = err instanceof Error ? err.message : String(err ?? "");
  if (
    message.includes("NotAllowedError") ||
    message.includes("Permission") ||
    message.includes("denied")
  ) {
    return "تم رفض إذن الكاميرا. اسمح للمتصفح بالوصول إلى الكاميرا ثم حاول مرة أخرى.";
  }
  if (
    message.includes("NotFoundError") ||
    message.includes("Requested device not found")
  ) {
    return "لم يتم العثور على كاميرا متصلة بهذا الجهاز.";
  }
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "تشغيل الكاميرا يتطلب فتح الموقع عبر HTTPS.";
  }
  return "تعذر تشغيل الكاميرا. تأكد من عدم استخدامها في تطبيق آخر ثم أعد المحاولة.";
}

export default function BarcodeScannerModal({
  open,
  title = "مسح الباركود بالكاميرا",
  continuous = false,
  onScan,
  onClose,
}: BarcodeScannerModalProps) {
  const rawId = useId();
  const readerId = `barcode-reader-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);
  const scannerRef = useRef<{
    stop: () => Promise<void>;
    clear: () => void;
    getRunningTrackCapabilities?: () => Record<string, unknown>;
    applyVideoConstraints?: (constraints: Record<string, unknown>) => Promise<void>;
  } | null>(null);

  const [error, setError] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [starting, setStarting] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setError("");
    setStatusNote("");
    setTorchSupported(false);
    setTorchOn(false);
    setStarting(true);
    lastScanRef.current = null;

    const startScanner = async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import(
          "html5-qrcode"
        );
        if (cancelled) return;

        const scanner = new Html5Qrcode(readerId, {
          verbose: false,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.QR_CODE,
          ],
        });
        scannerRef.current = scanner as unknown as typeof scannerRef.current;

        const config = {
          fps: 12,
          qrbox: { width: 260, height: 150 },
          aspectRatio: 1.5,
        };

        const handleDecoded = (decodedText: string) => {
          const code = decodedText.trim();
          if (!code || cancelled) return;
          const now = Date.now();
          if (
            lastScanRef.current &&
            lastScanRef.current.code === code &&
            now - lastScanRef.current.at < 1500
          ) {
            return;
          }
          lastScanRef.current = { code, at: now };
          playScanBeep();
          const feedback = onScanRef.current(code);
          if (typeof feedback === "string" && feedback) {
            setStatusNote(feedback);
          } else {
            setStatusNote(`تمت قراءة الباركود: ${code}`);
          }
          if (!continuous) {
            onCloseRef.current();
          }
        };

        try {
          await scanner.start(
            { facingMode: "environment" },
            config,
            handleDecoded,
            () => undefined,
          );
        } catch {
          const cameras = await Html5Qrcode.getCameras();
          if (!cameras.length) {
            throw new Error("NotFoundError");
          }
          await scanner.start(
            cameras[0].id,
            config,
            handleDecoded,
            () => undefined,
          );
        }

        if (cancelled) {
          await scanner.stop().catch(() => undefined);
          scanner.clear();
          return;
        }

        setStarting(false);
        try {
          const capabilities = scanner.getRunningTrackCapabilities() as
            | { torch?: boolean }
            | undefined;
          if (capabilities?.torch) {
            setTorchSupported(true);
          }
        } catch {
          // بعض المتصفحات لا تدعم قراءة إمكانيات الفلاش
        }
      } catch (err) {
        if (!cancelled) {
          setStarting(false);
          setError(cameraErrorMessage(err));
        }
      }
    };

    void startScanner();

    return () => {
      cancelled = true;
      const instance = scannerRef.current;
      scannerRef.current = null;
      if (instance) {
        void instance
          .stop()
          .catch(() => undefined)
          .finally(() => {
            try {
              instance.clear();
            } catch {
              // ignore cleanup errors
            }
          });
      }
    };
  }, [continuous, open, readerId]);

  async function toggleTorch() {
    const instance = scannerRef.current;
    if (!instance?.applyVideoConstraints) return;
    const next = !torchOn;
    try {
      await instance.applyVideoConstraints({
        advanced: [{ torch: next }],
      });
      setTorchOn(next);
    } catch {
      // ignore if device rejects torch constraint
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h4 className="text-base font-bold text-slate-900">{title}</h4>
            <p className="text-xs text-slate-600">
              {continuous
                ? "وجّه الكاميرا على الباركود لإضافة الأصناف تباعًا، ثم أغلق النافذة."
                : "وجّه الكاميرا نحو الباركود ليُقرأ تلقائيًا."}
            </p>
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
          >
            إغلاق
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
          <div id={readerId} className="min-h-[240px] w-full" />
        </div>

        {starting && !error && (
          <p className="mt-2 text-center text-xs font-medium text-slate-600">
            جارٍ تشغيل الكاميرا...
          </p>
        )}

        {statusNote && (
          <p
            className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900"
            role="status"
          >
            {statusNote}
          </p>
        )}

        {error && (
          <p className="form-error mt-2" role="alert">
            {error}
          </p>
        )}

        <div className="mt-3 flex items-center justify-between gap-2">
          {torchSupported ? (
            <button
              type="button"
              className="secondary-button"
              onClick={() => void toggleTorch()}
            >
              {torchOn ? "إطفاء الكشاف" : "تشغيل الكشاف"}
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="primary-button"
            onClick={onClose}
          >
            {continuous ? "تم / إنهاء المسح" : "إلغاء"}
          </button>
        </div>
      </div>
    </div>
  );
}
