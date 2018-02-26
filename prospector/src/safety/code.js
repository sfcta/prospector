'use strict';

// Use npm and babel to support IE11/Safari
import 'babel-polyfill';
import 'isomorphic-fetch';
import vueSlider from 'vue-slider-component';
import Cookies from 'js-cookie';

let api_server = 'http://api.sfcta.org/api/switrs_viz2';
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
let popup = null;
let collisionLayer;
let mapLegend;
let segmentLos = {};
let years = [2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016]

let popHoverSegment;
let currentChart = null;

let infopanel = L.control();

infopanel.onAdd = function(map) {
	this._div = L.DomUtil.create('div', 'info-panel-hide');
	return this._div;
};

infopanel.update = function(geo, popupText) {
	infopanel._div.innerHTML = '';
	infopanel._div.className = 'info-panel'
	
	if (geo) {
		this._div.innerHTML = 
		  `${popupText}`;
	}
	infopanelTimeout = setTimeout(function() {
		infopanel._div.className = 'info-panel-hide';
		//collisionLayer.resetStyle(oldHoverTarget);
	}, 3000);
};
infopanel.addTo(mymap);

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

    if (feature['pedkill'] > 0 && chosenSeverity == 'All' && chosenIncidents == 'Ped') {
      return new L.CircleMarker(latlng, {radius: feature['pedcol']+feature['pedcol']/(feature['pedcol']+.01), fillOpacity: 0.8});
    } else if (chosenSeverity == 'Fatal' && chosenIncidents == 'Ped'){
	  return new L.CircleMarker(latlng, {radius: feature['pedkill']+feature['pedkill']/(feature['pedkill']+.01), fillOpacity: 0.8});
	} else if (feature['pedkill'] == 0 && chosenSeverity == 'All' && chosenIncidents == 'Ped'){
      return new L.CircleMarker(latlng, {radius: feature['pedcol']+feature['pedcol']/(feature['pedcol']+.01), fillOpacity: 0.5});
    } else if (chosenSeverity == 'Nonf' && chosenIncidents == 'Ped'){
      return new L.CircleMarker(latlng, {radius: feature['pedinj']+feature['pedinj']/(feature['pedinj']+.01), fillOpacity: 0.5});
    } else if (feature['bickill'] > 0 && chosenSeverity == 'All' && chosenIncidents == 'Bike') {
      return new L.CircleMarker(latlng, {radius: feature['biccol']+feature['biccol']/(feature['biccol']+.01), fillOpacity: 0.8});
    } else if (chosenSeverity == 'Fatal' && chosenIncidents == 'Bike'){
	  return new L.CircleMarker(latlng, {radius: feature['bickill']+feature['bickill']/(feature['bickill']+.01), fillOpacity: 0.8});
	} else if (feature['bickill'] == 0 && chosenSeverity == 'All' && chosenIncidents == 'Bike'){
      return new L.CircleMarker(latlng, {radius: feature['biccol']+feature['biccol']/(feature['biccol']+.01), fillOpacity: 0.5});
    } else if (chosenSeverity == 'Nonf' && chosenIncidents == 'Bike'){
      return new L.CircleMarker(latlng, {radius: feature['bicinj']+feature['bicinj']/(feature['bicinj']+.01), fillOpacity: 0.5});
    }
    },
    onEachFeature: function(feature, layer) {
        layer.on({
                 mouseover : hoverFeature,
				 click: clickedOnFeature,
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
  if (collision['pedkill'] > 0 && chosenIncidents == 'Ped' && chosenSeverity != 'Nonf') {
    return {"color": incColor['Fatal'],"weight": 0.1,
    "opacity": incOpacity['Fatal']};
  } else if (collision['bickill'] > 0 && chosenIncidents == 'Bike' && chosenSeverity != 'Nonf') {
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

  const url = api_server + '?select=st_asgeojson,year,biccol,pedcol,bickill,pedkill,street_names,bicinj,pedinj';
  let queryurl = url + '&year=eq.' + app.sliderValue;

  // Fetch the segments
  fetch(queryurl).then((resp) => resp.json()).then(function(jsonData) {
    addSWITRSLayer(jsonData);
	fetchYearlyDetails();
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
  let street_names = geo.street_names;
  street_names = street_names.split(', ')
  let intersectionName = '';
  for (let i in street_names){
	  if (i < street_names.length - 2) {
		intersectionName += street_names[i].replace("'", "").replace("'", "").replace("[","").replace("]","") + ", ";
	  } else if (i < street_names.length - 1){
		intersectionName += street_names[i].replace("'", "").replace("'", "").replace("[","").replace("]","") + ", and ";
	  } else {
		intersectionName += street_names[i].replace("'", "").replace("'", "").replace("[","").replace("]","")
	  }
  }
  var popupText = "<b>Intersection: "+intersectionName;
  if (chosenIncidents == 'Bike' && chosenSeverity == 'All'){
	  popupText += "<br/> Bike Collisions: " + geo.biccol;
  } else if (chosenIncidents == 'Bike' && chosenSeverity == 'Nonf'){
	  popupText += "<br/> Bike Injuries: " + geo.bicinj;
  } else if (chosenIncidents == 'Bike' && chosenSeverity == 'Fatal'){
	  popupText += "<br/> Bike Deaths: " + geo.bickill ;
  } else if (chosenIncidents == 'Ped' && chosenSeverity == 'All'){
	  popupText += "<br/> Pedestrian Collisions: " + geo.pedcol;
  } else if (chosenIncidents == 'Ped' && chosenSeverity == 'Nonf'){
	  popupText += "<br/> Pedestrian Injuries: " + geo.pedinj;
  } else {
	  popupText += "<br/> Pedestrian Deaths: " + geo.pedkill;
  }
  popHoverSegment = L.popup()
                    .setLatLng(e.latlng)
                    .setContent(popupText);

  popupTimeout = setTimeout( function () {
    popHoverSegment.openOn(mymap);
  }, 300);
}


function resetHighlight(e) {
  infopanel.remove();
  collisionLayer.resetStyle(e.target);
  infopanel.addTo(mymap);
}

let infopanelTimeout;
let oldHoverTarget;

function hoverFeature(e) {
  clearTimeout(infopanelTimeout);
  let highlightedGeo = e.target;
  highlightedGeo.bringToFront();


  highlightedGeo.setStyle(styles.selected);
  let geo = e.target.feature;
  let street_names = geo.street_names;
  street_names = street_names.split(', ')
  let intersectionName = '';
  for (let i in street_names){
	  if (i < street_names.length - 2) {
		intersectionName += street_names[i].replace("'", "").replace("'", "").replace("[","").replace("]","") + ", ";
	  } else if (i < street_names.length - 1){
		intersectionName += street_names[i].replace("'", "").replace("'", "").replace("[","").replace("]","") + ", and ";
	  } else {
		intersectionName += street_names[i].replace("'", "").replace("'", "").replace("[","").replace("]","")
	  }
  }
  var popupText = "<b>Intersection: "+intersectionName;
  if (chosenIncidents == 'Bike' && chosenSeverity == 'All'){
	  popupText += "<br/> Bike Collisions: " + geo.biccol;
  } else if (chosenIncidents == 'Bike' && chosenSeverity == 'Nonf'){
	  popupText += "<br/> Bike Injuries: " + geo.bicinj;
  } else if (chosenIncidents == 'Bike' && chosenSeverity == 'Fatal'){
	  popupText += "<br/> Bike Deaths: " + geo.bickill ;
  } else if (chosenIncidents == 'Ped' && chosenSeverity == 'All'){
	  popupText += "<br/> Pedestrian Collisions: " + geo.pedcol;
  } else if (chosenIncidents == 'Ped' && chosenSeverity == 'Nonf'){
	  popupText += "<br/> Pedestrian Injuries: " + geo.pedinj;
  } else {
	  popupText += "<br/> Pedestrian Deaths: " + geo.pedkill;
  }
  infopanel.update(highlightedGeo, popupText);
}

function clickedOnFeature(e) {
	let clickedIntersection = e.target;
	clickedIntersection.bringToFront();
	
	let chosenIntersection = e.target.feature.street_names;
	let intersection = chosenIntersection;
	// delete old chart
    //let chart = document.getElementById("chart");
    //if (chart) {
        //chart.parentNode.removeChild(chart);
        //currentChart = null;
    //}
	let vizurl = api_server+'?street_names=eq.' + intersection;
	
	fetch(vizurl).then((resp) => resp.json()).then(function(jsonData) {
      //let popupText = buildPopupTitle(intersection) +
              //"<hr/>" +
              //"<div id=\"chart\" style=\"width: 250px; height:200px;\"></div>";

      // one more time, make sure popup is gone
      //if (popup) {
        //popup.remove();
      //}

      //popup = new L.Popup({closeOnClick: true})
        //.setLatLng(e.latlng)
        //.setContent(popupText);

      //popup.addTo(mymap);

      let data = buildChartDataFromJson(jsonData);
      createChart(data);
    }).catch(function(error) {
      console.log("err: "+error);
    });

}

function buildChartDataFromJson(jsonData){
	let data = [];
	
	for (let year in years){
		let pedcol = 0;
		let biccol = 0;
		for (let json in jsonData){
			if (years[year] == Number(jsonData[json].year)){
				pedcol += jsonData[json].pedcol;
				biccol += jsonData[json].biccol;
			}
		}
		data.push({year:years[year], pedcols:pedcol, biccols:biccol});
	}
	return data;
}

function createChart(data) {
  // do some weird rounding to get y-axis scale to the 20s
  //document.getElementById('longchart').innerHTML = '';
  //console.log(document);
  let ymax = 4;
  for (let entry of data) {
    ymax = Math.max(ymax,entry['pedcols']+entry['biccols']);
  }
  
  if (currentChart) {
	  currentChart.options.labels = ['Pedestrian Collisions', 'Bicycle Collisions'];
	  currentChart.options.ykeys = ['pedcols', 'biccols'];
	  currentChart.options.ymax = ymax;
	  currentChart.options.barColors = ["#3377cc","#cc0033",];
	  currentChart.setData(yearlyTotals);
	  
	  currentChart.setData(data);

  } else {

    currentChart = new Morris.Bar({
    // ID of the element in which to draw the chart.
      element: 'chart',
      data: data,
      stacked: true,
    // The name of the data record attribute that contains x-values.
      xkey: 'year',
    // A list of names of data record attributes that contain y-values.
      ykeys: ['pedcols', 'biccols'],
      ymax: ymax,
      labels: ['Pedestrian Collisions', 'Bicycle Collisions'],
//    barColors: ["#3377cc","#cc3300",],
      barColors: ["#3377cc","#cc0033",],
      xLabels: "Year",
      xLabelAngle: 60,
      xLabelFormat: dateFmt,
      yLabelFormat: yFmt,
      hideHover: 'true',
      parseTime: false,
  });
  }
}

function yFmt(y) { return Math.round(y).toLocaleString() }

const yearLabels = ['2006','2007','2008','2009','2010',
                  '2011','2012','2013','2014',
                  '2015','2016'];

function dateFmt(x) {
  return yearLabels[x.x];
}

function buildPopupTitle(intersection) {
  let title = "<h3 id=\"popup-title\"> Collision trends at selected intersection:<br/>" + intersection
              //+chosenDir+"</h3>"
  return title;
}

let yearlyTotals = [];

function fetchYearlyDetails() {
  const url = api_server;
  fetch(url).then((resp) => resp.json()).then(function(json) {
    buildYearlyDetails(json);
  })
  .catch(function(error) {
    console.log("err: "+error);
  });
}

function buildYearlyDetails(jsonData) {
    yearlyTotals = [];
	
	for (let year in years){
		let pedcol = 0;
		let biccol = 0;
		let pedkill = 0;
		let bickill = 0;
		let pedinj = 0;
		let bicinj = 0;
		for (let json in jsonData){
			if (years[year] == Number(jsonData[json].year)){
				pedcol += jsonData[json].pedcol;
				biccol += jsonData[json].biccol;
				pedkill += jsonData[json].pedkill;
				bickill += jsonData[json].bickill;
				pedinj += jsonData[json].pedinj;
				bicinj += jsonData[json].bicinj;
			}
		}
		yearlyTotals.push({year:years[year], pedcols:pedcol, biccols:biccol, pedkills:pedkill, bickills:bickill, pedinjs:pedinj, bicinjs:bicinj});
	}

    app.timeSlider.disabled = false;
    showYearlyChart();

    return yearlyTotals;
}

function showYearlyChart() {
  let data = yearlyTotals;
  

  if (currentChart) {
	if (chosenIncidents == 'Bike' && chosenSeverity == 'All'){
	  currentChart.options.labels = ['Bicycle Collisions'];
	  currentChart.options.ykeys = ['biccols'];
	  var yearmax = 4;
	  for (let entry of data) {
        yearmax = Math.max(yearmax,entry['biccols']);
      }
	  currentChart.options.ymax = yearmax;
    } else if (chosenIncidents == 'Bike' && chosenSeverity == 'Nonf'){
	  currentChart.options.labels = ['Bicycle Injuries'];
	  currentChart.options.ykeys = ['bicinjs'];
	  var yearmax = 4;
	  for (let entry of data) {
        yearmax = Math.max(yearmax,entry['bicinjs']);
      }
	  currentChart.options.ymax = yearmax;
    } else if (chosenIncidents == 'Bike' && chosenSeverity == 'Fatal'){
	  currentChart.options.labels = ['Bicycle Deaths'];
	  currentChart.options.ykeys = ['bickills'];
	  var yearmax = 4;
	  for (let entry of data) {
        yearmax = Math.max(yearmax,entry['bickills']);
      }
	  currentChart.options.ymax = yearmax;
    } else if (chosenIncidents == 'Ped' && chosenSeverity == 'All'){
	  currentChart.options.labels = ['Pedestrian Collisions'];
	  currentChart.options.ykeys = ['pedcols'];
	  var yearmax = 4;
	  for (let entry of data) {
        yearmax = Math.max(yearmax,entry['pedcols']);
      }
	  currentChart.options.ymax = yearmax;
    } else if (chosenIncidents == 'Ped' && chosenSeverity == 'Nonf'){
	  currentChart.options.labels = ['Pedestrian Injuries'];
	  currentChart.options.ykeys = ['pedinjs'];
	  var yearmax = 4;
	  for (let entry of data) {
        yearmax = Math.max(yearmax,entry['pedinjs']);
      }
	  currentChart.options.ymax = yearmax;
    } else {
	  currentChart.options.labels = ['Pedestrian Deaths'];
	  currentChart.options.ykeys = ['pedkills'];
	  var yearmax = 4;
	  for (let entry of data) {
        yearmax = Math.max(yearmax,entry['pedkills']);
      }
	  currentChart.options.ymax = yearmax;
    }

    currentChart.setData(yearlyTotals);

  } else {
    currentChart = new Morris.Bar({
    // ID of the element in which to draw the chart.
    element: 'chart',
    data: data,
    stacked: true,
    // The name of the data record attribute that contains x-values.
    xkey: 'year',
    // A list of names of data record attributes that contain y-values.
    ykeys: ['pedcols'],
    ymax: yearmax,
    labels: ['Pedestrian Collisions'],
//    barColors: ["#3377cc","#cc3300",],
    barColors: ["#3377cc",],
    xLabels: "Year",
    xLabelAngle: 60,
    xLabelFormat: dateFmt,
    yLabelFormat: yFmt,
    hideHover: 'true',
    parseTime: false,
  });

  
  }

  //updateLegend();
}

let chosenIncidents = 'Ped';
let chosenSeverity = 'All';

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