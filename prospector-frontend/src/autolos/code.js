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

// Use npm and babel to support IE11/Safari
import 'babel-polyfill';
import 'isomorphic-fetch';
import Vue from 'vue/dist/vue.js';
import vueSlider from 'vue-slider-component';


let api_server = 'https://api.sfcta.org/api/';
let data_view = 'cmp_auto';

let segmentLayer;
let selectedSegment, popupSegment, hoverColor, popupColor;
let speedCache = {};

let losColor = {'A':'#060', 'B':'#9f0', 'C':'#ff3', 'D':'#f90', 'E':'#f60', 'F':'#c00'};
const MISSING_COLOR = '#ccc';
const LOS_VALS = ['A', 'B', 'C', 'D', 'E', 'F']
const LOS_COLORS = ['#060', '#9f0', '#ff3', '#f90', '#f60', '#c00']

var maplib = require('../jslib/maplib');
var mymap = maplib.sfmap;
let styles = maplib.styles;
let getLegHTML = maplib.getLegHTML;


function addSegmentLayer(segments, options={}) {
  // TODO: figure out why PostGIS geojson isn't in exactly the right format.
  for (let segment of segments) {
    segment["type"] = "Feature";
    segment["geometry"] = JSON.parse(segment.geometry);
  }

  segmentLayer = L.geoJSON(segments, {
    style: styleByLosColor,
    onEachFeature: function(feature, layer) {
      layer.on({ mouseover: hoverOnSegment,
                 click : clickedOnSegment,
      });
    },
  });

  if (mymap.segmentLayer) {
    selectedSegment = popupSegment = hoverColor = popupColor = null;
    mymap.removeLayer(segmentLayer);
    segmentLayer = null;
  }
  segmentLayer.addTo(mymap);


}

function styleByLosColor(segment) {
  let cmp_id = segment.cmp_segid;
  let los = segmentLos[cmp_id];
  let color = losColor[los];
  if (!color) color = MISSING_COLOR;
  return {color: color, weight: 4, opacity: 1.0};
}


function hoverOnSegment(e) {
      // don't do anything if we just moused over the already-popped up segment
      if (e.target == popupSegment) return;

      let segment = e.target.feature;
      let cmp_id = segment.cmp_segid;

      // return previously-hovered segment to its original color
      if (selectedSegment != popupSegment) {
        if (selectedSegment) {
          let cmp_id = selectedSegment.feature.cmp_segid;
          let color = losColor[segmentLos[cmp_id]];
          if (!color) color = MISSING_COLOR;
          selectedSegment.setStyle({color:color, weight:4, opacity:1.0});
        }
      }

      selectedSegment = e.target;
      selectedSegment.setStyle(styles.selected);
      selectedSegment.bringToFront();
}

function buildChartHtmlFromCmpData(json) {
  let byYear = {}
  let data = [];

  for (let entry of json) {
    let speed = Number(entry.avg_speed).toFixed(1);
    if (speed === 'NaN') continue;
    if (!byYear[entry.year]) byYear[entry.year] = {};
    byYear[entry.year][entry.period] = speed;
  }

  for (let year in byYear) {
    data.push({year:year, am: byYear[year]['AM'], pm: byYear[year]['PM']});
  }

  new Morris.Line({
    // ID of the element in which to draw the chart.
    element: 'chart',
    // Chart data records -- each entry in this array corresponds to a point on
    // the chart.
    data: data,
    // The name of the data record attribute that contains x-values.
    xkey: 'year',
    // A list of names of data record attributes that contain y-values.
    ykeys: ['am', 'pm'],
    // Labels for the ykeys -- will be displayed when you hover over the
    // chart.
    labels: ['AM', 'PM'],
    lineColors: ["#f66","#44f"],
    xLabels: "year",
    xLabelAngle: 45,
  });
}

