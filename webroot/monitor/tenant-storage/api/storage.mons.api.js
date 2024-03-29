/*
 * Copyright (c) 2013 Juniper Networks, Inc. All rights reserved.
 */

var storageApi= require('../../../common/api/storage.api.constants');


var   commonUtils = require(process.mainModule.exports["corePath"] +
                    '/src/serverroot/utils/common.utils'),
    global = require(process.mainModule.exports["corePath"] + '/src/serverroot/common/global'),
    config = require(process.mainModule.exports["corePath"] + '/config/config.global.js'),
    logutils = require(process.mainModule.exports["corePath"] + '/src/serverroot/utils/log.utils'),
    stMonUtils= require('../../../common/api/utils/storage.utils'),
    storageRest= require('../../../common/api/storage.rest.api'),
    storageUtils= require('../../../common/api/utils/storage.utils'),
    async = require('async'),
    jsonPath = require('JSONPath').eval,
    util = require('util'),
    expireTime= storageApi.expireTimeSecs,
    storageMonsApi = module.exports;

var redis = require("redis"),
    redisServerPort = (config.redis_server_port) ? config.redis_server_port : global.DFLT_REDIS_SERVER_PORT,
    redisServerIP = (config.redis_server_ip) ? config.redis_server_ip : global.DFLT_REDIS_SERVER_IP,
    redisClient = redis.createClient(redisServerPort, redisServerIP);

function getMonitorSummary(req, res, appData){
     urlMonStatus = storageApi.url.status;
    redisClient.get(urlMonStatus, function(error, cachedJSONStr) {
        if (error || cachedJSONStr == null) {
            storageRest.apiGet(urlMonStatus, appData, function (error, resultJSON) {
                if(!error && (resultJSON)) {
                    var resultJSON = parseMonitorSummary(resultJSON);
                    if(!resultJSON) {
                        resultJSON = [];
                    }
                    redisClient.setex(urlMonStatus+"/monitor/summary", expireTime, JSON.stringify(resultJSON));
                    commonUtils.handleJSONResponse(null, res, resultJSON);
                } else {
                    commonUtils.handleJSONResponse(error, res, null);
                }
            });
        } else {
            commonUtils.handleJSONResponse(null, res, JSON.parse(cachedJSONStr));
        }
    });
}

function parseMonitorSummary(resultJSON){
    return consolidateMonitors(resultJSON);;
}

function getMonitorDetails(req, res, appData){
    var mon_name = req.param('name');
    url = storageApi.url.status;
    storageRest.apiGet(url, appData,function (error, resultJSON) {
        if(!error && (resultJSON)) {
            var resultJSON = parseMonitorDetails(mon_name,resultJSON);
            commonUtils.handleJSONResponse(null, res, resultJSON);
        } else {
            commonUtils.handleJSONResponse(error, res, null);
        }
    });   
}

function parseMonitorDetails(name, resultJSON){
    resultJSON = consolidateMonitors(resultJSON);
    var monDetails = jsonPath(resultJSON, "$..monitors[?(@.name=='"+name+"')]")[0];
    var monJSON = {};
        monJSON['monitor_details'] = monDetails;
    return monJSON;
}



function consolidateMonitors(resultJSON){
    var emptyObj = {};  
        var monJSON = {};
        var monitor = jsonPath(resultJSON, "$..mons");
         if(monitor.length >2){
             var status= jsonPath(resultJSON, "$..overall_status")[0];
                var monitors = monitor[0];
                monitors.merge(monitor[2]);
                
                var jsonstr = JSON.stringify(monitor[1]);
                var new_jsonstr = jsonstr.replace(/health/g, "act_health");
                monitor[1] = JSON.parse(new_jsonstr);

                monitors.merge(monitor[1]);
                monitors['act_health'] = jsonPath(monitor[1], "$..health")[0];
                monJSON['overall_status'] = status;
                monJSON['monitors'] = monitors;

                return monJSON;
         }

     return emptyObj;
}

