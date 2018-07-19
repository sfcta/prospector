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


// some important global variables.
const CTA_API_SERVER = 'https://api.sfcta.org/api/';
const DISTRICTS_URL = 'tia_dist12';
const TRIP_DISTRIBUTION = 'tia_distribution';
const PLANNING_GEOCODER_baseurl = 'http://sfplanninggis.org/cpc_geocode/?search=';

let geoDistricts;
let distributionData;
queryServer(CTA_API_SERVER + TRIP_DISTRIBUTION)
.then(function(data) {
  distributionData = data;
  //console.log(distributionData);
})





//still figuring out the specifics of these color styles. I think they are in hex?
let color_styles = [{ normal  : {"color": "#39f", "weight":3,  "opacity": 0.5, "dashArray": '5 5'},
selected: {"color": "#33f",    "weight":4, "opacity": 0.5, "dashArray": '5 5' },},
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

//some other global variables
let addressDistrictNum; //will be defined in a point in polygon related function, which should be
//called in update map and saved. want this to be null until someone puts in an address
let modeSelect; //the default should correspond to what is seen visually. should never be null 
//because it will throw an error if a user doesn't press a button before mousing over
//let directionSelect = "outbound";
let landUseSelect; //hardcoded to office land use
let tripPurposeSelect; //hardcoded to work trip type
let referenceDistrictProp;
let colorDistrictOutput;


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
    referenceDistrictProp = "prop_dist" + hoverDistrict.dist; //the name of the value that stores the 
    //relevant proportion from address district to hover district
    let filtered_data = filterDistributionData(modeSelect, addressDistrictNum, landUseSelect, tripPurposeSelect); //hard coded for now, make a direction button just like mode
    //console.log(filtered_data);

    let proportion_outbound = numeral(filtered_data[0][referenceDistrictProp]).format('0.0%'); 
    let proportion_inbound = numeral(filtered_data[1][referenceDistrictProp]).format('0.0%');
    

    this._div.innerHTML = '<h4>Information</h4>' +
    '<b> Proportion of outbound trips from district '+ addressDistrictNum.toString() + ' to district '+ hoverDistrict.dist.toString()+ ': ' + 
    proportion_outbound +' </b>' +
    '<br><b> Proportion of inbound trips to district '+ hoverDistrict.dist.toString() + ' from district '+ addressDistrictNum.toString()+ ': ' + 
    proportion_inbound +' </b></br>'
    //colorDistricts(referenceDistrictProp, filtered_data);

  }
  
};
info.addTo(mymap);

function filterDistributionData(mode, districtNum, landUse, purpose) { 
//this function filters the whole distributionData json object according to a few given parameters
// console.log(mode + " selected");
// console.log(landUse + " selected");
// console.log(purpose + " selected");
// console.log("the address is in district " + districtNum);
return distributionData.filter(function(piece){ 
    //for now the input will either be transit or all auto, which is everything that is not transit

    //this returns a filtered json object that includes only the components of the original json
  //that are the given mode, direction and district number
  if (modeSelect == "transit") {

    return piece.mode == "transit" && piece.dist == districtNum && landUse == piece.landuse && purpose == piece.purpose;
  }
  else if (modeSelect !== "transit") {
    return piece.mode !== "transit" && piece.dist == districtNum && landUse == piece.landuse && purpose == piece.purpose;

  }
});


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

  //find out how to properly alert the user if the address is incorrect
  
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
    style: function(feature) {
       switch (feature.dist) { //should be the district name
         case 1: return {color: "#000"};
         case 2:   return {color: "#CD5C5C"};
         case 3:   return {color: "#1B4F72"};
         case 4:   return {color: "#76448A"};
         case 5:   return {color: "#BA4A00"};
         case 6:   return {color: "#196F3D"};
         case 7:   return {color: "#34495E"};
         case 8:   return {color: "#0E6655"};
         case 9:   return {color: "#9A7D0A"};
         case 10:   return {color: "#641E16"};
         case 11:   return {color: "#D68910"};
         case 12:   return {color: "#0000ff"};
       }

     }, 
    onEachFeature: function(feature, layer) { //need to figure out exactly what this is all doing
      layer.on({
        mouseover: function(e){
          //e.target.setStyle(color_styles[0].selected);
          e.target.bringToFront(); 
          console.log(feature);

          //e.target.setStyle(colorDistricts(feature, referenceDistrictProp));

          if (address_geoLyr) {
            address_geoLyr.bringToFront();
          }
          info.update(e.target.feature);
        },
        mouseout: function(e){
          //geolyr.resetStyle(e.target);
          e.target.setStyle(color_styles[0].normal);

          //info.update("peace out");
        },
      });
    }
  });
  //geolyr.bringToFront();
  geolyr.addTo(mymap); //draws the created layer on the map
  return geolyr;
}

