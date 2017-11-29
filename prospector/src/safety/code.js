'use strict';

// Use npm and babel to support IE11/Safari
import 'babel-polyfill';
import 'isomorphic-fetch';
import vueSlider from 'vue-slider-component';

let api_server = 'http://api.sfcta.org/api';

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


let incColor = {'PK':"#280f34", 'BK':"#cb0101", 'PI':"#11cbd7", 'BI':"#ff5200"};
let incOpacity = {'PK':0.5, 'BK':0.5, 'PI':0.15, 'BI':0.15};
let missingColor = '#ccc';

let collisionLayer;
let segmentLos = {};

// add CMP segment layer
function addSWITRSLayer(collisions) {
   //TODO: figure out why PostGIS geojson isn't in exactly the right format.
   
  for (let collision of collisions) {
    collision["type"] = "Feature";
    collision["geometry"] = JSON.parse(collision.st_asgeojson);
  }
  

  var myStyle = {
	  "color": "#ff7800",
      "weight": 5,
      "opacity": 0.65
  };
  
  //L.geoJSON(collisions, {
	  //style: styleByIncidentColor,
	  //pointToLayer: function(feature, latlng) {
		//return new L.CircleMarker(latlng, {radius: 5, fillOpacity: 0.1});
	  //}
  //}).addTo(mymap);
  if (collisionLayer) mymap.removeLayer(collisionLayer);
  collisionLayer = L.geoJSON(collisions, {
    style: styleByIncidentColor,
	pointToLayer: function(feature, latlng) {
		if (feature['pedkill'] > 0 || feature['bickill'] > 0) { 
			return new L.CircleMarker(latlng, {radius: 5, fillOpacity: 0.5});
		} else if (feature['pedinj'] > 0 || feature['bicinj'] > 0){
			return new L.CircleMarker(latlng, {radius: 5, fillOpacity: 0.1});
		} else {
			return new L.CircleMarker(latlng, {radius: 5, fillOpacity: 0.5});
		}
	  },
    onEachFeature: function(feature, layer) {
      layer.on({
                 click : clickedOnSegment,
      });
    },
  });
  collisionLayer.addTo(mymap);
  
  
}


function styleByIncidentColor(collision) {
  if (collision['pedkill'] > 0) {
	  return {"color": incColor['PK'],"weight": 0.1,"opacity": incOpacity['PK']};
  } else if (collision['bickill'] > 0){
	  return {"color": incColor['BK'],"weight": 0.1,"opacity": incOpacity['BK']}; 
  } else if (collision['pedinj'] > 0){
	  return {"color": incColor['PI'],"weight": 0.1,"opacity": incOpacity['PI']};
  } else if (collision['bicinj'] > 0) {
	  return {"color": incColor['BI'],"weight": 0.1,"opacity": incOpacity['BI']};
  } else if (collision['pedcol'] == 'Y'){
	  return {"color": "#ff0099", "weight": 0.1, "opacity": 0.5};
  } else {
	  return {"color": "#1bc644", "weight": 0.1, "opacity": 0.5};
  }


  let color = incColor[incType];
  let opac = incOpacity[incType];

  return {"color": color,"weight": 0.1,"opacity": opac};

}

const yearLabels = ['2006', '2007', '2008', '2009', '2010', '2011', '2012', '2013', '2014', '2015', '2016'];

function addSWITRScollisions(collisions) {

	for (var i = 0; i < collisions.length; i++) {

		//let lon = entry['longitude'];
		//let lat = entry['latitude'];
		if (collisions[i]['pedkill'] > 0) {
			L.circle([collisions[i]['latitude'], collisions[i]['longitude']], 50, {color: "#280f34",fillColor: "#280f34",fillOpacity: 0.5,weight: 0.5}).addTo(mymap);
			//let colorcheck = "#ff0000";
			//let intensity = entry['pedkill'] * 0.1;
		} else if (collisions[i]['bickill'] > 0) {
			//let color = '#00ff00';
			//let intensity = entry['bickill'] * 0.1;
			L.circle([collisions[i]['latitude'], collisions[i]['longitude']], 50, {color: "#cb0101",fillColor: "#cb0101",fillOpacity: 0.5,weight: 0.5}).addTo(mymap);
		} else if (collisions[i]['pedinj'] > 0) {
			//let color = '#0000ff';
			//let intensity = entry['pedinj'] * 0.05;
			L.circle([collisions[i]['latitude'], collisions[i]['longitude']], 50, {color: "#11cbd7",fillColor: "#11cbd7",fillOpacity: 0.1,weight: 0.1}).addTo(mymap);
		} else {
			//let color = '#ffff00';
			//let intensity = entry['bincinj'] * 0.05;
			L.circle([collisions[i]['latitude'], collisions[i]['longitude']], 50, {color: "#ff5200",fillColor: "#ff5200",fillOpacity: 0.1,weight: 0.1}).addTo(mymap);
		}
	//L.circle([collisions[i]['latitude'], collisions[i]['longitude']], 50, {color: "#0000ff",fillColor: "#0000ff",fillOpacity: 0.05,weight: 0.5}).addTo(mymap);

	};
};

