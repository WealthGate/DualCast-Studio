#pragma once

#include <array>
#include <stdexcept>
#include "pluginterfaces/base/ibstream.h"
#include "pluginterfaces/gui/iplugview.h"
#include "pluginterfaces/vst/ivstaudioprocessor.h"
#include "pluginterfaces/vst/ivsteditcontroller.h"
#include "pluginterfaces/vst/ivsthostapplication.h"
#include "pluginterfaces/vst/ivstmessage.h"
#include "pluginterfaces/vst/ivstparameterchanges.h"
#include "pluginterfaces/vst/ivstprocesscontext.h"

namespace ocvst3 {
using namespace Steinberg;
using namespace Steinberg::Vst;

constexpr size_t MaxPreset = 32 * 1024 * 1024;
constexpr int MaxChannels = 64;
inline bool sameId(const char* a, const char* b) { return std::memcmp(a, b, sizeof(TUID)) == 0; }

template <typename T>
IPtr<T> query(FUnknown* object, const TUID id) {
  void* result = nullptr;
  if (object && object->queryInterface(id, &result) == kResultOk) return owned(static_cast<T*>(result));
  return nullptr;
}

class PresetStream final : public IBStream, public ISizeableStream {
public:
  std::vector<char> bytes;
  size_t position = 0;
  tresult PLUGIN_API queryInterface(const TUID id, void** result) override {
    *result = nullptr;
    if (sameId(id, INLINE_UID_OF(FUnknown)) || sameId(id, INLINE_UID_OF(IBStream))) *result = static_cast<IBStream*>(this);
    else if (sameId(id, INLINE_UID_OF(ISizeableStream))) *result = static_cast<ISizeableStream*>(this);
    return *result ? kResultOk : kNoInterface;
  }
  uint32 PLUGIN_API addRef() override { return 1; }
  uint32 PLUGIN_API release() override { return 1; }
  tresult PLUGIN_API read(void* buffer, int32 size, int32* count) override {
    if (size < 0) return kInvalidArgument;
    const size_t copied = position < bytes.size() ? std::min(bytes.size() - position, static_cast<size_t>(size)) : 0;
    if (copied) std::memcpy(buffer, bytes.data() + position, copied);
    position += copied;
    if (count) *count = static_cast<int32>(copied);
    return copied || size == 0 ? kResultOk : kResultFalse;
  }
  tresult PLUGIN_API write(void* buffer, int32 size, int32* count) override {
    if (size < 0 || static_cast<size_t>(size) > MaxPreset - position) return kInvalidArgument;
    if (position + size > bytes.size()) bytes.resize(position + size);
    if (size) std::memcpy(bytes.data() + position, buffer, size);
    position += size;
    if (count) *count = size;
    return kResultOk;
  }
  tresult PLUGIN_API seek(int64 offset, int32 mode, int64* result) override {
    constexpr auto limit = static_cast<int64>(MaxPreset);
    if (mode < kIBSeekSet || mode > kIBSeekEnd || offset < -limit || offset > limit) return kInvalidArgument;
    const int64 start = mode == kIBSeekSet ? 0 : mode == kIBSeekCur ? position : bytes.size();
    const int64 next = start + offset;
    if (next < 0 || next > limit) return kInvalidArgument;
    position = static_cast<size_t>(next);
    if (result) *result = next;
    return kResultOk;
  }
  tresult PLUGIN_API tell(int64* result) override { if (!result) return kInvalidArgument; *result = position; return kResultOk; }
  tresult PLUGIN_API getStreamSize(int64& size) override { size = bytes.size(); return kResultOk; }
  tresult PLUGIN_API setStreamSize(int64 size) override {
    if (size < 0 || size > MaxPreset) return kInvalidArgument;
    bytes.resize(static_cast<size_t>(size));
    return kResultOk;
  }
};

class ParameterQueue final : public IParamValueQueue {
public:
  ParamID id = 0;
  ParamValue value = 0;
  int32 offset = 0;
  int32 count = 0;
  tresult PLUGIN_API queryInterface(const TUID interfaceId, void** result) override {
    *result = sameId(interfaceId, INLINE_UID_OF(FUnknown)) || sameId(interfaceId, INLINE_UID_OF(IParamValueQueue)) ? this : nullptr;
    return *result ? kResultOk : kNoInterface;
  }
  uint32 PLUGIN_API addRef() override { return 1; }
  uint32 PLUGIN_API release() override { return 1; }
  ParamID PLUGIN_API getParameterId() override { return id; }
  int32 PLUGIN_API getPointCount() override { return count; }
  tresult PLUGIN_API getPoint(int32 index, int32& frame, ParamValue& data) override {
    if (index != 0 || !count) return kInvalidArgument;
    frame = offset; data = value; return kResultOk;
  }
  tresult PLUGIN_API addPoint(int32 frame, ParamValue data, int32& index) override {
    offset = frame; value = data; index = 0; count = 1; return kResultOk;
  }
};

class ParameterChanges final : public IParameterChanges {
  std::array<ParameterQueue, 1024> queues;
  int32 count = 0;
public:
  void clear() { count = 0; }
  tresult PLUGIN_API queryInterface(const TUID id, void** result) override {
    *result = sameId(id, INLINE_UID_OF(FUnknown)) || sameId(id, INLINE_UID_OF(IParameterChanges)) ? this : nullptr;
    return *result ? kResultOk : kNoInterface;
  }
  uint32 PLUGIN_API addRef() override { return 1; }
  uint32 PLUGIN_API release() override { return 1; }
  int32 PLUGIN_API getParameterCount() override { return count; }
  IParamValueQueue* PLUGIN_API getParameterData(int32 index) override { return index >= 0 && index < count ? &queues[index] : nullptr; }
  IParamValueQueue* PLUGIN_API addParameterData(const ParamID& id, int32& index) override {
    for (index = 0; index < count; ++index) if (queues[index].id == id) return &queues[index];
    if (count == queues.size()) return nullptr;
    auto& queue = queues[count++]; queue.id = id; queue.count = 0;
    return &queue;
  }
};

class EffectHost final : public IHostApplication, public IComponentHandler, public IPlugFrame {
  HMODULE module = nullptr;
  bool moduleEntered = false, componentInitialized = false, controllerInitialized = false;
  bool active = false, processing = false, connected = false;
  bool attached = false;
  IPtr<IPluginFactory> factory;
  IPtr<IComponent> component;
  IPtr<IAudioProcessor> processor;
  IPtr<IEditController> controller;
  IPtr<IConnectionPoint> componentConnection, controllerConnection;
  IPtr<IPlugView> view;
  std::mutex editMutex;
  ParameterChanges pending, edits, outputEdits;
  std::vector<AudioBusBuffers> inputBuses, outputBuses;
  int32 inputBus = -1, outputBus = -1;
  int rate = 48000;
  void (*resize)(int, int) = nullptr;
  TUID classId{};
  std::atomic<int32> pendingRestart{0};

