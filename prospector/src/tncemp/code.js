'use strict';

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
const GEO_VIEW = 'tmc_trueshp';
const DATA_VIEW = 'tmcemp';
const EXCLUDE_COLS = ['tmc','geometry','geom','tod','modifiedtmc','scenario'];
const FRAC_COLS = ['champ_link_count','speed_std_dev','tnc_pickups','tnc_dropoffs','tnc_pickups_avg','tnc_dropoffs_avg','tnc_pudo_avg',
                  'tt','ff_time','inrix_time','tnc_pudo','speed',
                  'vht','vhd','obs_vht','obs_vhd','delay_per_mile',
                  'obs_tti','obs_pti80','obs_bti80','obs_pti95','obs_bti95','tti','pti80','bti80','pti95','bti95'];
const INT_COLS = ['dt'];
const DISCRETE_VAR_LIMIT = 10;

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

let sel_colorvals, sel_colors, sel_binsflag;
let init_selected_metric = 'delay_per_mile';
let metric_options_all, metric_options_daily; 
let daily_metric_list = ['vhd','vmt','vht','pcemt','vol','inrix_vol','obs_vhd','obs_vht','fixed_effects',
                          'tnc_tot_vol','tnc_inserv_avg_vol','tnc_outserv_avg_vol','tnc_pickups','tnc_dropoffs',
                          'tnc_pudo','tnc_pudo_avg','tnc_pickups_avg','tnc_dropoffs_avg',
                          'tnc_pickups_per_mile','tnc_dropoffs_per_mile','tnc_pudo_per_mile'];

let init_selectedViz = VIZ_LIST[0];
let data_view = VIZ_INFO[init_selectedViz]['VIEW'];
let selviz_metric = VIZ_INFO[init_selectedViz]['METRIC'];
let selPeriod = 'AM';
let aggdata_view = 'cmp_aggregate';
let aggdata_label = 'All Segments Combined';
let selGeoId;

let geoLayer, mapLegend;
let yearData = {};
let popHoverSegment, popSelSegment;
let selectedSegment, prevselectedSegment;

let _featJson;
let _allCmpData;
let _aggregateData;
let prec;

async function initialPrep() {

  console.log('1...');
  _featJson = await fetchMapFeatures();

  console.log('2...');
  _allCmpData = await fetchAllCmpSegmentData();

  console.log('3...');
  _aggregateData = await fetchAggregateData();

  console.log('4... ');
  //await buildChartHtmlFromCmpData();

  console.log('5...');
  app.scen_options = await updateOptionsData('scenario');
  app.time_options = await updateOptionsData('tod');
  
  console.log('6...');
  await getMetricOptions();
 
  console.log('7 !!!');
}

async function fetchMapFeatures() {
  const geo_url = API_SERVER + GEO_VIEW + '?select=tmc,geometry';

  try {
    let resp = await fetch(geo_url);
    let features = await resp.json();

    // do some parsing and stuff
    for (let feat of features) {
      feat['type'] = 'Feature';
      feat['geometry'] = JSON.parse(feat.geometry);
    }
    return features;

  } catch (error) {
    console.log('map feature error: ' + error);
  }
}

async function fetchAllCmpSegmentData() {
  //FIXME this should be a map()
  let params =
    'select=cmp_segid,year,period,los_hcm85,transit_speed,transit_cv,atspd_ratio,auto_speed';

  let data_url = API_SERVER + data_view + '?' + params;

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
  let metric_val = null;
  if (geo.metric !== null) metric_val = Math.round(geo.metric*100)/100;
  if (geo) {
    this._div.innerHTML =
      '<b>TMC ID: </b>' + `${geo.tmc}<br/>` +
      `<b>${app.selected_metric.toUpperCase()}</b>` + 
      (app.pct_check? '<b> PCT_DIFF: </b>':'<b>: </b>') + 
      `${metric_val}` + 
      ((app.pct_check && app.comp_check && metric_val !== null)? '%':'');
  }

  infoPanelTimeout = setTimeout(function() {
    // use CSS to hide the info-panel
    infoPanel._div.className = 'info-panel-hide';
    // and clear the hover too
    geoLayer.resetStyle(oldHoverTarget);
  }, 2000);
};
infoPanel.addTo(mymap);

