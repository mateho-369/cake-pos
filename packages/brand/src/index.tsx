import { useState } from 'react'

/**
 * G-Cake brand mark, shared by every frontend so admin, sale and shop render
 * the identical logo. The geometry mirrors `@cake-pos/brand/logo.svg`
 * (the canonical asset used for favicons), drawn on a 128×128 grid:
 *
 *  - blush glass disc with a pink→deep-pink gradient rim
 *  - bold rounded "G" monogram in the same pink gradient
 *  - white badge on the lower-right rim holding the blue cake-slice accent
 *    (frosting wedge + layer) topped with a deep-pink cherry
 */
export type GCakeLogoProps = {
  /** Rendered edge of the badge in px. */
  size?: number
  /** Extra class for layout/shadow tweaks per app. */
  className?: string
  /** Accessible label; pass an empty string to treat as decorative. */
  title?: string
}

let instance = 0

export function GCakeLogo({ size = 40, className, title = 'G-Cake' }: GCakeLogoProps) {
  const [uid] = useState(() => `gcake-${++instance}`)
  const rim = `${uid}-rim`
  const g = `${uid}-g`
  const disc = `${uid}-disc`
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 128 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={title ? 'img' : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={rim} x1="24" y1="14" x2="104" y2="116" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#F472B6" />
          <stop offset="1" stopColor="#BE185D" />
        </linearGradient>
        <linearGradient id={g} x1="64" y1="26" x2="64" y2="102" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#F472B6" />
          <stop offset="1" stopColor="#BE185D" />
        </linearGradient>
        <radialGradient id={disc} cx="0.35" cy="0.3" r="0.9">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#FDF2F6" />
        </radialGradient>
      </defs>
      <circle cx="64" cy="64" r="60" fill={`url(#${disc})`} />
      <circle cx="64" cy="64" r="57" stroke={`url(#${rim})`} strokeWidth="6" />
      <path
        d="M83.28 41.02 A30 30 0 1 0 94 64 H70"
        stroke={`url(#${g})`}
        strokeWidth="19"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="104.3" cy="104.3" r="17" fill="#FFFFFF" stroke="#F472B6" strokeWidth="3" />
      <circle cx="104.3" cy="94.6" r="2.6" fill="#BE185D" />
      <path
        d="M104.3 97.4 L95.1 105.6 H113.5 Z"
        fill="#3B82F6"
        stroke="#3B82F6"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <rect x="95.1" y="108.4" width="18.4" height="5.6" rx="2.8" fill="#3B82F6" />
    </svg>
  )
}

export default GCakeLogo