  int channels(BusDirection direction) {
    const auto count = component->getBusCount(kAudio, direction);
    if (count < 0 || count > MaxChannels) throw std::runtime_error("VST3 plugin has too many audio buses.");
    auto& buses = direction == kInput ? inputBuses : outputBuses;
    auto& selected = direction == kInput ? inputBus : outputBus;
    buses.resize(count);
    for (int32 index = 0; index < count; ++index) {
      BusInfo info{};
      if (component->getBusInfo(kAudio, direction, index, info) != kResultOk) throw std::runtime_error("VST3 plugin did not report its audio buses.");
      if (selected < 0 && info.busType == kMain && info.channelCount > 0) selected = index;
    }
    if (selected < 0) return 0;
    BusInfo info{};
    component->getBusInfo(kAudio, direction, selected, info);
    if (info.channelCount > MaxChannels) throw std::runtime_error("VST3 plugin has more than 64 channels on a main bus.");
    buses[selected].numChannels = info.channelCount;
    return info.channelCount;
  }

public:
  std::string name, vendor;
  int inputs = 0, outputs = 0;
  bool hasEditor() const { return view != nullptr; }
  int delay() const { return processor ? static_cast<int>(std::min<uint32>(processor->getLatencySamples(), 8193)) : 0; }
  ~EffectHost() {
    closeEditor();
    view = nullptr;
    if (processing) processor->setProcessing(false);
    if (active) component->setActive(false);
    if (controller) controller->setComponentHandler(nullptr);
    if (connected) { componentConnection->disconnect(controllerConnection); controllerConnection->disconnect(componentConnection); }
    componentConnection = nullptr; controllerConnection = nullptr;
    if (controllerInitialized) controller->terminate();
    controller = nullptr;
    if (componentInitialized) component->terminate();
    processor = nullptr; component = nullptr; factory = nullptr;
    if (module) {
      if (moduleEntered) {
        auto exit = reinterpret_cast<bool (*)()>(GetProcAddress(module, "ExitDll"));
        if (exit) exit();
      }
      FreeLibrary(module);
    }
  }

