# OpenChurch Virtual Camera

Windows x64/x86 DirectShow camera, based on the MIT-licensed Softcam library at
commit `4d4e9d86467deee54208f0b58da9c1af8f75b1ee`.
Build offline with `npm run prepare:virtual-camera` using Visual Studio C++ tools.
Both architectures use the static C++ runtime. No compiler is needed by users.

OpenChurch modifications: distinct camera name, CLSID and shared-memory names;
fixed 1280×720 at 30 fps even before the sender starts; black output while stopped;
bounded frame waits; exact 100 ns timestamps; strict media-type validation; an
RGBA-to-BGR sender with per-frame acknowledgements; and current-user registration.
The upstream source and Microsoft DirectShow base classes are included in vendor/.
See THIRD_PARTY_NOTICES.txt and vendor/LICENSE.softcam.

Install copies live under the current user's LocalAppData, in a content-addressed
directory so an update never overwrites a DLL held open by another app. Registration
is explicitly initiated with Install Camera, works without administrator rights,
and can be removed with Remove Camera. It does not replace OBS or another camera.
The camera is for apps supporting DirectShow, including compatible browser and
meeting-app versions. Native Media Foundation-only camera clients are not supported.
Audio is selected separately in the receiving app. macOS/Linux native outputs are
not implemented in this release.
