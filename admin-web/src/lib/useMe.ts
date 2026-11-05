import { useQuery } from '@tanstack/react-query'
import { api, statusOf } from './api'
import type { Role } from './types'

/** Current user from the API. Retries network errors and 5xx (e.g. a cold-starting free-tier API), never 401/403. */
export function useMe(enabled = true) {
  return useQuery({
    queryKey: ['me'], queryFn: api.me, enabled, staleTime: 5 * 60_000,
    retry: (count, e) => { const s = statusOf(e); return count < 2 && (s === undefined || s >= 500) },
  })
}

/** Role of the signed-in user (undefined while loading). */
export function useRole(): Role | undefined {
  return useMe().data?.role
}
