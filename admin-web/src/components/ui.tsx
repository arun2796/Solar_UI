import { type ReactNode, useEffect, useId, useRef } from 'react'
import { AlertCircle, CheckCircle2, Inbox, Loader2, X, type LucideIcon } from 'lucide-react'
import { cx, inputCls } from '../lib/format'

export function Button({ variant = 'primary', className, loading, children, type = 'button', ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; loading?: boolean }) {
  const v = { primary: 'bg-sky-700 hover:bg-sky-800 text-white', secondary: 'bg-white border border-slate-300 hover:bg-slate-50 text-slate-800', danger: 'bg-red-600 hover:bg-red-700 text-white', ghost: 'hover:bg-slate-100 text-slate-700' }[variant]
  return <button type={type} {...p} disabled={p.disabled || loading} aria-busy={loading || undefined} className={cx('inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:cursor-not-allowed disabled:opacity-50', v, className)}>
    {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{children}</button>
}

export function Field({ label, error, children, className, hint }: { label: string; error?: string; children: ReactNode; className?: string; hint?: string }) {
  return <label className={cx('block text-sm', className)}><span className="mb-1 block font-medium text-slate-700">{label}</span>{children}
    {hint && !error && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    {error && <span role="alert" className="mt-1 block text-xs text-red-600">{error}</span>}</label>
}
export function Input(p: React.InputHTMLAttributes<HTMLInputElement>) { return <input {...p} className={cx(inputCls, p.className)} /> }
export function Select(p: React.SelectHTMLAttributes<HTMLSelectElement>) { return <select {...p} className={cx(inputCls, p.className)} /> }
export function Textarea(p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...p} className={cx(inputCls, 'min-h-20', p.className)} /> }

/** Inline status message. `error` uses role=alert so screen readers announce it. */
export function Notice({ tone = 'error', children, className }: { tone?: 'error' | 'success' | 'info'; children: ReactNode; className?: string }) {
  if (!children) return null
  const t = { error: 'bg-red-50 text-red-700', success: 'bg-emerald-50 text-emerald-700', info: 'bg-sky-50 text-sky-800' }[tone]
  const Icon = tone === 'success' ? CheckCircle2 : AlertCircle
  return <p role={tone === 'error' ? 'alert' : 'status'} className={cx('flex items-start gap-2 rounded p-2 text-sm', t, className)}><Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span>{children}</span></p>
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div className="min-w-0"><h1 className="text-2xl font-semibold text-slate-900">{title}</h1>{subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}</div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}</div>
}

export function Card({ children, className }: { children: ReactNode; className?: string }) { return <div className={cx('rounded-lg border border-slate-200 bg-white p-4 shadow-sm', className)}>{children}</div> }

export function StatCard({ label, value, tone = 'default', onClick, icon: Icon, hint }: { label: string; value: number | string; tone?: 'default' | 'warn' | 'danger' | 'ok'; onClick?: () => void; icon?: LucideIcon; hint?: string }) {
  const t = { default: ['text-slate-900', 'bg-sky-50 text-sky-700'], warn: ['text-amber-700', 'bg-amber-50 text-amber-700'], danger: ['text-red-600', 'bg-red-50 text-red-600'], ok: ['text-emerald-700', 'bg-emerald-50 text-emerald-700'] }[tone]
  return <button type="button" onClick={onClick} className="group flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
    <div className="min-w-0"><div className="text-sm font-medium text-slate-500">{label}</div><div className={cx('mt-1 text-3xl font-bold tabular-nums', t[0])}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-400 group-hover:text-sky-700">{hint}</div>}</div>
    {Icon && <span className={cx('rounded-lg p-2', t[1])}><Icon className="h-5 w-5" aria-hidden /></span>}</button>
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'green' | 'red' | 'amber' | 'blue' }) {
  const t = { slate: 'bg-slate-100 text-slate-700', green: 'bg-emerald-100 text-emerald-800', red: 'bg-red-100 text-red-800', amber: 'bg-amber-100 text-amber-800', blue: 'bg-sky-100 text-sky-800' }[tone]
  return <span className={cx('inline-block rounded-full px-2 py-0.5 text-xs font-medium', t)}>{children}</span>
}

