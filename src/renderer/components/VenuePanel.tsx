import React, { useEffect, useState } from "react";
import { NetworkOutputStatus, OperatorRole } from "../../shared/types";
import { useAppStore } from "../store/useAppStore";

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

  useEffect(() => {
    window.dualcast.getNetworkOutputStatus().then(setNetworkStatus).catch(() => undefined);
  }, []);

  const handleNetworkToggle = async () => {
    setNetworkMessage(null);
    try {
      if (networkStatus.running) {
        const status = await window.dualcast.stopNetworkOutput();
        setNetworkStatus(status);
        await updateSettings({
          networkOutput: { ...settings.networkOutput, enabled: false }
        });
      } else {
        const status = await window.dualcast.startNetworkOutput({
          port: settings.networkOutput.port,
          operatorPin: settings.networkOutput.operatorPin
        });
        setNetworkStatus(status);
        await updateSettings({
          networkOutput: { ...settings.networkOutput, enabled: true }
        });
      }
    } catch (error) {
      setNetworkMessage(error instanceof Error ? error.message : "Unable to change LAN output.");
    }
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
    await navigator.clipboard.writeText(url);
    setNetworkMessage("Address copied.");
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
          Additional operators can use the LAN remote address from a phone, tablet, or laptop.
        </p>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Wireless LAN Output</h2>
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
              disabled={networkStatus.running}
            />
          </div>
          <div className="field">
            <label htmlFor="operatorPin">Operator PIN</label>
            <input
              id="operatorPin"
              value={settings.networkOutput.operatorPin}
              onChange={(event) =>
                updateSettings({
                  networkOutput: { ...settings.networkOutput, operatorPin: event.target.value }
                })
              }
              disabled={networkStatus.running}
            />
          </div>
        </div>
        <button className={networkStatus.running ? "btn btn-danger" : "btn btn-primary"} onClick={handleNetworkToggle}>
          {networkStatus.running ? "Stop LAN Hub" : "Start LAN Hub"}
        </button>
        {networkStatus.running ? (
          <div className="network-addresses">
            <h3>Program display / OBS Browser Source</h3>
            {networkStatus.programUrls.map((url) => (
              <button key={url} className="network-url" onClick={() => copyUrl(url)}>
                {url}
              </button>
            ))}
            <h3>Remote operator controls</h3>
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
          API keys remain outside normal settings. Set the named environment variable after purchasing access.
        </p>
      </section>
    </div>
  );
};

export default VenuePanel;
