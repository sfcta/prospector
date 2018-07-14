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
mymap.setView([37.76889, -122.440997], 13);
let theBaseLayer = maplib.baselayer; //not sure if this will work


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

})




//still figuring out the specifics of these color styles. I think they are in hex?
let color_styles = [{ normal  : {"color": "#39f", "weight":3,  "opacity": 0.5, "dashArray": '5 5'},
selected: {"color": "#33f",    "weight":4, "opacity": 0.5, "dashArray": '5 5' },},
{ normal  : {"fillColor": "#8B0000 ", "fillOpacity": 0.8 },
selected: {"color": "#34784b", "weight":5, "opacity": 1.0, },}
];

//some global geolayer variables
let address_geoLyr;
let addressGroup;
let districts;

//some other global variables
let addressDistrictNum = 1; //will be defined in a point in polygon related function, which should be
//called in update map and saved. want this to be null until someone puts in an address
let modeSelect = "transit"; //the default should correspond to what is seen visually. should never be null 
//because it will throw an error if a user doesn't press a button before mousing over
let directionSelect = "outbound";



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
    '<b> District: '+ hoverDistrict.distname + 'input an address </b>'
  }
  else {
    let referenceDistrictProp = "prop_dist" + hoverDistrict.dist; //the name of the value that stores the 
    //relevant proportion from address district to hover district
    let filtered_data = filterDistributionData(modeSelect, addressDistrictNum, "outbound"); //hard coded for now, make a direction button just like mode
    console.log(modeSelect);

    let proportion = filtered_data[0][referenceDistrictProp];
    //some formatting of the proportion
    //var myNumeral = numeral(1000);
    var proportion_format = numeral(proportion).format('0.0%');

    this._div.innerHTML = '<h4>Information</h4>' +
    '<b> Proportion of trips from district '+ addressDistrictNum.toString() + ' to district '+ hoverDistrict.dist.toString()+ ': ' + 
    proportion_format +' </b>'
  }
  
};
info.addTo(mymap);

