# Background library and shutdown fix · v0.6.37

For the current numbered-screen editor, **Apply & show**, and searchable uploaded-file library, see [the v0.6.40 background guide](background-assignment-0.6.40.md). The workflow below describes the original v0.6.37 editor.

Open **Controls → Backgrounds** or **Tools → Background Library & Display Backgrounds**.
Use **Upload images** or **Upload videos** to add one or several files to the shared
local library. OpenChurch copies files into its application data directory, so moving
or deleting an original upload does not break the saved background.

Choose **Display / output**, select a library item, review its preview, then choose
**Apply background**. Selecting files or changing the draft does not apply it live.
Choose **None · no image or video** and Apply for a plain base color without media.
Choose a base color, Fill/crop or Fit, and media opacity. Videos loop silently.

- **Program / Preview:** a background behind scene sources, included in mirrored
  outputs, recordings, streaming and Virtual Camera. Opaque full-screen sources
  cover it. Applying is an explicit live change.
- **Shared sanctuary background:** the default for all sanctuary screens without
  their own assignment. Uses the independent text layout and follows live Program
  text with sanctuary styling. It replaces the mirrored Program picture there.
- **A named connected display:** its own image, video or None. Other screens keep
  their choices. Use **Use shared sanctuary layout** to remove its override.
- **Lower-third band:** media inside the lower-third band on Program and the
  dedicated lower-third output. The remaining dedicated output stays transparent.
  The band still obeys slide visibility, Show over Program, Hide Lower Third, exit
  animation and Cut to Black. Select the receiving audio separately; background
  video never enters the audio mix.

Assigning a background does not open an output. Use **Choose display outputs…** or
**Sanctuary Displays** to select and open screens. A connected screen configured as
the active lower-third output directs the editor to its lower-third band choice.
Disconnected screen overrides remain saved for reconnection. Display identities
come from the operating system; replacing a monitor can require reassignment.

The existing sanctuary text controls and lower-third branding/typography remain
available. Media upload and assignment live in Backgrounds. Background assignments
take precedence over the default sanctuary Mirror Program/Independent Layout mode;
restore the existing/shared layout in Backgrounds to use that default again.
Saved profiles retain their assignments; copied library files remain local to this PC.

If a video cannot play, choose another file or convert it to MP4 (H.264) or WebM.
The editor reports preview failures and unavailable library files. A failed output
media load falls back to the base color.

## Shutdown correction and verification

The reported main-process popup came from audio-plugin cleanup broadcasting status
after the studio's renderer had been destroyed, while the BrowserWindow could still
appear alive. All main-process renderer sends now check the actual WebContents,
handle destruction during a send, and preserve unrelated errors. Audio-plugin and
camera cleanup also covers renderer crashes/reloads and replacement studio windows.

`npm run verify:backgrounds` runs an Electron acceptance test against the built app
with its normal file security policy. It uploads media through the actual native
bridge, moves an original, checks independent monitor routing, exercises a muted
video band after its entrance animation, clears it with None, restores shared
layouts, checks saved settings and a narrow dock, and repeatedly closes real
renderers/windows without uncaught exceptions. Windows release CI runs this before
packaging. Shared normalization and destruction races have unit coverage.
