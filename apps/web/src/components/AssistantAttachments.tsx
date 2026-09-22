import { useEffect, useRef, useState } from "react";
import { Camera, Paperclip, X, FileText } from "lucide-react";
import ui from "../../../../packages/catalog/assistant-chat-ui.json";

/* The text-only bridge cannot accept media. Selection is an explicitly local preview; neither
   file contents nor names are added to a turn. Object URLs are released when replaced or closed. */
export function AssistantAttachments() {
  const camera = useRef<HTMLInputElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [notice, setNotice] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!file || !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) { setUrl(""); return; }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  const select = (input: HTMLInputElement) => {
    const next = input.files?.[0];
    input.value = "";
    if (!next) return;
    setNotice(true);
    if (next.size > ui.attachments.limitBytes) { setError(ui.attachments.tooLarge); return; }
    setError(""); setFile(next);
  };
  return <>
    <button type="button" className="as-media as-camera" aria-label={ui.attachments.camera} title={ui.attachments.camera} onClick={() => { setNotice(true); camera.current?.click(); }}><Camera size={23} aria-hidden="true" /></button>
    <button type="button" className="as-media as-attach" aria-label={ui.attachments.file} title={ui.attachments.file} onClick={() => { setNotice(true); files.current?.click(); }}><Paperclip size={23} aria-hidden="true" /></button>
    <input ref={camera} hidden type="file" accept="image/*" capture="environment" aria-label={ui.attachments.camera} onChange={e => select(e.currentTarget)} />
    <input ref={files} hidden type="file" aria-label={ui.attachments.file} onChange={e => select(e.currentTarget)} />
    {notice && <div className="as-attachment-preview" role="status">
      <p>{ui.attachments.notice}</p>
      {error && <p role="alert">{error}</p>}
      {file && <div className="as-attachment-file">
        {url ? <img src={url} alt={ui.attachments.preview} /> : <FileText size={24} aria-hidden="true" />}
        <span>{file.name}</span>
        <button type="button" aria-label={ui.attachments.remove} onClick={() => { setFile(null); setNotice(false); setError(""); }}><X size={18} aria-hidden="true" /></button>
      </div>}
    </div>}
  </>;
}
