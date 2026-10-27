import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { formatISTDateTime } from "@/lib/dateTime";

type StaffRole = "owner" | "admin" | "editor" | "customer_support" | "data_entry";
type StaffAccount = {
  id: string;
  username: string;
  email: string;
  phone: string;
  role: StaffRole;
  permissions: string[];
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
};
type Activity = {
  id: string;
  actor_username: string | null;
  action: string;
  resource: string | null;
  http_method: string | null;
  http_status: number | null;
  created_at: string;
};

const permissionOptions = [
  ["dashboard.read", "Overview"],
  ["orders.read", "View orders"],
  ["orders.edit", "Edit order items"],
  ["orders.status", "Change order status"],
  ["orders.cancellations", "Review cancellations"],
  ["orders.archive", "Archive orders"],
  ["orders.manual_create", "Create manual orders"],
  ["payments.manage", "Edit payment records"],
  ["catalog.read", "View products"],
  ["catalog.manage", "Edit products and categories"],
  ["catalog.prices", "Edit product prices"],
  ["campaigns.manage", "Manage campaigns"],
  ["coupons.manage", "Manage coupons"],
  ["customers.read", "View customers"],
  ["customers.manage", "Edit customer records"],
  ["carts.read", "View customer carts"],
  ["reports.read", "View reports"],
  ["reports.finance", "View financial reports"],
  ["delivery.manage", "Manage delivery settings"],
  ["settings.manage", "Manage store settings"],
  ["staff.manage", "Manage employee accounts"],
  ["activity.read", "View activity logs"],
  ["content.manage", "Manage storefront content and images"],
] as const;

function permissionBlockedForRole(role: StaffRole, permission: string) {
  const allowlist: Partial<Record<StaffRole, string[]>> = {
    customer_support: ["orders.read", "orders.edit", "orders.status", "customers.read", "customers.manage", "carts.read"],
    data_entry: ["orders.read", "orders.edit", "orders.status", "customers.read", "customers.manage", "carts.read"],
  };
  if (allowlist[role] && !allowlist[role]?.includes(permission)) return true;
  const blocked: Partial<Record<StaffRole, string[]>> = {
    editor: ["orders.manual_create", "payments.manage", "reports.finance", "staff.manage", "activity.read"],
    customer_support: ["orders.manual_create", "catalog.prices", "payments.manage", "reports.finance", "staff.manage", "activity.read"],
    data_entry: ["orders.manual_create", "catalog.prices", "payments.manage", "reports.finance", "staff.manage", "activity.read"],
  };
  return blocked[role]?.includes(permission) ?? false;
}

function formatDate(value?: string | null) {
  if (!value) return "Never";
  const formatted = formatISTDateTime(value);
  return formatted === "Time unavailable" ? "Unknown" : formatted;
}