function getStorageDiskFlowSeries (req, res, appData) {
    var sampleCnt = req.query['sampleCnt'];
    if(typeof sampleCnt == "undefined"){
        sampleCnt =10;
    }else if(isNaN(sampleCnt)){
        sampleCnt =10;
    }

    var minsSince = req.query['minsSince'];
    if(typeof minsSince == "undefined"){
        minsSince =30;
    }else if(isNaN(minsSince)){
        minsSince =30;
    }

    var endTime = req.query['endTime'];
    if(typeof endTime == "undefined"){
        endTime ='now';
    }

    var source = req.query['hostName'];
    var diskName= req.query['diskName'];
    var name = source +":"+diskName;

    var tableName, whereClause,
        selectArr = ["T", "name", "info_stats.reads", "info_stats.writes", "info_stats.read_kbytes","info_stats.write_kbytes" ];

    tableName = 'StatTable.ComputeStorageDisk.info_stats';
    selectArr.push("info_stats.uuid");
    selectArr.push("info_stats.disk_name");
    selectArr.push("info_stats.iops");
    selectArr.push("info_stats.bw");
    whereClause = [
        {'Source':source},
        {'name':name}
    ];

    whereClause = stMonUtils.formatAndClause(whereClause);
    var timeObj = stMonUtils.createTimeQueryJsonObj(minsSince, endTime);
    var timeGran = stMonUtils.getTimeGranByTimeSlice(timeObj, sampleCnt);
    var queryJSON = stMonUtils.formatQueryStringWithWhereClause(tableName, whereClause, selectArr, timeObj, true);
    delete queryJSON['limit'];
    delete queryJSON['dir'];
    var selectEleCnt = queryJSON['select_fields'].length;
    queryJSON['select_fields'].splice(selectEleCnt - 1, 1);
    stMonUtils.executeQueryString(queryJSON,
        commonUtils.doEnsureExecution(function(err, resultJSON)  {

            resultJSON= formatFlowSeriesForDiskStats(resultJSON, timeObj, timeGran);
            commonUtils.handleJSONResponse(err, res, resultJSON);
        }, global.DEFAULT_MIDDLEWARE_API_TIMEOUT));

}


function formatFlowSeriesForDiskStats(storageFlowSeriesData, timeObj, timeGran)
{
    var len = 0, secTime;
    var resultJSON = {};
    if(storageFlowSeriesData != undefined && storageFlowSeriesData['value']!= undefined && storageFlowSeriesData['value'].length > 0) {
        try {
            resultJSON['summary'] = {};
            secTime = Math.floor(timeObj['start_time'] / 1000);
            resultJSON['summary']['start_time'] = new Date(secTime);

            secTime = Math.floor(timeObj['end_time'] / 1000);
            resultJSON['summary']['end_time'] = new Date(secTime);
            resultJSON['summary']['timeGran_microsecs'] = Math.floor(timeGran) * global.MILLISEC_IN_SEC * global.MICROSECS_IN_MILL;
            resultJSON['summary']['name'] = storageFlowSeriesData['value'][0]['name'];
            resultJSON['summary']['uuid'] = storageFlowSeriesData['value'][0]['info_stats.uuid'];
            resultJSON['summary']['disk_name'] = storageFlowSeriesData['value'][0]['info_stats.disk_name'];
            resultJSON['flow-series'] = formatDiskSeriesLoadXMLData(storageFlowSeriesData);
            return resultJSON;
        } catch (e) {
            logutils.logger.error("In formatFlowSeriesForDiskStats(): JSON Parse error: " + e);
            return null;
        }
    }
}

function formatDiskSeriesLoadXMLData (resultJSON)
{
    var results = [];
    var counter = 0, secTime;
    try {
        resultJSON = resultJSON['value'];
        counter = resultJSON.length;
        for (var i = 0; i < counter; i++) {
            results[i] = {};
            secTime = Math.floor(resultJSON[i]['T'] / 1000);
            results[i]['date']= new Date(secTime);
            results[i]['MessageTS'] = resultJSON[i]['T'];
            results[i]['reads'] = resultJSON[i]['info_stats.reads'];
            results[i]['writes'] = resultJSON[i]['info_stats.writes'];
            results[i]['reads_kbytes'] = resultJSON[i]['info_stats.read_kbytes'];
            results[i]['writes_kbytes'] = resultJSON[i]['info_stats.write_kbytes'];
            results[i]['iops'] = resultJSON[i]['info_stats.iops'];
            results[i]['bw'] = resultJSON[i]['info_stats.bw'];

        }
        return results;
    } catch (e) {
        logutils.logger.error("In formatDiskSeriesLoadXMLData(): JSON Parse error: " + e);
        return null;
    }
}


/* List all public functions */
exports.getMonitorSummary = getMonitorSummary;
exports.getMonitorDetails = getMonitorDetails;
exports.consolidateMonitors=consolidateMonitors;
exports.getStorageDiskFlowSeries=getStorageDiskFlowSeries;




