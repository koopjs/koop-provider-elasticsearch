/**
 * Created by dann6343 on 6/2/2017.
 */

var express = require('express');
var appConfig = require("./appConfig.json");
var elasticsearch = require('elasticsearch');
var cors = require('cors');
var bodyParser = require("body-parser");
var https = require('https');
var http = require('http');
var fs = require("fs");
const Koop = require('koop');
var ESProvider = require('./provider/controllers');

var exports = module.exports = {};

exports.initialize = function () {

    // Initialize the elasticsearch client

    this.esClients = {};
    for (var esId in appConfig.esConnections){
        var connectInfo = appConfig.esConnections[esId];
        var hostProtocol = connectInfo.protocol;
        var hosts = [];
        for (var i=0; i < connectInfo.hosts.length; i++){
            var host = hostProtocol + connectInfo.hosts[i];
            if(connectInfo.port) {
                host = host + ":" + connectInfo.port;
            }

            if (connectInfo.userName && connectInfo.password) {
                var hostJson = {
                    host: connectInfo.hosts[i],
                    auth: connectInfo.userName + ":" + connectInfo.password,
                    protocol: hostProtocol.split(":")[0],
                    port: connectInfo.port,
                    path: connectInfo.path
                };
                console.log(hostJson);
                hosts.push(hostJson);
            } else {
                console.log(host);
                hosts.push(host);
            }
        }

        // optional security
        var esKey = connectInfo.key;
        var esCert = connectInfo.cert;
        var pfx = connectInfo.pfx;
        var passphrase = connectInfo.passphrase;

        if (null != pfx){
            pfx = fs.readFileSync(pfx);
        }

        if (null != esKey){
            esKey = fs.readFileSync(esKey);
        }

        if (null != esCert){
            esCert = fs.readFileSync(esCert);
        }

        var esClient = new elasticsearch.Client({
            hosts: hosts,
            log: 'error',
            requestTimeout: 900000,
            keepAlive: false,
            ssl: {
                key: esKey,
                cert: esCert,
                pfx: pfx,
                passphrase: passphrase
            }
        });
        this.esClients[connectInfo.id] = esClient;
    }


    this.appConfig = appConfig;

    // Init express
    this.express = express();

    // Plugin our cors middleware
    this.express.use(cors());

    // for parsing application/json
    this.express.use(bodyParser.json({limit: '50mb'}));
    this.express.use(bodyParser.urlencoded({limit: '50mb', extended: true}));

    // register koop at /koop
    this.koop = new Koop();
    // All output plugins must be registered before any providers are registered
    // this.koop.register(FeatureServer);
    this.koop.register(ESProvider);
    this.koop.controllers.es.model.init(this.esClients, this.appConfig);
    this.express.use('/koop', this.koop.server);



    if(appConfig.appInfo.protocol == "https") {
        // Spin up the https server
        https.createServer({
            key: fs.readFileSync('./key.pem'),
            cert: fs.readFileSync('./cert.pem')
        }, this.express).listen(appConfig.appInfo.listenPort);
    } else {
        http.createServer(this.express).listen(appConfig.appInfo.listenPort);
    }


};

exports.getESClients = function() {
    return this.esClients;
};

exports.getExpress = function() {
    return this.express;
};

exports.getAppConfig = function() {
    return this.appConfig;
};