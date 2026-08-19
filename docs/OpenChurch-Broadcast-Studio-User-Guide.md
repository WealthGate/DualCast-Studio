# OpenChurch Broadcast Studio v0.6.1 - User Guide

## 1. Purpose

OpenChurch Broadcast Studio is an open church-production application for preparing presentations, switching cameras and scenes, recording services, streaming to several destinations, driving sanctuary displays, and operating lower thirds. Version 0.6.1 is designed around a Preview/Program workflow so edits can be prepared safely before the congregation sees them.

## 2. Installation and Updates

1. Open the project's GitHub Releases page.
2. Download the Windows installer for the newest version.
3. Run the installer. The version appears in the title area and Menu.
4. Use Menu > Check for Updates. When a release is available, choose Download, then Install and Restart.

The portable ZIP can be used when installation is not permitted. Always back up important recordings before upgrading.

## 3. Interface and Docking

- Preview is the rehearsal workspace. Changes made here are not sent to Program until TAKE.
- Program is the live output used by recording, streams, projectors, and network outputs.
- Drag a dock tab by its title to another zone. The highlighted target shows where it will dock.
- Drop a panel on another dock to merge it as a tab.
- Drag dock boundaries horizontally or vertically to resize them.
- Right-click a dock, scene, or source for its applicable commands.
- Use the dock context menu to restore a hidden panel or reset the layout.
- Use View > Open Multiview Window to monitor scenes and cameras. Single-click sends a tile to Preview; double-click sends it directly to Program.

## 4. Scenes, Sources, and Safe Switching

Create scenes for sermon, worship, announcements, Scripture, media, and camera angles. Selecting a scene reveals only the sources attached to it. Every scene can contain any supported source type:

- Screen capture
- Window capture
- Camera
- Image
- Video
- Browser/web page
- Audio file
- Text or lower-third text

Use the source context menu to show/hide, mute, lock, group, reorder, fit, restart media, edit, or remove a source. Move and resize unlocked sources in Preview. Select the desired transition, then press TAKE to snapshot Preview into Program. Later Preview edits remain private until the next TAKE.

Window Capture refreshes whenever its source picker opens. Use Refresh Windows to rescan all capturable desktop windows, including browser windows. Some protected/DRM video, minimized windows, elevated applications, or GPU-protected surfaces may be hidden or black because Windows or the content provider blocks capture. Use a Browser source with the page URL when direct window capture is blocked.

## 5. Lower Third Studio

Open the Lower Third Studio dock for live text graphics.

- Type a name, title, announcement, or message and choose Add and Show.
- Paste lyrics or longer text with one blank line between sections. Choose Split Blank Lines into Slides.
- Click a slide to cue it live, or focus the dock and use arrow keys for Previous/Next.
- Clear Live removes the active lower third.
- Formatting supports font family, size, text and background colors, alignment, bold, italic, underline, and a maximum line count.
- Maximum Lines 0 displays the complete text and automatically reduces the font size when necessary.
- Entrance and exit effects include fade, slide left, slide right, slide up, zoom, wipe, and none.
- Add an image or church logo on the left, right, or as a background. It follows the selected lower-third animation.
- Show over Program composites the graphic into recordings and streams. The dedicated lower-third display output remains transparent outside the graphic area.

## 6. Scripture

Open the Scripture dock, enter a reference such as John 3:16-18, and choose Fetch. The complete returned passage and Book/Chapter/Verse reference appear for review before sending to the lower third. You may edit or manually paste licensed Bible text.

Providers are configured under Venue & Outputs:

- Bible API: public reference lookup where available.
- API.Bible: set a Bible ID and the API key environment variable.
- Custom: configure an endpoint that accepts a reference query and returns JSON with text and optional reference/translation fields.

Translation availability and public display rights depend on the selected provider and Bible publisher. The church is responsible for applicable licenses.

## 7. Sanctuary and Independent Outputs

Use Sanctuary Displays to select one or more connected projectors/displays and open Program output. A separate lower-third display can feed a graphics key/fill workflow. Venue & Outputs also provides network output for displays and additional operators on the local network. Protect operator access with a PIN and use trusted church networks.

The app's built-in wireless output is the local-network Program URL, which works with browser-capable displays, receiver devices, and OBS Browser Sources. Native Miracast, AirPlay, Chromecast discovery, NDI, SDI, and virtual-camera output are not built in; those workflows require separate operating-system features, receiver hardware, or streaming software. Test latency and resolution before the service.

