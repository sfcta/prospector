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
let getBWLegHTML = maplib.getBWLegHTML;
let getQuantiles = maplib.getQuantiles;
let mymap = maplib.sfmap;
mymap.setView([37.76889, -122.440997], 13);

// some important global variables.
const API_SERVER = 'https://api.sfcta.org/api/';

/*const GEO_VIEW = 'taz_boundaries';
const DATA_VIEW = 'tnctr_taz2';
const GEOID_VAR = 'taz';
const GEOQUERY_COLS = 'taz,geometry,nhood';
const GEODESC_VAR = 'nhood';
const GEODESC = 'NEIGHBORHOOD';
*/

const GEO_VIEW = 'csf_dist15';
const DATA_VIEW = 'tnctr_dist15';
const GEOID_VAR = 'dist15';
const GEOQUERY_COLS = 'dist15,geometry,dist15name';
const GEODESC_VAR = 'dist15name';
const GEODESC = 'NAME';

const GEOTYPE = 'Segment';

const SRC_VAR = 'source';
const YR_VAR = 'year';
const TOD_VAR = 'tod2';

const FRAC_COLS = ['freq_s','avg_ride','ontime5','ons','offs','shr_hh_0veh','crowded','hh_den_acs','pop_den_acs',
                  'veh_per_hh','avg_hh_size'];
const SCNYR_LIST = [2010,2015];

const INT_COLS = [''];
const DISCRETE_VAR_LIMIT = 10;
const MISSING_COLOR = '#ccd';
const COLORRAMP = {SEQ: ['#ffffcc','#3f324f'],
                    DIV: ['#d7191c','#fdae61','#ffffbf','#a6d96a','#1a9641']};

const MIN_BWIDTH = 2;
const MAX_BWIDTH = 10;
const DEF_BWIDTH = 4;
const BWIDTH_MAP = {
  1: DEF_BWIDTH,
  2: DEF_BWIDTH,
  3: [2.5, 5],
  4: [1.6, 3.2, 4.8],
  5: [1.25, 2.5, 3.75, 5],
  6: [1, 2, 3, 4, 5]
};
const MAX_PCTDIFF = 200;
const CUSTOM_BP_DICT = {
  'hh': {'base':[250, 500, 750, 1000], 'diff':[-100, -5, 5, 100], 'pctdiff':[-20, -5, 5, 20]},
}

const METRIC_UNITS = {'speed':'mph','tot':'jobs'};

let sel_colorvals, sel_colors, sel_binsflag;
let sel_bwvals;
let bwidth_metric_list = [''];

let chart_deftitle = 'All TAZs Combined';

let geoLayer, mapLegend;
let _featJson;
let _aggregateData;
let prec;

async function initialPrep() {

  console.log('1...');
  _featJson = await fetchMapFeatures();

  console.log('2... ');
  await drawMapFeatures();
  
  console.log('3... ');
  await buildChartHtmlFromData();

  console.log('4 !!!');
}

