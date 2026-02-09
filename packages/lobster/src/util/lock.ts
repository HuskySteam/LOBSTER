import { Log } from "./log"

export namespace Lock {
  const log = Log.create({ service: "lock" })
  const locks = new Map<
    string,
    {
      readers: number
      writer: boolean
      waitingReaders: (() => void)[]
      waitingWriters: (() => void)[]
    }
  >()

  function get(key: string) {
    if (!locks.has(key)) {
      locks.set(key, {
        readers: 0,
        writer: false,
        waitingReaders: [],
        waitingWriters: [],
      })
    }
    return locks.get(key)!
  }

  function process(key: string) {
    const lock = locks.get(key)
    if (!lock) {
      log.debug("process called for missing lock", { key })
      return
    }
    if (lock.writer || lock.readers > 0) return

    // Prioritize writers to prevent starvation
    if (lock.waitingWriters.length > 0) {
      const nextWriter = lock.waitingWriters.shift()!
      nextWriter()
      return
    }

    // Wake up all waiting readers
    while (lock.waitingReaders.length > 0) {
      const nextReader = lock.waitingReaders.shift()!
      nextReader()
    }

    // Clean up empty locks
    if (lock.readers === 0 && !lock.writer && lock.waitingReaders.length === 0 && lock.waitingWriters.length === 0) {
      locks.delete(key)
    }
  }

  const DEFAULT_TIMEOUT = 30_000

  export async function read(key: string, timeout = DEFAULT_TIMEOUT): Promise<Disposable> {
    const lock = get(key)

    return new Promise((resolve, reject) => {
      const dispose: Disposable = {
        [Symbol.dispose]: () => {
          lock.readers--
          process(key)
        },
      }

      if (!lock.writer && lock.waitingWriters.length === 0) {
        lock.readers++
        resolve(dispose)
        return
      }

      const timer = setTimeout(() => {
        const idx = lock.waitingReaders.indexOf(cb)
        if (idx !== -1) lock.waitingReaders.splice(idx, 1)
        reject(new Error(`Lock.read timed out after ${timeout}ms for key "${key}"`))
      }, timeout)

      const cb = () => {
        clearTimeout(timer)
        lock.readers++
        resolve(dispose)
      }
      lock.waitingReaders.push(cb)
    })
  }

  export async function write(key: string, timeout = DEFAULT_TIMEOUT): Promise<Disposable> {
    const lock = get(key)

    return new Promise((resolve, reject) => {
      const dispose: Disposable = {
        [Symbol.dispose]: () => {
          lock.writer = false
          process(key)
        },
      }

      if (!lock.writer && lock.readers === 0) {
        lock.writer = true
        resolve(dispose)
        return
      }

      const timer = setTimeout(() => {
        const idx = lock.waitingWriters.indexOf(cb)
        if (idx !== -1) lock.waitingWriters.splice(idx, 1)
        reject(new Error(`Lock.write timed out after ${timeout}ms for key "${key}"`))
      }, timeout)

      const cb = () => {
        clearTimeout(timer)
        lock.writer = true
        resolve(dispose)
      }
      lock.waitingWriters.push(cb)
    })
  }
}