function updateMap() {
  //this function that runs when the "search" button is pressed. it does the following:
  // 1. sets the value of input based on the user input
  // 2. calls the planning geocoder via and ajax request and geocodes a given address
  // 3. calls the geojson converter (planningJson2geojson) and converts the response to readable geojson
  // 4. creates a geoLayer from this geojson data
  // 5. adds this layer to the map (lyr.addTo(map))
  // 6. throws an error if the user input is invalid

  let input = app.address; // app.address is the user input. app refers to the VUE object below that handles
  let geocodedJson = queryServer(PLANNING_GEOCODER_baseurl+input, 0) //data has got to the geocoder
    .then(function(geocodedJson) { //after queryServer returns the data, do this:
      if (geocodedJson.features.length !== 0) { //checks if the server returns meaningful json (as opposed to empty)
        let geoJson = planningJson2geojson(geocodedJson); //this is the polygon
        address_geoLyr = L.geoJSON(geoJson,{ //this makes a geoJSON layer from geojson data, which is input
        style: color_styles[1].normal, //this is hardcoded to blue
        onEachFeature: function(feature, layer) { //function that will be called on each created feature layer
          //try calling colorDisticts here?
          // let returnedColor = colorDistricts(feature, referenceDistrictProp);
          // feature.setStyle(returnedColor);
          layer.on({

            mouseover: function(e){

              e.target.setStyle(color_styles[1].selected);
              e.target.bringToFront();
              info.update(e.target.feature);
            },
            mouseout: function(e){

              address_geoLyr.resetStyle(e.target);
              //info.update(null);
            },
          });
        }
      });
      assignDistrict(geoJson, address_geoLyr, input);
      address_geoLyr.addTo(mymap); //adds the geoLayer to the map
      address_geoLyr.bringToFront();
      districts_lyr.resetStyle(function(feature){
        
      })
      //colorDistricts(); //this will restyle the districts according to their relevant colors, and it will only do so 
      //if the returned json is valid (meaning a valid address has been inputted)
    }
    else {
      alert("The address is invalid or is outside the city limits of San Francisco. Enter another address.");
    }
  })
  }


//button functions
function pickAU(thing){
  modeSelect = "all auto";
  //modeSelect = "drive_alone";

  console.log("all auto selected");

}
function pickTR(thing){
  modeSelect = "transit";
  console.log("transit selected");


}

// function pickShared2(thing){
//   modeSelect = "shared_ride_2";

// }

// function pickShared3(thing){
//   modeSelect = "shared_ride_3";

// }

// function pickTaxi(thing){
//   modeSelect = "taxi";

// }

function pickRes(thing){
  landUseSelect = "Res";
  console.log("res selected");

}

function pickOffice(thing){
  landUseSelect = "Off";
  console.log("off selected");

}

function pickRet(thing){
  landUseSelect = "Ret";
  console.log("ret selected");

}

function pickWork(thing){
  tripPurposeSelect = "work";
  console.log("work selected");

}

function pickOther(thing){
  tripPurposeSelect = "other";
  console.log("other/nonwork selected");

}


// Vue object connects what is done in the user interface html to the javascript. All the buttons
// in the right side panel are connected here. 'data': provides
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
    // isShared2Active: false,
    // isShared3Active: false,
    // isTaxiActive: false,

  },
  /* this is for if you want to search directly from the box without the button, watch is
  // for detecting changes, sometimes it is not a button, it could be a checkbox or something
  // that isn't as straightforward as buttons, use watch
  watch: {
    address: updateMap,
  },
  */
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
    // pickTaxi: pickTaxi,
    // pickShared3: pickShared3,
    // pickShared2: pickShared2,

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

function colorDistricts(feature, referenceDistrictProp) {
  console.log(feature.dist);
  //colorDistrictOutput = color_styles[2].normal;

   switch (feature.dist) { //should be the district name
     case 1: return {color: "#000"};
     case 2:   return {color: "#CD5C5C"};
     case 3:   return {color: "#1B4F72"};
     case 4:   return {color: "#76448A"};
     case 5:   return {color: "#BA4A00"};
     case 6:   return {color: "#196F3D"};
     case 7:   return {color: "#34495E"};
     case 8:   return {color: "#0E6655"};
     case 9:   return {color: "#9A7D0A"};
     case 10:   return {color: "#641E16"};
     case 11:   return {color: "#D68910"};
     case 12:   return {color: "#0000ff"};
   }

 }






//     //console.log(featureInstanceLayer); //ok so this is logging all of them...because eachLayer iterates over all of them at once
//     let dist = featureInstanceLayer.feature.dist; //as a test I'll first color code by district number to keep things simple
//     console.log(dist);
//     //let outbound_prop = filtered_data[0][referenceDistrictProp];
//     //console.log(outbound_prop);

//     //this will paint individual districts on mouseover of any of them
//     if (dist == 1) {
//       return "red";
//     }
//     else if (dist == 2) {
//       return "green";
//     }
//     else if (dist == 8) {
//       return "yellow";
//     }
//   }







function drawDistricts() {
  //if it turns out that most of cta's data is in lists of json, change this
  //function to be more flexible by taking in the url suffix as a parameter and
  //changing the name to be "draw sfcta data" or something like that
  let districtName;
    for (let district of geoDistricts) { // in a for loop bc sfcta api returns a list of json for this one
    //calls json2geojson function to convert json data response to geojson
    ctaJson2geojson(district);
    districtName = district.distname;
    //console.log(districtName);

  }
    districts_lyr = addGeoLayer(geoDistricts); //takes in a list of geoJson objects and draws them
    //console.log(districts_lyr);

    //goal is to add a label to each of the geodistricts. it is adding them with the below function but they are 
    //all added to the same place instead of being distributed amongst their layers
    //i think eventually i may want to move this to update map so that it does it with the statistics
    districts_lyr.eachLayer(function(layer) {
      districts_lyr.bindTooltip(layer.feature.distname, {offset: [50, 50], permanent: true, sticky:true}).addTo(mymap);
    });
    //districts_lyr.bindTooltip(districtName, {permanent: true, sticky:true}).addTo(mymap);


    
  //})
}

//save the geoDistricts data locally
queryServer(CTA_API_SERVER + DISTRICTS_URL)
.then(function(data) {
  geoDistricts = data;
  //console.log(geoDistricts);
  drawDistricts();
})





