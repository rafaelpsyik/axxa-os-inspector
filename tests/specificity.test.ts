import { describe, it, expect } from "vitest";
import {
	computeSpecificity,
	specificityScore,
	formatSpecificity,
} from "../src/utils/specificity";

describe("computeSpecificity", () => {
	it("counts ids, classes and types per the cascade", () => {
		expect(computeSpecificity("div")).toEqual([0, 0, 0, 1]);
		expect(computeSpecificity("#main")).toEqual([0, 1, 0, 0]);
		expect(computeSpecificity(".status-bar.mod-root")).toEqual([0, 0, 2, 0]);
		expect(computeSpecificity("#main .item > a:hover")).toEqual([0, 1, 2, 1]);
	});

	it("treats attribute and pseudo-class selectors as class-level", () => {
		expect(computeSpecificity('a[href="x"]:focus')).toEqual([0, 0, 2, 1]);
	});

	it("ignores the universal selector", () => {
		expect(computeSpecificity("*")).toEqual([0, 0, 0, 0]);
	});

	it("ranks higher specificity above lower", () => {
		const a = specificityScore(computeSpecificity("#id"));
		const b = specificityScore(computeSpecificity(".cls.cls2.cls3"));
		expect(a).toBeGreaterThan(b);
	});

	it("formats tuples for display", () => {
		expect(formatSpecificity([0, 1, 2, 1])).toBe("(0,1,2,1)");
	});
});
