/*
 * Copyright (c) 2014 Juniper Networks, Inc. All rights reserved.
 */

var storageGlobal = require('../../../common/js/storage.global');
var storageApi= require('../../../common/api/storage.api.constants');

var cacheApi = require(process.mainModule.exports["corePath"] +
                    '/src/serverroot/web/core/cache.api'),
    logutils = require(process.mainModule.exports["corePath"] + '/src/serverroot/utils/log.utils'),
    global = require(process.mainModule.exports["corePath"] + '/src/serverroot/common/global'),
    config = require(process.mainModule.exports["corePath"] + '/config/config.global.js'),
    logutils = require(process.mainModule.exports["corePath"] + '/src/serverroot/utils/log.utils'),
    stMonUtils= require('../../../common/api/utils/storage.utils'),
    commonUtils = require(process.mainModule.exports["corePath"] +
                        '/src/serverroot/utils/common.utils'),
    storageRest= require('../../../common/api/storage.rest.api'),
    rest = require(process.mainModule.exports["corePath"] + '/src/serverroot/common/rest.api');
    async = require('async'),
    jsonPath = require('JSONPath').eval,
    opServer = rest.getAPIServer({apiName:global.label.OPS_API_SERVER,
        server:config.analytics.server_ip,
        port:config.analytics.server_port }),
    storageDashboardApi = module.exports,
    expireTime= storageApi.expireTimeSecs;

var redis = require("redis"),
    redisServerPort = (config.redis_server_port) ? config.redis_server_port : global.DFLT_REDIS_SERVER_PORT,
    redisServerIP = (config.redis_server_ip) ? config.redis_server_ip : global.DFLT_REDIS_SERVER_IP,
    redisClient = redis.createClient(redisServerPort, redisServerIP);



function getStorageClusterStatus(req, res ){
    url = storageApi.url.status;//"/status";
    logutils.logger.debug("get data:"+url);
    cacheApi.queueDataFromCacheOrSendRequest(req, res, storageGlobal.STR_JOB_TYPE_CACHE,
        storageGlobal.STR_STORAGE_TYPE_CLUSTER, url,
                                             0, 1, 0, -1, true, null);
}

