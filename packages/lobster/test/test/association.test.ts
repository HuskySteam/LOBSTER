import { test, expect, describe } from "bun:test"
import { TestAssociation } from "../../src/test/association"

describe("TestAssociation.suggestion", () => {
  test("empty files returns undefined", async () => {
    const result = await TestAssociation.suggestion([])
    expect(result).toBeUndefined()
  })
})

describe("TestAssociation.findTestFile", () => {
  test("test file with .test suffix is skipped", async () => {
    const result = await TestAssociation.findTestFile("/project/src/utils.test.ts")
    expect(result).toBeUndefined()
  })

  test("test file with .spec suffix is skipped", async () => {
    const result = await TestAssociation.findTestFile("/project/src/utils.spec.ts")
    expect(result).toBeUndefined()
  })

  test("test file with _test suffix is skipped", async () => {
    const result = await TestAssociation.findTestFile("/project/src/utils_test.go")
    expect(result).toBeUndefined()
  })

  test("test file with test_ prefix is skipped", async () => {
    const result = await TestAssociation.findTestFile("/project/src/test_utils.py")
    expect(result).toBeUndefined()
  })
})