function filterDistributionData(mode, districtNum, direction) { //district num for now is the address distnum
//this function filters the whole distributionData json object according to a few given parameters
  console.log(mode + " in filter distribution data");
  return distributionData.filter(function(piece){ //functions job is given one object tell me if i need it

    return piece.mode == mode && piece.direction == direction && piece.dist == districtNum;
  //this returns a filtered json object that includes only the components of the original json
  //that are the given mode, direction and district number
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



function addGeoLayer(geoJsonData, i){
  let geolyr = L.geoJSON(geoJsonData,{ //this makes a geoJSON layer from
    //geojson data, which is required input. i is the style input
    style: color_styles[i].normal,

    onEachFeature: function(feature, layer) { //need to figure out exactly what this is all doing
      layer.on({
        mouseover: function(e){
          e.target.setStyle(color_styles[i].selected);
          e.target.bringToFront(); 
          if (address_geoLyr) {
            address_geoLyr.bringToFront();
          }
          info.update(e.target.feature);
        },
        mouseout: function(e){
          geolyr.resetStyle(e.target);
          //info.update("peace out");
        },
      });
    }
  });
  //geolyr.bringToFront();
  geolyr.addTo(mymap); //draws the created layer on the map
  return geolyr;
}

function updateMap(thing) {
  //this function that runs when the "search" button is pressed. it does the following:
  // 1. sets the value of input based on the user input
  // 2. calls the planning geocoder via and ajax request and geocodes a given address
  // 3. calls the geojson converter (planningJson2geojson) and converts the response to readable geojson
  // 4. creates a geoLayer from this geojson data
  // 5. adds this layer to the map (lyr.addTo(map))
  // 6. throws an error if the user input is invalid

  let input = app.address; // app.address is the user input. app refers to the VUE object below that handles
  //address_district = 1; //hard coded for now, will become point in polygon function
  let geocodedJson = queryServer(PLANNING_GEOCODER_baseurl+input, 0) //data has got to the geocoder
    .then(function(geocodedJson) { //after queryServer returns the data, do this:
      let geoJson = planningJson2geojson(geocodedJson);
      //addGeoLayer(geoJson, 1); //takes in a list of geoJson objects and draws them
      address_geoLyr = L.geoJSON(geoJson,{ //this makes a geoJSON layer from geojson data, which is input
        style: color_styles[1].normal, //this is hardcoded to blue
        onEachFeature: function(feature, layer) { //function that will be called on each created feature layer
          layer.on({
            mouseover: function(e){
              e.target.setStyle(color_styles[1].selected);
              e.target.bringToFront();
              
              //info.update(e.target.feature);
            },
            mouseout: function(e){

              address_geoLyr.resetStyle(e.target);
              //info.update(null);
            },
          });
        }
      });
      //mymap.removeLayer(districts);
      
      address_geoLyr.addTo(mymap); //adds the geoLayer to the map
      address_geoLyr.bringToFront();


      //address_geoLyr.bringToFront();
    })

  }







//leave this here for now in case queryPlanningGeocoder introduces issues
//   $.ajax(
//     {url: PLANNING_GEOCODER_baseurl+ input,
//       dataType: 'json', //features is populated when the addres is legit. 
//       success: function (data) {
//         console.log("sent data to geocoder") 

//         if (data['error']) { 
//           console.error('Geocode failed: ' + data['error'].message);
//           return;
//         }
//           if (data.features && data.features.length > 0) { //does the data have a features
//             // key and is is not empty. json is a dictionary. is has names and value pairs
//             let geoJson = planningJson2geojson(data); 
//             console.log(geoJson);
//               //this is the exact line of the error
//               let address_geoLyr = L.geoJSON(geoJson,{ //this makes a geoJSON layer from
//                 //geojson data. it requires geojson as input 
//                 style: color_styles[0].normal, //this is hardcoded to blue
//                 onEachFeature: function(feature, layer) {
//                   layer.on({
//                     mouseover: function(e){
//                       e.target.setStyle(color_styles[i].selected);
//                       e.target.bringToFront();
//                       info.update(e.target.feature);
//                     },
//                     mouseout: function(e){
//                       geolyr.resetStyle(e.target);
//                       info.update(null);
//                     },
//                   });
//                 }
//               });
//               address_geoLyr.addTo(mymap);
//             }
//             else {
//               console.log("failed geocoding");
//               alert("sorry, couldnt find " + input);
//             }

//           }
//         });

// }


function pickAU(thing){
  modeSelect = "auto";
  console.log(modeSelect);
}
function pickTR(thing){
  modeSelect = "transit";
  console.log(modeSelect);

}

function pickInbound(thing) {
  directionSelect = "inbound";
  console.log(directionSelect);

}

function pickOutbound(thing) {
  directionSelect = "outbound";
  console.log(directionSelect);


}


// Vue object connects what is done in the user interface html to the javascript. All the buttons
// in the right side panel are connected here. 'data': provides
let app = new Vue({
  el: '#panel', //element is 'el' the whole right side of the map
  delimiters: ['${', '}'],
  data: {
    isAUActive: false,
    isTRActive: true,
    address: null,
    isInbound: false,
    isOutbound: true,
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
    pickInbound: pickInbound,
    pickOutbound: pickOutbound,
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

function colorDistricts() {
  queryServer(API_SERVER+TRIP_DISTRIBUTION)
  .then(function(ddist) { //districts is a json object, after queryServer returns the data, do this: 
    let to_ = ddist.filter(val => val.direction == "outbound"); //
    let to_dist1 = to_.filter(val => val.dist == 1);
    let to_dist1_transit = to_dist1.filter(val => val.mode == "transit");
    let to_dist1_transit_work = to_dist1_transit.filter(val => val.purpose == "work");
    //write a function called filter districts that assigns certain variables and then is 
    //passed into ddist.filter(function)
    console.log(to_dist1_transit_work);
  })

}


function drawDistricts() {
  //if it turns out that most of cta's data is in lists of json, change this
  //function to be more flexible by taking in the url suffix as a parameter and
  //changing the name to be "draw sfcta data" or something like that


  //calls the sfcta api with a specified url- calls queryServer
  //queryServer(API_SERVER+DISTRICTS_URL) //dont put a semi colon here!
  //.then(function(districts) { //after queryServer returns the data, do this:
    for (let segment of geoDistricts) { // in a for loop bc sfcta api returns a list of json for this one
    //calls json2geojson function to convert json data response to geojson
    ctaJson2geojson(segment);
  }
    let districts_lyr = addGeoLayer(geoDistricts, 0); //takes in a list of geoJson objects and draws them
    
  //})
}

queryServer(CTA_API_SERVER + DISTRICTS_URL)
.then(function(data) {
  geoDistricts = data;
  drawDistricts();
})

//colorDistricts();

//some layer groups
// var baseMaps = {
//     "baselayer": theBaseLayer,
// };

// var overlays = {
//     "Addresses": address_geoLyr,
//     "Districts": districts
// };

//L.control.layers(baseMaps, null).addTo(map); //this is throwing an error because its undefined



