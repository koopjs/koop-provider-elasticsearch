const geohash = require('ngeohash');
const proj4 = require('proj4');
const proj = proj4('GOOGLE', 'WGS84');

class GeohashUtil{

    constructor(boundingBox) {
        this.bbox = null;
        this.precision = 1;
        if (boundingBox) {
            this.bbox = {};
            if (undefined !== boundingBox.spatialReference && boundingBox.spatialReference.wkid === 102100) {
                var topLeft = proj.forward([boundingBox.xmin, boundingBox.ymax]);
                var bottomRight = proj.forward([boundingBox.xmax, boundingBox.ymin]);
                this.bbox.xmin = topLeft[0];
                this.bbox.ymax = topLeft[1];
                this.bbox.xmax = bottomRight[0];
                this.bbox.ymin = bottomRight[1];
            } else {
                this.bbox = boundingBox;
            }
            this._calculateGeohashPrecision();
        }
    }

    fitBoundingBoxToHashes(){
        let hashes = this._getHashesForBoundingBox();
        let hashbbox = {
            ymin: 90.0,
            ymax: -90.0,
            xmin: 180.0,
            xmax: -180.0
        };
        let newbbox = false;

        for(let i=0; i<hashes.length; i++){
            let hash = hashes[i];

            if(this._isHashInBounds(hash)){
                newbbox = true;
                hashbbox = this._updateBoundingBoxByHash(hash, hashbbox);
            }
        }

        if(newbbox){
            this.bbox = hashbbox;
        }
    }

    _updateBoundingBoxByHash(hash, bbox){
        let hashBbox = geohash.decode_bbox(hash);
        bbox.ymin = hashBbox[0] < bbox.ymin ? hashBbox[0] : bbox.ymin;
        bbox.xmin = hashBbox[1] < bbox.xmin ? hashBbox[1] : bbox.xmin;
        bbox.ymax = hashBbox[2] > bbox.ymax ? hashBbox[2] : bbox.ymax;
        bbox.xmax = hashBbox[3] > bbox.xmax ? hashBbox[3] : bbox.xmax;
        return bbox;
    }

    _getHashesForBoundingBox() {
        return geohash.bboxes(this.bbox.ymin, this.bbox.xmin, this.bbox.ymax, this.bbox.xmax, this.precision);
    }

    _isHashInBounds(hash) {
        let latlon = geohash.decode(hash);
        return (this.bbox.ymin <= latlon.latitude && this.bbox.ymax >= latlon.latitude &&
        this.bbox.xmin <= latlon.longitude && this.bbox.xmax >= latlon.longitude);
    }

    _calculateGeohashPrecision() {
        this.precision = 1;
        if (this.bbox){

            var latDistanceKM = (this.bbox.ymax - this.bbox.ymin) * 111;
            var tenthDistance = latDistanceKM / 15;

            if(tenthDistance <= 0.00477){
                this.precision = 9;
            } else if(tenthDistance <= 0.0191){
                this.precision = 8;
            } else if(tenthDistance <= 0.153){
                this.precision = 7;
            } else if (tenthDistance <= 0.61){
                this.precision = 6;
            } else if (tenthDistance <= 4.9){
                this.precision = 5;
            } else if (tenthDistance <= 19.5){
                this.precision = 4;
            } else if (tenthDistance <= 156){
                this.precision = 3;
            } else if (tenthDistance <= 625){
                this.precision = 2;
            }
            // console.log(`${this.precision} Hash Level`)
        }
    }
}

module.exports = GeohashUtil;