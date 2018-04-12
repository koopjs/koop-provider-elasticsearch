const moment = require('moment');

class HitConverter{
    constructor(){
    }

    featureFromHit(hit, indexConfig, mapping=undefined) {
        var feature = {
            type: 'Feature',
            geometry: hit._source[indexConfig.geometryField],
            properties: {
                // highway: hit._source.highway,
                // created_user: hit._source.created_user
            }
        };


        // It appears that as long as the id doesn't contain only numbers we can pass it as a string.
        // if it does contain only numbers we must parse it.
        if(isNaN(hit._id)){
            feature.properties["OBJECTID"] = hit._id;
        } else {
            feature.properties["OBJECTID"] = parseInt(hit._id);
        }

        if(feature.geometry.type === "polygon"){
            // Koop expects a capital P and ES has lowercase
            feature.geometry.type = "Polygon";
        } else if (undefined === feature.geometry.type){
            // point
            var coords = undefined;
            if(Array.isArray(feature.geometry)){
                if(feature.geometry[0].hasOwnProperty('lon')){
                    coords = [feature.geometry[0].lon, feature.geometry[0].lat];
                } else {
                    coords = feature.geometry;
                }
            } else {
                coords = feature.geometry.split(",").map(function(coord) {
                    return parseFloat(coord);
                }).reverse();
            }
            feature.geometry = {
                type: "Point",
                coordinates: coords
            };

            // you can take this out if multi point fails...just there to give it a try
            // if(Array.isArray(feature.geometry)){
            //     if(feature.geometry.length > 1){
            //         var multiPoints = [];
            //         for(var ptIdx=0; ptIdx<feature.geometry.length; ptIdx++){
            //             multiPoints.push([feature.geometry[ptIdx].lon, feature.geometry[ptIdx].lat]);
            //         }
            //         feature.geometry = {
            //             type: "MultiPoint",
            //             coordinates: multiPoints
            //         };
            //     }
            // }
        } else if ("MultiLineString" === feature.geometry.type){
            feature.geometry.type = "LineString";
            feature.geometry.coordinates = feature.geometry.coordinates[0];
        }

        for(var i=0; i<indexConfig.returnFields.length; i++){
            feature.properties[indexConfig.returnFields[i].split('.')[0]] = hit._source[indexConfig.returnFields[i].split('.')[0]];
        }

        if(indexConfig.dateFields.length > 0 && undefined !== mapping){
            indexConfig.dateFields.forEach(field => {
                if(mapping.properties[field] !== undefined && mapping.properties[field].type === "date"){
                    if(mapping.properties[field].format === undefined){
                        try {
                            if(null !==feature.properties[field]) {
                                feature.properties[field] = moment(hit._source[field]).toDate().toISOString();
                            }
                        } catch (error){
                            console.trace("couldn't auto parse date: " + hit._source[field]);
                            // feature.properties[field] = null;
                        }
                    } else {
                        try{
                            if(null !==feature.properties[field]) {
                                feature.properties[field] = moment(hit._source[field], mapping.properties[field].format).toDate().toISOString();
                            }
                        } catch (error){
                            console.trace("couldn't parse date: " + hit._source[field]);
                            // feature.properties[field] = null;
                        }

                    }
                }

            });
        }
        return feature;
    }
}

module.exports = HitConverter;