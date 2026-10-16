export type CustomerKind = 'PERSON' | 'ORGANIZATION';
export type ServiceKind = 'VI_BANG' | 'TONG_DAT' | 'XAC_MINH' | 'THI_HANH_AN';

export interface Customer {
  readonly id: string;
  readonly kind: CustomerKind;
  readonly externalRef: string;
  readonly displayName: string | null;
  readonly idNumber: string | null;
  readonly address: string | null;
  readonly phone: string | null;
  readonly taxCode: string | null;
  readonly representative: string | null;
}

export interface Contract {
  readonly id: string;
  readonly customerId: string;
  readonly externalRef: string;
  readonly serviceKind: ServiceKind | null;
  readonly signedOn: string | null;
  readonly validFrom: string | null;
  readonly validTo: string | null;
  readonly status: 'ACTIVE' | 'ENDED';
  readonly note: string | null;
}

export const SERVICE_KIND_LABEL: Record<ServiceKind, string> = {
  VI_BANG: 'Vi bằng',
  TONG_DAT: 'Tống đạt',
  XAC_MINH: 'Xác minh điều kiện THA',
  THI_HANH_AN: 'Tổ chức thi hành án',
};

export const CONTRACT_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Đang hiệu lực',
  ENDED: 'Đã kết thúc',
};

/** API trả ngày dạng ISO; ô nhập ngày chỉ nhận YYYY-MM-DD. */
export const dayValue = (v: string | null): string => (v ? v.slice(0, 10) : '');
