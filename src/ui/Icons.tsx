import type { ReactNode } from 'react'

const Svg = ({ children }: { children: ReactNode }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
)

export const IconMonth = () => <Svg><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></Svg>
export const IconBills = () => <Svg><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></Svg>
export const IconSwap = () => <Svg><path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" /></Svg>
export const IconPlan = () => <Svg><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path d="M12 12 19 5" /></Svg>
export const IconGear = () => <Svg><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" /></Svg>
