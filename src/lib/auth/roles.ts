export const USER_ROLES = [
  "super_admin",
  "company_admin",
  "location_manager",
  "cashier",
  "kitchen",
  "inventory_manager",
  "finance_manager",
  "staff",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: "Super Admin",
  company_admin: "Company Admin",
  location_manager: "Location Manager",
  cashier: "Cashier",
  kitchen: "Kitchen",
  inventory_manager: "Inventory Manager",
  finance_manager: "Finance Manager",
  staff: "Staff",
};

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  super_admin: ["*"],
  company_admin: ["dashboard.view", "company.manage", "locations.manage", "brands.manage", "users.manage", "reports.view"],
  location_manager: ["dashboard.view", "orders.manage", "billing.manage", "inventory.manage", "staff.view", "reports.view"],
  cashier: ["dashboard.view", "orders.create", "orders.view", "billing.manage", "customers.view"],
  kitchen: ["orders.view", "orders.update_status", "kitchen_display.view"],
  inventory_manager: ["dashboard.view", "inventory.manage", "purchases.manage", "recipes.view", "reports.view"],
  finance_manager: ["dashboard.view", "finance.manage", "reports.view", "settlements.view"],
  staff: ["dashboard.view"],
};

export function hasPermission(role: UserRole, permission: string) {
  const permissions = ROLE_PERMISSIONS[role];
  return permissions.includes("*") || permissions.includes(permission);
}
