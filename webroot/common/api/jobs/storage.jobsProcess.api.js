/*
 * Copyright (c) 2014 Juniper Networks, Inc. All rights reserved.
 */
var storageConfig = require('../../../common/js/storage.config.global');


var storageJobApi = require('../../../monitor/tenant-storage/jobs/storage.jobs');

var jobsProcess = module.exports;

jobsProcess.processStorageClusterStatusRequestByJob =
    function(pubChannel, saveChannelKey, jobData, done) {
    storageJobApi.processStorageClusterStatus(pubChannel, saveChannelKey, jobData, done);
}

