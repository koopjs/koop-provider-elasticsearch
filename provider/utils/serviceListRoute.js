
module.exports = function(express, appConfig) {
    express.get('/koop/es/services', function (req, res) {
        res.type('html');
        var links = getServiceInfos(req, appConfig);
        var linkText = "";
        for(var linksId=0; linksId < links.length; linksId++){
            linkText += "<p>" + links[linksId].join("<br>") + "</p>";
        }
        var html = `<html>${linkText}</html>`;
        res.send(html);
    });

    express.post('/koop/es/services', function(req, res) {
        res.type('json');
        res.send(JSON.stringify(getServiceInfos(req, appConfig)));
    });

    function getServiceInfos(req, appConfig){
        return Object.keys(appConfig.esConnections).map(function(esId){
            return appConfig.esConnections[esId].indices.map(function(index){
                return `<a href="/koop/es/${esId}/${index.index}/FeatureServer">/${esId}/${index.index}/FeatureServer</a>`;
            });

        });
    }
};