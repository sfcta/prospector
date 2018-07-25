'use strict';


//THIS IS THE TRAVEL DEMAND TOOL


/*
SFCTA PROSPECTOR: Data visualization platform.

Copyright (C) 2018 San Francisco County Transportation Authority
and respective authors. See Git history for individual contributions.

This program is free software: you can redistribute it and/or modify
it under the terms of the Apache License version 2.0, as published
by the Apache Foundation, or any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
See the Apache License for more details.

You should have received a copy of the Apache License along with
this program. If not, see <https://www.apache.org/licenses/LICENSE-2.0>.
*/

// Must use npm and babel to support IE11/Safari
import 'isomorphic-fetch';
import Cookies from 'js-cookie';

var maplib = require('../jslib/maplib');
let styles = maplib.styles;
let getLegHTML = maplib.getLegHTML;
let mymap = maplib.sfmap;
var numeral = require('numeral');
var leafletPip = require('@mapbox/leaflet-pip');
//leafletPip.bassackwards = true;

mymap.setView([37.76889, -122.440997], 12);


// some important constant variables.
const CTA_API_SERVER = 'https://api.sfcta.org/api/';
const DISTRICTS_URL = 'tia_dist12';
const TRIP_DISTRIBUTION = 'tia_distribution';
const TRIP_GEN_RTS = 'tia_tripgen';
const PLANNING_GEOCODER_baseurl = 'http://sfplanninggis.org/cpc_geocode/?search=';

let geoDistricts;
let distributionData;
queryServer(CTA_API_SERVER + TRIP_DISTRIBUTION)
.then(function(data) {
  distributionData = data;
  //console.log(distributionData);
})

let tripGenRates;
queryServer(CTA_API_SERVER + TRIP_GEN_RTS)
.then(function(data) {
  tripGenRates = data;
  //console.log(tripGenRates);
})

let color_styles = [{ normal  : {"color": "#39f", "weight":3,  "opacity": 0.5},
selected: {"color": "#33f",    "weight":4, "opacity": 0.5 },},
{ normal  : {"fillColor": "#8B0000 ", "fillOpacity": 0.8 },
selected: {"color": "#34784b", "weight":5, "opacity": 1.0, },},
{normal: {"fillColor": "#000", "fillOpacity": 0.8, },
selected: {"color": "#000", "weight":5, "opacity": 1.0,},}
];

//some global geolayer variables
let address_geoLyr;
let addressGroup;
let districts;
let districts_lyr;
let markers = []; //this is the list of all the district markers

//some other global variables
let addressDistrictNum; 
let modeSelect; 
let landUseSelect; 
let tripPurposeSelect; 
let referenceDistrictProp;
let colorDistrictOutput;
let namePopup;
let propPopup;
let max_outbound;




//creating the tooltip functionality and putting it on the map
let info = L.control(); //control refers to tool tip like objects
info.onAdd = function (map) {
  this._div = L.DomUtil.create('div', 'info'); // create a div with a class "info"
  this.update();
  return this._div;
};
info.update = function (hoverDistrict) { //hoverDistrict is the mouseover target defned in updateMap
  if (addressDistrictNum == null && hoverDistrict == null) {
    this._div.innerHTML = '<h4>Information</h4>' +
    '<b> Input an address </b>'
  }
  else if (hoverDistrict == null) {
    this._div.innerHTML = '<h4>Information</h4>' +
    '<b> Trips from district '+ addressDistrictNum.toString() + ':hover over a district </b>'
  }
  else if (addressDistrictNum == null) {
    this._div.innerHTML = '<h4>Information</h4>' +
    '<b> Input an address to see trip distribution for: '+ hoverDistrict.distname +  '</b>' 
  }

  else if (modeSelect == null) {
    this._div.innerHTML = '<h4>Information</h4>' +
    '<b> Select a mode to see trip distribution for: '+ hoverDistrict.distname +  '</b>'
  }

  else if (landUseSelect == null) {
    this._div.innerHTML = '<h4>Information</h4>' +
    '<b> Select a land use to see trip distribution for: '+ hoverDistrict.distname +  '</b>'
  }

  else if (tripPurposeSelect == null) {
    this._div.innerHTML = '<h4>Information</h4>' +
    '<b> Select a trip purpose to see trip distribution for: '+ hoverDistrict.distname +  '</b>'
  }
  else { 
    this._div.innerHTML = '<h4>Information</h4>' +
    '<b> Proportion of outbound trips from district '+ addressDistrictNum.toString() + ' to district '+ hoverDistrict.dist.toString()+ ': ' + 
    numeral(getFilteredData(hoverDistrict)[0]).format('0.0%') +' </b>' +
    '<br><b> Proportion of inbound trips to district '+ hoverDistrict.dist.toString() + ' from district '+ addressDistrictNum.toString()+ ': ' + 
    numeral(getFilteredData(hoverDistrict)[1]).format('0.0%') +' </b></br>'
    //colorDistricts(referenceDistrictProp, filtered_data);
  }
};
info.addTo(mymap);

