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
  maxKeyIntervalMs = 150, // Increased from 50 to 150ms to handle slower scanners / USB polling issues
  minBarcodeLength = 3,
  enabled = true,
}: UseBarcodeScannerOptions) {
  const bufferRef = useRef<string>("");
  const lastKeyTimeRef = useRef<number>(0);
  const initialInputValueRef = useRef<string>("");

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const now = Date.now();
      const timeDiff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // Determine if we are starting a new scan or continuing an existing fast scan
      if (timeDiff > maxKeyIntervalMs) {
        bufferRef.current = "";
        
        // Record the value of the active input BEFORE the scan starts
        if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) {
          initialInputValueRef.current = document.activeElement.value;
        } else {
          initialInputValueRef.current = "";
        }
      } else {
        // This is a rapid keystroke, meaning it's highly likely part of a barcode scan.
        // Prevent it from typing into any active inputs to keep the form clean!
        if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) {
          e.preventDefault();
          e.stopPropagation();
        }
      }

      if (e.key === "Enter") {
        if (bufferRef.current.length >= minBarcodeLength) {
          const scannedCode = bufferRef.current;
          bufferRef.current = "";
          e.preventDefault();
          e.stopPropagation();
          
          // Only 1 character (the very first keystroke of the scan) slipped through to the input,
          // because it had a timeDiff > 150ms. We restore the input to its exact state from before the scan.
          if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) {
            const el = document.activeElement as HTMLInputElement | HTMLTextAreaElement;
            const newValue = initialInputValueRef.current;
            
            const prototype = Object.getPrototypeOf(el);
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
            
            if (nativeInputValueSetter) {
              nativeInputValueSetter.call(el, newValue);
              el.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
              el.value = newValue;
              el.dispatchEvent(new Event('input', { bubbles: true }));
            }
            
            // Blur to stop any weird UI focus issues after scanning
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

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [enabled, maxKeyIntervalMs, minBarcodeLength, onScan]);
}
