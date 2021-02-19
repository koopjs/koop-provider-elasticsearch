# Change Log
All notable changes to this project will be documented in this file.
This project adheres to [Semantic Versioning](http://semver.org/).

## [2.2.1] - 02-19-2020
### Fixed
* Undefined reference to `req`

## [2.2.0] - 01-26-2020
### Added
* Add custom symbolizer

## [2.1.0] - 01-21-2020
### Changed
* Updates to GeoHash Aggregation to ensure the same level for all queries at a zoom level.
* Updates to metadata to ensure compatibility with Vector Tile output

## [2.0.1] - 11-10-2020
### Changed
* Updated hit converter to make sure mapping has been defined before attempting to flatten it.

## [2.0.0] - 11-03-2020
### Changed
* Updated to follow the standard Koop Framework. The wrapper project will be maintained elsewhere.

[2.2.1]: https://github.com/koopjs/koop-provider-elasticsearch/compare/v2.2.0...v2.1.1
[2.2.0]: https://github.com/koopjs/koop-provider-elasticsearch/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/koopjs/koop-provider-elasticsearch/compare/v2.0.1...v2.1.0
[2.0.1]: https://github.com/koopjs/koop-provider-elasticsearch/compare/v2.0.0...v2.0.1