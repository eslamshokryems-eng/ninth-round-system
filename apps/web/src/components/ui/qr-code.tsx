"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export interface QrCodeImageProps {
  value: string;
  size?: number;
}

/** Renders a member's QR identity client-side — no server round trip, no QR image stored anywhere (see supabase/migrations/20260806000008's comment on members.qr_code). */
export function QrCodeImage({ value, size = 180 }: QrCodeImageProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(value, { width: size, margin: 1, color: { dark: "#0B0B0C", light: "#FFFFFF" } }).then(
      (url) => {
        if (!cancelled) setDataUrl(url);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!dataUrl) {
    return <div style={{ width: size, height: size }} className="animate-pulse rounded-lg bg-white/10" />;
  }

  // Plain <img>, not next/image: a data: URI can't go through next/image's remote-optimization pipeline.
  return <img src={dataUrl} alt="Member QR code" width={size} height={size} className="rounded-lg" />;
}
