import React from "react";
export default function RowAction({ icon, label, onClick, disabled }: {
  icon: string; label: string; onClick: (event: React.MouseEvent<HTMLButtonElement>) => void; disabled?: boolean;
}) {
  return <button type="button" className="row-action" title={label} aria-label={label} disabled={disabled}
    onDoubleClick={(event) => event.stopPropagation()}
    onClick={(event) => { event.stopPropagation(); onClick(event); }}>
    {icon === "◉" || icon === "⊘" ? <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />
      {icon === "⊘" ? <path d="M3 3l18 18" /> : null}
    </svg> : <span aria-hidden="true">{icon}</span>}
  </button>;
}
