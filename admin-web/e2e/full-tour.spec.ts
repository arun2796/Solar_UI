import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'

// Walks every admin screen, exercising the API-issued sign-in, and saves a screenshot of each step.
// Needs the local API (E2E_API_URL, default http://localhost:5000) in Development and an admin with a password:
//   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD. Screenshots go to E2E_SCREENSHOTS_DIR (default e2e/results/tour).
const API = process.env.E2E_API_URL ?? 'http://localhost:5000'
const email = process.env.E2E_ADMIN_EMAIL
const password = process.env.E2E_ADMIN_PASSWORD
const DIR = process.env.E2E_SCREENSHOTS_DIR ?? path.join('e2e', 'results', 'tour')

let n = 0
const shot = async (page: Page, name: string) => {
  await page.waitForLoadState('networkidle').catch(() => {})
  await expect(page.locator('.animate-pulse')).toHaveCount(0, { timeout: 15_000 })   // no loading skeletons in the picture
  await page.screenshot({ path: path.join(DIR, `${String(++n).padStart(2, '0')}-${name}.png`), fullPage: true })
}
const noErrors = (page: Page) => expect(page.locator('text=/Server error|Request failed|Cannot reach the API/')).toHaveCount(0)

test.describe.configure({ mode: 'serial' })
test.skip(!email || !password, 'E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set')
test.use({ viewport: { width: 1366, height: 860 } })

test('admin full tour with screenshots', async ({ page }) => {
  test.setTimeout(240_000)

  // ---- sign-in page: validation, wrong password, forgot password help
  await page.goto('/login')
  await shot(page, 'login')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByText('Enter a valid email')).toBeVisible()
  await page.getByLabel('Email').fill(email!)
  await page.getByLabel('Password').fill('definitely-wrong-1')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByText('Invalid email or password.')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Forgot password?' }).click()
  await expect(page.getByText(/create-admin command/)).toBeVisible()
  await shot(page, 'login-wrong-password-and-forgot')

  // ---- real password sign-in
  await page.getByLabel('Password').fill(password!)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('Visits this month')).toBeVisible()
  await noErrors(page)
  await shot(page, 'dashboard')

  // ---- session survives a reload (refresh token in storage)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 20_000 })

  // ---- reports list + detail + PDF preview
  await page.getByRole('link', { name: 'Reports' }).click()
  await expect(page.getByRole('heading', { name: 'Maintenance reports' })).toBeVisible()
  const row = page.locator('tbody tr').filter({ hasText: /PMC-\d{4}-\d{4}/ }).first()
  await expect(row).toBeVisible({ timeout: 15_000 })
  await shot(page, 'reports-list')
  await row.click()
  await expect(page.locator('iframe[title="Report PDF"]')).toBeVisible({ timeout: 30_000 })
  await noErrors(page)
  await shot(page, 'report-detail-pdf')

  // ---- clients list, new client form, client detail
  await page.getByRole('link', { name: 'Clients' }).click()
  await expect(page.getByRole('heading', { name: 'Clients' })).toBeVisible()
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 })
  await shot(page, 'clients-list')
  await page.getByRole('button', { name: 'New client' }).click()
  await shot(page, 'client-new-form')
  const clientName = `Tour Client ${Date.now()}`
  await page.getByLabel('Client name *').fill(clientName)
  await page.getByRole('button', { name: 'Create client' }).click()
  await expect(page.getByRole('heading', { name: clientName })).toBeVisible({ timeout: 15_000 })
  await noErrors(page)
  await shot(page, 'client-detail')
  const clientId = page.url().split('/clients/')[1]?.split(/[?#]/)[0]

  // ---- engineers: create with password, reset password, sign in as engineer through the API, deactivate
  await page.getByRole('link', { name: 'Engineers' }).click()
  await expect(page.getByRole('heading', { name: 'Engineers' })).toBeVisible()
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 })
  await shot(page, 'engineers-list')
  const engName = `Tour Engineer ${Date.now()}`
  const engEmail = `tour.${Date.now()}@example.com`
  await page.getByRole('button', { name: 'New engineer' }).click()
  await page.getByLabel('Name *').fill(engName)
  await page.getByLabel('Email (login) *').fill(engEmail)
  await page.getByLabel('Initial password *').fill('Tour-Initial-123')
  await shot(page, 'engineer-new-form')
  await page.getByRole('button', { name: 'Create login' }).click()
  const engRow = page.locator('tbody tr').filter({ hasText: engName })
  await expect(engRow).toBeVisible({ timeout: 15_000 })
  await expect(engRow.getByText('password set')).toBeVisible()
  await engRow.getByRole('button', { name: `Set password for ${engName}` }).click()
  await page.getByLabel('New password *').fill('Tour-Reset-456')
  await shot(page, 'engineer-reset-password')
  await page.getByRole('button', { name: 'Save password' }).click()
  await expect(page.getByLabel('New password *')).toHaveCount(0, { timeout: 15_000 })
  const old = await page.request.post(`${API}/auth/login`, { data: { email: engEmail, password: 'Tour-Initial-123' } })
  expect(old.status()).toBe(401)
  const fresh = await page.request.post(`${API}/auth/login`, { data: { email: engEmail, password: 'Tour-Reset-456' } })
  expect(fresh.status()).toBe(200)
  await engRow.getByRole('button', { name: `Deactivate ${engName}` }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click()
  await expect(page.locator('tbody tr').filter({ hasText: engName })).toHaveCount(0, { timeout: 15_000 })
  expect((await page.request.post(`${API}/auth/login`, { data: { email: engEmail, password: 'Tour-Reset-456' } })).status()).toBe(401)

  // ---- calendar, upcoming/overdue, AMC, defects
  for (const [link, heading, file] of [
    ['Calendar', 'Maintenance calendar', 'calendar'], ['Upcoming & Overdue', 'Upcoming and overdue visits', 'upcoming-overdue'],
    ['AMC', 'AMC management', 'amc'], ['Defect Summary', 'Defect summary', 'defects'],
  ] as const) {
    await page.getByRole('link', { name: link, exact: true }).click()
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible({ timeout: 15_000 })
    await noErrors(page)
    await shot(page, file)
  }

  // ---- settings: logo, change own password (and back)
  await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible()
  await page.getByLabel('Current password').fill('not-my-password')
  await page.getByLabel('New password').fill('Tour-Admin-789')
  await page.getByRole('button', { name: 'Change password' }).click()
  await expect(page.getByText(/Current password is incorrect/)).toBeVisible({ timeout: 15_000 })
  await shot(page, 'settings-wrong-current-password')
  const changeTo = async (current: string, next: string) => {
    await page.getByLabel('Current password').fill(current)
    await page.getByLabel('New password').fill(next)
    const res = page.waitForResponse(r => r.url().endsWith('/auth/change-password') && r.request().method() === 'POST')
    await page.getByRole('button', { name: 'Change password' }).click()
    expect((await res).status()).toBe(204)
    await expect(page.getByText('Password changed.')).toBeVisible({ timeout: 15_000 })
  }
  await changeTo(password!, 'Tour-Admin-789')
  await shot(page, 'settings-password-changed')
  await changeTo('Tour-Admin-789', password!)

  // ---- sign out protects pages and revokes the session
  await page.getByRole('button', { name: 'Sign out' }).first().click()
  await expect(page).toHaveURL(/\/login/)
  await page.goto('/reports')
  await expect(page).toHaveURL(/\/login/)
  await shot(page, 'signed-out')

  // clean-up: deactivate the tour client so it does not appear in the engineers' client list
  const token = (await (await page.request.post(`${API}/auth/login`, { data: { email, password } })).json() as { accessToken: string }).accessToken
  if (clientId) expect((await page.request.post(`${API}/clients/${clientId}/deactivate`, { headers: { Authorization: `Bearer ${token}` } })).ok()).toBeTruthy()
})

