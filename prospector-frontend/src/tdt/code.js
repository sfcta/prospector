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

let geoDistricts;
let distributionData;
queryServer(CTA_API_SERVER + TRIP_DISTRIBUTION)
.then(function(data) {
  distributionData = data;

  //console.log(distributionData);
})

let modeSplits;
queryServer(CTA_API_SERVER + MODE_SPLITS)
.then(function(data){
  modeSplits = data;
  console.log(modeSplits);
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
let testboo = true;


//some other global variables
let addressDistrictNum; 
let addressDistrictName;
let modeSelect; 
//let landUseSelect; 
let landUseCheck = false;
let tripPurposeSelect; 
let tripDirectionSelect;
let timePeriodSelect;
//let referenceDistrictProp;
let namePopup;
//let propPopup;
//let total_person_trips_PM= 0;
//let total_person_trips_daily =0;
let highlightRes = false;
let highlightRet = false;
let highlightRest = false;
let highlightOff = false;
let highlightSup = false;




//creating the tooltip functionality and putting it on the map
let info = L.control(); //control refers to tool tip like objects
// let info2 = L.control(); //control refers to tool tip like objects

info.onAdd = function (map) {
  this._div = L.DomUtil.create('div', 'info'); // create a div with a class "info"
  this.update();
  return this._div;
};

 

info.update = function (hoverDistrict) { //hoverDistrict is the mouseover target defned in updateMap
  if (addressDistrictNum == null && hoverDistrict == null) {
    this._div.innerHTML = '<h4>Information</h4>' +
    '<b> Input an address </b>'
    console.log(landUseCheck);
  }
  else if (hoverDistrict == null) {
    this._div.innerHTML = '<h4>Information</h4>' +
    '<b> Trips from district '+ addressDistrictNum.toString() + ':hover over a district </b>'
    console.log(landUseCheck);
  }
  else if (addressDistrictNum == null) {
    this._div.innerHTML = '<h4>Information</h4>' +
    '<b> Input an address to see trip distribution for: '+ hoverDistrict.distname +  '</b>' 
    console.log(landUseCheck);
  }

  else if (modeSelect == null) {
    this._div.innerHTML = '<h4>Information</h4>' +
    '<b> Select a mode to see trip distribution for: '+ hoverDistrict.distname +  '</b>'
    console.log(landUseCheck);
  }

  else if (landUseCheck == false) {
    this._div.innerHTML = '<h4>Information</h4>' +
    '<b> Select a land use to see trip distribution for: '+ hoverDistrict.distname +  '</b>'
    console.log(landUseCheck);
  }

  else if (tripPurposeSelect == null) {
    this._div.innerHTML = '<h4>Information</h4>' +
    '<b> Select a trip purpose to see trip distribution for: '+ hoverDistrict.distname +  '</b>'
    console.log(landUseCheck);
  }
  else {
    
    if (tripDirectionSelect == "outbound"){
      this._div.innerHTML = '<h4>Person Trips</h4>' +
    '<b>' + numeral(getFilteredPersonTrips(hoverDistrict)).format(0,0.0)+ ' outbound person trips from ' + addressDistrictName.toString()+ ' to '+ hoverDistrict.distname.toString() +'</b>';
    } 
    else if (tripDirectionSelect == "inbound"){
      this._div.innerHTML = '<h4>Person Trips</h4>' +
    '<b>' + numeral(getFilteredPersonTrips(hoverDistrict)).format(0,0.0)+ ' inbound person trips to ' + hoverDistrict.distname.toString()+ ' from '+ addressDistrictName.toString() +'</b>';
    }
    else if (tripDirectionSelect == "both"){
      this._div.innerHTML = '<h4>Person Trips</h4>' +
    '<b>' + numeral(getFilteredPersonTrips(hoverDistrict)).format(0,0.0)+ ' total person trips between ' + hoverDistrict.distname.toString()+ ' and '+ addressDistrictName.toString() +'</b>';
    }
    console.log(landUseCheck);


  }
  
};
info.addTo(mymap);

function filterDistributionData(mode, districtNum, landUse, purpose, direction) { 
  //returns a json object or list of json objects that fit given parameters   
    return distributionData.filter(function(piece){ 
      return piece.mode == mode && piece.dist == districtNum && piece.landuse == landUse && piece.purpose == purpose &&
      piece.direction == direction;
    }); 
  }



function getDistProps(hoverDistrict, landUse) {

  let referenceDistrictProp = "prop_dist" + hoverDistrict.dist; //the name of the value that stores the 
  //relevant proportion from address district to hover district

  if (modeSelect && landUseCheck==true && tripPurposeSelect && tripDirectionSelect && addressDistrictNum){
    console.log("is this null: "+ filterDistributionData(modeSelect, addressDistrictNum, landUse, tripPurposeSelect, tripDirectionSelect)[0][referenceDistrictProp]);
    return filterDistributionData(modeSelect, addressDistrictNum, landUse, tripPurposeSelect, tripDirectionSelect)[0][referenceDistrictProp]; 
  }
  else {
    console.log("whats goin' on?");
  }
  
  
  
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
    style: color_styles[0].normal, 
    onEachFeature: function(feature, layer) { 
      layer.on({
        mouseover: function(e){
          //e.target.setStyle(color_styles[0].selected);
          //e.target.bringToFront(); 
          console.log(e.target);
          if (districtMarker){
            districtMarker.unbindTooltip();
            mymap.removeLayer(districtMarker);
          }
          districtMarker = L.circleMarker(tooltip_positions[feature.dist], {color: 'blue', radius: 1}).addTo(mymap).bindTooltip(feature.distname, {permanent:true, sticky: true});
          // if (address_geoLyr) { //this causes an error in clearAllInputs. it looks like this is an unsolved bug in leaflet, having to do with
          //accessing a layer once its been deleted
          //I'm proposing to get rid of the bringtoFront() functionality of the district polygons, since there is
          //no real reason they need to come to the front on mouseover anyway. This is a quick resolution of this problem.
          //   address_geoLyr.bringToFront();
          // }
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
  let distributions = [];
  if (modeSelect && landUseCheck && tripPurposeSelect && tripDirectionSelect && addressDistrictNum && timePeriodSelect
    && filterDistributionData(modeSelect, addressDistrictNum, "Retail", //these are hardcoded pending decision at meeting
    tripPurposeSelect, tripDirectionSelect).length !== 0){ //not sure if this last check is correct
  let filtered_json_object = filterDistributionData(modeSelect, addressDistrictNum, "Retail", 
    tripPurposeSelect, tripDirectionSelect);
  for (let district of geoDistricts) {
    let propName = "prop_dist" + district.dist; 
      distributions.push(filtered_json_object[0][propName]); //this call is resulting in an array of undefined objects
    }
    return Math.max.apply(null, distributions);
  }
  else {
    console.log("get max error possibly empty json filter");
  }

}
  


  
  
function updateMap() {
  if (address_geoLyr){
    mymap.removeLayer(address_geoLyr);

  }

  let input = app.address; // app.address is the user input. app refers to the VUE object below that handles
  
  console.log(input);

  //check if inputs are null, catch the error, alert what the error is and return so as not to run anything in the rest of the function

   
  let geocodedJson = queryServer(PLANNING_GEOCODER_baseurl+input, 0) //data has got to the geocoder
    .then(function(geocodedJson) { //after queryServer returns the data, do this:
      if (geocodedJson.features.length !== 0 && modeSelect && landUseCheck==true && tripPurposeSelect && 
        tripDirectionSelect && timePeriodSelect) {
  
        let geoJson = planningJson2geojson(geocodedJson); //this is the polygon
        address_geoLyr = L.geoJSON(geoJson,{ //this makes a geoJSON layer from geojson data, which is input
        style: color_styles[1].normal, //this is hardcoded to blue
        onEachFeature: function(feature, layer) { 

          layer.on({
            mouseover: function(e){
              e.target.setStyle(color_styles[1].selected);
              e.target.bringToFront();

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

      //only do this if everyone is defined- data validation
        let color_func = chroma.scale(['blue', 'red']).domain([0, getMax()]);
        let direction_proportion = getDistProps(feature, "Retail"); //hard coded!
        return {'fillColor': color_func(direction_proportion), fillOpacity:0.6};     
      });
    }
    else {
      if (!(tripDirectionSelect)){
        alert("The trip direction is not defined.");
      }
      else if (!(tripPurposeSelect)){
        alert("The trip purpose is not defined.");
      }
      // else if (!(addressDistrictNum)){
      //   alert("Enter a valid address.");
      // }
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
        alert("The address is invalid or is outside the city limits of San Francisco. Enter another address.");
    
      }
      
    }
    //input = "";
    //console.log(input)
  })
  }


function clearAllInputs(){
  landUseCheck = false;
  app.isRetail = true;
  app.isResidential = false;
  app.isOffice = false;
  app.isRestaurant = false;
  app.isSupermarket = false;
  app.isHotel = false;
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
  app.off_sqft = null;
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
  //app.inputs = false;
  app.placetype = '';
  //this doesn't seem to be doing anything
  districts_lyr.resetStyle(color_styles[0].normal);
  if (address_geoLyr){
    mymap.removeLayer(address_geoLyr);

  }
}

//button functions
function pickAU(thing){
  modeSelect = "auto";
  app.isAUActive = true;
  app.isTRActive = false;
  app.isTaxiTNCActive = false;


  //console.log("auto selected");

}
function pickTR(thing){
  modeSelect = "transit";
  app.isTRActive = true;
  app.isAUActive = false;
  app.isTaxiTNCActive = false;
  //console.log("transit selected");
  // $('#search-select')
  // .dropdown();

}


function pickTaxiTNC(thing){
  modeSelect = "taxiTNC";
  app.isTaxiTNCActive = true;
  app.isAUActive = false;
  app.isTRActive = false;
  //console.log("taxi/tnc selected");


}

function getFilteredPersonTrips(hoverDistrict){
  let res_persontrips_PM, ret_persontrips_PM, off_persontrips_PM, rest_persontrips_PM, sup_persontrips_PM, 
  res_persontrips_daily, ret_persontrips_daily, off_persontrips_daily, rest_persontrips_daily, sup_persontrips_daily;
  let num_studios = app.num_studios;
  let num_1bed = app.num_1bed;
  let num_2bed = app.num_2bed;
  let num_3bed = app.num_3bed;
  let tot_num_bedrooms = num_studios + num_1bed + (2*app.num_2bed) + (3*app.num_3bed); //these are added together as strings
  let ret_sqft = app.ret_sqft;
  let off_sqft = app.off_sqft;
  let rest_sqft = app.rest_sqft;
  let sup_sqft = app.sup_sqft;
  let hot_sqft = app.hot_sqft;
  //let totals_array = [];


  if (app.isPM ==true) {

    //log in getDistProps is logging as null
    //i think this is what I should change to make place type 3 reference place type 2 for residential
    res_persontrips_PM = ((tripGenRates[1].pkhr_rate)*tot_num_bedrooms)*getDistProps(hoverDistrict, "Residential"); //on this line, the console
    ret_persontrips_PM = (ret_sqft/1000)*(tripGenRates[3].pkhr_rate)*getDistProps(hoverDistrict, "Retail");
    off_persontrips_PM = (off_sqft/1000)*(tripGenRates[0].pkhr_rate)*getDistProps(hoverDistrict, "Office");
    //rest_persontrips_PM = ((rest_sqft/1000)*(tripGenRates[6].pkhr_rate))*getDistProps(hoverDistrict, "Sup");
    //sup_persontrips_PM = ((sup_sqft/1000)*(tripGenRates[4].pkhr_rate))*getDistProps(hoverDistrict, "Rest"); //check rate
    //add hotel
    // console.log(rest_sqft);
    // console.log("rest: " + rest_persontrips_PM);
    // console.log(tot_num_bedrooms);
    // console.log("res: " +res_persontrips_PM);
    // console.log(off_sqft);
    // console.log("off: "+ off_persontrips_PM);
    // console.log(sup_sqft);
    // console.log("sup: "+ sup_persontrips_PM);
    // console.log(ret_sqft);
    // console.log("ret: "+ ret_persontrips_PM);
    //yay! this is correctly adding them together
    //console.log(res_persontrips_PM+ret_persontrips_PM+off_persontrips_PM);
    return (res_persontrips_PM+ret_persontrips_PM+off_persontrips_PM);
  }


    else if (app.isDaily == true) {
      //on this line, the console log in getDistProps is logging as null
      //i think this is what I should change to make place type 3 reference place type 2 for residential
      res_persontrips_daily = ((tripGenRates[1].daily_rate)*tot_num_bedrooms)*getDistProps(hoverDistrict, "Residential");
      
      ret_persontrips_daily = (ret_sqft/1000)*(tripGenRates[3].daily_rate)*getDistProps(hoverDistrict, "Retail");
      off_persontrips_daily = ((off_sqft/1000)*(tripGenRates[0].daily_rate))*getDistProps(hoverDistrict, "Office");
      //sup_persontrips_daily = ((sup_sqft/1000)*(tripGenRates[4].daily_rate))*getDistProps(hoverDistrict, "Sup"); //check rate
      //rest_persontrips_daily = ((rest_sqft/1000)*(tripGenRates[6].daily_rate))*getDistProps(hoverDistrict, "Rest"); //using composite rate
      //console.log(res_persontrips_daily+ret_persontrips_daily+off_persontrips_daily);
      return (res_persontrips_daily+ret_persontrips_daily+off_persontrips_daily);
  }

  
}


// function checkHighlight(){
//   if (!(app.num_1bed == 0 && app.num_2bed ==0 && app.num_3bed == 0)) {
//     highlightRes = true;
//   }
//   if (!(ret_sqft == 0)){
//     highlightRet = true;
//   }
//   if (!(off_sqft == 0)){
//     highlightOff = true;
//   }
//   if (!(sup_sqft == 0)){
//     highlightSup = true;
//   }
//   if (!(rest_sqft == 0)){
//     highlightRest = true;
//   }

// }



function pickRes(thing){
  //landUseSelect = "Res";
  landUseCheck = true; //this is a global boolean variable. it starts out as false and is set to true on the first time a user
  //selects a land use. it communicates that at least one land use has been specified by the user, enabling computation
  app.isResidential = true;
  
  app.isRetail = false;
  app.isOffice = false;
  app.isRestaurant = false;
  app.isSupermarket = false;
  //highlightRes = true; //isActive no longer controls the highlighting in the html, but rather this variable will
  app.isHotel = false;
  //console.log("picked res");


}

function pickOffice(thing){
  //landUseSelect = "Off";
  landUseCheck = true;
  app.isOffice = true;
  app.isResidential = false;
  app.isRetail = false;
  app.isRestaurant = false;
  app.isSupermarket = false;
  app.isHotel = false;
  
  //console.log("picked office");




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
  //landUseSelect = "Restaurant";
  landUseCheck = true;
  app.isRestaurant = true;
  app.isRetail = false;
  app.isResidential = false;
  app.isOffice = false;
  app.isSupermarket = false;
  app.isHotel = false;
  //console.log("picked rest")
  

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
  //landUseSelect = "Supermarket";
  landUseCheck = true;
  app.isSupermarket = true;
  app.isRestaurant = false;
  app.isRetail = false;
  app.isResidential = false;
  app.isOffice = false;
  app.isHotel = false;
  //console.log("picked sup")
  
}

function pickWork(thing){
  tripPurposeSelect = "work";
  //console.log("work selected");
  app.isWork = true;
  app.isOther = false;
  app.isAll = false;


}

function pickOther(thing){
  tripPurposeSelect = "other";
  //console.log("other/nonwork selected");
  app.isOther = true;
  app.isWork = false;
  app.isAll = false;


}

function pickAll(thing){
  tripPurposeSelect = "all";
  //console.log("all selected");
  app.isOther = false;
  app.isWork = false;
  app.isAll = true;


}

function pickInbound(thing){
  tripDirectionSelect = "inbound";
  //console.log("inbound selected");
  app.isInbound = true;
  app.isOutbound = false;
  app.isBoth = false;
}

function pickOutbound(thing){
  tripDirectionSelect = "outbound";
  //console.log("outbound selected");
  app.isInbound = false;
  app.isOutbound = true;
  app.isBoth = false;
}

function pickBoth(thing){
  tripDirectionSelect = "both";
  //console.log("both selected");
  app.isInbound = false;
  app.isOutbound = false;
  app.isBoth = true;
}

function pickPM(thing){
  
  timePeriodSelect = "PM";
  
  console.log(timePeriodSelect);
  app.isPM = true;
  app.isDaily = false;
  // app.isCombined = false;
}

function pickDaily(thing){  
  timePeriodSelect = "daily";
  
  app.isPM = false;
  app.isDaily = true;
  // app.isCombined = false;
}

// function pickCombined(thing){
//   timePeriodSelect = "combined";
//   //console.log("Combined selected");
//   app.isPM = false;
//   app.isDaily = false;
//   app.isCombined = true;
// }



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
    isResidential: false,
    isRetail: false,
    isRestaurant: false,
    isSupermarket: false,
    isHotel: false,
    isWork: false,
    isOther: false,
    isAll: false,
    isInbound: false,
    isOutbound: false,
    isBoth: false,
    isDaily: false,
    isPM: false,
    isCombined: false,
    off_sqft: null,
    ret_sqft: 0,
    res_sqft: 0,
    rest_sqft: 0,
    sup_sqft: 0,
    hot_sqft: 0,
    num_studios: 0,
    num_1bed: 0,
    num_2bed: 0,
    num_3bed: 0,
    isTaxiTNCActive: false,
    inputs: false,
    placetype: '',
    ret_tripgen_daily: '',

  },
   //this is for if you want to search directly from the box without the button, watch is
  // for detecting changes, sometimes it is not a button, it could be a checkbox or something
  // that isn't as straightforward as buttons, use watch
  watch: {
    

  },
  
  methods: {
    clickToggleHelp: clickToggleHelp,
    pickAU: pickAU,
    pickTR: pickTR,
    updateMap: updateMap,
    clearAllInputs: clearAllInputs,

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
    // pickCombined: pickCombined,
    getFilteredPersonTrips: getFilteredPersonTrips,


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
  geoLayer.bindTooltip(tooltipLabel, {permanent: true, sticky:true, }).addTo(mymap);



  let addressPolygon = L.polygon(address.geometry.coordinates[0]);
  //find the centroid of the address polygon
  let centroid = addressPolygon.getBounds().getCenter(); 
  let centroidArray = [centroid.lat, centroid.lng]; //reformat so that the lat/lon labels are correct
  //find out which districts contain the point
  let criticalDistrict = leafletPip.pointInLayer(centroidArray, districts_lyr);
  addressDistrictNum = criticalDistrict[0].feature.dist;
  addressDistrictName = criticalDistrict[0].feature.distname;

  app.placetype = criticalDistrict[0].feature.place_type;
  //document.getElementById("district_PT").innerHTML = addressPlaceType;
  return criticalDistrict;

}


function drawDistricts() {
  let districtName;
    for (let district of geoDistricts) { // in a for loop bc sfcta api returns a list of json for this one
    //calls json2geojson function to convert json data response to geojson
    ctaJson2geojson(district);
    districtName = district.distname;
    let districtPolygon = L.polygon(district.geometry.coordinates[0]);
    //let districtCentroid = districtPolygon.getBounds().getCenter();
    //let districtCentroidArray = [districtCentroid.lng, districtCentroid.lat]; //reformat so that the lat/lon labels are correct
    // namePopup = L.popup()
    // .setLatLng(districtCentroidArray)
    // .setContent(districtName)
    // //.openOn(mymap);

    //change districtCentoidArray to manual lat lons -> work on finding ones that are good UI
    
    //let districtMarker = L.circleMarker(tooltip_positions[district.dist], {color: 'blue', radius: 6}).addTo(mymap).bindTooltip(districtName, {permanent:true, sticky: true});
    //console.log(tooltip_positions[district.dist]);

    //markers.push(districtMarker); //this will only be used if i want to change their contents
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

//this is the downloading part

window.downloadCSV = function(){

  let data, filename, link;
  let array = [filterDistributionData(modeSelect, addressDistrictNum, "Ret", tripPurposeSelect, tripDirectionSelect)[0],
  filterDistributionData(modeSelect, addressDistrictNum, "Res", tripPurposeSelect, tripDirectionSelect)[0],
  filterDistributionData(modeSelect, addressDistrictNum, "Off", tripPurposeSelect, tripDirectionSelect)[0]]
  console.log(array);

  if (modeSelect && addressDistrictNum && tripPurposeSelect && tripDirectionSelect){



  let csv = convertArrayOfObjectsToCSV({
    //this works for distributionData and tripgenrates and filteredDistributionData given a hardcoded land use param
    //, but districts data and filtered data are garbled...
            data:  array
        });}
  else {
    console.log("the csv is null");
    alert("Cannot download without inputs");
  }

  if (csv == null) 
    


    return;

  filename = 'export.csv';

  if (!csv.match(/^data:text\/csv/i)) {

            csv = 'data:text/csv;charset=utf-8,' + csv;

        }

  data = encodeURI(csv);

  link = document.createElement('a');

  link.style.display = 'none';

  link.setAttribute('href', data);

  document.body.appendChild(link);

  link.setAttribute('download', filename);

  link.click();

  document.body.removeChild(link);

};

 

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






