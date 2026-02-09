export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const signal = AbortSignal.timeout(ms)
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      signal.addEventListener("abort", () => {
        reject(new Error(`Operation timed out after ${ms}ms`))
      })
    }),
  ])
}
