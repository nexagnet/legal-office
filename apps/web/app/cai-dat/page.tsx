import { redirect } from 'next/navigation';

/** Cài đặt văn phòng nay nằm trong mục Quản trị. */
export default function LegacySettings(): never {
  redirect('/quan-tri/cai-dat');
}
