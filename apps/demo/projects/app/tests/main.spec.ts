import { test, expect } from "vitest";
import { main } from "../src/main.ts";

test("main runs without error", () => {
	expect(() => main()).not.toThrow();
});
