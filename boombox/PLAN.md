# Kids Boombox — Feasibility & 48-Hour Build Plan

_Last updated: 2026-10-05_

## 1. The short answer

**Yes, a working prototype for our own home is possible in 48 hours with Spotify.** Shipping it as a
product is a separate problem. Spotify's current developer rules block that today, and Amazon Music
has no API we can get access to right now.

| Question | Answer |
|---|---|
| Can an Android device play Spotify content selected elsewhere? | **Yes.** Use the Spotify **Android App Remote SDK** to drive the official Spotify app installed on the boombox. This needs Spotify Premium. |
| Can a parent's iOS app search Spotify and pick playlists/artists? | **Yes**, using the **Web API** (OAuth PKCE) for search, the user's own playlists, and metadata. |
| Can we play our own audio stories? | **Yes.** It's our own content, played with Media3/ExoPlayer from our own storage. |
| Can we sell this to other families using Spotify? | **Not today without Spotify's approval.** See the blockers in §2.3. |
| Amazon Music? | **Not now.** The Web API is in closed beta with no new onboarding, and the device API is deprecated. See §3. |

## 2. Spotify: what the docs allow (as of Oct 2026)

### 2.1 Building blocks we'll use
- **Android SDK, App Remote.** This is a lightweight library that connects to the Spotify app on the
  same device and controls it: `playUri` (track/album/playlist/artist), pause/resume/skip,
  shuffle/repeat, `PlayerState` subscription and cover-art images. The Spotify app does the actual
  streaming and DRM. To set it up, register the Android package name and SHA-1 fingerprint, plus a
  redirect URI, in the developer dashboard.
- **Web API.** The parent app uses it for search, `/me/playlists`, and album/artist/playlist
  metadata. Login uses Authorization Code with PKCE, so there's no client secret on the device.
- **oEmbed fallback.** `open.spotify.com/oembed?url=…` returns the title and thumbnail for any
  share link with no auth. A parent can paste a share link for content the Web API won't return.
  Since Nov 2024, new apps can't fetch Spotify-owned editorial/algorithmic playlists via the Web API,
  but App Remote can still *play* the URI.

### 2.2 Constraints we have to design around
1. **Development Mode only.** Since the Feb 2026 change (enforced for existing apps on Mar 9, 2026):
   - The app owner must have **active Premium**. If it lapses, the app stops working.
   - **Max 5 allow-listed Spotify users per app**, and **1 Client ID per developer**.
   - Some endpoints were removed or replaced for Dev Mode apps: the "Get Several …" batch endpoints,
     follow writes, and `/playlists/{id}/tracks`, which is now `/playlists/{id}/items`. Library
     writes now go through `PUT/DELETE /me/library`.
   - The 5-user cap applies **even if we only use App Remote**, because App Remote auth goes through
     the same app registration.
2. **Extended Quota (production)** needs a legally registered business, **250k MAU**, availability in
   key markets and a launched service (criteria since May 2025). That's out of reach for a new
   product.
3. **Premium required for playback control.** The boombox's Spotify account must be Premium. Free
   tier has on-demand limits.
4. **One stream per account.** If a parent uses the same account on their phone, the boombox stops.
   Give the boombox its **own Premium Family slot**.
5. **Spotify account age rules.** The main Spotify service requires users to be 13+. Spotify Kids, the
   separate app, has no developer API. So the boombox's account is legally a parent-held account
   that the parent curates. That works for us at home, but it matters for a product.

### 2.3 Blockers for a commercial product
- **Developer Policy, Prohibited Applications:** *"Do not build products and services which are
  targeted to children. If you have actual or suspected knowledge that specific people using your
  SDA or online service are children, you must block the use of the Spotify Platform for those
  people."* A kids' boombox is squarely targeted to children. **This is the #1 risk.** It needs a
  direct conversation with Spotify (partnerships/BD) before any commercial work.
- **Commercial hardware** is meant to go through the **Spotify Commercial Hardware / Embedded SDK
  (eSDK)** program. It's companies only, with an application, then an evaluation agreement and NDA,
  then certification via Spotify's "Certomato" tool. Running the consumer Spotify app plus App
  Remote inside a sold device is not that path.
- **Dev Mode's 5-user cap** means even a friends-and-family beta is capped at 5 Spotify accounts.

**Takeaway:** build the 48-hour prototype on App Remote for our own household. In parallel, open
conversations with Spotify Commercial Hardware about the "targeted to children" clause before
investing in a product. Design the boombox so the music source is a plug-in. That keeps our own
stories, and later other services (Apple Music via MusicKit for Android is worth evaluating), from
depending on Spotify.

## 3. Amazon Music: status
- **Amazon Music Web API (v1/v2): closed beta.** Access is limited to already-approved developers,
  and Amazon says it isn't onboarding new clients. The only route is through an Amazon business
  development contact.
