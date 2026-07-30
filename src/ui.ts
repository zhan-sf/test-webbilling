export const AUTHORIZATION_STORAGE_KEY = 'md-billing-payment-authorization'
export const TENANT_ID_STORAGE_KEY = 'md-billing-payment-tenant-id'

export function saveTenantId(tenantId: string) {
  const normalized = tenantId.trim()
  if (normalized) sessionStorage.setItem(TENANT_ID_STORAGE_KEY, normalized)
  else sessionStorage.removeItem(TENANT_ID_STORAGE_KEY)
}

export function formatAmount(amount: number) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency', currency: 'CNY', minimumFractionDigits: 2,
  }).format(amount)
}

export function formatCreditPoints(amount: number) {
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: 4,
  }).format(amount)
}
