# OpenChurch Broadcast Studio v0.6.7 - Complete User Guide

This guide is written for volunteers, media teams, pastors, and technical operators. You do not need previous broadcast-software experience.

## 1. Read This First

OpenChurch Broadcast Studio uses two video areas:

- **Preview** is your private preparation area. Move, resize, trim, or edit sources here.
- **Program** is the live output. Recording, streaming, projectors, and network viewers see Program.
- **TAKE** sends the complete Preview scene to Program.

Important rule: if you have not pressed TAKE, normal scene and source changes remain in Preview. The persistent microphone is intentionally different: when enabled, it stays in the audio mix across every scene.

In this guide, a path such as **Sources > right-click a source > Properties** means to open the Sources dock, right-click the named item, and choose Properties.

## 2. Five-Minute First Broadcast

Use this short workflow for your first test.

1. Connect the camera, microphone, headphones, and any projector before opening the app.
2. Open the app and locate Preview on the left and Program on the right.
3. In Scenes, create or select a scene.
4. In Sources, right-click an empty area and choose **Add Source**.
5. Choose Camera, select the camera, enter a clear name, and choose **Add Source**.
6. Move or resize the camera box in Preview.
7. Open Audio Mixer. Set **Program audio** to **Mic - all scenes** or **Scene sources + Mic**.
8. Select the correct microphone under **Persistent microphone**.
9. Speak normally. Confirm the Mic meter moves and does not show CLIP.
10. Press TAKE. The prepared scene appears in Program.
11. Open System Settings, choose a save directory, quality, and frame rate.
12. Press Record, speak for ten seconds, then press Stop.
13. Choose Open Folder and play the saved test from beginning to end.

Do not begin a live service until the test recording contains both picture and clean audio.

## 3. Installation, Portable Use, and Updates

1. Open the project's GitHub Releases page.
2. Download the newest Windows installer, or download the portable ZIP if installation is not permitted.
3. Run the installer. If using the ZIP, extract it before running the app.
4. Confirm the version beside the product name is **v0.6.7**.
5. Find the always-visible update button in the top header. It reads **Check for Updates** and shows the installed version below it.
6. Select **Check for Updates**. The button is disabled while checking, and the banner confirms the installed version.
7. If the app is current, dismiss the confirmation. If a newer release exists, select **Update to v[version]** to download that exact version.
8. Watch the download percentage. Do not close the app or shut down the computer while downloading.
9. When **Restart & Install** appears, save your work, stop recording or streaming, and select it to install the downloaded version.
10. After restart, confirm the new installed version below the button. You can also check through **Menu > Check for Updates**.

Back up important recordings before updating. The portable ZIP should not be run directly from inside the compressed file.

## 4. The Workspace and Docks

The workspace is made from movable docks such as Scenes, Sources, Audio Mixer, Lower Third Studio, Scripture, Live Streaming, and System Settings.

- Drag a dock tab to another area to move it.
- Drop a tab on another dock to combine them as tabs.
- Drag the boundary between docks to resize them.
- Right-click a dock to hide it or restore another dock.
- Use the dock menu's reset command if the layout becomes difficult to use.
- Choose **View > Open Multiview Window** to see several scenes and cameras together.
- In Multiview, a single click sends a scene to Preview. A double-click sends it directly to Program, so use double-click carefully.

### Choose Studio, Program Focus, or Full Program Only

- **Studio Mode** shows Preview and Program together with the operating docks. Use it while preparing and switching a service.
- **Program Focus** expands Program across the space normally shared by Preview and Program, but keeps the operating docks visible. In this mode, one click on a scene sends it directly to Program. Use it only when deliberate live switching is required.
- **Full Program Only** keeps the earlier uncluttered mode: it hides Preview and all docks and expands Program across the app. It does not change the projector, recording, or stream output.

To change modes:

1. Choose **View** in the app header.
2. Choose **Studio Mode** for normal Preview-to-Program preparation.
3. Choose **Program Focus** to keep the docks while expanding Program in the center. A red LIVE label identifies the current Program scene; clicking another scene sends it live immediately.
4. Choose **Full Program Only** to hide all operating docks.
5. Open **View** and choose **Studio Mode** whenever you need private Preview preparation again.

The app remembers the selected view for the next launch. The header remains visible in Full Program Only mode so you cannot become trapped in that view.

### Use the Controls dock

The Controls dock is the main place for live actions:

- **Start Streaming / Stop Streaming** controls the configured live destinations. If setup is incomplete, the Live Streaming dock opens and shows the exact missing item.
- **Stream Setup** opens the Live Streaming dock for title, description, privacy, category, audience, schedule, account, endpoint, quality, and encoder choices.
- **TAKE**, Cut to Black, and Freeze remain grouped with the live controls.
- **Start Recording / Stop Recording** controls the local service recording. Open Recordings appears after a file is available.
- **Studio Mode** is one toggle button. It is blue/highlighted while Preview and Program are both visible. Click it again to enter Program Focus; the highlight turns off. Click it again to restore Studio Mode.
- **Auto Configure** opens the guided performance setup.
- **Settings** opens System Settings directly.

