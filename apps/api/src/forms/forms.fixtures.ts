// Dữ liệu TỔNG HỢP (giả) cho test biểu mẫu. Không có dữ liệu khách thật ở đây.
import type {
  FormInputMap,
  N01Input,
  N02Input,
  N03Input,
  N04Input,
  N05Input,
  N06Input,
  N07Input,
  N08Input,
  N11Input,
} from './form-input';

const office = {
  name: 'Mẫu Thử Nghiệm',
  address: 'Số 1 đường Mẫu, phường Thử, thành phố Giả',
  representative: 'Trần Văn Mẫu',
  businessRegNo: '0000000001',
  businessRegDate: '2026-06-01',
  bankAccount: '000000000001',
  bankName: 'Ngân hàng Thử Nghiệm',
  taxCode: '0000000001-001',
};
const organization = {
  name: 'Công ty Giả Lập',
  address: 'Số 2 đường Giả, phường Mẫu, thành phố Thử',
  representative: 'Lê Thị Giả',
  representativeTitle: 'Giám đốc',
  bankAccount: '000000000002',
  bankName: 'Ngân hàng Giả Lập',
  taxCode: '0000000002',
};
const person = {
  fullName: 'Nguyễn Văn Mẫu',
  address: 'Số 3 ngõ Thử, phường Giả, thành phố Mẫu',
  idNumber: '000000000003',
  idIssueDate: '2024-03-05',
  idIssuePlace: 'Cục Mẫu',
};
const common = {
  office,
  signPlace: 'Thành phố Giả',
  signDate: '2026-10-05',
  contractSeq: '007',
  contractYear: 2026,
  effectiveDate: '2026-10-06',
};

export const N01: N01Input = {
  ...common,
  requester: {
    kind: 'COURT',
    name: 'Giả Lập khu vực 1',
    address: 'Số 4 đường Thử',
    representative: 'Phạm Văn Giả',
    representativeTitle: 'Chánh án',
    bankAccount: '000000000004',
    taxCode: '0000000004',
  },
  payment: { days: 30, from: '2026-10-31' },
  items: [
    { title: 'Giấy triệu tập số 01/GT-MẪU', deadline: '03 ngày', cost: 50000, note: 'Mẫu' },
    { title: 'Thông báo số 02/TB-MẪU', deadline: '05 ngày', cost: 75000 },
  ],
  totalCost: 125000,
  totalCostWords: 'Một trăm hai mươi lăm nghìn đồng',
};

export const N02: N02Input = {
  office: { name: 'Mẫu Thử Nghiệm' },
  startHour: '09',
  startMinute: '30',
  startDate: '2026-10-07',
  place: 'số 5 đường Thử, phường Giả',
  placeDetail: 'thành phố Mẫu',
  thv: { name: 'Hoàng Văn Thử' },
  recorder: { name: 'Vũ Thị Mẫu', title: 'Thư ký nghiệp vụ' },
  documents: ['Giấy triệu tập số 01/GT-MẪU', 'Thông báo số 02/TB-MẪU'],
  recipient: { name: 'Nguyễn Văn Mẫu', address: 'Số 3 ngõ Thử, phường Giả' },
  endHour: '09',
  endMinute: '50',
};

export const N03: N03Input = {
  ...common,
  requester: { organization, person },
  subjectMatter: 'Ghi nhận việc giao nhận tài sản mẫu tại địa chỉ số 6 đường Giả',
  deadlineDays: 5,
  deadlineFrom: '2026-10-06',
  fee: { amount: 1500000, total: 1500000, totalWords: 'Một triệu năm trăm nghìn đồng' },
  payment: { days: 7, from: '2026-10-06' },
};

export const N04: N04Input = {
  office: { name: 'Mẫu Thử Nghiệm' },
  vibangSeq: '012',
  vibangYear: 2026,
  startHour: '14',
  startMinute: '00',
  startDate: '2026-10-08',
  place: 'số 7 đường Giả',
  placeDetail: 'phường Thử, thành phố Mẫu',
  thv: { name: 'Hoàng Văn Thử', cardNo: 'THV-MAU-001', cardIssueDate: '2026-07-01' },
  requester: {
    name: 'Nguyễn Văn Mẫu',
    address: 'Số 3 ngõ Thử',
    idNumber: '000000000003',
    idIssueDate: '2024-03-05',
    idIssuePlace: 'Cục Mẫu',
  },
  participant: {
    name: 'Lê Văn Giả',
    address: 'Số 8 ngõ Mẫu',
    idNumber: '000000000008',
    idIssueDate: '2023-01-02',
    idIssuePlace: 'Cục Giả',
  },
  eventTitle: 'Hiện trạng công trình mẫu',
  eventContent: 'Công trình mẫu có hai tầng.\nMặt tiền hướng đông.',
  eventEnd: { hour: '15', minute: '10', date: '2026-10-08' },
  attachments: ['Ảnh chụp hiện trạng số 1', 'Ảnh chụp hiện trạng số 2'],
  copies: 3,
  doneHour: '15',
  doneMinute: '30',
  doneDate: '2026-10-08',
};

