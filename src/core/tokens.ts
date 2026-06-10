/**
 * Service tokens for the DI container. Declared in one place so the wiring in
 * `main.ts` and any test harness share the same identities.
 */
import { ServiceToken } from "./ServiceContainer";
import type { OverlayManager } from "../engines/OverlayManager";
import type { DOMAnalysisEngine } from "../engines/DOMAnalysisEngine";
import type { CSSEngine } from "../engines/CSSEngine";
import type { InspectorEngine } from "../engines/InspectorEngine";
import type { MutationTrackingEngine } from "../engines/MutationTrackingEngine";
import type { VisualTestEngine } from "../engines/VisualTestEngine";
import type { PerformanceMonitor } from "../engines/PerformanceMonitor";
import type { PersistenceLayer } from "../engines/PersistenceLayer";
import type { ExportEngine } from "../engines/ExportEngine";
import type { ExperimentSandbox } from "../engines/ExperimentSandbox";
import type { LayoutDebugger } from "../engines/LayoutDebugger";
import type { ObsidianTopology } from "../intelligence/ObsidianTopology";

export const Tokens = {
	Topology: new ServiceToken<ObsidianTopology>("ObsidianTopology"),
	Overlay: new ServiceToken<OverlayManager>("OverlayManager"),
	Dom: new ServiceToken<DOMAnalysisEngine>("DOMAnalysisEngine"),
	Css: new ServiceToken<CSSEngine>("CSSEngine"),
	Inspector: new ServiceToken<InspectorEngine>("InspectorEngine"),
	Mutation: new ServiceToken<MutationTrackingEngine>("MutationTrackingEngine"),
	VisualTest: new ServiceToken<VisualTestEngine>("VisualTestEngine"),
	Performance: new ServiceToken<PerformanceMonitor>("PerformanceMonitor"),
	Persistence: new ServiceToken<PersistenceLayer>("PersistenceLayer"),
	Export: new ServiceToken<ExportEngine>("ExportEngine"),
	Sandbox: new ServiceToken<ExperimentSandbox>("ExperimentSandbox"),
	Layout: new ServiceToken<LayoutDebugger>("LayoutDebugger"),
} as const;
