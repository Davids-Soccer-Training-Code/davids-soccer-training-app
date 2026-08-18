"use client";

export function RankBadge({
  name,
  color,
  size = "md",
}: {
  name: string;
  color: string;
  size?: "sm" | "md" | "lg";
}) {
  const pad =
    size === "lg"
      ? "px-4 py-2 text-base"
      : size === "sm"
      ? "px-2.5 py-1 text-xs"
      : "px-3 py-1.5 text-sm";
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full font-bold text-white ${pad}`}
      style={{ backgroundColor: color }}
    >
      <span
        className="inline-block h-2 w-2 rounded-full bg-white/80"
        aria-hidden
      />
      {name}
    </span>
  );
}