### Use the File and Profile menus

The desktop **File** menu includes Open Recordings Folder, Open Stream Logs Folder, Open Scripture Libraries Folder, Open Application Data Folder, Settings, and Exit. Use these commands instead of searching hidden Windows folders.

The desktop **Profile** menu stores complete settings and scene arrangements for different services or venues:

1. Arrange the scenes and settings for a service.
2. Choose **Profile > New from Current Settings**.
3. Enter a clear name, such as `Sunday 1080p` or `Midweek Hall`.
4. Choose **Save Current to Profile** after later changes.
5. Select another profile and choose **Apply Profile** to load it.
6. Use Duplicate Selected as a safe starting point for a similar service.
7. Use Export for a backup or transfer and Import to add a profile file on another computer.

Profiles do not contain stream keys, OAuth tokens, client secrets, or account passwords. Applying a profile changes the studio settings and scenes but does not silently expose or move protected credentials.

### Run Auto-Configuration Wizard

1. Choose **Controls > Auto Configure** or **Tools > Auto-Configuration Wizard**.
2. Select whether streaming, recording, or both are the priority.
3. Enter a conservative wired upload speed measured at the venue.
4. Choose normal or high movement.
5. Review the recommended resolution preset, frame rate, audio bitrate, recording quality, and the hardware encoder that passed the local test.
6. Choose **Apply Recommended Settings**. Run a private test stream before the service.

## 5. Scenes: Building the Service

A scene is one complete arrangement, such as Sermon Camera, Worship Lyrics, Scripture, Announcement Video, or Closing Slide.

### Create and name a scene

1. Open the Scenes dock.
2. Right-click inside the scene list.
3. Choose Add Scene.
4. Right-click the new scene and choose Rename.
5. Use a name that another volunteer can understand immediately.

### Prepare and send a scene live

1. Click the scene once. It becomes the Preview scene.
2. Add, edit, move, or trim its sources.
3. Check the complete result in Preview.
4. Set the transition duration before sending the scene live.
5. Choose **Cut**, **Fade**, or **Crossfade** in Scene Transitions. The selected transition immediately sends Preview to Program; do not press TAKE afterward.
6. Confirm the Program label and picture are correct.

TAKE remains available as a separate control. It uses the most recently selected transition, so operators can still use the TAKE button, Ctrl/Cmd + Enter, or a remote TAKE command when that workflow is preferred.

### Make a slow manual blend from Preview to Program

1. Stay in **Studio Mode** and prepare the next scene in Preview.
2. Open **Scene Transitions** and find **Live Preview Blend**.
3. Move the fader slowly from Program toward Preview. The projector, recording, stream, and network output immediately see the selected mixture.
4. Pause anywhere between 1% and 99% when the audience should see both scenes blended together. The fader stays at that intermediate position.
5. Drag the fader fully to 100% to make Preview the new Program scene. The fader automatically returns to 0% after the change is completed. You can also choose **Complete to Preview** without dragging to the end, or **Reset to Program** to cancel the blend safely.

Program audio remains active during the blend and switches only when **Complete to Preview** is chosen. Cut, Fade, and Crossfade immediately send Preview live; TAKE uses the last selected transition. Automatic transition duration can be set from 100 milliseconds up to 15 seconds.

### Lock a finished scene

Right-click a finished scene and choose Lock. Unlock it before making changes. Locking prevents accidental edits during a service.

Program cannot be deleted while it is live. Select and TAKE another scene first.

## 6. Sources: Adding What the Audience Sees or Hears

Every scene can contain:

- Display capture
- Window capture
- Camera
- Image
- Video file
- Browser/web page
- Audio file
- Text

### Add a source

1. Select the destination scene in Scenes.
2. In Sources, right-click an empty area and choose **Add Source**.
3. Choose a source type.
4. Enter a useful name, such as Pulpit Camera or Worship Lyrics.
5. Select the device, window, or file as requested.
6. Choose **Add Source**.
7. Arrange the source in Preview.

### Arrange a source

- Drag inside its outlined box to move it.
- Drag a corner handle to resize it.
- Use **Sources > right-click source > Properties** for exact X, Y, width, height, and rotation values.
- Use Move Up or Move Down to change which source appears on top.
- Choose Lock after the source is positioned correctly.
- Assign related sources to a group when they should be managed as one layout.

### Hide the mouse cursor from Program and the audience

This applies to Display and Window capture sources.

1. In Sources, right-click the Display or Window source and choose Properties.
2. Find **Cursor in Program**.
3. Choose **Hide Cursor** so the pointer is not captured.
4. Choose Show While Moving only when viewers need to follow occasional pointer movement.
5. Choose Always Show only for demonstrations where the pointer is part of the presentation.
6. Check Program and make a short test recording.

New Display and Window sources default to Hide Cursor. The setting is applied before the scene is composed, so a hidden pointer does not appear in Program, recording, streaming, projectors, or local-network output.

### Window capture does not show the window