export function Skeleton({ rows = 5 }: { rows?: number }) { return <div className="space-y-2" aria-busy="true" aria-label="Loading">{Array.from({ length: rows }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded bg-slate-100" />)}</div> }
export function EmptyState({ text = 'Nothing here yet.' }: { text?: string }) { return <div className="flex flex-col items-center gap-2 py-12 text-slate-500"><Inbox className="h-8 w-8" aria-hidden /><p className="text-sm">{text}</p></div> }
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div role="alert" className="flex flex-col items-center gap-2 py-10 text-red-700"><AlertCircle className="h-8 w-8" aria-hidden /><p className="text-center text-sm">{message}</p>{onRetry && <Button variant="secondary" onClick={onRetry}>Retry</Button>}</div>
}

/** Data table. When `onRow` is set, rows are keyboard-operable (Tab to focus, Enter/Space to open). */
export function Table<T>({ cols, rows, keyOf, onRow, rowLabel }: { cols: { h: string; cell: (r: T) => ReactNode; className?: string }[]; rows: T[]; keyOf: (r: T) => string; onRow?: (r: T) => void; rowLabel?: (r: T) => string }) {
  return <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr>{cols.map((c, i) => <th key={c.h || `c${i}`} scope="col" className={cx('whitespace-nowrap px-3 py-2 font-medium', c.className)}>{c.h || <span className="sr-only">Actions</span>}</th>)}</tr></thead>
    <tbody>{rows.map(r => <tr key={keyOf(r)}
      onClick={onRow ? () => onRow(r) : undefined}
      onKeyDown={onRow ? e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); onRow(r) } } : undefined}
      tabIndex={onRow ? 0 : undefined} role={onRow ? 'link' : undefined} aria-label={onRow && rowLabel ? rowLabel(r) : undefined}
      className={cx('border-t border-slate-100', onRow && 'cursor-pointer hover:bg-sky-50 focus:bg-sky-50 focus:outline-none')}>{cols.map((c, i) => <td key={c.h || `c${i}`} className={cx('whitespace-nowrap px-3 py-2', c.className)}>{c.cell(r)}</td>)}</tr>)}</tbody></table></div>
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return <nav aria-label="Pagination" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600"><span>{total} result{total === 1 ? '' : 's'}</span><div className="flex items-center gap-2"><Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button><span>Page {Math.min(page, pages)} of {pages}</span><Button variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button></div></nav>
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/**
 * Accessible modal: focuses the first field, traps Tab, restores focus on close, locks body scroll.
 * `closeOnBackdrop={false}` for forms so a stray click outside does not discard typed data (Escape and ✕ still close).
 */
export function Modal({ open, title, onClose, children, wide, closeOnBackdrop = true }: { open: boolean; title: string; onClose: () => void; children: ReactNode; wide?: boolean; closeOnBackdrop?: boolean }) {
  const panel = useRef<HTMLDivElement>(null); const titleId = useId()
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const prevOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'
    const first = panel.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panel.current?.querySelector<HTMLElement>('input,select,textarea') ?? panel.current
    first?.focus()
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onCloseRef.current(); return }
      if (e.key !== 'Tab' || !panel.current) return
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)); if (!items.length) return
      const a = items[0], z = items[items.length - 1]
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus() } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus() }
    }
    window.addEventListener('keydown', h)
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = prevOverflow; prev?.focus?.() }
  }, [open])
  if (!open) return null
  return <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={closeOnBackdrop ? onClose : undefined}>
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={cx('mt-8 w-full rounded-lg bg-white shadow-xl focus:outline-none', wide ? 'max-w-3xl' : 'max-w-lg')} onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><h2 id={titleId} className="font-semibold">{title}</h2><button type="button" onClick={onClose} aria-label="Close dialog" className="rounded p-1 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"><X className="h-5 w-5" /></button></div>
      <div className="p-4">{children}</div></div></div>
}

export function ConfirmDialog({ open, title, body, confirmText = 'Confirm', danger, loading, error, onConfirm, onClose }: { open: boolean; title: string; body: ReactNode; confirmText?: string; danger?: boolean; loading?: boolean; error?: string | null; onConfirm: () => void; onClose: () => void }) {
  return <Modal open={open} title={title} onClose={onClose}><div className="text-sm text-slate-700">{body}</div>
    {error && <Notice className="mt-3">{error}</Notice>}
    <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm} data-autofocus>{confirmText}</Button></div></Modal>
}
