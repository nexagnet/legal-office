declare const tenantIdBrand: unique symbol;

/** Opaque tenant identifier. Only create it through `toTenantId`. */
export type TenantId = string & { readonly [tenantIdBrand]: true };

export function toTenantId(value: string): TenantId {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error('TenantId must not be empty');
  }
  return trimmed as TenantId;
}
