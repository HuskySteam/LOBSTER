const MAX_PENDING_RESOLVERS = 10_000
const MAX_QUEUE_SIZE = 100_000

class FastQueue<T> {
  private items: T[] = []
  private head = 0

  get length() {
    return this.items.length - this.head
  }

  push(item: T) {
    this.items.push(item)
  }

  shift(): T | undefined {
    if (this.head >= this.items.length) return
    const value = this.items[this.head]
    this.head++

    // Periodically compact to keep memory bounded while retaining O(1) dequeues.
    if (this.head > 64 && this.head * 2 >= this.items.length) {
      this.items = this.items.slice(this.head)
      this.head = 0
    }

    return value
  }
}

export class AsyncQueue<T> implements AsyncIterable<T> {
  private queue = new FastQueue<T>()
  private resolvers = new FastQueue<(value: T) => void>()

  push(item: T) {
    const resolve = this.resolvers.shift()
    if (resolve) {
      resolve(item)
      return
    }
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      throw new Error(`AsyncQueue: queue size limit reached (${MAX_QUEUE_SIZE})`)
    }
    this.queue.push(item)
  }

  async next(): Promise<T> {
    if (this.queue.length > 0) return this.queue.shift()!
    if (this.resolvers.length >= MAX_PENDING_RESOLVERS) {
      throw new Error(`AsyncQueue: pending resolvers limit reached (${MAX_PENDING_RESOLVERS})`)
    }
    return new Promise((resolve) => this.resolvers.push(resolve))
  }

  async *[Symbol.asyncIterator]() {
    while (true) yield await this.next()
  }
}

export async function work<T>(concurrency: number, items: T[], fn: (item: T) => Promise<void>) {
  if (concurrency <= 0 || items.length === 0) return
  const workerCount = Math.min(concurrency, items.length)
  let nextIndex = 0

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const index = nextIndex++
        if (index >= items.length) return
        await fn(items[index]!)
      }
    }),
  )
}
