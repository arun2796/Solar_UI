// Non-component helpers (kept out of components/ui.tsx so React Fast Refresh works).

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

export const inputCls = 'min-h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-[0_1px_1px_rgb(20_33_58/0.04)] transition-[border-color,box-shadow] duration-200 ease-soft placeholder:text-slate-400 hover:border-slate-300 focus:border-sky-500 focus:outline-none focus:ring-4 focus:ring-sky-500/15 disabled:bg-slate-50 disabled:text-slate-500'

const pad = (n: number) => String(n).padStart(2, '0')

/** "YYYY-MM-DD" for the LOCAL calendar day (toISOString() would give the UTC day — wrong before 05:30 IST). */
export const localIso = (d: Date = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const today = () => localIso()
/** Local calendar day `days` from today (negative for the past). */
export const addDaysIso = (days: number, from: Date = new Date()) => localIso(new Date(from.getFullYear(), from.getMonth(), from.getDate() + days))
export const monthStartIso = (d: Date = new Date()) => localIso(new Date(d.getFullYear(), d.getMonth(), 1))
/** Parses "YYYY-MM-DD" as a local date (new Date('YYYY-MM-DD') would be UTC midnight). */
export const parseIsoDate = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d) }
/** Whole calendar days from today to the date: 0 = today, 1 = tomorrow, -1 = yesterday. */
export const daysUntil = (iso: string) => {
  const t = new Date(); const start = new Date(t.getFullYear(), t.getMonth(), t.getDate())
  return Math.round((parseIsoDate(iso).getTime() - start.getTime()) / 864e5)
}

export const fmtDate = (d?: string | null) => (d ? (d.length === 10 ? parseIsoDate(d) : new Date(d)).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
export const fmtDateTime = (d?: string | null) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')

export const statusTone = (s: string) => (s === 'submitted' ? 'green' : s === 'corrected' ? 'blue' : 'amber') as 'green' | 'blue' | 'amber'
export const amcTone = (s: string) => (s === 'AMC' ? 'green' : s === 'FREE_YEAR1' ? 'blue' : s === 'EXPIRED' ? 'red' : 'slate') as 'green' | 'blue' | 'red' | 'slate'

/** Page number from a URL param: integers ≥ 1 only (NaN, 0, negatives → 1). */
export const clampPage = (v: string | null) => { const n = Number(v); return Number.isInteger(n) && n >= 1 ? Math.min(n, 100_000) : 1 }

/** Downloads a Blob as a file and revokes the object URL after the browser has picked it up. */
export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = fileName
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
