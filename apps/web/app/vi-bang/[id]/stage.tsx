import { type StageCtx, STAGES } from './stages';
import { renderCaseFrame } from './case-frame';

/** Màn thao tác mở thẳng bằng địa chỉ: nằm trong khung hồ sơ, không tab nào sáng (Figma N13 E7, E8). */
export async function renderStage(id: string, slug: string) {
  const def = STAGES[slug]!;
  return renderCaseFrame(id, null, async (ctx) => {
    if (!ctx.progress) {
      return (
        <div className="state" role="alert">
          <h2>Không tải được hồ sơ</h2>
          <p>Vui lòng thử lại sau.</p>
        </div>
      );
    }
    const body = await def.body(ctx as StageCtx);
    return (
      <section className="panel stage-card" aria-labelledby="stage-t" data-stage={slug}>
        <h2 id="stage-t">{def.title}</h2>
        {body}
      </section>
    );
  });
}
