import React, { ReactNode, useEffect } from "react";

type ContextMenuProps = {
  x: number;
  y: number;
  onClose: () => void;
  children: ReactNode;
  ariaLabel?: string;
};

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, onClose, children, ariaLabel = "Context menu" }) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    const handleBlur = () => onClose();
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", handleBlur);
    };
  }, [onClose]);

  const left = Math.max(6, Math.min(x, window.innerWidth - 270));
  const top = Math.max(6, Math.min(y, window.innerHeight - 360));

  return (
    <>
      <div
        className="context-menu-backdrop"
        onPointerDown={onClose}
        onContextMenu={(event) => {
          event.preventDefault();
          onClose();
        }}
      />
      <div
        className="context-menu"
        role="menu"
        aria-label={ariaLabel}
        style={{ left, top }}
        onPointerDown={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        {children}
      </div>
    </>
  );
};

export default ContextMenu;
