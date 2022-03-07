

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
const GEO_VIEW = 'cmp_segments_exp';
const VIZ_LIST = ['ASPD','SPDIFFPCT','VMT','VMTDIFFPCT'];
const VIZ_INFO = {
  ASPD: {
    TXT: 'Auto Level-of-Service (LOS)',
    VIEW: 'inrix_rt_weekly_exp',
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
    TXT: 'Speed Change Relative to Pre-COVID',
    VIEW: 'inrix_rt_weekly_exp',
    METRIC: 'pct_diff',
    METRIC_DESC: 'Pct Speed Change',
    COLOR_BY_BINS: true,
    COLORVALS: [-50, 0, 10, 20, 30, 500],
    COLORS: ['#3f324f', '#963d8e', '#d55175', '#f2ad86', '#ffffcc'],
    CHARTINFO: 'AUTO SPEED TREND (MPH):',
    CHART_PREC: 1,
    POST_UNITS: '%',
  },
  SPDIFF: {
    TXT: 'Absolute Speed Change from Pre-COVID',
    VIEW: 'inrix_rt_weekly_exp',
    METRIC: 'spd_diff',
    METRIC_DESC: 'Speed Change',
    COLOR_BY_BINS: true,
    COLORVALS: [-50, 0, 2, 4, 6, 8, 500],
    COLORS: ['#c00', '#f60', '#f90', '#ff3', '#9f0', '#060'],
    CHARTINFO: 'AUTO SPEED TREND (MPH):',
    CHART_PREC: 1,
    POST_UNITS: ' mph',
  },
  VMT: {
    TXT: 'Vehicle Miles Traveled (VMT)',
    VIEW: 'inrix_rt_weekly_exp',
    METRIC: 'imp_vol',
    METRIC_DESC: 'Daily VMT per mile',
    COLOR_BY_BINS: true,
    COLORVALS: [0, 20000, 40000, 60000, 80000, 200000],
    COLORS: ['#ffffcc', '#f2ad86', '#d55175', '#963d8e', '#3f324f'],
    CHARTINFO: 'DAILY VMT:',
    CHART_PREC: 1,
    POST_UNITS: '',
  },
  VMTDIFFPCT: {
    TXT: 'VMT Change Relative to Pre-COVID',
    VIEW: 'inrix_rt_weekly_exp',
    METRIC: 'pct_voldiff',
    METRIC_DESC: 'Pct VMT Change',
    COLOR_BY_BINS: true,
    COLORVALS: [-5000, -15, -10, -5, 0, 5000],
    COLORS: ['#ffffcc', '#f2ad86', '#d55175', '#963d8e', '#3f324f'],
    CHARTINFO: 'DAILY VMT:',
    CHART_PREC: 1,
    POST_UNITS: '%',
  },  
};
const MISSING_COLOR = '#ccd';
const hourLabels = ['12 AM','1 AM','2 AM', '3 AM','4 AM','5 AM','6 AM','7 AM',
                  '8 AM','9 AM','10 AM','11 AM',
                  'Noon','1 PM','2 PM','3 PM',
                  '4 PM','5 PM','6 PM','7 PM',
                  '8 PM','9 PM','10 PM','11 PM'];

let init_selectedViz = VIZ_LIST[0];

let data_view = VIZ_INFO[init_selectedViz]['VIEW'];
let selviz_metric = VIZ_INFO[init_selectedViz]['METRIC'];
let selPeriod = 'AM';
let aggdata_view = 'inrix_rt_weekly_exp_agg';
let hrdata_view = 'inrix_rt_hourly_exp';
let hr_aggdata_view = 'inrix_rt_hourly_exp_agg';
let aggdata_label = 'All Segments Combined';
let selGeoId;

let geoLayer, mapLegend;
let selMetricData;
let popHoverSegment, popSelSegment;
let selectedSegment, prevselectedSegment;

let _segmentJson;
let _allCmpData;
let _aggregateData;
let _hrData;
let _hrAggData;

