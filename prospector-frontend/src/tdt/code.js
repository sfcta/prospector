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
//import App from './App'

import VueInputAutowidth from 'vue-input-autowidth'
Vue.use(VueInputAutowidth);

var maplib = require('../jslib/maplib');
let styles = maplib.styles;
let getLegHTML = maplib.getLegHTML;
let mymap = maplib.sfmap;
var numeral = require('numeral');
var leafletPip = require('@mapbox/leaflet-pip');
//var acc = require('accordion-js');
//leafletPip.bassackwards = true;

mymap.setView([37.76889, -122.440997], 12);


// some important constant variables.
const CTA_API_SERVER = 'https://api.sfcta.org/api/';
const DISTRICTS_URL = 'tia_dist12';
const PLACETYPES_URL = 'tia_place_type';
const CITY_URL = 'tia_san_francisco';
const TRIP_DISTRIBUTION = 'tia_distribution';
const TRIP_GEN_RTS = 'tia_tripgen';
const MODE_SPLITS = 'tia_modesplit';
const PLANNING_GEOCODER_baseurl = 'http://sfplanninggis.org/cpc_geocode/?search=';
const AVO_DATA = 'tia_avo';

let geoDistricts;
let geoPlaceTypes;
let geoCities;
let distributionData;
queryServer(CTA_API_SERVER + TRIP_DISTRIBUTION)
.then(function(data) {
  distributionData = data;

})

let mapLegend;

let modeSplits;
queryServer(CTA_API_SERVER + MODE_SPLITS)
.then(function(data){
  modeSplits = data;
  
})

let tripGenRates;
queryServer(CTA_API_SERVER + TRIP_GEN_RTS)
.then(function(data) {
  tripGenRates = data;
  app.ret_tripgen_daily = numeral(tripGenRates[3].daily_rate).format('0.0');
  app.res_tripgen_daily = numeral(tripGenRates[1].daily_rate).format('0.0');
  app.rest_tripgen_daily = numeral(tripGenRates[5].daily_rate).format('0.0');
  app.comp_tripgen_daily = numeral(tripGenRates[6].daily_rate).format('0.0');
  app.off_tripgen_daily = numeral(tripGenRates[0].daily_rate).format('0.0');
  app.sup_tripgen_daily = numeral(tripGenRates[4].daily_rate).format('0.0');
  app.hot_tripgen_daily = numeral(tripGenRates[2].daily_rate).format('0.0')

  app.ret_tripgen_PM = numeral(tripGenRates[3].pkhr_rate).format('0.0');
  app.res_tripgen_PM = numeral(tripGenRates[1].pkhr_rate).format('0.0');
  app.rest_tripgen_PM = numeral(tripGenRates[5].pkhr_rate).format('0.0');
  app.comp_tripgen_PM = numeral(tripGenRates[6].pkhr_rate).format('0.0');
  app.off_tripgen_PM = numeral(tripGenRates[0].pkhr_rate).format('0.0');
  app.sup_tripgen_PM = numeral(tripGenRates[4].pkhr_rate).format('0.0');
  app.hot_tripgen_PM = numeral(tripGenRates[2].pkhr_rate).format('0.0');
})

let AVO_data;
queryServer(CTA_API_SERVER + AVO_DATA)
.then(function(data){
  AVO_data = data;
})

let color_styles = [
  {normal: {"color": "#39f", "weight":3,  "opacity": 0.5},
   selected: {"color": "#33f",    "weight":4, "opacity": 0.5 },},
  {normal: {"fillColor": "#8B0000 ", "fillOpacity": 0.8 },
   selected: {"color": "#34784b", "weight":5, "opacity": 1.0, },},
  {normal: {"fillColor": "#000", "fillOpacity": 0.8, },
   selected: {"color": "#000", "weight":5, "opacity": 1.0,},},
  {normal: {"color": "#969696", "fillColor": "#969696", "fillOpacity": 0.3, "weight":2, "opacity": 1,},
   selected: {"color": "#43C1FC", "weight":1, "opacity": 1,},},
];

let pt_styles = [
  {normal: {'color': "#39F", "weight":5, 'opacity':0.5, 'fillOpacity':0.0},
   selected: {'color': "#f4df42", "weight":5, 'fillColor': "#f4df42", 'opacity': 1.0, 'fillOpacity': 0.2},},
];

//some global geolayer variables
let address_geoLyr;
let addressGroup;
let districts;
let districts_lyr;
let placetype_lyr;
let city_lyr;
let markers = []; //this is the list of all the district markers
let color_func;
let landUses = ["Residential", "Hotel", "Retail", "Supermarket", "Office", "Restaurant", "Composite"];
let modeTypes = ["auto", "transit", "tnc/taxi", "walk", "bike"]
let landUseToAttr;

//some other global variables
let addressDistrictNum; 
let addressDistrictName;
let addressPlaceType;
let selectedMode = 'auto';
let address; 
let landUseCheck = false; //starts out as false and is set to true on the first time a user

//selects a land use. it communicates that at least one land use has been specified by the user, enabling computation
let selectedPurpose = 'work'; 
let selectedDirection = 'inbound';
let selectedTimePeriod = 'daily';
let selectedDistribution = 'district';
let namePopup;

let infoDistrict = L.control(); 
let infoTotals = L.control();

infoDistrict.onAdd = function (map) {
  this._div = L.DomUtil.create('div', 'info'); // create a div with a class "info"
  this.update();
  return this._div;
};

infoTotals.onAdd = function (map) {
  this._div = L.DomUtil.create('div', 'infoTotals'); // create a div with a class "info"
  this.update();
  return this._div;
};


