"use client"

import { Toaster as Sonner } from "sonner"

/** Toasts no canto inferior, com as cores do tema (claro/escuro vêm dos tokens, não do sistema). */
export function Toaster() {
  return (
    <Sonner
      position="bottom-center"
      offset={{ bottom: 24 }}
      mobileOffset={{ bottom: 88 }}
      duration={6000}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius-xl, 0.75rem)",
        } as React.CSSProperties
      }
      toastOptions={{ classNames: { toast: "font-sans shadow-lg", actionButton: "!bg-primary !text-primary-foreground !font-medium" } }}
    />
  )
}
