import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** When provided, shows a clear (×) button whenever the input has a value. */
  onClear?: () => void
  /** Optional icon rendered on the left side (e.g. <Search size={16} />) */
  leftIcon?: React.ReactNode
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, onClear, leftIcon, ...props }, ref) => {
    const hasValue = props.value !== undefined
      ? String(props.value).length > 0
      : false

    const showClear = !!onClear && hasValue

    return (
      <div className="relative flex items-center w-full">
        {leftIcon && (
          <span className="pointer-events-none absolute left-3 flex items-center text-zinc-400 dark:text-zinc-500">
            {leftIcon}
          </span>
        )}
        <input
          type={type}
          className={cn(
            "flex h-10 w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2 text-sm text-zinc-900",
            "placeholder:text-zinc-400 focus-visible:outline-none focus-visible:border-violet-500",
            "focus-visible:ring-1 focus-visible:ring-violet-500/50 disabled:cursor-not-allowed",
            "disabled:opacity-50 transition-colors",
            "dark:border-zinc-800 dark:bg-zinc-900 dark:text-white dark:placeholder:text-zinc-500",
            leftIcon  ? "pl-9"  : "px-3",
            showClear ? "pr-8"  : "pr-3",
            className,
          )}
          ref={ref}
          {...props}
        />
        {showClear && (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Clear"
            onClick={onClear}
            className={cn(
              "absolute right-2.5 flex items-center justify-center",
              "w-4 h-4 rounded-full",
              "text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-200",
              "bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600",
              "transition-colors",
            )}
          >
            <X size={9} strokeWidth={2.5} />
          </button>
        )}
      </div>
    )
  },
)
Input.displayName = "Input"

export { Input }
