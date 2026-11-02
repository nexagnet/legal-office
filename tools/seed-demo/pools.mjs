// Dữ liệu GIẢ hoàn toàn (bịa): tên người, địa chỉ, cơ quan... Không lấy từ khách thật.
export const HO = [
  'Nguyễn',
  'Trần',
  'Lê',
  'Phạm',
  'Hoàng',
  'Vũ',
  'Đặng',
  'Bùi',
  'Đỗ',
  'Ngô',
  'Dương',
  'Lý',
];
export const DEM_NAM = ['Văn', 'Hữu', 'Quang', 'Minh', 'Đức', 'Thành', 'Xuân', 'Ngọc', 'Gia'];
export const DEM_NU = ['Thị', 'Ngọc', 'Thu', 'Phương', 'Khánh', 'Bích', 'Hồng'];
export const TEN_NAM = [
  'Hùng',
  'Dũng',
  'Cường',
  'Tuấn',
  'Long',
  'Phúc',
  'Sơn',
  'Hải',
  'Nam',
  'Thắng',
  'Khoa',
  'Bình',
  'Trung',
  'Việt',
];
export const TEN_NU = [
  'Lan',
  'Mai',
  'Hoa',
  'Hạnh',
  'Thảo',
  'Linh',
  'Huyền',
  'Nga',
  'Trang',
  'Yến',
  'Oanh',
  'Vân',
  'Châu',
];
export const CONG_TY = [
  'Công ty TNHH Xây dựng Hà Thành',
  'Công ty Cổ phần Thương mại Đại Phát',
  'Công ty TNHH Vận tải Bắc Việt',
  'Công ty Cổ phần Đầu tư Sao Mai',
  'Công ty TNHH Thiết bị Y tế An Khang',
  'Công ty Cổ phần Nội thất Việt Hưng',
  'Công ty TNHH Dịch vụ Logistics Thăng Long',
  'Công ty Cổ phần Bất động sản Hải Âu',
  'Ngân hàng TMCP Đông Nam (chi nhánh Hà Nội)',
  'Công ty TNHH May mặc Phú Xuân',
  'Công ty Cổ phần Thực phẩm Sông Hồng',
  'Công ty TNHH Công nghệ Minh Quang',
];
export const DUONG = [
  'Phố Huế',
  'Trần Khát Chân',
  'Lê Thanh Nghị',
  'Bạch Mai',
  'Nguyễn An Ninh',
  'Hoàng Mai',
  'Giải Phóng',
  'Kim Mã',
  'Láng Hạ',
  'Nguyễn Trãi',
  'Lạch Tray',
  'Hùng Vương',
  'Lê Duẩn',
  'Trường Chinh',
];
// [xã/phường/đặc khu, tỉnh/thành phố]
export const PHUONG_TINH = [
  ['phường Bạch Mai', 'thành phố Hà Nội'],
  ['phường Thanh Nhàn', 'thành phố Hà Nội'],
  ['phường Giảng Võ', 'thành phố Hà Nội'],
  ['phường Hoàng Mai', 'thành phố Hà Nội'],
  ['xã Đông Anh', 'thành phố Hà Nội'],
  ['phường Lạch Tray', 'thành phố Hải Phòng'],
  ['phường Hải An', 'thành phố Hải Phòng'],
  ['phường Hải Châu', 'thành phố Đà Nẵng'],
  ['phường Thanh Khê', 'thành phố Đà Nẵng'],
  ['phường Bến Nghé', 'Thành phố Hồ Chí Minh'],
  ['phường Tân Định', 'Thành phố Hồ Chí Minh'],
  ['phường Vinh Phú', 'tỉnh Nghệ An'],
  ['phường Quang Trung', 'tỉnh Thái Nguyên'],
  ['phường Kinh Bắc', 'tỉnh Bắc Ninh'],
  ['xã Phù Đổng', 'thành phố Hà Nội'],
];
export const TOA_AN = [
  'Tòa án nhân dân quận Hai Bà Trưng',
  'Tòa án nhân dân khu vực 3 - Hà Nội',
  'Tòa án nhân dân thành phố Hải Phòng',
  'Tòa án nhân dân khu vực 1 - Đà Nẵng',
  'Tòa án nhân dân thành phố Thái Nguyên',
  'Tòa án nhân dân khu vực 2 - Bắc Ninh',
];
export const CO_QUAN_THA = [
  'Thi hành án dân sự thành phố Hà Nội',
  'Thi hành án dân sự thành phố Hải Phòng',
  'Thi hành án dân sự khu vực 4 - Đà Nẵng',
  'Thi hành án dân sự tỉnh Thái Nguyên',
];
export const THV = [
  ['Trần Minh Đức', '001/TPL-HN'],
  ['Lê Thị Bích Ngọc', '014/TPL-HN'],
  ['Phạm Quang Huy', '027/TPL-HP'],
  ['Nguyễn Hồng Vân', '033/TPL-HN'],
  ['Đặng Xuân Trường', '045/TPL-ĐN'],
  ['Vũ Thu Hà', '052/TPL-HN'],
];
export const NOI_DUNG_VI_BANG = [
  'Ghi nhận hiện trạng thửa đất và công trình xây dựng trên đất',
  'Ghi nhận việc giao nhận tiền đặt cọc mua bán căn hộ',
  'Ghi nhận nội dung hiển thị trên trang web bán hàng',
  'Ghi nhận tin nhắn Zalo thỏa thuận giao hàng',
  'Ghi nhận tình trạng hàng hóa tại kho trước khi bàn giao',
  'Ghi nhận việc đóng cửa, ngừng kinh doanh của cửa hàng',
  'Ghi nhận hiện trạng nhà cho thuê khi trả mặt bằng',
  'Ghi nhận việc lắp đặt biển hiệu trên mặt tiền',
  'Ghi nhận sự kiện khai trương và số lượng khách tham dự',
  'Ghi nhận hiện trạng tường rào lấn ranh giới đất',
];
export const LOAI_VAN_BAN = [
  'Quyết định thi hành án',
  'Giấy báo thi hành án',
  'Bản án',
  'Quyết định áp dụng biện pháp bảo đảm',
  'Giấy triệu tập',
  'Thông báo về việc thi hành án',
  'Quyết định cưỡng chế',
  'Giấy mời xác minh',
];
export const HINH_THUC_TONG_DAT = [
  'Trực tiếp cho người được tống đạt',
  'Niêm yết tại trụ sở UBND phường',
  'Gửi qua bưu điện có báo phát',
  'Trao cho người đại diện hợp pháp',
  'Trực tiếp tại nơi cư trú, có người làm chứng',
];
export const NOI_DUNG_XAC_MINH = [
  'Xác minh nơi cư trú và tài sản đứng tên người phải thi hành án',
  'Xác minh số dư tài khoản tại ngân hàng',
  'Xác minh thu nhập từ tiền lương tại đơn vị công tác',
  'Xác minh quyền sử dụng đất và tài sản gắn liền với đất',
  'Xác minh phương tiện giao thông đăng ký đứng tên',
  'Xác minh việc kinh doanh tại địa điểm đã đăng ký',
];
export const KET_QUA_XAC_MINH = [
  'Có điều kiện thi hành án: có nhà đất đứng tên, đã lập biên bản',
  'Chưa có điều kiện thi hành án: không phát hiện tài sản',
  'Có điều kiện một phần: có lương hàng tháng 12.000.000 đồng',
  'Có điều kiện: số dư tài khoản đủ để khấu trừ',
  'Chưa xác định được nơi cư trú hiện tại, sẽ xác minh lại',
  'Có điều kiện: sở hữu 01 xe ô tô, đã đề nghị phong tỏa',
];
export const KHOAN_THA = [
  'Trả nợ gốc theo hợp đồng vay số {n}: {a} đồng; lãi chậm trả: {b} đồng',
  'Bồi thường thiệt hại do vi phạm hợp đồng: {a} đồng; án phí: {b} đồng',
  'Thanh toán tiền hàng còn thiếu: {a} đồng; lãi suất chậm thanh toán: {b} đồng',
  'Hoàn trả tiền đặt cọc: {a} đồng; tiền phạt cọc: {b} đồng',
  'Trả tiền thuê mặt bằng còn nợ: {a} đồng; tiền điện nước: {b} đồng',
];
export const KET_QUA_THA = [
  'Đã thi hành xong toàn bộ',
  'Đã thi hành một phần, còn lại đang tiếp tục',
  'Đang thi hành, đã kê biên tài sản',
  'Đã thi hành xong, đã thu đủ phí dịch vụ',
  'Người phải thi hành án tự nguyện thi hành',
  'Tạm hoãn do đang giải quyết khiếu nại',
];
