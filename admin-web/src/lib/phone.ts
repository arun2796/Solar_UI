// Same rule as the API (ValidationHelpers): a 10-digit Indian mobile, or a landline with its STD code.
export const PHONE_MESSAGE = 'Enter a 10-digit mobile (e.g. 9876543210) or a landline with STD code (e.g. 04412345678)'

/** Removes spaces, dashes and brackets, and the +91 / 91 country code of a mobile number. */
export function normalizePhone(v: string): string {
  const p = v.trim().replace(/[\s\-()]/g, '')
  if (p.startsWith('+91')) return p.slice(3)
  if (p.length === 12 && p.startsWith('91')) return p.slice(2)
  return p
}

export const isValidPhone = (v: string) => { const p = normalizePhone(v); return /^[6-9]\d{9}$/.test(p) || /^0\d{9,10}$/.test(p) }
