import { Slot } from "@radix-ui/react-slot";
import { Loader2 } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "quiet" | "outline-blue" | "brand";
type Size = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-ink hover:brightness-95 shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98]",
  secondary: "bg-gray-100 text-ink hover:bg-gray-200 transition-transform hover:scale-[1.02] active:scale-[0.98]",
  danger: "bg-bad text-white hover:brightness-110 transition-transform hover:scale-[1.02] active:scale-[0.98]",
  quiet: "bg-poll text-ink hover:brightness-105 transition-transform hover:scale-[1.02] active:scale-[0.98]",
  ghost:
    "border border-transparent text-ink-soft hover:bg-gray-100 hover:text-ink transition-colors",
  "outline-blue":
    "border border-blue-200 text-blue-600 bg-white hover:bg-blue-50 transition-colors shadow-sm",
  brand: "bg-blue-600 text-white hover:bg-blue-700 transition-transform hover:scale-[1.02] active:scale-[0.98]",
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
