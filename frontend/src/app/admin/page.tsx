"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAdminAuth } from "./hooks/useAdminAuth";
import { useAdminTheme } from "./hooks/useAdminTheme";
import { useOrdersManagement } from "./hooks/useOrdersManagement";
import { useMenuManagement } from "./hooks/useMenuManagement";
import { useStaffManagement } from "./hooks/useStaffManagement";
import { useInventoryManagement } from "./hooks/useInventoryManagement";
import { useBillingManagement } from "./hooks/useBillingManagement";
import { useAnalyticsManagement } from "./hooks/useAnalyticsManagement";
import { useSessionsManagement } from "./hooks/useSessionsManagement";
import { useSettingsManagement } from "./hooks/useSettingsManagement";
import { useNotificationManagement } from "./hooks/useNotificationManagement";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { isAuthError } from "./adminUtils";

import { AdminLoginForm } from "./components/AdminLoginForm";
import { AdminSidebar } from "./components/AdminSidebar";
import { NotificationPanel } from "./components/NotificationPanel";
import { Bell } from "lucide-react";

import { OrdersTab } from "./tabs/OrdersTab";
import { MenuTab } from "./tabs/MenuTab";
import { StaffTab } from "./tabs/StaffTab";
import { AnalyticsTab } from "./tabs/AnalyticsTab";
import { BillingTab } from "./tabs/BillingTab";
import { InventoryTab } from "./tabs/InventoryTab";
import { CustomerServicesTab } from "./tabs/CustomerServicesTab";
import { QrCodesTab } from "./tabs/QrCodesTab";
import { SettingsTab } from "./tabs/SettingsTab";

import { AbandonedCartsPanel } from "./modals/AbandonedCartsPanel";
import { StaffAssistBasketModal } from "./modals/StaffAssistBasketModal";
import { CreateBillDrawer } from "./modals/CreateBillDrawer";
import { PaymentModal } from "./modals/PaymentModal";
import { DiscountModal } from "./modals/DiscountModal";
import { VariantModal } from "./modals/VariantModal";
import { OfferModal } from "./modals/OfferModal";
import { StaffModal } from "./modals/StaffModal";
import { PinModal } from "./modals/PinModal";
import { PinSwitchModal } from "./modals/PinSwitchModal";

import type { AdminTab, RestaurantProfile } from "./adminTypes";
import type { ActiveSession, StaffMember } from "@/types";
import { RESTAURANT_DATA_KEY } from "./adminTypes";

const VALID_TABS: AdminTab[] = [
  "orders",
  "billing",
  "menu",
  "staff",
  "analytics",
  "inventory",
  "customerservices",
  "qrcodes",
  "settings",
  "sessions",
];