1. Restore the wanted window if it is minimized.
2. Open Add Source > Window.
3. Choose Refresh.
4. Run both applications at the same Windows privilege level.
5. If protected video remains black, use a permitted media file or a Browser source. DRM-protected content may intentionally block capture.

## 7. Audio Routing: Persistent Mic and Scene Audio

Open the Audio Mixer dock before configuring audio.

### Choose the program audio mode

The **Program audio** list has four choices:

- **Scene audio sources**: plays enabled audio belonging to the live scene, plus any source explicitly routed to All scenes. The microphone is not included.
- **Mic - all scenes**: plays the selected microphone continuously across every scene. Scene audio sources are not included.
- **Scene sources + Mic**: combines the persistent microphone with scene and All-scenes sources. This is the usual choice for a church service.
- **Mute all**: sends no app audio to recordings or streams.

The Audio list in the app header provides the same choices for quick access.

### Set the persistent microphone

1. Open Audio Mixer.
2. Set Program audio to **Mic - all scenes** or **Scene sources + Mic**.
3. Open **Persistent microphone**.
4. Choose the church microphone or audio-interface input. Choose System default only when Windows is already set correctly.
5. Speak at normal preaching volume.
6. Move the Mic fader until the signal is healthy without clipping.
7. Change scenes in Preview and TAKE them. The microphone remains in the program audio mix.

If Windows asks for microphone permission, allow access. Device names may become clearer after permission is granted.

### Make another audio source scene-only or persistent

Use this for video sound, an audio file, or captured desktop/window sound.

1. Add the source to a scene.
2. Enable its audio if it is muted.
3. In Audio Mixer, find its channel.
4. Choose **This scene** if it should play only while its scene is live.
5. Choose **All scenes** if it must continue when another scene is taken.

You can also use **Sources > source > Properties > Audio Routing** and select:

- **Only while this scene is live**
- **Keep playing across all scenes**

Use All scenes carefully for looping music or room audio. A persistent source stays active until it is muted, disabled, removed, or changed back to This scene.

### Understand the audio meters

- **M** means the source is mono.
- **L R** means separate left and right stereo channels.
- A meter at the bottom with no movement means silence; it no longer shows a false fixed level.
- Green is the normal working range.
- Yellow warns that the signal is getting high.
- Red and the **CLIP** label mean the signal is too high and may distort.

If CLIP appears, lower that channel first. If several channels clip together, lower Program Master. Test using the loudest expected speaking or music level, not a quiet rehearsal voice.

### Audio troubleshooting

- No Mic movement: select the correct device, enable Mic in Program audio, check Windows microphone permission, and verify the hardware is not muted.
- No video/audio-file movement: enable audio on the source, press Play if paused, and confirm the source is in the live scene or routed to All scenes.
- Meter moves but recording is silent: confirm Program audio is not Mute all, then make a new test recording.
- Echo or doubled speech: monitor through headphones and make sure the microphone is not also being captured through a second desktop or interface route.
- Only one stereo side moves: check the cable, mixer pan, and audio-interface channel routing.

## 8. Text Layouts: Full, Half, and Three-Quarter Screen

The layout buttons arrange a selected Text source and a video source without manual measurements.

1. Put a Text source and a visual source in the same scene.
2. Optional: assign both to the same group. Grouping tells the app exactly which visual source belongs with the text.
3. Right-click the Text source and choose Properties.
4. Find **Quick Text + Video Layout**.
5. Choose one of these buttons:

- **Full Text**: expands text to the complete frame. The existing visual can remain as a background if the text background is transparent.
- **1/2 - Video Left**: video uses the left half; text uses the right half.
- **1/2 - Video Right**: text uses the left half; video uses the right half.
- **Text 3/4 - Video Left**: video uses the left quarter; text uses the remaining three quarters.
- **Text 3/4 - Video Right**: text uses three quarters; video uses the right quarter.

If the Text source is grouped, the app uses a visual source in that group. Otherwise it uses the top visual source in the scene. Check Preview, adjust font size or background if necessary, then press TAKE.

## 9. Trim or Crop a Source Before It Goes Live

Trimming hides unwanted edges of a camera, display, window, image, video, or browser source. It does not delete or permanently alter the original content.

1. Select the scene in Preview.
2. Right-click the visual source and choose Properties.
3. Find **Trim / Crop Edges (%)**.
4. Increase Top, Right, Bottom, or Left to hide that edge.
5. Watch Preview while changing the values.
6. Reposition or resize the cropped result if needed.
7. Press TAKE only after Preview is correct.

Program continues showing the earlier uncropped snapshot until TAKE. To restore the full source, set all four values to 0.

## 10. Lower Third Studio

Lower thirds can show a name, title, announcement, lyric, or Scripture passage.

### Add and cue text

1. Open Lower Third Studio.
2. Type a short message in Manual lower-third text.
3. Choose Add and Show.
4. Check the staged message in Preview. Program remains unchanged.
5. Choose **Take Text Live** to change only Program text, or press **TAKE** to send the complete Preview scene and staged text together.
6. Click any saved slide to stage it in Preview.
7. Use Previous and Next, or focus the dock and use the arrow keys. Navigation remains inside the selected song or Scripture deck.
8. Choose **Clear Preview** to stage no text. Choose **Clear Program Text** when live text must be removed immediately.