  void open(const std::wstring& file, int sampleRate, int blockSize, const std::vector<char>& preset, void (*resizeHost)(int, int)) {
    rate = sampleRate; resize = resizeHost;
    module = LoadLibraryExW(file.c_str(), nullptr, LOAD_WITH_ALTERED_SEARCH_PATH);
    if (!module) throw std::runtime_error("Could not load the VST3 module or a required dependency (Windows error " + std::to_string(GetLastError()) + ").");
    auto init = reinterpret_cast<bool (*)()>(GetProcAddress(module, "InitDll"));
    if (init && !init()) throw std::runtime_error("VST3 module initialization failed. Check the plugin installation and license.");
    moduleEntered = init != nullptr;
    auto getFactory = reinterpret_cast<IPluginFactory* (PLUGIN_API*)()>(GetProcAddress(module, "GetPluginFactory"));
    if (!getFactory || !(factory = owned(getFactory()))) throw std::runtime_error("This file does not expose a VST3 plugin factory.");
    const auto factory3 = query<IPluginFactory3>(factory, INLINE_UID_OF(IPluginFactory3));
    if (factory3) factory3->setHostContext(static_cast<IHostApplication*>(this));
    const auto factory2 = query<IPluginFactory2>(factory, INLINE_UID_OF(IPluginFactory2));
    PFactoryInfo info{};
    if (factory->getFactoryInfo(&info) == kResultOk) vendor.assign(info.vendor, strnlen_s(info.vendor, sizeof(info.vendor)));
    const int32 count = std::min<int32>(factory->countClasses(), 4096);
    for (int32 index = 0; index < count; ++index) {
      PClassInfo item{};
      if (factory->getClassInfo(index, &item) != kResultOk || std::strncmp(item.category, kVstAudioEffectClass, sizeof(item.category)) != 0) continue;
      PClassInfo2 details{};
      if (factory2 && factory2->getClassInfo2(index, &details) == kResultOk &&
          std::string(details.subCategories, strnlen_s(details.subCategories, sizeof(details.subCategories))).find("Instrument") != std::string::npos) continue;
      void* instance = nullptr;
      if (factory->createInstance(item.cid, INLINE_UID_OF(IComponent), &instance) != kResultOk || !instance) continue;
      component = owned(static_cast<IComponent*>(instance));
      std::memcpy(classId, item.cid, sizeof(classId));
      name.assign(item.name, strnlen_s(item.name, sizeof(item.name)));
      break;
    }
    if (!component) throw std::runtime_error("No compatible audio effect was found in this VST3 module. MIDI instruments are not supported.");
    component->setIoMode(kSimple);
    if (component->initialize(static_cast<IHostApplication*>(this)) != kResultOk) throw std::runtime_error("Could not initialize the VST3 effect. Check the plugin installation and license.");
    componentInitialized = true;
    processor = query<IAudioProcessor>(component, INLINE_UID_OF(IAudioProcessor));
    if (!processor || processor->canProcessSampleSize(kSample32) != kResultTrue) throw std::runtime_error("This VST3 plugin does not support 32-bit float audio.");
    controller = query<IEditController>(component, INLINE_UID_OF(IEditController));
    TUID controllerId{};
    if (!controller && component->getControllerClassId(controllerId) == kResultOk) {
      void* instance = nullptr;
      if (factory->createInstance(controllerId, INLINE_UID_OF(IEditController), &instance) == kResultOk && instance) {
        controller = owned(static_cast<IEditController*>(instance));
        controllerInitialized = controller->initialize(static_cast<IHostApplication*>(this)) == kResultOk;
        if (!controllerInitialized) controller = nullptr;
      }
    }
    if (controller) {
      controller->setComponentHandler(this);
      if (controllerInitialized) {
        componentConnection = query<IConnectionPoint>(component, INLINE_UID_OF(IConnectionPoint));
        controllerConnection = query<IConnectionPoint>(controller, INLINE_UID_OF(IConnectionPoint));
        if (componentConnection && controllerConnection) {
          componentConnection->connect(controllerConnection);
          controllerConnection->connect(componentConnection);
          connected = true;
        }
      }
    }
    restore(preset);
    inputs = channels(kInput); outputs = channels(kOutput);
    if (!outputs) throw std::runtime_error("The VST3 plugin has no main audio output bus.");
    ProcessSetup setup{kRealtime, kSample32, blockSize, static_cast<double>(rate)};
    if (processor->setupProcessing(setup) != kResultOk) throw std::runtime_error("The VST3 effect did not accept 48 kHz realtime processing.");
    for (int32 index = 0; index < inputBuses.size(); ++index) component->activateBus(kAudio, kInput, index, index == inputBus);
    for (int32 index = 0; index < outputBuses.size(); ++index) component->activateBus(kAudio, kOutput, index, index == outputBus);
    if (controller) {
      view = owned(controller->createView(ViewType::kEditor));
      if (view && view->isPlatformTypeSupported(kPlatformTypeHWND) != kResultTrue) view = nullptr;
    }
    pendingRestart = 0;
  }

