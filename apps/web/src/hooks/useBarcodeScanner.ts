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
          
          // If the user was focused on an input, the rapid keystrokes were typed into it.
          // We must safely remove the barcode text from the input and trigger a React update.
          if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) {
            const el = document.activeElement as HTMLInputElement | HTMLTextAreaElement;
            if (el.value && el.value.endsWith(scannedCode)) {
              const newValue = el.value.slice(0, -scannedCode.length);
              
              // Standard React hack to trigger onChange programmatically
              const prototype = Object.getPrototypeOf(el);
              const nativeInputValueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
              
              if (nativeInputValueSetter) {
                nativeInputValueSetter.call(el, newValue);
                el.dispatchEvent(new Event('input', { bubbles: true }));
              } else {
                // Fallback for non-react or different architectures
                el.value = newValue;
                el.dispatchEvent(new Event('input', { bubbles: true }));
              }
            }
            // Blur the input to prevent accidental re-triggering and ensure the user sees the scan result
            el.blur();
          }

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
