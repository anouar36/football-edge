"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ImagePlus, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Num } from "@/components/app/num";
import { useT } from "@/lib/i18n/client";
import { rich } from "@/lib/i18n/rich";
import { priceCheck } from "@/lib/model/value";
import { cn, ltr, pct } from "@/lib/utils";

const TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;
// Bigger files are re-encoded here first: Vercel rejects request bodies over 4.5 MB,
// and Claude rejects images over 5 MB once they are base64 encoded.
const SHRINK_ABOVE = 3.5 * 1024 * 1024;

type Status = "SUGGESTED" | "PLACED";

interface Read {
  provider: { name: string; model: string };
  bookmaker: string | null;
  home: string | null;
  away: string | null;
  warning: "teams_mismatch" | null;
  markets: { key: string; rawLabel: string; odds: number }[];
  unpriced: number;
}

/** Error codes from the odds-image and picks routes, mapped to dictionary keys. */
const ERRORS = {
  no_file: "noFile",
  bad_type: "badType",
  too_large: "tooLarge",
  not_found: "notFound",
  no_prediction: "noPrediction",
  started: "started",
  settled: "settled",
  no_value: "noValue",
  bad_request: "badOdds",
} as const;

async function shrink(file: File): Promise<Blob> {
  if (file.size <= SHRINK_ABOVE) return file;
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 2560 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.9));
}

/**
 * Upload, drop or paste a screenshot of a bookmaker: the AI reads its odds, and each
 * market is priced against the model. Every price stays editable before it is saved
 * as a pick. Labels in `options` arrive translated.
 */