async function getMapData(scen) {
  let data_url = API_SERVER + DATA_VIEW + '?select=tmc,scenario,' + app.selected_metric + 
                '&tod=eq.' + app.selected_timep;
  let resp = await fetch(data_url);
  let jsonData = await resp.json();
  jsonData = jsonData.filter(row => row['scenario'] === scen);
  let lookup = {};
  for (let entry of jsonData) {
        lookup[entry.tmc] = entry;
  }
  return lookup;
}

let base_lookup, comp_lookup;
let map_vals;
async function drawMapFeatures(queryMapData=true) {

  // create a clean copy of the feature Json
  let cleanFeatures = _featJson.slice();
  let sel_metric = app.selected_metric;
  
  try {
    if (queryMapData) {
      app.custom_check = false;
      base_lookup = await getMapData(app.selected_scenario);
      if (app.comp_check) {
        comp_lookup = await getMapData(app.selected_comp_scenario);
      }
      
      let map_metric;
      map_vals = [];
      for (let feat of cleanFeatures) {
        feat['metric'] = null;
        if (app.comp_check) {
          if (base_lookup.hasOwnProperty(feat.tmc) && comp_lookup.hasOwnProperty(feat.tmc)) {
            map_metric = comp_lookup[feat.tmc][sel_metric] - base_lookup[feat.tmc][sel_metric];
            if (app.pct_check && app.comp_check) {
              if (base_lookup[feat.tmc][sel_metric]>0) {
                map_metric = map_metric*100/base_lookup[feat.tmc][sel_metric];
              } else {
                map_metric = null;
              }
            }
            feat['metric'] = map_metric;
            map_vals.push(map_metric);
          }
        } else {
          if (base_lookup.hasOwnProperty(feat.tmc)) {
            map_metric = base_lookup[feat.tmc][sel_metric];
            feat['metric'] = map_metric;
            map_vals.push(map_metric);
          }
        }
      }
      map_vals = map_vals.sort((a, b) => a - b);      
    }
    
    if (map_vals.length > 0) {
      let color_func;
      let sel_colorvals2;
      
      if (queryMapData) {
        sel_colorvals = Array.from(new Set(map_vals)).sort((a, b) => a - b);
        
        //calculate distribution
        let x = d3.scaleLinear()
                .domain([map_vals[0], map_vals[map_vals.length-1]])
        let numticks = 20;
        if (sel_colorvals.length <= DISCRETE_VAR_LIMIT || INT_COLS.includes(sel_metric)) numticks = sel_colorvals.length;
        let histogram = d3.histogram()
            .domain(x.domain())
            .thresholds(x.ticks(numticks));
        updateDistChart(histogram(map_vals));

        
        if (sel_colorvals.length <= DISCRETE_VAR_LIMIT || INT_COLS.includes(sel_metric)) {
          sel_binsflag = false;
          color_func = chroma.scale(app.selected_colorscheme).mode(getColorMode(app.selected_colorscheme)).classes(sel_colorvals.concat([sel_colorvals[sel_colorvals.length-1]+1]));
          sel_colorvals2 = sel_colorvals.slice(0);
          app.custom_disable = true;
        } else{
          app.custom_disable = false;
          sel_colorvals = [];
          prec = (FRAC_COLS.includes(sel_metric) ? 100 : 1);
          for(var i = 1; i <= app.selected_breaks; i++) {
            sel_colorvals.push(Math.round(map_vals[Math.floor(map_vals.length*1/i)-1]*prec)/prec);
          }
          sel_colorvals.push(Math.round(map_vals[0]*prec)/prec); 
          
          let bp = Array.from(sel_colorvals).sort((a, b) => a - b);
          app.bp0 = bp[0];
          app.bp5 = bp[bp.length-1];
          app.bp1 = bp[1];
          app.bp4 = bp[bp.length-2];
          if (app.selected_breaks==3) {
            app.bp2 = app.bp3 = bp[2];
          } else {
            app.bp2 = bp[2];
            app.bp3 = bp[3];
          }
          
          sel_colorvals = Array.from(new Set(sel_colorvals)).sort((a, b) => a - b);
          sel_binsflag = true; 
          color_func = chroma.scale(app.selected_colorscheme).mode(getColorMode(app.selected_colorscheme)).classes(sel_colorvals);
          sel_colorvals2 = sel_colorvals.slice(0,sel_colorvals.length-1);
        }        
      } else {
        sel_colorvals = new Set([app.bp0, app.bp1, app.bp2, app.bp3, app.bp4, app.bp5]);
        sel_colorvals = Array.from(sel_colorvals).sort((a, b) => a - b);
        sel_binsflag = true; 
        color_func = chroma.scale(app.selected_colorscheme).mode(getColorMode(app.selected_colorscheme)).classes(sel_colorvals);
        sel_colorvals2 = sel_colorvals.slice(0,sel_colorvals.length-1);
      }
      
      sel_colors = [];
      for(let i of sel_colorvals2) {
        sel_colors.push(color_func(i).hex());
      }
 
      if (geoLayer) mymap.removeLayer(geoLayer);
      if (mapLegend) mymap.removeControl(mapLegend);
      geoLayer = L.geoJSON(cleanFeatures, {
        style: function(feat) {
          let color = getColorFromVal(
            feat['metric'],
            sel_colorvals,
            sel_colors,
            sel_binsflag
          );
          if (!color) color = MISSING_COLOR;
          return { color: color, weight: 4, opacity: 1.0 };
        },
        onEachFeature: function(feature, layer) {
          layer.on({
            mouseover: hoverFeature,
        //    click: clickedOnFeature,
            });
        },
      });
      geoLayer.addTo(mymap);

      mapLegend = L.control({ position: 'bottomright' });
      mapLegend.onAdd = function(map) {
        let div = L.DomUtil.create('div', 'info legend');
        let legHTML = getLegHTML(
          sel_colorvals,
          sel_colors,
          sel_binsflag,
          (app.pct_check && app.comp_check)? '%': ''
        );
        div.innerHTML = '<h4>' + sel_metric.toUpperCase() + (app.pct_check? ' PCT_DIFF':'') +  '</h4>' + legHTML;
        return div;
      };
      mapLegend.addTo(mymap);
    }

  } catch(error) {
    console.log(error);
  }
}

