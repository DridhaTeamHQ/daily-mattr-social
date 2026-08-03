import { Slot } from "@radix-ui/react-slot";
import { Loader2 } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "quiet";
type Size = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand text-white shadow-card hover:bg-brand-hover active:bg-brand-press",
  secondary:
    "bg-surface text-ink border border-line shadow-card hover:bg-canvas-sunk active:bg-canvas-sunk",
  ghost: "text-ink-soft hover:bg-canvas-sunk hover:text-ink",
  danger: "bg-bad text-white shadow-card hover:brightness-95 active:brightness-90",
  quiet: "bg-brand-tint text-brand-press hover:bg-brand-line/60",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-sm",
  md: "h-10 px-4 text-sm gap-2 rounded-sm",
  lg: "h-12 px-6 text-[15px] gap-2 rounded-md",
  icon: "h-9 w-9 rounded-sm",
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
          "inline-flex items-center justify-center font-medium whitespace-nowrap",
          "transition-[background-color,color,box-shadow,filter] duration-150 ease-out",
          "disabled:pointer-events-none disabled:opacity-50",
          "[&_svg]:size-4 [&_svg]:shrink-0",
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
