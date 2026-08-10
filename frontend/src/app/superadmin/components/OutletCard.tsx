import {
  ChevronDown,
  ChevronUp,
  Copy,
  CreditCard,
  Crown,
  Settings2,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import type { StaffMember } from "@/types";
import type { RestaurantWithUsers } from "../superadminTypes";

type OutletCardProps = {
  outlet: RestaurantWithUsers;
  isExpanded: boolean;
  copiedId: string | null;
  staffList: StaffMember[];
  onToggleExpand: () => void;
  onCopyId: (id: string) => void;
  onOpenSettings: (outlet: RestaurantWithUsers) => void;
  onAddUser: (restaurantId: string) => void;
  onDeleteRestaurant: (restaurantId: string, name: string) => void;
  onDeleteUser: (userId: string, email: string) => void;
  formatDateTime: (val: string) => string;
};

export function OutletCard({
  outlet: r,
  isExpanded,
  copiedId,
  staffList,
  onToggleExpand,
  onCopyId,
  onOpenSettings,
  onAddUser,
  onDeleteRestaurant,
  onDeleteUser,
  formatDateTime,
}: OutletCardProps) {
  const admins = r.users.filter((u) => u.role === "OUTLET_ADMIN");
  const staffUsers = r.users.filter((u) => u.role === "STAFF");

  return (
    <article className="rounded-3xl border border-[var(--border-strong)] bg-[var(--bg-surface)] p-5 shadow-xs transition-all hover:border-[var(--accent-brand)]">
      {/* Outlet Header */}
      <div className="flex flex-col gap-3 border-b border-[var(--border-subtle)] pb-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display text-lg font-bold text-[var(--text-primary)] sm:text-xl">
              {r.name}
            </h3>
            <span className="rounded-full bg-[var(--bg-surface-elevated)] border border-[var(--border-strong)] px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--accent-brand)] sm:text-xs">
              /{r.slug}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold sm:px-2.5 sm:text-xs ${
                r.payment_mode === "RAZORPAY_GATEWAY"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              <CreditCard className="h-3 w-3" />
              {r.payment_mode === "RAZORPAY_GATEWAY" ? "Razorpay" : "Counter"}
            </span>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            Onboarded on {formatDateTime(r.created_at)}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => onCopyId(r.id)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-2.5 py-1.5 text-[11px] font-semibold hover:border-[var(--accent-brand)] transition sm:text-xs sm:px-3"
            title="Copy Outlet ID"
          >
            <Copy className="h-3.5 w-3.5 text-[var(--text-muted)]" />
            <span className="font-mono hidden sm:inline">
              {copiedId === r.id ? "Copied ID!" : `${r.id.substring(0, 8)}...`}
            </span>
            <span className="font-mono sm:hidden">{copiedId === r.id ? "Copied!" : "ID"}</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenSettings(r)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] px-2.5 py-1.5 text-[11px] font-bold text-[var(--text-primary)] hover:border-[var(--accent-brand)] transition sm:text-xs sm:px-3"
            title="Configure Outlet Settings"
          >
            <Settings2 className="h-3.5 w-3.5 text-[var(--accent-brand)]" />
            <span className="hidden sm:inline">Settings</span>
          </button>

          <button
            type="button"
            onClick={() => onAddUser(r.id)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent-brand)] px-2.5 py-1.5 text-[11px] font-bold text-white shadow-xs hover:bg-[var(--accent-brand-hover)] transition sm:text-xs sm:px-3"
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Add User</span>
          </button>

          <button
            type="button"
            onClick={() => onDeleteRestaurant(r.id, r.name)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] font-bold text-rose-700 hover:bg-rose-100 transition sm:text-xs sm:px-2.5"
            title="Delete Outlet"
          >
            <Trash2 className="h-3.5 w-3.5 text-rose-600" />
            <span className="hidden sm:inline">Delete</span>
          </button>

          <button
            type="button"
            onClick={onToggleExpand}
            className="p-1.5 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            aria-label="Toggle team view"
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Summary Bar */}
      <div className="mt-3 flex items-center justify-between text-xs text-[var(--text-secondary)]">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <Crown className="h-4 w-4 text-amber-600" />
            {admins.length} {admins.length === 1 ? "Admin" : "Admins"}
          </span>
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <Users className="h-4 w-4 text-sky-600" />
            {staffUsers.length} {staffUsers.length === 1 ? "Staff Member" : "Staff Members"}
          </span>
        </div>

        <button
          type="button"
          onClick={onToggleExpand}
          className="text-xs font-semibold text-[var(--accent-brand)] hover:underline"
        >
          {isExpanded ? "Hide Team Directory" : "View Team Directory"}
        </button>
      </div>

      {/* Expandable Team Directory */}
      {isExpanded && (
        <div className="mt-4 space-y-4 border-t border-[var(--border-subtle)] pt-4 animate-in fade-in duration-200">
          {/* Admins Group */}
          <div>
            <div className="mb-2 flex items-center gap-1.5">
              <Crown className="h-4 w-4 text-amber-600" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Outlet Admins ({admins.length})
              </h4>
            </div>

            {admins.length === 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                ⚠️ No admin user assigned to this outlet yet. Click &quot;Add User&quot; above to create one.
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {admins.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between rounded-xl border border-amber-200/60 bg-amber-50/40 p-3"
                  >
                    <div className="space-y-0.5">
                      <p className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                        <UserCheck className="h-3.5 w-3.5 text-amber-600" />
                        {u.email}
                      </p>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        Joined {formatDateTime(u.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                        Admin
                      </span>
                      <button
                        type="button"
                        onClick={() => onDeleteUser(u.id, u.email)}
                        className="p-1 rounded-lg text-rose-500 hover:bg-rose-100 hover:text-rose-700 transition"
                        title="Delete Admin Account"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Staff & Team Roster */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-[var(--accent-brand)]" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                  Outlet Staff &amp; Team Roster ({staffList.length})
                </h4>
              </div>
            </div>

            {staffList.length === 0 ? (
              <p className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3 text-xs text-[var(--text-muted)]">
                No staff members provisioned for this outlet yet.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {staffList.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-elevated)] p-3"
                  >
                    <div className="space-y-0.5 truncate">
                      <p className="text-xs font-bold text-[var(--text-primary)] truncate flex items-center gap-1.5">
                        <UserCheck className="h-3.5 w-3.5 text-[var(--accent-brand)]" />
                        {s.name} ({s.email})
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono uppercase text-[var(--text-muted)]">
                          Role: {s.role.replace("_", " ")}
                        </span>
                        {s.has_pin && (
                          <span className="text-[10px] text-emerald-600 font-bold">
                            • PIN Active
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          s.status === "active"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {s.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
