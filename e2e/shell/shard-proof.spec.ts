import { expect, test } from '@playwright/test'

test('should fail, so one red shard is seen to block the merge', () => {
  expect(1).toBe(2)
})
