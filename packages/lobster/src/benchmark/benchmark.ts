export namespace Benchmark {
  export interface Challenge {
    name: string
    description: string
    files: Record<string, string>
    test: string
  }

  export const challenges: Challenge[] = [
    {
      name: "fix-typo",
      description: "Fix the typo in the greet function so it returns 'Hello, <name>!' instead of 'Helo, <name>!'",
      files: {
        "index.ts": `export function greet(name: string): string {\n  return \`Helo, \${name}!\`\n}\n`,
      },
      test: `import { expect, test } from "bun:test"\nimport { greet } from "./index"\n\ntest("greet returns correct greeting", () => {\n  expect(greet("World")).toBe("Hello, World!")\n  expect(greet("Alice")).toBe("Hello, Alice!")\n})\n`,
    },
    {
      name: "add-error-handling",
      description:
        "Add error handling to the divide function. It should throw an Error with message 'Cannot divide by zero' when the divisor is zero.",
      files: {
        "math.ts": `export function divide(a: number, b: number): number {\n  return a / b\n}\n`,
      },
      test: `import { expect, test } from "bun:test"\nimport { divide } from "./math"\n\ntest("divide works correctly", () => {\n  expect(divide(10, 2)).toBe(5)\n  expect(divide(9, 3)).toBe(3)\n})\n\ntest("divide throws on zero divisor", () => {\n  expect(() => divide(10, 0)).toThrow("Cannot divide by zero")\n})\n`,
    },
    {
      name: "implement-function",
      description:
        "Implement the fibonacci function that returns the nth Fibonacci number (0-indexed). fibonacci(0)=0, fibonacci(1)=1, fibonacci(2)=1, fibonacci(10)=55.",
      files: {
        "fibonacci.ts": `export function fibonacci(n: number): number {\n  // TODO: implement\n  throw new Error("Not implemented")\n}\n`,
      },
      test: `import { expect, test } from "bun:test"\nimport { fibonacci } from "./fibonacci"\n\ntest("fibonacci returns correct values", () => {\n  expect(fibonacci(0)).toBe(0)\n  expect(fibonacci(1)).toBe(1)\n  expect(fibonacci(2)).toBe(1)\n  expect(fibonacci(5)).toBe(5)\n  expect(fibonacci(10)).toBe(55)\n})\n`,
    },
    {
      name: "fix-failing-test",
      description:
        "The test expects `capitalize` to capitalize the first letter of each word. Fix the implementation so all tests pass.",
      files: {
        "string.ts": `export function capitalize(str: string): string {\n  return str.charAt(0).toUpperCase() + str.slice(1)\n}\n`,
      },
      test: `import { expect, test } from "bun:test"\nimport { capitalize } from "./string"\n\ntest("capitalize single word", () => {\n  expect(capitalize("hello")).toBe("Hello")\n})\n\ntest("capitalize multiple words", () => {\n  expect(capitalize("hello world")).toBe("Hello World")\n  expect(capitalize("foo bar baz")).toBe("Foo Bar Baz")\n})\n`,
    },
    {
      name: "refactor-duplicates",
      description:
        "The code has duplicate logic for calculating area. Refactor by creating a shared `calculateArea` function used by both `rectangleArea` and `squareArea`. All tests must pass.",
      files: {
        "shapes.ts": [
          `export function rectangleArea(width: number, height: number): number {`,
          `  if (width < 0 || height < 0) throw new Error("Dimensions must be non-negative")`,
          `  return width * height`,
          `}`,
          ``,
          `export function squareArea(side: number): number {`,
          `  if (side < 0) throw new Error("Dimensions must be non-negative")`,
          `  return side * side`,
          `}`,
          ``,
        ].join("\n"),
      },
      test: `import { expect, test } from "bun:test"\nimport { rectangleArea, squareArea, calculateArea } from "./shapes"\n\ntest("rectangleArea works", () => {\n  expect(rectangleArea(3, 4)).toBe(12)\n  expect(rectangleArea(5, 2)).toBe(10)\n})\n\ntest("squareArea works", () => {\n  expect(squareArea(3)).toBe(9)\n  expect(squareArea(5)).toBe(25)\n})\n\ntest("calculateArea is exported and works", () => {\n  expect(calculateArea(3, 4)).toBe(12)\n  expect(calculateArea(5, 5)).toBe(25)\n})\n\ntest("negative dimensions throw", () => {\n  expect(() => rectangleArea(-1, 4)).toThrow("Dimensions must be non-negative")\n  expect(() => squareArea(-1)).toThrow("Dimensions must be non-negative")\n  expect(() => calculateArea(-1, 4)).toThrow("Dimensions must be non-negative")\n})\n`,
    },
  ]
}
