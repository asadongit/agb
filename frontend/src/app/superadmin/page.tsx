/**
 * SuperadminPage — Main orchestrator for Multi-Outlet Platform Administration.
 *
 * Coordinates platform directory, tenant provisioning wizard, and store settings.
 */

"use client";

import { Search, Store } from "lucide-react";
import { useSuperadminData } from "./hooks/useSuperadminData";
import { SuperadminLoginForm } from "./components/SuperadminLoginForm";
import { SuperadminHeader } from "./components/SuperadminHeader";
import { CreateOutletWizard } from "./components/CreateOutletWizard";
import { OutletCard } from "./components/OutletCard";
import { EditOutletModal } from "./components/EditOutletModal";

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  return parsed.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function SuperadminPage() {
  const {
    email,
    setEmail,
    password,
    setPassword,
    accessToken,
    isMounted,
    isAuthenticating,
    error,
    notice,
    theme,
    toggleTheme,
    restaurants,
    isLoadingRestaurants,
    searchQuery,
    setSearchQuery,
    expandedIds,
    toggleExpand,
    copiedId,
    copyToClipboard,
    staffByOutlet,
    restaurantForm,
    setRestaurantForm,
    isCreatingRestaurant,
    settingsOutlet,
    setSettingsOutlet,
    settingsForm,
    setSettingsForm,
    isSavingSettings,
    adminUserForm,
    setAdminUserForm,
    selectedRestaurantId,
    setSelectedRestaurantId,
    isCreatingUser,
    step,
    setStep,
    filteredRestaurants,
    onLogin,
    onLogout,
    loadRestaurants,
    onCreateRestaurant,
    openOutletSettings,
    onSaveOutletSettings,
    onCreateAdminUser,
    deleteRestaurant,
    deleteUser,
    startAddUserForRestaurant,
    autoSlug,
  } = useSuperadminData();

  // Wait until mounted on client before rendering to prevent SSR hydration mismatch
  if (!isMounted) return null;

  // Pre-auth: Superadmin Sign In
  if (!accessToken) {
    return (
      <SuperadminLoginForm
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        isAuthenticating={isAuthenticating}
        theme={theme}
        toggleTheme={toggleTheme}
        error={error}
        notice={notice}
        onLogin={onLogin}
      />
    );
  }

  // Post-auth: Superadmin Console
  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      <SuperadminHeader
        theme={theme}
        toggleTheme={toggleTheme}
        isLoadingRestaurants={isLoadingRestaurants}
        onRefresh={() => void loadRestaurants()}
        onLogout={() => void onLogout()}
      />

      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
        {notice && (
          <p className="rounded-xl bg-emerald-100 px-4 py-2 text-sm text-emerald-800 font-medium">
            {notice}
          </p>
        )}
        {error && (
          <p className="rounded-xl bg-rose-100 px-4 py-2 text-sm text-rose-800 font-medium">
            {error}
          </p>
        )}

        {/* Action Stepper / Creator Widget */}
        <CreateOutletWizard
          step={step}
          setStep={setStep}
          restaurantForm={restaurantForm}
          setRestaurantForm={setRestaurantForm}
          isCreatingRestaurant={isCreatingRestaurant}
          onCreateRestaurant={onCreateRestaurant}
          restaurants={restaurants}
          selectedRestaurantId={selectedRestaurantId}
          setSelectedRestaurantId={setSelectedRestaurantId}
          adminUserForm={adminUserForm}
          setAdminUserForm={setAdminUserForm}
          isCreatingUser={isCreatingUser}
          onCreateAdminUser={onCreateAdminUser}
          autoSlug={autoSlug}
        />

        {/* Directory Section */}
        <section className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">
                Onboarded Outlets Directory
              </h2>
              <p className="text-xs text-[var(--text-secondary)] sm:text-sm">
                Viewing {filteredRestaurants.length} of {restaurants.length} total outlets along with their assigned admins and staff.
              </p>
            </div>

            {/* Search Filter */}
            <div className="relative flex items-center w-full sm:w-auto sm:min-w-[260px]">
              <Search className="absolute left-3 h-4 w-4 text-[var(--text-muted)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search outlet or user email..."
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] py-2 pl-9 pr-4 text-xs focus:border-[var(--accent-brand)] focus:outline-hidden"
              />
            </div>
          </div>

          {/* Loading Skeleton */}
          {isLoadingRestaurants && restaurants.length === 0 && (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-40 w-full animate-pulse rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                />
              ))}
            </div>
          )}

          {/* Empty Directory */}
          {!isLoadingRestaurants && filteredRestaurants.length === 0 && (
            <div className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-12 text-center">
              <Store className="mx-auto h-12 w-12 text-[var(--text-muted)] mb-3" />
              <h3 className="font-display text-lg font-bold">No Outlets Found</h3>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                {searchQuery ? `No outlets match "${searchQuery}"` : "Get started by onboarding your first outlet above."}
              </p>
            </div>
          )}

          {/* Directory Restaurant Cards */}
          <div className="space-y-4">
            {filteredRestaurants.map((r) => (
              <OutletCard
                key={r.id}
                outlet={r}
                isExpanded={expandedIds.has(r.id)}
                copiedId={copiedId}
                staffList={staffByOutlet[r.id] || []}
                onToggleExpand={() => toggleExpand(r.id)}
                onCopyId={(id) => copyToClipboard(id, id)}
                onOpenSettings={(outlet) => openOutletSettings(outlet)}
                onAddUser={(id) => startAddUserForRestaurant(id)}
                onDeleteRestaurant={(id, name) => void deleteRestaurant(id, name)}
                onDeleteUser={(id, userEmail) => void deleteUser(id, userEmail)}
                formatDateTime={formatDateTime}
              />
            ))}
          </div>
        </section>
      </main>

      {/* Outlet Settings Modal */}
      <EditOutletModal
        settingsOutlet={settingsOutlet}
        onClose={() => setSettingsOutlet(null)}
        settingsForm={settingsForm}
        setSettingsForm={setSettingsForm}
        isSavingSettings={isSavingSettings}
        onSaveOutletSettings={onSaveOutletSettings}
      />
    </div>
  );
}
