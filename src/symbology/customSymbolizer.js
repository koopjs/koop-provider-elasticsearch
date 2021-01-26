class CustomSymbolizer {
    name = "Override";
    description = "Replace with Symbolizer Description";
    tileBuffer = 0;

    constructor() {
    }

    vtStyle() {
        return undefined;
    }

    symbolize(feature, scale=1){
        return feature;
    }

}

module.exports = CustomSymbolizer;