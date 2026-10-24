# Virtual Camera · v0.6.35

In **Controls**, choose **Install Virtual Camera** once. This registers
**OpenChurch Virtual Camera** for your current Windows account, without an
administrator prompt. Then choose **Start Virtual Camera**. In your meeting,
browser or production app, select **OpenChurch Virtual Camera** as its camera.
If the app was already open during installation, reopen it to refresh its list.

The camera sends the live **Program** picture at **1280 × 720, 30 fps**.
TAKE, transitions, lower thirds, Scripture, scrolling text, Freeze and Cut to Black
are included. Preview edits stay private until taken live. Non-widescreen Program
pictures are fitted inside black bars without cropping or stretching.

The camera sends **video only**. Choose your microphone/audio input separately in
the receiving app. OpenChurch's virtual camera does not create a microphone.

Choose **Stop Virtual Camera** to stop sharing. Connected consumers receive black
after the sender disconnects. Close the receiving app's camera preview if it keeps
its last displayed frame. Stopping OpenChurch, closing/reloading the studio, or a
failed frame connection also stops the sender. The camera never starts automatically
on app launch. Use **Remove Virtual Camera** while stopped to unregister it.

This release supports **Windows x64**, with both 64-bit and 32-bit DirectShow
camera components. It works with clients that accept DirectShow virtual cameras;
applications restricted to Media Foundation or physical cameras may not list it.
Native macOS and Linux virtual cameras are not included. Their builds display the
platform requirement beside the disabled control.

The camera is independent of streaming, recording and sanctuary display outputs.
Its frame transport has one outstanding frame and no unbounded video queue.
Capture errors, missing components, installation errors and a stalled native sender
are reported beside the controls. Stop and restart to reconnect after an error.

Camera installation is local to each operator's Windows account. Updating
OpenChurch through the normal update button includes the native components;
existing camera users receive the updated component when they next start it.
An update uses a new content-addressed DLL directory so other apps can finish
using the previous version. Reopen receiving apps after updating.

## Build and verification

`npm run prepare:virtual-camera` compiles the vendored MIT-licensed
[Softcam](https://github.com/tshino/softcam) and Microsoft DirectShow base classes
with Visual Studio C++ tools and a static runtime. It downloads no code during
build. `npm run verify:virtual-camera` builds both architectures, checks actual
camera enumeration/capture through FFmpeg, verifies pixel orientation and colors,
and checks black output after Stop and recovery after restart. It temporarily
registers the camera for the test account and removes it afterward. Run on an
account without an existing OpenChurch camera registration. Release CI runs this
check on Windows before packaging; all platforms run the ordinary unit suite.
