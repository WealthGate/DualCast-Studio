import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import {
  ACTIVE_PROFILE_KEY,
  createStudioProfile,
  isStudioProfile,
  normalizeProfileName,
  parseStudioProfiles,
  PROFILE_STORAGE_KEY,
  StudioProfile
} from "../utils/profiles";

export type ProfileManagerIntent = "manage" | "new" | "duplicate";

type ProfileManagerProps = {
  intent: ProfileManagerIntent;
  onClose: () => void;
};

const ProfileManager: React.FC<ProfileManagerProps> = ({ intent, onClose }) => {
  const { settings, setSettings, setStudioState } = useAppStore();
  const [profiles, setProfiles] = useState<StudioProfile[]>(() => parseStudioProfiles(localStorage.getItem(PROFILE_STORAGE_KEY)));
  const [activeId, setActiveId] = useState(() => localStorage.getItem(ACTIVE_PROFILE_KEY) ?? "");
  const [selectedId, setSelectedId] = useState(() => localStorage.getItem(ACTIVE_PROFILE_KEY) ?? "");
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const selected = useMemo(() => profiles.find((profile) => profile.id === selectedId) ?? null, [profiles, selectedId]);

  useEffect(() => {
    if (profiles.length === 0) {
      const profile = createStudioProfile("Default", settings);
      setProfiles([profile]);
      setSelectedId(profile.id);
      setActiveId(profile.id);
      setName(profile.name);
      return;
    }
    const current = profiles.find((profile) => profile.id === selectedId) ?? profiles[0];
    setSelectedId(current.id);
    setName(intent === "duplicate" ? `Copy of ${current.name}` : intent === "new" ? "New Profile" : current.name);
  }, []);

  useEffect(() => {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profiles));
  }, [profiles]);

  useEffect(() => {
    if (activeId) localStorage.setItem(ACTIVE_PROFILE_KEY, activeId);
  }, [activeId]);

  const createProfile = (duplicate = false) => {
    const base = duplicate && selected ? selected.settings : settings;
    const profile = createStudioProfile(name, base);
    setProfiles((current) => [...current, profile]);
    setSelectedId(profile.id);
    setName(profile.name);
    setMessage(`${profile.name} was created from ${duplicate ? "the selected profile" : "the current studio"}.`);
  };

  const saveCurrent = () => {
    if (!selected) return;
    const now = new Date().toISOString();
    setProfiles((current) => current.map((profile) => profile.id === selected.id
      ? { ...profile, name: normalizeProfileName(name, profile.name), updatedAt: now, settings: structuredClone(settings) }
      : profile));
    setMessage("Current studio settings and scenes were saved to this profile.");
  };

  const renameSelected = () => {
    if (!selected) return;
    const nextName = normalizeProfileName(name, selected.name);
    setProfiles((current) => current.map((profile) => profile.id === selected.id ? { ...profile, name: nextName, updatedAt: new Date().toISOString() } : profile));
    setName(nextName);
    setMessage("Profile renamed.");
  };

  const applySelected = async () => {
    if (!selected) return;
    try {
      const updated = await window.dualcast.updateSettings(selected.settings);
      setSettings(updated);
      setStudioState(updated.studioState);
      setActiveId(selected.id);
      setMessage(`${selected.name} is now active.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The profile could not be applied.");
    }
  };

  const deleteSelected = () => {
    if (!selected || profiles.length <= 1) return;
    const next = profiles.filter((profile) => profile.id !== selected.id);
    setProfiles(next);
    const replacement = next[0];
    setSelectedId(replacement.id);
    setName(replacement.name);
    if (activeId === selected.id) setActiveId(replacement.id);
    setMessage("Profile deleted. The current studio was not changed.");
  };

  const exportSelected = () => {
    if (!selected) return;
    const blob = new Blob([JSON.stringify(selected, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${normalizeProfileName(selected.name).replace(/\s+/g, "-")}.openchurch-profile.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importProfile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (!isStudioProfile(parsed)) throw new Error("This is not a valid OpenChurch profile file.");
      const profile = { ...parsed, id: crypto.randomUUID(), name: normalizeProfileName(parsed.name) };
      setProfiles((current) => [...current, profile]);
      setSelectedId(profile.id);
      setName(profile.name);
      setMessage("Profile imported. Click Apply Profile when you are ready to use it.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The profile could not be imported.");
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="studio-modal profile-manager" role="dialog" aria-modal="true" aria-labelledby="profile-manager-title">
        <div className="panel-header">
          <div><h2 id="profile-manager-title">Studio Profiles</h2><p>Save complete settings and scene arrangements for different services or venues.</p></div>
          <button className="btn btn-outline" onClick={onClose}>Close</button>
        </div>
        <div className="profile-manager-grid">
          <div className="profile-list" role="listbox" aria-label="Saved profiles">
            {profiles.map((profile) => (
              <button key={profile.id} className={profile.id === selectedId ? "active" : ""} onClick={() => { setSelectedId(profile.id); setName(profile.name); }}>
                <strong>{profile.name}</strong>
                <span>{profile.id === activeId ? "ACTIVE" : new Date(profile.updatedAt).toLocaleDateString()}</span>
              </button>
            ))}
          </div>
          <div className="profile-actions">
            <div className="field"><label htmlFor="profileName">Profile Name</label><input id="profileName" value={name} onChange={(event) => setName(event.target.value)} /></div>
            <div className="button-grid">
              <button className="btn btn-primary" onClick={() => void applySelected()} disabled={!selected}>Apply Profile</button>
              <button className="btn btn-outline" onClick={saveCurrent} disabled={!selected}>Save Current to Profile</button>
              <button className="btn btn-outline" onClick={() => createProfile(false)}>New from Current</button>
              <button className="btn btn-outline" onClick={() => createProfile(true)} disabled={!selected}>Duplicate Selected</button>
              <button className="btn btn-outline" onClick={renameSelected} disabled={!selected}>Rename</button>
              <button className="btn btn-danger" onClick={deleteSelected} disabled={!selected || profiles.length <= 1}>Delete</button>
              <button className="btn btn-outline" onClick={exportSelected} disabled={!selected}>Export</button>
              <button className="btn btn-outline" onClick={() => importRef.current?.click()}>Import</button>
            </div>
            <input ref={importRef} hidden type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importProfile(file); event.currentTarget.value = ""; }} />
            {message ? <div className="profile-message" role="status">{message}</div> : null}
            <p className="field-help">Stream keys, OAuth tokens, and account secrets are never exported with a profile.</p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ProfileManager;