function getStorageClusterHealthStatus(req, res, appData){
    var urlHealth = storageApi.url.health;//"/health";
    redisClient.get(urlHealth, function(error, cachedJSONStr) {
        if (error || cachedJSONStr == null) {
            storageRest.apiGet(urlHealth, appData, function (error, resultJSON) {
                if(!error && (resultJSON)) {
                    var resultJSON = parseStorageHealthStatusData(resultJSON);
                    if(!resultJSON) {
                        resultJSON = [];
                    }
                    redisClient.setex(urlHealth, expireTime, JSON.stringify(resultJSON));
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

function parseStorageHealthStatusData(resultJSON){
    var emptyObj = {};  
        var healthJSON = {};
        var status = jsonPath(resultJSON, "$..status");
        var summary= jsonPath(resultJSON, "$..summary");
        var details= jsonPath(resultJSON, "$..detail");
        if (status.length > 0 ) {
            var temp = new Object();
            temp['last_updated_time']= new Date();
            temp["overall_status"] = status[0];
            temp["details"] = details[0];
            temp["summary"] = summary[0];
            healthJSON['cluster_status']= temp;
            return healthJSON;
        }
        return emptyObj;
}

function getStorageClusterDFStatus(req, res, appData){
    urlDF = storageApi.url.df;
    redisClient.get(urlDF, function(error, cachedJSONStr) {
        if (error || cachedJSONStr == null) {
            storageRest.apiGet(urlDF, appData, function (error, resultJSON) {
                if(!error && (resultJSON)) {
                    var resultJSON = parseStorageDFData(resultJSON);
                    if(!resultJSON) {
                        resultJSON = [];
                    }
                    redisClient.setex(urlDF, expireTime, JSON.stringify(resultJSON));
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

function parseStorageDFData(dfDataJSON){
    var dfJSON ={};
    dfJSON['utilization_stats']= dfDataJSON;
    dfJSON['utilization_stats']['last_updated_time']= new Date();
    return dfJSON;
}

function splitString2Array(strValue, delimiter){
    var strArray = strValue.split(delimiter),
        count = strArray.length;
    for (var i = 0; i < count; i++) {
        strArray[i] = strArray[i].trim();
    }
    return strArray;
}

function createClause(fieldName, fieldValue, operator){
    var whereClause = {};
    if (fieldValue != null) {
        whereClause = {};
        whereClause.name = fieldName;
        whereClause.value = fieldValue;
        whereClause.op = operator;
    }
    return whereClause;
}


function processSources(res, appData, callback){
    var urlOSDTree = storageApi.url.osdTree;
    var expireTime= 3600;
    redisClient.get(urlOSDTree, function(error, cachedJSONStr) {
        if (error || cachedJSONStr == null) {
            storageRest.apiGet(urlOSDTree, appData, function (error, resultJSON) {
                if(!error && (resultJSON)) {
                   if(!resultJSON) {
                        resultJSON = [];
                    }
                    var hostMap = jsonPath(resultJSON, "$..nodes[?(@.type=='host')].name");

                    redisClient.setex(urlOSDTree, expireTime, JSON.stringify(hostMap));
                    callback(error, res, hostMap);
                } else {
                    callback(error, res, null);
                }
            });
        } else {
            callback(null, res, JSON.parse(cachedJSONStr));
        }
    });
}

function getSources(req, res, appData) {
    processSources(res, appData, function(error,res,resultJSON){
        commonUtils.handleJSONResponse(error, res, resultJSON);
    });
}

function getStorageClusterOSDActivity(req, res,appData){
    var sampleCnt = req.query['sampleCnt'];
    if(typeof sampleCnt == "undefined"){
        sampleCnt =10;
    }else if(isNaN(sampleCnt)){
        sampleCnt =10;
    }

    var minsSince = req.query['minsSince'];
    if(typeof minsSince == "undefined"){
        minsSince =60;
    }else if(isNaN(minsSince)){
        minsSince =60;
    }

    var endTime = req.query['endTime'];
    if(typeof endTime == "undefined"){
        endTime ='now';
    }

    var intervalSecs=req.query['intervalSecs'];
    if(typeof intervalSecs == "undefined"){
        intervalSecs =60;
    }else if(isNaN(intervalSecs)){
        intervalSecs =60;
    }

    var tableName, whereClause=[],
    selectArr = ["SUM(info_stats.reads)", "SUM(info_stats.writes)", "SUM(info_stats.read_kbytes)",
            "SUM(info_stats.write_kbytes)", "SUM(info_stats.op_r_latency)", "SUM(info_stats.op_w_latency)", "COUNT(info_stats)" ];

    tableName = 'StatTable.ComputeStorageOsd.info_stats';
    selectArr.push("T="+intervalSecs);

    processSources(res, appData, function(error,res,sourceJSON){
        var count = sourceJSON.length;
        for (i = 0; i < count; i += 1) {
            var whereClauseArray=[];
            whereClauseArray.push(createClause('Source', sourceJSON[i], 1));
            whereClause.push(whereClauseArray);
        }

        var timeObj = stMonUtils.createTimeQueryJsonObj(minsSince, endTime);
        var timeGran = stMonUtils.getTimeGranByTimeSlice(timeObj, sampleCnt);
        var queryJSON = stMonUtils.formatQueryStringWithWhereClause(tableName, whereClause, selectArr, timeObj, true);
        delete queryJSON['limit'];
        delete queryJSON['dir'];
        var selectEleCnt = queryJSON['select_fields'].length;
        queryJSON['select_fields'].splice(selectEleCnt - 1, 1);
        stMonUtils.executeQueryString(queryJSON,
            commonUtils.doEnsureExecution(function(err, resultJSON)  {
                resultJSON= parseStorageClusterOSDActivityData(resultJSON, timeObj, timeGran,sourceJSON, intervalSecs);
                commonUtils.handleJSONResponse(err, res, resultJSON);
            }, global.DEFAULT_MIDDLEWARE_API_TIMEOUT));
    });
}

function parseStorageClusterOSDActivityData(activityJSON, timeObj, timeGran, sourceJSON, intervalSecs){
    var len = 0, secTime;
    var resultJSON = {};
    if((typeof activityJSON['value'] !== "undefined") && (activityJSON['value'].length > 0)) {
       try {
           resultJSON['summary'] = {};

           secTime = Math.floor(timeObj['start_time'] / 1000);
           resultJSON['summary']['start_time'] = new Date(secTime);

           secTime = Math.floor(timeObj['end_time'] / 1000);
           resultJSON['summary']['end_time'] = new Date(secTime);

           resultJSON['summary']['timeGran_microsecs'] = Math.floor(timeGran) * global.MILLISEC_IN_SEC * global.MICROSECS_IN_MILL;
           resultJSON['summary']['average_interval']=intervalSecs +' Seconds';
           resultJSON['summary']['sources']=sourceJSON;
           resultJSON['flow-series'] = formatOsdSeriesLoadXMLData(activityJSON);
           return resultJSON;
       } catch (e) {
           logutils.logger.error("In parseStorageClusterOSDActivityData(): JSON Parse error: " + e);
           return null;
       }
    }
}

function formatOsdSeriesLoadXMLData(resultJSON){
    var results = [];
    var counter = 0,secTime;
    try {
        resultJSON = resultJSON['value'];
        counter = resultJSON.length;
        for (var i = 0; i < counter; i++) {
            results[i] = {};
            secTime = Math.floor(resultJSON[i]['T='] / 1000);
            results[i]['Date']= new Date(secTime);
            var count = resultJSON[i]['COUNT(info_stats)'];
            results[i]['MessageTS'] = resultJSON[i]['T='];
            results[i]['sampleCnt'] = count;
            results[i]['reads'] = resultJSON[i]['SUM(info_stats.reads)'];
            results[i]['writes'] = resultJSON[i]['SUM(info_stats.writes)'];
            results[i]['reads_kbytes'] = resultJSON[i]['SUM(info_stats.read_kbytes)'];
            results[i]['writes_kbytes'] = resultJSON[i]['SUM(info_stats.write_kbytes)'];

            var op_r_latency = resultJSON[i]['SUM(info_stats.op_r_latency)'];
            results[i]['op_r_latency'] = op_r_latency/count;

            var op_w_latency = resultJSON[i]['SUM(info_stats.op_w_latency)'];
            results[i]['op_w_latency'] = op_w_latency/count;
        }
        return results;
    } catch (e) {
        logutils.logger.error("In formatOsdSeriesLoadXMLData(): JSON Parse error: " + e);
        return null;
    }
}

function getStorageClusterPoolActivity(req, res,appData){
    var sampleCnt = req.query['sampleCnt'];
    if(typeof sampleCnt == "undefined"){
        sampleCnt =10;
    }else if(isNaN(sampleCnt)){
        sampleCnt =10;
    }

    var minsSince = req.query['minsSince'];
    if(typeof minsSince == "undefined"){
        minsSince =60;
    }else if(isNaN(minsSince)){
        minsSince =60;
    }

    var endTime = req.query['endTime'];
    if(typeof endTime == "undefined"){
        endTime ='now';
    }

    var intervalSecs=req.query['intervalSecs'];
    if(typeof intervalSecs == "undefined"){
        intervalSecs =60;
    }else if(isNaN(intervalSecs)){
        intervalSecs =60;
    }

    var tableName, whereClause=[],
    selectArr = ["SUM(info_stats.reads)", "SUM(info_stats.writes)", "SUM(info_stats.read_kbytes)", "COUNT(info_stats)",
        "SUM(info_stats.write_kbytes)" ];
    tableName = 'StatTable.ComputeStoragePool.info_stats';
    selectArr.push("T="+intervalSecs);

    processSources(res, appData, function(error,res,sourceJSON) {
        var count = sourceJSON.length;
        for (i = 0; i < count; i += 1) {
            var whereClauseArray = [];
            whereClauseArray.push(createClause('Source', sourceJSON[i], 1));
            whereClause.push(whereClauseArray);
        }

        var timeObj = stMonUtils.createTimeQueryJsonObj(minsSince, endTime);
        var timeGran = stMonUtils.getTimeGranByTimeSlice(timeObj, sampleCnt);
        var queryJSON = stMonUtils.formatQueryStringWithWhereClause(tableName, whereClause, selectArr, timeObj, true);
        delete queryJSON['limit'];
        delete queryJSON['dir'];
        var selectEleCnt = queryJSON['select_fields'].length;
        queryJSON['select_fields'].splice(selectEleCnt - 1, 1);
        stMonUtils.executeQueryString(queryJSON,
            commonUtils.doEnsureExecution(function (err, resultJSON) {
                resultJSON = parseStorageClusterPoolActivityData(resultJSON, timeObj, timeGran, sourceJSON, intervalSecs);
                commonUtils.handleJSONResponse(err, res, resultJSON);
            }, global.DEFAULT_MIDDLEWARE_API_TIMEOUT));
    });

}

function parseStorageClusterPoolActivityData(activityJSON, timeObj, timeGran,sourceJSON, intervalSecs){
    var len = 0, secTime;
    var resultJSON = {};
    if((typeof activityJSON['value'] !== "undefined") && (activityJSON['value'].length > 0)) {
        try {
            resultJSON['summary'] = {};
            secTime = Math.floor(timeObj['start_time'] / 1000);
            resultJSON['summary']['start_time'] = new Date(secTime);

            secTime = Math.floor(timeObj['end_time'] / 1000);
            resultJSON['summary']['end_time'] = new Date(secTime);

            resultJSON['summary']['timeGran_microsecs'] = Math.floor(timeGran) * global.MILLISEC_IN_SEC * global.MICROSECS_IN_MILL;
            resultJSON['summary']['average_interval']=intervalSecs +' Seconds';
            resultJSON['summary']['sources']=sourceJSON;
            resultJSON['flow-series'] = formatPoolSeriesLoadXMLData(activityJSON);
            return resultJSON;
        } catch (e) {
            logutils.logger.error("In parseStorageClusterPoolActivityData(): JSON Parse error: " + e);
            return null;
        }
    }
}

function formatPoolSeriesLoadXMLData(resultJSON){
    var results = [];
    var counter = 0,secTime;
    try {
        resultJSON = resultJSON['value'];
        counter = resultJSON.length;
        for (var i = 0; i < counter; i++) {
            results[i] = {};
            secTime = Math.floor(resultJSON[i]['T='] / 1000);
            results[i]['Date']= new Date(secTime);
            results[i]['MessageTS'] = resultJSON[i]['T='];
            results[i]['sampleCnt'] = resultJSON[i]['COUNT(info_stats)'];
            results[i]['reads'] = resultJSON[i]['SUM(info_stats.reads)'];
            results[i]['writes'] = resultJSON[i]['SUM(info_stats.writes)'];
            results[i]['reads_kbytes'] = resultJSON[i]['SUM(info_stats.read_kbytes)'];
            results[i]['writes_kbytes'] = resultJSON[i]['SUM(info_stats.write_kbytes)'];
        }
        return results;
    } catch (e) {
        logutils.logger.error("In formatPoolSeriesLoadXMLData(): JSON Parse error: " + e);
        return null;
    }
}
function getStorageClusterDiskActivity(req, res,appData){
    var sampleCnt = req.query['sampleCnt'];
    if(typeof sampleCnt == "undefined"){
        sampleCnt =10;
    }else if(isNaN(sampleCnt)){
        sampleCnt =10;
    }

    var minsSince = req.query['minsSince'];
    if(typeof minsSince == "undefined"){
        minsSince =60;
    }else if(isNaN(minsSince)){
        minsSince =60;
    }

    var endTime = req.query['endTime'];
    if(typeof endTime == "undefined"){
        endTime ='now';
    }

    var intervalSecs=req.query['intervalSecs'];
    if(typeof intervalSecs == "undefined"){
        intervalSecs =60;
    }else if(isNaN(intervalSecs)){
        intervalSecs =60;
    }

    var tableName, whereClause=[],
    selectArr = ["SUM(info_stats.reads)", "SUM(info_stats.writes)", "SUM(info_stats.read_kbytes)",
        "SUM(info_stats.write_kbytes)", "SUM(info_stats.iops)","SUM(info_stats.bw)", "COUNT(info_stats)" ];
    tableName = 'StatTable.ComputeStorageDisk.info_stats';
    selectArr.push("T="+intervalSecs);

    processSources(res, appData, function(error,res,sourceJSON) {
        var count = sourceJSON.length;
        for (i = 0; i < count; i += 1) {
            var whereClauseArray = [];
            whereClauseArray.push(createClause('Source', sourceJSON[i], 1));
            whereClause.push(whereClauseArray);
        }

        var timeObj = stMonUtils.createTimeQueryJsonObj(minsSince, endTime);
        var timeGran = stMonUtils.getTimeGranByTimeSlice(timeObj, sampleCnt);
        var queryJSON = stMonUtils.formatQueryStringWithWhereClause(tableName, whereClause, selectArr, timeObj, true);
        delete queryJSON['limit'];
        delete queryJSON['dir'];
        var selectEleCnt = queryJSON['select_fields'].length;
        queryJSON['select_fields'].splice(selectEleCnt - 1, 1);
        stMonUtils.executeQueryString(queryJSON,
            commonUtils.doEnsureExecution(function (err, resultJSON) {
                resultJSON = parseStorageClusterDiskActivityData(resultJSON, timeObj, timeGran, sourceJSON, intervalSecs);
                commonUtils.handleJSONResponse(err, res, resultJSON);
            }, global.DEFAULT_MIDDLEWARE_API_TIMEOUT));
    });

}

function parseStorageClusterDiskActivityData(activityJSON, timeObj, timeGran, sourceJSON, intervalSecs){
    var len = 0, secTime;
    var resultJSON = {};
    if((typeof activityJSON['value'] !== "undefined") && (activityJSON['value'].length > 0)) {
        try {
            resultJSON['summary'] = {};
            secTime = Math.floor(timeObj['start_time'] / 1000);
            resultJSON['summary']['start_time'] = new Date(secTime);

            secTime = Math.floor(timeObj['end_time'] / 1000);
            resultJSON['summary']['end_time'] = new Date(secTime);

            resultJSON['summary']['timeGran_microsecs'] = Math.floor(timeGran) * global.MILLISEC_IN_SEC * global.MICROSECS_IN_MILL;
            resultJSON['summary']['average_interval']=intervalSecs+' Seconds';
            resultJSON['summary']['sources']=sourceJSON;
            resultJSON['flow-series'] = formatDiskSeriesLoadXMLData(activityJSON);
            return resultJSON;
        } catch (e) {
            logutils.logger.error("In parseStorageClusterDiskActivityData(): JSON Parse error: " + e);
            return null;
        }
    }
}

function formatDiskSeriesLoadXMLData(resultJSON){
    var results = [];
    var counter = 0,secTime;
    try {
        resultJSON = resultJSON['value'];
        counter = resultJSON.length;
        for (var i = 0; i < counter; i++) {
            results[i] = {};
            secTime = Math.floor(resultJSON[i]['T='] / 1000);
            results[i]['Date']= new Date(secTime);
            results[i]['MessageTS'] = resultJSON[i]['T='];
            results[i]['sampleCnt'] = resultJSON[i]['COUNT(info_stats)'];
            results[i]['reads'] = resultJSON[i]['SUM(info_stats.reads)'];
            results[i]['writes'] = resultJSON[i]['SUM(info_stats.writes)'];
            results[i]['reads_kbytes'] = resultJSON[i]['SUM(info_stats.read_kbytes)'];
            results[i]['writes_kbytes'] = resultJSON[i]['SUM(info_stats.write_kbytes)'];
            results[i]['iops'] = resultJSON[i]['SUM(info_stats.iops)'];
            results[i]['bw'] = resultJSON[i]['SUM(info_stats.bw)'];
        }
        return results;
    } catch (e) {
        logutils.logger.error("In formatDiskSeriesLoadXMLData(): JSON Parse error: " + e);
        return null;
    }
}


function getStorageClusterUsage(req, res, appData){
    var urlPGSummary = storageApi.url.pgDumpSummary;
    console.log("url:"+urlPGSummary);
    redisClient.get(urlPGSummary, function(error, cachedJSONStr) {
        if (error || cachedJSONStr == null) {
            processOSDStatus(res, appData, function(error,res,osdStatusJSON) {
                storageRest.apiGet(urlPGSummary, appData, function (error, resultJSON) {
                    if (!error && (resultJSON)) {
                        var resultJSON = processClusterUsage(resultJSON, osdStatusJSON);
                        if (!resultJSON) {
                            resultJSON = [];
                        }
                        redisClient.setex(urlPGSummary, expireTime, JSON.stringify(resultJSON));
                        commonUtils.handleJSONResponse(null, res, resultJSON);
                    } else {
                        commonUtils.handleJSONResponse(error, res, null);
                    }
                });
            });
        } else {
            commonUtils.handleJSONResponse(null, res, JSON.parse(cachedJSONStr));
        }
    });
}

function processClusterUsage(resultJSON, osdStatusJSON){
    var output={};
    var osdStatsSum= jsonPath(resultJSON, "$..osd_stats_sum")[0];
    output['usage_summary'] = {};
    output['usage_summary']['osd_status']=jsonPath(osdStatusJSON, "$..osd_stat")[0];
    output['usage_summary']['osd_summary']=osdStatsSum;
    output['usage_summary']['osd_summary']['full_ratio']=jsonPath(resultJSON, "$..full_ratio")[0];
    output['usage_summary']['osd_summary']['near_full_ratio']=jsonPath(resultJSON, "$..near_full_ratio")[0];
    return output;
}

function processOSDStatus(res, appData, callback){
    var urlOSDStatus = storageApi.url.osdStat;//"/osd/stat";
    console.log("url:"+urlOSDStatus);
    redisClient.get(urlOSDStatus, function(error, cachedJSONStr) {
        if (error || cachedJSONStr == null) {
            storageRest.apiGet(urlOSDStatus, appData, function (error, resultJSON) {
                if(!error && (resultJSON)) {
                    var resultJSON = parseStorageOSDStatus(resultJSON);
                    if(!resultJSON) {
                        resultJSON = [];
                    }
                    redisClient.setex(urlOSDStatus, expireTime, JSON.stringify(resultJSON));
                    callback(error, res, resultJSON);
                } else {
                    callback(error, res, null);
                }
            });
        } else {
            callback(null, res, JSON.parse(cachedJSONStr));
        }
    });
}

function parseStorageOSDStatus(osdJSON){
    console.log("osdJSON:"+jsonPath(osdJSON, "$.output")[0]);
    var osdMapJSON ={};
    var num_osds= jsonPath(osdJSON, "$.output.num_osds")[0];
    var num_up_osds= jsonPath(osdJSON, "$.output.num_up_osds")[0];
    var num_in_osds= jsonPath(osdJSON, "$.output.num_in_osds")[0];
    var num_down_osds = num_osds - num_up_osds;
    var num_out_osds = num_osds - num_in_osds;

    var obj = jsonPath(osdJSON, "$.output")[0];
    obj['num_down_osds'] = num_down_osds;
    obj['num_out_osds'] = num_out_osds;
    //c = obj;
    osdMapJSON['osd_stat']= osdJSON;
    osdMapJSON['osd_stat']['last_updated_time']= new Date();
    return osdMapJSON;
}

/* List all public functions */
exports.getStorageClusterStatus = getStorageClusterStatus;
exports.getStorageClusterDFStatus = getStorageClusterDFStatus;
exports.getStorageClusterHealthStatus = getStorageClusterHealthStatus;
exports.getStorageClusterOSDActivity = getStorageClusterOSDActivity;
exports.getStorageClusterPoolActivity = getStorageClusterPoolActivity;
exports.getStorageClusterDiskActivity = getStorageClusterDiskActivity;
exports.getSources = getSources;
exports.getStorageClusterUsage= getStorageClusterUsage;