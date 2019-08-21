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
const GEO_VIEW = 'hwynet_links';
const DATA_VIEW = 'hwynet_weekday';
const SCENARIO_VIEW = 'tables_hwynet'
const EXCLUDE_COLS = ['a','b','streetname','type','mtype','time_period', 'distance', 'at', 'ft'];
// const FRAC_COLS = ['speed','time','vmt','vhd','vht','pti80','pti80_vmt',
//                     'obs_speed','obs_time','obs_vmt','obs_vhd','obs_vht','obs_pti80','obs_pti80_vmt'];
const INT_COLS = ['dt','at','ft2'];
const DISCRETE_VAR_LIMIT = 10;
const MISSING_COLOR = '#ccd';
const MIN_BWIDTH = 2;
const MAX_BWIDTH = 10;
const DEF_BWIDTH = 2;
const BWIDTH_MAP = {
  1: DEF_BWIDTH,
  2: DEF_BWIDTH,
  3: [2.5, 5],
  4: [1.6, 3.2, 4.8],
  5: [1.25, 2.5, 3.75, 5],
  6: [1, 2, 3, 4, 5]
};
const SCNYR_LIST = ['hwynet2', 'hwynet_weekday'];
const CUSTOM_BP_DICT = {
  'speed': {'base':[12, 20, 30, 45], 'diff':[-3, -2, -1, -0.5], 'pctdiff':[-20, -10, -5, 0]},
  'cap': {'base':[1500, 3000, 4500, 6000], 'diff':[-500, -1, 1, 500], 'pctdiff':[-5, -1, 1, 5]}
}

const METRIC_UNITS = {'speed':'mph','inrix_speed':'mph'};

let sel_colorvals, sel_colors, sel_binsflag;
let sel_bwvals;
let init_selected_metric = 'v_1';
let metric_options_all, metric_options_daily; 
let daily_metric_list = ['cap', 'speed', 'time', 'lane_am', 'lane_op', 'lane_pm', 'buslane_am', 'buslane_op', 'buslane_pm',
                         'tollam_da', 'tollam_sr2', 'tollam_sr3', 'tollpm_da', 'tollpm_sr2', 'tollpm_sr3',
                         'tollea_da', 'tollea_sr2', 'tollea_sr3', 'tollmd_da', 'tollmd_sr2', 'tollmd_sr3',
                         'tollev_da', 'tollev_sr2', 'tollev_sr3', 'busvol_am', 'busvol_md', 'busvol_pm',
                         'busvol_ev', 'busvol_ea', 'v_1', 'time_1', 'v1_1', 'v2_1', 'v3_1', 'v4_1', 'v5_1', 
                         'v6_1', 'v7_1', 'v8_1', 'v9_1', 'v10_1', 'v11_1', 'v12_1'];
let bwidth_metric_list = ['v_1'];
let time_period = ['DAILY', 'AM', 'EA', 'EV', 'MD', 'PM']
let scenario_list = []
// let init_selectedViz = VIZ_LIST[0];
// let data_view = VIZ_INFO[init_selectedViz]['VIEW'];
// let selviz_metric = VIZ_INFO[init_selectedViz]['METRIC'];
let selPeriod = 'AM';
let aggdata_label = 'All Segments Combined';
let selGeoId;

let geoLayer, mapLegend;
let yearData = {};
let popHoverSegment, popSelSegment;
let selectedSegment, prevselectedSegment;

let _featJson;
let _allCmpData;
let _aggregateData;
// let prec;

async function initialPrep() {

  console.log('1...');
  _featJson = await fetchMapFeatures();

  console.log('2...');
  //_allCmpData = await fetchAllCmpSegmentData();

  console.log('3...');
  //_aggregateData = await fetchAggregateData();

  console.log('4... ');
  //await buildChartHtmlFromCmpData();

  console.log('5...');
  //app.time_options = await updateOptionsData('time_period');
  
  console.log('6...');
  await getMetricOptions();

  console.log('7 !!!');
}

