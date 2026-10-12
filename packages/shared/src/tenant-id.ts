declare const tenantIdBrand: unique symbol;

/** Opaque identifier of a tenant; prevents mixing with arbitrary strings. */
export type TenantId = string & { readonly [tenantIdBrand]: true };

export function toTenantId(value: string): TenantId {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error('TenantId must not be empty');
  }
  return trimmed as TenantId;
}
