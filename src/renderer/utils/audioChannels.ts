import { AudioChannelMode } from "../../shared/types";

export const setProgramChannelMode = (mix: GainNode, mode: AudioChannelMode) => {
  mix.channelInterpretation = "speakers";
  mix.channelCountMode = "explicit";
  mix.channelCount = mode === "mono" ? 1 : 2;
};

// Upmix mono before the splitter so both physical output channels and meters receive audio.
export const createStereoProgramOutput = (context: BaseAudioContext, mix: GainNode) => {
  const output = context.createGain();
  output.channelInterpretation = "speakers";
  output.channelCountMode = "explicit";
  output.channelCount = 2;
  mix.connect(output);
  return output;
};
