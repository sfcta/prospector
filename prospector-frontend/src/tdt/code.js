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
//leafletPip.bassackwards = true;

mymap.setView([37.76889, -122.440997], 12);


// some important constant variables.
const CTA_API_SERVER = 'https://api.sfcta.org/api/';
const DISTRICTS_URL = 'tia_dist12';
const TRIP_DISTRIBUTION = 'tia_distribution';
const TRIP_GEN_RTS = 'tia_tripgen';
const MODE_SPLITS = 'tia_modesplit';
const PLANNING_GEOCODER_baseurl = 'http://sfplanninggis.org/cpc_geocode/?search=';
const AVO_DATA = 'tia_avo';

let geoDistricts;
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
  app.rest_tripgen_daily = numeral(tripGenRates[6].daily_rate).format('0.0')
  app.off_tripgen_daily = numeral(tripGenRates[0].daily_rate).format('0.0');
  app.sup_tripgen_daily = numeral(tripGenRates[4].daily_rate).format('0.0');
  app.hot_tripgen_daily = numeral(tripGenRates[2].daily_rate).format('0.0')

  app.ret_tripgen_PM = numeral(tripGenRates[3].pkhr_rate).format('0.0');
  app.res_tripgen_PM = numeral(tripGenRates[1].pkhr_rate).format('0.0');
  app.rest_tripgen_PM = numeral(tripGenRates[6].pkhr_rate).format('0.0');
  app.off_tripgen_PM = numeral(tripGenRates[0].pkhr_rate).format('0.0');
  app.sup_tripgen_PM = numeral(tripGenRates[4].pkhr_rate).format('0.0');
  app.hot_tripgen_PM = numeral(tripGenRates[2].pkhr_rate).format('0.0');
})

let AVO_data;
queryServer(CTA_API_SERVER + AVO_DATA)
.then(function(data){
  AVO_data = data;
  
  
})

let color_styles = [{ normal  : {"color": "#39f", "weight":3,  "opacity": 0.5},
selected: {"color": "#33f",    "weight":4, "opacity": 0.5 },},
{ normal  : {"fillColor": "#8B0000 ", "fillOpacity": 0.8 },
selected: {"color": "#34784b", "weight":5, "opacity": 1.0, },},
{normal: {"fillColor": "#000", "fillOpacity": 0.8, },
selected: {"color": "#000", "weight":5, "opacity": 1.0,},},
{normal: {"color": "#969696", "fillColor": "#969696", "fillOpacity": 0.3, "weight":2, "opacity": 1,},
selected: {"color": "#43C1FC", "weight":1, "opacity": 1,},},
];

//some global geolayer variables
let address_geoLyr;
let addressGroup;
let districts;
let districts_lyr;
let markers = []; //this is the list of all the district markers
let color_func;
let landUses = ["Residential", "Hotel", "Retail", "Supermarket", "Office"];
let modeTypes = ["auto", "transit", "taxi", "walk", "bike"]


//some other global variables
let addressDistrictNum; 
let addressDistrictName;
let modeSelect = 'auto';
let address; 
let landUseCheck = false; //starts out as false and is set to true on the first time a user
  //selects a land use. it communicates that at least one land use has been specified by the user, enabling computation
let tripPurposeSelect = 'work'; 
let tripDirectionSelect = 'inbound';
let timePeriodSelect = 'daily';
let distributionMethod = 'district';
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


