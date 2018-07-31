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
let tripDirectionSelect;
let timePeriodSelect;
let referenceDistrictProp;
let colorDistrictOutput;
let namePopup;
let propPopup;
let max_outbound;
let total_person_trips_PM= 0;
let total_person_trips_daily =0;





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
    
    if (tripDirectionSelect == "outbound"){
      this._div.innerHTML = '<h4>Person Trips</h4>' +
    '<b>' + numeral(getFilteredPersonTrips(hoverDistrict)).format(0,0)+ ' outbound person trips from district ' + addressDistrictNum.toString()+ ' to '+ hoverDistrict.dist.toString() +'</b>';
    } 
    else if (tripDirectionSelect == "inbound"){
      this._div.innerHTML = '<h4>Person Trips</h4>' +
    '<b>' + numeral(getFilteredPersonTrips(hoverDistrict)).format(0,0)+ ' inbound person trips to district ' + hoverDistrict.dist.toString()+ ' from '+ addressDistrictNum.toString() +'</b>';
    }
    else if (tripDirectionSelect == "both"){
      this._div.innerHTML = '<h4>Person Trips</h4>' +
    '<b>' + numeral(getFilteredPersonTrips(hoverDistrict)).format(0,0)+ ' total person trips between district ' + hoverDistrict.dist.toString()+ ' and '+ addressDistrictNum.toString() +'</b>';
    }


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



