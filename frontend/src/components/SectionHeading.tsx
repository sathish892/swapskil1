export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
}: {
  eyebrow: string;
  title: string;
  description: string;
  align?: "center" | "left";
}) {
  return (
    <div className={`max-w-2xl ${align === "center" ? "mx-auto text-center" : "text-left"}`}>
      <p className="mb-4 text-xs font-bold uppercase tracking-[0.22em] text-emerald-800">
        {eyebrow}
      </p>
      <h2 className="font-display text-3xl font-semibold leading-tight tracking-[-0.045em] text-ink sm:text-4xl lg:text-[3.25rem]">
        {title}
      </h2>
      <p className="mt-5 text-base leading-7 text-slate-600 sm:text-lg">
        {description}
      </p>
    </div>
  );
}
