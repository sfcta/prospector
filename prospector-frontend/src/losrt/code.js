

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
let getLegHTML = maplib.getLegHTML2;
let getColorFromVal = maplib.getColorFromVal2;
let mymap = maplib.sfmap;
mymap.setView([37.76889, -122.440997], 13);

// some important global variables.
const API_SERVER = 'https://api.sfcta.org/api/';
const GEO_VIEW = 'sf_xd_2001_agg';
const VIZ_LIST = ['ASPD','SPDIFFPCT','SPDIFF'];
const GEOID_VAR = 'seg_id';
const VIZ_INFO = {
  ASPD: {
    TXT: 'Auto Level-of-Service (LOS)',
    VIEW: 'inrix_rt_weekly_allxd',
    METRIC: 'los_hcm85',
    METRIC_DESC: 'Level of Service',
    COLOR_BY_BINS: false,
    COLORVALS: ['A', 'B', 'C', 'D', 'E', 'F'],
    COLORS: ['#060', '#9f0', '#ff3', '#f90', '#f60', '#c00'],
    CHARTINFO: 'AUTO SPEED TREND (MPH):',
    CHART_PREC: 1,
    POST_UNITS: '',
  },
  SPDIFFPCT: {
    //TXT: 'Speed Change Relative to Pre-COVID',
	TXT: 'Relative Speed Change from Pre-COVID',
    VIEW: 'inrix_rt_weekly_allxd',
    METRIC: 'pct_diff',
    METRIC_DESC: 'Pct Speed Change',
    COLOR_BY_BINS: true,
    COLORVALS: [-50, 0, 5, 10, 15, 500],
	COLORS: ["#990D35", "#D52941", "#FF9811", "#FCD581", "#FFFCCC"],
    CHARTINFO: 'AUTO SPEED TREND (MPH):',
    CHART_PREC: 1,
    POST_UNITS: '%',
  },
  SPDIFF: {
    TXT: 'Absolute Speed Change from Pre-COVID',
    VIEW: 'inrix_rt_weekly_allxd',
    METRIC: 'spd_diff',
    METRIC_DESC: 'Speed Change',
    COLOR_BY_BINS: true,
    COLORVALS: [-500, 0, 1, 2, 3, 500],
    COLORS: ["#990D35", "#D52941", "#FF9811", "#FCD581", "#FFFCCC"],
    CHARTINFO: 'AUTO SPEED TREND (MPH):',
    CHART_PREC: 1,
    POST_UNITS: ' mph',
  },
};
const MISSING_COLOR = '#ccd';

let init_selectedViz = VIZ_LIST[0];

let data_view = VIZ_INFO[init_selectedViz]['VIEW'];
let selviz_metric = VIZ_INFO[init_selectedViz]['METRIC'];
let selPeriod = 'AM';
let aggdata_view = 'inrix_rt_weekly_allxd_agg';
let aggdata_label = 'All Segments Combined';
let selGeoId;

let geoLayer, mapLegend;
let selMetricData;
let popHoverSegment, popSelSegment;
let selectedSegment, prevselectedSegment;

let _segmentJson;
let _allCmpData;
let _aggregateData;
let _diffData;

async function initialPrep() {

  console.log('1...');
  _segmentJson = await fetchCmpSegments();

  console.log('2...');
  _allCmpData = await fetchAllCmpSegmentData(data_view);

  console.log('3...');
  _aggregateData = await fetchAggregateData(aggdata_view);

  console.log('4... ');
  await buildChartHtmlFromCmpData();

  console.log('5...');
  await updateSliderData();

  console.log('6 !!!');
}

async function fetchCmpSegments() {
  const geo_url = API_SERVER + GEO_VIEW +
    '?select=geometry,xdsegid,roadname,frc,bearing,miles';

  try {
    let resp = await fetch(geo_url);
    let segments = await resp.json();

    // do some parsing and stuff
    for (let segment of segments) {
      segment['type'] = 'Feature';
      segment['geometry'] = JSON.parse(segment.geometry);
	  segment[GEOID_VAR] = segment.xdsegid;
    }
    return segments;

  } catch (error) {
    console.log('map segment error: ' + error);
  }
}

async function fetchAllCmpSegmentData(dat_view) {
  //FIXME this should be a map()
  let params =
    'select=seg_id,year,date,period,los_hcm85,avg_speed,base_speed,spd_diff,pct_diff';

  let data_url = API_SERVER + dat_view + '?' + params;

  selMetricData = {};

  try {
    let resp = await fetch(data_url);
    return await resp.json();

  } catch (error) {console.log('cmp data fetch error: ' + error);}
}

