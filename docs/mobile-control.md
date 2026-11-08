# OpenChurch Mobile Control

OpenChurch Remote is an installable mobile web app for Android phones and tablets, iPhone, and iPad. It runs from the studio’s Mobile / LAN Hub; no app store download is required. The desktop studio must remain open and connected. Cameras, media, Bible libraries, recording files, and streaming credentials remain on the studio computer.

## Connect on the same Wi-Fi

1. On the desktop, open **Venue & Outputs → Mobile Control & LAN Output**.
2. Use the generated operator PIN, or enter your own PIN of 6–16 digits. Earlier four-digit PINs are replaced with a random eight-digit PIN when settings are first opened after this update.
3. Select **Start Mobile / LAN Hub**.
4. Copy an operator address using the computer’s network IP, for example `http://192.168.1.20:8787/operator`. The `127.0.0.1` address only works on the studio computer.
5. Open the address in Safari or Chrome on your phone, then enter the PIN.

Allow the studio’s local port through the computer’s firewall for your private venue network if prompted. Guest Wi-Fi with client isolation may prevent the phone from reaching the studio; use the production network or the private connection below.

## Connect through mobile data or another internet connection

The hub supports a private HTTPS reverse proxy. The included setup uses Tailscale Serve, so the phone can reach the studio across internet connections without a router port forward. This requires installing and connecting Tailscale separately; OpenChurch does not provision a cloud relay or a VPN account.

1. Install Tailscale on the studio computer and the phone/tablet. Sign both into the same private Tailscale network and connect them.
2. On the studio computer, run the following command, replacing `8787` if you use a different hub port:

   ```text
   tailscale serve --bg http://127.0.0.1:8787
   ```

3. Complete the HTTPS setup if Tailscale prompts for it. Copy the resulting HTTPS address, such as `https://studio.your-tailnet.ts.net`.
4. Stop the OpenChurch hub if it is running. Paste that address into **Private HTTPS remote address**, then start the hub. The address is saved when the hub starts.
5. With Tailscale connected on the phone, open `https://studio.your-tailnet.ts.net/operator` and enter the operator PIN.
6. Test once over venue Wi-Fi and once with the phone’s Wi-Fi disabled before relying on remote operation during a service.

Use Tailscale **Serve** for private access. Keep the hub port off public router port forwards. Another trusted HTTPS proxy can be used if it forwards the complete hub from the domain root and its origin is entered in Venue. Subpath hosting is not supported. The proxy can preserve or rewrite the Host header.

See the official [Tailscale Serve guide](https://tailscale.com/docs/features/tailscale-serve) and [CLI reference](https://tailscale.com/docs/reference/tailscale-cli/serve).

## Install on the home screen

Use the HTTPS remote address for installation and service worker support. Plain HTTP on venue Wi-Fi supports browser operation, while installation availability depends on the browser.

- **iPhone / iPad:** open in Safari, select **Share → Add to Home Screen**, and open the new icon.
- **Android:** use **Install app** or **Add to Home screen** in the browser menu. Where supported, an **Install OpenChurch Remote** button also appears under More.

The app adapts to portrait phones, landscape tablets, and larger iPads. More includes optional screen wake lock and a share button. Available installation options vary by browser; see [web.dev’s installation guide](https://web.dev/learn/pwa/installation).

## Controls

| Tab | Available controls |
| --- | --- |
| Live | Program confidence picture, Preview/Program labels, camera names within scenes, stage a scene, Go live, TAKE with Cut/Fade/Crossfade, black/restore, freeze/unfreeze |
| Text | Announcements or pasted lyrics, lines per slide, private staging, saved slides, show staged text, previous/next live slide, lower-third visibility |
| Scripture | Load a reference using the desktop’s selected online provider or offline Bible library, review sanitized text, then show it live and navigate its slides |
| Ticker | Edit scrolling text already on Program: message, speed, four directions, show/hide, pause/resume |
| More | Start/stop recording, master Program volume from 0–100%, show/hide text, text only without the lower-third logo, theme/logo only, clear presentation text, installation, wake lock, share address |

Scene buttons switch configured desktop scenes. Create scenes containing the desired cameras on the desktop first. This version does not add camera devices from the phone or provide PTZ camera movement.

Staging text and Scripture leaves current live presentation text unchanged. **Show staged text** commits the current desktop Preview slide; the staged/live summary updates when another operator changes it. Previous/Next stays within that presentation and stops at either end. Scripture retains the desktop’s layout and branding.

Add a **Scrolling Text / Ticker** source to a desktop scene and TAKE it before using the Ticker tab. Mobile ticker edits update only the committed ticker and its saved source; they do not TAKE other Preview changes live. The configured style, logo, crop, and layout are retained.

The silent Program confidence monitor refreshes approximately once per second, subject to network latency and desktop frame availability. It is not a frame-accurate switching monitor. Pause it to reduce data usage. Stream status is visible; streaming account setup and stream start/stop remain desktop operations.

## Sessions and connection loss

- A PIN unlocks a full production-control session for eight hours. Desktop operator roles are workspace labels, not mobile permission restrictions.
- The PIN is never embedded in the remote address or saved in browser storage. Sessions use random HttpOnly cookies; HTTPS sessions use Secure cookies.
- Five PIN attempts per minute per connection address are allowed. Operators behind a shared proxy may share this limit.
- **Lock** revokes that browser session. Stop and restart the hub to revoke every mobile session; stop the hub to change its PIN or HTTPS address.
- The app displays confirmed desktop state and waits for command acknowledgements. Duplicate command IDs execute once per session.
- If the studio disconnects or stops publishing status, controls lock. Commands are never stored for later delivery, retried automatically, or replayed on reconnection. If a response times out, check live status before repeating an action.
- The service worker caches only the public app shell. Private status, Program pictures, authentication, and commands remain network-only. An offline home-screen icon can open the shell but cannot control the studio.

The existing `/program` and `/program.jpg` venue display endpoints remain available to devices that can reach the hub, as before. Mobile `/api/state`, `/api/frame`, and control endpoints require a signed-in session. Keep the whole hub within the trusted venue network or private VPN.

## Development verification

```text
npm test
npm run build
npm run verify:mobile
```

The mobile verifier uses hidden Electron windows and a temporary studio fixture. It exercises the actual mobile page, HTTP authentication, Electron IPC, and production store handlers; it checks text staging, live presentation, Scripture, ticker edits, scene switching, connection loss, session locking, and phone/tablet widths. Screenshots are written to `tmp/mobile-phone.png` and `tmp/mobile-tablet.png`. Physical iOS/Android installation and external-network connectivity still require testing with your devices and configured private network.
