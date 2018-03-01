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
// Basic leaflet information: .addTo adds a layer to your map.
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

//Initialization of visual aspects
let label = 'YEARLY COUNT OF ALL PEDESTRIAN COLLISIONS';
let incColor = {'Fatal':"#ff0000",'Non-fatal':"#800080"};
let incOpacity = {'Fatal':1, 'Non-fatal':0.15};
let missingColor = '#ccc';
let popup = null;
let collisionLayer;
let mapLegend;
let years = [2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016]

//Initialization of selective aspects
let popSelIntersection;
let selectedIntersection, prevSelectedIntersection;
let currentChart = null;
let infopanel = L.control();

//Add a hidden infopanel layer
infopanel.onAdd = function(map) {
	this._div = L.DomUtil.create('div', 'info-panel-hide');
	return this._div;
};

//Allow the hidden infopanel layer to input info given from popupText and then hide after a certain amount of time.
infopanel.update = function(geo, popupText) {
	infopanel._div.innerHTML = '';
	infopanel._div.className = 'info-panel'
	
	if (geo) {
		this._div.innerHTML = 
		  `${popupText}`;
	}
	infopanelTimeout = setTimeout(function() {
		infopanel._div.className = 'info-panel-hide';
		collisionLayer.resetStyle(oldHoverTarget);
	}, 3000);
};
infopanel.addTo(mymap);

// add layers of intersection collisions to the map
function addSWITRSLayer(collisions) {
  /*Input: json of collisions
  What this function does: Adds features to the map according to the information given from the json and website parameters.*/

  //for each intersection of data in the api, we add new information so we can add layers to map. 
  for (let collision of collisions) {
    collision["type"] = "Feature";
    collision["geometry"] = JSON.parse(collision.st_asgeojson);
  }
  
  //If these layers are already on the map, remove them.
  if (mapLegend) mymap.removeControl(mapLegend);
  if (collisionLayer) mymap.removeLayer(collisionLayer);
  
  //loading in the new geoJSON features we created we create our collision layer
  collisionLayer = L.geoJSON(collisions, {
    style: styleByIncidentColor,
	//at specific latitude longitude give a different size to the point depending on the specific count we are looking at.
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
	//add functions for when we click and hover over any feature.
    onEachFeature: function(feature, layer) {
        layer.on({
                 mouseover : hoverFeature,
                 click: clickedOnFeature,
        });
    },
  });
  collisionLayer.addTo(mymap);

  //create our legend for the map
  mapLegend = L.control({position: 'bottomright'});

  mapLegend.onAdd = function (map) {

    var div = L.DomUtil.create('div', 'info legend'),
      grades = ['Fatal', 'Non-fatal'],
      labels = [];
	  
	//Text and color for the legend
    div.innerHTML = '<h4>Incident Category</h4>';
      for (var i = 0; i < grades.length; i++) div.innerHTML += '<i style="background:' + incColor[grades[i]] + '"></i>' + grades[i] + '<br>';

    return div;

  };

  mapLegend.addTo(mymap);
};

// this functions gives the feature a color weight and opacity depending on specifics of the json.
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
}

// This function queries the api for json dependent on the year and refresh yearly detail chart on webpage.
function getSWITRSinfo() {


  const url = api_server + '?select=st_asgeojson,year,biccol,pedcol,bickill,pedkill,street_names,bicinj,pedinj';
  let queryurl = url + '&year=eq.' + app.sliderValue;

  // Fetch the json and yearly details
  fetch(queryurl).then((resp) => resp.json()).then(function(jsonData) {
    addSWITRSLayer(jsonData);
	fetchYearlyDetails();
  })
  .catch(function(error) {
    console.log("err: "+error);
  });
}

// Initialize hovering variables
let infopanelTimeout;
let oldHoverTarget;