async function fetchAggregateData(aggdat_view) {
  let buildAggData = {};

  const url = API_SERVER + aggdat_view
    + '?select=fac_typ,period,date,viz,metric';

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

async function fetchDiffData(diffdat_view) {

  const url = API_SERVER + diffdat_view;

  try {
    let resp = await fetch(url);
    return await resp.json();
    
  } catch(error) {
    console.log('diff data error: ' + error);
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
      if (!byYearAM[entry.date]) byYearAM[entry.date] = {};
      byYearAM[entry.date][entry.fac_typ] = val;
    } else {
      if (!byYearPM[entry.date]) byYearPM[entry.date] = {};
      byYearPM[entry.date][entry.fac_typ] = val;
    }
  }

  // Push AM data
  let data = [];
  for (let date of Object.keys(byYearAM).sort()) {
    data.push({
      date: date,
      art: byYearAM[date]['Arterial'],
      fwy: byYearAM[date]['Freeway'],
    });
  }
  buildAggData[viz]['AM'] = data;

  // Push PM data
  data = [];
  for (let date of Object.keys(byYearPM).sort()) {
    data.push({
      date: date,
      art: byYearPM[date]['Arterial'],
      fwy: byYearPM[date]['Freeway'],
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

function getInfoHtml(geo) {
  let retval = `<b>${geo.roadname} ${geo.bearing}-bound</b><br/>` +
                'XD SegID: ' + `${geo[GEOID_VAR]}<br/>` +
                'FRC: ' + `${geo.frc}<br/><hr>`;
  if (app.selectedViz != 'ASPD') {
    let base_val = null;
    if (geo.base_speed !== null) base_val = (Math.round(geo.base_speed*100)/100).toLocaleString();
    let comp_val = null;
    if (geo.avg_speed !== null) comp_val = (Math.round(geo.avg_speed*100)/100).toLocaleString();
    let metric_val = 0;
    if (geo.metric !== null) metric_val = (Math.round(geo.metric*100)/100).toLocaleString();
    
    retval += '<b> Base Speed (pre-covid): </b>' + `${base_val}` + ' mph<br/>' +
              '<b> Current Speed: </b>' + `${comp_val}` + ' mph<br/>' +
              `<b> ${VIZ_INFO[app.selectedViz]['METRIC_DESC']}: </b>` + `${metric_val}` + VIZ_INFO[app.selectedViz]['POST_UNITS'];
  }

  return retval;
}

infoPanel.update = function(geo) {
  infoPanel._div.innerHTML = '';
  infoPanel._div.className = 'info-panel';
  if (geo) this._div.innerHTML = getInfoHtml(geo);

  infoPanelTimeout = setTimeout(function() {
    // use CSS to hide the info-panel
    infoPanel._div.className = 'info-panel-hide';
    // and clear the hover too
    if (oldHoverTarget.feature[GEOID_VAR] != selGeoId) geoLayer.resetStyle(oldHoverTarget);
  }, 2000);
};
infoPanel.addTo(mymap);

function drawMapSegments() {

  // create a clean copy of the segment Json
  let cleanSegments = _segmentJson.slice();
  
  let relevantRows;
  relevantRows = _allCmpData.filter(
	row => row.date==app.sliderValue && row.period===selPeriod
  );

  let lookup = {};
  for (let row of relevantRows) {
    lookup[row[GEOID_VAR]] = row;
  };

  // update metric-colored segment data
  for (let segment of cleanSegments) {
    if (lookup[segment[GEOID_VAR]]) {
      segment['metric'] = lookup[segment[GEOID_VAR]][selviz_metric];
      if (app.selectedViz != 'ASPD') {
        segment['base_speed'] = lookup[segment[GEOID_VAR]]['base_speed'];
        segment['avg_speed'] = lookup[segment[GEOID_VAR]]['avg_speed'];
      }
    } else {
      segment['metric'] = null;
      if (app.selectedViz != 'ASPD') {
        segment['base_speed'] = null;
        segment['avg_speed'] = null;
      }
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
  let cmp_id = segment[GEOID_VAR];
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
  if (selGeoId === e.target.feature[GEOID_VAR]) return;

  // return previously-hovered segment to its original color
  if (oldHoverTarget && e.target.feature[GEOID_VAR] != selGeoId) {
    if (oldHoverTarget.feature[GEOID_VAR] != selGeoId)
      geoLayer.resetStyle(oldHoverTarget);
  }

  let highlightedGeo = e.target;
  highlightedGeo.bringToFront();
  highlightedGeo.setStyle(styles.selected);
  oldHoverTarget = e.target;
}

let _selectedGeo;
let _selectedLatLng;

function highlightSelectedSegment() {
  if (!selGeoId) return;

  mymap.eachLayer(function (e) {
    try {
      if (e.feature[GEOID_VAR] === selGeoId) {
        e.setStyle(styles.popup);
        selectedSegment = e;
        popSelSegment.setContent(getInfoHtml(e.feature));
        return;
      }
    } catch(error) {}
  });
}

function clickedOnFeature(e) {
  e.target.setStyle(styles.popup);

  let geo = e.target.feature;
  selGeoId = geo[GEOID_VAR];

  // unselect the previously-selected selection, if there is one
  if (selectedSegment && selectedSegment.feature[GEOID_VAR] != geo[GEOID_VAR]) {
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
    .setContent(infoPanel._div.innerHTML)
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
  //if ((selviz_metric == 'los_hcm85') || (selviz_metric == 'pct_diff')) metric_col = 'avg_speed';
  metric_col = 'avg_speed';

  if (_selectedGeo) {
    let segmentData = _allCmpData
      .filter(row => row[GEOID_VAR] == _selectedGeo[GEOID_VAR])
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

    let metric_col = selviz_metric;
    metric_col = 'avg_speed';
    /*if ((selviz_metric == VIZ_INFO['ASPD']['METRIC']) || (selviz_metric == VIZ_INFO['SPDIFF']['METRIC']))
      metric_col = 'avg_speed';*/
    
    for (let entry of json) {
      let val = Number(entry[metric_col]).toFixed(
        VIZ_INFO[app.selectedViz]['CHART_PREC']
      );
      if (val === 'NaN') continue;
      if (!byYear[entry.date]) byYear[entry.date] = {};
      byYear[entry.date][entry.period] = val;
    }
    for (let date of Object.keys(byYear).sort()) {
      if (app.isAMActive) {
        data.push({date: date, period: byYear[date]['AM']});
      } else {
        data.push({date: date, period: byYear[date]['PM']});
      }

      // use the same scale for am/pm even though we only show one
      if (byYear[date]['AM'])
        maxHeight = Math.max(maxHeight, byYear[date]['AM']);
      if (byYear[date]['PM'])
        maxHeight = Math.max(maxHeight, byYear[date]['PM']);
    }    

    // scale ymax to either 30 or 70:
    maxHeight = maxHeight <= 30 ? 30 : 70;

    // use maxHeight for ASPD and SPDIFF; use auto for other metrics
    let scale = 'auto';
    /*if (app.selectedViz == 'ASPD' || app.selectedViz == 'SPDIFF') {
      scale = maxHeight;
    }*/
    scale = maxHeight;

    new Morris.Line({
      data: data,
      element: 'longchart',
      hideHover: true,
      labels: [selPeriod],
      lineColors: [app.isAMActive ? '#f66' : '#99f'],
      //postUnits: VIZ_INFO[app.selectedViz]['POST_UNITS'],
      xkey: 'date',
      xLabelAngle: 45,
      ykeys: ['period'],
      ymax: scale,
      parseTime: false,
      pointSize: 2,
    });
  } else {
    let ykey_tmp, lab_tmp;
    ykey_tmp = ['art', 'fwy'];
    lab_tmp = ['Arterial', 'Freeway'];
    new Morris.Line({
      data: _aggregateData['ASPD'][selPeriod],
      element: 'longchart',
      gridTextColor: '#aaa',
      hideHover: true,
      labels: lab_tmp,
      lineColors: ['#f66', '#99f'],
      //postUnits: VIZ_INFO['ASPD']['POST_UNITS'],
      xkey: 'date',
      xLabelAngle: 45,
      ykeys: ykey_tmp,
      ymax: 70,
      parseTime: false,
      pointSize: 2,
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

// fetch the date details in data
async function updateSliderData() {
  let datelist = [];
  fetch(API_SERVER + data_view + '?select=date')
    .then(resp => resp.json())
    .then(function(jsonData) {
      for (let entry of jsonData) {
        if (!datelist.includes(entry.date)) datelist.push(entry.date);
      }
      
      datelist = datelist.sort();
      app.timeSlider.data = datelist;
      app.sliderValue = datelist[datelist.length - 1];
    });

  return;
}

// SLIDER ----
let timeSlider = {
  clickable: true,
  data: [0],
  disabled: false,
  dotSize: 16,
  eventType: 'auto',
  height: 3,
  lazy: false,
  marks: true,
  hideLabel: true,
  process: false,
  sliderValue: 0,
  speed: 0.25,
  style: { marginTop: '0px', marginBottom: '40px' },
  tooltip: 'always',
  tooltipPlacement: 'bottom',
  tooltipStyle: { backgroundColor: '#eaae00', borderColor: '#eaae00' },
  width: 'auto',
  dotStyle: {border: '2px solid #eaae00'},
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
    //showHelp: cookieShowHelp == undefined,
    showHelp: false,
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

// this to get the date list directly from the database
// so if database view get updated with new data, the slider data will reflect it too
initialPrep();
