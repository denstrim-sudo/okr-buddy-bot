import { Crosshair } from "lucide-react";

export const Logo = () => (
  <div className="flex items-center gap-2.5">
    <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
      <Crosshair className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
    </div>
    <div className="flex items-baseline gap-1 font-bold tracking-tight">
      <span className="text-lg text-foreground">OKR</span>
      <span className="bg-gradient-primary bg-clip-text text-lg text-transparent">AIMBOT</span>
    </div>
  </div>
);
