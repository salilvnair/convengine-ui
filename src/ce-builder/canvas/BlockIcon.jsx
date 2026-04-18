// Inline SVG icons for CE block types. Kept as a small local set so the
// builder has zero icon-library dependencies (Sim uses Lucide; we mirror the
// 16px white-on-bgColor treatment).

const PATHS = {
  intent: (
    <>
      <path d="M12 2.6a7.2 7.2 0 1 0 5.09 2.11" />
      <path d="M8.4 12l2.6 2.6 4.6-4.6" />
    </>
  ),
  prompt: (
    <>
      <path d="M4.5 5.5h15v10h-9l-3.8 3.2v-3.2H4.5z" />
      <path d="M8 9h8M8 12h5" />
    </>
  ),
  rule: (
    <>
      <path d="M5 4.5h9.2l4.3 4.3v10.7H5z" />
      <path d="M14 4.5v4.6h4.5" />
      <path d="M8.2 13h7M8.2 16h4.5" />
    </>
  ),
  response: (
    <>
      <path d="M4.5 6h15v9h-6.4l-3.6 3.4V15H4.5z" />
      <path d="M8 10.2h8M8 12.8h5" />
    </>
  ),
  tool: (
    <>
      <path d="M13.8 4.3a3.6 3.6 0 1 1-4.1 4.1L4.6 13.5a2 2 0 0 0 2.9 2.9l5.1-5.1a3.6 3.6 0 0 1 4.1-4.1l-1.4 1.4 1.4 1.4 1.4-1.4z" />
    </>
  ),
  planner: (
    <>
      <circle cx="7" cy="6.5" r="1.8" />
      <circle cx="17" cy="6.5" r="1.8" />
      <circle cx="7" cy="17.5" r="1.8" />
      <circle cx="17" cy="17.5" r="1.8" />
      <path d="M7 8.3v7.4M17 8.3v7.4M8.8 6.5h6.4M8.8 17.5h6.4" />
    </>
  ),
  policy: (
    <>
      <path d="M12 3.3l7 2.6v5.7c0 4.3-3 7.4-7 8.4-4-1-7-4.1-7-8.4V5.9z" />
      <path d="M9.5 12l2 2 3.5-3.5" />
    </>
  ),
  schema: (
    <>
      <rect x="4.2" y="4" width="15.6" height="16" rx="2" />
      <path d="M4.2 9.2h15.6M4.2 14.4h15.6M9.5 4v16" />
    </>
  ),
  entity: (
    <>
      <ellipse cx="12" cy="6.2" rx="7.3" ry="2.6" />
      <path d="M4.7 6.2v11.6c0 1.44 3.27 2.6 7.3 2.6s7.3-1.16 7.3-2.6V6.2" />
      <path d="M4.7 12c0 1.44 3.27 2.6 7.3 2.6s7.3-1.16 7.3-2.6" />
    </>
  ),
  edge: (
    <>
      <circle cx="6.4" cy="6.4" r="2.1" />
      <circle cx="17.6" cy="17.6" r="2.1" />
      <path d="M8 8l8 8" />
      <path d="M14.4 11.2l2.2-2.2h-3.2" />
    </>
  ),
  pattern: (
    <>
      <path d="M4.4 9.2h15.2M4.4 14.8h15.2" />
      <path d="M9.2 4.4v15.2M14.8 4.4v15.2" />
    </>
  ),
};

export function BlockIcon({ name, size = 16 }) {
  const body = PATHS[name] || PATHS.prompt;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {body}
    </svg>
  );
}
