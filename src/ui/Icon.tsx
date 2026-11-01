import icons from "./ui-icons.json";

export function Icon({ name, size }: { name: string; size?: number }) {
  const inner = (icons as Record<string, string>)[name] ?? "";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={size ? { width: size, height: size } : undefined}
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}
