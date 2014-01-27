var notification = (function() {
	var configs = {
		CONTEXT : "/"
	};
	var routes = new Array();
	var log = new Log();
	var db;
	var common = require("/modules/common.js");
    var sqlscripts = require('/sqlscripts/mysql.js');
    var deviceModule = require('device.js').device;
    var device;
    var module = function (dbs) {
        db = dbs;
        device = new deviceModule(db);
    };

    function mergeRecursive(obj1, obj2) {
        for (var p in obj2) {
            try {
                // Property in destination object set; update its value.
                if (obj2[p].constructor == Object) {
                    obj1[p] = MergeRecursive(obj1[p], obj2[p]);
                } else {
                    obj1[p] = obj2[p];
                }
            } catch (e) {
                // Property in destination object not set; create it and set its value.
                obj1[p] = obj2[p];
            }
        }
        return obj1;
    }

    // prototype
    module.prototype = {
        constructor: module,
        getNotifications: function(ctx){
        	var tenantID = common.getTenantID();
            var result = db.query(sqlscripts.notifications.select5, ctx.deviceid);

            var notifications = new Array();
            for (i=0; i<result.length; i++){
                var obj = {};
                obj.sent_date =  common.getFormattedDate(result[i].sent_date);
                obj.received_date = common.getFormattedDate(result[i].received_date);
                obj.received_data = result[i].received_data;
                obj.feature_code =  result[i].feature_code;
                obj.feature_description =  result[i].feature_description;
                notifications[i] = obj;
            }
            return notifications;
        },
        addIosNotification: function(ctx){
            
            var identifier = ctx.msgID.replace("\"", "").replace("\"","")+"";
            var notifications = db.query(sqlscripts.notifications.select6, identifier);

            //log.debug("identifier >>>>>> " + identifier);
            //log.debug("notifications >>>> " + stringify(notifications));

            var recivedDate =  common.getCurrentDateTime();
            
            if(notifications != null &&  notifications[0] != null) {
                var featureCode = notifications[0].feature_code;
                var device_id = notifications[0].device_id;
                var message = notifications[0].message;

                if(featureCode == "500P" || featureCode == "502P") {

                    var notificationId = identifier.split("-")[0];
                    var policySequence = identifier.split("-")[1];

                    var pendingFeatureCodeList = db.query(sqlscripts.notifications.select7, notificationId);
                    //log.debug("PendingFeature >>>> " + stringify(pendingFeatureCodeList));

                    var received_data = pendingFeatureCodeList[0].received_data;
                    var device_id = pendingFeatureCodeList[0].device_id;
                    var targetOperationData = (parse(received_data))[parseInt(policySequence)];
                    var targetOperationId = targetOperationData.message.code;
                    var pendingExist = false;
                    var parsedReceivedData = (parse(received_data));

                    var totalOperations = parse(message).length;
                    var operationCount = 0;

                    for (var i =0; i< parsedReceivedData.length; i++) {

                        var receivedObject = parsedReceivedData[i];
                        if (receivedObject.status == "received" || receivedObject.status == "error") {
                            operationCount++;
                        }
                    }
                    //log.debug("totalOperations >>>> " + totalOperations);
                    //log.debug("operationCount >>>> " + operationCount);

                    if (totalOperations > operationCount + 1) {
                        log.debug("return true");
                        pendingExist = true;
                    }

                    if(ctx.error == "Error") {
                        parsedReceivedData[operationCount].status = "error";
                    } else {
                        parsedReceivedData[operationCount].status = "received";
                    }

                    db.query(sqlscripts.notifications.update4, stringify(parsedReceivedData), recivedDate, notificationId);

                    if (pendingExist == true) {
                        return true;
                    } else {
                        //log.debug("Update notifications!!!!");
                        db.query(sqlscripts.notifications.update5, notificationId);
                    }


                } else if(featureCode == "501P") {
                    
                    var parsedReceivedData = parse(parse(stringify(ctx.data)));
                    var formattedData = new Array();
                    var featureCodeArray =  new Array();

                    for(var i = 0; i < parsedReceivedData.length; i++) {
                        var receivedObject = parsedReceivedData[i];
                        var payloadIdentifier = receivedObject.PayloadIdentifier;

                        var featureName = common.getValueByFeatureIdentifier(payloadIdentifier);

                        if(featureName == null) {
                            continue;
                        }

                        var featureCodes = db.query(sqlscripts.features.select5, featureName);

                        if(featureCodes == null || featureCodes[0] == null || featureCodes[0].code == null) {
                            continue;
                        }

                        var innerResponse = {};
                        innerResponse.status = true;
                        innerResponse.code = featureCodes[0].code;
                        formattedData.push(innerResponse);
                        featureCodeArray.push(featureCodes[0].code);
                    }
                    	
				    var receivedData = parse(message);
				    var policies = receivedData["policies"];
                	
                	for(var i = 0; i < policies.length; i++) {
                		
                		var receivedElement = policies[i];
                		var code = receivedElement["code"];
                		
                		var isExist = false;
                		
                		for(var j = 0; j < featureCodeArray.length; j++) {
                			var featureCode = featureCodeArray[j];

                			if(featureCode == code) {
                				isExist = true;
                				break;
                			}
                		}
                		
                		if(!isExist) {
	                    	var innerResponse = {};
	                        innerResponse.status = false;
	                        innerResponse.code = code;
	                        formattedData.push(innerResponse);                       
                		}
                	}
                    try{
                        db.query(sqlscripts.notifications.delete2, device_id,"501P");
                    }catch(e){
                        log.info(e);
                    }

                    db.query(sqlscripts.notifications.update6, stringify(formattedData), recivedDate, identifier);

                } else {
                    var policySeperator = identifier.indexOf("-");

                    if(policySeperator == -1) {
                        db.query(sqlscripts.notifications.update6, ctx.data, recivedDate, identifier);
                    }
                    
                    if(featureCode == "500A") {
                    	
                    	var dataObj = parse(parse(stringify(ctx.data)));
                    	var deviceName = dataObj["DeviceName"];
                    	var osVersion = dataObj["OSVersion"];
                    	var wifiMac = dataObj["WiFiMAC"];
                    	
                    	var notifications = db.query(sqlscripts.notifications.select8, identifier);
                        var deviceId = notifications[0].device_id;
                    	device.updateDeviceProperties(deviceId, osVersion, deviceName, wifiMac);
                    }
                }
            }
        },
        addNotification: function(ctx){
			var recivedDate = common.getCurrentDateTime();

			var result = db.query(sqlscripts.notifications.select9, ctx.msgID);
			
			if(result == null || result == undefined || 
					result[0] == null || result[0] == undefined) {
				return;
			}
			log.debug("[Android] - Device contacted :"+result[0].device_id);
			log.debug("Current Message ID " + ctx.msgID);
			var deviceId = result[0].device_id;
			var featureCode = result[0].feature_code;

			var messageIDs = db.query(sqlscripts.notifications.select9,
					ctx.msgID);
			if (typeof messageIDs !== 'undefined' && messageIDs !== null
					&& typeof messageIDs[0] !== 'undefined'
					&& messageIDs[0] !== null) {
				db.query(sqlscripts.notifications.update6, ctx.data,
						recivedDate, ctx.msgID);
			}
		},
		getLastRecord : function(ctx) {

			log.info("Operation >>>>>> " + ctx.operation);

			var result = db.query(sqlscripts.notifications.select10,
					ctx.deviceid, ctx.operation);
			var features = db.query(sqlscripts.features.select6, ctx.operation);
			ctx.operation = String(features[0].name);
			ctx.data = "hi";

			if (result == null || result == undefined || result.length == 0) {
				return {};
			}

			result = result[result.length - 1];

			var receivedData = parse(result["received_data"]);

			var response = {};

			var deviceResult = db.query(sqlscripts.devices.select43,
					ctx.deviceid);

			if (deviceResult != null && deviceResult != undefined && ctx.operation == "INFO") {
				var properties = deviceResult[0].properties;
				var platformId = deviceResult[0].platform_id;

				var platformResults = db.query(sqlscripts.platforms.select3,
						platformId);

				if (platformResults != null && platformResults != undefined) {
					var type = platformResults[0].type;

					if (type == 2) {

						properties = parse(parse(stringify(properties)));

						var latitude = properties["latitude"];
						var longitude = properties["longitude"];

						if (latitude != null && latitude != undefined
								&& longitude != null && longitude != undefined) {
							
							var locationObj = {};
							locationObj.latitude = latitude;
							locationObj.longitude = longitude;
							response.location_obj = locationObj;
						}

						if (receivedData.BatteryLevel) {
							var batteryLevel = {};
							batteryLevel.level = parseInt(receivedData.BatteryLevel * 100);
							response.battery = batteryLevel;
						}

						response.operator = receivedData.CurrentCarrierNetwork;
						
						result.received_data = stringify(response);
					}
				}
			}

			return result;
		},
		getPolicyState : function(ctx) {

            var result = db.query(sqlscripts.notifications.select10,
                    ctx.deviceid, '501P');
            var newArray = new Array();
            if (result == null || result == undefined || result.length == 0) {
                return newArray;
            }
            var arrayFromDatabase = parse(result[result.length - 1].received_data);
            var blackListApp = {};
            blackListApp.status = true;
            var checkState = true;
            for ( var i = 0; i < arrayFromDatabase.length; i++) {
                if (arrayFromDatabase[i].code == 'notrooted') {
                    var obj = {};
                    obj.name = 'Not Rooted';
                    obj.status = arrayFromDatabase[i].status;
                    newArray.push(obj);
                    if (obj.status == false) {
                        device.changeDeviceState(ctx.deviceid, "C");
                        checkState = false;
                    }

                } else {
                    var featureCode = arrayFromDatabase[i].code;
                    try {
                        var obj = {};
                        var features = db.query(sqlscripts.features.select6,
                                featureCode);

                        if (featureCode == "528B") {
                            if (blackListApp.status == true) {
                                blackListApp.name = features[0].description;
                                blackListApp.status = arrayFromDatabase[i].status
                            }
                        } else {
                            obj.name = features[0].description;
                            obj.status = arrayFromDatabase[i].status;
                            newArray.push(obj);

                            if (obj.status == false) {
                                var currentState = device
                                    .getCurrentDeviceState(ctx.deviceid);
                                if (currentState == 'A') {
                                    checkState = false;
                                    device.changeDeviceState(ctx.deviceid, "PV");
                                }
                            }
                        }
                    } catch (e) {
                        log.info(e);
                    }
                }
            }
            if(checkState == true){
                device.changeDeviceState(ctx.deviceid, "A");
            }
            if (blackListApp.name != null) {
                newArray.push(blackListApp);
            }

            log.info("Final result >>>>>>>>>>" + stringify(newArray));
            return newArray;
        },
		getPolicyComplianceDevices : function(ctx) {
			var compliance = ctx.compliance;

			var complianceDevices = new Array();
			var violatedDevices = new Array();
			var devices = db.query(sqlscripts.devices.select15,common.getTenantID());
			for ( var i = 0; i < devices.length; i++) {
				var compliances = this.getPolicyState({
					'deviceid' : devices[i].id
				});
				var flag = true;
				for ( var j = 0; j < compliances.length; j++) {
					if (compliances[j].status == false) {
						flag = false;
						break;
					}
				}
				if (flag) {
					var obj = {};
					obj.id = devices[i].id;
					obj.properties = devices[i].properties;
					obj.username = devices[i].user_id;
					complianceDevices.push(obj);
				} else {
					var obj = {};
					obj.id = devices[i].id;
					obj.properties = devices[i].properties;
					obj.username = devices[i].user_id;
					violatedDevices.push(obj);
				}

			}

			if (compliance) {
				return complianceDevices;
			} else {
				return violatedDevices;
			}
		},
		getPolicyComplianceDevicesCount : function(ctx) {
			var complianceDeviceCount = this.getPolicyComplianceDevices({
				'compliance' : true
			}).length;
			var violatedDevicesCount = this.getPolicyComplianceDevices({
				'compliance' : false
			}).length;
			var totalDevicesCount = complianceDeviceCount
					+ violatedDevicesCount;
			var complianceDeviceCountAsPercentage = (complianceDeviceCount / (totalDevicesCount)) * 100;
			var violatedDevicesCountAsPercentage = (violatedDevicesCount / (totalDevicesCount)) * 100;
			var array = new Array();
			var obj1 = {};
			obj1.label = 'Compliance';
			obj1.data = complianceDeviceCountAsPercentage;
			obj1.devices = complianceDeviceCount;

			array.push(obj1);

			var obj2 = {};
			obj2.label = 'Non Compliance';
			obj2.data = violatedDevicesCountAsPercentage;
			obj2.devices = violatedDevicesCount;

			array.push(obj2);
			
			if(totalDevicesCount == 0){
            	finalResult =  [{"label" : "No Data", "devices": 0,  "data" : 100}];
            }
			
			return array;
		},
		discardOldNotifications : function(ctx) {

			var currentOperation = db.query(sqlscripts.notifications.select11,
					parseInt(ctx.id));

			if (currentOperation == null || currentOperation[0] == null
					|| currentOperation == undefined
					|| currentOperation[0] == undefined) {
				return;
			}

			var receivedDate = currentOperation[0].received_date;
			var deviceId = currentOperation[0].device_id;
			var featureCode = currentOperation[0].feature_code;
			var userId = currentOperation[0].user_id;

			db.query(sqlscripts.notifications.update1, deviceId, featureCode,
					userId);
		}

	};
	// return module
	return module;
})();