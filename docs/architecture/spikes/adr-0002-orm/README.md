# Spike ADR-0002: Prisma vs Drizzle (synthetic, disposable)

Không thuộc pnpm workspace, không có schema nghiệp vụ lâu dài, không dữ liệu thật. Chỉ có 3 bảng giả
lập: `counters` (đánh số hồ sơ theo năm), `obligations`, `audit_log`.

`drizzle/schema.mjs` là bản JS của `drizzle/schema.ts` (Node không import trực tiếp `.ts`).

## Chạy lại

```bash
# PostgreSQL tạm (ví dụ: initdb ở thư mục tạm, cổng 54329), tạo 2 DB: spike, spike_d
npm install
DATABASE_URL=postgresql://postgres@127.0.0.1:54329/spike npx prisma migrate dev --name init
DRIZZLE_URL=postgresql://postgres@127.0.0.1:54329/spike_d npx drizzle-kit migrate
psql -d spike -f rls.sql && psql -d spike_d -f rls.sql    # role app_user + RLS (SQL tay cho cả hai)
node run-prisma.mjs && node run-drizzle.mjs
```

Prisma 6.19.3, Drizzle ORM 0.45.4 / drizzle-kit 0.31.11, pg 8.23.1, PostgreSQL 16.

## Kết quả đo (12/10/2026)

Cùng một thao tác ở cả hai ORM: 100 transaction đồng thời cấp số `INSERT … ON CONFLICT DO UPDATE SET seq = seq + 1 RETURNING seq`, trong đó 20 transaction ném lỗi sau khi cấp số.

| Phép thử | Prisma | Drizzle |
|---|---|---|
| 100 giao dịch song song, 20 rollback | 80 commit, 80 số duy nhất, liền mạch 1..80, `seq` cuối = 80 | giống hệt |
| Audit + obligation trong 1 transaction, obligation trùng khoá | lỗi `P2002`, 0 audit mồ côi | lỗi `23505`, 0 audit mồ côi |
| RLS: tenant khác / không có ngữ cảnh | thấy 0 dòng; ghi chéo tenant bị chặn | thấy 0 dòng; ghi chéo tenant bị chặn (`42501`) |
| Migration lỗi giữa chừng | DDL rollback sạch, nhưng DB vào trạng thái "failed", chặn mọi migration sau tới khi `migrate resolve` | DDL rollback sạch, không ghi nhận migration lỗi, chạy lại là thử lại |
| Migration lùi (down) | không có | không có |

Một lần chạy, 100 song song: ~135 ms mỗi bên. Đây là kiểm chứng tính đúng đắn, không phải benchmark hiệu năng.