function getSWITRSinfo() {
  
  
  const url = api_server + '/switrs_viz?select=st_asgeojson,pedcol,biccol,year,time_,pedkill,pedinj,bickill,bicinj';
  if (chosenIncidents == 'Both') var chosenCollisions = '';
  else if (chosenIncidents == 'Bike') var chosenCollisions = '&pedcol=eq.N';
  else if (chosenIncidents == 'Ped') var chosenCollisions = '&biccol=eq.N';
  if (chosenSeverity == 'All') var chosenInjuries = '';
  else if (chosenSeverity == 'Fatal') var chosenInjuries = '&pedinj=eq.0&bicinj=eq.0'
  else if (chosenSeverity == 'Nonf') var chosenInjuries = '&pedkill=eq.0&bickill=eq.0'
  let queryurl = url + '&period=eq.' + chosenPeriod + chosenCollisions + chosenInjuries;
  
  // Fetch the segments
  fetch(queryurl).then((resp) => resp.json()).then(function(jsonData) {
    addSWITRSLayer(jsonData);
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

//L.circle([37.80307388, -122.4114332], 50, {color: "#0000ff",fillColor: "#0000ff",fillOpacity: 0.1}).addTo(mymap);
//L.marker([37.79, -122.416723]).addTo(mymap);


let chosenPeriod = 'AM';
let chosenIncidents = 'Both';
let chosenSeverity = 'All';

function pickAM(thing) {
  app.isAMactive = true;
  app.isPMactive = false;
  chosenPeriod = 'AM';
  getSWITRSinfo();
}

function pickPM(thing) {
  app.isAMactive = false;
  app.isPMactive = true;
  chosenPeriod = 'PM';
  getSWITRSinfo();
}

function clickIncident(chosenIncident) {
  incident = parseInt(chosenIncident);
  app.incident = incident;

  //getSWITRSinfo();
}

function pickBoth(thing) {
	app.isBikeactive = false;
	app.isPedactive = false;
	app.isBothactive = true;
	chosenIncidents = 'Both'
	getSWITRSinfo();
}

function pickBike(thing) {
	app.isBikeactive = true;
	app.isPedactive = false;
	app.isBothactive = false;
	chosenIncidents = 'Bike'
	getSWITRSinfo();
}

function pickPed(thing) {
	app.isBikeactive = false;
	app.isPedactive = true;
	app.isBothactive = false;
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

function clickAllYears(e) {
  app.sliderValue = 0;
}

function clickYear(chosenYear) {
  year = parseInt(chosenYear);
  app.year = year;

  displayDetails();
  updateColors();
}

//let timeSlider = {
//          min: 0,
//          max: 10,
//          disabled: true,
//					width: 'auto',
//					height: 3,
//					direction: 'horizontal',
//					dotSize: 16,
//					eventType: 'auto',
//					show: true,
//					realTime: false,
//					tooltip: 'always',
//					clickable: true,
//					tooltipDir: 'bottom',
//					piecewise: true,
 //         piecewiseLabel: false,
//					lazy: false,
//					reverse: false,
 //         speed: 0.25,
  //        piecewiseStyle: {
    //        "backgroundColor": "#ccc",
   //         "visibility": "visible",
//            "width": "6px",
//            "height": "6px"
//          },
//          piecewiseActiveStyle: {
//            "backgroundColor": "#ccc",
 //           "visibility": "visible",
 //           "width": "6px",
//           "height": "6px"
//         },
 //         labelStyle: {  "color": "#ccc"},
 //         labelActiveStyle: {  "color": "#ccc"},
//          processStyle: {
 //           "backgroundColor": "#ffc"
//          },
 //         formatter: function(index) {
 //           return (index==0 ? 'All Years >>' : yearLabels[index-1]);
//          },
//          style: {"marginTop":"-25px","marginBottom":"30px","marginLeft":"46px","marginRight":"18px"},
//};

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
  delimiters: ['${', '}'],
  data: {
    isAMactive: true,
    isPMactive: false,
	isBikeactive: false,
	isPedactive: false,
	isBothactive: true,
	isFatalactive: false,
	isNonfactive: false,
	isAllactive: true
	//timeSlider: timeSlider
  },
  methods: {
    pickAM: pickAM,
    pickPM: pickPM,
	pickBike: pickBike,
	pickPed: pickPed,
	pickBoth: pickBoth,
	pickFatal: pickFatal,
	pickNonf: pickNonf,
	pickAll: pickAll
  },
  watch: {
    //sliderValue: function(value) {
      //this.getSliderValue();
    //}
  },
  components: {
    //vueSlider,
  }
});

// Ready to go! Read some data.
getSWITRSinfo();