export default function AdminStaff() {
  const { adminUser } = useAuth();
  const isOwner = adminUser?.role === "owner";
  const canViewActivity = isOwner || adminUser?.permissions?.includes("activity.read") || adminUser?.permissions?.includes("*");
  const [staff, setStaff] = useState<StaffAccount[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<StaffRole>("data_entry");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [employeePassword, setEmployeePassword] = useState("");
  const [confirmEmployeePassword, setConfirmEmployeePassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");

  const loadStaff = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiFetch("admin/staff", {}, { forceBackend: true });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.message || "Could not load employee accounts.");
      setStaff(Array.isArray(payload.data) ? payload.data : []);
      if (canViewActivity) {
        const activityResponse = await apiFetch("admin/staff/activity?limit=100", {}, { forceBackend: true });
        const activityPayload = await activityResponse.json().catch(() => ({}));
        if (activityResponse.ok && activityPayload.success) setActivity(Array.isArray(activityPayload.data) ? activityPayload.data : []);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load employee accounts.");
    } finally {
      setLoading(false);
    }
  }, [canViewActivity]);

  useEffect(() => { void loadStaff(); }, [loadStaff]);

  const ownerExists = useMemo(() => staff.some((item) => item.role === "owner"), [staff]);

  const createEmployee = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await apiFetch("admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() || email.trim(), email: email.trim(), phone: phone.trim(), role, permissions, password: employeePassword }),
      }, { forceBackend: true });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.message || "Could not create employee account.");
      setNotice("Employee account created inactive with its own password. Activate it when the employee is ready to sign in.");
      setUsername(""); setEmail(""); setPhone(""); setPermissions([]); setRole("data_entry"); setEmployeePassword(""); setConfirmEmployeePassword("");
      await loadStaff();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create employee account.");
    } finally {
      setSaving(false);
    }
  };

  const setEmployeePasswordFor = async (employee: StaffAccount, password: string): Promise<boolean> => {
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await apiFetch(`admin/staff/${encodeURIComponent(employee.id)}/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      }, { forceBackend: true });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.message || "Could not set the employee password.");
      setNotice(payload.message || "Employee password updated.");
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not set the employee password.");
      return false;
    } finally { setSaving(false); }
  };

  const removeEmployee = async (employee: StaffAccount) => {
    const confirmed = window.confirm(`Remove ${employee.username}'s employee account? They will lose admin access immediately. Their existing activity history will remain.`);
    if (!confirmed) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await apiFetch(`admin/staff/${encodeURIComponent(employee.id)}`, { method: "DELETE" }, { forceBackend: true });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.message || "Could not remove the employee account.");
      setNotice(payload.message || "Employee account removed.");
      await loadStaff();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not remove the employee account.");
    } finally { setSaving(false); }
  };

  const saveEmployee = async (employee: StaffAccount, changes: Partial<StaffAccount>) => {
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await apiFetch(`admin/staff/${encodeURIComponent(employee.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      }, { forceBackend: true });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.message || "Could not update employee access.");
      setNotice("Employee access updated.");
      await loadStaff();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update employee access.");
    } finally { setSaving(false); }
  };

  const claimOwner = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const response = await apiFetch("admin/staff/claim-owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword }),
      }, { forceBackend: true });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(payload.message || "Could not set up Owner access.");
      setNotice(payload.message || "Owner access is ready. Refreshing your session…");
      window.setTimeout(() => window.location.reload(), 800);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not set up Owner access.");
    } finally { setSaving(false); }
  };

  return <AdminShell title="Employees & access" subtitle="Manage staff accounts, assigned permissions, activation, and admin activity.">
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-900">{notice}</p>}

      {!ownerExists && adminUser?.role === "admin" && <form onSubmit={claimOwner} className="rounded-2xl border border-[#E9D8D4] bg-white p-5 shadow-sm sm:p-6">
        <p className="text-xs font-black uppercase tracking-[.16em] text-[#B4232C]">One-time owner setup</p>
        <h2 className="mt-2 text-lg font-black">Set this existing admin account as Owner</h2>
        <p className="mt-1 text-sm text-muted-foreground">This is a one-time action and requires the current account password.</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Current password" required className="max-w-sm" />
          <Button disabled={saving} className="bg-[#B4232C] hover:bg-[#941D24]">{saving ? "Saving…" : "Set as Owner"}</Button>
        </div>
      </form>}

      {isOwner ? <section className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5"><p className="text-xs font-black uppercase tracking-[.16em] text-[#B4232C]">New employee</p><h2 className="mt-1 text-lg font-black">Add an account</h2><p className="mt-1 text-sm text-muted-foreground">New accounts start inactive and cannot sign in until activated.</p></div>
        <form onSubmit={(event) => { if (employeePassword !== confirmEmployeePassword) { event.preventDefault(); setError("The employee passwords do not match."); return; } void createEmployee(event); }} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-2"><Label htmlFor="staff-username">Name / username</Label><Input id="staff-username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Employee name" /></div>
          <div className="space-y-2"><Label htmlFor="staff-email">Email</Label><Input id="staff-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="name@example.com" /></div>
          <div className="space-y-2"><Label htmlFor="staff-phone">Mobile number</Label><Input id="staff-phone" value={phone} onChange={(event) => setPhone(event.target.value)} required placeholder="Employee phone" /></div>
          <div className="space-y-2"><Label htmlFor="staff-role">Role</Label><select id="staff-role" value={role} onChange={(event) => { const nextRole = event.target.value as StaffRole; setRole(nextRole); setPermissions(current => current.filter(permission => !permissionBlockedForRole(nextRole, permission))); }} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="admin">Admin</option><option value="editor">Editor</option><option value="customer_support">Customer support</option><option value="data_entry">Data entry</option></select></div>
          <div className="space-y-2"><Label htmlFor="staff-password">Initial password</Label><Input id="staff-password" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={employeePassword} onChange={(event) => setEmployeePassword(event.target.value)} required /><p className="text-xs text-muted-foreground">At least 12 characters; must be unique across Owner and employee accounts.</p></div>
          <div className="space-y-2"><Label htmlFor="staff-password-confirm">Confirm password</Label><Input id="staff-password-confirm" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirmEmployeePassword} onChange={(event) => setConfirmEmployeePassword(event.target.value)} required /></div>
          <fieldset className="sm:col-span-2 xl:col-span-4"><legend className="mb-2 text-sm font-bold">Permissions</legend><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {permissionOptions.map(([key, label]) => <label key={key} className="flex items-center gap-2 rounded-lg border border-black/5 px-3 py-2 text-sm"><input type="checkbox" disabled={permissionBlockedForRole(role, key)} checked={permissions.includes(key)} onChange={(event) => setPermissions((current) => event.target.checked ? [...current, key] : current.filter((value) => value !== key))} />{label}</label>)}
          </div></fieldset>
          <div className="sm:col-span-2 xl:col-span-4"><Button type="submit" disabled={saving} className="bg-[#B4232C] hover:bg-[#941D24]">{saving ? "Creating…" : "Create employee account"}</Button></div>
        </form>
      </section> : <p className="rounded-xl border border-[#E9D8D4] bg-white p-4 text-sm text-[#625650]">Only the Owner can create employee accounts and set their passwords.</p>}

      <section className="rounded-2xl border border-black/5 bg-white shadow-sm">
        <div className="border-b border-black/5 p-5 sm:p-6"><p className="text-xs font-black uppercase tracking-[.16em] text-[#B4232C]">Access directory</p><h2 className="mt-1 text-lg font-black">Employee accounts</h2></div>
        {loading ? <p role="status" className="p-6 text-sm text-muted-foreground">Loading employee accounts…</p> : staff.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No admin employee accounts were found.</p> : <div className="divide-y divide-black/5">{staff.map((employee) => <EmployeeRow key={employee.id} employee={employee} saving={saving} onSave={saveEmployee} onSetPassword={setEmployeePasswordFor} onDelete={removeEmployee} canEdit={isOwner} />)}</div>}
      </section>

      {canViewActivity && <section className="rounded-2xl border border-black/5 bg-white shadow-sm">
        <div className="border-b border-black/5 p-5 sm:p-6"><p className="text-xs font-black uppercase tracking-[.16em] text-[#B4232C]">Audit trail</p><h2 className="mt-1 text-lg font-black">Recent admin activity</h2></div>
        {activity.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No logged activity yet.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-[#FAF8F5] text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-5 py-3">Time</th><th className="px-5 py-3">Employee</th><th className="px-5 py-3">Action</th><th className="px-5 py-3">Resource</th><th className="px-5 py-3">Result</th></tr></thead><tbody>{activity.map((entry) => <tr key={entry.id} className="border-t border-black/5"><td className="px-5 py-3">{formatDate(entry.created_at)}</td><td className="px-5 py-3">{entry.actor_username || "Unknown"}</td><td className="px-5 py-3">{entry.action}</td><td className="max-w-[240px] truncate px-5 py-3">{entry.resource || "—"}</td><td className="px-5 py-3">{entry.http_status ?? "—"}</td></tr>)}</tbody></table></div>}
      </section>}
    </div>
  </AdminShell>;
}

function EmployeeRow({ employee, saving, onSave, onSetPassword, onDelete, canEdit }: { employee: StaffAccount; saving: boolean; onSave: (employee: StaffAccount, changes: Partial<StaffAccount>) => Promise<void>; onSetPassword: (employee: StaffAccount, password: string) => Promise<boolean>; onDelete: (employee: StaffAccount) => Promise<void>; canEdit: boolean }) {
  const [role, setRole] = useState(employee.role);
  const [permissions, setPermissions] = useState(employee.permissions || []);
  const [active, setActive] = useState(employee.is_active);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  useEffect(() => { setRole(employee.role); setPermissions(employee.permissions || []); setActive(employee.is_active); }, [employee]);
  const changed = role !== employee.role || active !== employee.is_active || JSON.stringify(permissions) !== JSON.stringify(employee.permissions || []);
  return <article className="grid gap-4 p-5 sm:p-6 xl:grid-cols-[minmax(200px,1fr)_180px_160px_auto] xl:items-start">
    <div className="min-w-0"><p className="truncate font-black">{employee.username}</p><p className="mt-1 truncate text-sm text-muted-foreground">{employee.email}</p><p className="mt-1 text-xs text-muted-foreground">{employee.phone} · Last login: {formatDate(employee.last_login_at)}</p><p className="mt-2 text-xs text-muted-foreground">{employee.permissions.length ? employee.permissions.length + " permissions" : "No assigned permissions"}</p></div>
    <div className="space-y-2"><Label htmlFor={`role-${employee.id}`}>Role</Label><select id={`role-${employee.id}`} disabled={!canEdit || employee.role === "owner"} value={role} onChange={(event) => { const nextRole = event.target.value as StaffRole; setRole(nextRole); setPermissions(current => current.filter(permission => !permissionBlockedForRole(nextRole, permission))); }} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">{employee.role === "owner" && <option value="owner">Owner</option>}<option value="admin">Admin</option><option value="editor">Editor</option><option value="customer_support">Customer support</option><option value="data_entry">Data entry</option></select></div>
    <div className="space-y-2"><Label htmlFor={`active-${employee.id}`}>Account access</Label><label className="flex h-10 items-center gap-2 rounded-md border border-input px-3 text-sm"><input id={`active-${employee.id}`} type="checkbox" disabled={!canEdit || employee.role === "owner"} checked={active} onChange={(event) => setActive(event.target.checked)} />{active ? "Active" : "Inactive"}</label></div>
    <div className="flex flex-wrap gap-2 xl:justify-end"><details className="w-full"><summary className="cursor-pointer text-sm font-bold text-[#9F2029]">Assigned permissions</summary><div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">{permissionOptions.map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={!canEdit || employee.role === "owner" || permissionBlockedForRole(role, key)} checked={permissions.includes(key)} onChange={(event) => setPermissions((current) => event.target.checked ? [...current, key] : current.filter((value) => value !== key))} />{label}</label>)}</div></details>{canEdit && employee.role !== "owner" && <><Button type="button" variant="outline" disabled={saving || !changed} onClick={() => void onSave(employee, { role, permissions, is_active: active })}>Save access</Button><details className="w-full"><summary className="cursor-pointer text-sm font-bold text-[#9F2029]">Set employee password</summary><form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); setPasswordError(""); if (newPassword !== confirmPassword) { setPasswordError("Passwords do not match."); return; } void onSetPassword(employee, newPassword).then((saved) => { if (saved) { setNewPassword(""); setConfirmPassword(""); } }); }}><Input type="password" autoComplete="new-password" minLength={12} maxLength={128} placeholder="New password (12+ characters)" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required aria-label={`New password for ${employee.username}`} /><Input type="password" autoComplete="new-password" minLength={12} maxLength={128} placeholder="Confirm new password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required aria-label={`Confirm password for ${employee.username}`} />{passwordError && <p role="alert" className="text-sm text-red-700 sm:col-span-2">{passwordError}</p>}<Button type="submit" variant="outline" disabled={saving} className="sm:col-span-2">{saving ? "Saving…" : "Update password"}</Button></form></details><Button type="button" variant="outline" disabled={saving} className="border-red-200 text-[#B4232C] hover:bg-red-50 hover:text-[#941D24]" onClick={() => void onDelete(employee)}>Remove account</Button></>}</div>
  </article>;
}
