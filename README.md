# ElasticSearch Provider
This provider is designed to connect to one or more ElasticSearch clusters and provide them as feature layers to Koop.

# Stand Alone
This project may be run in stand alone by running index.js.  It will require the addition of an appConfig.json file and optionally a cert.pem and key.pem file (for HTTPS).
```bash
npm install 
node index.js
```

## appConfig.json
The file should have the following format:
```json
{
  "appInfo": {
    "protocol": "http",
    "listenPort": 80
  },
  "esConnections": {
    "firstESCluster": {
      "id": "clusterID",
      "protocol": "http://",
      "port": 9200,
      "hosts": [
        "escluster.mynetwork.com"
      ],
      "indices": [
        {
          "index": "indexOrAliasName",
          "maxResults": 6000,
          "geometryField": "geometry",
          "geometryType": "geo_point/Point/Polyline/Polygon",
          "returnFields": [
            "fieldFromIndex", "SeenInFeatureService", "SomeDateField"
          ],
          "dateFields": [
            "pickup_date", "SomeDateField"
          ]
        }
      ]
    }
  }
}
```
You can configure multiple indices per cluster as well as multiple clusters.
### URL
Your URL should look like this in stand-alone mode:
```js
http(s)://yourmachine.com/koop/es/:clusterID/:indexOrAliasName/FeatureServer
```
Note: Currently the name you give to the cluster must match the id you give it exactly.So in the example above 'firstESCluster' and 'clusterID' would need to be the same value.

# Using in your own project
This provider can be used in your own project by pulling in the /provider folder.

You will need to provide a dictionary of elasticsearch clients and an application config object similar to the one shown above.