infoTotals.update = function() { 
  let message = '';
  if (addressDistrictNum == null || landUseCheck == false) {
    message = '<h4>Information</h4>';
    if (addressDistrictNum == null) {
      message += '<b>-Input an address</b>' ;
    }
    if (landUseCheck == false) {
      message += '<br><b>-Select a land use and enter project details</b>';
    }
  }
  else {
    message = '<table class="ui small very compact inverted table">';
    message += '<tr><th>Mode</th><th>Total</th><th>Filtered*</th></tr>';
    message += '<tr><td>Auto</td><td>' + roundToNearest(totalPersonTripsByMode["auto"]);
    message += '</td><td>' + roundToNearest(filteredPersonTripsByMode["auto"]) + '</td>';
    message += '<tr><td>Transit</td><td>' + roundToNearest(totalPersonTripsByMode["transit"]);
    message += '</td><td>' + roundToNearest(filteredPersonTripsByMode["transit"]) + '</td>';
    message += '<tr><td>Bike</td><td>' + roundToNearest(totalPersonTripsByMode["bike"]) ;
    message += '</td><td>' + roundToNearest(filteredPersonTripsByMode["bike"]) + '</td>';
    message += '<tr><td>TNC/Taxi</td><td>' + roundToNearest(totalPersonTripsByMode["tnc/taxi"]);
    message += '</td><td>' + roundToNearest(filteredPersonTripsByMode["tnc/taxi"]) + '</td>';
    message += '<tr><td>Walk</td><td>' + roundToNearest(totalPersonTripsByMode["walk"]) ;
    message += '</td><td>' + roundToNearest(filteredPersonTripsByMode["walk"]) + '</td>';
    message += '</table>';
    message += 'Filtered by: ' + selectedTimePeriod + ' ' + selectedDirection + ' ' + selectedPurpose;
    message += '<br><br><b>Total trips:</b> all daily trips, by all modes, purposes, and directions';
    message += '<br><b>Filtered trips:</b> trips filtered by selected toggle buttons for time period,';
    message += '<br>purpose, and direction';
    
  }
  this._div.innerHTML = message; 
};

infoDistrict.update = function (hoverDistrict) { //hoverDistrict is the mouseover target defned in updateMap
  let message = '';
  if (addressDistrictNum == null || landUseCheck == false) {
    message = '';
  }
  else if (hoverDistrict == null) {
    message = '<h4>Information</h4>' + '<b> Hover over a district to see filtered trips by mode </b>';
  }
  else {
    message = '<h4>';
    switch(selectedTimePeriod) {
      case 'daily':
        message += 'Daily';
        break;
      case 'pm':
        message += 'PM Peak Period';
    }
    switch(selectedPurpose) {
      case 'work':
        message += ' Work';
        break;
      case 'non-work':
        message += ' Non-Work';
        break;
      case 'work and non-work':
        message += ' Work and Non-Work';
        break;
    }
    switch(selectedMode) {
      case 'auto':
        message += ' Trips by Auto';
        break;
      case 'tnc/taxi':
        message += ' Trips by TNC/Taxi';
        break;
      case 'transit':
        message += ' Trips by Transit';
    }
    message += '<br>';
    switch(selectedDirection) {
      case 'outbound': 
        message += ' Outbound From' + address + ' to ';
        break;
      case 'inbound': 
        message += ' Inbound To ' + address + ' from ';
        break;
      default: 
        message += ' Inbound/Outbound ' + address + ' from/to ';
        break;
    }
    message += hoverDistrict.distname.toString() + ' </h4>';
    message += "Person trips: "+ "<b>" +  roundToNearest(districtPersonTrips[hoverDistrict.dist]["total"]) +'</b>';
    if (selectedMode !== "transit"){
        message += '<br>' + "Vehicle trips: "+ "<b>"+ roundToNearest(districtVehicleTrips[hoverDistrict.dist]["total"]) +'</b>';
        let avo = districtVehicleTrips[hoverDistrict.dist]["total"] / districtPersonTrips[hoverDistrict.dist]["total"]
        message += '<br>' + "Avg Veh Occ: " + "<b>"+ roundToNearest(avo,1)
      }
  }
  this._div.innerHTML = message;
};

infoTotals.addTo(mymap);
infoDistrict.addTo(mymap);

