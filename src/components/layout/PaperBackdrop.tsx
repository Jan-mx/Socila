export function PaperBackdrop() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-background"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-20 top-20 h-64 w-64 rounded-[2rem] bg-primary/10"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 bottom-16 h-72 w-72 rounded-[2.5rem] bg-cta/10"
      />
    </>
  );
}
