import { redirect } from 'next/navigation';
import { currentSession } from '../../lib/server';

export const dynamic = 'force-dynamic';

/** Trang gốc chỉ chuyển tới mục đầu tiên của vai; mỗi mục là một trang riêng. */
export default async function AdminIndex() {
  const session = await currentSession();
  redirect(
    session.status === 'authenticated' && session.roles.includes('ADMIN')
      ? '/quan-tri/nhan-su'
      : '/quan-tri/phan-quyen',
  );
}
