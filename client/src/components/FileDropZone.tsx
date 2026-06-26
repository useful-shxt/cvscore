/**
 * Multi-image drop zone — clickable/droppable upload area supporting up to N screenshots.
 */
import { useRef, useState } from "react";

export interface FileDropZoneProps {
  files: File[];
  onChange: (files: File[]) => void;
  maxFiles?: number;
  maxSizeMb?: number;
  accept?: string;
}

export function FileDropZone({ files, onChange, maxFiles = 4, maxSizeMb = 5, accept = "image/png,image/jpeg,image/webp" }: FileDropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (incoming: File[]) => {
    const valid = incoming.filter((f) => f.size <= maxSizeMb * 1024 * 1024);
    onChange([...files, ...valid].slice(0, maxFiles));
  };

  const removeFile = (index: number) => onChange(files.filter((_, i) => i !== index));

  if (files.length === 0) {
    return (
      <div
        className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${dragOver ? "border-blue-500 bg-blue-500/5" : "border-[#2A3558] hover:border-blue-500/40 bg-[#1A2340]/40"}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(Array.from(e.dataTransfer.files)); }}
        onClick={() => inputRef.current?.click()}
      >
        <div className="space-y-2">
          <div className="w-10 h-10 rounded-xl bg-[#2A3558] flex items-center justify-center mx-auto">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-[#8895B3]">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-white">Drop screenshots here or tap to upload</p>
          <p className="text-xs text-[#8895B3]">PNG, JPG, WebP · up to {maxFiles} images · {maxSizeMb} MB each</p>
        </div>
        <input ref={inputRef} type="file" accept={accept} multiple className="sr-only" onChange={(e) => { if (e.target.files) addFiles(Array.from(e.target.files)); e.target.value = ""; }} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        {files.map((file, i) => (
          <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-[#2A3558] bg-[#1A2340] flex-shrink-0">
            <img src={URL.createObjectURL(file)} alt={`Screenshot ${i + 1}`} className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => removeFile(i)}
              className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 text-white text-[10px] flex items-center justify-center hover:bg-red-500/80 transition-colors leading-none"
            >
              ✕
            </button>
          </div>
        ))}
        {files.length < maxFiles && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-20 h-20 rounded-lg border-2 border-dashed border-[#2A3558] hover:border-blue-500/40 bg-[#1A2340]/40 flex flex-col items-center justify-center gap-1 text-[#8895B3] hover:text-white transition-colors flex-shrink-0"
          >
            <span className="text-lg leading-none">+</span>
            <span className="text-[10px]">Add more</span>
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept={accept} multiple className="sr-only" onChange={(e) => { if (e.target.files) addFiles(Array.from(e.target.files)); e.target.value = ""; }} />
    </div>
  );
}
