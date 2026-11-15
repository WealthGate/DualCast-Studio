import React, { ReactNode, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

type ContextMenuProps = {
  x: number;
  y: number;
  onClose: () => void;
  children: ReactNode;
  ariaLabel?: string;
};

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, onClose, children, ariaLabel = "Context menu" }) => {
  const menu = useRef<HTMLDivElement>(null);
  const buttons = () => Array.from(menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
  useLayoutEffect(() => {
    const previous = document.activeElement;
    const element = menu.current;
    if (!element) return;
    const bounds = element.getBoundingClientRect();
    element.style.left = `${Math.max(6, Math.min(x, window.innerWidth - bounds.width - 6))}px`;
    element.style.top = `${Math.max(6, Math.min(y, window.innerHeight - bounds.height - 6))}px`;
    (element.querySelector<HTMLInputElement>("input:not(:disabled)") ?? buttons()[0])?.focus({ preventScroll: true });
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected && element.contains(document.activeElement)) previous.focus({ preventScroll: true });
    };
  }, [x, y]);
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

  return createPortal(
    <>
      <div
        className="context-menu-backdrop"
        onPointerDown={onClose}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }}
      />
      <div
        className="context-menu"
        ref={menu}
        role="menu"
        aria-label={ariaLabel}
        style={{ left: x, top: y }}
        onPointerDown={(event) => event.stopPropagation()}
        onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}
        onKeyDown={event => {
          if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
          const items = buttons();
          const index = items.findIndex(item => item === document.activeElement);
          if (index < 0) return;
          event.preventDefault();
          const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
            : (index + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length;
          items[next].focus();
        }}
      >
        {children}
      </div>
    </>, document.body
  );
};

export default ContextMenu;
