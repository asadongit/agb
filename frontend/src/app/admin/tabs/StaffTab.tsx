/**
 * StaffTab — Staff & team management tab for the admin dashboard.
 *
 * Displays staff roster table, stat cards, action audit trail,
 * and triggers for create/edit/PIN modals.
 * Extracted from admin page.tsx (lines 3414-3674).
 */

"use client";

import { FormEvent } from "react";
import {
  Activity,
  CheckCircle2,
  KeyRound,
  Pencil,
  RefreshCw,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import type { StaffAuditEntry, StaffMember, StaffRole } from "@/types";
import type { RestaurantProfile } from "../adminTypes";

type StaffFormState = {
  outlet_id: string;
  name: string;
  email: string;
  phone: string;
  role: StaffRole;
  password: string;
  pin: string;
};

type StaffTabProps = {
  restaurant: RestaurantProfile | null;
  staffList: StaffMember[];
  staffAuditLogs: StaffAuditEntry[];
  isLoadingStaff: boolean;

  // Actions
  loadStaffMembers: () => Promise<void>;
  loadStaffAuditLogs: () => Promise<void>;
  onDeactivateStaffMember: (id: string, name: string) => Promise<void>;

  // Modal triggers
  onOpenCreateStaff: () => void;
  onOpenEditStaff: (member: StaffMember) => void;
  onOpenPinSetup: (member: StaffMember) => void;
  onOpenPinSwitch: () => void;
};

export function StaffTab({
  restaurant,
  staffList,
  staffAuditLogs,
  isLoadingStaff,
  loadStaffMembers,
  loadStaffAuditLogs,
  onDeactivateStaffMember,
  onOpenCreateStaff,
  onOpenEditStaff,
  onOpenPinSetup,
  onOpenPinSwitch,
}: StaffTabProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Staff &amp; Team Management</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Outlet roles, permissions, staff accounts, PIN setup, and action audit trail
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onOpenPinSwitch}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--accent-brand)]/30 bg-[var(--accent-brand)]/10 px-3.5 py-2 text-xs font-bold text-[var(--accent-brand)] hover:bg-[var(--accent-brand)]/20 transition"
          >
            <KeyRound className="h-4 w-4" />
            <span>PIN Quick-Switch</span>
          </button>
          <button
            type="button"
            onClick={onOpenCreateStaff}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent-brand)] px-4 py-2 text-xs font-bold text-[var(--text-on-accent)] hover:bg-[var(--accent-brand-hover)] shadow-xs transition"
          >
            <UserPlus className="h-4 w-4" />
            <span>+ Add Staff Member</span>
          </button>
        </div>
      </div>

      {/* Staff Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-1 shadow-xs">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Total Staff</p>
          <p className="text-2xl font-black text-[var(--text-primary)]">{staffList.length}</p>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-1 shadow-xs">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Active Staff</p>
          <p className="text-2xl font-black text-[var(--text-primary)]">
            {staffList.filter((s) => s.status === "active").length}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-1 shadow-xs">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">PIN Provisioned</p>
          <p className="text-2xl font-black text-[var(--text-primary)]">
            {staffList.filter((s) => s.has_pin).length}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 space-y-1 shadow-xs">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Audit Log Entries</p>
          <p className="text-2xl font-black text-[var(--text-primary)]">{staffAuditLogs.length}</p>
        </div>
      </div>

      {/* Staff Master Table */}
      <article className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden shadow-xs space-y-3">
        <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-[var(--accent-brand)]" />
            <h2 className="font-display text-lg font-bold">Outlet Team Roster</h2>
          </div>
          <button
            type="button"
            onClick={() => void loadStaffMembers()}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-elevated)] text-[var(--text-muted)]"
            title="Refresh Roster"
          >
            <RefreshCw className={`h-4 w-4 ${isLoadingStaff ? "animate-spin text-[var(--accent-brand)]" : ""}`} />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                <th className="p-3.5">Staff Member</th>
                <th className="p-3.5">Contact</th>
                <th className="p-3.5">Assigned Role</th>
                <th className="p-3.5 text-center">PIN Status</th>
                <th className="p-3.5 text-center">Account Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-xs">
              {staffList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-[var(--text-muted)]">
                    No staff members found for this outlet. Click <strong>+ Add Staff Member</strong> to provision accounts.
                  </td>
                </tr>
              ) : (
                staffList.map((member) => (
                  <tr key={member.id} className="hover:bg-[var(--bg-surface-elevated)]/50 transition">
                    <td className="p-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-brand)]/15 text-[var(--accent-brand)] font-bold text-sm">
                          {member.name[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-[var(--text-primary)]">{member.name}</p>
                          <p className="text-[11px] text-[var(--text-muted)]">ID: {member.id.slice(0, 8)}</p>
                        </div>
                      </div>
                    </td>

                    <td className="p-3.5 space-y-0.5">
                      <p className="font-mono text-[11px] text-[var(--text-primary)]">{member.email}</p>
                      {member.phone && <p className="font-mono text-[10px] text-[var(--text-muted)]">{member.phone}</p>}
                    </td>

                    <td className="p-3.5">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${member.role === "OUTLET_ADMIN" || member.role === "SUPERADMIN"
                        ? "bg-purple-100 text-purple-800"
                        : member.role === "MANAGER"
                          ? "bg-indigo-100 text-indigo-800"
                          : member.role === "FLOOR_STAFF"
                            ? "bg-amber-100 text-amber-800"
                            : member.role === "CASHIER"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-sky-100 text-sky-800"
                        }`}>
                        {member.role.replace("_", " ")}
                      </span>
                    </td>

                    <td className="p-3.5 text-center">
                      {member.has_pin ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-600">
                          <CheckCircle2 className="h-3 w-3" />
                          PIN Set
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-600">
                          No PIN
                        </span>
                      )}
                    </td>

                    <td className="p-3.5 text-center">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${member.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                        }`}>
                        {member.status}
                      </span>
                    </td>

                    <td className="p-3.5 text-right space-x-1">
                      <button
                        type="button"
                        onClick={() => onOpenPinSetup(member)}
                        className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-elevated)] text-[var(--accent-brand)]"
                        title="Set 4-Digit PIN"
                      >
                        <KeyRound className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenEditStaff(member)}
                        className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-elevated)] text-[var(--accent-brand)]"
                        title="Edit Details"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDeactivateStaffMember(member.id, member.name)}
                        className="p-1.5 rounded-lg hover:bg-rose-100 text-rose-600"
                        title="Deactivate Account"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>

      {/* Staff Audit Trail */}
      <article className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden shadow-xs space-y-3">
        <div className="p-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-[var(--accent-brand)]" />
            <h2 className="font-display text-lg font-bold">Staff Action Audit Trail</h2>
          </div>
          <button
            type="button"
            onClick={() => void loadStaffAuditLogs()}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-surface-elevated)] text-[var(--text-muted)]"
            title="Refresh Audit Logs"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                <th className="p-3.5">Timestamp</th>
                <th className="p-3.5">Staff Member</th>
                <th className="p-3.5">Action Type</th>
                <th className="p-3.5">Reference</th>
                <th className="p-3.5">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-xs">
              {staffAuditLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-[var(--text-muted)]">
                    No staff action audit records logged yet.
                  </td>
                </tr>
              ) : (
                staffAuditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-[var(--bg-surface-elevated)]/50 transition">
                    <td className="p-3.5 text-[var(--text-secondary)] font-mono text-[11px]">
                      {new Date(log.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="p-3.5 font-bold text-[var(--text-primary)]">{log.staff_name || "System / Admin"}</td>
                    <td className="p-3.5">
                      <span className="inline-block rounded-full bg-[var(--accent-brand)]/10 px-2.5 py-0.5 text-[10px] font-bold text-[var(--accent-brand)] uppercase">
                        {log.action_type.replace("_", " ")}
                      </span>
                    </td>
                    <td className="p-3.5 font-mono text-[11px] text-[var(--text-muted)]">
                      {log.reference_type ? `${log.reference_type} #${log.reference_id?.slice(0, 8)}` : "—"}
                    </td>
                    <td className="p-3.5 text-[var(--text-secondary)]">{log.details || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  );
}
