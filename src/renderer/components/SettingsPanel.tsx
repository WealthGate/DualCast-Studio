import React, { useEffect, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { FrameRatePreset, QualityPreset, StreamingCredentialProvider, StreamingCredentialStatus, ThemePreference } from "../../shared/types";

const SettingsPanel: React.FC = () => {
  const { settings, updateSettings } = useAppStore();
  const [credentialStatus, setCredentialStatus] = useState<Record<StreamingCredentialProvider, StreamingCredentialStatus | null>>({ youtube: null, facebook: null });
  const [credentials, setCredentials] = useState({ youtube: { clientId: "", clientSecret: "" }, facebook: { clientId: "", clientSecret: "" } });
  const [accountMessage, setAccountMessage] = useState<string | null>(null);

  const refreshCredentialStatus = async () => {
    try {
      const [youtube, facebook] = await Promise.all([
        window.dualcast.getStreamingCredentialStatus("youtube"),
        window.dualcast.getStreamingCredentialStatus("facebook")
      ]);
      setCredentialStatus({ youtube, facebook });
    } catch (error) {
      setAccountMessage(error instanceof Error ? error.message : "Streaming account status could not be loaded.");
    }
  };

  useEffect(() => { void refreshCredentialStatus(); }, []);

  const saveCredentials = async (provider: StreamingCredentialProvider) => {
    try {
      const status = await window.dualcast.setStreamingCredentials({ provider, ...credentials[provider] });
      setCredentialStatus((current) => ({ ...current, [provider]: status }));
      setCredentials((current) => ({ ...current, [provider]: { clientId: "", clientSecret: "" } }));
      setAccountMessage(`${provider === "youtube" ? "YouTube" : "Facebook"} application credentials were encrypted and saved. You can now connect the account in Stream Setup.`);
    } catch (error) {
      setAccountMessage(error instanceof Error ? error.message : "The credentials could not be saved.");
    }
  };

  const clearCredentials = async (provider: StreamingCredentialProvider) => {
    try {
      const status = await window.dualcast.clearStreamingCredentials(provider);
      setCredentialStatus((current) => ({ ...current, [provider]: status }));
      setAccountMessage(`${provider === "youtube" ? "YouTube" : "Facebook"} credentials and saved sign-in were removed from this computer.`);
    } catch (error) {
      setAccountMessage(error instanceof Error ? error.message : "The credentials could not be removed.");
    }
  };

  const disconnectAccount = async (provider: StreamingCredentialProvider) => {
    try {
      const status = await window.dualcast.disconnectStreamingAccount(provider);
      setCredentialStatus((current) => ({ ...current, [provider]: status }));
      setAccountMessage("The saved account authorization was removed. The application credentials were kept.");
    } catch (error) {
      setAccountMessage(error instanceof Error ? error.message : "The saved account could not be disconnected.");
    }
  };

  const handleDirectoryChange = async () => {
    const selected = await window.dualcast.selectSaveDirectory();
    if (selected) {
      updateSettings({ saveDirectory: selected });
    }
  };

  return (
    <section className="panel settings-panel">
      <h2>Settings</h2>
      <h3>General</h3>
      <div className="field">
        <label htmlFor="theme">Interface Theme</label>
        <select
          id="theme"
          value={settings.theme}
          onChange={(event) => updateSettings({ theme: event.target.value as ThemePreference })}
        >
          <option value="system">System</option>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
          <option value="high-contrast">High Contrast</option>
          <option value="midnight">Midnight Blue</option>
          <option value="warm">Warm Sanctuary</option>
        </select>
      </div>
      <details className="settings-section streaming-account-settings" open>
        <summary>Streaming Accounts</summary>
        <p className="settings-path"><strong>You are here:</strong> Controls → Settings → System Settings → Streaming Accounts</p>
        <p className="field-help">Application credentials identify this installed desktop app to the platform. Your personal Google or Facebook password is never entered here; sign-in happens in the platform's secure browser page.</p>
        {(["youtube", "facebook"] as const).map((provider) => {
          const status = credentialStatus[provider];
          const label = provider === "youtube" ? "YouTube Live" : "Facebook Live";
          return (
            <fieldset key={provider} className="credential-card">
              <legend>{label}</legend>
              <div className="credential-status-row">
                <span className={status?.configured ? "tag" : "warn-pill"}>{status?.configured ? `Configured (${status.source})` : "Setup required"}</span>
                {status?.clientIdHint ? <span className="field-help">Client: {status.clientIdHint}</span> : null}
                {status?.account ? <span className="tag">Signed in: {status.account}</span> : null}
              </div>
              <div className="field"><label htmlFor={`${provider}-client-id`}>{provider === "youtube" ? "Desktop OAuth Client ID" : "App ID"}</label><input id={`${provider}-client-id`} autoComplete="off" value={credentials[provider].clientId} onChange={(event) => setCredentials((current) => ({ ...current, [provider]: { ...current[provider], clientId: event.target.value } }))} placeholder={status?.configured ? "Enter only to replace saved credentials" : provider === "youtube" ? "…apps.googleusercontent.com" : "Facebook App ID"} /></div>
              <div className="field"><label htmlFor={`${provider}-client-secret`}>{provider === "youtube" ? "Client Secret (optional)" : "App Secret"}</label><input id={`${provider}-client-secret`} type="password" autoComplete="new-password" value={credentials[provider].clientSecret} onChange={(event) => setCredentials((current) => ({ ...current, [provider]: { ...current[provider], clientSecret: event.target.value } }))} placeholder={status?.configured ? "Saved securely; enter only to replace" : provider === "youtube" ? "Enter only if Google supplied one" : "Application client secret"} /></div>
              <div className="button-row">
                <button className="btn btn-primary" onClick={() => void saveCredentials(provider)} disabled={!credentials[provider].clientId.trim() || (provider === "facebook" && !credentials[provider].clientSecret.trim())}>Save Securely</button>
                {status?.account ? <button className="btn btn-outline" onClick={() => void disconnectAccount(provider)}>Disconnect Account</button> : null}
                {status?.configured && status.source === "secure" ? <button className="btn btn-danger" onClick={() => void clearCredentials(provider)}>Remove Credentials</button> : null}
              </div>
              {provider === "youtube" ? (
                <ol className="setup-steps">
                  <li>In Google Cloud Console, create or select a project and enable <strong>YouTube Data API v3</strong>.</li>
                  <li>Configure the OAuth consent screen and add your account as a test user while the app is in testing.</li>
                  <li>Open Google Auth Platform → Clients → Create Client, choose <strong>Desktop app</strong>, and copy the Client ID.</li>
                  <li>Paste it into <strong>Desktop OAuth Client ID</strong> above. Paste the Client Secret only if Google supplied one, then choose <strong>Save Securely</strong>.</li>
                  <li>Open Stream Setup, choose YouTube Live, enter the broadcast details, and click Connect.</li>
                </ol>
              ) : <p className="field-help">Create a Meta developer app with Facebook Login and the permissions required for the Page or profile you are authorized to stream to.</p>}
            </fieldset>
          );
        })}
        {accountMessage ? <div className="profile-message" role="status">{accountMessage}</div> : null}
      </details>
      <div className="field">
        <label>Save directory</label>
        <div className="field-row">
          <span className="path">{settings.saveDirectory || "Not set"}</span>
          <button className="btn btn-outline" onClick={handleDirectoryChange}>
            Change
          </button>
        </div>
      </div>
      <div className="field">
        <label htmlFor="masterAudioGain">
          Master Program Audio ({Math.round(settings.masterAudioGain * 100)}%)
        </label>
        <input
          id="masterAudioGain"
          type="range"
          min={0}
          max={2}
          step={0.01}
          value={settings.masterAudioGain}
          onChange={(event) => updateSettings({ masterAudioGain: Number(event.target.value) })}
        />
      </div>
      <div className="field">
        <label htmlFor="quality">Quality</label>
        <select
          id="quality"
          value={settings.qualityPreset}
          onChange={(event) => updateSettings({ qualityPreset: event.target.value as QualityPreset })}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="frameRate">Frame rate</label>
        <select
          id="frameRate"
          value={settings.frameRate}
          onChange={(event) => updateSettings({ frameRate: Number(event.target.value) as FrameRatePreset })}
        >
          <option value={15}>15 fps</option>
          <option value={24}>24 fps</option>
          <option value={25}>25 fps</option>
          <option value={30}>30 fps</option>
          <option value={50}>50 fps</option>
          <option value={60}>60 fps</option>
        </select>
      </div>
    </section>
  );
};

export default SettingsPanel;
