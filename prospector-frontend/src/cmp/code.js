

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

// Must use npm and babel to support IE11/Safari
import 'isomorphic-fetch';
import vueSlider from 'vue-slider-component';
import Cookies from 'js-cookie';

var maplib = require('../jslib/maplib');
let styles = maplib.styles;
let getLegHTML = maplib.getLegHTML;
let getColorFromVal = maplib.getColorFromVal;
let mymap = maplib.sfmap;
mymap.setView([37.76889, -122.440997], 13);

// some important global variables.
const API_SERVER = 'https://api.sfcta.org/api/';
const GEO_VIEW = 'cmp_segments_master';
const VIZ_LIST = ['ALOS', 'TSPD', 'TRLB', 'ATRAT'];
const VIZ_INFO = {
  ALOS: {
    TXT: 'Auto Level-of-Service (LOS)',
    VIEW: 'cmp_autotransit',
    METRIC: 'los_hcm85',
    METRIC_DESC: 'Level of Service',
    COLOR_BY_BINS: false,
    COLORVALS: ['A', 'B', 'C', 'D', 'E', 'F'],
    COLORS: ['#060', '#9f0', '#ff3', '#f90', '#f60', '#c00'],
    CHARTINFO: 'AUTO SPEED TREND (MPH):',
    CHART_PREC: 1,
    POST_UNITS: '',
  },

  TSPD: {
    TXT: 'Transit Speed',
    VIEW: 'cmp_autotransit',
    METRIC: 'transit_speed',
    METRIC_DESC: 'Transit Speed (MPH)',
    COLOR_BY_BINS: true,
    COLORVALS: [0, 5, 7.5, 10, 12.5, 15],
    COLORS: ['#ccc', '#c00', '#f60', '#f90', '#ff3', '#9f0', '#060'],
    CHARTINFO: 'TRANSIT SPEED TREND (MPH):',
    CHART_PREC: 1,
    POST_UNITS: '',
  },

  TRLB: {
    TXT: 'Transit Reliability',
    VIEW: 'cmp_autotransit',
    METRIC: 'transit_cv',
    METRIC_DESC: 'Transit Reliability',
    COLOR_BY_BINS: true,
    COLORVALS: [0, 5, 10, 20, 30, 40],
    COLORS: ['#ccc', '#060', '#9f0', '#ff3', '#f90', '#f60', '#c00'],
    CHARTINFO: 'TRANSIT RELIABILITY TREND:',
    CHART_PREC: 1,
    POST_UNITS: '%',
  },

  ATRAT: {
    TXT: 'Auto-Transit Speed Ratio',
    VIEW: 'cmp_autotransit',
    METRIC: 'atspd_ratio',
    METRIC_DESC: 'Auto/Transit Speed',
    COLOR_BY_BINS: true,
    COLORVALS: [0, 1, 1.5, 2, 2.5, 3],
    COLORS: ['#ccc', '#060', '#9f0', '#ff3', '#f90', '#f60', '#c00'],
    CHARTINFO: 'AUTO/TRANSIT SPEED TREND:',
    CHART_PREC: 1,
    POST_UNITS: '',
  },
};
const MISSING_COLOR = '#ccd';

let init_selectedViz = VIZ_LIST[0];

let data_view = VIZ_INFO[init_selectedViz]['VIEW'];
let selviz_metric = VIZ_INFO[init_selectedViz]['METRIC'];
let selPeriod = 'AM';
let aggdata_view = 'cmp_aggregate';
let aggdata_label = 'All Segments Combined';
let selGeoId;

let geoLayer, mapLegend;
let selMetricData;
let yearData = {};
let popHoverSegment, popSelSegment;
let selectedSegment, prevselectedSegment;

let _segmentJson;
let _allCmpData;
let _aggregateData;

async function initialPrep() {

  console.log('1...');
  _segmentJson = await fetchCmpSegments();

  console.log('2...');
  _allCmpData = await fetchAllCmpSegmentData();

  console.log('3...');
  _aggregateData = await fetchAggregateData();

  console.log('4... ');
  await buildChartHtmlFromCmpData();

  console.log('5...');
  await updateSliderData();

  console.log('6 !!!');
}

