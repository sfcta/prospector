'use strict';

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

// IMPORTS-------------------------------------------------------------------

import 'isomorphic-fetch';
import 'lodash';
import vueSlider from 'vue-slider-component';
import Cookies from 'js-cookie';
import 'd3'

// MAP-----------------------------------------------------------------------

var maplib = require('../jslib/maplib');
let mymap = maplib.sfmap;
let styles = maplib.styles;
let zoomLevel = 13; 
mymap.setView([37.76889, -122.440997], zoomLevel);

let stripes = new L.StripePattern({weight:2,spaceWeight:3,opacity:0.6,angle:135}); 
stripes.addTo(mymap);

let addLayerStore = {};

let mapLegend;

const ADDLAYERS = [
  {
    view: 'hin2017', name: 'High Injury Network',
    style: { opacity: 1, weight: 2, color: '#FF8C00', interactive: false},
    info: 'https://www.visionzerosf.org/maps-data/',
  },
  {
    view: 'coc2017_diss', name: 'Communities of Concern',
    style: { opacity: 1, weight: 2, color: 'grey', fillPattern: stripes, interactive: false},
    info: 'https://www.arcgis.com/home/item.html?id=1501fe1552414d569ca747e0e23628ff',
  }, {
    view: 'sfparks', name: 'Major Parks',
    style: { opacity: 1, weight: 2, color: 'grey', fillPattern: stripes, interactive: false }
  }, {
    view: 'sup_district_boundaries', name: 'Supervisorial District Boundaries',
    style: { opacity: 1, weight: 2, color: '#730073', fillOpacity: 0, interactive: false },
    info: 'https://sfbos.org/'
  }
]


// D3------------------------------------------------------------------------
var d3 = require("d3");

// VARIABLES-----------------------------------------------------------------

let chosenLocation = 'All';
const hourLabels = ['12 AM','1 AM','2 AM', '3 AM','4 AM','5 AM','6 AM','7 AM',
                  '8 AM','9 AM','10 AM','11 AM',
                  'Noon','1 PM','2 PM','3 PM',
                  '4 PM','5 PM','6 PM','7 PM',
                  '8 PM','9 PM','10 PM','11 PM'];

const dayLables = ['All Days', 'Monday', 'Tuesday', 'Wednesday', 'Thursday',
                  'Friday', 'Saturday', 'Sunday']

const locationLabels = {'onstreet':'On-Street', 'offstreet':'Off-Street', 'All':'On-Street and Off-Street'}

let currentChart = null;

let selectedData;
let chartData; 
let mapData;
let parkingLayer; 
let tnc_parking;
let infopanel = L.control();

let geom_dict = {}

let geoPopup;
let selectedGeo;

// FUNCTIONS-----------------------------------------------------------------

function setup() {

  // Geographic details. 
  fetch('http://api.sfcta.org/api/parking_locations')
    .then((resp) => resp.json())
    .then(function(jsonData) {createGeoIDDict(jsonData)})
    .catch(function(error) {console.log('err:' + error)})
  // Temporal observations.
  fetch('http://api.sfcta.org/api/tnc_parking')
    .then((resp) => resp.json())
    .then(function(jsonData) {
      tnc_parking = jsonData;
      selectedData = jsonData;
      buildChart();
      updateLabels();
      buildMapData();
      buildTNCLayer();
      app.chartTitle = 'Parking Duration in Minutes';
      fetchAddLayers();
    })
    .catch(function(error) {console.log('err:' + error)})

}

async function fetchAddLayers() {
  try {
    for (let item of ADDLAYERS) {
      let resp = await fetch('https://api.sfcta.org/api/' + item.view);
      let features = await resp.json();
      for (let feat of features) {
        feat['type'] = 'Feature';
        feat['geometry'] = JSON.parse(feat.geometry);
      }
      let lyr = L.geoJSON(features, {
        style: item.style,
        pane: 'shadowPane',
      }).addTo(mymap);
      addLayerStore[item.view] = lyr;
      mymap.removeLayer(lyr);
    }
  } catch (error) {
    console.log('additional layers error: ' + error);
  }
}