async function fetchMapFeatures() {
  const geo_url = API_SERVER + GEO_VIEW + '?select=geometry,a,b' + '&' + ft_filter;

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

let ft_filter = 'ft=neq.6&ft=neq.11&ft=lt.13&mtype=eq.SF';
async function fetchAllCmpSegmentData() {
  //FIXME this should be a map()
  let data_url = API_SERVER + DATA_VIEW + '?limit=100' + '&' + ft_filter;

  try {
    let resp = await fetch(data_url);
    return await resp.json();
  } catch (error) {console.log('cmp data fetch error: ' + error);}
}

async function fetchScenarios(){
  let data_url = API_SERVER + SCENARIO_VIEW

  try{
    let resp = await fetch(data_url).then(function(response) {
      response.json().then(function(parsedJson) {
        return parsedJson;
      })
    })
  } catch (error) {console.log('scenario data fetch error: ' + error)}
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
  if (geo.metric !== null) metric_val = (Math.round(geo.metric*100)/100).toLocaleString();
  let bwmetric_val = null;
  if (geo.bwmetric !== null) bwmetric_val = (Math.round(geo.bwmetric*100)/100).toLocaleString();
  if (geo) {
    this._div.innerHTML =
      `<b>${app.selected_metric.toUpperCase()}</b><b>: </b>${metric_val}` + 
      (app.bwidth_check? `<br/><b>${app.selected_bwidth.toUpperCase()}</b>` + '<b>: </b>' + bwmetric_val:'');
  }

  infoPanelTimeout = setTimeout(function() {
    // use CSS to hide the info-panel
    infoPanel._div.className = 'info-panel-hide';
    // and clear the hover too
    // geoLayer.resetStyle(oldHoverTarget);
  }, 2000);
};
infoPanel.addTo(mymap);

async function getMapData(view) {
  let data_url;

  data_url = API_SERVER + view + '?select=a,b,' + app.selected_metric + 
                ',' + app.selected_bwidth + 
                '&time_period=eq.' + app.selected_timep + '&' + ft_filter;
  
  let resp = await fetch(data_url);
  let jsonData = await resp.json();

  let lookup = {};
  for (let entry of jsonData) {
    lookup[entry.a+'_'+entry.b] = entry;
  }
  return lookup;
}

let base_lookup;
let comp_lookup;
let map_vals;
let bwidth_vals;
async function drawMapFeatures(queryMapData=true) {

  // create a clean copy of the feature Json
  let cleanFeatures = _featJson.slice();
  let sel_metric = app.selected_metric;
  // prec = (FRAC_COLS.includes(sel_metric) ? 100 : 1);
  
  if (app.selected_base_scenario == app.selected_comp_scenario){
    app.comp_check = false;
  } else {
    app.comp_check = true;
  }
  try {
    if (queryMapData) {
      app.custom_check = false;
      base_lookup = await getMapData(app.selected_base_scenario);
      comp_lookup = await getMapData(app.selected_comp_scenario);

      let map_metric;
      let bwidth_metric;
      let baseVal;
      let compVal;
      map_vals = [];
      bwidth_vals = [];
      for (let feat of cleanFeatures) {
        bwidth_metric = null;
        map_metric = null;
        if (base_lookup.hasOwnProperty(feat.a+'_'+feat.b)) {
          bwidth_metric = Math.round(base_lookup[feat.a+'_'+feat.b][app.selected_bwidth]);
          if (bwidth_metric !== null) bwidth_vals.push(bwidth_metric);
          feat['bwmetric'] = bwidth_metric;

          if(app.comp_check){
            if(base_lookup.hasOwnProperty(feat.a+'_'+feat.b)){
              if(comp_lookup.hasOwnProperty(feat.a+'_'+feat.b)){
                baseVal = base_lookup[feat.a+'_'+feat.b][sel_metric];
                compVal = comp_lookup[feat.a+'_'+feat.b][sel_metric];
                map_metric = baseVal - compVal;
              }
            }
          } else {
            map_metric = base_lookup[feat.a+'_'+feat.b][sel_metric];
          }
          
          if (map_metric !== null) map_vals.push(map_metric);
          feat['metric'] = map_metric;
        }
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
          app.bp0 = 0;
          app.bp1 = 0;
          app.bp2 = 0;
          app.bp3 = 0;
          app.bp4 = 0;
          app.bp5 = 1;
          
        } else {
          app.custom_disable = false;
          
          let mode = 'base';
          let custom_bps;
          if (CUSTOM_BP_DICT.hasOwnProperty(sel_metric)){
            custom_bps = CUSTOM_BP_DICT[sel_metric][mode];
            sel_colorvals = [map_vals[0]];
            for (var i = 0; i < custom_bps.length; i++) {
              if (custom_bps[i]>map_vals[0] && custom_bps[i]<map_vals[map_vals.length-1]) sel_colorvals.push(custom_bps[i]);
            }
            sel_colorvals.push(map_vals[map_vals.length-1]);
            app.custom_check = true;
          } else {
            sel_colorvals = getQuantiles(map_vals, app.selected_breaks);
          }
          bp = Array.from(sel_colorvals).sort((a, b) => a - b);
          app.bp0 = bp[0];
          app.bp5 = bp[bp.length-1];
          if (CUSTOM_BP_DICT.hasOwnProperty(sel_metric)){
            app.bp1 = custom_bps[0];
            app.bp2 = custom_bps[1];
            app.bp3 = custom_bps[2];
            app.bp4 = custom_bps[3];
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
          ''
        );
        legHTML = '<h4>' + sel_metric.toUpperCase() + ((METRIC_UNITS.hasOwnProperty(sel_metric)? (' (' + METRIC_UNITS[sel_metric] + ')') : '')) +
                  '</h4>' + legHTML;
        if (app.bwidth_check) {
          legHTML += '<hr/>' + '<h4>' + app.selected_bwidth.toUpperCase() +  '</h4>';
          legHTML += getBWLegHTML(sel_bwvals, bw_widths);
        }
        div.innerHTML = legHTML;
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
  if (!app.bwidth_check) {
    return { color: color, weight: DEF_BWIDTH, opacity: 1.0 };
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
  if (selGeoId === e.target.feature.a+'_'+e.target.feature.b) return;

  // return previously-hovered segment to its original color
  if (oldHoverTarget && e.target.feature.a+'_'+e.target.feature.b != selGeoId) {
    if (oldHoverTarget.feature.a+'_'+oldHoverTarget.feature.b != selGeoId)
      geoLayer.resetStyle(oldHoverTarget);
  }

  let highlightedGeo = e.target;
  highlightedGeo.bringToFront();

  if (highlightedGeo.feature.a+'_'+highlightedGeo.feature.b != selGeoId) {
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
      if (e.feature.a+'_'+e.feature.b === selGeoId) {
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
    // let x0 = Math.round(b.x0*prec)/prec;
    // let x1 = Math.round(b.x1*prec)/prec;
    let x0 = b.x0;
    let x1 = b.x1;
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
  return distLabels[x.x] + ('');
}

function clickedOnFeature(e) {
  e.target.setStyle(styles.popup);

  let geo = e.target.feature;
  selGeoId = geo.a+'_'+geo.b;

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
  let popupText = '';
  let metric_val = null;
  //SIMPLIFY 
  if (geo.metric !== null) metric_val = (Math.round(geo.metric*100)/100).toLocaleString();
  if (geo) {
    // show popup
    popupText =
      `<b>${app.selected_metric.toUpperCase()}</b><b>: </b>${metric_val}` + 
      (app.bwidth_check? `<br/><b>${app.selected_bwidth.toUpperCase()}</b>` + '<b>: </b>' + bwmetric_val:'');
  }

  popSelSegment = L.popup()
    .setLatLng(latlng)
    .setContent(popupText)
    .addTo(mymap);

  // Revert to overall chart when no segment selected
  popSelSegment.on('remove', function(e) {
    geoLayer.resetStyle(selectedSegment);
    app.chartSubtitle = aggdata_label;
    prevselectedSegment = selectedSegment = selGeoId = _selectedGeo = null;
  });

}

function selectionChanged(thing) {
  if (app.selected_timep && app.selected_metric && app.selected_base_scenario && app.selected_comp_scenario) {
    drawMapFeatures();
  }
  //highlightSelectedSegment();
}

function seltimepChanged(thing) {
  if (app.selected_timep && app.selected_metric) {
      app.metric_options = metric_options_all;
    drawMapFeatures();
  }
}

function optionsChanged(thing) {
  if (app.time_options.length > 0) {
    app.selected_timep = 'DAILY';
    app.metric_options = metric_options_daily;
    app.selected_metric = 'v_1';
  }
}

function clickViz(chosenviz) {
  app.selectedViz = chosenviz;
  // app.chartTitle = VIZ_INFO[chosenviz]['CHARTINFO'];

  // data_view = VIZ_INFO[chosenviz]['VIEW'];
  // selviz_metric = VIZ_INFO[chosenviz]['METRIC'];

  drawMapFeatures();

  if (_selectedGeo) {
    showVizChartForSelectedSegment();
    // showSegmentDetails(_selectedGeo, _selectedLatLng);
    highlightSelectedSegment();
  } else {
    // buildChartHtmlFromCmpData();
  }
}


function fillOptions(options){
  let optionList = [];

  for(let entry of options){
    optionList.push({text: entry, value: entry})
  }

  return optionList;

}


async function getMetricOptions() {
  fetchScenarios()
  metric_options_all = fillOptions(daily_metric_list);
  app.bwidth_options = fillOptions(bwidth_metric_list);
  metric_options_daily = metric_options_all;
  app.metric_options = metric_options_daily;
  app.time_options = fillOptions(time_period);
  app.scenario_options = fillOptions(scenario_list)
  app.selected_base_scenario = 'hwynet2'
  app.selected_comp_scenario = 'hn_csf_2015_tnc_v7_est'
  app.selected_timep = 'DAILY';
  app.selected_metric = 'v_1';
    
}


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


let app = new Vue({
  el: '#panel',
  delimiters: ['${', '}'],
  data: {
    isPanelHidden: false,
    isUpdActive: false,
    comp_check: true,
    bwidth_check: false,
    custom_check: false,
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

    selected_timep: null,
    time_options: [
    {text: '', value: ''},
    ],
    
    selected_base_scenario: null,
    scenario_options:[
      {text: '', value: ''},
    ],

    selected_comp_scenario: null,
    scenario_options:[
      {text: '', value: ''},
    ],

    selected_metric: null,
    metric_options: [
    {text: '', value: ''},
    ],

    selected_bwidth: bwidth_metric_list[0],
    bwidth_options: [],    

    scnSlider: scnSlider,
    sliderValue: [SCNYR_LIST[0],SCNYR_LIST[SCNYR_LIST.length-1]],
    
    selected_colorscheme: 'Spectral',
    color_options: [
    {text: 'Cream-Purple', value: ['#ffffcc','#3f324f']},
    {text: 'Purple-Cream', value: ['#3f324f','#ffffcc']},
    {text: 'GnYlRd', value: ['Green','Yellow','Red']},
    {text: 'RdYlGn', value: ['Red','Yellow','Green']},
    {text: 'YlOrRd', value: 'YlOrRd'},
    {text: 'Yellow-Blue', value: ['#fafa6e','#2A4858']},
    {text: 'YlRdBl', value: ['Yellow','Red','Black']},
    {text: 'Spectral', value: 'Spectral'},
    {text: 'YlGn', value: 'YlGn'},
    ],
    modeMap: {
      '#ffffcc,#663399': 'lch',
      '#ebbe5e,#3f324f': 'hsl',
      '#ffffcc,#3f324f': 'hsl',
      '#3f324f,#ffffcc': 'hsl',
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
    sliderValue: selectionChanged,
    time_options: optionsChanged,
    selected_timep: seltimepChanged,
    selected_metric: selectionChanged,
    selected_bwidth: selectionChanged,
    selected_breaks: selectionChanged,
    selected_base_scenario: selectionChanged,
    selected_comp_scenario: selectionChanged,
    
    selected_colorscheme: colorschemeChanged,
    bp1: bp1Changed,
    bp2: bp2Changed,
    bp3: bp3Changed,
    bp4: bp4Changed,
    bwbp1: bwbp1Changed,
    bwbp2: bwbp2Changed,
    bwbp3: bwbp3Changed,
    bwbp4: bwbp4Changed,
    custom_check: customBreakPoints,
    bwcustom_check: customBWBreakPoints,
    bwidth_check: bwidthChanged,
  },
  methods: {
    updateMap: updateMap,
    bwUpdateMap: bwUpdateMap,
    clickToggleHelp: clickToggleHelp,
    clickedShowHide: clickedShowHide,
    clickViz: clickViz,
  },
  components: {
    vueSlider,
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