async function fetchCmpSegments() {
  const geo_url = API_SERVER + GEO_VIEW +
    '?select=geometry,cmp_segid,cmp_name,cmp_from,cmp_to,direction,length';

  try {
    let resp = await fetch(geo_url);
    let segments = await resp.json();

    // do some parsing and stuff
    for (let segment of segments) {
      segment['type'] = 'Feature';
      segment['geometry'] = JSON.parse(segment.geometry);
    }
    return segments;

  } catch (error) {
    console.log('map segment error: ' + error);
  }
}

async function fetchAllCmpSegmentData() {
  //FIXME this should be a map()
  let params =
    'select=cmp_segid,year,period,los_hcm85,transit_speed,transit_cv,atspd_ratio,auto_speed';

  let data_url = API_SERVER + data_view + '?' + params;

  selMetricData = {};

  try {
    let resp = await fetch(data_url);
    return await resp.json();

  } catch (error) {console.log('cmp data fetch error: ' + error);}
}

async function fetchAggregateData() {
  let buildAggData = {};

  const url = API_SERVER + aggdata_view
    + '?select=fac_typ,period,year,viz,metric';

  try {
    let resp = await fetch(url);
    let jsonData = await resp.json();

    for (let viz of VIZ_LIST) {
      parseAllAggregateData(buildAggData, jsonData, viz);
    }
    return buildAggData;

  } catch(error) {
    console.log('aggregate data error: ' + error);
  }
}

async function parseAllAggregateData(buildAggData, jsonData, viz) {
  buildAggData[viz] = {};

  let vizData = jsonData.filter(row => row['viz'] === viz);

  let byYearAM = {};
  let byYearPM = {};

  for (let entry of vizData) {
    let val = Number(entry.metric).toFixed(
      VIZ_INFO[viz]['CHART_PREC']
    );
    if (val === 'NaN') continue;
    if (entry.period == 'AM') {
      if (!byYearAM[entry.year]) byYearAM[entry.year] = {};
      byYearAM[entry.year][entry.fac_typ] = val;
    } else {
      if (!byYearPM[entry.year]) byYearPM[entry.year] = {};
      byYearPM[entry.year][entry.fac_typ] = val;
    }
  }

  // Push AM data
  let data = [];
  for (let year in byYearAM) {
    data.push({
      year: year,
      art: byYearAM[year]['Arterial'],
      fwy: byYearAM[year]['Freeway'],
    });
  }
  buildAggData[viz]['AM'] = data;

  // Push PM data
  data = [];
  for (let year in byYearPM) {
    data.push({
      year: year,
      art: byYearPM[year]['Arterial'],
      fwy: byYearPM[year]['Freeway'],
    });
  }
  buildAggData[viz]['PM'] = data;
}

// hover panel -------------------
let infoPanel = L.control();

infoPanel.onAdd = function(map) {
  // create a div with a class "info"
  this._div = L.DomUtil.create('div', 'info-panel-hide');
  return this._div;
};

infoPanel.update = function(geo) {
  infoPanel._div.innerHTML = '';
  infoPanel._div.className = 'info-panel';

  if (geo) {
    this._div.innerHTML =
      `<b>${geo.cmp_name} ${geo.direction}-bound</b><br/>` +
      `${geo.cmp_from} to ${geo.cmp_to}`;
  }

  infoPanelTimeout = setTimeout(function() {
    // use CSS to hide the info-panel
    infoPanel._div.className = 'info-panel-hide';
    // and clear the hover too
    geoLayer.resetStyle(oldHoverTarget);
  }, 2000);
};
infoPanel.addTo(mymap);

