# Solar Platform Go-Live Guide (Free Hosting)

This guide walks you through deploying the complete Solar platform (Backend API, Admin Web Portal, Maintenance Mobile App, and Survey Mobile App) using reliable free-tier cloud services:
- **Database**: Neon (Serverless PostgreSQL 16 — 0.5 GB free)
- **Object Storage**: Cloudflare R2 (10 GB free storage, zero egress fees)
- **API Hosting**: MonsterASP.NET (Free .NET IIS hosting) or Azure App Service (F1 Free)
- **Admin Web Hosting**: Cloudflare Pages (Free global static/SPA hosting)
- **Mobile Builds**: Expo Application Services (EAS Build free tier)

---

## 1. Create the Production Database & Apply Migrations

1. Go to [Neon.tech](https://neon.tech) and create a free account.
2. Create a new project (e.g., `solar-production`) with PostgreSQL 16.
3. In the Neon dashboard, navigate to **Dashboard** &rarr; **Connection Details**.
4. Select the **Direct** connection string (ensure the host does **not** contain `-pooler`, as the API uses advisory locks). It looks like:
   ```text
   postgresql://neondb_owner:<password>@ep-xyz.region.neon.tech/neondb?sslmode=require
   ```
5. On your computer, open PowerShell in the `Solar_Api` repository folder and apply the schema migrations:
   ```powershell
   powershell -File database\apply-remote.ps1
   ```
   - When prompted, paste your Neon direct connection string.
   - Type `YES` to confirm.
   - The script applies migrations `001` through `012` cleanly in order.
   - **Important**: The script automatically stops `005_seed_dev.sql` at the `-- DEV ONLY` boundary, seeding only the `company_settings` record and inserting **zero** test data or dummy accounts into production.

---

## 2. GitHub Secrets & Variables Setup

The automated CI/CD pipeline in `.github/workflows/backend.yml` handles building, testing, and deploying over encrypted FTPS.

### Required Secrets (Repository Settings &rarr; Secrets and variables &rarr; Actions &rarr; Secrets)
*Note: Store only the secret names in GitHub; never commit their values into code.*

- `FTP_HOST`: MonsterASP FTP host (e.g., `siteXXXX.siteasp.net`).
- `FTP_USER`: MonsterASP FTP username (e.g., `siteXXXX`).
- `FTP_PASSWORD`: MonsterASP FTP password.
- `SOLAR_PROD_SETTINGS`: Single-line compressed JSON with production configuration keys:
  - `ConnectionStrings__Solar` (Neon direct connection string)
  - `Jwt__Key` (48-byte Base64 key)
  - `Storage__Provider` (`R2`)
  - `R2__AccountId` (Cloudflare account ID)
  - `R2__AccessKeyId` (Cloudflare R2 access key ID)
  - `R2__SecretAccessKey` (Cloudflare R2 secret access key)
  - `R2__Bucket` (R2 bucket name, e.g. `solar-maintenance`)
  - `App__PublicApiUrl` (e.g., `https://solar-api.runasp.net`)
  - `Internal__Key` (Secret key for triggering alert tasks)
  - `Cors__AllowedOrigins__0` (e.g., `https://solar-admin.pages.dev`)
  - `Smtp__*` (Optional SMTP configuration if sending emails)
- `INTERNAL_KEY`: Must match `Internal__Key` inside `SOLAR_PROD_SETTINGS`. Used by daily cron to run alerts.
- *(Optional Release Keystore Secrets for APK signing)*:
  - `ANDROID_KEYSTORE_BASE64`
  - `ANDROID_KEYSTORE_PASSWORD`
  - `ANDROID_KEY_ALIAS`

### Required Variables (Repository Settings &rarr; Secrets and variables &rarr; Actions &rarr; Variables)
- `API_URL`: Canonical public API HTTPS address (e.g., `https://solar-api.runasp.net`).

### Generating `SOLAR_PROD_SETTINGS` Safely
Run the deployment helper locally:
```powershell
powershell -File backend\deploy\deploy-monsterasp.ps1 -ShowGitHubSecrets
```
- It prompts for Neon, Cloudflare R2, and MonsterASP credentials using hidden inputs.
- It encrypts the values locally on your machine using Windows DPAPI (`%APPDATA%\SolarMaintenance\deploy-settings.xml`), never writing them to the git repository.
- It outputs the exact JSON line for `SOLAR_PROD_SETTINGS`.
- Copy the line, paste it into GitHub Secrets, and close the PowerShell terminal to clear screen memory.

---

## 3. Deploy the API & Verify Health Check

1. Merge your approved PR into `main` (or `master`).
2. GitHub Actions runs `.github/workflows/backend.yml`:
   - Runs `build-test` on an ephemeral PostgreSQL 16 container, applying all migrations and verifying all 124 unit and integration tests.
   - Deploys the published `.NET` API to MonsterASP via FTPS.
   - Injects settings into `web.config` and polls `https://<api-domain>/health` until it answers `200 OK`.
3. Verify in your browser or curl:
   ```bash
   curl -fsS https://<api-domain>/health
   # Expected: Healthy (HTTP 200)

   curl -fsS https://<api-domain>/health/ready
   # Expected: Healthy (HTTP 200, checks DB connection)
   ```
4. Verify `/dev` endpoints are unreachable in production:
   ```bash
   curl -i https://<api-domain>/dev/users
   # Expected: HTTP 404 Not Found
   ```

---

## 4. Build & Host the Admin Web Portal

1. Create a free project on [Cloudflare Pages](https://pages.cloudflare.com) connected to your `Solar_UI` repository.
2. Configure build settings:
   - **Framework preset**: None / Vite
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Root directory**: `admin-web`
3. Add Environment Variables in Cloudflare Pages:
   - `VITE_API_URL`: `https://<api-domain>` (Must start with `https://`)
   - `VITE_DEV_LOGIN`: `false`
4. Deploy the site. Cloudflare Pages assigns a domain like `https://solar-admin.pages.dev`.
5. Update CORS in the backend API to allow this origin:
   - Update `Cors__AllowedOrigins__0` in `SOLAR_PROD_SETTINGS` to `https://solar-admin.pages.dev`.

---

## 5. Build Mobile APKs with EAS

Both mobile applications are configured with production build profiles that enforce HTTPS and completely strip out developer sign-in and editable server fields.

### Prerequisites
Install EAS CLI and sign in to Expo:
```bash
npm install -g eas-cli
eas login
```

### Build Maintenance Mobile App
```powershell
cd Solar_UI\mobile
npx eas-cli build --platform android --profile production-apk
```

### Build Survey Mobile App
```powershell
cd Solar_UI\survey-mobile
npx eas-cli build --platform android --profile preview
```
*(Or use profile `production-apk` for an internal installable APK)*

### Important Rules
- Before running the EAS build, make sure `EXPO_PUBLIC_API_URL` is configured to `https://<api-domain>` and `EXPO_PUBLIC_DEV_LOGIN` is set to `false`.
- Download the generated `.apk` files from your Expo dashboard.
- Distribute APK files **only** to authorized company engineers via secure internal channels. Do not host APKs on public unauthenticated web links.

---

## 6. Create Real Users & Conduct Real-World Testing

### 1. Create the First Real Administrator
Run the safe admin seed script from `Solar_Api`:
```powershell
powershell -File backend\create-admin.ps1
```
- Prompts for the Neon connection string, administrator email, and password (hidden input, masked).
- Alternatively, supply via environment variable: `$env:ADMIN_PASSWORD="StrongPassword123"`.
- The password is salted and hashed with PBKDF2 (HMAC-SHA256) via `AuthService`.
- No dummy password or unhashed credential is ever saved or logged.

### 2. Set Up Company, Engineers & Clients
1. Sign in to `https://<your-admin>.pages.dev` with your admin email and password.
2. In **Company Settings**, verify company name, address, phone, and upload the official logo.
3. In **Engineers**, click **Add Engineer** to register company engineers with their real names and phone numbers. Set initial passwords for each engineer.
4. In **Clients**, register actual client installations and AMC details.
5. In **Surveys**, create an assigned survey task and assign it to a survey engineer.

### 3. Field Verification Test (Mobile Data / WiFi OFF)
1. Install both APKs on an Android device.
2. **Turn OFF Wi-Fi** on the device so it connects purely over cellular network (LTE / 5G).
3. Open the **Survey App**:
   - Confirm the "Quick sign-in (test build)" box is **absent**.
   - Confirm the editable "Server address" field is **absent**.
   - Sign in using the engineer's email and password.
   - Verify assigned surveys appear on the home screen.
   - Start survey, fill checklist, take photo, capture signature, and submit.
   - Verify PDF generates and syncs successfully.
4. Open the **Maintenance App**:
   - Perform the same checks (no dev login, connects over HTTPS, records visits).

---

## 7. Database Backups & Disaster Recovery

### Backup Frequency & Strategy
- **Automated Neon Recovery**: Neon free tier includes 24 hours of point-in-time recovery (PITR).
- **Weekly / Pre-Deployment Export**: Take an off-site logical backup before making code updates or every week:
  ```powershell
  # Using PostgreSQL pg_dump:
  pg_dump -d "<neon-direct-connection-string>" -F c -b -v -f "solar_backup_$(Get-Date -Format 'yyyyMMdd').dump"
  ```
- **Storage**: Store backup files in an encrypted offline folder or private cloud backup.

### Disaster Recovery
- **If MonsterASP is down**:
  - The API can be deployed to Azure App Service F1 (free) or Render/Fly.io using the Docker/C# build. The database and storage remain independent and untouched.
- **If Neon is down**:
  - Restore the latest `.dump` file into another PostgreSQL instance (e.g. Supabase, Aiven, or Tembo free tier):
    ```powershell
    pg_restore -d "<new-connection-string>" -v "solar_backup_latest.dump"
    ```
  - Update `ConnectionStrings__Solar` in `SOLAR_PROD_SETTINGS` and re-trigger GitHub Actions.

---

## 8. Final Security Checklist

Before handing over to operations, confirm:
- [x] **No Secrets in Git**: `appsettings.json` contains no passwords or keys; local dev uses throwaway local credentials.
- [x] **DevAuth Disabled**: `/dev/*` endpoints return 404 in production; JWT tokens with `dev_login` claim are rejected by `OnTokenValidated`.
- [x] **No Dev UI in Production**: Quick sign-in and editable server fields are completely hidden from production web and mobile builds.
- [x] **Enforced HTTPS**: Mobile apps block cleartext HTTP (`usesCleartextTraffic: false`); API redirects to HTTPS and enables HSTS.
- [x] **CORS Restricted**: API allows only the configured production admin web origin.
- [x] **Private Storage**: Cloudflare R2 bucket is private. Photos and signatures are accessed only through authenticated API endpoints or cryptographically signed time-limited share links.
- [x] **Password Protection**: ASP.NET Core Identity PBKDF2 hasher with HMAC-SHA256 and unique salt.
- [x] **Rate Limiting**: Rate limiter limits login attempts to 20/minute per IP to defend against brute force.
- [x] **Test Verification**: All 124 backend tests pass in Release mode.
