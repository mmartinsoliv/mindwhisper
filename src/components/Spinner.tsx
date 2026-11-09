// Decorative only: aria-hidden and never a live region, so it can sit inside other role="status" regions.
export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span aria-hidden="true" style={{ width: size, height: size }}
      className="mw-spin inline-block rounded-full border-2 border-current border-t-transparent" />
  );
}
