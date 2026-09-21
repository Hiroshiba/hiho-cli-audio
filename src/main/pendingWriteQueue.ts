/** 書き込みを順に実行し、直近の結果を保持するキュー */
export class PendingWriteQueue {
  private continuation: Promise<void> = Promise.resolve()
  private latestWrite: Promise<void> = Promise.resolve()

  /** 書き込みをキューに追加する */
  enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const queuedOperation = this.continuation.then(operation)
    this.latestWrite = queuedOperation.then(() => undefined)
    this.continuation = this.latestWrite.then(
      () => undefined,
      () => undefined
    )
    return queuedOperation
  }

  /** 直近の書き込み結果を確認する */
  async flush(): Promise<void> {
    await this.latestWrite
  }

  /** 書き込み結果にかかわらずキューが空になるまで待つ */
  async waitForWrites(): Promise<void> {
    await this.continuation
  }
}
