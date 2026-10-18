import type { ReactNode } from "react";

export type IconName =
  | "arrow-up-right"
  | "book"
  | "brush"
  | "bulb"
  | "check"
  | "code"
  | "design"
  | "heart"
  | "menu"
  | "megaphone"
  | "people"
  | "play"
  | "python"
  | "sparkles"
  | "swap"
  | "video"
  | "x";

const drawings: Record<IconName, ReactNode> = {
  "arrow-up-right": <path d="M7 17 17 7M8 7h9v9" />,
  book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" /><path d="M4 17a2.5 2.5 0 0 1 2.5-2.5H20M8 7h8" /></>,
  brush: <><path d="m14 6 4 4M3 21c3.5 0 5-1 6-4l8-8a2.8 2.8 0 0 0-4-4l-8 8C2 14 3 17.5 3 21Z" /><path d="M14 6 9 11" /></>,
  bulb: <><path d="M9 18h6m-5 3h4" /><path d="M8 14.5A7 7 0 1 1 16 14c-.8.6-1 1.3-1 2H9c0-.7-.3-1.1-1-1.5Z" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  code: <><path d="m8 8-4 4 4 4M16 8l4 4-4 4" /><path d="m14 4-4 16" /></>,
  design: <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="9" cy="9" r="1.4" /><path d="m21 15-5-5L5 21" /></>,
  heart: <path d="M20.8 8.6c0 5.4-8.8 11-8.8 11s-8.8-5.6-8.8-11A4.6 4.6 0 0 1 12 6.1a4.6 4.6 0 0 1 8.8 2.5Z" />,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  megaphone: <><path d="m4 11 15-6v14L4 13v-2Z" /><path d="m7 14 2 6h4l-2-4M4 11H3a2 2 0 0 0 0 4h2" /></>,
  people: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>,
  play: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m10 9 5 3-5 3V9Z" /></>,
  python: <><path d="M12 3c-4 0-4 2-4 4v2h8v2H7a4 4 0 0 0-4 4v1a4 4 0 0 0 4 4h2v-3a3 3 0 0 1 3-3h4a4 4 0 0 0 4-4V7c0-3-2-4-8-4Z" /><circle cx="10" cy="6" r=".7" fill="currentColor" /><circle cx="14" cy="18" r=".7" fill="currentColor" /></>,
  sparkles: <><path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z" /><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16ZM5 2l.7 2.3L8 5l-2.3.7L5 8l-.7-2.3L2 5l2.3-.7L5 2Z" /></>,
  swap: <><path d="M7 7h13l-3-3M17 17H4l3 3" /><path d="M20 7 16 11M4 17l4-4" /></>,
  video: <><rect x="3" y="5" width="13" height="14" rx="3" /><path d="m16 10 5-3v10l-5-3" /></>,
  x: <><path d="m6 6 12 12M18 6 6 18" /></>,
};

export function Icon({
  name,
  className = "",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {drawings[name]}
    </svg>
  );
}
