// Windows x64 effect host. Plug-ins execute in this process, never Electron.
// stdin/stdout carry bounded, framed float32 stereo audio; stderr carries JSON.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <objbase.h>
#include <fcntl.h>
#include <io.h>
#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <mutex>
#include <string>
#include <thread>
#include <vector>
#include <xmmintrin.h>
#include "vst2-abi.h"

using namespace ocvst;
namespace {
constexpr uint32_t MaxFrames = 8192, MaxState = 64 * 1024 * 1024;
constexpr int MaxLatency = 8192;
constexpr UINT ShowEditorMessage = WM_APP + 1, SaveStateMessage = WM_APP + 2;
Effect* plugin = nullptr;
HMODULE module = nullptr;
HWND window = nullptr;
HANDLE doneEvent = nullptr;
std::recursive_mutex pluginMutex;
std::mutex eventMutex;
std::atomic<bool> running{true}, bypass{false};
std::atomic<uint64_t> samplePosition{0};
int sampleRate = 48000, blockSize = 512;
bool editorOpen = false, initialized = false;
std::wstring statePath;
TimeInfo timeInfo{};
std::string utf8(const std::wstring& s) {
  if (s.empty()) return {};
  const int n = WideCharToMultiByte(CP_UTF8, 0, s.data(), (int)s.size(), nullptr, 0, nullptr, nullptr);
  std::string out(n, '\0');
  WideCharToMultiByte(CP_UTF8, 0, s.data(), (int)s.size(), out.data(), n, nullptr, nullptr);
  return out;
}
std::string escaped(const std::string& s) {
  std::string out;
  for (unsigned char c : s) {
    if (c == '"' || c == '\\') { out += '\\'; out += c; }
    else if (c >= 32) out += c;
  }
  return out;
}
void event(const std::string& value) {
  std::lock_guard<std::mutex> guard(eventMutex);
  fprintf(stderr, "%s\n", value.c_str()); fflush(stderr);
}
void fail(const std::string& reason) { event("{\"event\":\"error\",\"message\":\"" + escaped(reason) + "\"}"); }
intptr_t dispatch(int32_t op, int32_t index = 0, intptr_t value = 0, void* ptr = nullptr, float opt = 0) {
  return plugin->dispatch(plugin, op, index, value, ptr, opt);
}
void resizeEditor(int width, int height) {
  if (!window || width <= 0 || height <= 0 || width > 16384 || height > 16384) return;
  RECT rect{0, 0, width, height};
  AdjustWindowRectEx(&rect, WS_OVERLAPPEDWINDOW & ~WS_MAXIMIZEBOX, FALSE, 0);
  SetWindowPos(window, nullptr, 0, 0, rect.right - rect.left, rect.bottom - rect.top,
               SWP_NOMOVE | SWP_NOACTIVATE | SWP_NOZORDER);
}
intptr_t callback(Effect*, int32_t op, int32_t index, intptr_t value, void* ptr, float) {
  switch (op) {
    case Version: return 2400;
    case GetSampleRate: return sampleRate;
    case GetBlockSize: return blockSize;
    case GetInputLatency: case GetOutputLatency: return blockSize;
    case GetProcessLevel: return 2;
    case GetAutomationState: return 1;
    case GetLanguage: return 1;
    case GetVendorVersion: return 1;
    case GetVendorString: if (ptr) strcpy_s((char*)ptr, 64, "OpenChurch"); return 1;
    case GetProductString: if (ptr) strcpy_s((char*)ptr, 64, "Broadcast Studio Audio Host"); return 1;
    case GetTime:
      timeInfo.samplePosition = (double)samplePosition.load();
      timeInfo.sampleRate = sampleRate;
      timeInfo.beatPosition = timeInfo.samplePosition * 2 / sampleRate;
      timeInfo.tempo = 120; timeInfo.numerator = 4; timeInfo.denominator = 4;
      timeInfo.flags = 2 | 512 | 1024 | 8192;
      return (intptr_t)&timeInfo;
    case SizeWindow:
      if (window) PostMessageW(window, WM_APP + 3, (WPARAM)index, (LPARAM)value);
      return 1;
    case IoChanged: return 0; // Bus changes require reloading the effect, never reallocating in audio.
    case CanDo:
      if (!ptr) return 0;
      return (!strcmp((char*)ptr, "sizeWindow") || !strcmp((char*)ptr, "sendVstTimeInfo")) ? 1 : 0;
    case Automate: case BeginEdit: case EndEdit: case UpdateDisplay: return 1;
    default: return 0;
  }
}
std::vector<char> readState() {
  if (statePath.empty()) return {};
  std::ifstream input(std::filesystem::path(statePath), std::ios::binary | std::ios::ate);
  if (!input) return {};
  const auto n = input.tellg();
  if (n < 16 || n > MaxState) return {};
  std::vector<char> bytes((size_t)n);
  input.seekg(0); input.read(bytes.data(), n);
  return input ? bytes : std::vector<char>{};
}
void restoreState() {
  auto bytes = readState();
  if (bytes.size() < 16) return;
  uint32_t header[4]; memcpy(header, bytes.data(), 16);
  if (header[0] != 0x3156434f || header[1] != (uint32_t)plugin->id || header[3] != bytes.size() - 16) {
    event("{\"event\":\"warning\",\"message\":\"Saved plug-in settings did not match this effect.\"}"); return;
  }
  if (header[2] == 1 && (plugin->flags & ProgramChunks))
    dispatch(SetChunk, 1, header[3], bytes.data() + 16);
  else if (header[2] == 2 && plugin->setParameter && header[3] == (uint32_t)plugin->parameters * 4) {
    for (int p = 0; p < plugin->parameters; ++p) {
      float value; memcpy(&value, bytes.data() + 16 + p * 4, 4);
      if (std::isfinite(value)) plugin->setParameter(plugin, p, std::clamp(value, 0.0f, 1.0f));
    }
  }
}
void saveState() {
  if (statePath.empty() || !plugin || !initialized) return;
  std::lock_guard<std::recursive_mutex> guard(pluginMutex);
  std::vector<char> bytes;
  uint32_t kind = 0;
  if (plugin->flags & ProgramChunks) {
    void* data = nullptr;
    auto size = dispatch(GetChunk, 1, 0, &data);
    if (data && size > 0 && size < MaxState - 16) {
      bytes.assign((char*)data, (char*)data + size); kind = 1;
    }
  }
  if (!kind && plugin->getParameter && plugin->parameters >= 0 && plugin->parameters <= 65536) {
    bytes.resize(plugin->parameters * 4); kind = 2;
    for (int p = 0; p < plugin->parameters; ++p) {
      const float value = plugin->getParameter(plugin, p); memcpy(bytes.data() + p * 4, &value, 4);
    }
  }
  if (!kind) return;
  uint32_t header[4] = {0x3156434f, (uint32_t)plugin->id, kind, (uint32_t)bytes.size()};
  const std::wstring temporary = statePath + L".tmp";
  std::ofstream output(std::filesystem::path(temporary), std::ios::binary | std::ios::trunc);
  output.write((char*)header, 16); output.write(bytes.data(), bytes.size()); output.close();
  if (!output || !MoveFileExW(temporary.c_str(), statePath.c_str(), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH))
    fail("Could not save plug-in settings.");
  else event("{\"event\":\"saved\"}");
}
void closeEditor() {
  if (!editorOpen) return;
  std::lock_guard<std::recursive_mutex> guard(pluginMutex);
  dispatch(EditorClose); editorOpen = false;
  ShowWindow(window, SW_HIDE); saveState();
  event("{\"event\":\"editor\",\"open\":false}");
}
void showEditor() {
  if (!plugin || !(plugin->flags & HasEditor)) { fail("This plug-in has no native editor."); return; }
  std::lock_guard<std::recursive_mutex> guard(pluginMutex);
  if (!editorOpen) {
    dispatch(EditorOpen, 0, 0, window); editorOpen = true;
    EditorRect* rect = nullptr;
    dispatch(EditorGetRect, 0, 0, &rect);
    if (rect) resizeEditor(rect->right - rect->left, rect->bottom - rect->top);
  }
  ShowWindow(window, SW_SHOWNORMAL); SetForegroundWindow(window);
  event("{\"event\":\"editor\",\"open\":true}");
}
LRESULT CALLBACK windowProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
  switch (msg) {
    case WM_CLOSE: closeEditor(); return 0;
    case ShowEditorMessage: showEditor(); return 0;
    case SaveStateMessage: saveState(); return 0;
    case WM_APP + 3: resizeEditor((int)wp, (int)lp); return 0;
  }
  return DefWindowProcW(hwnd, msg, wp, lp);
}
bool readExact(void* target, size_t size) {
  auto dest = (char*)target;
  while (size) {
    const int count = _read(_fileno(stdin), dest, (unsigned int)size);
    if (count <= 0) return false;
    size -= count; dest += count;
  }
  return true;
}
bool writeExact(const void* source, size_t size) {
  auto src = (const char*)source;
  while (size) {
    const int count = _write(_fileno(stdout), src, (unsigned int)size);
    if (count <= 0) return false;
    size -= count; src += count;
  }
  return true;
}
void audioLoop() {
  // Denormal tails from reverbs/EQs must not consume an entire CPU core.
  _mm_setcsr(_mm_getcsr() | 0x8040);
  SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_ABOVE_NORMAL);
  std::vector<float> stereo(MaxFrames * 2), result(MaxFrames * 2);
  const int pluginInputs = plugin->inputs, pluginOutputs = plugin->outputs;
  const int pluginLatency = std::max(plugin->latency, 0);
  const int channelCount = std::max({2, pluginInputs, pluginOutputs});
  std::vector<std::vector<float>> in(channelCount, std::vector<float>(blockSize));
  std::vector<std::vector<float>> out(channelCount, std::vector<float>(blockSize));
  std::vector<float*> inputPointers(channelCount), outputPointers(channelCount);
  for (int c = 0; c < channelCount; ++c) { inputPointers[c] = in[c].data(); outputPointers[c] = out[c].data(); }
  while (running.load()) {
    Packet packet{};
    if (!readExact(&packet, sizeof(packet))) break;
    if (packet.magic != PacketMagic || packet.bytes > MaxFrames * 8) { fail("Invalid audio packet."); break; }
    if (packet.type == 1) {
      if (!packet.bytes || packet.bytes % 8 || !readExact(stereo.data(), packet.bytes)) break;
      const uint32_t frames = packet.bytes / 8;
      if (bypass.load()) {
        std::copy_n(stereo.data(), frames * 2, result.data());
        samplePosition.fetch_add(frames);
      }
      else for (uint32_t offset = 0; offset < frames; offset += blockSize) {
        const int count = std::min((uint32_t)blockSize, frames - offset);
        for (int c = 0; c < channelCount; ++c) {
          std::fill(in[c].begin(), in[c].end(), 0.0f); std::fill(out[c].begin(), out[c].end(), 0.0f);
          if (c < 2 && c < pluginInputs) for (int f = 0; f < count; ++f)
            in[c][f] = pluginInputs == 1 ? (stereo[(offset + f) * 2] + stereo[(offset + f) * 2 + 1]) * .5f : stereo[(offset + f) * 2 + c];
        }
        {
          std::lock_guard<std::recursive_mutex> guard(pluginMutex);
          if (plugin->inputs != pluginInputs || plugin->outputs != pluginOutputs) {
            fail("The plug-in changed its audio channel layout. Reload it to use the new layout.");
            running.store(false); SetEvent(doneEvent); return;
          }
          if (std::max(plugin->latency, 0) != pluginLatency) {
            fail("The plug-in changed its processing latency. Settings were saved; reload the plug-in to align its new delay.");
            running.store(false); SetEvent(doneEvent); return;
          }
          plugin->replace(plugin, inputPointers.data(), outputPointers.data(), count);
          if (std::max(plugin->latency, 0) != pluginLatency) {
            fail("The plug-in changed its processing latency. Settings were saved; reload the plug-in to align its new delay.");
            running.store(false); SetEvent(doneEvent); return;
          }
        }
        for (int f = 0; f < count; ++f) for (int c = 0; c < 2; ++c) {
          const float sample = out[pluginOutputs == 1 ? 0 : c][f];
          result[(offset + f) * 2 + c] = std::isfinite(sample) ? sample : 0;
        }
        samplePosition.fetch_add(count);
      }
      if (!writeExact(&packet, sizeof(packet)) || !writeExact(result.data(), packet.bytes)) break;
    } else {
      if (packet.bytes != 0) { fail("Control packets must have no payload."); break; }
      if (packet.type == 2) PostMessageW(window, ShowEditorMessage, 0, 0);
      else if (packet.type == 3) PostMessageW(window, SaveStateMessage, 0, 0);
      else if (packet.type == 4) break;
      else if (packet.type == 5) bypass.store(packet.id != 0);
      else { fail("Unknown audio host command."); break; }
    }
  }
  running.store(false); SetEvent(doneEvent);
}
}

