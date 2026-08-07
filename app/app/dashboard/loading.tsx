import { Loader2 } from 'lucide-react';

export default function DashboardLoading() {
  return (
    <div className="flex flex-1 items-center justify-center py-24">
      <Loader2 className="w-8 h-8 text-rtb-teal animate-spin" />
    </div>
  );
}
