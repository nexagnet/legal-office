import type { FormCode, FormTemplate } from '../form-template';
import { N01_TEMPLATE } from './n-01';
import { N02_TEMPLATE } from './n-02';
import { N03_TEMPLATE } from './n-03';
import { N04_TEMPLATE } from './n-04';
import { N05_TEMPLATE } from './n-05';
import { N06_TEMPLATE } from './n-06';
import { N07_TEMPLATE } from './n-07';
import { N08_TEMPLATE } from './n-08';
import { N11_TEMPLATE } from './n-11';

/** Bộ mẫu Phụ lục III, TT 08/2026/TT-BTP. N-09, N-10 (Excel) chưa có nguồn nên ngoài phạm vi. */
export const TEMPLATES: Readonly<Record<FormCode, FormTemplate>> = {
  'N-01': N01_TEMPLATE,
  'N-02': N02_TEMPLATE,
  'N-03': N03_TEMPLATE,
  'N-04': N04_TEMPLATE,
  'N-05': N05_TEMPLATE,
  'N-06': N06_TEMPLATE,
  'N-07': N07_TEMPLATE,
  'N-08': N08_TEMPLATE,
  'N-11': N11_TEMPLATE,
};
