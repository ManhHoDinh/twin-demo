# Data Pipeline

| Field | Value |
|---|---|
| Document ID | ENG-08 |
| Owner | Data engineering lead |
| Status | REFERENCE MODEL |
| Current demo | Mixed bundled `SYNTHETIC` records and selected external assets with limited runtime lineage |
| Production target | Registry-driven immutable ingest, QC, normalization, lineage and reproducible L0-L4 products |
| Domain review | Data governance, hydrometeorology, GIS, model owners, cybersecurity and operations |
| Authoritative dependencies | [Observation model](../01-domain-model/03-observation-model.md), [entity model](../01-domain-model/01-entity-model.md), [scientific architecture](01-scientific-architecture.md), [document conventions](../99-appendix/document-conventions.md) |

## Purpose and scope

Acquire, preserve, quality-control, normalize, version and deliver observations, forecasts, model products and governed reference data without changing their authority. It preserves raw evidence and compatible quantity envelopes across storage and engine interfaces.

## Scientific and implementation status

Demo loading is `IMPLEMENTED` for its stated assets, but a production registry, immutable raw zone and complete lineage are `PLANNED`. Source-specific QC, datum conversions and operational gap policy are `REQUIRES DOMAIN REVIEW`.

## Inputs

Gauge/sensor `MEASURED` data, meteorological `FORECAST` products, `MODELLED` fields, governed reference records, explicitly `ASSUMED` configurations and `SYNTHETIC` demo fixtures, plus source schemas, licenses/access constraints and calibration metadata.

## Outputs

Immutable raw objects, validated normalized records, QC events, gap indicators/fills where allowed, source/version registry entries, lineage graph, run-ready snapshots and degradation status.

## Dependencies and allowed dependency direction

Sources feed the pipeline; the pipeline feeds engines and Digital Twin. Domain observation/entity models remain persistence and semantic authority. Model output cannot overwrite observations; visualization cannot backfill scientific fields; corrections create new versions linked to raw bytes.

## Accepted alternatives and recommended method

Accepted transports include files/object storage, message streams and APIs; accepted stores include object, time-series, relational/geospatial and analytical formats. Recommend immutable content-addressed raw ingest plus registry/versioned normalized products and event-driven processing. Avoid a single mutable “latest” dataset as audit authority.

## Governing equations and implementation form

No new scientific equation is introduced. Deterministic transformations implement unit conversion, datum transformation, aggregation and QC rules from versioned registries. Each normalized record preserves the canonical Domain fields `value`, `unit`, `timestamp`, `age`, `quality`, `uncertainty`, `source_ref` and `version`, plus the exact additive fields `schema_version`, `valid_time`, `issue_time`, `source_id`, `model_id`, `model_version`, `provenance`, `confidence_grade`, `uncertainty_representation`, `quality_flags`, `assumptions` and `limitations` defined in [Scientific architecture](01-scientific-architecture.md).

The mapping is lossless: `timestamp = valid_time` for a current-state projection; `age` is derived from the source observation timestamp for `MEASURED` data and from `issue_time` for `FORECAST` or `MODELLED` data. `source_ref` remains the canonical audit reference while `source_id` is the registry key. Canonical `version` identifies the governed referenced artifact, `schema_version` identifies the envelope schema, and `model_version` identifies the exact computational model. `quality_flags` supplements rather than replaces canonical `quality`; `uncertainty_representation` describes the encoding of canonical `uncertainty`; `confidence_grade` carries separately traceable reasons.

## Variables, units, parameters and bounds

Every quantity declares unit/dimension, valid time, issue time, ingest time, spatial support, CRS/vertical datum where applicable, provenance, quality and uncertainty. Bounds/QC thresholds are source- and variable-specific versions; a rejected bound is not silently clipped.

## Data structures and serialization

`SourceRegistry`, `RawObject`, `IngestEvent`, `QCEvent`, `NormalizedQuantity`, `DatasetVersion`, `LineageEdge`, `GapRecord` and `RunSnapshot` use stable IDs, hashes and schema versions. `NormalizedQuantity` serializes every canonical and additive field named above without renaming or dropping it. Formats may include Parquet/GeoParquet, JSON, COG and Zarr/NetCDF where justified; envelope compatibility is normative, format is not.

## Update cadence and triggering events

Ingest on source arrival/poll schedule. Process by event time and retain issue/ingest times; late/out-of-order records create revisions and downstream invalidation signals. A forecast issue is immutable even when superseded.

## Spatial and temporal resolution

Retain native support/resolution and record every resampling window, grid, interpolation and aggregation. Never imply finer spatial/temporal truth than the source. UTC is canonical; local display timezone is presentation metadata.

## Complexity and resource use

Ingest/QC scales with records/bytes; spatial transformations scale with cells/features; lineage scales with versions and edges. Storage/throughput/latency are targets until measured with declared retention, sources and hardware.

## Initialization, warm-up and boundary conditions

Bootstrap registries and schemas before accepting data. Backfills are separate versioned jobs. Engine snapshots freeze a consistent cutoff/watermark and explicitly declare missing/stale sources.

## Calibration method and observations

The pipeline is not calibrated as a scientific model. Sensor calibration certificates, rating curves and correction functions are versioned inputs; transformation/QC parameters are verified against reference fixtures and reviewed samples.

## Validation metrics, datasets and acceptance thresholds

Validate completeness, timeliness, duplicate rate, schema/unit/datum conformance, QC precision/recall where labelled cases exist, reconciliation to source totals and lineage reproducibility. Operational thresholds must be approved per source/service; no achieved value is claimed.

## Verification tests and invariants

Test byte preservation/hash, idempotent ingest, UTC/event/issue-time semantics, unit round trips, datum fixtures, no-data propagation, late records, duplicate/conflict handling, deterministic snapshot replay, observation/model separation and envelope losslessness.

## Visualization derived from measurable state

Data-health displays use registry/QC/lineage facts. Scientific dashboards consume normalized values and expose provenance, age, quality and uncertainty; UI interpolation cannot create stored observations.

## Assumptions and limitations

Source access, licensing, metadata and clocks may be incomplete. Automated QC detects symptoms, not guaranteed truth. Gap filling produces `MODELLED` or `ASSUMED` values, never `MEASURED`, and remains separable from original gaps.

## Failure detection, degraded behavior and recovery

Use L0-L4 degradation: L0 healthy; L1 delayed but usable; L2 partial/stale; L3 critical-source unavailable with restricted products; L4 integrity/lineage failure and publication stop. Quarantine corrupt/conflicting records, preserve raw bytes, replay idempotently after correction and issue a new dataset version.

## Future extensions and scientific prerequisites

Streaming assimilation, probabilistic QC, federated catalogs and automated reforecast require source agreements, uncertainty semantics, security review and replayable model interfaces.

## Implementation evidence and traceability

Evidence includes registry/config revisions, raw hashes, schema/QC tests, transformation lineage, dataset manifests and downstream run IDs. Current asset provenance is bounded by [DATA_AND_METHODS](../../DATA_AND_METHODS.md).

## Next

Apply CRS, datum, raster/vector and terrain rules in [GIS Architecture](09-gis-architecture.md).
