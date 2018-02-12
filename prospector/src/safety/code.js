'use strict';

// Use npm and babel to support IE11/Safari
import 'babel-polyfill';
import 'isomorphic-fetch';
import vueSlider from 'vue-slider-component';
import Cookies from 'js-cookie';

let api_server = 'http://api.sfcta.org/api/switrs_viz';
var maplib = require('../jslib/maplib');
let styles = maplib.styles;

// add the SF Map using Leafleft and MapBox
let mymap = maplib.sfmap;
let url = 'https://api.mapbox.com/styles/v1/mapbox/light-v9/tiles/256/{z}/{x}/{y}?access_token={accessToken}';
let token = 'pk.eyJ1IjoicHNyYyIsImEiOiJjaXFmc2UxanMwM3F6ZnJtMWp3MjBvZHNrIn0._Dmske9er0ounTbBmdRrRQ';
let attribution ='<a href="http://openstreetmap.org">OpenStreetMap</a> | ' +
                 '<a href="http://mapbox.com">Mapbox</a>';
L.tileLayer(url, {
  attribution:attribution,
  maxZoom: 18,
  accessToken:token,
}).addTo(mymap);

let incColor = {'Fatal':"#ff0000",'Non-fatal':"#800080"};
let incOpacity = {'Fatal':1, 'Non-fatal':0.15};
let missingColor = '#ccc';

let collisionLayer;
let mapLegend;
let segmentLos = {};

let popHoverSegment;

// add SWITRS layer
function addSWITRSLayer(collisions) {
   //TODO: figure out why PostGIS geojson isn't in exactly the right format.
   
  for (let collision of collisions) {
    collision["type"] = "Feature";
    collision["geometry"] = JSON.parse(collision.st_asgeojson);
  }
  
  if (mapLegend) mymap.removeControl(mapLegend);
  if (collisionLayer) mymap.removeLayer(collisionLayer);
  
  collisionLayer = L.geoJSON(collisions, {
    style: styleByIncidentColor,
	pointToLayer: function(feature, latlng) {
		
		if (feature['pedkill'] > 0 || feature['bickill'] > 0) { 
			return new L.CircleMarker(latlng, {radius: (1.5/feature['count'])+feature['count']+.5, fillOpacity: 1});
		} else if (feature['pedinj'] > 0 || feature['bicinj'] > 0){
			return new L.CircleMarker(latlng, {radius: (1.5/feature['count'])+feature['count']+.5, fillOpacity: 1/(feature['count']+(feature['count']/2))});
		} else if (chosenSeverity != 'Fatal'){
			return new L.CircleMarker(latlng, {radius: (1.5/feature['count'])+feature['count']+.5, fillOpacity: 1/(feature['count']+(feature['count']/2))});
		}
	  },
    onEachFeature: function(feature, layer) {
        layer.on({
                 mouseover : highlightFeature,
				 mouseout : resetHighlight
        });
    },
  });
  collisionLayer.addTo(mymap);

  mapLegend = L.control({position: 'bottomright'});
 
  mapLegend.onAdd = function (map) {
	  
	  var div = L.DomUtil.create('div', 'info legend'),
		  grades = ['Fatal', 'Non-fatal'],
		  labels = [];
	  
	  div.innerHTML = '<h4>Incident Category</h4>';
      for (var i = 0; i < grades.length; i++) div.innerHTML += '<i style="background:' + incColor[grades[i]] + '"></i>' + grades[i] + '<br>';
	  
	  return div;
	  
  };
  
  mapLegend.addTo(mymap);
};

function styleByIncidentColor(collision) {
  if (collision['pedkill'] > 0 || collision['bickill'] > 0) {
	  return {"color": incColor['Fatal'],"weight": 0.1,
	  "opacity": incOpacity['Fatal']};
  } else {
	  return {"color": incColor['Non-fatal'],"weight": 0.1,
	  "opacity": incOpacity['Non-fatal']};
  }

  let color = incColor[incType];
  let opac = incOpacity[incType];

  return {"color": color,"weight": 0.1,"opacity": opac};

}

function getSWITRSinfo() {
  
  const url = api_server + '?select=st_asgeojson,pedcol,biccol,year,time_,pedkill,pedinj,bickill,bicinj,count,street_names';
  if (chosenIncidents == 'Both') var chosenCollisions = '';
  else if (chosenIncidents == 'Bike') var chosenCollisions = '&pedcol=eq.N';
  else if (chosenIncidents == 'Ped') var chosenCollisions = '&biccol=eq.N';
  if (chosenSeverity == 'All') var chosenInjuries = '';
  else if (chosenSeverity == 'Fatal') var chosenInjuries = '&pedinj=eq.0&bicinj=eq.0';
  else if (chosenSeverity == 'Nonf') var chosenInjuries = '&pedkill=eq.0&bickill=eq.0';
  let queryurl = url + chosenCollisions + chosenInjuries + '&year=eq.' + app.sliderValue;
  
  // Fetch the segments
  fetch(queryurl).then((resp) => resp.json()).then(function(jsonData) {
    addSWITRSLayer(jsonData);
  })
  .catch(function(error) {
    console.log("err: "+error);
  });
}

