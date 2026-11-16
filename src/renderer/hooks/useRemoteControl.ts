import { useEffect, useRef } from "react";
import { executeRemoteCommand, getRemoteControlState } from "../utils/remoteControl";
import type { useProgramRecorder } from "./useProgramRecorder";

export const useRemoteControl = (recorder: ReturnType<typeof useProgramRecorder>, streamStatus: string) => {
  const latest = useRef({ recorder, streamStatus });
  latest.current = { recorder, streamStatus };
  useEffect(() => {
    const publish = () => window.dualcast.publishRemoteState(getRemoteControlState(latest.current.streamStatus));
    publish();
    const interval = window.setInterval(publish, 1000);
    const off = window.dualcast.onRemoteCommand(async ({ id, command, expiresAt }) => {
      try {
        const message = await executeRemoteCommand(command, latest.current.recorder, expiresAt);
        publish();
        window.dualcast.replyRemoteCommand({ id, ok: true, message });
      } catch (error) {
        publish();
        window.dualcast.replyRemoteCommand({ id, ok: false, message: error instanceof Error ? error.message : "Mobile command failed." });
      }
    });
    return () => { window.clearInterval(interval); off(); };
  }, []);
};