## 8. Multiview and Multiple Operators

Assign each station a name and role: director, graphics, audio, or stream. Network operator URLs allow another authorized device to trigger supported production controls. The Multiview window shows scene and camera tiles with Preview and Program status. Keep the director responsible for TAKE while graphics and streaming operators prepare their own docks.

## 9. Audio Mixer

Choose System, Microphone, System + Mic, or None in the header. The Audio Mixer controls source and master levels. Confirm that meters move without clipping, monitor through headphones, and make a test recording before every service. Audio files and video-source audio can be enabled per scene source.

## 10. Recording and Post Editor

Choose quality, frame rate, audio mode, and save folder in System Settings. Press Record in the header or Controls dock. Open Folder locates the finished recording. The Post Editor exports a selected time range from a recording. FFmpeg performs encoding and may use a WebM fallback when the requested conversion is unavailable.

## 11. Multi-Destination Streaming

Add one card per destination and enable the destinations required for the service. Custom RTMP accepts a server URL and stream key. YouTube Live and Facebook Live also provide Connect Account.

Platform authorization requires a church-owned developer application:

- YouTube: set OPENCHURCH_YOUTUBE_CLIENT_ID and OPENCHURCH_YOUTUBE_CLIENT_SECRET. The app opens Google's official sign-in page and attempts to load the endpoint of a bound YouTube Live stream.
- Facebook: set OPENCHURCH_FACEBOOK_APP_ID and OPENCHURCH_FACEBOOK_APP_SECRET. Facebook permissions and app review determine which live details can be loaded automatically.

Sign-in uses the official provider in the system browser. Gmail, Outlook, Yahoo, and other email providers do not themselves supply stream destinations; use the email account associated with YouTube or Facebook. OAuth access tokens are not written to normal app settings. Stream keys are stored using protected operating-system storage only when Remember Stream Key is enabled.

Select encoder, preset, FPS, and audio bitrate, then start streaming. Destination status cards and logs help diagnose individual failures without hiding other destinations.

## 12. Themes and Accessibility

System Settings includes System, Dark, Light, High Contrast, Midnight, and Warm themes. High Contrast adds strong focus indicators. Operators should choose a theme with readable contrast for the room lighting and use Windows display scaling when text is too small.

## 13. Song Library and Integrations

Venue & Outputs contains adapter settings for a local song-library folder, Planning Center, or a custom API. Paste-and-split in Lower Third Studio works without a subscription. Verify copyright and reporting obligations for lyrics. AI settings reserve provider, endpoint, model, API-key environment variable, live captions, sermon summaries, and highlight detection. Version 0.6.1 does not yet execute those AI workflows, even after credentials are configured.

## 14. Recommended Service Workflow

1. Connect displays, cameras, microphones, and network devices.
2. Open the app and confirm the displayed version.
3. Create scenes and attach the correct sources to each.
4. Refresh Window Capture and verify every required media source.
5. Load songs and Scripture; check line limits and animation speed.
6. Confirm Preview and Program differ until TAKE.
7. Open projector, lower-third, multiview, and network outputs.
8. Make a short recording and private stream test.
9. Verify audio, sync, stream health, and destination status.
10. During the service, prepare in Preview and use TAKE deliberately.

## 15. Troubleshooting

- A window is missing: reopen Add Source > Window, choose Refresh Windows, restore minimized windows, run both apps at the same privilege level, or use Browser source.
- Captured video is black: protected video may block capture; use permitted media files or a browser/source workflow supported by the provider.
- Program changed unexpectedly: use TAKE rather than double-clicking Multiview; double-click is an intentional direct-to-Program action.
- Stream cannot start: verify at least one enabled destination has both server URL and key, check the account's scheduled live event, and inspect stream logs.
- Scripture fails: check provider URL, Bible ID, internet connection, and API-key environment variable; manual text remains available.
- Update is not offered: choose Menu > Check for Updates and confirm internet/GitHub access.
- Layout is crowded: resize dock boundaries, merge docks into tabs, hide unused docks from their right-click menu, or reset the layout.

## 16. Privacy and Safety

Do not display private browser windows, credentials, counseling notes, or member data. Use separate presentation/browser profiles for services. Keep API credentials in environment variables, restrict operator PINs, use least-privilege provider permissions, and rotate any stream key exposed on screen or in a recording.
