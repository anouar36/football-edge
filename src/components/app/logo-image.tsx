"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** <img> that shows `fallback` instead when the image cannot load. */
export function LogoImage({ src, alt, size, className, fallback }: { src: string; alt: string; size: number; className?: string; fallback: React.ReactNode }) {
  const ref = useRef<HTMLImageElement>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    // onError is attached at hydration, so an image that failed before that never reports it.
    const img = ref.current;
    if (img?.complete && img.naturalWidth === 0) setFailed(src);
  }, [src]);
  if (failed === src) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt={alt}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(src)}
      className={cn("shrink-0 rounded object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}