//should filterDistributionData and getFilteredData be combined into one function? probably...

function filterDistributionData(mode, districtNum, landUse, purpose) { 
//this function filters the whole distributionData json object according to a few given parameters
return distributionData.filter(function(piece){ 
    //for now the input will either be transit or all auto, which is everything that is not transit
    //this returns a filtered json object that includes only the components of the original json
  //that are the given mode, direction and district number 
  return piece.mode == modeSelect && piece.dist == districtNum && landUse == piece.landuse && purpose == piece.purpose;
  
});
}

function getFilteredData(hoverDistrict) {

  referenceDistrictProp = "prop_dist" + hoverDistrict.dist; //the name of the value that stores the 
  //relevant proportion from address district to hover district
  let filtered_data = filterDistributionData(modeSelect, addressDistrictNum, landUseSelect, tripPurposeSelect); //hard coded for now, make a direction button just like mode
  console.log(filtered_data);
  let proportion_outbound = filtered_data[0][referenceDistrictProp];
  let proportion_inbound = filtered_data[1][referenceDistrictProp];
  


  return [proportion_outbound, proportion_inbound];

}


function queryServer(url){
  var promise = new Promise(function(resolve, reject) {
    fetch(url)
    .then((resp) => resp.json())
    .then(function(jsonData) {
      resolve(jsonData)
    })
    .catch(function(error) {
      console.log("err: "+error);
      alert("Cannot query server");
    });
  })
  return promise
}


function planningJson2geojson(json) {
  //converts the response json of the planning geocoder into a geojson format that is readable by leaflet
  //allows this data to be added to a geoLayer and drawn on the map  
  let geoCodeJson = {};
  geoCodeJson['blklot'] = json.features[0].attributes.blklot;
  geoCodeJson['type'] = 'Feature';
  geoCodeJson['geometry'] = {};
  geoCodeJson['geometry']['type'] = 'MultiPolygon';
  geoCodeJson['geometry']['coordinates'] = [json.features[0].geometry.rings];
  //console.log(geoCodeJson);
  return geoCodeJson;  
  
}


function ctaJson2geojson(json) {
  //converts the response json of the sfcta api into a geojson format that is readable by leaflet
  //allows this data to be added to a geoLayer and drawn on the map
  json["type"] = "Feature";
  json["geometry"] = JSON.parse(json.geometry);
  
}

function addGeoLayer(geoJsonData){
  let geolyr = L.geoJSON(geoJsonData,{ //this makes a geoJSON layer from
    //geojson data, which is required input. i is the style input
    style: color_styles[0].normal, 
    onEachFeature: function(feature, layer) { 
      layer.on({
        mouseover: function(e){
          //e.target.setStyle(color_styles[0].selected);
          e.target.bringToFront(); 
          if (address_geoLyr) {
            address_geoLyr.bringToFront();
          }
          info.update(e.target.feature);
        },
        mouseout: function(e){
          //geolyr.resetStyle(e.target);
          //e.target.setStyle(color_styles[0].normal);
          //is there a way where i can do highlighting with both of these different color paradigms?

        },
      });
    }
  });
  geolyr.addTo(mymap); //draws the created layer on the map
  return geolyr;
}

