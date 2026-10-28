import React, { useEffect, useRef, useState } from "react";
import type { YouTubeChatMessage, YouTubeChatResult } from "../../shared/types";

const YouTubeLiveChat: React.FC<{ chatId?: string; account?: string | null }> = ({ chatId, account }) => {
  const [open, setOpen] = useState(false), [messages, setMessages] = useState<YouTubeChatMessage[]>([]);
  const [draft, setDraft] = useState(""), [message, setMessage] = useState<string | null>(null), [sending, setSending] = useState(false);
  const [retry, setRetry] = useState(0), [offline, setOffline] = useState(false);
  const sendingRef = useRef(false);
  const activeChat = useRef(chatId);
  activeChat.current = chatId;
  useEffect(() => { setDraft(""); setMessage(null); setMessages([]); }, [chatId]);
  useEffect(() => {
    if (!open || !chatId) return;
    let cancelled = false, timer = 0, pageToken: string | undefined;
    setMessages([]); setMessage(null); setOffline(false);
    const read = async () => {
      const result = await window.dualcast.readYouTubeChat(chatId, pageToken).catch((): YouTubeChatResult => ({ ok: false, message: "Chat connection failed. Reopen chat to retry." }));
      if (cancelled) return;
      if (!result.ok) { setMessage(result.message || "Chat is unavailable."); return; }
      pageToken = result.nextPageToken;
      setMessages(current => Array.from(new Map([...current, ...(result.messages ?? [])].map(item => [item.id, item])).values()).slice(-150));
      setOffline(result.offline === true);
      if (result.offline) setMessage("This live chat has ended.");
      else timer = window.setTimeout(read, result.pollingIntervalMillis ?? 10000);
    };
    void read();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [open, chatId, retry]);
  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!chatId || !draft.trim() || sendingRef.current || offline) return;
    sendingRef.current = true; setSending(true); setMessage(null);
    const submittedChat = chatId;
    try {
      const result = await window.dualcast.sendYouTubeChat(chatId, draft);
      if (activeChat.current !== submittedChat) return;
      if (result.ok) { setDraft(""); setMessage("Message sent. It will appear when chat refreshes."); }
      else setMessage(result.message || "Message was not sent.");
    } catch { if (activeChat.current === submittedChat) setMessage("Message could not be confirmed. Check chat before sending it again."); }
    finally { sendingRef.current = false; setSending(false); }
  };
  return <div className="youtube-live-chat">
    <button type="button" className="btn btn-outline btn-compact youtube-chat-toggle" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? "Close live chat" : "Open YouTube live chat"}</button>
    {open ? <div className="field">
      {!chatId ? <p>Live chat is not available yet. Start a chat-enabled broadcast and check the connected YouTube account.</p> : <>
        <span className="field-help">Chatting as {account || "the connected YouTube account"}. Updates while this panel is open.</span>
        <div className="youtube-chat-messages" role="log" aria-label="YouTube live chat" aria-live="polite">
          {messages.length ? messages.map(item => <p key={item.id}><strong>{item.author}: </strong>{item.text}</p>) : <p>No messages received yet.</p>}
        </div>
        <form className="youtube-chat-composer" onSubmit={send}>
          <label className="youtube-chat-input">Chat message<textarea aria-label="YouTube chat message" placeholder="Write a message to your viewers…" value={draft} maxLength={200} rows={3} disabled={sending || offline} onChange={event => setDraft(event.target.value)} /></label>
          <span className="field-help youtube-chat-count">{draft.length}/200 characters</span>
          <div className="youtube-chat-actions">
            <button type="button" className="btn btn-outline btn-compact" onClick={() => setRetry(value => value+1)} disabled={sending}>Reconnect chat</button>
            <button type="submit" className="btn btn-primary btn-compact" disabled={sending || offline || !draft.trim()}>{sending ? "Sending…" : "Send to YouTube"}</button>
          </div>
        </form>
      </>}
      {message ? <p role="status">{message}</p> : null}
    </div> : null}
  </div>;
};
export default YouTubeLiveChat;
