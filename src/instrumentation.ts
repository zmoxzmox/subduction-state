export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.DISABLE_WARMUP !== "1") {
    // defer so the server starts serving before any upstream fetch
    setTimeout(() => {
      void import("@/data/warmup")
        .then((m) => m.warmBackground())
        .catch(() => undefined);
    }, 4_000);
  }
}
