import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";

interface ActionMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  label?: string;
}

const GAP = 4;

/**
 * A "⋮" button with a dropdown rendered in a portal, so scrolling or clipped containers
 * (like a table wrapper with overflow) never cut it off. Opens upwards when there is no
 * room below, and closes on outside click, Escape, scroll or resize.
 */
export function ActionMenu({ open, onOpenChange, children, label = "Actions" }: ActionMenuProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Place the menu once it is in the DOM and its height is known, before the browser paints
  useLayoutEffect(() => {
    const menu = menuRef.current;
    const button = buttonRef.current?.getBoundingClientRect();
    if (!open || !menu || !button) return;
    const fitsBelow = button.bottom + GAP + menu.offsetHeight <= window.innerHeight;
    menu.style.top = `${fitsBelow ? button.bottom + GAP : Math.max(GAP, button.top - GAP - menu.offsetHeight)}px`;
    menu.style.right = `${window.innerWidth - button.right}px`;
    menu.style.visibility = "visible";
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => onOpenChange(false);
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    // A fixed menu would drift away from its button, so just close it
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, onOpenChange]);

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => onOpenChange(!open)}
        className="btn-ghost !p-1.5"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreVertical size={16} />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            // Hidden until the layout effect has measured and placed it
            style={{ position: "fixed", top: 0, right: 0, visibility: "hidden" }}
            className="z-50 w-48 rounded-lg border border-surface-200 bg-white py-1 text-left shadow-lg dark:border-surface-700 dark:bg-surface-800"
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}
