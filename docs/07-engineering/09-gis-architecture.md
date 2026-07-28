# GIS Architecture

| Field | Value |
|---|---|
| Document ID | ENG-09 |
| Owner | Geospatial engineering lead |
| Status | REFERENCE MODEL |
| Current demo | AWS Terrarium external raster terrain plus bundled vectors; Terrarium is real external data but not surveyed bathymetry or decision-grade terrain |
| Production target | Governed horizontal/vertical CRS, datum transformations, terrain/bathymetry, indexing and reproducible spatial products |
| Domain review | GIS/geodesy, surveying, hydraulics, remote sensing and local data custodians |
| Authoritative dependencies | [Entity model](../01-domain-model/01-entity-model.md), [observation model](../01-domain-model/03-observation-model.md), [hydraulic model](05-hydraulic-model.md), [demo evidence](../../DATA_AND_METHODS.md) |

## Purpose and scope

Define spatial authority for rasters, vectors, tiles, meshes and transformations used by science and visualization. A visually plausible terrain surface does not establish channel-bed, levee, asset or legal-boundary accuracy.

## Scientific and implementation status

Terrarium retrieval/display is `IMPLEMENTED` as external-raster use. Production CRS/datum registries, surveyed geometry and reproducible mesh products are `PLANNED`; local vertical datum and transformation choices are `REQUIRES DOMAIN REVIEW`.

## Inputs

DEM/DSM, surveyed cross-sections/bathymetry, hydrography, buildings, roads, population surfaces, shelters, administrative/assets/exposure vectors, imagery, tile services, geoid/datum grids, no-data masks, accuracy metadata and source/licensing/version records.

## Outputs

Normalized geospatial datasets, terrain/bed surfaces, indexes, tiles/COGs, vector/GeoParquet layers, solver meshes, render meshes and transformation/lineage reports with accuracy and no-data semantics.

## Dependencies and allowed dependency direction

Data Pipeline supplies governed source versions; GIS supplies spatial products to Hydrology, River Network, Hydraulic, Digital Twin and Visualization. Render simplification cannot become solver terrain without a separately verified scientific product path.

## Accepted alternatives and recommended method

| Method | Advantages | Principal limitations | Computational cost | Implementation complexity | Suitable use cases |
|---|---|---|---|---|---|
| Global/open DEM raster | Broad coverage, low acquisition cost and reproducible basin-scale baseline | Vertical error, vegetation/buildings and absent bathymetry limit local hydraulic use | Low | Low | Basin orientation, catchment screening and low-fidelity terrain context |
| Airborne LiDAR bare-earth DTM | High point density and defensible local terrain accuracy with independent checkpoints | Acquisition/licensing cost, classification effort and no reliable bed return through turbid water | High preprocessing; moderate query | High | Urban micro-topography, levees and floodplain detail in surveyed windows |
| Surveyed cross-sections and bathymetry | Directly constrains channel conveyance and submerged geometry | Sparse between sections, field-access cost and survey-date dependence | Low to medium preprocessing | High field and QA complexity | 1D channels, 1D/2D coupling and reservoir/river beds |
| Photogrammetric DSM/mesh | Rapid surface capture and useful visual/asset geometry | Vegetation/building surface is not a bare-earth DTM; water and occlusion create gaps | High preprocessing | High | Rendering, change detection and exposed terrain where ground classification is supportable |
| Hydrologically conditioned raster analysis | Efficient slope, aspect, flow direction, accumulation, watershed and network extraction | Results depend on DEM error and conditioning choices; culverts/bridges require explicit treatment | Medium | Medium | Catchment delineation, drainage screening and mesh preparation |
| Constrained TIN or variable-resolution solver mesh | Preserves breaklines/structures and concentrates cells where decisions need detail | Mesh generation, quality control and reproducibility are more demanding than a uniform raster | Medium to high | High | Hydraulic solvers, complex boundaries and multiresolution terrain delivery |

Use native rasters/vectors for archival authority, COG/tiles for scalable access, spatial databases/indexes for query, and purpose-built solver/render meshes. Recommend explicit per-dataset horizontal CRS plus vertical datum, transformation pipelines with known grid/version, and separate DEM, bathymetry and display-terrain products.

## Governing equations and implementation form

Implement coordinate/datum transformations using registered CRS operations and versioned grids; elevation decoding such as Terrarium is a format transform, not an accuracy upgrade. Reprojection/resampling declares kernel and no-data policy. Mesh derivation preserves breaklines/structures and records interpolation/error.

