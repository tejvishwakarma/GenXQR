import { Link } from "react-router-dom"
import { ArrowLeft, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Shown in place of a page whose main action the caller's role in the selected
 * team workspace does not allow (useWorkspace().can). The server enforces the
 * same rule; this only avoids handing someone a form that will 403.
 */
export function RoleBlockedNotice({ action }: { action: "create" | "edit" }) {
  return (
    <div className="max-w-lg mx-auto text-center py-16 px-6 animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center mx-auto mb-6">
        <Lock size={26} className="text-zinc-500 dark:text-zinc-400" />
      </div>
      <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">
        Your role in this workspace can't {action} QR codes
      </h2>
      <p className="text-zinc-500 text-sm mb-8">
        Ask the workspace owner or an admin to change your role, or switch to your own workspace.
      </p>
      <Link to="/app/dashboard">
        <Button variant="outline">
          <ArrowLeft size={14} /> Back to dashboard
        </Button>
      </Link>
    </div>
  )
}
