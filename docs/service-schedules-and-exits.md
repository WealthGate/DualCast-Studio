# Service schedules and animated exits — v0.6.33

## Prepare and save a service

Open the **Schedule** tab beside the production docks. Existing workspaces receive the tab without restoring other docks you previously hid.

1. Choose **New service**, name it and optionally choose the service date.
2. Under **Add service item**, choose a scene/media arrangement, a prepared song/slide deck, a Scripture reference, announcement text or an operator note.
3. For songs, prepare the deck in Lower Third Studio first. Scripture references use the Scripture source currently selected in the app, including an installed offline library. The fetched verses are saved into the service so playback does not fetch them again.
4. Use the arrows to reorder items. Select an item to edit its title, planned minutes and private operator notes.
5. Changes save automatically in this PC's application settings. **Save now** retries a failed save; errors remain visible. Choose a saved service to reopen it. **Duplicate service** creates a reusable copy. Deleting a service offers Undo.

Scene contents and presentation slides are copied into the schedule. Editing or deleting their originals does not remove the saved copies. Media files, camera devices and capture targets referenced by a scene must still be available. Schedules are local to the user's PC; this feature does not synchronize media or schedules between computers.

## Run the service

Selecting, preparing, editing and reordering items does not change Program. **Show live** displays the selected item. **Next · Live** and **Previous · Live** step through each slide in a presentation before moving between service items; they stop at the ends instead of wrapping. Operator notes are private: selecting one keeps the previous live output running. The current cue is retained while switching tabs during the session.

Planned minutes are rundown estimates. Items advance only when the operator chooses; this is not an unattended timed playout system. Switching services or restarting the app never starts items automatically.

## Animated removal

Lower Third Studio's **Exit** and **Animation (ms)** settings now apply when clearing live configured text, hiding Scripture, hiding lower thirds or disabling **Show over Program**. The outgoing content remains renderable until its exit finishes, including on transparent lower-third projection. Explicitly choosing **None** retains a cut. Scene-source lower thirds fade when hidden, and independent sanctuary text fades before it is removed from the layout.

Stopping a Program or lower-third display, removing a display target, or using Escape fades the output window before closing it. The duration follows **Animation (ms)**, bounded to 100–3000 ms. Reopening a closing display cancels its pending exit and restores opacity. Closing does not wait indefinitely for the renderer to acknowledge animation. On Linux, where the window manager may ignore native window opacity, a page animation fades the content before closure.

## Verification

- 230 unit tests cover existing behavior plus outgoing cue retention, rapid visibility reversal, delayed/cancelled/bounded display closure, saved snapshot normalization, Scripture sanitization, complete deck navigation and existing-workspace migration.
- `npm run verify:service-features` runs actual Electron/React checks. Preview and Program pixels pass through intermediate colors before fully clearing; independent text remains mounted during its exit and is removed afterward; the production display service retains its window during a 400 ms exit and then closes it.
- The same check builds, saves, reorders and reopens a service at a 280 px dock width, restores a saved scene after deleting the studio originals, runs the next deck without editing automatically going live, and verifies the real settings JSON contains the service and items.

The tests use generated local pictures and controlled content. No public broadcast or chat message is created.
