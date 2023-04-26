# Koop Provider for Elastic Search
This provider allow Koop to fetch and transform data from an Elasticsearch instance.

# Install

From command line in the folder containing the project run:

`npm install @koopjs/provider-elasticsearch --save`

In your Koop instance, register the provider like:

```js
  const esProvider = require('@koopjs/provider-elasticsearch')
  koop.register(esProvider)
```

The latest version of this provider can be installed with the Koop CLI.  See the [Koop CLI docs](https://github.com/koopjs/koop-cli) for details on setting up a Koop instance and add providers with the CLI.

# Running
To suppress KoopJS warnings from the console output, run with an environment variable of KOOP_WARNINGS="suppress". In powershell, this will look like: $env:KOOP_WARNINGS="suppress" ; node main.js

## Command Line
`npm start`

### Sub-Layers
By default, all services only have a single layer, as defined in the index configuration. It is possible to configure
one or more sub-layers in the subLayers section of the configuration. Each of these sub layers can be a predefined
sub layer or you can create your own.


#### Basic Config File Structure
The following is a sample configuration file showing most capabilities
```json
{
  "esConnections": {
    "esNameForServiceURLs": {
      "id": "esNameForServiceURLs",
      "protocol": "http://",
      "port": 9200,
      "hosts": [
        "localhost"
      ],
      "shapeIndices": {
        "states": {
          "geometryField": "geometry",
          "geometryType": "Polygon",
          "joinField": "NAME"
        }
      },
      "indices": {
        "myService1": {
          "index": "indexName",
          "allowMultiPoint": false,
          "caching": {
            "enabled": true,
            "seconds": 600
          },
          "geometryField": "geometry.coordinates",
          "geometryType": "geo_point",
          "returnFields": [
            "lastUpdate",
            "createdAt",
            "name"
          ],
          "dateFields": [
            "lastUpdate",
            "createdAt"
          ],
          "idField": "OBJECTID",
          "subLayers": [
            {"name": "geohash"}
          ],
          "maxResults": 1000,
          "maxLayerInfoResults": 1
        },
        "tableService": {
          "index": "indexNoShape",
          "allowMultiPoint": false,
          "isTable": true,
          "returnFields": [
            "state",
            "county",
            "date"
          ],
          "dateFields": [
            "date"
          ],
          "maxResults": 1000
        },
        "joinService": {
          "index": "indexToJoin",
          "allowMultiPoint": false,
          "returnFields": [
            "date",
            "country",
            "state.name"
          ],
          "dateFields": [
            "date"
          ],
          "subLayers": [],
          "shapeIndex": {
            "name": "states",
            "joinField": "state.name"
          },
          "maxResults": 1000
        },
        "polyService": {
          "index": "polygonIndex",
          "allowMultiPoint": false,
          "geometryField": "geometry",
          "geometryType": "MultiPolygon",
          "reversePolygons": true,
          "returnFields": [
            "properties.date",
            "properties.count",
            "properties.state_name"
          ],
          "dateFields": [
            "properties.date"
          ],
          "subLayers": [],
          "maxResults": 1000
        }
      }
    }
  }
}
```

##### Configuration Options
* `shapeIndices` includes all indices that will be used for their shapes on other services. All fields are mandatory.
* `indices` this object has a property for every service to be created.  The name of the property will be the service 
name.

_Index Properties_
* `index` is the name of the ElasticSearch index
* `isTable` treat this service as a table, ignoring geometry
* `allowMultiPoint` is only important for point services and allows more than one point per feature
* `caching` allows local in-memory caching. Only use this for services that have no more documents than your _maxResults_ setting
* `geometryField` is the full location of the geometry
* `geometryType` can be geo_point, Point, MultiPoint, Polyline, MultiLineString, Polygon and MultiPolygon
* `reversePolygons` if the stored polygons do not follow the right-hand rule setting this to true will fix this. 
Polygons that do not follow the right-hand rule will not be displayed as feature services without setting this to true.
* `returnFields` includes all fields that will be returned by the feature service
* `dateFields` includes any return fields that should be treated as dates
* `idField` if the index includes a field that can be treated as the OBJECTID field, this should be set
* `subLayers` any sub-layers to be used. Provided sub layers are `geohash_aggregation` and `geotile_aggregation` but custom subLayers may be used here as well.
* `maxResults` the maximum features returned from a single request
* `maxLayerInfoResults` maximum number of features to return for a layer info request (Normally 1) _NOTE:_ Do not use this on a layer with caching enabled.
* `shapeIndex` if the service will join to a shapeIndex for geometry list the name of the index (defined in 
`shapeIndices`) and the joinField from this index.
* `vectorLayerID` the 0 based index of the subLayer to use for vector output
* `vectorStyle` an optional map-box style to use for the vector layer

#### Sub-Layer Configurations
All subLayer configurations must include a `name` to map to a registered subLayer class. Other than that an `options` object contains
any other needed information. 

* `offset` which is used by both provided subLayers is the offset value passed in by esri clients. This value is in meters and is larger for higher zoom levels.
* `aggregationFields` can be used to pass in sub-aggregations to elastic search. The fields will be added to the output for display in pop-ups and/or for use in symbology.

_GeoHash_

precision is between 1-12 for geohash.

```json
{
  "name": "geohash_aggregation",
  "options": {
    "tileConfig": [
      { "precision": 8, "offset": 16 },
      { "precision": 6, "offset": 10000 },
      { "precision": 4, "offset": 32000 },
      { "precision": 2, "offset": 640000 }
    ],
    "aggregationFields": {
      "speed_avg": {
        "avg": { "field":  "speed"}
      },
      "speed_min": {
        "min": { "field": "speed"}
      }
    }
  }
}
```

_GeoTile_

precision is between 0-29 for geotile.
```json
{
  "name": "geotile_aggregation",
  "options": {
    "tileConfig": [
      { "precision": 22, "offset": 16 },
      { "precision": 16, "offset": 10000 },
      { "precision": 10, "offset": 32000 },
      { "precision": 4, "offset": 640000 }
    ],
    "aggregationFields": {
      "speed_avg": {
        "avg": { "field":  "speed"}
      },
      "speed_min": {
        "min": { "field": "speed"}
      }
    }
  }
}
```


#### Additional Index Configurations
`mapReturnValues` is an object that can contain keys that are field names that in turn have their own keys equal to field 
values mapped to object values. Example below. `__defaultmapping` is not required.

``` js
{
    "mapReturnValues": {
        "fieldName": {
            "returnedValue1": "mappedValue",
            "__defaultmapping": "defaultValue"
        }
    }
}
```

*IN DEVELOPMENT*

`mapFieldNames` can be used to specify a different return field than what is specified within returnFields
```` json
{
    "mapFieldNames": {
        "fieldName": "mappedFieldName"
    }
}
````
