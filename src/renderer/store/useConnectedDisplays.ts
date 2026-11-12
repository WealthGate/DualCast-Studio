import { create } from "zustand";
import type { ProjectionDisplay } from "../../shared/types";

let revision = 0;
export const useConnectedDisplays = create<{
  displays: ProjectionDisplay[]; loading: boolean; error: string | null; refresh: () => Promise<void>;
}>((set) => ({
  displays: [], loading: true, error: null,
  refresh: async () => {
    const request = ++revision; set({ loading: true });
    try { const displays = await window.dualcast.listProjectionDisplays(); if (request === revision) set({ displays, error: null }); }
    catch (error) { if (request === revision) set({ error: error instanceof Error ? error.message : "Displays could not be detected." }); }
    finally { if (request === revision) set({ loading: false }); }
  }
}));