### Keep the screen uncluttered

**One presentation text layer at a time** is the default and recommended setting. When it is active:

- Staging lower-third lyrics or Scripture removes an existing managed Scripture, lyric, song, or lower-third Text source from the Preview scene.
- Adding full-screen, half-screen, three-quarter, or custom Scripture to Preview clears the staged configured lower third.
- Ordinary Text sources such as a clock, score, or permanent label are not automatically removed.
- Program remains unchanged until TAKE or Take Text Live.

Enable **Allow more than one text presentation on screen** only when two or more text presentations are intentional. Check every layer in Preview before TAKE. Turning on this option does not automatically reposition overlapping text.

### Automatically create lyric slides

1. Enter a song or presentation title.
2. Paste the lyrics. Put each sung line on its own line; blank lines may separate verses or choruses.
3. Choose **Lines per slide** from 1 to 6.
4. Set the approximate characters per line. The default works well for most lower thirds.
5. Choose **Auto-Separate Text into Slides**.
6. Check the first slide in Preview, then use Next to inspect the complete song.

The app wraps long pasted lines before grouping them. A two-line setting therefore creates slides containing up to two display lines, not simply two pasted paragraphs.

### Download or import songs for offline use

1. Expand **Downloaded and Imported Songs**.
2. To download, paste an HTTPS address for a permitted TXT, Markdown, or compatible JSON lyrics file and choose **Download and Save Song**.
3. To use a file already on the computer, choose **Import TXT, MD or JSON Song**.
4. Select the saved song and choose **Load Song**.
5. Choose the lines per slide and then choose **Auto-Separate Text into Slides**.

Downloaded and imported songs remain stored on the computer. Compatible JSON may contain `title` plus `lyrics`/`text`, or ordered `slides`/`verses`. Use only material the church is permitted to download and display.

### Edit a lyric or text slide after splitting

1. Find the slide in the lower-third slide list.
2. Choose **Edit** beside that slide.
3. Correct the words, spelling, or line breaks.
4. Choose **Save & Show**.

Save & Show updates the existing slide and stages the edited slide in Preview. Choose Take Text Live or TAKE only after checking it. Cancel leaves the original slide unchanged. This works for split lyrics, manual text slides, and Scripture slides.

While editing a slide, two additional choices are available:

- **Add Slide After** saves the current edit and opens a new blank slide immediately after it. Type the new lyric or text, then choose **Save & Show**. Cancel removes the unfinished blank slide.
- **Each Line → Slide** turns every non-empty line in the editor into an ordered slide. The first line stays in the current slide and every remaining line is inserted directly after it. Use this only when every line should appear separately.

### Format the lower third

Open **Formatting and Animation**. You can set font, size, text color, background color, alignment, bold, italic, underline, maximum lines, entrance, exit, and animation time.

- Maximum Lines 0 shows the complete text and reduces font size when needed.
- Show over Program includes the graphic in recordings and streams.
- The dedicated lower-third output remains transparent outside the graphic area.

### Set background transparency

1. Choose the Background color.
2. Move **Background Opacity** toward 0% for more transparency or 100% for a solid color.
3. Check light and dark video behind the lower third before going live.

### Use a background image

1. Find **Lower-Third Background Image**.
2. Choose Choose Background and select an image.
3. Set Image Opacity so text remains readable.
4. Use Remove to return to a color-only background.

### Use a standard logo

Under **Standard Lower-Third Logo**, choose an image and place it on the left, right, or as an image background. This logo is used for normal text and song slides.

### Use a separate Bible logo or image

1. Find **Bible Passage Logo / Image**.
2. Choose Choose Bible Image.
3. Select Left, Right, or Background placement.
4. Send a passage from the Scripture dock.

Scripture slides use the Bible image. Other lower thirds continue using the standard logo. If no Bible image is set, Scripture slides use the standard logo.

## 11. Scripture

The Scripture dock can use the configured online provider, individual passages saved for offline use, or compatible downloaded/imported JSON libraries.

### Fetch from the configured online provider

1. Open the Scripture dock.
2. Set Scripture Source to **Configured Online Provider**.
3. Select the Bible book.
4. Select the chapter, start verse, and end verse.
5. Press Enter or choose the displayed **Load [reference]** button.
6. Read the complete returned passage and reference.
7. Correct the text manually if your licensed source requires it.

OpenChurch removes provider HTML, encoded entities, zero-width characters, and stray wrapping `<` or `>` characters before Scripture is displayed or saved. The Verse Text box therefore contains the readable passage rather than API formatting. If a source includes publisher footnotes as ordinary words, review them manually before going live.

Expand **Type a reference instead** when a reference is faster to type or has a format that is not convenient in the selector.

### Save one passage for offline use

