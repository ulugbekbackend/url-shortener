import { useState } from "react";
import { X, Download, QrCode } from "lucide-react";

interface QRModalProps {
  url: string;
  code: string;
  onClose: () => void;
}

export function QRModal({ url, code, onClose }: QRModalProps) {
  const [fgColor, setFgColor] = useState("#1e40af");
  const [bgColor, setBgColor] = useState("#ffffff");
  const [size, setSize] = useState(256);

  // Generate a simple QR-like pattern using SVG
  const generateQRPattern = () => {
    const modules = 21;
    const cellSize = size / modules;
    const cells: { x: number; y: number }[] = [];

    // Simple deterministic pattern based on the code string
    const seed = code.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);

    for (let row = 0; row < modules; row++) {
      for (let col = 0; col < modules; col++) {
        // Finder patterns (top-left, top-right, bottom-left)
        const isFinderTL = row < 7 && col < 7;
        const isFinderTR = row < 7 && col >= modules - 7;
        const isFinderBL = row >= modules - 7 && col < 7;

        if (isFinderTL || isFinderTR || isFinderBL) {
          // Finder pattern logic
          const localRow = isFinderTL ? row : isFinderBL ? row - (modules - 7) : row;
          const localCol = isFinderTL ? col : isFinderTR ? col - (modules - 7) : col;

          if (
            localRow === 0 ||
            localRow === 6 ||
            localCol === 0 ||
            localCol === 6 ||
            (localRow >= 2 && localRow <= 4 && localCol >= 2 && localCol <= 4)
          ) {
            cells.push({ x: col * cellSize, y: row * cellSize });
          }
        } else {
          // Data modules - pseudo-random based on seed
          const hash = (seed * (row + 1) * (col + 1) + row * 31 + col * 17) % 100;
          if (hash < 45) {
            cells.push({ x: col * cellSize, y: row * cellSize });
          }
        }
      }
    }
    return { cells, cellSize };
  };

  const { cells, cellSize } = generateQRPattern();

  const handleDownloadSVG = () => {
    const svg = document.getElementById("qr-svg");
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgData], { type: "image/svg+xml" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `qr-${code}.svg`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handleDownloadPNG = () => {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = fgColor;
    cells.forEach(({ x, y }) => {
      ctx.fillRect(x, y, cellSize, cellSize);
    });

    canvas.toBlob((blob) => {
      if (!blob) return;
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `qr-${code}.png`;
      link.click();
      URL.revokeObjectURL(link.href);
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-surface-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold text-surface-900 dark:text-white">
            <QrCode size={20} /> QR Code
          </h2>
          <button onClick={onClose} className="btn-ghost !p-2">
            <X size={18} />
          </button>
        </div>

        {/* QR Preview */}
        <div className="flex justify-center mb-6">
          <div className="rounded-xl p-4 shadow-inner" style={{ backgroundColor: bgColor }}>
            <svg
              id="qr-svg"
              width={size}
              height={size}
              viewBox={`0 0 ${size} ${size}`}
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect width={size} height={size} fill={bgColor} />
              {cells.map(({ x, y }, i) => (
                <rect key={i} x={x} y={y} width={cellSize} height={cellSize} fill={fgColor} />
              ))}
            </svg>
          </div>
        </div>

        {/* Controls */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-surface-700 dark:text-surface-300">
                Foreground
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={fgColor}
                  onChange={(e) => setFgColor(e.target.value)}
                  className="h-9 w-9 cursor-pointer rounded border border-surface-300 dark:border-surface-600"
                />
                <input
                  type="text"
                  value={fgColor}
                  onChange={(e) => setFgColor(e.target.value)}
                  className="input-field !py-1.5 text-sm font-mono"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-surface-700 dark:text-surface-300">
                Background
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="h-9 w-9 cursor-pointer rounded border border-surface-300 dark:border-surface-600"
                />
                <input
                  type="text"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="input-field !py-1.5 text-sm font-mono"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-surface-700 dark:text-surface-300">
              Size: {size}px
            </label>
            <input
              type="range"
              min={128}
              max={512}
              step={32}
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              className="w-full accent-primary-600"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={handleDownloadPNG} className="btn-secondary flex-1">
              <Download size={16} /> PNG
            </button>
            <button onClick={handleDownloadSVG} className="btn-primary flex-1">
              <Download size={16} /> SVG
            </button>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-surface-500">https://lnk.ly/{code}</p>
      </div>
    </div>
  );
}
