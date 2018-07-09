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
mymap.setView([37.76889, -122.440997], 13);

// some important global variables.
const API_SERVER = 'https://api.sfcta.org/api/';
const DISTRICTS_URL = 'tia_dist12';
const PLANNING_GEOCODER_baseurl = 'http://sfplanninggis.org/cpc_geocode/?search='

//const GEO_VIEW2 = 'tmc_trueshp';


let color_styles = [{ normal  : {"color": "#39f", "weight":3,  "opacity": 0.5, "dashArray": '5 5'},
                    selected: {"color": "#33f",    "weight":4, "opacity": 0.5, "dashArray": '5 5' },},
                    { normal  : {"color": "#3c6", "weight":4,  "opacity": 1.0, },
                    selected: {"color": "#34784b", "weight":5, "opacity": 1.0, },}
];

let geoLayer_tmcseg;
let geoLayer_districts;

let info = L.control();
info.onAdd = function (map) {
  this._div = L.DomUtil.create('div', 'info'); // create a div with a class "info"
  this.update();
  return this._div;
};
info.update = function (props) {
  this._div.innerHTML = '<h4>Information</h4>' +
      '<b> District Name: ' +
      (props ?
      '<b>' + props.tmc + '</b>': 'Hover over a TMC');
};
info.addTo(mymap);

function queryServer(url, i){
  var promise = new Promise(function(resolve, reject) {
    fetch(url)
    .then((resp) => resp.json())
    .then(function(jsonData) {
      resolve(jsonData)
      // return addGeoLayer(jsonData, i);
    })
    .catch(function(error) {
      console.log("err: "+error);
    });
  })
  return promise
}

function queryPlanningGeocoder(url, i){
  fetch(url)
  .then((resp) => resp.json()) //.then waits for the returned promise and acts only if it is resolved
  .then(function(jsonData) {
    //return addGeoLayer(jsonData, i);
    return jsonData
  })
  .catch(function(error) {
    console.log("err: "+error);
  });
}





function extractCoordinates(json) {
 
  return json.features[0].geometry.rings[0] //this returns an array
}



function planningJson2geojson(json) {
  //this is not converting properly (to the format of geoJson that leaflet requires)
  console.log(json + " before conversion")

  json["type"] = "Feature"
  json['geometry'] = {
    "type": "Polygon",
    "coordinates": [extractCoordinates(json)]
  }
  //"properties": {
  // "name": "Dinagat Islands"
  

  //this should be a re-formatted json object
  console.log(json + " after conversion")
}


  //json["geometry"] = JSON.parse(json.geometry);


function ctaJson2geojson(json) {
  //looks like geojson is just json formatted in a specific way, so this function
  //takes in json and formats it to geojson specifications


  // geojson['properties'] = json //properties name points to input json
  // geojson['type']= "Feature" //it is a feature
  // let coordinates = extractCoordinates(json)
  // geojson['geometry']= {"type": "Polygon", "coordinates":
  //     coordinates}

  json["type"] = "Feature";
  json["geometry"] = JSON.parse(json.geometry);
  
}

 

function addGeoLayer(geoJsonData, i){
  for (let segment of geoJsonData) {
    // segment["type"] = "Feature";
    // segment["geometry"] = JSON.parse(segment.geometry);
    console.log(segment)
  }
  let geolyr = L.geoJSON(geoJsonData,{ //this makes a geoJSON layer from
    //geojson data. it requires geojson as input and DOES NOT convert from json
    //to geojson. 
    style: color_styles[i].normal,
    onEachFeature: function(feature, layer) {
      layer.on({
                mouseover: function(e){
                  e.target.setStyle(color_styles[i].selected);
                  e.target.bringToFront();
                  info.update(e.target.feature);
                },
                mouseout: function(e){
                  geolyr.resetStyle(e.target);
                  info.update(null);
                },
      });
    }
  });
  geolyr.addTo(mymap);
  console.log("map updated with " + geolyr)
  return geolyr;
}

//this function that runs when the "submit" button is pressed
function updateMap(thing) {
  // app.address is the user input. app refers to the VUE object below that handles
  //events
  let input = app.address
  console.log(app.address)
  $.ajax(
    {url: PLANNING_GEOCODER_baseurl+ input,
      dataType: 'json', //features is populated when the addres is legit. 
      //data: {
       // search: address
      //},
      success: function (data) {
        console.log("sent data to geocoder") 
        
          if (data['error']) { //the same as data.error- not sure if this would happen this way? ask mike
            console.error('Geocode failed: ' + data['error'].message);
            return;
          }
          if (data.features && data.features.length > 0) { //does the data have a features
            // key and is is not empty. json is a dictionary. is has names and values
            // should consider building in a check for whenever there is multiple
            // features or rings
            // let address_json = queryPlanningGeocoder(PLANNING_GEOCODER_baseurl+input, 0)
            planningJson2geojson(data) //failing here -> uncomment this! 2 below is just a test
            
            console.log(JSON.parse(JSON.stringify(data)) + "this is the data!")
            //this is the exact line of the error
            let address_layer = addGeoLayer([data], 0) //addGeoLayer expects a list, so this input is in []


          }
          else {
            console.log("failed geocoding")
            alert("sorry, couldnt find " + input)
          }
        
      }
    });

  //let geocoderData = queryPlanningGeocoder(PLANNING_GEOCODER_baseurl+app.input, 2)
  //console.log(geocoderData)
  //planningJson2geojson(geocoderData)
  //console.log(geocoderData)


}


function pickAU(thing){
  console.log("auto selected")
}
function pickTR(thing){
  console.log("transit selected")

}

//connects what is done in the user interface html to the javascript

let app = new Vue({
  el: '#panel', //element is 'el' the whole right side of the map
  delimiters: ['${', '}'],
  data: {
    isAUActive: true,
    isTRActive: false,
    address: null,
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

// geoLayer_districts = queryServer(API_SERVER+DISTRICTS_URL, 1);

function drawDistricts() {
  //if it turns out that most of cta's data is in lists of json, change this
  //function to be more flexible by taking in the url suffix as a parameter and
  //changing the name


  //calls the sfcta api with a specified url- calls queryServer
  queryServer(API_SERVER+DISTRICTS_URL, 1)
  .then(function(districts) { //after queryServer returns the data, do this:
    // calls json2geojson function to convert json data response to geojson
    // in a for loop bc sfcta api returns a list of json for this one
    for (let segment of districts) {
      ctaJson2geojson(segment)
    }
    // call addGeoLayer without the conversion
    addGeoLayer(districts, 1) //takes in a list of geoJson objects and draws them
  })
  

}

// function drawAddressPolygons(planningData) {
//   //this is a test function to debug addGeoLayer and add the json data from planning's geocoder to the map
//   //it takes in the json data in the format that is returned by planning's geocoder
//   queryPlanningGeocoder(PLANNING_GEOCODER_baseurl+)
//   json2geojson(planningData) //modifies planningJson in place to convert it to geoJson
//   console.log(planningData)
// }

drawDistricts()


// geoLayer_tmcshp = queryServer(API_SERVER+GEO_VIEW2, 1);