function drawMapSegments() {

  // create a clean copy of the segment Json
  let cleanSegments = _segmentJson.slice();

  let relevantRows = _allCmpData.filter(
    row => row.year==app.sliderValue && row.period===selPeriod
  );

  let lookup = {};
  for (let row of relevantRows) {
    lookup[row.cmp_segid] = row;
  };

  // update metric-colored segment data
  for (let segment of cleanSegments) {
    if (lookup[segment.cmp_segid]) {
      segment['metric'] = lookup[segment.cmp_segid][selviz_metric];
    } else {
      segment['metric'] = null;
    }
  }

  if (geoLayer) mymap.removeLayer(geoLayer);
  if (mapLegend) mymap.removeControl(mapLegend);

  geoLayer = L.geoJSON(cleanSegments, {
    style: styleByMetricColor,
    onEachFeature: function(feature, layer) {
      layer.on({
        mouseover: hoverFeature,
        click: clickedOnFeature,
      });
    },
  });
  geoLayer.addTo(mymap);

  mapLegend = L.control({ position: 'bottomright' });
  mapLegend.onAdd = function(map) {
    let div = L.DomUtil.create('div', 'info legend');
    let legHTML = getLegHTML(
      VIZ_INFO[app.selectedViz]['COLORVALS'],
      VIZ_INFO[app.selectedViz]['COLORS'],
      VIZ_INFO[app.selectedViz]['COLOR_BY_BINS'],
      VIZ_INFO[app.selectedViz]['POST_UNITS']
    );
    div.innerHTML =
      '<h4>' + VIZ_INFO[app.selectedViz]['METRIC_DESC'] + '</h4>' + legHTML;

    return div;
  };
  mapLegend.addTo(mymap);
}

function styleByMetricColor(segment) {
  let cmp_id = segment['cmp_segid'];
  let color = getColorFromVal(
    segment['metric'],
    VIZ_INFO[app.selectedViz]['COLORVALS'],
    VIZ_INFO[app.selectedViz]['COLORS'],
    VIZ_INFO[app.selectedViz]['COLOR_BY_BINS']
  );
  if (!color) color = MISSING_COLOR;
  return { color: color, weight: 4, opacity: 1.0 };
}

let infoPanelTimeout;
let oldHoverTarget;

function hoverFeature(e) {
  clearTimeout(infoPanelTimeout);
  infoPanel.update(e.target.feature);

  // don't do anything else if the feature is already clicked
  if (selGeoId === e.target.feature.cmp_segid) return;

  // return previously-hovered segment to its original color
  if (oldHoverTarget && e.target.feature.cmp_segid != selGeoId) {
    if (oldHoverTarget.feature.cmp_segid != selGeoId)
      geoLayer.resetStyle(oldHoverTarget);
  }

  let highlightedGeo = e.target;
  highlightedGeo.bringToFront();

  if (highlightedGeo.feature.cmp_segid != selGeoId) {
    highlightedGeo.setStyle(styles.selected);
    oldHoverTarget = e.target;
  }
}

let _selectedGeo;
let _selectedLatLng;

function highlightSelectedSegment() {
  if (!selGeoId) return;

  mymap.eachLayer(function (e) {
    try {
      if (e.feature.cmp_segid === selGeoId) {
        e.setStyle(styles.popup);
        selectedSegment = e;
        return;
      }
    } catch(error) {}
  });
}

function clickedOnFeature(e) {
  e.target.setStyle(styles.popup);

  let geo = e.target.feature;
  selGeoId = geo.cmp_segid;

  // unselect the previously-selected selection, if there is one
  if (selectedSegment && selectedSegment.feature.cmp_segid != geo.cmp_segid) {
    prevselectedSegment = selectedSegment;
    geoLayer.resetStyle(prevselectedSegment);
  }
  selectedSegment = e.target;

  let tmptxt = `${geo.cmp_name} ${geo.direction}-bound`;
  app.chartSubtitle = `${tmptxt} [${geo.cmp_from} to ${geo.cmp_to}]`;

  showSegmentDetails(geo, e.latlng);
}