  void activate() {
    if (component->setActive(true) != kResultOk) throw std::runtime_error("The VST3 effect could not activate its audio buses.");
    active = true;
  }
  void startProcessing() {
    const auto status = processor->setProcessing(true);
    if (status != kResultOk && status != kNotImplemented) throw std::runtime_error("The VST3 effect could not start processing.");
    processing = true;
  }

  void process(float** input, float** output, int frames, uint64 sample) {
    const auto requested = pendingRestart.exchange(0);
    if (requested & kReloadComponent) throw std::runtime_error("The VST3 plug-in requested a restart. Enable it again to apply its settings.");
    if (requested & kIoChanged) {
      // A plugin can notify the host even when its active buses are unchanged.
      for (const auto direction : {kInput, kOutput}) {
        const auto index = direction == kInput ? inputBus : outputBus;
        const auto channels = direction == kInput ? inputs : outputs;
        const auto count = direction == kInput ? inputBuses.size() : outputBuses.size();
        BusInfo info{};
        if (component->getBusCount(kAudio, direction) != count ||
            (index >= 0 && (component->getBusInfo(kAudio, direction, index, info) != kResultOk || info.channelCount != channels))) {
          throw std::runtime_error("The VST3 plug-in changed its audio bus layout. Enable it again to apply its settings.");
        }
      }
    }
    {
      std::lock_guard<std::mutex> guard(editMutex);
      for (int32 i = 0; i < pending.getParameterCount(); ++i) {
        auto* queue = pending.getParameterData(i);
        int32 index, offset; ParamValue value;
        if (queue->getPoint(0, offset, value) == kResultOk) {
          if (auto* edit = edits.addParameterData(queue->getParameterId(), index)) edit->addPoint(0, value, index);
        }
      }
      pending.clear();
    }
    ProcessData data;
    data.processMode = kRealtime; data.symbolicSampleSize = kSample32; data.numSamples = frames;
    data.numInputs = static_cast<int32>(inputBuses.size()); data.inputs = inputBuses.data();
    data.numOutputs = static_cast<int32>(outputBuses.size()); data.outputs = outputBuses.data();
    if (inputBus >= 0) { inputBuses[inputBus].channelBuffers32 = input; inputBuses[inputBus].silenceFlags = 0; }
    outputBuses[outputBus].channelBuffers32 = output; outputBuses[outputBus].silenceFlags = 0;
    data.inputParameterChanges = &edits; data.outputParameterChanges = &outputEdits;
    ProcessContext context{};
    context.sampleRate = rate; context.projectTimeSamples = sample; context.continousTimeSamples = sample;
    context.tempo = 120; context.projectTimeMusic = static_cast<double>(sample) * 2 / rate;
    context.timeSigNumerator = 4; context.timeSigDenominator = 4;
    context.state = ProcessContext::kPlaying | ProcessContext::kContTimeValid | ProcessContext::kTempoValid | ProcessContext::kTimeSigValid | ProcessContext::kProjectTimeMusicValid;
    data.processContext = &context;
    const auto result = processor->process(data);
    edits.clear(); outputEdits.clear();
    // kResultFalse is used by some receivers while they have no signal. The
    // output buffers were cleared before processing and may contain silence.
    if (result != kResultOk && result != kResultFalse) throw std::runtime_error("The VST3 plug-in could not process audio (result " + std::to_string(result) + ").");
  }

