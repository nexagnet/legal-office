import { StageDialog } from '../../../components/StageDialog';
import { loadCase } from './case-frame';
import { STAGES, type StageCtx } from './stages';

/** Thao tác mở đè lên khung hồ sơ (route chặn `@modal`). Lỗi hiện ngay trong hộp thoại. */
export async function renderStageDialog(id: string, slug: string) {
  const def = STAGES[slug]!;
  const loaded = await loadCase(id);
  let content;
  if (loaded.kind !== 'ok' || !loaded.ctx.progress) {
    content = (
      <div className="state" role="alert">
        <h2>{loaded.kind === 'login' ? 'Cần đăng nhập' : 'Không tải được hồ sơ'}</h2>
        <p>Vui lòng thử lại sau.</p>
      </div>
    );
  } else {
    content = await def.body(loaded.ctx as StageCtx);
  }
  return (
    <StageDialog title={def.title} variant={def.variant}>
      <div data-stage={slug} className="stage-dialog">
        {content}
      </div>
    </StageDialog>
  );
}
