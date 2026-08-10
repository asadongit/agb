"use client";

import { useEffect, useRef } from "react";

interface UseBarcodeScannerOptions {
  onScan: (barcode: string) => void;
  maxKeyIntervalMs?: number;
  minBarcodeLength?: number;
  enabled?: boolean;
}

/**
 * useBarcodeScanner — Listens for hardware USB / Bluetooth keyboard wedge barcode scanners.
 * Hardware scanners rapidly emit individual characters (< 50ms per key) followed by Enter.
 */
export function useBarcodeScanner({
  onScan,
  maxKeyIntervalMs = 50,
  minBarcodeLength = 3,
  enabled = true,
}: UseBarcodeScannerOptions) {
  const bufferRef = useRef<string>("");
  const lastKeyTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // If user is actively typing in a standard text input/textarea that is not a scan field, ignore
      const activeTag = (document.activeElement?.tagName || "").toLowerCase();
      const isInput = activeTag === "input" || activeTag === "textarea" || activeTag === "select";

      const now = Date.now();
      const timeDiff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // If time between keystrokes is too long, reset buffer (user typed manually)
      if (timeDiff > maxKeyIntervalMs && bufferRef.current.length > 0) {
        bufferRef.current = "";
      }

      if (e.key === "Enter") {
        if (bufferRef.current.length >= minBarcodeLength) {
          const scannedCode = bufferRef.current;
          bufferRef.current = "";
          e.preventDefault();
          onScan(scannedCode);
        } else {
          bufferRef.current = "";
        }
        return;
      }

      // Ignore non-printable keys
      if (e.key.length === 1) {
        bufferRef.current += e.key;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, maxKeyIntervalMs, minBarcodeLength, onScan]);
}