function showExtraLayers(e) {
  for (let lyr in addLayerStore) {
    mymap.removeLayer(addLayerStore[lyr]);
  }
  for (let lyr of app.addLayers) {
    addLayerStore[lyr].addTo(mymap);
  }
}

function createGeoIDDict(json) {

  // Create geoid -> geometry, location_type mapping. 

  geom_dict = {}

  for (var i in json) {
    var element = json[i]
    let geom_id = element['geom_id'].replace('.0', ''); // To Do -- fix in original DF 
    geom_dict[geom_id] = {'geometry':element['geometry'], 'location_type':element['location_type']}
  }
}

function updateSelectedData() {

  // Select data by day of week & location
  selectedData = tnc_parking.filter(function(elem) {
    let filters = true;
    // Day
    if (app.day != 0) {
      filters = filters && (elem.day == app.day-1)
    } 
    // Location
    if (chosenLocation != 'All') {
      filters = filters && (geom_dict[elem.geom_id].location_type == chosenLocation)
    }
    return filters
  })
  
  updateLabels();
}

function updateLabels() {

  // Sub-label (Location & Days)
  app.chartSubTitle = locationLabels[chosenLocation] + ' Parking, ' + dayLables[app.day]
  
  // Sub-sub label (Geo-ID)
  if (selectedGeo) {
    app.chartSubSubTitle = 'Selected Geo-ID: ' + selectedGeo;
  } else {
    app.chartSubSubTitle = ''
  }
}

function getLocationColor() {

  if (selectedGeo) {
    if (geom_dict[selectedGeo]['location_type'] == 'onstreet') {
      return 'CornflowerBlue';
    } else {
      return 'coral';
    }
  }

  // Bar color
  if ((app.isAllActive) & (!selectedGeo)) {
    return '#8d8d8d'; // gray
  } else if (app.isOnStreetActive) {
    return 'CornflowerBlue';
  } else {
    return 'coral';
  }
}

