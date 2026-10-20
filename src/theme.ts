import { useEffect, useState } from 'react'

export type ThemePref = 'auto' | 'light' | 'dark'
const KEY = 'money.theme' // fica em localStorage de propósito: o index.html lê antes do React para não piscar

const read = (): ThemePref => {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

function apply(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#0f172a' : '#f8fafc')
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(read)
  useEffect(() => {
    apply(pref)
    try {
      localStorage.setItem(KEY, pref)
    } catch {
      /* armazenamento indisponível */
    }
    if (pref !== 'auto') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const on = () => apply('auto')
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [pref])
  return [pref, setPref] as const
}