function clickedOnSegment(e) {
      let segment = e.target.feature;
      let cmp_id = segment.cmp_segid;

      // highlight it
      if (popupSegment) {
        let cmp_id = popupSegment.feature.cmp_segid;
        let color = losColor[segmentLos[cmp_id]];
        popupSegment.setStyle({color:color, weight:4, opacity:1.0});
      }
      e.target.setStyle(styles.popup);
      popupSegment = e.target;

      // delete old chart
      document.getElementById("chart").innerHTML = "";

      // fetch the CMP details
      let finalUrl = api_server + 'cmp_auto?cmp_segid=eq.' + cmp_id;
      fetch(finalUrl).then((resp) => resp.json()).then(function(jsonData) {
          let popupText = "<b>"+segment.cmp_name+" "+segment.direction+"-bound</b><br/>" +
                          segment.cmp_from + " to " + segment.cmp_to;

          let popup = L.popup()
              .setLatLng(e.latlng)
              .setContent(popupText)
              .openOn(mymap);

          popup.on("remove", function(e) {
            let cmp_id = popupSegment.feature.cmp_segid;
            let color = losColor[segmentLos[cmp_id]];
            popupSegment.setStyle({color:color, weight:4, opacity:1.0});
            popupSegment = null;
            document.getElementById("chart").innerHTML = "";
          });

          buildChartHtmlFromCmpData(jsonData);
      }).catch(function(error) {
          console.log("err: "+error);
      });
}

let esc = encodeURIComponent;

function queryServer() {
  const url = api_server + 'cmp_segments_master?' +
                           'select=geometry,cmp_segid,cmp_name,cmp_from,cmp_to,direction,length';
  // Fetch the segments
  fetch(url)
    .then((resp) => resp.json())
    .then(function(jsonData) {
      let personJson = jsonData;
      colorByLOS(personJson, app.sliderValue);
    })
    .catch(function(error) {
      console.log("err: "+error);
    });
}

let segmentLos = {};

function colorByLOS(personJson, year) {
  let lookup = chosenPeriod + year;

  // Don't re-fetch if we already have the color data
  if (lookup in speedCache) {
    segmentLos = speedCache[lookup];
    segmentLayer.clearLayers();
    addSegmentLayer(personJson);
    return;
  }

  let url = api_server + 'cmp_auto?';
  let params = 'year=eq.'+year +
               '&period=eq.'+chosenPeriod +
               '&select=cmp_segid,avg_speed,year,period,los_hcm85';

  let finalUrl = url + params;

  fetch(finalUrl).then((resp) => resp.json()).then(function(data) {
    //console.log(data);
    let losData = {};
    for (let segment in data) {
      let thing = data[segment];
      losData[thing.cmp_segid] = thing.los_hcm85;
    }
    // save it for later
    speedCache[chosenPeriod+year] = losData;
    segmentLos = losData;

    // add it to the map
    if (segmentLayer) segmentLayer.clearLayers();
    addSegmentLayer(personJson);
  }).catch(function(error) {
    console.log(error);
  });

}

let chosenPeriod = 'AM';

function pickAM(thing) {
  app.isAMactive = true;
  app.isPMactive = false;
  chosenPeriod = 'AM';
  queryServer();
}

function pickPM(thing) {
  app.isAMactive = false;
  app.isPMactive = true;
  chosenPeriod = 'PM';
  queryServer();
}

function updateLegend(){
  let legend = L.control({position: 'bottomright'});
  legend.onAdd = function (map) {
    let div = L.DomUtil.create('div', 'info legend')
    div.innerHTML = getLegHTML(LOS_VALS, LOS_COLORS, false);
    return div;
  };
  legend.addTo(mymap);
}

// SLIDER ----
// fetch the year details in data
function updateSliderData() {
  let yearlist = [];
  fetch(api_server + data_view + '?select=year').then((resp) => resp.json()).then(function(jsonData) {
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
					width: 'auto',
					height: 6,
					dotSize: 16,
					eventType: 'auto',
					tooltip: 'always',
					clickable: true,
					tooltipPlacement: 'bottom',
					marks: true,
					hideLabel: true,
					lazy: false,
					process: false,
};
// ------

function sliderChanged(thing) {
  mymap.closePopup();
  // delete old chart
  document.getElementById("chart").innerHTML = "";
  queryServer();
}

let app = new Vue({
  el: '#panel',
  data: {
    isAMactive: true,
    isPMactive: false,
    sliderValue: 0,
    timeSlider: timeSlider,
  },
  methods: {
    pickAM: pickAM,
    pickPM: pickPM,
  },
  watch: {
    sliderValue: sliderChanged,
  },
  components: {
    vueSlider,
  }
});
updateSliderData();
updateLegend();
queryServer();
