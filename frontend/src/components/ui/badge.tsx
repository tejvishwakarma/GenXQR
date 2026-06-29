import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-500/30",
        secondary: "bg-zinc-100 text-zinc-600 border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700",
        destructive: "bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30",
        success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30",
        warning: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30",
        outline: "border border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