- **Device API: legacy and being deprecated.** No new onboarding or certification.
- **Alexa routes** (Alexa Cast, Connected Speaker APIs, AVS) are for building Alexa-enabled speakers.
  They're heavy certification programs and not a fit for a curated kids' UI.
- **Decision:** Amazon Music is **out of scope** for the 48-hour build. Send a BD access request now,
  because lead time is the bottleneck.

## 4. Architecture (prototype)

```
 ┌───────────────────────┐        ┌──────────────────────────┐
 │ Parent iOS app        │        │ Backend (Supabase)       │
 │ SwiftUI               │ write  │ - households / devices   │
 │ - Spotify PKCE login  ├───────►│ - library_items          │
 │ - Search / my lists   │        │ - stories (Storage)      │
 │ - Approve → library   │        │ - Realtime channel       │
 │ - Upload stories      │        └────────────┬─────────────┘
 └───────────────────────┘                     │ realtime subscribe
                                               ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ Boombox (Android 12+, kiosk / Lock Task mode)                │
 │ Kotlin + Jetpack Compose                                     │
 │ - Cover-art carousel (touch + jog dial)                      │
 │ - SpotifySource  → App Remote → Spotify app (Premium slot)   │
 │ - StorySource    → Media3 ExoPlayer ← Supabase Storage       │
 │ - Volume cap, sleep timer, local cache of library            │
 │ Jog dial: RP2040 + rotary encoder as USB HID                 │
 │   (DPAD_LEFT/RIGHT, ENTER on push, MEDIA_PLAY_PAUSE)         │
 └─────────────────────────────────────────────────────────────┘
```

Key design choices:
- **The parent app only curates and the boombox only plays.** Kids never see search, so a curated
  allow-list is the whole safety model.
- **The `library_items` row is source-agnostic:** `{id, household_id, source: spotify|story,
  uri_or_url, kind: playlist|album|artist|track|story, title, image_url, position, enabled}`.
- **Pairing:** the boombox shows a 6-digit code or QR, and the parent app claims it into the
  household.
- **The jog dial is a USB keyboard**, so Android sees standard key events. No custom drivers. Compose
  handles focus movement natively.
- **Store everything needed to render the carousel** (title, art URL) at curation time. The boombox
  then never needs Web API calls, which keeps it clear of Dev Mode endpoint limits.

