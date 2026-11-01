const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const value = typeof input === "string" || input instanceof URL
    ? input : input.url;
  const url = new URL(value);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!local || !["http:", "https:"].includes(url.protocol)) {
    throw new Error("CI: external fetch blocked");
  }
  return originalFetch(input, options);
};