1. Fetch or paste the complete passage.
2. Confirm Displayed Reference is correct.
3. Choose **Save Passage Offline**.
4. Later, choose **Saved Passages** in Scripture Source.
5. Select the book, chapter, and verse in the offline library catalog, then press Enter or choose Load.

### Import a Scripture library already downloaded to the computer

1. Expand **Offline Scripture Libraries**.
2. Choose **Import Downloaded JSON**.
3. Select a compatible `.json` library file.
4. The imported library becomes the selected Scripture Source.
5. Select a book, chapter, and verse from that library and choose Load.

### Download a Scripture library by HTTPS address

1. Obtain an HTTPS JSON download address from a source that permits downloading and public display.
2. Expand Offline Scripture Libraries.
3. Paste the address into the **HTTPS address** field.
4. Choose Download Library.
5. Wait for the passage count and success message.
6. Select the book, chapter, and verse from the downloaded version, then press Enter or choose Load.

Libraries may contain `passages` or `verses` with `reference` and `text` fields, or `books` containing chapters and verses. Files must be valid JSON and no larger than 25 MB. The app stores every downloaded translation separately, so multiple Bible versions can remain available offline at the same time. Use Remove Selected Library to delete one imported/downloaded library; Saved Passages is managed by saving individual passages.

### Split Scripture into animated slides

1. Load a passage and confirm its text and displayed reference.
2. Under **Scripture Slide Arrangement**, choose **One verse per slide**, **Automatic lines per slide**, or **Entire passage on one slide**.
3. For automatic lines, choose how many lines each slide should contain.
4. Choose the verse entrance animation and transition speed.
5. Choose **Create Slides in Preview**.
6. Inspect each verse with Previous and Next. Scripture navigation stays inside that passage deck.
7. Press TAKE to send the scene and Scripture together, or choose Take Text Live in Lower Third Studio to change only the text.

A single click on a lyric or Scripture slide stages it in Preview. A double-click sends that slide directly to Program. Double-clicking the loaded Verse Text also creates the configured Scripture slides and sends the first slide live. Use double-click only when an immediate live change is intended. Double-clicking a Text source in Sources or on the Preview canvas sends its scene and text to Program in every workspace mode.

Scripture slides use all lower-third functions: font, alignment, opacity, background image, Bible-specific image, line limit, entrance animation, and exit animation. Moving to the next verse automatically runs the configured slide transition.

### Display Scripture in any layout

- Choose **Create Slides in Preview** for the configured lower-third height, animation, opacity, background image, and Bible-specific logo.
- Expand **Add Scripture to Preview Scene** and choose Full Screen Text, either Half Screen arrangement, or either Text 3/4 arrangement.
- Choose **Custom / Freely Resizable** and enter X, Y, Width, and Height for another size.
- Choose Add to Preview Scene. Check the result in Preview, drag or resize it if needed, then press TAKE.

Full, half, three-quarter, and custom Scripture text is added as a managed presentation Text source. It can be edited, grouped, locked, moved, or resized from Sources. With the recommended one-text setting, it replaces existing managed lyrics or Scripture in Preview but does not disturb ordinary text sources. The lower-third line limit affects lower thirds only.

When using the lower third, confirm that the Bible-specific logo and reference appear correctly.

Providers are configured under Venue & Outputs:

- Bible API: public reference lookup where available.
- API.Bible: requires a Bible ID and the named API-key environment variable.
- Custom: uses the configured endpoint.

Translation availability and public-display rights depend on the provider and publisher. The church is responsible for the required Scripture and lyric licenses.

## 12. Frame Rate, Quality, and Computer Load

Open System Settings to choose recording quality and frame rate.

- **15 fps**: lowest processing load; suitable for mostly static slides or emergency use.
- **24 fps**: film-style motion with lower load than 30 fps.
- **25 fps**: useful in 50 Hz regions and PAL-based workflows.
- **30 fps**: recommended general church-service setting.
- **50 fps**: smooth motion in 50 Hz workflows with higher load.
- **60 fps**: smoothest motion and highest load.

Live Streaming has its own FPS list. Set it separately in the Live Streaming dock.

The app reduces Preview rendering to a practical rate and renders Program at the selected frame rate. It also keeps only required sources active and sends Multiview and remote-display previews at reduced rates. These choices reduce CPU and GPU work without reducing the selected recording or streaming quality.

For a lighter setup without sacrificing the quality you actually need:

1. Use 30 fps unless the service contains fast movement that clearly benefits from 50/60 fps.
2. Close unused browser pages and other GPU-heavy applications.
3. Hide or close Multiview when it is not needed.
4. Disable or remove capture sources that are not needed. Disabled sources are closed instead of continuing to consume camera, screen, browser, CPU, or GPU resources.
5. Prefer one persistent mic route instead of capturing the same microphone twice.
6. Make a private test stream while watching dropped frames and CPU use.

Never choose a higher frame rate only because the number is larger. A stable 30 fps stream looks better than an overloaded 60 fps stream.

## 13. Recording

