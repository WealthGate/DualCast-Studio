# Presentation and service workflow - v0.6.44

## Lower-third text without a logo

Use **All outputs → Text Only (No Logo)** above Preview and Program. This restores a hidden lower third and shows its text without the standard/Bible logo, including when the logo was configured as a watermark/background. It retains the logo configuration and reclaims its text space. **Show Text** restores normal logo rendering. Ordinary scene pictures, independent screen backgrounds, and ticker logos remain under their own controls.

The mode applies to Classic and Designer lower thirds, Preview, Program, mirrored outputs, the separate lower-third output, and the Program picture used by recording, streaming, virtual camera, and LAN output. Independent sanctuary layouts continue displaying their live text. The mobile remote has **More → Text only (no logo)**. Playing the next scheduled presentation preserves text-only mode.

## Start a new slide queue

In **Lower Third Studio**, choose **Clear All Slides**, review the confirmation, then choose **Confirm Clear All Slides**. This empties the queue and clears its live/staged cue IDs together. The configured exit animation can finish naturally. Cancel retains the queue. Saved services, offline songs/Bibles, source media, layout, and branding are retained.

If saving fails, the queue is restored and the error is shown. In-flight Scripture loading cannot recreate slides after a clear. A saved service can load its copied slides again whenever needed.

## Add to a schedule where you work

**Add to Schedule** is available beside manual text, typed songs/lyrics, saved songs, edited slides, prepared presentations, Designer cards, Scripture selection/reference/text, scenes, source properties, and source creation. Select an existing service in the adjacent list or choose **New service**. The first addition can create a service automatically.

Typed lyrics use the selected lines-per-slide and wrapping settings, so a song can be saved as a complete ordered deck before it is queued or shown. Scripture references use the selected online/offline source and are saved as text copies for later playback. Scene/source entries preserve their configuration; original media files/devices must remain available.

Adding content does not cue or publish it. The schedule owns a copy, so subsequent edits or clearing the slide queue do not remove the saved item. New sources added from the source-creation form are created in Preview and saved to the service; they do not TAKE themselves to Program.

## Order and play the service

Drag an item's grip onto another item to move it to that position. A highlighted border marks the target. Touch/pen pointer handlers support the same operation; keyboard-accessible up/down buttons also remain available. Reordering does not send a new cue live.

Click the item's title to show it live from its first slide. Click a hymn again to restart at slide one. **Next · Live** and **Previous · Live** move through the deck and then the surrounding service items without wrapping. Scripture opens in Scripture with the selected verse text/reference loaded; lyrics/text open Lower Third Studio; scenes open Sources. Click **Edit** to change the title, duration, or notes without publishing the item. Operator notes remain private.

Schedule playback restores frozen, blacked-out, hidden, or manually blended output to the selected cue. Sanctuary displays follow the scheduled text while retaining their independent styles and backgrounds. A queue that would exceed the 500-slide limit gives a **Clear All Slides** instruction before changing output.

## Audit and verification

The update was reviewed across the shared store/settings path, schedule persistence and hydration, content-copy and playback paths, Scripture sanitization/loading, Classic/Designer canvas rendering, independent/dedicated outputs, mobile command handling, and release packaging.

Verification includes the full unit suite, TypeScript/production build, `verify:presentation` rendered-pixel/React checks, `verify:service-features`, `verify:lower-thirds`, `verify:backgrounds`, `verify:live-output`, `verify:mobile`, `verify:streaming`, and `verify:stream-startup`. Presentation checks exercise text-only/restore with both logo kinds, transparent lower-third output, clear/cancel, typed editor additions, first-slide playback, Scripture editor population, narrow docks, drag persistence, and saved schedules surviving a queue clear. Release CI repeats the new presentation and service checks before packaging.

`npm audit` reports zero known advisories after the dependency fixes. Electron [42.11.16 release notes](https://github.com/electron/electron/releases/tag/v42.11.16) document the certificate mitigation and window/session fixes; the [Electron 42 migration notes](https://www.electronjs.org/blog/electron-42-0) cover runtime changes.

Automated fixtures use controlled media and local streaming endpoints. They do not prove compatibility with every physical camera, GPU, projector, provider account, or mobile device. Check the actual service equipment before a live broadcast.
