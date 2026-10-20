import { useId } from 'react'

/** Marca provisória: anel de progresso com um cifrão. Troque aqui e em public/icon*.svg ao definir o nome. */
export function Logo({ size = 40 }: { size?: number }) {
  const id = useId()
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" role="img" aria-label="Money" className="shrink-0">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#818cf8" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="116" fill="#0f172a" />
      <circle cx="256" cy="256" r="148" fill="none" stroke="#1e293b" strokeWidth="40" />
      <circle cx="256" cy="256" r="148" fill="none" stroke={`url(#${id})`} strokeWidth="40" strokeLinecap="round" strokeDasharray="700 930" transform="rotate(-90 256 256)" />
      <path d="M308 216C308 192 286 182 256 182C226 182 204 196 204 220C204 246 228 253 256 259C284 265 308 272 308 298C308 322 286 334 256 334C226 334 204 322 204 298M256 158V366" fill="none" stroke="#f8fafc" strokeWidth="30" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
