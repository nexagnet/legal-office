// Dữ liệu vào để dựng bản nháp biểu mẫu. TOÀN BỘ trường đều tùy chọn: trường thiếu giữ nguyên
// chỗ chấm gốc của mẫu. Đường dẫn trường (ví dụ `office.name`, `requester.person.fullName`)
// trùng với khóa `{{...}}` trong ./templates.
//
// Ngày: chuỗi ISO `YYYY-MM-DD`. Tiền: số nguyên đồng hoặc chuỗi đã định dạng.

export type IsoDate = string;
export type Amount = number | string;

export interface OfficeInput {
  name?: string;
  address?: string;
  /** Họ tên người đại diện (Trưởng văn phòng). Chức vụ là chữ cố định của mẫu. */
  representative?: string;
  businessRegNo?: string;
  businessRegDate?: IsoDate;
  bankAccount?: string;
  bankName?: string;
  taxCode?: string;
}

export interface OrganizationInput {
  name?: string;
  address?: string;
  representative?: string;
  representativeTitle?: string;
  bankAccount?: string;
  bankName?: string;
  taxCode?: string;
}

export interface PersonInput {
  fullName?: string;
  address?: string;
  idNumber?: string;
  idIssueDate?: IsoDate;
  idIssuePlace?: string;
}

/** Bên B: cơ quan/tổ chức hoặc cá nhân (mẫu in cả hai phương án, "(hoặc)"). */
export interface PartyInput {
  organization?: OrganizationInput;
  person?: PersonInput;
}

export interface ContractCommonInput {
  office?: OfficeInput;
  signPlace?: string;
  signDate?: IsoDate;
  /** Phần số thứ tự trong "Số: ....../(năm)/..." */
  contractSeq?: string | number;
  contractYear?: string | number;
  effectiveDate?: IsoDate;
}

export interface PaymentInput {
  days?: string | number;
  from?: IsoDate;
}

export interface JudgmentInput {
  no?: string;
  date?: IsoDate;
  court?: string;
}

export interface MomentInput {
  startHour?: string | number;
  startMinute?: string | number;
  startDate?: IsoDate;
  place?: string;
  placeDetail?: string;
}

// --- N-01 -----------------------------------------------------------------------------
export type N01RequesterKind = 'COURT' | 'PROCURACY' | 'ENFORCEMENT_AGENCY';

export interface TongDatItem {
  title: string;
  deadline?: string;
  cost?: Amount;
  note?: string;
}

export interface N01Input extends ContractCommonInput {
  requester?: {
    /** Quyết định dòng nào của mẫu được điền: Tòa án / Viện kiểm sát / Cơ quan THADS. */
    kind: N01RequesterKind;
    name?: string;
    address?: string;
    representative?: string;
    representativeTitle?: string;
    bankAccount?: string;
    taxCode?: string;
  };
  payment?: PaymentInput;
  items?: TongDatItem[];
  totalCost?: Amount;
  totalCostWords?: string;
}

// --- N-02 -----------------------------------------------------------------------------
export interface N02Input extends MomentInput {
  office?: Pick<OfficeInput, 'name'>;
  thv?: { name?: string };
  recorder?: { name?: string; title?: string };
  /** Mỗi phần tử một giấy tờ, hồ sơ, tài liệu đã tống đạt. */
  documents?: string[];
  recipient?: { name?: string; address?: string };
  endHour?: string | number;
  endMinute?: string | number;
}

// --- N-03 -----------------------------------------------------------------------------
export interface N03Input extends ContractCommonInput {
  requester?: PartyInput;
  /** Sự kiện, hành vi cần lập vi bằng; mỗi dòng một đoạn. */
  subjectMatter?: string;
  deadlineDays?: string | number;
  deadlineFrom?: IsoDate;
  fee?: { amount?: Amount; total?: Amount; totalWords?: string };
  payment?: PaymentInput;
}

// --- N-04 -----------------------------------------------------------------------------
export interface N04Person {
  name?: string;
  address?: string;
  idNumber?: string;
  idIssueDate?: IsoDate;
  idIssuePlace?: string;
}

