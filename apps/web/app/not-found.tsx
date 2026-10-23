import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="state" role="status">
      <h1>Không tìm thấy trang</h1>
      <p>Đường dẫn không đúng hoặc hồ sơ đã bị di chuyển.</p>
      <Link href="/" className="secondary">
        Về trang chủ
      </Link>
    </section>
  );
}