export default function AdminDashboardPage() {
  const { theme, toggleTheme } = useAdminTheme();
  const [activeTab, setActiveTabState] = useState<AdminTab>("orders");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [assistTargetSession, setAssistTargetSession] = useState<ActiveSession | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Restore tab on client mount from URL hash or localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash.replace("#", "").toLowerCase() as AdminTab;
      if (hash && VALID_TABS.includes(hash)) {
        setActiveTabState(hash);
        localStorage.setItem("admin_active_tab", hash);
        return;
      }
      const saved = localStorage.getItem("admin_active_tab") as AdminTab;
      if (saved && VALID_TABS.includes(saved)) {
        setActiveTabState(saved);
        window.history.replaceState(null, "", `#${saved}`);
      }
    }
  }, []);

  // Listen for hashchange events
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "").toLowerCase() as AdminTab;
      if (hash && VALID_TABS.includes(hash)) {
        setActiveTabState(hash);
        localStorage.setItem("admin_active_tab", hash);
      }
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const setActiveTab = useCallback((tab: AdminTab) => {
    setError(null);
    setActiveTabState(tab);
    if (typeof window !== "undefined") {
      localStorage.setItem("admin_active_tab", tab);
      window.history.replaceState(null, "", `#${tab}`);
    }
  }, []);

  // Authentication
  const {
    accessToken,
    isMounted,
    authHeaders,
    apiRequest,
    login,
    pinLogin,
    logout,
    userRole,
    isAdminRole,
    setSessionToken,
  } = useAdminAuth();

  // Restaurant Profile State
  const [restaurant, setRestaurant] = useState<RestaurantProfile | null>(null);

  // Web Audio synthesizer beep
  const playBeep = useCallback((freq: number = 880) => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch { }
  }, []);

  // Load Dashboard Restaurant Info
  const loadDashboard = useCallback(async () => {
    if (!accessToken) return;
    try {
      const data = await apiRequest<RestaurantProfile>("/api/admin/outlets/me");
      setRestaurant(data);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(RESTAURANT_DATA_KEY, JSON.stringify(data));
      }
    } catch (err: any) {
      if (isAuthError(err)) return;
      console.error("Dashboard fetch error:", err);
    }
  }, [accessToken, apiRequest]);

  useEffect(() => {
    if (accessToken) {
      loadDashboard();
    }
  }, [accessToken, loadDashboard]);

  // Domain Management Hooks
  const ordersState = useOrdersManagement({
    accessToken,
    restaurant,
    apiRequest,
    loadDashboard,
    setNotice,
    setError,
  });

  const staffState = useStaffManagement({
    accessToken,
    authHeaders,
    restaurant,
    apiRequest,
    setSessionToken,
    setNotice,
    setError,
  });

  // Auto-redirect to first allowed tab if current activeTab is not permitted for active role
  useEffect(() => {
    if (staffState.staffPermissions?.allowed_sidebar_tabs) {
      const allowed = staffState.staffPermissions.allowed_sidebar_tabs as AdminTab[];
      if (allowed.length > 0 && !allowed.includes(activeTab)) {
        setActiveTab(allowed[0]);
      }
    }
  }, [staffState.staffPermissions, activeTab, setActiveTab]);

  const canManageMenu = isAdminRole && (!staffState.staffPermissions || staffState.staffPermissions.can_manage_menu);
  const menuState = useMenuManagement({
    accessToken,
    apiRequest,
    setNotice,
    setError,
    enabled: canManageMenu,
  });

  const canManageInventory = isAdminRole && (!staffState.staffPermissions || staffState.staffPermissions.can_manage_inventory);
  const inventoryState = useInventoryManagement(apiRequest, playBeep, canManageInventory);

  const billingState = useBillingManagement({
    accessToken,
    authHeaders,
    apiRequest,
    setNotice,
    setError,
  });

  const analyticsState = useAnalyticsManagement({
    accessToken,
    authHeaders,
    apiRequest,
  });

  const sessionsState = useSessionsManagement({
    accessToken,
    restaurant,
    apiRequest,
    setNotice,
    setError,
  });

  const settingsState = useSettingsManagement({
    accessToken,
    restaurant,
    setRestaurant,
    apiRequest,
    setNotice,
    setError,
  });

  const canViewNotifications = isAdminRole && (!staffState.staffPermissions || staffState.staffPermissions.can_manage_staff || staffState.staffPermissions.can_view_analytics);
  const notificationState = useNotificationManagement({
    accessToken,
    apiRequest,
    enabled: canViewNotifications,
  });

  // Redirect to first allowed tab if current activeTab is restricted for this user's role
  useEffect(() => {
    const perms = staffState.staffPermissions;
    if (perms && perms.allowed_sidebar_tabs && perms.allowed_sidebar_tabs.length > 0) {
      if (!perms.allowed_sidebar_tabs.includes(activeTab)) {
        const target = perms.allowed_sidebar_tabs[0] as AdminTab;
        setActiveTab(target);
      }
    }
  }, [staffState.staffPermissions, activeTab, setActiveTab]);

  // Global Barcode Scanner Hook for Inventory Tab
  useBarcodeScanner({
    onScan: (barcode: string) => {
      if (activeTab === "inventory") {
        inventoryState.handleBarcodeScan(barcode);
      }
    },
    enabled: !!accessToken && activeTab === "inventory" && !inventoryState.isRegisterModalOpen,
  });

  if (!isMounted) return null;

  if (!accessToken) {
    return (
      <AdminLoginForm
        onLogin={async (email, password) => {
          await login(email, password);
          await loadDashboard();
        }}
        onPinLogin={async (outletId, pin) => {
          await pinLogin(outletId, pin);
          await loadDashboard();
        }}
      />
    );
  }

  const pendingVerificationCount = ordersState.orders.filter(
    (o) => o.status === "PENDING_VERIFICATION"
  ).length;

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-base)] font-sans text-[var(--text-primary)]">
      {/* Sidebar Component */}
      <AdminSidebar
        restaurant={restaurant}
        activeTab={activeTab}
        userRole={userRole}
        onTabChange={(tab) => {
          setActiveTab(tab);
          setIsMobileMenuOpen(false);
        }}
        onMobileClose={() => setIsMobileMenuOpen(false)}
        isMobileMenuOpen={isMobileMenuOpen}
        activeStaff={staffState.activeStaff}
        staffPermissions={staffState.staffPermissions}
        onPinSwitchOpen={() => staffState.setPinSwitchModalOpen(true)}
        onLoadStaffMembers={staffState.loadStaffMembers}
        wsStatus={ordersState.wsStatus}
        theme={theme}
        onToggleTheme={toggleTheme}
        pendingVerificationCount={pendingVerificationCount}
        pendingApprovalsCount={billingState.pendingApprovalsCount}
        lowStockAlertCount={inventoryState.alerts.length}
        abandonedCartCount={sessionsState.abandonedCartCount}
        onShowAbandonedCarts={() => sessionsState.setShowAbandonedCartsPanel(true)}
        onLoadBillingData={billingState.loadBillingData}
        onLoadAnalyticsData={analyticsState.loadAnalyticsData}
        onLoadInventoryData={inventoryState.fetchItems}
        onLogout={logout}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto p-4 sm:p-6 lg:p-8">
        {/* Top Header Control Bar with Bell Notification Icon */}
        <div className="mb-6 flex items-center justify-between pb-4 border-b border-[var(--border-subtle)]">
          <div>
            <h1 className="font-display text-xl font-black text-[var(--text-primary)] capitalize">
              {restaurant?.name || "ApnaGreen Basket"}
            </h1>
            <p className="text-xs text-[var(--text-muted)] capitalize">
              {activeTab} Dashboard • Real-time Store Controls
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Top-Right Bell Icon Button */}
            <button
              type="button"
              onClick={() => notificationState.setIsNotificationPanelOpen(true)}
              className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface-elevated)] text-[var(--text-primary)] hover:border-amber-400/60 hover:text-amber-400 transition shadow-xs"
              title="View Store Notifications & Near-Expiry Alerts"
            >
              <Bell className="h-5 w-5" />
              {notificationState.unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-red-500 text-[10px] font-black text-white shadow-xs">
                  {notificationState.unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Notice & Error Toasts */}
        {notice && (
          <div className="mb-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 text-xs text-emerald-400 flex items-center justify-between">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)} className="font-bold ml-2">
              ×
            </button>
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-400 flex items-center justify-between">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="font-bold ml-2">
              ×
            </button>
          </div>
        )}

        {/* Tab 1: Orders (Live Service Board) */}
        {activeTab === "orders" && (
          <OrdersTab
            orders={ordersState.orders}
            menuItems={menuState.menuItems}
            restaurant={restaurant}
            onUpdateOrderStatus={ordersState.onUpdateOrderStatus}
            onCancelOrder={ordersState.onCancelOrder}
            onDeleteOrder={ordersState.onDeleteOrder}
          />
        )}

        {/* Tab 2: Billing & POS */}
        {activeTab === "billing" && (
          <BillingTab
            restaurant={restaurant}
            staffPermissions={staffState.staffPermissions}
            isLoadingBilling={billingState.isLoadingBilling}
            loadBillingData={billingState.loadBillingData}
            pendingApprovals={billingState.pendingApprovals}
            handleResolveApproval={billingState.handleResolveApproval}
            billsList={billingState.billsList}
            billingStatusFilter={billingState.billingStatusFilter}
            setBillingStatusFilter={billingState.setBillingStatusFilter}
            billingSearchQuery={billingState.billingSearchQuery}
            setBillingSearchQuery={billingState.setBillingSearchQuery}
            onOpenCreateBill={() => billingState.setCreateBillModalOpen(true)}
            onResumeDraft={billingState.handleResumeDraft}
            onOpenDiscountModal={billingState.openDiscountModal}
            onOpenPaymentModal={billingState.openPaymentModal}
            onDeleteBill={billingState.handleDeleteBill}
          />
        )}

        {/* Tab 3: Menu Catalog */}
        {activeTab === "menu" && (
          <MenuTab
            categories={menuState.categories}
            menuItems={menuState.menuItems}
            variantsByItem={menuState.variantsByItem}
            selectedCategory={menuState.selectedCategory}
            setSelectedCategory={menuState.setSelectedCategory}
            searchQuery={menuState.searchQuery}
            setSearchQuery={menuState.setSearchQuery}
            authToken={accessToken || undefined}
            onSaveItem={menuState.handleSaveMenuItem}
            onSaveBatchItems={menuState.handleSaveBatchMenuItems}
            onDeleteItem={menuState.handleDeleteMenuItem}
            onToggleAvailability={menuState.handleToggleAvailability}
            onOpenVariantModal={menuState.openVariantModal}
            onOpenOfferModal={menuState.openOfferModal}
            onCreateCategory={menuState.handleCreateCategory}
            inventoryItems={inventoryState.items}
            restaurant={restaurant}
            onRestaurantUpdate={setRestaurant}
          />
        )}

        {/* Tab 4: Staff Management */}
        {activeTab === "staff" && (
          <StaffTab
            restaurant={restaurant}
            staffList={staffState.staffList}
            staffAuditLogs={staffState.staffAuditLogs}
            isLoadingStaff={staffState.isLoadingStaff}
            auditRoleFilter={staffState.auditRoleFilter}
            setAuditRoleFilter={staffState.setAuditRoleFilter}
            auditActionFilter={staffState.auditActionFilter}
            setAuditActionFilter={staffState.setAuditActionFilter}
            auditDateFilter={staffState.auditDateFilter}
            setAuditDateFilter={staffState.setAuditDateFilter}
            auditPage={staffState.auditPage}
            setAuditPage={staffState.setAuditPage}
            auditTotalPages={staffState.auditTotalPages}
            loadStaffMembers={staffState.loadStaffMembers}
            loadStaffAuditLogs={staffState.loadStaffAuditLogs}
            onDeactivateStaffMember={staffState.onDeactivateStaffMember}
            onOpenCreateStaff={() => {
              staffState.setEditingStaffId(null);
              staffState.setStaffFormState({
                outlet_id: restaurant?.id || "",
                name: "",
                email: "",
                phone: "",
                role: "STAFF",
                password: "",
                pin: "",
              });
              staffState.setStaffModalOpen(true);
            }}
            onOpenEditStaff={(member: StaffMember) => {
              staffState.setEditingStaffId(member.id);
              staffState.setStaffFormState({
                outlet_id: restaurant?.id || "",
                name: member.name,
                email: member.email,
                phone: member.phone || "",
                role: member.role,
                password: "",
                pin: "",
              });
              staffState.setStaffModalOpen(true);
            }}
            onOpenPinSetup={(member: StaffMember) => {
              staffState.setPinTargetStaff(member);
              staffState.setPinModalOpen(true);
            }}
            onOpenPinSwitch={() => staffState.setPinSwitchModalOpen(true)}
          />
        )}

        {/* Tab 5: Analytics */}
        {activeTab === "analytics" && (
          <AnalyticsTab
            restaurant={restaurant}
            kpiData={analyticsState.kpiData}
            revenueData={analyticsState.revenueData}
            peakHoursData={analyticsState.peakHoursData}
            topItemsData={analyticsState.topItemsData}
            funnelData={analyticsState.funnelData}
            profitData={analyticsState.profitData}
            isLoadingAnalytics={analyticsState.isLoadingAnalytics}
            analyticsGranularity={analyticsState.analyticsGranularity}
            setAnalyticsGranularity={analyticsState.setAnalyticsGranularity}
            analyticsDatePreset={analyticsState.analyticsDatePreset}
            setAnalyticsDatePreset={analyticsState.setAnalyticsDatePreset}
            customFromDate={analyticsState.customFromDate}
            setCustomFromDate={analyticsState.setCustomFromDate}
            customToDate={analyticsState.customToDate}
            setCustomToDate={analyticsState.setCustomToDate}
            drilldownBucket={analyticsState.drilldownBucket}
            setDrilldownBucket={analyticsState.setDrilldownBucket}
            topItemsSortBy={analyticsState.topItemsSortBy}
            setTopItemsSortBy={analyticsState.setTopItemsSortBy}
            loadAnalyticsData={analyticsState.loadAnalyticsData}
          />
        )}

        {/* Tab 6: Inventory, Barcode Scanner, Batches & Wastage */}
        {activeTab === "inventory" && (
          <InventoryTab
            activeSubTab={inventoryState.activeSubTab}
            setActiveSubTab={inventoryState.setActiveSubTab}
            inventoryViewMode={inventoryState.inventoryViewMode}
            setInventoryViewMode={inventoryState.setInventoryViewMode}
            items={inventoryState.items}
            batches={inventoryState.batches}
            suppliers={inventoryState.suppliers}
            createSupplier={inventoryState.createSupplier}
            fetchBatches={inventoryState.fetchBatches}
            alerts={inventoryState.alerts}
            ledgerEntries={inventoryState.ledgerEntries}
            ledgerTotal={inventoryState.ledgerTotal}
            ledgerPage={inventoryState.ledgerPage}
            setLedgerPage={inventoryState.setLedgerPage}
            ledgerPageSize={inventoryState.ledgerPageSize}
            ledgerFilterItem={inventoryState.ledgerFilterItem}
            setLedgerFilterItem={inventoryState.setLedgerFilterItem}
            ledgerFilterType={inventoryState.ledgerFilterType}
            setLedgerFilterType={inventoryState.setLedgerFilterType}
            isLoading={inventoryState.isLoading}
            error={inventoryState.error}
            scanQty={inventoryState.scanQty}
            setScanQty={inventoryState.setScanQty}
            scanWeight={inventoryState.scanWeight}
            setScanWeight={inventoryState.setScanWeight}
            scannedBarcode={inventoryState.scannedBarcode}
            setScannedBarcode={inventoryState.setScannedBarcode}
            isRegisterModalOpen={inventoryState.isRegisterModalOpen}
            setIsRegisterModalOpen={inventoryState.setIsRegisterModalOpen}
            unregisteredBarcode={inventoryState.unregisteredBarcode}
            scanFeed={inventoryState.scanFeed}
            handleBarcodeScan={inventoryState.handleBarcodeScan}
            onboardScannedItem={inventoryState.onboardScannedItem}
            selectedBatchItem={inventoryState.selectedBatchItem}
            isBatchDrawerOpen={inventoryState.isBatchDrawerOpen}
            openBatchDrawer={inventoryState.openBatchDrawer}
            closeBatchDrawer={inventoryState.closeBatchDrawer}
            isAddSupplierModalOpen={inventoryState.isAddSupplierModalOpen}
            setIsAddSupplierModalOpen={inventoryState.setIsAddSupplierModalOpen}
            isWastageModalOpen={inventoryState.isWastageModalOpen}
            selectedWastageItem={inventoryState.selectedWastageItem}
            selectedWastageBatch={inventoryState.selectedWastageBatch}
            openWastageModal={inventoryState.openWastageModal}
            closeWastageModal={inventoryState.closeWastageModal}
            deleteInventoryItem={inventoryState.deleteInventoryItem}
            deleteBatch={inventoryState.deleteBatch}
            logWastage={inventoryState.logWastage}
            catalogCategories={menuState.categories}
            authToken={accessToken || undefined}
          />
        )}

        {/* Tab 7: Customer Services (Customer Directory & QR Codes) */}
        {activeTab === "customerservices" && (
          <CustomerServicesTab
            restaurant={restaurant}
            authToken={accessToken || undefined}
            outletId={restaurant?.id}
          />
        )}

        {/* Tab 8: Restaurant Settings */}
        {activeTab === "settings" && (
          <SettingsTab
            restaurant={restaurant}
            menuItems={menuState.menuItems}
            restaurantForm={settingsState.restaurantForm}
            setRestaurantForm={settingsState.setRestaurantForm}
            isSavingRestaurant={settingsState.isSavingRestaurant}
            onSubmitRestaurantSettings={settingsState.onSubmitRestaurantSettings}
            accessToken={accessToken}
            setNotice={setNotice}
            setError={setError}
          />
        )}
      </main>

      {/* Modals & Drawers */}
      <AbandonedCartsPanel
        isOpen={sessionsState.showAbandonedCartsPanel}
        onClose={() => sessionsState.setShowAbandonedCartsPanel(false)}
        activeSessions={sessionsState.activeSessions}
        abandonedCarts={sessionsState.abandonedCarts}
        isLoadingCarts={sessionsState.isLoadingCarts}
        convertAbandonedCart={sessionsState.convertAbandonedCart}
        dismissAbandonedCart={sessionsState.dismissAbandonedCart}
        terminateSession={sessionsState.terminateSession}
        onAssistSession={(session) => setAssistTargetSession(session)}
      />

      <StaffAssistBasketModal
        isOpen={!!assistTargetSession}
        onClose={() => setAssistTargetSession(null)}
        session={assistTargetSession}
        menuItems={menuState.menuItems}
        authToken={accessToken || undefined}
        onSuccess={() => {
          setNotice(`Added items to Basket #${assistTargetSession?.basket_number} (${assistTargetSession?.customer_name})`);
          void sessionsState.fetchActiveSessions();
          void loadDashboard();
        }}
      />

      <CreateBillDrawer
        isOpen={billingState.createBillModalOpen}
        onClose={billingState.handleCloseCreateBillDrawer}
        menuItems={menuState.menuItems}
        variantsByItem={menuState.variantsByItem}
        draftCartItems={billingState.draftCartItems}
        setDraftCartItems={billingState.setDraftCartItems}
        selectedTable={billingState.selectedTable}
        setSelectedTable={billingState.setSelectedTable}
        customerName={billingState.customerName}
        setCustomerName={billingState.setCustomerName}
        customerPhone={billingState.customerPhone}
        setCustomerPhone={billingState.setCustomerPhone}
        handleCreateBill={billingState.handleCreateBill}
        eveningPriceActive={restaurant?.evening_price_active ?? false}
      />

      <PaymentModal
        isOpen={billingState.paymentModalOpen}
        onClose={() => void billingState.handleDiscardPaymentBill()}
        onBackToDrawer={billingState.handleBackToDrawer}
        onKeepAsDraft={() => void billingState.handleKeepAsDraft()}
        onDiscardBill={() => void billingState.handleDiscardPaymentBill()}
        paymentTargetBill={billingState.paymentTargetBill}
        selectedPaymentMethod={billingState.selectedPaymentMethod}
        setSelectedPaymentMethod={billingState.setSelectedPaymentMethod}
        cashTendered={billingState.cashTendered}
        setCashTendered={billingState.setCashTendered}
        handleMarkPaid={billingState.handleMarkPaid}
        onOpenDiscountModal={billingState.openDiscountModal}
      />

      <DiscountModal
        isOpen={billingState.discountModalOpen}
        onClose={() => billingState.setDiscountModalOpen(false)}
        discountTargetBill={billingState.discountTargetBill}
        discountType={billingState.discountType}
        setDiscountType={billingState.setDiscountType}
        discountValue={billingState.discountValue}
        setDiscountValue={billingState.setDiscountValue}
        discountReason={billingState.discountReason}
        setDiscountReason={billingState.setDiscountReason}
        staffPermissions={staffState.staffPermissions}
        handleApplyDiscount={billingState.handleApplyDiscount}
      />

      <VariantModal
        isOpen={menuState.isVariantModalOpen}
        onClose={menuState.closeVariantModal}
        selectedVariantItemId={menuState.selectedItemForVariants?.id || null}
        menuItems={menuState.menuItems}
        variantsByItem={menuState.variantsByItem}
        variantForm={{ name: "", price_delta: "0.00", is_available: true }}
        setVariantForm={() => { }}
        editingVariantId={null}
        setEditingVariantId={() => { }}
        isSavingVariant={false}
        onSubmitVariant={(e) => e.preventDefault()}
        onToggleVariantAvailable={async () => { }}
        onDeleteVariant={async (id) => {
          if (menuState.selectedItemForVariants) {
            await menuState.handleDeleteVariant(menuState.selectedItemForVariants.id, id);
          }
        }}
      />

      <OfferModal
        isOpen={menuState.isOfferModalOpen}
        onClose={menuState.closeOfferModal}
        selectedOfferItemId={menuState.selectedItemForOffer?.id || null}
        menuItems={menuState.menuItems}
        offerForm={menuState.offerForm}
        setOfferForm={menuState.setOfferForm}
        isSavingOffer={menuState.isSavingOffer}
        onSubmitOffer={menuState.handleSaveOffer}
      />

      <StaffModal
        isOpen={staffState.staffModalOpen}
        onClose={() => staffState.setStaffModalOpen(false)}
        editingStaffId={staffState.editingStaffId}
        staffFormState={staffState.staffFormState}
        setStaffFormState={staffState.setStaffFormState}
        isSavingStaff={staffState.isSavingStaff}
        onSubmitStaffMember={staffState.onSubmitStaffMember}
      />

      <PinModal
        isOpen={staffState.pinModalOpen}
        onClose={() => staffState.setPinModalOpen(false)}
        pinTargetStaff={staffState.pinTargetStaff}
        pinInput={staffState.pinInput}
        setPinInput={staffState.setPinInput}
        isSavingPin={staffState.isSavingPin}
        onSubmitSetStaffPin={staffState.onSubmitSetStaffPin}
      />

      <PinSwitchModal
        isOpen={staffState.pinSwitchModalOpen}
        onClose={() => staffState.setPinSwitchModalOpen(false)}
        staffList={staffState.staffList}
        pinSwitchStaffId={staffState.pinSwitchStaffId}
        setPinSwitchStaffId={staffState.setPinSwitchStaffId}
        pinSwitchInput={staffState.pinSwitchInput}
        setPinSwitchInput={staffState.setPinSwitchInput}
        isSwitchingPin={staffState.isSwitchingPin}
        onSubmitPinQuickSwitch={staffState.onSubmitPinQuickSwitch}
      />

      {/* Top-Right Notification Bell Panel */}
      <NotificationPanel
        isOpen={notificationState.isNotificationPanelOpen}
        onClose={() => notificationState.setIsNotificationPanelOpen(false)}
        notifications={notificationState.notifications}
        unreadCount={notificationState.unreadCount}
        thresholdDays={notificationState.thresholdDays}
        onRefresh={() => void notificationState.fetchNotifications()}
        onMarkRead={notificationState.handleMarkRead}
      />
    </div>
  );
}
