// Deterministic VST3 effect for the native host and scanner checks.
#define NOMINMAX
#include <windows.h>
#include <algorithm>
#include "pluginterfaces/base/ibstream.h"
#include "pluginterfaces/vst/ivstaudioprocessor.h"

using namespace Steinberg;
using namespace Steinberg::Vst;
namespace {
DECLARE_UID(EffectId, 0x68B7A8EA, 0xC26E4E62, 0xB1E63BC6, 0x504C0142)
bool is(const char* a, const char* b) { return std::memcmp(a, b, sizeof(TUID)) == 0; }

class Fixture final : public IComponent, public IAudioProcessor {
  uint32 refs = 1;
  bool active = false, processing = false;
  float gain = .5f;
public:
  tresult PLUGIN_API queryInterface(const TUID id, void** result) override {
    *result = nullptr;
    if (is(id, INLINE_UID_OF(FUnknown)) || is(id, INLINE_UID_OF(IComponent))) *result = static_cast<IComponent*>(this);
    else if (is(id, INLINE_UID_OF(IAudioProcessor))) *result = static_cast<IAudioProcessor*>(this);
    if (!*result) return kNoInterface;
    addRef(); return kResultOk;
  }
  uint32 PLUGIN_API addRef() override { return ++refs; }
  uint32 PLUGIN_API release() override { if (--refs) return refs; delete this; return 0; }
  tresult PLUGIN_API initialize(FUnknown* host) override { return host ? kResultOk : kInvalidArgument; }
  tresult PLUGIN_API terminate() override { return kResultOk; }
  tresult PLUGIN_API getControllerClassId(TUID) override { return kNotImplemented; }
  tresult PLUGIN_API setIoMode(IoMode) override { return kResultOk; }
  int32 PLUGIN_API getBusCount(MediaType type, BusDirection) override { return type == kAudio ? 1 : 0; }
  tresult PLUGIN_API getBusInfo(MediaType type, BusDirection direction, int32 index, BusInfo& info) override {
    if (type != kAudio || index != 0) return kInvalidArgument;
    info.mediaType = type; info.direction = direction; info.channelCount = 2;
    info.busType = kMain; info.flags = BusInfo::kDefaultActive;
    return kResultOk;
  }
  tresult PLUGIN_API getRoutingInfo(RoutingInfo&, RoutingInfo&) override { return kNotImplemented; }
  tresult PLUGIN_API activateBus(MediaType, BusDirection, int32, TBool) override { return kResultOk; }
  tresult PLUGIN_API setActive(TBool value) override { active = value != 0; return kResultOk; }
  tresult PLUGIN_API getState(IBStream* stream) override { return stream->write(&gain, sizeof(gain)); }
  tresult PLUGIN_API setState(IBStream* stream) override { return stream->read(&gain, sizeof(gain)); }
  tresult PLUGIN_API setBusArrangements(SpeakerArrangement*, int32, SpeakerArrangement*, int32) override { return kNotImplemented; }
  tresult PLUGIN_API getBusArrangement(BusDirection, int32, SpeakerArrangement& speakers) override { speakers = SpeakerArr::kStereo; return kResultOk; }
  tresult PLUGIN_API canProcessSampleSize(int32 size) override { return size == kSample32 ? kResultTrue : kResultFalse; }
  uint32 PLUGIN_API getLatencySamples() override { return 0; }
  tresult PLUGIN_API setupProcessing(ProcessSetup& setup) override { return setup.sampleRate == 48000 && setup.symbolicSampleSize == kSample32 ? kResultOk : kInvalidArgument; }
  tresult PLUGIN_API setProcessing(TBool value) override { processing = value != 0; return kResultOk; }
  tresult PLUGIN_API process(ProcessData& data) override {
    if (!active || !processing || data.numInputs != 1 || data.numOutputs != 1 || !data.processContext) return kInvalidArgument;
    for (int channel = 0; channel < 2; ++channel) {
      const float* in = data.inputs[0].channelBuffers32[channel];
      float* out = data.outputs[0].channelBuffers32[channel];
      for (int i = 0; i < data.numSamples; ++i) out[i] = gain < 0 ? .125f : in[i] * gain;
    }
    return kResultOk;
  }
  uint32 PLUGIN_API getTailSamples() override { return kNoTail; }
};

class Factory final : public IPluginFactory {
public:
  tresult PLUGIN_API queryInterface(const TUID id, void** result) override {
    *result = is(id, INLINE_UID_OF(FUnknown)) || is(id, INLINE_UID_OF(IPluginFactory)) ? this : nullptr;
    return *result ? kResultOk : kNoInterface;
  }
  uint32 PLUGIN_API addRef() override { return 1; }
  uint32 PLUGIN_API release() override { return 1; }
  tresult PLUGIN_API getFactoryInfo(PFactoryInfo* info) override { *info = PFactoryInfo("OpenChurch", "", "", 0); return kResultOk; }
  int32 PLUGIN_API countClasses() override { return 1; }
  tresult PLUGIN_API getClassInfo(int32 index, PClassInfo* info) override {
    if (index != 0) return kInvalidArgument;
    *info = PClassInfo(EffectId, PClassInfo::kManyInstances, kVstAudioEffectClass, "OpenChurch VST3 test");
    return kResultOk;
  }
  tresult PLUGIN_API createInstance(FIDString cid, FIDString id, void** result) override {
    *result = nullptr;
    if (!is(cid, EffectId)) return kNoInterface;
    auto* effect = new Fixture();
    auto status = effect->queryInterface(id, result);
    effect->release();
    return status;
  }
};
}

extern "C" __declspec(dllexport) bool InitDll() { return true; }
extern "C" __declspec(dllexport) bool ExitDll() { return true; }
extern "C" __declspec(dllexport) IPluginFactory* PLUGIN_API GetPluginFactory() { static Factory factory; return &factory; }