function numberWithCommas(x) {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function tidyNumber(num) {
  if (num >= 60) {
    return String((minsToHours(num)).toFixed(2)) + ' hours'
  } else {
    return String(num.toFixed(2)) + ' minutes'
  }
}

function minsToHours(num) {
  var hours = (num / 60);
  var rhours = Math.floor(hours);
  var minutes = (hours - rhours) * 60;
  var rminutes = Math.round(minutes);
  return rhours + (rminutes/60)
}


// BAR CHART--------------------------------

function getYMax() {

  if (selectedGeo) {return 'auto'};

  if (app.day != 0) {
    return 6000
  } else {
    if (app.isAllDay) {
      return 25000
    }
      return 25000
  }
}



function buildChart(data) {

  // Remove current chart
  $('#longchart').empty()

  // Get data
  data = buildChartData(selectedData)

  // Bar color
  let color_main = getLocationColor();

  currentChart = new Morris.Bar({
    element: 'longchart',
    data: data,
    xkey: 'hour',
    ykeys: ['total_duration'],
    ymax: getYMax(),
    labels: ['Duration', 'Hour'],
    hideHover: 'true',
    xLabelAngle: 60,
    hoverCallback: function(index, options, content, row) {
      return '<b>'+row['hour']+'</b>' + '<br>' + tidyNumber(row['total_duration']);
    },
    barColors: function (x) {
      if ((x['label'] != hourLabels[app.sliderValue-1]) && (!app.isAllDay)) {
        return '#5a5a5a'; // gray
      } else { 
        return color_main
      }
    },
  })

  document.getElementById("longchart").style.cursor = "pointer"

  currentChart.on('click', function(i, row) {app.sliderValue = i+1;})
}

function buildChartData(data) {
  let hourlyTotals = {};

  // Initialize
  for (let hour in [...Array(24).keys()]) {
    hourlyTotals[hour] = {'hour':hourLabels[hour], 'total_duration':0};
  } 

  for (let i in data) {
    let elem = data[i];

    // Filter by clicked point if appropriate
    if ((selectedGeo) && (elem.geom_id != selectedGeo)) {continue};

    // Increment values
    hourlyTotals[elem.hour]['total_duration'] += elem.avg_total_minutes;
  }

  chartData = Object.values(hourlyTotals);

  return chartData
}

// MAIN MAP--------------------------------

function buildMapData() {

  mapData = {};

  for (let i in selectedData) {
    let elem = selectedData[i];
    // Filter by hour if necessary.
    if ((!app.isAllDay) && (elem.hour != (app.sliderValue-1))) {continue};

    // Initialize 
    if (!(elem['geom_id'] in mapData)) {
      mapData[elem['geom_id']] = {'geom_id': elem['geom_id'], 'location_type':geom_dict[elem.geom_id].location_type, 'total_duration':0, 'events':0, 'avg_duration':0,
              'type': 'Feature', 'geometry':JSON.parse(geom_dict[elem.geom_id].geometry)}
    }

    // Increment values
    mapData[elem['geom_id']]['total_duration'] += elem.avg_total_minutes;
    mapData[elem['geom_id']]['events'] += elem.avg_events;
  }

  // Dict -> Array of objects
  mapData = Object.values(mapData)

  // Calculate average duration
  mapData.forEach(function(elem) {

    // TODO -- WRONG 
    elem['avg_duration'] = elem['total_duration'] / elem['events'];

  })

  return mapData
}

function circleColor(feature) {
  if (feature['location_type'] == 'onstreet') {
    return 'CornflowerBlue'
  } else {
    return 'Coral'
  }
}

function getScalingFactor() {
  var scaling_factor = 1;
  if ((app.day == 0) && (app.isAllDay)) {
    scaling_factor = .3
  }

  if (mymap.getZoom() > zoomLevel) {
    scaling_factor *= (mymap.getZoom()-zoomLevel+1)
  }

  return scaling_factor
}

mymap.on('zoomend', function() {
  buildTNCLayer()
})

function buildLegend() {

  // Remove previous legend. 
  if (mapLegend) {mymap.removeControl(mapLegend)};

  let max_radius = 20;
  let circle_radii = [max_radius, max_radius/1.3, max_radius/1.8, max_radius/2.5]
  let font_sizes = [15, 12, 11, 9]
  let scaling_factor = getScalingFactor();

  mapLegend = L.control({position: 'bottomleft'}); // Todo -- change to bottomright
  let labels = ['<b>Total Duration (Hours)</b>']

  mapLegend.onAdd = function(map) {

    let div = L.DomUtil.create('div', 'info legend');

    for (let i=0; i<4; i++) {

      let radius = circle_radii[i];
      let hours = minsToHours((radius/scaling_factor)**2);
      let lab = (hours >= 1) ? hours.toFixed(0) : hours.toFixed(2);
      labels.push(
        `
          <div class="legend-circle" 
               style="background:${getLocationColor()}; 
                      width: ${radius*2}px; 
                      height: ${radius*2}px;
                      font-size: ${font_sizes[i]}px;"> ${lab} 
          </div>
        `
      )
    }

    div.innerHTML = labels.join('<br>')

    return div
  }

  mapLegend.addTo(mymap)
}

function buildTNCLayer() {

  var scaling_factor = getScalingFactor();

  if (parkingLayer) {mymap.removeLayer(parkingLayer)};

  buildLegend();

  parkingLayer = L.geoJSON(mapData, {
    style: {"color": '#1279c6', "weight": 0.1, "opacity": 0.15},
    pointToLayer: function(feature, latlng) {
      return new L.CircleMarker(latlng, {radius: Math.sqrt(feature['total_duration'])*scaling_factor, 
                                         fillOpacity: 0.7, 
                                         fillColor:circleColor(feature)});
    },
    onEachFeature: function(feature, layer) {
      layer.on({
        mouseover: hoverFeature,
        mouseout: hoverFeature,
        click: clickedOnFeature
      })
    }
  })

  parkingLayer.addTo(mymap);
}

function hoverFeature(e) {

  if (!e.target.feature['clicked']) {
    // Determine how to alter the circle based on whether the event is mouseover or mouseout. 
    if (e.type == 'mouseout') {
      e.target.feature['hover'] = false;
      var opacity = 0.7
      var radius_mult = 1/1.5
      // Tooltip
      mymap.removeControl(geoPopup)
    } else {
      e.target.feature['hover'] = true;
      var opacity = 0.9
      var radius_mult = 1.5
      // Tooltip
      geoPopup = L.popup()
        .setLatLng(e.latlng)
        .setContent('Geo ID: ' + e.target.feature.geom_id + '<br>' + 
          'Total Duration: ' + tidyNumber(e.target.feature['total_duration']) + '<br>' +
          'Events: ' + e.target.feature['events'].toFixed(2) + '<br>' + 
          'Average Duration: ' + tidyNumber(e.target.feature['avg_duration']))
        .addTo(mymap)
    }
    
    // Highlight/un-highlight circle
    e.target.bringToFront();
    e.target.setStyle({
      'fillOpacity':opacity, 
      'radius':e.target._radius*radius_mult
    })
  }
}


function clickedOnFeature(e) {


  e.target.feature['clicked'] = true;

  selectedGeo = e.target.feature.geom_id;

  // Highlight
  let radius_mult = e.target.feature['hover'] ? 1 : 1.5;
  e.target.bringToFront();
  e.target.setStyle({
    'fillOpacity':1,
    'radius':e.target._radius*radius_mult
  })
  
  // Tooltip
  geoPopup = L.popup()
    .setLatLng(e.latlng)
    .setContent('Geo ID: ' + e.target.feature.geom_id + '<br>' + 
          'Total Duration: ' + tidyNumber(e.target.feature['total_duration']) + '<br>' +
          'Events: ' + e.target.feature['events'].toFixed(2) + '<br>' + 
          'Average Duration: ' + tidyNumber(e.target.feature['avg_duration']))
    .addTo(mymap)
    .on('remove', function() {
      e.target.feature['clicked'] = false
      selectedGeo = NaN; 
      e.target.setStyle({
        'fillOpacity':0.7, 
        'radius':e.target._radius/1.5
      })
      e.target.feature['hover'] = false
      updateLabels();
      buildChart();
    }) 

  updateLabels(); // Update bar chart labels
  buildChart(); // Update bar chart

}


// BUTTON HANDLERS --------------------------

async function clickDay(chosenDay, silent=false) {
  app.day = parseInt(chosenDay)

  if (!silent) {play();} // Handle play button if Day was clicked by user
  updateSelectedData(); // Update selected data (for Chart & Map)
  buildChart(); // Bar chart
  buildMapData() // Update map data
  buildTNCLayer(); // Update map

}

function pickAllLocations(thing) {

  // Update Variables
  app.isOnStreetActive = false;
  app.isOffStreetActive = false; 
  app.isAllActive = true; 
  chosenLocation = 'All';

  updateSelectedData(); // Update selected data (for Chart & Map)
  buildChart(); // Bar chart
  buildMapData() // Update map data
  buildTNCLayer(); // Update map
}

function pickOnStreet(thing) {
  
  // Update Variables
  app.isOnStreetActive = true;
  app.isOffStreetActive = false;
  app.isAllActive = false;
  chosenLocation = 'onstreet';

  updateSelectedData(); // Update selected data (for Chart & Map)
  buildChart(); // Bar chart
  buildMapData() // Update map data
  buildTNCLayer(); // Update map
}

function pickOffStreet(thing) {
  
  // Update Variables
  app.isOnStreetActive = false;
  app.isOffStreetActive = true; 
  app.isAllActive = false; 
  chosenLocation = 'offstreet';

  updateSelectedData(); // Update selected data  (for Chart & Map)
  buildChart(); // Bar chart
  buildMapData() // Update map data
  buildTNCLayer(); // Update map
}

function sliderChanged(index, silent=false) {

  app.isAllDay = (index==0);

  play();
  currentChart.setData(chartData); // Update bar colors
  buildMapData(); // Update map data
  buildTNCLayer(); // Update map

}

// PLAY -------------------------------------------------------------------------

// Store timeout IDs. 
var timeouts = [];

var playBoth = false; 

function killTimeouts() {
  for (var i=0; i < timeouts.length; i++) {
      clearTimeout(timeouts[i]);
  }
  timeouts = [];
}

function clickDOWPlay() {
  app.isPlayDOWActive = !app.isPlayDOWActive;
  play();
}

function clickTODPlay() {
  app.isPlayTODActive = !app.isPlayTODActive;
  play();
}

function play() {
  
  killTimeouts();

  if (app.isPlayDOWActive & app.isPlayTODActive) {
    playBoth = true;
    playTOD();
  } else {
    playBoth = false;
    if (app.isPlayDOWActive) {playDOW()}
    if (app.isPlayTODActive) {playTOD()}
  }

}

function playDOW(reset=false) {
  if ((app.day==0)) {clickDay(1, true)}; 
  var start_day = app.day;
  if ((reset==true)){
    start_day=0
  }
  var delay = 1000;
  // Play each day starting with start_day
  for (let day in [...Array(7 - start_day).keys()]) {
    day = parseInt(day) + 1 + start_day;
    timeouts.push(setTimeout(function(){clickDay(day, true);}, delay*(day-start_day)));
  }
  // Replay
  timeouts.push(setTimeout(function () {playDOW(true);}, delay*(7-start_day)))
}

function playTOD() {
  var delay = 1000; 
  var hr = app.sliderValue+1; 

  if (playBoth) {
    if (hr==25) {
      var day = parseInt(app.day)==7 ? 1 : parseInt(app.day)+1
      timeouts.push(setTimeout(function(){clickDay(day, true);}, delay))
    } else if (app.day == 0) {app.day=1}
  }
  if (hr==25) {hr=1;}; 

  timeouts.push(setTimeout(function(){app.sliderValue = hr}, delay))
}


//  VUE ELEMENTS------------------------------------------------------------------

let timeSlider = {
  min: 0,
  max: 24,
  width: 'auto',
  height: 3,
  dotSize: 16,
  tooltip: 'always',
  clickable: true,
  tooltipPlacement: 'bottom',
  marks: true,
  hideLabel: true,
  lazy: false,
  speed: 0.25,
  tooltipStyle: {"backgroundColor": 'grey', "borderColor": 'grey'},
  process: false,
  tooltipFormatter: idx => idx==0? 'All Day' : hourLabels[idx-1],
  style: {"marginTop":"10px","marginBottom":"30px","marginLeft":"10px","marginRight":"18px"},
};

document.getElementById("timeslider").style.cursor = "pointer"

let app = new Vue({
  el: '#panel',
  delimiters: ['${', '}'],
  data: {
    days: ['All', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
    day: 0,
    isAllActive: true,
    isOnStreetActive: false,
    isOffStreetActive: false,
    isPlayDOWActive: false,
    isPlayTODActive: false,
    sliderValue: 0,
    timeSlider: timeSlider,
    isAllDay: true,
    chartTitle:'',
    chartSubTitle: '',
    chartSubSubTitle: '',
    extraLayers:ADDLAYERS,
    addLayers:[],
    isPanelHidden: false
  },
  methods: {
    clickDay: clickDay,
    pickAllLocations: pickAllLocations, 
    pickOnStreet: pickOnStreet, 
    pickOffStreet: pickOffStreet,
    clickDOWPlay: clickDOWPlay,
    clickTODPlay: clickTODPlay,
    getSliderValue: _.debounce(function() {sliderChanged(this.sliderValue);}, 30),
    addLayers: showExtraLayers,
  },
  watch: {
    sliderValue: function(value) {
      this.getSliderValue();
    },
    addLayers: showExtraLayers,
  }, 
  components: {
    vueSlider
  }
});

let slideapp = new Vue({
  el: '#slide-panel',
  delimiters: ['${', '}'],
  data: {
    isPanelHidden: false,
  },
  methods: {
    clickedShowHide: clickedShowHide,
  },
});

function clickedShowHide(e) {
  slideapp.isPanelHidden = !slideapp.isPanelHidden;
  app.isPanelHidden = slideapp.isPanelHidden;
  // leaflet map needs to be force-recentered, and it is slow.
  for (let delay of [50, 100, 150, 200, 250, 300, 350, 400, 450]) {
    setTimeout(function() {
      mymap.invalidateSize()
    }, delay)
  }
}

// MAIN----------------------------------------------------------------------
setup();
