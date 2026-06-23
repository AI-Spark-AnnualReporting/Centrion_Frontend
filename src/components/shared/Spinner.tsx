interface SpinnerProps {
  /** Diameter of the circle in px. */
  size?: number;
  /** Vertical padding around the centered spinner in px. */
  pad?: number;
  /** Use the light-on-dark variant for dark backgrounds. */
  dark?: boolean;
}

/**
 * Centered loading spinner — used in place of skeleton placeholders while
 * content loads. Keeps loading states consistent across the app.
 */
export function Spinner({ size = 32, pad = 40, dark = false }: SpinnerProps) {
  return (
    <div className="spinner-wrap" style={{ padding: `${pad}px 0` }}>
      <span
        className={`spinner${dark ? ' spinner-dark' : ''}`}
        style={{ width: size, height: size }}
        role="status"
        aria-label="Loading"
      />
    </div>
  );
}
