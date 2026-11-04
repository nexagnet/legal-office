import { redirect } from 'next/navigation';

/** Màn nghiệp vụ cũ đã gỡ; mở màn tương ứng của DMS. */
export default function Legacy(): never {
  redirect('/dms');
}