function styleByMetricColor(feat) {
  let color = getColorFromVal(
    feat['metric'],
    sel_colorvals,
    sel_colors,
    sel_binsflag
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
  if (selGeoId === e.target.feature.tmc) return;

  // return previously-hovered segment to its original color
  if (oldHoverTarget && e.target.feature.tmc != selGeoId) {
    if (oldHoverTarget.feature.tmc != selGeoId)
      geoLayer.resetStyle(oldHoverTarget);
  }

  let highlightedGeo = e.target;
  highlightedGeo.bringToFront();

  if (highlightedGeo.feature.tmc != selGeoId) {
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

let distChart = null;
let distLabels;
function updateDistChart(bins) {
  let data = [];
  distLabels = [];
  for (let b of bins) {
    let x0 = Math.round(b.x0*prec)/prec;
    let x1 = Math.round(b.x1*prec)/prec;
    data.push({x:x0, y:b.length});
    distLabels.push(x0 + '-' + x1);
  }

  if (distChart) {
    distChart.setData(data);
  } else {
      distChart = new Morris.Area({
        // ID of the element in which to draw the chart.
        element: 'dist-chart',
        data: data,
        // The name of the data record attribute that contains x-values.
        xkey: 'x',
        // A list of names of data record attributes that contain y-values.
        ykeys: 'y',
        ymin: 0,
        labels: ['Freq'],
        lineColors: ['#1fc231'],
        xLabels: 'x',
        xLabelAngle: 25,
        xLabelFormat: binFmt,
        //yLabelFormat: yFmt,
        hideHover: true,
        parseTime: false,
        fillOpacity: 0.4,
        pointSize: 1,
        behaveLikeLine: false,
        eventStrokeWidth: 2,
        eventLineColors: ['#ccc'],
      });
  }

}

function binFmt(x) {
  return distLabels[x.x] + ((app.pct_check && app.comp_check)? '%':'');
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

  let segmentData = _allCmpData
    .filter(row => row.cmp_segid == _selectedGeo.cmp_segid)
    .filter(row => row[metric_col] != null);

  buildChartHtmlFromCmpData(segmentData);
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

function selectionChanged(thing) {
  if (app.selected_scenario && app.selected_timep && app.selected_metric) {
    drawMapFeatures();
  }
  //highlightSelectedSegment();
}

function seltimepChanged(thing) {
  if (app.selected_scenario && app.selected_timep && app.selected_metric) {
    if (thing=='Daily') {
      app.metric_options = metric_options_daily;
      if (!daily_metric_list.includes(app.selected_metric)) {
        app.selected_metric = daily_metric_list[0];
      }
    } else {
      app.metric_options = metric_options_all;
    }
    drawMapFeatures();
  }
}

function optionsChanged(thing) {
  if (app.scen_options.length > 0 && app.time_options.length > 0) {
    app.selected_scenario = app.scen_options[app.scen_options.length - 1].value;
    app.selected_comp_scenario = app.scen_options[0].value;
    app.selected_timep = 'Daily';
    app.metric_options = metric_options_daily;
    app.selected_metric = daily_metric_list[0];
  }
}

function clickViz(chosenviz) {
  app.selectedViz = chosenviz;
  app.chartTitle = VIZ_INFO[chosenviz]['CHARTINFO'];

  data_view = VIZ_INFO[chosenviz]['VIEW'];
  selviz_metric = VIZ_INFO[chosenviz]['METRIC'];

  drawMapFeatures();

  if (_selectedGeo) {
    showVizChartForSelectedSegment();
    // showSegmentDetails(_selectedGeo, _selectedLatLng);
    highlightSelectedSegment();
  } else {
    buildChartHtmlFromCmpData();
  }
}

// fetch data to fill in select dropdowns
function updateOptionsData(colname) {
  let sellist = [];
  let selopts = [];
  fetch(API_SERVER + DATA_VIEW + '?select=' + colname + '&' + colname + '=neq.null')
    .then(resp => resp.json())
    .then(function(jsonData) {
      for (let entry of jsonData) {
        if (!sellist.includes(entry[colname])) sellist.push(entry[colname]);
      }
      sellist = sellist.sort();
      for (let entry of sellist) {
        selopts.push({text: entry, value: entry});
      }
    });
  return selopts;
}

function getMetricOptions() {
  let sellist = [];
  let selopts = [];
  metric_options_daily = [];
  fetch(API_SERVER + DATA_VIEW + '?limit=1')
    .then(resp => resp.json())
    .then(function(jsonData) {
      for (var entry in jsonData[0]) {
        if (!EXCLUDE_COLS.includes(entry)) sellist.push(entry);
      }
      for (let entry of sellist) {
        selopts.push({text: entry, value: entry});
      }
      metric_options_all = selopts;
      for (let entry of daily_metric_list) {
        metric_options_daily.push({text: entry, value: entry});
      }
    });
}


// SLIDER ----
let breakSlider = {
  clickable: true,
  min: 1,
  max: 100,
  interval: 0.01,
  direction: 'horizontal',
  disabled: false,
  dotSize: 16,
  eventType: 'auto',
  height: 3,
  labelStyle: { color: '#ccc' },
  labelActiveStyle: { color: '#ccc' },
  lazy: false,
  piecewise: false,
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

function bp1Changed(thing) {
  if (thing < app.bp0) app.bp1 = app.bp0;
  if (thing > app.bp2) app.bp2 = thing;
  app.isUpdActive = true;
}
function bp2Changed(thing) {
  if (thing < app.bp1) app.bp1 = thing;
  if (thing > app.bp3) app.bp3 = thing;
  app.isUpdActive = true;
}
function bp3Changed(thing) {
  if (thing < app.bp2) app.bp2 = thing;
  if (thing > app.bp4) app.bp4 = thing;
  app.isUpdActive = true;
}
function bp4Changed(thing) {
  if (thing < app.bp3) app.bp3 = thing;
  if (thing > app.bp5) app.bp4 = app.bp5;
  app.isUpdActive = true;
}

function updateMap(thing) {
  app.isUpdActive = false;
  drawMapFeatures(false);
}
function customBreakPoints(thing) {
  if(thing) {
    app.isUpdActive = false;
  } else {
    drawMapFeatures();
  }
}
function colorschemeChanged(thing) {
  app.selected_colorscheme = thing;
  drawMapFeatures(false);
}

function getColorMode(cscheme) {
  if (app.modeMap.hasOwnProperty(cscheme.toString())) {
    return app.modeMap[cscheme];
  } else {
    return 'lrgb';
  }
}


let app = new Vue({
  el: '#panel',
  delimiters: ['${', '}'],
  data: {
    chartTitle: VIZ_INFO[VIZ_LIST[0]].CHARTINFO,
    chartSubtitle: aggdata_label,
    isAMActive: true,
    isPMActive: false,
    selectedViz: VIZ_LIST[0],
    vizlist: VIZ_LIST,
    vizinfo: VIZ_INFO,
    isUpdActive: false,
    comp_check: false,
    pct_check: false,
    custom_check: false,
    custom_disable: false,
    bp0: 0.0,
    bp1: 0.0,
    bp2: 0.0,
    bp3: 0.0,
    bp4: 0.0,
    bp5: 0.0,
    
    selected_comp_scenario: null,
    selected_scenario: null,
    scen_options: [
    {text: '', value: ''},
    ],
    
    selected_timep: null,
    time_options: [
    {text: '', value: ''},
    ],
    
    selected_metric: null,
    metric_options: [
    {text: '', value: ''},
    ],
    
    selected_colorscheme: ['#ffffcc','#663399'],
    color_options: [
    {text: 'Yellow-Navy', value: ['Yellow','Navy']},
    {text: 'Yellow-Purple', value: ['#ffffcc','#663399']},
    {text: 'Yellow-Blue', value: ['#fafa6e','#2A4858']},
    {text: 'GnYlRd', value: ['Green','Yellow','Red']},
    {text: 'RdYlGn', value: ['Red','Yellow','Green']},
    {text: 'YlOrRd', value: 'YlOrRd'},
    {text: 'RdOrYl', value: ['Red','Orange','Yellow']},
    {text: 'YlRdBl', value: ['Yellow','Red','Black']},
    {text: 'YlGnBu', value: ['Yellow','Green','Blue']},
    {text: 'Spectral', value: 'Spectral'},
    {text: 'YlGn', value: 'YlGn'},
    ],
    modeMap: {
      '#ffffcc,#663399': 'lch',
      'Yellow,Navy': 'lch',
      '#fafa6e,#2A4858': 'lch',
    },

    selected_breaks: 5,
    break_options: [
    {text: 'Tertiles (3)', value: 3},
    {text: 'Quartiles (4)', value: 4},
    {text: 'Quintiles (5)', value: 5},
    ]      
  },
  watch: {
    scen_options: optionsChanged,
    time_options: optionsChanged,
    selected_scenario: selectionChanged,
    selected_timep: seltimepChanged,
    selected_metric: selectionChanged,
    selected_breaks: selectionChanged,
    comp_check: selectionChanged,
    pct_check: selectionChanged,
    selected_comp_scenario: selectionChanged,
    
    selected_colorscheme: colorschemeChanged,
    bp1: bp1Changed,
    bp2: bp2Changed,
    bp3: bp3Changed,
    bp4: bp4Changed,
    custom_check: customBreakPoints,
    
  },
  methods: {
    updateMap: updateMap,
    clickToggleHelp: clickToggleHelp,
    clickViz: clickViz,
  },
  components: {
    vueSlider,
  },
});

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

initialPrep();