function getDistProps(hoverDistrict) {

  referenceDistrictProp = "prop_dist" + hoverDistrict.dist; //the name of the value that stores the 
  //relevant proportion from address district to hover district

  if (modeSelect && landUseSelect && tripPurposeSelect && tripDirectionSelect && addressDistrictNum){
    return filterDistributionData(modeSelect, addressDistrictNum, landUseSelect, tripPurposeSelect, tripDirectionSelect)[0][referenceDistrictProp]; 
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
  let distributions = [];
  if (modeSelect && landUseSelect && tripPurposeSelect && tripDirectionSelect && addressDistrictNum && timePeriodSelect
    && filterDistributionData(modeSelect, addressDistrictNum, landUseSelect, 
    tripPurposeSelect, tripDirectionSelect).length !== 0){ //not sure if this last check is correct
  let filtered_json_object = filterDistributionData(modeSelect, addressDistrictNum, landUseSelect, 
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
  let input = app.address; // app.address is the user input. app refers to the VUE object below that handles
  
  console.log(input);

  //check if inputs are null, catch the error, alert what the error is and return so as not to run anything in the rest of the function

   
  let geocodedJson = queryServer(PLANNING_GEOCODER_baseurl+input, 0) //data has got to the geocoder
    .then(function(geocodedJson) { //after queryServer returns the data, do this:
      if (geocodedJson.features.length !== 0 && modeSelect && landUseSelect && tripPurposeSelect && 
        tripDirectionSelect && timePeriodSelect) {
  
        let geoJson = planningJson2geojson(geocodedJson); //this is the polygon
        address_geoLyr = L.geoJSON(geoJson,{ //this makes a geoJSON layer from geojson data, which is input
        style: color_styles[1].normal, //this is hardcoded to blue
        onEachFeature: function(feature, layer) { 

          layer.on({
            mouseover: function(e){
              e.target.setStyle(color_styles[1].selected);
              e.target.bringToFront();
              //getDistProps(e.target.feature); //gets the filtered data according to trip direction, address/district num, trip type, mode
              info.update(e.target.feature); //this sends the hovered over district info to the info.update function

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
        //let color_func = chroma.scale(['blue', 'red']).domain([0, 100]);
        let proportion_outbound = getDistProps(feature); //any more than 12 times the alert is not being caused by this
        return {'fillColor': color_func(proportion_outbound), fillOpacity:0.6};     
      });
      // for (let marker of markers) {
      //   marker.bindTooltip(total_person_trips_PM.toString()); //make this content non-satic, based on calculation. needs to be a string
      //   //console.log(marker);
      // }
    }
    else {
      alert("The address is invalid or is outside the city limits of San Francisco. Enter another address. or some other inputs is wrong");
      //console.log(timePeriodSelect);
      //console.log(hoverDistrict);
      // console.log(tripDirectionSelect);
      // console.log(addressDistrictNum);
      // console.log(tripPurposeSelect);
    }
    //input = "";
    //console.log(input)
  })
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
  let totals_array = [];


  if (app.isPM ==true) {
    res_persontrips_PM = ((tripGenRates[1].pkhr_rate)*tot_num_bedrooms)*getDistProps(hoverDistrict);
    ret_persontrips_PM = (ret_sqft/1000)*(tripGenRates[3].pkhr_rate)*getDistProps(hoverDistrict);
    off_persontrips_PM = (off_sqft/1000)*(tripGenRates[0].pkhr_rate)*getDistProps(hoverDistrict);
    rest_persontrips_PM = ((rest_sqft/1000)*(tripGenRates[6].pkhr_rate))*getDistProps(hoverDistrict);
    sup_persontrips_PM = ((sup_sqft/1000)*(tripGenRates[4].pkhr_rate))*getDistProps(hoverDistrict); //check rate
    console.log(res_persontrips_PM+ret_persontrips_PM+off_persontrips_PM+rest_persontrips_PM+sup_persontrips_PM);
    console.log("rest: " + rest_persontrips_PM);
    console.log("res: " +res_persontrips_PM);
    console.log("off: "+ off_persontrips_PM);
    return (res_persontrips_PM+ret_persontrips_PM+off_persontrips_PM+rest_persontrips_PM+sup_persontrips_PM);
  }


    else if (app.isDaily == true) {
      res_persontrips_daily = ((tripGenRates[1].daily_rate)*tot_num_bedrooms)*getDistProps(hoverDistrict);
      ret_persontrips_daily = (ret_sqft/1000)*(tripGenRates[3].daily_rate)*getDistProps(hoverDistrict);
      off_persontrips_daily = ((off_sqft/1000)*(tripGenRates[0].daily_rate))*getDistProps(hoverDistrict);
      sup_persontrips_daily = ((sup_sqft/1000)*(tripGenRates[4].daily_rate))*getDistProps(hoverDistrict); //check rate
      rest_persontrips_daily = ((rest_sqft/1000)*(tripGenRates[6].daily_rate))*getDistProps(hoverDistrict); //using composite rate
      console.log(res_persontrips_daily+ret_persontrips_daily+off_persontrips_daily+rest_persontrips_daily+sup_persontrips_daily);
      return (res_persontrips_daily+ret_persontrips_daily+off_persontrips_daily+rest_persontrips_daily+sup_persontrips_daily);
  }

  
}



  //right now this isn't a true total since its only adding the total for each case and each hoverDistrict
  // const arrSum = arr => arr.reduce((a,b) => a + b, 0);
  // let total_person_trips = arrSum(totals_array);
  // console.log("total person trips: " + total_person_trips);
  // console.log(totals_array); //this is only totaling the one in quesiton
   //still not returning a true total






function pickRes(thing){
  landUseSelect = "Res";
  app.isRes = true;
  app.isRet = false;
  app.isOffice = false;
  app.isRestaurant = false;
  app.isSupermarket = false;
  //console.log("picked res");


}

function pickOffice(thing){
  landUseSelect = "Off";
  app.isOffice = true;
  app.isRes = false;
  app.isRet = false;
  app.isRestaurant = false;
  app.isSupermarket = false;
  //console.log("picked office");




}

function pickRet(thing){
  landUseSelect = "Ret";
  app.isRet = true;
  app.isRes = false;
  app.isOffice = false;
  app.isRestaurant = false;
  app.isSupermarket = false;


}

function pickRestaurant(thing){
  landUseSelect = "Restaurant";
  app.isRestaurant = true;
  app.isRet = false;
  app.isRes = false;
  app.isOffice = false;
  app.isSupermarket = false;
  //console.log("picked rest")

}

function pickSupermarket(thing){
  landUseSelect = "Supermarket";
  app.isSupermarket = true;
  app.isRestaurant = false;
  app.isRet = false;
  app.isRes = false;
  app.isOffice = false;
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
  // if (timePeriodSelect == "PM"){
  //   timePeriodSelect = null;
  // }
  // else {
    timePeriodSelect = "PM";
  // }
  console.log(timePeriodSelect);
  app.isPM = true;
  app.isDaily = false;
  app.isCombined = false;
}

function pickDaily(thing){
  // if (timePeriodSelect == "daily"){
  //   timePeriodSelect = null;
  // }
  // else {
  timePeriodSelect = "daily";
  // }
  //console.log("daily selected");
  app.isPM = false;
  app.isDaily = true;
  app.isCombined = false;
}

function pickCombined(thing){
  timePeriodSelect = "combined";
  //console.log("Combined selected");
  app.isPM = false;
  app.isDaily = false;
  app.isCombined = true;
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
    isRestaurant: false,
    isSupermarket: false,
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
    num_studios: 0,
    num_1bed: 0,
    num_2bed: 0,
    num_3bed: 0,
    isTaxiTNCActive: false,
    inputs: false,
    placetype: '',

  },
   //this is for if you want to search directly from the box without the button, watch is
  // for detecting changes, sometimes it is not a button, it could be a checkbox or something
  // that isn't as straightforward as buttons, use watch
  watch: {
    // num_studios: getPersonTrips,
    // num_1bed: getPersonTrips,
    // num_2bed: getPersonTrips,
    // num_3bed: getPersonTrips,
    // off_sqft: getPersonTrips,
    // ret_sqft: getPersonTrips,
    // rest_sqft: getPersonTrips,
    // sup_sqft: getPersonTrips,

  },
  
  methods: {
    clickToggleHelp: clickToggleHelp,
    pickAU: pickAU,
    pickTR: pickTR,
    updateMap: updateMap,
    pickOffice: pickOffice,
    pickRes: pickRes,
    pickRet: pickRet,
    pickRestaurant: pickRestaurant,
    pickSupermarket: pickSupermarket,
    pickWork: pickWork,
    pickOther: pickOther,
    pickAll: pickAll,
    pickInbound: pickInbound,
    pickOutbound: pickOutbound,
    pickBoth: pickBoth,
    pickTaxiTNC: pickTaxiTNC,
    pickDaily: pickDaily,
    pickPM: pickPM,
    pickCombined: pickCombined,
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

  app.placetype = criticalDistrict[0].feature.place_type;
  //document.getElementById("district_PT").innerHTML = addressPlaceType;
  return criticalDistrict;

}


function drawDistricts() {
  let districtName;
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
    12: [37.835095, -122.493132] }; //this will be a dictionary of 12 lat/lon coordinate arrays that correspond in order to the districts
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
    
    let districtMarker = L.circleMarker(tooltip_positions[district.dist], {color: 'blue', radius: 6}).addTo(mymap).bindTooltip(districtName, {permanent:true, sticky: true});
    //console.log(tooltip_positions[district.dist]);

    markers.push(districtMarker); //this will only be used if i want to change their contents
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
  let csv = convertArrayOfObjectsToCSV({
            data: tripGenRates
        });
  if (csv == null) return;
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






