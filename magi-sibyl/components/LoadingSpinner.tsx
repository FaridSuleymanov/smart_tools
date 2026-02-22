'use client';

export default function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-16">
      <div className="relative">
        {/* Outer ring */}
        <div className="w-20 h-20 rounded-full border-2 border-cyan-500/20" />
        {/* Spinning ring */}
        <div className="absolute inset-0 w-20 h-20 rounded-full border-2 border-transparent border-t-cyan-400 animate-spin" />
        {/* Inner pulse */}
        <div className="absolute inset-3 rounded-full bg-cyan-500/10 animate-pulse" />
        {/* Center dot */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-cyan-400" />
        </div>
      </div>
      <div className="text-center">
        <p className="font-display text-sm tracking-widest text-cyan-400 animate-pulse">
          MAGI CORES ACTIVE
        </p>
        <p className="text-xs text-zinc-500 font-mono mt-1">
          Casper • Balthasar • Melchior → Sybil
        </p>
      </div>
    </div>
  );
}