test('mobile-width layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/login')
  await page.getByLabel('Email').fill(email!)
  await page.getByLabel('Password').fill(password!)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 20_000 })
  await shot(page, 'mobile-dashboard')
  await page.getByRole('button', { name: 'Open menu' }).click()
  await shot(page, 'mobile-menu')
})

test('expired access token is refreshed silently; a revoked session returns to login', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email!)
  await page.getByLabel('Password').fill(password!)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 20_000 })
  // pretend the access token expired: the next API call must go through /auth/refresh first
  await page.evaluate(() => {
    const s = JSON.parse(sessionStorage.getItem('solar_session')!)
    s.accessTokenExpiresAt = new Date(Date.now() - 60_000).toISOString()
    sessionStorage.setItem('solar_session', JSON.stringify(s))
  })
  const refreshed = page.waitForResponse(r => r.url().endsWith('/auth/refresh') && r.status() === 200)
  await page.getByRole('link', { name: 'Reports' }).click()
  await refreshed
  await expect(page.getByRole('heading', { name: 'Maintenance reports' })).toBeVisible()
  await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 })
  // revoke the stored refresh token at the API (as an admin password reset or sign-out elsewhere would)
  const refreshToken = await page.evaluate(() => JSON.parse(sessionStorage.getItem('solar_session')!).refreshToken as string)
  expect((await page.request.post(`${API}/auth/logout`, { data: { refreshToken } })).status()).toBe(204)
  await page.evaluate(() => {
    const s = JSON.parse(sessionStorage.getItem('solar_session')!)
    s.accessTokenExpiresAt = new Date(Date.now() - 60_000).toISOString()
    sessionStorage.setItem('solar_session', JSON.stringify(s))
  })
  await page.getByRole('link', { name: 'Clients' }).click()
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
})
