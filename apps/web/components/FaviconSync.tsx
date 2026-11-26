const DEFAULT_ICONS = [
  { rel: 'icon', href: '/favicon.ico?v=2', sizes: 'any' },
  { rel: 'icon', href: '/icon.svg?v=2', type: 'image/svg+xml' },
  { rel: 'icon', href: '/favicon-16x16.png?v=2', type: 'image/png', sizes: '16x16' },
  { rel: 'icon', href: '/favicon-32x32.png?v=2', type: 'image/png', sizes: '32x32' },
  {
    rel: 'apple-touch-icon',
    href: '/apple-touch-icon.png?v=2',
    type: 'image/png',
    sizes: '180x180',
  },
] as const;

/** React đưa các thẻ link vào head và tự cập nhật chúng khi logo của phiên thay đổi. */
export function FaviconSync({
  officeId,
  version,
}: {
  readonly officeId: string | null;
  readonly version: number | null;
}) {
  if (officeId && version !== null) {
    const href = `/api/office/logo?officeId=${encodeURIComponent(officeId)}&v=${version}`;
    return ['icon', 'shortcut icon', 'apple-touch-icon'].map((rel) => (
      <link key={`${rel}:${href}`} rel={rel} href={href} />
    ));
  }

  return DEFAULT_ICONS.map((icon) => <link key={icon.href} {...icon} />);
}