## Variables, units, parameters and bounds

Coordinates [m or degrees with CRS], elevation/depth [m with vertical datum/sign convention], resolution [m or angular], positional/vertical uncertainty [m], tile zoom, no-data sentinel/mask, resampling kernel, mesh tolerance [m] and index bounds. Mixed datums/axis orders are invalid until transformed.

## Data structures and serialization

`SpatialDataset`, `CRSDefinition`, `VerticalDatum`, `TransformPipeline`, `RasterLayer`, `VectorLayer`, `TileSet`, `SolverMesh`, `RenderMesh`, `SpatialIndex` and `AccuracyReport` carry source hash, extent, resolution, no-data, provenance, license/access and validity.

Buildings, roads, population and shelters each use a governed layer record containing source and provenance, observation/publication timestamp and validity interval, horizontal CRS and any vertical datum, spatial resolution or feature scale, stated positional/thematic accuracy, explicit no-data/unknown semantics and immutable version. Every version builds or references a spatial index. Point-in-polygon, nearest-feature, intersection, routing-access and zonal population queries declare boundary inclusion, distance CRS, no-data behavior and returned layer version; results must be reproducible for identical versioned inputs.

## Update cadence and triggering events

Regenerate derived products when source bytes, transform grids, CRS/datum decisions, clipping, resampling or mesh configuration change. Building, road, population and shelter layers update only on a new governed source/version or corrected validity interval; dependent indexes and cached queries are invalidated atomically. Tile cache expiry alone cannot change a governed dataset version.

## Spatial and temporal resolution

Retain source resolution and temporal validity. Select solver/display resolution by feature scale and measured error, not zoom-level aesthetics. Bathymetry and changing channels/assets have distinct survey/effective dates.

## Complexity and resource use

Raster work scales with pixels/tiles; vector operations with features/intersections; mesh generation with constraints/elements; indexing trades storage for query cost. Budgets are targets until measured on named extents/data/hardware.

## Initialization, warm-up and boundary conditions

Validate readable source, CRS, vertical datum, extent, axis order, units, no-data and transform availability before use. Clip/pad boundaries explicitly; missing bathymetry remains no-data or an `ASSUMED` surface with uncertainty.

## Calibration method and observations

GIS transformations are verified, not hydrologically calibrated. Terrain bias/corrections require independent survey/control points; mesh roughness belongs to Hydraulic calibration and cannot compensate silently for elevation error.

## Validation metrics, datasets and acceptance thresholds

Compare independent control/survey points using horizontal/vertical residuals, raster/mesh error distributions, hydrographic connectivity and feature omission/commission. Thresholds depend on use and require survey/hydraulic review; none are claimed met.

## Verification tests and invariants

Test known coordinate/datum fixtures, round-trip tolerance, axis order, tile seams, no-data preservation, raster bounds/resolution, vector validity, spatial-index equivalence, mesh watertight/connectivity properties and reproducible hashes. Reprojection tests include edge/no-data cases.

## Visualization derived from measurable state

Rendering uses a documented render mesh/tiles derived from governed data. Vertical exaggeration, hillshade and color are display metadata. Terrarium is labelled external terrain; it must not be presented as `MEASURED` bathymetry, surveyed levees or decision-grade elevation.

## Assumptions and limitations

DEM represents surface/terrain according to its product, not river bed beneath water. AWS Terrarium provenance does not supply local survey accuracy. Datum/grid availability, vegetation/buildings, temporal change and licensing may limit use.

## Failure detection, degraded behavior and recovery

Detect missing/unknown CRS or datum, transform-grid failure, invalid geometry, no-data leakage, resolution mismatch, tile corruption, mesh defects, stale exposure validity, failed indexes and non-reproducible queries. Quarantine the affected building, road, population or shelter layer and suppress dependent exposure/access/shelter results; a labelled older or coarser layer may support orientation only, never current decision counts or routes. Recover by rebuilding the layer and index from governed source/config and publishing a new version.

## Future extensions and scientific prerequisites

Survey integration, bathymetric assimilation, change detection, 3D Tiles and uncertainty-aware mesh refinement require data rights, datum control, accuracy evidence and domain review.

## Implementation evidence and traceability

Every product links source hashes, CRS/datum/transform versions, commands/configuration, accuracy report and consumers. [DATA_AND_METHODS](../../DATA_AND_METHODS.md) is the authority for current Terrarium/demo claims.

## Next

Map governed physical state onto GPU resources in the [3D Rendering Pipeline](10-3d-rendering-pipeline.md).
