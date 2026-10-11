/** Reusable skeleton shimmer components */

function Shimmer({ className }: { className: string }) {
  return (
    <div
      className={`bg-slate-200 rounded-xl animate-pulse ${className}`}
      aria-hidden="true"
    />
  );
}

export function ReportCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="h-8 bg-slate-100 animate-pulse" />
      <div className="px-3 py-3 space-y-2">
        <Shimmer className="h-3 w-3/4" />
        <Shimmer className="h-4 w-1/2" />
        <div className="flex gap-2">
          <Shimmer className="h-6 w-20" />
          <Shimmer className="h-6 w-20" />
        </div>
        <Shimmer className="h-3 w-full" />
        <Shimmer className="h-3 w-5/6" />
      </div>
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <Shimmer className="h-7 w-16 mb-1" />
      <Shimmer className="h-3 w-24" />
    </div>
  );
}

export function CheckFareSkeleton() {
  return (
    <div className="space-y-3 mt-4">
      <div className="bg-white rounded-2xl border-2 border-slate-200 p-4 space-y-4">
        <div className="flex items-start gap-3">
          <Shimmer className="w-9 h-9 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Shimmer className="h-6 w-28" />
            <Shimmer className="h-3 w-48" />
          </div>
        </div>
        <div>
          <Shimmer className="h-3 w-10 mb-1" />
          <Shimmer className="h-5 w-full rounded-full" />
          <div className="flex justify-between mt-1">
            <Shimmer className="h-3 w-16" />
            <Shimmer className="h-3 w-16" />
          </div>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-2 items-start rounded-xl border border-slate-100 px-3 py-2">
              <Shimmer className="w-4 h-4 rounded-full shrink-0 mt-0.5" />
              <Shimmer className="h-3 flex-1" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
