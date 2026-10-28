// Original, deterministic test effect. Not a production/user plug-in.
#include <algorithm>
#include <cstring>
#include <cstdlib>
#include <limits>
#include "vst2-abi.h"
using namespace ocvst;
namespace {
Effect effect{};
float gain = .5f;
bool generator = false;
intptr_t dispatch(Effect*, int32_t op, int32_t, intptr_t value, void* data, float) {
  switch (op) {
    case GetName: strcpy_s((char*)data, 64, "OpenChurch host test"); return 1;
    case GetVendor: strcpy_s((char*)data, 64, "OpenChurch"); return 1;
    case GetChunk: *(void**)data = &gain; return 4;
    case SetChunk: if (value == 4) memcpy(&gain, data, 4); return 1;
    case MainsChanged:
      if (value && std::getenv("OPENCHURCH_TEST_PLUGIN_LATENCY_ON_ACTIVATE")) effect.latency = std::atoi(std::getenv("OPENCHURCH_TEST_PLUGIN_LATENCY_ON_ACTIVATE"));
      return 1;
    default: return 0;
  }
}
void set(Effect*, int32_t index, float value) { if (index == 0) gain = value; else generator = value > .5f; }
float get(Effect*, int32_t index) { return index == 0 ? gain : (generator ? 1.0f : 0.0f); }
void process(Effect*, float** in, float** out, int32_t frames) {
  if (std::getenv("OPENCHURCH_TEST_PLUGIN_LATENCY_CHANGE")) effect.latency = 256;
  for (int c = 0; c < 2; ++c) for (int f = 0; f < frames; ++f)
    out[c][f] = gain == 99 ? std::numeric_limits<float>::quiet_NaN() : ((generator || gain < 0) ? .125f : in[c][f] * gain);
}
}
extern "C" __declspec(dllexport) Effect* VSTPluginMain(HostCallback host) {
  if (std::getenv("OPENCHURCH_TEST_PLUGIN_CRASH")) { *reinterpret_cast<volatile int*>(0) = 1; }
  if (host(nullptr, Version, 0, 0, nullptr, 0) != 2400) return nullptr;
  effect.magic = Magic; effect.dispatch = dispatch; effect.replace = process;
  effect.setParameter = set; effect.getParameter = get;
  effect.inputs = effect.outputs = 2; effect.parameters = 2;
  effect.flags = Replacing | ProgramChunks; effect.id = 0x4f435446;
  return &effect;
}