var popupTimeout;

function highlightFeature(e) {

  clearTimeout(popupTimeout);

  let highlightedGeo = e.target;
  highlightedGeo.bringToFront();

  
  highlightedGeo.setStyle(styles.selected);
  let geo = e.target.feature;
  let popupText = "<b>Total Collisions Here: "+geo.count+"<br/>" + "Roads at Intersection: ";
  popupText += "<br/>"+geo.street_names;
  popHoverSegment = L.popup()
                    .setLatLng(e.latlng)
                    .setContent(popupText);

  popupTimeout = setTimeout( function () {
    popHoverSegment.openOn(mymap);
  }, 300);
}


function resetHighlight(e) {
  popHoverSegment.remove();
  collisionLayer.resetStyle(e.target);
}

//let chosenPeriod = 'AM';
let chosenIncidents = 'Ped';
let chosenSeverity = 'All';

//function pickAM(thing) {
  //app.isAMactive = true;
  //app.isPMactive = false;
  //chosenPeriod = 'AM';
  //getSWITRSinfo();
//}

//function pickPM(thing) {
  //app.isAMactive = false;
  //app.isPMactive = true;
  //chosenPeriod = 'PM';
  //getSWITRSinfo();
//}

function pickBike(thing) {
	app.isBikeactive = true;
	app.isPedactive = false;
	chosenIncidents = 'Bike'
	getSWITRSinfo();
}

function pickPed(thing) {
	app.isBikeactive = false;
	app.isPedactive = true;
	chosenIncidents = 'Ped'
	getSWITRSinfo();
}

function pickFatal(thing) {
	app.isFatalactive = true;
	app.isNonfactive = false;
	app.isAllactive = false;
	chosenSeverity = 'Fatal'
	getSWITRSinfo();
}

function pickNonf(thing) {
	app.isFatalactive = false;
	app.isNonfactive = true;
	app.isAllactive = false;
	chosenSeverity = 'Nonf'
	getSWITRSinfo();
}

function pickAll(thing) {
	app.isFatalactive = false;
	app.isNonfactive = false;
	app.isAllactive = true;
	chosenSeverity = 'All'
	getSWITRSinfo();
}

function sliderChanged(thing) {
  getSWITRSinfo();
}

function updateSliderData() {
  let yearlist = [];
  fetch(api_server + '?select=year')
  .then((resp) => resp.json()).then(function(jsonData) {
    for (let entry of jsonData) {
      if (!yearlist.includes(entry.year)) yearlist.push(entry.year);
    }
    yearlist = yearlist.sort();
    app.timeSlider.data = yearlist;
    app.sliderValue = yearlist[yearlist.length-1];
  });
}

let timeSlider = {
          data: [0],
          sliderValue: 0,
          disabled: false,
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
          style: {"marginTop":"0px","marginBottom":"40px"},
};

let app = new Vue({
  el: '#panel',
  delimiters: ['${', '}'],
  data: {
    //isAMactive: true,
    //isPMactive: false,
	isBikeactive: false,
	isPedactive: true,
	isFatalactive: false,
	isNonfactive: false,
	isAllactive: true,
	sliderValue: 0,
	timeSlider: timeSlider
  },
  methods: {
	clickToggleHelp: clickToggleHelp,
    //pickAM: pickAM,
    //pickPM: pickPM,
	pickBike: pickBike,
	pickPed: pickPed,
	pickFatal: pickFatal,
	pickNonf: pickNonf,
	pickAll: pickAll
  },
  watch: {
    sliderValue: sliderChanged,
  },
  components: {
    vueSlider,
  }
});

let cookieShowHelp = Cookies.get('showHelp');
function clickToggleHelp() {
  helpPanel.showHelp = !helpPanel.showHelp;

  // and save it for next time
  if (helpPanel.showHelp) {
    Cookies.remove('showHelp');
  } else {
    Cookies.set('showHelp','false', {expires:365});
  }
}

let helpPanel = new Vue({
  el: '#helpbox',
  data: {
    showHelp: (cookieShowHelp==undefined),
  },
  methods: {
    clickToggleHelp: clickToggleHelp,
  },
  mounted: function () {
    document.addEventListener("keydown", (e) => {
      if (this.showHelp && e.keyCode == 27) {
        clickToggleHelp();
      }
    });
  }}
);
// Ready to go! Read some data.
updateSliderData();