import { test, expect } from "vitest";
import { hello } from "../src/index.ts";

test("hello", () => {
	expect(hello).toBe("world");
});
