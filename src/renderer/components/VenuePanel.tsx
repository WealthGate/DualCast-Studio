import React, { useEffect, useState } from "react";
import { NetworkOutputStatus, OperatorRole } from "../../shared/types";
import { useAppStore } from "../store/useAppStore";
import { normalizeRemoteUrl } from "../../shared/remoteControl";

const emptyNetworkStatus: NetworkOutputStatus = {
  running: false,
  port: 8787,
  programUrls: [],
  operatorUrls: []
};

const VenuePanel: React.FC = () => {
  const { settings, updateSettings } = useAppStore();
  const [networkStatus, setNetworkStatus] = useState<NetworkOutputStatus>(emptyNetworkStatus);
  const [networkMessage, setNetworkMessage] = useState<string | null>(null);
  const [networkBusy, setNetworkBusy] = useState(false);
  const [remoteUrlDraft, setRemoteUrlDraft] = useState(settings.networkOutput.remoteUrl ?? "");

  useEffect(() => setRemoteUrlDraft(settings.networkOutput.remoteUrl ?? ""), [settings.networkOutput.remoteUrl]);

  useEffect(() => {
    window.dualcast.getNetworkOutputStatus().then(setNetworkStatus).catch(() => undefined);
  }, []);

  const handleNetworkToggle = async () => {
    if (networkBusy) return;
    setNetworkBusy(true);
    setNetworkMessage(null);
    try {
      if (networkStatus.running) {
        const status = await window.dualcast.stopNetworkOutput();
        setNetworkStatus(status);
        await updateSettings({
          networkOutput: { ...settings.networkOutput, enabled: false }
        });
      } else {
        const remoteUrl = normalizeRemoteUrl(remoteUrlDraft);
        if (remoteUrlDraft.trim() && !remoteUrl) throw new Error("Enter a valid HTTPS remote address, such as https://studio.example.ts.net.");
        const status = await window.dualcast.startNetworkOutput({
          port: settings.networkOutput.port,
          operatorPin: settings.networkOutput.operatorPin,
          remoteUrl
        });
        setNetworkStatus(status);
        await updateSettings({
          networkOutput: { ...settings.networkOutput, enabled: true, remoteUrl }
        });
      }
    } catch (error) {
      setNetworkMessage(error instanceof Error ? error.message : "Unable to change Mobile Control.");
    } finally { setNetworkBusy(false); }
  };

  const handleSongLibraryFolder = async () => {
    const path = await window.dualcast.selectSaveDirectory();
    if (path) {
      await updateSettings({
        integrations: { ...settings.integrations, songLibraryPath: path }
      });
    }
  };

  const copyUrl = async (url: string) => {
    try { await navigator.clipboard.writeText(url); setNetworkMessage("Address copied. Share the PIN separately."); }
    catch { setNetworkMessage(`Copy this address: ${url}`); }
  };

  return (
    <div className="venue-panel-stack">
      <section className="panel">
        <div className="panel-header">
          <h2>Operator Station</h2>
          <span className="tag">{settings.operatorRole}</span>
        </div>
        <div className="field">
          <label htmlFor="stationName">Station Name</label>
          <input
            id="stationName"
            value={settings.operatorStationName}
            onChange={(event) => updateSettings({ operatorStationName: event.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="operatorRole">Operator Role</label>
          <select
            id="operatorRole"
            value={settings.operatorRole}
            onChange={(event) => updateSettings({ operatorRole: event.target.value as OperatorRole })}
          >
            <option value="director">Director</option>
            <option value="graphics">Graphics / Lyrics</option>
            <option value="audio">Audio</option>
            <option value="stream">Streaming</option>
          </select>
        </div>
        <p className="panel-note">
          Use Mobile Control from Android, iPhone, iPad, or a laptop. The remote PIN grants production control; the station role labels this desktop workspace.
        </p>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Mobile Control & LAN Output</h2>
          <span className={`status-badge ${networkStatus.running ? "success" : ""}`}>
            {networkStatus.running ? "Running" : "Stopped"}
          </span>
        </div>
        <div className="field-grid">
          <div className="field">
            <label htmlFor="networkPort">Port</label>
            <input
              id="networkPort"
              type="number"
              min={1024}
              max={65535}
              value={settings.networkOutput.port}
              onChange={(event) =>
                updateSettings({
                  networkOutput: { ...settings.networkOutput, port: Number(event.target.value) }
                })
              }
              disabled={networkStatus.running || networkBusy}
            />
          </div>
          <div className="field">
            <label htmlFor="operatorPin">Operator PIN (6–16 digits)</label>
            <input
              id="operatorPin"
              inputMode="numeric"
              autoComplete="off"
              maxLength={16}
              value={settings.networkOutput.operatorPin}
              onChange={(event) =>
                updateSettings({
                  networkOutput: { ...settings.networkOutput, operatorPin: event.target.value }
                })
              }
              disabled={networkStatus.running || networkBusy}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="remoteUrl">Private HTTPS remote address (optional)</label>
          <input id="remoteUrl" type="url" placeholder="https://studio.your-tailnet.ts.net" value={remoteUrlDraft}
            onChange={event => setRemoteUrlDraft(event.target.value)} disabled={networkStatus.running || networkBusy} />
        </div>
        <p className="panel-note">Same Wi-Fi: open a non-loopback operator address below and enter the PIN. Stop the hub to change its PIN or address. Restarting revokes all mobile sessions.</p>
        <details>
          <summary>Control from mobile data or another Wi-Fi network</summary>
          <p className="panel-note">Install Tailscale on the studio computer and mobile device, and connect both to the same private Tailscale network. On the studio computer, run:</p>
          <code>tailscale serve --bg http://127.0.0.1:{settings.networkOutput.port}</code>
          <p className="panel-note">Copy the HTTPS address it prints into the field above, then start the hub. Open that address with /operator on your phone. Keep Tailscale connected. The address must proxy the entire hub at its root. Use Tailscale Serve for private access; do not forward the hub port on your router.</p>
          <p className="panel-note">For an app icon, open the HTTPS remote in Safari and choose Share → Add to Home Screen on iPhone/iPad; choose Install app on Android. Local HTTP access works in the browser.</p>
        </details>
        <button disabled={networkBusy} className={networkStatus.running ? "btn btn-danger" : "btn btn-primary"} onClick={handleNetworkToggle}>
          {networkBusy ? "Please wait…" : networkStatus.running ? "Stop Mobile / LAN Hub" : "Start Mobile / LAN Hub"}
        </button>
        {networkStatus.running ? (
          <div className="network-addresses">
            <h3>Program display / OBS Browser Source</h3>
            {networkStatus.programUrls.map((url) => (
              <button key={url} className="network-url" onClick={() => copyUrl(url)}>
                {url}
              </button>
            ))}
            <h3>Phone & tablet remote — tap an address to copy</h3>
            {networkStatus.operatorUrls.map((url) => (
              <button key={url} className="network-url" onClick={() => copyUrl(url)}>
                {url}
              </button>
            ))}
          </div>
        ) : null}
        {networkMessage ? <div className="info-pill">{networkMessage}</div> : null}
      </section>

      <section className="panel">
        <h2>Lower-Third Output</h2>
        <div className="field-grid">
          <div className="field">
            <label htmlFor="lowerThirdHeight">Safe Height (%)</label>
            <input
              id="lowerThirdHeight"
              type="number"
              min={10}
              max={50}
              value={settings.lowerThird.heightPercent}
              onChange={(event) =>
                updateSettings({
                  lowerThird: { ...settings.lowerThird, heightPercent: Number(event.target.value) }
                })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="lowerThirdPosition">Position</label>
            <select
              id="lowerThirdPosition"
              value={settings.lowerThird.position}
              onChange={(event) =>
                updateSettings({
                  lowerThird: {
                    ...settings.lowerThird,
                    position: event.target.value as "top" | "bottom"
                  }
                })
              }
            >
              <option value="bottom">Bottom</option>
              <option value="top">Top</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="lowerThirdBackground">Output Background</label>
          <input
            id="lowerThirdBackground"
            type="color"
            value={settings.lowerThird.backgroundColor}
            onChange={(event) =>
              updateSettings({
                lowerThird: { ...settings.lowerThird, backgroundColor: event.target.value }
              })
            }
          />
        </div>
        <p className="panel-note">
          Mark a text source as “Lower Third,” then choose its dedicated display beneath Program.
        </p>
      </section>

      <section className="panel">
        <h2>Worship & Scripture Providers</h2>
        <div className="field">
          <label htmlFor="songProvider">Worship Song Library</label>
          <select
            id="songProvider"
            value={settings.integrations.songProvider}
            onChange={(event) =>
              updateSettings({
                integrations: {
                  ...settings.integrations,
                  songProvider: event.target.value as "local" | "planning-center" | "custom"
                }
              })
            }
          >
            <option value="local">Local library folder</option>
            <option value="planning-center">Planning Center adapter</option>
            <option value="custom">Custom API</option>
          </select>
        </div>
        {settings.integrations.songProvider === "local" ? (
          <div className="field">
            <label>Library Folder</label>
            <div className="field-row">
              <span className="path">{settings.integrations.songLibraryPath || "Not selected"}</span>
              <button className="btn btn-outline btn-compact" onClick={handleSongLibraryFolder}>
                Choose
              </button>
            </div>
          </div>
        ) : (
          <div className="field">
            <label htmlFor="songApiUrl">Song Provider API URL</label>
            <input
              id="songApiUrl"
              value={settings.integrations.songApiUrl}
              onChange={(event) =>
                updateSettings({
                  integrations: { ...settings.integrations, songApiUrl: event.target.value }
                })
              }
            />
          </div>
        )}
        <div className="field">
          <label htmlFor="scriptureProvider">Scripture Database</label>
          <select
            id="scriptureProvider"
            value={settings.integrations.scriptureProvider}
            onChange={(event) =>
              updateSettings({
                integrations: {
                  ...settings.integrations,
                  scriptureProvider: event.target.value as "api-bible" | "bible-api" | "custom"
                }
              })
            }
          >
            <option value="api-bible">API.Bible</option>
            <option value="bible-api">Bible API</option>
            <option value="custom">Custom licensed provider</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="scriptureUrl">Scripture API URL</label>
          <input
            id="scriptureUrl"
            value={settings.integrations.scriptureApiUrl}
            onChange={(event) =>
              updateSettings({
                integrations: { ...settings.integrations, scriptureApiUrl: event.target.value }
              })
            }
          />
        </div>
        <div className="field">
          <label htmlFor="scriptureKeyEnv">API Key Environment Variable</label>
          <input
            id="scriptureKeyEnv"
            value={settings.integrations.scriptureApiKeyEnv}
            onChange={(event) =>
              updateSettings({
                integrations: { ...settings.integrations, scriptureApiKeyEnv: event.target.value }
              })
            }
          />
        </div>
        {settings.integrations.scriptureProvider === "api-bible" ? (
          <div className="field">
            <label htmlFor="scriptureBibleId">API.Bible Bible ID</label>
            <input
              id="scriptureBibleId"
              value={settings.integrations.scriptureBibleId}
              onChange={(event) => updateSettings({ integrations: { ...settings.integrations, scriptureBibleId: event.target.value } })}
              placeholder="Translation Bible identifier"
            />
          </div>
        ) : null}
      </section>

      <section className="panel">
        <h2>AI Provider</h2>
        <div className="field">
          <label htmlFor="aiProvider">Provider</label>
          <select
            id="aiProvider"
            value={settings.integrations.aiProvider}
            onChange={(event) =>
              updateSettings({
                integrations: {
                  ...settings.integrations,
                  aiProvider: event.target.value as "disabled" | "openai" | "azure-openai" | "custom"
                }
              })
            }
          >
            <option value="disabled">Disabled</option>
            <option value="openai">OpenAI</option>
            <option value="azure-openai">Azure OpenAI</option>
            <option value="custom">Custom compatible API</option>
          </select>
        </div>
        <div className="field-grid">
          <div className="field">
            <label htmlFor="aiModel">Model</label>
            <input
              id="aiModel"
              value={settings.integrations.aiModel}
              onChange={(event) =>
                updateSettings({
                  integrations: { ...settings.integrations, aiModel: event.target.value }
                })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="aiKeyEnv">API Key Environment Variable</label>
            <input
              id="aiKeyEnv"
              value={settings.integrations.aiApiKeyEnv}
              onChange={(event) =>
                updateSettings({
                  integrations: { ...settings.integrations, aiApiKeyEnv: event.target.value }
                })
              }
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="aiBaseUrl">API Base URL</label>
          <input
            id="aiBaseUrl"
            value={settings.integrations.aiBaseUrl}
            onChange={(event) =>
              updateSettings({
                integrations: { ...settings.integrations, aiBaseUrl: event.target.value }
              })
            }
          />
        </div>
        <div className="feature-toggle-list">
          {[
            ["aiLiveCaptions", "Live captions"],
            ["aiSermonSummary", "Sermon summaries"],
            ["aiHighlightDetection", "Highlight detection"]
          ].map(([key, label]) => (
            <label key={key} className="feature-toggle">
              <input
                type="checkbox"
                checked={Boolean(settings.integrations[key as keyof typeof settings.integrations])}
                onChange={(event) =>
                  updateSettings({
                    integrations: { ...settings.integrations, [key]: event.target.checked }
                  })
                }
                disabled={settings.integrations.aiProvider === "disabled"}
              />
              {label}
            </label>
          ))}
        </div>
        <p className="panel-note">
          Adapter settings only in this release: API keys remain outside normal settings, and the caption, summary, and highlight workflows are not active yet.
        </p>
      </section>
    </div>
  );
};

export default VenuePanel;
