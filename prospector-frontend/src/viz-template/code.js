'use strict';

// Use npm and babel to support IE11/Safari
import 'babel-polyfill';
import 'isomorphic-fetch';
//import vueSlider from 'vue-slider-component';

let api_server = 'http://api.sfcta.org/';

// add the SF Map using Leafleft and MapBox
let mymap = L.map('sfmap').setView([37.79, -122.44], 14);
let url = 'https://api.mapbox.com/styles/v1/mapbox/light-v9/tiles/256/{z}/{x}/{y}?access_token={accessToken}';
let token = 'pk.eyJ1IjoicHNyYyIsImEiOiJjaXFmc2UxanMwM3F6ZnJtMWp3MjBvZHNrIn0._Dmske9er0ounTbBmdRrRQ';
let attribution ='<a href="http://openstreetmap.org">OpenStreetMap</a> | ' +
                 '<a href="http://mapbox.com">Mapbox</a>';
L.tileLayer(url, {
  attribution:attribution,
  maxZoom: 18,
  accessToken:token,
}).addTo(mymap);
let intersectionLayer;

let losColor = {'A':'#060', 'B':'#9f0', 'C':'#ff3', 'D':'#f90', 'E':'#f60', 'F':'#c00'};
let missingColor = '#ccc';

let osm = 1
let segmentLayer;
let segmentLos = {};

// add Intersection layer
function addIntersectionsLayer(intersections) {
   //TODO: figure out why PostGIS geojson isn't in exactly the right format.


  for (let intersection of intersections) {
    intersection["type"] = "Feature";
    intersection["geometry"] = JSON.parse(intersection.st_asgeojson);
  }


  if (intersectionLayer) mymap.removeLayer(intersectionLayer);


  intersectionLayer = L.geoJSON(intersections, {
    style: styleByIntersectionColor,
    pointToLayer: function(feature, latlng) {

    return new L.CircleMarker(latlng, {radius: 4, fillOpacity: .2});
    },
    onEachFeature: function(feature, layer) {
        //layer.on({
                 //mouseover : highlightFeature,
        // mouseout : resetHighlight
        //});
    },
  });
  intersectionLayer.addTo(mymap);
};

function styleByIntersectionColor(intersection) {
  return {"color": "#ff0000","weight": 0.1,"opacity": .5};

}

// add CMP segment layer
function addCmpSegmentLayer(segments) {
  // TODO: figure out why PostGIS geojson isn't in exactly the right format.
  for (let segment of segments) {
    segment["type"] = "Feature";
    segment["geometry"] = JSON.parse(segment.geometry);
  }

  segmentLayer = L.geoJSON(segments, {
    style: styleByLosColor,
    onEachFeature: function(feature, layer) {
      // add stuff here!
      layer.on({ mouseover: hoverOnSegment,
                 click : clickedOnSegment,
      });
    },
  });

  segmentLayer.addTo(mymap);
}

function styleByLosColor(segment) {
  let cmp_id = segment.segnum2013;
  let los = segmentLos[cmp_id];
  let color = losColor[los];
  if (!color) color = missingColor;

  let style = {
      color: color,
      weight: 4,
      opacity: 1.0
  };

  return style;
}


function getIntersections() {
  const url = api_server + 'api/';
  if (osm == 1) var chosenIntersections = 'osm_intersections?';
  else var chosenIntersections = 'intersections?';
  var queryurl = url+chosenIntersections;

  // Fetch the segments
  fetch(queryurl).then((resp) => resp.json()).then(function(jsonData) {
    addIntersectionsLayer(jsonData);
  })
  .catch(function(error) {
    console.log("err: "+error);
  });
}

function hoverOnSegment(e) {
  console.log("Hover!", e);
}

function clickedOnSegment(e) {
  console.log("Click!", e);
}


function getCmpData(json, year) {
  let url = api_server + 'api/cmp_auto_speeds?';
  let params = 'year=eq.'+year +
               '&period=eq.'+chosenPeriod +
               '&select=cmp_id,name_HCM1985,from,to,dir,avg_speed,year,period,los_HCM1985';

  let finalUrl = url + params;

  fetch(finalUrl).then((resp) => resp.json()).then(function(data) {

    let losData = {};
    for (let segment in data) {
      let thing = data[segment];
      losData[thing.cmp_id] = thing.los_HCM1985;
    }

    // add it to the map
    segmentLos = losData;

    if (segmentLayer) segmentLayer.clearLayers();

  }).catch(function(error) {
    console.log(error);
  });

}

let chosenPeriod = 'AM';

function pickAM(thing) {
  app.isAMactive = true;
  app.isPMactive = false;
  chosenPeriod = 'AM';
  getCmpData();
}

function pickPM(thing) {
  app.isAMactive = false;
  app.isPMactive = true;
  chosenPeriod = 'PM';
  getCmpData();
}


let app = new Vue({
  el: '#panel',
  data: {
    isAMactive: true,
    isPMactive: false,
  },
  methods: {
    pickAM: pickAM,
    pickPM: pickPM,
  },
  watch: {
    // watch nothing, for now
  },
  components: {
    // no extra components, for now
  }
});

// Ready to go! Read some data.
getIntersections();
