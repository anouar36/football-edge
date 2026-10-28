"use client";
import dynamic from "next/dynamic";

// Their own chunks: the match page's first JavaScript is the page itself, then these hydrate as their
// code arrives. Still rendered on the server, so the card has its final height from the start.
export const OddsFromImage = dynamic(() => import("./odds-from-image").then((m) => m.OddsFromImage));
export const ValueCalculator = dynamic(() => import("./value-calculator").then((m) => m.ValueCalculator));
