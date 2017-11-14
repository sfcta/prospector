'use strict';

// Use npm and babel to support IE11/Safari
import 'babel-polyfill';
import 'isomorphic-fetch';
import vueSlider from 'vue-slider-component';

let api_server = 'http://api.sfcta.org/';

// add the SF Map using Leafleft and MapBox
let mymap = L.map('sfmap').setView([37.78, -122.415], 14);
let url = 'https://api.mapbox.com/styles/v1/mapbox/light-v9/tiles/256/{z}/{x}/{y}?access_token={accessToken}';
let token = 'pk.eyJ1IjoicHNyYyIsImEiOiJjaXFmc2UxanMwM3F6ZnJtMWp3MjBvZHNrIn0._Dmske9er0ounTbBmdRrRQ';
let attribution ='<a href="http://openstreetmap.org">OpenStreetMap</a> | ' +
                 '<a href="http://mapbox.com">Mapbox</a>';
L.tileLayer(url, {
  attribution:attribution,
  maxZoom: 18,
  accessToken:token,
}).addTo(mymap);


let losColor = {'A':'#060', 'B':'#9f0', 'C':'#ff3', 'D':'#f90', 'E':'#f60', 'F':'#c00'};
let missingColor = '#ccc';

let segmentLayer;
let segmentLos = {};

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

const yearLabels = ['2006', '2007', '2008', '2009', '2010', '2011', '2012', '2013', '2014'];

function getCmpSegments() {
  const url = api_server + 'api/cmp_segments?' +
                           'select=geometry,segnum2013,cmp_name,cmp_from,cmp_to,cmp_dir,cmp_len';

  // Fetch the segments
  fetch(url).then((resp) => resp.json()).then(function(jsonData) {

    // do stuff here!
    addCmpSegmentLayer(jsonData);
    //getCmpData(jsonData, 2015);
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

function getSWITRSData(json, year) {
  let url = api_server + 'api/switrs_viz?';
  if (chosenIncidents = 'Both'){
	  let params = 'year=eq.'+year +
               '&period=eq.'+chosenPeriod +
               '&select=bickill,bicinj,pedkill,pedinj';
  } else if (chosenIncidents = 'Bikes'){
	  let params = 'year=eq.'+year +
               '&period=eq.'+chosenPeriod +
               '&select=bickill,bicinj';
  } else {
	  let params = 'year=eq.'+year +
               '&period=eq.'+chosenPeriod +
               '&select=pedkill,pedinj';
  }

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

// L.marker([37.77, -122.42]).addTo(mymap);
// L.marker([37.79, -122.416723]).addTo(mymap);

let chosenPeriod = 'AM';
let chosenIncidents = 'Both';

function pickAM(thing) {
  app.isAMactive = true;
  app.isPMactive = false;
  chosenPeriod = 'AM';
  getSWITRSData();
}

function pickPM(thing) {
  app.isAMactive = false;
  app.isPMactive = true;
  chosenPeriod = 'PM';
  getSWITRSData();
}

function pickBoth(thing) {
	app.isBikeactive = false;
	app.isPedactive = false;
	app.isBothactive = true;
	chosenIncidents = 'Both'
	getSWITRSData();
}

function pickBike(thing) {
	app.isBikeactive = true;
	app.isPedactive = false;
	app.isBothactive = false;
	chosenIncidents = 'Bikes'
	getSWITRSData();
}

function pickPed(thing) {
	app.isBikeactive = false;
	app.isPedactive = true;
	app.isBothactive = false;
	chosenIncidents = 'Peds'
	getSWITRSData();
}

function clickAllYears(e) {
  app.sliderValue = 0;
}

function clickYear(chosenYear) {
  year = parseInt(chosenYear);
  app.year = year;

  displayDetails();
  updateColors();
}

let timeSlider = {
          min: 0,
          max: 10,
          disabled: true,
					width: 'auto',
					height: 3,
					direction: 'horizontal',
					dotSize: 16,
					eventType: 'auto',
					show: true,
					realTime: false,
					tooltip: 'always',
					clickable: true,
					tooltipDir: 'bottom',
					piecewise: true,
          piecewiseLabel: false,
					lazy: false,
					reverse: false,
          speed: 0.25,
          piecewiseStyle: {
            "backgroundColor": "#ccc",
            "visibility": "visible",
            "width": "6px",
            "height": "6px"
          },
          piecewiseActiveStyle: {
            "backgroundColor": "#ccc",
            "visibility": "visible",
            "width": "6px",
            "height": "6px"
          },
          labelStyle: {  "color": "#ccc"},
          labelActiveStyle: {  "color": "#ccc"},
          processStyle: {
            "backgroundColor": "#ffc"
          },
          formatter: function(index) {
            return (index==0 ? 'All Years >>' : yearLabels[index-1]);
          },
          style: {"marginTop":"-25px","marginBottom":"30px","marginLeft":"46px","marginRight":"18px"},
};

function sliderChanged(index) {
  app.isAllYear  = (index==0);


  displayDetails();
  updateLegend();
}

function switchToYearlyView(index) {
  let YearData = loadYearlyData(index);
  mymap.getSource('taz-source').setData(hourData);
}

let app = new Vue({
  el: '#panel',
  data: {
    isAMactive: true,
    isPMactive: false,
	isBikeactive: false,
	isPedactive: false,
	isBothactive: true,
	timeSlider: timeSlider
  },
  methods: {
    pickAM: pickAM,
    pickPM: pickPM,
	pickBike: pickBike,
	pickBoth: pickBoth,
	pickPed: pickPed
  },
  watch: {
    sliderValue: function(value) {
      this.getSliderValue();
    }
  },
  components: {
    vueSlider,
  }
});

// Ready to go! Read some data.
getCmpSegments();
