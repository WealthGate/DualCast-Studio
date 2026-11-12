// Original, deterministic test effect. Not a production/user plug-in.
#include <algorithm>
#include <cstring>
#include <cstdlib>
#include <limits>
#include <cstdio>
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include "vst2-abi.h"
using namespace ocvst;
namespace {
Effect effect{};
float gain = .5f;
bool generator = false;
void diagnostic() {
  if (!std::getenv("OPENCHURCH_TEST_PLUGIN_DIAGNOSTICS")) return;
  printf("Plugin CRT diagnostic\n"); fflush(stdout);
  const char text[] = "Plugin Win32 diagnostic";
  DWORD written;
  WriteFile(GetStdHandle(STD_OUTPUT_HANDLE), text, sizeof(text) - 1, &written, nullptr);
}
intptr_t dispatch(Effect*, int32_t op, int32_t, intptr_t value, void* data, float) {
  switch (op) {
    case Open:
      if (std::getenv("OPENCHURCH_TEST_PLUGIN_LATE_INTERFACE")) {
        effect.replace = effect.process; effect.flags |= Replacing;
        effect.inputs = effect.outputs = 2;
      }
      return 1;
    case GetName: strcpy_s((char*)data, 64, "OpenChurch host test"); return 1;
    case GetVendor: strcpy_s((char*)data, 64, "OpenChurch"); return 1;
    case GetChunk: *(void**)data = &gain; return 4;
    case SetChunk:
      if (std::getenv("OPENCHURCH_TEST_PLUGIN_CRASH_RESTORE")) { *reinterpret_cast<volatile int*>(0) = 1; }
      if (value == 4) memcpy(&gain, data, 4); return 1;
    case MainsChanged:
      if (value && std::getenv("OPENCHURCH_TEST_PLUGIN_LATENCY_ON_ACTIVATE")) effect.latency = std::atoi(std::getenv("OPENCHURCH_TEST_PLUGIN_LATENCY_ON_ACTIVATE"));
      return 1;
    default: return 0;
  }
}
void set(Effect*, int32_t index, float value) { if (index == 0) gain = value; else generator = value > .5f; }
float get(Effect*, int32_t index) { return index == 0 ? gain : (generator ? 1.0f : 0.0f); }
void process(Effect*, float** in, float** out, int32_t frames) {
  diagnostic();
  if (std::getenv("OPENCHURCH_TEST_PLUGIN_LATENCY_CHANGE")) effect.latency = 256;
  for (int c = 0; c < 2; ++c) for (int f = 0; f < frames; ++f) {
    const float sample = gain == 99 ? std::numeric_limits<float>::quiet_NaN() : ((generator || gain < 0) ? .125f : in[c][f] * gain);
    if (std::getenv("OPENCHURCH_TEST_PLUGIN_LEGACY")) out[c][f] += sample;
    else out[c][f] = sample;
  }
}
}
extern "C" __declspec(dllexport) Effect* VSTPluginMain(HostCallback host) {
  diagnostic();
  if (std::getenv("OPENCHURCH_TEST_PLUGIN_INIT_FAILURE")) return nullptr;
  if (std::getenv("OPENCHURCH_TEST_PLUGIN_CRASH")) { *reinterpret_cast<volatile int*>(0) = 1; }
  if (host(nullptr, Version, 0, 0, nullptr, 0) != 2400) return nullptr;
  effect.magic = Magic; effect.dispatch = dispatch; effect.replace = process;
  effect.process = process;
  effect.setParameter = set; effect.getParameter = get;
  effect.inputs = effect.outputs = 2; effect.parameters = 2;
  effect.flags = Replacing | ProgramChunks; effect.id = 0x4f435446;
  if (std::getenv("OPENCHURCH_TEST_PLUGIN_INSTRUMENT")) effect.flags |= IsSynth;
  if (std::getenv("OPENCHURCH_TEST_PLUGIN_LEGACY") || std::getenv("OPENCHURCH_TEST_PLUGIN_LATE_INTERFACE")) {
    effect.replace = nullptr; effect.flags &= ~Replacing;
  }
  if (std::getenv("OPENCHURCH_TEST_PLUGIN_LATE_INTERFACE")) effect.inputs = effect.outputs = 0;
  return &effect;
}
