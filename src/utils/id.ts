/** Small monotonic + random id generator for events, experiments, etc. */
let counter = 0;

export function uid(prefix = "axxa"): string {
	counter = (counter + 1) % Number.MAX_SAFE_INTEGER;
	const rand = Math.random().toString(36).slice(2, 8);
	return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}-${rand}`;
}
