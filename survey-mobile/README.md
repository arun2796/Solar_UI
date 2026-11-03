# Solar Maintenance — Engineer Mobile App (Expo)

Expo SDK 58, Expo Router, TypeScript, React Hook Form + Zod, expo-sqlite (drafts and offline cache), react-native-signature-canvas, @react-native-community/datetimepicker, expo-sharing.

## Run locally
```
npm install
npx expo start           # press a for the Android emulator, or use a development build
```
API address for development: `.env.development` (`http://10.0.2.2:5000` = your PC from the Android emulator).
For a physical phone put your PC's Wi-Fi address in `.env.development.local` (git-ignored), e.g. `EXPO_PUBLIC_API_URL=http://192.168.1.53:5000`.
Test builds also let you change the server address on the login screen (Quick sign-in → Server address) without rebuilding.

`react-native-signature-canvas` (WebView) and `expo-sqlite` need native code, so use a **development build** or a test APK rather than Expo Go.

Sign-in goes to the API (`POST /auth/login`). Tokens are stored in the encrypted SecureStore and refreshed automatically; if the
phone is offline the session is kept and drafts keep saving. Only `engineer` users can create reports.
Forgotten password: an administrator sets a new one on the admin site (Engineers → Reset password).

**Environment files** (every `EXPO_PUBLIC_` value is public — it is inside the APK; never put secrets here):
| File | Used by | Contents |
|---|---|---|
| `.env.development` | `expo start`, test APK | emulator API address, `EXPO_PUBLIC_DEV_LOGIN=true` |
| `.env.development.local` | your machine only | your PC's LAN address |
| `.env.production` | reference only | the production build script passes the real HTTPS address explicitly |

## Structure
```
src/app/              routes (expo-router)
  _layout.tsx         session gate, sync engine start
  (auth)/login.tsx
  (app)/              tabs: index (dashboard), drafts, history, profile
  (app)/clients/      search, details → start visit
  (app)/reports/[localId]/section/[n].tsx   sections 1–8 (header fields on section 1)
  (app)/reports/[localId]/signatures.tsx | review.tsx | success.tsx
  (app)/reports/view/[id].tsx               submitted report + PDF share
src/db/               SQLite: drafts (fields JSON, sync flags), clients_cache
src/sync/engine.ts    create → update → signatures → submit; backoff; 409 conflict; 423 locked
src/forms/            zod section schemas, useDraft autosave hook
src/lib/              config (API address), auth (session in SecureStore, refresh, logout), api (axios + 401 retry + PDF download), types, store
src/components/       ui (Screen, Button, Toggle, banner, badges), SignaturePad
```

## Offline behaviour
- Every edit is saved to SQLite after 1.2 s, and immediately when the screen loses focus or the app goes to the background.
- Drafts belong to the user who created them; another engineer signing in on the same phone neither sees nor syncs them.
- Sync order per draft: create (idempotent on the device id) → fields (PUT with version) → signatures → submit (idempotent).
  An edit made while a request is in flight is never marked as synced (edit-sequence check), so it is sent in the next pass.
- A 409 caused by the phone's own earlier write (response lost) is resolved automatically; a real change by someone else shows a
  field-by-field comparison and waits for the engineer's choice. Submission pauses until then.
- A queued Submit stays "Submitting" through network errors and keeps retrying (backoff up to 10 min) until the server confirms.
- "Submitted elsewhere": the server report was finalised from another device or by an admin; the local copy is kept read-only with a Discard button.
- Drafts are deleted only by Done on the success screen (after the server confirmed) or by a long-press in Drafts; their signature files are deleted with them.
- Badges: Saved on phone, Syncing, Synced, Submitting, Submitted, Sync failed (tap the banner or Sync now), Conflict, Submitted elsewhere.

## Known limitations
- Offline: drafts, signatures and the client list (once loaded) work without a connection, and sync later. Signing in, loading new clients, submitting and PDFs need the API.
- Drafts started on another device are not listed on this phone (server-side drafts are not downloaded).
- Cleartext HTTP is allowed only in test builds that use an `http://` API; production builds are HTTPS-only.
- Keyboard avoidance and the native date picker need checking on a real device.

## Builds
```
powershell -File scripts\build-apk.ps1 -Profile test                                   # dev login on, PC address from .env.development(.local)
powershell -File scripts\build-apk.ps1 -Profile production -ApiUrl https://<api host> [-Keystore C:\keys\solar-release.jks]
```
The production profile refuses `http://`, LAN and placeholder addresses, turns dev login and cleartext off, and checks the
finished APK's JavaScript for the HTTPS address and for the absence of development addresses. Without `-Keystore` the APK is
signed with the debug key (trial installs only). Alternatives: GitHub Actions `android-apk` (manual run) or
`eas build -p android --profile production-apk`. Full steps: `Solar_Api/docs/deployment.md`.

## Building an APK locally on Windows
React Native's native build creates file paths longer than 260 characters, which fails on Windows unless long paths are enabled. One-time, in an **elevated** PowerShell:
```
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force
```
`reactNativeArchitectures=arm64-v8a,x86_64` in `android/gradle.properties` halves build time (phones + emulator).
