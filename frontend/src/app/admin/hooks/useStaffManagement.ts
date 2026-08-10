import { FormEvent, useCallback, useState } from "react";
import type {
  RolePermissions,
  StaffAuditEntry,
  StaffMember,
} from "@/types";
import type { RestaurantProfile } from "../adminTypes";
import type { StaffModalFormState } from "../modals/StaffModal";

type UseStaffManagementProps = {
  accessToken: string | null;
  authHeaders: Record<string, string> | null;
  restaurant: RestaurantProfile | null;
  apiRequest: <T>(endpoint: string, options?: RequestInit) => Promise<T>;
  setNotice: (msg: string | null) => void;
  setError: (msg: string | null) => void;
};

export function useStaffManagement({
  accessToken,
  authHeaders,
  restaurant,
  apiRequest,
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
      console.error("Permissions fetch error:", err);
    }
  }, [apiRequest, authHeaders]);

  const loadStaffAuditLogs = useCallback(async () => {
    if (!authHeaders) return;
    try {
      const logRes = await apiRequest<{ items: StaffAuditEntry[] }>("/api/staff/audit-log");
      setStaffAuditLogs(logRes.items || []);
    } catch (err) {
      console.error("Staff audit log fetch error:", err);
    }
  }, [apiRequest, authHeaders]);

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
    if (!window.confirm(`Deactivate staff member "${name}"?`)) return;
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

      setActiveStaff(res.active_staff);
      setNotice(`Switched active staff to ${res.active_staff.name} (${res.active_staff.role})`);
      setPinSwitchModalOpen(false);
      setPinSwitchInput("");
      void loadStaffPermissions();
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
    loadStaffMembers,
    loadStaffPermissions,
    loadStaffAuditLogs,
    onSubmitStaffMember,
    onDeactivateStaffMember,
    onSubmitSetStaffPin,
    onSubmitPinQuickSwitch,
  };
}