infoTotals.update = function() { //hoverDistrict is the mouseover target defned in updateMap
  let message = '';
  if (addressDistrictNum == null || landUseCheck == false) {
    message = '<h4>Information</h4>';
    //message = '<br> address district number ' + addressDistrictNum + ' <br>' + addressDistrictName;
    if (addressDistrictNum == null) {
      message += '<b>-Input an address</b>' ;
    }
    if (landUseCheck == false) {
      message += '<br><b>-Select a land use and enter project details</b>';
    }
   
  }
  else {
    //message = tripDistributionSelect
    switch(tripDirectionSelect) {
      case 'outbound': 
        message = '<h4> Total Outbound From' + address + '</h4>';
        break;
      case 'inbound': 
        message = '<h4> Total Inbound To ' + address + '</h4>';
        break;
      default: 
        message = '<h4> Total Inbound/Outbound From/To ' + address + '</h4>';
        break;
    }
    message += '<h4>Person Trips</h4>';
    message += ' - by  auto: ' + totalPersonTripsByMode["auto"]+ '</b>'+
      '<br> - by transit: ' + totalPersonTripsByMode["transit"] + '</b>'+
      '<br> - by bike: ' + totalPersonTripsByMode["bike"] + '</b>'+
      '<br> - by taxi: ' + totalPersonTripsByMode["taxi"] + '</b>'+
      '<br> - by walk: ' + totalPersonTripsByMode["walk"] + '</b>'
    message += '<h4>Vehicle Trips</h4>';
    message += ' - by  auto: ' + totalVehicleTripsByMode["auto"]+ '</b>'
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
    switch(tripDirectionSelect) {
      case 'outbound': 
        message = '<h4> Outbound From' + address + ' to ';
        break;
      case 'inbound': 
        message = '<h4> Inbound To ' + address + ' from ';
        break;
      default: 
        message = '<h4> Inbound/Outbound ' + address + ' from/to ';
        break;
    }
    message += hoverDistrict.distname.toString() + ' </h4>';
    message += "Person trips: "+ "<b>" +  districtPersonTrips[hoverDistrict.dist]["total"]+'</b>';
    if (modeSelect !== "transit"){
        message += '<br>' + "Vehicle trips: "+ "<b>"+ districtVehicleTrips[hoverDistrict.dist]["total"]+'</b>';
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

function addGeoLayer(geoJsonData){
  let districtMarker;
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
  let geolyr = L.geoJSON(geoJsonData,{ //this makes a geoJSON layer from
    //geojson data, which is required input. i is the style input
    style: color_styles[3].normal, 
    onEachFeature: function(feature, layer) { 
      layer.on({
        mouseover: function(e){
          //e.target.setStyle(color_styles[3].normal);
          e.target.bringToFront(); 
          if (districtMarker){
            districtMarker.unbindTooltip();
            mymap.removeLayer(districtMarker);
          }
          districtMarker = L.circleMarker(tooltip_positions[feature.dist], {color: 'blue', radius: 1}).addTo(mymap).bindTooltip(feature.distname, {permanent:true, sticky: true});
          if (address_geoLyr) { //this causes an error in clearAllInputs. it looks like this is an unsolved bug in leaflet, having to do with
          // accessing a layer once its been deleted
          // I'm proposing to get rid of the bringtoFront() functionality of the district polygons, since there is
          // no real reason they need to come to the front on mouseover anyway. This is a quick resolution of this problem.
          address_geoLyr.bringToFront();
        }
        infoDistrict.update(e.target.feature); 
        infoTotals.update(e.target.feature);
      },
      mouseout: function(e){


        },
      });
    }
  });
  
  geolyr.addTo(mymap); 

  return geolyr;
}

function getMax() {
  let distributions = [];
  if (modeSelect && landUseCheck && tripPurposeSelect && tripDirectionSelect && addressDistrictNum && timePeriodSelect
    && filterDistributionData(modeSelect, addressDistrictNum, "Retail", //these are hardcoded pending decision at meeting
    tripPurposeSelect, tripDirectionSelect, timePeriodSelect).length !== 0){ //not sure if this last check is correct
    for (let key of Object.keys(districtPersonTrips)){
      distributions.push(districtPersonTrips[key]["total"]);
    }
    return Math.max.apply(null, distributions);

  }

}

function filterDistributionData(mode, districtNum, landUse, purpose, direction, timePeriodSelect) { 
  //returns a json object or list of json objects that fit given parameters   
  return distributionData.filter(function(piece){ 
    return piece.mode == mode && piece.dist == districtNum && piece.landuse == landUse && piece.purpose == purpose &&
    piece.direction == direction && piece.time_period == timePeriodSelect;
  }); 


}



function getDistProps(district, landUse, dailyOrPm) {
  let data;
  let referenceDistrictProp = "prop_dist" + district.dist; //the name of the value that stores the 
  //relevant proportion from address district to hover district
  

  if (modeSelect && landUseCheck==true && tripPurposeSelect && tripDirectionSelect && addressDistrictNum && timePeriodSelect){
    //this returns a number not an object
    console.log(filterDistributionData(modeSelect, addressDistrictNum, landUse, tripPurposeSelect, tripDirectionSelect, timePeriodSelect));

    data = filterDistributionData(modeSelect, addressDistrictNum, landUse, tripPurposeSelect, tripDirectionSelect, timePeriodSelect)[0][referenceDistrictProp];
     
    console.log(data)
    return data;
  }   
}
    


function getDirectionProps(district, landUse, dailyOrPm) {
  let directionDistrictProp = "prop_" + tripDirectionSelect;
  //let referenceDistrict = "trips_dist" + district.dist;
  
  if (modeSelect && landUseCheck==true && tripPurposeSelect && tripDirectionSelect && addressDistrictNum){
    if (tripDirectionSelect == "both"){
      return 1; //I'm not sure if this is the right way to dea with the both directions. maybe need bhargav to add something to the API
    }
    else{


      return (filterDistributionData(modeSelect, addressDistrictNum, landUse, tripPurposeSelect, 
        tripDirectionSelect, dailyOrPm)[0][directionDistrictProp]); 

    }
    
  }
  

}

function filterModeSplitData(landUse, placetype){
  //trying to access the proportion that corresponds with a given land use, placetype and mode
  if (modeSelect && landUseCheck==true && app.placetype != ''){
    return modeSplits.filter(function(piece){
      return (piece.place_type == placetype && piece.landuse == landUse);
    });
    
  }
}

function filterAvoData(landUse, placetype){
  //trying to access the proportion that corresponds with a given land use, placetype and mode
  if (modeSelect && landUseCheck==true && app.placetype != ''){
    return AVO_data.filter(function(piece){                   //how to deal with land use?
      return (piece.geography == "Place Type "+ app.placetype);
    })[0][landUse];
    
  }
}




function updateMap() {
  if (address_geoLyr){
    mymap.removeLayer(address_geoLyr);
  }
  
  address = app.address; // app.address is the user input. app refers to the VUE object below that handles
  let geocodedJson = queryServer(PLANNING_GEOCODER_baseurl+address, 0) //data has got to the geocoder
    .then(function(geocodedJson) { //after queryServer returns the data, do this:
      if (geocodedJson.features.length !== 0 && modeSelect && landUseCheck==true && tripPurposeSelect && 
        tripDirectionSelect && timePeriodSelect) {

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
        
        address_geoLyr.addTo(mymap); //adds the geoLayer to the map
        address_geoLyr.bringToFront();
        //why does this only work when i mouseover?
        address_geoLyr.bindTooltip(address, {permanent: true, className:'myCSSClass'}).addTo(mymap);
        assignDistrict(geoJson, address_geoLyr, address);
        
        getFilteredTrips();
        getTotalTrips();
        //coloring the districts
      
        let trips = []
        districts_lyr.setStyle(function(feature){
          color_func = chroma.scale(['#eff3ff', '#bdd7e7' ,'#6baed6','#3182bd','#08519c']).domain([0, getMax()], 4, 'equal interval');
          //#ffffe0 #ffd59b #ffa474 #f47461 #db4551 #b81b34 #8b0000
          let tot_person_trips = districtPersonTrips[feature.dist]["total"];
          trips.push(tot_person_trips);

          if (trips.reduce((a, b) => a + b, 0) == 0){
            //if all the districts have 0 person trips, force the fill color to be white
            return {'color': '#444444', 'weight': 2, 'fillColor': '#c6dbef', fillOpacity:0.6};
          }
          else{
            //otherwise, color the districts according to the chroma color function
            return {'color': '#444444', 'weight': 2, 'fillColor': color_func(tot_person_trips), fillOpacity:0.6};
          }
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
    }
    else {
      if (!(tripDirectionSelect)){
        alert("The trip direction is not defined.");
      }
      else if (!(tripPurposeSelect)){
        alert("The trip purpose is not defined.");
      }
      
      else if (!(modeSelect)){
        alert("The trip mode is not defined.");
      }
      else if (!(landUseCheck)){
        alert("Enter at least one land use type.");
      }
      else if (!(timePeriodSelect)){
        alert("Enter a time frame.");
      }
      else {
        alert("The address is invalid or is outside the city limits of San Francisco. Enter another address. If you are unable to locate a San Francisco " +
          "address with this tool, contact the San Francisco Planning Department at cpc.transportationreview@sfgov.org");

      }
    }
  })
}





let trgen_download; //an array of dictionaries -> "a list of json"
let tdist_download;
let modesplit_download; 
let tdist_person_download;
let tdist_vehicle_download;
let total_person_dist;
let total_vehicle_dist;
let total_trips_download;

function createDownloadObjects() {
  trgen_download = []; 
  tdist_download = [];
  modesplit_download = [];
  tdist_vehicle_download = [];
  total_person_dist = 0;
  total_vehicle_dist = 0;
  total_trips_download = [];

  let tmp_dwld;
  let tmp_dwld_vehicle;
  
  let tot_bedrooms = app.num_studios+app.num_1bed+2*app.num_2bed+2*app.num_3bed;
  let tot_daily = 0;
  let tot_pm = 0;

    if(tot_bedrooms>0) { //if residential is activated
      //trip gen rates
      tmp_dwld = {};
      tmp_dwld['Landuse'] = 'Residential';
      tmp_dwld['Amount'] = tot_bedrooms.toString();
      tmp_dwld['Unit'] = 'Per Bedroom';
      tmp_dwld['Daily_Person_Rate'] = app.res_tripgen_daily.toString();
      tmp_dwld['Daily_Person_Trips'] = (tot_bedrooms*app.res_tripgen_daily).toString();
      tot_daily += tot_bedrooms*app.res_tripgen_daily;
      tmp_dwld['PM_Person_Rate'] = app.res_tripgen_PM.toString();
      tmp_dwld['PM_Person_Trips'] = (tot_bedrooms*app.res_tripgen_PM).toString();
      tot_pm += tot_bedrooms*app.res_tripgen_PM;
      trgen_download.push(tmp_dwld);

      //mode split
      tmp_dwld = {};
      tmp_dwld['Landuse'] = 'Residential';
      tmp_dwld['transit modesplit'] = filterModeSplitData("Residential", app.placetype)[0]["transit"].toString();
      tmp_dwld['all auto modesplit'] = filterModeSplitData("Residential", app.placetype)[0]["auto"].toString();
      tmp_dwld['taxi modesplit'] = filterModeSplitData("Residential", app.placetype)[0]["taxi"].toString();
      tmp_dwld['walk modesplit'] = filterModeSplitData("Residential", app.placetype)[0]["walk"].toString();
      tmp_dwld['bike modesplit'] = filterModeSplitData("Residential", app.placetype)[0]["bike"].toString();
      modesplit_download.push(tmp_dwld);

      //create person trips distribution
      tmp_dwld = {};
      tmp_dwld['Landuse'] = 'Residential';
      for (let district of geoDistricts) {
        getFilteredTrips(district);
        tmp_dwld[district.distname] = districtPersonTrips[district.dist]["Residential"].toString();
        total_person_dist += tmp_dwld[district.distname];
      }
      tdist_download.push(tmp_dwld);

      //create vehicle trips distribution
      tmp_dwld_vehicle = {};
      tmp_dwld_vehicle['Landuse'] = 'Residential';
      for (let district of geoDistricts) {
        getFilteredTrips(district);
        tmp_dwld_vehicle[district.distname] = districtVehicleTrips[district.dist]["Residential"].toString();
        total_vehicle_dist += tmp_dwld_vehicle[district.distname];
      }
      tdist_vehicle_download.push(tmp_dwld_vehicle);
      
    }
    if(app.off_sqft>0) {
      tmp_dwld = {};
      tmp_dwld['Landuse'] = 'Office';
      tmp_dwld['Amount'] = app.off_sqft.toString();
      tmp_dwld['Unit'] = 'Per 1k sqft.';
      tmp_dwld['Daily_Person_Rate'] = app.off_tripgen_daily.toString();
      tmp_dwld['Daily_Person_Trips'] = ((app.off_sqft/1000)*app.off_tripgen_daily).toString();
      tot_daily += (app.off_sqft/1000)*app.off_tripgen_daily;
      tmp_dwld['PM_Person_Rate'] = app.off_tripgen_PM.toString();
      tmp_dwld['PM_Person_Trips'] = ((app.off_sqft/1000)*app.off_tripgen_PM).toString();
      tot_pm += (app.off_sqft/1000)*app.off_tripgen_PM;
      trgen_download.push(tmp_dwld);

      tmp_dwld = {};
      tmp_dwld['Landuse'] = 'Office';
      tmp_dwld['transit modesplit'] = filterModeSplitData("Office", app.placetype)[0]["transit"].toString();
      tmp_dwld['all auto modesplit'] = filterModeSplitData("Office", app.placetype)[0]["auto"].toString();
      tmp_dwld['taxi modesplit'] = filterModeSplitData("Office", app.placetype)[0]["taxi"].toString();
      tmp_dwld['walk modesplit'] = filterModeSplitData("Residential", app.placetype)[0]["walk"].toString();
      tmp_dwld['bike modesplit'] = filterModeSplitData("Residential", app.placetype)[0]["bike"].toString();
      modesplit_download.push(tmp_dwld);

      tmp_dwld = {};
      tmp_dwld['Landuse'] = 'Office';
      for (let district of geoDistricts) {
        getFilteredTrips(district);
        tmp_dwld[district.distname] = districtPersonTrips[district.dist]["Office"].toString();
        total_person_dist += tmp_dwld[district.distname];
      }
      tdist_download.push(tmp_dwld);

      tmp_dwld_vehicle = {};
      tmp_dwld_vehicle['Landuse'] = 'Office';
      for (let district of geoDistricts) {
        getFilteredTrips(district);
        tmp_dwld_vehicle[district.distname] = districtVehicleTrips[district.dist]["Office"].toString();
        total_vehicle_dist += tmp_dwld_vehicle[district.distname];
      }
      tdist_vehicle_download.push(tmp_dwld_vehicle);

    }
    if(app.ret_sqft>0) {
      tmp_dwld = {};
      tmp_dwld['Landuse'] = 'Retail';
      tmp_dwld['Amount'] = app.ret_sqft.toString();
      tmp_dwld['Unit'] = 'Per 1k sqft.';
      tmp_dwld['Daily_Person_Rate'] = app.ret_tripgen_daily.toString();
      tmp_dwld['Daily_Person_Trips'] = ((app.ret_sqft/1000)*app.ret_tripgen_daily).toString();
      tot_daily += (app.ret_sqft/1000)*app.ret_tripgen_daily;
      tmp_dwld['PM_Person_Rate'] = app.ret_tripgen_PM.toString();
      tmp_dwld['PM_Person_Trips'] = ((app.ret_sqft/1000)*app.ret_tripgen_PM).toString();
      tot_pm += (app.ret_sqft/1000)*app.ret_tripgen_PM;
      trgen_download.push(tmp_dwld);

      tmp_dwld = {};
      tmp_dwld['Landuse'] = 'Retail';
      tmp_dwld['transit modesplit'] = filterModeSplitData("Retail", app.placetype)[0]["transit"].toString();
      tmp_dwld['all auto modesplit'] = filterModeSplitData("Retail", app.placetype)[0]["auto"].toString();
      tmp_dwld['taxi modesplit'] = filterModeSplitData("Retail", app.placetype)[0]["taxi"].toString();
      tmp_dwld['walk modesplit'] = filterModeSplitData("Residential", app.placetype)[0]["walk"].toString();
      tmp_dwld['bike modesplit'] = filterModeSplitData("Residential", app.placetype)[0]["bike"].toString();
      modesplit_download.push(tmp_dwld);

      tmp_dwld = {};
      tmp_dwld['Landuse'] = 'Retail';
      for (let district of geoDistricts) {
        getFilteredTrips(district);
        tmp_dwld[district.distname] = districtPersonTrips[district.dist]["Retail"].toString();
        total_person_dist += tmp_dwld[district.distname];

      }
      tdist_download.push(tmp_dwld);

      tmp_dwld_vehicle = {};
      tmp_dwld_vehicle['Landuse'] = 'Retail';
      for (let district of geoDistricts) {
        getFilteredTrips(district);
        tmp_dwld_vehicle[district.distname] = districtVehicleTrips[district.dist]["Retail"].toString();
        total_vehicle_dist += tmp_dwld_vehicle[district.distname];
      }
      tdist_vehicle_download.push(tmp_dwld_vehicle);
    }
    if(app.rest_sqft>0) {
      tmp_dwld = {};
      tmp_dwld['Landuse'] = 'Restaurant';
      tmp_dwld['Amount'] = app.rest_sqft.toString();
      tmp_dwld['Unit'] = 'Per 1k sqft.';
      tmp_dwld['Daily_Person_Rate'] = app.rest_tripgen_daily.toString();
      tmp_dwld['Daily_Person_Trips'] = ((app.rest_sqft/1000)*app.rest_tripgen_daily).toString();
      tot_daily += (app.ret_sqft/1000)*app.rest_tripgen_daily;
      tmp_dwld['PM_Person_Rate'] = app.rest_tripgen_PM.toString();
      tmp_dwld['PM_Person_Trips'] = ((app.rest_sqft/1000)*app.rest_tripgen_PM).toString();
      tot_pm += (app.rest_sqft/1000)*app.rest_tripgen_PM;
      trgen_download.push(tmp_dwld);

      tmp_dwld = {};
      tmp_dwld['Landuse'] = 'Restaurant';
      tmp_dwld['transit modesplit'] = filterModeSplitData("Retail", app.placetype)[0]["transit"].toString();
      tmp_dwld['all auto modesplit'] = filterModeSplitData("Retail", app.placetype)[0]["auto"].toString();
      tmp_dwld['taxi modesplit'] = filterModeSplitData("Retail", app.placetype)[0]["taxi"].toString();
      tmp_dwld['walk modesplit'] = filterModeSplitData("Residential", app.placetype)[0]["walk"].toString();
      tmp_dwld['bike modesplit'] = filterModeSplitData("Residential", app.placetype)[0]["bike"].toString();
      modesplit_download.push(tmp_dwld);

      tmp_dwld = {};
      tmp_dwld['Landuse'] = 'Restaurant';
      for (let district of geoDistricts) {
        getFilteredTrips(district);
        tmp_dwld[district.distname] = districtPersonTrips[district.dist]["Restaurant"].toString();
        total_person_dist += tmp_dwld[district.distname];
      }
      tdist_download.push(tmp_dwld);

      tmp_dwld_vehicle = {};
      tmp_dwld_vehicle['Landuse'] = 'Restaurant';
      for (let district of geoDistricts) {
        getFilteredTrips(district);
        tmp_dwld_vehicle[district.distname] = districtVehicleTrips[district.dist]["Restaurant"].toString();
        total_vehicle_dist += tmp_dwld_vehicle[district.distname];
      }
      tdist_vehicle_download.push(tmp_dwld_vehicle);
    }
    if(app.hot_sqft>0) {
      tmp_dwld = {};
      tmp_dwld['Landuse'] = 'Hotel';
      tmp_dwld['Amount'] = app.hot_sqft.toString();
      tmp_dwld['Unit'] = 'Per 1k sqft.';
      tmp_dwld['Daily_Person_Rate'] = app.hot_tripgen_daily.toString();
      tmp_dwld['Daily_Person_Trips'] = ((app.hot_sqft/1000)*app.hot_tripgen_daily).toString();
      tot_daily += (app.ret_sqft/1000)*app.hot_tripgen_daily;
      tmp_dwld['PM_Person_Rate'] = app.hot_tripgen_PM.toString();
      tmp_dwld['PM_Person_Trips'] = ((app.hot_sqft/1000)*app.hot_tripgen_PM).toString();
      tot_pm += (app.hot_sqft/1000)*app.hot_tripgen_PM;
      trgen_download.push(tmp_dwld);

      tmp_dwld = {};
      tmp_dwld['Landuse'] = 'Hotel';
      tmp_dwld['transit modesplit'] = filterModeSplitData("Hotel", app.placetype)[0]["transit"].toString();
      tmp_dwld['all auto modesplit'] = filterModeSplitData("Hotel", app.placetype)[0]["auto"].toString();
      tmp_dwld['taxi modesplit'] = filterModeSplitData("Hotel", app.placetype)[0]["taxi"].toString();
      tmp_dwld['walk modesplit'] = filterModeSplitData("Residential", app.placetype)[0]["walk"].toString();
      tmp_dwld['bike modesplit'] = filterModeSplitData("Residential", app.placetype)[0]["bike"].toString();
      modesplit_download.push(tmp_dwld);

      tmp_dwld = {};
      tmp_dwld['Landuse'] = 'Hotel';
      for (let district of geoDistricts) {
        getFilteredTrips(district);
        tmp_dwld[district.distname] = districtPersonTrips[district.dist]["Hotel"].toString();
        total_person_dist += tmp_dwld[district.distname];
      }
      tdist_download.push(tmp_dwld);

      tmp_dwld_vehicle = {};
      tmp_dwld_vehicle['Landuse'] = 'Hotel';
      for (let district of geoDistricts) {
        getFilteredTrips(district);
        tmp_dwld_vehicle[district.distname] = districtVehicleTrips[district.dist]["Hotel"].toString();
        total_vehicle_dist += tmp_dwld_vehicle[district.distname];
      }
      tdist_vehicle_download.push(tmp_dwld_vehicle);


    }
    if(app.sup_sqft>0) {
      tmp_dwld = {};
      tmp_dwld['Landuse'] = 'Supermarket';
      tmp_dwld['Amount'] = app.sup_sqft.toString();
      tmp_dwld['Unit'] = 'Per 1k sqft.';
      tmp_dwld['Daily_Person_Rate'] = app.sup_tripgen_daily.toString();
      tmp_dwld['Daily_Person_Trips'] = ((app.sup_sqft/1000)*app.sup_tripgen_daily).toString();
      tot_daily += (app.ret_sqft/1000)*app.sup_tripgen_daily;
      tmp_dwld['PM_Person_Rate'] = app.sup_tripgen_PM.toString();
      tmp_dwld['PM_Person_Trips'] = ((app.sup_sqft/1000)*app.sup_tripgen_PM).toString();
      tot_pm += (app.sup_sqft/1000)*app.sup_tripgen_PM;
      trgen_download.push(tmp_dwld);

      tmp_dwld = {};
      tmp_dwld['Landuse'] = 'Supermarket';
      tmp_dwld['transit modesplit'] = filterModeSplitData("Retail", app.placetype)[0]["transit"].toString();
      tmp_dwld['all auto modesplit'] = filterModeSplitData("Retail", app.placetype)[0]["auto"].toString();
      tmp_dwld['taxi modesplit'] = filterModeSplitData("Retail", app.placetype)[0]["taxi"].toString();
      tmp_dwld['walk modesplit'] = filterModeSplitData("Residential", app.placetype)[0]["walk"].toString();
      tmp_dwld['bike modesplit'] = filterModeSplitData("Residential", app.placetype)[0]["bike"].toString();
      modesplit_download.push(tmp_dwld);

      tmp_dwld = {};
      tmp_dwld['Landuse'] = 'Supermarket';
      for (let district of geoDistricts) {
        getFilteredTrips(district);
        tmp_dwld[district.distname] = districtPersonTrips[district.dist]["Supermarket"].toString();
        total_person_dist += tmp_dwld[district.distname];
      }
      tdist_download.push(tmp_dwld);

      tmp_dwld_vehicle = {};
      tmp_dwld_vehicle['Landuse'] = 'Supermarket';
      for (let district of geoDistricts) {
        getFilteredTrips(district);
        tmp_dwld_vehicle[district.distname] = districtVehicleTrips[district.dist]["Supermarket"].toString();
        total_vehicle_dist += tmp_dwld_vehicle[district.distname];
      }
      tdist_vehicle_download.push(tmp_dwld_vehicle);
    }
    //build distribution totals
    //this isnt
    tmp_dwld_vehicle = {};
    tmp_dwld_vehicle['Landuse'] = "Total";
    for (let district of geoDistricts) {
      getFilteredTrips(district);
      tmp_dwld_vehicle[district.distname] = districtVehicleTrips[district.dist]["total"].toString();
      total_vehicle_dist += tmp_dwld_vehicle[district.distname];
    }
    tdist_vehicle_download.push(tmp_dwld_vehicle);

    //this is working
    tmp_dwld = {};
    tmp_dwld['Landuse'] = "Total";
    for (let district of geoDistricts) {
      getFilteredTrips(district);
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


// information about rounding person trips:
//less than 100, nearest 10;
// between 100 and 199, nearest 20;
// …
// between 900 and 999, nearest 90;
// greater or equal than 1,000, nearest 100
/*function roundToNearest(number) {
  let increment = 110;
  let numbers = {
    100: 10,
    199: 20,
    299: 30,
    399: 40,
    499: 50,
    599: 60,
    699: 70,
    799: 80,
    899: 90,
    999: 100,};
  //i think these instructions are a bit wrong, for the higher numbers. for now just test on numbers < 899
  for (var key in numbers){
    if (number < key){
      increment = numbers[key];
      break;
    }
  }    
  
  return Math.ceil(number / increment ) * increment;
}*/
// Above function is needlessly complicated, limited to 1000, and wrong.
function roundToNearest(number, nearest=10) {
  return Math.ceil(number / nearest) * nearest
}

let totalPersonTripsByMode = [];
let totalVehicleTripsByMode = [];
function getTotalTrips(){
  let num_studios = app.num_studios;
  let num_1bed = app.num_1bed;
  let num_2bed = app.num_2bed;
  let num_3bed = app.num_3bed;
  let tot_num_bedrooms = num_studios + num_1bed + (2*app.num_2bed) + (2*app.num_3bed);
  let totalPersonTrips = {};
  let totalVehicleTrips = {};

    //why not just use the same stored values from getFilteredPerson trips? the hoverDistrict doesnt change the total value at all in infoTotals.update(),
    //so it doesnt need to be a param

    //the computations below happen without the direction and distrbution data multiplications
    for (let mode of modeTypes){
    


      if (app.isPM ==true) {
        totalPersonTrips["Residential"] = roundToNearest(((tripGenRates[1].pkhr_rate)*tot_num_bedrooms)*filterModeSplitData("Residential", app.placetype)[0][mode]);
        totalPersonTrips["Retail"] = roundToNearest((app.ret_sqft/1000)*(tripGenRates[3].pkhr_rate)*filterModeSplitData("Retail", app.placetype)[0][mode]);
        totalPersonTrips["Office"] = roundToNearest((app.off_sqft/1000)*(tripGenRates[0].pkhr_rate)*filterModeSplitData("Office", app.placetype)[0][mode]);
        totalPersonTrips["Restaurant"] = roundToNearest(((app.rest_sqft/1000)*(tripGenRates[6].pkhr_rate))*filterModeSplitData("Retail", app.placetype)[0][mode]); //rest and sup use retail distribution
        totalPersonTrips["Supermarket"] = roundToNearest(((app.sup_sqft/1000)*(tripGenRates[4].pkhr_rate))*filterModeSplitData("Retail", app.placetype)[0][mode]); 
        totalPersonTrips["Hotel"] = roundToNearest(((app.hot_sqft/1000)*(tripGenRates[2].pkhr_rate))*filterModeSplitData("Hotel", app.placetype)[0][mode]);
        totalVehicleTrips["Residential"] = roundToNearest(totalPersonTrips["Residential"]/(filterAvoData("residential", app.placetype)));
        totalVehicleTrips["Retail"] = roundToNearest(totalPersonTrips["Retail"]/(filterAvoData("retail", app.placetype)));
        totalVehicleTrips["Hotel"] = roundToNearest(totalPersonTrips["Hotel"]/(filterAvoData("retail", app.placetype)));
        totalVehicleTrips["Office"] = roundToNearest(totalPersonTrips["Office"]/(filterAvoData("office", app.placetype)));
        totalVehicleTrips["Supermarket"] = roundToNearest(totalPersonTrips["Supermarket"]/(filterAvoData("retail", app.placetype)));
      }

      else if (app.isDaily == true){
        totalPersonTrips["Residential"] = roundToNearest(((tripGenRates[1].daily_rate)*tot_num_bedrooms)*filterModeSplitData("Residential", app.placetype)[0][mode]);
        totalPersonTrips["Retail"] = roundToNearest((app.ret_sqft/1000)*(tripGenRates[3].daily_rate)*filterModeSplitData("Retail", app.placetype)[0][mode]);
        totalPersonTrips["Office"] = roundToNearest((app.off_sqft/1000)*(tripGenRates[0].daily_rate)*filterModeSplitData("Office", app.placetype)[0][mode]);
        totalPersonTrips["Restaurant"] = roundToNearest(((app.rest_sqft/1000)*(tripGenRates[6].daily_rate))*filterModeSplitData("Retail", app.placetype)[0][mode]); //rest and sup use retail distribution
        totalPersonTrips["Supermarket"] = roundToNearest(((app.sup_sqft/1000)*(tripGenRates[4].daily_rate))*filterModeSplitData("Retail", app.placetype)[0][mode]); 
        totalPersonTrips["Hotel"] = roundToNearest(((app.hot_sqft/1000)*(tripGenRates[2].daily_rate))*filterModeSplitData("Hotel", app.placetype)[0][mode]);
        totalVehicleTrips["Residential"] = roundToNearest(totalPersonTrips["Residential"]/(filterAvoData("residential", app.placetype)));
        totalVehicleTrips["Retail"] = roundToNearest(totalPersonTrips["Retail"]/(filterAvoData("retail", app.placetype)));
        totalVehicleTrips["Hotel"] = roundToNearest(totalPersonTrips["Hotel"]/(filterAvoData("retail", app.placetype)));
        totalVehicleTrips["Office"] = roundToNearest(totalPersonTrips["Office"]/(filterAvoData("office", app.placetype)));
        totalVehicleTrips["Supermarket"] = roundToNearest(totalPersonTrips["Supermarket"]/(filterAvoData("retail", app.placetype)));


      }


    for (let landUse of landUses) {
      if (!(totalPersonTrips[landUse])){
        totalPersonTrips[landUse] == 0;
      }
    }
    for (let landUse of landUses) {
      if (!(totalVehicleTrips[landUse])){
        totalVehicleTrips[landUse] == 0;
      }
    }


    totalPersonTrips["total"] = (totalPersonTrips["Residential"]+totalPersonTrips["Retail"]+totalPersonTrips["Hotel"]+ 
    totalPersonTrips["Office"]+totalPersonTrips["Supermarket"]);
    totalPersonTripsByMode[mode] = totalPersonTrips["total"];
    

    totalVehicleTrips["total"] = (totalVehicleTrips["Residential"]+totalVehicleTrips["Retail"]+totalVehicleTrips["Hotel"]+ 
    totalVehicleTrips["Office"]+totalVehicleTrips["Supermarket"]);
    totalVehicleTripsByMode[mode] = totalVehicleTrips["total"];
    
  }
}



let districtPersonTrips = {}; // {key = district number, value = person trips corresponding to this district}
let districtVehicleTrips = {};


//let landUses = ["Residential", "Retail", "Office","Restaurant", "Supermarket"];
//I'm changing this function so that instead of taking in a hoverDistrict parameter, it calculates the number of person trips for all 12 districts
//for all land uses and time periods
function getFilteredTrips(){
  let num_studios = app.num_studios;
  let num_1bed = app.num_1bed;
  let num_2bed = app.num_2bed;
  let num_3bed = app.num_3bed;
  let tot_num_bedrooms = num_studios + num_1bed + (2*app.num_2bed) + (3*app.num_3bed);

  for (let district of geoDistricts) {
    let personTrips = {};
    let vehicleTrips = {};
    let totalPersonTrips = {};
    let totalVehicleTripsByMode = {};


    
    if (app.isPM ==true) {
      personTrips["Residential"] = roundToNearest(((tripGenRates[1].pkhr_rate)*tot_num_bedrooms)*filterModeSplitData("Residential", app.placetype)[0][modeSelect]*getDirectionProps(district, "Residential", "pm")*getDistProps(district, "Residential", "pm"));
      personTrips["Retail"] = roundToNearest((app.ret_sqft/1000)*(tripGenRates[3].pkhr_rate)*filterModeSplitData("Retail", app.placetype)[0][modeSelect]*getDirectionProps(district, "Retail", "pm")*getDistProps(district, "Retail", "pm"));
      personTrips["Office"] = roundToNearest((app.off_sqft/1000)*(tripGenRates[0].pkhr_rate)*filterModeSplitData("Office", app.placetype)[0][modeSelect]*getDirectionProps(district, "Office", "pm")*getDistProps(district, "Office","pm"));
      personTrips["Restaurant"] = roundToNearest(((app.rest_sqft/1000)*(tripGenRates[6].pkhr_rate))*filterModeSplitData("Retail", app.placetype)[0][modeSelect]*getDirectionProps(district, "Retail", "pm")*getDistProps(district, "Retail", "pm")); //rest and sup use retail distribution
      personTrips["Supermarket"] = roundToNearest(((app.sup_sqft/1000)*(tripGenRates[4].pkhr_rate))*filterModeSplitData("Retail", app.placetype)[0][modeSelect]*getDirectionProps(district, "Retail", "pm")*getDistProps(district, "Retail", "pm")); 
      personTrips["Hotel"] = roundToNearest(((app.hot_sqft/1000)*(tripGenRates[2].pkhr_rate))*filterModeSplitData("Hotel", app.placetype)[0][modeSelect]*getDirectionProps(district, "Retail", "pm")*getDistProps(district, "Retail", "pm"));
      vehicleTrips["Residential"] = roundToNearest(personTrips["Residential"]/(filterAvoData("residential", app.placetype)));
      vehicleTrips["Retail"] = roundToNearest(personTrips["Retail"]/(filterAvoData("retail", app.placetype)));
      vehicleTrips["Hotel"] = roundToNearest(personTrips["Hotel"]/(filterAvoData("retail", app.placetype)));
      vehicleTrips["Office"] = roundToNearest(personTrips["Office"]/(filterAvoData("office", app.placetype)));
      vehicleTrips["Supermarket"] = roundToNearest(personTrips["Supermarket"]/(filterAvoData("retail", app.placetype)));
      vehicleTrips["Restaurant"] = roundToNearest(personTrips["Restaurant"]/(filterAvoData("retail", app.placetype)));
    }

    else if (app.isDaily == true){
      personTrips["Residential"] = roundToNearest(((tripGenRates[1].daily_rate)*tot_num_bedrooms)*filterModeSplitData("Residential", app.placetype)[0][modeSelect]*getDirectionProps(district, "Residential", "daily")*getDistProps(district, "Residential", "daily"));
      personTrips["Retail"] = roundToNearest((app.ret_sqft/1000)*(tripGenRates[3].daily_rate)*filterModeSplitData("Retail", app.placetype)[0][modeSelect]*getDirectionProps(district, "Retail", "daily")*getDistProps(district, "Retail", "daily"));
      personTrips["Office"] = roundToNearest((app.off_sqft/1000)*(tripGenRates[0].daily_rate)*filterModeSplitData("Office", app.placetype)[0][modeSelect]*getDirectionProps(district, "Office", "daily")*getDistProps(district, "Office", "daily"));
      personTrips["Restaurant"] = roundToNearest(((app.rest_sqft/1000)*(tripGenRates[6].daily_rate))*filterModeSplitData("Retail", app.placetype)[0][modeSelect]*getDirectionProps(district, "Retail", "daily")*getDistProps(district, "Retail", "daily")); //rest and sup use retail distribution
      personTrips["Supermarket"] = roundToNearest(((app.sup_sqft/1000)*(tripGenRates[4].daily_rate))*filterModeSplitData("Retail", app.placetype)[0][modeSelect]*getDirectionProps(district, "Retail", "daily")*getDistProps(district, "Retail", "daily")); 
      personTrips["Hotel"] = roundToNearest(((app.hot_sqft/1000)*(tripGenRates[2].daily_rate))*filterModeSplitData("Hotel", app.placetype)[0][modeSelect]*getDirectionProps(district, "Retail", "daily")*getDistProps(district, "Retail", "daily")); 
      vehicleTrips["Residential"] = roundToNearest(personTrips["Residential"]/(filterAvoData("residential", app.placetype)));
      vehicleTrips["Retail"] = roundToNearest(personTrips["Retail"]/(filterAvoData("retail", app.placetype)));
      vehicleTrips["Hotel"] = roundToNearest(personTrips["Hotel"]/(filterAvoData("retail", app.placetype)));
      vehicleTrips["Office"] = roundToNearest(personTrips["Office"]/(filterAvoData("office", app.placetype)));
      vehicleTrips["Supermarket"] = roundToNearest(personTrips["Supermarket"]/(filterAvoData("retail", app.placetype)));
      vehicleTrips["Restaurant"] = roundToNearest(personTrips["Restaurant"]/(filterAvoData("retail", app.placetype)));

    }
    //if any of the land uses are undefined b/c no input, set them equal to 0. landUses is a global array of all 5 land uses
    for (let landUse of landUses) {
      if (!(personTrips[landUse])){
        personTrips[landUse] == 0;
      }
    }
    for (let landUse of landUses) {
      if (!(vehicleTrips[landUse])){
        vehicleTrips[landUse] == 0;
      }
    }
    

  //still in the for each district for loop
  personTrips["total"] = (personTrips["Residential"]+personTrips["Retail"]+personTrips["Office"]+personTrips["Restaurant"]+personTrips["Supermarket"]+personTrips["Hotel"]);
  districtPersonTrips[district.dist] = personTrips; //this creates a dictionary of dictionaries, with one dictionary for every district where the keys are the land uses/total
  //and the dictionary is populated by the time period
  

  vehicleTrips["total"] = vehicleTrips["Residential"] + vehicleTrips["Retail"]+ vehicleTrips["Hotel"] + vehicleTrips["Restaurant"]
  vehicleTrips["Office"] + vehicleTrips["Supermarket"];
  districtVehicleTrips[district.dist] = vehicleTrips;
  console.log(district);
  
  
}

}


function clearAllInputs(){
  landUseCheck = false;
  app.isAUActive = false;
  app.isTRActive = false;
  app.address=  null;
  app.isOffice = false;
  app.isResidential = false;
  app.isRetail = false;
  app.isRestaurant = false;
  app.isSupermarket = false;
  app.isHotel = false;
  app.isWork = false;
  app.isOther = false;
  app.isAll = false;
  app.isInbound = false;
  app.isOutbound = false;
  app.isBoth = false;
  app.isDaily = false;
  app.isPM = false;
  app.isCombined = false;
  app.off_sqft = 0;
  app.ret_sqft = 0;
  app.res_sqft = 0;
  app.rest_sqft = 0;
  app.sup_sqft = 0;
  app.hot_sqft = 0;
  app.num_studios = 0;
  app.num_1bed = 0;
  app.num_2bed = 0;
  app.num_3bed = 0;
  app.isTaxiTNCActive = false;
  
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
  pickAU();
  pickWork();
  pickInbound();
  app.off_sqft = 0;
  app.ret_sqft = 0;
  app.res_sqft = 0;
  app.rest_sqft = 0;
  app.sup_sqft = 0;
  app.hot_sqft = 0;
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

//button functions
function pickAU(thing){
  modeSelect = "auto";
  app.isAUActive = true;
  app.isTRActive = false;
  app.isTaxiTNCActive = false;
  updateMap();
}
function pickTR(thing){
  modeSelect = "transit";
  app.isTRActive = true;
  app.isAUActive = false;
  app.isTaxiTNCActive = false;
  updateMap();
}


function pickTaxiTNC(thing){
  modeSelect = "taxi";
  app.isTaxiTNCActive = true;
  app.isAUActive = false;
  app.isTRActive = false;
  updateMap();
}

function pickRes(thing){
  landUseCheck = true; 
  app.isResidential = true;  
  app.isRetail = false;
  app.isOffice = false;
  app.isRestaurant = false;
  app.isSupermarket = false;
  app.isHotel = false;
}

function pickOffice(thing){
  landUseCheck = true;
  app.isOffice = true;
  app.isResidential = false;
  app.isRetail = false;
  app.isRestaurant = false;
  app.isSupermarket = false;
  app.isHotel = false;
}

function pickRet(thing){
  //landUseSelect = "Ret";
  landUseCheck = true;
  app.isRetail = true;
  app.isResidential = false;
  app.isOffice = false;
  app.isRestaurant = false;
  app.isSupermarket = false;
  app.isHotel = false;
}

function pickRestaurant(thing){
  landUseCheck = true;
  app.isRestaurant = true;
  app.isRetail = false;
  app.isResidential = false;
  app.isOffice = false;
  app.isSupermarket = false;
  app.isHotel = false;    
}

function pickHotel(thing){
  landUseCheck = true;
  app.isHotel = true;
  app.isRestaurant = false;
  app.isRetail = false;
  app.isResidential = false;
  app.isOffice = false;
  app.isSupermarket = false;
}

function pickSupermarket(thing){
  landUseCheck = true;
  app.isSupermarket = true;
  app.isRestaurant = false;
  app.isRetail = false;
  app.isResidential = false;
  app.isOffice = false;
  app.isHotel = false;
  
}

function pickWork(thing){
  tripPurposeSelect = "work";
  app.isWork = true;
  app.isOther = false;
  app.isAll = false;
  updateMap();
}

function pickOther(thing){
  tripPurposeSelect = "other";
  app.isOther = true;
  app.isWork = false;
  app.isAll = false;
  updateMap();
}

function pickAll(thing){
  tripPurposeSelect = "all";
  app.isOther = false;
  app.isWork = false;
  app.isAll = true;
  updateMap();
}

function pickInbound(thing){
  tripDirectionSelect = "inbound";
  app.isInbound = true;
  app.isOutbound = false;
  app.isBoth = false;
  updateMap();
}

function pickOutbound(thing){
  tripDirectionSelect = "outbound";
  app.isInbound = false;
  app.isOutbound = true;
  app.isBoth = false;
  updateMap();
}


function pickBoth(thing){
  tripDirectionSelect = "both";
  app.isInbound = false;
  app.isOutbound = false;
  app.isBoth = true;
  updateMap();
}

function pickPM(thing){
  timePeriodSelect = "pm";
  app.isPM = true;
  app.isDaily = false;
  updateMap();
}

function pickDaily(thing){  
  timePeriodSelect = "daily";  
  app.isPM = false;
  app.isDaily = true;
  updateMap();
}

function pickDistrict(thing){
  distributionMethod="district";
  app.isDistrict = true;
  app.isPlaceType = false;
  app.isCity = false;
  updateMap();
}
  
function pickPlaceType(thing){
  distributionMethod="placetype";
  app.isDistrict = false;
  app.isPlaceType = true;
  app.isCity = false;
  updateMap();
}
  
function pickCity(thing){
  distributionMethod='city';
  app.isDistrict = false;
  app.isPlaceType = false;
  app.isCity = true;
  updateMap();
}
  
function checkLandUseSelections() {
  app.resSelected = app.num_1bed > 0;
  app.resSelected = app.num_2bed > 0;
  app.resSelected = app.num_3bed > 0;
  app.resSelected = ((app.num_1bed+ app.num_2bed+ app.num_3bed+ app.num_studios) >0);

  app.offSelected = app.off_sqft > 0;
  app.restSelected = app.rest_sqft > 0;
  app.hotSelected = app.hot_sqft > 0;
  app.supSelected = app.sup_sqft > 0;
  app.retSelected = app.ret_sqft > 0;
}

// Vue object connects what is done in the user interface html to the javascript. All the buttons
// in the right side panel are connected here. 
let app = new Vue({
  el: '#panel', //element is 'el' the whole right side of the map
  delimiters: ['${', '}'],
  data: {
    isAUActive: true,
    isTRActive: false,
    address: null,
    isOffice: false,
    isResidential: false,
    isRetail: false,
    isRestaurant: false,
    isSupermarket: false,
    isHotel: false,
    isWork: true,
    isOther: false,
    isAll: false,
    isInbound: true,
    isOutbound: false,
    isBoth: false,
    isDaily: true,
    isPM: false,
    isCombined: false,
    isDistrict: true,
    isPlaceType: false,
    isCity: false,
    off_sqft: null,
    ret_sqft: null,
    res_sqft: null,
    rest_sqft: null,
    sup_sqft: null,
    hot_sqft: null,
    num_studios: null,
    num_1bed: null,
    num_2bed: null,
    num_3bed: null,
    //tot_num_bedrooms:0,
    isTaxiTNCActive: false,
    inputs: false,
    placetype: '',
    ret_tripgen_daily: '',
    offSelected: false,
    resSelected: false,
    retSelected: false,
    restSelected: false,
    supSelected: false,
    hotSelected: false,
  },
  watch: {
    off_sqft: checkLandUseSelections,
    ret_sqft: checkLandUseSelections,
    
    rest_sqft: checkLandUseSelections,
    sup_sqft: checkLandUseSelections,
    hot_sqft: checkLandUseSelections,
    num_1bed: checkLandUseSelections,
    num_2bed: checkLandUseSelections,
    num_3bed: checkLandUseSelections,
    num_studios: checkLandUseSelections,
  },
  
  methods: {
    clickToggleHelp: clickToggleHelp,
    clickToggleInstructions: clickToggleInstructions,
    pickAU: pickAU,
    pickTR: pickTR,
    updateMap: updateMap,
    clearAllInputs: clearAllInputs,
    resetAllInputs: resetAllInputs,

    pickOffice: pickOffice,
    pickRes: pickRes,
    pickRet: pickRet,
    pickRestaurant: pickRestaurant,
    pickSupermarket: pickSupermarket,
    pickHotel: pickHotel,
    pickWork: pickWork,
    pickOther: pickOther,
    pickAll: pickAll,
    pickInbound: pickInbound,
    pickOutbound: pickOutbound,
    pickBoth: pickBoth,
    pickTaxiTNC: pickTaxiTNC,
    pickDaily: pickDaily,
    pickPM: pickPM,
    pickDistrict: pickDistrict,
    pickPlaceType: pickPlaceType,
    pickCity: pickCity,
    // pickCombined: pickCombined,
    getFilteredTrips: getFilteredTrips,
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

function assignDistrict(address, geoLayer, tooltipLabel) {
  //convert the address geojson to leaflet polygon
  let addressPolygon = L.polygon(address.geometry.coordinates[0]);
  //find the centroid of the address polygon
  let centroid = addressPolygon.getBounds().getCenter(); 
  let centroidArray = [centroid.lat, centroid.lng]; //reformat so that the lat/lon labels are correct
  //find out which districts contain the point
  let criticalDistrict = leafletPip.pointInLayer(centroidArray, districts_lyr);
  addressDistrictNum = criticalDistrict[0].feature.dist;
  addressDistrictName = criticalDistrict[0].feature.distname;
  //find out which place type the address district is in
  app.placetype = criticalDistrict[0].feature.place_type;

  return criticalDistrict;

}


function drawDistricts() {
  let districtName;
    for (let district of geoDistricts) { // in a for loop bc sfcta api returns a list of json for this one
    //calls json2geojson function to convert json data response to geojson
    ctaJson2geojson(district);
    districtName = district.distname;
    let districtPolygon = L.polygon(district.geometry.coordinates[0]);
    
  }
    districts_lyr = addGeoLayer(geoDistricts); //takes in a list of geoJson objects and draws them
  }

//save the geoDistricts data locally
queryServer(CTA_API_SERVER + DISTRICTS_URL)
.then(function(data) {
  geoDistricts = data;
  
  drawDistricts();
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

window.downloadCSV = function(){
  createDownloadObjects();
  let data, filename, link;
  let csv = 'Total Trips Generated by Land Use and Time';
  if (csv == null) return;
  csv += '\n'+ convertArrayOfObjectsToCSV({
    data: trgen_download
  });

  csv += '\n\n'+ 'Mode Split Distribution';
  csv += '\n' + convertArrayOfObjectsToCSV({
    data: modesplit_download
  });

  csv += '\n\n'+ 'Total '+ tripDirectionSelect + ' Trips by Mode';
  csv += '\n' + convertArrayOfObjectsToCSV({
    data: total_trips_download
  });
  
  csv += '\n\n '+ modeSelect+ ' Person Trips Distribution by District';
  csv += '\n' + convertArrayOfObjectsToCSV({
    data: tdist_download
  });

  csv += '\n\n '+ modeSelect+ ' Vehicle Trips Distribution by District';
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