### Hardware for the prototype
- An Android tablet (8–10") or SBC with a touchscreen running Android 12+, with Google Play so the
  Spotify app can be installed. Plus a decent powered speaker over USB-C or 3.5mm.
- RP2040 board (Pi Pico / Pro Micro) + KY-040 rotary encoder with push switch. Flash a CircuitPython
  or Arduino HID sketch.
- Accounts: Spotify Premium Family (owner = developer account holder, plus a slot for the boombox),
  Apple Developer (for TestFlight), and Supabase (free tier).

## 5. 48-hour plan: sprints and builds

Sprints are time-boxed, in priority order. Each one ends in a named build that works.
**The most important rule: Sprint 0's go/no-go spike comes before anything else.**

### Sprint 0, hours 0–3: setup and go/no-go spike
- [ ] Create the Spotify developer app (owner on Premium). Add redirect URIs for Android + iOS,
      register the Android package + debug SHA-1, and allow-list the boombox's Spotify user.
- [ ] Install Spotify on the boombox device and log in with the boombox Family slot.
- [ ] Spike: a minimal Android app connects App Remote → `playUri("spotify:playlist:…")` → audio plays.
- [ ] Spike: the iOS PKCE login gets a token, and `GET /v1/search?type=playlist,artist,album` returns
      results. Note any Dev Mode limits on search page size.
- [ ] Create the Supabase project: tables, row-level security, a Storage bucket.
- **Build B0:** "it plays." **Go/no-go:** if App Remote can't play on the target device, switch
  hardware before going further.

### Sprint 1, hours 3–12: boombox core (highest priority)
- [ ] Compose app shell: full-screen cover-art carousel, a big play/pause, and a now-playing bar.
- [ ] `PlaybackSource` interface; `SpotifySource` over App Remote (connect, reconnect on
      disconnect, PlayerState → UI).
- [ ] Hardcoded library of 6–10 Spotify URIs so we can test the UI end to end.
- [ ] Touch navigation: swipe/tap to select, tap to play, skip prev/next.
- **Build B1:** a kid can pick and play hardcoded Spotify playlists by touch.

### Sprint 2, hours 12–20: parent app v0 and backend
- [ ] SwiftUI app: Spotify login (PKCE via `ASWebAuthenticationSession`, refresh token in Keychain).
- [ ] Search tab (playlists/albums/artists) and "My Playlists" tab → **Approve** writes a
      `library_items` row with title + art.
- [ ] Paste a Spotify share link → oEmbed metadata → approve. This covers editorial playlists.
- [ ] Library tab: reorder, enable/disable, delete.
- [ ] Household + boombox pairing (code entry).
- **Build B2:** TestFlight internal build. A parent curates a list in the cloud.

### Sprint 3, hours 20–28: connect them, add the jog dial and stories
- [ ] Boombox subscribes to the household's `library_items` (Supabase Realtime) and caches it
      locally (Room/DataStore) for offline startup.
- [ ] Jog dial firmware (encoder → DPAD_LEFT/RIGHT, press → ENTER, long-press → play/pause).
      Map the keys in Compose and add haptic/sound "tick" feedback on screen.
- [ ] Stories: parent app uploads audio + cover (Supabase Storage). `StorySource` on Media3
      ExoPlayer, with audio focus so Spotify pauses when a story starts and the other way round.
- **Build B3: first end-to-end version.** The parent approves a playlist on iPhone, it appears on the
  boombox within seconds, and the kid dials to it and plays it. Stories play too.

### Sprint 4, hours 28–38: kiosk hardening and parental controls
- [ ] Device owner + Lock Task mode (`adb shell dpm set-device-owner …`), launch on boot, hide the
      system bars.
- [ ] Recover when the Spotify app is killed or logged out. Show a friendly "ask a grown-up"
      screen on the boombox and send a status row to the parent app.
- [ ] Parent controls: max volume, sleep timer / bedtime window, "now playing" view, remote pause.
- [ ] Explicit-content guard: hide items flagged explicit at approval time, and skip explicit tracks
      at play time using `PlayerState` track info.
- **Build B4:** the boombox can sit in a kid's room unattended overnight.

### Sprint 5, hours 38–48: polish, kid testing, release builds
- [ ] Kid-sized UI pass: big targets, no text-only affordances, color/animation on selection.
- [ ] Real-kid test session. Fix the top 5 issues.
- [ ] Signed release APK and TestFlight build. A one-page setup doc (accounts, pairing, hardware).
- **Build B5: v0.1 "Living-room-ready."**

### Cut list (drop these first if we slip)
Explicit-track skipping (keep only the explicit flag at approval time), remote pause, sleep timer,
oEmbed paste, offline cache. **Never cut:** the B0 spike, B3's end-to-end flow, and Lock Task mode.

## 6. After 48 hours: roadmap
1. **Spotify business conversation.** Commercial Hardware application, plus explicit clearance on
   the children policy. This decides whether Spotify can be in a sold product.
2. **Amazon Music.** BD request for Web API v2 beta access.
3. **Content-source abstraction is already in place.** Evaluate Apple Music (MusicKit for Android
   plays on Android; MusicKit on iOS covers parent curation) and licensed kids' audio catalogs.
4. **Own stories as the differentiator.** Recording in the parent app, NFC "story cards," and
   offline downloads.
5. **Hardware:** move from tablet to a custom enclosure on an Android SBC. Battery, speaker tuning.
6. **Android parent app** once the iOS flow is proven.

## 7. Repos (proposed)
This plan lives in the website repo for now. Code should go in dedicated repos:
`boombox-android` (Kotlin/Compose), `boombox-parent-ios` (SwiftUI), and `boombox-backend` (Supabase
migrations, edge functions, jog-dial firmware).

## Sources
- Spotify, *Update on Developer Access and Platform Security* (2026-02-06): https://developer.spotify.com/blog/2026-02-06-update-on-developer-access-and-platform-security
- Spotify, *February 2026 Web API Dev Mode Changes, Migration Guide*: https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide
- Spotify, *Quota modes*: https://developer.spotify.com/documentation/web-api/concepts/quota-modes
- Spotify, *Updating the Criteria for Web API Extended Access* (2025-04-15): https://developer.spotify.com/blog/2025-04-15-updating-the-criteria-for-web-api-extended-access
- Spotify, *Developer Policy*: https://developer.spotify.com/policy
- Spotify, *Developer Terms*: https://developer.spotify.com/terms
- Spotify, *Android SDK*: https://developer.spotify.com/documentation/android
- Spotify, *Commercial Hardware*: https://developer.spotify.com/documentation/commercial-hardware/
- TechCrunch, Spotify Dev Mode changes (2026-02-06): https://techcrunch.com/2026/02/06/spotify-changes-developer-mode-api-to-require-premium-accounts-limits-test-users/
- Amazon, *Amazon Music Web API Overview v2*: https://developer.amazon.com/docs/music/API_web_overview_v2.html
- Amazon, *Amazon Music Program Overview*: https://developer.amazon.com/docs/music/get_started_program-overview.html
- Amazon Developer Community, *Request for Amazon Music API access*: https://community.amazondeveloper.com/t/request-for-amazon-music-api-access/24864
