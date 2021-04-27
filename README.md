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

### Geohash aggregation
If you use an ElasticSearch Index with a geo_point shape field you can enable geo hash aggregation.  This will show up 
as a separate sub-layer in the feature service.

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
          "aggregations": [
            {"name": "geohash"}
          ],
          "maxResults": 1000
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
          "aggregations": [],
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
          "aggregations": [],
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
* `geometryField` is the full location of the geometry
* `geometryType` can be geo_point, Point, MultiPoint, Polyline, MultiLineString, Polygon and MultiPolygon
* `reversePolygons` if the stored polygons do not follow the right-hand rule setting this to true will fix this. 
Polygons that do not follow the right-hand rule will not be displayed as feature services without setting this to true.
* `returnFields` includes all fields that will be returned by the feature service
* `dateFields` includes any return fields that should be treated as dates
* `idField` if the index includes a field that can be treated as the OBJECTID field, this should be set
* `aggregations` any aggregations to use as sub-layers.  Currently only `geohash` is valid and only for `geo_point` indices.
* `maxResults` the maximum features returned from a single request
* `shapeIndex` if the service will join to a shapeIndex for geometry list the name of the index (defined in 
`shapeIndices`) and the joinField from this index.

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
