// Minimal binary interface declarations, independently authored for this host.
// No Steinberg VST2 SDK or third-party source is included or required.
#pragma once
#include <cstddef>
#include <cstdint>

namespace ocvst {
struct Effect;
using Dispatch = intptr_t (*)(Effect*, int32_t, int32_t, intptr_t, void*, float);
using Process = void (*)(Effect*, float**, float**, int32_t);
using SetParameter = void (*)(Effect*, int32_t, float);
using GetParameter = float (*)(Effect*, int32_t);
using HostCallback = Dispatch;
struct Effect {
  int32_t magic;
  Dispatch dispatch;
  Process process;
  SetParameter setParameter;
  GetParameter getParameter;
  int32_t programs, parameters, inputs, outputs, flags;
  void* reserved1;
  void* reserved2;
  int32_t latency;
  int32_t reserved3, reserved4;
  float ratio;
  void* object;
  void* user;
  int32_t id, version;
  Process replace;
  void (*replaceDouble)(Effect*, double**, double**, int32_t);
  char reserved[56];
};
struct EditorRect { int16_t top, left, bottom, right; };
struct TimeInfo {
  double samplePosition, sampleRate, nanoseconds, beatPosition, tempo;
  double barStart, cycleStart, cycleEnd;
  int32_t numerator, denominator, timecodeOffset, timecodeRate, nextClock, flags;
};
constexpr int32_t Magic = 0x56737450;
constexpr uint32_t PacketMagic = 0x4f434156;
constexpr int32_t HasEditor = 1, Replacing = 16, ProgramChunks = 32;
enum EffectOpcode : int32_t {
  Open = 0, Close = 1, SetSampleRate = 10, SetBlockSize = 11,
  MainsChanged = 12, EditorGetRect = 13, EditorOpen = 14, EditorClose = 15,
  EditorIdle = 19, GetChunk = 23, SetChunk = 24, GetName = 45,
  GetVendor = 47, GetProduct = 48, Idle = 53, StartProcess = 71, StopProcess = 72
};
enum HostOpcode : int32_t {
  Automate = 0, Version = 1, HostIdle = 3, GetTime = 7, IoChanged = 13,
  SizeWindow = 15, GetSampleRate = 16, GetBlockSize = 17,
  GetInputLatency = 18, GetOutputLatency = 19, GetProcessLevel = 23,
  GetAutomationState = 24, GetVendorString = 32, GetProductString = 33,
  GetVendorVersion = 34, CanDo = 37, GetLanguage = 38,
  UpdateDisplay = 42, BeginEdit = 43, EndEdit = 44
};
struct Packet { uint32_t magic, type, id, bytes; };
static_assert(sizeof(Packet) == 16);
#if INTPTR_MAX == INT64_MAX
static_assert(sizeof(Effect) == 192);
static_assert(offsetof(Effect, replace) == 120);
#endif
}
