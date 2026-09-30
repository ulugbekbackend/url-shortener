import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Download, QrCode } from "lucide-react";
import { api } from "../../lib/api";
import { errorMessage } from "../../lib/http";
import { useDebouncedValue } from "../../lib/hooks";
import { displayUrl, downloadBlob } from "../../lib/utils";
import { useToastStore } from "../../stores/toastStore";
import type { Link, QrOptions } from "../../types";
import { Spinner } from "./Spinner";

interface QRModalProps {
  link: Pick<Link, "id" | "code" | "shortUrl">;
  onClose: () => void;
}

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function QRModal({ link, onClose }: QRModalProps) {
  const addToast = useToastStore((s) => s.addToast);
  const [fgColor, setFgColor] = useState("#1e40af");
  const [bgColor, setBgColor] = useState("#ffffff");
  const [scale, setScale] = useState(8);

  // Colors are typed by hand too; only ask the server once they are valid and settled
  const current = useMemo(
    () => ({ scale, dark: fgColor, light: bgColor }),
    [scale, fgColor, bgColor],
  );
  const options = useDebouncedValue<Omit<QrOptions, "format">>(current);
  const colorsValid = HEX_COLOR.test(fgColor) && HEX_COLOR.test(bgColor);

  // A data: URL needs no cleanup, unlike an object URL
  const {
    data: previewUrl,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["qr", link.id, options],
    queryFn: async () => {
      const svg = await api.links.qr(link.id, { format: "svg", ...options });
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(await svg.text())}`;
    },
    enabled: HEX_COLOR.test(options.dark ?? "") && HEX_COLOR.test(options.light ?? ""),
  });

  const download = async (format: QrOptions["format"]) => {
    try {
      const blob = await api.links.qr(link.id, { format, scale, dark: fgColor, light: bgColor });
      downloadBlob(blob, `qr-${link.code}.${format}`);
    } catch (err) {
      addToast(errorMessage(err, "Could not download the QR code"), "error");
    }
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
          <button onClick={onClose} className="btn-ghost !p-2" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* QR Preview */}
        <div className="mb-6 flex min-h-64 items-center justify-center">
          {error ? (
            <p className="text-sm text-red-600 dark:text-red-400">
              {errorMessage(error, "Could not load the QR code")}
            </p>
          ) : isLoading || !previewUrl ? (
            <Spinner />
          ) : (
            <img
              src={previewUrl}
              alt={`QR code for ${link.shortUrl}`}
              className="max-h-80 max-w-full rounded-xl shadow-inner"
            />
          )}
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
                  value={HEX_COLOR.test(fgColor) ? fgColor : "#000000"}
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
                  value={HEX_COLOR.test(bgColor) ? bgColor : "#ffffff"}
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
          {!colorsValid && (
            <p className="text-xs text-red-600 dark:text-red-400">
              Colors must be hex values like #1e40af
            </p>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-surface-700 dark:text-surface-300">
              Size: {scale}px per module
            </label>
            <input
              type="range"
              min={4}
              max={16}
              step={1}
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              className="w-full accent-primary-600"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => download("png")}
              disabled={!colorsValid}
              className="btn-secondary flex-1"
            >
              <Download size={16} /> PNG
            </button>
            <button
              onClick={() => download("svg")}
              disabled={!colorsValid}
              className="btn-primary flex-1"
            >
              <Download size={16} /> SVG
            </button>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-surface-500">{displayUrl(link.shortUrl)}</p>
      </div>
    </div>
  );
}
