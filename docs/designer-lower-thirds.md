# Designer lower thirds and verse selection in v0.6.39

## Choose a presentation style

**Lower Third Studio** now offers **Classic lower third** and **Designer · Title + Content**. Existing installations keep Classic selected until the operator chooses Designer. Classic font, text color, background and image settings remain available. Both modes share the slide queue, standard logo, band height/position and animation settings. Designer's title/body typography and panels are saved separately from Classic typography.

The six original presets are Prism (cyan angled broadcast panels), Aurora (violet rounded panels), Editorial (ivory/serif/gold), Glassline (smoked mint cut corners), Momentum (coral geometric ribbon), and Sanctuary (centered midnight/gold lyrics). Clicking a preset restores its palette and shape and selects layered-reveal entrance/exit. Customize it afterward; the current design saves on this computer and in studio profiles. Switching to Classic retains the current Designer design. Choosing another preset replaces the current Designer styling.

**Title styling** and **Content styling** each provide text color, panel color/opacity, font, size, bold/italic/underline, alignment and letter spacing. Shape/layout controls include rounded, angled, cut-corner, capsule and rectangular panels; width, horizontal placement, top/bottom position, edge inset, title/band height, accent, gradient, border and shadow. Text fits within each panel and scales from a 1920-pixel reference. Split long songs/passages into slides for legibility.

The shared **Standard Lower-Third Logo** is reused without importing it again. Designer can frame it on the left or right in a circle, rounded square or square, preserving the image aspect ratio. If the standard logo is absent, the Bible image can serve as a fallback. Hidden-text, theme-only and logo-only modes remain available. Shared lower-third background media is clipped to the Designer body panel; it does not fill the transparent area outside the graphic.

## Prepare and update title/content

1. Enter **Title** and **Content / description**, then choose **Cue in Preview** or **Show card live**. Previewing an edit of a live card makes a separate queued copy and leaves Program intact.
2. To edit a queued song or Scripture slide, select it and choose **Load selected slide**. Song deck titles and Scripture references become the header unless an explicit title was saved. An empty explicit title hides the header.
3. **Update live** changes the loaded live card. Its ID remains unchanged, so text edits do not replay the entrance. Updates reach Program, its recordings/streams, mirrored displays and the transparent lower-third output.
4. **Update live while typing** is opt-in and available only for the loaded live card. Edits publish after a short 180 ms debounce. Turning it off leaves subsequent edits private until another explicit live action. Style changes apply immediately to visible graphics.
5. **New card** starts a new draft. The existing queue, lyric splitting, song library, Scripture slides, Clear Preview, Clear Program Text and service schedules continue to work. Titles survive editing/splitting and saved service snapshots.

Layered reveal animates the title, logo and content in separate stages. Soft spring adds a subtle eased entrance, and downward slide joins fade, horizontal/upward slides, zoom, wipe and None. Entrance and exit can be chosen separately, with 100–3000 ms duration. None cuts. Cleared/hidden cards retain their outgoing graphic until the selected exit completes. Static designs do not run perpetual animation loops.

## Select Scripture verses or jump immediately

Choose Book, Chapter, **Verse** and optional **Through verse**. **Show Live (Enter)** presents that verse/range. Changing selectors alone does not alter Program. Next advances beyond the end of the selected range; Previous moves before its start.

**Jump to verse** is a separate shortcut: type a number and press Enter in that field or choose **Jump live**. It presents one verse and synchronizes both selectors to it. Source requests remain serialized and controls show loading state. Offline lists use the exact available verse numbers, so navigation skips gaps. Online lists use standard KJV chapter numbering; the configured provider still validates/returns the text. Use **Type a reference instead** for another versification. Scripture text and references continue to strip source markup and angle delimiters.

Only numeric chapter verse counts are bundled, derived from [the published KJV data at revision df0860f](https://github.com/thiagobodruk/bible/blob/df0860fe0921b5b899d1b554041900ab072cd4c4/json/en_kjv.json). No Bible translation text was added to the app.

## Design approach and verification

These are original Canvas 2D graphics. The editable title/content approach draws on [Adobe's customizable motion graphics workflow](https://experienceleague.adobe.com/en/docs/creative-cloud-enterprise-learn/cce-learning-hub/videooverview/videotutorials/motion-graphics-templates) and [Fusion's reusable title templates and exposed controls](https://www.blackmagicdesign.com/uk/products/davinciresolve/fusion). No Adobe/Fusion runtime or template files are required.

`npm test` covers design normalization, independent typography, title inheritance, Unicode/long-word wrapping, same-ID live cue updates, all 1189 standard chapter counts and sparse offline navigation, alongside existing Scripture sanitization and output checks.

`npm run verify:lower-thirds` runs real Electron/React controls and canvas pixels. It checks all six rendered presets, independent title/body colors, shared logo, live typing, private Preview copies, transparent lower-third output and animated clearing, Classic preservation, song titles, range selection, keyboard jumping, sparse offline navigation, responsive 320 px controls and real settings persistence. Release CI runs this acceptance check on Windows before packaging.