function showSegmentDetails(geo, latlng) {
  _selectedGeo = geo;
  _selectedLatLng = latlng;

  // show popup
  let popupText =
    `<b>${geo.cmp_name} ${geo.direction}-bound</b><br/>` +
    `${geo.cmp_from} to ${geo.cmp_to}`;

  popSelSegment = L.popup()
    .setLatLng(latlng)
    .setContent(popupText)
    .addTo(mymap);

  // Revert to overall chart when no segment selected
  popSelSegment.on('remove', function(e) {
    geoLayer.resetStyle(selectedSegment);
    app.chartSubtitle = aggdata_label;
    prevselectedSegment = selectedSegment = selGeoId = _selectedGeo = null;
    buildChartHtmlFromCmpData();
  });

  showVizChartForSelectedSegment();
}

// Show chart (filter json results for just the selected segment)
function showVizChartForSelectedSegment() {

  let metric_col = selviz_metric;
  // show actual speeds in chart, not A-F LOS categories
  if (selviz_metric == 'los_hcm85') metric_col = 'auto_speed';

  if (_selectedGeo) {
    let segmentData = _allCmpData
      .filter(row => row.cmp_segid == _selectedGeo.cmp_segid)
      .filter(row => row[metric_col] != null);
    buildChartHtmlFromCmpData(segmentData);
  } else {
    buildChartHtmlFromCmpData();
  }
}

function buildChartHtmlFromCmpData(json = null) {
  document.getElementById('longchart').innerHTML = '';

  if (json) {
    let byYear = {};
    let data = [];
    let maxHeight = 0;

    for (let entry of json) {
      let metric_col = selviz_metric;
      if (selviz_metric == VIZ_INFO['ALOS']['METRIC'])
        metric_col = 'auto_speed';
      let val = Number(entry[metric_col]).toFixed(
        VIZ_INFO[app.selectedViz]['CHART_PREC']
      );
      if (val === 'NaN') continue;
      if (!byYear[entry.year]) byYear[entry.year] = {};
      byYear[entry.year][entry.period] = val;
    }
    for (let year in byYear) {
      if (app.isAMActive) {
        data.push({year: year, period: byYear[year]['AM']});
      } else {
        data.push({year: year, period: byYear[year]['PM']});
      }

      // use the same scale for am/pm even though we only show one
      if (byYear[year]['AM'])
        maxHeight = Math.max(maxHeight, byYear[year]['AM']);
      if (byYear[year]['PM'])
        maxHeight = Math.max(maxHeight, byYear[year]['PM']);
    }

    // scale ymax to either 20 or 60:
    maxHeight = maxHeight <= 20 ? 20 : 60;

    // use maxHeight for ALOS and TSPD; use auto for other metrics
    let scale = 'auto';
    if (app.selectedViz == 'ALOS' || app.selectedViz == 'TSPD') {
      scale = maxHeight;
    }

    new Morris.Line({
      data: data,
      element: 'longchart',
      hideHover: true,
      labels: [selPeriod],
      lineColors: [app.isAMActive ? '#f66' : '#99f'],
      postUnits: VIZ_INFO[app.selectedViz]['POST_UNITS'],
      xkey: 'year',
      xLabels: 'year',
      xLabelAngle: 45,
      ykeys: ['period'],
      ymax: scale,
    });
  } else {
    let ykey_tmp, lab_tmp;
    if (app.selectedViz == 'ALOS') {
      ykey_tmp = ['art', 'fwy'];
      lab_tmp = ['Arterial', 'Freeway'];
    } else {
      ykey_tmp = ['art'];
      lab_tmp = ['Arterial'];
    }
    new Morris.Line({
      data: _aggregateData[app.selectedViz][selPeriod],
      element: 'longchart',
      gridTextColor: '#aaa',
      hideHover: true,
      labels: lab_tmp,
      lineColors: ['#f66', '#99f'],
      postUnits: VIZ_INFO[app.selectedViz]['POST_UNITS'],
      xkey: 'year',
      xLabels: 'year',
      xLabelAngle: 45,
      ykeys: ykey_tmp,
      ymax: app.selectedViz == 'TSPD' ? 20 : 'auto',
    });
  }
}

