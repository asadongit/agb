/**
 * PinSwitchModal — Shared tablet PIN quick-switch lock-screen modal.
 *
 * Extracted from admin page.tsx (lines 6281-6361).
 */

"use client";

import { FormEvent } from "react";
import { Lock, X } from "lucide-react";
import type { StaffMember } from "@/types";

type PinSwitchModalProps = {
  isOpen: boolean;
  onClose: () => void;
  staffList: StaffMember[];
  pinSwitchStaffId: string;
  setPinSwitchStaffId: (id: string) => void;
  pinSwitchInput: string;
  setPinSwitchInput: (pin: string) => void;
  isSwitchingPin: boolean;
  onSubmitPinQuickSwitch: (e: FormEvent<HTMLFormElement>) => void;
};

export function PinSwitchModal({
  isOpen,
  onClose,
  staffList,
  pinSwitchStaffId,
  setPinSwitchStaffId,
  pinSwitchInput,
  setPinSwitchInput,
  isSwitchingPin,
  onSubmitPinQuickSwitch,
}: PinSwitchModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md">
      <div className="w-full max-w-md space-y-6 rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-[var(--accent-brand)]" />
            <h3 className="font-display text-lg font-bold">Shared Tablet PIN Switch</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-[var(--bg-surface-elevated)] text-[var(--text-muted)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={onSubmitPinQuickSwitch} className="space-y-5">
          <div className="space-y-2">
            <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-bold">Select Active Staff Member</span>
            <div className="grid gap-2 grid-cols-2 max-h-48 overflow-y-auto p-1">
              {staffList.map((member) => {
                const isSelected = pinSwitchStaffId === member.id;
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => setPinSwitchStaffId(member.id)}
                    className={`flex items-center gap-2.5 rounded-2xl border p-3 text-left transition ${isSelected
                      ? "border-[var(--accent-brand)] bg-[var(--accent-brand)]/15 ring-2 ring-[var(--accent-brand)]"
                      : "border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] hover:border-[var(--border-strong)]"
                      }`}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--accent-brand)]/20 text-[var(--accent-brand)] font-bold text-xs">
                      {member.name[0].toUpperCase()}
                    </div>
                    <div className="truncate">
                      <p className="font-bold text-xs truncate text-[var(--text-primary)]">{member.name}</p>
                      <p className="text-[10px] text-[var(--text-muted)] uppercase font-mono">{member.role.replace("_", " ")}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block space-y-1 text-center">
            <span className="text-xs uppercase tracking-wide text-[var(--text-muted)] font-bold">Enter 4-Digit Staff PIN</span>
            <input
              type="password"
              maxLength={6}
              pattern="[0-9]*"
              value={pinSwitchInput}
              onChange={(e) => setPinSwitchInput(e.target.value)}
              required
              placeholder="••••"
              autoFocus
              className="w-full max-w-xs mx-auto block rounded-2xl border-2 border-[var(--accent-brand)] bg-[var(--bg-surface-elevated)] p-3 text-center font-mono text-2xl font-black tracking-widest text-[var(--text-primary)]"
            />
          </label>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-[var(--border-strong)] px-4 py-3 text-xs font-bold text-[var(--text-secondary)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSwitchingPin || !pinSwitchInput || !pinSwitchStaffId}
              className="flex-1 rounded-xl bg-[var(--accent-brand)] px-4 py-3 text-xs font-bold text-[var(--text-on-accent)] shadow-md hover:bg-[var(--accent-brand-hover)] transition disabled:opacity-50"
            >
              {isSwitchingPin ? "Authenticating..." : "Unlock Active Context"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