async function fetchMapFeatures() {
  const geo_url = API_SERVER + GEO_VIEW + '?select=' + GEOQUERY_COLS;

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


// hover panel -------------------
let infoPanel = L.control();

infoPanel.onAdd = function(map) {
  // create a div with a class "info"
  this._div = L.DomUtil.create('div', 'info-panel-hide');
  return this._div;
};

function getInfoHtml(geo) {
  let metric_val = null;
  if (geo.metric !== null) metric_val = (Math.round(geo.metric*100)/100).toLocaleString();
  let base_val = null;
  if (geo.base !== null) base_val = (Math.round(geo.base*100)/100).toLocaleString();
  let comp_val = null;
  if (geo.comp !== null) comp_val = (Math.round(geo.comp*100)/100).toLocaleString();
  let bwmetric_val = null;
  if (geo.bwmetric !== null) bwmetric_val = (Math.round(geo.bwmetric*100)/100).toLocaleString();
  let retval = `<b>${GEOID_VAR.toUpperCase()}: </b>` + `${geo[GEOID_VAR]}<br/>` +
                `<b>${GEODESC.toUpperCase()}: </b>` + `${geo[GEODESC_VAR]}<br/><hr>`;
  if (app.comp_check) {
    retval += `<b>${app.sliderValue[0]}</b> `+`<b>AVG_RIDE: </b>` + `${base_val}<br/>` +
              `<b>${app.sliderValue[1]}</b> `+`<b>${app.selected_metric.toUpperCase()}: </b>` + `${comp_val}<br/>`;
  }
  retval += `<b>${app.selected_metric.toUpperCase()}</b>` + 
            (app.pct_check? '<b> %</b>': '') +
            (app.comp_check? '<b> Diff: </b>':'<b>: </b>') + 
            `${metric_val}` + 
            ((app.pct_check && app.comp_check && metric_val !== null)? '%':''); 
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

async function getMapData() {
  let data_url = API_SERVER + DATA_VIEW;
  let resp = await fetch(data_url);
  let jsonData = await resp.json();
  base_lookup = {};
  let tmp = {};
  for (let src of app.source_options) {
    tmp[src.value] = {};
    base_lookup[src.value] = {};
    for (let yr of SCNYR_LIST) {
      tmp[src.value][yr] = {};
      base_lookup[src.value][yr] = {};
      for (let tod of app.time_options) {
        tmp[src.value][yr][tod.value] = {};
        base_lookup[src.value][yr][tod.value] = {};
        for (let met of app.metric_options) {
          tmp[src.value][yr][tod.value][met.value] = 0;
        }
      }
    }
  }
  for (let entry of jsonData) {
    base_lookup[entry[SRC_VAR]][entry[YR_VAR]][entry[TOD_VAR]][entry[GEOID_VAR]] = entry;
    for (let met of app.metric_options) {
      tmp[entry[SRC_VAR]][entry[YR_VAR]][entry[TOD_VAR]][met.value] += entry[met.value];
    }
  }
  _aggregateData = {};
  
  for (let src of app.source_options) {
    _aggregateData[src.value] = {};
    for (let tod of app.time_options) {
      _aggregateData[src.value][tod.value] = [];
    }
  }
  for (let src of app.source_options) {
    for (let yr of SCNYR_LIST) {
      for (let tod of app.time_options) {
        let row = {};
        row['year'] = yr.toString();
        for (let met of app.metric_options) {
          row[met.value] = Math.round(tmp[src.value][yr][tod.value][met.value]*prec)/prec;
        }
        _aggregateData[src.value][tod.value].push(row);
      }
    }
  }
}

let base_lookup;
let map_vals;
let bwidth_vals;
async function drawMapFeatures(queryMapData=true) {

  // create a clean copy of the feature Json
  if (!_featJson) return;
  let cleanFeatures = _featJson.slice();
  let sel_metric = app.selected_metric;
  let base_scnyr = app.sliderValue[0];
  let comp_scnyr = app.sliderValue[1];
  if (base_scnyr==comp_scnyr) {
    app.comp_check = false;
    app.pct_check = false;
  } else {
    app.comp_check = true;
  }
  updateColorScheme();
  prec = (FRAC_COLS.includes(sel_metric) ? 100 : 1);
  
  try {
    if (queryMapData) {
      if (base_lookup == undefined) await getMapData();
      
      let map_metric;
      let bwidth_metric;
      map_vals = [];
      bwidth_vals = [];
      for (let feat of cleanFeatures) {
        bwidth_metric = null;
        if (base_lookup[app.selected_source][base_scnyr][app.selected_timep].hasOwnProperty(feat[GEOID_VAR])) {
          bwidth_metric = Math.round(base_lookup[app.selected_source][base_scnyr][app.selected_timep][feat[GEOID_VAR]][app.selected_bwidth]);
          if (bwidth_metric !== null) bwidth_vals.push(bwidth_metric);
        }
        feat['bwmetric'] = bwidth_metric;
        
        map_metric = null;
        feat['base'] = null;
        feat['comp'] = null;
        if (app.comp_check) {
          if (base_lookup[app.selected_source][base_scnyr][app.selected_timep].hasOwnProperty(feat[GEOID_VAR])) {
            if (base_lookup[app.selected_source][comp_scnyr][app.selected_timep].hasOwnProperty(feat[GEOID_VAR])) {
              feat['base'] = base_lookup[app.selected_source][base_scnyr][app.selected_timep][feat[GEOID_VAR]][sel_metric];
              feat['comp'] = base_lookup[app.selected_source][comp_scnyr][app.selected_timep][feat[GEOID_VAR]][sel_metric];
              map_metric = feat['comp'] - feat['base'];
              if (app.pct_check && app.comp_check) {
                if (feat['base']>0) {
                  map_metric = map_metric*100/feat['base'];
                } else {
                  map_metric = 0;
                }
              }
            } else {
              feat['base'] = base_lookup[app.selected_source][base_scnyr][app.selected_timep][feat[GEOID_VAR]][sel_metric];
            }
          } else {
            if (base_lookup[app.selected_source][comp_scnyr][app.selected_timep].hasOwnProperty(feat[GEOID_VAR])) feat['comp'] = base_lookup[app.selected_source][comp_scnyr][app.selected_timep][feat[GEOID_VAR]][sel_metric];
          }
        } else {
          if (base_lookup[app.selected_source][base_scnyr][app.selected_timep].hasOwnProperty(feat[GEOID_VAR])) {
            map_metric = base_lookup[app.selected_source][base_scnyr][app.selected_timep][feat[GEOID_VAR]][sel_metric];
          }
        }
        if (map_metric !== null) {
          map_metric = Math.round(map_metric*prec)/prec;
          map_vals.push(map_metric);
        }
        feat['metric'] = map_metric;
      }
      map_vals = map_vals.sort((a, b) => a - b);  
      bwidth_vals = bwidth_vals.sort((a, b) => a - b); 
    }
    
    if (map_vals.length > 0) {
      let color_func;
      let sel_colorvals2;
      let bp;
      
      if (queryMapData) {
        sel_colorvals = Array.from(new Set(map_vals)).sort((a, b) => a - b);
        
        //calculate distribution
        let dist_vals = (app.comp_check && app.pct_check)? map_vals.filter(entry => entry <= MAX_PCTDIFF) : map_vals;
        let x = d3.scaleLinear()
                .domain([dist_vals[0], dist_vals[dist_vals.length-1]])
        let numticks = 20;
        if (sel_colorvals.length <= DISCRETE_VAR_LIMIT || INT_COLS.includes(sel_metric)) numticks = sel_colorvals.length;
        let histogram = d3.histogram()
            .domain(x.domain())
            .thresholds(x.ticks(numticks));
        updateDistChart(histogram(dist_vals));

        if (sel_colorvals.length <= DISCRETE_VAR_LIMIT || INT_COLS.includes(sel_metric)) {
          sel_binsflag = false;
          color_func = chroma.scale(app.selected_colorscheme).mode(getColorMode(app.selected_colorscheme)).classes(sel_colorvals.concat([sel_colorvals[sel_colorvals.length-1]+1]));
          sel_colorvals2 = sel_colorvals.slice(0);
          
          app.custom_disable = true;
          app.bp0 = 0;
          app.bp1 = 0;
          app.bp2 = 0;
          app.bp3 = 0;
          app.bp4 = 0;
          app.bp5 = 1;
          
        } else {
          app.custom_disable = false;
          
          let mode = 'base';
          if (app.comp_check){
            if(app.pct_check){
              mode = 'pctdiff';
            } else {
              mode = 'diff';
            }
          }
          let custom_bps, brk_metric;
          brk_metric = CUSTOM_BP_DICT.hasOwnProperty(sel_metric)? sel_metric:'All';
          if (CUSTOM_BP_DICT.hasOwnProperty(sel_metric)){
            custom_bps = CUSTOM_BP_DICT[sel_metric][mode];
            sel_colorvals = [map_vals[0]];
            for (var i = 0; i < custom_bps.length; i++) {
              if (custom_bps[i]>map_vals[0] && custom_bps[i]<map_vals[map_vals.length-1]) sel_colorvals.push(custom_bps[i]);
            }
            sel_colorvals.push(map_vals[map_vals.length-1]);
          } else {
            let clusters = ss.ckmeans(map_vals, app.selected_breaks);
            sel_colorvals = [map_vals[0]];
            for (var i = 1; i < clusters.length; i++) {
              let clen = clusters[i-1].length;
              sel_colorvals.push(clusters[i-1][clen-1]);
            }
            sel_colorvals.push(map_vals[map_vals.length-1]);
          }
          bp = Array.from(sel_colorvals).sort((a, b) => a - b);
          app.bp0 = bp[0];
          app.bp5 = bp[bp.length-1];
          if (CUSTOM_BP_DICT.hasOwnProperty(sel_metric)){
            app.bp1 = custom_bps[0];
            app.bp2 = custom_bps[1];
            app.bp3 = custom_bps[2];
            app.bp4 = custom_bps[3];
            if (custom_bps[0] < app.bp0) app.bp1 = app.bp0;
          } else {
            app.bp1 = bp[1];
            app.bp4 = bp[bp.length-2];
            if (app.selected_breaks==3) {
              app.bp2 = app.bp3 = bp[2];
            } else {
              app.bp2 = bp[2];
              app.bp3 = bp[3];
            }
          }
          
          sel_colorvals = Array.from(new Set(sel_colorvals)).sort((a, b) => a - b);
          sel_binsflag = true; 
          color_func = chroma.scale(app.selected_colorscheme).mode(getColorMode(app.selected_colorscheme)).classes(sel_colorvals);
          sel_colorvals2 = sel_colorvals.slice(0,sel_colorvals.length-1);
        }

        app.bwcustom_disable = false;
        sel_bwvals = getQuantiles(bwidth_vals, 5);
        bp = Array.from(sel_bwvals).sort((a, b) => a - b);
        app.bwbp0 = bp[0];
        app.bwbp1 = bp[1];
        app.bwbp2 = bp[2];
        app.bwbp3 = bp[3];
        app.bwbp4 = bp[4];
        app.bwbp5 = bp[5];
        sel_bwvals = Array.from(new Set(sel_bwvals)).sort((a, b) => a - b); 
      } else {
        sel_colorvals = new Set([app.bp0, app.bp1, app.bp2, app.bp3, app.bp4, app.bp5]);
        sel_colorvals = Array.from(sel_colorvals).sort((a, b) => a - b);
        sel_binsflag = true; 
        color_func = chroma.scale(app.selected_colorscheme).mode(getColorMode(app.selected_colorscheme)).classes(sel_colorvals);
        sel_colorvals2 = sel_colorvals.slice(0,sel_colorvals.length-1);
        
        sel_bwvals = new Set([app.bwbp0, app.bwbp1, app.bwbp2, app.bwbp3, app.bwbp4, app.bwbp5]);
        sel_bwvals = Array.from(sel_bwvals).sort((a, b) => a - b);
      }

      let bw_widths;
      if (app.bwidth_check) {
        bw_widths = BWIDTH_MAP[sel_bwvals.length]; 
        for (let feat of cleanFeatures) {
          if (feat['bwmetric'] !== null) {
            if (sel_bwvals.length <= 2){
              feat['bwmetric_scaled'] = bw_widths;
            } else {
              for (var i = 0; i < sel_bwvals.length-1; i++) {
                if (feat['bwmetric'] <= sel_bwvals[i + 1]) {
                  feat['bwmetric_scaled'] = bw_widths[i];
                  break;
                }
              }
            }
            //feat['bwmetric_scaled'] = (feat['bwmetric']-bwidth_vals[0])*(MAX_BWIDTH-MIN_BWIDTH)/(bwidth_vals[bwidth_vals.length-1]-bwidth_vals[0])+MIN_BWIDTH;
          } else {
            feat['bwmetric_scaled'] = null;
          }
        }
      }
      
      sel_colors = [];
      for(let i of sel_colorvals2) {
        sel_colors.push(color_func(i).hex());
      }
 
      if (geoLayer) mymap.removeLayer(geoLayer);
      if (mapLegend) mymap.removeControl(mapLegend);
      geoLayer = L.geoJSON(cleanFeatures, {
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
          sel_colorvals,
          sel_colors,
          sel_binsflag,
          (app.pct_check && app.comp_check)? '%': ''
        );
        legHTML = '<h4>' + sel_metric.toUpperCase() + (app.pct_check? ' % Diff': (METRIC_UNITS.hasOwnProperty(sel_metric)? (' (' + METRIC_UNITS[sel_metric] + ')') : '')) +
                  '</h4>' + legHTML;
        if (app.bwidth_check) {
          legHTML += '<hr/>' + '<h4>' + app.selected_bwidth.toUpperCase() +  '</h4>';
          legHTML += getBWLegHTML(sel_bwvals, bw_widths);
        }
        div.innerHTML = legHTML;
        return div;
      };
      mapLegend.addTo(mymap);
      
      if (selectedGeo) {
        if (base_lookup[app.selected_source][base_scnyr][app.selected_timep].hasOwnProperty(selectedGeo.feature[GEOID_VAR])) {
          buildChartHtmlFromData(selectedGeo.feature[GEOID_VAR]);
          return cleanFeatures.filter(entry => entry[GEOID_VAR] == selectedGeo.feature[GEOID_VAR])[0];
        } else {
          resetPopGeo();
        }
      } else {
        buildChartHtmlFromData();
        return null;
      }
    }

  } catch(error) {
    console.log(error);
  }
}

function updateColorScheme() {
  if (app.comp_check) {
    app.selected_colorscheme = COLORRAMP.DIV;
  } else {
    app.selected_colorscheme = COLORRAMP.SEQ;
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
  let fo = 0.6;
  if (feat['metric']==0) {
    fo = 0;
  }
  if (!app.bwidth_check) {
    return { fillColor: color, opacity: 0.5, weight: 0.5, fillOpacity: fo };
  } else {
    return { color: color, weight: feat['bwmetric_scaled'], opacity: 1.0 };
  }
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

function highlightSelectedSegment() {
  if (!selGeoId) return;

  mymap.eachLayer(function (e) {
    try {
      if (e.feature[GEOID_VAR] === selGeoId) {
        e.bringToFront();
        e.setStyle(styles.popup);
        selectedGeo = e;
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
        element: 'dist-chart',
        data: data,
        xkey: 'x',
        ykeys: 'y',
        ymin: 0,
        labels: ['Freq'],
        lineColors: ['#1fc231'],
        xLabels: 'x',
        xLabelAngle: 25,
        xLabelFormat: binFmt,
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

let selGeoId;
let selectedGeo, prevSelectedGeo;
let selectedLatLng;

function clickedOnFeature(e) {
  e.target.setStyle(styles.popup);
  let geo = e.target.feature;
  selGeoId = geo[GEOID_VAR];

  // unselect the previously-selected selection, if there is one
  if (selectedGeo && selectedGeo.feature[GEOID_VAR] != geo[GEOID_VAR]) {
    prevSelectedGeo = selectedGeo;
    geoLayer.resetStyle(prevSelectedGeo);
  }
  selectedGeo = e.target;
  let selfeat = selectedGeo.feature;
  app.chartSubtitle = GEOTYPE + ' ' + selfeat[GEOID_VAR];
  selectedLatLng = e.latlng;
  if (base_lookup[app.selected_source][app.sliderValue[0]][app.selected_timep].hasOwnProperty(selGeoId)) {
    showGeoDetails(selectedLatLng);
    buildChartHtmlFromData(selGeoId);
  } else {
    resetPopGeo();
  }
}

let popSelGeo;
function showGeoDetails(latlng) {
  // show popup
  popSelGeo = L.popup()
    .setLatLng(latlng)
    .setContent(infoPanel._div.innerHTML)
    .addTo(mymap);

  // Revert to overall chart when no segment selected
  popSelGeo.on('remove', function(e) {
    resetPopGeo();
  });
}

function resetPopGeo() {
  geoLayer.resetStyle(selectedGeo);
  prevSelectedGeo = selectedGeo = selGeoId = null;
  app.chartSubtitle = chart_deftitle;
  buildChartHtmlFromData();
}

let trendChart = null
function buildChartHtmlFromData(geoid = null) {
  document.getElementById('longchart').innerHTML = '';
  if (geoid) {
    let selgeodata = [];
    for (let yr of SCNYR_LIST) {
      let row = {};
      row['year'] = yr.toString();
      row[app.selected_metric] = Math.round(base_lookup[app.selected_source][yr][app.selected_timep][geoid][app.selected_metric]*100)/100;
      selgeodata.push(row);
    } 
    trendChart = new Morris.Line({
      data: selgeodata,
      element: 'longchart',
      gridTextColor: '#aaa',
      hideHover: true,
      labels: [app.selected_metric.toUpperCase()],
      lineColors: ['#f66'],
      xkey: 'year',
      smooth: false,
      parseTime: false,
      xLabelAngle: 45,
      ykeys: [app.selected_metric],
    });
  } else {
    trendChart = new Morris.Line({
      data: _aggregateData[app.selected_source][app.selected_timep],
      element: 'longchart',
      gridTextColor: '#aaa',
      hideHover: true,
      labels: [app.selected_metric.toUpperCase()],
      lineColors: ['#f66'],
      xkey: 'year',
      smooth: false,
      parseTime: false,
      xLabelAngle: 45,
      ykeys: [app.selected_metric],
    });
  }
}


// SLIDER ----
let scnSlider = {
  data: SCNYR_LIST,
  //direction: 'vertical',
  //reverse: true,
  lazy: true,
  height: 3,
  //width: 'auto',
  style: {marginTop: '10px'},
  processDragable: true,
  eventType: 'auto',
  piecewise: true,
  piecewiseLabel: true,
  tooltip: 'always',
  tooltipDir: 'bottom',
  tooltipStyle: { backgroundColor: '#eaae00', borderColor: '#eaae00', marginLeft:'5px'},
  processStyle: { backgroundColor: "#eaae00"},
  labelStyle: {color: "#ccc", marginLeft:'5px', marginTop:'5px'},
  piecewiseStyle: {backgroundColor: '#ccc',width: '8px',height: '8px',visibility: 'visible'},
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
function bwbp1Changed(thing) {
  if (thing < app.bwbp0) app.bwbp1 = app.bwbp0;
  if (thing > app.bwbp2) app.bwbp2 = thing;
  app.isBWUpdActive = true;
}
function bwbp2Changed(thing) {
  if (thing < app.bwbp1) app.bwbp1 = thing;
  if (thing > app.bwbp3) app.bwbp3 = thing;
  app.isBWUpdActive = true;
}
function bwbp3Changed(thing) {
  if (thing < app.bwbp2) app.bwbp2 = thing;
  if (thing > app.bwbp4) app.bwbp4 = thing;
  app.isBWUpdActive = true;
}
function bwbp4Changed(thing) {
  if (thing < app.bwbp3) app.bwbp3 = thing;
  if (thing > app.bwbp5) app.bwbp4 = app.bwbp5;
  app.isBWUpdActive = true;
}

async function selectionChanged(thing) {
  app.chartTitle = app.selected_metric.toUpperCase() + ' TREND';
  if (app.sliderValue && app.selected_metric && app.selected_timep && app.selected_source) {
    let selfeat = await drawMapFeatures();
    if (selfeat) {
      highlightSelectedSegment();
      popSelGeo.setContent(getInfoHtml(selfeat));
    }
  }
}

async function updateMap(thing) {
  app.isUpdActive = false;
  let selfeat = await drawMapFeatures(false);
  if (selfeat) {
    highlightSelectedSegment();
    popSelGeo.setContent(getInfoHtml(selfeat));
  }
}
function customBreakPoints(thing) {
  if(thing) {
    app.isUpdActive = false;
  } else {
    drawMapFeatures();
  }
}
function customBWBreakPoints(thing) {
  if(thing) {
    app.isBWUpdActive = false;
  } else {
    drawMapFeatures();
  }
}

function colorschemeChanged(thing) {
  app.selected_colorscheme = thing;
  drawMapFeatures(false);
}

function bwidthChanged(thing) {
  app.bwcustom_disable = !thing;
  drawMapFeatures(false);
}
function bwUpdateMap(thing) {
  app.isBWUpdActive = false;
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
    isPanelHidden: false,
    isUpdActive: false,
    comp_check: true,
    pct_check: false,
    bwidth_check: false,
    custom_check: true,
    custom_disable: false,
    bp0: 0.0,
    bp1: 0.0,
    bp2: 0.0,
    bp3: 0.0,
    bp4: 0.0,
    bp5: 0.0,
    
    isBWUpdActive: false,
    bwcustom_check: false,
    bwcustom_disable: true,
    bwbp0: 0.0,
    bwbp1: 0.0,
    bwbp2: 0.0,
    bwbp3: 0.0,
    bwbp4: 0.0,
    bwbp5: 0.0,
    
    selected_metric: 'avg_ride',
    metric_options: [
    {text: 'avg_ride', value: 'avg_ride'},
    {text: 'fac_access', value: 'fac_access'},
    {text: 'fac_regional_transfers', value: 'fac_regional_transfers'},
    {text: 'fac_service', value: 'fac_service'},
    {text: 'fac_tnc', value: 'fac_tnc'},
    {text: 'fac_unexplained', value: 'fac_unexplained'},
    
    /*{text: 'ons', value: 'ons'},
    {text: 'offs', value: 'offs'},
    
    {text: 'avg_tnc', value: 'avg_tnc'},
    {text: 'pickups', value: 'pickups'},
    {text: 'dropoffs', value: 'dropoffs'},
    
    {text: 'routes', value: 'routes'},
    {text: 'stops', value: 'stops'},
    {text: 'trip_stops', value: 'trip_stops'},
    {text: 'servmiles_s', value: 'servmiles_s'},
    {text: 'servmiles', value: 'servmiles'},
    {text: 'runtime_s', value: 'runtime_s'},
    {text: 'runtime', value: 'runtime'},
    {text: 'tottime_s', value: 'tottime_s'},
    {text: 'tottime', value: 'tottime'},
    {text: 'runspeed_s', value: 'runspeed_s'},
    {text: 'runspeed', value: 'runspeed'},
    {text: 'totspeed_s', value: 'totspeed_s'},
    {text: 'totspeed', value: 'totspeed'},
    
    {text: 'ontime5', value: 'ontime5'},
    {text: 'capacity', value: 'capacity'},
    {text: 'bus_avg_ride', value: 'bus_avg_ride'},
    {text: 'rail_avg_ride', value: 'rail_avg_ride'},
    {text: 'bart_avg_ride', value: 'bart_avg_ride'},
    {text: 'caltrain_avg_ride', value: 'caltrain_avg_ride'},
    
    {text: 'hhlds', value: 'hhlds'},
    {text: 'pop', value: 'pop'},
    {text: 'empres', value: 'empres'},
    {text: 'cie', value: 'cie'},
    {text: 'med', value: 'med'},
    {text: 'mips', value: 'mips'},
    {text: 'pdr', value: 'pdr'},
    {text: 'retail', value: 'retail'},
    {text: 'visitor', value: 'visitor'},
    {text: 'totalemp', value: 'totalemp'},
    
    {text: 'access_30_hhlds', value: 'access_30_hhlds'},
    {text: 'access_30_totalemp', value: 'access_30_totalemp'},
    {text: 'access_45_hhlds', value: 'access_45_hhlds'},
    {text: 'access_45_totalemp', value: 'access_45_totalemp'},
    {text: 'access_all_30_hhlds', value: 'access_all_30_hhlds'},
    {text: 'access_all_30_totalemp', value: 'access_all_30_totalemp'},
    {text: 'access_all_45_hhlds', value: 'access_all_45_hhlds'},
    {text: 'access_all_45_totalemp', value: 'access_all_45_totalemp'},*/
    
    ],
    chartTitle: 'AVG_RIDE TREND',
    chartSubtitle: chart_deftitle,
    
    scnSlider: scnSlider,
    sliderValue: [SCNYR_LIST[0],SCNYR_LIST[SCNYR_LIST.length-1]],
    
    selected_source: 'Bus',
    source_options: [
    {text: 'Bus', value: 'Bus'},
    {text: 'Rail', value: 'Rail'},
    ],
    selected_timep: 'Daily',
    time_options: [
    {text: 'Daily', value: 'Daily'},
    {text: '0300-0859', value: '0300-0859'},
    {text: '0900-1559', value: '0900-1559'},
    {text: '1600-1859', value: '1600-1859'},
    {text: '1900-0259', value: '1900-0259'},
    ],

    selected_bwidth: bwidth_metric_list[0],
    bwidth_options: [],    
    
    selected_colorscheme: COLORRAMP.DIV,
    modeMap: {
      '#ffffcc,#3f324f': 'hsl',
    },

    selected_breaks: 5,
  },
  watch: {
    sliderValue: selectionChanged,
    selected_source: selectionChanged,
    selected_timep: selectionChanged,
    selected_metric: selectionChanged,
    pct_check: selectionChanged,
    
    bp1: bp1Changed,
    bp2: bp2Changed,
    bp3: bp3Changed,
    bp4: bp4Changed,
    bwbp1: bwbp1Changed,
    bwbp2: bwbp2Changed,
    bwbp3: bwbp3Changed,
    bwbp4: bwbp4Changed,
    //custom_check: customBreakPoints,
    bwcustom_check: customBWBreakPoints,
    bwidth_check: bwidthChanged,
  },
  methods: {
    updateMap: updateMap,
    bwUpdateMap: bwUpdateMap,
    clickToggleHelp: clickToggleHelp,
    clickedShowHide: clickedShowHide,
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

initialPrep();

