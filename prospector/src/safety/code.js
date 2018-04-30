'use strict';

// Use npm and babel to support IE11/Safari
import 'isomorphic-fetch';
import vueSlider from 'vue-slider-component';
import Cookies from 'js-cookie';

let api_server = 'http://api.sfcta.org/api/switrs_viz2';
let api_totals = 'http://api.sfcta.org/api/switrs_totals';
var maplib = require('../jslib/maplib');
let styles = maplib.styles;
let size = 1;
// add the SF Map using Leafleft and MapBox
// Basic leaflet information: .addTo adds a layer to your map.
let mymap = maplib.sfmap;
mymap.setView([37.76889, -122.440997], 13);

//Initialization of visual aspects
let totals = true;
let queryurl = '';
let label = '';
let sublabel = '';
let incColor = {'Fatal':"#ff0000",'Non-fatal':"#800080"};
let incOpacity = {'Fatal':1, 'Non-fatal':0.15};
let missingColor = '#ccc';
let popup = null;
let collisionLayer;
let mapLegend;
let allJSONData;
let prevAppValue;

//Initialization of selective aspects
let popSelIntersection;
let selectedIntersection, prevSelectedIntersection;
let selectedData;
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

function getBucketSize(d){
  return d > 4     ? d + d/(d+0.01)  :
         d > 0     ? 4 :
                      0 ;
}

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
  if (collisionLayer) mymap.removeLayer(collisionLayer);

  //loading in the new geoJSON features we created we create our collision layer
  collisionLayer = L.geoJSON(collisions, {
    style: styleByIncidentColor,
	//at specific latitude longitude give a different size to the point depending on the specific count we are looking at.
  pointToLayer: function(feature, latlng) {
    if (app.sliderValue != "All Years" || chosenSeverity == 'Fatal') {
      if (chosenSeverity == 'All' && chosenIncidents == 'Ped') {
        return new L.CircleMarker(latlng, {radius: 2*feature['pedcol']+feature['pedcol']/(feature['pedcol']+.01), fillOpacity: 0.8*(feature['pedcol']/(feature['pedcol']+1))});
      } else if (chosenSeverity == 'Fatal' && chosenIncidents == 'Ped'){
	    return new L.CircleMarker(latlng, {radius: 2*feature['pedkill']+feature['pedkill']/(feature['pedkill']+.01), fillOpacity: 0.6});
      } else if (chosenSeverity == 'Nonf' && chosenIncidents == 'Ped'){
        return new L.CircleMarker(latlng, {radius: 2*feature['pedinj']+feature['pedinj']/(feature['pedinj']+.01), fillOpacity: 0.8*(feature['pedinj']/(feature['pedinj']+1))});
      } else if (chosenSeverity == 'All' && chosenIncidents == 'Bike') {
        return new L.CircleMarker(latlng, {radius: 2*feature['biccol']+feature['biccol']/(feature['biccol']+.01), fillOpacity: 0.8*(feature['biccol']/(feature['biccol']+1))});
      } else if (chosenSeverity == 'Fatal' && chosenIncidents == 'Bike'){
	    return new L.CircleMarker(latlng, {radius: 2*feature['bickill']+feature['bickill']/(feature['bickill']+.01), fillOpacity: 0.6});
      } else if (chosenSeverity == 'Nonf' && chosenIncidents == 'Bike'){
        return new L.CircleMarker(latlng, {radius: 2*feature['bicinj']+feature['bicinj']/(feature['bicinj']+.01), fillOpacity: 0.8*(feature['bicinj']/(feature['bicinj']+1))});
      }
	} else {
	  if (chosenSeverity == 'All' && chosenIncidents == 'Ped') {
        return new L.CircleMarker(latlng, {radius: 1/2*getBucketSize(feature['pedcol']), fillOpacity: 0.6*(feature['pedcol']/(feature['pedcol']+1))});
      } else if (chosenSeverity == 'Nonf' && chosenIncidents == 'Ped'){
        return new L.CircleMarker(latlng, {radius: 1/2*getBucketSize(feature['pedinj']), fillOpacity: 0.6*(feature['pedinj']/(feature['pedinj']+1))});
      } else if (chosenSeverity == 'All' && chosenIncidents == 'Bike') {
        return new L.CircleMarker(latlng, {radius: 1/2*getBucketSize(feature['biccol']), fillOpacity: 0.6*(feature['biccol']/(feature['biccol']+1))});
      } else if (chosenSeverity == 'Nonf' && chosenIncidents == 'Bike'){
        return new L.CircleMarker(latlng, {radius: 1/2*getBucketSize(feature['bicinj']), fillOpacity: 0.6*(feature['bicinj']/(feature['bicinj']+1))});
      }
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


};

// this functions gives the feature a color weight and opacity depending on specifics of the json.
function styleByIncidentColor(collision) {

  return {"color": incColor['Non-fatal'],"weight": 0.1,
  "opacity": incOpacity['Non-fatal']};

}

// This function queries the api for json dependent on the year and refresh yearly detail chart on webpage.
function getSWITRSinfo() {

  if (app.sliderValue === "All Years") {
	queryurl = api_totals;
  } else {
	let url = api_server + '?select=st_asgeojson,year,biccol,pedcol,bickill,pedkill,street_names,bicinj,pedinj';
	queryurl = url + '&year=eq.' + app.sliderValue;
  }

  // Fetch the json and yearly details
  fetch(queryurl).then((resp) => resp.json()).then(function(jsonData) {
    addSWITRSLayer(jsonData);
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
  if (app.sliderValue != "All Years"){
    if (chosenIncidents == 'Bike' && chosenSeverity == 'All'  && geo.bickill > 0){
	  popupText += "<br/> All Bike Collisions for year " + geo.year + " : " + geo.biccol;
	  popupText += "<br/> Fatal Bike Collisions for year " + geo.year + " : " + geo.bickill;
	} else if (chosenIncidents == 'Bike' && chosenSeverity == 'All'){
	  popupText += "<br/> All Bike Collisions for year " + geo.year + " : " + geo.biccol;
    } else if (chosenIncidents == 'Bike' && chosenSeverity == 'Nonf'){
	  popupText += "<br/> Non-fatal Bike Collisions for year " + geo.year + " : " + geo.bicinj;
    } else if (chosenIncidents == 'Bike' && chosenSeverity == 'Fatal'){
	  popupText += "<br/> Fatal Bike Collisions for year " + geo.year + " : " + geo.bickill;
    } else if (chosenIncidents == 'Ped' && chosenSeverity == 'All' && geo.pedkill > 0){
	  popupText += "<br/> All Pedestrian Collisions for year " + geo.year + " : " + geo.pedcol;
	  popupText += "<br/> Fatal Pedestrian Collisions for year " + geo.year + " : " + geo.pedkill;
	} else if (chosenIncidents == 'Ped' && chosenSeverity == 'All'){
	  popupText += "<br/> All Pedestrian Collisions for year " + geo.year + " : " + geo.pedcol;
    } else if (chosenIncidents == 'Ped' && chosenSeverity == 'Nonf'){
	  popupText += "<br/> Non-fatal Pedestrian Collisions for year " + geo.year + " : " + geo.pedinj;
    } else {
	  popupText += "<br/> Fatal Pedestrian Collisions for year " + geo.year + " : " + geo.pedkill;
    }
  } else {
	if (chosenIncidents == 'Bike' && chosenSeverity == 'All' && geo.bickill > 0){
	  popupText += "<br/> All Bike Collisions : " + geo.biccol + "<br/> Fatal Bike Collisions : " + geo.bickill;
	} else if (chosenIncidents == 'Bike' && chosenSeverity == 'All'){
	  popupText += "<br/> All Bike Collisions : " + geo.biccol;
    } else if (chosenIncidents == 'Bike' && chosenSeverity == 'Nonf'){
	  popupText += "<br/> Non-fatal Bike Collisions : " + geo.bicinj;
    } else if (chosenIncidents == 'Bike' && chosenSeverity == 'Fatal'){
	  popupText += "<br/> Fatal Bike Collisions : " + geo.bickill ;
    } else if (chosenIncidents == 'Ped' && chosenSeverity == 'All' && geo.pedkill > 0){
	  popupText += "<br/> All Pedestrian Collisions : " + geo.pedcol + "<br/> Fatal Pedestrian Collisions : " + geo.pedkill;
	} else if (chosenIncidents == 'Ped' && chosenSeverity == 'All'){
      popupText += "<br/> All Pedestrian Collisions : " + geo.pedcol;
    } else if (chosenIncidents == 'Ped' && chosenSeverity == 'Nonf'){
	  popupText += "<br/> Non-fatal Pedestrian Collisions : " + geo.pedinj;
    } else {
	  popupText += "<br/> Fatal Pedestrian Collisions : " + geo.pedkill;
    }
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
  if (app.sliderValue != "All Years"){
    if (chosenIncidents == 'Bike' && chosenSeverity == 'All'){
	  label = 'All Bike Collisions for ' + String(app.sliderValue) + ' : ' + yearlyTotals[app.sliderValue-2006]['biccols'];
    } else if (chosenIncidents == 'Bike' && chosenSeverity == 'Nonf'){
	  label = 'Non-fatal Bike Collisions for ' + String(app.sliderValue) + ' : ' + yearlyTotals[app.sliderValue-2006]['bicinjs'];
    } else if (chosenIncidents == 'Bike' && chosenSeverity == 'Fatal'){
	  label = 'Fatal Bike Collisions for ' + String(app.sliderValue) + ' : ' + yearlyTotals[app.sliderValue-2006]['bickills'];
    } else if (chosenIncidents == 'Ped' && chosenSeverity == 'All'){
	  label = 'All Pedestrian Collisions for ' + String(app.sliderValue) + ' : ' + yearlyTotals[app.sliderValue-2006]['pedcols'];
    } else if (chosenIncidents == 'Ped' && chosenSeverity == 'Nonf'){
	  label = 'Non-fatal Pedestrian Collisions for ' + String(app.sliderValue) + ' : ' + yearlyTotals[app.sliderValue-2006]['pedinjs'];
    } else {
	  label = 'Fatal Pedestrian Collisions for ' + String(app.sliderValue) + ' : ' + yearlyTotals[app.sliderValue-2006]['pedkills'];
	}
  } else {
	if (chosenIncidents == 'Bike' && chosenSeverity == 'All'){
	  label = 'All Bike Collisions: ' + yearlyTotals[yearlyTotals.length-1]['biccols'];
    } else if (chosenIncidents == 'Bike' && chosenSeverity == 'Nonf'){
	  label = 'Non-fatal Bike Collisions: ' + yearlyTotals[yearlyTotals.length-1]['bicinjs'];
    } else if (chosenIncidents == 'Bike' && chosenSeverity == 'Fatal'){
	  label = 'Fatal Bike Collisions: ' + yearlyTotals[yearlyTotals.length-1]['bickills'];
    } else if (chosenIncidents == 'Ped' && chosenSeverity == 'All'){
	  label = 'All Pedestrian Collisions: ' + yearlyTotals[yearlyTotals.length-1]['pedcols'];
    } else if (chosenIncidents == 'Ped' && chosenSeverity == 'Nonf'){
	  label = 'Non-fatal Pedestrian Collisions: ' + yearlyTotals[yearlyTotals.length-1]['pedinjs'];
    } else {
	  label = 'Fatal Pedestrian Collisions: ' + yearlyTotals[yearlyTotals.length-1]['pedkills'];
	}
  }
  app.chartSubTitle = 'All Intersections';
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
  app.chartTitle = 'All collisions at ' + intersectionName + ':';

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
  let jsonData = allJSONData
	.filter(row => row.street_names == selectedIntersection.feature.street_names);

  selectedData = buildChartDataFromJson(jsonData);
  createChart();

}

//This function gets the data needed in the right format for the chart
function buildChartDataFromJson(jsonData){
	let data = [];

	//for every year make sure that you are getting the data from only that year and add the information of that intersection to the data.
	for (let year in yearlist){
		let pedcol = 0;
		let biccol = 0;
		let pedinj = 0;
		let bicinj = 0;
		let pedkill = 0;
		let bickill = 0;
		for (let json in jsonData){
			if (yearlist[year] == Number(jsonData[json].year)){
				pedcol += jsonData[json].pedcol;
				biccol += jsonData[json].biccol;
				pedinj += jsonData[json].pedinj;
				bicinj += jsonData[json].bicinj;
				pedkill += jsonData[json].pedkill;
				bickill += jsonData[json].bickill;
			}
		}
		data.push({year:yearlist[year], pedcols:pedcol, biccols:biccol, pedinjs:pedinj, bicinjs:bicinj, pedkills:pedkill, bickills:bickill});
	}
	return data;
}

//Actually creating the chart
function createChart() {
  //get a ymax for intersections that have almost no collisions as 4, else the max amount of collisions at the intersection.
  let intersectionName;
  if (selectedIntersection.feature.street_names.length>56){
      intersectionName = selectedIntersection.feature.street_names.replace(/'/g, "").replace('[', "").replace(']', "").replace(/,/g, ' and').substr(0,50);
  } else if (selectedIntersection.feature.street_names.length == 54){
    intersectionName = selectedIntersection.feature.street_names.replace(/'/g, "").replace('[', "").replace(']', "").replace(/,/g, ' and').substr(0,32);
  } else {  
    intersectionName = selectedIntersection.feature.street_names.replace(/'/g, "").replace('[', "").replace(']', "").replace(/,/g, ' and');
  }


  //If there is already a chart there, change ymax, labels, ykeys, barColors, and data.
  if (currentChart) {
	if (chosenIncidents == 'Bike' && chosenSeverity == 'All'){
	  currentChart.options.labels = ['Bicycle Injuries', 'Bicycle Deaths'];
	  currentChart.options.ykeys = ['bicinjs', 'bickills'];
	  currentChart.options.barColors = ["#1279c6","#d41515"];
	  currentChart.options.ymax = 12;
	  app.chartTitle = 'All Bike Collisions :';
	  app.chartSubTitle = intersectionName;

    } else if (chosenIncidents == 'Bike' && chosenSeverity == 'Nonf'){
	  currentChart.options.labels = ['Bicycle Injuries'];
	  currentChart.options.ykeys = ['bicinjs'];
	  currentChart.options.barColors = ["#1279c6",];
	  currentChart.options.ymax = 12;
	  app.chartTitle = 'Non-fatal Bike Collisions :';
	  app.chartSubTitle = intersectionName;
    } else if (chosenIncidents == 'Bike' && chosenSeverity == 'Fatal'){
	  currentChart.options.labels = ['Bicycle Deaths'];
	  currentChart.options.ykeys = ['bickills'];
	  currentChart.options.barColors = ["#d41515",];
	  currentChart.options.ymax = 12;
	  app.chartTitle = 'Fatal Bike Collisions :';
	  app.chartSubTitle = intersectionName;
    } else if (chosenIncidents == 'Ped' && chosenSeverity == 'All'){
	  currentChart.options.labels = ['Pedestrian Injuries', 'Pedestrian Deaths'];
	  currentChart.options.ykeys = ['pedinjs', 'pedkills'];
	  currentChart.options.barColors = ["#1279c6","#d41515"];
	  currentChart.options.ymax = 12;
	  app.chartTitle = 'All Pedestrian Collisions :';
	  app.chartSubTitle = intersectionName;
    } else if (chosenIncidents == 'Ped' && chosenSeverity == 'Nonf'){
	  currentChart.options.labels = ['Pedestrian Injuries'];
	  currentChart.options.ykeys = ['pedinjs'];
	  currentChart.options.barColors = ["#1279c6",];
	  currentChart.options.ymax = 12;
	  app.chartTitle = 'Non-fatal Pedestrian Collisions :';
	  app.chartSubTitle = intersectionName;
    } else {
	  currentChart.options.labels = ['Pedestrian Deaths'];
	  currentChart.options.ykeys = ['pedkills'];
	  currentChart.options.barColors = ["#d41515",];
	  currentChart.options.ymax = 12;
	  app.chartTitle = 'Fatal Pedestrian Collisions :';
	  app.chartSubTitle = intersectionName;
    }

	//Then set the data to be yearlyTotals
    currentChart.setData(selectedData);
  //If the chart is new, create it with the parameters found before.
  } else {

    currentChart = new Morris.Bar({
    // ID of the element in which to draw the chart.
      element: 'chart',
      data: selectedData,
      stacked: true,
    // The name of the data record attribute that contains x-values.
      xkey: 'year',
    // A list of names of data record attributes that contain y-values.
      ykeys: ['pedcols', 'biccols'],
      ymax: ymax,
      labels: ['Pedestrian Collisions', 'Bicycle Collisions'],
      barColors: ["#1279c6","#d41515",],
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
                  '2015','2016','2017'];

//Format x labels
function dateFmt(x) {
  return yearLabels[x.x];
}

//initialize yearlyTotals data
let yearlyTotals;

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
	allJSONData = jsonData;
    yearlyTotals = [];
	let every_pedcol = 0;
	let every_biccol = 0;
	let every_pedkill = 0;
	let every_bickill = 0;
	let every_pedinj = 0;
	let every_bicinj = 0;
	for (let year in yearlist){
		let pedcol = 0;
		let biccol = 0;
		let pedkill = 0;
		let bickill = 0;
		let pedinj = 0;
		let bicinj = 0;
		for (let json in jsonData){
			if (yearlist[year] == Number(jsonData[json].year)){
				pedcol += jsonData[json].pedcol;
				biccol += jsonData[json].biccol;
				pedkill += jsonData[json].pedkill;
				bickill += jsonData[json].bickill;
				pedinj += jsonData[json].pedinj;
				bicinj += jsonData[json].bicinj;

			}
		}
		yearlyTotals.push({year:yearlist[year], pedcols:pedcol, biccols:biccol, pedkills:pedkill, bickills:bickill, pedinjs:pedinj, bicinjs:bicinj});
		every_pedcol += pedcol;
		every_biccol += biccol;
		every_pedkill += pedkill;
		every_bickill += bickill;
		every_pedinj += pedinj;
		every_bicinj += bicinj;
	}
	yearlyTotals.push({year:'Every Year', pedcols:every_pedcol, biccols:every_biccol, pedkills:every_pedkill, bickills:every_bickill, pedinjs:every_pedinj, bicinjs:every_bicinj});

    app.timeSlider.disabled = false;
    showYearlyChart();
}

//use the yearly totals data to get the chart you want dependent on chosen incidents and severity
function showYearlyChart() {
  let data = yearlyTotals;
  data = data.slice(0,yearlyTotals.length-1);
  remakeLabel();
  app.chartTitle = label;

  //If there is already a chart there, dependent on chosen incident and severity. Change the labels, ykeys, and ymax.
  if (currentChart) {
	if (chosenIncidents == 'Bike' && chosenSeverity == 'All'){
	  currentChart.options.labels = ['Bicycle Injuries', 'Bicycle Deaths'];
	  currentChart.options.ykeys = ['bicinjs', 'bickills'];
	  currentChart.options.barColors = ["#1279c6","#d41515"];
	  var yearmax = 1000;
	  currentChart.options.ymax = yearmax;

    } else if (chosenIncidents == 'Bike' && chosenSeverity == 'Nonf'){
	  currentChart.options.labels = ['Bicycle Injuries'];
	  currentChart.options.ykeys = ['bicinjs'];
	  currentChart.options.barColors = ["#1279c6",];
	  var yearmax = 1000;
	  currentChart.options.ymax = yearmax;
    } else if (chosenIncidents == 'Bike' && chosenSeverity == 'Fatal'){
	  currentChart.options.labels = ['Bicycle Deaths'];
	  currentChart.options.ykeys = ['bickills'];
	  currentChart.options.barColors = ["#d41515",];
	  var yearmax = 30;
	  currentChart.options.ymax = yearmax;
    } else if (chosenIncidents == 'Ped' && chosenSeverity == 'All'){
	  currentChart.options.labels = ['Pedestrian Injuries', 'Pedestrian Deaths'];
	  currentChart.options.ykeys = ['pedinjs', 'pedkills'];
	  currentChart.options.barColors = ["#1279c6","#d41515"];
	  var yearmax = 1000;
	  currentChart.options.ymax = yearmax;
    } else if (chosenIncidents == 'Ped' && chosenSeverity == 'Nonf'){
	  currentChart.options.labels = ['Pedestrian Injuries'];
	  currentChart.options.ykeys = ['pedinjs'];
	  currentChart.options.barColors = ["#1279c6",];
	  var yearmax = 1000;
	  currentChart.options.ymax = yearmax;
    } else {
	  currentChart.options.labels = ['Pedestrian Deaths'];
	  currentChart.options.ykeys = ['pedkills'];
	  currentChart.options.barColors = ["#d41515",];
	  var yearmax = 30;
	  currentChart.options.ymax = yearmax;
    }

	//Then set the data to be yearlyTotals
    currentChart.setData(data);


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
    ykeys: ['pedinjs', 'pedkills'],
    ymax: yearmax,
    labels: ['Pedestrian Injuries', 'Pedestrian Deaths'],
    barColors: ["#1279c6","#d41515"],
    xLabels: "Year",
    xLabelAngle: 60,
    xLabelFormat: dateFmt,
    yLabelFormat: yFmt,
    hideHover: 'true',
    parseTime: false,
  });


  }

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
  if (selectedIntersection){
	createChart();
  } else {
	showYearlyChart();
  }
}

//same as above, but with ped
function pickPed(thing) {
  app.isBikeactive = false;
  app.isPedactive = true;
  chosenIncidents = 'Ped'
  getSWITRSinfo();
  if (selectedIntersection){
	createChart();
  } else {
	showYearlyChart();
  }
}


//Same as above except changing the severity instead of incidents and to Fatal
function pickFatal(thing) {
  app.isFatalactive = true;
  app.isNonfactive = false;
  app.isAllactive = false;
  chosenSeverity = 'Fatal'
  getSWITRSinfo();
  if (selectedIntersection){
	createChart();
  } else {
	showYearlyChart();
  }
}

//Same as above, but severity to non-fatal
function pickNonf(thing) {
  app.isFatalactive = false;
  app.isNonfactive = true;
  app.isAllactive = false;
  chosenSeverity = 'Nonf'
  getSWITRSinfo();
  if (selectedIntersection){
	createChart();
  } else {
	showYearlyChart();
  }
}


//same as above changing the severity to any collision
function pickAll(thing) {
  app.isFatalactive = false;
  app.isNonfactive = false;
  app.isAllactive = true;
  chosenSeverity = 'All'
  getSWITRSinfo();
  if (selectedIntersection){
	createChart();
  } else {
	showYearlyChart();
  }
}

//When the year time slider changes, query the data for visualization again.
function sliderChanged(thing) {
  totals = false;
  getSWITRSinfo();
  if (selectedIntersection || !yearlyTotals){

  } else {
	remakeLabel();
    app.chartTitle = label;
  }
  prevAppValue = app.sliderValue;

}

let yearlist = [];

//update the year slider
function updateSliderData() {
  //create the yearlabels based upon what years are in the data.
  yearlist = [];
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
	let sliderlist = [];
    for (let year in yearlist){
	  sliderlist.push(yearlist[year]);
    }
    sliderlist.push('All Years');
    app.timeSlider.data = sliderlist;
	app.sliderValue = sliderlist[sliderlist.length-1];
  });
  fetchYearlyDetails();
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
          tooltipStyle: { backgroundColor: '#9724be', borderColor: '#9724be' },
          lazy: false,
          reverse: false,
          speed: .25,
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
    chartSubTitle: 'All Intersections',
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