import type { BlastRadiusResponse } from "@devdigest/shared";

export type BlastDownstream = BlastRadiusResponse["blast"]["downstream"][number];
export type BlastReasonKey = NonNullable<BlastRadiusResponse["index"]["reason"]>;