// This function will create an info-panel at the top right of the map of the intersection that will hide after a delay.
// There are special cases dependent on the clicked on feature inside this function as well.
function hoverFeature(e) {
  //Refresh Timeout	
  clearTimeout(infopanelTimeout);
  
  //Initializing commonly used objects
  let highlightedGeo = e.target;
  let geo = highlightedGeo.feature;
  
  //Fixing the street_names for easier readability and have it dependent on query information.
  let intersectionName = highlightedGeo.feature.street_names.replace(/'/g, "").replace('[', "").replace(']', "").replace(/,/g, ' and');
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
  
  //update the infopanel on the top right
  infopanel.update(highlightedGeo, popupText);
  
  highlightedGeo.bringToFront();
  // Special cases for clicked on intersection
  if (selectedIntersection) {
	// don't do anything else if the feature is already clicked  
    if (selectedIntersection.feature.street_names === highlightedGeo.feature.street_names) return;
    
    // return previously-hovered segment to its original color
    if (oldHoverTarget) {
      if (oldHoverTarget.feature.street_names != selectedIntersection.feature.street_names)
        collisionLayer.resetStyle(oldHoverTarget);
    }
	
	//if the hovered area is not the same as the currently selected intersection, give hover information
    if (highlightedGeo.feature.street_names != selectedIntersection.feature.street_names) {
      highlightedGeo.setStyle(styles.selected);
      oldHoverTarget = e.target;
    }    
  } else {
    if (oldHoverTarget) collisionLayer.resetStyle(oldHoverTarget);
    highlightedGeo.setStyle(styles.selected);
    oldHoverTarget = e.target;
  }  
}

//remake the title for the chart on the bottom right for when there is no selected intersection
function remakeLabel() {
  if (chosenIncidents == 'Bike' && chosenSeverity == 'All'){
	label = 'YEARLY COUNT OF ALL BIKE COLLISIONS:';
  } else if (chosenIncidents == 'Bike' && chosenSeverity == 'Nonf'){
	label = 'YEARLY COUNT OF NON-FATAL PEDESTRIAN COLLISIONS:';
  } else if (chosenIncidents == 'Bike' && chosenSeverity == 'Fatal'){
	label = 'YEARLY COUNT OF FATAL PEDESTRIAN COLLISIONS:';
  } else if (chosenIncidents == 'Ped' && chosenSeverity == 'All'){
	label = 'YEARLY COUNT OF ALL PEDESTRIAN COLLISIONS:';
  } else if (chosenIncidents == 'Ped' && chosenSeverity == 'Nonf'){
	label = 'YEARLY COUNT OF NON-FATAL PEDESTRIAN COLLISIONS:';
  } else {
	label = 'YEARLY COUNT OF FATAL PEDESTRIAN COLLISIONS:';
  }
}

function clickedOnFeature(e) {
	let clickedIntersection = e.target.feature;
  
  // unselect the previously-selected selection, if there is one
  if (selectedIntersection && selectedIntersection.feature.street_names != clickedIntersection.street_names) {
    prevSelectedIntersection = selectedIntersection;
    collisionLayer.resetStyle(prevSelectedIntersection);
  }
  selectedIntersection = e.target;
  selectedIntersection.bringToFront();
  selectedIntersection.setStyle(styles.popup);
  
  //Fix streetname for readability and change title of chart
  let intersectionName = selectedIntersection.feature.street_names.replace(/'/g, "").replace('[', "").replace(']', "").replace(/,/g, ' and'); 
  app.chartTitle = 'ALL COLLISIONS at ' + intersectionName + ':';
  
  popSelIntersection = L.popup()
    .setLatLng(e.latlng)
    .setContent(intersectionName)
    .addTo(mymap);

  // Revert to overall chart when no segment selected
  popSelIntersection.on('remove', function(e) {
    collisionLayer.resetStyle(selectedIntersection);
    prevSelectedIntersection = selectedIntersection = null;
    showYearlyChart();
  });
	
  //query data based on intersection then create chart of all collisions for that intersection	
  let vizurl = api_server+'?street_names=eq.' + selectedIntersection.feature.street_names;
	
  fetch(vizurl).then((resp) => resp.json()).then(function(jsonData) {
      

    let data = buildChartDataFromJson(jsonData);
    createChart(data);
  }).catch(function(error) {
    console.log("err: "+error);
  });

}

//This function gets the data needed in the right format for the chart
function buildChartDataFromJson(jsonData){
	let data = [];
	
	//for every year make sure that you are getting the data from only that year and add the information of that intersection to the data.
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

//Actually creating the chart
function createChart(data) {
	
  //get a ymax for intersections that have almost no collisions as 4, else the max amount of collisions at the intersection.	
  let ymax = 4;
  for (let entry of data) {
    ymax = Math.max(ymax,entry['pedcols']+entry['biccols']);
  }
  
  //If there is already a chart there, change ymax, labels, ykeys, barColors, and data.
  if (currentChart) {
	  currentChart.options.labels = ['Pedestrian Collisions', 'Bicycle Collisions'];
	  currentChart.options.ykeys = ['pedcols', 'biccols'];
	  currentChart.options.ymax = ymax;
	  currentChart.options.barColors = ["#3377cc","#cc0033",];
	  
	  currentChart.setData(data);

  //If the chart is new, create it with the parameters found before.	  
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

//Formatting for the y variable
function yFmt(y) { return Math.round(y).toLocaleString() }

//initialize labels
const yearLabels = ['2006','2007','2008','2009','2010',
                  '2011','2012','2013','2014',
                  '2015','2016'];

//Format x labels				  
function dateFmt(x) {
  return yearLabels[x.x];
}

//initialize yearlyTotals data
let yearlyTotals = [];

//This function will query the api server for everything to make the yearlyTotals data
function fetchYearlyDetails() {
  const url = api_server;
  fetch(url).then((resp) => resp.json()).then(function(json) {
    buildYearlyDetails(json);
  })
  .catch(function(error) {
    console.log("err: "+error);
  });
}


//This functions adds the totals of each count for each year. Similar to buildChartDataFromJson function
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

//use the yearly totals data to get the chart you want dependent on chosen incidents and severity
function showYearlyChart() {
  let data = yearlyTotals;
  remakeLabel();
  app.chartTitle = label;
  
  //If there is already a chart there, dependent on chosen incident and severity. Change the labels, ykeys, and ymax.
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

	//Then set the data to be yearlyTotals
    currentChart.setData(yearlyTotals);
  
  
  //Else initialize the data for the first time.
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

//These functions are based around when something is clicked on the website.

//When you click bike, change the active app to bike then chosen incidents to bike and regrab the switrsinfo
function pickBike(thing) {
  app.isBikeactive = true;
  app.isPedactive = false;
  chosenIncidents = 'Bike'
  getSWITRSinfo();
}

//same as above, but with ped
function pickPed(thing) {
  app.isBikeactive = false;
  app.isPedactive = true;
  chosenIncidents = 'Ped'
  getSWITRSinfo();
}


//Same as above except changing the severity instead of incidents and to Fatal
function pickFatal(thing) {
  app.isFatalactive = true;
  app.isNonfactive = false;
  app.isAllactive = false;
  chosenSeverity = 'Fatal'
  getSWITRSinfo();
}

//Same as above, but severity to non-fatal
function pickNonf(thing) {
  app.isFatalactive = false;
  app.isNonfactive = true;
  app.isAllactive = false;
  chosenSeverity = 'Nonf'
  getSWITRSinfo();
}

//same as above changing the severity to any collision
function pickAll(thing) {
  app.isFatalactive = false;
  app.isNonfactive = false;
  app.isAllactive = true;
  chosenSeverity = 'All'
  getSWITRSinfo();
}

//When the year time slider changes, requery the data for visualization.
function sliderChanged(thing) {
  getSWITRSinfo();
}

//update the year slider
function updateSliderData() {
  //create the yearlabels based upon what years are in the data.
  let yearlist = [];
  fetch(api_server + '?select=year')
  .then((resp) => resp.json()).then(function(jsonData) {
    for (let entry of jsonData) {
      if (!yearlist.includes(entry.year)) yearlist.push(entry.year);
    }
	//change the slider data to sorted year list
    yearlist = yearlist.sort();
    app.timeSlider.data = yearlist;
	//set the value to the last year
    app.sliderValue = yearlist[yearlist.length-1];
  });
}

//creating the timeslider for the visualization.
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

//Vue app to give dynamic buttons, charts, sliders, and text
let app = new Vue({
  el: '#panel',
  //The delimiters will grab what data from the code if it is between these two values in the html
  delimiters: ['${', '}'],
  //The dynamic data from the code and their default values.
  data: {
	chartTitle: label,  
    isBikeactive: false,
    isPedactive: true,
    isFatalactive: false,
    isNonfactive: false,
    isAllactive: true,
    sliderValue: 0,
    timeSlider: timeSlider
  },
  //What methods clicking will change one of the above data, or run certain scipts.
  methods: {
  clickToggleHelp: clickToggleHelp,
  pickBike: pickBike,
  pickPed: pickPed,
  pickFatal: pickFatal,
  pickNonf: pickNonf,
  pickAll: pickAll
  },
  //what to continually watch out for
  watch: {
    sliderValue: sliderChanged,
  },
  //extra vue options we are using.
  components: {
    vueSlider,
  }
});

//Help functions
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