int wmain(int argc, wchar_t** argv) {
  std::wstring pluginPath;
  bool probe = false, openEditor = false;
  for (int i = 1; i < argc; ++i) {
    const std::wstring arg = argv[i];
    if (arg == L"--plugin" && i + 1 < argc) pluginPath = argv[++i];
    else if (arg == L"--state" && i + 1 < argc) statePath = argv[++i];
    else if (arg == L"--sample-rate" && i + 1 < argc) sampleRate = _wtoi(argv[++i]);
    else if (arg == L"--block-size" && i + 1 < argc) blockSize = _wtoi(argv[++i]);
    else if (arg == L"--probe") probe = true;
    else if (arg == L"--editor") openEditor = true;
    else { fail("Unknown or incomplete audio host argument."); return 2; }
  }
  if (!std::filesystem::path(pluginPath).is_absolute() || sampleRate < 8000 || sampleRate > 192000 || blockSize < 64 || blockSize > 8192) {
    fail("An absolute plug-in path and supported audio format are required."); return 2;
  }
  SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX);
  SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_SYSTEM_AWARE);
  CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
  module = LoadLibraryExW(pluginPath.c_str(), nullptr, LOAD_WITH_ALTERED_SEARCH_PATH);
  if (!module) { fail("Could not load this 64-bit Windows VST2 DLL or a required dependency (Windows error " + std::to_string(GetLastError()) + ")."); return 3; }
  auto entry = (Effect* (*)(HostCallback))GetProcAddress(module, "VSTPluginMain");
  if (!entry) entry = (Effect* (*)(HostCallback))GetProcAddress(module, "main");
  if (!entry) { fail("This file is not a VST2 effect; select its 64-bit VST2 .dll version."); FreeLibrary(module); return 3; }
  plugin = entry(callback);
  if (!plugin || plugin->magic != Magic || !plugin->dispatch || !plugin->replace || !(plugin->flags & Replacing)
      || plugin->inputs < 0 || plugin->inputs > 64 || plugin->outputs < 1 || plugin->outputs > 64
      || plugin->parameters < 0 || plugin->parameters > 65536) {
    fail("The plug-in does not provide a supported float32 audio effect interface."); FreeLibrary(module); return 3;
  }
  dispatch(Open); initialized = true;
  dispatch(SetSampleRate, 0, 0, nullptr, (float)sampleRate);
  dispatch(SetBlockSize, 0, blockSize);
  if (!probe) restoreState();
  char name[256]{}, vendor[256]{};
  dispatch(GetName, 0, 0, name); dispatch(GetVendor, 0, 0, vendor);
  name[255] = vendor[255] = 0;
  const auto emitReady = [&]() { event("{\"event\":\"ready\",\"protocol\":1,\"format\":\"vst2\",\"name\":\"" + escaped(name) + "\",\"vendor\":\"" + escaped(vendor)
       + "\",\"inputs\":" + std::to_string(plugin->inputs) + ",\"outputs\":" + std::to_string(plugin->outputs)
       + ",\"parameters\":" + std::to_string(plugin->parameters) + ",\"hasEditor\":" + ((plugin->flags & HasEditor) ? "true" : "false")
       + ",\"latencyFrames\":" + std::to_string(std::max(plugin->latency, 0)) + "}"); };
  if (probe) { emitReady(); dispatch(Close); FreeLibrary(module); CoUninitialize(); return 0; }
  WNDCLASSW wc{}; wc.hInstance = GetModuleHandleW(nullptr); wc.lpszClassName = L"OpenChurchAudioPluginEditor"; wc.lpfnWndProc = windowProc;
  wc.hCursor = LoadCursorW(nullptr, IDC_ARROW); RegisterClassW(&wc);
  std::wstring title = std::filesystem::path(pluginPath).stem().wstring() + L" — OpenChurch Audio";
  window = CreateWindowExW(0, wc.lpszClassName, title.c_str(), WS_OVERLAPPEDWINDOW & ~WS_MAXIMIZEBOX,
                          CW_USEDEFAULT, CW_USEDEFAULT, 700, 500, nullptr, nullptr, wc.hInstance, nullptr);
  if (!window) { fail("Could not create the plug-in editor window."); dispatch(Close); FreeLibrary(module); return 4; }
  doneEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);
  dispatch(MainsChanged, 0, 1); dispatch(StartProcess);
  if (std::max(plugin->latency, 0) > MaxLatency || plugin->inputs < 0 || plugin->inputs > 64 || plugin->outputs < 1 || plugin->outputs > 64) {
    fail("The plug-in requires an unsupported channel layout or more than 8192 frames of delay. Reduce its lookahead/latency and reload it.");
    dispatch(StopProcess); dispatch(MainsChanged, 0, 0); dispatch(Close);
    DestroyWindow(window); CloseHandle(doneEvent); FreeLibrary(module); CoUninitialize(); return 3;
  }
  emitReady();
  _setmode(_fileno(stdin), _O_BINARY); _setmode(_fileno(stdout), _O_BINARY);
  if (openEditor) showEditor();
  std::thread audio(audioLoop);
  while (running.load()) {
    MsgWaitForMultipleObjects(1, &doneEvent, FALSE, 50, QS_ALLINPUT);
    MSG msg{};
    while (PeekMessageW(&msg, nullptr, 0, 0, PM_REMOVE)) { TranslateMessage(&msg); DispatchMessageW(&msg); }
    if (editorOpen) {
      std::lock_guard<std::recursive_mutex> guard(pluginMutex); dispatch(EditorIdle);
    }
  }
  audio.join();
  closeEditor(); saveState();
  dispatch(StopProcess); dispatch(MainsChanged, 0, 0); dispatch(Close); plugin = nullptr;
  DestroyWindow(window); CloseHandle(doneEvent); FreeLibrary(module); CoUninitialize();
  return 0;
}
