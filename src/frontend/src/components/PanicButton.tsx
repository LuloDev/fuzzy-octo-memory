import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { triggerPanic } from '@/lib/api';

// PanicButton bypasses the Risk Engine — the one legitimate bypass
// (Constitution §VI). Requires explicit confirmation (double-click).
export function PanicButton() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('manual');
  const [feedback, setFeedback] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => triggerPanic(reason),
    onSuccess: (r) => {
      setFeedback(`Closed ${r.positionsClosed} positions, canceled ${r.ordersCanceled} orders.`);
      setConfirming(false);
      qc.invalidateQueries();
      navigate('/');
    },
    onError: (e: Error) => setFeedback(`Panic failed: ${e.message}`),
  });

  if (!confirming) {
    return (
      <button
        onClick={() => {
          setFeedback(null);
          setConfirming(true);
        }}
        className="px-4 py-2 rounded-md bg-red-600 hover:bg-red-500 text-white font-semibold text-sm shadow-sm"
      >
        🛑 PANIC
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2 items-stretch">
      <div className="text-xs text-amber-300">
        Confirm: market-closes ALL open positions now.
      </div>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="reason"
        className="px-2 py-1 text-sm rounded bg-slate-800 border border-slate-600 text-slate-100"
      />
      <div className="flex gap-2">
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="flex-1 px-3 py-1.5 rounded bg-red-700 hover:bg-red-600 text-white text-sm font-semibold disabled:opacity-50"
        >
          {mutation.isPending ? 'Flattening…' : 'Confirm PANIC'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm"
        >
          Cancel
        </button>
      </div>
      {feedback && <div className="text-xs text-slate-300">{feedback}</div>}
    </div>
  );
}