export const N05: N05Input = {
  ...common,
  requester: { organization, person },
  subject: { person, organization },
  deadlineText: '10 ngày',
  verificationContent: 'Xác minh tài sản đứng tên người phải thi hành án',
  fee: { total: 2000000, totalWords: 'Hai triệu đồng' },
  payment: { days: 5, from: '2026-10-06' },
};

export const N06: N06Input = {
  office: { name: 'Mẫu Thử Nghiệm' },
  decisionSeq: '003',
  signPlace: 'Thành phố Giả',
  signDate: '2026-10-09',
  judgment: { no: '12/2026/DS-ST', date: '2026-05-05', court: 'Giả Lập khu vực 1' },
  enforcementDecision: { no: '34/QĐ-THA', date: '2026-06-06', office: 'Giả Lập khu vực 1' },
  contract: {
    no: '007/2026/HĐDV-XM',
    date: '2026-10-05',
    signedWith: 'Công ty Giả Lập',
    signedWithAddress: 'Số 2 đường Giả',
  },
  subject: { name: 'Nguyễn Văn Mẫu', address: 'Số 3 ngõ Thử' },
  verificationMethod: 'Trực tiếp xác minh tại nơi cư trú',
  assignedThv: { name: 'Hoàng Văn Thử' },
};

export const N07: N07Input = {
  ...common,
  requester: { organization, person },
  enforcementSubject: 'Khoản tiền mẫu theo bản án',
  judgment: { no: '12/2026/DS-ST', date: '2026-05-05', court: 'Giả Lập khu vực 1' },
  deadlineMonths: 6,
  fee: { verification: 500000, percent: 5, minimum: 1000000, advance: 2000000 },
  payment: { days: 10, from: '2026-10-06' },
};

export const N08: N08Input = {
  office: { name: 'Mẫu Thử Nghiệm' },
  signPlace: 'Thành phố Giả',
  signDate: '2026-10-10',
  startHour: '08',
  startMinute: '15',
  startDate: '2026-10-10',
  place: 'Trụ sở văn phòng mẫu',
  giver: { name: 'Hoàng Văn Thử', title: 'Thừa hành viên', office: 'Mẫu Thử Nghiệm' },
  receiver: { name: 'Vũ Thị Mẫu', title: 'Chuyên viên', organization: 'Văn phòng Giả Lập' },
  justiceDept: { name: 'Lê Văn Giả', title: 'Phó Giám đốc', province: 'Giả' },
  fileCount: 12,
  fileCondition: 'Nguyên vẹn',
  documents: 'Bộ hồ sơ mẫu',
  accountingVouchers: 'Biên lai mẫu',
  otherDocuments: 'Không',
  storageDevices: 'Một USB mẫu',
  systemData: 'Đã xuất tệp mẫu',
  otherFiles: 'Không có',
  opinions: 'Không có ý kiến',
  endHour: '09',
  endMinute: '00',
  copies: { giver: 1, receiver: 1, justiceDept: 1, file: 1 },
};

export const N11: N11Input = {
  office: { name: 'Mẫu Thử Nghiệm' },
  signPlace: 'Thành phố Giả',
  signDate: '2026-10-12',
  vibang: { number: '012/2026/VB-THV', date: '2026-10-08' },
  thv: { name: 'Hoàng Văn Thử', cardNo: 'THV-MAU-001' },
  requester: { name: 'Nguyễn Văn Mẫu' },
  corrections: [
    { location: 'Trang 2, dòng 5', before: 'Ngày 08/10/2062', after: 'Ngày 08/10/2026' },
  ],
  reason: 'Sai sót khi đánh máy',
  copies: 2,
  thvStillPracticing: true,
  handedDate: '2026-10-12',
};

export const FULL_INPUTS: FormInputMap = {
  'N-01': N01,
  'N-02': N02,
  'N-03': N03,
  'N-04': N04,
  'N-05': N05,
  'N-06': N06,
  'N-07': N07,
  'N-08': N08,
  'N-11': N11,
};