export interface N04Input extends MomentInput {
  office?: Pick<OfficeInput, 'name'>;
  vibangSeq?: string | number;
  vibangYear?: string | number;
  thv?: { name?: string; cardNo?: string; cardIssueDate?: IsoDate };
  requester?: N04Person;
  participant?: N04Person;
  eventTitle?: string;
  eventContent?: string;
  eventEnd?: { hour?: string | number; minute?: string | number; date?: IsoDate };
  attachments?: string[];
  copies?: string | number;
  doneHour?: string | number;
  doneMinute?: string | number;
  doneDate?: IsoDate;
}

// --- N-05 -----------------------------------------------------------------------------
export interface N05Input extends ContractCommonInput {
  requester?: PartyInput;
  /** Người/tổ chức bị xác minh điều kiện thi hành án. */
  subject?: PartyInput;
  deadlineText?: string;
  verificationContent?: string;
  fee?: { total?: Amount; totalWords?: string };
  payment?: PaymentInput;
}

// --- N-06 -----------------------------------------------------------------------------
export interface N06Input {
  office?: Pick<OfficeInput, 'name'>;
  decisionSeq?: string | number;
  signPlace?: string;
  signDate?: IsoDate;
  judgment?: JudgmentInput;
  enforcementDecision?: { no?: string; date?: IsoDate; office?: string };
  contract?: { no?: string; date?: IsoDate; signedWith?: string; signedWithAddress?: string };
  subject?: { name?: string; address?: string };
  verificationMethod?: string;
  assignedThv?: { name?: string };
}

// --- N-07 -----------------------------------------------------------------------------
export interface N07Input extends ContractCommonInput {
  requester?: PartyInput;
  enforcementSubject?: string;
  judgment?: JudgmentInput;
  deadlineMonths?: string | number;
  fee?: { verification?: Amount; percent?: string | number; minimum?: Amount; advance?: Amount };
  payment?: PaymentInput;
}

// --- N-08 -----------------------------------------------------------------------------
export interface N08Input extends MomentInput {
  office?: Pick<OfficeInput, 'name'>;
  signPlace?: string;
  signDate?: IsoDate;
  giver?: { name?: string; title?: string; office?: string };
  receiver?: { name?: string; title?: string; organization?: string };
  justiceDept?: { name?: string; title?: string; province?: string };
  fileCount?: string | number;
  fileCondition?: string;
  documents?: string;
  accountingVouchers?: string;
  otherDocuments?: string;
  storageDevices?: string;
  systemData?: string;
  otherFiles?: string;
  opinions?: string;
  endHour?: string | number;
  endMinute?: string | number;
  copies?: {
    giver?: string | number;
    receiver?: string | number;
    justiceDept?: string | number;
    file?: string | number;
  };
}

// --- N-11 -----------------------------------------------------------------------------
export interface CorrectionRow {
  location: string;
  before: string;
  after: string;
}

export interface N11Input {
  office?: Pick<OfficeInput, 'name'>;
  signPlace?: string;
  signDate?: IsoDate;
  vibang?: { number?: string; date?: IsoDate };
  thv?: { name?: string; cardNo?: string };
  requester?: { name?: string };
  corrections?: CorrectionRow[];
  reason?: string;
  copies?: string | number;
  /**
   * Thừa hành viên đã lập vi bằng còn hành nghề tại văn phòng này không?
   * `true` -> chức danh ký "THỪA HÀNH VIÊN"; `false` -> "TRƯỞNG VĂN PHÒNG"
   * (docs/product/business-decisions-2026-10-16.md, mục A, dòng "Ai ký pháp lý").
   * Bỏ trống -> giữ nguyên chữ "THỪA HÀNH VIÊN/TRƯỞNG VĂN PHÒNG" để người có thẩm quyền chọn.
   */
  thvStillPracticing?: boolean;
  handedDate?: IsoDate;
}

export interface FormInputMap {
  'N-01': N01Input;
  'N-02': N02Input;
  'N-03': N03Input;
  'N-04': N04Input;
  'N-05': N05Input;
  'N-06': N06Input;
  'N-07': N07Input;
  'N-08': N08Input;
  'N-11': N11Input;
}
