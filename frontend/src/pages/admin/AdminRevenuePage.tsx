import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import AdminPagination from "@/components/admin/AdminPagination"
import { fetchAdminRevenue } from "@/lib/api"

const statusBadge: Record<string, string> = {
  paid:    "bg-emerald-500/20 text-emerald-400",
  failed:  "bg-red-500/20 text-red-400",
  pending: "bg-amber-500/20 text-amber-400",
}

export default function AdminRevenuePage() {
  const [page, setPage] = useState(1)

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "revenue", page],
    queryFn: () => fetchAdminRevenue(page, 20),
  })

  const rev = data?.data
  const meta = data?.meta

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Revenue</h1>
        <p className="text-zinc-500 text-sm">MRR / ARR and invoice history</p>
      </div>

      {/* KPI cards */}
      {rev && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <p className="text-zinc-500 text-xs uppercase tracking-widest font-medium mb-1">Monthly Recurring Revenue</p>
            <p className="text-3xl font-bold text-white">₹{rev.mrr.toLocaleString()}</p>
            <p className="text-zinc-500 text-xs mt-1">Normalised across billing cycles</p>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
            <p className="text-zinc-500 text-xs uppercase tracking-widest font-medium mb-1">Annual Recurring Revenue</p>
            <p className="text-3xl font-bold text-white">₹{rev.arr.toLocaleString()}</p>
            <p className="text-zinc-500 text-xs mt-1">MRR × 12</p>
          </div>
        </div>
      )}

      {/* Invoices */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-red-400 animate-spin" /></div>
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-300">All Invoices</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left text-zinc-500 font-medium px-5 py-3">Date</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3">User</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3">Plan</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3">Cycle</th>
                  <th className="text-right text-zinc-500 font-medium px-4 py-3">Amount</th>
                  <th className="text-left text-zinc-500 font-medium px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {rev?.invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                    <td className="px-5 py-3 text-zinc-400 text-xs whitespace-nowrap">
                      {new Date(inv.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-zinc-300 text-xs">{inv.user.name}</div>
                      <div className="text-zinc-500 text-xs">{inv.user.email}</div>
                    </td>
                    <td className="px-4 py-3 text-zinc-300 text-xs">{inv.planName}</td>
                    <td className="px-4 py-3 text-zinc-400 text-xs capitalize">{inv.billingCycle}</td>
                    <td className="px-4 py-3 text-right font-medium text-white text-xs">
                      {inv.currency} {(inv.amount / 100).toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${statusBadge[inv.status] ?? ""}`}>
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {rev?.invoices.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-12 text-center text-zinc-500">No invoices yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {meta && (
            <AdminPagination
              page={page}
              totalPages={meta.pages}
              total={meta.total}
              pageSize={20}
              onPageChange={setPage}
            />
          )}
        </div>
      )}
    </div>
  )
}