  void restore(const std::vector<char>& preset) {
    if (preset.size() < 24 || !sameId(preset.data(), classId)) return;
    uint32 sizes[2]; std::memcpy(sizes, preset.data() + 16, sizeof(sizes));
    if (sizes[0] > MaxPreset || sizes[1] > MaxPreset || 24 + static_cast<size_t>(sizes[0]) + sizes[1] != preset.size()) return;
    PresetStream state;
    state.bytes.assign(preset.begin() + 24, preset.begin() + 24 + sizes[0]);
    if (sizes[0]) component->setState(&state);
    if (controller && sizes[0]) { state.position = 0; controller->setComponentState(&state); }
    if (controller && sizes[1]) {
      state.position = 0;
      state.bytes.assign(preset.end() - sizes[1], preset.end());
      controller->setState(&state);
    }
  }
  std::vector<char> save() {
    PresetStream state, ui;
    if (component->getState(&state) != kResultOk) state.bytes.clear();
    if (controller && controller->getState(&ui) != kResultOk) ui.bytes.clear();
    if (state.bytes.empty() && ui.bytes.empty()) return {};
    uint32 sizes[] = {static_cast<uint32>(state.bytes.size()), static_cast<uint32>(ui.bytes.size())};
    std::vector<char> preset(classId, classId + sizeof(classId));
    const auto* header = reinterpret_cast<const char*>(sizes);
    preset.insert(preset.end(), header, header + sizeof(sizes));
    preset.insert(preset.end(), state.bytes.begin(), state.bytes.end());
    preset.insert(preset.end(), ui.bytes.begin(), ui.bytes.end());
    return preset;
  }

  bool showEditor(HWND parent) {
    if (!view) return false;
    view->setFrame(this);
    if (view->attached(parent, kPlatformTypeHWND) != kResultOk) { view->setFrame(nullptr); return false; }
    attached = true;
    ViewRect rect{};
    if (view->getSize(&rect) == kResultOk) resizeView(view, &rect);
    return true;
  }
  void closeEditor() {
    if (!attached) return;
    view->removed(); view->setFrame(nullptr); attached = false;
  }

  tresult PLUGIN_API queryInterface(const TUID id, void** result) override {
    *result = nullptr;
    if (sameId(id, INLINE_UID_OF(FUnknown)) || sameId(id, INLINE_UID_OF(IHostApplication))) *result = static_cast<IHostApplication*>(this);
    else if (sameId(id, INLINE_UID_OF(IComponentHandler))) *result = static_cast<IComponentHandler*>(this);
    else if (sameId(id, INLINE_UID_OF(IPlugFrame))) *result = static_cast<IPlugFrame*>(this);
    return *result ? kResultOk : kNoInterface;
  }
  uint32 PLUGIN_API addRef() override { return 1; }
  uint32 PLUGIN_API release() override { return 1; }
  tresult PLUGIN_API getName(String128 buffer) override {
    constexpr char16 hostName[] = u"OpenChurch Broadcast Studio";
    std::copy(std::begin(hostName), std::end(hostName), buffer);
    return kResultOk;
  }
  tresult PLUGIN_API createInstance(TUID, TUID, void** result) override { *result = nullptr; return kNoInterface; }
  tresult PLUGIN_API beginEdit(ParamID) override { return kResultOk; }
  tresult PLUGIN_API endEdit(ParamID) override { return kResultOk; }
  tresult PLUGIN_API performEdit(ParamID id, ParamValue value) override {
    std::lock_guard<std::mutex> guard(editMutex);
    int32 index;
    auto* queue = pending.addParameterData(id, index);
    return queue ? queue->addPoint(0, value, index) : kResultFalse;
  }
  tresult PLUGIN_API restartComponent(int32 flags) override {
    pendingRestart.fetch_or(flags & (kReloadComponent | kIoChanged));
    return kResultOk;
  }
  tresult PLUGIN_API resizeView(IPlugView* sender, ViewRect* size) override {
    if (sender != view.get() || !size || !resize) return kInvalidArgument;
    resize(size->getWidth(), size->getHeight());
    return sender->onSize(size);
  }
};
}
