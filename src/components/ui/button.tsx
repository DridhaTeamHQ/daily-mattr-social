import { Slot } from "@radix-ui/react-slot";
import { Loader2 } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "quiet";
type Size = "sm" | "md" | "lg" | "icon";

/**
 * `pressable` gives primary/danger a solid bottom edge that collapses on
 * click. Ghost and quiet stay flat — a whole page of depressible surfaces
 * reads as noise, so only the things worth pressing get the treatment.
 */
const VARIANTS: Record<Variant, string> = {
  primary:
    "pressable [--pressable-edge:var(--color-brand-press)] bg-brand text-white hover:bg-brand-hover",
  secondary:
    "pressable [--pressable-edge:var(--color-line-strong)] bg-surface text-ink border border-line hover:bg-canvas-sunk",
  ghost: "text-ink-soft hover:bg-canvas-sunk hover:text-ink",
  danger:
    "pressable [--pressable-edge:#991b1b] bg-bad text-white hover:brightness-105",
  quiet: "bg-brand-tint text-brand-press hover:bg-brand-line/60",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3.5 text-[13px] gap-1.5 rounded-sm",
  md: "h-11 px-5 text-[14.5px] gap-2 rounded-sm",
  lg: "h-13 px-7 text-[16px] gap-2 rounded-md",
  icon: "h-10 w-10 rounded-sm",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      asChild = false,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        ref={ref}
        // `asChild` renders a Link/anchor, which has no disabled attribute.
        disabled={asChild ? undefined : disabled || loading}
        className={cn(
          "inline-flex items-center justify-center font-semibold whitespace-nowrap",
          "transition-[background-color,color,filter] duration-150 ease-out",
          "disabled:pointer-events-none disabled:opacity-50",
          "[&_svg]:size-4.5 [&_svg]:shrink-0",
          VARIANTS[variant],
          SIZES[size],
          className,
        )}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="animate-spin" aria-hidden />
            <span className="sr-only">Working…</span>
            {size !== "icon" && children}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";