function getMax() {
  let outbounds = [];
  let filtered_json_object = filterDistributionData(modeSelect, addressDistrictNum, landUseSelect, tripPurposeSelect)[0];
  for (let district of geoDistricts) {
    let propName = "prop_dist" + district.dist;
    outbounds.push(filtered_json_object[propName]);

  }
  return Math.max.apply(null, outbounds);

}

function updateMap() {
  let input = app.address; // app.address is the user input. app refers to the VUE object below that handles
  let geocodedJson = queryServer(PLANNING_GEOCODER_baseurl+input, 0) //data has got to the geocoder
    .then(function(geocodedJson) { //after queryServer returns the data, do this:
      if (geocodedJson.features.length !== 0) { //checks if the server returns meaningful json (as opposed to empty)
        let geoJson = planningJson2geojson(geocodedJson); //this is the polygon
        address_geoLyr = L.geoJSON(geoJson,{ //this makes a geoJSON layer from geojson data, which is input
        style: color_styles[1].normal, //this is hardcoded to blue
        onEachFeature: function(feature, layer) { 

          layer.on({
            mouseover: function(e){
              e.target.setStyle(color_styles[1].selected);
              e.target.bringToFront();
              //getFilteredData(e.target.feature); //gets the filtered data according to various parameters
              //console.log("is it logging?");
              //info.update(e.target.feature); //updates the info box with text

            },
            mouseout: function(e){
              address_geoLyr.resetStyle(e.target);
            },
          });
        }
      });
        assignDistrict(geoJson, address_geoLyr, input);
      address_geoLyr.addTo(mymap); //adds the geoLayer to the map
      address_geoLyr.bringToFront();
     

      districts_lyr.setStyle(function(feature){
        let color_func = chroma.scale(['blue', 'red']).domain([0, getMax()]);
        let proportion_outbound = getFilteredData(feature)[0];
        return {'fillColor': color_func(proportion_outbound), fillOpacity:0.6};     
      }
      );
    }
    else {
      alert("The address is invalid or is outside the city limits of San Francisco. Enter another address.");
    }
  })
  }


//button functions
function pickAU(thing){
  modeSelect = "auto";
  app.isAUActive = true;
  app.isTRActive = false;
  app.isTaxiTNCActive = false;


  console.log("auto selected");

}
function pickTR(thing){
  modeSelect = "transit";
  app.isTRActive = true;
  app.isAUActive = false;
  app.isTaxiTNCActive = false;
  console.log("transit selected");

}


function pickTaxiTNC(thing){
  modeSelect = "taxiTNC";
  app.isTaxiTNCActive = true;
  app.isAUActive = false;
  app.isTRActive = false;
  console.log("taxi/tnc selected");


}

function getInputs(thing){
  if (app.isRes == true) {
    let num_studios = app.num_studios;
    let num_1bed = app.num_1bed;
    let num_2bed = app.num_2bed;
    let num_3bed = app.num_3bed;
    console.log(num_studios);
    console.log(num_1bed);
    console.log(num_2bed);
    console.log(num_3bed);
    
  }
  else if (app.isRet == true) {
    let ret_sqft = app.ret_sqft;
    console.log(ret_sqft);
  }
  else if (app.isOffice == true) {
    let off_sqft = app.off_sqft;
    console.log(off_sqft);
  }
  
}

function pickRes(thing){
  landUseSelect = "Res";
  app.isRes = true;
  app.isRet = false;
  app.isOffice = false;

}

function pickOffice(thing){
  landUseSelect = "Off";
  app.isOffice = true;
  app.isRes = false;
  app.isRet = false;


}

function pickRet(thing){
  landUseSelect = "Ret";
  app.isRet = true;
  app.isRes = false;
  app.isOffice = false;

}

function pickWork(thing){
  tripPurposeSelect = "work";
  console.log("work selected");
  app.isWork = true;
  app.isOther = false;


}

function pickOther(thing){
  tripPurposeSelect = "other";
  console.log("other/nonwork selected");
  app.isOther = true;
  app.isWork = false;


}


