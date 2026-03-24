import { useCallback, useState } from "react";
import { Upload, FileText, CheckCircle } from "lucide-react";
import clsx from "clsx";

interface UploadZoneProps {
  onFileSelected: (file: File) => void;
  isLoading?: boolean;
  rowCount?: number;
}

export const UploadZone = ({ onFileSelected, isLoading, rowCount }: UploadZoneProps) => {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith(".csv")) onFileSelected(file);
    },
    [onFileSelected]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelected(file);
  };

  if (rowCount) {
    return (
      <div className="border border-win-green/30 bg-win-green/5 rounded-lg p-6 flex items-center gap-4">
        <CheckCircle className="w-8 h-8 text-win-green flex-shrink-0" />
        <div>
          <p className="font-display text-base font-bold text-white">
            CSV Loaded Successfully
          </p>
          <p className="font-body text-sm text-text-secondary">
            {rowCount.toLocaleString()} predictions parsed
          </p>
        </div>
      </div>
    );
  }

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={clsx(
        "border-2 border-dashed rounded-lg p-12 flex flex-col items-center gap-4 cursor-pointer transition-colors",
        dragOver
          ? "border-predict-blue bg-predict-blue/5"
          : "border-border hover:border-text-muted"
      )}
    >
      <input
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleChange}
      />
      {isLoading ? (
        <div className="font-display text-lg text-text-secondary animate-pulse">
          Parsing CSV...
        </div>
      ) : (
        <>
          <Upload className="w-12 h-12 text-text-muted" />
          <div className="text-center">
            <p className="font-display text-lg font-bold text-white">
              Drop your Kaggle submission CSV here
            </p>
            <p className="font-body text-sm text-text-secondary mt-1">
              or click to browse
            </p>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <FileText className="w-4 h-4 text-text-muted" />
            <p className="font-body text-xs text-text-muted">
              Expected: ID (2026_XXXX_YYYY), Pred (0.0–1.0) — ~132k rows
            </p>
          </div>
        </>
      )}
    </label>
  );
};
