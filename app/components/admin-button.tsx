import Link from "next/link";
import type { MouseEventHandler, ReactNode } from "react";
import styles from "./admin-button.module.css";

export type AdminButtonVariant = "primary" | "secondary" | "destructive";

/**
 * The single shared admin action button.
 *
 * Renders a `<button>` by default, or a Next.js `<Link>` when `href` is given.
 * Styling is deliberately limited to the three admin treatments (primary,
 * secondary, destructive) so every admin surface stays visually consistent.
 * `active` reuses the primary treatment for segmented controls and filters.
 */
export function AdminButton({
  variant = "secondary",
  size = "md",
  active = false,
  href,
  type = "button",
  className,
  children,
  onClick,
  disabled,
  title,
  "aria-label": ariaLabel,
}: {
  variant?: AdminButtonVariant;
  size?: "md" | "sm";
  active?: boolean;
  href?: string;
  type?: "button" | "submit" | "reset";
  className?: string;
  children: ReactNode;
  onClick?: MouseEventHandler<HTMLElement>;
  disabled?: boolean;
  title?: string;
  "aria-label"?: string;
}) {
  const classes = [styles.button, styles[variant], size === "sm" ? styles.sm : "", active ? styles.active : "", className]
    .filter(Boolean)
    .join(" ");

  if (href) {
    return (
      <Link href={href} className={classes} title={title} aria-label={ariaLabel}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} className={classes} onClick={onClick} disabled={disabled} title={title} aria-label={ariaLabel}>
      {children}
    </button>
  );
}