function pickAM(thing) {
  selPeriod = 'AM';
  app.isAMActive = true;
  app.isPMActive = false;

  drawMapSegments();
  highlightSelectedSegment();
  showVizChartForSelectedSegment();
}

function pickPM(thing) {
  selPeriod = 'PM';
  app.isAMActive = false;
  app.isPMActive = true;

  drawMapSegments();
  highlightSelectedSegment();
  showVizChartForSelectedSegment();
}

function sliderChanged(thing) {
  drawMapSegments();
  highlightSelectedSegment();
}

function clickViz(chosenviz) {
  app.selectedViz = chosenviz;
  app.chartTitle = VIZ_INFO[chosenviz]['CHARTINFO'];

  data_view = VIZ_INFO[chosenviz]['VIEW'];
  selviz_metric = VIZ_INFO[chosenviz]['METRIC'];

  drawMapSegments();

  if (_selectedGeo) {
    showVizChartForSelectedSegment();
    // showSegmentDetails(_selectedGeo, _selectedLatLng);
    highlightSelectedSegment();
  } else {
    buildChartHtmlFromCmpData();
  }
}

// fetch the year details in data
function updateSliderData() {
  let yearlist = [];
  fetch(API_SERVER + data_view + '?select=year')
    .then(resp => resp.json())
    .then(function(jsonData) {
      for (let entry of jsonData) {
        if (!yearlist.includes(entry.year)) yearlist.push(entry.year);
      }
      yearlist = yearlist.sort();
      app.timeSlider.data = yearlist;
      app.sliderValue = yearlist[yearlist.length - 1];
    });
}

// SLIDER ----
let timeSlider = {
  clickable: true,
  data: [0],
  direction: 'horizontal',
  disabled: false,
  dotSize: 16,
  eventType: 'auto',
  height: 3,
  labelStyle: { color: '#ccc' },
  labelActiveStyle: { color: '#ccc' },
  lazy: false,
  piecewise: true,
  piecewiseLabel: false,
  realTime: false,
  reverse: false,
  show: true,
  sliderValue: 0,
  speed: 0.25,
  style: { marginTop: '0px', marginBottom: '40px' },
  tooltip: 'always',
  tooltipDir: 'bottom',
  tooltipStyle: { backgroundColor: '#eaae00', borderColor: '#eaae00' },
  width: 'auto',
  piecewiseStyle: {
    backgroundColor: '#ccc',
    visibility: 'visible',
    width: '6px',
    height: '6px',
  },
  piecewiseActiveStyle: {
    backgroundColor: '#ccc',
    visibility: 'visible',
    width: '6px',
    height: '6px',
  },
  processStyle: {
    backgroundColor: '#ffc',
  },
};

let app = new Vue({
  el: '#panel',
  delimiters: ['${', '}'],
  data: {
    isPanelHidden: false,
    chartTitle: VIZ_INFO[VIZ_LIST[0]].CHARTINFO,
    chartSubtitle: aggdata_label,
    isAMActive: true,
    isPMActive: false,
    selectedViz: VIZ_LIST[0],
    sliderValue: 0,
    timeSlider: timeSlider,
    vizlist: VIZ_LIST,
    vizinfo: VIZ_INFO,
  },
  watch: {
    sliderValue: sliderChanged,
  },
  methods: {
    pickAM: pickAM,
    pickPM: pickPM,
    clickToggleHelp: clickToggleHelp,
    clickedShowHide: clickedShowHide,
    clickViz: clickViz,
  },
  components: {
    vueSlider,
  },
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
  for (let delay of [50, 100, 150, 200, 250, 300, 350, 400, 450, 500]) {
    setTimeout(function() {
      mymap.invalidateSize()
    }, delay)
  }
}

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

// this to get the year list directly from the database
// so if database view get updated with new data, the slider data will reflect it too
initialPrep();
