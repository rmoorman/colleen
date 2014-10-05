var ZN = ZN || { };

ZN.App = function () {

    this.model = null;
    this.rules = null;

    // ajax
    this.xhr = null;
    this.timeoutTime = 20 * 1000;
    this.timeoutCount = 0;
    this.dataType = "json";
    this.apiUrl = "";
    this.ruleFile = "project_rules";

    // frame timing
    this.curTime = 0;
    this.lastTime = 0;
    this.frameTime = 40; // frame ms
    this.firstFrame = true;
    this.frameDurations = [];
    this.debug = true;

    // timeseries
    this.timeSeriesRequestInterval = 60*1000; // in ms
    this.timeSeriesLatency = 2*60*1000 // in ms
    this.dataSource = "archive"; // "live"

    // rendering
    this.canvasContainerId = "canvas-container";
    this.renderer = null;
    this.runProjectGraph = true;

    //sound
    this.volume = 1.0;

}

ZN.App.prototype = {
    constructor:ZN.App,

    init:function(){
        this.model = new ZN.Model();
        this.model.init();
        this.rules = new ZN.Rules();


        var rules = this.getParameterByName("rules");
        if(rules!=""){
            this.ruleFile += "_" + rules;
        }

        if(this.debug){
            $(document.body).append(
                '<div id="diagnostics" style="position:absolute;z-index:10;"></div>'+
                '<div id="sound-progress" style="position:absolute;z-index:10;top:20px"></div>'
            );
        }

        this.loadConfig();

    },


    loadConfig:function () {
        var self = this;
        var url = "js/config.js";

        $.ajax({
            type:"GET",
            url:url,
            dataType:"script",
            success:function (data) {
                self.configLoaded();
            },
            error:function (xhr, status, error) {
                if (xhr.status != 404) {alert(error);} else {alert("404 config not found");}
            }
        })
    },

    configLoaded:function(){
	    // url for api on same host as this page served from
		var url = window.location.protocol + "//" + window.location.host + "/";
	    //var url = './';//'http://localhost:5000/'
        this.apiUrl = url;
        this.dataSource = ZN.Config.dataSource;
        this.debug = ZN.Config.debug;
        this.rules.init(this,this.model);
        this.loadSoundConfig();

    },

    loadUrl:function (url, type, callback) {

        var self = this;

        this.xhr = $.ajax({
            url:url,
            dataType:type,
            contentType:"application/x-www-form-urlencoded;charset=uft-8",
            timeout:self.timeoutTime,
            success:function (data) {
                self.timeoutCount = 0;
                callback.apply(self,[data]);

            },

            error:function (jqXHR, exception) {

                if (exception === 'abort') {
                    //alert('Ajax request aborted.');

                }
                else if (exception === 'timeout') {
                    //alert('Time out error.');
                    self.timeoutCount += 1;
                    if (self.timeoutCount < 2) {
                        self.loadUrl(this.url, this.dataType, callback);
                    }
                    else {
                        alert('Time out error.');
                    }

                }
                else if (jqXHR.status === 0) {
                    self.timeoutCount += 1;
                    if (self.timeoutCount < 2) {
                        self.loadUrl(this.url, this.dataType, callback);
                    }
                    else {
                        alert('Not Connected.');
                    }
                    //alert('Not connect.\n Verify Network.');
                } else if (jqXHR.status == 404) {
                    alert('Requested page not found. [404]');
                } else if (jqXHR.status == 500) {
                    alert('Internal Server Error [500].');
                } else if (exception === 'parsererror') {
                    alert('Requested JSON parse failed.');
                } else {
                    alert('Uncaught Error.\n' + jqXHR.responseText);
                }

            },
            complete:function (jqXHR, textStatus) {
                /*alert("Load Complete: " + textStatus)*/
            }

        });

    },

    loadSoundConfig:function () {
        var url = ZN.Config.soundConfigPath;
        this.loadUrl(url, "json", this.soundConfigLoaded);

    },
    soundConfigLoaded:function (config) {
        var self = this;
        ZN.soundengine.init(config, function(err, progress){
            if(err){
                window.alert('Soundengine failed to load:'+ err.message);
                return;
            }

            if(self.debug){
                var txt = progress!=100?'sound files...'+progress+'%':'';
                $('#sound-progress').text(txt);
            }

            if(progress === 100){
                self.soundLoadComplete();
            }
        });
        this.loadProjectRules();
    },

    soundLoadComplete: function(){
        // set scene

        // start sound

        ZN.soundengine.start();
        this.startApp();
        ZN.soundengine.setSceneLayersMix(ZN.Config.sceneLayersMix);
        ZN.soundengine.setBaseLayersMix(ZN.Config.baseLayersMix);

    },

    loadProjectRules:function () {
        var url = "data/"+this.ruleFile+".json";
        this.loadUrl(url, "json",this.projectRulesLoaded);

    },

    projectRulesLoaded:function(data){
        this.model.initProjects(data);
        this.loadTimeSeries();

    },

    /*
    loadProjectAnalytics:function() {
        var url = this.apiUrl+"analytics";
        this.loadUrl(url, "json",this.analyticsLoaded);

    },
    analyticsLoaded:function(data){
        this.model.parseAnalytics(data);
        this.startApp();
    },
    */

    loadTimeSeries:function() {
        var url;
        // select timeseries
        //var url = this.apiUrl+"timeseries/intervals/"+ intervals.join(',');

        // all timeseries
        if(this.dataSource=="json_file"){
            url = "data/"+ZN.Config.timeseriesJson;
        }
        else{
            url = this.apiUrl+"timeseries/";
        }
        this.loadUrl(url, "json",this.timeSeriesLoaded);

    },

    timeSeriesLoaded:function(data){
        this.model.parseTimeSeries(data);
        this.loadProjectGraph();
    },


    loadProjectGraph:function () {
        var url = "data/project_rels.csv";
        this.loadUrl(url, "text", this.projectGraphLoaded);

    },
    projectGraphLoaded:function (data) {
        this.model.initProjectGraph(data);
        //this.startApp();
    },


    startApp:function(){

        this.renderer = new ZN.CanvasRenderer();
        this.renderer.init(this,this.model,this.canvasContainerId);

        //this.soundEngine = new ZN.SoundEngine();
        //this.soundEngine.init(this,this.model);

        this.curTime = this.lastTime = (new Date()).valueOf();
        this.initInterface();

        $("#wrapper").fadeIn();
        $("#loader").fadeOut();

        // set focus project
        if(this.runProjectGraph){
            this.rules.setFocusProject();
        }


        var self = this;
        setTimeout(function(){self.loadIncTimeSeries()}, this.timeSeriesRequestInterval);

        this.update();

    },

    initInterface:function(){
        var self = this;


        $(window).resize(function(){
            self.renderer.resize();
        });

        $(window).keypress(function( event ) {
            //console.log(event.which);
            switch(event.which){
                case 111: // 'o'
                    self.rules.incFocusProject(-1);
                    break;
                case 112: // 'p'
                    self.rules.incFocusProject(1);
                    break;
            }


        });

    },



    loadIncTimeSeries:function() {

        if(this.dataSource=="json_file") return;

        var from = this.model.maxSeriesTime +60; // last time plus 1 min
        var to = 0;

        if(this.dataSource=="archive"){
            to = from+this.timeSeriesRequestInterval/1000;
        }
        else{ // live
            to = parseInt((this.curTime-this.timeSeriesLatency)/1000);
        }

        if(from>to){
            var self = this;
            setTimeout(function(){self.loadIncTimeSeries()}, this.timeSeriesRequestInterval);
        }
        else{
            var url = this.apiUrl+"timeseries/from/"+from+"/to/"+to;
            //console.log('loadIncTimeSeries',url);
            this.loadUrl(url, "json",this.incTimeSeriesLoaded);
        }

    },
    incTimeSeriesLoaded:function(data){
        this.model.incrementTimeSeries(data);
        var self = this;
        setTimeout(function(){self.loadIncTimeSeries()}, this.timeSeriesRequestInterval);


    },

    resize:function(){

    },


    update:function(){
        var self = this;
        this.updateFps();

        var frameTimeTarget = 40; // ms

        var t0 = new Date().valueOf();
        this.rules.update(frameTimeTarget); // this.frameTime
        this.renderer.render();
        //this.soundEngine.update();
        this.model.projectGraph.update();
        var t1 = new Date().valueOf();
        var dt = t1-t0;

        var timeout = Math.max(frameTimeTarget-dt,0);
        timeout = Math.min(timeout,frameTimeTarget);

        setTimeout(function() {
            requestAnimationFrame(function(){self.update()});

        }, timeout);


    },

    updateFps:function(){
        this.lastTime = this.curTime;
        this.curTime = (new Date()).valueOf();
        var frame = this.curTime - this.lastTime;
        this.frameTime = frame;//Math.max(frame,33);
        this.frameDurations.push(frame);
        if(this.frameDurations.length>10) this.frameDurations.shift();

        var sum = this.frameDurations.reduce(function(prev, cur, index, array){
            return prev + cur;
        });
        var fps = (1.0/((sum/this.frameDurations.length)/1000)).toFixed(2) + " fps";
        if(this.debug){
            var projectName = "";
            if(this.model.focusProject) projectName=this.model.focusProject.name;
            $("#diagnostics").html(fps+" : "+ projectName);
        }

    },



    getParameterByName:function(name){
        name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
        var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
            results = regex.exec(location.search);
        return results == null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
    }


    /*


     // classifications request. Not currently used

     this.nextRequestTime = 0;
     this.requestDuration = 60*1000; // in ms
     this.classificationDelay = 0;
     this.classificationLoadCount = 0;
     this.archiveStartSecs = 120000;//2*24*60*60; // seconds


     loadClassification:function () {
     var maxItems = 1000;
     var requestDurationSecs = this.requestDuration/1000;
     var offsetSecs = 0;
     if(this.dataSource=="archive"){
     offsetSecs = this.archiveStartSecs-this.classificationLoadCount*requestDurationSecs;
     }
     var url = this.apiUrl + "classifications/" + maxItems +"/duration/"+requestDurationSecs+"/offset/"+offsetSecs;

     this.loadUrl(url, "json", this.classificationLoaded);

     },

     classificationLoaded:function(data){
     var d = data;
     var classifications = this.model.addClassifications(data);
     var delay = (new Date()).valueOf() - classifications[0].time;

     this.classificationLoadCount += 1;

     if(this.firstFrame){
     this.firstFrame = false;
     this.classificationDelay = delay;
     this.nextRequestTime = (new Date()).valueOf() + this.requestDuration;
     this.update();

     }
     else{

     if(this.classificationDelay < delay){
     //this.classificationDelay = delay;
     }

     }

     },

     updateClassifications:function(){
     /*
     // load new classifications
     if(this.curTime>this.nextRequestTime){
     this.loadClassification();
     this.nextRequestTime = this.curTime + this.requestDuration;
     console.log("nextRequestTime",(new Date(this.nextRequestTime)).toISOString());
     }

     // classification
     if(this.model.classifications.length>0){
     var nextClassificationTime = this.model.getNextClassificationTime()+ this.classificationDelay;
     if(this.curTime>nextClassificationTime){
     console.log("nextClassificationTime",(new Date(nextClassificationTime)).toISOString());
     var classification = this.model.removeFirstClassification();
     console.log("classification timestamp:",classification.timestamp);

     }
     }
     */



}
