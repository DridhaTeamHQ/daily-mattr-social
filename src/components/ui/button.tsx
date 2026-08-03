import { Slot } from "@radix-ui/react-slot";
import { Loader2 } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "quiet";
type Size = "sm" | "md" | "lg" | "icon";

/**
 * Every filled variant is a LIGHT fill with BLACK text and a black border, so
 * contrast holds without checking each pairing, and so the outline reads at
 * any size. `ghost` is the one thing without a border — it exists precisely
 * for the cases where another outlined box would be noise.
 */
const VARIANTS: Record<Variant, string> = {
  primary: "pressable bg-brand text-ink hover:bg-brand-hover",
  secondary: "pressable bg-surface text-ink hover:bg-canvas-sunk",
  danger: "pressable bg-bad text-white hover:brightness-110",
  quiet: "pressable bg-poll text-ink hover:brightness-105",
  ghost:
    "border-2 border-transparent text-ink-soft hover:border-ink hover:bg-canvas-sunk hover:text-ink",
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
          "inline-flex items-center justify-center font-extrabold whitespace-nowrap",
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
