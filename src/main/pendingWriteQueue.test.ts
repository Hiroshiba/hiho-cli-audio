import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PendingWriteQueue } from './pendingWriteQueue'

test('保存成功後は保留中の書き込みを正常に完了できる', async () => {
  const queue = new PendingWriteQueue()
  const value = await queue.enqueue(async () => '保存済み')

  assert.equal(value, '保存済み')
  await queue.flush()
})

test('保存失敗は呼び出し元と flush に同じエラーを返す', async () => {
  const queue = new PendingWriteQueue()
  const error = new Error('保存に失敗しました')
  const write = queue.enqueue(async () => {
    throw error
  })

  await Promise.all([
    assert.rejects(write, (actual) => actual === error),
    assert.rejects(queue.flush(), (actual) => actual === error)
  ])
  await queue.waitForWrites()
  await assert.rejects(queue.flush(), (actual) => actual === error)
})

test('失敗後の保存が成功するとキューと flush が回復する', async () => {
  const queue = new PendingWriteQueue()
  const error = new Error('最初の保存に失敗しました')
  const operations: string[] = []
  const failedWrite = queue.enqueue(async () => {
    operations.push('失敗')
    throw error
  })
  const successfulWrite = queue.enqueue(async () => {
    operations.push('成功')
    return '保存済み'
  })

  await assert.rejects(failedWrite, (actual) => actual === error)
  assert.equal(await successfulWrite, '保存済み')
  await queue.flush()
  assert.deepEqual(operations, ['失敗', '成功'])
})
