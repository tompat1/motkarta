import React from "react";

export const SPECIALTY_COFFEE_SVG_CONTENT = `
  <path d="M94 54c-8-9 2-18-3-28" stroke="currentColor" stroke-width="16" stroke-linecap="round" fill="none"/>
  <path d="M128 48c-7-10 3-20-2-32" stroke="currentColor" stroke-width="16" stroke-linecap="round" fill="none"/>
  <path d="M162 54c-8-9 2-18-3-28" stroke="currentColor" stroke-width="16" stroke-linecap="round" fill="none"/>
  <path d="M84 68h88a8 8 0 0 0 8-8c0-3-4-6-8-6H84c-4 0-8 3-8 6a8 8 0 0 0 8 8z"/>
  <rect x="42" y="68" width="172" height="26" rx="13"/>
  <path fill-rule="evenodd" clip-rule="evenodd" d="M52 102h152l-16 136a14 14 0 0 1-14 12H82a14 14 0 0 1-14-12L52 102zm76 34c-17 0-28 13-28 29s11 29 28 29 28-13 28-29-11-29-28-29zm-3 10c-5 4-7 9-7 19 0 7 3 13 7 17-2-5-2-12 0-17 3-7 6-12 0-19z"/>
`;

export interface SpecialtyCoffeeIconProps {
  size?: number | string;
  weight?: string;
  className?: string;
  style?: React.CSSProperties;
  "aria-hidden"?: boolean | "true" | "false";
}

export function SpecialtyCoffeeIcon({
  size = 18,
  className = "",
  style = {},
  "aria-hidden": ariaHidden = true,
}: SpecialtyCoffeeIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden={ariaHidden}
    >
      <path d="M94 54c-8-9 2-18-3-28" stroke="currentColor" strokeWidth="16" strokeLinecap="round" fill="none" />
      <path d="M128 48c-7-10 3-20-2-32" stroke="currentColor" strokeWidth="16" strokeLinecap="round" fill="none" />
      <path d="M162 54c-8-9 2-18-3-28" stroke="currentColor" strokeWidth="16" strokeLinecap="round" fill="none" />
      <path d="M84 68h88a8 8 0 0 0 8-8c0-3-4-6-8-6H84c-4 0-8 3-8 6a8 8 0 0 0 8 8z" />
      <rect x="42" y="68" width="172" height="26" rx="13" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M52 102h152l-16 136a14 14 0 0 1-14 12H82a14 14 0 0 1-14-12L52 102zm76 34c-17 0-28 13-28 29s11 29 28 29 28-13 28-29-11-29-28-29zm-3 10c-5 4-7 9-7 19 0 7 3 13 7 17-2-5-2-12 0-17 3-7 6-12 0-19z"
      />
    </svg>
  );
}
