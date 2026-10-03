# Coaching OS — Student & Guardian App

Android + iOS app (Expo / React Native) for the student and guardian portal.
It talks to the Coaching OS Next.js server in the parent folder through the
existing `/api/portal/**` routes, authenticating with a Bearer token from
`POST /api/portal/auth/mobile-login`.

## Run on your phone (development)

1. Start the Next.js server in the repo root: `npm run dev`
2. In `mobile/`, copy `.env.example` to `.env.local` and set
   `EXPO_PUBLIC_API_URL` to your PC's LAN address, e.g. `http://192.168.1.102:3000`
   (phone and PC on the same Wi-Fi).
3. `npm install`, then `npx expo start`
4. Scan the QR code with **Expo Go** (Android: Play Store, iPhone: App Store).

## Build a real APK (Android)

The server must be deployed on a public HTTPS URL first — an installed app
cannot reach `localhost`. Put that URL in `eas.json` (replace
`https://YOUR-DEPLOYED-DOMAIN` in both profiles).

```bash
npm install -g eas-cli
eas login                                   # free Expo account
eas init                                    # links this folder to an Expo project (first time only)
eas build -p android --profile preview      # → download link to an .apk
```

Open the link on any Android phone, download, allow "install unknown apps", install.

Play Store: `eas build -p android --profile production` (builds an `.aab`), then
`eas submit -p android` — needs a Google Play Console account ($25 once).

## Build for iPhone

iPhones don't install APKs, and Apple only allows signed apps, so an
**Apple Developer account ($99/year)** is required. No Mac is needed — EAS builds in the cloud.

- Testing on specific iPhones: `eas device:create` (register each iPhone), then
  `eas build -p ios --profile preview` → install link.
- TestFlight / App Store: `eas build -p ios --profile production`, then `eas submit -p ios`.

## Notes

- App id: `com.coachingos.portal` (change in `app.json` before the first store upload — it's permanent).
- Icons/splash: replace the images in `assets/`.
- Online payments open the bKash/SSLCommerz page in an in-app browser; the fees screen refreshes when it closes.
- Checks: `npx tsc --noEmit`, `npx expo-doctor`.
