import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { AMC_STATUSES, type Client, type ClientUpsert } from '../../lib/types'
import { isValidPhone, normalizePhone, PHONE_MESSAGE } from '../../lib/phone'
import { Button, Field, Input, Notice, Select, Textarea } from '../../components/ui'

// Inputs hold strings ('' when empty); the API wants null for "not set". Accept null/undefined too (API data).
const blankToNull = (v: unknown) => (v === undefined || v === null || (typeof v === 'string' && v.trim() === '') ? null : v)
const opt = (max = 200) => z.preprocess(v => { const b = blankToNull(v); return typeof b === 'string' ? b.trim() : b }, z.string().max(max, `At most ${max} characters`).nullable())
const phone = z.preprocess(v => { const b = blankToNull(v); return typeof b === 'string' ? normalizePhone(b) : b },
  z.string().refine(isValidPhone, PHONE_MESSAGE).nullable())
const num = (label: string, int = false, maxDecimals = 2) => z.preprocess(v => { const b = blankToNull(v); return b === null ? null : Number(b) },
  z.number({ error: `${label} must be a number` }).min(0, `${label} cannot be negative`).max(1_000_000_000, `${label} is too large`)
    .refine(n => !int || Number.isInteger(n), `${label} must be a whole number`)
    .refine(n => int || n == null || Number(n.toFixed(maxDecimals)) === n, `${label} can have at most ${maxDecimals} decimal places`)
    .nullable())
const date = z.preprocess(blankToNull, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date').nullable())

const clientSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200, 'At most 200 characters'),
  contactPerson: opt(200),
  phone,
  email: z.preprocess(blankToNull, z.string().trim().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Enter a valid email').max(200, 'At most 200 characters').nullable()),
  address: opt(500), siteLocation: opt(500),
  solarCapacityKwp: num('Capacity'), moduleMake: opt(), moduleModel: opt(), moduleCount: num('Module count', true), moduleWattage: num('Wattage'),
  inverterMake: opt(), inverterModel: opt(), inverterCapacityKw: num('Inverter capacity'),
  installationDate: date, previousMaintenanceDate: date, nextDueDate: date,
  amcStatus: z.enum(['FREE_YEAR1', 'AMC', 'EXPIRED', 'NONE']), amcStartDate: date, amcExpiryDate: date,
}).refine(v => !v.amcStartDate || !v.amcExpiryDate || v.amcExpiryDate >= v.amcStartDate, { message: 'AMC expiry must be on or after AMC start', path: ['amcExpiryDate'] })

type FormIn = z.input<typeof clientSchema>
type FormOut = z.output<typeof clientSchema>
type Key = keyof FormOut

const FIELDS: Exclude<Key, 'amcStatus'>[] = ['name', 'contactPerson', 'phone', 'email', 'address', 'siteLocation', 'solarCapacityKwp', 'moduleMake', 'moduleModel', 'moduleCount', 'moduleWattage',
  'inverterMake', 'inverterModel', 'inverterCapacityKw', 'installationDate', 'previousMaintenanceDate', 'nextDueDate', 'amcStartDate', 'amcExpiryDate']

/** API values (null for "not set") → input values ('' so React inputs stay controlled and validation sees blanks). */
function toFormValues(c?: Client): FormIn {
  const out: Record<string, unknown> = { amcStatus: c?.amcStatus ?? 'FREE_YEAR1' }
  for (const k of FIELDS) { const v = c?.[k as keyof Client]; out[k] = v === null || v === undefined ? '' : String(v) }
  return out as FormIn
}

export function ClientForm({ initial, onSubmit, busy, onCancel, error }: { initial?: Client; onSubmit: (d: ClientUpsert) => void; busy?: boolean; onCancel: () => void; error?: string | null }) {
  const { register, handleSubmit, formState: { errors } } = useForm<FormIn, unknown, FormOut>({ resolver: zodResolver(clientSchema), defaultValues: toFormValues(initial) })
  const e = (k: Key) => errors[k]?.message as string | undefined
  const F = ({ k, label, className, type, step, placeholder }: { k: Exclude<Key, 'amcStatus' | 'address'>; label: string; className?: string; type?: string; step?: string; placeholder?: string }) =>
    <Field label={label} error={e(k)} className={className}><Input type={type} step={step} min={type === 'number' ? 0 : undefined} inputMode={type === 'number' ? 'decimal' : undefined} placeholder={placeholder} aria-invalid={!!e(k)} {...register(k)} /></Field>

  return <form onSubmit={handleSubmit(v => onSubmit(v as ClientUpsert))} className="grid gap-3 md:grid-cols-2" noValidate>
    {F({ k: 'name', label: 'Client name *', className: 'md:col-span-2' })}
    {F({ k: 'contactPerson', label: 'Contact person' })}
    {F({ k: 'phone', label: 'Phone', type: 'tel', placeholder: 'e.g. 9876543210 or 04412345678' })}
    {F({ k: 'email', label: 'Email', type: 'email' })}
    {F({ k: 'siteLocation', label: 'Site location', placeholder: 'e.g. Rooftop, Block A' })}
    <Field label="Address" error={e('address')} className="md:col-span-2"><Textarea {...register('address')} /></Field>
    <h3 className="mt-2 text-sm font-semibold text-slate-600 md:col-span-2">Solar installation</h3>
    {F({ k: 'solarCapacityKwp', label: 'Solar capacity (kWp)', type: 'number', step: '0.01' })}
    {F({ k: 'installationDate', label: 'Installation date', type: 'date' })}
    {F({ k: 'moduleMake', label: 'Module make' })}
    {F({ k: 'moduleModel', label: 'Module model' })}
    {F({ k: 'moduleCount', label: 'Module count', type: 'number', step: '1' })}
    {F({ k: 'moduleWattage', label: 'Module wattage (W)', type: 'number', step: '0.1' })}
    {F({ k: 'inverterMake', label: 'Inverter make' })}
    {F({ k: 'inverterModel', label: 'Inverter model' })}
    {F({ k: 'inverterCapacityKw', label: 'Inverter capacity (kW)', type: 'number', step: '0.01' })}
    <h3 className="mt-2 text-sm font-semibold text-slate-600 md:col-span-2">Maintenance and AMC</h3>
    {F({ k: 'previousMaintenanceDate', label: 'Previous maintenance date', type: 'date' })}
    {F({ k: 'nextDueDate', label: 'Next due date', type: 'date' })}
    <Field label="AMC status" error={e('amcStatus')}><Select {...register('amcStatus')}>{AMC_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</Select></Field>
    <div />
    {F({ k: 'amcStartDate', label: 'AMC start date', type: 'date' })}
    {F({ k: 'amcExpiryDate', label: 'AMC expiry date', type: 'date' })}
    {error && <Notice className="md:col-span-2">{error}</Notice>}
    <div className="mt-2 flex justify-end gap-2 md:col-span-2"><Button variant="secondary" onClick={onCancel}>Cancel</Button><Button type="submit" loading={busy}>{initial ? 'Save changes' : 'Create client'}</Button></div>
  </form>
}
