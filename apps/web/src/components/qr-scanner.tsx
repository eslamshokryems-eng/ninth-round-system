"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

export interface QrScannerProps {
  /** Called once per successful decode. The scanner pauses itself after firing — call `resume()` (via the returned ref, see ScanPage) or remount to scan again. */
  onDecode: (text: string) => void;
  /** Paused while a check-in is being processed, so the same code isn't fired twice while waiting on the network. */
  isPaused: boolean;
}

// Minimal shape of the native Barcode Detection API this component uses —
// not yet in TypeScript's own DOM lib types as of this project's TS
// version. Feature-detected at runtime (`"BarcodeDetector" in window`);
// this interface only exists so the feature-detected branch type-checks.
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
interface BarcodeDetectorConstructor {
  new (options: { formats: string[] }): BarcodeDetectorLike;
}

/**
 * Camera-based QR scanner for Scan Check-In. Prefers the native Barcode
 * Detection API (zero extra work per frame, hardware-accelerated where the
 * browser supports it — Chrome/Edge/Android WebView, Safari 17+) and falls
 * back to `jsqr` (pure JS, works everywhere `getUserMedia` does,
 * including older iOS Safari where BarcodeDetector isn't available) so
 * this works across the iPhone/Android split without picking one over the
 * other.
 */
export function QrScanner({ onDecode, isPaused }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  const onDecodeRef = useRef(onDecode);
  onDecodeRef.current = onDecode;
  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  const scanFrame = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      frameRef.current = requestAnimationFrame(() => void scanFrame());
      return;
    }

    if (!isPausedRef.current) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const BarcodeDetectorCtor = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor })
          .BarcodeDetector;
        if (BarcodeDetectorCtor) {
          try {
            const detector = new BarcodeDetectorCtor({ formats: ["qr_code"] });
            const barcodes = await detector.detect(canvas);
            if (barcodes[0]?.rawValue) {
              onDecodeRef.current(barcodes[0].rawValue);
            }
          } catch {
            // Fall through to jsQR below for this frame if the native API errors transiently.
          }
        } else {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const decoded = jsQR(imageData.data, imageData.width, imageData.height);
          if (decoded?.data) {
            onDecodeRef.current(decoded.data);
          }
        }
      }
    }

    frameRef.current = requestAnimationFrame(() => void scanFrame());
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setIsReady(true);
        frameRef.current = requestAnimationFrame(() => void scanFrame());
      } catch {
        if (!cancelled) {
          setCameraError("Could not access the camera. You can still type the code below.");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [scanFrame]);

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-card border border-white/10 bg-black">
        <video ref={videoRef} className="aspect-square w-full object-cover" playsInline muted />
        <canvas ref={canvasRef} className="hidden" />
        {!isReady && !cameraError ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-muted">Starting camera…</p>
          </div>
        ) : null}
        {isReady ? (
          <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-gold/70" aria-hidden="true" />
        ) : null}
      </div>
      {cameraError ? <p className="text-sm text-red-400">{cameraError}</p> : null}
    </div>
  );
}
