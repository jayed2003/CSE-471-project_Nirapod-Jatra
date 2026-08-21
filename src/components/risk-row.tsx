"use client";

export function RiskRow({
  label,
  value,
  state,
  level,
  segments,
  total = 5,
}: {
  label: string;
  value: string;
  state: string;
  level: "safe" | "caution" | "alert";
  segments: number;
  total?: number;
}) {
  return (
    <div className="risk-row">
      <span className="risk-label">{label}</span>
      <div className="risk-bar">
        {Array.from({ length: total }, (_, index) => index + 1).map((segment) => (
          <span key={segment} className={segment <= segments ? `active ${level}` : ""} />
        ))}
      </div>
      <strong>{value}</strong>
      <span className={`badge ${level}`}>{state}</span>
    </div>
  );
}