export function OddsFromImage({
  matchId,
  options,
  bankroll,
  kellyFraction,
  maxStakePct,
  currency,
  canSave,
}: {
  matchId: string;
  options: { key: string; label: string; p: number }[];
  bankroll: number;
  kellyFraction: number;
  maxStakePct: number;
  currency: string;
  /** False once the match has started: odds can be compared but not saved. */
  canSave: boolean;
}) {
  const { t } = useT();
  const tt = t.oddsImage;
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [read, setRead] = useState<Read | null>(null);
  const [odds, setOdds] = useState<Record<string, string>>({});
  const [saveAs, setSaveAs] = useState<Status>("SUGGESTED");
  const [saving, setSaving] = useState<string | null>(null);
  // key -> "odds|status" last saved, so editing either one allows saving again
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const errorText = (body: { error?: string; provider?: string; keyEnv?: string } | null) => {
    if (body?.error === "no_key") return tt.errors.noKey(body.provider ?? "", body.keyEnv ?? "");
    if (body?.error === "read_failed") return tt.errors.readFailed(body.provider ?? "");
    const k = ERRORS[body?.error as keyof typeof ERRORS];
    return k ? tt.errors[k] : tt.errors.generic;
  };

  async function readImage(file: File) {
    if (!TYPES.includes(file.type)) return setError(tt.errors.badType);
    if (file.size > MAX_BYTES) return setError(tt.errors.tooLarge);
    request.current?.abort();
    const ctrl = new AbortController();
    request.current = ctrl;
    setPreview(URL.createObjectURL(file));
    setError(null);
    setRead(null);
    setSaved({});
    setRowError({});
    setReading(true);
    try {
      const blob = await shrink(file);
      const form = new FormData();
      form.append("image", blob, blob === file ? file.name : "screenshot.jpg");
      const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/odds-image`, { method: "POST", body: form, signal: ctrl.signal });
      const body = await res.json().catch(() => null);
      if (ctrl.signal.aborted) return;
      if (!res.ok) return setError(errorText(body));
      const r = body as Read;
      setRead(r);
      setOdds(Object.fromEntries(r.markets.map((m) => [m.key, String(m.odds)])));
    } catch {
      if (!ctrl.signal.aborted) setError(tt.errors.generic);
    } finally {
      if (!ctrl.signal.aborted) setReading(false);
    }
  }

  // The paste listener is registered once; it calls the latest readImage through this ref.
  const readLatest = useRef(readImage);
  readLatest.current = readImage;
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (!file) return;
      e.preventDefault();
      readLatest.current(file);
    };
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("paste", onPaste);
      request.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  async function save(key: string) {
    setSaving(key);
    setRowError((r) => ({ ...r, [key]: "" }));
    const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/picks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, odds: Number(odds[key]), status: saveAs }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => null) : null;
    setSaving(null);
    if (!res?.ok) return setRowError((r) => ({ ...r, [key]: errorText(body) }));
    setSaved((s) => ({ ...s, [key]: `${odds[key]}|${saveAs}` }));
    router.refresh();
  }

  const rules = { bankroll, kellyFraction, maxStakePct };
  const rows = (read?.markets ?? []).flatMap((m) => {
    const opt = options.find((o) => o.key === m.key);
    if (!opt) return [];
    const o = Number(odds[m.key]);
    const valid = o > 1 && o < 1000;
    return [{ ...m, opt, valid, r: valid ? priceCheck(opt.p, o, rules) : null }];
  });
  const bdi = (s: string) => <bdi className="font-medium text-foreground">{s}</bdi>;

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) readImage(file);
        }}
        className={cn("flex items-center gap-3 rounded-lg border border-dashed p-3 transition-colors", dragging && "border-foreground bg-secondary")}
      >
        {preview ? (
          <a href={preview} target="_blank" rel="noreferrer" className="shrink-0" title={tt.preview}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt={tt.preview} className="h-20 w-16 rounded-md border bg-secondary object-cover object-top" />
          </a>
        ) : (
          <div className="flex h-20 w-16 shrink-0 items-center justify-center rounded-md bg-secondary">
            <ImagePlus className="h-5 w-5 text-muted-foreground" strokeWidth={1.6} />
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
          <p className="text-xs text-muted-foreground">
            {dragging ? tt.dropNow : rich(tt.dropHint, { keys: <kbd dir="ltr" className="rounded border bg-card px-1 font-sans text-[10px]">Ctrl+V / ⌘V</kbd> })}
          </p>
          <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
            <Upload />
            {preview ? tt.replace : tt.upload}
          </Button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept={TYPES.join(",")}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) readImage(file);
          }}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">{tt.formats}</p>

      {reading && (
        <div role="status" className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2.5 text-xs">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          <span className="font-medium">{tt.reading}</span>
          <span className="text-muted-foreground">{tt.readingHint}</span>
        </div>
      )}
      {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}

      {read && (
        <>
          <p className="text-xs text-muted-foreground">
            {rich(tt.readBy, { provider: read.provider.name, model: <bdi dir="ltr">{read.provider.model}</bdi> })}
            {read.bookmaker && <> · {rich(tt.bookmaker, { name: bdi(read.bookmaker) })}</>}
            {read.home && read.away && <> · {rich(tt.inImage, { home: bdi(read.home), away: bdi(read.away) })}</>}
          </p>
          {read.warning && (
            <p className="flex gap-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{read.home && read.away ? rich(tt.mismatch, { home: <bdi>{read.home}</bdi>, away: <bdi>{read.away}</bdi> }) : tt.mismatchNoNames}</span>
            </p>
          )}
          {rows.length === 0 ? (
            <p className="rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground">{tt.none}</p>
          ) : (
            <>
              {canSave ? (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-muted-foreground">{tt.saveAs}</span>
                  <div role="radiogroup" aria-label={tt.saveAs} className="inline-flex rounded-md border p-0.5">
                    {(["SUGGESTED", "PLACED"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        role="radio"
                        aria-checked={saveAs === s}
                        onClick={() => setSaveAs(s)}
                        className={cn("rounded px-2.5 py-1 transition-colors", saveAs === s ? "bg-foreground text-background" : "text-foreground/70 hover:bg-secondary")}
                      >
                        {s === "SUGGESTED" ? tt.suggested : tt.placed}
                      </button>
                    ))}
                  </div>
                  <span className="text-muted-foreground">{saveAs === "PLACED" ? tt.placedHint : tt.suggestedHint}</span>
                </div>
              ) : (
                <p className="rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground">{tt.cannotSave}</p>
              )}
              {/* Two lines per market (name and Save, then the numbers) so every column fits the narrow card and phones. */}
              <Table className="text-xs">
                <TableHeader className="[&_tr:first-child]:border-0">
                  <TableRow className="hover:bg-transparent">
                    <TableHead colSpan={5} className="h-6 px-0 text-start">{tt.cols.market}</TableHead>
                  </TableRow>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-8 pe-1.5 ps-0 text-start">{tt.cols.odds}</TableHead>
                    <TableHead className="h-8 px-1.5 text-end">{tt.cols.fair}</TableHead>
                    <TableHead className="h-8 px-1.5 text-end">{tt.cols.prob}</TableHead>
                    <TableHead className="h-8 px-1.5 text-end">{tt.cols.edge}</TableHead>
                    <TableHead className="h-8 pe-0 ps-1.5 text-end">
                      {tt.cols.stake} <Num>({currency})</Num>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                {rows.map(({ key, rawLabel, opt, valid, r }) => {
                  const isSaved = saved[key] === `${odds[key]}|${saveAs}`;
                  return (
                    <TableBody key={key} className="border-b last:border-0">
                      <TableRow className="hover:bg-transparent">
                        <th scope="rowgroup" colSpan={5} className="px-0 pb-1.5 pt-3 text-start font-normal">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-medium">{opt.label}</div>
                              {rawLabel && <div className="text-[10px] text-muted-foreground">{rich(tt.asRead, { label: <bdi>{rawLabel}</bdi> })}</div>}
                            </div>
                            {canSave &&
                              (r && r.stake > 0 ? (
                                <Button size="sm" variant={isSaved ? "secondary" : "outline"} className="h-7 shrink-0 px-2.5" disabled={saving !== null || isSaved} onClick={() => save(key)}>
                                  {saving === key ? <Loader2 className="animate-spin" /> : isSaved ? <Check /> : null}
                                  {saving === key ? tt.saving : isSaved ? tt.saved : tt.save}
                                </Button>
                              ) : (
                                r && <span className="shrink-0 py-1 text-muted-foreground">{tt.noValue}</span>
                              ))}
                          </div>
                          {rowError[key] && <p role="alert" className="mt-1 text-[10px] text-destructive">{rowError[key]}</p>}
                        </th>
                      </TableRow>
                      <TableRow className="hover:bg-transparent">
                        <TableCell className="pb-3 pe-1.5 ps-0 pt-0">
                          <Input
                            dir="ltr"
                            inputMode="decimal"
                            aria-label={tt.oddsFor(opt.label)}
                            aria-invalid={!valid}
                            value={odds[key] ?? ""}
                            onChange={(e) => setOdds((s) => ({ ...s, [key]: e.target.value.replace(",", ".") }))}
                            className={cn("h-8 w-[3.75rem] px-2 text-xs", !valid && "border-destructive focus-visible:ring-destructive")}
                          />
                        </TableCell>
                        <TableCell className="px-1.5 pb-3 pt-0 text-end"><Num>{(1 / opt.p).toFixed(2)}</Num></TableCell>
                        <TableCell className="px-1.5 pb-3 pt-0 text-end"><Num>{pct(opt.p)}</Num></TableCell>
                        <TableCell className="px-1.5 pb-3 pt-0 text-end">
                          <Num className={cn("font-semibold", r && (r.edge > 0 ? "text-success" : "text-destructive"))}>
                            {r ? `${r.edge > 0 ? "+" : ""}${pct(r.edge)}` : "—"}
                          </Num>
                        </TableCell>
                        <TableCell className="whitespace-nowrap pb-3 pe-0 ps-1.5 pt-0 text-end"><Num>{r ? r.stake.toFixed(2) : "—"}</Num></TableCell>
                      </TableRow>
                    </TableBody>
                  );
                })}
              </Table>
              <p className="text-[11px] text-muted-foreground">{tt.checkDigits}</p>
            </>
          )}
          {read.unpriced > 0 && <p className="text-[11px] text-muted-foreground">{tt.unpriced(ltr(read.unpriced))}</p>}
        </>
      )}
    </div>
  );
}