function queryServer(url){
  var promise = new Promise(function(resolve, reject) {
    fetch(url)
    .then((resp) => resp.json())
    .then(function(jsonData) {
      resolve(jsonData)
    })
    .catch(function(error) {
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
  return geoCodeJson;  
}

function ctaJson2geojson(json) {
  //converts the response json of the sfcta api into a geojson format that is readable by leaflet
  //allows this data to be added to a geoLayer and drawn on the map
  json["type"] = "Feature";
  json["geometry"] = JSON.parse(json.geometry);
}

function addDistrictGeoLayer(geoJsonData, tooltip_positions){
  let districtMarker;
  let geolyr = L.geoJSON(geoJsonData,{ //this makes a geoJSON layer from
    //geojson data, which is required input. i is the style input
    style: color_styles[3].normal, 
    onEachFeature: function(feature, layer) { 
      layer.on({
        mouseover: function(e){
          //e.target.setStyle(color_styles[3].normal);
          //e.target.bringToFront(); 
          if (districtMarker){
            districtMarker.unbindTooltip();
            mymap.removeLayer(districtMarker);
          }
          districtMarker = L.circleMarker(tooltip_positions[feature.dist], {color: 'blue', radius: 1}).addTo(mymap).bindTooltip(feature.distname, {permanent:true, sticky: true});
        infoDistrict.update(e.target.feature); 
        infoTotals.update();
        },
        mouseout: function(e){
        },
      });
    }
  });
  geolyr.addTo(mymap);
  return geolyr;
}

function addPlaceTypeGeoLayer(geoJsonData){
  let geolyr = L.geoJSON(geoJsonData,{ //this makes a geoJSON layer from
    style: pt_styles[0].normal, 
  });
  return geolyr;
}

function addCityGeoLayer(geoJsonData){
  let geolyr = L.geoJSON(geoJsonData,{ //this makes a geoJSON layer from
    style: pt_styles[0].normal, 
  });
  return geolyr;
}

function getMax() {
  let distributions = [];
  if (selectedMode && landUseCheck && selectedPurpose && selectedDirection 
  && addressDistrictNum && selectedTimePeriod){ //not sure if this last check is correct
    for (let key of Object.keys(districtPersonTrips)){
      distributions.push(districtPersonTrips[key]["total"]);
    }
    return Math.max.apply(null, distributions);
  }
}

function filterDistributionData(sourceGeoType, sourceGeoTypeKey, mode, direction, landUse, timePeriod, purpose) { 
  //returns a json object or list of json objects that fit given parameters   
  return distributionData.filter(function(piece){ 
    return piece.geo_type == sourceGeoType && piece.geo_id == sourceGeoTypeKey && piece.mode == mode &&
    piece.landuse == landUse && piece.purpose == purpose && piece.direction == direction && 
    piece.time_period == timePeriod;
  }); 
}

function getDistProps(sourceGeoType, sourceGeoTypeKey, targetDistrict, mode, direction, landUse, timePeriod, purpose) {
  // geoType is district, place_type, or city
  // geoTypeKey is the id associated with the geoType: 1-12 for district, 1-3 for place_type, 1 for city
  // direction is inbound, outbound, or both
  // landUse is residential, retail, office, hotel, supermarket, or restaurant
  // timePeriod is daily or pm
  let data;
  let districtFieldName = "prop_dist" + targetDistrict.dist; //the field name for the target district
  
  if (selectedMode && landUseCheck==true && selectedPurpose && selectedDirection && addressDistrictNum && selectedTimePeriod){
    //this returns a number not an object
    console.log(filterDistributionData(sourceGeoType, sourceGeoTypeKey, targetDistrict, mode, direction, landUse, timePeriod, purpose));
    data = filterDistributionData(sourceGeoType, sourceGeoTypeKey, mode, direction, landUse, timePeriod, purpose)[0][districtFieldName];
    console.log(data)
    return data;
  }   
}

function filterModeSplitData(landUse, placetype){
  //trying to access the proportion that corresponds with a given land use, placetype and mode
  if (selectedMode && landUseCheck==true && app.placetype != ''){
    return modeSplits.filter(function(piece){
      return (piece.place_type == placetype && piece.landuse == landUse);
    });
  }
}

function filterAvoData(landUse, geoType, geoTypeKey){
  //trying to access the proportion that corresponds with a given land use, placetype and mode
  let key;
  switch(geoType) {
    case "district":
      key = "District " + geoTypeKey;
      break;
    case "place-type":
      key = "Place Type " + geoTypeKey;
      break;
    case "city":
      key = "San Francisco"
      break;
  }
  
  return AVO_data.filter(function(piece){                   //how to deal with land use?
    return (piece.geography == key);
  })[0][landUse];
}

function addAddressTooltipToMap() {
  if (mymap.hasLayer(address_geoLyr)) {
    mymap.removeLayer(address_geoLyr);
  }
  
  address = app.address; // app.address is the user input. app refers to the VUE object below that handles
  if (address == null) {
    return
  }
  let geocodedJson = queryServer(PLANNING_GEOCODER_baseurl+address, 0) //data has got to the geocoder
  .then(function(geocodedJson) { //after queryServer returns the data, do this:
    //if (geocodedJson.features.length !== 0 && selectedMode && landUseCheck==true && selectedPurpose && 
    //  selectedDirection && selectedTimePeriod) {
      let geoJson = planningJson2geojson(geocodedJson); //this is the polygon
      address_geoLyr = L.geoJSON(geoJson,{ //this makes a geoJSON layer from geojson data, which is input
        style: color_styles[1].normal, //this is hardcoded to blue
        onEachFeature: function(feature, layer) {
        layer.on({
          mouseover: function(e){
            //e.target.setStyle(color_styles[1].selected);
            //e.target.bringToFront();
          },
          mouseout: function(e){
            address_geoLyr.resetStyle(e.target);
          },
        });
       }
      });
      address_geoLyr.bindTooltip(address, {permanent: true, className:'myCSSClass'}).addTo(mymap);
      assignDistrict(geoJson);
      updateMap();
    });
}

function updateMap() {
  landUseToAttr = {'Residential':{'rate_key':1, 'scalar': app.num_studios+app.num_1bed+2*app.num_2bed+2*app.num_3bed,
                     'unit':'Bedrooms', 'proxyLandUse':'Residential'},
                 'Office':{'rate_key':0, 'scalar': app.off_sqft/1000,
                     'unit':'Square Feet', 'proxyLandUse':'Office'},
                 'Retail':{'rate_key':3, 'scalar': app.ret_sqft/1000,
                     'unit':'Square Feet', 'proxyLandUse':'Retail'},
                 'Restaurant':{'rate_key':5, 'scalar': app.rest_sqft/1000,
                     'unit':'Square Feet', 'proxyLandUse':'Retail'},
                 'Composite':{'rate_key':6, 'scalar': app.comp_sqft/1000,
                     'unit':'Square Feet', 'proxyLandUse':'Retail'},
                 'Supermarket':{'rate_key':4, 'scalar': app.sup_sqft/1000,
                     'unit':'Square Feet', 'proxyLandUse':'Retail'},
                 'Hotel':{'rate_key':2, 'scalar': app.hot_rooms,
                     'unit':'Rooms', 'proxyLandUse':'Retail'},
  }
  getFilteredTripsByDistrict();
  getTotalTrips();
  //coloring the districts
  
  let trips = []
  districts_lyr.setStyle(function(feature){
    let style;
    
    color_func = chroma.scale(['#eff3ff', '#bdd7e7' ,'#6baed6','#3182bd','#08519c']).domain([0, getMax()], 4, 'equal interval');
    //#ffffe0 #ffd59b #ffa474 #f47461 #db4551 #b81b34 #8b0000
    let tot_person_trips = districtPersonTrips[feature.dist]["total"];
    trips.push(tot_person_trips);

    if (trips.reduce((a, b) => a + b, 0) == 0){
      //if all the districts have 0 person trips, force the fill color to be light blue
      style = {'color': '#444444', 'weight': 2, 'fillColor': '#c6dbef', fillOpacity:0.6};
    }
    else{
      //otherwise, color the districts according to the chroma color function
      style = {'color': '#444444', 'weight': 2, 'fillColor': color_func(tot_person_trips), fillOpacity:0.6};
    }
    return style
  });
  
  //sort the person trips from all the districts in order
  trips.sort(function(a, b){return a - b});

  let labels = [];
  let colors = [];
  
  //get the breakpoints from the chroma quantiles function on the trips array 
  let breakpoints = chroma.limits(trips, 'e', 4);

  //get rid of any duplicate breakpoints b/c only want unique labels on the legend
  let unique_breakpoints = breakpoints.filter((v, i, a) => a.indexOf(v) === i);

  for (let breakpoint of unique_breakpoints) {
    if (breakpoint == 0){
      labels.push(roundToNearest((breakpoint)));
    }
    else{
      labels.push("<=" + Math.round(breakpoint));
    }
    if (unique_breakpoints.reduce((a, b) => a + b, 0) == 0){
      colors.push("#c6dbef"); 
    }
    else {
      colors.push(color_func(roundToNearest(breakpoint)));
    }
  }
  
  //building and styling the legend for the districts
  if (mapLegend) mymap.removeControl(mapLegend);
  mapLegend = L.control({ position: 'bottomright' });

  mapLegend.onAdd = function(map) {
    let div = L.DomUtil.create('div', 'info legend');
    let units = [" "];
    
    //I am not sure that the colors correctly match
    let legHTML = getLegHTML(labels, colors, false, units);

    for (var i = 0; i < labels.length; i++) {
      div.innerHTML = '<h4>' + "Person Trips" + '</h4>' + legHTML;
    }
    return div;
  };
  
  mapLegend.addTo(mymap);
  infoTotals.update();
}

function roundToNearest(number, precision=0) {
  let scale = Math.pow(10, precision);
  return Math.round(number * scale) / scale;
}

let totalPersonTripsByMode = {};
let totalVehicleTripsByMode = {};
let filteredPersonTripsByMode = {};
let filteredVehicleTripsByMode = {};

function getTotalTrips(){
  let num_studios = app.num_studios;
  let num_1bed = app.num_1bed;
  let num_2bed = app.num_2bed;
  let num_3bed = app.num_3bed;
  let tot_num_bedrooms = num_studios + num_1bed + (2*app.num_2bed) + (2*app.num_3bed);
  let totalPersonTrips = {}; // key is landUse
  let totalVehicleTrips = {}; // key is landUse
  let filteredPersonTrips = {};
  let filteredVehicleTrips = {};
  let geoId; 
  let attr;
  let rate;
  let rate_key;
  let unit;
  let scalar;
  let proxyLandUse;
  let filtered_rate;
  
  switch(selectedDistribution) {
      case 'district':
        geoId = addressDistrictNum;
        break;
      case 'place-type':
        geoId = addressPlaceType;
        break;
      case 'city':
        geoId = 1;
        break;
      default:
        geoId = addressDistrictNum;
        break;
    }
    //the computations below happen without the direction and distrbution data multiplications
  for (let mode of modeTypes){
    for (let landUse of landUses) {
      attr = landUseToAttr[landUse];
      rate_key = attr['rate_key'];
      scalar = attr['scalar'];
      unit = attr['unit'];
      proxyLandUse = attr['proxyLandUse'];
      
      switch (selectedTimePeriod) {
        case 'pm':
          filtered_rate = tripGenRates[rate_key].pkhr_rate;
          break;
        case 'daily':
          filtered_rate = tripGenRates[rate_key].daily_rate;
          break;
      }
      rate = tripGenRates[rate_key].daily_rate; 
      
      // postgreSQL can't have slash in field name, so this is necessary as long as the mode continues to have slash
      let mode2=mode;
      if (mode == 'tnc/taxi'){
        mode2='tnc_taxi';
      }
      // note that all modes are displayed regardless of selected mode, so don't filter by mode here.
      totalPersonTrips[landUse] = (rate*scalar)*filterModeSplitData(proxyLandUse, app.placetype)[0][mode2];
      filteredPersonTrips[landUse] = (filtered_rate*scalar)*filterModeSplitData(proxyLandUse, app.placetype)[0][mode2];
      
      let filteredProp=0;
      // TO DO: Need to include walk/bike in database.  This is a hack b/c active modes don't matter for now.
      if (mode != 'walk' && mode !='bike'){
        for (let district of geoDistricts) {
          filteredProp += getDistProps(selectedDistribution, geoId, district, mode, selectedDirection, proxyLandUse, selectedTimePeriod, selectedPurpose);
        }
      }
      else {
        filteredProp=1;
      }
      filteredPersonTrips[landUse] = filteredPersonTrips[landUse] * filteredProp;

      if (mode=='auto'){
        let avo = filterAvoData(proxyLandUse.toLowerCase(), selectedDistribution, geoId);
        totalVehicleTrips[landUse] = totalPersonTrips[landUse]/ avo;
        filteredVehicleTrips[landUse] = filteredPersonTrips[landUse] / avo;
      }
      else {
        totalVehicleTrips[landUse] = totalPersonTrips[landUse];
        filteredVehicleTrips[landUse] = filteredPersonTrips[landUse] * filteredProp;
      }
    }
    totalPersonTrips["total"] = 0;
    totalVehicleTrips["total"] = 0;
    filteredPersonTrips["total"] = 0;
    filteredVehicleTrips["total"] = 0;
    for (let landUse of landUses) {
      if (!(totalPersonTrips[landUse])){
        totalPersonTrips[landUse] == 0;
      }
      if (!(totalVehicleTrips[landUse])){
        totalVehicleTrips[landUse] == 0;
      }
      if (!(filteredPersonTrips[landUse])){
        filteredPersonTrips[landUse] == 0;
      }
      if (!(filteredVehicleTrips[landUse])){
        filteredVehicleTrips[landUse] == 0;
      }
      totalPersonTrips["total"] += totalPersonTrips[landUse];
      totalVehicleTrips["total"] += totalVehicleTrips[landUse];
      filteredPersonTrips["total"] += filteredPersonTrips[landUse];
      filteredVehicleTrips["total"] += filteredVehicleTrips[landUse];
    }
    totalPersonTripsByMode[mode] = totalPersonTrips["total"];
    totalVehicleTripsByMode[mode] = totalVehicleTrips["total"];
    filteredPersonTripsByMode[mode] = filteredPersonTrips["total"];
    filteredVehicleTripsByMode[mode] = filteredVehicleTrips["total"];
  }
}

let districtPersonTrips = {}; // {key = district number, value = person trips corresponding to this district}
let districtVehicleTrips = {};

// Calculates the number of person trips for each of districts
// filtered by selected purpose, mode, direction, timePeriod, selectedDistribution
// and aggregates districts to region
function getFilteredTripsByDistrict(){
  let num_studios = app.num_studios;
  let num_1bed = app.num_1bed;
  let num_2bed = app.num_2bed;
  let num_3bed = app.num_3bed;
  let tot_num_bedrooms = num_studios + num_1bed + (2*app.num_2bed) + (3*app.num_3bed);
  let attr;
  let rate;
  let rate_key;
  let unit;
  let scalar;
  let proxyLandUse;
  
  for (let district of geoDistricts) {
    let personTrips = {};
    let vehicleTrips = {};
    let totalPersonTrips = {};
    let totalVehicleTripsByMode = {};
    let geoId;
    
    switch(selectedDistribution) {
      case 'district':
        geoId = addressDistrictNum;
        break;
      case 'place-type':
        geoId = addressPlaceType;
        break;
      case 'city':
        geoId = 1;
        break;
      default:
        geoId = addressDistrictNum;
        break;
    }
    
    for (let landUse of landUses) {
      attr = landUseToAttr[landUse];
      rate_key = attr['rate_key'];
      scalar = attr['scalar'];
      unit = attr['unit'];
      proxyLandUse = attr['proxyLandUse'];
      
      switch (selectedTimePeriod) {
        case 'pm':
          rate = tripGenRates[rate_key].pkhr_rate;
          break;
        case 'daily':
          rate = tripGenRates[rate_key].daily_rate;
          break;
      }
      
      let mode2=selectedMode;
      if (selectedMode == 'tnc/taxi'){
        mode2='tnc_taxi';
      }
      personTrips[landUse] = (rate*scalar)*filterModeSplitData(proxyLandUse, app.placetype)[0][mode2]*            
                              getDistProps(selectedDistribution, geoId, district,
                                           selectedMode, selectedDirection, proxyLandUse,
                                           selectedTimePeriod, selectedPurpose)
      vehicleTrips[landUse] = personTrips[landUse]/(filterAvoData(proxyLandUse.toLowerCase(), selectedDistribution, geoId));
    }
    //if any of the land uses are undefined b/c no input, set them equal to 0. landUses is a global array of all 5 land uses
    personTrips["total"] = 0
    vehicleTrips["total"] = 0
    for (let landUse of landUses) {
      if (!(personTrips[landUse])){
        personTrips[landUse] == 0;
      }
      if (!(vehicleTrips[landUse])){
        vehicleTrips[landUse] == 0;
      }
      personTrips["total"] += personTrips[landUse]
      vehicleTrips["total"] += vehicleTrips[landUse]
    }
    districtPersonTrips[district.dist] = personTrips; //this creates a dictionary of dictionaries, with one dictionary for every district where the keys are the land uses/total
    //and the dictionary is populated by the time period
    districtVehicleTrips[district.dist] = vehicleTrips;
    console.log(district);
  }
}

function clearAllInputs(){
  landUseCheck = false;
  app.isModeAuto = true;
  app.isModeTransit = false;
  app.isModeTaxi = false;
  app.address=  null;
  app.isOffice = false;
  app.isResidential = false;
  app.isRetail = false;
  app.isRestaurant = false;
  app.isSupermarket = false;
  app.isHotel = false;
  app.isPurposeWork = true;
  app.isPurposeNonWork = false;
  app.isPurposeAll = false;
  app.isDirectionInbound = true;
  app.isDirectionOutbound = false;
  app.isDirectionBoth = false;
  app.isTimePeriodDaily = true;
  app.isTimePeriodPM = false;
  app.off_sqft = 0;
  app.ret_sqft = 0;
  app.rest_sqft = 0;
  app.comp_sqft = 0;
  app.sup_sqft = 0;
  app.hot_rooms = 0;
  app.num_studios = 0;
  app.num_1bed = 0;
  app.num_2bed = 0;
  app.num_3bed = 0;
  
  
  app.placetype = '';
  //this doesn't seem to be doing anything
  //districts_lyr.resetStyle(color_styles[0].normal);
  districts_lyr.setStyle(color_styles[3].normal);
  if (mapLegend) mymap.removeControl(mapLegend);
  if (address_geoLyr){
    mymap.removeLayer(address_geoLyr);
    //this works but removing the layer is not the ideal situation. I'd rather keep the layer and just recolor it.
    //mymap.removeLayer(districts_lyr);
  }
  infoDistrict.update();
  infoTotals.update();
}

function resetAllInputs(){
  landUseCheck = false;
  app.isRetail = false;
  app.isResidential = false;
  app.isOffice = false;
  app.isRestaurant = false;
  app.isSupermarket = false;
  app.isHotel = false;
  app.address=  null;
  pickMode('auto');
  pickPurpose('work');
  pickDirection('inbound');
  pickTimePeriod('daily');
  pickDistribution('district');
  app.off_sqft = null;
  app.ret_sqft = null;
  app.rest_sqft = null;
  app.comp_sqft = null;
  app.sup_sqft = null;
  app.hot_rooms = null;
  app.num_studios = null;
  app.num_1bed = null;
  app.num_2bed = null;
  app.num_3bed = null;
  
  app.placetype = '';
  //this doesn't seem to be doing anything
  //districts_lyr.resetStyle(color_styles[0].normal);
  districts_lyr.setStyle(color_styles[3].normal);
  if (mapLegend) mymap.removeControl(mapLegend);
  if (address_geoLyr){
    mymap.removeLayer(address_geoLyr);
    //this works but removing the layer is not the ideal situation. I'd rather keep the layer and just recolor it.
    //mymap.removeLayer(districts_lyr);
  }
  updateMap();
  //infoDistrict.update();
  //infoTotals.update();
}

//button functions
function pickMode(mode){
  selectedMode = mode;
  app.isModeAuto = false;
  app.isModeTransit = false;
  app.isModeTaxi = false;
  
  switch(mode) {
    case "auto":
    app.isModeAuto = true;
    break;
    case "transit":
    app.isModeTransit = true;
    break;
    case "tnc/taxi":
    app.isModeTaxi = true;
    break;
  }
  updateMap();
}

function pickPurpose(purpose){
  selectedPurpose = purpose;
  app.isPurposeWork = false;
  app.isPurposeNonWork = false;
  app.isPurposeAll = false;
  
  switch(purpose) {
    case "work":
    app.isPurposeWork = true;
    break;
    case "non-work":
    app.isPurposeNonWork = true;
    break;
    case "work and non-work":
    app.isPurposeAll = true;
    break;
  }
  updateMap();
}

function pickDirection(direction){
  selectedDirection = direction;
  app.isDirectionInbound = false;
  app.isDirectionOutbound = false;
  app.isDirectionBoth = false;
  
  switch(direction) {
    case "inbound":
    app.isDirectionInbound = true;
    break;
    case "outbound":
    app.isDirectionOutbound = true;
    break;
    case "inbound and outbound":
    app.isDirectionBoth = true;
    break;
  }
  updateMap();
}

function pickTimePeriod(timePeriod){
  selectedTimePeriod = timePeriod;
  app.isTimePeriodPM = false;
  app.isTimePeriodDaily = false;
  
  switch(timePeriod) {
    case "pm":
    app.isTimePeriodPM = true;
    break;
    case "daily":
    app.isTimePeriodDaily = true;
    break;
  }
  updateMap();
}

function accord(thing){
  landUseCheck = true;
  $(".ui.accordion").accordion();
}

function pickDistribution(distribution){
  selectedDistribution = distribution;
  app.isDistributionDistrict = false;
  app.isDistributionPlaceType = false;
  app.isDistributionCity = false;
  
  switch(distribution) {
    case "district":
    app.isDistributionDistrict = true;
    break;
    case "place-type":
    app.isDistributionPlaceType = true;
    break;
    case "city":
    app.isDistributionCity = true;
    break;
  }
  updateMap();
  updateBoundary(selectedDistribution);
}
  
function updateBoundary(boundary_type) {
  if (boundary_type == 'district') {
    if (mymap.hasLayer(placetype_lyr)) {
      mymap.removeLayer(placetype_lyr);
    }
    if (mymap.hasLayer(city_lyr)) {
      mymap.removeLayer(city_lyr);
    }
  }
  else if (boundary_type == 'place-type') {
    if (mymap.hasLayer(city_lyr)) {
      mymap.removeLayer(city_lyr);
    }
    
    if (! mymap.hasLayer(placetype_lyr)) {
      placetype_lyr.setStyle(function(feature){
        if (feature.place_type == addressPlaceType) {
          return pt_styles[0].selected;
        }
        else {
          return pt_styles[0].normal;
        }
      });
      placetype_lyr.addTo(mymap);
      placetype_lyr.bringToBack();
    }
  }
  else if (boundary_type == 'city') {
    if (mymap.hasLayer(placetype_lyr)) {
      mymap.removeLayer(placetype_lyr);
    }
    if (! mymap.hasLayer(city_lyr)) {
      city_lyr.setStyle(function(feature) {
        return pt_styles[0].selected;
      });
      city_lyr.addTo(mymap);
      city_lyr.bringToBack();
    }
  }
}

// Vue object connects what is done in the user interface html to the javascript. All the buttons
// in the right side panel are connected here. 
let app = new Vue({
  el: '#panel', //element is 'el' the whole right side of the map
  delimiters: ['${', '}'],
  data: {
    isModeAuto: true,
    isModeTransit: false,
    address: null,
    isOffice: false,
    isResidential: false,
    isRetail: false,
    isRestaurant: false,
    isSupermarket: false,
    isHotel: false,
    isPurposeWork: true,
    isPurposeNonWork: false,
    isPurposeAll: false,
    isDirectionInbound: true,
    isDirectionOutbound: false,
    isDirectionBoth: false,
    isTimePeriodDaily: true,
    isTimePeriodPM: false,
    isDistributionDistrict: true,
    isDistributionPlaceType: false,
    isDistributionCity: false,
    off_sqft: null,
    ret_sqft: null,
    rest_sqft: null,
    comp_sqft: null,
    sup_sqft: null,
    hot_rooms: null,
    num_studios: null,
    num_1bed: null,
    num_2bed: null,
    num_3bed: null,
    isModeTaxi: false,
    inputs: false,
    placetype: '',
    placetype_text: '',
    res_tripgen_daily: '',
    
  },
  watch: {
  },
  
  methods: {
    clickToggleHelp: clickToggleHelp,
    clickToggleInstructions: clickToggleInstructions,
    pickMode: pickMode,
    pickPurpose: pickPurpose,
    pickDirection: pickDirection,
    pickTimePeriod: pickTimePeriod,
    pickDistribution: pickDistribution,
    
    updateMap: updateMap,
    addAddressTooltipToMap: addAddressTooltipToMap,
    clearAllInputs: clearAllInputs,
    resetAllInputs: resetAllInputs,

    accord: accord,

    getFilteredTripsByDistrict: getFilteredTripsByDistrict,
    //getFilteredTrips: getFilteredTrips
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


let cookieInstructions = Cookies.get('showInstructions');
function clickToggleInstructions() {
  instructionsPanel.showInstructions = !instructionsPanel.showInstructions;

  // and save it for next time
  if (instructionsPanel.showInstructions) {
    Cookies.remove('showInstructions');
  } else {
    Cookies.set('showInstructions', 'false', { expires: 365 });
  }
}

let instructionsPanel = new Vue({
  el: '#instructionsBox',
  data: {
    showInstructions: cookieInstructions == undefined,
  },
  methods: {
    clickToggleInstructions: clickToggleInstructions,
  },
  mounted: function() {
    document.addEventListener('keydown', e => {
      if (this.showInstructions && e.keyCode == 27) {
        clickToggleInstructions();
      }
    });
  },
});

function assignDistrict(address) {
  //convert the address geojson to leaflet polygon
  let addressPolygon = L.polygon(address.geometry.coordinates[0]);
  //find the centroid of the address polygon
  let centroid = addressPolygon.getBounds().getCenter(); 
  let centroidArray = [centroid.lat, centroid.lng]; //reformat so that the lat/lon labels are correct
  //find out which districts contain the point
  let criticalDistrict = leafletPip.pointInLayer(centroidArray, districts_lyr);
  addressDistrictNum = criticalDistrict[0].feature.dist;
  addressDistrictName = criticalDistrict[0].feature.distname;
  addressPlaceType = criticalDistrict[0].feature.place_type;
  //find out which place type the address district is in
  app.placetype = criticalDistrict[0].feature.place_type;
  
  switch(app.placetype) {
    case 1:
      app.placetype_text = "Urban high density";
      break;
    case 2:
      app.placetype_text = "Urban medium density";
      break;
    case 3:
      app.placetype_text = "Urban low density";
      break;
    default:
      app.placetype_text = "Unknown";
      break;
  }
  
}

function drawDistricts() {
  let tooltip_positions = {
    1: [37.799981, -122.412459],
    2: [37.775795, -122.407478],
    3: [37.789693, -122.441499],
    4: [37.760652, -122.400000],
    5: [37.737820, -122.445233],
    6: [37.730118, -122.389315],
    7: [37.776303, -122.499615],
    8: [37.745433, -122.498202],
    9: [37.825639, -122.371648],
    10: [37.596137, -122.403582],
    11: [37.810595, -122.288403],
    12: [37.835095, -122.493132] };
  //let districtName;
  for (let district of geoDistricts) { // in a for loop bc sfcta api returns a list of json for this one
    //calls json2geojson function to convert json data response to geojson
    ctaJson2geojson(district);
  }
  districts_lyr = addDistrictGeoLayer(geoDistricts, tooltip_positions); //takes in a list of geoJson objects and draws them
}

//save the geoDistricts data locally
queryServer(CTA_API_SERVER + DISTRICTS_URL)
.then(function(data) {
  geoDistricts = data;
  drawDistricts();
})

function drawPlaceTypes() {
  for (let pt of geoPlaceTypes) { // in a for loop bc sfcta api returns a list of json for this one
    //calls json2geojson function to convert json data response to geojson
    ctaJson2geojson(pt);
  }
  placetype_lyr = addPlaceTypeGeoLayer(geoPlaceTypes)
}
queryServer(CTA_API_SERVER + PLACETYPES_URL)
  .then(function(data) {
  geoPlaceTypes = data;
  drawPlaceTypes();
})

function drawCity() {
  for (let pt of geoCities) { // in a for loop bc sfcta api returns a list of json for this one
    //calls json2geojson function to convert json data response to geojson
    ctaJson2geojson(pt);
  }
  city_lyr = addCityGeoLayer(geoCities)
}
queryServer(CTA_API_SERVER + CITY_URL)
  .then(function(data) {
  geoCities = data;
  drawCity();
})
//browser check function
// function msieversion(){
//   let ua = window.navigator.userAgent;
//   let msie = au.indexOf("MSIE ");
//   if (msie & gt; 0 || !!navigator.userAgent.match()) { //if IE, return true //
//     return true;
//   }
//   else {
//     return false;
//   }
//   return false;
// }


//this is the downloading part

let avo_download;
let trgen_download; //an array of dictionaries -> "a list of json"
let tdist_download;
let modesplit_download; 
let tdist_person_download;
let tdist_vehicle_download;
let total_person_dist;
let total_vehicle_dist;
let total_trips_download;

function createDownloadObjects() {
  // each of the downloads is a list of dicts, where the key is a column header
  // and the value becomes a cell value in that column
  avo_download = [];
  trgen_download = []; 
  tdist_download = [];
  modesplit_download = [];
  tdist_vehicle_download = [];
  total_person_dist = 0;
  total_vehicle_dist = 0;
  total_trips_download = [];
  let attr;
  let rate_key;
  let scalar;
  let unit;
  let proxyLandUse;
  let daily_rate;
  let pm_rate;
  let tmp_dwld;
  let tmp_dwld_vehicle;
  
  let tot_num_bedrooms = app.num_studios+app.num_1bed+2*app.num_2bed+2*app.num_3bed;
  let tot_daily = 0;
  let tot_pm = 0;

  for (let landUse of landUses){
    attr = landUseToAttr[landUse];
    rate_key = attr['rate_key'];
    scalar = attr['scalar'];
    unit = attr['unit'];
    proxyLandUse = attr['proxyLandUse'];
    pm_rate = tripGenRates[rate_key].pkhr_rate;
    daily_rate = tripGenRates[rate_key].daily_rate;
    
    // Average Vehicle Occupancy
    tmp_dwld = {};
    tmp_dwld['Landuse'] = landUse;
    tmp_dwld['District'] = addressDistrictName;
    tmp_dwld['District AVO'] = filterAvoData(proxyLandUse.toLowerCase(), 'district', addressDistrictNum);
    //avo_download.push(tmp_dwld);
    //tmp_dwld['Landuse'] = landUse;
    tmp_dwld['Place Type'] = app.placetype_text;
    tmp_dwld['Place Type AVO'] = filterAvoData(proxyLandUse.toLowerCase(), 'place-type', addressPlaceType);
    tmp_dwld['City'] = 'San Francisco'
    tmp_dwld['City AVO'] = filterAvoData(proxyLandUse.toLowerCase(), 'city', 'San Francisco');
    avo_download.push(tmp_dwld);
    
    // Trip Generation
    tmp_dwld = {};
    tmp_dwld['Landuse'] = landUse;
    tmp_dwld['Amount'] = scalar;
    tmp_dwld['Unit'] = 'Per Bedroom';
    tmp_dwld['Daily_Person_Rate'] = daily_rate.toString();
    tmp_dwld['Daily_Person_Trips'] = (scalar*daily_rate).toString();
    tot_daily += scalar*daily_rate;
    tmp_dwld['PM_Person_Rate'] = pm_rate.toString();
    tmp_dwld['PM_Person_Trips'] = (scalar*pm_rate).toString();
    tot_pm += scalar*pm_rate;
    trgen_download.push(tmp_dwld);
    
    // Mode Split
    tmp_dwld = {};
    tmp_dwld['Landuse'] = landUse;
    tmp_dwld['transit modesplit'] = filterModeSplitData(proxyLandUse, app.placetype)[0]["transit"].toString();
    tmp_dwld['all auto modesplit'] = filterModeSplitData(proxyLandUse, app.placetype)[0]["auto"].toString();
    tmp_dwld['taxi modesplit'] = filterModeSplitData(proxyLandUse, app.placetype)[0]["tnc_taxi"].toString();
    tmp_dwld['walk modesplit'] = filterModeSplitData(proxyLandUse, app.placetype)[0]["walk"].toString();
    tmp_dwld['bike modesplit'] = filterModeSplitData(proxyLandUse, app.placetype)[0]["bike"].toString();
    modesplit_download.push(tmp_dwld);
    
    // Person-trip Distribution
    // TODO: is there a reason for this loop?  Is this already available in the totals dictionary?
    tmp_dwld = {};
    tmp_dwld['Landuse'] = landUse;
    for (let district of geoDistricts) {
      tmp_dwld[district.distname] = districtPersonTrips[district.dist][landUse].toString();
      total_person_dist += tmp_dwld[district.distname];
    }
    tdist_download.push(tmp_dwld);
    
    // Vehicle-trip Distribution
    tmp_dwld_vehicle = {};
    tmp_dwld_vehicle['Landuse'] = landUse;
    for (let district of geoDistricts) {
      tmp_dwld_vehicle[district.distname] = districtVehicleTrips[district.dist][landUse].toString();
      total_vehicle_dist += tmp_dwld_vehicle[district.distname];
    }
    tdist_vehicle_download.push(tmp_dwld_vehicle);
  }
  
  
    tmp_dwld_vehicle = {};
    tmp_dwld_vehicle['Landuse'] = "Total";
    for (let district of geoDistricts) {
      tmp_dwld_vehicle[district.distname] = districtVehicleTrips[district.dist]["total"].toString();
      total_vehicle_dist += tmp_dwld_vehicle[district.distname];
    }
    tdist_vehicle_download.push(tmp_dwld_vehicle);

    //this is working
    tmp_dwld = {};
    tmp_dwld['Landuse'] = "Total";
    for (let district of geoDistricts) {
      tmp_dwld[district.distname] = districtPersonTrips[district.dist]["total"].toString();
    }
    tdist_download.push(tmp_dwld);


    trgen_download.push({'Landuse':'Total','Amount':'','Unit':'','Daily_Person_Rate':'',
      'Daily_Person_Trips':tot_daily.toString(),'PM_Person_Rate':'',
      'PM_Person_Trips':tot_pm.toString()});

    //total trips by mode split
    tmp_dwld = {};
    tmp_dwld["Mode"] = "Auto"
    tmp_dwld["Total Person Trips"] = totalPersonTripsByMode["auto"];
    tmp_dwld["Total Vehicle Trips"] = totalVehicleTripsByMode["auto"];
    total_trips_download.push(tmp_dwld);
    tmp_dwld = {};
    tmp_dwld["Mode"] = "Transit"
    tmp_dwld["Total Person Trips"] = totalPersonTripsByMode["transit"];
    tmp_dwld["Total Vehicle Trips"] = totalVehicleTripsByMode["transit"];
    total_trips_download.push(tmp_dwld);
    tmp_dwld = {};
    tmp_dwld["Mode"] = "Taxi"
    tmp_dwld["Total Person Trips"] = totalPersonTripsByMode["taxi"];
    tmp_dwld["Total Vehicle Trips"] = totalVehicleTripsByMode["taxi"];
    total_trips_download.push(tmp_dwld);
    tmp_dwld = {};
    tmp_dwld["Mode"] = "Walk"
    tmp_dwld["Total Person Trips"] = totalPersonTripsByMode["walk"];
    tmp_dwld["Total Vehicle Trips"] = totalVehicleTripsByMode["walk"];
    total_trips_download.push(tmp_dwld);
    tmp_dwld = {};
    tmp_dwld["Mode"] = "Bike"
    tmp_dwld["Total Person Trips"] = totalPersonTripsByMode["bike"];
    tmp_dwld["Total Vehicle Trips"] = totalVehicleTripsByMode["bike"];
    total_trips_download.push(tmp_dwld);
}

window.downloadCSV = function(){
  createDownloadObjects();
  let data, filename, link;
  let csv = 'Average vehicle occupancy';
  if (csv == null) return;
  
  csv += '\n'+ convertArrayOfObjectsToCSV({
    data: avo_download
  });
  
  csv += '\n\n'+ 'Total Trips Generated by Land Use and Time';
  csv += '\n'+ convertArrayOfObjectsToCSV({
    data: trgen_download
  });

  csv += '\n\n'+ 'Mode Split Distribution';
  csv += '\n' + convertArrayOfObjectsToCSV({
    data: modesplit_download
  });

  csv += '\n\n'+ 'Total '+ selectedDirection + ' Trips by Mode';
  csv += '\n' + convertArrayOfObjectsToCSV({
    data: total_trips_download
  });
  
  csv += '\n\n '+ selectedMode+ ' Person Trips Distribution by District';
  csv += '\n' + convertArrayOfObjectsToCSV({
    data: tdist_download
  });

  csv += '\n\n '+ selectedMode+ ' Vehicle Trips Distribution by District';
  csv += '\n' + convertArrayOfObjectsToCSV({
    data: tdist_vehicle_download
  });



  filename = 'tdtool_dataexport.csv';
  //handle IE browsers
  // if (msieversion()){
  //   let IEwindow = window.open();
  //   IEwindow.document.write('sep=,/r/n'+csv);
  //   IEwindow.document.close();
  //   IEWindow.execCommand('SaveAs', true, filename+ ".csv");
  //   IE.window.close();
  // }
  // else {

  
  if (!csv.match(/^data:text\/csv/i)) {
    csv = 'data:text/csv;charset=utf-8,' + csv; //set the proper format to convert the json data to
  }
  data = encodeURI(csv);
  link = document.createElement('a'); //create a link element
  link.style.display = 'none';
  link.setAttribute('href', data);
  document.body.appendChild(link); //append that link to the body
  link.setAttribute('download', filename);
  link.click(); //link click event
  document.body.removeChild(link);
}
// };

function convertArrayOfObjectsToCSV(args) {
  var result, ctr, keys, columnDelimiter, lineDelimiter, data;

  data = args.data || null;
  if (data == null || !data.length) {
    return null;
  }

  columnDelimiter = args.columnDelimiter || ',';
  lineDelimiter = args.lineDelimiter || '\n';

  keys = Object.keys(data[0]);

  result = '';
  result += keys.join(columnDelimiter);
  result += lineDelimiter;

  data.forEach(function(item) {
    ctr = 0;
    keys.forEach(function(key) {
      if (ctr > 0) result += columnDelimiter;

      result += item[key];
      ctr++;
    });
    result += lineDelimiter;
  });

  return result;
}






