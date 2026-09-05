import { FormEvent, useCallback, useEffect, useState } from "react";
import type {
  RolePermissions,
  StaffAuditEntry,
  StaffMember,
} from "@/types";
import type { RestaurantProfile } from "../adminTypes";
import type { StaffModalFormState } from "../modals/StaffModal";
import { isAuthError } from "../adminUtils";

type UseStaffManagementProps = {
  accessToken: string | null;
  authHeaders: Record<string, string> | null;
  restaurant: RestaurantProfile | null;
  apiRequest: <T>(endpoint: string, options?: RequestInit) => Promise<T>;
  setSessionToken?: (newToken: string) => void;
  setNotice: (msg: string | null) => void;
  setError: (msg: string | null) => void;
};

export function useStaffManagement({
  accessToken,
  authHeaders,
  restaurant,
  apiRequest,
  setSessionToken,
  setNotice,
  setError,
}: UseStaffManagementProps) {
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [activeStaff, setActiveStaff] = useState<StaffMember | null>(null);
  const [staffPermissions, setStaffPermissions] = useState<RolePermissions | null>(null);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);
  const [staffAuditLogs, setStaffAuditLogs] = useState<StaffAuditEntry[]>([]);

  // Staff Modals State
  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [staffFormState, setStaffFormState] = useState<StaffModalFormState>({
    outlet_id: "",
    name: "",
    email: "",
    phone: "",
    role: "STAFF",
    password: "",
    pin: "",
  });
  const [isSavingStaff, setIsSavingStaff] = useState(false);

  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinTargetStaff, setPinTargetStaff] = useState<StaffMember | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [isSavingPin, setIsSavingPin] = useState(false);

  const [pinSwitchModalOpen, setPinSwitchModalOpen] = useState(false);
  const [pinSwitchStaffId, setPinSwitchStaffId] = useState("");
  const [pinSwitchInput, setPinSwitchInput] = useState("");
  const [isSwitchingPin, setIsSwitchingPin] = useState(false);

  // Audit Filters & Pagination
  const [auditRoleFilter, setAuditRoleFilter] = useState<string>("");
  const [auditActionFilter, setAuditActionFilter] = useState<string>("");
  const [auditDateFilter, setAuditDateFilter] = useState<string>("");
  const [auditPage, setAuditPage] = useState<number>(1);
  const [auditTotalPages, setAuditTotalPages] = useState<number>(1);

  // Load Staff Data
  const loadStaffMembers = useCallback(async () => {
    if (!authHeaders) return;
    setIsLoadingStaff(true);
    try {
      const data = await apiRequest<StaffMember[]>("/api/staff");
      setStaffList(data);
      if (data.length > 0 && !pinSwitchStaffId) {
        setPinSwitchStaffId(data[0].id);
      }
    } catch (err) {
      if (isAuthError(err)) return;
      console.error("Staff fetch error:", err);
    } finally {
      setIsLoadingStaff(false);
    }
  }, [apiRequest, authHeaders, pinSwitchStaffId]);

  const loadStaffPermissions = useCallback(async () => {
    if (!authHeaders) return;
    try {
      const perms = await apiRequest<RolePermissions>("/api/staff/permissions");
      setStaffPermissions(perms);
    } catch (err) {
      if (isAuthError(err)) return;
      console.error("Permissions fetch error:", err);
    }
  }, [apiRequest, authHeaders]);

  const loadMyProfile = useCallback(async () => {
    if (!authHeaders) return;
    try {
      const myProfile = await apiRequest<StaffMember>("/api/staff/me");
      if (myProfile) {
        setActiveStaff(myProfile);
      }
    } catch (err) {
      if (isAuthError(err)) return;
      console.error("Profile fetch error:", err);
    }
  }, [apiRequest, authHeaders]);

  const loadStaffAuditLogs = useCallback(async () => {
    if (!authHeaders) return;
    try {
      const params = new URLSearchParams();
      if (auditRoleFilter) params.append("role", auditRoleFilter);
      if (auditActionFilter) params.append("action_type", auditActionFilter);
      params.append("page", auditPage.toString());
      
      if (auditDateFilter === "today") {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        params.append("from_date", today.toISOString());
      } else if (auditDateFilter === "7days") {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        params.append("from_date", d.toISOString());
      } else if (auditDateFilter === "30days") {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        params.append("from_date", d.toISOString());
      }

      const qs = params.toString();
      const logRes = await apiRequest<{ items: StaffAuditEntry[], total_pages: number }>(`/api/staff/audit-log${qs ? `?${qs}` : ""}`);
      setStaffAuditLogs(logRes.items || []);
      setAuditTotalPages(logRes.total_pages || 1);
    } catch (err) {
      if (isAuthError(err)) return;
      console.error("Staff audit log fetch error:", err);
    }
  }, [apiRequest, authHeaders, auditRoleFilter, auditActionFilter, auditDateFilter, auditPage]);

  useEffect(() => {
    if (authHeaders) {
      // Clear stale permissions from previous session before fetching
      setStaffPermissions(null);
      void loadStaffPermissions();
      void loadMyProfile();
    } else {
      // Clear state on logout
      setStaffPermissions(null);
      setActiveStaff(null);
      setStaffList([]);
      setStaffAuditLogs([]);
    }
  }, [authHeaders, loadStaffPermissions, loadMyProfile]);

  useEffect(() => {
    if (staffPermissions?.can_manage_staff) {
      void loadStaffMembers();
      void loadStaffAuditLogs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffPermissions?.can_manage_staff]);

  // Reset page to 1 whenever filters change
  useEffect(() => {
    setAuditPage(1);
  }, [auditRoleFilter, auditActionFilter, auditDateFilter]);

  const onSubmitStaffMember = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSavingStaff(true);
    setError(null);

    const targetRestaurantId = restaurant?.id || null;

    try {
      if (editingStaffId) {
        const payload = {
          name: staffFormState.name.trim(),
          email: staffFormState.email.trim(),
          phone: staffFormState.phone.trim() || null,
          role: staffFormState.role,
        };
        const updated = await apiRequest<StaffMember>(`/api/staff/${editingStaffId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        setNotice(`Staff member "${updated.name}" updated.`);
      } else {
        const payload = {
          outlet_id: targetRestaurantId,
          name: staffFormState.name.trim(),
          email: staffFormState.email.trim(),
          phone: staffFormState.phone.trim() || null,
          role: staffFormState.role,
          password: staffFormState.password,
          pin: staffFormState.pin.trim() || null,
        };
        const created = await apiRequest<StaffMember>("/api/staff", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setNotice(`Staff member "${created.name}" created.`);
      }

      setStaffModalOpen(false);
      setEditingStaffId(null);
      setStaffFormState({ outlet_id: "", name: "", email: "", phone: "", role: "STAFF", password: "", pin: "" });
      void loadStaffMembers();
      void loadStaffAuditLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save staff member.");
    } finally {
      setIsSavingStaff(false);
    }
  };

  const onDeactivateStaffMember = async (id: string, name: string) => {
    setError(null);
    try {
      await apiRequest<void>(`/api/staff/${id}`, { method: "DELETE" });
      setNotice(`Staff member "${name}" deactivated.`);
      void loadStaffMembers();
      void loadStaffAuditLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to deactivate staff.");
    }
  };

  const onSubmitSetStaffPin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!pinTargetStaff) return;
    setIsSavingPin(true);
    setError(null);

    try {
      await apiRequest<void>(`/api/staff/${pinTargetStaff.id}/set-pin`, {
        method: "POST",
        body: JSON.stringify({ pin: pinInput }),
      });
      setNotice(`PIN updated for "${pinTargetStaff.name}".`);
      setPinModalOpen(false);
      setPinTargetStaff(null);
      setPinInput("");
      void loadStaffMembers();
      void loadStaffAuditLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set PIN.");
    } finally {
      setIsSavingPin(false);
    }
  };

  const onSubmitPinQuickSwitch = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!pinSwitchStaffId) {
      setError("Please select a staff member.");
      return;
    }
    setIsSwitchingPin(true);
    setError(null);

    try {
      const res = await apiRequest<{ staff_context_token: string; active_staff: StaffMember }>(
        "/api/staff/pin-switch",
        {
          method: "POST",
          body: JSON.stringify({ staff_id: pinSwitchStaffId, pin: pinSwitchInput }),
        }
      );

      // Prevent race conditions by synchronously clearing permissions before the token hot-swap
      setStaffPermissions(null);

      if (res.staff_context_token && setSessionToken) {
        setSessionToken(res.staff_context_token);
      }
      setActiveStaff(res.active_staff);
      setNotice(`Switched active staff to ${res.active_staff.name} (${res.active_staff.role})`);
      setPinSwitchModalOpen(false);
      setPinSwitchInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid staff PIN.");
    } finally {
      setIsSwitchingPin(false);
    }
  };

  return {
    staffList,
    setStaffList,
    activeStaff,
    setActiveStaff,
    staffPermissions,
    setStaffPermissions,
    isLoadingStaff,
    staffAuditLogs,
    setStaffAuditLogs,
    staffModalOpen,
    setStaffModalOpen,
    editingStaffId,
    setEditingStaffId,
    staffFormState,
    setStaffFormState,
    isSavingStaff,
    pinModalOpen,
    setPinModalOpen,
    pinTargetStaff,
    setPinTargetStaff,
    pinInput,
    setPinInput,
    isSavingPin,
    pinSwitchModalOpen,
    setPinSwitchModalOpen,
    pinSwitchStaffId,
    setPinSwitchStaffId,
    pinSwitchInput,
    setPinSwitchInput,
    isSwitchingPin,
    // Filters
    auditRoleFilter,
    setAuditRoleFilter,
    auditActionFilter,
    setAuditActionFilter,
    auditDateFilter,
    setAuditDateFilter,
    auditPage,
    setAuditPage,
    auditTotalPages,
    // Handlers
    loadStaffMembers,
    loadStaffPermissions,
    loadStaffAuditLogs,
    onSubmitStaffMember,
    onDeactivateStaffMember,
    onSubmitSetStaffPin,
    onSubmitPinQuickSwitch,
  };
}
