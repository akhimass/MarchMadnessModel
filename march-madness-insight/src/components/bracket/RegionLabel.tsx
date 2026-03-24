interface RegionLabelProps {
  region: string;
}

export const RegionLabel = ({ region }: RegionLabelProps) => (
  <div className="font-display text-xs font-bold tracking-[0.2em] uppercase text-text-muted py-3 px-1">
    {region}
  </div>
);