// Vue object connects what is done in the user interface html to the javascript. All the buttons
// in the right side panel are connected here. 
let app = new Vue({
  el: '#panel', //element is 'el' the whole right side of the map
  delimiters: ['${', '}'],
  data: {
    isAUActive: false,
    isTRActive: false,
    address: null,
    isOffice: false,
    isRes: false,
    isRet: false,
    isWork: false,
    isOther: false,
    off_sqft: null,
    ret_sqft: null,
    //res_sqft: null,
    num_studios: null,
    num_1bed: null,
    num_2bed: null,
    num_3bed: null,
    // isShared2Active: false,
    // isShared3Active: false,
    isTaxiTNCActive: false,
    inputs: false,

  },
   //this is for if you want to search directly from the box without the button, watch is
  // for detecting changes, sometimes it is not a button, it could be a checkbox or something
  // that isn't as straightforward as buttons, use watch
  watch: {
    num_studios: getInputs,
    num_1bed: getInputs,
    num_2bed: getInputs,
    num_3bed: getInputs,
    off_sqft: getInputs,
    ret_sqft: getInputs,

  },
  
  methods: {
    clickToggleHelp: clickToggleHelp,
    pickAU: pickAU,
    pickTR: pickTR,
    updateMap: updateMap,
    pickOffice: pickOffice,
    pickRes: pickRes,
    pickRet: pickRet,
    pickWork: pickWork,
    pickOther: pickOther,
    pickTaxiTNC: pickTaxiTNC,
    getInputs: getInputs,

  },
});

// eat some cookies -- so we can hide the help permanently
let cookieShowHelp = Cookies.get('showHelp');
function clickToggleHelp() {
  helpPanel.showHelp = !helpPanel.showHelp;

  // and save it for next time
  if (helpPanel.showHelp) {
    Cookies.remove('showHelp');
  } else {
    Cookies.set('showHelp', 'false', { expires: 365 });
  }
}

let helpPanel = new Vue({
  el: '#helpbox',
  data: {
    showHelp: cookieShowHelp == undefined,
  },
  methods: {
    clickToggleHelp: clickToggleHelp,
  },
  mounted: function() {
    document.addEventListener('keydown', e => {
      if (this.showHelp && e.keyCode == 27) {
        clickToggleHelp();
      }
    });
  },
});

function assignDistrict(address, geoLayer, tooltipLabel) {
  //convert the address geojson to leaflet polygon
  geoLayer.bindTooltip(tooltipLabel, {permanent: true, sticky:true}).addTo(mymap);

  let addressPolygon = L.polygon(address.geometry.coordinates[0]);
  //find the centroid of the address polygon
  let centroid = addressPolygon.getBounds().getCenter(); 
  let centroidArray = [centroid.lat, centroid.lng]; //reformat so that the lat/lon labels are correct
  //find out which districts contain the point
  let criticalDistrict = leafletPip.pointInLayer(centroidArray, districts_lyr);
  addressDistrictNum = criticalDistrict[0].feature.dist;

  return criticalDistrict;

}


function drawDistricts() {
  let districtName;
    for (let district of geoDistricts) { // in a for loop bc sfcta api returns a list of json for this one
    //calls json2geojson function to convert json data response to geojson
    ctaJson2geojson(district);
    districtName = district.distname;
    let districtPolygon = L.polygon(district.geometry.coordinates[0]);
    let districtCentroid = districtPolygon.getBounds().getCenter();
    let districtCentroidArray = [districtCentroid.lng, districtCentroid.lat]; //reformat so that the lat/lon labels are correct
    namePopup = L.popup()
    .setLatLng(districtCentroidArray)
    .setContent(districtName)
    //.openOn(mymap);
    
    let districtMarker = L.marker(districtCentroidArray, {draggable: true}).addTo(mymap).bindPopup(namePopup.getContent());
    markers.push(districtMarker);
  }
    districts_lyr = addGeoLayer(geoDistricts); //takes in a list of geoJson objects and draws them
  }

//save the geoDistricts data locally
queryServer(CTA_API_SERVER + DISTRICTS_URL)
.then(function(data) {
  geoDistricts = data;
  //console.log(geoDistricts);
  drawDistricts();
})





