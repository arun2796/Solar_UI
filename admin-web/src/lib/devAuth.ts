// Developer sign-in for local testing. The API only serves /dev/* in its Development environment against a local
// database, and its dev tokens are rejected by any other API, so this is inert against production.
// Production builds use .env.production, where VITE_DEV_LOGIN is false, so the button is not even shown.
import { getSession } from './session'
import type { Role } from './types'

export const DEV_LOGIN_ENABLED = import.meta.env.VITE_DEV_LOGIN === 'true'

export type DevUser = { userId: string; role: Role; email?: string | null; engineerId?: string | null; engineerName?: string | null }

/** True when the current session came from the developer sign-in. */
export const isDevSession = () => !!getSession()?.dev
