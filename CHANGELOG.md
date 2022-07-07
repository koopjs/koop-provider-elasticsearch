# Change Log
All notable changes to this project will be documented in this file.
This project adheres to [Semantic Versioning](http://semver.org/).

## Unreleased
### Added 
* Support for geohex_aggregation on Elastic Clusters with a hex aggregation license

## [3.3.5] - 04-21-2022
### Fixed
* Set supportsPagination to false since it is not supported

## [3.3.4] - 02-03-2022
### Fixed
* Correctly handle all objectid query formats
* Correctly handle polygon geometry filter

## [3.3.3] - 01-21-2022
### Fixed
* geo_point with lat, lon properties shouldn't be returned as attributes.

## [3.3.2] - 01-20-2022
### Fixed
* allow passing templates from index config to feature layer
* handle querying by object id
* issue causing incorrect bounding boxes in some cases

## [3.3.1] - 12-13-2021
### Fixed
* Now handles geometry sent in as a string with an inSR parameter for spatial reference

## [3.3.0] - 09-29-2021
### Added
* Better field metadata based on Index mapping
* Ability for fields to be marked editable if handling editing capabilities

## [3.2.1] - 09-27-2021
### Fixed
* Aggregation sub-layers handle WGS84 requests correctly

## [3.2.0] - 09-09-2021
### Changed
* No longer auto-converts 'objectid' field to '_id' for ES queries
### Added
* Support to allow configured list of capabilities for feature service layers. This will allow a client to handle any
capability they wish.

## [3.1.0] - 07-27-2021
### Changed
* aggregations config has been changed to subLayers
### Added
* default access to geo hash and geo tile aggregation subLayers

## [3.0.0] - 06-17-2021
### Changed
* Moved to the new [@elastic/elasticsearch](https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/index.html)
  library - any customization code needs to take this into account

## [2.5.2] - 06-04-2021
### Fixed
* Now handle negative numbers in a more consistent manner
### Changed
* Allow configurable minimum offset for vector tile layers
* Allow returnFields to be passed in via query object
* Allow aggregations to specify geometryType, defaults to Polygon

## [2.5.1] - 04-27-2021
### Fixed
* Support for negative numbers in where clause is more robust
* Handle geo hash using non-standard shape field names
### Changed
* Now passing in all query parameters to custom aggregation layers

## [2.5.0] - 04-15-2021
### Added
* Support to allow for registering custom aggregations
* Support to specify which sub-layer to display for vector tiles in JSON config
* Ability to specify styling for vector tiles in JSON config
* Support for IN clause with negative numeric values
* Ignore unavailable indices when making queries instead of failing

## [2.4.0] - 04-01-2021
### Added
* Added ability to register a custom function to generate index names based on a configured pattern.

## [2.3.0] - 03-22-2021
### Changed
* Update to hit converter that allows outFields to override the return fields. Even allows non-configured fields to be returned.

## [2.2.2] - 03-12-2021
### Fixed
* Handle geo_point with lat/lon properties that is not multi-point.
* Configured buffer for vector tiles behaves more consistently

## [2.2.1] - 02-19-2021
### Fixed
* Undefined reference to `req`

## [2.2.0] - 01-26-2021
### Added
* Add custom symbolizer

## [2.1.0] - 01-21-2021
### Changed
* Updates to GeoHash Aggregation to ensure the same level for all queries at a zoom level.
* Updates to metadata to ensure compatibility with Vector Tile output

## [2.0.1] - 11-10-2020
### Changed
* Updated hit converter to make sure mapping has been defined before attempting to flatten it.

## [2.0.0] - 11-03-2020
### Changed
* Updated to follow the standard Koop Framework. The wrapper project will be maintained elsewhere.

[3.3.5]: https://github.com/koopjs/koop-provider-elasticsearch/compare/v3.3.4...v3.3.5
[3.3.4]: https://github.com/koopjs/koop-provider-elasticsearch/compare/v3.3.3...v3.3.4
[3.3.3]: https://github.com/koopjs/koop-provider-elasticsearch/compare/v3.3.2...v3.3.3
[3.3.2]: https://github.com/koopjs/koop-provider-elasticsearch/compare/v3.3.1...v3.3.2
[3.3.1]: https://github.com/koopjs/koop-provider-elasticsearch/compare/v3.3.0...v3.3.1
[3.3.0]: https://github.com/koopjs/koop-provider-elasticsearch/compare/v3.2.1...v3.3.0
[3.2.1]: https://github.com/koopjs/koop-provider-elasticsearch/compare/v3.2.0...v3.2.1
[3.2.0]: https://github.com/koopjs/koop-provider-elasticsearch/compare/v3.1.0...v3.2.0
[3.1.0]: https://github.com/koopjs/koop-provider-elasticsearch/compare/v3.0.0...v3.1.0
[3.0.0]: https://github.com/koopjs/koop-provider-elasticsearch/compare/v2.5.2...v3.0.0
[2.5.2]: https://github.com/koopjs/koop-provider-elasticsearch/compare/v2.5.1...v2.5.2
[2.5.1]: https://github.com/koopjs/koop-provider-elasticsearch/compare/v2.5.0...v2.5.1
[2.5.0]: https://github.com/koopjs/koop-provider-elasticsearch/compare/v2.4.0...v2.5.0
[2.4.0]: https://github.com/koopjs/koop-provider-elasticsearch/compare/v2.3.0...v2.4.0
[2.3.0]: https://github.com/koopjs/koop-provider-elasticsearch/compare/v2.2.2...v2.3.0
[2.2.2]: https://github.com/koopjs/koop-provider-elasticsearch/compare/v2.2.1...v2.2.2
[2.2.1]: https://github.com/koopjs/koop-provider-elasticsearch/compare/v2.2.0...v2.2.1
[2.2.0]: https://github.com/koopjs/koop-provider-elasticsearch/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/koopjs/koop-provider-elasticsearch/compare/v2.0.1...v2.1.0
[2.0.1]: https://github.com/koopjs/koop-provider-elasticsearch/compare/v2.0.0...v2.0.1
