'use strict';

const Orvibo = require('node-orvibo');
var Accessory, Service, Characteristic, UUIDGen;

module.exports = function (homebridge) {
  Accessory = homebridge.platformAccessory;
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;

  homebridge.registerPlatform('homebridge-platform-orvibo', 'Orvibo', OrviboPlatform, true);
};

class OrviboPlatform {
  constructor (log, config, api) {
    
    let self = this;

    self.log = log;
    self.config = config || {};
    self.api = api;
    self.accessories = new Map();

    self.orvibo = new Orvibo();
    self.time1 = [] 
    self.time2 = [] 
    self.time3 = [] 
    self.time4 = [] 

    self.orvibo.on("deviceadded", function(device) {
      self.log("New Orvibo found: %s [%s]", device.type, device.macAddress);
      self.orvibo.discover();

      self.time2[device.macAddress] = setInterval(function() {
        self.orvibo.subscribe(device);
      }, 1000)

    });

    self.orvibo.on("subscribed", function(device) {
      self.log("Subscription to %s successful!", device.macAddress);
      clearInterval(self.time2[device.macAddress]);

      self.time3[device.macAddress] = setInterval(function() {
        self.orvibo.query({ device: device });
      }, 1000);
    });

    self.orvibo.on("queried", function(device) {
      self.log("A device has been queried. Name (if set): %s", device.name);
      clearInterval(self.time3[device.macAddress]);

      var accessory = self.accessories.get(device.macAddress);
      if (accessory === undefined) {
        self.addAccessory(device);
      } else {
        self.log("Orvibo Online: %s [%s]", accessory.displayName, device.macAddress);
        var OrviboAcc = new OrviboAccessory(self.log, accessory, self.orvibo);
        self.accessories.set(device.macAddress, OrviboAcc);
        OrviboAcc.configure(device);
      }
    });
    self.orvibo.on("externalstatechanged", function(device) {
        self.log("State of %s set to %s", device.name, device.state);
        var OrviboAcc = self.accessories.get(device.macAddress);
	const outletService = OrviboAcc.accessory.getService(Service.Outlet);
	if (outletService.getCharacteristic(Characteristic.On).value != device.state) {
		outletService.getCharacteristic(Characteristic.On).setValue(device.state);
	}
    });
    self.api.on('didFinishLaunching', this.didFinishLaunching.bind(this));
  }

  configureAccessory (accessory) {
    this.accessories.set(accessory.context.deviceId, accessory);
  }

  didFinishLaunching () {
    var orvibo = this.orvibo;
    var time1 = this.time1;
    orvibo.listen(function() {
        time1 = setInterval(function() {
          orvibo.discover();
        }, 5000);
    });
  }

  addAccessory (device) {
    const name = device.name;
    this.log('Adding: %s', name);

    const platformAccessory = new Accessory(name, UUIDGen.generate(device.macAddress), 7 /* Accessory.Categories.OUTLET */);
    platformAccessory.addService(Service.Outlet, name);

    platformAccessory.context.deviceId = device.macAddress;
    //platformAccessory.context.device = device;

    const accessory = new OrviboAccessory(this.log, platformAccessory, this.orvibo);

    accessory.configure();
    this.accessories.set(device.macAddress, accessory);
    this.api.registerPlatformAccessories('homebridge-platform-orvibo', 'Orvibo', [platformAccessory]);
  }

  removeAccessory (accessory) {
    this.log('Removing: %s', accessory.accessory.displayName);

    this.accessories.delete(accessory.accessory.macAddress);
    this.api.unregisterPlatformAccessories('homebridge-platform-orvibo', 'Orvibo', [accessory.accessory]);
  }

}

class OrviboAccessory {
  constructor (log, accessory, client) {
    this.log = log;

    this.accessory = accessory;
    this.client = client;
    this.macAddress = accessory.context.deviceId;
    this.device = client.getDevice(accessory.context.deviceId);

  }

  identify (callback) {
    // TODO
    callback();
  }

  configure () {
    this.log('Configuring: %s', this.device.name);

    const pa = this.accessory;

    this.refresh();

    const outletService = pa.getService(Service.Outlet);
    outletService.getCharacteristic(Characteristic.On)
      .on('get', (callback) => {
          this.refresh();
          if (this.device.state == true) {
              callback(null, true);
          } else {
              callback(null, false);
          }
      })
      .on('set', (value, callback) => {
          var state = value == 1;
          this.client.setState({device: this.device, state: state});
          callback();
      });
  }

  refresh () {
    this.accessory.displayName = this.device.name;

    const outletService = this.accessory.getService(Service.Outlet);
    outletService.setCharacteristic(Characteristic.Name, this.device.name);
    if (outletService.getCharacteristic(Characteristic.On).value != this.device.state) {
        outletService.getCharacteristic(Characteristic.On).setValue(this.device.state);
    }

    const infoService = this.accessory.getService(Service.AccessoryInformation);
    infoService
      .setCharacteristic(Characteristic.Name, this.device.name)
      .setCharacteristic(Characteristic.Manufacturer, 'Orvibo')
      .setCharacteristic(Characteristic.Model, this.device.type)
      .setCharacteristic(Characteristic.SerialNumber, this.device.macAddress)

    this.accessory.context.lastRefreshed = new Date();
    return this;
  }
}
