var storage = {};

storage.rest={};
storage.rest.serverVersion = "/api/v0.1";

storage.expireTimeSecs= 25;

storage.url={};
storage.url.health = "/health";
storage.url.status = "/status";
storage.url.df = "/df";

storage.url.pgDumpSummary = "/pg/dump?dumpcontents=summary";
storage.url.pgDumpOSDs = "/pg/dump?dumpcontents=osds";
storage.url.pgDumpStuck = "/pg/dump_stuck";
storage.url.pgDumpPools = "/pg/dump_pools_json";

storage.url.osdTree = "/osd/tree";
storage.url.osdDump = "/osd/dump";
storage.url.osdStat = "/osd/stat";
storage.url.osdVersion="/tell/:osdName/version";

// Export this as a module.
module.exports = storage;




