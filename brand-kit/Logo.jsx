// Jadauco mark — the ring with the stone set at twelve o'clock.
// Inline SVG so it inherits colour and never loads a second request.

export function JadaucoMark({ size = 40, ring = "#211A12", stone = "#C6A45C", notch = "#FFFDF8" }) {
  // Below 24px, drop the stone: the notch closes up and reads as a blob.
  const small = size < 24;
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" aria-hidden="true">
      <circle cx="100" cy="104" r="72" fill="none" stroke={ring} strokeWidth="18" />
      {!small && (
        <>
          <rect x="72" y="4" width="56" height="56" rx="2" fill={notch} transform="rotate(45 100 32)" />
          <rect x="79" y="11" width="42" height="42" rx="2" fill={stone} transform="rotate(45 100 32)" />
        </>
      )}
    </svg>
  );
}

export function JadaucoLogo({ size = 32, descriptor = false, color = "#211A12", bg = "#FFFDF8" }) {
  return (
    <a href="/" aria-label="Jadauco — home"
       style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
      <JadaucoMark size={size} ring={color} notch={bg} />
      <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="jd-wordmark" style={{ fontSize: size * 0.6, lineHeight: 1, color }}>
          Jadauco
        </span>
        {descriptor && <span className="jd-label" style={{ fontSize: size * 0.24 }}>Imitation jewellery</span>}
      </span>
    </a>
  );
}