async function initialPrep() {

  console.log('1...');
  _segmentJson = await fetchCmpSegments();

  console.log('2...');
  _allCmpData = await fetchAllCmpSegmentData(data_view);

  console.log('3...');
  _aggregateData = await fetchAggregateData(aggdata_view);
  
  console.log('4...');
  _hrAggData = await fetchHrAggData(hr_aggdata_view);

  console.log('5... ');
  await buildChartHtmlFromCmpData();

  console.log('6...');
  await updateSliderData();

  console.log('7 !!!');
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

async function fetchAllCmpSegmentData(dat_view) {
  //FIXME this should be a map()
  let params =
    'select=cmp_segid,year,date,period,los_hcm85,avg_speed,imp_vol,base_speed,spd_diff,pct_diff,base_vol,vol_diff,pct_voldiff';

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
  
  let data;
  if (viz=='VMT') {
	// Push AM data
	data = [];
	for (let date of Object.keys(byYearAM).sort()) {
		data.push({
			date: date,
			Citywide: byYearAM[date]['Citywide'],
		});
	}
	buildAggData[viz]['AM'] = data;

	// Push PM data
	data = [];
	for (let date of Object.keys(byYearPM).sort()) {
		data.push({
			date: date,
			Citywide: byYearPM[date]['Citywide'],
		});
	}
	buildAggData[viz]['PM'] = data;	  
  } else {
	// Push AM data
	data = [];
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

}

async function fetchHourlyData() {
  let params =
    'select=cmp_segid,year,date,period,los_hcm85,avg_speed,base_speed,spd_diff,pct_diff';

  let data_url = API_SERVER + hrdata_view + '?' + params + '&date=eq.' + app.sliderValue;

  selMetricData = {};

  try {
    let resp = await fetch(data_url);
    return await resp.json();

  } catch (error) {console.log('hourly data fetch error: ' + error);}
}

async function fetchHrAggData(aggdat_view) {
  let buildAggData = {};

  const url = API_SERVER + aggdat_view
    + '?select=fac_typ,period,date,viz,metric';

  try {
    let resp = await fetch(url);
    let jsonData = await resp.json();

    for (let viz of VIZ_LIST) {
      parseHrAggregateData(buildAggData, jsonData, viz);
    }
    return buildAggData;

  } catch(error) {
    console.log('hourly aggregate data error: ' + error);
  }
}

async function parseHrAggregateData(buildAggData, jsonData, viz) {
  buildAggData[viz] = {};

  let vizData = jsonData.filter(row => row['viz'] === viz);

  let byDate = {};
  for (let entry of vizData) {
    let val = Number(entry.metric).toFixed(
      VIZ_INFO[viz]['CHART_PREC']
    );
    if (val === 'NaN') continue;
    let hour = parseInt(entry.period)
    if (!byDate[entry.date]) {
        byDate[entry.date] = {};
        byDate[entry.date][hour] = {};
    } else if (!byDate[entry.date][hour]) {
        byDate[entry.date][hour] = {};
    }        
    byDate[entry.date][hour][entry.fac_typ] = val;
  }
  
  let data;
  for (let date of Object.keys(byDate).sort()) {
    data = [];
    for (let tod of Object.keys(byDate[date]).map(i=>Number(i)).sort(function (a,b) { return a-b; })) {
      data.push({
        tod: hourLabels[tod],
        art: byDate[date][tod]['Arterial'],
        fwy: byDate[date][tod]['Freeway'],
      });
    }
    buildAggData[viz][date] = data;
  }
}

// hover panel -------------------
let infoPanel = L.control();

infoPanel.onAdd = function(map) {
  // create a div with a class "info"
  this._div = L.DomUtil.create('div', 'info-panel-hide');
  return this._div;
};

function getInfoHtml(geo) {
  let retval = `<b>${geo.cmp_name} ${geo.direction}-bound</b><br/>` +
                `${geo.cmp_from} to ${geo.cmp_to}<br/><hr>`;
  
  if (app.selectedViz == 'VMT') {
    let metric_val = 0;
    if (geo.metric !== null) metric_val = (Math.round(geo.metric)).toLocaleString();
	retval += `<b> ${VIZ_INFO[app.selectedViz]['METRIC_DESC']}: </b>` + `${metric_val}` + VIZ_INFO[app.selectedViz]['POST_UNITS'];
  }
  
  if (app.selectedViz != 'ASPD' && app.selectedViz != 'VMT') {
	let base_col, comp_col, base_desc, comp_desc, units, num_dec;
	if (app.selectedViz == 'SPDIFFPCT') {
		base_col = 'base_speed';
		comp_col = 'avg_speed';
		base_desc = 'Base Speed';
		comp_desc = 'Average Speed';
		units = 'mph';
		num_dec = 100;
	} else if (app.selectedViz == 'VMTDIFFPCT') {
		base_col = 'base_vol';
		comp_col = 'imp_vol';
		base_desc = 'Base VMT';
		comp_desc = 'Average VMT';
		units = '';
		num_dec = 1;		
	}
    let base_val = null;
    if (geo[base_col] !== null) base_val = (Math.round(geo[base_col]*num_dec)/num_dec).toLocaleString();
    let comp_val = null;
    if (geo[comp_col] !== null) comp_val = (Math.round(geo[comp_col]*num_dec)/num_dec).toLocaleString();
    let metric_val = 0;
    if (geo.metric !== null) metric_val = (Math.round(geo.metric*100)/100).toLocaleString();
    
    retval += '<b> ' + base_desc + ' (pre-covid): </b>' + `${base_val}` + units + '<br/>' +
              '<b> ' + comp_desc + ' (week of ' + `${app.sliderValue.slice(5)}` +  '): </b>' + `${comp_val}` + units + '<br/>' +
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
    if (oldHoverTarget.feature.cmp_segid != selGeoId) geoLayer.resetStyle(oldHoverTarget);
  }, 2000);
};
infoPanel.addTo(mymap);

async function drawMapSegments(dateChanged=true) {

  // create a clean copy of the segment Json
  let cleanSegments = _segmentJson.slice();
  
  let relevantRows;
  let lookup = {};
  if ((app.isHRActive) && (['ASPD','SPDIFFPCT'].includes(app.selectedViz))) {
      if (dateChanged || _hrData==null) {
        _hrData = await fetchHourlyData();  
      }
      relevantRows = _hrData.filter(row => row.period===String(app.hrValue));
      for (let row of relevantRows) {
        lookup[row.cmp_segid] = row;
      }
      
      // update metric-colored segment data
      for (let segment of cleanSegments) {
        if (lookup[segment.cmp_segid]) {
          segment['metric'] = lookup[segment.cmp_segid][selviz_metric];
          segment['base_speed'] = lookup[segment.cmp_segid]['base_speed'];
          segment['avg_speed'] = lookup[segment.cmp_segid]['avg_speed'];
        } else {
          segment['metric'] = null;
          segment['base_speed'] = null;
          segment['avg_speed'] = null;
        }
      }      
  } else {
      if ((['VMT','VMTDIFFPCT'].includes(app.selectedViz)) && (app.isHRActive)) app.pickAM('AM');
      relevantRows = _allCmpData.filter(row => row.date==app.sliderValue && row.period===selPeriod);
      for (let row of relevantRows) {
        lookup[row.cmp_segid] = row;
      }
      
      // update metric-colored segment data
      for (let segment of cleanSegments) {
        if (lookup[segment.cmp_segid]) {
          segment['metric'] = lookup[segment.cmp_segid][selviz_metric];
          segment['base_speed'] = lookup[segment.cmp_segid]['base_speed'];
          segment['avg_speed'] = lookup[segment.cmp_segid]['avg_speed'];
          segment['base_vol'] = lookup[segment.cmp_segid]['base_vol'];
          segment['imp_vol'] = lookup[segment.cmp_segid]['imp_vol'];
        } else {
          segment['metric'] = null;
          segment['base_speed'] = null;
          segment['avg_speed'] = null;
          segment['base_vol'] = null;
          segment['imp_vol'] = null;
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
  highlightedGeo.setStyle(styles.selected);
  oldHoverTarget = e.target;
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
        popSelSegment.setContent(getInfoHtml(e.feature));
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
    app.chartSubtitle = (app.selectedViz == 'VMT' || app.selectedViz == 'VMTDIFFPCT') ? 'Citywide (millions)' : aggdata_label;
    prevselectedSegment = selectedSegment = selGeoId = _selectedGeo = null;
    buildChartHtmlFromCmpData();
  });

  showVizChartForSelectedSegment();
}

// Show chart (filter json results for just the selected segment)
function showVizChartForSelectedSegment() {
  let metric_col = selviz_metric;
  // show actual speeds in chart, not A-F LOS categories
  if ((selviz_metric == 'los_hcm85') || (selviz_metric == 'pct_diff')) metric_col = 'avg_speed';
  if ((selviz_metric == 'imp_vol') || (selviz_metric == 'pct_voldiff')) metric_col = 'imp_vol';

  if (_selectedGeo) {
    let segmentData;
    if (app.isHRActive) {
      segmentData = _hrData
        .filter(row => row.cmp_segid == _selectedGeo.cmp_segid)
        .filter(row => row.date == app.sliderValue)
        .filter(row => row[metric_col] != null);        
    } else {
      segmentData = _allCmpData
        .filter(row => row.cmp_segid == _selectedGeo.cmp_segid)
        .filter(row => row[metric_col] != null);
    }
    
    buildChartHtmlFromCmpData(segmentData);
	
	let tmptxt = `${_selectedGeo.cmp_name} ${_selectedGeo.direction}-bound`;
	app.chartSubtitle = `${tmptxt} [${_selectedGeo.cmp_from} to ${_selectedGeo.cmp_to}]`;
  } else {
    buildChartHtmlFromCmpData();
	app.chartSubtitle = (app.selectedViz == 'VMT' || app.selectedViz == 'VMTDIFFPCT') ? 'Citywide (millions)' : aggdata_label;
  }
}

function buildChartHtmlFromCmpData(json = null) {
  document.getElementById('longchart').innerHTML = '';

  if (json) {
    let byYear = {};
    let data = [];
    let maxHeight = 0;

    let metric_col = selviz_metric;
    if ((selviz_metric == VIZ_INFO['ASPD']['METRIC']) || (selviz_metric == VIZ_INFO['SPDIFFPCT']['METRIC']) || (selviz_metric == VIZ_INFO['SPDIFF']['METRIC']))
      metric_col = 'avg_speed';
    if ((selviz_metric == VIZ_INFO['VMT']['METRIC']) || (selviz_metric == VIZ_INFO['VMTDIFFPCT']['METRIC']))
      metric_col = 'imp_vol';
    
    for (let entry of json) {
      let val = Number(entry[metric_col]).toFixed(
        VIZ_INFO[app.selectedViz]['CHART_PREC']
      );
      if (val === 'NaN') continue;
      
      if (app.isHRActive) {
        byYear[entry.period] = val;  
      } else {
        if (!byYear[entry.date]) byYear[entry.date] = {};
        byYear[entry.date][entry.period] = val;
      }
    }
    if (app.isHRActive) {
        for (let tod of Object.keys(byYear).map(i=>Number(i)).sort(function (a,b) { return a-b; })) {
          data.push({tod: hourLabels[tod], period: byYear[tod]});
          maxHeight = Math.max(maxHeight, byYear[tod]);
      }  
    } else {
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
    }
        

    // scale ymax to either 30 or 70:
    maxHeight = maxHeight <= 30 ? 30 : maxHeight <= 70 ? 70 : Math.round(maxHeight/100)*100;

    // use maxHeight for ASPD and SPDIFF; use auto for other metrics
    let scale = 'auto';
    /*if (app.selectedViz == 'ASPD' || app.selectedViz == 'SPDIFF') {
      scale = maxHeight;
    }*/
    scale = maxHeight;
	
	let lab_tmp, col_tmp;
	lab_tmp = selPeriod;
	col_tmp = app.isAMActive ? '#f66' : '#99f';
	if (app.selectedViz == 'VMT' || app.selectedViz == 'VMTDIFFPCT') {
		lab_tmp = 'Daily';
		col_tmp = '#99f';
	}
    if (app.isHRActive) {
      new Morris.Area({
        data: data,
        element: 'longchart',
        hideHover: true,
        labels: ['speed'],
        lineColors: ['#1fc231'],
        fillOpacity: 0.4,
        xkey: 'tod',
        xLabelAngle: 45,
        ykeys: ['period'],
        ymax: scale,
        parseTime: false,
        pointSize: 2,
      });        
    } else {
      new Morris.Line({
        data: data,
        element: 'longchart',
        hideHover: true,
        labels: [lab_tmp],
        lineColors: [col_tmp],
        xkey: 'date',
        xLabelAngle: 45,
        ykeys: ['period'],
        ymax: scale,
        parseTime: false,
        pointSize: 2,
      });
    }
    
  } else {
    let ykey_tmp, lab_tmp, col_tmp, viz_tmp,ymax_tmp;
    ykey_tmp = ['art', 'fwy'];
    lab_tmp = ['Arterial', 'Freeway'];
	col_tmp = ['#f66', '#99f'];
	viz_tmp = 'ASPD';
	ymax_tmp = 70;
	if (app.selectedViz == 'VMT' || app.selectedViz == 'VMTDIFFPCT') {
		ykey_tmp = ['Citywide'];
		lab_tmp = ['Citywide'];
		col_tmp = ['#99f'];
		viz_tmp = 'VMT';
		ymax_tmp = 12;
	}
    new Morris.Line({
      data: app.isHRActive? _hrAggData[viz_tmp][app.sliderValue]: _aggregateData[viz_tmp][selPeriod],
      element: 'longchart',
      gridTextColor: '#aaa',
      hideHover: true,
      labels: lab_tmp,
      lineColors: col_tmp,
      //postUnits: VIZ_INFO['ASPD']['POST_UNITS'],
      xkey: app.isHRActive? 'tod': 'date',
      xLabelAngle: 45,
      ykeys: ykey_tmp,
      ymax: ymax_tmp,
      parseTime: false,
      pointSize: 2,
    });   
  }
}

function pickAM(thing) {
  selPeriod = 'AM';
  app.isAMActive = true;
  app.isPMActive = false;
  app.isHRActive = false;

  drawMapSegments();
  highlightSelectedSegment();
  showVizChartForSelectedSegment();
}

function pickPM(thing) {
  selPeriod = 'PM';
  app.isAMActive = false;
  app.isPMActive = true;
  app.isHRActive = false;

  drawMapSegments();
  highlightSelectedSegment();
  showVizChartForSelectedSegment();
}

async function pickHR(thing) {
  selPeriod = 'HR';
  app.isAMActive = false;
  app.isPMActive = false;
  app.isHRActive = true;

  await drawMapSegments();
  highlightSelectedSegment();
  showVizChartForSelectedSegment();
}

async function sliderChanged(thing) {
  await drawMapSegments();
  highlightSelectedSegment();
  if (app.isHRActive) showVizChartForSelectedSegment();
}

function hrChanged(thing) {
  killTimeouts();
  if (app.isPlayTODActive) {playTOD();}
  drawMapSegments(false);
  highlightSelectedSegment();
}

async function clickViz(chosenviz) {
  app.selectedViz = chosenviz;
  if (chosenviz=='VMT' || chosenviz=='VMTDIFFPCT') {
	  app.isTPHidden = true;
	  app.chartSubtitle = 'Citywide (millions)';
  } else {
	  app.isTPHidden = false;
	  app.chartSubtitle = aggdata_label;
  }

  app.chartTitle = VIZ_INFO[chosenviz]['CHARTINFO'];
  data_view = VIZ_INFO[chosenviz]['VIEW'];
  selviz_metric = VIZ_INFO[chosenviz]['METRIC'];

  await drawMapSegments();

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

// Store timeout IDs. 
var timeouts = []; 

function killTimeouts() {
  for (var i=0; i < timeouts.length; i++) {
      clearTimeout(timeouts[i]);
  }
  timeouts = [];
}
function clickTODPlay() {
  app.isPlayTODActive = !app.isPlayTODActive;
  killTimeouts();
  if (app.isPlayTODActive) {playTOD();}
}

function playTOD() {
  var delay = 1500; 
  var hr = app.hrValue+1; 
  if (hr==24) {hr=0;}; 

  timeouts.push(setTimeout(function(){app.hrValue = hr}, delay))
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

let hrSlider = {
  min: 0,
  max: 23,
  clickable: true,
  dotSize: 12,
  eventType: 'auto',
  height: 2,
  lazy: false,
  marks: true,
  hideLabel: true,
  process: false,
  speed: 0.25,
  style: { marginTop: '0px', marginBottom: '40px' },
  tooltip: 'always',
  tooltipPlacement: 'bottom',
  tooltipStyle: { backgroundColor: '#eaae00', borderColor: '#eaae00', fontSize: '12px' },
  tooltipFormatter: idx => hourLabels[idx],
  width: 'auto',
  dotStyle: {border: '2px solid #eaae00'},
};

let app = new Vue({
  el: '#panel',
  delimiters: ['${', '}'],
  data: {
    isPanelHidden: false,
	isTPHidden: false,
    chartTitle: VIZ_INFO[VIZ_LIST[0]].CHARTINFO,
    chartSubtitle: aggdata_label,
    isAMActive: true,
    isPMActive: false,
    isHRActive: false,
    isPlayTODActive: false,
    selectedViz: VIZ_LIST[0],
    sliderValue: 0,
    timeSlider: timeSlider,
    hrValue: 8,
    hrSlider: hrSlider,
    vizlist: VIZ_LIST,
    vizinfo: VIZ_INFO,
  },
  watch: {
    sliderValue: sliderChanged,
    hrValue: hrChanged,
  },
  methods: {
    pickAM: pickAM,
    pickPM: pickPM,
    pickHR: pickHR,
    clickToggleHelp: clickToggleHelp,
    clickedShowHide: clickedShowHide,
    clickViz: clickViz,
    clickTODPlay: clickTODPlay,
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