1. Open System Settings.
2. Choose the save directory, quality, and frame rate.
3. TAKE the scene you want to record.
4. Confirm Program picture and Audio Mixer levels.
5. Press **Start Recording** in the Controls dock.
6. Confirm the red recording state and timer.
7. Press Stop at the end.
8. Choose Open Folder.
9. Play the saved file and check its beginning, middle, end, and audio sync.

During recording, the app writes each short WebM chunk through an ordered direct-to-disk session instead of keeping the entire service in memory. The temporary file grows throughout the service, so memory use does not grow with the recording duration. When you press Stop, the app closes that disk session and FFmpeg performs final MP4 encoding. Keep the app open and allow the conversion to finish before shutting down. If normal conversion is unavailable, the app saves a WebM fallback and shows a notice. Long services still require enough free disk space for both the temporary recording and final file.

## 14. Live Streaming

### Create the required Google Desktop OAuth identity

YouTube account connection requires a Google Desktop OAuth application because Google must know which installed application is requesting access. OpenChurch no longer requires hidden Windows environment-variable setup.

1. Open [Google Cloud Console](https://console.cloud.google.com/) in a browser and sign in with the Google account that will manage the application setup.
2. Use the project selector at the top to create a project such as **OpenChurch Streaming**, or select an existing project.
3. Open **APIs & Services > Library**, search for **YouTube Data API v3**, open it, and choose **Enable**.
4. Open **Google Auth Platform**. If Google shows **Get Started**, enter an app name such as OpenChurch Broadcast Studio, choose a support email, and finish the initial registration.
5. Open **Audience**. For a personal Gmail or non-Workspace church account, choose **External**. While the app remains in Testing, add every Google account that may connect under **Test users**. A Google Workspace administrator may choose Internal when appropriate.
6. Open **Clients**, choose **Create client**, set **Application type** to **Desktop app**, name it **OpenChurch Broadcast Studio**, and choose **Create**.
7. Copy the displayed **Client ID**. If Google displays a Client Secret, copy it at creation time as well; Google may not show it again. Do not create an API key or a Web application client for this step.

### Enter the Desktop OAuth identity inside OpenChurch

1. Open OpenChurch Broadcast Studio.
2. In the bottom-right **Controls** dock, choose **Settings**.
3. The **System Settings** dock opens. Find and expand **Streaming Accounts** if it is collapsed.
4. In the **YouTube Live** card, paste the Google value ending in `.apps.googleusercontent.com` into **Desktop OAuth Client ID**.
5. Paste **Client Secret** only if Google supplied one. It is optional for the Desktop application flow.
6. Choose **Save Securely**. The fields clear after saving and the card changes from **Setup required** to **Configured (secure)**. OpenChurch never displays the saved secret again.
7. Return to the **Controls** dock and choose **Stream Setup**.
8. In Live Streaming, set **Platform** to **YouTube Live**, enter the title and broadcast choices, then choose **Connect & Create YouTube Broadcast**.
9. The system browser opens Google's account chooser. Click the correct church email/channel and approve the requested YouTube permission.
10. OpenChurch protects the authorization with the operating system and reuses that account for later broadcasts. Choose **Change Account** only when another Google account is intended. Choose **Settings > Streaming Accounts > Disconnect Account** to require sign-in again while keeping the Desktop Client ID.

If **Save Securely** stays unavailable, check that the complete Desktop Client ID was pasted. Facebook is different: its App ID and App Secret are both required.

For Facebook, enter the Meta App ID and App Secret in the matching Settings card. Facebook permissions and Page access depend on the church's Meta developer-app approval. OpenChurch can remember the authorized account, but platform-only Page/event choices may still need Facebook Live Producer.

1. Open Live Streaming.
2. Add one destination card for each service destination.
3. Enable only destinations needed for this broadcast.
4. For Custom RTMP, enter the exact RTMP/RTMPS server URL and stream key.
5. For YouTube, choose **YouTube Live** and complete **YouTube Broadcast Setup** before connecting the account.
6. Enter a title. Add an optional description and scheduled start time. If the start time is blank, OpenChurch schedules the event five minutes after it is created.
7. Choose one visibility option: **Public** is listed and searchable, **Unlisted** is available to anyone with the link, and **Private** is hidden.
8. Choose the most accurate category and explicitly select whether the content is made for kids. Do not guess the audience setting.
9. Choose Normal, Low, or Ultra Low latency. Then review viewer DVR, auto-start, auto-stop, and embedding.
10. Select encoder, preset, FPS, and audio bitrate before creating the YouTube endpoint; these settings help OpenChurch request a compatible reusable stream endpoint.
11. Choose **Connect & Create YouTube Broadcast**, sign in, review Google's requested permissions, and approve only the intended church channel. OpenChurch creates the event, creates a reusable stream endpoint, binds them, and fills the RTMP URL and stream key.
12. If the button says **Create Another YouTube Broadcast**, use it only when you intentionally need a separate event. Changing a broadcast field marks the current setup as needing a new event.
13. For Facebook, connect the account when the church's developer-app configuration is available, then use Facebook Live Producer to choose the Page/event and any platform-only audience controls before entering its Server URL and Stream Key.
14. TAKE the correct scene and confirm Program audio.
15. Start the stream.
16. Watch each destination status, bitrate, FPS, dropped frames, and error messages.
17. Stop the stream after the service and confirm the platform ended correctly.

Manual YouTube RTMP streaming does not require OAuth credentials: enter `rtmp://a.rtmp.youtube.com/live2` as the RTMP URL and paste the stream key from YouTube Studio. Manual RTMP does not apply the OpenChurch broadcast metadata fields; configure the event in YouTube Studio first. Existing `OPENCHURCH_YOUTUBE_CLIENT_ID`, `OPENCHURCH_YOUTUBE_CLIENT_SECRET`, `OPENCHURCH_FACEBOOK_APP_ID`, and `OPENCHURCH_FACEBOOK_APP_SECRET` environment variables remain supported as an administrator-managed fallback, but in-app protected credentials take priority. Stream keys are stored only with protected operating-system credential storage and only when Remember Stream Key is enabled. If protected storage is unavailable, the checkbox is disabled and keys remain in memory only for the current app session.

Live ingest prefers VP8 WebM for broad FFmpeg decoder compatibility. Each destination keeps one decoder alive and uses a recoverable output queue for temporary network loss. This avoids restarting a decoder with an incomplete mid-stream WebM fragment. If the encoder process itself ends after going live, OpenChurch reports a terminal error and requires Stop Streaming followed by Start Streaming to create a clean media input.

## 15. Sanctuary, Lower-Third, Network, and Multiview Outputs

### Program display

1. Open Sanctuary Displays.
2. Select one or more connected projectors/displays.
3. Open Program output.
4. Confirm that the output is on the intended screen before the congregation enters.

### Independent lower-third display

Use the separate lower-third output for a transparent graphics workflow. Areas outside the graphic stay transparent. Cut to Black also clears this output; restoring Program allows the active lower third to return. Test transparency, image placement, black/restore behavior, and animation with the receiving system.

### Local network output

Venue & Outputs can provide Program and operator URLs on the local network. Use a trusted church network, set an operator PIN, and test latency before the service. Browser-capable displays and OBS Browser Sources can open the Program URL.

Native Miracast, AirPlay, Chromecast discovery, NDI, SDI, and virtual-camera output require separate operating-system features, receiver hardware, or software.

## 16. Multiple Operators

Assign each station a clear name and role: director, graphics, audio, or stream.

- The director controls Preview, Program, and TAKE.
- The graphics operator prepares lower thirds and Scripture.
- The audio operator watches routing, meters, and clipping.
- The stream operator watches destination health and dropped frames.

Agree before the service who is allowed to send a scene directly to Program.

## 17. Post Editor

The Post Editor exports a selected time range from a completed recording.

1. Open Post Editor.
2. Select the recording.
3. Set start and end times.
4. Preview the chosen range if available.
5. Export the clip.
6. Play the exported file and confirm the first and last moments are correct.

Source edge trimming in Preview and time trimming in Post Editor are different: Preview trimming crops picture edges; Post Editor trimming shortens a recording by time.

## 18. Recommended Pre-Service Checklist

Complete this checklist before every service.

1. Connect power, cameras, audio interface, microphone, headphones, and displays.
2. Open the app and confirm the expected version.
3. Check every camera and capture source in Preview.
4. Confirm every scene has the correct source order and locks.
5. Confirm Program audio mode and the persistent microphone device.
6. Speak and play the loudest expected music; confirm no channel shows CLIP.
7. Confirm scene-only sources stop when their scene changes.
8. Confirm All-scenes sources and Mic continue as intended.
9. Check full, half, or three-quarter text layouts on the actual output display.
10. Check all source crops in Preview, then TAKE each required scene once.
11. Test the normal and Bible lower-third logos.
12. Load one online and one offline Scripture reference, and test the required full/half/custom layout.
13. Test lower-third color opacity and background-image readability.
14. Confirm recording quality and frame rate.
15. Confirm streaming FPS, destination URLs, and keys.
16. Open sanctuary, lower-third, network, and Multiview outputs as needed.
17. Make and watch a short recording.
18. Run a private stream test and check dropped frames and audio sync.
19. Return Preview and Program to the service opening scene and Studio Mode.

## 19. Troubleshooting Quick Reference

- **Preview is correct but the audience sees the old scene:** press TAKE.
- **Program changed unexpectedly:** someone may have double-clicked a Multiview tile, which sends directly to Program.
- **Mic stops or is silent:** select Mic - all scenes or Scene sources + Mic, then verify the persistent device and Windows permission.
- **An audio file continues after changing scenes:** it is routed to All scenes. Change it to This scene or mute it.
- **Audio distorts:** lower any channel showing CLIP, then lower Program Master if needed.
- **Meters stay at zero:** confirm the source is playing, unmuted, and included in the selected routing mode.
- **A crop is not live:** crop changes remain in Preview until TAKE.
- **Mouse cursor appears to the audience:** open the Display/Window source Properties, set Cursor in Program to Hide Cursor, and confirm the capture source was recreated.
- **Wrong logo appears on Scripture:** set Bible Passage Logo / Image and send the slide from Scripture so its kind is Scripture.
- **Lower third blocks too much video:** reduce Background Opacity or background-image opacity.
- **Text layout moved the wrong video:** group the intended Text and visual source, then apply the layout again.
- **Stream cannot start:** enable at least one destination, verify the RTMP/RTMPS URL and key, and inspect the status message.
- **Scripture fetch fails:** check provider URL, Bible ID, internet access, and API-key environment variable; manual text entry remains available.
- **Scripture shows `<`, `>`, or web formatting:** reload the passage in this version. New online, imported, downloaded, and saved passages are sanitized before display. Correct any old manually saved passage once and save it again.
- **Offline library will not import:** confirm it is valid JSON, 25 MB or smaller, and uses supported passage/verse or book/chapter structures.
- **Downloaded library is rejected:** use an HTTPS direct JSON address rather than a normal web page, and confirm the source permits download.
- **Offline reference is missing:** select the correct library and use a complete reference such as John 3:16-18.
- **Only Program is visible in the app:** choose View > Switch to Studio Mode.
- **Computer is overloaded:** use 30 or 25/24 fps, close Multiview and unused browser apps, and disable or remove unused active sources.
- **Remember Stream Key is disabled:** the operating system did not provide protected credential storage. Enter keys for this session; the app intentionally will not save them insecurely.
- **YouTube says application credentials are missing:** open Settings > Streaming Accounts, follow the four Google setup steps, and save a Desktop OAuth client. A user email/password is not entered into these fields.
- **The wrong Google account opens:** in Stream Setup choose Change Account. Google opens the external account chooser; click the intended church email/channel.
- **A VP9 decoder error repeats while reconnecting:** stop the stream and start it once to create a clean input. This version prefers VP8 ingest and keeps the decoder alive during recoverable network retries, preventing the old incomplete-fragment reconnect loop.
- **Stop was pressed but the file is not ready:** keep the app open while FFmpeg finishes the final MP4. Very long services take longer and need free disk space.
- **Streaming repeatedly shows Reconnecting and `ffmpeg.exe ENOENT`:** install v0.6.6 or later from the in-app update button or the latest GitHub release. v0.6.6 launches the bundled executable from the installed `app.asar.unpacked` resources instead of trying to run it inside the application archive.
- **FFmpeg is reported missing after installing v0.6.6 or later:** stop streaming, reinstall the current release, and allow antivirus or endpoint-protection software to keep the bundled FFmpeg executable. Then restart the app and make a private test stream.
- **Dock layout is crowded:** resize dock boundaries, merge docks as tabs, hide unused docks, or reset the layout.

## 20. Privacy, Safety, and Licensing

- Do not capture private browser tabs, passwords, counseling notes, member records, or financial information.
- Use a separate browser profile for services.
- Keep stream keys and API credentials off screen.
- Store streaming application credentials only through Settings > Streaming Accounts or administrator-managed environment variables. The in-app fields use operating-system encryption and never reveal the saved secret again.
- Use a trusted network and a strong operator PIN.
- Rotate a stream key immediately if it appears in Preview, Program, a screenshot, or a recording.
- Confirm permission to display Bible translations, song lyrics, videos, and images.

## 21. Known Limits

- Direct-to-disk recording still needs free space in the operating system's temporary directory and the selected save directory.
- A forced shutdown or power loss before Stop can leave the active recording incomplete. The app removes stale temporary recording sessions when it next starts.
- Final MP4 conversion begins after recording stops. Long services take longer to convert and may temporarily require space for both the WebM capture and MP4 output.
- If FFmpeg conversion is unavailable or fails, the app preserves the recording as WebM and identifies it as a fallback.
- The Post Editor currently trims and exports one completed recording; it is not yet a multitrack editor.
- Facebook Page/event creation and some audience controls depend on Meta app review and Page permissions; Facebook Live Producer may still be required even after account connection.
- Profiles are stored on the local computer. Export profile files deliberately for backup, and remember that they contain scene names, source URLs, and studio settings even though protected secrets are excluded.

## 22. Glossary

- **Scene:** a saved collection and arrangement of sources.
- **Source:** one camera, image, video, audio file, browser page, capture, or text item.
- **Preview:** the private preparation output.
- **Program:** the live output used by viewers, recordings, streams, and displays.
- **TAKE:** sends Preview to Program.
- **Persistent audio:** audio that continues across scene changes.
- **Scene audio:** audio used only while its scene is live.
- **Mono:** one audio channel, shown as M.
- **Stereo:** separate left and right channels, shown as L R.
- **Clipping:** signal overload that can create audible distortion.
- **Crop/trim edges:** hide part of the source picture without changing the original file.
- **Lower third:** text and graphics placed over the lower or upper part of video.
- **Offline Scripture library:** Scripture JSON stored on the computer for use without an internet connection.
- **RTMP/RTMPS:** common protocols used to send a live stream to a platform.
